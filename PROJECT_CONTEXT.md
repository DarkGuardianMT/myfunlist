# MyFunList project context

## Project overview

MyFunList is the main repository for a long-term, full-stack media tracking platform and portfolio project. The project was originally developed under the working name Trackora; the previous vanilla JavaScript repository under that name is considered a prototype. The planned public domain is `myfunlist.app`; its deployment status is not confirmed.

## Product vision

Users should eventually be able to track, rate, organize, and share the media they consume. The intended scope includes personal libraries, statuses, ratings, personal lists, and sharing lists and profiles. Social features may be considered later if they fit the product.

## Current technical stack

- Frontend: Vue 3, Vite, Vue Router, JavaScript, and normal CSS.
- No state library, CSS framework, or other frontend library has been chosen beyond the current dependencies.

## Backend direction and current foundation

A small structured plain PHP REST API lives in `backend/`. Composer provides PSR-4 autoloading; PDO is configured for a MySQL-compatible database. The API is JSON, versioned under `/api/v1`, and exposes health, session authentication, and authenticated Library endpoints. Browser and future native clients use the same client-agnostic API contracts.

The core schema now has `users`, shared `media`, and per-user `user_media` tables. Database uniqueness protects both `(source, media_type, source_id)` and `(user_id, media_id)`. Normalized provider-specific fields are JSON text with a database validity check; this avoids MariaDB/MySQL native JSON differences. Ratings are nullable exact `DECIMAL(3,1)`, with a database range check and half-point validation in PHP. Media-type-specific statuses and source/type combinations are PHP domain rules, not SQL ENUMs. Database defaults manage creation and update timestamps; each PDO connection sets the database session to UTC. Future API JSON should expose internal BIGINT IDs as strings.

Project-owned, ordered PHP migrations are tracked in `schema_migrations` and run only from the CLI. Local development uses MariaDB 10.4; production should use a compatible modern MySQL release (8.0.16+ for enforced CHECK constraints). Integration tests reset only a separate local `myfunlist_test` database. Account logic trims and lowercases ASCII email addresses before registration and login lookup; the database's case-insensitive unique email index remains the final duplicate guard. International email support is deferred.

The planned production deployment serves Vue and `/api/v1` from the same `https://myfunlist.app` origin. Web authentication uses native PHP sessions with host-only HttpOnly cookies, SameSite=Lax, and Secure in production. Local HTTP uses a separate non-Secure cookie name. A session-bound random CSRF token is required in `X-CSRF-Token` for registration, login, and logout; authentication rotates both the session ID and token. Registration requires a 12–128 character password, stored with PHP's Argon2id when available or PASSWORD_DEFAULT otherwise; login verifies and upgrades old hashes. Only the user ID and CSRF token are stored in the session. A `CurrentUserProvider` supplies an `AuthenticatedUser` identity to controllers; future native bearer authentication can supply the same identity without coupling application logic to `$_SESSION`. Shared database rate limits protect credential endpoints and other abuse-prone requests.

The Library API derives ownership from `AuthenticatedUser` and requires CSRF for mutations. First add resolves provider detail on the server, outside a database transaction, then stores a normalized shared media row and a separate user relationship. Later adds reuse cached media; unique database constraints settle concurrent duplicates. List, update, and delete use the opaque string `userMedia.id` with user-scoped queries, while `mediaKey` remains the client-friendly `source:mediaType:sourceId` identity. The Vue frontend now uses session authentication and the account Library API. Browser localStorage is only a read-only legacy import source.

The authenticated Library import endpoint accepts batches of normalized media identities plus personal status, rating, and timestamp, rather than raw browser storage documents or client-provided shared metadata. It processes up to 200 items separately, reusing authoritative provider resolution and shared media caching. Existing account entries always win conflicts; new entries preserve valid personal state and UTC-normalized `addedAt`. First valid occurrence wins within a batch, with later duplicates reported separately. Per-item validation and provider failures are reported in a result summary, and retries are naturally idempotent through the existing uniqueness constraints. After login or registration, the frontend offers an explicit import for legacy browser items. It chunks requests at 200 items and below 120 KiB, replaces only the known artificial `1970-01-01T00:00:00.000Z` timestamp with import time, and keeps genuine timestamps. Fully resolved imports get a per-account, per-content local completion flag. Browser data remains as recovery data; partial failures remain retryable.

## Current repository state

Private Custom Lists now organize existing account Library entries. The `lists` table stores owner, title, optional description, and timestamps; `list_items` uses `(list_id, user_media_id)` as its composite primary key. A list may mix books, movies, TV, and games, and titles need not be unique. Membership reads the current `user_media` and shared `media` rows rather than duplicating media identity or personal status/rating. Database cascades delete memberships when their list or Library entry is removed, and delete lists when their owner is deleted. API ownership always comes from `AuthenticatedUser`; unowned list IDs return the same 404 as missing IDs. List items display newest membership first, breaking ties by `user_media_id`. A list's `updatedAt` reflects metadata and membership changes, including membership removed by Library deletion across all affected lists; Library status/rating and shared media metadata changes do not touch it. The Library deletion service touches affected lists in the same transaction before the foreign key cascade removes memberships. Manual ordering, visibility, sharing, public list pages, and social/profile integration remain deferred.

