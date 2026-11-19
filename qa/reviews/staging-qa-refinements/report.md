# Staging QA refinements review

19 November 2026. Branch: `review/staging-qa-refinements`; clean base: fetched `origin/main` at `9f58e47` (PR #14).

## Scope and supplied staging findings

The owner reports completed live staging QA: successful deployment, five working search flows, exact-Edition quick-add and authenticated Library/Lists, no critical/high defects, medium QA-01 and two related Open Library UX opportunities. This report documents the new branch's local automated and mocked headless checks, not a new staging/live-provider review.

QA-01 restored `inputQuery` from an earlier matching display snapshot even when Home explicitly submitted new text. Both Discover implementations lacked submission intent. The fix marks only the actual resolved navigation in memory, initializes input from submitted text and reuses matching results. Detail returns and browser history remain contextual; no draft/result/marker is persisted into URLs, history payloads or storage. Cancelled navigation cannot mark a later visit.

Unverifiable-Edition feedback now offers Search again. It renews the submitted query/options rather than the input draft, bypasses only the matching client cache, removes only that display snapshot and preserves pending-request deduplication/cooldowns. No save runs automatically. Returned eligible Editions require another explicit Add action; changed/missing Editions are never substituted into an old save. Server trust checks, TTLs, admission, authentication/CSRF and membership guards remain authoritative. Reliable local identity/title/language reasons are explained separately; server `edition_unavailable` remains generic because its exact cause is unavailable to the frontend.

## Executed checks

| Command/check | Result |
| --- | --- |
| `node --test tests/homeDiscoverSubmission.test.js tests/openLibrary.test.js tests/openLibraryView.test.js tests/browsingContext.test.js tests/discoverView.test.js` | Final **97 passed**, zero failed/skipped; exit 0 |
| `npm test` | Final **417 total: 405 passed, 12 existing Windows Linux/POSIX skips**, zero failed; exit 0; 15.5s |
| `npm run build` | Passed, 120 modules; exit 0 |
| `npm run test:ui -- tests/ui/stagingQaRefinements.spec.js` | Corrected focused run **14 passed**, 21.0s; clean exit 0; predates the two added cooldown/navigation scenarios |
| `npm run test:ui -- --global-timeout=600000` | Final **104 passed** (52 desktop + 52 mobile), 4.9 minutes; clean teardown and exit 0; includes all **18** new desktop/mobile refinement cases |
| Documentation file/heading links, full scoped diff review, `git diff --check` | Passed |
| Standalone PHP/provider/API suites and database tests | Not run: no PHP/backend/schema changes; no database access |

Node 24.22.1 was prepended to PATH; npm commands used the installed npm CLI invoked through that Node runtime. Playwright 1.64.1 used managed Chromium headless shell 156.0.8078.4, revision 1248. The ten-minute CLI budget did not change repository configuration.

Every browser test used a fresh ephemeral context, synthetic sessions/catalogue/artwork and exact mocked API responses. Unexpected external requests were blocked; browser/network error counters remained zero. The dedicated loopback-only Vite server read no private environment files and ran no PHP/database proxy. The ordinary Open Library gate stayed false; only the separate component harness enabled synthetic fixtures. No visible browser, persistent profile, real account, provider traffic, staging or production was accessed.

## Regression coverage

Home tests cover Movies, TV, Games, Google Books and enabled-default Open Library on desktop/mobile: old unsent draft, contextual Detail return for ordinary media, new matching Home submission, one provider request despite snapshot reuse, later draft/history restoration and different submitted queries. Existing suites retain category/provider/options/query isolation, direct URL/reload, empty/error, pending response and cleared-input behavior.

Open Library tests cover 409 rejection without automatic search/save; Search again with retained results beyond TTL and again within the client TTL; exact submitted query/field/language/matching options and unrelated drafts; matching/changed/missing returned Editions; exact subsequent explicit save identity; duplicate renewal suppression and loading; cooldown/manual Retry and no expiry-triggered request; late responses, unmount/remount deduplication and provider switching; query clear disabling recovery; other queries retaining the same Edition; existing anonymous/account/membership/CSRF/save cooldown guards. Eligibility checks preserve all prior requirements and distinguish only reliable local reasons.

Two existing explicit empty-result Search assertions now expect a genuine renewal request. Ordinary successful-empty caching, contextual cache reuse and request-deduplication assertions remain covered.

## Screenshots and actual inspection

All ten selected PNGs were opened and visually inspected. They total **700,245 bytes** and were copied without overwrite from the successful final full run's ignored output into this fresh review directory. Desktop base viewport: 1440×900 with full-page captures; mobile: 390×844 touch emulation with viewport captures; narrow eligibility: 320×900. Only fictional data/artwork is shown.

| Screenshot | Inspected finding |
| --- | --- |
| [Desktop Home submission, Light](desktop-home-submission-fixed-light.png) | Input and result label both show Inception; retained six-card row, artwork and actions align |
| [Mobile Home submission, Light](mobile-home-submission-fixed-light.png) | Inception input and controls fit above fixed navigation; cards lie below this frame and are asserted separately |
| [Desktop recovery, Light](desktop-stale-edition-recovery-light.png) | Unsent draft stays separate from submitted lantern label; readable unverifiable feedback and compact full-column Search again with Details closed |
| [Desktop recovery, Dark](desktop-stale-edition-recovery-dark.png) | Lime/soft action distinction, text contrast, exact-Edition note and optional Details remain readable |
| [Mobile recovery, Light](mobile-stale-edition-recovery-light.png) | Wrapped feedback, language, Add and 44px Search again fit above fixed navigation; card uses its existing compact column |
| [Mobile recovery, Dark](mobile-stale-edition-recovery-dark.png) | Action, feedback, Edition caveat and Details remain readable without navigation overlap |
| [Desktop renewed Edition, Dark](desktop-edition-renewed-dark.png) | Fresh eligible Add is enabled; old rejection/action removed; input draft and submitted label remain distinct |
| [Mobile renewed Edition, Dark](mobile-edition-renewed-dark.png) | Enabled Add, exact-Edition caveat and Details fit above fixed navigation; no automatic save feedback |
| [320px eligibility, Light](mobile-eligibility-320-light.png) | Specific missing-title explanation fits the first card; no unavailable save action, readable metadata/Details |
| [320px eligibility, Dark](mobile-eligibility-320-dark.png) | Same explanation and separators remain readable with no clipping or horizontal overflow |

Automated layout checks cover 320px, 390px and 768px, both themes for eligibility, and changed-Edition recovery results. The recovery action measures at least 44px high. No new horizontal page/control overflow, button misalignment or card-layout regression was observed. Mobile frames intentionally focus the input or action area; covers/later cards can be outside the viewport. Native desktop language-matching text remains truncated as in prior QA; no unrelated redesign was attempted. Synthetic artwork does not establish provider content quality or real branding delivery.

## Failure history and warnings

- The initial unit run retained an old assertion expecting explicit repeated Search to reuse a cached empty result. It was updated for deliberate renewal; ordinary cache coverage remains. The expanded unit run then found two invalid new fixtures: a game omitted its required platform list, and a missing Edition was returned under strict language matching. Both fixtures were corrected without relaxing validators. Final focused/full unit runs pass.
- The first focused headless run passed six and failed eight: second Home submissions omitted reselecting their media category after Home remounted. The test expected the prior category while Home correctly defaulted to Movies. Reselecting the category corrected the fixture; the next 14/14 run and final expanded 104/104 run pass. No application workaround, headed fallback or coverage removal was used.
- Expected negative-provider errors, existing unmatched-route/Vite WebSocket warnings, experimental mock-timer notices, `NO_COLOR`/`FORCE_COLOR` and PowerShell native-stderr wrapping, and Git LF/CRLF warnings occurred. No unresolved assertion or final teardown failure remains. Raw logs, traces/video, cookies, profiles and large reports are excluded.

## Changed files

- Frontend: `src/router/discoverSubmission.js`, `src/views/HomeView.vue`, `src/composables/useDiscoverSearch.js`, `src/services/openLibrary.js`, `src/components/OpenLibraryDiscover.vue`, `src/components/OpenLibraryWorkCard.vue`, `src/components/OpenLibraryEditionSave.vue`.
- Tests: `tests/homeDiscoverSubmission.test.js`, `tests/openLibrary.test.js`, `tests/openLibraryView.test.js`, `tests/ui/openLibrary.spec.js`, `tests/ui/stagingQaRefinements.spec.js`.
- Permanent documentation: `README.md`, `PROJECT_CONTEXT.md`, `docs/PROJECT_HISTORY.md`, `docs/DISCOVER_PROVIDER_STATE.md`, `docs/OPEN_LIBRARY_LIBRARY_INTEGRATION.md`.
- Temporary review evidence: this report and the ten linked PNGs. Historical evidence is preserved.

## Remaining release verification

No standalone combined PHP preview, new database/auth persistence test, live-provider trust-expiry check, new staging deployment or independent deployed-browser retest occurred. Physical-device and screen-reader acceptance remain open. Browser renewal cannot bypass server cooldowns/admission, force replacement of a still-valid shared server cache, fix conflicting metadata or guarantee eligibility. Generic 409 feedback cannot identify expiry versus missing/conflicting trusted metadata without expanding the backend contract.

Before release, independently retest QA-01 and stale-Edition renewal on an approved deployment, including exact identity and real account membership behavior. Merge/deployment require separate approval; merging to main triggers the existing staging workflow. Remove only this cycle's temporary evidence before an approved merge unless permanent retention is separately approved. Do not delete the branch without separate authorization.

To reproduce the selected captures without overwriting this evidence, use a new `QA_REVIEW_TASK` slug and run `npm run test:ui -- tests/ui/stagingQaRefinements.spec.js` under the same isolated harness. See [headless QA workflow](../../../docs/HEADLESS_UI_QA.md) and the retained [refinement history](../../../docs/PROJECT_HISTORY.md#staging-qa-refinements--19-november-2026).
