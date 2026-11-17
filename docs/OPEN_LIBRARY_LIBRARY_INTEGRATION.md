# Open Library editions in personal Libraries

17 November 2026. Candidate branch: `review/open-library-library-integration`, from freshly fetched `origin/main` at `e6643de` (PR #11). No merge, deployment, Hostinger configuration, access-flag, rate-limit or schema change accompanies this integration. It is not established as live.

## Identity and metadata

The existing authenticated, CSRF-protected `POST /api/v1/library` accepts only an identity:

```json
{"media":{"source":"open-library","mediaType":"book","sourceId":"OL202M"}}
```

`sourceId` is a canonical Edition ID: `OL`, a positive decimal without leading zeroes, and `M`, at most 32 characters overall. Paths, URLs, encoded separators, lowercase IDs, Work IDs and other media types are rejected. Library body identity trimming remains compatible with the existing API. Google Books keeps its existing volume IDs and default-provider behavior; identical titles, ISBNs or source IDs never merge different source identities.

The backend resolves an unseen Edition solely from unexpired, server-normalized Open Library search results in the existing shared MySQL cache. It checks the exact Edition ID/title, the separate canonical `OL…W` Work ID, and rejects conflicting snapshots or unusable language selections. Browser titles, covers, authors, Work associations and URLs are never accepted as authoritative fields. All matching cached snapshots must normalize to the same record; the server does not silently choose between conflicting associations or another Edition.

Persisted title, publication dates, language tags and ISBNs belong to the selected Edition. The separate Work ID/title, first-publication year and author names retain their Work provenance. A cover is persisted only when search provenance identifies it as the selected Edition's cover; it is rebuilt from a validated numeric cover ID on `covers.openlibrary.org`. A Work cover is never relabelled as Edition artwork. Missing description, publisher, page count or other metadata is not fabricated.

This is a trusted **search snapshot**, not an independent verification against Edition/Work JSON endpoints, the full edition catalogue or the book's actual content. Language tags remain catalogue claims. No additional provider endpoints or automatic metadata refresh are introduced.

## Shared budget and cache recovery

First resolution uses the same `OpenLibraryPilot`, shared singleton transaction and canonical `REMOTE_ADDR` admission as search: five admissions per rolling minute, HMAC identities, ignored forwarding headers and the existing 1,024-client capacity. Missing/expired/conflicting snapshots consume admission and return `409 edition_unavailable`. Admission exhaustion returns 429 with `Retry-After`; storage/configuration failure fails closed. Main-pilot enablement, shared-budget assertion, identifying User-Agent and stable secret are required for this first cache resolution. The discovery public switch and tester boundary are unchanged; Library mutations always require account authentication and CSRF.

Saving issues **zero upstream requests**, makes no provider reservation and never changes provider spacing, outstanding reservations or failure cooldown. Existing search still owns the only upstream Open Library HTTP path, using its fixed host, identifying User-Agent, committed reservation and no HTTP inside transactions. The shared 20-entry/300-second cache, 2 MiB state bound, 1.1-second completion spacing and failure cooldown remain unchanged. Existing saved/shared media and duplicate adds reuse the established `LibraryService` path without another cache resolution or admission; status, rating, Lists and persisted detail do not contact Open Library.

On 409 the frontend invalidates only local search-cache entries containing that Edition, without clearing provider cooldown. The user must explicitly submit the search again and inspect its selected Edition; there is no automatic search, retry or substitution. A conflicting server snapshot can still prevent saving until it expires or is evicted. If the renewed search selects a different Edition, saving requires the user to act on that result. Local success caching and normal navigation deduplication remain intact.

On save 429/503, the action waits at least 60 seconds, respecting a longer bounded `Retry-After`, then merely enables manual retry. Unknown Library membership remains disabled while loading; load errors offer an explicit retry. Duplicate clicks are guarded, success becomes In Library, and late responses/feedback cannot cross account or component transitions. Anonymous visitors get the existing Login route and an explanation to return to the search after signing in; login does not auto-save.

## Persistence and existing features

No migration is needed. The inspected `media` table already stores string source/type/ID fields, JSON-text metadata and unique `(source, media_type, source_id)`. A normalized Edition snapshot must fit within 60,000 UTF-8 JSON bytes, leaving room inside the existing TEXT column rather than truncating or widening it. `user_media` already provides per-account unique membership, book status and nullable 0.5–10 half-point ratings. Existing `lists`/`list_items` reference owned `user_media` entries, with foreign-key cascades for removal.

The implementation reuses Library add/update/delete, account scoping, duplicate/race handling, search/filter/sort, Comfortable/Compact/List layouts, eight-second deferred Remove/Undo, and Custom Lists. It changes neither the schema nor these ownership/CSRF contracts. A repeated add preserves an existing entry's status/rating. Legacy imports retain identity-only resolution and safely classify shared admission exhaustion per item.

## Saved detail and navigation

`GET /api/v1/media/book/open-library/{EditionId}` uses the existing public media-detail route/model and the unchanged `media_detail_ip` limiter. It reads only trusted persisted shared metadata; an Edition not yet persisted returns 404 without a provider lookup. The route exposes no account membership, ratings, Lists, session or other personal data. Public detail can remain available for saved media when discovery is disabled, without defeating the provider emergency stop.

The response labels separate Edition and Work fields, allows only fixed-host Edition artwork, and identifies its provenance as `metadataSource: "persisted-search"`. The page explains that this is a saved catalogue snapshot rather than live Edition detail, shows Open Library attribution and separate fixed-host Edition/Work links, and omits unknown fields. Saved status/rating and lazy List controls continue through the existing private APIs. Library and Custom List cards reuse the canonical route and contextual Back to Library / Back to List navigation.

## Verification and limitations

The following findings retain both QA reports from 17 November 2026. At the owner's request, final PR #12 preparation removes only the temporary integration report, ten screenshots and persistence follow-up report from the branch tip. The [original integration report](https://github.com/DarkGuardianMT/myfunlist/blob/2f9d503f6d6d2bc0c2b4fd46ac971c8f455295b7/qa/reviews/open-library-library-integration/report.md), [screenshot archive](https://github.com/DarkGuardianMT/myfunlist/tree/2f9d503f6d6d2bc0c2b4fd46ac971c8f455295b7/qa/reviews/open-library-library-integration) and [persistence report](https://github.com/DarkGuardianMT/myfunlist/blob/2f9d503f6d6d2bc0c2b4fd46ac971c8f455295b7/qa/reviews/open-library-library-persistence/report.md) remain recoverable at checkpoint `2f9d503`. Unrelated historical evidence is preserved. These are recorded implementation/follow-up results; the cleanup does not rerun application or browser tests or access any database.

### Automated implementation checks

| Command/check | Recorded result |
| --- | --- |
| `npm test` | 376 total: **364 passed**, 12 existing Linux/POSIX skips on Windows, zero failed; exit 0 |
| `npm run build` | Passed; 118 modules and production assets generated; exit 0 |
| `npm run test:ui` | **68 desktop/mobile headless tests passed**, 3.9 minutes, clean teardown; exit 0 |
| `npm run test:ui -- tests/ui/openLibraryLibrary.spec.js` | Three focused runs each passed all four tests: 34.3s, 21.2s and 19.9s; exit 0 each |
| `php backend/tests/database_safety.php` | Passed during implementation and persistence follow-up; no database opened by this check |
| `composer --working-dir=backend run test:providers` | Passed: HTTP 28, Open Library adapter/cache 87, admission/access 150, storage/failure 55, Edition 82 and media detail 313 assertions; discovery suite passed |
| `composer --working-dir=backend run test:api` | Passed: router 105, media API 332, rate-limit pipeline 52 and memberships 22 assertions |
| PHP syntax checks | All 83 PHP files in source/config/public/bin/tests passed |
| `composer --working-dir=backend validate --strict` | Passed |
| Initial guarded read-only database preflight and `test:open-library-library` | Failed before writes with `Isolated myfunlist_test database unavailable; no writes performed.` Resolved by the separate MariaDB follow-up below |
| Documentation/scope checks | Implementation: 79 local file/heading links across five Markdown documents; persistence follow-up: 59 links. Both scoped diffs and `git diff --check` passed |

Implementation checks used Node 24.22.1 with its runtime directory prepended to PATH; final build/capture commands explicitly invoked the installed npm CLI through that Node executable. PHP was 8.2.12. Playwright 1.64.1 used managed headless Chromium 156.0.8078.4, revision 1248.

Safe PHP coverage rejects Work IDs as save/detail identities, malformed/noncanonical IDs, untrusted browser metadata, missing Edition titles, unusable language selections, expired/missing/conflicting snapshots and oversized UTF-8 metadata. It preserves separate Work identity, cover provenance, client admission, forwarding-header resistance, reservations, spacing/cooldown and fail-closed storage behavior. Authentication/CSRF rejection uses the real bootstrap before database access. Cache hits and persisted details cause no upstream requests, including during a synthetic outage. Google identities remain distinct.

Frontend/headless coverage includes anonymous Login links without writes; membership loading/errors/manual retry; identity-only CSRF-protected saves; double-click suppression; In Library/detail links; expired-trust recovery without automatic search; save cooldown/manual retry; retained search cooldown; and stale responses/account changes. It exercises Want to Read/Reading/Finished, 0.5/8.5/10 ratings, Comfortable/Compact/List layouts, title filtering, eight-second Remove/Undo without DELETE, Custom List membership/reload, separate Work/Edition detail fields/attribution and Back to Library/List. Existing Google/default-provider, language/ISBN, accessibility/disclosure and provider-isolation regressions pass.

### Headless isolation and retained visual findings

Chromium used fresh ephemeral headless contexts, synthetic sessions/catalogue metadata/artwork, mocked API mutations, blocked unexpected external requests and a dedicated loopback-only Vite server. The ordinary Open Library build flag stayed false; only the isolated component harness enabled synthetic search responses. No visible browser, existing profile, real account or remote provider/database was used. Browser reload assertions establish mocked UI continuity; actual persistence was tested separately below.

All ten screenshots were opened and inspected during implementation. Desktop captures were 1440×900; mobile captures were 390×844 with touch emulation. Responsive assertions also covered 320px and 768px. The images contained only synthetic data/artwork/account state and did not validate actual provider branding or content quality. Filenames below identify the archived captures, not current file links.

| Archived capture | Inspected finding |
| --- | --- |
| `desktop-after-open-library-save-light.png` | Separate Work/Edition panels, ISBN/language caveat, provider attribution and exact-Edition Add action remain clear; no new overlap |
| `mobile-after-open-library-save-light.png` | Long metadata wraps; preview, Edition link, Add action and exact-Edition explanation fit above fixed navigation |
| `desktop-after-open-library-library-dark.png` | Selected-Edition title/artwork, 8.5 rating, status, filter and density controls remain readable |
| `mobile-after-open-library-library-controls-dark.png` | Focused frame shows the full rating/status control above fixed navigation; long title wraps |
| `desktop-after-open-library-detail-light.png` | Edition title/ID/publication remain separate from Work title/ID/authors/year; tracking, snapshot caveat and both attribution links are present |
| `mobile-after-open-library-detail-metadata-light.png` | Separate Edition/Work fields and long Work title wrap in two columns; snapshot/language caveat remains readable; attribution links are below this viewport |
| `desktop-after-open-library-list-dark.png` | Edition, personal rating/status and membership controls remain readable; source identity routes correctly |
| `mobile-after-open-library-list-dark.png` | Title, rating, status and membership-removal action remain readable above fixed navigation |
| `mobile-after-open-library-library-dark.png` | Initial supplementary frame includes filters/card but ends as rating enters the fixed-navigation edge, with status below the viewport; the later focused frame clarifies the controls |
| `mobile-after-open-library-detail-light.png` | Initial supplementary frame shows Back/title/status/rating/List action but not the later metadata section; the additional focused frame clarifies that section |

No new horizontal overflow was observed in the selected images or assertions. The initial Library frame is a capture-position limitation, not proof of permanent obstruction; controls were exercised successfully. The existing long native desktop language-matching label remains visually truncated, as in earlier QA; the native option is accessible and unrelated layout was not changed. Mobile captures show deliberate viewport scroll positions, not full-page or physical-device acceptance.

The ten PNGs totalled 952,929 bytes. The first focused export used `QA_REVIEW_TASK=open-library-library-integration`; a later run exported to ignored `test-results/`, and two clearer mobile frames were copied under new names without overwriting the originals. Raw logs, traces, video, profiles, storage state and large generated reports were not committed.

### Real MariaDB persistence follow-up

The original suite deliberately suppressed the underlying connection exception. The follow-up reproduced **error 1049 (unknown database)**; a read-only probe identified XAMPP MariaDB 10.4.32 on port 3306 and confirmed that the exact `myfunlist_test` schema was absent. The first process inventory found no daemon, while a subsequent probe found the existing server available. No server start/stop, service installation, configuration change or data-directory replacement was performed. The earlier run's exact server state cannot be reconstructed from its generic failure alone; the missing test schema was the confirmed follow-up blocker.

All follow-up database operations used explicit `APP_ENV=testing`, exact `DB_DATABASE=myfunlist_test`, `DB_HOST=127.0.0.1` and port 3306, validated with the shared safety helper before connection. Existing local credentials were loaded privately without printing or committing them. The preparation connection selected no application database and inspected only server metadata and the exact test-schema name. Schema absence was rechecked immediately before literal creation without `IF NOT EXISTS`, so an intervening creation would fail rather than reuse an unverified target. A new connection verified `SELECT DATABASE()` and zero tables before applying existing project migrations. No existing development/staging/production application data was queried, reset, migrated or modified; no migration file or application schema was changed.

| Command/check | Recorded result |
| --- | --- |
| `composer --working-dir=backend run migrate` | Existing migrations 001–005 applied only to the verified-new disposable schema |
| `composer --working-dir=backend run migrate:status` | All five applied |
| `composer --working-dir=backend run test:open-library-library` | **28 assertions passed; exit 0**, real MariaDB persistence with synthetic provider data |
| Post-suite read-only verification | Zero rows in `users`, `media`, `user_media`, `lists`, `list_items` and `rate_limit_counters`; five migration records and one initialized Open Library coordination row remain |

| Persistence behavior | Actual result |
| --- | --- |
| Edition/state persistence | Selected Edition title and separate Work ID saved; default Want to Read; Reading/8.5 survived a fresh service/database connection |
| Duplicate add | `added=false`, one account entry, existing status/rating preserved |
| Ownership | Second account cannot see/update/delete the first account's Library entry; denied mutations and private List access return 404 |
| Status/rating | Reading, Finished and Want to Read persist; 0.5, 8.5, 10 and null ratings persist; application validation rejects 8.1 with 422 |
| Custom Lists | Membership retains exact Edition identity; duplicate membership is idempotent; owned Library removal cascades its membership and preserves the other account's entry |
| Persisted detail/re-add | Work association resolves from persisted metadata; re-add reuses shared media; no Open Library HTTP calls |
| Google separation | Same title/source ID remains a separate Google Books record; its single provider response is synthetic |
| Cleanup | Only the suite's synthetic users/media are deleted; dependent records disappear through real foreign-key cascades; application tables are empty afterward |

The suite requires existing empty disposable test tables and performs no migration, schema rebuild or reset itself. It preserves shared coordination state. No application bug was found and no application/test fix was needed. The newly created test schema remained migrated with empty application tables; it was not dropped/reset, and the existing XAMPP server was left running. Follow [Development safeguards](DEVELOPMENT.md#database-and-http-tests) for any future run; never substitute another database or bypass guards.

### Historical failures, warnings and remaining limits

An intermediate focused unit run failed because a direct WorkCard mount lacked a router for its new Login link; the fixture was corrected to use the existing test router. The first full unit run also failed one obsolete assertion in `tests/openLibrary.test.js` that expected all Open Library detail identities to be unsupported; it now asserts the canonical Edition route and still rejects Work routes. Final focused/full unit runs pass. The initial real-database failure stopped before writes and is resolved by the 28-assertion follow-up above.

Expected PHP negative fixtures emit sanitized provider/storage errors. Existing parallel unit fixtures emit unmatched-route and Vite WebSocket-port warnings; assertions/teardown pass. Playwright emits `NO_COLOR`/`FORCE_COLOR` warnings that PowerShell can wrap as native stderr despite exit 0. Composer may report an unwritable local cache and continue without caching; Git emits LF/CRLF warnings. No headless launch/teardown failure or headed fallback occurred.

Cache-only saving requires fresh, consistent trusted server metadata. There is no live Edition/Work/author lookup or metadata refresh; saved details can be incomplete or stale, and catalogue language claims do not verify book content. Conflicting snapshots may require waiting for expiry rather than merely resubmitting. Recovery never silently substitutes an Edition or searches/retries automatically. Anonymous Login follows the existing flow without automatic return/save.

The persistence follow-up verifies real local MariaDB application-service behavior, not Oracle MySQL or deployed HTTP acceptance. Provider HTTP and its search-budget/cache store remain doubles; the separate real shared-budget concurrency suite was not rerun. No full `composer test` was run. The persistence follow-up did not repeat frontend/build/browser checks, and cleanup repeats only documentation/scope checks.

No live provider request, combined PHP/local production preview, Hostinger operation, access activation, staging deployment, independent live-browser, physical-device or screen-reader acceptance was performed. Hostinger/private release gates from the [public-access rollout](OPEN_LIBRARY_PUBLIC_ACCESS.md) remain. Local verification supports PR review; it does not establish public-launch readiness or live availability. Merge/deployment require separate approval, and merging to main triggers the existing staging deployment. Branch deletion is not authorized.

Final cleanup verification passed: 55 local Markdown file/heading links, four immutable Git archive targets, no stale current-evidence links and `git diff --check`. The diff contains only three updated Markdown documents and the twelve specified evidence deletions. SHA-256 comparison confirmed all 291 other tracked files unchanged, including application code, tests, migrations and configuration. No database was accessed during cleanup.
