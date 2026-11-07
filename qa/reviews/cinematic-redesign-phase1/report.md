# Cinematic redesign Phase 1 — review evidence

7 November 2026. Branch: `review/cinematic-redesign-phase1`. Base: `f5fd153` (`origin/main`). Verified implementation: `1797055`. Candidate scope: visual foundation, navigation, Home and four-provider Discover. See the [prototype comparison and Phase 2 boundary](../../../docs/CINEMATIC_PHASE1.md).

## Executed checks

| Check | Result |
| --- | --- |
| `npm test` | 342 passed; 12 existing Windows/platform skips; 0 failed (354 total) |
| `npm run build` | Passed; 97 modules; 75.00 kB CSS / 225.30 kB JS before gzip |
| `npm run test:ui` | 32 passed, 16 desktop / 16 mobile; final supported-runtime run completed in about one minute |
| `git diff --check` | Passed |
| Retained editorial QA section comparison | Byte-for-byte unchanged against origin/main |

Final required commands used checksum-verified portable Node 24.15.0 without changing the system installation. Playwright 1.64.1; Chromium headless shell 156.0.8078.4. Selected screenshots below were retained from the preceding passing run on the identical source with the system Node 24.11.0; the full unit/build/browser checks were then repeated on supported Node 24.15.0. Chromium and viewport configurations were identical. The portable runtime/downloads and raw output remain ignored.

The shared fixture uses a fresh ephemeral context per test, a dedicated `127.0.0.1:4179` Vite server with no private environment/backend proxy and a false Open Library build flag. Every provider/artwork/account response is synthetic. Exact method/path mutation fixtures fulfill Library add/update/logout inside Playwright; no mutation is forwarded. Unexpected APIs, external traffic and unregistered writes are blocked. Ordinary app tests assert zero pilot calls; existing Open Library component tests opt into the separate synthetic harness only. No real sessions, profiles, accounts, providers, database or Hostinger data were used.

## Functional coverage

- Anonymous Home, all four category entries and Home search-to-Discover handoff; Google Books default.
- Books/Movies/TV/Games result layouts in dark and light; six fictional records each, including a long title and absent artwork. Full-width action geometry is asserted.
- Existing book field/language/provider controls, full-information disclosure, cache/history and detail return behavior.
- All four discovery loading/empty/error/retry behaviors; controlled Google network failure and TMDB/RAWG 503 responses. No automatic provider retry.
- Authenticated Home shelf, rating/status labels, loading failure/retry/empty state, account menus, Escape/focus and logout clearing private Home content.
- Discover Add to Library sends identity only; persisted UI membership; Detail and return; existing Library status/rating updates; Remove then Undo preserves state without sending DELETE.
- Desktop top links; five labeled mobile destinations; mobile anonymous registration/account menu; both theme directions and stored light preference after reload.
- Existing Open Library Work/Edition, preview-only selection, languages, cache, stale results, authentication guidance, cooldown/manual retry and disabled-gate regression suite.
- No horizontal overflow and main controls within viewport: primary 1440×900 desktop / 390×844 mobile, plus 320px and 768px Discover and 320/768/1024px Home checks. These are emulated viewports, not physical-device acceptance.

The network fixture recorded zero unexpected requests, unplanned failed requests, unexpected HTTP failures, console errors or uncaught page errors in passing tests. Deliberate synthetic failure responses are separately expected.

## Screenshots

