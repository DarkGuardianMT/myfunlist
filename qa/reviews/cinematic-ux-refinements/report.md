# Cinematic UX refinements review

Temporary, sanitized review evidence for `review/cinematic-ux-refinements`. Baseline: released main `fe52f5ad1cd07af1db95de90860d7e7d87499ef5`. Implementation checkpoint: `bae1035eccbfc2c120d3f35a8a715d4e8900e5e3`. No merge, deployment, hosting change or real-account/database operation was performed for this task.

## Changes and scope

- Full, proportional foreground game artwork over a soft decorative portrait backdrop in mixed collections; landscape frames for Games-only views.
- Movies, TV Shows, Games, Books display ordering, with All first in Library. Existing identity/route values and Books defaults remain intact.
- Movie/TV year and original-language and game year/platform controls filter returned metadata only. No additional provider requests or unsupported API parameters.
- Compact star/score rating editor, directly editable status and keyboard-accessible ellipsis disclosure for lazy Custom Lists/removal. Existing half-point ratings, permissions and Undo retained.
- Shared Library category buttons with active state, arrow/Home/End interaction and narrow-screen wrapping; existing status/sort/browsing state retained.

See [implementation and provider limitations](../../../docs/CINEMATIC_UX_REFINEMENTS.md). The referenced Game of Thrones and Astra Severance screenshots were not available in the session. The written hierarchy guided the design; no direct comparison with those absent images is claimed.

## Executed verification

Node 24.15.0; Playwright 1.64.1; Chromium headless shell 156.0.8078.4. Desktop 1440×900 and mobile 390×844 (touch emulation), plus 320×900 and 768×900 responsive checks in dark/light.

| Command/check | Result |
| --- | --- |
| `npm test` | 345 passed, 12 existing platform skips, 0 failed (357 total) |
| `npm run build` | Passed, 115 modules |
| `npm run test:ui` | 58 passed, 0 failed, no retries; 3.4 minutes |
| Baseline `UX refinement visuals` on main | 4 passed; 32 original before screenshots preserved locally |
| Final `npm run test:ui -- --grep "UX refinement visuals"` | 4 passed after improving capture framing; explicitly asserts open rating/menu disclosures before and after capture |
| Focused compact-card/Undo flow after correction | 4 passed across desktop/mobile, including existing Cinematic flow |
| Pure result-filter and existing Discover tests | 3 passed |
| Markdown/internal links, historical evidence and protected-scope comparison | Passed: 26 Markdown files, 196 local links and 27 fragments; retained findings and backend/provider/security/config contracts unchanged |
| `git diff --check` | Passed |

The full suite covers Home/nav/themes; four Discover types; Google default and disabled Open Library; isolated enabled-component pilot behavior; loading/empty/error/retry/stale/cache/history; account transitions; Library densities/search/status/sort; lists/memberships; rating edits/clear; removal/Undo and focus restoration. New checks verify original 16:9 foreground proportions, four-type half-point rating/status mutations, lazy list loading, keyboard category selection and result filters after remote cache expiry. Only `q` reaches mocked TMDB/RAWG searches. Local filter changes make no additional requests; an explicit same-query Search retains the existing refresh behavior. A different query clears filters and detail/Back retains them.

All API/session/artwork data are synthetic and intercepted in a fresh loopback-only browser context. Unexpected external requests, unregistered mutations, console/page errors and HTTP failures fail the shared fixture; final runs recorded none. Only deliberately modeled errors were allowed. Open Library stays disabled in the ordinary application, with zero pilot calls; existing opt-in component fixtures do not contact a server/provider. No private env files, persistent browser profiles, real accounts, live provider calls or databases are used.

The suite now contains 58 tests instead of 48. The global suite budget increased from 180 to 300 seconds to accommodate the added coverage; per-test limits, assertions, isolation and zero-retry behavior remain intact. This is not a workaround for failing tests.

## Visual inspection

The selected before/after PNGs below were opened and inspected, using overview sheets followed by full-size views of the mixed cards, TV controls, Discover filters, open menus/rating editor and light/mobile layouts. Both generations use the same fictional dataset; no prototype demo content enters the application.

Compared with baseline, the flat letterbox area around games is replaced with a subdued art-derived backdrop while the complete foreground frame remains visible. Game-only frames and a marked 16:9 fixture confirm preserved image boundaries/proportions. Mixed artwork stays balanced with posters/covers. Missing artwork remains explicit.

Closed tracking controls occupy at most 100px in the visual test, replacing repeated labels and full-size rating/Manage rows. Stars and concise scores are visible; status remains a native direct control. Expanded menus use readable labels and remain inside viewport edges. Mobile inspection confirms usable controls above fixed bottom navigation when scrolled to the interaction. Comfortable/Compact/List keep their respective artwork density and text hierarchy. Long titles remain available through links/tooltips; metadata is concise. Category selection and focus are clear in both themes; no horizontal document overflow was observed/asserted at the tested widths.

Discover uses consistent control surfaces across categories. The new controls visibly identify their returned-result scope rather than implying catalogue-wide search. Light regression inspection found readable text, distinct selection and preserved foreground game art. These checks are visual review, not full accessibility certification.

