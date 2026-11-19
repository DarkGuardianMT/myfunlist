# Discover provider defaults and return state

18 November 2026. Review branch: `review/discover-provider-state`, from freshly fetched main `44de0ea` (PR #12). Quick-add was still open in PR #13, so its existing commit `23f412f` was carried over as `b470be7` without merging or changing main. This candidate includes that UI feature; its [retained quick-add findings](OPEN_LIBRARY_LIBRARY_INTEGRATION.md#retained-quick-add-qa) preserve the earlier review. No backend, database, hosting or deployment change is included.

## Provider defaults and explicit navigation

Books defaults to Open Library only when `VITE_OPEN_LIBRARY_DISCOVER_ENABLED` is exactly `true`; otherwise it defaults to Google Books. Valid explicit `provider=open-library` and `provider=google-books` selections take precedence. An explicit Open Library URL with the flag disabled retains the blocked Open Library view; it does not silently fall back. Errors never select or request another provider.

Bare `/discover` still opens Movies. Existing Books URLs such as `/discover?q=lantern` retain their Books interpretation and canonical explicit `type=book`; they use the configured default unless a valid provider is supplied. Explicit provider/category/filter URLs and Back/Forward navigation remain supported.

## Explicit submissions and staging QA-01

19 November 2026, `review/staging-qa-refinements`, from main `9f58e47`. The owner reports successful PR #14 staging deployment and live acceptance of all five search flows, exact-Edition quick-add and authenticated Library/Lists, without critical/high defects. One medium defect, QA-01, reproduced a stale input draft after a new Home submission; stale-Edition recovery and eligibility wording were related UX opportunities. These are supplied live findings, separate from this branch's mocked local checks.

Root cause: matching result snapshots retained `inputQuery`, and both Discover implementations restored it regardless of whether navigation meant a new submission or a contextual return. Home supplied only the same category/query URL, so its explicit intent was lost. A session-only navigation helper now marks the exact resolved route object for explicit Home submissions across Movies, TV, Games and the configured Books provider. Both loaders use submitted text for that navigation while reusing matching results, and update only that snapshot's input. No marker, draft or result is written to the URL, history payload or storage. Cancelled navigation removes its guard; later Back/Forward produces an ordinary route object and restores drafts normally.

Detail Back, category/provider switches and browser Back/Forward keep contextual restoration. Fresh documents/reloads still rebuild from the URL. Home does not force a provider request or erase unrelated queries/options/categories. Explicit Discover Search/Retry retains its refresh behavior; Open Library now bypasses its matching browser result cache as well as the display snapshot, retaining pending-request deduplication and cooldowns. Its changed-query form submissions also use the explicit navigation helper.

See [Edition renewal and limits](OPEN_LIBRARY_LIBRARY_INTEGRATION.md#staging-qa-recovery-refinements). The [refinement verification record](PROJECT_HISTORY.md#staging-qa-refinements--19-november-2026) retains 97 focused unit passes, 405 full-suite passes with 12 existing Windows skips, build success, 104 headless passes, inspected visual findings, fixture-failure history and release gaps. No new staging deployment or independent live-browser acceptance is claimed.

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

PR #15 independent review additionally requires the rejected displayed Edition's Add action to remain disabled after `edition_unavailable`; the save handler enforces the same guard. Search again is the primary recovery action. Only a successful renewal returning an eligible Edition offers a new explicit save; failure, cooldown expiry or blocked renewal cannot unlock the unchanged rejected card. Unrelated cards and other save errors keep their behavior. See the [follow-up verification](PROJECT_HISTORY.md#pr-15-independent-review-follow-up--19-november-2026).

The included quick-add action still saves only the exact valid selected Edition. A restored or currently retained card is a display snapshot, not an extension of server metadata freshness. If unseen-Edition trust has expired, the existing save endpoint can return 409. Its feedback now offers an explicit Search again action for the submitted query/options, independent of unsent input. The returned eligible Edition needs another explicit save action. No Edition substitution, automatic retry/search, backend metadata refresh or new upstream endpoint is introduced. Existing authentication, membership/loading, duplicate prevention, Library/List behavior and save-error handling remain unchanged.

## Verification

The meaningful findings from PR #14's 18 November QA report are retained here. Its temporary report and six screenshots were removed during final review cleanup, alongside PR #13's temporary evidence, after preserving both records in permanent documentation. The [original report](https://github.com/DarkGuardianMT/myfunlist/blob/d47c90f057c2cc128fe7ea15ca6d851b45b5906d/qa/reviews/discover-provider-state/report.md) and [six inspected images](https://github.com/DarkGuardianMT/myfunlist/tree/d47c90f057c2cc128fe7ea15ca6d851b45b5906d/qa/reviews/discover-provider-state) remain available at an immutable Git checkpoint. These are recorded implementation checks; documentation-only cleanup does not claim a new application/browser run.

| Command/check | Recorded result |
| --- | --- |
| `node --test tests/openLibrary.test.js tests/openLibraryView.test.js tests/browsingContext.test.js tests/discoverView.test.js` | Final 81 passed, zero failures; exit 0 |
| `npm test` | Final 401 total: 389 passed, 12 existing Windows Linux/POSIX skips, zero failures; exit 0 |
| `npm run build` | Final passed; 119 modules; exit 0 |
| `npm run test:ui -- tests/ui/discoverState.spec.js` | Corrected focused rerun: 16 desktop/mobile tests passed in 25.1s; clean teardown, exit 0 |
| `npm run test:ui -- --global-timeout=600000` | Final all 86 passed in 4.8 minutes after cache-hit promotion/draft changes; clean teardown, exit 0. Earlier full run: 86 passed in 4.6 minutes |
| Documentation, scoped diff and `git diff --check` | 84 local Markdown file/heading links passed; backend/schema/workflows/dependencies, quick-add/save components and earlier evidence unchanged during implementation |

### Coverage and isolation

Unit coverage checks enabled/disabled defaults, explicit providers, no fallback on errors, success/empty/error return state beyond TTL, 20-entry LRU bounds, API-cache-hit promotion, unsubmitted drafts, all-category clear/return/new searches, query/category/filter isolation, exact Edition saving and stale responses after a fresh same-query request. Scoped Open Library invalidation preserves other query/filter caches and existing or late-arriving protective cooldowns.

The desktop/mobile matrix advances Date by six minutes for Open Library, Google Books, Movies, TV and Games. It checks preserved input/cards and request counts on return, nonempty drafts, clear with retained cards and `router.replace`, idle after leaving, Back/Forward, new submissions and fresh direct URLs. Google Books uses the actual native Chromium search-field X; TV deletes its single-character draft with Backspace; other flows use Select All plus Backspace/Delete. Separate tests check explicit provider/default/error isolation, Google/Open Library same-query history isolation and delayed Open Library/movie responses after clear/new submission. Existing quick-add and full application regressions remain included.

Commands used Node 24.22.1 with its runtime directory on PATH and the installed npm CLI invoked through Node. Playwright 1.64.1 used managed headless Chromium 156.0.8078.4 (revision 1248). The expanded matrix used a ten-minute CLI budget without changing repository configuration. Headless runs had permission for normal cleanup of their own children after the earlier quick-add sandbox teardown issue; no visible browser or headed/debug fallback was used.

Fresh ephemeral headless contexts used synthetic account/catalogue/artwork fixtures, mocked API mutations, blocked unexpected external traffic and a dedicated loopback server. Unexpected-request/browser-error counters stayed zero. Ordinary application builds retained a false Open Library gate; only the separate harness enabled the Discover feature prop. No real account, existing profile, persistent browser storage, PHP server, live provider, staging/production or database was involved.

### Retained visual findings

All six selected images were opened and inspected during implementation (370,277 bytes total). Desktop captures were 1440×900 full-page; mobile was 390×844 touch emulation. Two supplementary mobile frames from the final run exposed sections below the initial viewport. No existing image or historical evidence was overwritten.

| Archived capture | Inspected finding |
| --- | --- |
| `desktop-cleared-open-library-results.png` | Empty focused input and disabled Search; original `lantern` count/card, Edition language and quick-add readable with Details closed |
| `desktop-cleared-open-library-return-idle.png` | Dark theme: empty field and normal title/author/ISBN idle message, no old card, Open Library still selected |
| `mobile-cleared-open-library-results.png` | Light theme: empty input, selected provider and compact controls above fixed navigation; retained cards below viewport, established by assertions and supplementary capture |
| `mobile-cleared-open-library-return-idle.png` | Dark theme: empty input and readable unchanged provider/filter controls; idle message below initial viewport |
| `mobile-cleared-open-library-visible-card.png` | Retained original count/card, cover, metadata, language, quick-add and closed Details readable above fixed navigation; paired capture/assertions establish empty input |
| `mobile-cleared-open-library-idle-message.png` | Empty field, unchanged controls and normal idle message after return; no old card, message/attribution above fixed navigation |

No new overflow/overlap was observed. These deliberate scroll-position captures do not establish full-page mobile or physical-device acceptance. The existing native desktop language-matching option remained truncated. Synthetic covers do not establish provider quality or branding delivery.

### Historical failures, warnings and limits

The initial focused browser run passed 13 tests and failed three: two alert locators matched both the Open Library error and an unrelated empty removal announcement; one mobile Google Books Home navigation wait timed out with a fully installed/frozen fake clock despite the snapshot showing navigation. The locator was scoped to the Open Library region and the TTL fixture changed to Date-only advancement, leaving timers/animations running. All 16 focused tests then passed with clean exit; these fixture fixes required no application workaround.

A subsequent regression reproduced an unnecessary 22nd provider request (21 expected) after snapshot eviction, an API-cache hit and later TTL expiry. Promoting a displayed cache hit into a bounded return snapshot fixed it without extending API expiry. Nonempty draft-return and blank-submit-after-clear checks were also added. Final focused/unit/build results and the final 86-test browser rerun include those changes; the earlier full browser pass predates them. No unresolved assertion or teardown failure remained.

Expected negative fixtures and existing suites emitted sanitized provider errors, unmatched-route/Vite WebSocket warnings and experimental timer notices. Playwright emitted `NO_COLOR`/`FORCE_COLOR` warnings with possible PowerShell native-stderr wrapping; Git emitted LF/CRLF warnings. Raw logs, traces, video, profiles, cookies and large generated reports were not committed.

Snapshots are bounded in-memory SPA display state: eviction or a fresh document/direct URL can require another request. Retained Open Library cards can outlive trusted server metadata and receive the existing save 409, requiring an explicit renewed search/inspection; saving never substitutes an Edition or deletes shared server state. No combined PHP preview, new real-database verification, live-provider, independent deployed-browser, physical-device or screen-reader acceptance was performed. These results do not establish deployed availability. PR #13 remains open; PR #14 remains ready for review. Merge/deployment require separate approval; merging to main triggers the existing staging deployment. Branch deletion is not authorized.
