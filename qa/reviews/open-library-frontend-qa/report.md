# Open Library frontend QA — 5 November 2026

**Recommendation: NOT READY for activation.** The existing frontend passes mocked regression and local headless checks after one focused fix. Operational/policy evidence review, pilot scope/acceptance and explicit activation/deployment approval remain open. See the [exact flags, deployment checks and safe activation/rollback plan](../../../docs/OPEN_LIBRARY_FRONTEND_ACTIVATION.md).

Base: latest fetched `origin/main`, `e640958`. Review branch: `review/open-library-frontend-qa`. No backend, migration, deployment workflow or environment configuration changed. The owner reports migration 005 and Hostinger CLI/HTTP smoke success; those results were not rerun or independently validated here.

## Findings and verification

| Area | Finding / result |
| --- | --- |
| Cooldown — fixed | Component-local state previously disappeared on unmount: receive 429/503, switch to Google, return to Open Library before the deadline, and another pilot request was sent. A new unit regression reproduced two requests instead of one. The service now retains the original deadline across SPA remounts, and the component restores disabled controls for the remaining time. Both unit and browser regressions pass. |
| Disabled gate / Google | Real application smoke tests retain build flag false and zero pilot requests. Explicit Google search, language caveat, attribution placement, detail and return navigation remain functional with synthetic data. Enabled-component tests never merge or silently fall back to Google results; switching resets provider-specific filters. |
| Work / Edition | Separate `OL101W` / `OL202M`, Work year / Edition date, provenance, catalogue links and honest missing-data placeholders. Native disclosure and preview selection are keyboard operable. Preview remains transient; all non-GET traffic is blocked, and no Library Add action or write occurs. Missing/conflicting/ambiguous selections remain ineligible in component tests. |
| Search / language | General, Title, Author, checksum-valid/invalid ISBN; Any/English/Dutch/Turkish; preferred/strict and strict-response validation. No per-keystroke requests. Route history and provider-specific filters remain separate. |
| States / retry | Loading, empty/omissions, local invalid input, malformed data, unactivated 404, busy 503, rate-limited 429 and unavailable 503 remain distinct. Two-second busy and sixty-second unavailable minimums, plus a longer ninety-second Retry-After, are tested. Expiry enables manual actions without sending a request. |
| Cache / stale | Empty/success caching, filter-key separation, concurrent deduplication, five-minute expiry and twenty-entry eviction pass unit tests. Browser Back uses cache. Late responses cannot replace newer filters or switched providers. New tests also reject cache/cooldown writes after cache-generation reset. |
| Layout / accessibility | Desktop/mobile Light/Dark screenshots inspected. No observed horizontal overflow or clipped long identifiers; controls fit viewport. Native labels/disclosure, polite status/alert regions and keyboard preview checked. Additional 320px/768px layout and 44px card-action height assertions pass. This is not a screen-reader, contrast audit or physical-device acceptance. |
| Nonblocking copy | The existing count says “1 Works shown” for one result. No speculative presentation changes were made. |

Cooldown is public in-memory page state, shared only within that SPA instance. Reloads and other tabs do not share it; backend admission remains authoritative. No persistence or automatic retry was introduced.

## Executed checks

Final full checks used checksum-verified official Node **24.15.0** from a task-specific temporary directory, leaving system Node/dependencies unchanged. npm scripts were invoked through that runtime's `node.exe` and the installed npm CLI; child processes used the same runtime on PATH.

| Command | Exact final result |
| --- | --- |
| `npm test` | **349 total: 337 passed, 12 skipped, 0 failed**, 34.3s. Existing Linux/POSIX diagnostic skips on Windows. Includes all 19 focused Open Library service/view tests. |
| `npm run build` | **Passed**, 95 modules, 1.50s. Test HTML/harness identifiers absent from `dist`; normal build gate remains disabled. |
| `npm run test:ui` with `QA_REVIEW_TASK=open-library-frontend-qa` | **14 passed, 0 failed**, 23.2s; seven each desktop/mobile, fresh contexts, Chromium headless shell **156.0.8078.4**, Playwright **1.64.1**. Zero unexpected network/browser events in final run. |
| `node --test tests/openLibrary.test.js tests/openLibraryView.test.js` | Preliminary focused run **19 passed, 0 failed** on system Node 24.11.0; all included again in final supported-runtime run. |
| Documentation/artifact checks | 39 internal link targets and Markdown fences checked; `git diff --check` passed; production environment gate confirmed absent/false without printing private values. |

Isolation: dedicated fresh loopback Vite server on `127.0.0.1:4179`, no backend proxy/private env files, no persistent profile. Ordinary app gate stays false. A separate Vite-served test entry injects the existing `enabled` component prop solely for synthetic acceptance. All pilot, Google, session, detail, cover and branding responses are intercepted; unknown external requests and all non-GETs are blocked. Documentation pages were consulted separately; no live provider search was made.

Earlier reproducible harness/environment failures, now resolved: the baseline six assertions passed but Windows process restrictions caused teardown timeout (180s), leaving this task's server and preventing subsequent starts. Only the verified task-owned server processes were terminated; running headless QA with process permissions restored clean teardown. The first enabled harness produced console failures and ambiguous alert/loading locators; a Vite-served HTML entry and scoped locators fixed them. A real-time-progressing browser clock made the one-millisecond cooldown boundary flaky; a paused clock now verifies it deterministically. No visible-browser fallback or network-assertion suppression was used. Remaining runner warning: `NO_COLOR` ignored because `FORCE_COLOR` is set; no application warning in final run.

Automated tests/build and **local mocked browser QA** were performed. A separate manual preview, staging deployment, independent live-browser QA, real provider availability/relevance, screen-reader and device testing were **not** performed. No PHP/database tests were needed or run for these frontend-only changes.

## Visually inspected evidence

All eight PNGs contain only synthetic metadata/artwork and anonymous UI; no cookies, tokens, profiles, real people, private settings, traces or videos. Total PNG size is 515,272 bytes (approximately 503 KiB). Desktop images are full-page at 1440×900 viewport; mobile images are 390×844 viewport crops with the fixed navigation at its real position.

- Open Library desktop: [Light](desktop-open-library-light.png), [Dark](desktop-open-library-dark.png). Clear hierarchy, separate identities/dates, readable disclosure/preview and attribution; no overlap observed.
- Open Library mobile: [Light](mobile-open-library-light.png), [Dark](mobile-open-library-dark.png). Edition details wrap within the card; preview/link and attribution remain readable when scrolled. The Light crop starts inside the expanded card and ends near the fixed navigation; it is not a full-page representation. Dark shows the bottom of the card and attribution clear of navigation.
- Google Discover compatibility: [desktop Light](desktop-discover-light.png), [mobile Light](mobile-discover-light.png). Compact card and language caveat fit; attribution graphic is explicitly a mock and does not establish actual Google branding/CSP delivery.
- Google Detail compatibility: [desktop Dark](desktop-detail-dark.png), [mobile Dark](mobile-detail-dark.png). Title/authors/actions wrap cleanly, with no obvious navigation overlap.

These are temporary review artifacts. Preserve them for review; before an approved merge remove only this task's generated evidence and update its references unless the owner explicitly retains it. Historical QA/evidence is unchanged. No merge, deployment, activation or branch deletion is authorized by this report.