## Corrections and limitations

- Earlier unit assertions depended on old dropdown positions/order; they now target semantic category buttons and explicit status/rating identifiers. Existing search/error/stale assertions remain.
- A real Undo focus issue was caught: a bubbling outside-click listener closed a restored menu during the Undo event. Using outside pointerdown instead preserves the restored Remove focus; focused and full suites pass.
- Full-page desktop capture temporarily resizes the viewport, intentionally closing responsive popovers. Open-menu/editor evidence now uses viewport capture and asserts the disclosure stays open. The final mobile TV capture frames its controls above bottom navigation.
- Existing `NO_COLOR`/`FORCE_COLOR` and unit mock-component warnings are nonblocking. The 12 platform skips remain unchanged; no new test was skipped to pass this task.
- Year/language/platform controls filter only the returned maximum 20 records. Genre metadata and catalogue-wide filtering are unsupported by current search contracts, so no genre control or backend expansion was added.
- Existing personal ratings are 0.5–10 by half points or Not rated; backend validation rejects zero. This contract is preserved.
- Screenshot fixtures cannot establish real provider artwork quality, physical-device behavior, screen-reader acceptance, backend persistence or staging availability. No staging deployment or independent live-browser QA was performed. Referenced owner screenshots were absent.

Historical QA/design documents and evidence remain intact. These new review files remain available for review and require task-specific cleanup only before an approved merge.

## Before/after evidence

Desktop PNGs normally capture the full page. Mobile PNGs capture the real viewport, scrolling to relevant cards/search controls; desktop open-popover PNGs also use a viewport to avoid resize-close behavior. Filenames containing 320/768 use those explicit viewport widths.

### Desktop dark

| View | Before | After |
| --- | --- | --- |
| mixed-comfortable | [Before](desktop-ux-before-mixed-comfortable-dark.png) | [After](desktop-ux-after-mixed-comfortable-dark.png) |
| mixed-compact | [Before](desktop-ux-before-mixed-compact-dark.png) | [After](desktop-ux-after-mixed-compact-dark.png) |
| mixed-list | [Before](desktop-ux-before-mixed-list-dark.png) | [After](desktop-ux-after-mixed-list-dark.png) |
| tv-card | [Before](desktop-ux-before-tv-card-dark.png) | [After](desktop-ux-after-tv-card-dark.png) |
| discover-movie | [Before](desktop-ux-before-discover-movie-dark.png) | [After](desktop-ux-after-discover-movie-dark.png) |
| discover-tv | [Before](desktop-ux-before-discover-tv-dark.png) | [After](desktop-ux-after-discover-tv-dark.png) |
| discover-game | [Before](desktop-ux-before-discover-game-dark.png) | [After](desktop-ux-after-discover-game-dark.png) |
| discover-book | [Before](desktop-ux-before-discover-book-dark.png) | [After](desktop-ux-after-discover-book-dark.png) |

### Mobile dark

| View | Before | After |
| --- | --- | --- |
| mixed-comfortable | [Before](mobile-ux-before-mixed-comfortable-dark.png) | [After](mobile-ux-after-mixed-comfortable-dark.png) |
| mixed-compact | [Before](mobile-ux-before-mixed-compact-dark.png) | [After](mobile-ux-after-mixed-compact-dark.png) |
| mixed-list | [Before](mobile-ux-before-mixed-list-dark.png) | [After](mobile-ux-after-mixed-list-dark.png) |
| tv-card | [Before](mobile-ux-before-tv-card-dark.png) | [After](mobile-ux-after-tv-card-dark.png) |
| discover-movie | [Before](mobile-ux-before-discover-movie-dark.png) | [After](mobile-ux-after-discover-movie-dark.png) |
| discover-tv | [Before](mobile-ux-before-discover-tv-dark.png) | [After](mobile-ux-after-discover-tv-dark.png) |
| discover-game | [Before](mobile-ux-before-discover-game-dark.png) | [After](mobile-ux-after-discover-game-dark.png) |
| discover-book | [Before](mobile-ux-before-discover-book-dark.png) | [After](mobile-ux-after-discover-book-dark.png) |

### Light regression

| View | Before | After |
| --- | --- | --- |
| desktop mixed Comfortable | [Before](desktop-ux-before-mixed-comfortable-light.png) | [After](desktop-ux-after-mixed-comfortable-light.png) |
| mobile mixed Comfortable | [Before](mobile-ux-before-mixed-comfortable-light.png) | [After](mobile-ux-after-mixed-comfortable-light.png) |

### Expanded actions and responsive artwork

- [desktop rating-editor](desktop-ux-after-rating-editor-dark.png)
- [desktop management-menu](desktop-ux-after-management-menu-dark.png)
- [mobile rating-editor](mobile-ux-after-rating-editor-dark.png)
- [mobile management-menu](mobile-ux-after-management-menu-dark.png)
- [320px mixed artwork](desktop-ux-after-mixed-320-dark.png)
- [320px games artwork](desktop-ux-after-games-320-dark.png)
- [768px mixed artwork](desktop-ux-after-mixed-768-dark.png)
- [768px games artwork](desktop-ux-after-games-768-dark.png)
