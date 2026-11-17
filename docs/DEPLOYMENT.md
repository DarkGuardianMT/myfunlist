# MyFunList deployment guide

This is the single deployment reference for the private staging run and later public release. The staging workflow targets `https://lightcyan-snake-955164.hostingersite.com`; actual hosting readiness still requires the staging checks below. Complete the staging checklist before opening registration publicly.

## Automated staging deployment

`.github/workflows/deploy-staging.yml` runs on pushes to `main`. It uses Node.js 24.15.0 and runs `npm ci`, `npm test`, and `npm run build` before connecting to staging. It also configures PHP 8.2 with cURL/PDO MySQL and Composer 2 using a commit-pinned [setup-php action](https://github.com/shivammathur/setup-php). Strict Composer validation, dependency installation from the lockfile, PHP syntax validation, `php backend/tests/database_safety.php`, `composer --working-dir=backend run test:providers` and `composer --working-dir=backend run test:api` must all pass before SSH setup or any server change. These suites use provider/database doubles and disposable files; CI has no database service or database credentials and never runs `composer test`, database-writing tests or migrations. There is no continue-on-error or deployment bypass for these checks.

Configure repository secrets `STAGING_HOST`, `STAGING_PORT`, `STAGING_USER`, `STAGING_SSH_KEY`, and `VITE_GOOGLE_BOOKS_API_KEY`. The Google Books secret is passed only to the frontend build step; Vite embeds this restricted browser key in the staging assets. The runner discovers the SSH host key with `ssh-keyscan` and requires that key for subsequent connections; this trusts the initial network connection.

The server must already have the repository cloned at `/home/u403470553/myfunlist-stage`, permission to fetch its `origin`, private environment/session configuration, and working same-origin API routing. SSH, Bash, Git, PHP, Composer, rsync, find, and chmod must be available on the server. Each deployment fetches `origin/main`, verifies that it matches the tested workflow commit, and resets tracked checkout files to that revision. It then runs `composer install --no-dev --optimize-autoloader` in `backend/` to synchronize backend dependencies from the lockfile. Untracked private configuration remains in place. If `main` has advanced, the older deployment stops before changing the checkout or frontend. Deployments run serially without cancelling an upload in progress.

The workflow syncs `dist/` into `/home/u403470553/domains/lightcyan-snake-955164.hostingersite.com/public_html/`, deleting obsolete frontend files while excluding the existing root `.htaccess` and `api/` directory from upload and deletion. It then sets frontend directories to 755 and files to 644, leaving `.htaccess` and `api/` permissions alone. Finally, curl checks `/api/v1/health` over HTTPS and requires JSON `data.status=ok`. The required repository Actions variable `OPEN_LIBRARY_EXPECTED_ACCESS_MODE` declares exactly one backend state: `disabled` requires anonymous queryless 404 `not_found`, `tester-only` requires 401 `unauthenticated`, and `public` requires 422 `validation_error`. There is no default or acceptance of alternate modes. The staging job's single `VITE_OPEN_LIBRARY_DISCOVER_ENABLED` value must be false for disabled and true for tester-only/public. Configuration is checked before SSH/server changes; `scripts/verifyOpenLibraryPilot.mjs` checks the exact deployed status/code after upload. The probe has no cookies, query, redirects or automatic retries; public validation consumes IP admission but never reserves or calls the upstream provider. Malformed JSON, missing/invalid mode, inconsistent flags, 429/503 or any mode mismatch fails. Set the repository variable to `tester-only` before merging this preparation; follow the [exact public activation order](OPEN_LIBRARY_PUBLIC_ACCESS.md#exact-staging-activation-order) for subsequent private enablement.

Database migrations remain manual. Apply required migrations deliberately before deploying code that needs them. The workflow does not provide atomic releases or automatic rollback; a failed health check requires inspection and, if needed, a deliberate redeployment.

## Layout and prerequisites

- Serve the output of `npm run build` at the root of one HTTPS origin, planned as `https://myfunlist.app`. Route `/api/*` on that same origin to `backend/public/index.php`; the current API lives under `/api/v1/*`. No separate API host or CORS configuration is needed.
- The web server must serve real `/assets/*` files directly and return the built `index.html` for frontend routes such as `/discover`, `/library`, `/lists/123`, `/profile`, `/login`, and `/register`. Match `/api/*` before the SPA fallback: API misses must remain JSON 404/405 responses from PHP, never HTML. Reject access to other backend paths and to hidden files.
- Only `backend/public` may be PHP web-facing. Keep `backend/.env`, `src`, `config`, `database`, `vendor`, tests, Composer files, logs, backups, recovery files, and session files outside the public document root. The physical frontend directory and PHP entry path depend on hosting; verify the resulting URL behavior before release.
- Use PHP 8.2+ with `curl`, `pdo_mysql`, and installed Composer dependencies, plus MySQL 8.0.16+ or a compatible MariaDB version. Install dependencies from the lockfile with `composer install --no-dev --optimize-autoloader` in `backend/`. Never expose Composer or migration commands over HTTP.

## Configuration

Open Library public access uses only private backend `OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED=true`, disabled by default. When absent or anything except the exact string `true`, the enabled pilot retains tester-only access through private `OPEN_LIBRARY_TESTER_USER_IDS`. Log in normally, read your own `data.user.id` from authenticated `GET /api/v1/profile`, and use that exact numeric ID in private configuration. Multiple testers use comma-separated IDs without spaces (maximum 20; each 1–20 digits without a leading zero). Never use emails, passwords, browser flags, headers or query IDs as authorization, or commit the actual allowlist. Missing/malformed/nonmatching lists deny tester access. Public mode ignores this list and does not start/read a session.

Keep public access off until separately approved and the [private release gates](OPEN_LIBRARY_PUBLIC_ACCESS.md#required-private-release-record) pass. A disabled main pilot always returns 404 before sessions/storage/providers, regardless of public access. An enabled tester-only pilot returns anonymous 401/non-tester 403 before coordination. An enabled public pilot permits any visitor through the unchanged IP admission, shared cache/budget and provider safeguards. Google Books and other account/security contracts remain unchanged. In-flight calls can finish after any switch change; immediate stop requires worker quiescence.

Historical tester activation and owner-reported registration/migration/smoke results are recorded in [Project context](../PROJECT_CONTEXT.md). This public preparation changes no Hostinger settings. Public registration/use-case suitability, effective web-worker settings, shared database readiness, real client IP and emergency operator access require a private release record before enablement; local fixtures cannot establish these.

Set backend values through private server environment or an unreadable-from-web `backend/.env` based on `backend/.env.example`:

| Variable | Production requirement |
| --- | --- |
| `APP_ENV` | `production` for real staging and production |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Correct environment-specific database; verify target before migrations |
| `TMDB_API_TOKEN`, `RAWG_API_KEY` | Server-side discovery and Library resolution |
| `GOOGLE_BOOKS_API_KEY` | Optional server-side Library resolution key |
| `RATE_LIMIT_SECRET` | Unique random backend-only value of at least 32 characters; keep stable across PHP workers and deployments |
| `SESSION_SAVE_PATH` | Absolute path to a private, persistent, PHP-writable session directory outside the web root |
| `OPEN_LIBRARY_PILOT_ENABLED` | Exact `true` enables the route; all other values return 404 before I/O |
| `OPEN_LIBRARY_PUBLIC_ACCESS_ENABLED` | Default false; exact `true` permits anonymous and any authenticated read-only discovery when the main pilot is enabled |
| `OPEN_LIBRARY_TESTER_USER_IDS` | Private allowlist required only when enabled and not public |
| `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED`, `OPEN_LIBRARY_USER_AGENT` | Existing shared authoritative MySQL assertion and MyFunList/contact identification; preserve values and verify effective web settings |

The frontend `.env.example` contains optional `VITE_GOOGLE_BOOKS_API_KEY` and disabled-by-default `VITE_OPEN_LIBRARY_DISCOVER_ENABLED=false`. Every `VITE_` value is browser-visible. Restrict a production Google Books browser key to the deployed web origin/referrer and **Google Books API only**, where provider controls allow it. Google Books search is browser-side and outside the PHP rate limiter. Never put TMDb, RAWG, database, rate-limit, or session secrets in frontend variables. Keep all `.env` files and build output out of Git.

Google Books remains the default in every mode; Open Library stays manually selectable and read-only. Pilot 401/403 explain restricted access without global logout. Credit the owner's migration 005 and CLI/HTTP smoke results; verify current effective readiness without repeating live suites or migrations absent a specific gap. Deploy this code under tester-only mode first, then independently approve and activate the private public switch. See the [current rollout and HTTP matrix](OPEN_LIBRARY_PUBLIC_ACCESS.md), which supersedes historical tester-only activation instructions for this release.

Rollback to testers: set private public access false, refresh workers, set expected mode `tester-only` and require anonymous 401/non-tester 403. Emergency stop: disable the main pilot first (and public switch), refresh workers and require health 200/pilot 404; then use an approved rollback PR/deployment to pair frontend flag false with expected mode `disabled`. Google remains default. Never reset MySQL state, clear a reservation or rotate the stable secret. See [worker and rollback details](OPEN_LIBRARY_PUBLIC_ACCESS.md#rollback).

PHP sessions use an HttpOnly, SameSite=Lax, Path=/, host-only `__Host-myfunlist_session` cookie with Secure in production. Local development on HTTP loopback uses a separate non-Secure cookie. Login, registration, and password changes rotate the session ID and CSRF token; logout destroys the session and expires the cookie. Ensure `SESSION_SAVE_PATH` exists, is writable by every PHP worker, survives requests/restarts, and is not shared with a public file server. The app does not use browser localStorage for authentication.

The `004_create_rate_limit_counters` migration supplies durable login, registration, discovery, import, and password-change counters. The application uses server-observed `REMOTE_ADDR` and never trusts `X-Forwarded-For` automatically. In staging, verify whether `REMOTE_ADDR` is the real client address. If a reverse proxy hides it, arrange a deliberate trusted-proxy configuration at the host before relying on per-client IP limits. A missing secret or counter storage failure makes protected requests return a generic 503; blocked requests return 429 and `Retry-After`.

Migration `005_create_open_library_state` adds only the isolated Open Library coordination table. Apply it through the deliberate backup/migration procedure before any separately approved activation; runtime needs SELECT/UPDATE on this table. Disabled code remains safe without this migration and still returns 404 before database access. All workers must share the same authoritative InnoDB database; there is no automatic file-state import or expired-reservation recovery. See [migration, worker quiescence and remaining host gates](OPEN_LIBRARY_MYSQL_BUDGET.md). Do not mix old file-backed and new database-backed workers while enabled. Historical diagnostic packages are not an installation requirement.

## Database, backup, and rollback

The application runtime DB account should have only data permissions it needs, including writes to `rate_limit_counters`. Use separate, temporarily authorized DDL credentials for CLI migrations where practical. Do not place credentials in commands, source files, or Git.

For first deployment, each migration, and significant releases:

1. Take a consistent database backup with the host's secure backup facility or a database dump using private credentials. Keep it outside Git and the web root, with access restricted. Preserve the relevant private environment/configuration separately. There are currently no uploaded artwork files; include user-generated files if that changes later.
2. Confirm `APP_ENV`, database host and name, and backup identity. From `backend/`, run `composer migrate:status` with that environment. Review pending versions, then run `composer migrate` using the intended migration credentials. Run `composer migrate:status` again and check `/api/v1/health` plus application smoke tests. Migrations are CLI-only and may need DDL privileges. A partial MySQL DDL failure requires inspection before retrying.
3. Test restore in **isolated staging**: create a separate empty database, restore the dump there, point isolated staging/test configuration at that database, inspect tables and representative account data, and run safe read/application smoke checks. Record backup time and restoration result. Never overwrite production for a restore drill.

`composer test` resets the local `myfunlist_test` schema. Its database tests require explicit `APP_ENV=testing`, the exact `myfunlist_test` name, and a loopback DB host before connecting. Never run test/reset commands with production configuration.

For a bad application release, redeploy the previous known-good Git commit and its corresponding frontend build. Do not blindly downgrade schema. Check whether the new migration changed data or schema; restore the verified backup only after a deliberate data-loss and compatibility assessment. Stop writes during any actual restore.

## HTTPS, headers, and logs

HTTPS is mandatory for real staging and production. Verify the certificate, redirects, no mixed content, and Secure-cookie transport on the actual host. Local HTTP build preview does not validate TLS. Set `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and frame protection such as `X-Frame-Options: DENY` at the HTTPS web server. Enable HSTS only after HTTPS and redirects work for the intended host; never apply it to local development or add `includeSubDomains` without validating every subdomain.

Stage a **Content-Security-Policy-Report-Only** policy, inspect browser violations, then enforce a tested policy. The frontend connects to its own `/api/v1` and `https://www.googleapis.com` for Books. TMDb artwork uses `https://image.tmdb.org`; Books cover links are HTTPS provider URLs; RAWG artwork is a provider-supplied HTTPS URL and may use additional image hosts. Local SVG/assets are same-origin. A starting report-only shape is `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://www.googleapis.com; img-src 'self' https: data:`. Narrow image hosts only after observing real search and Library pages; verify Light/Dark, images, and all four providers before enforcing. Report-only `frame-ancestors` does not enforce frame protection, so retain the separate frame header until an enforced CSP does.

PHP disables displayed errors and returns generic JSON for unexpected failures. Keep PHP error logs private and monitor 500/503 responses, database/rate-limit storage errors, and provider failure categories. Provider logs include only source/media type and status, never request URLs or keys. Do not log passwords, password hashes, CSRF tokens, session IDs, provider credentials, rate-limit secret, or raw auth bodies. Confirm host-level logs and backups stay outside the web root.

## Local production-build check

Run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`. Open `/`, `/discover`, `/library`, `/lists/123`, and `/profile` directly or refresh each URL; confirm the built HTML and `/assets/*` load. Inspect Network: frontend API requests should be relative `/api/v1/*`. `vite preview` is only a static frontend and SPA fallback check: it does **not** route `/api` to PHP, so API, session, and combined routing behavior must be checked in real staging. Do not interpret an HTML response from `/api` in preview as a working API. This check does not replace `npm run dev:full` for local feature work.

### Local visual checklist

- [ ] At about 1440px: Home, Discover, Library, Lists, Profile, and Light/Dark theme.
- [ ] At about 390px: compact top header; five-item bottom nav; anonymous Login and authenticated Profile item; Discover, Library, Lists/detail, Profile; bottom controls unobstructed; Light/Dark.
- [ ] Quickly inspect 360px, 320px, and 768px widths for clipping or covered controls.

## Real private staging checklist

- [ ] **Infrastructure:** HTTPS/certificate and intended host; frontend assets and direct-route SPA fallback; `/api/v1` reaches PHP and API errors stay JSON; only `backend/public` exposed; private backend secrets, logs, and persistent writable session path; correct production database.
- [ ] **Security:** Secure/HttpOnly/SameSite/host-only cookie; no secret or stack-trace exposure; 429 limiter and 503 storage behavior; determine actual `REMOTE_ADDR` behind host proxy; security headers and tested CSP; restricted Google Books browser key.
- [ ] **Database:** backup captured; target and migration status checked; migrations applied and rechecked; Library/List data survives F5 and worker restart; isolated restore drill succeeds.
- [ ] **Application:** register, login, logout, Profile edit, password change; Book, Movie, TV, and Game searches; Library add/update/remove; Lists create/edit/membership/delete; F5 persistence; second account cannot read or mutate the first account's data.
- [ ] **Operations:** private server logs capture safe 500/503 and provider failure categories; test provider unavailability; verify backup location, access, and restore record.

## Public release checklist

- [ ] All private staging checks pass on the exact intended commit and configuration; complete the local visual checklist.
- [ ] Take final production DB backup, verify target and migration status, deploy that tested commit/build, apply pending migrations, and recheck status.
- [ ] Verify production environment, HTTPS, health, auth, searches, and persistence; then open registration and monitor private logs.

Locally verified code/build behavior and real-host checks must be reported separately. DNS, TLS, secure-cookie delivery, reverse-proxy client IP, host permissions/session persistence, backups, and restore infrastructure remain staging checks until exercised on a real host.
