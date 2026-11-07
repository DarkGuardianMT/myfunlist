# Complete Cinematic redesign review

7 November 2026. Branch: `review/cinematic-complete-redesign`; baseline: main `c74eb91c9bcfe58307de40ab81a4ffe00d2c19d8`; frontend checkpoint: `525084f2bbb99bc3fa2887f123dfc940964274c0`. All requested frontend pages are included in this one candidate. This evidence is temporary pending owner review; preserve historical reports and remove only this directory at an approved merge unless permanent retention is authorized.

## Execution and isolation

Node 24.15.0, Playwright 1.64.1, Chromium headless shell 156.0.8078.4. Dedicated loopback-only Vite server, fresh ephemeral contexts, synthetic accounts/catalogues/artwork and exact API mocks. No request was forwarded to an account, provider, backend or database. The Open Library build gate stayed false; only the existing enabled-component harness supplied synthetic Work/Edition responses. Unexpected traffic, console/page errors and unexpected HTTP/network failures fail the tests.

| Check | Result |
| --- | --- |
| Baseline `QA_COMPLETE_BASELINE=true npm run test:ui -- --grep "Complete visual"` | 4 passed, 4 intentional light baseline skips; dark baseline captured before app changes |
| `npm test` | 343 passed, 12 existing Windows platform skips, 0 failed; 355 total |
| `npm run build` | Passed; 109 modules; synthetic harness excluded |
| `npm run test:ui` | 48 passed, 0 failed, about 2.4 minutes |
| `npm run test:ui -- --grep "Complete responsive review"` | 2 passed after strengthening actual-theme assertions on every route; about 60 seconds |
| `npm run test:ui -- --grep "Books design\|Open Library"` | 18 passed after the final tablet expanded-disclosure CSS refinement; build repeated successfully |
| Documentation/internal links and scope checks | Passed; retained historical findings/evidence preserved; backend/provider/security/configuration scope unchanged |
| `git diff --check` | Passed |

The focused responsive rerun corrected an inspection finding in the test harness: its initialization script had reset narrow/tablet captures to dark despite their light filename. The final test switches through the real theme control and asserts the actual theme after every navigation. The two width-specific light images below come from that corrected run. All main dark/light visual captures already had distinct rendered themes.

Coverage includes Home search handoff/account shelves, all four searches, Google default, provider filters/cache/history and manual Retry; Open Library Work/Edition identities, read-only preview, tester/error/cooldown gates; Library add/status/rating/Undo, density persistence and title filters; private list create/edit/add/remove/delete and real membership artwork; login/registration, display name/password validation/change, logout/private-state reset; mobile menus, keyboard disclosures/focus and reduced motion. Responsive geometry covers 1440, 390, 768 and 320px. The extra width review exercises every major surface, all four details, long titles and absent artwork in both themes.

## Visual inspection and measurements

Baseline and final desktop/mobile contact sheets were opened and inspected, alongside full-size examples of Library, Discover, game Detail, account forms, list editing and menus. Selected PNGs below retain original browser captures; the two light overview sheets are labeled thumbnail composites of those captures. Desktop captures are full-page at 1440×900; ordinary mobile captures use 390×844 viewport crops, including separately scrolled content. Width-specific captures use a 900px-high viewport. Fixed navigation is shown in its real viewport position.

Library now has full-width artwork above identity/tracking, rather than small jackets beside dense appended controls. The baseline book/poster rules were 88/96px wide; Comfortable wells are approximately 204px at 1440px. Final Google cover measurements are 202×304px desktop and 169×255px mobile; Open Library inset image measurements are 189×291px and 156×242px. Native proportions remain contained. Mixed Libraries keep aligned portrait wells; the Games filter uses landscape wells. Comfortable becomes one larger column at 320px; Compact remains two.

Inspection caught and resolved desktop List Detail overflow from scoped artwork sizing, excessive mobile filter stacking, uneven discovery actions, mobile auth word spacing and restored Undo focus inside a closed disclosure. The final expanded Open Library record also spans the grid at tablet widths, preserving readable technical metadata. Missing-artwork and long-title fixtures remain explicit; titles are complete in the DOM/details. Final selected views show no horizontal clipping or distorted covers. Long pages scroll normally behind fixed mobile navigation, with bottom spacing allowing final actions to be reached.

