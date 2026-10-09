# MyFunList

MyFunList is a personal full-stack media tracking and portfolio project. Discover books, movies, TV shows, and games, then track them in a private account Library.

### Implemented features

- Account registration, login, logout, and session authentication.
- Discovery through Google Books, TMDB (movies and TV), and RAWG (games).
- A database-backed Library with media-specific statuses, personal ratings in 0.5-point steps, filtering, and sorting.
- Private Custom Lists containing entries from the account Library.
- Private Profile editing and password changes.
- Explicit import of legacy browser Library data, with the browser copy preserved for recovery.
- Light/dark themes and responsive navigation.

### Technologies

Vue 3, Vue Router, Vite, JavaScript, and CSS on the frontend; PHP 8.2+, Composer, PDO, and MySQL/MariaDB on the backend. Tests use Node's test runner, Vue Test Utils, jsdom, and PHP scripts. No frontend CSS framework or PHP framework is used.

The app is in development; deployment and production readiness are not verified. Anime, public profiles, shared lists, social features, email verification, password reset, email changes, and account deletion are not implemented. Password changes rotate the current session but do not invalidate other sessions. Real staging checks remain in [the deployment guide](docs/DEPLOYMENT.md).

## Local development

Prerequisites: Node.js 24.15+, npm, PHP 8.2+ with `pdo_mysql` and `curl`, Composer, and MariaDB 10.4 or MySQL 8.0.16+. Make `php` and `composer` available on your terminal's PATH. XAMPP can supply PHP and MariaDB on Windows; Apache is optional.

1. Install frontend dependencies with `npm ci` from the repository root.
2. Copy `backend/.env.example` to `backend/.env`. Set the local database credentials and a random `RATE_LIMIT_SECRET` of at least 32 characters. Generate a value locally with `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"` and keep it in the ignored backend configuration.
3. Set `TMDB_API_TOKEN` and `RAWG_API_KEY` only in `backend/.env` for movie, TV, and game discovery and Library resolution. Backend `GOOGLE_BOOKS_API_KEY` is optional. Google Books search runs in the browser and also works locally without a key; optionally copy the root `.env.example` to `.env` to configure `VITE_GOOGLE_BOOKS_API_KEY`. Every `VITE_` value is browser-visible; restrict a production Books key to the site and Books API.
4. Start your local MySQL/MariaDB service and create an empty `myfunlist` database. From `backend/`, run:

   ```sh
   composer install
   composer migrate:status
   composer migrate
   ```

   Verify the configured database before migrations. Do not run these commands against production as part of local setup.
5. Return to the repository root and run `npm run dev:full`. Open the Vite URL printed in the terminal; Ctrl+C stops both development servers.

Vite proxies `/api` to PHP at `http://127.0.0.1:8080`, keeping browser requests on one origin. `npm run dev` starts only Vite; `npm run dev:backend` starts only PHP. If you use an Apache virtual host instead, its document root must be `backend/public`; set `VITE_API_PROXY_TARGET` in the root `.env` to that host.

All real `.env` files, dependencies, build output, sessions, and database exports must stay out of Git. Sample configuration contains placeholders only.

## Verification

From the repository root:

```sh
npm test
npm run build
php backend/tests/database_safety.php
php backend/tests/discovery.php
```

The two PHP commands do not modify databases; discovery tests use fake provider responses. Run `composer validate --strict` from `backend/` to check its package configuration. The full database/HTTP suite and its separate test-database requirements are described below. `npm run preview` previews only the built frontend; it does not proxy the backend API.

## Backend and database

The PHP API provides `GET /api/v1/health`, public read-only `GET /api/v1/discover/{movie|tv|game}?q=...`, session authentication under `/api/v1/auth`, an authenticated Library API under `/api/v1/library`, and private Custom Lists under `/api/v1/lists`. Discovery returns normalized media without storing search results. Browser authentication uses HttpOnly session cookies and CSRF tokens; database-backed rate limits protect login, registration, discovery, import, and password changes. The web server document root must be `backend/public`.

From `backend/`, run `composer install`, `composer migrate:status`, and `composer migrate`. Rerunning migrations skips applied versions. DDL cannot be reliably rolled back: if a migration fails, inspect the configured database before retrying. Run `composer test` with explicit `APP_ENV=testing` and `DB_DATABASE=myfunlist_test` to check the API foundation, reset and migrate **only** the local `myfunlist_test` tables, and exercise auth, Library, import, and lists over HTTP with fake provider details. Every test that modifies database data refuses other environments, database names, and non-loopback hosts before connecting. The development database is not reset by tests.

