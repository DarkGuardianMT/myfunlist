# Trackora project context

## Project overview

Trackora is the new main repository for a long-term, full-stack media tracking platform and portfolio project. The previous vanilla JavaScript Trackora repository is considered a prototype.

## Product vision

Users should eventually be able to track, rate, organize, and share the media they consume. The intended scope includes personal libraries, statuses, ratings, personal lists, and sharing lists and profiles. Social features may be considered later if they fit the product.

## Current technical stack

- Frontend: Vue 3, Vite, JavaScript, and normal CSS.
- No router, state library, CSS framework, or other frontend library has been chosen beyond the current dependencies.

## Planned backend direction

A PHP REST API and MySQL database are planned for a later phase. They are not part of the current repository implementation. Backend architecture, authentication, and database schema remain undecided.

## Current repository state

The frontend was initialized directly in the repository root. It contains a minimal Vue app with the default Vite demo content removed. `npm run dev` and `npm run build` have worked. There are no product features, backend, authentication, or database yet.

## Core product concepts

- Media items represent the underlying works and their metadata.
- User media entries represent a user's relationship with a media item, including status, rating, notes, timestamps, and list membership.
- Personal libraries and lists organize a user's media. Their exact behavior is undecided.
- Profiles and shared lists are part of the product vision. Their behavior is undecided.

## Media types

The intended types are movies, TV shows, books, games, and anime. Support for other media types may be considered later.

## Current architectural decisions

- Keep external media metadata separate from user-specific media data.
- Stay with Vue 3, Vite, JavaScript, and CSS for the current frontend phase.
- Defer backend code, database design, authentication, and additional libraries until their respective needs are defined.

## Data model direction at a high level

An external media item is expected to have a source, source ID (`sourceId`), media type, title, image/poster/cover, and metadata. A separate user-specific record is expected to hold status, rating, notes, timestamps, and list membership. This separation should guide future database design; the exact schema and relationships are undecided.

## External API direction

- Books: Google Books API is a likely source, not a final choice.
- Movies and TV: TMDb is a likely source, not a final choice.
- Games: source undecided.
- Anime: source undecided.

API integration details and data synchronization behavior are undecided.

## Development principles

Keep changes focused and maintainable, follow existing project conventions, verify meaningful frontend changes with the build, and document material changes to project state or architecture. Repository working rules are in `AGENTS.md`.

## Current status

The base Vue/Vite frontend is working. Product requirements and architecture have not yet been defined in detail.

## Next milestone

Define the initial product requirements and first implementation scope before building product features. The specific first feature is undecided.

## Future ideas

Additional media types and social features may be explored later. Their scope and priority are undecided.
