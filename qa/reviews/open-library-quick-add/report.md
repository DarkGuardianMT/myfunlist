# Open Library quick-add review

17–18 November 2026. Branch: `review/open-library-quick-add`. Base: freshly fetched `origin/main`, `44de0ea` (merged PR #12). Temporary sanitized evidence for this review; preserve unrelated historical evidence. See the [integration design and quick-add scope](../../../docs/OPEN_LIBRARY_LIBRARY_INTEGRATION.md#quick-add-review-candidate).

## Scope and behavior

The Work card now renders its existing `OpenLibraryEditionSave` component outside Edition Details, directly under the selected Edition language. Details remains optional for metadata/preview inspection and never contains a duplicate save control. The existing canonical Edition/title/Work/language eligibility check is unchanged. Only the supplied valid `selectedEdition` can be saved; there is no alternative selection, invented Edition or Work-ID save. Missing/unsupported selections explain their unavailability on the closed card.

The save component, authentication, membership/loading, account guards, double-click prevention, identity-only request, CSRF and error/manual-cooldown handling are reused unchanged. No backend, database, provider default, cache, rate-limit, hosting or workflow change is included. No database was accessed in this task.

## Commands and results

| Check | Result |
| --- | --- |
| `node --test tests/openLibraryView.test.js` | Passed all 16 focused tests; exit 0 |
| `npm test` | 377 total: 365 passed, 12 existing Linux/POSIX skips on Windows, zero failures; exit 0 |
| `npm run build` | Passed; 118 modules, production assets generated; exit 0 |
| `npm run test:ui -- tests/ui/openLibraryLibrary.spec.js --grep "quick-add stays visible"` with fresh `QA_REVIEW_TASK=open-library-quick-add` | Both desktop/mobile assertions passed and four sanitized screenshots exported. The sandboxed runner stalled during server teardown; its verified process tree was stopped manually. This was not a clean successful command exit |
| Full isolated headless `npm run test:ui` | **70 desktop/mobile tests passed in 4.3 minutes; clean teardown and exit 0**. Executed with permission for normal child-process cleanup, without changing headless configuration |
| Documentation links, scope and `git diff --check` | Passed; 64 local Markdown file/heading links, focused component/test/documentation/evidence diff, unchanged backend/shared save/auth/Library/provider/configuration paths |

Checks use Node 24.22.1 with its runtime directory prepended to PATH and the installed npm CLI explicitly invoked through that Node executable. Playwright 1.64.1 uses managed headless Chromium 156.0.8078.4, revision 1248. The four selected PNGs total 327,457 bytes.

## Coverage and isolation

Unit regressions establish that direct save and language text are outside the closed disclosure; toggling it creates no second save control; request identity remains the exact selected Edition; duplicate clicks create one write; existing membership and loading/error/retry/account/cooldown behavior remain covered. Invalid/missing Edition identity/title and conflicting/mismatched/ambiguous language selections expose an explanation outside Details and never mount a save component. Language labels use supplied tags only, map English/Dutch/Turkish names, retain unknown codes and display Not supplied for absent tags.

The new desktop/mobile headless scenario displays valid, missing, untitled and ambiguous-language selections together. It verifies a visible enabled direct action with closed Details, one save control after disclosure toggling, visible unavailability explanations, no automatic writes and 44px action height/no page overflow at 320px and 768px. The existing integration flow now saves with Details closed, checks exact request identity/double-click deduplication, and retains tracking, rating, layouts, Lists, reload/Undo and detail navigation. Anonymous Login and cache-expiry/outage feedback are exercised without first opening Details.

Browser checks use fresh ephemeral headless contexts, synthetic catalogue/account/artwork fixtures and mocked API mutations. Unexpected external requests are blocked. Only the dedicated loopback Vite server is used; the ordinary Open Library build gate remains false and the isolated component harness supplies synthetic responses. No visible browser, existing profile, real account, live provider, PHP server or database is used.

## Selected screenshots and visual inspection

All four exported images were opened and inspected. Desktop: 1440×900, full-page capture. Mobile: 390×844 touch emulation, viewport capture at the direct action. Additional assertions cover 320px and 768px; this is not physical-device acceptance.

| Evidence | Inspected finding |
| --- | --- |
| [Desktop Light](desktop-quick-add-light.png) | One Add to Library action and Dutch Edition language are visible with Details closed. Four compact poster cards retain readable metadata; missing/untitled/ambiguous selections explain unavailability without a save action |
| [Desktop Dark](desktop-quick-add-dark.png) | The same states retain readable lime/text contrast and clear separation between the primary action and optional Details |
| [Mobile Light](mobile-quick-add-light.png) | Two-column layout fits; language sits immediately above the full-width 44px Add button, exact-Edition caveat wraps, and the adjacent missing-Edition explanation is readable; no overlap with fixed navigation |
| [Mobile Dark](mobile-quick-add-dark.png) | Direct action, language, caveat and closed Details remain readable above fixed navigation; cards retain compact two-column layout |

No new horizontal overflow or overlapping controls was observed. Mobile frames deliberately crop upper covers/later cards to show the action area; they are not full-card/page acceptance. The existing long native desktop language-matching option remains visibly truncated, as recorded in earlier QA. Catalogue language tags are claims, not verification of book content. Synthetic artwork does not validate real provider branding or cover quality.

## Failures, warnings and limitations

The initial focused UI run passed both test bodies but stalled after reporting them, with its isolated Vite process still running. Default-sandbox process inspection was denied; a permitted read-only process-tree inspection identified only the task's npm/Playwright/Vite descendants. Those verified descendants were stopped, ending that run with exit -1. The full headless suite was then rerun with permission for normal process cleanup and passed all 70 tests with clean teardown/exit 0; there was no headed/debug fallback and no unrelated server was stopped. Screenshots from the passing assertions remain preserved rather than overwritten. No unresolved assertion or final-run teardown failure remains.

Existing unit fixtures emit unmatched-route/Vite WebSocket warnings. Playwright emits `NO_COLOR`/`FORCE_COLOR` warnings that PowerShell wraps as native stderr. Git emits LF/CRLF conversion warnings. Raw logs and large generated test outputs remain ignored and are not committed.

This UI change retains cache-only saving: selected metadata must still be fresh and consistent on the backend, so a visible eligible action can receive the existing 409 and require an explicit renewed search. No automatic search, retry or Edition substitution was introduced. Saved metadata can remain incomplete/stale. Unknown catalogue language tags do not invent a content language. Existing Login does not automatically return/save.

No backend/database test was rerun because those files/contracts are unchanged. Local mocked browser QA does not establish real authentication/persistence, provider quality, deployed availability, independent live-browser, physical-device or screen-reader acceptance. No merge, deployment, Hostinger setting change or branch deletion was performed or authorized.
