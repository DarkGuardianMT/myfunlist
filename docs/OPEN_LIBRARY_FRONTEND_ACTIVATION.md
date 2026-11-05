# Open Library frontend activation review

Reviewed 5 November 2026 from `e640958`, on `review/open-library-frontend-qa`. Recommendation: **NOT READY to activate**. The mocked frontend checks pass after fixing cooldown loss on catalogue remount. This is a plan only; deployment configuration and private flags remain unchanged.

## Staging activation handoff

The later `review/open-library-staging-activation` candidate starts from deployed main `fe6f193`. The owner authorizes a limited staging activation, squash merge and deployment only after the essential backend checks pass. Completed migration 005, CLI/HTTP smoke tests, frontend/headless QA and Google regression checks remain credited; this handoff does not require repeating historical tests.

The candidate changes only staging deployment configuration and its assertion helper/tests/documentation. One explicit job-level `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=true` supplies the staging build and verifier. Enabled requires queryless 422 `validation_error`; rollback to `false` requires 404 `not_found`. Missing flags, the opposite state, malformed JSON and 429/503 fail closed. Normal `.env.example` and isolated headless configuration remain false; provider budgets, coordinator, caching, identities and Library behavior are unchanged.

**Activation is currently blocked, with no backend change, merge or deployment performed.** The owner has answered that registration/use-case confirmation and safe control of anonymous API traffic are not yet confirmed. The SSH alias `staging` exists only in GitHub Actions' `Configure SSH` step; there is no confirmed local SSH connection or connected Hostinger dashboard. That deployment connection does not itself provide a supported pre-merge backend configuration operation. No credentials are requested in chat or exported from Actions.

Required handoff before enablement: confirm registration/use-case suitability and safe traffic control, then provide an authorized private backend-operation path. Through that path, privately check existing migration/state/runtime access, User-Agent/contact and stable secret validity, existing request limits and a working emergency stop. Preserve every other `.env` value; do not run migrations, historical smoke suites or state repairs.

Once those prerequisites are confirmed, keep the deployed frontend off while enabling only `OPEN_LIBRARY_PILOT_ENABLED=true` and `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED=true` on staging. Verify health 200 and queryless pilot 422; then make one `The Hobbit` search and validate Work/selected Edition data. Allow at most four real metadata searches across the entire activation, one in flight, at least fifteen seconds after each response, with no automatic provider-error retries. Count any frontend validation search in that same budget.

Only after backend success, squash merge the reviewed activation PR and monitor the exact staging workflow commit. Verify the deployed Open Library default, book results, separate Google option and absence of console-breaking errors without Library mutations. On a critical failure, disable the backend immediately; restore the staging job flag to `false` and its strict 404 assertion through approved rollback deployment. Preserve MySQL state and reservations. No real-provider availability or completed activation is claimed by this candidate.

Preparation checks on Node 24.15.0 passed: `npm test` 340 passed, 12 existing platform skips, zero failures (352 total); `npm run build` with the staging flag true passed (95 modules); database-independent `test:providers` and `test:api` passed, including Open Library adapter/admission/storage coverage. Three deployment regressions check strict flag/status/code matching, safe CLI failure and the single shared workflow flag/queryless probe. Static analysis of the built asset confirms the enabled component/default and explicit Google override; existing mocked Google view/service tests remain functional. No headless QA rerun, live metadata search, backend flag change or deployment was performed. Normal example/headless flags remain false, and backend/provider/Library source is unchanged.

## Evidence boundaries

The owner reports successful real Hostinger CLI/HTTP backend smoke tests, migration 005 applied, disabled backend pilot flags and working Google Books on staging. Accept these as supplied context; this task did not repeat or independently inspect those host tests. The older MySQL implementation report's unverified-host statements describe its historical execution, not a rejection of the owner's later results.

This review ran only synthetic frontend/unit tests and isolated headless Chromium. No staging/production browser, real account, database, provider search, migration or Hostinger setting was accessed. Provider documentation was read separately for policy review. The owner authorized removing this task's temporary report and eight screenshots for final merge review; the important findings, test record and limitations are retained below. All other historical QA evidence is preserved.

## Retained frontend QA findings

