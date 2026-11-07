# Discover navigation fix review

Branch: `review/discover-navigation-fixes`. Base: main `d4f61b2a80142c76ead913eec9833d93196472c8`. Scope: bounded search restoration, safe Detail return navigation, explicit Books URLs/Movies default, and a sanitized RAWG diagnosis. No UI redesign, backend runtime/API/configuration, database, provider-limit or hosting change.

## Verification

| Command/check | Final result |
| --- | --- |
| `npm test` | 357 passed, 12 existing platform skips, 0 failed (369 total) |
| `npm run build` | Passed, 116 modules |
| `npm run test:ui` | 64 passed, 0 failed, no retries; 3.8 minutes |
| Focused failed RAWG capture/flow rerun | 2 passed; screenshot framing only, no application changes |
| `composer --working-dir=backend run test:providers` | All six provider suites passed; no live provider/database I/O |
| `composer --working-dir=backend run test:api` | All four non-destructive API suites passed |
| `php -l backend/tests/discovery.php` | Passed |
| Markdown/internal links, historical records and protected-scope comparison | Passed |
| `git diff --check` | Passed |

The existing platform skips require local Linux/POSIX fixture execution; no new regression was skipped. `NO_COLOR`/`FORCE_COLOR` warnings are nonblocking. PHP negative fixtures deliberately emit sanitized failure-category messages, including storage/database failures; these are expected injected cases, not observations about a live database.

The new regressions exercise successful/empty/error restoration through Library and Detail after cache expiry; pending requests during and after unmount; manual refresh/retry and new queries; stale responses; successful/error snapshot bounds; Books canonicalization/default/provider gates; keyboard Back from Discover, Library and a specific List; safe refresh/direct-entry fallback; and private-origin invalidation after logout/account changes. Existing unit/browser coverage continues to exercise loading/errors, Google/Open Library separation, filters/history, account isolation, Custom Lists, removal/Undo, themes and density modes.

Tests use Node 24.15.0 and Playwright 1.64.1 / Chromium headless shell 156.0.8078.4. Desktop is 1440×900; mobile is 390×844 touch emulation. Existing responsive tests also exercise 320/768px and both themes. All browser contexts are fresh, loopback-only and use synthetic provider, artwork and account responses. Every unregistered mutation/unexpected external request is blocked; unexpected browser/console/network events fail the shared fixture. Open Library stays disabled in ordinary application tests, with zero pilot requests. Opt-in enabled-component tests use intercepted responses only.

PHP provider/API suites use HTTP/storage doubles and disposable fixture files, without live provider/database I/O. `composer test`, migrations and database integration suites are not run.

## RAWG observation, separate from tests

One bounded staging game search returned HTTP **503**, code **provider_unavailable**, in **8,207ms**. No retry or direct upstream RAWG request was made. Only the HTTP status, allowlisted error code and elapsed time were retained; no secrets, full upstream URLs or raw response bodies were exposed.

The timing is consistent with the existing eight-second backend timeout. Missing credentials, upstream auth/quota/5xx and cURL DNS/connect/TLS/timeout failures all map to the same response, so this observation cannot establish key validity, exact upstream status or an outage. Existing logs record an already mapped status. Private staging configuration/lower-level telemetry were unavailable. The [diagnosis](../../../docs/DISCOVER_NAVIGATION_FIX.md#rawg-established-facts-and-uncertainty) records the evidence and limits. The unavailable message/manual Retry remain; no claim of RAWG recovery is made.

## Findings and corrections

The old immediate mount watcher retried failed searches because only successful results were cached; expired successful/empty results also refetched. A separate 20-entry LRU browsing snapshot now restores those outcomes without provider traffic. Pending completions are remembered independently of component lifetime. Explicit Search/Retry refreshes while identical pending calls remain shared. Private data is not included in these public snapshots.

Detail Back now names the actual internal origin and uses an allowlisted route rather than arbitrary browser history. Library/List origins clear on account transitions; refreshed/direct Detail safely falls back to Discover. Existing scroll restoration includes List routes and waits for rendered data. Movies and Books/provider routing are separately asserted.

An early new browser assertion measured mobile scroll before focusing an offscreen title link; keyboard focus legitimately scrolled it before navigation. The regression now records the actual focused departure position and checks exact restoration. A broad run also exposed an incorrect Movie-specific CSS selector in an adapted Home test; it now asserts the actual shared result cards and the explicit movie URL. That initial run reached the existing global suite budget while other checks were running. No timeout/retry configuration was changed and no assertion was skipped; final verification runs the complete browser suite on stable code without concurrent build/unit work.

## Visual evidence

All ten selected screenshots below were opened and visually inspected. Back labels are readable and fit the existing desktop/mobile composition. Native links remain keyboard-operable. The mobile RAWG view was retaken with Retry centered so both the error and action are visible above fixed navigation. Books retains the provider choice and legacy field/language selections. No obvious clipping or horizontal overflow was found in the selected views; automated layout checks and the full dark/light suite also passed. This is a functional navigation change, with no new UI design.

The screenshots contain fictional data only and use the fixture's light theme; the full suite separately exercises both themes. Desktop captures are full-page; mobile captures show the real viewport and fixed navigation. This evidence checks the Back labels/links, explicit Books search and honest RAWG error/manual Retry presentation. It does not establish live provider quality, physical-device/screen-reader acceptance, backend persistence or staging deployment.

| View | Desktop | Mobile |
| --- | --- | --- |
| Detail from Discover | [Screenshot](desktop-discover-navigation-back-discover.png) | [Screenshot](mobile-discover-navigation-back-discover.png) |
| Detail from Library | [Screenshot](desktop-discover-navigation-back-library.png) | [Screenshot](mobile-discover-navigation-back-library.png) |
| Detail from a specific List | [Screenshot](desktop-discover-navigation-back-list.png) | [Screenshot](mobile-discover-navigation-back-list.png) |
| Explicit Books with legacy filters | [Screenshot](desktop-discover-navigation-books.png) | [Screenshot](mobile-discover-navigation-books.png) |
| Retained RAWG error and manual Retry | [Screenshot](desktop-discover-navigation-rawg-error.png) | [Screenshot](mobile-discover-navigation-rawg-error.png) |

## Delivery

The task-specific direct-main exception required a narrow, low-risk change. Shared search lifecycle, category/provider routing and account-scoped return context make a review PR appropriate. This task opens one PR; main is not pushed, merged or deployed. Branches and historical evidence/design docs remain intact. New review evidence remains available until review and requires task-specific cleanup before any approved merge.
