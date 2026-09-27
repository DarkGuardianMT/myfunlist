# MyFunList

MyFunList is a media tracking app in development. Discover books, movies, TV shows, and games, then save them to an account Library.

The planned public domain is `myfunlist.app`. Its deployment status is not confirmed.

## Local development

Run `npm install`, copy `.env.example` to `.env`, and set the discovery keys. A Google Books API key is optional for local book search. Movie and TV search requires `VITE_TMDB_API_TOKEN`; game search requires `VITE_RAWG_API_KEY`.

Configure `backend/.env`, then run `composer install`, `composer migrate:status`, and `composer migrate` from `backend/` when needed. For normal development, open XAMPP, start **MySQL**, then run `npm run dev:full` from the project root. Open the Vite URL printed in the terminal. Vite proxies `/api` to the PHP server at `http://127.0.0.1:8080`, keeping browser requests on one origin. Press Ctrl+C to stop both development processes.

`npm run dev` starts only Vite; `npm run dev:backend` starts only the PHP router using `C:\xampp\php\php.exe`. Apache is not required for this workflow. If you use a custom Apache virtual host instead, point its document root at `backend/public` and set `VITE_API_PROXY_TARGET` to that host.

Run `node --test tests/*.test.js` and `npm run build` to verify the frontend. Account Library data uses the PHP API and MySQL. Existing browser storage is offered as a read-only import source after login or registration.

## Backend and database

The PHP API provides `GET /api/v1/health`, session authentication under `/api/v1/auth`, and an authenticated Library API under `/api/v1/library`. Use PHP 8.2+, Composer, `pdo_mysql`, `curl`, and MariaDB 10.4 or MySQL 8.0.16+. Create empty `myfunlist` and `myfunlist_test` databases if needed, then copy `backend/.env.example` to the ignored `backend/.env` and set local database credentials. Set backend `TMDB_API_TOKEN` and `RAWG_API_KEY` to resolve new movies, TV shows, and games; `GOOGLE_BOOKS_API_KEY` is optional. The web server document root must be `backend/public`.

From `backend/`, run `composer install`, `composer migrate:status`, and `composer migrate`. Rerunning migrations skips applied versions. DDL cannot be reliably rolled back: if a migration fails, inspect the configured database before retrying. Run `composer test` to check the API foundation, reset and migrate **only** the local `myfunlist_test` tables, and exercise auth, Library, and import behavior over HTTP with fake provider details. The development database is not reset by tests.

The API can also be started from `backend/` with `C:\xampp\php\php.exe -S 127.0.0.1:8080 -t public public/index.php`. A configured database returns `{"data":{"status":"ok"}}` at `/api/v1/health`. Composer needs PHP's ZIP extension or an archive extractor; XAMPP includes `php_zip` but it may need enabling for CLI use.

For browser auth, first call `GET /api/v1/auth/csrf` with cookies enabled, then send its `data.csrfToken` in `X-CSRF-Token` for `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, or `POST /api/v1/auth/logout`. Registration and login accept JSON `email` and `password`; both rotate the session and CSRF token, so fetch a new token afterward. `GET /api/v1/auth/me` returns the current user. Local HTTP uses a host-only HttpOnly cookie; production HTTPS uses a Secure host-only cookie. Configure server-side session storage for production if the PHP default is unsuitable.

The authenticated Library routes are `GET /api/v1/library`, `POST /api/v1/library`, and `PATCH`/`DELETE /api/v1/library/{entryId}`. Add with JSON such as `{"media":{"source":"tmdb","mediaType":"movie","sourceId":"123"}}`; the server fetches authoritative provider details on first add. PATCH accepts `status`, `rating`, or both. POST, PATCH, and DELETE require the current CSRF token; entry IDs come from `userMedia.id` in responses. A duplicate add returns 200 with `added: false`; a new add returns 201 with `added: true`.

`POST /api/v1/library/import` accepts `{"items":[{"media":{"source":"tmdb","mediaType":"movie","sourceId":"123"},"userMedia":{"status":"watched","rating":8.5,"addedAt":"2026-09-20T12:00:00Z"}}]}` with an authenticated session and CSRF token. The frontend offers explicit import of old browser items, sends only media identity and personal state, and batches within the 200 item and 128 KiB limits. Existing account state wins. The browser copy remains available for recovery, including after partial failures.