The first private Profile feature is implemented. `users.display_name` is nullable, Unicode-capable, non-unique, and limited to 80 characters; email remains the read-only account identity. Auth responses and `GET /api/v1/profile` expose only string ID, email, optional display name, and UTC creation date. `PATCH /api/v1/profile` changes the display name, and `POST /api/v1/account/password` verifies the current password and applies the registration password policy. Both mutations require CSRF. Successful password change keeps the current user signed in while rotating the PHP session ID and CSRF token; global session invalidation is deferred. Public usernames and profile URLs are deliberately deferred.

The frontend was initialized directly in the repository root. It has an application shell with shared navigation and Home, Discover, Library, Lists, Profile, Login, and Register routes. Discover supports Google Books, TMDB movie, TMDB TV show, and RAWG game search. Authenticated users can add all four media types to their MySQL-backed account Library, change statuses and personal ratings, or remove items. Anonymous users see login/register prompts; old browser items are never displayed as account Library data.

The frontend visual system now uses CSS color tokens for Light and Dark themes. Light is the default; a header control switches themes and stores the preference under `myfunlist_theme` in device-local browser storage. The restrained blue/violet brand palette applies to app chrome, while media artwork remains unfiltered. Theme preference is UI state and is not part of account persistence.

Desktop and tablet widths retain the top header navigation. At 640px and below, a compact brand and theme header sits above a fixed five-item bottom navigation. The final item is Profile for authenticated users and Login for anonymous users; authenticated mobile users can log out from Profile.

TMDB movie/TV and RAWG game discovery now use public read-only `GET /api/v1/discover/{mediaType}?q=...` routes. PHP calls the providers with backend-only credentials and returns bounded, normalized MyFunList media. Search does not write media rows. Google Books discovery remains browser-side; any production browser key must be restricted by site and API. Adding a discovery result to the Library still sends identity only and independently resolves authoritative metadata on the backend.

## Core product concepts

- Media items represent the underlying works and their metadata.
- User media entries represent a user's relationship with a media item, including status, rating, notes, timestamps, and list membership.
- The Library tracks a user's media; private Custom Lists organize entries from that Library. Public and sharing behavior remains undecided.
- Private account profiles now show display name, email, and membership date. Public profiles and shared lists remain future product work.

## Media types

Anime is a planned future media type. TV and Anime may later support season-level tracking through dedicated related data built on the current core `media` and `user_media` model. Episode-level tracking is deferred much further; TV-only season fields should not be added to `user_media`.

The intended types are movies, TV shows, books, games, and anime. Support for other media types may be considered later.

## Current architectural decisions

- Keep external media metadata separate from user-specific media data.
- Normalize external API responses into a small MyFunList media shape before rendering them. External metadata does not contain user-specific fields.
- Treat movies and TV shows as separate media types even though they share some discovery presentation.
- Treat games as mediaType `game`. Normalize RAWG responses into the external media model before rendering, with source `rawg` and string source IDs.
- Show a RAWG attribution backlink wherever RAWG data or images are used, as required by RAWG's API terms.
- TMDB and RAWG credentials stay in backend configuration; provider search and detail resolution run in PHP. The frontend receives normalized media through relative same-origin API paths.
- A configured `VITE_GOOGLE_BOOKS_API_KEY` remains visible in the browser bundle because Books discovery still runs directly in the browser. Restrict a production key to the site and Books API.
- Do not treat TMDB public vote data as a MyFunList personal rating.
- Show TMDB's approved logo and required notice in a credits section where TMDB data or images are displayed.
- Keep user-specific Library state separate from external media metadata. Components use a domain-oriented Library abstraction and do not access persistence directly.
- Treat ratings as user-specific media state. Personal ratings currently use a 10-point scale in 0.5 increments and may be unset.
- The Library is one source-independent multi-media collection. Book statuses are want-to-read, reading, and finished; movie statuses are want-to-watch and watched; TV statuses are want-to-watch, watching, and completed; game statuses are want-to-play, playing, completed, and dropped. The default game status is want-to-play. Games use the same nullable personal 0.5–10 rating model in userMedia, independent of status and RAWG ratings.
- Canonical media identity combines source, media type, and source ID, so TMDB movies and TV shows with the same numeric ID remain distinct.
- The account Library uses relative `/api/v1` REST paths, same-origin session cookies, and centralized CSRF handling. Shared `useAuth` state tracks the account; `useLibrary` resets on account changes and guards against stale requests. `userMedia.id` remains an opaque string for PATCH/DELETE; `mediaKey` remains the UI identity.
- The old localStorage keys `myfunlist_library` (schema versions 1 and 2) and `trackora_library` are read-only import sources. Version 1 book keys are normalized in memory, with no writes or deletion of old storage. Import dismissal lasts for the current page session.
- Stay with Vue 3, Vite, JavaScript, and CSS for the current frontend phase. Vue Router handles frontend page navigation.
- Keep database migrations separate from normal HTTP requests and use the backend domain rules when authentication and Library behavior are implemented.

