# MyFunList visual direction — Phase 1

Phase 1 establishes an editorial identity and applies it to Discover Books. Shared theme tokens also recolor existing surfaces throughout the app; Library, Lists, detail and other media layouts retain their existing structure. No new framework, font download or dependency is introduced.

## Paper, ink and artwork

| Token | Light | Dark | Purpose |
| --- | --- | --- | --- |
| Background | `#F5F3ED` | `#131C19` | Quiet page canvas |
| Surface | `#FFFDF9` | `#1B2722` | Search panels and cards |
| Text | `#26332E` | `#F1F0E8` | Titles and primary content |
| Muted text | `#626C64` | `#B0BBAF` | Supporting information |
| Primary | `#28594C` | `#AACDB3` | Search and interactive emphasis |

Tokens live in [global styles](../src/style.css). Display typography uses the local Iowan/Palatino/Georgia serif stack; controls and body text use Segoe UI/system sans-serif. The hierarchy is 44–72px page titles, 20–22.4px card titles, 16px body, 14px supporting text and 12px compact labels. Local font availability can change exact metrics. Display type stays out of form controls.

Spacing follows a 4/8/12/16/24/32/48px scale. Card radius is 14px; controls use 8px; covers have a small asymmetric radius and restrained shadow. Artwork remains unfiltered in both themes. Images use `object-fit: contain` to retain the complete supplied cover; missing art has an honest placeholder.

## Discover composition

The page moves from an editorial introduction to a media/provider toolbar, a single search panel, then a compact results summary and artwork-led cards. The provider remains a labeled native select. Google Books stays the default; Open Library remains an explicit tester pilot.

At widths above 850px, both catalogues use two horizontal-card columns. At 850px and below, cards form one column. The 640px breakpoint adjusts controls, spacing, cover size and navigation for phones. Four media-type controls fit in one mobile row; provider and filters remain separate, labeled controls. Existing app navigation keeps its own 640px breakpoint.

Desktop covers are 120×180px; phone covers are 96×144px. These are presentation slots, not invented artwork dimensions. Google titles/authors have two-line previews with complete text in Full info; Open Library titles have three-line previews with complete Work title/authors inside Edition details. Google compact styling is opt-in, preserving the existing shared card outside Discover.

Work identity, selected Edition identity, source cover provenance and language caveats remain distinct. Identifiers and detailed catalogue metadata live in native disclosures. Publication precision is unchanged. Missing years, authors, languages and Editions are shown honestly. Edition selection remains transient preview only; it never adds Open Library data to the Library.

## Interaction and accessibility

- Search buttons, native selects, disclosure summaries, provider links and card actions retain keyboard operation, visible focus indicators and at least 44px height.
- Selection uses more than color: pressed state, contrasting fill and explicit text. Links retain underlines, while disclosures expose their native expanded state.
- Hover changes are subtle border/surface changes. No decorative entrance animation or glass effects are added; skeletons are static and hidden from assistive technology.
- Live regions distinguish idle, loading, empty and failed searches. Existing auth messages, Retry-After cooldowns, manual retry and request protections are preserved.
- Google attribution stays alongside its search interface and volume links stay prominent. Open Library attribution stays with its results.

This is a visual and keyboard review, not WCAG certification. Physical devices, screen readers, zoom/accessibility preferences and broader account-page design still need dedicated acceptance.

## Verification and next phases

The owner approved the Phase 1 design, merge and automatic staging deployment. Only this task's temporary report and eighteen PNGs were removed for final merge preparation; existing historical QA evidence remains unchanged. Important findings and verification are retained below.

Next phases can apply the same hierarchy to Library/Lists, film/TV/game discovery, and account/detail pages. An expanded Open Library card spans the desktop grid and places Work and Edition records side by side, avoiding a tall empty neighbouring column. Narrow screens retain a single flowing disclosure.

## Retained Phase 1 QA

The approved implementation at `54c0f44f420a488cc064eaaa7ab72029d332ee7e` was reviewed with four baseline and fourteen final screenshots, all opened and visually inspected. Desktop used 1440×900 with full-page captures; mobile used 390×844 viewport crops with fixed navigation. Both themes, Google/Open Library results, search and expanded Edition details were covered; geometry checks also exercised 320px and 768px with disclosures open and closed.

Inspection found clearer title/author hierarchy, balanced cover/text proportions, complete artwork, visible keyboard focus and no obvious horizontal clipping or action/navigation overlap in the selected views. Missing-cover, missing-metadata and long-title fixtures remained honest. Expanded mobile records retained labels, preview controls and the read-only notice; expanded desktop records placed Work and Edition data side by side.

First-card measurements for the same fictional book, in CSS pixels; expanded records and long titles can grow:

| View | Before | Approved design |
| --- | --- | --- |
| Desktop Google card | 260×305; cover 88×132 | 538×230; cover 120×180 |
| Desktop Open Library card | 1100×326; cover 88×132 | 538×287; cover 120×180 |
| Mobile Google card | 350×284; cover 88×132 | 350×277; cover 96×144 |
| Mobile Open Library card | 350×541; cover 96×144 | 350×272; cover 96×144 |

Original verification used Node 24.15.0, Playwright 1.64.1 and Chromium headless shell 156.0.8078.4: `npm test` **342 passed, 12 existing platform skips, 0 failed** (354 total); `npm run build` **passed**, 94 modules; isolated `npm run test:ui` **18 passed**, nine per desktop/mobile project. All 28 focused service/view/card tests were included in the unit suite. Browser assertions recorded zero unexpected requests, failed requests, console/page errors or unexpected HTTP failures. Production assets excluded the test harness. Documentation/link checks and `git diff --check` passed.

Final merge preparation repeated the unit suite, build and isolated headless suite with the same passing results. Checks covered 22 Markdown files, 129 local links and 20 fragments; SHA-256 comparison confirmed 20 other tracked documentation/evidence files unchanged. Application code, tests and configuration remain identical to the approved implementation. The temporary visual evidence was removed after approval; its inspection findings above are retained rather than claimed as a fresh visual review.

Coverage preserves Google default/manual provider switching, 401/403 guidance without logout, provider identities and filters, Work/Edition separation, Library behavior, cache/history/stale-response guards, loading/empty/error states and manual-only cooldown recovery. Earlier implementation issues with 320px intrinsic grid sizing, Node CSS imports and definition-list whitespace were corrected before the passing checks. Visual fixtures use rasterized fictional jackets, decoded-image readiness and separate contexts with explicit theme assertions; existing tests separately cover theme toggles.

Body/muted/button contrast spot checks exceeded 4.5:1: light 11.86/5.37/8.00; dark 15.21/7.77/8.80. This does not establish full WCAG compliance. Existing `NO_COLOR`/`FORCE_COLOR` and unit mock-component `showProviderLink` warnings were nonblocking.

All provider, artwork and session data were synthetic. The loopback-only headless server reads no private env files, proxies no backend and keeps the Open Library build flag false; the existing component harness alone injects its enabled prop. Unknown external requests and non-GET requests are blocked. No live provider, account, database or staging/production browser was used for visual QA. Synthetic attribution cannot prove live branding delivery. Physical-device, screen-reader and broader accessibility acceptance remain future work. No cinematic alternative is included.
