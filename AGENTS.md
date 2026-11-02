# Working in MyFunList

Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before changes. Use the current implementation and tests as the source of truth.

## Scope and conventions

- Inspect relevant code, configuration and tests before editing. Preserve the existing architecture unless the task explicitly changes it.
- Keep changes focused, simple and maintainable. Do not silently implement unrelated improvements or remove working behavior.
- Use Vue 3, JavaScript and plain CSS. Introduce TypeScript or a CSS framework only when explicitly requested; add dependencies only for a clear task-related need.
- The PHP 8.2+ REST API and MySQL/MariaDB persistence are implemented. Backend work is allowed when explicitly within task scope.
- Write all user-facing explanations, progress updates, summaries, and final reports in English. Write code comments in Dutch. Keep identifiers and commit messages in English. Do not change the response language based on repository documentation or prior model outputs.
- Keep code comments useful and commit messages concise; use Conventional Commits.
- Keep secrets and API keys out of Git, commands and logs. Use private environment configuration; every `VITE_` value is browser-visible.

## Security and data

- Preserve authentication, session security, CSRF handling, account ownership checks and existing API contracts.
- Never run destructive migrations, resets, schema rebuilds or database integration tests against development, staging or production data.
- Database-writing tests require the existing safeguards: explicit `APP_ENV=testing`, exact `DB_DATABASE=myfunlist_test` and a loopback host, using an isolated disposable test database. Never bypass these checks.
- Follow [Development](docs/DEVELOPMENT.md) for test setup and [Deployment](docs/DEPLOYMENT.md) for deliberate migrations, backups and releases.
- Preserve original UI audit reports, Work QA reports, screenshots, measurements and evidence archives; do not overwrite them.

## Verification and documentation

- Frontend changes: run `npm test`, `npm run build` and relevant focused checks.
- Browser checks are separate: use `npm run test:ui` for isolated Chromium headless tests. Follow [Headless UI QA](docs/HEADLESS_UI_QA.md). Never use headed, debug or Playwright UI mode, visible browser windows, desktop/keyboard/mouse automation, existing browser sessions or persistent browser profiles. Browser-scoped interactions in a fresh headless context are allowed. If headless execution fails, report the failure; do not switch to a visible browser.
- Browser tests must use their own loopback-only server, synthetic data and mocks. Do not use staging/production, real accounts, live providers or databases. Block unexpected external requests; keep Open Library disabled.
- For meaningful browser QA, share a sanitized `report.md` and selected desktop/mobile screenshots under a fresh `qa/reviews/<task-name>/` directory on the review branch. Record executed tests, results, warnings, limitations and reproducible failures. Actually inspect screenshots; passing assertions alone do not prove visual quality. Never overwrite historical evidence or commit secrets, tokens, cookies, real personal data, profiles, sensitive URLs/configuration, raw traces/videos or large generated reports.
- Before an approved merge, remove only the newly generated temporary QA evidence unless the user explicitly approves it as permanent documentation. Preserve existing historical reports, screenshots and evidence archives.
- Backend changes: run appropriate PHP syntax checks and non-destructive tests, including the relevant provider/API suites. Do not run `composer test` without the isolated database safeguards above.
- Documentation-only changes: verify technical claims, paths, commands, Markdown/internal links and a documentation-only diff; application tests are not required unless relevant.
- Report automated tests, local preview, staging deployment and independent live-browser QA separately. Never claim browser verification unless it was actually performed.
- Update `PROJECT_CONTEXT.md` when meaningful project state or an architectural decision changes; skip tiny cosmetic updates. Keep history in [PROJECT_HISTORY](docs/PROJECT_HISTORY.md), not in these instructions.

## Git and deployment

- Never commit or push directly to `main`. Fetch and use an explicitly requested review branch; for future implementation tasks, create `review/<task-name>` from the latest `origin/main`. Preserve uncommitted work; use a separate worktree when needed instead of discarding it.
- After relevant checks pass, commit and push meaningful, clearly scoped changes only to their review branch unless the task says otherwise. Report the branch, commit SHA, summary, test results and review-evidence paths. The user and ChatGPT review before merging.
- Do not automatically merge, deploy or delete branches. Merging and deployment require explicit user approval. Delete a review branch only after approved review, verified successful merge and separate explicit deletion authorization.
- Merging/pushing to `main` triggers GitHub Actions staging deployment. Keep that consequence explicit during merge review. When deployment is separately authorized, verify the workflow result; successful local checks do not establish deployment success or public-launch readiness.
- Do not force-push or rewrite history unless explicitly requested.
