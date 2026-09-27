# MyFunList

MyFunList is a media tracking app in development. Discover books, movies, TV shows, and games, then save them to a personal Library in this browser.

The planned public domain is `myfunlist.app`. Its deployment status is not confirmed.

## Local development

Run `npm install`, copy `.env.example` to `.env`, and start the app with `npm run dev`. A Google Books API key is optional for local book search. Movie and TV search requires a TMDB API Read Access Token in `VITE_TMDB_API_TOKEN`. Game search requires a RAWG API key in `VITE_RAWG_API_KEY`.

Run `node --test tests/*.test.js` to run the tests and `npm run build` to verify the production build. The Library is currently stored in this browser; there are no accounts yet.

## Backend and database

The PHP API currently provides only `GET /api/v1/health`; authentication and Library endpoints are still pending. Use PHP 8.2+, Composer, `pdo_mysql`, and MariaDB 10.4 or MySQL 8.0.16+. Create empty `myfunlist` and `myfunlist_test` databases if needed, then copy `backend/.env.example` to the ignored `backend/.env` and set local database credentials. The web server document root must be `backend/public`.

From `backend/`, run `composer install`, `composer migrate:status`, and `composer migrate`. Rerunning migrations skips applied versions. DDL cannot be reliably rolled back: if a migration fails, inspect the configured database before retrying. Run `composer test` to check the API foundation, reset and migrate **only** the local `myfunlist_test` tables, and verify schema behavior. The development database is not reset by tests.

Start the API with `php -S 127.0.0.1:8000 -t public public/index.php`. Open `http://127.0.0.1:8000/api/v1/health`; a configured database returns `{"data":{"status":"ok"}}`. Composer needs PHP's ZIP extension or an archive extractor; XAMPP includes `php_zip` but it may need enabling for CLI use. The Vue app does not call the API yet; a Vite `/api` proxy can be added when frontend integration begins.
