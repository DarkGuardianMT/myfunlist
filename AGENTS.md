# Working in MyFunList

This repository is the main MyFunList project. Read `PROJECT_CONTEXT.md` for the current project state and agreed direction before making changes.

## Scope and implementation

- Inspect the relevant existing code before changing anything. Preserve the current architecture unless the task explicitly calls for a change.
- Keep changes focused on the requested task. Do not rewrite large parts of the project unnecessarily or silently remove working behavior.
- Prefer simple, maintainable solutions over overengineering.
- Use Vue 3 patterns appropriate to the existing project. Write JavaScript, not TypeScript, unless a migration is explicitly decided.
- Use normal CSS for now. Do not add a CSS framework unless explicitly requested.
- Add dependencies only when there is a clear need.
- Do not add PHP, MySQL, or other backend code until the project reaches that phase.

## Code and configuration

- Keep secrets and API keys out of Git. Use environment variables when appropriate.
- Write code comments in Dutch. Comments should explain useful logic rather than obvious syntax. Naming and code can remain in English.

## Verification and project memory

- Verify changes with checks appropriate to the task. `npm run build` should pass before finishing meaningful frontend tasks.
- Update `PROJECT_CONTEXT.md` when the current project state or an important architectural decision materially changes. Skip documentation updates for tiny cosmetic changes.

## Git

- Use Conventional Commits with concise English commit messages.
- After checks pass, commit and push clearly scoped tasks unless the task explicitly says not to. Avoid unnecessary commits for tiny changes.
- Do not force-push or rewrite history unless explicitly requested.
