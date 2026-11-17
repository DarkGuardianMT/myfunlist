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

The [temporary sanitized QA report](../qa/reviews/open-library-library-integration/report.md) records executed commands, versions, screenshots, inspection findings and failures. Remove only this integration's newly generated evidence before an approved merge unless permanent retention is approved; preserve historical evidence.

Safe PHP coverage includes canonical IDs, Work/Edition distinction, untrusted fields, cache expiry/conflicts, outages, shared admission, reservation preservation, storage failure, persisted detail and real bootstrap authentication/CSRF rejection. Frontend and mocked headless coverage exercises save/load/error states, deduplication, account changes, Google regressions, tracking, layouts, removal Undo, Lists, reloads and detail navigation/attribution.

The separately guarded `composer --working-dir=backend run test:open-library-library` suite exercises actual media/Library/List persistence with synthetic provider data. It requires explicit `APP_ENV=testing`, exact `DB_DATABASE=myfunlist_test`, loopback host and existing empty disposable test tables. It performs no migrations/schema rebuild/reset, modifies only its synthetic records, and preserves shared coordination state. On this workstation the isolated test database was unavailable: preflight and the suite failed **before writes**. Real database persistence/foreign-key behavior for this new source therefore remains an open verification item; passing mocked browser/provider checks does not establish it.

No live provider request, combined PHP preview, Hostinger operation, access activation, staging deployment or independent live-browser acceptance was performed. Hostinger/private release gates from the [public-access rollout](OPEN_LIBRARY_PUBLIC_ACCESS.md) still apply. The feature must be reviewed, merged and deployed before any claim that it is live.
