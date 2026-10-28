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
- Backend changes: run appropriate PHP syntax checks and non-destructive tests, including the relevant provider/API suites. Do not run `composer test` without the isolated database safeguards above.
- Documentation-only changes: verify technical claims, paths, commands, Markdown/internal links and a documentation-only diff; application tests are not required unless relevant.
- Report automated tests, local preview, staging deployment and independent live-browser QA separately. Never claim browser verification unless it was actually performed.
- Update `PROJECT_CONTEXT.md` when meaningful project state or an architectural decision changes; skip tiny cosmetic updates. Keep history in [PROJECT_HISTORY](docs/PROJECT_HISTORY.md), not in these instructions.

## Git and deployment

- After relevant checks pass, commit and push clearly scoped tasks unless the task says otherwise; avoid unnecessary commits for tiny changes.
- Pushing to `main` automatically triggers GitHub Actions staging deployment. When deployment is part of the task, verify the workflow result; successful local checks do not establish deployment success or public-launch readiness.
- Do not force-push or rewrite history unless explicitly requested.
