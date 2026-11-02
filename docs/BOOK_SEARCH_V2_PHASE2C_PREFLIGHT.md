# Book Search V2 - Phase 2C Hostinger activation preflight

Date: **2 November 2026**, Europe/Amsterdam. Inspected local HEAD: `f8480e8af6a9a734a2a7038f19d40c0806a8a09a`. Recommendation: **NO-GO for activation with the evidence currently available.** This is an access/evidence gap, not a finding that Hostinger cannot support the pilot.

## Scope and evidence limits

This diagnostic did not enable either feature flag, modify environment settings, deploy code, create/change a server file, alter a database, start XAMPP/MySQL, run database-writing tests, contact the Open Library data APIs, submit registration or contact a provider. It did not request the staging pilot or health API. No credentials, private contact, environment contents, client addresses or session data were printed or retained in this report.

The initial working tree was clean. Existing Phase 2A/2B documents and evidence remain intact. This report distinguishes source inspection, historical deployment evidence, one current static HTTP observation and unverified hosting facts. A previous successful deployment is not current operational clearance.

| Evidence | Observation and limit |
| --- | --- |
| E1 - local source | [Pilot](../backend/src/Provider/OpenLibraryPilot.php), [admission limiter](../backend/src/RateLimit/OpenLibraryClientLimiter.php), [environment loader](../backend/config/environment.php), [bootstrap](../backend/config/bootstrap.php), [transport](../backend/src/Provider/CurlProviderHttpClient.php), [workflow](../.github/workflows/deploy-staging.yml), [Phase 2B report](BOOK_SEARCH_V2_PHASE2B_IMPLEMENTATION.md) and [deployment guide](DEPLOYMENT.md) inspected at the baseline. |
| E2 - GitHub deployment record | [Run 41361921645](https://github.com/DarkGuardianMT/myfunlist/actions/runs/41361921645) for exactly this SHA completed successfully at **2026-11-01 23:24:55 UTC / 2 November 00:24:55 CET**. GitHub API inspection confirmed successful remote checkout/dependency update, API health and disabled-pilot checks. No workflow was triggered or rerun for this preflight. |
| E3 - current public HTTP | One `HEAD /` to the staging homepage at **2026-11-01 23:34:33 UTC / 2 November 00:34:33 CET** returned 200 and a Hostinger cache-status header. No recognized origin-server family or PHP version was advertised by the inspected headers. No cookies, header values containing private data, response body or assets were collected. This is not a PHP, filesystem, client-IP or browser test. |
| E4 - access discovery | Windows OpenSSH is installed. No local user SSH directory/configuration, system SSH configuration, available SSH-agent identities, staging SSH environment settings or Git SSH-command override were found in this session. PuTTY has no saved session profiles in the inspected user registry; PuTTY/plink/WinSCP are not on PATH. No dedicated SSH connector is available. No host/login was guessed, no authentication was attempted and no key/password was requested. GitHub runner SSH secrets are not available to this session and were not extracted. |
| E5 - official guidance | Open Library and the linked Hostinger guidance below were read on 2 November 2026. Documentation describes supported/general behavior, not this account's actual configuration. |

**Direct Hostinger SSH inspection was blocked by unavailable authorized access.** The owner was asked whether another existing managed SSH profile/setup is available. Absence of local credentials does not mean the server lacks SSH or that its application settings are absent. No hPanel account was accessed. A read-only follow-up must use an existing authorized setup without disclosing its credentials.

## Architecture findings

| Question | Finding | Confidence / outstanding verification |
| --- | --- | --- |
| Actual PHP version | **Unverified** for both Hostinger CLI and web requests. CI explicitly uses PHP 8.2; that is the GitHub runner, not Hostinger. Historical remote Composer installation succeeded. | Collect exact CLI and actual website PHP versions separately. Composer success is not an exact version or current extension inventory. |
| Required PHP extensions/functions | Source requires PHP 8.2+, `curl`, `PDO`, `pdo_mysql` and installed Composer dependencies. The pilot also needs usable filesystem functions including `flock`, `fsync`, `ftruncate`, `fflush`, `hrtime`, `usleep` and writable persistent storage. HTTPS transport must have working CA verification. | All current Hostinger extension/function availability and PHP filesystem restrictions remain **unverified**. Do not use public `phpinfo()` or dump `php -i`/environment data. |
| PHP execution model | Repository entry is `backend/public/index.php`; it loads the environment/application and routes same-origin `/api/v1`. Physical webroot-to-entry routing is hosting configuration outside the tracked workflow. | Actual handler/SAPI, effective worker identity, pool size, request limits and PHP configuration are **unverified**. Hostinger documents LiteSpeed for Web/Cloud hosting, but this account's plan and handler were not inspected. [Hostinger server access guidance](https://www.hostinger.com/support/which-file-transfer-and-server-access-options-are-supported-at-hostinger/) |
| Shared filesystem | Workflow declares one checkout and one frontend document root on a configured SSH target. | This does **not** prove one origin host, one mounted filesystem, all workers seeing the same inode, local versus network storage, or coordinated outbound traffic. Host topology and all other users of the provider egress budget remain **unverified**. |
| Worker access to persistent storage | No worker or filesystem inspection was possible. | Permissions may appear correct in SSH but still fail for the web SAPI, sandbox or another worker. Read/write/flush/lock behavior must be demonstrated under actual web workers. |
| Deployment persistence | Workflow performs a tracked checkout reset, production Composer install, frontend `rsync --delete`, and recursive frontend permission changes excluding root `.htaccess` and `api/`. It does not run `git clean` or explicitly provision pilot state. | A tracked state file can be replaced by checkout updates. An untracked path can also be lost if a later tracked path conflicts. Files in the frontend upload tree can be deleted or made public. Composer-managed locations are unsuitable. A separate private persistent directory outside both checkout and all document roots avoids these known operations; existence and actual host lifecycle remain unverified. |

The preferred next read-only inventory is an authorized SSH session plus hPanel's existing PHP Info/configuration views. Select only version, SAPI, required-extension/function statuses, effective filesystem restrictions and safe ownership/access booleans. CLI and web handlers can differ; [Hostinger's PHP information guide](https://www.hostinger.com/support/1583467-how-to-check-the-php-information-of-your-website-in-hostinger/) provides an existing private dashboard view. Do not export its full contents, which may contain configuration details outside this task.

## Shared state file readiness

Every live-storage item below is **unverified**, not absent or passed:

- A suitable existing private persistent directory, its ownership, traversal permissions, retention and effective web-worker access.
- Presence of an existing version-2 state file, its exact canonical non-symlink path, size, schema validity, owner/mode and readability/writability.
- Location outside the actual website/API document roots, tracked checkout, dependency directories, cleanup jobs and account-public mappings.
- Stable inode/content across releases, worker recycling, restarts and host maintenance; working cross-worker `flock`/flush and a single coordinated egress budget.

The pilot does not create missing storage. It requires an existing canonical regular non-symlink writable file. Its source rejects a path under backend `public` or the runtime `DOCUMENT_ROOT`, and on non-Windows hosts rejects world-accessible file mode bits. That check alone does not establish private parent directories, absence of other public aliases or correct worker ownership. Recommended private directory/file modes remain **0700/0600**, with access by the actual PHP worker identity; do not blindly chmod or chown existing data.

State must be version 2 with `clients`, `nextRequestAt` and `cache`, bounded to 2 MiB, at most 1,024 active clients and twenty public cache entries. Cached successes last five minutes. One exclusive lock covers admission, request reservation, provider I/O and publication. Lock acquisition polls with a 150ms deadline; ordinary contention returns `503 provider_busy` / two-second backoff. Starts remain at least 1.1 seconds apart and failure/crash cooldown is sixty seconds. Five rolling client admissions per minute apply, including invalid queries/cache hits after acquiring the lock. None of these safeguards establishes that locks work on Hostinger.

**Do not invoke `OpenLibraryPilot::search()` to inspect readiness.** If enabled, it opens the real file for writing and persists admission before query validation. Even an empty query can change state. In a future authorized read-only inventory, inspect only metadata and a bounded schema summary of the existing file using a read-only handle and nonblocking shared lock; if unavailable, stop. Never print cache records/client keys, serialize the state into the report, or open it `r+b`. Do not create/repair/reset/upgrade it during that inventory.

## Client IP and rate limiting

Current code takes only server-observed `REMOTE_ADDR`, validates/canonicalizes IPv4/IPv6, combines IPv4-mapped IPv6 with IPv4 and HMACs the packed address using the existing secret. It does not select a client from arbitrary `X-Forwarded-For`, `Forwarded`, `X-Real-IP` or `CF-Connecting-IP` headers. Shared addresses therefore share five admissions per minute.

Hostinger says its managed hosting generally restores the visitor address into PHP `REMOTE_ADDR` before application code runs when using its CDN. This supports a **conditional expectation of real visitor egress addresses**, not a verified finding for this origin. The observed cache header suggests a hosting cache/proxy layer but does not prove this site's PHP behavior. Earlier forwarded-header entries can be supplied by clients. Keep the application's existing header distrust; do not copy generic header-reading advice into the limiter. [Hostinger CDN visitor-IP guidance](https://www.hostinger.com/support/hostinger-cdn-visitor-ip-addresses-in-logs-and-analytics/)

SSH/CLI, homepage headers and ordinary access logs cannot alone prove the actual PHP input or resistance to header spoofing. Missing/invalid addresses fail closed; one shared proxy address can make normal use hit the client limit, while trusting spoofable headers would weaken protection. The controlled HTTP diagnostic below is required before relying on fairness.

## Safe configuration status

| Setting | Current staging status | What is actually known |
| --- | --- | --- |
| `OPEN_LIBRARY_PILOT_ENABLED` | **Unverified now; disabled at E2 deployment verification** | The route returned 404 `not_found` during the successful workflow. This does not distinguish absent from explicitly false, establish today's value, or validate other prerequisites. No current pilot probe was sent. |
| `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED` | **Unverified** | Source requires exact string `true` for enablement. No private staging value was inspected. |
| `OPEN_LIBRARY_STATE_FILE` | **Unverified** | Presence/path/file readiness unknown. No path value or file contents were read. |
| `OPEN_LIBRARY_USER_AGENT` | **Unverified** | Presence, syntax, managed contact and outgoing effective header unknown. Source requires ASCII, at most 200 characters, starting `MyFunList` and ending with a parenthesized email matching its validator. |
| `RATE_LIMIT_SECRET` | **Unverified** | Presence, minimum 32-byte length, consistency and stability across workers/releases unknown. Do not rotate an existing valid secret to perform a test. |

Future inspection should emit only **absent / present / disabled / invalid / unverified** and separate booleans for validation/access. Load the same environment precedence as the web application without dumping it or bootstrapping controllers, sessions, databases or providers. The source loads private `backend/.env` immutably and then reads `$_ENV`, `$_SERVER`, `getenv` in that order; checking only a file can miss web-process overrides. A CLI collector cannot certify the effective web-worker values. Never log the contact, secret, configured path, state contents or secret-derived fingerprints. Current local SSH-setting absence is unrelated to the five remote statuses above.

## Policy readiness

The current [Open Library API guidelines](https://openlibrary.org/developers/api), read on 2 November, ask developers to register the use case/application through the linked form, identify requests with the application name and contact email, cache responses and serve human-driven discovery. They discourage bulk harvesting, distributed-IP workarounds and high-traffic commercial-backend use. The page lists one request/second unidentified and three/second identified; this is not a reason to raise the application's conservative budget.

Owner registration evidence, managed contact ownership, MyFunList's use-case/licensing/commercial suitability and any necessary policy clarification are **unverified**. Registration is not individual approval or a service guarantee. No form was submitted, no contact was made and no provider data endpoint was visited. The adapter supplies a custom User-Agent; actual effective transport identification still needs a private local/mock capture under the intended runtime, not a request to Open Library for diagnostic purposes.

## Proposed diagnostics requiring separate approval - not executed

These are concrete bounded test designs for a later authorized session. No temporary server file, endpoint, new credential or access-control change has been created. **Approval is required because the tests below create disposable server storage and a protected HTTP diagnostic, as explicitly required by the Phase 2C task.** First obtain an authorized SSH setup and review the exact private target locations/access mechanism with the owner. Never reuse the pilot state, application secret or sessions as test fixtures.

### A. Read-only host and configuration inventory

Use the existing authorized host/profile, verified host key and batch-mode connection. Do not weaken SSH host checking or retrieve GitHub Actions secrets. Read the deployed revision, narrowly selected PHP/runtime facts and target metadata. Avoid blanket `env`, `.env` output, `phpinfo()`, recursive home-directory searches, process environment/argument dumps and session/log contents. Record safe statuses only.

Privately resolve the real webroot/API target and candidate directory; check parent traversal, owner/mode, symlinks, mount type, relevant PHP restrictions and whether worker identity matches permitted access. Reading metadata does not demonstrate successful writes/locks. Ask the host/owner to confirm origin count, shared mounts, egress sharing, deployment/backup retention and PHP worker limits. Keep all existing flags disabled. This inventory itself needs no state writes; any missing directory/file is reported, not provisioned.

### B. Actual web-worker lock, visibility and persistence test

1. Under separate approval, reserve one uniquely named empty disposable file in the intended private filesystem, outside all document roots and the checkout, with private permissions and the web worker as the authorized user. Confirm it is not an existing state/session/data file. Use a private fixture marker, not real cached results or client counters.
2. Create one short-lived diagnostic handler under the same website/PHP handler, restricted to the owner by verified server-side access control. It must not bootstrap the application, use a database/session, call external services or touch the real pilot file. Give it a maximum fifteen-minute lifetime; require authentication in headers, never a query token; return only pass/fail booleans and per-test opaque worker labels. Disable caching and public error display. Do not publish a `phpinfo()` endpoint.
3. Make at most **five manually coordinated HTTP requests**. Worker A acquires the fixture's exclusive lock and holds it for 800ms (two-second per-request wall cap). During confirmed overlap, B must be a different worker and fail nonblocking lock acquisition without modifying the fixture. A writes a harmless marker, flushes/syncs and releases. C must acquire and read that same marker/inode. Two final requests may write a synthetic future reservation then exit without explicit unlock, and confirm the reservation survives closure and the lock is released. No provider calls are part of this test.
4. Record distinct-worker/overlap, contention, post-release acquisition, same-file visibility, successful flush and reservation-survival booleans. A queued/serialized response, unknown worker identity, inaccessible file or incomplete overlap is **inconclusive**, never a pass. One tested pair does not prove autoscaled/multi-host topology; obtain topology evidence separately. Existing local fixture tests are not substitutes.
5. Remove only these explicitly recorded, owner-approved disposable artifacts after handles close; verify the diagnostic URL is inaccessible. Never remove/rename/reset the real state file. Record later release/restart persistence separately when such an operation is independently authorized; do not deploy/restart merely to finish this preflight.

### C. Actual HTTP client-IP and effective web-runtime test

Use the same protected, uncached short-lived handler, without the application bootstrap or real limiter. Select two owner-controlled networks with privately established, distinct public egress identities. Make at most **four requests**, two per network, through the normal staging HTTPS/CDN route (not an SSH tunnel that changes the path). For each pair, compare baseline with spoofed `X-Forwarded-For`, `Forwarded` and `X-Real-IP` documentation-only addresses. Preserve the server's default trust configuration.

Compare packed/canonical `REMOTE_ADDR` against the privately known expected egress and test whether spoofed headers change it. Return only expected-address-match, clients-distinct, spoof-stable and valid-address booleans; no raw IP, address hashes, forwarded headers, credentials or session information. Report only selected PHP version/SAPI, extension/function and configuration-status facts needed above. If a private comparison record is necessary, use only the approved disposable fixture with short retention; do not export it or use `RATE_LIMIT_SECRET`. Restrict diagnosis/log retention so no new raw-address application log is introduced.

Passing requires correct distinction of both networks and no spoof-induced identity change. A shared proxy, upstream VPN, unknown expected identity, untested IPv6 path or cache-served response remains an explicit limitation. Do not brute-force the actual limiter, make login attempts or use pilot requests for this test. Remove the handler/test material and verify removal. No security/host setting is changed on the strength of documentation alone.

## Minimum future activation plan - owner authorization required

The following is a plan, not executed work. Keep production out of scope. All mandatory host, storage, locking, IP, identification and policy gates must have evidence before proceeding.

1. **Constrain the limited audience first.** Agree one operator/session and enforce owner-approved staging/route access control before setting a backend flag. The existing pilot is a public route when enabled; a false frontend switch does not restrict direct callers. Confirm CDN/API cache bypass, worker capacity, all instances' shared coordinator and provider egress. Do not claim a limited pilot while leaving uncontrolled public callers on the enabled route.
2. **Provision only after inspection/approval.** If no state exists, create a genuinely new private canonical regular v2 file in the approved persistent directory with `{"version":2,"nextRequestAt":0,"cache":[],"clients":[]}`. Never apply that initialization over existing state. Existing v1/corrupt state needs a separately reviewed offline preservation/repair procedure; no automatic empty upgrade is acceptable. Keep the inode stable during operation and preserve it across releases and rollback.
3. **Validate backend prerequisites privately.** Use the stable existing valid secret, shared by all workers; configure the approved canonical state path and managed contact. Verify effective values in the actual web runtime. Keep the pilot disabled until these and policy evidence pass. Only then authorize `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED=true` and `OPEN_LIBRARY_PILOT_ENABLED=true` on the limited staging target, with an explicit method to make all workers observe changes. Do not alter database schema/data or expose saving.
4. **Prepare a deliberate CI expectation change.** The current step `Verify Open Library pilot stays disabled` unconditionally requires 404 `not_found`; do not simply delete it or accept arbitrary success. A future reviewed non-secret staging expectation, defaulting to disabled, should select either that exact 404 assertion or a single empty-query probe such as `GET /api/v1/pilot/open-library/search?q=&limit=1` requiring **422 `validation_error`** when activation is expected. The invalid query is guaranteed to fail local validation before provider I/O, but in enabled mode **does update real admission state** after storage/config checks. Authorize that write only as part of activation, not this diagnostic. Use no automatic retries, no real title/ISBN query and no body logging. Confirm the response is fresh, not a CDN-cached error. 429/503/HTML or any unexpected status fails the check. This validates only a narrow enabled path, not live provider service, locks or client fairness.
5. **Make the frontend switch explicit in the build step.** The current workflow supplies only the Google browser key. After approval, supply public `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=true` to Vite for this restricted staging build; do not rely on an absent/unpassed GitHub setting. It changes the implicit Discover default, not backend authorization. `provider=google-books` remains explicit and functional. For the initial backend smoke below, keep the frontend switch false until approved so opening an old Discover URL cannot cause extra searches.
6. **Apply the reviewed changes/deployment only in a later authorized activation.** Run required frontend/backend checks for those changes and verify exact commit, effective flags and the revised CI result. Do not loosen provider timing, client allowance, cooldowns or cache bounds. Nothing in this report is permission to push/deploy or mutate configuration.
7. **Run only the bounded manual smoke below**, then review evidence before enabling the frontend default for the agreed audience. Failures keep activation stopped or trigger rollback. Broader access, multi-day coverage and independent browser acceptance require their own decisions.

### Proposed manually triggered search smoke - not executed

Use one operator and one in-flight request, after at least sixty-one seconds without a prior operator/CI admission if they share a client identity. Restrict other callers. Read JSON directly using an approved tool that does not load images, prefetch links, follow catalogue pages or retry. Do not use a browser flow whose filter changes automatically search a submitted query.

Maximum **four search requests and four upstream metadata requests** for the entire session; cache hits can reduce external traffic. Never force cold cache, add cache-busting parameters, reset state, fetch covers or retry a failed slot. Wait at least fifteen seconds **after each response** before the next request; the server budget still decides admission. These query strings are test intentions, not promises of matching editions, correct publication facts or catalogue coverage.

| Slot | Existing pilot parameters | Inspect without another lookup |
| --- | --- | --- |
| S1 - modern English title intent | `q=The Midnight Library`, `field=title`, `language=en`, `languageMode=strict`, `limit=3` | Valid Work IDs separate from selected Edition IDs; matching `eng` tags or honest empty/omission state. |
| S2 - Dutch title intent | `q=De avond is ongemak`, `field=title`, `language=nl`, `languageMode=strict`, `limit=3` | Matching `dut` selection tags, Work first-year versus Edition date precision and missing metadata. |
| S3 - Turkish edition intent | `q=Gece Yarısı Kütüphanesi`, `field=title`, `language=tr`, `languageMode=strict`, `limit=3` | Matching `tur` selection tags and Unicode handling; do not infer content language from title appearance. |
| S4 - exact ISBN intent | `q=9780261103344`, `field=isbn`, `limit=1` | Exact requested checksum-valid ISBN on a valid `OL...M` selection; no Work-as-Edition substitution. |

Stop immediately on any HTTP error including local busy/429/503, timeout, malformed/oversized JSON, identity/strict-language inconsistency, unknown protection failure or unexpected external traffic. Record remaining slots unexecuted. A successful empty sample is not an error or proof of an absent book; record it honestly for product review. Preserve status, elapsed time, safe category, result count, public IDs and omission counts only; no headers containing credentials, raw addresses, contact or state. Cache/network provenance remains unknown unless measured without extra traffic; do not call four cached successes four live provider observations. No saves or Library mutations are allowed. This is not multi-day reliability, content-language verification or independent browser QA.

## Rollback plan - not executed

1. Close the approved pilot ingress/audience gate first and set `OPEN_LIBRARY_PILOT_ENABLED=false` using the authorized private configuration mechanism. Confirm all instances/workers observe it and let already-dispatched provider work finish; changing a flag cannot retract an in-flight request. Do not reset shared state to stop traffic.
2. Restore/rebuild the frontend with `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=false` (or the recorded known-good Google-default assets) and restore the CI disabled expectation to exact 404 `not_found`. Use a separately authorized deployment; do not assume a failed workflow automatically rolls back the checkout/assets.
3. Once effective disablement is confirmed privately, verify the queryless route returns the expected 404 and the Google path remains functional using the agreed bounded checks. Keep existing Library records/statuses/ratings/lists untouched. Do not migrate or restore databases for this feature rollback.
4. Preserve the real state inode, cooldowns, cached public metadata, client counters, stable secret and sanitized evidence. An incident repair or v1 transition is separate work. Remove only approved temporary diagnostics after handles close, revoke their temporary access and verify no handler remains publicly reachable. Do not rewrite Git history or force-push.

## Owner actions and Go/No-Go decision

| Gate / owner action | Status |
| --- | --- |
| Provide an existing authorized managed SSH profile/setup, or collect a narrowly scoped owner-run inventory without sharing credentials | **Blocked: access unavailable in this session** |
| Verify CLI and web PHP, extensions/functions, handler, document roots, worker identity/capacity and actual topology | **Unverified** |
| Inspect existing directory/state/config safely; establish permissions, privacy, stable inode and deployment/host retention | **Unverified** |
| Approve/review the disposable lock and protected HTTP IP/runtime diagnostics above, then demonstrate actual worker behavior | **Not approved or executed** |
| Confirm managed contact, use-case registration/policy suitability, all-worker stable secret and shared egress ownership | **Unverified** |
| Authorize a restricted staging activation, exact build/CI/config changes, four-slot smoke and rollback ownership/window | **Not authorized by this diagnostic task** |

**NO-GO until all mandatory gates have evidence and the owner explicitly authorizes activation.** Evidence currently supports only source readiness, a prior successful disabled deployment and a responsive static homepage. Risks still open include uncoordinated workers/files/egress, missing or deploy-deleted storage, ineffective `fsync`/locking, PHP restrictions, stale worker configuration, proxy/NAT contention, spoofable upstream address restoration, cache-masked diagnostics, uncontrolled public callers and provider-policy mismatch. None is repaired by merely turning on a build flag.

## Validation and work performed for this report

Documentation-only validation checks internal links/fragments, source/command claims, Markdown fences, whitespace and the documentation-only diff. Application tests/build, local PHP execution, database integration, local preview, browser QA, SSH diagnostics and new deployment were not performed for Phase 2C. The Phase 2B tests and E2 deployment are historical evidence, not reruns attributed to this preflight. Official documentation reads are distinct from provider API requests; provider API request count for this task is **zero**.
