# Cinematic UX refinements

Review branch: `review/cinematic-ux-refinements`, based on released main `fe52f5ad1cd07af1db95de90860d7e7d87499ef5`. This follow-up changes frontend presentation and local filtering. It does not authorize a merge or staging deployment.

## Artwork and collection cards

Mixed collections retain balanced portrait frames. Games show the complete, proportionally scaled original image over a soft decorative backdrop derived from that image. Only the decorative backdrop is cropped/blurred; the foreground artwork is never stretched or cropped. Game-only Library and Discover views use landscape frames. Missing artwork keeps the existing explicit fallback.

Comfortable, Compact and List densities share compact tracking controls. A star and personal score open the labeled native rating selector; an unrated item offers **Rate**. Status remains directly editable. The ellipsis disclosure contains the existing lazy Add to Custom List and Remove actions. Escape restores trigger focus; outside pointer/focus closes the disclosure. Panels adjust to viewport edges and mobile navigation. Controls retain 44px minimum touch targets. Removal still uses the existing eight-second Undo transaction and preserves memberships when undone.

The existing API permits **0.5–10 in half-point increments**, plus **Not rated**. Zero is rejected by the backend today. This refinement preserves that contract rather than introducing an invalid zero option. Provider ratings remain separate.

The written Astra reference hierarchy guided the card: artwork, title/concise metadata, small rating, compact status and secondary actions. The two referenced comparison screenshots were not present in this session, so a direct visual comparison with those images was not possible.

## Category navigation and Library filtering

Shared category controls display **Movies → TV Shows → Games → Books**, with **All** first in Library. Home entry points and its search-category choices use the same order. Native toggle buttons expose selection through `aria-pressed`; arrow keys, Home and End move/select categories. The Library bar wraps on very narrow screens and retains existing status, sort and browsing-state logic. Density preference persistence is unchanged.

Canonical values (`movie`, `tv`, `game`, `book`), provider identities and routes are unchanged. An existing Discover URL without a type still defaults to Books, and Home's default search category remains Books. Google Books remains the default book catalogue; Open Library remains an explicitly selected, read-only, tester-gated provider.

## Discover filter scope

The existing TMDB/RAWG Discover controller accepts only `q`. The normalized movie/TV search responses supply year and original language; games supply year and full platform names. These fields support useful **local filtering of returned results**, without new provider parameters, detail fan-out or backend changes.

| Category | Additional controls | Meaning |
| --- | --- | --- |
| Movies | Release year, original language | Exact metadata match among returned movie results |
| TV Shows | First aired year, original language | Exact metadata match among returned TV results |
| Games | Release year, platform | Exact year/platform-name match among returned game results |
| Books | Existing catalogue/search options | Existing Google Books/Open Library contracts retained |

The interface explicitly says **Filter returned results** and explains the maximum 20-result scope. Options come from the current response, including **Not supplied** for missing metadata. Combined filters preserve provider order. An empty filtered subset has its own clear action. These controls do not search the entire provider catalogue or change provider relevance.

Filter state uses `resultYear`, `resultLanguage` and `resultPlatform` URL parameters, survives detail/Back navigation and remembered category context, and never adds parameters to provider requests. A different query clears the local filters. An explicit Search with the same query retains them and keeps the existing intentional refresh behavior. Changing local filters does not fetch again, including after the remote-result cache has expired.

Genre filtering is intentionally absent: normalized search responses do not supply genres, and the current API does not accept genre searches. Catalogue-wide year/language/platform discovery would also require a separately designed provider/API contract. No decorative or unsupported controls were added.

## Verification and limits

See the temporary [review report](../qa/reviews/cinematic-ux-refinements/report.md) for commands, results and inspected before/after desktop/mobile evidence. Tests use isolated synthetic responses and artwork; they do not establish live provider quality, real-account persistence, physical-device behavior, screen-reader acceptance or staging availability. No backend, database, provider limits, authentication, hosting configuration or deployment workflow changes accompany this work.