| Area | Finding / result |
| --- | --- |
| Cooldown fix | Previously, receive 429/503, switch to Google, then return before Retry-After expires: component-local state disappeared and another pilot request was sent. A regression reproduced two requests instead of one. The service now retains the deadline across SPA remounts and restores disabled controls for the remaining time. Expiry enables manual actions without sending a request. Busy waits at least two seconds; 429/general 503 wait at least sixty seconds and respect longer bounded Retry-After, including a tested ninety-second value. |
| Disabled gate / Google | Ordinary application smoke tests keep the build flag false and require zero pilot requests. Separate Google search, language caveat, attribution placement, detail and return navigation pass with synthetic data. Enabled-component tests neither merge results nor silently fall back; catalogue switching resets provider-specific filters. |
| Work / Edition | Work and Edition IDs, publication dates, cover provenance and catalogue links remain distinct. Missing metadata is shown honestly. Preview is transient and read-only, with no Library Add action or write; missing/conflicting/ambiguous selections remain ineligible. |
| Search / states | General/Title/Author/ISBN, checksum validation, Any/English/Dutch/Turkish and preferred/strict behavior pass. No per-keystroke requests. Loading, empty/omissions, invalid input, malformed responses, unactivated 404, busy 503, 429 and unavailable 503 remain distinct. |
| Cache / stale | Successful/empty caching, isolated filter keys, concurrent deduplication, five-minute expiry, twenty-entry eviction and cached history navigation pass. Late responses cannot replace newer filters or switched providers; cache-generation resets reject late cache/cooldown writes. |
| Layout / accessibility | All eight original desktop/mobile Light/Dark screenshots were visually inspected: no obvious horizontal overflow, identifier clipping or action/navigation overlap. Mobile images were scrolled viewport crops. Native labels/disclosure, status/alert regions, keyboard preview and additional 320px/768px layout plus 44px card-action heights were checked. This is not screen-reader, contrast-audit or physical-device acceptance. |
| Nonblocking copy | Existing singular-result text says “1 Works shown”; no unrelated presentation change was made. |

## Retained verification record

Original QA at `527174c11122ed68d2274e712bf2ee40fed0a292` used checksum-verified official Node 24.15.0 in a task-specific temporary directory, without changing system Node or dependencies. All nineteen focused Open Library service/view tests were included in the complete suite.

| Check | Original QA result |
| --- | --- |
| `npm test` | 349 total: **337 passed, 12 skipped, 0 failed** (34.3s). Skips are existing Linux/POSIX diagnostics on Windows. |
| `npm run build` | **Passed**, 95 modules (1.50s). Test HTML/harness identifiers absent from production assets; normal frontend gate absent/false. |
| `npm run test:ui` | **14 passed, 0 failed** (23.2s), seven per desktop/mobile project; Playwright 1.64.1, Chromium headless shell 156.0.8078.4. No unexpected browser/network events in the final run. |
| Documentation/artifacts | 39 internal link targets and Markdown fences checked; `git diff --check` passed. Eight inspected PNGs used synthetic metadata/artwork and anonymous UI only, totaling 515,272 bytes. |

Browser isolation uses a fresh loopback Vite server at `127.0.0.1:4179`, no private env files/backend proxy/persistent profiles, and fresh contexts at 1440×900 and 390×844. Ordinary application tests retain the disabled gate. A separate Vite-served test entry injects the existing component's `enabled` prop solely for mocked acceptance. All pilot, Google, session, detail, cover and branding responses are intercepted; unexpected external requests and all non-GETs are blocked. The test entry is excluded from the normal production build.

Earlier QA harness/environment failures were resolved before those final results: Windows process restrictions caused baseline teardown timeout after six passing assertions; only task-owned server processes were terminated and process permissions restored clean teardown. The initial enabled harness had console failures and ambiguous alert/loading locators, corrected by a Vite-served entry and scoped locators. A paused browser clock removed real-time drift at the one-millisecond cooldown boundary. No visible-browser fallback or network-assertion suppression was used. The remaining runner warning was `NO_COLOR` ignored because `FORCE_COLOR` is set.

Automated tests/build and local mocked headless browser QA were performed. A separate manual preview, staging deployment, independent live-browser QA, real provider availability/relevance, actual branding delivery/CSP, screen-reader and physical-device testing were not performed. No PHP/database tests were needed or run for these frontend-only changes. The host smoke success and migration status above remain owner-supplied evidence.

## Final merge-review preparation

**READY FOR MERGE REVIEW with activation disabled.** Fetch confirmed `origin/main` remains `e640958043e5c4e2ccf1ed2f6e5db704aa777db1` and is an ancestor of this review branch. Review of the cooldown change and isolated test harness found no obvious regression or security issue; this is a focused review, not a comprehensive security audit.

Cleanup removes only this task's report and eight PNGs. SHA-256 checks confirm all four existing historical evidence files remain unchanged. The cleanup changes no application/test code. The final branch diff against main contains only the intended two frontend files, six test/harness files and four documentation files; no QA artifacts, backend, schema, dependency, workflow or activation-configuration changes remain.

Checks repeated after cleanup using Node 24.15.0: `npm test` **337 passed, 12 existing skips, 0 failed** (349 total, 15.95s); `npm run build` **passed**, 95 modules (1.99s); isolated headless `npm run test:ui` **14 passed, 0 failed** (24.6s), with zero unexpected browser/network events. New browser output stayed in ignored `test-results/`; no replacement review evidence was exported and no new visual-acceptance claim is made. Original screenshot inspection is recorded above.

Documentation checks passed for 21 remaining Markdown files, 120 local links and 15 fragments; no link points to deleted evidence. Markdown fences and `git diff --check` passed. The normal production frontend gate is absent/false, backend example flags remain false, and test harness identifiers are absent from production assets. Host settings were not accessed or changed. The remaining `NO_COLOR`/`FORCE_COLOR` warning is runner-only.

Remaining activation concerns below are separate from merge-review readiness. Neither merge nor deployment is authorized here; merging into `main` triggers the existing staging deployment even while Open Library stays disabled.

