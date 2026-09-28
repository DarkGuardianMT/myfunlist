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

The planned production deployment serves Vue and `/api/v1` from the same `https://myfunlist.app` origin. Web authentication uses native PHP sessions with host-only HttpOnly cookies, SameSite=Lax, and Secure in production. Local HTTP uses a separate non-Secure cookie name. A session-bound random CSRF token is required in `X-CSRF-Token` for registration, login, and logout; authentication rotates both the session ID and token. Registration requires a 12–128 character password, stored with PHP's Argon2id when available or PASSWORD_DEFAULT otherwise; login verifies and upgrades old hashes. Only the user ID and CSRF token are stored in the session. A `CurrentUserProvider` supplies an `AuthenticatedUser` identity to controllers; future native bearer authentication can supply the same identity without coupling application logic to `$_SESSION`. Rate limiting for login and registration is required before public launch.

The Library API derives ownership from `AuthenticatedUser` and requires CSRF for mutations. First add resolves provider detail on the server, outside a database transaction, then stores a normalized shared media row and a separate user relationship. Later adds reuse cached media; unique database constraints settle concurrent duplicates. List, update, and delete use the opaque string `userMedia.id` with user-scoped queries, while `mediaKey` remains the client-friendly `source:mediaType:sourceId` identity. The Vue frontend now uses session authentication and the account Library API. Browser localStorage is only a read-only legacy import source.

The authenticated Library import endpoint accepts batches of normalized media identities plus personal status, rating, and timestamp, rather than raw browser storage documents or client-provided shared metadata. It processes up to 200 items separately, reusing authoritative provider resolution and shared media caching. Existing account entries always win conflicts; new entries preserve valid personal state and UTC-normalized `addedAt`. First valid occurrence wins within a batch, with later duplicates reported separately. Per-item validation and provider failures are reported in a result summary, and retries are naturally idempotent through the existing uniqueness constraints. After login or registration, the frontend offers an explicit import for legacy browser items. It chunks requests at 200 items and below 120 KiB, replaces only the known artificial `1970-01-01T00:00:00.000Z` timestamp with import time, and keeps genuine timestamps. Fully resolved imports get a per-account, per-content local completion flag. Browser data remains as recovery data; partial failures remain retryable.

## Current repository state

The first private Profile feature is implemented. `users.display_name` is nullable, Unicode-capable, non-unique, and limited to 80 characters; email remains the read-only account identity. Auth responses and `GET /api/v1/profile` expose only string ID, email, optional display name, and UTC creation date. `PATCH /api/v1/profile` changes the display name, and `POST /api/v1/account/password` verifies the current password and applies the registration password policy. Both mutations require CSRF. Successful password change keeps the current user signed in while rotating the PHP session ID and CSRF token; global session invalidation is deferred. Public usernames and profile URLs are deliberately deferred.

The frontend was initialized directly in the repository root. It has an application shell with shared navigation and Home, Discover, Library, Profile, Login, and Register routes. Discover supports Google Books, TMDB movie, TMDB TV show, and RAWG game search. Authenticated users can add all four media types to their MySQL-backed account Library, change statuses and personal ratings, or remove items. Anonymous users see login/register prompts; old browser items are never displayed as account Library data.

## Core product concepts

- Media items represent the underlying works and their metadata.
- User media entries represent a user's relationship with a media item, including status, rating, notes, timestamps, and list membership.
- Personal libraries and lists organize a user's media. Their exact behavior is undecided.
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
- Use `VITE_RAWG_API_KEY` for frontend RAWG requests temporarily.
- Use a Vite environment variable containing a TMDB API Read Access Token for application-level Bearer authentication. TMDB response fields and image paths are normalized in the TMDB service before reaching Vue components.
- Vite client environment values, including the RAWG key, TMDB token, and any configured Google Books key, are visible in the browser bundle. Move provider requests that need private credentials behind PHP during the later provider integration phase.
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

An external media item has a source, source ID (`sourceId`), media type, title, and normalized metadata. A separate user-specific record holds status, rating, and timestamps. Notes and list membership remain future features.

## External API direction

- Books: Google Books API powers the first discovery implementation. It is used only for external book metadata.
- Movies and TV: TMDB powers discovery and normalized external metadata.
- Games: RAWG powers discovery and normalized external metadata.
- Anime: source undecided.

Data synchronization behavior is undecided.

## Development principles

Keep changes focused and maintainable, follow existing project conventions, verify meaningful frontend changes with the build, and document material changes to project state or architecture. Repository working rules are in `AGENTS.md`.

## Current status

The Vue frontend has account registration, login, logout, current-user bootstrap, private Profile editing and password change, server Library persistence, explicit browser-data import, and account-safe state reset. All four discovery media types remain available. Normal local development starts XAMPP MySQL manually and runs `npm run dev:full` to launch Vite and the XAMPP PHP built-in server together. Vite proxies `/api` to `127.0.0.1:8080` by default; `VITE_API_PROXY_TARGET` can target a configured Apache virtual host. Apache is not required for the normal local workflow.

## Next milestone

Add production rate limiting before public launch. Move provider discovery requests that require private credentials behind PHP.

## Future ideas

Additional media types and social features may be explored later. Their scope and priority are undecided.
