# Open Library public access rollout

16 November 2026. Review branch: `review/open-library-public-access`, from freshly fetched `origin/main` at `66f1fc7`. This prepares public read-only discovery. No private settings, application registration, deployed database, merge or deployment have been changed. Public availability is **not verified**.

## Access contract

The existing GET `/api/v1/pilot/open-library/search` URL and response contract remain. Only private backend `OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED=true` opens anonymous and ordinary authenticated access. The value must be the exact string `true`; missing, false, empty or malformed configuration preserves tester-only authorization. It is disabled in `backend/.env.example`. No `VITE_` variable grants backend access.

| Effective backend configuration | Anonymous queryless response | Search access |
| --- | --- | --- |
| `OPEN_LIBRARY_PILOT_ENABLED` absent or anything except exact `true`, regardless of public switch | 404 `not_found` | None; before sessions, database, admission, validation or provider I/O |
| Pilot `true`, public switch absent/invalid/`false` | 401 `unauthenticated` | Existing session and exact private tester allowlist required; other accounts get 403 `forbidden` before coordinator access |
| Pilot `true`, public switch `true` | 422 `validation_error` with healthy shared configuration and available IP admission | Any visitor; no account, CSRF token, session read/start or allowlist required for this GET |

A public queryless probe consumes one of the five IP admissions but cannot reserve or call Open Library: query validation precedes cache lookup and provider reservation. Broken shared configuration/storage returns 503; exhausted admission returns 429. Neither is an acceptable verification substitute for 422. Do not automatically retry probes; investigate and wait for the existing allowance/cooldown if necessary. POST remains 405; Open Library canonical detail and Library identities remain unsupported.

Google Books remains the default. Open Library is manually selected and read-only, preserving Work/selected Edition labels, language/ISBN filters, public attribution, five-minute search caching and manual Retry. There is no Open Library Add to Library. The frontend gate still defaults to false in ordinary/local/headless configuration; staging's existing build flag is true.

## Provider protection

This change bypasses only tester authentication in public mode. It leaves admission and provider execution unchanged: five requests per rolling minute per canonical `REMOTE_ADDR`, HMAC identities, shared authoritative MySQL singleton, 1,024-client bound, one durable reservation, spacing of at least 1.1 seconds after completion, 20 cached responses for 300 seconds, bounded state, upstream 429/503 failure cooldown, no retries/polling/scraping, and fail-closed database/uncertain-worker handling. Cache hits and invalid queries consume admission. Forwarded headers remain untrusted. User-Agent/contact, transport deadlines and provider limits are unchanged. No schema or migration changes are needed.

