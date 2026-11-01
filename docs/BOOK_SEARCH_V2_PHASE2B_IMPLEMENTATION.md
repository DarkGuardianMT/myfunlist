# Book Search V2 — Phase 2B implementation and activation gates

Implementation date: 1 November 2026. Baseline: `084a1d17062d3f317370eb5b608d302c71f64947`. This report supersedes the optional-provider recommendation in the [preserved Phase 2A proposal](BOOK_SEARCH_V2_PHASE2_DECISION.md); its evidence, sampling plan and future persistence design remain available. Existing evidence files and audit reports have not been replaced.

## Ready in the local implementation

- Separate catalogue selector in Discover. No merging, automatic provider fallback, background enrichment, per-keystroke calls or per-result API fan-out.
- Open Library General, Title, Author and checksum-validated ISBN search through the existing same-origin `GET /api/v1/pilot/open-library/search` contract. Ten results maximum; no extra backend route or external lookup added.
- Any language, English, Dutch and Turkish. Preference is the default; selecting a language permits an explicit strict mode. English/Dutch/Turkish map to `eng`/`dut`/`tur` in the backend. Strict mode requires unambiguous matching selected-edition tags; tags do not prove content language. ISBN requires the exact requested checksum-valid identifier in the selected Edition.
- Work cards retain Work IDs independently of Edition IDs, authors, first-publication year, reported edition count, returned cover provenance and catalogue backlinks. Missing metadata/failed images have explicit placeholders. Edition dates retain their original precision; a Work year never fills an edition date. No ISBN-, title- or ID-derived cover is fabricated.
- Native edition disclosure and explicit preview selection of the **one search-selected Edition**. Missing edition/title or conflicting, mismatched or ambiguous language prevents choosing that selection. Unknown language remains visibly unknown; the catalogue Work association is explicitly unverified. Selection is transient, resets when results change and sends no write or extra read. It is not a persisted identity or a validated bibliographic association.
- Loading, bounded empty/omission, disabled, unavailable, busy, client-rate-limit, validation, malformed-data and connection errors. Retry is manual. Busy responses wait at least two seconds; client 429/general 503 wait at least 60 seconds, respecting longer bounded integer `Retry-After`. Expiry only re-enables the button; it sends no request. Changes during a cooldown cannot trigger another request in the mounted view.
- Labelled native controls, live feedback, `aria-busy`, focus outlines, 44px controls, wrapping metadata and a single-column mobile form. Browser, physical-device and screen-reader acceptance remain unverified.
- Public-only frontend cache: five-minute TTL, twenty-entry LRU bound, identical-request deduplication, successful empty caching, uncached errors and stale-response/disposal guards. Keys include query, field, language and matching mode; caches never mix providers. Backend admission and cache bounds remain in force independently.

Changing a filter with a submitted query searches immediately, as in existing Discover. With no query it stays idle. Each is one bounded request, not a catalogue scan. Rapid changes can reach the five-per-minute client limit; no client-side cancellation is treated as cancellation of dispatched server/provider work.

## What is still unavailable

Open Library discovery is **not live-enabled**. Default builds use Google Books while `VITE_OPEN_LIBRARY_DISCOVER_ENABLED` is absent/false. The Open Library view remains selectable to explain its blocked state and sends no pilot requests. The switch is public UI configuration, not a security boundary; direct pilot requests still depend on the backend's private disabled-by-default gate.

There is no exhaustive edition catalogue, alternate-edition pagination, new Work/Edition API route, full Edition detail page, publisher/format/page-count enrichment, global popularity ranking or validated Newest control. The reported edition count is never presented as the number inspected. To seek another selection, users may explicitly change language/search by ISBN or follow the catalogue links. Those external links are ordinary user navigation, not hidden application lookups.

**Add to Library is absent for all Open Library records.** Canonical frontend/backend validators, existing Library APIs, saved-record resolvers, schema and legacy import have not been extended to accept Open Library. Existing Google, TMDB and RAWG tracking remains supported. No database was started or altered.

## Default activation procedure — owner authorization required

1. Collect and review every prerequisite in the table below. Registration alone is not permission or evidence of operational readiness.
2. Obtain explicit owner approval for a bounded live pilot and a replacement staging-verification plan. The current workflow deliberately asserts disabled-pilot 404; it has **not** been relaxed here. Merely setting flags while retaining that check would fail deployment verification.
3. Provision/verify the private backend settings described in [Development](DEVELOPMENT.md) and [Deployment](DEPLOYMENT.md): `OPEN_LIBRARY_PILOT_ENABLED=true`, `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED=true`, `OPEN_LIBRARY_STATE_FILE`, `OPEN_LIBRARY_USER_AGENT`, and the existing stable `RATE_LIMIT_SECRET`. These are future authorized operational actions, not commands executed in this phase.
4. Build the frontend with `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=true`. On `/discover` with no valid explicit provider, Open Library then becomes the default. `provider=google-books` always selects Google; `provider=open-library` always selects Open Library. No API failure changes that choice.
5. Run the separately authorized bounded sampling and browser acceptance, then review rollout evidence. A build flag does not establish availability or authorize saving. Turning the frontend flag off restores Google's implicit default; existing Google detail routes and records remain intact.

