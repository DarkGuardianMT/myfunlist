# Discover defaults and return-state review

18 November 2026. Branch: `review/discover-provider-state`. Base: freshly fetched main `44de0ea` (PR #12). PR #13 quick-add was still open, so its existing commit `23f412f` was carried as `b470be7`; its separate evidence remains unchanged. This task's new evidence is temporary for review. See [behavior, isolation and limits](../../../docs/DISCOVER_PROVIDER_STATE.md).

## Scope

Books defaults to Open Library only with its existing frontend gate enabled; otherwise Google Books remains default. Explicit providers/URLs remain authoritative, including blocked explicit Open Library URLs with the flag off. Failures never switch providers.

All five search flows use bounded session display snapshots independent of API TTL. A nonempty unsubmitted draft can return with the already displayed results, without submitting it. Clearing input keeps the current cards and displayed search label, invalidates only the active submitted category/provider/query/options snapshot and browser result-cache entry, replaces the route without `q`, and rejects late response/cache writes. After leaving and returning, the empty URL shows normal idle state. New submissions replace the display normally. Other sources/categories/queries/filter variants remain intact.

The shared display store is limited to 20 LRU entries. Existing API cache TTL/capacity, request deduplication, manual retry and provider cooldown are retained. Open Library clearing touches local Maps only: no server-side cache/admission/reservation/coordination state is deleted. An already-issued failing request still contributes its existing protective cooldown. The included quick-add/save component and exact Edition identity rules are unchanged.

No backend, database, dependency, build-flag, hosting, workflow setting, merge, deployment or branch deletion is part of this task. No database or live provider was accessed.

## Executed checks

| Command/check | Result |
| --- | --- |
| Focused `node --test tests/openLibrary.test.js tests/openLibraryView.test.js tests/browsingContext.test.js tests/discoverView.test.js` | Final: **81 passed**, zero failures; exit 0 |
| `npm test` | Final: **401 total, 389 passed, 12 existing Windows Linux/POSIX skips**, zero failures; exit 0 |
| `npm run build` | Final passed; 119 modules, production assets generated; exit 0 |
| `npm run test:ui -- tests/ui/discoverState.spec.js` | Final focused rerun: **16 desktop/mobile tests passed**, 25.1s, clean teardown; exit 0 |
| `npm run test:ui -- --global-timeout=600000` | **Final: all 86 passed in 4.8m, clean teardown and exit 0**, including cache-hit promotion/draft changes. The earlier full run also passed 86 in 4.6m |
| Documentation links, scoped diff and `git diff --check` | Passed: 84 local Markdown file/heading links; focused changes; backend/schema/workflows/dependencies, quick-add/save components and earlier QA evidence unchanged |

Commands use Node 24.22.1 with its runtime directory prepended to PATH and the installed npm CLI explicitly invoked through that Node executable. Playwright 1.64.1 uses managed headless Chromium 156.0.8078.4, revision 1248. The complete expanded matrix gets a ten-minute CLI budget; the repository's normal configuration is unchanged. Headless commands run with permission for normal cleanup of their own child processes after the earlier task's known sandbox teardown issue; no visible browser or headed/debug fallback is used.

## Coverage and network isolation

Unit coverage checks enabled/disabled defaults, explicit providers, no fallback on errors, success/empty/error return state beyond TTL, snapshot LRU bounds, result-cache-hit promotion, unsubmitted drafts, clear/return/new search behavior for all categories, query/category/filter isolation, exact Edition saving, and stale responses after a fresh same-query request. Service checks prove scoped Open Library invalidation preserves other query/filter caches and cannot suppress an existing or late-arriving provider cooldown.

The new desktop/mobile matrix checks each of Open Library, Google Books, Movies, TV and Games after advancing Date by six minutes. It verifies preserved input/cards and request counts on return; nonempty draft restoration; clear with retained cards and a `router.replace` URL; idle state after leaving; Back/Forward; new submission; and fresh direct URLs. Google Books uses the actual native Chromium search-field X. TV clears its single-character draft with Backspace; other flows use Select All plus Backspace/Delete. Separate tests exercise explicit provider/default/error isolation, Google/Open Library same-query history isolation and delayed Open Library/movie responses after clear/new submission. Existing quick-add and full application regressions remain included.

Fresh ephemeral headless contexts use synthetic account/catalogue/artwork fixtures, mocked API mutations and blocked unexpected external traffic. The test server is loopback-only; ordinary application builds retain a false Open Library gate. Only the separate harness injects the enabled Discover prop. No real account, existing profile, persistent browser storage, PHP server, live provider, staging/production or database is involved. Tests assert unexpected request/browser-error counters stay zero.

## Selected screenshots and actual inspection

All six captures were opened and inspected. Desktop is 1440×900 full-page; mobile is 390×844 touch-emulated viewport. The two additional mobile frames from the final run clarify the result/idle sections below the initial viewport. The six PNGs total 370,277 bytes. All content/account/artwork is synthetic. No existing image or historical evidence was overwritten.

| Evidence | Inspected finding |
| --- | --- |
| [Desktop cleared input, retained results](desktop-cleared-open-library-results.png) | Empty focused input with disabled Search; original `lantern` result/count, selected Edition language and quick-add remain readable with Details closed |
| [Desktop returned idle, Dark](desktop-cleared-open-library-return-idle.png) | Empty field and normal Enter a title/author/ISBN idle message; no old card; provider remains Open Library |
| [Mobile cleared input, Light](mobile-cleared-open-library-results.png) | Empty input, selected Open Library and compact responsive controls are visible above fixed navigation; retained cards are below this viewport and established separately by assertions/supplementary capture |
| [Mobile returned input, Dark](mobile-cleared-open-library-return-idle.png) | Empty input and retained provider/filter controls remain readable; idle message is below this initial viewport |
| [Mobile retained card](mobile-cleared-open-library-visible-card.png) | Original result/count, cover, Work metadata, Edition language, quick-add and closed Details remain readable above fixed navigation after clearing; the empty field is established in its paired capture/assertions |
| [Mobile idle message](mobile-cleared-open-library-idle-message.png) | Empty field, unchanged provider/filter controls and normal idle message are visible after return; no old card; message/attribution sit above fixed navigation |

No new overflow/overlap was observed in the six inspected frames; these are deliberate scroll-position captures, not physical-device/full-page mobile acceptance. The existing native desktop language-matching option is visually truncated, as in prior QA. Synthetic covers do not establish real provider quality or branding delivery.

## Intermediate failures and resolution

The first focused browser run passed 13 tests and failed three. Two failures came from a test locator matching both the Open Library error and an unrelated empty removal-announcement alert. The locator now scopes to the Open Library region. One mobile Google Books scenario timed out waiting for Home navigation with a fully installed/frozen fake clock; the snapshot still showed the navigation. The TTL fixture now advances Date only, leaving animations/timers running. The focused rerun passed all 16 with clean exit; no application workaround was used for these fixture failures.

Review then added a regression for snapshot eviction followed by an API-cache hit and later TTL expiry. It reproduced an unnecessary 22nd request where 21 were expected. The display load now promotes the visible cache hit into a bounded return snapshot without extending API cache expiry. The regression passes. Nonempty draft-return and blank-submit-after-clear checks were also added; the final focused/unit/build commands above include these changes. The initial successful full browser run predates that final correction; the complete final rerun afterward passed all 86 tests with clean exit. No unresolved assertion or teardown failure remains.

Expected negative fixtures and existing unit suites emit sanitized provider errors, unmatched-route/Vite WebSocket warnings and experimental timer notices. Playwright emits `NO_COLOR`/`FORCE_COLOR` warnings that PowerShell can wrap as native stderr; Git emits LF/CRLF conversion warnings. Raw logs, traces, video, profiles, cookies and large generated reports are not committed.

## Limits and review status

Snapshots are bounded in-memory SPA display state, not persistent browser storage or a provider-cache freshness guarantee. Eviction or a fresh document/direct URL can require a new request. A restored/retained Open Library card can outlive trusted server metadata and receive the existing save 409; explicit renewed search/inspection remains necessary. Saving never invents or substitutes an Edition and never clears shared server state.

No combined PHP preview, new real-database verification, live-provider acceptance, independent deployed browser, physical-device or screen-reader acceptance was performed. No live availability claim is made. The branch includes PR #13's existing quick-add dependency because main did not yet include it. Merge/deployment require separate approval; merging to main triggers the existing staging deployment. Branch deletion is not authorized.