## Screenshot index

| Area | Before | Final evidence |
| --- | --- | --- |
| Library desktop | [Baseline](desktop-before-complete-library-comfortable-dark.png) | [Comfortable](desktop-after-complete-library-comfortable-dark.png), [Compact](desktop-after-complete-library-compact-dark.png), [List](desktop-after-complete-library-list-dark.png), [Light](desktop-after-complete-library-comfortable-light.png) |
| Library mobile | [Baseline](mobile-before-complete-library-comfortable-dark.png) | [Comfortable content](mobile-after-complete-library-comfortable-dark-content.png), [Compact](mobile-after-complete-library-compact-dark-content.png), [List](mobile-after-complete-library-list-dark-content.png), [Light content](mobile-after-complete-library-comfortable-light-content.png), [320px light](mobile-after-complete-library-320-light.png), [768px light](mobile-after-complete-library-768-light.png) |
| Discover | [Books baseline](desktop-before-complete-discover-book-dark.png) | [Books](desktop-after-complete-discover-book-dark.png), [Movies](desktop-after-complete-discover-movie-dark.png), [TV](desktop-after-complete-discover-tv-dark.png), [Games](desktop-after-complete-discover-game-dark.png), [Mobile Books](mobile-after-complete-discover-book-dark-content.png) |
| Open Library | Baseline inspected locally | [Cover-first Works](desktop-after-complete-discover-open-library-dark.png), [Mobile results](mobile-after-complete-discover-open-library-dark-content.png), [Expanded selected Edition](mobile-books-edition-details-dark.png) |
| Detail | Four baseline types inspected locally | [Book](desktop-after-complete-detail-book-dark.png), [Game](desktop-after-complete-detail-game-dark.png), [Mobile Book](mobile-after-complete-detail-book-dark.png); Movie/TV appear in light overview |
| Lists | Baseline inspected locally | [Overview](desktop-after-complete-lists-dark.png), [Detail](desktop-after-complete-list-detail-dark.png), [Mobile Detail](mobile-after-complete-list-detail-dark.png), [Editing](mobile-after-complete-list-edit-dark.png) |
| Account | Baseline inspected locally | [Profile](desktop-after-complete-profile-dark.png), [Login](desktop-after-complete-login-dark.png), [Mobile Register light](mobile-after-complete-register-light.png) |
| Home | Baseline inspected locally | [Account](desktop-after-complete-home-account-dark.png), [Anonymous mobile](mobile-after-complete-home-anonymous-dark.png) |
| Navigation/errors | Existing baseline menus inspected | [Desktop account](desktop-cinematic-account-menu-dark.png), [Mobile account](mobile-cinematic-account-menu-dark.png), [Mobile anonymous menu](mobile-after-complete-mobile-menu-dark.png), [Recoverable Library error](mobile-after-complete-library-error-dark.png) |
| All pages, light | Dark baseline comparison | [Desktop overview](desktop-after-overview-light.png), [Mobile overview](mobile-after-overview-light.png) |

## Warnings and limits

An initial PowerShell CSS write used an incompatible encoding; it was converted to UTF-8 before the passing build. A leftover test-only Vite process from that failed start was identified by its exact command and stopped before a fresh isolated run. New workflow assertions initially used an incorrect login destination, a remove-label pattern and unscoped account/alert selectors; they were corrected to existing behavior. Early cover prominence and List Detail overflow checks failed and drove the visual fixes above. There are no unresolved reproducible automated failures. Existing `NO_COLOR`/`FORCE_COLOR` and unit mock-component warnings are nonblocking.

This is mocked local browser verification, not live-provider quality, real auth persistence, full WCAG acceptance, screen-reader or physical-device/native-picker testing. Attribution images are mocks. No staging deployment or independent live-browser review was performed. No backend, database, API limits, environment or hosting settings changed. Unsupported recommendations, social features, bulk actions, Open Library saving and complete alternate-edition browsing remain unavailable; the prototype's sample records were not copied into the application.
