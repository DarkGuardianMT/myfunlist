# Tier Lists prototype design

The owner approved the prototype design for the next development phase after independent code and visual review of [PR #16 at `9d8c1d8`](https://github.com/DarkGuardianMT/myfunlist/commit/9d8c1d8682da20b17879bdc21602bae524c82002). Production navigation and routes currently have no Tier Lists entry. The reviewed prototype runs in a separate development-only Vue entry with fictional records, local artwork and in-memory boards. Save, provider search, Edition recovery and failure scenarios are simulations. Reloading restores the sample boards.

Run `npm run test:ui:server` and open the [local preview](http://127.0.0.1:4179/prototypes/tier-lists/). Its dedicated loopback configuration has no API proxy and keeps the Open Library build flag disabled. See the [preview entry](../prototypes/tier-lists/main.js), [board operations](../prototypes/tier-lists/board.js) and [headless QA setup](HEADLESS_UI_QA.md).

## Approved prototype UX

| Area | Reviewed design |
| --- | --- |
| Standalone navigation | Tier Lists gets its own overview, creation and board editor. The proposed desktop navigation is Home, Discover, Library, Lists, Tier Lists and Profile. The five-slot mobile proposal is Home, Discover, Library, Lists and Tier Lists, with Profile and Log in discoverable from the header account menu. Confirm findability on physical devices before activating production navigation. |
| Boards | A user can have multiple independent boards. Each has a title, optional description and an allowed-media selection. Movies, TV shows, books and games can share a board. All four are selected by default, and creation requires at least one. The overview shows ranked artwork previews, counts, and empty, loading and failure examples. |
| Tiers | New boards start with **S, A, B, C and D**, followed by Unranked. Ranked tiers support editing names, moving them up or down, adding and removing tiers, and selecting Lime, Amber, Coral, Teal, Violet or Slate. The prototype allows one to twelve ranked tiers. The full production limits still need a decision. |
| Media cards | Every card shows artwork, a visible title directly below it and a written media-type indicator. The same board card design applies to ranked and Unranked items. It uses a 2:3 artwork well, contain-fit landscape game artwork, and a same-size fallback when art is missing. The board shows up to three title lines and aligns Move buttons within each row. The full title remains available to assistive technology and appears in the Move dialog. Picker titles wrap without that limit. |
| Media pickers | **My Library** searches and filters items already in the user's Library. **Discover** searches by category and can add a result directly to the board. Both pickers show artwork, title and type, respect the board's allowed types, and indicate existing board membership. Discover also shows provider information. Tier List membership is independent of Library membership. Adding or removing a board item never writes to the Library. |
| Unranked | New selections appear in this reserved lane. It can be ordered and used as a destination, and always follows the ranked tiers. Removing a populated tier requires confirmation and appends its items to Unranked in their existing order. |
| Movement | The six-dot grip supports desktop dragging to another tier or position. **Move** opens the full title, destination and placement controls by click, keyboard or tap, and also offers removal from the board. Cancelling restores trigger focus. Moving returns focus to the item and announces its new tier and position. |
| Explicit Save | Edits apply immediately to the draft. Save updates the in-memory snapshot and shows progress, success, or an error with retry. The draft survives simulated failure. In-app departure from a dirty board prompts the user to keep editing or discard changes. |

The layout follows the [Cinematic design system](UI_DESIGN_SYSTEM.md) in Light and Dark. Desktop and tablet use a distinct tinted tier rail with stronger accents, prominent short ranks and smaller type for names that need to wrap. Phones stack the heading above the cards, with two columns at 320px and three when space allows at 390px. The poster ratio stays consistent, and the sticky Save/status strip and fixed bottom navigation leave room to scroll to remaining actions. Pickers and tier settings use a full-screen dialog on phones. **Jump to tier** makes the long board navigable. The prototype tested 100 cards, including 82 in one tier, without adding virtualization.

## Phase 3 backend review candidate

Phase 3 introduced authenticated persistence for media already in the shared catalogue. The prototype remains a separate development entry.

### Schema and ownership

[Migration 006](../backend/database/migrations/006_create_tier_lists.php) adds three InnoDB tables through the existing manual migration runner.

| Table | Contract |
| --- | --- |
| `tier_lists` | One `users.id` owner, title, nullable description, nonempty allowed-media set, positive revision and UTC timestamps. The owner index serves board lookup and pagination. Optional creation keys are unique per owner and store a hash of the normalized create settings. |
| `tier_list_tiers` | Board-scoped key and unique position. Ranked positions are 0–11. The reserved `unranked` row uses position 12, name Unranked and color Slate. Palette checks allow Lime, Amber, Coral, Teal, Violet and Slate. |
| `tier_list_items` | Unique `(list_id, media_id)` membership and unique position within a lane. A composite `(list_id, tier_key)` foreign key binds every item to a tier on its own board. Media references use the shared `media.id` with `ON DELETE RESTRICT`. |

Deleting a user cascades through their boards, tiers and memberships. Deleting a board removes its tiers and memberships and preserves the shared catalogue. Library removal affects `user_media` and its existing Custom List memberships. Tier Lists have an independent relationship to `media`. [Shared catalogue and Library schema](../backend/database/migrations/001_create_core_schema.php) · [Custom Lists schema](../backend/database/migrations/003_create_custom_lists.php)

### HTTP contract

The collection path is `/api/v1/tier-lists`. Routes use the existing same-origin session. POST, PUT and DELETE require `X-CSRF-Token` from that session and `Content-Type: application/json`. Successful JSON responses use a `data` envelope. All responses in the Tier Lists namespace use `Cache-Control: private, no-store`.

| Method and path | Request and successful response |
| --- | --- |
| `GET /api/v1/tier-lists` | Optional `beforeId` cursor. Returns `200` with `data.boards` and `data.nextCursor`. Boards are ordered by descending ID, 50 per page. Each summary contains `id`, `title`, `description`, `allowedTypes`, `revision`, `createdAt`, `updatedAt` and `itemCount`. |
| `POST /api/v1/tier-lists` | JSON `title`, optional `description` and optional `allowedTypes`. Returns `201` with the complete board at revision 1, including S/A/B/C/D and an empty Unranked lane. Omitted `allowedTypes` defaults to all four types. |
| `GET /api/v1/tier-lists/{id}` | Returns `200` with the complete ordered board. Board IDs are decimal strings. |
| `PUT /api/v1/tier-lists/{id}` | Replace the settings, ordered ranked tiers and ordered Unranked items using the current integer `revision`. Returns `200` with the persisted board and its incremented revision. |
| `DELETE /api/v1/tier-lists/{id}` | JSON with the current integer `revision` as the only field. Returns `204`. |

The complete board contains the summary fields through `updatedAt`, `tiers` and `unranked`. Each ranked tier has `key`, `name`, `color` and `items`. Each returned item has `source`, `mediaType`, `sourceId`, the catalogue `title`, and nullable `artworkImage`. Timestamps are UTC ISO 8601 strings. Request items contain only the exact canonical identity. A compact PUT example follows.

```json
{
  "title": "Favorites",
  "description": null,
  "allowedTypes": ["movie", "tv", "book", "game"],
  "revision": 1,
  "tiers": [{"key": "s", "name": "S", "color": "Lime", "items": [{"source": "tmdb", "mediaType": "movie", "sourceId": "123"}]}],
  "unranked": []
}
```

Array order defines tiers and item positions. Each PUT supplies every kept tier and both ranked and Unranked placements. When a tier is dropped, previously ranked items that are absent from all submitted placements append to Unranked in their previous order. To intentionally remove one of those items in the same save, include its identity in optional `removedItems`. This field accepts only unplaced items from tiers dropped by that save. Items omitted from retained lanes leave the board. The resulting board must respect the allowed media types and item limit.

PUT and DELETE lock the owned board row before validating the revision. A successful save applies one transaction and increments the revision once. A stale valid save or delete returns `409 revision_conflict`. After an uncertain save, GET the board and compare its revision and contents before retrying. At the unsigned 32-bit revision ceiling, saves return `409 revision_exhausted`. The owner can still read or delete the board. Missing and foreign boards return the same `404 tier_list_not_found`. Anonymous requests on enabled routes return `401 unauthenticated`, and invalid write tokens return `403 invalid_csrf`.

POST accepts an optional `Idempotency-Key` header of 1–128 ASCII letters, digits, underscores or hyphens. A retry with the same owner, key and normalized settings returns `200` with the current snapshot of the existing board. Different settings for that key return `409 idempotency_conflict`. The key lasts for the lifetime of the board. Delete releases the key.

### Validation and catalogue scope

- Titles have 1–120 Unicode characters, descriptions have at most 1,000, and ranked tier names have 1–40. Text is trimmed. An empty optional description becomes `null`. Control characters are rejected, with tabs and line breaks allowed in descriptions.
- Boards require 1–12 ranked tiers and support up to 100 items across all lanes. Tier keys start with a lowercase ASCII letter and use up to 40 lowercase ASCII letters, digits, hyphens or underscores. Keys are unique within the board and `unranked` is reserved. Requests use the six palette names shown in the schema table.
- Types are a nonempty, distinct selection from `movie`, `tv`, `book`, `game`. Identities and provider/type pairs follow the existing rules. TMDb movie and TV IDs remain distinct. Source IDs are case-sensitive and Open Library accepts only exact Edition IDs (`OL…M`). A missing catalogue identity returns `422 unknown_media` with a generic `items` message. [Server media rules](../backend/src/Domain/MediaRules.php)
- POST, PUT and DELETE limit bodies to 8 KiB, 64 KiB and 4 KiB respectively. Malformed JSON or the wrong content type returns 400. A body above its limit returns `413 request_too_large`. Other validation failures return `422 validation_error` with safe field details. Internal errors use the existing generic response. Body metadata, owner IDs and client-supplied positions are rejected.

### Rollout and remaining work

`TIER_LISTS_ENABLED` is a private PHP-side setting and defaults to disabled. Only the exact value `true` registers the routes. While disabled, the namespace returns a controlled `404 not_found` without starting a session, opening a database connection or accessing Tier Lists tables. The usual deployment can deliver the code with the setting disabled. Before any separately approved enablement, follow the backup and manual migration procedure, verify migration 006 and its three tables on the intended database, then verify that the PHP workers see the private setting. Disable the setting first for a rollback. [Test safeguards](DEVELOPMENT.md#database-and-http-tests) · [Backup and migration procedure](DEPLOYMENT.md#database-backup-and-rollback)

Board list, detail and Save use existing catalogue records without provider calls. [Phase 4 preparation](#phase-4-discover-catalogue-preparation) adds a separate endpoint for an explicit Discover selection.

### Backend verification

- PHP 8.2.12 syntax checks, Composer strict validation, database-independent API and provider suites, and the database safety suite passed. The 153 Tier Lists API assertions exercise the real router, session middleware and JSON parser with synthetic storage and request input.
- Full `composer test` passed from a clean snapshot without private provider settings, using disposable loopback MariaDB 10.4.32, `APP_ENV=testing` and `DB_DATABASE=myfunlist_test`. The initial run in the configured checkout stopped at a Library HTTP assertion. The clean rerun passed it. The 17 Tier Lists database assertions cover owner isolation, constraints, one winner for concurrent saves at the same revision, 100 ordered items, Library independence and cascades. Run the focused suite with `composer --working-dir=backend run test:tier-lists-mysql` after confirming the database safeguards. MySQL 8 was outside this test run.
- A separate 005-to-006 rehearsal preserved all seven preexisting data tables, including seeded Library and Custom List rows. All five Tier Lists routes returned 404 before migration with the feature disabled. The second migration run skipped the applied version.
- Windows `npm test` passed 417 tests with 13 existing Linux-only skips, and `npm run build` passed. There was no staging migration, enablement or live-browser validation for this branch.

## Phase 4 Discover catalogue preparation

`POST /api/v1/tier-lists/{id}/media/prepare` requires a session and `X-CSRF-Token`. Send an `application/json` object of at most 1 KiB with exactly `source`, `mediaType` and the case-sensitive `sourceId`. For example, `{"source":"tmdb","mediaType":"movie","sourceId":"123"}`. Successful new, reused and concurrent preparations all return `200` with `data` containing the same canonical identity, catalogue `title`, and nullable HTTPS `artworkImage`. Responses, including errors, use `Cache-Control: private, no-store`.

The server checks the owning account and the board's allowed types before catalogue or provider access. It reuses matching records and resolves missing TMDb movies and TV, RAWG games, and Google Books through the existing authoritative metadata resolvers. The short write transaction starts after resolution. It rechecks the board under a shared lock and the exact identity before inserting. A duplicate-key loser rolls back and reads the winner's committed record. Concurrent catalogue misses can each resolve metadata before either one commits. The endpoint stores at most one row per canonical identity, and TMDb movie and TV identities stay distinct.

Open Library preparation requires the existing enabled pilot and public or allowlisted tester access. A trusted persisted Edition can be reused without IP admission or an upstream request. A missing Edition uses the existing shared-budget readiness checks, IP admission and fresh, consistent trusted search snapshot. The exact `OL…M` Edition ID is required. A Work ID, ISBN or title cannot substitute for it. Expired or unusable snapshots return `409 edition_unavailable` without creating a record. The user should rerun the original search and explicitly inspect and select the Edition again. [Open Library Edition contracts](OPEN_LIBRARY_LIBRARY_INTEGRATION.md) · [Discovery access and rollout](OPEN_LIBRARY_PUBLIC_ACCESS.md)

The dedicated durable account policy admits 20 preparation requests per 60-second fixed window across the user's boards. Every authenticated, CSRF-valid attempt counts, including catalogue hits. This initial limit gives manual selection room for a burst while bounding provider calls and catalogue writes. The existing limiter sends `429 rate_limited` with `Retry-After` when exhausted and fails closed if its storage is unavailable. Open Library retains its separate admission controls. Existing Library, Discover and Open Library policies retain their current limits.

| Response | Meaning |
| --- | --- |
| `400 invalid_json` / `invalid_request` and `413 request_too_large` | Invalid JSON or content type, or a body over 1 KiB. |
| `401 unauthenticated` and `403 invalid_csrf` | Session or write token required. |
| `404 not_found` | The Tier Lists route is disabled, or the Open Library pilot is disabled for an Edition request. |
| `403 forbidden` | The Open Library pilot is restricted to testers and the current account is ineligible. |
| `404 tier_list_not_found` | The board is missing or belongs to another account. |
| `422 validation_error` | Unexpected fields, unsupported or invalid identity, or media type outside the board's allowed set. |
| `404 media_not_found` | The provider could not find the exact media. |
| `502 provider_error` | Invalid normalized provider data. |
| `503 provider_unavailable` / `provider_busy` | Missing credentials, temporary provider or trusted-cache unavailability, or contention. These responses carry retry guidance. Database and rate-limit storage errors use the service's generic errors. |

Successful preparation can create a shared catalogue record immediately, even if the user discards the draft. Existing catalogue-backed public detail can show that media, including Open Library's persisted Edition detail. It exposes no association with an account, board, draft or membership. Preparation creates neither Library nor Custom List membership and leaves the board, its placements and its revision unchanged. Only the aggregate PUT persists draft membership.

The next phase connects the approved editor to preparation and aggregate Save. An explicit successful selection enters the local Unranked lane. The UI needs account-switch and late-response guards, expiry and retry feedback, and revision-conflict recovery. Physical touch and screen-reader acceptance, public board quotas and write budgets, and MySQL 8 compatibility testing for MySQL-backed hosts remain rollout work. The existing private Tier Lists gate stays off until separately approved migration and activation.

Phase 4 verification passed 126 isolated preparation API assertions and 12 database preparation assertions, plus the existing API and provider suites and full `composer test`. The guarded loopback MariaDB 10.4.32 run used `APP_ENV=testing` and `DB_DATABASE=myfunlist_test`. Two synchronized processes returned the same committed catalogue record. A forced failure after insertion rolled the row back. The existing exact-Edition resolver rejected an expired synthetic snapshot and completed fresh and persisted reuse with upstream HTTP forbidden by the test double. The Windows unit suite passed 417 tests with 13 existing Linux-only skips. The production build, Composer validation and PHP syntax checks passed.

## Retained QA

These results come from the implementation and review at the approved commit. The documentation and evidence cleanup did not rerun them.

| Check | Historical result |
| --- | --- |
| `node --test tests/tierListPrototype.test.js` | 8 passed |
| `npm test` | 417 passed, 12 existing Windows platform skips, 0 failed |
| `npm run build` | Passed. The production output excluded the preview entry and synthetic fixtures. |
| `npm run test:ui -- tests/ui/tierListPrototype.spec.js --global-timeout=600000` | 15 passed, 9 intentional viewport/input skips, 0 failed. No unexpected network requests, HTTP failures, failed requests, console errors or page errors. |

- Node.js 24.22.1 and Playwright 1.64.1 ran isolated Chromium headless shell 156.0.8078.4 with synthetic fixtures and no live provider traffic. Captures covered **1440×900, 768×1024, 390×844 and 320×740** in both themes. The original run produced 64 images and retained 16. The refined run produced 72 images, and local QA inspected the 16 retained views at their original sizes.
- Refined views showed the fixed-size missing-cover card level with neighboring media, intact landscape game art, aligned Move actions, and the full title in a dialog at 320px. The bolder tier rail kept Unranked on one line, and the long tier name wrapped across whole words on the dense board. The six accents reached at least 3:1 against the tinted rail and heading text reached at least 4.5:1 in both measured themes. Headless interaction checks covered 44px controls, horizontal overflow, focus return, the desktop grip and the final Unranked action on the 100-item board.
- Original review resolved an ambiguous color label, a drag test that needed stepped pointer motion, and a Windows test server left behind after teardown. The refinement run corrected an overly broad `S` heading selector and a rail treatment that broke longer names mid-word. Final runs passed. The retained report records the nonblocking terminal warnings and test setup. Headless evidence does not establish physical-device or screen-reader acceptance, live provider behavior, staging deployment or independent live-browser results.

### Immutable evidence archive

The review snapshot retains the report and all 32 selected screenshots at `9d8c1d8682da20b17879bdc21602bae524c82002`. The full archive includes 16 original and 16 refined images. The original image blobs also match the first review commit. The owner’s local reports and screenshots archives contain byte-verified copies. [Full screenshot and report archive](https://github.com/DarkGuardianMT/myfunlist/tree/9d8c1d8682da20b17879bdc21602bae524c82002/qa/reviews/tier-list-ui-prototype) · [Original QA report with both screenshot indexes](https://github.com/DarkGuardianMT/myfunlist/blob/9d8c1d8682da20b17879bdc21602bae524c82002/qa/reviews/tier-list-ui-prototype/report.md)

- [Refined desktop editor](https://github.com/DarkGuardianMT/myfunlist/blob/9d8c1d8682da20b17879bdc21602bae524c82002/qa/reviews/tier-list-ui-prototype/desktop-1440-dark-refined-editor.png) · [390px Unranked](https://github.com/DarkGuardianMT/myfunlist/blob/9d8c1d8682da20b17879bdc21602bae524c82002/qa/reviews/tier-list-ui-prototype/mobile-390-light-refined-unranked.png)
- [Full title in Move at 320px](https://github.com/DarkGuardianMT/myfunlist/blob/9d8c1d8682da20b17879bdc21602bae524c82002/qa/reviews/tier-list-ui-prototype/mobile-320-dark-refined-move.png) · [100-item board](https://github.com/DarkGuardianMT/myfunlist/blob/9d8c1d8682da20b17879bdc21602bae524c82002/qa/reviews/tier-list-ui-prototype/desktop-1440-dark-refined-marathon.png)
