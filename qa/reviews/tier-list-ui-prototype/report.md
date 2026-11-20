# Tier Lists UI prototype review

Base commit `99d5219c85d744e32a17e0146f1baa48cef0a0bd` · Branch `review/tier-list-ui-prototype`

## Local preview

Run `npm run test:ui:server` from the repository root and open [the Tier Lists preview](http://127.0.0.1:4179/prototypes/tier-lists/). The preview uses the dedicated loopback Vite configuration with the API proxy absent and the real Open Library gate disabled. Reloading restores the sample boards and the default Dark theme. Home, Discover, Library, Lists, Profile and Login in the preview shell lead to navigation examples within the preview.

## Interactions to review

- Open **After Hours** for mixed media, empty tiers and Unranked. Open **Centennial Marathon** for 100 cards, including 82 in one tier. Use **Preview overview state** below the cards to show empty, loading and failure states.
- Create a board with all four media types or a subset. The editor opens with S–D and an empty Unranked lane. Use **Edit details** to update the title and description.
- Configure up to 12 ranked tiers. Rename a tier, choose one of six named colors, reorder using the arrow buttons, or remove a tier. Confirming removal of a populated tier appends its media to Unranked in order. At least one editable tier remains.
- Add media through **My Library** or **Discover**. For the Edition example, choose Books and search for `Lantern`. Inspect the exact fake Edition `OL920004M`, choose **Search again**, then explicitly add it. It appears in Unranked while My Library still has no matching item. Both tabs mark existing membership.
- Drag a card from its Move handle with a desktop pointer. The same button opens the keyboard and tap interaction with destination, placement and removal. Use **Jump to tier** on long boards. The moved card receives focus and its new position is announced.
- Make an edit and select **Simulate the next save failing** below the board. Save, observe the retained draft, then choose **Retry save**. Leaving a dirty board asks whether to keep editing or discard. Saved changes are retained across navigation inside the preview.

## Visual and accessibility decisions

The overview uses ranked artwork previews, compact summaries and the existing Cinematic surfaces. The editor has labeled tier rows with subtle tinted heading panels, 2:3 artwork wells, fully wrapping media titles, written type indicators and fixed-size artwork fallbacks. Landscape game art uses the shared contain-fit treatment. Phones use the five-slot bottom bar and a compact sticky Save/status strip. Profile and Login are discoverable through the preview account menu.

The six palette accents have a calculated minimum contrast of 3.54:1 in Light and 6.19:1 in Dark against their tinted tier headings. The tier name and ordering carry the rank independently of color. Keyboard checks exercise entry focus, picker tab arrows, Escape and trigger focus return, tier reordering, the Move dialog and a visible 2px focus outline. The viewport checks cover horizontal overflow, 44px action heights, bottom navigation clearance, game art sizing and reaching the final Unranked action on the 100-item board.

## Verification

| Check | Result |
| --- | --- |
| `node --test tests/tierListPrototype.test.js` | 8 passed |
| `npm test` | 417 passed, 12 existing Windows skips, 0 failed |
| `npm run build` | Passed. The production output contained only the regular app entry and assets, with no prototype identity, fixture title or preview entry. |
| `npm run test:ui -- tests/ui/tierListPrototype.spec.js --global-timeout=600000` | 15 passed. Eight duplicate viewport/project combinations and the mobile desktop-drag case were intentionally skipped. |

Node.js 24.22.1, Vite 8.3.3 and Playwright 1.64.1 used the repository’s Chromium headless shell 156.0.8078.4 (revision 1248). Browser scenarios passed with zero unexpected requests, HTTP failures, failed requests, console errors or page errors. No prototype request reached an API, a media provider or an external artwork host.

The first desktop run exposed an ambiguous color-control label and a drag test whose initial pointer motion did not complete the drop. The final cases verify the explicitly associated color label and a completed pointer drag using stepped mouse motion. The first run also left its managed loopback server behind on Windows; the verified child was stopped before retry, and the later browser run completed with successful teardown. The browser runner emitted the nonblocking `NO_COLOR` / `FORCE_COLOR` notice and PowerShell’s native-stderr wrapping. The visual review prompted the mobile Save strip refinement and a narrower desktop Jump selector before final capture.

## Screenshot evidence

The headless suite captured 64 views across the viewport and theme matrix. I inspected the matrix as contact sheets and reviewed the selected captures at their original sizes. The tablet layout wraps the navigation beneath the brand. The mobile Unranked capture shows the full long title across several lines, the fixed-size No cover tile and the Move actions between the sticky Save strip and the bottom navigation. At 320px, Create and Configure need vertical scrolling to reach all controls. The selected Create image is scrolled to show its primary action. All artwork and records are fictional.

| Viewport | Theme | Selected screenshots |
| --- | --- | --- |
| 1440×900 | Dark | [Overview](desktop-1440-dark-overview.png) · [Populated editor](desktop-1440-dark-editor.png) |
| 1440×900 | Light | [Create](desktop-1440-light-create.png) · [Configure tiers](desktop-1440-light-configure.png) |
| 768×1024 | Dark | [My Library](desktop-768-dark-library.png) · [Discover](desktop-768-dark-discover.png) |
| 768×1024 | Light | [Overview](desktop-768-light-overview.png) · [Move](desktop-768-light-move.png) |
| 390×844 | Dark | [Populated editor](mobile-390-dark-editor.png) · [Unranked](mobile-390-dark-unranked.png) |
| 390×844 | Light | [My Library](mobile-390-light-library.png) · [Move](mobile-390-light-move.png) |
| 320×740 | Dark | [Discover Edition recovery](mobile-320-dark-discover.png) · [Configure tiers](mobile-320-dark-configure.png) |
| 320×740 | Light | [Overview](mobile-320-light-overview.png) · [Create](mobile-320-light-create.png) |

## Limits and decisions before backend work

- The navigation concept uses preview-only routes. Board changes use memory only, and search, Edition verification and save failures are deterministic demonstrations. The production app, its routes and its data services are outside this preview.
- Touch uses the Move dialog. Physical device behavior, native chooser behavior and screen-reader acceptance remain open. Chromium emulation alone does not establish those results. The board uses one compact density.
- Decide whether the fifth mobile slot should replace Profile/Login, confirm the board size limit and palette, and review the Move and drag interactions before implementing persistence.
- Confirm whether a verified Discover selection may create a shared catalogue record before Save. Backend work needs private ownership, authenticated and CSRF-protected editing, exact media validation, revision conflicts and tests against the guarded disposable database.
- This is local headless preview evidence. Staging deployment and independent live-browser review were not performed.

## Artwork fixtures

The built-in image generation tool created the original synthetic artwork in [the preview art directory](../../../prototypes/tier-lists/art/). The sheets were split at their grid seams and exported as local JPEG fixtures, with the landscape proportions preserved.

- **Portrait prompt** — “Create one synthetic media artwork contact sheet for the MyFunList Tier Lists prototype. Strictly exact 3 by 2 grid, six completely separate 2:3 portrait cells, edge-to-edge with no gutters, no framing, no borders, no typography anywhere. Uniform cells aligned to precisely one-third of canvas width and one-half of canvas height. Canvas aspect ratio 1:1. Top row left to right: a cinematic cyan and burnt orange poster of a solitary radio tower in a snowy misty mountain valley at night; a pink sunset above desert dunes with a tiny solitary traveler and colossal dark arch; a blue-green night poster of an impossible library and a lit stairway. Bottom row left to right: a delicate botanical book cover with cream paper and ornate forest green block-print climbing vines; a dramatic red and purple image of a deep space capsule above a planet; an indigo and golden illustrated harbor with luminous windows reflected in water. Original fictional properties only. Give all six treatments different silhouettes and palette, gorgeous cover art with readable composition at 100px wide. No existing brand, no characters from existing properties, no text.”
- **Landscape prompt** — “SQUARE 1:1 contact sheet, a tightly aligned stack of two distinct synthetic landscape video-game cover artworks, one above the other, split exactly halfway vertically, no borders or gap, two 2:1 images. Keep the overall canvas perfectly square. Original cinematic adventure environments for fictional releases, no lettering, no logos. Upper half a teal/sea-green coastal landscape with steep rugged mossy sea cliffs, white surf and a lone explorer with a warm lantern in the center-left, broad cloudy sky, painterly AAA atmospheric key art. Lower half an orchid and deep indigo moonlit alien forest with an illuminated small hovering rover in the middle, dense cyan fungal canopy, rich purple foreground flowers and cool moonlight. Medium-distance camera composition, fill each half edge to edge. Distinct large shapes that read at thumbnail size.”
