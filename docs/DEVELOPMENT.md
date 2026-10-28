# MyFunList development guide

Start with the [README](../README.md#getting-started) for prerequisites and basic setup.
This guide covers local configuration, verification, and the current API contracts.
Production configuration, routing, backups, and release checks belong in the [deployment guide](DEPLOYMENT.md).

## Local configuration

Copy `backend/.env.example` to `backend/.env` and use local database credentials.
Keep `APP_ENV=development` for normal local work. Start MySQL/MariaDB manually and create an empty `myfunlist` database before migrations.
PHP and Composer must be on your terminal's PATH. XAMPP can supply PHP and MariaDB on Windows; Apache is optional.
Composer needs PHP's ZIP extension or an archive extractor; XAMPP includes `php_zip`, but it may need enabling for CLI use.

Set `RATE_LIMIT_SECRET` to a unique random value of at least 32 characters. Generate it locally:

```sh
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

Store the generated value only in the ignored backend configuration. Never commit or share it.

| Variable | Local use |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | Local MySQL/MariaDB connection |
| `RATE_LIMIT_SECRET` | Required backend-only secret for shared rate limits outside tests |
| `TMDB_API_TOKEN` | Backend movie/TV discovery, Library metadata resolution, and public Media Detail resolution |
| `RAWG_API_KEY` | Backend game discovery, Library metadata resolution, and public Media Detail resolution |
| `GOOGLE_BOOKS_API_KEY` | Optional backend key for book Library metadata resolution and public Media Detail resolution |
| `SESSION_SAVE_PATH` | Optional private PHP-writable session directory; local HTTP defaults to `backend/var/sessions` |

Google Books discovery runs in the browser and works locally without a key, subject to provider quotas.
Optionally copy the root `.env.example` to `.env` and set `VITE_GOOGLE_BOOKS_API_KEY`.
Every `VITE_` value is visible in the browser bundle. Restrict a production Books browser key to the site and Books API.
Never put TMDB, RAWG, database, rate-limit, or session secrets in frontend variables.

All real `.env` files, dependencies, build output, sessions, database exports, and backups must stay out of Git.
Sample configuration contains placeholders only. Keep credentials out of command arguments and logs.

### Dependencies and migrations

Run `npm ci` from the repository root. From `backend/`, run:

```sh
composer install
composer migrate:status
composer migrate
```

Verify the configured database before migrating; local setup must not target production.
Migrations are CLI-only. Rerunning them skips applied versions.
DDL cannot be reliably rolled back: if a migration fails, inspect the target database before retrying.
For deployed environments, follow the backup and migration procedure in [Deployment](DEPLOYMENT.md#database-backup-and-rollback).

### Development servers

Run `npm run dev:full` from the repository root to start Vite and PHP together. Ctrl+C stops both.
Vite proxies `/api` to `http://127.0.0.1:8080`, keeping browser requests on one origin.

| Root command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite only |
| `npm run dev:backend` | Check port 8080, then start the PHP API on loopback |
| `npm run dev:full` | Start both development servers |
| `npm test` | Run the frontend test suite |
| `npm run build` | Build the frontend into `dist/` |
| `npm run preview` | Preview the built frontend without an API proxy |

You can also start PHP from `backend/` with `php -S 127.0.0.1:8080 -t public public/index.php`.
If using an Apache virtual host instead, set its document root to `backend/public` and set
`VITE_API_PROXY_TARGET` in the root `.env` to that host. Only `backend/public` may be web-facing.
`npm run preview` does not test API routing or authentication; see the [production-build check](DEPLOYMENT.md#local-production-build-check).

## Verification

From the repository root:

```sh
npm test
npm run build
php backend/tests/database_safety.php
composer --working-dir=backend run test:providers
composer --working-dir=backend run test:api
```

These commands do not modify databases or contact live providers. Provider tests cover HTTP error mapping/protections, discovery, and detail normalization. API tests cover routing, public detail responses, and the real bootstrap/middleware/limiter pipeline with provider and counter-storage doubles; the latter accepts only counter SQL and rejects application-table access. The separate guarded MySQL rate-limit suite remains necessary to verify actual database persistence and concurrent workers.
Run `composer validate --strict` from `backend/` to check the backend package configuration.

### Public media detail API

`GET /api/v1/media/{mediaType}/{source}/{sourceId}` returns `{ "data": <normalized detail> }` for `book/google-books`, `movie/tmdb`, `tv/tmdb`, and `game/rawg`. It works without authentication or CSRF and exposes only public provider metadata, never account membership, personal status/rating, sessions, or Custom Lists. Successful responses use `Cache-Control: no-store`. Opening details does not insert/update media, Library or List rows; only the existing durable limiter counters may be written. The public Vue detail page uses `/media/:mediaType/:source/:sourceId`. Discover, Library and Custom List cards link there; authenticated Library controls and lazy Add to List use the existing private APIs separately. See [Project context](../PROJECT_CONTEXT.md#search-navigation-and-caching) for frontend cache and navigation behavior.

Google Books IDs allow 1–191 ASCII letters, digits, underscores, or hyphens. TMDb/RAWG IDs remain positive decimal strings of at most 20 digits, without leading zeroes. Fixed route prefixes and route-specific parameter validators reject unsupported identities, encoded separators, and traversal before provider access. Existing Library/List route IDs keep their numeric constraints. `MediaRules::isValidSourceId()` is shared with Library body validation, whose trimming and 422 error behavior remain unchanged.

The independent `media_detail_ip` policy allows **30 requests per 60-second fixed window per observed IP**, shared across all four detail types. It uses `REMOTE_ADDR`, ignores untrusted forwarded headers, and returns 429 `rate_limited` with `Retry-After` once exhausted. Existing limiter storage and `RATE_LIMIT_SECRET` are required outside testing; failures return safe 503 `service_unavailable`. Discover keeps its separate 60-per-minute policy. Verify real client-IP handling on staging.

Invalid client identities return 404 `not_found`; provider-confirmed missing items return 404 `media_not_found`. Provider timeouts, authentication/authorization failures (401/403), quota responses (429), upstream 5xx, or missing required provider credentials return 503 `provider_unavailable`. Malformed/mismatched payloads return 502 `provider_error`. Error bodies/logs never include raw upstream responses, provider request URLs, or credentials. Google Books continues to use optional backend `GOOGLE_BOOKS_API_KEY`, never the frontend browser key; TMDb/RAWG require their existing backend credentials.

### Database and HTTP tests

**Destructive tests:** `composer test` drops and recreates tables in the separate local `myfunlist_test` database.
Create a disposable database with that exact name first. Never use data you need to preserve or production configuration.
Tests that modify database data require explicit `APP_ENV=testing`, exact `DB_DATABASE=myfunlist_test`, and
`DB_HOST=127.0.0.1` or `localhost` before connecting. The development database is not reset by tests.

In PowerShell, run from `backend/` in a separate test terminal:

```powershell
$env:APP_ENV = 'testing'
$env:DB_DATABASE = 'myfunlist_test'
$env:DB_HOST = '127.0.0.1'
composer test
```

Close that terminal before starting development servers so the test environment is not reused accidentally.
The suite checks database safety, discovery, API foundation, schema, rate limits, authentication/Profile,
Library, legacy import, and Custom Lists. HTTP tests use fake provider details.

## API conventions

The JSON API is versioned under `/api/v1`. Successful responses use a `data` envelope, except 204 responses;
errors use an `error` envelope. Send `Content-Type: application/json` for JSON bodies and retain session cookies.
Authenticated routes derive ownership from the current session. IDs are opaque strings.
All mutations listed below require the current `X-CSRF-Token`, including registration and login.

Database-backed rate limits protect login, registration, TMDB/RAWG discovery, public Media Detail requests, Library import, and password changes.
Blocked requests return 429 with `Retry-After`; limiter configuration or storage failures return a generic 503.
Google Books browser search is outside the PHP limiter. Production client-IP and session requirements are in [Deployment](DEPLOYMENT.md).

### Health and discovery

- `GET /api/v1/health` checks database connectivity and returns `{"data":{"status":"ok"}}` when available.
- `GET /api/v1/discover/{movie|tv|game}?q=...` provides public, read-only search through TMDB or RAWG.
  Results are normalized without storing search results. Google Books search is browser-side.

### Authentication flow

1. Call `GET /api/v1/auth/csrf` with cookies enabled.
2. Send its `data.csrfToken` in `X-CSRF-Token` for `POST /api/v1/auth/register` or `POST /api/v1/auth/login`.
   Both accept JSON `email` and `password`.
3. Registration and login rotate the session ID and CSRF token. Fetch a new token before another mutation.
4. `GET /api/v1/auth/me` returns the authenticated user with `id`, `email`, nullable `displayName`, and UTC `createdAt`.
5. `POST /api/v1/auth/logout` requires authentication and CSRF, destroys the session, and expires the cookie.

Local HTTP uses a host-only HttpOnly, SameSite=Lax cookie; production HTTPS adds Secure.
Authentication is not stored in browser localStorage. Production session storage requirements are documented in [Deployment](DEPLOYMENT.md#configuration).

### Profile and password

- Authenticated `GET /api/v1/profile` returns the private profile.
- `PATCH /api/v1/profile` accepts `{"displayName":"Example User"}` or `{"displayName":null}` to clear it.
  The name is optional, non-unique, and at most 80 Unicode characters after trimming. Email is read-only.
- `POST /api/v1/account/password` accepts `{"currentPassword":"...","newPassword":"..."}` and returns 204 on success.
  It keeps the current session authenticated while rotating its ID and CSRF token; fetch a new token before another mutation.
  Other sessions are not invalidated.

Registration and password changes require 12–128 characters. With PHP's `PASSWORD_DEFAULT` fallback,
passwords are also limited to 72 bytes. Argon2id is used when available.

### Library

All Library routes require authentication:

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/library` | Read the account Library |
| `POST /api/v1/library` | Add a media identity |
| `PATCH /api/v1/library/{entryId}` | Change `status`, `rating`, or both |
| `DELETE /api/v1/library/{entryId}` | Remove a Library entry and its list memberships |
| `POST /api/v1/library/import` | Import legacy personal tracking data |

Add with `{"media":{"source":"tmdb","mediaType":"movie","sourceId":"123"}}`.
The server resolves authoritative provider metadata on first add; later adds reuse shared cached media.
New entries return 201 with `added: true`; duplicates return 200 with `added: false`.
Use `userMedia.id` from responses as `entryId` for updates and deletion.

Statuses are media-specific; personal ratings are nullable values from 0.5 to 10 in 0.5-point increments.
Provider ratings are separate from personal ratings.

Import accepts identity and personal state, for example:

```json
{
  "items": [{
    "media": { "source": "tmdb", "mediaType": "movie", "sourceId": "123" },
    "userMedia": { "status": "watched", "rating": 8.5, "addedAt": "2026-09-20T12:00:00Z" }
  }]
}
```

The API accepts up to 200 items and a 128 KiB body per batch; the frontend stays below 120 KiB.
Existing account state wins conflicts. The frontend offers an explicit import, preserves the browser copy
for recovery, and leaves partial failures retryable.

### Custom Lists

All list routes require authentication; all mutations require CSRF.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/lists` | Read current-user list summaries |
| `POST /api/v1/lists` | Create a list with required `title` and optional `description` |
| `GET /api/v1/lists/{listId}` | Read owned list metadata and Library-shaped `items` |
| `PATCH /api/v1/lists/{listId}` | Edit title or description |
| `DELETE /api/v1/lists/{listId}` | Delete the list |
| `POST /api/v1/lists/{listId}/items` | Add a current Library entry with `{"userMediaId":"84"}` |
| `DELETE /api/v1/lists/{listId}/items/{entryId}` | Remove list membership only |

Adding membership returns 201 with `added: true`, or 200 with `added: false` when already present.
Removing a Library entry automatically removes its list memberships.
Lists are private; public visibility and sharing are not implemented.

## Third-party attribution

Provider links, attribution information, and licensing status are in the [README](../README.md#third-party-services).
Keep the TMDB logo and notice and the RAWG backlinks wherever their data is displayed.
Metadata and artwork remain subject to their owners' rights; review provider terms before commercial use.
