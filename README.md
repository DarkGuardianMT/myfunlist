# MyFunList

## Introduction

MyFunList is an independent full-stack media tracking application under active development.
Discover books, movies, TV shows, and games, then organize and track them in a private account Library.

## Features

- Account registration, login, and logout.
- Book, movie, TV, and game discovery through external media APIs.
- A persistent Library with media-specific statuses, filtering, sorting, and optional personal ratings from 0.5 to 10 in half-point steps.
- Private Custom Lists for organizing Library entries across media types.
- Private profiles with display-name editing and password changes.
- Optional import of legacy browser Library data, preserving the browser copy for recovery.
- Light and dark themes with responsive navigation.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | Vue 3, Vue Router, Vite, JavaScript, CSS |
| Backend | PHP 8.2+, Composer, PDO |
| Database | MySQL / MariaDB |
| Testing | Node.js test runner, Vue Test Utils, jsdom, PHP scripts |

## Architecture

The Vue frontend lives in `src/`; the structured PHP JSON API lives in `backend/` under `/api/v1`.
Account data is stored in MySQL/MariaDB, with shared media metadata kept separate from each user's tracking data.
Authentication uses server-side sessions, HttpOnly cookies, and CSRF protection; database-backed rate limits protect selected endpoints.

TMDB and RAWG requests run on the backend. Google Books search runs in the browser.
Local development uses Vite's API proxy; the planned production setup uses one HTTPS origin.

## Getting Started

Requirements: Node.js 24.15+, npm, PHP 8.2+ with `curl` and `pdo_mysql`, Composer,
and MariaDB 10.4 or MySQL 8.0.16+. Make `php` and `composer` available on your terminal's PATH.

1. From the repository root, install frontend dependencies:

   ```sh
   npm ci
   ```

2. Copy `backend/.env.example` to `backend/.env`. Configure your local database credentials,
   a random `RATE_LIMIT_SECRET` of at least 32 characters, and backend-only `TMDB_API_TOKEN` and `RAWG_API_KEY`.
   See the [development guide](docs/DEVELOPMENT.md#local-configuration) for key generation and optional Google Books configuration.
3. Start MySQL/MariaDB and create an empty local `myfunlist` database.
   Verify that `backend/.env` targets that database before running migrations. From `backend/`, run:

   ```sh
   composer install
   composer migrate:status
   composer migrate
   ```

4. Return to the repository root and start both development servers:

   ```sh
   npm run dev:full
   ```

   Open the Vite URL printed in the terminal. Ctrl+C stops both servers.

Keep real `.env` files and credentials out of Git. Every `VITE_` value is browser-visible;
never use frontend variables for private credentials. Use a local database for this setup.

For tests, API documentation, and troubleshooting, see [Development](docs/DEVELOPMENT.md).
For hosting, security configuration, and release checks, see [Deployment](docs/DEPLOYMENT.md).

## Project Status

MyFunList is under active development. Deployment and production readiness are not verified.
The features listed above are implemented; anime, public profiles, shared lists, and social features remain future work.

Email verification, password reset, email changes, and account deletion are not implemented.
Password changes renew the current session but do not invalidate other sessions.
Private staging checks must pass before public registration opens.

## Third-Party Services

| Service | Use |
| --- | --- |
| [Google Books](https://developers.google.com/books/docs/v1/using) | Book metadata and covers |
| [TMDB](https://developer.themoviedb.org/docs/faq) | Movie and TV metadata and artwork |
| [RAWG](https://rawg.io/apidocs) | Game metadata and artwork |

The application displays TMDB's logo and attribution notice, and RAWG backlinks where its data is used.
This product uses the TMDB API but is not endorsed or certified by TMDB.

Metadata and artwork remain subject to their owners' rights and provider terms.
Review provider plans and commercial-use permissions before monetizing the application.
This repository currently has no open-source license; the backend package is marked proprietary.
