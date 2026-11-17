# Discover provider defaults and return state

18 November 2026. Review branch: `review/discover-provider-state`, from freshly fetched main `44de0ea` (PR #12). Quick-add was still open in PR #13, so its existing commit `23f412f` was carried over as `b470be7` without merging or changing main. This candidate includes that UI feature and preserves its existing review evidence. No backend, database, hosting or deployment change is included.

## Provider defaults and explicit navigation

Books defaults to Open Library only when `VITE_OPEN_LIBRARY_DISCOVER_ENABLED` is exactly `true`; otherwise it defaults to Google Books. Valid explicit `provider=open-library` and `provider=google-books` selections take precedence. An explicit Open Library URL with the flag disabled retains the blocked Open Library view; it does not silently fall back. Errors never select or request another provider.

Bare `/discover` still opens Movies. Existing Books URLs such as `/discover?q=lantern` retain their Books interpretation and canonical explicit `type=book`; they use the configured default unless a valid provider is supplied. Explicit provider/category/filter URLs and Back/Forward navigation remain supported.

## Display snapshots and API caches

Open Library, Google Books, Movies, TV and Games share a bounded **20-entry LRU display-snapshot store** for the current SPA session. Identities include source/category, submitted query and provider-specific search options. Success, empty and error displays can be restored after route unmounts without another provider request, even after the normal API cache TTL expires. A nonempty unsubmitted input draft is retained with the displayed search without being submitted automatically. A displayed result-cache hit also becomes a current display snapshot, so prior snapshot eviction cannot cause an unnecessary request on the next return.

Display retention is separate from API caching. Existing five-minute/20-entry local result caches, request deduplication, manual refresh/retry semantics, provider cooldowns and backend rate limits remain. A bounded snapshot can eventually be evicted; a direct URL/fresh page load reconstructs its search normally. No persistent browser storage or server-side cache policy is added.

## Clearing the active input

Native search-field X, Backspace/Delete and Select All + Delete all use the existing input event path. When the active input becomes empty:

1. The field becomes empty immediately. Existing rendered cards and their displayed search label remain on the current visit.
2. Only that category/provider/query/options snapshot and local result-cache entry are removed. A pending request for that same identity is detached so its late completion cannot repopulate cleared caches or overwrite a new search.
3. The submitted `q` is removed with `router.replace`, retaining provider/category/filter/hash context. Only this replacement skips the normal display reset; it does not create another history entry or issue a search.
4. Leaving and returning shows the empty field and normal idle state, with no old cards or automatic repeat search. Back/Forward respects the replaced URL; other explicit query URLs remain independent searches.
5. Submitting a new query replaces the retained display with normal loading/results/error state. A fresh same-query search cannot be replaced by a late response from the detached request.

Other categories, providers, queries and filter variants remain intact. Open Library invalidation touches only in-memory browser entries: it never deletes shared server cache, admission, reservation or coordination state. An already-issued Open Library failure still contributes its existing protective cooldown, even when the associated display was cleared. Clearing does not bypass cooldowns or trigger a new request.

## Quick-add and stale display limits

The included quick-add action still saves only the exact valid selected Edition. A restored or currently retained card is a display snapshot, not an extension of server metadata freshness. If unseen-Edition trust has expired, the existing save endpoint can return 409 and require an explicit renewed search. No Edition substitution, automatic retry/search, backend metadata refresh or new upstream endpoint is introduced. Existing authentication, membership/loading, duplicate prevention, Library/List behavior and save-error handling remain unchanged.

## Verification

The [temporary sanitized QA report](../qa/reviews/discover-provider-state/report.md) records commands, results, actual screenshot inspection, intermediate test failures and remaining limits. The matrix covers feature-gated defaults, explicit URLs and errors; returns beyond TTL for all five search flows; native X/keyboard clearing while cards remain; idle returns; new/direct searches; Back/Forward; provider/category/query/filter isolation; bounded retention; and late-response races.

Final results: 81 focused tests passed; full unit suite 389 passed with 12 existing platform skips (401 total); production build passed with 119 modules; all 86 isolated headless desktop/mobile tests passed in 4.8 minutes with clean teardown. Six selected screenshots were opened and inspected. Scope/whitespace checks and 84 local Markdown file/heading links passed. The report preserves the corrected selector/clock-fixture failures and the reproduced/fixed cache-hit promotion regression.

Browser checks use fresh isolated headless Chromium with synthetic account/catalogue/artwork fixtures, mocked API mutations, unexpected external traffic blocked and a dedicated loopback server. The ordinary frontend gate stays false; only the separate test harness enables the Discover view's feature prop. No live provider, database, combined PHP preview, deployment or independent deployed/physical-device acceptance is established. Merge, deployment and branch deletion remain separately unauthorized.
