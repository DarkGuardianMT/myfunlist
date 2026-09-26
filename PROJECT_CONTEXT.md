# MyFunList project context

## Project overview

MyFunList is the main repository for a long-term, full-stack media tracking platform and portfolio project. The project was originally developed under the working name Trackora; the previous vanilla JavaScript repository under that name is considered a prototype. The planned public domain is `myfunlist.app`; its deployment status is not confirmed.

## Product vision

Users should eventually be able to track, rate, organize, and share the media they consume. The intended scope includes personal libraries, statuses, ratings, personal lists, and sharing lists and profiles. Social features may be considered later if they fit the product.

## Current technical stack

- Frontend: Vue 3, Vite, Vue Router, JavaScript, and normal CSS.
- No state library, CSS framework, or other frontend library has been chosen beyond the current dependencies.

## Planned backend direction

A PHP REST API and MySQL database are planned for a later phase. They are not part of the current repository implementation. Backend architecture, authentication, and database schema remain undecided.

## Current repository state

The frontend was initialized directly in the repository root. It now has an application shell with shared navigation and Home, Discover, Library, and Profile routes. Discover supports Google Books, TMDB movie, TMDB TV show, and RAWG game search. Books, movies, TV shows, and games can be added to one locally persisted Library, given media-specific statuses and personal ratings, or removed. There is no backend, authentication, or database yet.

## Core product concepts

- Media items represent the underlying works and their metadata.
- User media entries represent a user's relationship with a media item, including status, rating, notes, timestamps, and list membership.
- Personal libraries and lists organize a user's media. Their exact behavior is undecided.
- Profiles and shared lists are part of the product vision. Their behavior is undecided.

## Media types

The intended types are movies, TV shows, books, games, and anime. Support for other media types may be considered later.

## Current architectural decisions

- Keep external media metadata separate from user-specific media data.
- Normalize external API responses into a small MyFunList media shape before rendering them. External metadata does not contain user-specific fields.
- Treat movies and TV shows as separate media types even though they share some discovery presentation.
- Treat games as mediaType `game`. Normalize RAWG responses into the external media model before rendering, with source `rawg` and string source IDs.
- Show a RAWG attribution backlink wherever RAWG data or images are used, as required by RAWG's API terms.
- Use `VITE_RAWG_API_KEY` for frontend RAWG requests temporarily. Vite exposes this key in the browser bundle; when the PHP backend is introduced, preferably move RAWG requests behind it so the key is no longer client-visible.
- Use a Vite environment variable containing a TMDB API Read Access Token for application-level Bearer authentication. TMDB response fields and image paths are normalized in the TMDB service before reaching Vue components.
- Do not treat TMDB public vote data as a MyFunList personal rating.
- Show TMDB's approved logo and required notice in a discovery credits section when displaying TMDB-powered search.
- Keep user-specific Library state separate from external media metadata. Components use a domain-oriented Library abstraction and do not access persistence directly.
- Treat ratings as user-specific media state. Personal ratings currently use a 10-point scale in 0.5 increments and may be unset.
- The Library is one source-independent multi-media collection. Book statuses are want-to-read, reading, and finished; movie statuses are want-to-watch and watched; TV statuses are want-to-watch, watching, and completed; game statuses are want-to-play, playing, completed, and dropped. The default game status is want-to-play. Games use the same nullable personal 0.5–10 rating model in userMedia, independent of status and RAWG ratings.
- Canonical media identity combines source, media type, and source ID, so TMDB movies and TV shows with the same numeric ID remain distinct.
- Use localStorage as temporary persistence for the anonymous local Library. The canonical key is `myfunlist_library`; schema version 2 migrates version 1 book keys to type-aware keys while preserving status, rating, and addedAt. Valid data under the former `trackora_library` key still migrates on first read. Adding Games required no schema migration because the persisted structure remains compatible. A future REST API and database should replace the implementation behind the same Library abstraction.
- Stay with Vue 3, Vite, JavaScript, and CSS for the current frontend phase. Vue Router handles frontend page navigation.
- Defer backend code, database design, authentication, and additional libraries until their respective needs are defined.

## Data model direction at a high level

An external media item is expected to have a source, source ID (`sourceId`), media type, title, image/poster/cover, and metadata. A separate user-specific record is expected to hold status, rating, notes, timestamps, and list membership. This separation should guide future database design; the exact schema and relationships are undecided.

## External API direction

- Books: Google Books API powers the first discovery implementation. It is used only for external book metadata.
- Movies and TV: TMDB powers discovery and normalized external metadata.
- Games: RAWG powers discovery and normalized external metadata.
- Anime: source undecided.

Data synchronization behavior is undecided.

## Development principles

Keep changes focused and maintainable, follow existing project conventions, verify meaningful frontend changes with the build, and document material changes to project state or architecture. Repository working rules are in `AGENTS.md`.

## Current status

The base Vue/Vite frontend, four-page application shell, Books/Movie/TV/Game discovery search, and an anonymous unified local Library for all four media types are working. Library persistence is temporary and limited to the current browser.

## Next milestone

Verify the multi-media Library in use, then plan the next milestone while preserving the boundary between external media metadata and user-specific media data.

## Future ideas

Additional media types and social features may be explored later. Their scope and priority are undecided.