## Data model direction at a high level

An external media item has a source, source ID (`sourceId`), media type, title, and normalized metadata. A separate user-specific record holds status, rating, and timestamps. Custom List membership references that user-specific Library record. Notes remain a future feature.

## External API direction

- Books: Google Books API powers the first discovery implementation. It is used only for external book metadata.
- Movies and TV: TMDB powers discovery and normalized external metadata.
- Games: RAWG powers discovery and normalized external metadata.
- Anime: source undecided.

Data synchronization behavior is undecided.

## Development principles

Keep changes focused and maintainable, follow existing project conventions, verify meaningful frontend changes with the build, and document material changes to project state or architecture. Repository working rules are in `AGENTS.md`.

## Current status

The Vue frontend has account registration, login, logout, current-user bootstrap, private Profile editing and password change, server Library persistence, private Custom Lists, explicit browser-data import, and account-safe state reset. All four discovery media types remain available. Normal local development starts MySQL/MariaDB manually and runs `npm run dev:full` to launch Vite and the PHP built-in server together. PHP and Composer must be available on the terminal PATH; XAMPP can supply them on Windows. Vite proxies `/api` to `127.0.0.1:8080` by default; `VITE_API_PROXY_TARGET` can target a configured Apache virtual host. Apache is not required for the normal local workflow.

The October 9 portfolio publication review scanned all 34 existing commits after fetching remote branches/tags, plus all 384 local file blobs (including unreachable objects), and found no genuine committed credentials or database exports. Existing commit metadata includes the author's personal email; the owner explicitly accepted that public exposure. Local environment files, dependencies, builds, and sessions remain ignored; ignore rules also cover database exports, private key files, backups, and backend uploads. The lockfile now includes compatible security fixes for concurrently/shell-quote and source-map-js. The README documents implemented features, limitations, portable setup, provider attribution, and testing; `npm test` runs the existing frontend suite. Use Node.js 24.15+ to meet the locked test dependencies' engine requirements. No open-source license has been selected; the backend package remains proprietary. Repository visibility and deployed-application readiness are separate decisions.

Publication verification passed all 51 frontend tests, the Vite build, PHP/JavaScript syntax checks, non-database PHP safety/discovery tests, Composer validation/platform checks, and npm/Composer advisory checks. The portable development servers and same-origin proxy started successfully; anonymous authorization, missing-CSRF rejection, and JSON API errors passed smoke checks. Backend credentials were absent from built assets. The local database port refused connections, so the read-only foundation health test failed and the database-resetting suite was not run. No database service, data, migrations, or live credentials were changed. GitHub visibility was confirmed private; publication awaits GitHub's explicit visibility confirmation, which must not be bypassed.

## Next milestone

Public MVP abuse protection now uses shared MariaDB/MySQL fixed-window counters for login (IP and normalized account), registration, TMDB/RAWG Discover, authenticated Library import, and password change. Subjects are HMACed with a backend-only `RATE_LIMIT_SECRET`; the limiter uses server-observed `REMOTE_ADDR` and ignores untrusted proxy headers. Atomic database upserts share counters across workers and restarts; bounded opportunistic cleanup removes expired rows. Blocked requests return the normal JSON error envelope with 429 and `Retry-After`; counter storage failures return a safe 503. The application-level limits supplement future edge/network controls, and staging must verify real client IP handling. Google Books remains browser-side and depends on restricted provider credentials and provider quotas.

Database tests that modify data now require explicit `APP_ENV=testing`, exact `DB_DATABASE=myfunlist_test`, and a loopback host before connecting; they no longer replace a development or production environment themselves. The September 29 local audit found evidence of a prior XAMPP data-directory replacement and logical restore. The original cause is unconfirmed; preserve the old data directories and recovery exports outside Git. The restored development schema and data passed read-only checks and matched fresh migrations. Both databases passed checks after a clean MariaDB restart with recovery disabled; full backend tests and live TMDB/RAWG searches passed. A fresh logical backup and verified stopped-datadir copy are retained outside the repository under XAMPP's recovery directory.

Before public launch, verify limiter and real client IP behavior in staging. A public Google Books key may remain browser-side only with appropriate site and API restrictions. Production also requires HTTPS, same-origin `/api/v1` routing, SPA fallback, a private session store, backups, and monitored server logs. Email verification, password reset, email change, and account deletion remain deferred for the first MVP, with account recovery requiring a support plan.

Deployment follows one HTTPS origin: the Vue build serves frontend routes with an SPA fallback, while `/api/v1/*` reaches only `backend/public/index.php`. Private staging must pass before public registration opens. Back up the target production database before migrations, verify the target and migration status, then run and recheck CLI migrations; restore drills use an isolated database. The durable procedure and checklists live in `docs/DEPLOYMENT.md`.

## Future ideas

Additional media types and social features may be explored later. Their scope and priority are undecided.