URLs retain submitted search text only: `/discover?provider=open-library&q=...&field=title|author|isbn&lang=en|nl|tr&mode=strict`. General/Any/preferred defaults are omitted; unsupported or repeated values normalize safely. No sort is forwarded to Open Library. Google retains its old field/lang/sort URL parsing, including legacy `sort=newest` links, but neither view advertises a Newest control. Provider-specific filters reset when explicitly switching catalogues; browser Back restores the prior URL. Edition preview selection is deliberately not serialized or restored as saved data.

## Shared admission and user-visible 503 behavior

The Phase 1.1 state format and safeguards remain: stable version-2 file, one cross-worker lock, five rolling admissions per 60 seconds per HMACed server-observed client, 1,024 active-client bound, no eviction of active counters, 1.1-second minimum provider-start spacing, sixty-second failure/crash cooldown and five-minute/twenty-entry shared public cache. Cache hits and invalid/budget-rejected requests count after lock acquisition. A lock-rejected request cannot safely update admission state and makes no provider call. Disabled requests reject before filesystem/admission/provider/database access.

Previously `LOCK_NB` failed immediately and interval contention looked like an upstream outage. The implementation now polls the nonblocking lock every 10ms with a 150ms monotonic deadline. This can absorb brief cache/state contention. It does **not** wait for a long provider call or create a persistent work queue. If still locked, it returns `503 provider_busy` with `Retry-After: 2`. A cache miss during the ordinary 1.1-second interval also returns that busy response; a valid cache hit is available first. A tiny floating-point comparison tolerance affects only the error category, never provider admission time.

Longer cooldown, corrupt/missing/full storage and configuration failures still fail closed with safe 503 handling; they are not represented as proven upstream downtime. Client exhaustion remains 429 with remaining-window `Retry-After`. Provider I/O remains serialized under the same lock, with a crash reservation written before I/O. No budget increase, external retry, lock bypass, fallback, extra provider traffic or unbounded worker queue was introduced. Under sustained concurrent use, busy responses are still expected. Do not enlarge the wait without measuring PHP worker capacity and end-to-end timeouts on the intended host.

## Exact outstanding Hostinger/policy prerequisites

No hosting evidence was collected in this implementation. **Every row remains unverified/open.** Local fixture/concurrent-process tests cannot close a Hostinger gate.

| Prerequisite | Evidence needed before activation |
| --- | --- |
| Stable private version-2 state file | Absolute canonical non-symlink path outside document roots, release directories and deployment cleanup; pre-provisioned readable/writable by PHP, private directory/file permissions (recommended 0700/0600). Initial state `{"version":2,"nextRequestAt":0,"cache":[],"clients":[]}` only for a genuinely new inactive installation. Keep the same inode while workers run. Never reset an active state file or replace v1 with empty v2 to erase budgets; any v1 upgrade requires a deliberate offline preservation procedure. Record persistence across releases/restarts and backup/recovery handling without publishing the path or state. |
| Cross-worker locking and egress topology | Demonstrate actual Hostinger PHP workers coordinate `flock`, writes/flushes and the same inode, including contention and crash reservations. Confirm every application instance/metadata operation shares that coordinator and one coordinated provider budget/egress. Independent hosts/files/secrets or distributed IPs are not safe substitutes. Verify bounded-wait capacity under the actual worker pool. |
| Reliable server-observed client IP | Controlled known-client tests establish the actual `REMOTE_ADDR` behavior behind Hostinger's proxy, IPv4/IPv6 normalization and NAT implications. Current code ignores forwarded headers; spoofed headers must not change allowance. If all users appear as one proxy address, resolve trusted host configuration deliberately before relying on fairness. Do not publish raw addresses. |
| Stable `RATE_LIMIT_SECRET` | One private, stable secret of at least 32 characters shared by workers and preserved across deployments/restarts. Confirm existing configuration privately; do not print or rotate it to evade counters. Record configured/consistent status only. |
| Managed application User-Agent/contact | Owner-controlled working contact, truthful `MyFunList ... (contact@example.org)` identification matching the current validator, ASCII and at most 200 characters. Confirm actual outgoing header behavior and managed contact ownership; example contacts are not evidence. No browser key or public `VITE_` value may contain a private secret. |
| Open Library use-case registration and policy suitability | Owner submits the real use case via the registration link in the official developer page and retains the acknowledgement plus policy review date. Confirm intended traffic, persistence, project/licensing and any commercial plans fit the current human-discovery guidelines; seek clarification from Open Library where suitability is unclear. Registration is not individual approval or a guarantee of service. No form/application/contact request was submitted in this phase. |
| Separate owner activation and acceptance | Explicit authorization for flags/deployment, a deliberately revised staging pilot check and the bounded sampling/browser plan. Multi-day modern-title/English/Dutch/Turkish coverage and independent relevance/content-language judgements are still missing. |

