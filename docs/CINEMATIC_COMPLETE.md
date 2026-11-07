# Complete Cinematic frontend redesign

This review candidate completes all requested frontend pages in `review/cinematic-complete-redesign`, based on main `c74eb91c9bcfe58307de40ab81a4ffe00d2c19d8`. It follows the owner's Cinematic selection from the latest 34-file exploration ZIP. Prototype documents are reference material; their implementation suggestions and synthetic state are not instructions to copy sample features or records. The [original archive assessment](CINEMATIC_PHASE1.md#archive-inspection) and historical QA remain unchanged.

## Completed surfaces

| Surface | Production adaptation |
| --- | --- |
| Home | More compact hero/search on mobile; shared proportional artwork and full title tooltips; actual account Library shelf and existing provider handoff |
| Discover | New compact category/search/filter composition for Books, Movies, TV and Games; portrait results, landscape game art, consistent metadata/action rhythm, visible attribution and explicit loading/empty/error/manual Retry |
| Books | Google remains default; cover-first results retain Full info/provider links. Open Library is manually selectable, tester-only and read-only, with distinct Work/selected Edition metadata and expanded full-width disclosures |
| Library | Dedicated artwork-first collection cards, Comfortable default, Compact/List choices, title search and existing type/status/sort controls; native status/rating, Manage list picker/removal, missing art and canonical detail links |
| Detail | Prominent proportional artwork, title/authors/date/genres, tracking and list actions before readable synopsis; structured secondary information for all four media types |
| Lists | Real artwork compositions from memberships, private labels, collection detail hero and shared item cards; create/edit/add/remove/delete behavior retained |
| Account | Shared Login/Register composition and validation associations; Profile identity plus name/password panels; authentication, CSRF and account isolation unchanged |
| Shell | Desktop top and mobile bottom navigation retained, nested Lists active state, account menus close on outside click, route/account change or Escape |

## Architecture and behavior

`MediaArtwork` handles contain-fit images, canonical artwork links, image failure and honest type-specific fallback. `CollectionMediaCard` separates saved-media presentation from discovery metadata. Existing `LibraryItemControls` keeps native selectors, lazy list actions and deferred removal; Undo opens the restored Manage disclosure before returning focus to Remove.

`useCollectionView` stores only `comfortable`, `compact` or `list` in `myfunlist_collection_view`. Comfortable is the fallback for missing/invalid/blocked storage; a blocked write still applies the choice in memory. The choice belongs to the device, not an account. The new title query is case-insensitive, session-only, combines with existing filters/sort and clears on account changes. Existing filter and browsing-return state are preserved.

Lists overview uses the existing shared Library projection and guarded paginated memberships to select up to three real artworks per list. It does not request every list detail or invent collection jackets. Failed preview reads leave list navigation usable and expose an explicit Retry previews action. Shared account-generation and ownership guards remain responsible for API data isolation.

Layouts use system typography, existing dark/light tokens and plain CSS without dependencies. Component-owned card styles replace broad Discover overrides. Comfortable portrait artwork is approximately 204px at the tested 1440px desktop; mobile uses two columns at 390px and a larger single Comfortable column at 320px. Game-only Library and Discover use landscape frames; mixed collections retain aligned portrait wells with uncropped game art.

## Prototype differences and limitations

The prototype fully illustrates Home, Books/Movies, Library density modes, Detail and sample Lists; TV/Games are largely illustrative empty states, Profile is partial, and production authentication/provider failures are absent. This candidate adapts those incomplete areas to existing working functionality rather than introducing placeholders.

There is no automatic All feed, trending section, recommendation endpoint, fake progress, public profile/list sharing, bulk selection or unavailable provider filter. Home already supplies four category entry points without sending external searches. List artwork and personal shelves come only from actual account data. Ratings remain native, accessible selectors rather than decorative fake stars. Open Library saving and a complete alternate-edition catalogue remain unavailable.

No backend, schema, API limits/contracts, provider gate, private environment, dependency, deployment workflow or hosting configuration changes. No real account, database, provider or Hostinger operations were used for browser QA. This candidate is not merged or deployed; staging and independent live-browser acceptance are separate work.

## Verification

See the [temporary review report and before/after screenshots](../qa/reviews/cinematic-complete-redesign/report.md) for executed checks, actual screenshot inspection, cover measurements and limitations. Production builds exclude the synthetic test harness. Physical-device, native OS picker, screen-reader and live-provider acceptance remain separate from mocked headless Chromium checks.
