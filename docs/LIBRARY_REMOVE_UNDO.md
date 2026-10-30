# Library removal Undo — Batch 5 / B6

Implemented from `73066317f0ae465c76192dbf94e5539114e6d279`. The original B6 finding in the owner's `MYFUNLIST_UI_AUDIT.md` described immediate removal without recovery and uncertainty about saved tracking data. That read-only report and its evidence were preserved.

## Architecture and timing

`useLibrary` owns an account-scoped in-memory removal queue. Both Library and Media Detail Remove actions schedule a job for the exact original Library entry. The canonical `libraryItems` array and repository keep the original record; only the Library display projection hides pending items. Filters and sorting continue to apply to that projection. Other surfaces still recognize the existing Library entry and disable its mutation controls while removal is pending.

Each job has its own eight-second deadline. Repeated Remove clicks reuse the same job. Undo before that deadline clears its timer and shows the existing record again. It does not send DELETE, POST or PATCH and cannot replace `user_media.id`, provider identity, tracking values or list associations. Multiple pending removals can be undone independently.

At the deadline, Undo is no longer available. The existing session-authenticated, CSRF-protected DELETE runs. Account generation, current account and exact entry ID are checked again after asynchronous CSRF resolution and before dispatch. The response wait is bounded to 11 seconds; timeout cannot guarantee that the server did not complete the request. Only confirmed success removes canonical Library state and invalidates Custom List caches. Existing server cascades remain responsible for list membership deletion. No PHP contract, schema or migration changed.

Failed requests show the original local item again and announce that removal could not be confirmed. A refresh is advised before a new removal attempt. There is no automatic retry or attempt to rebuild records. Undo never appears for an expired, dispatched or failed job. Completed/error/undone notices remain available until dismissed or private state is reset.

## Navigation and interrupted work

| Event | Defined behavior |
| --- | --- |
| SPA navigation / Library or Detail component unmount | The shared job and original deadline continue; the notice panel remains available on the new page |
| Undo on a different route | Cancels the same job; the Library item appears when its route/filter is shown again |
| Refresh, external navigation, tab closure or application unmount before dispatch | Unsent jobs are cancelled. `pagehide` clears timers and prevents a queued CSRF-dependent DELETE. No unload mutation or beacon is sent |
| Browser crash before dispatch | In-memory intentions disappear; the persisted Library record is unchanged and a new page reads it normally |
| Logout or account switch | Pending jobs/timers/private notices are cleared; late responses cannot affect the next account. An already-dispatched request still belongs to the account/session used when it was sent |
| Forced Library reload | Clears pending intentions and reloads server state; no deletion is replayed |
| Refresh/closure/logout after dispatch | A request may still complete on the server. It cannot be undone or retracted reliably; the visible notice explains this before dispatch, and a new page reads current server state |
| Background tab / browser suspension | Timer execution may be delayed. Undo checks the absolute deadline, so suspension does not extend it |
| Back/forward cache restoration | Unsent jobs cancelled by `pagehide` stay cancelled; sent requests may finish and update the retained document |

No private removal queue or record snapshot is written to browser storage, URLs or history payloads.

## Accessibility and responsive behavior

The app-level notice panel names the media and explains the eight-second Undo window and eventual Custom List removal. Persistent polite status and assertive error regions announce changes without announcing a countdown each second. Undo/Dismiss are native named buttons with at least 44×44 CSS px targets and existing keyboard focus styling. Removing a card moves focus to its Undo button; Undo returns focus to the restored Remove control when present, or to the notice action on another route. Expiry moves focus off the disappearing Undo button to its notice. Dismiss returns focus to another notice action or the page heading.

The panel wraps long titles, has a constrained viewport-relative width and scrollable height, uses existing Light/Dark tokens, and sits above mobile bottom navigation and safe-area insets. These CSS choices are implemented; jsdom assertions do not establish rendered browser geometry or screen-reader behavior.

## Verification and remaining acceptance

Focused automated coverage is in `tests/libraryRemoval.test.js` and `tests/libraryRemovalUx.test.js`. Existing Library, Detail and list-cache regressions now explicitly advance the deferred deadline where they previously expected an immediate DELETE. Tests use a controlled clock and fetch doubles, with no live account/provider/database writes.

Automated validation passed: `npm test` (**256 tests**, including **29 new Undo regressions**) and `npm run build`. No PHP checks were needed because backend code was unchanged. No database-writing tests or migrations were run.

Fresh live-browser QA remains required at **320×740, 390×844, 768×1024 and 1440×900**, each in Light and Dark:

1. Remove a disposable rated item belonging to a disposable Custom List; verify the title notice and absence of an immediate DELETE.
2. Reach Undo by keyboard and activate it. Verify the same Library ID, source/ID, status/rating, list membership and filter/sort position, with no reconstruction requests.
3. Remove two items independently; Undo one, allow the other deadline to expire, and verify exactly one DELETE and its cascade after success.
4. Navigate away during the window; test Undo on the other route and the unchanged deadline when returning.
5. Refresh before dispatch and verify that the original record/memberships survive. Check a slow dispatched request separately; do not assume closing the page cancels server execution.
6. With safe request interception, exercise failed/timed-out DELETE and account changes during CSRF/DELETE, checking announcements and absence of cross-account writes.
7. Inspect long titles, multiple notices, focus visibility/return, mobile-navigation clearance, document overflow and actual screen-reader announcements.

No new local preview, staging live-browser QA, physical-device testing or screen-reader session is asserted by this document. Staging workflow and HTTP checks are reported separately in delivery. Deferred removal is isolated to this browser session; other tabs/devices do not automatically hide its pending items or synchronize external changes.
