# Tier Lists frontend integration QA

The review branch starts from `fa88d109db5863353684f3e5d316aac1277c61da`. This report covers the authenticated Vue shell and the PHP API contract from the client side. Headless checks used Windows, Node.js 24.15.0, Playwright 1.64.1 and Chromium Headless Shell 156.0.8078.4. The loopback server served synthetic accounts, media and artwork. Playwright intercepted API requests, including all provider traffic.

## Automated checks

| Check | Result |
| --- | --- |
| `node --test tests/tierListsIntegration.test.js` | 16 passed, 0 failed, 0 skipped |
| `npm test` | 433 passed, 0 failed, 13 existing Windows platform skips |
| `npm run build` | Passed with the default gate off. The editor and standalone preview bundles were absent. |
| `VITE_TIER_LISTS_ENABLED=true` with `npm run build -- --outDir test-results/tier-lists-build` | Passed. The editor used the API service and its bundle excluded prototype fixtures and simulation controls. |
| `npm run test:ui -- tests/ui/tierListsIntegration.spec.js --global-timeout=600000` with `MYFUNLIST_UI_TEST_TIER_LISTS=true` | 17 passed, 0 failed, 7 intentional skips for the default-off gate check, viewport project assignments and desktop-only drag |
| Default-off headless run of `tierListsIntegration.spec.js`, `tierListPrototype.spec.js`, `openLibrary.spec.js` and `openLibraryLibrary.spec.js` | 31 passed, 0 failed, 31 intentional skips. The two gate checks passed. The remaining passes covered the standalone prototype and existing Open Library flows. |
| Composer `test:providers`, `test:api` and `php backend/tests/database_safety.php` | Passed on PHP 8.2.12. The API suite includes 164 Tier Lists board assertions and 126 preparation assertions. |

The browser checks covered overview pagination, a retry with the original creation key, local Library selection, explicit Discover preparation, retry timing, Open Library exact Edition renewal, ignored responses after picker closure, successful and uncertain saves, revision conflicts, session expiry, desktop drag, ordered tier edits and keyboard Move focus return. The fixture accepted only its declared local and mocked requests. It exercised expected 401, 409, 429 and 503 responses. The passing run reported no unexpected requests, failed requests, console errors or page errors.

The first iterations exposed ambiguous browser locators and compatibility with existing Node test harnesses. The final results include the corrected checks. Playwright warned that `FORCE_COLOR` overrides `NO_COLOR`. Some unit test Vite servers reported an occupied HMR port, and their assertions passed. The PHP suites deliberately log failures from provider and storage doubles as part of their negative-path coverage.

## Inspected screenshots

| Viewport | Light editor | Dark editor | Additional view |
| --- | --- | --- | --- |
| 1440 × 900 | [Light](desktop-1440-light-editor.png) | [Dark](desktop-1440-dark-editor.png) | [Board overview](desktop-1440-light-overview.png) |
| 768 × 1024 | [Light](desktop-768-light-editor.png) | [Dark](desktop-768-dark-editor.png) | |
| 390 × 844 | [Light](mobile-390-light-editor.png) | [Dark](mobile-390-dark-editor.png) | [Library picker](mobile-390-light-picker.png) |
| 320 × 740 | [Light](mobile-320-light-editor.png) | [Dark](mobile-320-dark-editor.png) | [Move dialog](mobile-320-dark-move.png) |

- The desktop overview shows the board's saved item count and allowed media types. The editor keeps the rank rails readable in both themes. Same-title items have distinct type labels, landscape artwork retains its aspect ratio, and Move actions line up across the row.
- At 768px, the header wraps onto a second row without overlapping the board controls. The missing-cover placeholder fits its card and the long book title stops after three lines.
- The 390px editor uses three cards across and a five-slot mobile bar. The Library picker fits the viewport and shows search, type filtering, existing membership and the Done action.
- The 320px editor uses two cards across. The Move dialog displays the full long title, clear destination and position controls, and stacked actions within the viewport.

The summary endpoint provides saved item counts and allowed types. Preview artwork and Unranked counts are unavailable on the overview. The browser run used synthetic data and did not cover live login, live provider behavior, physical touch or screen-reader output. This review did not use a database, deploy the frontend or activate Tier Lists.
