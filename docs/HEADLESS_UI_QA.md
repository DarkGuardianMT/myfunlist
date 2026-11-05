# Headless UI testing and review branches

Use a requested `review/<task-name>` branch. For a new implementation task, fetch origin and branch from the latest `origin/main`, preserving uncommitted work (a separate worktree is appropriate when the current checkout contains unrelated changes). Never commit or push directly to `main`.

After a meaningful task passes its checks, commit with an English Conventional Commit message and push only its review branch. Share the branch, commit SHA, summary, test results and sanitized evidence links for user/ChatGPT review. Do not merge, deploy or delete branches automatically. A merge into `main` triggers the existing staging deployment, so both that consequence and approval must be explicit. Branch deletion needs separate authorization after successful merge verification. This setup does not add or execute a GitHub Actions workflow.

## Local setup and commands

Use the project's supported Node.js 24.15+ version. Install the locked dependencies and Chromium's headless shell:

```sh
npm ci
npm run test:ui:install
npm test
npm run build
npm run test:ui
```

`npm test` continues to run only `tests/*.test.js`. Playwright runs `tests/ui/*.spec.js` separately. Useful headless selections are `npm run test:ui -- --project=mobile` or `npm run test:ui -- --grep "mocked book"`. Do not use `--headed`, `--debug`, `--ui`, `PWDEBUG`, codegen, UI/report browser launch commands, browser channels or persistent profiles. Configuration rejects headed/debug/UI modes; a headless launch failure must be reported instead of falling back to a visible browser.

`playwright.config.js` starts and stops a dedicated Vite development server at `http://127.0.0.1:4179` using `vite.ui.config.js`. It refuses to reuse another server and fails if the port is occupied. Do not stop an unrelated process or point tests at a different environment to work around that failure. No PHP, XAMPP, MySQL or other backend is started. Private `.env` files are not read by this server, ordinary `VITE_` process values are not exposed, Google credentials are empty and the Open Library frontend gate is explicitly false. The normal Vite/deployment configuration is unchanged.

The two projects are Chromium headless at 1440×900 (desktop) and 390×844 (mobile viewport/touch emulation, not a physical phone). Each test has a new ephemeral browser context without real sessions or accounts. Service workers and downloads are disabled. A browser-context allowlist serves synthetic session/detail/provider/artwork responses, blocks all non-GET requests, unexpected API paths and unknown external traffic, and permits only the dedicated loopback Vite WebSocket. It never forwards a provider/API request. Keep new tests on the shared fixture: do not use `route.fetch`, direct API clients or unmocked providers. This is test-harness isolation, not an OS network sandbox.

`tests/ui/open-library.html` is a separate test entry, excluded from the normal production build. Its harness injects the existing Open Library component's `enabled` prop before mounting the real application, then restores the ordinary `/discover` route. The test-server build flag remains `false`; ordinary application smoke tests still require zero pilot requests. Only tests explicitly opting into `sandbox.openLibraryHarness` and providing `pilotRespond` may receive synthetic pilot responses. No pilot/API request reaches the server or provider. This permits read-only component acceptance without activating deployment.

## Smoke coverage and failure detection

- Home/Discover/Login navigation, visible desktop/mobile navigation, discovery-type controls and theme switching.
- Synthetic Google Books search, keyboard-operated full-information disclosure, language selection/caveat, public detail route and return context.
- Empty results, one deliberately aborted provider request, explicit Retry and the disabled Open Library gate with zero pilot requests.
- Enabled-component fixtures: distinct Work/Edition identities and read-only preview, keyboard disclosure/selection, all fields and language modes, cache/history/provider isolation, stale responses, invalid/empty/malformed/404 states, and busy/429/503 cooldowns across catalogue remounts with manual-only retry. Narrow-layout checks also exercise 320px and 768px widths.
- No horizontal page overflow, search controls within the viewport, unexpected console errors, uncaught page errors, HTTP error responses, failed requests or disallowed network requests.

Only the mocked anonymous-session 401, deliberately induced network-failure message and explicitly supplied pilot error statuses are expected. HTTP expectations are tied to the exact mocked requests. Other failures fail the test; diagnostics report counts rather than raw URLs, response bodies, credentials or console text. Playwright failure context stays in ignored `test-results/`; review and sanitize any useful reproduction before sharing. An expected error state is not evidence of a live provider outage.

## Review evidence

Open Library component tests additionally capture `desktop-open-library-light.png`, `desktop-open-library-dark.png`, `mobile-open-library-light.png` and `mobile-open-library-dark.png`. Their catalogue metadata and artwork are synthetic; screenshots do not validate real provider quality, actual branding delivery or language accuracy.

Ordinary runs place selected screenshots under ignored `test-results/ui/`. To export the eight selected images into a fresh temporary review directory, set `QA_REVIEW_TASK` to a new lowercase hyphenated task slug:

```powershell
$env:QA_REVIEW_TASK = 'your-task-name'
try { npm run test:ui } finally { Remove-Item Env:QA_REVIEW_TASK -ErrorAction SilentlyContinue }
```

For POSIX shells, use `QA_REVIEW_TASK=your-task-name npm run test:ui`. Each project captures Discover in Light and Media Detail in Dark. Desktop captures show the full page; mobile captures show the viewport, scrolling to the result card for Discover and the top for Detail. This keeps the fixed bottom navigation in its actual viewport position. Existing image paths are never overwritten; choose a fresh run slug if review evidence already exists. No raw trace, video, HAR, storage state, cookie export, browser profile or HTML report is generated for sharing. Screenshots use fictional text/artwork; the provider attribution image is a clearly labeled local mock, so these images do not validate actual branding assets.

Create `qa/reviews/<task-name>/report.md` with scope/base commit, commands and outcomes, viewport/browser versions, selected screenshot links, visual inspection findings, warnings, limitations and sanitized failure reproduction. Inspect every selected image before committing it, and review `git diff --cached`/file sizes. The ignore rules permit only the report and named desktop/mobile PNG files in review directories; they do not replace manual content review. Do not commit sensitive data, raw traces/videos, large generated reports or private configuration.

These files are temporary review artifacts. Before an approved merge, remove only evidence newly generated by that task unless the user explicitly approves permanent retention. Do not delete historical QA reports or reuse their paths. Current review evidence must remain available until reviewed; this cleanup is not automatic permission to merge or delete branches.

Mocked local browser checks cannot establish backend/authentication persistence, real provider quality, server security, Hostinger readiness, accessibility acceptance, physical-device behavior or staging/production availability. Report local browser QA separately from Node tests, build, deployment and independent live-browser review.

References: [Playwright configuration](https://playwright.dev/docs/test-configuration), [managed web servers](https://playwright.dev/docs/test-webserver), [network mocking](https://playwright.dev/docs/network), [headless browser installation](https://playwright.dev/docs/browsers), [Vite environment options](https://vite.dev/config/shared-options.html#envdir).
