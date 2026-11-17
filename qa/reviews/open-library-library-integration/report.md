# Open Library Library integration review

17 November 2026. Branch: `review/open-library-library-integration`. Base: freshly fetched `origin/main`, `e6643de` (merged PR #11). Temporary sanitized review evidence. Preserve historical evidence; remove only this task's new evidence before an approved merge unless permanent retention is approved. Design and operational limitations: [integration document](../../../docs/OPEN_LIBRARY_LIBRARY_INTEGRATION.md).

## Scope and isolation

Exact `open-library/book/OL…M` saving through the existing authenticated Library, separate Work provenance, shared trusted-cache resolution, persisted public details, existing tracking/Lists/navigation, and responsive save states. Google Books remains default. No migration, access-flag, provider-budget, Hostinger or GitHub Actions settings change.

Safe PHP tests use HTTP/PDO doubles only. The new guarded persistence suite could not connect to the isolated test database and failed before writes; it did not fall back to another database. No destructive migration/reset/rebuild, full `composer test`, live provider, staging or production data was used.

Chromium used new ephemeral headless contexts, synthetic sessions/catalogue metadata/artwork, mocked API mutations, blocked unexpected external requests and the dedicated loopback-only Vite server. The ordinary Open Library build flag stayed false; only the existing isolated component harness enabled synthetic search responses. No visible browser, existing profile, real account or remote provider/database was used. Browser reload assertions establish mocked UI continuity, not actual MySQL persistence.

## Executed checks

| Command/check | Result |
| --- | --- |
| `npm test` | Final: 376 total, 364 passed, 12 existing Linux/POSIX skips on Windows, 0 failed; exit 0 |
| `npm run build` | Passed; 118 modules, production assets generated; exit 0 |
| `npm run test:ui` | Passed all 68 desktop/mobile tests in 3.9 minutes; clean teardown and exit 0 |
| `npm run test:ui -- tests/ui/openLibraryLibrary.spec.js` | Three focused runs each passed all 4 tests; initial 34.3s, evidence export 21.2s, final mobile-focused capture 19.9s; exit 0 each |
| `php backend/tests/database_safety.php` | Passed; no database opened |
| `composer --working-dir=backend run test:providers` | Passed: HTTP 28, Open Library adapter/cache 87, admission/access 150, storage/failure 55, new Edition 82, media detail 313 assertions; discovery suite passed |
| `composer --working-dir=backend run test:api` | Passed: router 105, media API 332, rate-limit pipeline 52, memberships 22 assertions |
| PHP syntax checks | All 83 PHP files in source/config/public/bin/tests passed |
| `composer --working-dir=backend validate --strict` | Passed |
| Guarded test-database read-only preflight | Failed: isolated test database unavailable; no writes performed |
| `composer --working-dir=backend run test:open-library-library` with explicit testing/loopback/exact test DB guards | Failed before writes: `Isolated myfunlist_test database unavailable; no writes performed.` Real persistence/constraints/ownership/List cascades remain unverified for this new source |
| Local Markdown targets/headings, scoped diff and `git diff --check` | Passed: 79 local file/heading links across five changed/new Markdown documents; protected schema/configuration/deployment paths unchanged |
| Combined PHP/local production preview | Not performed; browser checks used the dedicated mock development server |
| Hostinger/staging deployment/private settings | Not performed |
| Independent live-browser/physical-device/screen-reader acceptance | Not performed |

Project scripts use Node 24.22.1 with its runtime directory prepended to PATH; final build and capture commands explicitly invoke the installed npm CLI through that Node executable. PHP is 8.2.12. Playwright 1.64.1 uses managed headless Chromium 156.0.8078.4, revision 1248. Desktop is 1440×900 and mobile 390×844 with touch emulation, not a physical device. Existing and new responsive checks also cover 320px and 768px.

The first focused export set `QA_REVIEW_TASK=open-library-library-integration`. The later focused run wrote into ignored `test-results/`; only its two clearer mobile frames were copied under new names here. No image or historical evidence was overwritten. Ten PNGs total occupy 952,929 bytes. Raw logs, traces, video, profiles, storage state and large generated reports are not committed.

## Coverage and findings

Server checks reject Work IDs as save/detail identities, malformed/noncanonical IDs, untrusted browser metadata, missing Edition titles, unusable language data, expired/missing/conflicting trusted snapshots and oversized UTF-8 metadata. They preserve separate Work identity, cover provenance, client admission, forwarding-header resistance, outstanding reservations, spacing/cooldown and fail-closed storage behavior. Auth/CSRF rejection is exercised through the real bootstrap before database access. Cache hits and persisted detail cause no upstream requests, including during a synthetic outage. Google identities remain distinct and existing provider/API suites pass.

Frontend checks cover anonymous Login links without writes, membership loading/errors/retry, identity-only CSRF-protected saves, double-click suppression, In Library and saved-detail links, expired-trust recovery without automatic search, save cooldown/manual retry, retained search cooldown, and stale responses/account changes. Headless checks exercise Want to Read/Reading/Finished, 0.5/8.5/10 ratings, Comfortable/Compact/List layouts, title filtering, Remove/Undo without DELETE, Custom List membership and reload, separate Work/Edition detail fields/attribution, and Back to Library/List. Existing Google/default-provider, search-language/ISBN, accessibility/disclosure and provider-isolation regressions remain green.

## Selected screenshots and actual inspection

All ten images were opened and inspected. They contain only synthetic catalogue data/artwork and account state; actual provider branding and content quality are not validated.

| Primary evidence | Inspected finding |
| --- | --- |
| [Desktop save, Light](desktop-after-open-library-save-light.png) | Separate Work/Edition panels, ISBN/language caveat, provider attribution and exact-Edition Add action remain clear; no new overlap |
| [Mobile save, Light](mobile-after-open-library-save-light.png) | Long metadata wraps; preview, Edition link, Add action and exact-Edition explanation fit above fixed navigation |
| [Desktop Library, Dark](desktop-after-open-library-library-dark.png) | Persisted selected-Edition title/artwork, 8.5 rating, status, filter and density controls remain readable |
| [Mobile Library controls, Dark](mobile-after-open-library-library-controls-dark.png) | Focused card frame shows full rating and status control above fixed navigation; long title wraps |
| [Desktop saved detail, Light](desktop-after-open-library-detail-light.png) | Edition title/ID/publication remain separate from Work title/ID/authors/year; tracking controls, snapshot caveat and both attribution links are present |
| [Mobile detail metadata, Light](mobile-after-open-library-detail-metadata-light.png) | Distinct Edition/Work fields and long Work title wrap in two columns; saved-snapshot/language caveat remains readable. Attribution links are further below this viewport |
| [Desktop Custom List, Dark](desktop-after-open-library-list-dark.png) | Saved Edition appears with personal rating/status and the existing membership controls; source identity routes correctly |
| [Mobile Custom List, Dark](mobile-after-open-library-list-dark.png) | Title, rating, status and membership-removal action remain readable above fixed navigation |

Two supplementary original frames remain preserved: [initial mobile Library](mobile-after-open-library-library-dark.png) includes the filters/card but ends as rating enters the fixed-navigation edge, with status below the viewport; [initial mobile detail controls](mobile-after-open-library-detail-light.png) shows Back/title/status/rating/List action but not the later metadata section. The additional focused frames above clarify those sections without replacing the originals. Controls were exercised successfully; the first Library frame is a capture-position limitation, not proof of permanent obstruction.

No new horizontal overflow was observed in selected images or assertions. The existing long native desktop language-matching label remains visually truncated, as recorded in earlier QA; the native option is accessible and unrelated layout was not changed. Mobile screenshots are viewport captures at deliberate scroll positions, not full-page physical-device acceptance.

## Failures, warnings and remaining work

An intermediate focused unit run failed because a direct WorkCard mount did not provide a router for its new Login link. The fixture now mounts with the existing test router. The first full unit run also failed one obsolete assertion in `tests/openLibrary.test.js` that expected every Open Library detail identity to be unsupported. It now asserts the canonical Edition route and still rejects Work routes. Final focused/full unit runs pass. These were test-fixture/expected-contract updates, not a reason to remove coverage.

The guarded real-database failure remains unresolved. Reproduce only against the existing empty disposable test database, following [Development safeguards](../../../docs/DEVELOPMENT.md#database-and-http-tests): explicitly set `APP_ENV=testing`, `DB_DATABASE=myfunlist_test`, and loopback `DB_HOST`, then run `composer --working-dir=backend run test:open-library-library`. The suite refuses other targets and performs no schema setup/reset; do not substitute development/staging/production or bypass its guards. A successful run is still required to establish this source's actual database persistence/constraints and List cascade behavior.

Expected PHP negative fixtures emit sanitized provider/storage errors. Existing parallel unit fixtures emit unmatched-route and Vite WebSocket-port warnings; assertions and teardown pass. Playwright emits `NO_COLOR`/`FORCE_COLOR` warnings, which PowerShell can wrap as native stderr messages despite command exit 0. Composer may report an unwritable local cache and continue without caching. Git emits LF/CRLF conversion warnings. No headless launch/teardown failure or headed fallback occurred in this task.

Cache-only saving deliberately requires fresh, consistent trusted server metadata. It adds no live Edition/Work/author lookup or metadata refresh; saved details may be incomplete or stale. Conflicting snapshots may require waiting for expiry rather than merely resubmitting. Anonymous Login uses the existing flow and does not automatically return/save. Actual database verification, private release readiness and independent deployed acceptance remain open. No merge, deployment, branch deletion or live-availability claim is authorized by this report.