The [current Open Library API guidance](https://openlibrary.org/developers/api), reviewed 16 November 2026, asks applications to register their use case, identify requests with application/contact information, cache responses and keep requests tied to human lookup. It excludes bulk harvesting and high-traffic commercial backend use. Public access requires an explicit suitability review; the published identified-client allowance is not a reason to increase this application's existing budget.

## Required private release record

Complete this record privately on the intended Hostinger release before public enablement. Share only sanitized pass/fail, reviewer, date and commit references; never environment dumps, raw IPs, contacts, secrets, cookies or private paths.

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Registration and use case | Confirm the previously reported form submission identifies MyFunList and covers anonymous, human-driven, low-volume discovery; document suitability against current guidance and any provider response/conditions | Owner previously reported submission; public use-case confirmation not independently verified |
| Identification | Privately inspect effective web-worker `OPEN_LIBRARY_USER_AGENT`; retain the existing MyFunList identity and managed contact, verify the mailbox is monitored and any provider conditions are met | Existing identification preserved in code; effective host value/contact not inspected here |
| Effective Hostinger settings | Exact commit on every web worker; pilot/public/shared-budget flags as intended; unchanged stable secret of valid length; production PHP/PDO limits and private environment precedence verified in web runtime, including worker refresh/opcache behavior | Pending private verification; CLI values alone do not prove web settings |
| Shared database readiness | Credit owner-reported migration 005 and completed CLI/HTTP smoke tests; confirm existing singleton is healthy and runtime SELECT/UPDATE permissions, one authoritative InnoDB primary, durable commits, database clock and shared egress remain valid for every worker/release | Historical owner evidence credited; current effective topology/readiness not independently inspected; no migration/reset/repair authorized |
| Real client IP | Establish PHP's effective `REMOTE_ADDR` reflects two known clients on distinct networks and is resistant to client-supplied forwarding headers | Application behavior covered by fixtures; Hostinger behavior pending, blocking public enablement |
| Emergency stop | Authorized operator can change the private switches, refresh all workers and verify stop; record access path and responsible operator privately | Procedure below; operational execution unverified |
| Independent staging acceptance | Exact commit/settings, workflow success, anonymous queryless 422, bounded human search, ordinary-account search, Google default/regression and read-only details | Not performed in this task |

For client-IP verification, have the host administrator/support correlate one ordinary request from each of two known networks with the **PHP-observed** `REMOTE_ADDR` through existing private host diagnostics/logs. HTTP access-log client addresses alone are insufficient if PHP sees a different proxy peer. Confirm canonical observed addresses correspond to the actual clients and differ across networks. With the same client, send a controlled request containing a synthetic `X-Forwarded-For`/`X-Real-IP`/`Forwarded` value and confirm it cannot choose PHP's observed address. Do not add a public diagnostic endpoint or log raw addresses into repository evidence. No real provider query is needed for this check. If a shared proxy address is observed, leave public access false and resolve trusted proxy/address restoration at the host; do not make PHP trust arbitrary request headers or increase limits. Record sanitized outcome after repeating the check on the effective host configuration.

## Exact staging activation order

1. Complete the private gates above and review this PR, including the preserved local verification below. Keep `OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED=false` (or absent) while deploying the new code. Preserve the existing enabled pilot, allowlist, User-Agent/contact, secret and shared database state. Set the GitHub repository Actions variable `OPEN_LIBRARY_EXPECTED_ACCESS_MODE` explicitly to `tester-only` **before the approved merge**. There is deliberately no fallback for this variable.
2. Only after explicit merge/deployment approval, merge the reviewed PR. A push to `main` triggers Hostinger staging deployment. The workflow checks mode/build consistency before SSH, deploys the tested commit, requires health 200 and exactly anonymous queryless 401 `unauthenticated`. Verify the workflow actually succeeded and all workers run this code. Local tests do not establish this. A public mode expectation against an older/tester-only backend must fail.
3. After separate public-activation approval and all private gates passing, change only private Hostinger `OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED=true`; keep `OPEN_LIBRARY_PILOT_ENABLED=true` and every existing provider/security setting. Refresh effective workers using the verified host process. No allowlist change, session or database migration is needed. Set repository variable `OPEN_LIBRARY_EXPECTED_ACCESS_MODE=public` for subsequent deployments. Coordinate these changes with the release window; a mismatched expectation must fail, never be relaxed to accept either response.
4. Independently check health 200, then send **one anonymous queryless GET** to the pilot URL, without cookies, Authorization, query parameters, redirects or retry options. Require exactly 422 `validation_error` using the checked-out verifier below with explicit mode `public` and build flag `true`. Confirm no provider execution for that probe from the query-validation contract and private operational observations if available. Do not interpret 401/403/404/429/503 as success. The existing enabled frontend needs no new build for this private switch.
5. Independently perform a bounded, manual staging acceptance check: Google Books is default; explicitly select Open Library and submit one human search anonymously, then check an ordinary authenticated account without allowlist membership (reuse the query/cache and respect admission/cooldown). Confirm Work/Edition/language/ISBN presentation, attribution, read-only preview, no Add to Library, no automatic retries and Google search still works. Record sanitized independent findings separately from mocked QA. Do not run load tests or deliberately overload the live provider. Claim public availability only after private configuration, deployed code, strict probe and independent staging checks all pass.

Example for an authorized operator on a POSIX review workstation/runner (public endpoint only; no credentials):

```sh
export OPEN_LIBRARY_EXPECTED_ACCESS_MODE=public
export VITE_OPEN_LIBRARY_DISCOVER_ENABLED=true
probe_file=$(mktemp)
status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
  --output "$probe_file" --write-out '%{http_code}' \
  https://lightcyan-snake-955164.hostingersite.com/api/v1/pilot/open-library/search) && \
  node scripts/verifyOpenLibraryPilot.mjs "$status" "$probe_file"
result=$?
rm -f -- "$probe_file"
exit "$result"
```

The workflow uses the same verifier and a queryless, unauthenticated, non-retried curl request. `OPEN_LIBRARY_EXPECTED_ACCESS_MODE` accepts only `disabled`, `tester-only`, or `public`; `VITE_OPEN_LIBRARY_DISCOVER_ENABLED` must be exactly `false` for disabled or `true` for tester-only/public. Missing modes, inconsistent build flags, unexpected HTTP status, wrong error code and malformed JSON fail. This expected mode is public deployment metadata, not backend authorization or a secret.

## Rollback

To retreat to tester-only access, first set private `OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED=false`, refresh all workers, set the repository expected mode to `tester-only`, and independently require anonymous 401 plus nonallowlisted-account 403. Keep the exact tester allowlist private. Google stays default and the existing frontend may stay enabled. Already-authorized calls can finish; switching access does not cancel a worker.

For emergency provider shutdown, first set private `OPEN_LIBRARY_PILOT_ENABLED=false` and the public switch false, refresh all workers and independently require 404 `not_found` plus health 200. Stop/drain workers if immediate cessation is required; a flag cannot stop a previously reserved call. Through an approved rollback PR/deployment, set the staging build flag false and repository expected mode `disabled` together. Until those agree the workflow intentionally refuses deployment; the private emergency stop still works.

Never reset the singleton, clear reservations, rotate the stable secret, rerun migrations or restore stale coordination state as a rollback shortcut. An uncertain worker needs the separately authorized [quiescence and recovery procedure](OPEN_LIBRARY_MYSQL_BUDGET.md#failure-and-recovery-behavior). Re-enablement requires the gates again. Branches are not deleted by this rollout.

## Local verification

The following implementation results and visual findings were recorded on 16 November 2026 for commit `044a541eb7652aa87a0bf5bfa5e60a9cca941763`, based on main `66f1fc7`. They were preserved from this PR's temporary review report before the authorized cleanup on 17 November 2026. The original report and eight screenshots under `qa/reviews/open-library-public-access/` were removed from the branch tip; they remain recoverable in that implementation commit. Historical QA evidence is unchanged. Screenshot filenames below identify those original captures rather than current file links.

### Scope and isolation

Default-disabled private public-access switch, tester-only fallback, unchanged provider protection, public-facing copy, strict deployment access modes, regression coverage and release instructions. No schema/migration/provider-limit changes. Google Books remains default and Open Library manually selectable/read-only.

PHP uses provider/PDO doubles that reject unrelated SQL. No live provider or database-writing suite was run. Chromium runs in new ephemeral headless contexts with synthetic sessions, metadata and artwork, unexpected network traffic blocked and a dedicated loopback-only Vite server. The normal Open Library flag stays false; the isolated enabled-component harness fulfills synthetic pilot requests without forwarding them. No visible browser, existing profile, real account, staging browser or production data was used.

### Executed checks

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

### Selected screenshots and inspection

All selected files were actually opened and inspected. They contain only synthetic catalogue data. Provider attribution artwork is a local mock and does not validate real branding delivery.

| Evidence | Findings |
| --- | --- |
| Desktop Open Library light (`desktop-open-library-light.png`) | Public catalogue label and read-only badge visible; Work/Edition identity, dates, ISBN, language caveat, attribution and unsupported-saving explanation remain distinct; no Add action |
| Desktop Open Library dark (`desktop-open-library-dark.png`) | Same readable public header, controls, complete synthetic artwork, separate Work/Edition panels and read-only preview; independently recaptured on the final run with an identical SHA-256, so the original evidence retained only one copy |
| Mobile Open Library light (`mobile-open-library-light.png`) | Separate Work/Edition panels wrap long metadata; preview button and notice stay above fixed bottom navigation |
| Mobile Open Library dark (`mobile-open-library-dark.png`) | Read-only preview, provider links, attribution and saving limitation remain readable and unobstructed |
| Desktop Google discovery (`desktop-discover-light.png`) | Google selected, search/filter controls, provider-order result, explicit language caveat and provider link retained |
| Mobile Google discovery (`mobile-discover-light.png`) | Result/title/author/link and login-to-add action fit the viewport; bottom navigation remains clear |
| Desktop Google detail (`desktop-detail-dark.png`) | Existing detail route, Back context, Library login prompt and metadata remain intact |
| Mobile Google detail (`mobile-detail-dark.png`) | Long title wraps beside artwork; Library prompt fits above subsequent content and fixed navigation |

No new horizontal overflow or overlap was observed in these captures. The existing native language-matching select truncates its long selected label on desktop; the option remains keyboard/native-select accessible and this task does not alter its layout. Mobile Open Library captures are scrolled to the read-only edition content, while desktop captures include the changed public header. Screenshot assertions and synthetic fixtures cannot establish real provider quality or effective server authorization.

### Warnings, failures and reproduction

The first full headless run, launched through system Node 24.11.0, completed all 64 tests but reported `Timed out waiting 300s for the teardown for plugin setup to run` and one error outside tests. This is recorded as a failed command, not a clean browser-suite pass. The shell wrapper's successful environment cleanup obscured the underlying command exit status; the Playwright diagnostic is authoritative. Only the verified leftover test Vite/npm processes were stopped. The same repository headless configuration was rerun using supported Node 24.22.1 with execution permission for Windows process cleanup; no headed fallback, timeout relaxation or isolation change was made. The cause is not established solely by a successful rerun. Reproduction for the initial issue: run the full `npm run test:ui` under system Node 24.11.0 in the restricted Windows execution context and observe teardown after assertions.

An intermediate unit rerun caught one old unavailable-message assertion in `browsingContext.test.js`; it was updated to the new public-facing message while retaining its zero-additional-provider-call assertion. Final unit tests pass. Expected negative PHP fixtures emit sanitized provider/storage errors; they do not indicate real service failures. Playwright emits harmless `NO_COLOR`/`FORCE_COLOR` warnings. Git reports existing LF/CRLF conversion warnings. No secrets, cookies, raw traces, videos, profiles, large reports or real personal data are included.

Before public activation, the [private release record and exact rollout order](#required-private-release-record) still require registration/use-case suitability, monitored User-Agent/contact, effective web-worker settings, authoritative shared database readiness, real-client `REMOTE_ADDR` behavior on Hostinger and emergency operator access. None was independently established by these local checks.

### Cleanup verification (17 November 2026)

The cleanup changes only this document, the project-context report reference and the nine temporary evidence files. Application code, tests, fixtures, rate limits, caching, MySQL protection, deployment verification and rollback behavior are unchanged.

- Focused deployment regressions: `node --test tests/openLibraryDeployment.test.js` passed all 3 tests under system Node 24.11.0. This dependency-free verifier check does not replace the supported-runtime frontend/build/headless results recorded above.
- `php backend/tests/open_library_admission.php` passed 150 assertions; `php backend/tests/open_library_storage.php` passed 55 assertions. These use PDO/HTTP doubles only, with no live database/provider I/O. Expected negative fixtures emitted sanitized storage errors.
- All eight original screenshots were reopened and inspected before removal; the recorded visual findings remain applicable. Their PNG chunks contain only image data and no textual/contact metadata.
- The supplied name and phone value were absent from current repository text, fixtures, PR text changes, reachable text-change history, commit metadata and the eight captures. Their origin could not be established from this repository. The supplied email occurs in Git author/committer metadata and the configured Git identity, not tracked file contents; legitimate identity and history were left unchanged. No additional contact information is reproduced here.
- Focused local Markdown file/heading links, removed-evidence references, documentation-only scope and `git diff --check` passed. No new frontend build, headless browser run, combined PHP preview, live-provider check, Hostinger operation or independent staging acceptance was performed for this cleanup.
