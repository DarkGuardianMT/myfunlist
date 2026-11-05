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

See the [Phase 1 report and before/after screenshots](../qa/reviews/ui-redesign-phase1/report.md). Its providers, artwork and sessions are mocked. No staging or production browser was used.

Next phases can apply the same hierarchy to Library/Lists, film/TV/game discovery, and account/detail pages. An expanded Open Library card spans the desktop grid and places Work and Edition records side by side, avoiding a tall empty neighbouring column. Narrow screens retain a single flowing disclosure.