Create a separate, disposable local `myfunlist_test` database before running the full suite. It drops and recreates test tables: never point it at data you need to preserve. For PowerShell, run from `backend/` in a separate test terminal, then close it before starting development servers:

```powershell
$env:APP_ENV = 'testing'
$env:DB_DATABASE = 'myfunlist_test'
composer test
```

The API can also be started from `backend/` with `php -S 127.0.0.1:8080 -t public public/index.php`. A configured database returns `{"data":{"status":"ok"}}` at `/api/v1/health`. Composer needs PHP's ZIP extension or an archive extractor; XAMPP includes `php_zip` but it may need enabling for CLI use.

For browser auth, first call `GET /api/v1/auth/csrf` with cookies enabled, then send its `data.csrfToken` in `X-CSRF-Token` for `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, or `POST /api/v1/auth/logout`. Registration and login accept JSON `email` and `password`; both rotate the session and CSRF token, so fetch a new token afterward. `GET /api/v1/auth/me` returns the current user with `id`, `email`, nullable `displayName`, and UTC `createdAt`. Local HTTP uses a host-only HttpOnly cookie; production HTTPS uses a Secure host-only cookie. Configure server-side session storage for production if the PHP default is unsuitable.

The private Profile API provides authenticated `GET /api/v1/profile` and CSRF-protected `PATCH /api/v1/profile` with `{"displayName":"Example User"}` (or `null` to clear it). The display name is optional, non-unique, and at most 80 Unicode characters after trimming. Email is read-only. CSRF-protected `POST /api/v1/account/password` accepts `{"currentPassword":"...","newPassword":"..."}` and returns 204 on success. It keeps the current session authenticated while rotating its ID and CSRF token; fetch a new CSRF token before another mutation.

The authenticated Library routes are `GET /api/v1/library`, `POST /api/v1/library`, and `PATCH`/`DELETE /api/v1/library/{entryId}`. Add with JSON such as `{"media":{"source":"tmdb","mediaType":"movie","sourceId":"123"}}`; the server fetches authoritative provider details on first add. PATCH accepts `status`, `rating`, or both. POST, PATCH, and DELETE require the current CSRF token; entry IDs come from `userMedia.id` in responses. A duplicate add returns 200 with `added: false`; a new add returns 201 with `added: true`.

`POST /api/v1/library/import` accepts `{"items":[{"media":{"source":"tmdb","mediaType":"movie","sourceId":"123"},"userMedia":{"status":"watched","rating":8.5,"addedAt":"2026-09-20T12:00:00Z"}}]}` with an authenticated session and CSRF token. The frontend offers explicit import of old browser items, sends only media identity and personal state, and batches within the 200 item and 128 KiB limits. Existing account state wins. The browser copy remains available for recovery, including after partial failures.

Custom Lists require authentication. `GET /api/v1/lists` returns the current user's list summaries; `POST /api/v1/lists` creates one with a required `title` and optional `description`. `GET`, `PATCH`, and `DELETE /api/v1/lists/{listId}` read, edit, and delete an owned list. The detail response contains `list` metadata and `items` in the Library media shape. `POST /api/v1/lists/{listId}/items` accepts `{"userMediaId":"84"}` and returns `{"added":true}` (201), or `false` (200) when already present. `DELETE /api/v1/lists/{listId}/items/{userMediaId}` removes only list membership. All mutations require CSRF. Only current Library entries may be added; removing one from the Library automatically removes its list memberships.

## Public MVP deployment readiness

Serve the Vue build and `/api/v1/*` from one HTTPS origin. The web server must route API requests to `backend/public/index.php`, serve built assets directly, and fall back to `index.html` for frontend routes only. The backend requires private production environment values, persistent private sessions, a migrated MySQL-compatible database, and a backup before migrations. Run `npm run build`; check migrations with `composer migrate:status` before `composer migrate`. See [the deployment guide](docs/DEPLOYMENT.md) for the environment table, routing and security requirements, backup/restore/rollback procedure, local build smoke, private staging checklist, and public release checklist.

## Third-party material

The TMDB logo is included for attribution; the app displays TMDB credits and RAWG backlinks where their media appears. Metadata and artwork are provided by external services and remain subject to their owners' rights. See the [TMDB attribution requirements](https://developer.themoviedb.org/docs/faq) and [RAWG API terms](https://rawg.io/apidocs). Review provider plans and commercial-use permissions before monetizing the app. This repository does not grant an open-source license; the backend package is marked proprietary.