## Exact switches and deployment checks

| Location | Current behavior | Future separately approved change |
| --- | --- | --- |
| `src/domain/bookProviders.js` | Enabled only when `import.meta.env.VITE_OPEN_LIBRARY_DISCOVER_ENABLED === 'true'`; absent/false defaults to Google. An explicit Open Library URL shows the blocked view with zero pilot requests. | Build with the literal public value `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=true`. Rebuild/redeploy assets; changing PHP configuration alone cannot change this bundled value. The implicit default becomes Open Library; explicit `provider=google-books` remains Google. |
| `.github/workflows/deploy-staging.yml`, staging job | The activation candidate supplies one job-level `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=true`, inherited by the build and verifier; it is not deployed yet. `.env.example` stays false. | Merge only after the private backend checks and traffic/policy prerequisites pass. The flag is public configuration, never a secret. |
| Backend environment | `OPEN_LIBRARY_PILOT_ENABLED` and `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED` require exactly `true`; valid `OPEN_LIBRARY_USER_AGENT` and stable private `RATE_LIMIT_SECRET` are also required. | Owner verifies migration 005, shared database/runtime permissions, contact/secret and all operational evidence before authorizing private flag changes. Do not rerun migration merely to activate the UI. |
| Workflow `Verify expected Open Library pilot state` | The candidate requires exactly 422/validation_error when its build flag is true; false requires exactly 404/not_found. Missing/invalid flags or mismatches fail. | Keep the queryless GET: current backend admits the client and validates before reserving provider HTTP. This consumes one client admission but sends no upstream search. Do not accept both states or treat 429/503 as activation success; stop and investigate without polling. |
| Workflow health and regression checks | Frontend test/build, PHP syntax/safety/provider/API suites, then JSON health `data.status=ok`. | Preserve these checks. Separately repeat isolated headless QA and inspect the approved artifact's flag/default behavior. A successful build or 422 is not a real-provider acceptance result. |

## Remaining activation blockers

1. Attach and review the owner's Hostinger evidence against the [current MySQL requirements](OPEN_LIBRARY_MYSQL_BUDGET.md#migration-and-activation-requirements): one authoritative shared InnoDB coordinator, runtime SELECT/UPDATE, durable commits/stable time, consistent workers/secret/contact, shared egress, actual client-IP behavior and uncertain-reservation recovery. A smoke-test success alone does not prove every item; mark each evidenced or still open rather than repeat completed diagnostics.
2. Owner records application registration/use-case suitability, current policy review and managed contact ownership. The [Open Library guidelines](https://openlibrary.org/developers/api), re-read 5 November 2026, request registration, identification and caching for human-driven discovery and restrict bulk/high-traffic backend use. No registration or policy approval is established here. Broader Google/metadata rights review remains owner work; [Google branding guidance](https://developers.google.com/books/branding) still requires attribution and prominent links. Mock graphics cannot verify actual branding delivery/CSP.
3. Review this branch and its retained QA findings, then explicitly authorize the exact staging pilot scope, private settings, frontend build and replacement workflow assertion. Merging/pushing to `main` triggers staging deployment; neither merge nor deployment is authorized by this review.
4. Define a small human-operated staging acceptance sample and stop criteria. Real relevance, modern-title/English/Dutch/Turkish coverage, content-language judgments, real cover/branding delivery, physical devices and screen-reader acceptance remain unverified. No live calls are authorized in this task.

## Safe future sequence and rollback

1. Keep both gates off while reviewing evidence and preparing the exact release and rollback artifacts. Confirm explicit Google URLs and existing saved Google records remain available. This task's temporary QA evidence has been removed at the owner's request for merge review; preserve all other historical evidence.
2. After separate approval, prepare the state-specific workflow check and enabled frontend build in a reviewed change. Schedule the private backend change and deployment together; keep frontend exposure off until the backend prerequisites are accepted. Use no automatic provider search in CI. Verify the actual workflow result and HTTPS health plus the approved queryless pilot state; do not infer deployment success from local checks.
3. Only under the pilot's separate authorization, let designated humans perform bounded read-only searches. Keep the existing five-per-minute client admission and shared provider spacing; busy/429/503 mean wait and manual retry, never polling or provider fallback. Record sanitized findings. No Add to Library, alternate-edition crawling or new persistence identities.
4. On unexpected provider/permission/identity/language behavior, disable `OPEN_LIBRARY_PILOT_ENABLED` first and rebuild/redeploy with `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=false`, restoring the workflow's strict disabled 404/not_found assertion. Verify Google explicitly and by default, and zero browser pilot requests. Existing enabled assets can remain in old tabs, so the backend gate is the immediate stop. Disabling does not cancel already-dispatched workers; any uncertain reservation requires separately approved quiescence/recovery from the MySQL guide. Never clear budget state, rotate secrets or reset the database to recover a pilot.

The frontend cooldown now survives SPA catalogue switches and view remounts, including longer Retry-After values. It is deliberately in-memory per page: reloads/tabs do not share it, and backend admission remains authoritative. This review introduces no runtime configuration, backend, schema or deployment changes.
