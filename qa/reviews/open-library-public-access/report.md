# Open Library public access review

16 November 2026. Branch: `review/open-library-public-access`. Base: freshly fetched `origin/main`, `66f1fc7`. Temporary review evidence; retain until reviewed and remove only this task's evidence before an approved merge unless permanent retention is explicitly approved. Historical evidence remains unchanged.

## Scope and isolation

Default-disabled private public-access switch, tester-only fallback, unchanged provider protection, public-facing copy, strict deployment access modes, regression coverage and release instructions. No schema/migration/provider-limit changes. Google Books remains default and Open Library manually selectable/read-only.

PHP uses provider/PDO doubles that reject unrelated SQL. No live provider or database-writing suite was run. Chromium runs in new ephemeral headless contexts with synthetic sessions, metadata and artwork, unexpected network traffic blocked and a dedicated loopback-only Vite server. The normal Open Library flag stays false; the isolated enabled-component harness fulfills synthetic pilot requests without forwarding them. No visible browser, existing profile, real account, staging browser or production data was used.

## Executed checks

| Check | Result |
| --- | --- |
| `npm test` on final unit/frontend changes | Passed: 357 tests, 12 existing Windows skips for Linux/POSIX diagnostics, 0 failures (369 total) |
| `npm run build` | Passed: 116 modules, production assets generated |
| `npm run test:ui` | Final supported-runtime rerun passed: all 64 desktop/mobile tests, clean teardown, exit 0, 4.0 minutes; initial teardown failure retained below |
| `php backend/tests/database_safety.php` | Passed; no database opened |
| `composer --working-dir=backend run test:providers` | Passed: HTTP 28, Open Library adapter/cache 87, admission/access 150, storage/failure 55, media detail 313 assertions; discovery suite also passed |
| `composer --working-dir=backend run test:api` | Passed: router 105, media API 332, rate-limit pipeline 52, memberships 22 assertions |
| PHP syntax | Passed for all 79 PHP files under source/config/public/bin/tests; changed admission file rechecked after its final extension |
| `composer --working-dir=backend validate --strict` | Passed |
| `git diff --check` and local Markdown targets | Passed; local link targets and referenced heading anchors validated before commit |
| Local production/combined PHP preview | Not performed; headless tests use the dedicated development test server |
| Hostinger/private configuration/deployment | Not performed |
| Independent staging/live-browser QA | Not performed; public availability unverified |

Final Node unit/build checks use the installed Node 24.22.1 runtime with its directory prepended to PATH and the existing npm CLI invoked through that Node executable. PHP is 8.2.12. Playwright is 1.64.1 with managed headless Chromium revision 1248 (package version 156.0.8078.4). Desktop viewport is 1440×900; mobile is 390×844 with touch emulation. Existing responsive checks additionally cover 320px/768px. This is not physical-device acceptance.

Regression coverage exercises anonymous sessionless search, arbitrary authenticated accounts without tester membership, ignored/missing allowlist in public mode, absent/malformed public switch retaining 401/403, disabled pilot precedence, admission/cache/global spacing, forwarding-header spoof resistance, provider 429/503/502 cooldown, database fail-closed and stranded reservations. Queryless public 422 is asserted with unchanged HTTP-call count, no reservation and no session. Frontend/unit/headless regressions retain Google default/isolation, language/ISBN and Work/Edition semantics, no saving, manual Retry/cooldown and public wording. Deployment tests require exactly one response per mode, malformed-response safety, explicit configuration before SSH and no probe query/cookies/redirects/retries.

## Selected screenshots and inspection

All selected files were actually opened and inspected. They contain only synthetic catalogue data. Provider attribution artwork is a local mock and does not validate real branding delivery.

| Evidence | Findings |
| --- | --- |
| [Desktop Open Library light](desktop-open-library-light.png) | Public catalogue label and read-only badge visible; Work/Edition identity, dates, ISBN, language caveat, attribution and unsupported-saving explanation remain distinct; no Add action |
| [Desktop Open Library dark](desktop-open-library-dark.png) | Same readable public header, controls, complete synthetic artwork, separate Work/Edition panels and read-only preview; independently recaptured on the final run with an identical SHA-256, so only one copy is retained |
| [Mobile Open Library light](mobile-open-library-light.png) | Separate Work/Edition panels wrap long metadata; preview button and notice stay above fixed bottom navigation |
| [Mobile Open Library dark](mobile-open-library-dark.png) | Read-only preview, provider links, attribution and saving limitation remain readable and unobstructed |
| [Desktop Google discovery](desktop-discover-light.png) | Google selected, search/filter controls, provider-order result, explicit language caveat and provider link retained |
| [Mobile Google discovery](mobile-discover-light.png) | Result/title/author/link and login-to-add action fit the viewport; bottom navigation remains clear |
| [Desktop Google detail](desktop-detail-dark.png) | Existing detail route, Back context, Library login prompt and metadata remain intact |
| [Mobile Google detail](mobile-detail-dark.png) | Long title wraps beside artwork; Library prompt fits above subsequent content and fixed navigation |

No new horizontal overflow or overlap was observed in these captures. The existing native language-matching select truncates its long selected label on desktop; the option remains keyboard/native-select accessible and this task does not alter its layout. Mobile Open Library captures are scrolled to the read-only edition content, while desktop captures include the changed public header. Screenshot assertions and synthetic fixtures cannot establish real provider quality or effective server authorization.

## Warnings, failures and reproduction

The first full headless run, launched through system Node 24.11.0, completed all 64 tests but reported `Timed out waiting 300s for the teardown for plugin setup to run` and one error outside tests. This is recorded as a failed command, not a clean browser-suite pass. The shell wrapper's successful environment cleanup obscured the underlying command exit status; the Playwright diagnostic is authoritative. Only the verified leftover test Vite/npm processes were stopped. The same repository headless configuration was rerun using supported Node 24.22.1 with execution permission for Windows process cleanup; no headed fallback, timeout relaxation or isolation change was made. The cause is not established solely by a successful rerun. Reproduction for the initial issue: run the full `npm run test:ui` under system Node 24.11.0 in the restricted Windows execution context and observe teardown after assertions.

An intermediate unit rerun caught one old unavailable-message assertion in `browsingContext.test.js`; it was updated to the new public-facing message while retaining its zero-additional-provider-call assertion. Final unit tests pass. Expected negative PHP fixtures emit sanitized provider/storage errors; they do not indicate real service failures. Playwright emits harmless `NO_COLOR`/`FORCE_COLOR` warnings. Git reports existing LF/CRLF conversion warnings. No secrets, cookies, raw traces, videos, profiles, large reports or real personal data are included.

Before public activation, the [private release record and exact rollout order](../../../docs/OPEN_LIBRARY_PUBLIC_ACCESS.md) still require registration/use-case suitability, monitored User-Agent/contact, effective web-worker settings, authoritative shared database readiness, real-client `REMOTE_ADDR` behavior on Hostinger and emergency operator access. None was independently established by these local checks.