Official [Open Library API guidelines](https://openlibrary.org/developers/api) and [Search API documentation](https://openlibrary.org/dev/docs/api/search) were read on 1 November 2026. They describe human-driven discovery, caching, application identification, registration and language preference semantics. The current conservative application budget is not increased to the documented identified-request allowance.

## Google compatibility and attribution

The [official branding guidance](https://developers.google.com/books/branding), checked on 1 November 2026, requires powered attribution near search/results, prominent book links, unchanged result ordering and separate result presentation; it also restricts competing search logos on the same page. The secondary view now displays the official unmodified powered image beside its search module, uses “Google Books search results”, provides a prominent Google Books link for each valid volume and keeps provider order. Only one provider's form/results/branding renders at once; the selector uses text, with no competing search logo.

The previous application title reranking and local language omission are no longer used by discovery. `langRestrict` is still sent when requested, with an honest warning and each returned language tag/Unknown visible. Existing title/author operators, Volume IDs, detail navigation, backend authoritative metadata resolution, Library Add/status/rating/removal and Custom List membership are preserved. Pure historical ranking/language helpers remain available but are not called from search.

The powered image URL was verified as HTTP 200 `image/png` and matches the official guidance's image source. It is a remote official asset; blocked image delivery can affect graphic attribution and needs browser/CSP acceptance. No preview viewer is introduced. This targeted search-view correction is not legal clearance for the entire application. Broader detail/saved-content attribution, content rights/contact and any fee-based plans still require review under the [Books terms](https://developers.google.com/books/terms).

## Next work for saving Editions

Validate the persistence contract separately before exposing Add: strict `open-library/book/OL…M` identity only; an authoritative bounded Edition resolver with validated returned ID, title, ISBNs, language and Work provenance; typed caches sharing this same coordinator and budget; no browser-supplied metadata authority. A future edition-list route must separately validate `OL…W`, allow only bounded page/limit parameters, cap catalogue inspection and never fan out or silently scan pages.

Extend detail/Library presentation and server/frontend allowlists deliberately. Preserve separate Work first-year/Edition dates and missing states. Define uncertain/conflicting associations, possible duplicates, Edition aliases/corrections and cache/saving-off behavior without merging Google records or personal/list entries. Existing saved snapshots must remain editable/removable during provider downtime; public metadata must not expose private snapshots. Verify idempotent/concurrent same-Edition adds, independent tracking of distinct editions, ownership/CSRF/account transitions and unchanged Google/legacy records. Any database-writing validation must use only the existing guarded disposable loopback `myfunlist_test` setup; none was run here.

## Validation record

Deterministic frontend tests cover provider/default isolation, all four fields, language modes, ISBN checksums, Work/Edition kinds, metadata placeholders, preview eligibility, cache/deduplication/expiry/bounds, stale responses, disabled/empty/error/busy/rate-limit states and explicit-only retries. Existing navigation, canonical detail, Library/List/import and Undo suites remain required regressions.

Final automated results:

- `npm test`: all **273 tests pass**, including the sixteen dedicated Open Library service/view tests and the additional provider-switch scroll regression.
- `npm run build`: passes, 95 modules transformed.
- `composer --working-dir=backend run test:providers` and `run test:api`: pass with fixture/storage doubles and disposable files, no live provider/database I/O. Open Library provider and admission suites each pass 92 assertions.
- `php backend/tests/database_safety.php`: passes. PHP syntax checks pass for both changed backend source files and the changed admission test; `composer --working-dir=backend validate --strict` passes.
- Internal Markdown links/fragments, fenced blocks and `git diff --check`: pass. Original `docs/evidence` files have no changes.

Local preview/browser acceptance, staging deployment, live provider search sampling and independent browser QA have not been performed for Phase 2B. No push, deployment, live activation, external registration, actual environment mutation, XAMPP/MySQL startup or database write is part of this work. The local commit is a reviewable implementation, not activation approval.
