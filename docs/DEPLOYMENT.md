# MyFunList deployment guide

This is the single deployment reference for the private staging run and later public release. No hosting or domain has been configured by this repository. Complete the staging checklist before opening registration publicly.

## Layout and prerequisites

- Serve the output of `npm run build` at the root of one HTTPS origin, planned as `https://myfunlist.app`. Route `/api/*` on that same origin to `backend/public/index.php`; the current API lives under `/api/v1/*`. No separate API host or CORS configuration is needed.
- The web server must serve real `/assets/*` files directly and return the built `index.html` for frontend routes such as `/discover`, `/library`, `/lists/123`, `/profile`, `/login`, and `/register`. Match `/api/*` before the SPA fallback: API misses must remain JSON 404/405 responses from PHP, never HTML. Reject access to other backend paths and to hidden files.
- Only `backend/public` may be PHP web-facing. Keep `backend/.env`, `src`, `config`, `database`, `vendor`, tests, Composer files, logs, backups, recovery files, and session files outside the public document root. The physical frontend directory and PHP entry path depend on hosting; verify the resulting URL behavior before release.
- Use PHP 8.2+ with `curl`, `pdo_mysql`, and installed Composer dependencies, plus MySQL 8.0.16+ or a compatible MariaDB version. Install dependencies from the lockfile with `composer install --no-dev --optimize-autoloader` in `backend/`. Never expose Composer or migration commands over HTTP.

## Configuration

Set backend values through private server environment or an unreadable-from-web `backend/.env` based on `backend/.env.example`:

| Variable | Production requirement |
| --- | --- |
| `APP_ENV` | `production` for real staging and production |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Correct environment-specific database; verify target before migrations |
| `TMDB_API_TOKEN`, `RAWG_API_KEY` | Server-side discovery and Library resolution |
| `GOOGLE_BOOKS_API_KEY` | Optional server-side Library resolution key |
| `RATE_LIMIT_SECRET` | Unique random backend-only value of at least 32 characters; keep stable across PHP workers and deployments |
| `SESSION_SAVE_PATH` | Absolute path to a private, persistent, PHP-writable session directory outside the web root |

The frontend `.env.example` contains only optional `VITE_GOOGLE_BOOKS_API_KEY`. Every `VITE_` value is browser-visible. Restrict a production Google Books browser key to the deployed web origin/referrer and **Google Books API only**, where provider controls allow it. Google Books search is browser-side and outside the PHP rate limiter. Never put TMDb, RAWG, database, rate-limit, or session secrets in frontend variables. Keep all `.env` files and build output out of Git.

PHP sessions use an HttpOnly, SameSite=Lax, Path=/, host-only `__Host-myfunlist_session` cookie with Secure in production. Local development on HTTP loopback uses a separate non-Secure cookie. Login, registration, and password changes rotate the session ID and CSRF token; logout destroys the session and expires the cookie. Ensure `SESSION_SAVE_PATH` exists, is writable by every PHP worker, survives requests/restarts, and is not shared with a public file server. The app does not use browser localStorage for authentication.

The `004_create_rate_limit_counters` migration supplies durable login, registration, discovery, import, and password-change counters. The application uses server-observed `REMOTE_ADDR` and never trusts `X-Forwarded-For` automatically. In staging, verify whether `REMOTE_ADDR` is the real client address. If a reverse proxy hides it, arrange a deliberate trusted-proxy configuration at the host before relying on per-client IP limits. A missing secret or counter storage failure makes protected requests return a generic 503; blocked requests return 429 and `Retry-After`.

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
