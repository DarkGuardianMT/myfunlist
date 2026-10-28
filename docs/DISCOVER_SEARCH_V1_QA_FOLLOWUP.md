# Discover Search V1 QA follow-up

Investigated on 2026-10-28 against actual HEAD `9399702c081dc5556332eaf4029b389be6011b4c`, including the Search V1 implementation from `8d1aa53` and documentation refresh from `bd6eeb0`. The supplied `MYFUNLIST_DISCOVER_SEARCH_V1_LIVE_QA.md` and review were read from the owner's external project evidence directory. Original reports, screenshots and archives were not modified.

This follow-up uses source inspection, deterministic frontend tests and direct HTTPS provider requests. It is **not a new live-browser QA run**. The original report's partial acceptance and successful navigation/mobile/Library checks remain separate evidence.

## L1: provider language mismatch reproduced

The existing `searchBooks` service was invoked with the deployed public Books configuration. Its fetch wrapper inspected raw JSON before normalization, without logging the key. Outgoing public parameters were:

```text
q=Hobbit&printType=books&maxResults=40&orderBy=newest&langRestrict=en
```

Google returned HTTP 200, `totalItems=228`, and 20 actual candidates: 15 labelled `en`, three `it`, two `de`. The first was **Lo Hobbit**, ID `7cAPEgAAQBAJ`, with raw `volumeInfo.language=it`. This reproduces the reported English mismatch upstream of normalization and cache lookup. The previous normalizer omitted language metadata; it did not change IDs or invent the Italian result. Cache keys already include field, sorting and language, so no cache-isolation defect was found.

[Google's search guide](https://developers.google.com/books/docs/v1/using?hl=en) describes `langRestrict` as restricting results by their language tag; the [list reference](https://developers.google.com/books/docs/v1/reference/volumes/list) supports the parameter and requested result bound. Correctly sending that parameter did not enforce the documented expectation in the observed response. Google's internal indexing/reason for that discrepancy is unknown.

Minimal direct requests with only `q=Hobbit`, `langRestrict=en|tr` and `orderBy=newest` returned HTTP 503 `backendFailed`. Therefore successful minimal-response equivalence and a fresh raw Turkish mismatch remain unverified; the original browser report separately observed the Turkish mismatch.

### Implemented handling

- Continue sending `langRestrict`; no additional/fallback requests are introduced.
- Retain normalized `volumeInfo.language` in browser-side book metadata. Trim/lowercase two-letter ISO-639-1-shaped values; missing, blank, non-string or other formats are unknown. Unsupported regional/three-letter formats are not guessed into matches.
- With English, Dutch or Turkish selected, show only candidates with matching usable metadata. Hide other-language and unknown-language candidates; show the policy and counts for each omitted group in search feedback. An all-omitted response becomes an honest empty state with actionable broadening advice.
- With Any language, keep all returned candidates, including unknown metadata. Changing the provider constraint can yield a different candidate set; there is no guarantee the same omitted editions will be returned on another request.
- Apply this guard after retrieving normalized candidates from the existing filter-specific cache. Preserve ranking/provider order among remaining results, original object identities and volume IDs. No Library records or backend identities are changed.

This is a defensive check over at most 40 returned candidates, not exhaustive language filtering across Google's catalogue. Unknown-language books may be legitimate matches; their omission is explicit, and Any language permits them.

## Title, Author and ISBN: no verified construction defect

The exact decoded expressions and direct results were:

| Case | Existing expression | Observed provider result | Comparison |
| --- | --- | --- | --- |
| Harry Potter / Title | `intitle:"Harry" intitle:"Potter"` | HTTP 200, zero candidates | Unquoted `intitle:Harry intitle:Potter` also returned HTTP 200, zero candidates |
| Quoted Harry Potter / Title | `intitle:"Harry Potter"` | HTTP 200, zero candidates | `intitle:Harry Potter` returned HTTP 503 `backendFailed`; this is not proof of equivalent matching semantics |
| Ursula Le Guin / Author | `inauthor:"Ursula" inauthor:"Le" inauthor:"Guin"` | HTTP 503 `backendFailed` | A minimal `inauthor:Ursula Le Guin` request also returned HTTP 503 |
| Quoted Le Guin / Author | `inauthor:"Le Guin"` | HTTP 503 `backendFailed` | Further comparisons stopped after provider failure |
| ISBN / All fields | `9780261103344` | HTTP 200, zero candidates | `isbn:9780261103344` returned HTTP 503 `backendFailed` |

Parameters were constructed with `URLSearchParams`, verified after decoding, and encoded quotes/spaces/operators reached Google intact. The official guide documents `intitle:`, `inauthor:`, `isbn:` and quoted phrase search. It does not establish why these specific calls were empty. Removing per-word quotes did not fix the tested repeated-title expression. Successful Author/ISBN alternatives, phrase interpretation and usefulness remain unresolved. No speculative syntax rewrite, automatic ISBN conversion or fallback query has been added.

## P3: actionable empty-state advice

The application predicate included `sort !== relevance`, which triggered All fields/Any language advice even when both controls were already at their defaults. Advice now depends only on restrictions that can actually be broadened: field only, language only, both, or neither. Newest alone adds no filter advice.

## C1: provider reliability

Direct responses included HTTP 503 with Google's `backendFailed` reason, bypassing rendering and application caching. This establishes an upstream failure for those sampled requests, not an explanation for every intermittent failure in the original browser run. No application-side cause of those 503 responses was identified.

Existing classifications remain: 401/403 authorization, 429 rate limit, 5xx unavailable, transport errors network, malformed JSON/payload invalid response. The fetch helper has its existing abort watchdog. Failures are not cached and requests are not automatically retried; Search permits a fresh explicit attempt. Tests confirm one request per attempt. No retry loop or provider-error suppression was introduced.

Inspection was bounded to 14 Google Books calls across distinct checks/comparisons, without automatic retries or attempts to manufacture rate limits. The first local-key call returned 400 and a keyless comparison returned 429; the deployed public configuration produced the useful 200/503 responses above. Those access failures are separate from the reproduced language mismatch. Keys, full bundles, cookies and account data were not recorded.

## Validation and remaining acceptance

Focused tests cover language normalization, matching/missing/invalid metadata, Any language retention, omission counts, all-hidden empty state, unchanged IDs/order, cached Back/detail returns, actionable advice and explicit-only retry. Existing regressions cover all four media types, filter URLs, refresh, stale responses, TTL/limits and account controls.

Validation passed: all 191 frontend tests, the production build, changed JavaScript/Vue syntax, scoped-CSS compilation, documentation links/credential checks and `git diff --check`. No database-writing tests were run. Deployment results are reported separately for this change's GitHub Actions run.

Remaining live-browser QA: verify the new language policy/counts and all-hidden state, Any language recovery, Newest-only and single-restriction advice, filter changes with a draft, Back/refresh/detail return, Add identity, and 320/390px Light/Dark layout. Provider-dependent Title/Author/ISBN outcomes and successful minimal language comparisons remain open. No fresh browser acceptance is claimed here.
