# Cinematic redesign — Phase 1

The owner selected concept A (Cinematic) from `MyFunList-Design-Exploration.zip`. Its visual direction is the reference; its sample state, implementation suggestions and Hybrid recommendation are not product requirements. This implementation uses Vue 3, JavaScript, plain CSS and the existing composables/API contracts.

## Archive inspection

The complete archive contains 34 files: 15 artwork images, six Library preview screenshots, ten distribution source/document files, plus README, CHECKS and LIBRARY-QA. The self-contained studio embeds the same application/design assets; it also contains the newer Library implementation. Source, documentation, manifests and the artwork/preview contact sheet were inspected. No prototype assets or catalogue records are imported into production.

| Surface | Prototype completeness | Production adaptation |
| --- | --- | --- |
| Navigation/themes | Three distinct shells, two themes, mobile bar; sample account | Cinematic top navigation, five mobile destinations, account menus, registration/logout access, Escape/focus handling, skip link and persistent themes |
| Home | Designed feature, sample personal horizon and collections | Real provider search, four category entry points, authenticated Library shelf; explicit loading/error/retry/empty states |
| Discover Books/Movies | Designed cards, features, search and genre filtering over six sample records each | Existing real provider search and filters, artwork-first result grids, complete metadata/disclosures and attribution |
| Discover TV/Games | Illustrative empty states | Working TMDB TV/RAWG searches retained and redesigned; landscape game art is uncropped |
| Library | New artwork-first Comfortable/Compact/List designs, six preview captures, synthetic selections/statuses | Existing implementation retained for Phase 2 |
| Detail | Designed identity, synopsis and tracking; in-memory saves/ratings | Existing working implementation retained for Phase 2 |
| Lists/list detail | Designed sample collections and simple local dialogs | Existing private, persistent implementation retained for Phase 2 |
| Profile | Partial sample account/settings surface | Existing account/security forms retained |
| Auth/provider failures | No production authentication, sessions, account isolation or complete provider failure model | Existing authentication and provider protections retained |

The ZIP's README/CHECKS describe the original browser limitation, while LIBRARY-QA describes later Library-only visual checks. Neither proves production readiness. The packaged Library screenshots show the Hybrid shell; the owner's chosen concept A overrides that recommendation.

## Implemented behavior

- Cinematic dark canvas `#101310`, surface `#191E19`, foreground `#F3F4E9` and lime accent `#CFEF8A`, with a functional light companion. Dark is the first-visit default. Existing explicit light/dark preferences persist.
- Local system sans-serif display/body stacks avoid a new dependency, external font request or font-loading shift. Bold display scale, consistent spacing, restrained borders and 44px controls establish hierarchy.
- Home offers useful search without making a provider request until submission. Search opens the existing Discover route with the selected type/query. Category links do not contain invented titles or sample feeds.
- Signed-in Home reads the existing shared Library projection. It shows up to six in-progress entries (reading/watching/playing), or recently saved entries if none are in progress. It respects pending removals and the existing account-generation reset; it does not create progress percentages or a second store.
- Discover uses one navigation/search rhythm for all four types. Books/Movies/TV show uncropped portrait artwork; Games use landscape wells. Google Books is still default. Open Library retains its separate read-only, manually selected tester-only flow, disclosures and enablement controls.
- Search/filter meanings, provider order, URL/history/cache behavior, identities, Library add behavior and attribution remain unchanged. Native book disclosures retain full titles/authors. Missing images/metadata, long titles, loading, empty results, errors and manual Retry remain usable.
- Poster styling is scoped to Discover, and the new personal shelf is a dedicated Home component. Library, Lists and Detail keep their working composition with shared foundation tokens.

## Deliberate differences and Phase 2

There is no curated-feed or recommendation endpoint. The prototype's editor selections, fake collections, account statistics, trending content and hardcoded covers are therefore absent. Anonymous Home uses honest category illustrations and real search; personal artwork comes from actual saved Library data. Provider searches are not automatically triggered to manufacture a homepage feed. No new genre filters are added where the existing API does not support them.

Phase 2 can implement the dedicated artwork-first Library, density/view preferences, richer private-list compositions and Detail hierarchy. Account/profile visual refinement can follow without changing account-security behavior. Selection/bulk actions, social sharing, recommendations and automatic progress require separate product scope.

No backend, database schema, provider gate, private environment, workflow or hosting change is included. The review branch is not authorization to merge or deploy. A later merge to main triggers the existing staging workflow and needs explicit approval.

## Verification

See the temporary [review report](../qa/reviews/cinematic-redesign-phase1/report.md) for executed commands, screenshot evidence, inspection findings and limitations. This is isolated mocked headless Chromium QA, not live provider, database, staging, physical-device or screen-reader acceptance. Remove only this task's temporary review evidence before an approved merge unless the owner explicitly retains it.
