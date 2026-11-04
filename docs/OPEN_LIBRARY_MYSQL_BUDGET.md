# Open Library MySQL budget

4 November 2026. Review branch: `review/open-library-mysql-budget`, based on freshly fetched `origin/main` at `d175faa0695554787f10770406cae32c4fe640c5`. Implementation checkpoint: `753b044`. Open Library remains disabled. No Hostinger access, real provider requests, staging/production migrations, diagnostic installation, merge or deployment accompanied this work.

## Architecture decision

Use one InnoDB singleton row in `open_library_state`, accessed through the existing PDO connection infrastructure. It contains the bounded client counters, public cache, next permitted time and an opaque in-flight reservation. Short transactions serialize decisions; provider HTTP always runs after the reservation commit and outside every transaction.

| Alternative | Assessment |
| --- | --- |
| Atomic conditional UPDATE with expiring lease | Compact for one timestamp, but client/cache updates still need coordination. More importantly, lease expiration cannot stop an old paused worker from starting HTTP later. A token only fences database writes, not external HTTP. Rejected. |
| MySQL advisory lock across HTTP | No open transaction, but connection loss releases the lock while PHP can remain alive. Still needs durable reservation protection and adds connection ownership/lifetime rules. Rejected. |
| Row transaction held across HTTP | Simple serialization but holds database locks during external I/O and violates the explicit task boundary. Rejected. |
| Short row transaction plus durable reservation | Selected. Reuses existing rolling client policy and bounded JSON state with one new table. A committed reservation admits exactly one worker; nobody can steal it based on age. |

Admission uses primary-key `SELECT ... FOR UPDATE NOWAIT`: contention returns controlled 503 `provider_busy`, without a queue or automatic retry. Completion uses `FOR UPDATE` with session `innodb_lock_wait_timeout=1`, allowing short admission transactions to finish before stranding a completed request. Both use session `lock_wait_timeout=1` for metadata locks. These are server lock limits, not exact end-to-end deadlines: MariaDB timeout polling can take about two seconds; the real-process test allows three seconds including process overhead. PDO connection establishment requests a three-second timeout. Host socket-read/PHP execution limits remain separate operational checks.

