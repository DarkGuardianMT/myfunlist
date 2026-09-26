# MyFunList

MyFunList is a media tracking app in development. Discover books, movies, TV shows, and games, then save them to a personal Library in this browser.

The planned public domain is `myfunlist.app`. Its deployment status is not confirmed.

## Local development

Run `npm install`, copy `.env.example` to `.env`, and start the app with `npm run dev`. A Google Books API key is optional for local book search. Movie and TV search requires a TMDB API Read Access Token in `VITE_TMDB_API_TOKEN`. Game search requires a RAWG API key in `VITE_RAWG_API_KEY`.

Run `node --test tests/*.test.js` to run the tests and `npm run build` to verify the production build. The Library is currently stored in this browser; there are no accounts yet.

## Backend foundation

The separate PHP API currently provides only `GET /api/v1/health`. It checks application and database readiness; no Library or authentication endpoint exists yet. Use PHP 8.2+, Composer, the `pdo_mysql` extension, and a local MySQL-compatible server. Create an empty `myfunlist` database if needed, then copy `backend/.env.example` to the ignored `backend/.env` and set local database credentials. The web server document root must be `backend/public`.

From `backend/`, run `composer install`, then `php -S 127.0.0.1:8000 -t public public/index.php`. Composer needs PHP's ZIP extension or an archive extractor; XAMPP includes `php_zip` but it may need enabling for CLI use. Open `http://127.0.0.1:8000/api/v1/health`; a configured database returns `{"data":{"status":"ok"}}`. Run `composer test` for the foundation checks. The Vue app does not call the API yet; a Vite `/api` proxy can be added when frontend integration begins.
