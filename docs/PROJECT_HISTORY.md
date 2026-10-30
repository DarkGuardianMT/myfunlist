# MyFunList project history

Historical milestones and verification records moved out of the current-state reference during the 2026-10-28 documentation refresh. Use [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for present behavior and [AGENTS.md](../AGENTS.md) for mandatory working rules. Original UI/Work reports, screenshots, measurements and recovery archives must remain unchanged outside this summary.

The [pre-refresh context at 8d1aa53](https://github.com/DarkGuardianMT/myfunlist/blob/8d1aa53cc6cc9add893c6f834a75f484bcd70479/PROJECT_CONTEXT.md) retains the full earlier implementation narrative in Git. It is a historical snapshot: its pending Batch 1–3 browser-QA statements and publication/deployment status are superseded below.

## Foundations and account persistence

Trackora was the earlier vanilla-JavaScript prototype; MyFunList became the main Vue project. The frontend grew from browser-local tracking to four media types and then account-backed persistence.

September 2026 work introduced the PHP API, CLI migrations/core schema, native session authentication, authoritative Library resolution and legacy import. Private Profile/password management and mixed-media Custom Lists followed. Later fixes stabilized account transitions and list consistency. Implementation contracts now live in the current context and development guide rather than being duplicated here.

## Local database recovery record — September 29

The earlier local audit found evidence of an XAMPP data-directory replacement and logical restore. The original cause was unconfirmed. Read-only checks found the restored development schema/data consistent with fresh migrations; both development and isolated test databases passed checks after a clean MariaDB restart with recovery disabled. The recorded run also passed backend tests and live TMDB/RAWG searches.

A fresh logical backup and verified stopped-data-directory copy were recorded outside Git under XAMPP's recovery directory. Preserve old data directories/recovery exports. This historical record does not establish their current availability or authorize restoration, deletion or a new destructive test run.

## Release and portfolio reviews — September/October

Durable API rate limits, guarded isolated-database tests, Light/Dark themes, backend TMDB/RAWG discovery and mobile bottom navigation were implemented before the deployment milestone.

The October 9 portfolio review scanned 34 existing commits and 384 local file blobs, including unreachable objects, and reported no genuine committed credentials or database exports. The owner accepted the author's personal email in commit metadata. Ignore rules were expanded for sensitive local artifacts; compatible dependency security fixes and setup/development/deployment guides were added. No open-source license was selected.

That review passed 51 frontend tests at the time, production build, PHP/JavaScript syntax, non-database safety/discovery checks, Composer validation/platform checks and advisory checks. Local startup, same-origin proxy and anonymous/CSRF/API-error smoke checks passed; backend credentials were absent from built assets. The local database port refused connections during that run, so its health check failed and database-resetting tests were not run. This is separate from the earlier recovery verification.

Repository visibility was private at that historical review; the record is not a current visibility or publication gate. Likewise, an old credential/dependency scan is not a continuing security guarantee.

## Staging and Media Detail — October 27

The staging workflow was introduced in `455322a` and completed in `2322dd5`, targeting the Hostinger staging host. The deployment runbook remains the authoritative operational procedure.

| Commit | Media Detail milestone |
| --- | --- |
| `53cd948` | Normalized provider-side detail resolution, including book date/ISBN precision and bounded public metadata |
| `48ceac1` | Public detail API, strict source IDs, independent rate limit and deterministic API/provider tests |
| `152ee42` | Vue detail pages, errors/retry and public metadata cache; local fixture browser checks included refresh, themes and layouts down to 320px |
| `1cdb3e7` | Shared card artwork/title navigation and browser-history scroll restoration |
| `4a18c42` | Detail Library actions, shared controls and list-cache invalidation on Library removal |
| `2350260` | Lazy private Add to List without prefetching list contents, with account/context guards |

Two live server-authenticated RAWG responses were recorded during detail development to confirm field shapes. This historical provider check is not general live-browser QA.

## Completed UI audit batches

| Batch / commit | Delivered scope | Completion record |
| --- | --- | --- |
| 1 / `eaeb34d` | A1/A2: Discover query/type/cache/return context, Library filter persistence and render-aware scroll restoration | Automated tests and live Work browser QA passed |
| 2 / `9dce96d` | B1/B2/B3/B7: compact responsive Media Detail; actions before synopsis; authors near title; concise classifications with full disclosure; improved action targets | Media Detail automated tests and live Work browser QA passed |
| 3 / `aa377a9` | A3/D2: bounded Discover BookCard metadata/full-info access, bottom action alignment and balanced 2×2 mobile type switcher | Automated tests and live Work browser QA passed across requested viewports and both themes |

The project owner supplied these completed Work QA statuses for this documentation refresh. Original reports/screenshots are not tracked in this repository and were not independently re-run here. Earlier implementation-time limitations in local computer/browser access are superseded by that later Batch 1–3 confirmation, not by invented new checks.

B3-L1 remains open: Work QA measured Library-page status/rating targets around 40px and Remove around 38.4px rather than the intended 44px. This low-severity residual does not invalidate the completed Media Detail changes. Batch 4, Batch 5/B6 and other remaining work are listed in the current roadmap.

## Discover Search V1 — October 28

Commit `8d1aa53cc6cc9add893c6f834a75f484bcd70479` implemented bounded Google Books candidate ranking, field/language/sort constraints and filter-aware URLs/cache. Its implementation run passed all 184 frontend tests, production build, JavaScript/Vue syntax, scoped CSS checks and non-destructive PHP provider/API suites. Database-resetting tests were not run.

[Staging workflow 40751645647](https://github.com/DarkGuardianMT/myfunlist/actions/runs/40751645647) completed successfully, including API health. A separate HTTPS check confirmed the deployed Discover bundle contained the filter controls and 40-result request setting; health returned `data.status=ok`.

Search V1 live-browser QA is not yet confirmed. The implementation run had no browser connector and native Chrome app access timed out awaiting approval. The later Work confirmation above covers UI audit Batches 1–3, not Search V1. Full public-launch security/operations verification also remains separate.

## UI audit Batch 4 — October 29

Implementation started from HEAD `758c720`. The original October 27 `MYFUNLIST_UI_AUDIT.md` and the Batch 2 `MYFUNLIST_BATCH2_VISUAL_QA.md` were read from the owner's local workspace. Original reports, screenshots and measurements were preserved.

| Finding verified against the original evidence | Implemented fix |
| --- | --- |
| A4: Successful addition produces misleading no-match feedback | Match the full Library before excluding existing members. Show “All matching Library items are already in this list” after the last eligible match is added; reserve “No Library items match” for absent matches. Preserve the filter and make removed members eligible again |
| B4: Create/add forms dominate existing-list browsing | Initially collapse Create a list and Add from Library using native disclosures. Compact create/edit forms, retain labels/validation/error feedback, distinguish primary and Cancel actions, reset cancelled edits, and return focus after closing forms |
| B5: Custom List organization requires leaving Library | Reuse the lazy Media Detail picker directly on each Library card with unique labels/control IDs; keep the route, personal state and browsing preferences intact |
| D3: List picker still offers an already-completed add | Remember memberships confirmed by reads/add responses within the account session; label/disable satisfied choices and guard repeat submissions on Library and Media Detail. List removals restore eligibility; account/Library removal clears private knowledge |
| B3-L1: Library-card targets remain below 44px | Set status/rating selectors and Remove controls to minimum 44×44 CSS pixels; retain native controls, accessible names and focus treatment |

Nine new targeted tests in `tests/libraryListsUx.test.js` cover filtered-add/removal/re-add behavior, create/edit disclosures and validation, empty/filter/loading/error distinctions, all four card pickers, summary-request deduplication, duplicate/error feedback, membership invalidation/account separation, cancelled queued requests and computed CSS minimums/keyboard focus. Existing list-view tests now open the disclosures; Media Detail regressions assert that repeated successful/duplicate adds remain disabled. An existing Library test now targets Remove by class instead of assuming it is the only button.

Automated verification: `npm test` passed all **200 tests**; `npm run build` passed. No backend code/contracts or provider-search logic changed. Tests used fetch doubles and did not connect to or modify any database. No PHP/database integration tests were run.

Local preview and independent live-browser QA were **not completed**. The browser access host was unavailable; native Chrome access was stopped because the computer-use tool could not determine the browser URL confidently enough to enforce policy. The requested **320×740, 390×844, 768×1024 and 1440×900, Light/Dark** matrix remains unverified. Computed CSS minimums in jsdom are not rendered browser measurements. Cross-tab/device membership changes require refresh; unknown membership still uses the idempotent API. Batch 5 Undo and remaining D1 rating polish are deferred.

Staging workflow and API-health results are reported separately in the task delivery; local validation alone does not establish deployment success or public-launch readiness.

## Batch 4 D3 persisted membership follow-up — October 30

Baseline: `a25d10740dd18537e904070a0e57ff6e7eea6b1e`. Read the original `MYFUNLIST_BATCH4_LIVE_QA.md` inside the owner's `MYFUNLIST_BATCH4_LIVE_QA_EVIDENCE.zip` without extracting over or altering the evidence. That report held Batch 4 acceptance: 32/32 freshly loaded Library pickers offered already-satisfied membership, with the same offered-choice defect on TV Detail. B4 and the 120 B3-L1 target measurements passed; A4/B5 retained the report's coverage limitations.

Source investigation confirmed that picker initialization fetched only summaries. The in-memory membership map was populated by list-detail reads and local add responses, and unknown entries were interpreted as absent. The existing account-scoped, idempotent PHP Add endpoint preserved unique records but could not correct initial picker eligibility without an unnecessary POST.

Added authenticated, read-only `GET /api/v1/lists/memberships`: one ownership-scoped query per page, at most 500 ID pairs, numeric keyset pagination, no media metadata and no schema changes. Shared lazy hydration publishes only a complete snapshot. Library/Media Detail pickers wait for success, label/disable satisfied choices, retain eligible alternatives, and offer explicit retry after failure. Account generations, mutation revisions and shared per-pair Add promises protect stale state and duplicate requests. Remaining open pickers recover after Library removal resets private caches. Existing identities, status/rating fields and mutation contracts are unchanged.

Automated verification: all **227 frontend tests** and production build passed; changed PHP files passed syntax checks; Composer strict validation, database-safety checks, non-destructive provider/API suites passed. The new membership API suite has **22 assertions** using the real bootstrap/session route pipeline and a storage double that rejects all writes and unrelated reads. No database-writing suite, migration or live provider request was run. Regressions cover persisted membership on all four Library types and Media Detail, loading/failure/retry, eligible alternatives, removal/reset/re-add, pagination, concurrent consumers, account transitions, stale mutations and duplicate POST suppression.

No new local preview or independent live-browser QA was performed for this fix. Rerun the report's refresh/picker matrix and its uncovered error/retry/request checks before accepting Batch 4. Other browser tabs/devices still require refresh; pagination is not a cross-request database snapshot under external concurrent writes. Deployment verification is reported separately in the delivery.