The syntax and transactional behavior are documented by [MySQL locking reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html) and [MariaDB WAIT/NOWAIT](https://mariadb.com/docs/server/reference/sql-statements/transactions/wait-and-nowait). Real tests here used MariaDB 10.4.32; Oracle MySQL and Hostinger remain unverified.

## Request protocol and preserved behavior

1. Disabled configuration returns 404 before connecting to MySQL or touching admission/provider/session state. The User-Agent and shared-budget assertion remain required. `OPEN_LIBRARY_STATE_FILE` is no longer read by the application; historical diagnostic packages remain untouched.
2. Lock row 1, validate its version-3 JSON and read database UTC time **after** acquiring the lock. Missing table/row, malformed state or a clock earlier than the last state update fails closed. Runtime requests never initialize or repair state.
3. Apply the existing five requests per rolling 60 seconds using HMAC of canonical `REMOTE_ADDR`. Cache hits, invalid searches and provider-budget rejections consume admission. IPv4-mapped IPv6 shares its IPv4 counter. Forwarded headers are ignored. At most 1,024 active clients and five timestamps each; never evict an active client to admit another. Expiration is lazy, on subsequent admissions.
4. Query validation, a cache hit or a budget refusal is decided under the same lock. Persist admission before returning a validation error, 429, cached result or budget 503. Lock/storage failure before admission cannot reach HTTP. Cache hits refresh LRU order and remain available during reservations/cooldowns, subject to client admission.
5. For an uncached eligible request, set a random reservation token and an initial 60-second cooldown, then commit. Only a confirmed commit permits provider execution. While a reservation exists, infer its start from this original deadline minus 60 seconds. An age from zero up to (excluding) ten seconds returns `503 provider_busy` with `Retry-After: 2`; at ten seconds or later, or an uncertain future start, return `503 provider_unavailable` with `Retry-After: 60`. Ten seconds accommodates the normal eight-second HTTP timeout and brief completion work. This is only a retry hint: even a recently crashed worker may appear busy. Repeated admissions update neither the original deadline nor the token, and every reservation still blocks provider execution regardless of age. There is no internal retry, queue or follow-up provider lookup.
6. Execute the unchanged Work/selected Edition adapter and bounded cURL transport (3-second connection/8-second total timeout, 1 MiB response bound, no redirects/retries). No transaction remains open.
7. In a new short transaction, require the same token. On success clear it, set the next request time to database time **after completion plus 1.1 seconds**, and publish the normalized public result for 300 seconds. Measuring after completion is more conservative than start-to-start spacing and closes the reservation-commit-to-HTTP scheduling gap. On provider failure clear it only in the committed completion transaction and set a 60-second cooldown. Malformed responses remain 502, never cached empty results.

Cache remains at most 20 entries with a 300-second TTL and LRU eviction. The entire serialized state remains at most 2 MiB, including counters; cache entries are evicted to meet the byte bound. Empty successful results are cached. The database CHECK also enforces byte size and singleton identity. No foreign keys, account IDs, raw client IPs, secrets, contacts or provider request URLs are stored. Cached metadata remains the existing public normalized contract.

One bounded row avoids separate client/cache tables, cleanup jobs and cross-table lock ordering. It trades up to 2 MiB of read/write traffic per admitted request for simple correctness at portfolio scale. It is intentionally unsuitable for high-throughput service use; capacity exhaustion fails closed.

## Failure and recovery behavior

| Scenario | Result |
| --- | --- |
| Simultaneous users/cache misses | Row lock serializes admission; one committed reservation, other misses receive short busy responses during the first ten seconds, then long unavailable responses. Concurrent same-client cache hits cannot exceed five admissions. |
| Paused worker after commit, even beyond 60 seconds | Reservation stays owned. Other workers cannot start HTTP; old worker may safely finish later. No timestamp-based takeover. |
| Worker exits before commit | InnoDB rolls back. No provider call was authorized. |
| Worker exits after commit/before completion | Reservation persists indefinitely. Cache hits still work until TTL; misses remain 503. |
| Provider timeout, upstream 429/5xx or malformed payload | Unchanged safe error classification; committed failure completion imposes 60 seconds. |
| Database error/connection loss/uncertain admission commit | No provider execution. If the commit succeeded remotely, its reservation persists. No retry or reset attempts. |
| Completion error or timeout | Return 503. The reservation persists unless completion actually committed, in which case its cooldown/cache remain authoritative. Neither outcome allows an immediate unsafe retry. |
| Cache expires | Remove during next valid admission; request still needs both client allowance and global reservation. No stale-result fallback. |
| Repeated/invalid client requests | Counted before query validation; 429 carries remaining-window Retry-After. Storage/capacity failures retain safe 503 behavior. |

**Availability tradeoff:** crashed or uncertain workers can stop new provider calls until deliberate recovery. This is intentional. An automatically expiring lease cannot guarantee the required external-request spacing when an old worker resumes, because Open Library does not enforce our database fencing tokens. The initial 60 seconds is a minimum cooldown, not permission to reclaim a reservation. Completion contention exceeding the bounded lock wait has the same conservative outcome.

Recovery is a separately authorized offline operation, never a request handler or automatic migration:

1. Keep the pilot disabled for all workers and prevent new requests. Stop/drain every old worker that might still execute a reserved call; a flag change alone does not stop an already-running worker. If quiescence cannot be established, leave the reservation intact.
2. Preserve private diagnostic evidence and a database backup. Verify target, schema, shared-primary topology and clock. Wait at least 60 seconds after the last possible provider execution and confirmed worker shutdown.
3. Under a row transaction, inspect and repair only the reservation/cooldown of this singleton; preserve valid client counters/cache and set a fresh cooldown of at least database time plus 60 seconds. Corrupt state needs a separately reviewed repair, not blind reinitialization. No runtime recovery command or public endpoint is supplied.
4. Independently review the cause and all activation gates before authorizing re-enable. Never restore old budget state or run file-backed and database-backed workers together against one provider budget.

## Migration and activation requirements

`005_create_open_library_state.php` creates one new InnoDB table and seeds its singleton. It does not alter, copy or delete users, media, Library, lists, memberships or existing rate-limit counters. Existing migrations are unchanged; the runner records version 005 and skips it on rerun. As with other migrations, partially applied DDL requires inspection before retrying, not automatic rollback/reset.

Follow [the backup/migration procedure](DEPLOYMENT.md#database-backup-and-rollback) with separately authorized credentials. The runtime account needs SELECT and UPDATE on this table; it does not create rows/tables. Run migration status before/after an approved migration. The disabled application can safely deploy before migration 005: the disabled route performs no database access. An enabled unmigrated application fails closed. No deployed database was migrated here.

There is no file-state import. The pilot was disabled; old private files/evidence must remain preserved. Before any future activation verify all workers use this code, the same stable secret and the same writable authoritative InnoDB database. Do not route coordination reads to replicas, use separate database budgets, restore stale state, or allow uncoordinated Open Library egress. Confirm durable commits, stable database time, failover behavior, PHP/PDO settings, actual client-IP behavior, provider registration/contact and the restricted use case. Backward clock observations fail closed; arbitrary forward clock jumps and loss of committed state during disaster recovery are not handled by application-level admission.

Both backend and frontend flags remain absent/false by default; staging's disabled-404 check is unchanged. The original [provider evaluation](BOOK_SEARCH_V2_PROVIDER_EVALUATION.md), [Hostinger readiness plan](BOOK_SEARCH_V2_PHASE2C_HOSTINGER_READINESS.md) and web/CLI diagnostic evidence remain historical records. Their file-provisioning/locking prerequisites are superseded by this database design, not by a claim that the host passed new checks. No web-worker diagnostic installation is required or performed.

## Validation and self-review

| Check | Result |
| --- | --- |
| Complete `composer --working-dir=backend test` | Passed against a fresh disposable MariaDB 10.4.32 instance on a dedicated loopback port with `APP_ENV=testing`, exact `DB_DATABASE=myfunlist_test`; included schema, rate limits, auth, Library, imports, lists and provider/API suites. |
| Final affected provider suites | Passed: 87 Open Library adapter/cache checks, 81 admission checks, 41 storage/failure checks; HTTP/provider suites also passed. PDO doubles reject non-pilot SQL. |
| Final `test:open-library-mysql` | Passed, 68 assertions using independent PHP processes and synthetic HTTP. Includes eight-way global admission, eight-way cached client admission, real NOWAIT contention, measured spacing, cache expiration, crash persistence, paused/stale reservation, disconnect rollback, completion contention/timeout and additive migration with populated synthetic user/media/Library/list records. |
| `npm test` | 334 passed, 12 existing Linux/POSIX diagnostic tests skipped on Windows, 0 failed (346 total). |
| `npm run build` | Passed. No frontend changes. |
| Composer strict validation, PHP syntax and database safety | Passed; all 84 backend PHP files linted, 43 local Markdown link targets checked. Composer reported an unwritable local cache and continued successfully without caching. |
| Local preview / browser QA / staging deployment / live-provider tests | Not performed. No browser-verification or provider-availability claim. |

The initial completion-timeout test required less than two seconds and failed on MariaDB's timeout granularity. The configured server limit remained one second; the test now permits less than three seconds including worker overhead and asserts 503 plus an intact reservation. Brief contention is separately tested to finish successfully. Fixture failures intentionally emit sanitized provider/storage errors during negative tests.

Self-review rejected automatic reservation expiry, verified completion token ownership, moved spacing to after HTTP completion, and bounded completion lock waiting to avoid stranding reservations on ordinary short contention. Real-process tests establish local MariaDB serialization rather than assuming it from mocks. Remaining limits are host/Oracle MySQL verification, stable authoritative database time and durable commits, operator recovery after uncertain workers, bounded-row I/O cost, shared-egress coordination and the existing activation/policy/browser gates.

## Changed files

```text
backend/.env.example
backend/composer.json
backend/database/migrations/005_create_open_library_state.php
backend/src/Infrastructure/Database.php
backend/src/Provider/OpenLibraryPilot.php
backend/src/Provider/OpenLibraryStateStore.php
backend/src/RateLimit/OpenLibraryClientLimiter.php
backend/tests/open_library.php
backend/tests/open_library_admission.php
backend/tests/open_library_mysql.php
backend/tests/open_library_storage.php
backend/tests/schema.php
backend/tests/support/open_library_pdo.php
backend/tests/support/open_library_worker.php
PROJECT_CONTEXT.md
docs/DEPLOYMENT.md
docs/DEVELOPMENT.md
docs/OPEN_LIBRARY_MYSQL_BUDGET.md
docs/PROJECT_HISTORY.md
```

Frontend, provider normalization, controller/API contract and historical evidence were preserved. Only the newly created disposable MariaDB instance was started, tested and shut down; its temporary data was removed after shutdown. No existing local database service or data directory was used.

## Final review follow-up — 4 November 2026

The review follow-up changes only reservation error classification and active operational guidance. It reuses `nextRequestAt` to infer age; no schema migration or reservation recovery mechanism was added. Focused storage tests cover the fractional ten-second boundary, repeated admissions, old/future reservations, unchanged ownership/deadlines and exact controller error/Retry-After envelopes. Independent MariaDB workers test recent and stale responses while the original worker remains paused, then verify that only that owner can resume and complete HTTP. Frontend service/view tests check both error codes, their two-/sixty-second delays, disabled controls until the deadline, and manual-only retry. The deployment/development guides now point to the MySQL requirements instead of historical file-state/flock prerequisites. Historical diagnostic documents/packages remain unchanged.

Follow-up validation passed: provider/API suites (including 55 storage assertions), 72 real MariaDB 10.4.32 assertions in the guarded isolated `myfunlist_test` instance, all 16 focused Open Library frontend tests, `npm test` (334 passed, 12 existing Linux/POSIX skips on Windows), production build, all 84 PHP syntax checks, database safety checks, and 39 local Markdown targets/current requirement anchors. The disposable loopback database was shut down and its verified temporary data removed. Oracle MySQL, Hostinger, browser QA and live-provider execution were not performed. No real database, activation flag, historical diagnostic, migration file or deployment configuration changed.
