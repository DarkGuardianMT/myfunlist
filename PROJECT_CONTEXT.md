# MyFunList project context

Current-state reference including Book Search V2 Phase 2B (1 November 2026): Open Library-first read-only frontend prepared behind a disabled activation gate, separate Google Books compatibility, Phase 1.1 admission protection and mandatory backend staging checks. Use the actual HEAD; the initial Search V1 implementation is `8d1aa53cc6cc9add893c6f834a75f484bcd70479`.

Working rules: [AGENTS.md](AGENTS.md). Setup/API reference: [Development](docs/DEVELOPMENT.md). Hosting/release procedure: [Deployment](docs/DEPLOYMENT.md). Earlier milestones and verification records: [Project history](docs/PROJECT_HISTORY.md).

## Project overview and product vision

MyFunList is an independent full-stack media tracking platform and portfolio project. Users discover books, movies, TV shows and games, then track statuses and ratings in an account Library and organize entries into private Custom Lists. Public sharing and social features are future possibilities. Trackora was the earlier vanilla-JavaScript prototype.

The staging host is [lightcyan-snake-955164.hostingersite.com](https://lightcyan-snake-955164.hostingersite.com). The planned public domain is `myfunlist.app`; its deployment and public-launch readiness are not confirmed.

## Current implementation and verification status

| Area | Implemented state | Verification status |
| --- | --- | --- |
| Accounts and persistence | Sessions, registration/login/logout, private Profile/password changes, Library, legacy import, private Custom Lists | Automated coverage exists; full public-launch checks remain open |
| Media Detail | Public metadata for all four types, card links, account Library controls, lazy Add to List | Implemented through phases 1–6 |
| UI audit Batch 5 (B6) | Shared eight-second deferred Library removal with title-specific Undo, accessible notices, navigation continuity and account/interruption guards | All 256 frontend tests and production build pass; fresh responsive/theme browser QA remains required |
| UI audit Batch 4 (A4/B4/B5/D3/B3-L1) | Honest membership/filter messages; collapsed forms; shared lazy Library/Detail picker now hydrates persisted membership IDs before enabling Add; 44px Library controls | Original live QA passed B4/B3-L1 and held acceptance for D3; fix has automated regressions, with fresh browser acceptance still required |
| UI audit Batch 1 (A1/A2) | Discover context/return navigation and Library filters/Back behavior | Complete: automated tests and live Work browser QA passed |
| UI audit Batch 2 (B1/B2/B3/B7) | Responsive detail layout, actions before synopsis, authors near title, concise book labels/full classifications disclosure, improved action targets | Media Detail complete: automated tests and live Work browser QA passed; Library residual B3-L1 remains open |
| UI audit Batch 3 (A3/D2) | Compact Discover book metadata, accessible Full info disclosure, action alignment, mobile 2×2 type switcher | Complete: automated tests and live Work browser QA passed across requested viewports and both themes |
| Discover Book Search V2 | Open Library Work/selected Edition UI prepared with separate Google search; disabled-by-default activation gate | Automated tests/build required; live provider/hosting evidence and browser acceptance remain open |

Batch 1–3 Work QA completion is the project owner's confirmation supplied for the documentation refresh. Original Work reports/screenshots are not tracked here; preserve them wherever they are held. The external Search V1 live QA report was subsequently reviewed for this follow-up; it has not been overwritten or re-run as new browser evidence. Initial Search V1 staging success is recorded in [workflow run 40751645647](https://github.com/DarkGuardianMT/myfunlist/actions/runs/40751645647). See [QA follow-up](docs/DISCOVER_SEARCH_V1_QA_FOLLOWUP.md) for direct provider evidence, fixes and unresolved checks. These records do not establish complete production readiness.

## Technology stack and architecture

- Frontend: Vue 3, Vite, Vue Router, JavaScript and plain CSS. Shared composables hold state; no separate state library or CSS framework is installed.
- Backend: structured plain PHP 8.2+ JSON REST API, Composer PSR-4 autoloading, PDO and MySQL/MariaDB. Local MariaDB 10.4 is supported; MySQL requires 8.0.16+ for enforced CHECK constraints.
- Vue lives in `src/`; the API entry point is `backend/public/index.php`. Only `backend/public/` may be PHP web-facing.
- Browser API calls use relative same-origin `/api/v1` paths. Vite proxies `/api` to `http://127.0.0.1:8080` by default; deployed Vue and API share one HTTPS origin.
- Controllers, application services, repositories and provider adapters keep HTTP/session handling separate from domain logic. `CurrentUserProvider` supplies `AuthenticatedUser`; native bearer authentication is not implemented.
- Success responses use a `data` envelope except 204; errors use `error`. IDs are opaque strings. Endpoint/body details belong in the development guide.

## Data model and canonical media identity

| Record | Purpose and contract |
| --- | --- |
| `users` | Account credentials, optional display name and timestamps |
| `media` | Shared normalized provider metadata; unique `(source, media_type, source_id)` |
| `user_media` | Account-owned tracking relationship; unique `(user_id, media_id)`, status, nullable personal rating, timestamps |
| `lists` / `list_items` | Private account lists; membership references `user_media_id` with primary key `(list_id, user_media_id)` |
| `rate_limit_counters` / `schema_migrations` | Durable abuse protection and ordered CLI migration bookkeeping |

Canonical frontend identity is `mediaKey = source:mediaType:sourceId`; `userMedia.id` is the separate opaque Library entry ID used for updates/deletion and list membership. TMDB movie and TV IDs remain distinct. Supported pairs are `google-books/book`, `tmdb/movie`, `tmdb/tv` and `rawg/game`. Strict detail identities use the validators in `src/domain/mediaIdentity.js` and `backend/src/Domain/MediaRules.php`; legacy-import compatibility must remain intact.

Metadata is validated JSON text rather than native database JSON, avoiding MariaDB/MySQL differences. Personal ratings are nullable `DECIMAL(3,1)`, 0.5–10 in half-point steps, enforced by PHP and a database range check; provider scores are separate. Status/source rules live in domain code, not SQL ENUMs:

| Type | Statuses (first is default) |
| --- | --- |
| Book | want-to-read, reading, finished |
| Movie | want-to-watch, watched |
| TV | want-to-watch, watching, completed |
| Game | want-to-play, playing, completed, dropped |

Database defaults manage timestamps and each PDO connection uses UTC. Keep external metadata separate from personal state; notes and detailed consumption tracking are not implemented.

## Authentication, authorization and security

Native PHP sessions store user ID and CSRF token. Cookies are host-only, HttpOnly and SameSite=Lax; production uses Secure `__Host-myfunlist_session`, while loopback development/testing HTTP uses a separate non-Secure cookie. Private persistent session storage is a hosting requirement.

Mutations, including registration/login, require the session-bound `X-CSRF-Token`. Registration/login rotate the session ID and token; logout destroys the session and expires the cookie. Password changes verify the current password, preserve the current login and rotate its session ID/token; other sessions are not invalidated. Passwords require 12–128 characters, use Argon2id when available or `PASSWORD_DEFAULT` otherwise, and the fallback also limits input to 72 bytes. Email is trimmed/lowercased ASCII with database uniqueness; international email support is deferred.

Ownership comes from the authenticated identity, never client-supplied account IDs. Unowned list IDs return the same 404 as missing IDs. Account transitions/session expiry reset private frontend state; request generations/auth epochs prevent late reads or queued mutations from crossing accounts.

Shared database fixed-window limits protect login (IP and normalized account), registration, TMDB/RAWG Discover, public Media Detail, Library import and password changes. Subjects are HMACed with backend-only `RATE_LIMIT_SECRET`; the observed address is `REMOTE_ADDR`, without trusting forwarded headers. Policies are in `backend/config/rate_limits.php`: discovery allows 60/minute and detail 30/minute per observed IP. Blocking returns 429 with `Retry-After`; limiter configuration/storage failure returns a safe 503. Real client-IP behavior behind the host proxy still needs release verification.

Keep real environment files, credentials, sessions, exports and backups out of Git and logs. Every `VITE_` value is browser-visible. Private provider credentials stay server-side except the deliberately public, site/API-restricted Google Books browser key.

## Implemented frontend and backend features

### Library, Custom Lists and Profile

Library adds submit identity only. The backend resolves authoritative metadata on first add outside the database transaction, reuses shared records later, and relies on uniqueness constraints for concurrent duplicates. Status/rating updates and deletion are account-scoped.

Library and Media Detail Remove actions now schedule an eight-second in-memory Undo window. Library hides pending entries through a separate display projection; canonical records, original `user_media` IDs, statuses/ratings and Custom List memberships remain untouched until DELETE succeeds. Undo cancels the timer without an API write, restoring the existing item under the active filters/sort. The application-level notice panel survives SPA navigation and provides named native Undo buttons, persistent live regions and focus handoff; pending items cannot be edited/re-added. Independent timers support multiple removals; repeated Remove clicks share the same job.

At expiry, Undo ends and the existing authenticated DELETE runs with an 11-second response timeout, account generation and exact-entry guards checked after CSRF resolution. Confirmed success removes canonical state and invalidates List caches, preserving backend cascades. Failure makes the unchanged local record visible with an explicit uncertain-outcome warning and no automatic retry or reconstruction. Logout/account changes, a forced Library reload, application unmount and `pagehide` cancel unsent work, including work waiting for CSRF. No deletion intents are persisted or replayed and no unload/beacon DELETE is sent. Already-dispatched requests may still complete after navigation, refresh, closure or logout; a new page reads the server state. Browser suspension can delay dispatch past eight seconds, but cannot extend Undo. See [Undo behavior and QA](docs/LIBRARY_REMOVE_UNDO.md).

Custom Lists mix existing Library entries across types without copying metadata or personal state. Titles need not be unique. Items sort by newest membership, then `user_media_id` descending. Cascades remove memberships when a list/Library entry is deleted. List `updatedAt` changes for metadata/membership changes, including Library deletion in the same transaction, but not personal status/rating or shared metadata changes.

Create a list and Add from Library use native, initially collapsed disclosures so saved lists/items remain near the top. Create/edit forms use shorter description fields and separate primary/Cancel actions. The list picker filters the complete Library before excluding members, distinguishing genuinely absent matches from matches already in the list. Library empty/filter/loading/error states and filter preferences remain separate.

Library cards reuse the lazy Media Detail list picker with per-entry control IDs. Concurrent summary and membership reads deduplicate. Authenticated `GET /api/v1/lists/memberships` returns account-owned list/Library ID pairs in pages of at most 500, using one bounded query per page without media metadata. Pickers enable Add only after all pages succeed; failed/partial loads remain unavailable with explicit Retry. Successful detail reads/adds and list removals/deletions update membership knowledge. Local mutations during hydration restart the snapshot; account generations reject stale responses, and concurrent adds for the same pair share one POST. Account reset and successful Library removal clear the private caches; remaining open pickers reload membership state. Existing idempotent Add responses still handle external changes. Other browser tabs/devices do not synchronize automatically; a reload obtains fresh state. Original Batch 4 browser QA measured Library status/rating/Remove controls at 44px high and wider than 44px in all eight requested viewport/theme combinations; fresh acceptance of the D3 fix remains open.

Profile exposes string ID, email, nullable Unicode display name (non-unique, at most 80 characters) and UTC creation date. Display name is editable; email is read-only. Password behavior is described above.

Legacy `myfunlist_library` v1/v2 and `trackora_library` storage is an explicit, read-only import source, never account Library data. Import sends identities plus personal status/rating/time in batches of up to 200, with frontend bodies below 120 KiB (API limit 128 KiB). Existing account entries and the first valid occurrence win; partial failures remain retryable. Genuine timestamps survive; only the artificial epoch placeholder becomes import time. Per-account/content completion flags avoid repeat prompts; the browser recovery copy is retained.

### Media Detail and presentation

The named route `media-detail` at `/media/:mediaType/:source/:sourceId` loads public metadata from `GET /api/v1/media/{mediaType}/{source}/{sourceId}`. It neither requires login nor writes Library/shared-media/List rows; durable limiter counters may be written. Responses use `Cache-Control: no-store`.

Normalized detail contains identity/title and object-valued `details`; optional artwork, backdrop, plain-text description and genres are omitted when unavailable. Book publication precision and ISBN strings are retained; book categories map to shared genres. Movie/TV/game details include their relevant runtime, creators, series or platform metadata. Personal fields never enter the public detail cache. Missing media, provider unavailability, malformed data, rate limits and network/timeouts have safe separate handling and explicit retry; the frontend does not expose a Retry-After countdown.

Artwork/title links in Discover, Library and Lists lead to detail without swallowing action controls. Signed-out visitors see Login/Register without private data requests. Signed-in users can add/remove Library membership, edit status/rating, and lazily open Add to List for saved entries. List submission uses authoritative `userMedia.id`; detail uses `refreshDetail: false` to invalidate affected caches without fetching list contents. Successful Library removal invalidates list summaries/details; status/rating changes do not. Local busy/context guards and store generations reject stale feedback; the request context is checked again after CSRF resolution.

Light is default; Light/Dark tokens and the `myfunlist_theme` device preference leave artwork unfiltered. At 640px and below, five-item bottom navigation replaces desktop navigation; Profile/Login depends on account state. Detail actions precede the full synopsis, with scoped 44px targets. Book classifications use up to three deduplicated source-topic labels; full classifications remain in Details. Discover alone opts BookCard into two-line title/author previews and a keyboard-accessible Full info disclosure; Library/List cards keep full metadata.

## External media providers

| Provider | Boundary |
| --- | --- |
| Google Books | Separate browser-side secondary discovery; functional default while Open Library is gated; provider order/attribution preserved; backend independently resolves Library/detail metadata |
| TMDB | Movie/TV discovery and detail resolution on PHP, with backend-only `TMDB_API_TOKEN` |
| RAWG | Game discovery and detail resolution on PHP, with backend-only `RAWG_API_KEY` |
| Open Library | Intended primary discovery provider; read-only Work/selected Edition frontend prepared, activation disabled by default; no saved-record support |

TMDB/RAWG discovery uses public `GET /api/v1/discover/{movie|tv|game}?q=...`, returning bounded normalized metadata without inserting search results. Backend Books resolution accepts optional `GOOGLE_BOOKS_API_KEY`; browser discovery uses optional `VITE_GOOGLE_BOOKS_API_KEY`, restricted to the deployed origin and Books API. Google Books browser search is outside the PHP limiter.

Preserve TMDB logo/notice, RAWG attribution backlinks and detail's Google Books credit. Metadata/artwork remain subject to provider rights; no open-source license has been selected and the backend package is proprietary.

The separate `GET /api/v1/pilot/open-library/search` route supports bounded General/Title/Author/ISBN lookup with separate Work/selected Edition IDs, provenance/missing states and explicit `en→eng`, `nl→dut`, `tr→tur` preference/strict semantics. It does not change canonical media identities, Google Books, Library/List data or the database schema. Absent `OPEN_LIBRARY_PILOT_ENABLED=true` returns 404 before client admission, filesystem, provider or database access. Enabling also requires private application/contact identification, `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED=true`, the existing stable `RATE_LIMIT_SECRET` and a pre-provisioned version-2 private state file outside the webroot. A database-independent admission policy allows five requests per rolling 60 seconds per server-observed `REMOTE_ADDR`, including cache hits, invalid queries and provider-budget rejections. HMAC identifiers and at most five timestamps per client expire after 60 seconds, with at most 1,024 active clients; forwarded headers are ignored. Exhaustion returns 429 with remaining-window `Retry-After`; missing/corrupt/full storage fails closed. The same cross-worker file lock now waits at most 150ms for brief contention, persists admission, serializes provider I/O, enforces at least 1.1 seconds between provider starts and a shared failure cooldown, and holds a public-only cache (five minutes, 20 entries; total state bounded to 2 MiB). No active client counter is evicted to admit another client. Legacy version-1 state fails closed and requires a deliberate offline upgrade before future enablement. Independent files/hosts, inconsistent secrets or uncoordinated egress cannot guarantee shared protection. Lock contention and ordinary provider spacing return distinct `503 provider_busy` with a two-second manual backoff; longer failure/crash cooldowns remain unavailable with sixty-second backoff. Hostinger locking/topology, observed IP behavior and policy/use-case registration remain unverified prerequisites, so keep the network pilot disabled. The staging workflow checks that it remains disabled. See the [Phase 0/1 report and API contract](docs/BOOK_SEARCH_V2_PROVIDER_EVALUATION.md#phase-0-extension-and-phase-1-implementation--31-october-2026) and [Phase 1.1 hardening](docs/BOOK_SEARCH_V2_PROVIDER_EVALUATION.md#phase-11-hardening--31-october-2026); no multi-day reliability or browser acceptance is claimed.

## Search, navigation and caching

### Discover Book Search V2 / Phase 2B

Open Library is the intended primary provider, with Google Books as an explicit separate option. The read-only frontend is prepared but remains disabled unless built with `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=true` after operational/policy confirmation and owner activation authorization. While absent/false, Google remains the functional default; explicitly choosing Open Library shows a gate message and sends no pilot requests. Actual backend settings remain disabled, and the staging workflow still requires pilot 404. No provider failure merges results or switches provider.

Open Library uses the existing bounded search contract (at most ten Work cards) for General/Title/Author/ISBN. ISBN-10/13 checksums are validated before frontend requests; backend validation remains authoritative. Any/English/Dutch/Turkish preferences and explicit strict matching distinguish provider tags from verified content language. Work IDs, authors/first-publication year and returned cover provenance remain separate from the search-selected Edition ID/title/date/language/ISBN. Missing metadata is shown honestly. The native disclosure permits only a transient read-only preview selection of that one Edition, with eligibility guards; it is not an edition catalogue. No extra lookup routes, new persistence identities or Open Library Library actions were added.

Google discovery now preserves every candidate and provider order: no application reranking or local language omissions. Requested language still uses `langRestrict`, with a clear reliability caveat and visible language tags. Official powered attribution sits beside search/results and each valid volume has a prominent Google Books link. Existing Google detail routes, saved IDs, authoritative backend resolver, Library/List/legacy contracts remain unchanged. Neither catalogue advertises Newest; legacy Google sort URL parsing remains supported. Historical Search V1 behavior and QA evidence are retained in the [QA follow-up](docs/DISCOVER_SEARCH_V1_QA_FOLLOWUP.md) and project history.

Submitted context uses `q`/`type`, explicit `provider=open-library|google-books`, field and `lang`; Open Library additionally uses `mode=strict` (preferred is default). General/Any defaults are omitted. When activation is authorized, the frontend build flag changes the implicit default to Open Library; explicit Google URLs still select Google. Browser Back restores URL context; switching catalogues resets provider-specific filters. Filters with a submitted query search immediately, with no per-keystroke reads. Preview selection resets when results change and is not saved in history/storage.

Errors are distinct from empty/omitted samples, with manual Retry only. Open Library busy waits at least two seconds; 429/general 503 wait at least sixty seconds and respect longer bounded Retry-After. Expiry re-enables actions without sending requests. Full scope, exact activation/Hostinger prerequisites, Google policy review and future Edition-saving work: [Phase 2B report](docs/BOOK_SEARCH_V2_PHASE2B_IMPLEMENTATION.md). No live availability, deployment or independent browser acceptance is established.

### State and cache boundaries

- Discover: public-only in-memory results and identical-request deduplication; five-minute TTL, 20-entry LRU bound. Google keys include type/query and every Books filter; Open Library has an isolated public cache keyed by query/field/language/matching mode with the same TTL/entry bounds. Successful empty results are cached, failures are not. Route/disposal/cache generations prevent stale responses replacing current state.
- Detail: public-only in-memory success cache keyed by canonical identity, five-minute TTL, 50-entry LRU bound and in-flight deduplication; service timeout is 11 seconds. Failures are uncached and not automatically retried.
- Library/List data remains account-scoped. Library type/status/sort preferences survive detail navigation in session memory, reset on account-ID changes/logout, and return to defaults on full reload. Changing type resets status.
- Scroll restoration retains up to 20 Discover/Library locations, prioritizes browser-history saved positions, waits for rendered content, and ignores superseded restorations. New pages start at the top.
- Search results/private account state are not persisted in URLs, browser history payloads or browser storage; URLs contain only search context. Theme and legacy-import flags are separate device-local UI state.

## Development, tests and deployment

Use Node.js 24.15+, PHP 8.2+ with required PDO/cURL extensions and Composer. Start MySQL/MariaDB manually, then `npm run dev:full` for Vite/PHP. Apache is optional; `VITE_API_PROXY_TARGET` can select an existing local API host. `npm run preview` serves only the frontend, without the API proxy. Full setup and API contracts live in [Development](docs/DEVELOPMENT.md).

Frontend checks are `npm test` and `npm run build`. Non-destructive backend checks include `php backend/tests/database_safety.php`, relevant PHP lint, and `composer --working-dir=backend run test:providers` / `run test:api`. These provider/API suites use doubles without live provider/database I/O; they do not prove real database concurrency or hosting behavior.

The separate [headless UI QA workflow](docs/HEADLESS_UI_QA.md) adds `npm run test:ui` with managed Chromium headless, desktop/mobile projects, synthetic provider/session/detail data, browser error/network assertions and selected screenshots. Its dedicated loopback Vite configuration reads no private env files, has no backend proxy and keeps Open Library disabled. Temporary sanitized reports/screenshots are shared on review branches and removed before merge unless explicitly approved for permanent retention; historical evidence is preserved. Implementation defaults to `review/<task-name>` from current `origin/main`, with no direct main commits/pushes, automatic merges/deployment or branch deletion. Review, merge/deployment approval and separate deletion authorization remain owner-controlled.

Ordered migrations run only via `backend/bin/migrate.php` / Composer and are tracked in `schema_migrations`. Database-writing tests, including the full `composer test` suite, require explicit `APP_ENV=testing`, exact `DB_DATABASE=myfunlist_test`, a loopback host and an isolated disposable database. Never run destructive tests/reset/schema rebuilds on development, staging or production data. Deliberate migrations require target verification and the deployment backup procedure.

Pushes to `main` trigger [deploy-staging.yml](.github/workflows/deploy-staging.yml). Before SSH setup or deployment, Node.js 24.15.0 runs frontend tests/build, and PHP 8.2/Composer runs strict validation, dependency installation, syntax checks, database safety checks and the database-independent provider/API suites (including Open Library). Any failed check blocks deployment; no database service or database-writing test is used in CI. SSH then deploys the tested commit to Hostinger, installs production Composer dependencies, uploads frontend assets while preserving `.htaccess` and `api/`, and verifies database-backed API health and the disabled pilot. Migrations remain manual. Exact host layout, secrets, SSH trust behavior and rollback/backup steps belong in [Deployment](docs/DEPLOYMENT.md).

Keep verification categories distinct: automated tests, local preview, staging workflow/HTTP checks and independent live-browser QA. A healthy staging response is not proof of every auth/security/operations release requirement.

## Architectural decisions and deferred features

Preserve normalized provider contracts, canonical identities, separate shared/personal data, session/CSRF ownership boundaries, client-agnostic API contracts and private lists. Avoid new state/CSS frameworks or identity changes without an explicit decision.

Deferred: Anime/source selection; season-level TV/Anime tracking in dedicated related data (not `user_media` columns); much later episode tracking; notes; public usernames/profiles, shared/public lists, manual list ordering and social features; provider resynchronization policy; email verification, password reset, email change, account deletion and global session invalidation. Account recovery needs a support plan before public launch.

## Known issues and active roadmap

| Item | Remaining work |
| --- | --- |
| Discover book search | Phase 2B needs fresh responsive/theme, keyboard and screen-reader acceptance. Google no longer omits/reranks candidates; field/language usefulness and provider reliability still need live review |
| Batch 4 | Original live QA held acceptance for persisted-membership D3, now fixed with automated regressions; rerun refresh/picker cases at 320×740, 390×844, 768×1024 and 1440×900 in Light/Dark, plus uncovered error/retry and request checks |
| Batch 5 / B6 | Deferred Library removal/Undo implemented; fresh 320×740, 390×844, 768×1024 and 1440×900 Light/Dark browser acceptance and physical-device/screen-reader checks remain open. D1 rating presentation is outside this task |
| B3-L1 (low severity) | Passed original Batch 4 live QA: 120 target measurements across all eight requested size/theme combinations met 44×44 CSS px; physical-device/native OS picker coverage remains open |
| C1 | Direct Google Books calls reproduced upstream HTTP 503 `backendFailed`; no application-side cause identified for those samples. Existing safe classification and explicit-only retries remain; broader provider reliability is unresolved |
| Search V2 | Phase 2B Open Library-first Work/selected Edition UI implemented behind a disabled activation gate; Google is separate and functional. Hostinger/policy, live multi-day sampling and browser acceptance remain open. Alternate-edition catalogue, saving and popularity remain deferred |
| Public launch | Complete security/operations checks: real client IP/limits, cookie/session persistence, HTTPS/routing/headers/CSP, backups/isolated restore, logs, provider-key restrictions and account-isolation flows |

The remaining audit roadmap and measurements above come from the owner's Work QA status update; the original reports remain the evidence source. Public launch requires the separate [release checklist](docs/DEPLOYMENT.md#public-release-checklist).

The [provider decision and preserved Phase 2A proposal](docs/BOOK_SEARCH_V2_PHASE2_DECISION.md) now records the owner's Open Library-first decision and links to the implemented Phase 2B scope. Its original evidence and future persistence/API proposals remain archived. Implementation authorization does not authorize push, deployment, actual environment changes, registration or live activation.

The [Phase 2C activation preflight](docs/BOOK_SEARCH_V2_PHASE2C_PREFLIGHT.md), dated 2 November 2026, records **No-Go pending host/policy evidence**. GitHub confirms the subsequently authorized `f8480e8` staging deployment passed, including its disabled-pilot check; this historical deployment does not establish current private settings or Hostinger readiness. No authorized SSH setup was available during preflight, so actual PHP/worker/storage/configuration and HTTP client-IP behavior remain unverified. No activation, operational change or provider API request accompanied that diagnostic. The report defines the separately approvable temporary lock/IP tests and future activation/rollback plan.

The [manual SSH diagnostic workflow review](docs/BOOK_SEARCH_V2_PHASE2C_WORKFLOW_REVIEW.md) remains historical proposal evidence. The subsequently authorized [preflight run 41725421377](https://github.com/DarkGuardianMT/myfunlist/actions/runs/41725421377) succeeded, including cleanup verification and runner credential/raw-output removal. Its allowlisted CLI findings establish PHP 8.3.36 and required extensions/functions, absent Open Library settings and no configured private state; `proc_open` is unavailable and lock probes were not tested. The existing secret passes length validation only. This does not establish actual web configuration, worker locking/access, client-IP behavior, topology or persistence. The [Hostinger readiness plan](docs/BOOK_SEARCH_V2_PHASE2C_HOSTINGER_READINESS.md), dated 3 November 2026, proposes private persistent storage, independent-process locking diagnostics without `proc_open`, host-assisted web verification without a new public endpoint, and ordered owner/automated gates. Activation remains **No-Go**; no provisioning, server/configuration change, provider request or new diagnostic run accompanies this documentation. Original reports and the deployment workflow remain unchanged.

The [independent-process CLI locking harness](docs/BOOK_SEARCH_V2_PHASE2C_CLI_LOCK_DIAGNOSTICS.md) adds a separate manual workflow and runner-coordinated SSH/PHP fixture protocol for review. It has no remote `proc_open` dependency, checks the approved deployed SHA per invocation, reuses pinned SSH trust, bounds overlap/timeouts and output, verifies synthetic contention/release/visibility/reservation persistence, and requires independent cleanup proof. Existing private parent storage is mandatory; no real state or application behavior changes. Local controller/failure tests and PHP syntax checks are available; six Linux/POSIX fixture tests are explicitly skipped on the Windows implementation host. No Hostinger execution or deployment is authorized by this implementation; actual web-worker/IP/topology/persistence gates and activation No-Go remain.

The [temporary web-worker diagnostic proposal](docs/BOOK_SEARCH_V2_PHASE2C_WEB_WORKER_DIAGNOSTICS.md) adds an isolated package outside the automatically deployed public application tree, with no application route or deployment integration. Following the owner's Hostinger confirmation that actual worker verification needs HTTP, it proposes a separately approved exception to the prior no-new-endpoint plan: server-verified Basic Authentication plus a distinct strong header key, a private server boundary marker, short-lived disarmed-by-default JSON configuration, synthetic original-inode fixtures and bounded concurrent-worker/cleanup proof. Local tests use injected inputs and fake transport only; Linux/POSIX file-process tests are skipped on Windows. Independent review and explicit owner installation/execution/removal approval remain mandatory. Nothing has been uploaded, mapped, armed or executed over HTTP; no real state, database/session/provider or activation behavior changes. Original readiness evidence is preserved and activation remains **No-Go**.
