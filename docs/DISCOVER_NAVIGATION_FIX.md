# Discover navigation and RAWG diagnosis

Review branch: `review/discover-navigation-fixes`, based on main `d4f61b2a80142c76ead913eec9833d93196472c8` (PR #9). This focused follow-up changes search restoration, category routing and Detail return context. It does not redesign the UI, change backend runtime code/configuration, or authorize a merge/deployment.

## Repeated-request cause and fix

[`useDiscoverSearch()`](../src/composables/useDiscoverSearch.js) runs an immediate route watcher on each mount. Its old `load()` reset the component state and consulted only the successful-results cache. Errors were never cached. A failed RAWG request therefore ran again after leaving and returning; successful/empty results also ran again after the five-minute cache expired. Disposal guards prevented stale view updates but did not preserve the previous error state.

The composable now keeps a separate, **20-entry LRU browsing snapshot** of public success, empty and sanitized error states. Route/category/Back restoration consults this memory before result-cache freshness. The existing five-minute, 20-entry successful-result cache remains bounded; expiry does not invalidate a retained browsing snapshot or schedule provider traffic. Both maps are session-memory only, cleared by the existing reset, and evicted snapshots can require a new request when revisited. They do not persist results or account records in URLs/storage/history.

In-flight requests remain deduplicated by normalized provider/type/query/options. Their terminal state is remembered even if the initiating view unmounts. Remounts join an existing request; generation guards still prevent late results replacing a newer route. Every completed request reaches success, empty or error, rather than leaving a restored Searching state. Local returned-result filters still never fetch.

**Search and Retry are explicit refresh actions**, including an unchanged or previously visited query. They bypass the successful-results cache while joining an already pending identical request. New queries execute normally and retain existing filter-reset semantics. Google Books options remain part of the request key. Open Library retains its separate bounded cache, tester gate and manual cooldown/retry contract; its generated URLs now include `type=book`.

## Internal Back control

The router records the actual internal origin when entering Detail from Discover, Library or a numeric Custom List route. The native link says **Back to Discover**, **Back to Library** or **Back to List** and returns to that exact route/query/hash. Existing Library filters/sort and bounded scroll restoration remain intact; List routes now participate in scroll/readiness restoration too.

The control never calls arbitrary browser history or accepts an external return target. Direct URL entry, refresh and unrelated origins safely fall back to `/discover`. Private Library/List origins are scoped to the current account and cleared on logout/account change, including logout/relogin to the same account. No list title or account data is written to browser history/storage. Browser Back remains available independently.

## Explicit Books and Movies default

- Bare `/discover` and Home search default to Movies. Visible category order remains Movies, TV Shows, Games, Books.
- Generated category links and searches always include the media type, including `type=book`. Book filter/provider changes keep that explicit type.
- A legacy URL without `type` but with `q` or book-specific `provider`, `field`, `lang`, `sort` or `mode` is interpreted as Books and replaced with an explicit book URL, preserving the supplied context. Its history entry is replaced, not duplicated.
- An explicitly invalid/array type falls back to Movies. Malformed query values do not start a search.
- Google Books remains the default **book provider**; the category default is a separate concern. Open Library remains manually selected, read-only and tester-only, with no gate/limit changes.

Legacy type-less movie intentions cannot be distinguished from old book URLs. Explicit `type=movie` removes that ambiguity. A full reload starts a new memory session; an explicit search URL can search again on that new page.

## RAWG: established facts and uncertainty

One separately authorized, bounded read-only staging game search returned **HTTP 503 / `provider_unavailable` in 8,207ms**. It was not retried. This was an operational observation outside the mocked test suites, not a provider call from a test. No credentials, upstream key-bearing URLs or raw response bodies were printed or stored.

Code inspection establishes:

| Condition | Existing behavior |
| --- | --- |
| Empty/missing effective `RAWG_API_KEY` | Safe 503 before any upstream call |
| Upstream HTTP 401, 403 or 429 | HTTP client maps it to the same generic 503 |
| Upstream HTTP 5xx | Same generic 503 |
| cURL failure: DNS/connect/TLS/timeout, or bounded-response write failure | Same generic 503 |
| Other unexpected HTTP status or malformed JSON | Usually safe 502 `provider_error` |

The [resolver](../backend/src/Provider/ProviderMediaResolver.php) uses the backend-only key and existing bounded RAWG game search. The [HTTP client](../backend/src/Provider/CurlProviderHttpClient.php) uses a **3-second connection timeout and 8-second total timeout**, verified TLS, no redirects and a 1MiB response bound. The frontend has an 11-second request deadline. No layer automatically retries the provider request.

The observed 8.2 seconds is consistent with the eight-second total timeout. It does **not** prove a timeout, validate the staging key, identify a specific upstream HTTP status or establish a RAWG outage: server/network latency and the generic error mapping prevent that conclusion. Existing discovery logs record only media type and the already mapped status, not the original cURL category/upstream status. Staging's private configuration and lower-level failure telemetry were not available through this review session.

The integration remains unchanged. RAWG failures retain a clear unavailable message and manual Retry. The next decisive operational evidence would be an authorized, private check of effective key presence and a sanitized cURL failure category/upstream status from the affected host, with no key values, key-bearing URLs or repeated sampling. No credential rotation, new public diagnostic endpoint, hosting change or provider replacement accompanies this fix.

## Verification and delivery

The [temporary review report](../qa/reviews/discover-navigation-fixes/report.md) records executed unit/build/headless/PHP checks and selected desktop/mobile screenshots. Existing historical QA/design records remain unchanged. The PHP discovery fixture now explicitly checks missing RAWG configuration without upstream I/O; runtime backend/API contracts remain untouched.

The owner permitted direct-main delivery only for narrow, low-risk changes. This fix affects shared search lifecycle, cross-provider routing and account-scoped private return navigation, so it is delivered through one review PR. Main is not pushed, merged or deployed by this task. Mocked browser QA is separate from the single staging HTTP observation and does not establish deployment or live-provider recovery.