Desktop images are full-page captures. Mobile images show the actual scrolling viewport with fixed navigation; content outside that crop remains scrollable. Artwork, names and account identity are fictional QA fixtures, not production catalogue content. The Google attribution is a labeled mock and does not establish live branding delivery.

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Home, Cinematic dark | [Desktop](desktop-cinematic-home-dark.png) | [Mobile](mobile-cinematic-home-dark.png) |
| Home, light | [Desktop](desktop-cinematic-home-light.png) | [Mobile](mobile-cinematic-home-light.png) |
| Account Home shelf | [Desktop](desktop-cinematic-home-account-dark.png) | [Mobile shelf crop](mobile-cinematic-home-account-dark.png) |
| Discover Books, dark | [Desktop](desktop-cinematic-discover-book-dark.png) | [Mobile results](mobile-cinematic-discover-book-dark.png) |
| Discover Movies, dark | [Desktop](desktop-cinematic-discover-movie-dark.png) | [Mobile results](mobile-cinematic-discover-movie-dark.png) |
| Discover TV, dark | [Desktop](desktop-cinematic-discover-tv-dark.png) | [Mobile results](mobile-cinematic-discover-tv-dark.png) |
| Discover Games, dark | [Desktop](desktop-cinematic-discover-game-dark.png) | [Mobile results](mobile-cinematic-discover-game-dark.png) |
| Discover Books, light | [Desktop](desktop-cinematic-discover-book-light.png) | [Mobile](mobile-cinematic-discover-book-light.png) |
| Account menu, dark | [Desktop](desktop-cinematic-account-menu-dark.png) | [Mobile](mobile-cinematic-account-menu-dark.png) |

Mobile search/navigation views: [Books](mobile-cinematic-search-book-dark.png), [Movies](mobile-cinematic-search-movie-dark.png), [TV](mobile-cinematic-search-tv-dark.png), [Games](mobile-cinematic-search-game-dark.png). [Anonymous mobile account/registration menu, light](mobile-cinematic-anonymous-menu-light.png).

All 23 selected images were opened and visually inspected, including full-size Home/Discover images and labeled desktop/mobile contact sheets. The contact sheets remain ignored; the original PNGs are retained here without resizing. Total selected image size is about 4.25 MB.

## Visual findings

Dark Home has a clear display focal point, lime discovery action and useful search panel. The light companion keeps a readable hierarchy and visible controls. Category illustrations are intentionally generic entry points, not fake catalogue artwork. Signed-in Home displays actual Library projections; the fixtures demonstrate honest missing-art fallback and personal rating labels.

Discover has consistent type navigation, search surfaces and artwork scale across media. Books preserve the entire cover with an inset; film/TV posters are uncropped; games retain landscape art. Long titles wrap or expose full text in native book disclosures. Action rows align within each grid row. Keyboard focus and native disclosures remain visible. Mobile uses two portrait columns at 390px, a generous one-column game layout and five unobstructed labeled navigation destinations. At 320px portrait results become one column. Account menus fit within the viewport and remain distinct from the bottom navigation.

Screenshot inspection exposed retained padding/action alignment from the old scoped book styles. The final candidate corrects those overrides; the new geometry assertion protects full-width card actions. No visible horizontal clipping was found in the selected images. Mobile result/shelf captures are viewport crops, so some preceding headings or following actions are outside the image; assertions and scroll flows separately verify their accessibility.

## Warnings, failures resolved and limits

The initial sandbox run executed browser tests but timed out while stopping its own Vite server. A subsequent start correctly refused the occupied port. Only the verified task-owned `vite --config vite.ui.config.js` process was stopped; headless reruns with process-cleanup permission completed normally. No headed fallback or existing browser session was used.

Early new-test iterations had accessible-label mismatches, an invalid synthetic empty genre list, a test syntax typo and an older light-only harness bootstrap. These fixtures/assertions were corrected to the existing contracts and new dark default. The final full suite passes; there is no unresolved reproducible application failure from these runs. Existing `NO_COLOR`/`FORCE_COLOR` and Git LF/CRLF warnings are nonblocking. The 12 unit skips are existing Linux/POSIX diagnostics, not disabled frontend checks.

Local preview: the dedicated mocked Vite test server only. Backend/database integration: not run; no backend/schema changes. Staging deployment: not performed. Independent live-browser/provider QA: not performed. Physical devices, screen readers, comprehensive accessibility/contrast certification and real provider image quality remain outside this evidence. This does not establish production/public-launch readiness.

These are temporary review artifacts. Preserve them until review. Before an explicitly approved merge, remove only this task's newly generated evidence unless the owner explicitly retains it. Merging to main triggers the existing staging deployment; this report does not authorize merging or deployment.
