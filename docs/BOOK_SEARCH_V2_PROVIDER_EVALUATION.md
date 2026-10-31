# Book Search V2: Google Books versus Open Library

The original evaluation is retained below. See the [31 October Phase 0/1 report](#phase-0-extension-and-phase-1-implementation--31-october-2026) for the implemented, disabled backend pilot and current constraints.

Evaluation date: **30 October 2026, 22:27–22:32 CET (Europe/Amsterdam)**. Repository baseline: `180bab0a18ae608e81cd9e6e4b49dfeff82e67c9`.

This is a provider evaluation and proposed plan, not an implemented architectural decision. Application code, saved Library data and deployment state were not changed. Read `AGENTS.md`, `PROJECT_CONTEXT.md`, the existing search/identity implementation and the [Search V1 QA follow-up](DISCOVER_SEARCH_V1_QA_FOLLOWUP.md) first. Original QA evidence remains unchanged.

## Recommendation

**Keep Google Books as the current production provider and saved-record resolver. Pilot Open Library for work-oriented discovery and edition selection before deciding whether it should become the default search provider.** Do not perform a wholesale provider or identity migration based on this sample.

Open Library provided a useful single Hobbit work, all seven core Harry Potter works within its first seven broad results, consistently strong Le Guin results, a successful ISBN edition lookup and better requested-language selection in this run. Google also found the intended books, provided useful edition metadata and successful author searches, and ultimately resolved the exact ISBN. It produced several transient 503 responses and failed to enforce language constraints in the sampled results.

Open Library is not a universal ranking improvement: its Hobbit results quickly move into adaptations, guides and related material; Dune searches include unrelated works; selected editions and work metadata can be incomplete or inconsistent. Its usage policy also limits its suitability as a high-traffic backend. The main promising change is **work/edition-aware discovery**, rather than replacing one search URL with another.

## Method and evidence

The [sanitized evidence snapshot](evidence/book-search-v2-2026-10-30.json) records each request ID, timestamp, public parameters, HTTP outcome, latency, selected metadata and provider IDs. Descriptions are recorded only as presence/length, not copied text. Credential values, image-access tokens, full application bundles, cookies and private account data are excluded.

- **55 provider/image GET operations total:** 30 Google, 25 Open Library. Of these, 48 were searches, three were detail reads and four were cover checks. HTTP redirect hops are not separately counted: the ISBN edition URL and one cover URL resolved to different final URLs, recorded in the evidence. Six additional read-only staging HTML/bundle reads established the current public Google browser configuration across the three evaluation phases.
- Each ordinary search requested at most ten results. One separately labelled Google Search V1 probe requested 40 candidates and received 20. No search pagination or catalogue harvesting was performed.
- Requests were sequential, with a 1.2-second pause after each response, a 12-second deadline and a 1.2 MB body limit. No automatic retries, quota-exhaustion tests or credential/IP rotation. Explicit comparison repeats are retained as separate observations.
- Google used the deployed public browser configuration with a staging Referer, without account cookies or OAuth. Open Library received an application/project User-Agent but no personal contact address; its default one-request-per-second limit was therefore treated as the ceiling. This is not a test of a future backend Google credential configuration.
- One execution host and a short time window; network location and provider personalization were not independently controlled. No live-browser UX, actual book-content inspection, long-term uptime test or quota-dashboard inspection.

The baseline compared the seven inputs in **broad search**, treating the requested ISBN as the number `9780261103344`. Additional requests tested explicit title/author/ISBN modes and English/Dutch/Turkish language options. Google title/author expressions matched the current application's per-word quoted operators; Open Library used its documented `title` and `author` parameters. Raw provider order was retained for the main comparison. A separate offline check applied the existing MyFunList title-ranking helper to the 40-requested-candidate probe; it is not mixed into the provider ranking tables.

Result counts below are provider-reported totals, not catalogue coverage measurements. Google returns volume candidates; Open Library normally returns work groups. Their totals and repeated-edition counts are not directly comparable. See the [Google list reference](https://developers.google.com/books/docs/v1/reference/volumes/list) and [Open Library Search API](https://openlibrary.org/dev/docs/api/search).

### Outcome classification

| Observation | Meaning |
| --- | --- |
| HTTP 200, valid result array and positive returned count | Search succeeded; relevance still needs review |
| HTTP 200, valid empty result with total zero | Genuine empty **response for that query**, not proof that the book/ISBN does not exist |
| HTTP 503 with `backendFailed` | Provider error; never counted as zero results |
| HTTP 401/403/429, timeout or malformed payload | Separate access/rate/transport/payload failure; not an empty result. None occurred in the sampled data calls |

Both providers returned a successful zero-result response for the deliberately nonexistent control query `myfunlist-no-such-book-20261030-x7q9` (G28/OL23). This confirms a separate observed empty-response category alongside the Google 503s.

## Query-by-query findings

The ordered first-ten lists are in Appendix A; exact IDs, subtitles and selected-edition metadata are in the evidence. Assessments distinguish original novels/series works from related material. They are metadata-based judgments, not a statistically labelled precision benchmark or an assumption that ten editions are ten distinct stories.

| Input | Google Books | Open Library | Practical finding |
| --- | --- | --- | --- |
| **Hobbit** | G01: 200, ten of 405 reported volumes. First two are Tolkien's *The Hobbit*, IDs `i9VCwtU1Z3IC` and `TCtXEAAAQBAJ`. Remaining cards include translations, braille and an annotated edition. | OL01: 200, ten of 677 reported works. First is *The Hobbit*, `/works/OL27482W`, with 482 editions; the next results include a graphic adaptation, a collection/set, a dramatization and companions. | Both put the intended novel first. Google offers edition variety but occupies many slots with the same novel; Open Library provides a useful grouped entry but a noisier tail for someone seeking only that novel. |
| **The Hobbit** | G02: 200, ten of 486. First three are Tolkien editions; rank 4 is an official movie guide, rank 5 has *The Desolation of Smaug* subtitle, rank 7 is a graphic novel and rank 10 is Jeff Barton's strategy guide. | OL02: 200, ten of 454. Same intended work first; adaptation/collection/guide results follow, and rank 10 has no author/language metadata. | Adding the article changes candidates/order. Exact title alone cannot distinguish novel, game guide or film companion. Keep subtitle, author and edition context visible. |
| **Harry Potter** | G03: 200, ten of 481. Eight core-novel edition candidates represent six distinct core titles; Prisoner and Goblet repeat. Rank 8 is explicitly a literature guide; rank 10 is an authorless PediaPress record. First four editions are tagged Dutch. | OL03: 200, ten of 3,933. All seven core novels appear within ranks 1–7, followed by a box set, *Cursed Child* and a poster annual. The selected edition at rank 5 is Vietnamese despite the English work title. | Open Library gives better series breadth in the first screen. Neither broad search implies a preferred reading language, series order, or exclusively core novels. |
| **Dune** | G04: 200, ten of 511. Original Frank Herbert novel and movie tie-in edition first; all ten candidates are Dune-related novels/collections. | OL04: 200, ten of 47,643. Original novel first, then several Frank Herbert sequels; rank 9 is unrelated *Go Ask Alice*. Rank 10's work title *Dune* has Brian Herbert/Kevin J. Anderson attribution and selects a *House Harkonnen* edition. | Both find the original novel. Open Library provides useful sequel breadth but also lexical noise and an ambiguous work/edition association. Do not auto-merge all exact-title Dune records. |
| **Ursula Le Guin** | G05: 200, ten of 380. All ten list Le Guin as author, including *Earthsea Revisioned*, *Malafrena* and *The Masters*. | OL05: 200, ten of 482. All ten list Le Guin; first three are *A Wizard of Earthsea*, *The Left Hand of Darkness*, *The Dispossessed*. | Both support broad author discovery in this run. Open Library's leading familiar works are a useful presentation advantage, not a measured popularity guarantee. |
| **Le Guin** | G06: 200, ten of 529. Eight list Le Guin as author; rank 2 is Jeremy K. Brown's book about her and rank 4 is publisher information attributed to Meulenhoff. | OL06: 200, ten of 674. All ten are attributed to Le Guin, with the same first-ten work order as the longer broad author query. | Google broad search mixes works by an author with material about that author. Explicit Author mode is materially better for this intent. |
| **ISBN 9780261103344** | G07: plain number returns 200/zero. G14: `isbn:` returns 503. G24: exact explicit repeat returns 200/one, volume `Ts_gmPmzxtUC`, both ISBN-13 `9780261103344` and ISBN-10 `0261103342`. | OL07/OL14: both plain-number and explicit ISBN searches return one work; selected edition `/books/OL10236414M` contains the exact ISBN. OL18 direct ISBN lookup also resolves that edition. | Both can resolve the requested ISBN. Open Library succeeded on all sampled lookup paths; Google required explicit ISBN intent plus a later successful response. One ISBN cannot establish general lookup reliability. |

### Title and author mode checks

| Intended mode | Google expression / result | Open Library parameter / result |
| --- | --- | --- |
| Hobbit / Title | `intitle:"Hobbit"`: 200, ten results; intended editions first, plus a graphic adaptation | `title=Hobbit`: 200, ten results; original work first, then related/ambiguous records |
| The Hobbit / Title | `intitle:"The" intitle:"Hobbit"`: 200, ten results | `title=The Hobbit`: 200, ten results |
| Harry Potter / Title | `intitle:"Harry" intitle:"Potter"`: G10 503, G23 exact repeat 200/ten. One-phrase variant G22 also returned 503 | `title=Harry Potter`: 200/ten; seven core works near the top plus collections/play |
| Dune / Title | `intitle:"Dune"`: 200/ten, original first, but graphic adaptation/biography/sequels also present | `title=Dune`: 200/ten, original first, but unrelated *Mémoires d'une jeune fille rangée* at rank 10 |
| Ursula Le Guin / Author | `inauthor:"Ursula" inauthor:"Le" inauthor:"Guin"`: 200/ten, all ten attributed to Le Guin | `author=Ursula Le Guin`: 200/ten, all ten attributed to Le Guin |
| Le Guin / Author | `inauthor:"Le" inauthor:"Guin"`: 200/ten, all ten attributed to Le Guin | `author=Le Guin`: 200/ten, all ten attributed to Le Guin |

The single-phrase Google author variant also succeeded (G21). These observations do **not** support claiming that the existing per-word operator construction is fundamentally broken. They do support retaining explicit author intent and separating transient provider failure from search semantics. Google's documented operators are described in its [API usage guide](https://developers.google.com/books/docs/v1/using).

## Language filtering

| Requested language, Hobbit query | Google `langRestrict` | Open Library hard language term plus `lang` preference |
| --- | --- | --- |
| English | G15 503; G25 repeat 200, only **6/10** volume tags `en`; four tags `yi/pl/es/fr` | OL15: **10/10** selected edition tags `eng` |
| Dutch | G16 200, **0/10** volume tags `nl` | OL16: **9/9** selected edition tags `dut`; first selected edition is *De hobbit* |
| Turkish | G17 200, **0/10** volume tags `tr` | OL17: **6/6** selected edition tags `tur`; first selected edition is *Hobbit* |

The Google result is an upstream mismatch between the requested constraint and returned metadata. Existing MyFunList filtering would retain six of the ten English candidates and none of these ten Dutch/Turkish candidates. That protects displayed metadata consistency but can create an empty filtered screen despite a nonempty provider response. These counts describe this ten-candidate sample, not the app's entire 40-requested-candidate pool or catalogue.

For Open Library the exact requests used `q=Hobbit language:eng|dut|tur` with `lang=en|nl|tr`. The separate `lang=nl`-only control (OL21) still reported 677 works; only one of its ten selected editions was tagged Dutch, with English, French and unknown tags elsewhere. Its [search documentation](https://openlibrary.org/dev/docs/api/search) distinguishes language preference from a hard query restriction.

**Integration consequence:** map supported UI languages explicitly (`en→eng`, `nl→dut`, `tr→tur`) and check the **selected edition**, not the work's union of language tags. Keep an unknown-language state. Matching metadata is not proof of actual content language: OL10 selected *Harry Potter i kamień filozoficzny* while tagging it `eng`, an inconsistency requiring review rather than an assumption that either the title or tag is authoritative. Language correctness and title relevance remain separate checks; the Dutch/Turkish Hobbit result sets also contain other Tolkien works.

## Works, editions and metadata quality

Google's volume-oriented response supplies concrete IDs and edition-like records but no explicit work ID in these samples. Repeated titles, translated names, illustrated/braille formats, guides and omnibus sets cannot safely be grouped by normalized title alone.

Open Library's search response exposes work keys, edition counts and one selected matching edition when requested. This is a better starting model for “one story, choose an edition”; it does not establish that every group is correct or that a selected edition is the original publication. Keep separate labels for **work first-publication year** and **selected-edition date**. Fetch further editions only after a user opens the work, subject to bounded pagination. The current Search API documentation describes the selected-edition response and its schema stability limitations; integration must tolerate absent fields. [Open Library Search API](https://openlibrary.org/dev/docs/api/search).

### Completeness of the initial seven broad responses

Counts are **per returned card occurrence**, including repetitions across queries: 60 Google volume cards and 61 Open Library work cards. They are neither unique-book coverage estimates nor proof that fields are accurate.

| Field present | Google volumes / 60 | Open Library work / selected edition, / 61 |
| --- | --- | --- |
| Title | 60 | 61 works |
| Author name | 59 | 60 works |
| Cover locator | 53 | 60 work covers; 59 selected-edition cover IDs |
| Language metadata | 60 | 60 work language sets; 60 selected-edition language sets |
| Publication information | 59 edition date strings | 61 work first-publication years; 61 selected-edition date values |
| At least one ISBN | 52 | 60 work-level ISBN sets; **52 selected-edition** ISBN sets |
| Publisher | 45 | 60 selected editions |
| Positive page count | 47 | Not requested in the selected search projection; not scored as missing |
| Description | 53 | Not requested/available in this search projection; not scored as missing |

G27's individual Hobbit volume contains description, publisher and 287 pages. OL22's Hobbit work and OL18's ISBN edition both contain descriptions; the ISBN edition lacks a page count. These are different editions, so this is a shape/completeness illustration, not a controlled description-quality ranking.

For the **same tested ISBN**, G24 reports publication `1996` and 302 pages; OL18 reports publication `2011` and no page count. Both associate it with HarperCollins. Without publisher verification, this date/reprint disagreement has no established winner. Preserve field provenance instead of silently overwriting saved metadata.

A further matching warning exists within the Hobbit candidates: Google labels ISBN `9780261103566` as a braille Hobbit record, while Open Library selects it for a Hobbit/Lord of the Rings collection. An exact ISBN match is valuable evidence, but inconsistent upstream records still require title/author/format/language checks before linking records.

### Cover checks

Two existing cover URLs from each provider were fetched once: all four returned HTTP 200 with JPEG bodies (3,429/9,822 bytes Google; 16,302/26,974 bytes Open Library). No images were visually assessed; these checks establish transport/image availability, not correct edition artwork, resolution adequacy or aesthetic quality.

Use a placeholder and image-error handling even when a locator exists. Open Library documents a blank-image default and `?default=false` for an explicit missing-cover response; it recommends public cover URLs and a courtesy backlink, and warns against cover crawling. It also documents a separate limit of 100 requests/IP per five minutes for identifiers other than CoverID/OLID. Prefer cover IDs already returned by the search batch. [Covers API](https://openlibrary.org/dev/docs/api/covers).

## Reliability and errors

| Sample | Google | Open Library |
| --- | --- | --- |
| Initial seven broad searches | 7/7 HTTP 200, including the plain-ISBN empty response | 7/7 HTTP 200, all nonempty |
| All search requests, including variants/repeats/control | 27: 18 nonempty successes, 2 successful zero responses, **7 HTTP 503** | 21: 20 nonempty successes, 1 successful zero response, **0 HTTP errors** |
| Other requests | One successful detail read and two successful cover reads | Two successful detail reads and two successful cover reads |
| Successful search median / maximum observed response time | 838 ms / 1,428 ms | 731 ms / 4,077 ms |

All seven Google errors reported `backendFailed`. Exact repeated requests changed **200→503** (broad Hobbit) and **503→200** (explicit Harry Potter Title, ISBN and English-language Hobbit). The minimal Hobbit request also failed once. That supports an intermittent upstream availability finding, not a zero-result conclusion or a claim that MyFunList created the 503s.

Open Library was more consistently available **in this run**. The providers received unequal, deliberately selected request mixes; these counts are not long-term uptime percentages, load-test capacity or an SLA. Successful-response timings exclude failed requests and staging bootstrap reads. No 429, timeout or authentication failure was observed; their production handling still needs testing rather than being assumed reliable.

The separate Google V1-sized probe G26 requested 40 candidates, returned only 20 and reported a different total (390 versus G01's 405). Offline reranking moved exact/equivalent Hobbit titles upward but did not remove edition duplication or distinguish an authorless film-related record from the novel. Ranking returned candidates cannot guarantee global catalogue relevance, language availability or correct work identity.

## Practical limits and usage conditions

These are current primary-source requirements and adoption constraints, not claims that the present implementation has been legally certified.

| Provider | Practical implications |
| --- | --- |
| Google Books | The list endpoint permits at most 40 requested results. Public requests should identify the application with an API key or OAuth identifier; keep private server credentials outside `VITE_`. Project quota values were not inspected, and no universal daily allowance is assumed. Confirm the actual Books quotas in the owner's console before capacity planning. [List reference](https://developers.google.com/books/docs/v1/reference/volumes/list), [identification guide](https://developers.google.com/books/docs/v1/using), [quota management](https://docs.cloud.google.com/docs/quotas/view-manage). |
| Open Library | Published default limit is **1 request/second**; properly identified application/contact requests receive **3/second**. The policy asks for caching, application registration and human-driven useful requests, and rejects bulk harvesting/high-traffic commercial backend usage. A modest discovery pilot fits the technical request model; a scalable dependency needs policy fit and, where necessary, an agreement or a different data strategy. [API usage policy](https://openlibrary.org/developers/api). |

Google's published Books terms restrict charging users for the application without a separate agreement/written permission and impose content-removal obligations. Its branding guidance addresses attribution, links and restrictions on altering results and displaying competing search-service branding. **Review the existing reranking policy and any future grouping/blended-result display against these requirements before release**; this report does not assume that a new cross-provider merge is permitted. A provider-separated pilot reduces accidental mixing but is not itself proof of compliance. [Books terms](https://developers.google.com/books/terms), [branding guidance](https://developers.google.com/books/branding), [general API terms](https://developers.google.com/terms).

Open Library says it asserts no new proprietary rights over database material, while acknowledging possible existing rights in contributions/jurisdictions. Do not interpret open metadata access as blanket permission to redistribute every cover or description. Retain provenance and follow the applicable cover/display terms. [Licensing statement](https://openlibrary.org/developers/licensing).

Neither sampled service is a guaranteed production SLA. Caching, debouncing, stale-response guards, concurrency control and safe error messages remain necessary whichever provider is selected.

## Recommended architecture for a pilot

1. **One explicit search intent and one selected provider per request.** Retain All fields/Title/Author. Recognize and checksum-validate normalized ISBN-10/13 input before using a dedicated ISBN lookup path. Preserve the original query in the UI. Do not silently fan every keystroke out to both providers.
2. **A thin PHP discovery adapter** can normalize public provider responses and centralize request budgets. Start behind a development feature flag; do not touch existing Library resolution. Include provider, work/edition distinction, original IDs, selected-edition metadata and provenance in its public-only contract. A browser-restricted Google key cannot simply be moved to PHP; configure an appropriate private server credential/restriction profile separately.
3. **Work-first Open Library cards with edition choice.** Display work title/author/year, edition count and clearly labelled chosen edition/language. Keep guides, adaptations and sets distinguishable. Use the batch search's selected-edition fields; request more edition/detail information only on user action, not once per visible card.
4. **Separate provider presentation and explicit recovery.** Show “Google Books temporarily unavailable” for provider errors and offer a user-initiated Open Library search. A genuine successful empty response says no matches from that provider. Never turn a failed lookup into an empty list, silently substitute a source ID or present fallback results as Google's results.
5. **Shared bounded transport and public caches.** Use cancellable deadlines, identical-request deduplication and cache keys covering provider/query/intent/language/sort/page. Reuse the existing short-lived public cache/stale-route patterns. Enforce a global per-provider queue for the server's shared egress IP, respect `Retry-After` and Open Library's aggregate budget; do not distribute requests to bypass limits. Do not cache failures as valid empty results. Add operational metrics without credentials, private tracking state or unnecessary query logging.
6. **Keep strict language checks and explicit uncertainty.** Validate selected-edition tags with a documented code map. Allow Any language and disclose omitted unknown/mismatched entries. Metadata cannot certify actual text language; add curated mismatch fixtures to the acceptance corpus.

The existing Vue/JavaScript/plain-CSS architecture can support this without a new frontend state library. Actual provider support, endpoints and UI would be a separately authorized implementation task.

## Identity and migration compatibility

Current code accepts only `google-books/book` for books in frontend identity validation and PHP `MediaRules`; detail resolution also uses the Google volume endpoint. Database uniqueness is `(source, media_type, source_id)`, while account tracking/list membership depends on the separate `user_media.id`. Open Library results cannot currently be made saveable merely by pointing discovery at another URL.

- **Preserve every existing Google record:** `media.id`, `source`, `source_id`, `mediaKey`, `user_media.id`, status/rating, timestamps and `list_items` relationships remain unchanged. Existing Google detail URLs, imports and cached records retain their resolver. Provider availability must never trigger a delete/re-add or mass ID rewrite.
- **Pilot without identity migration:** an Open Library work may offer an edition choice, then an optional validated exact-ISBN Google lookup. Only an authoritative Google volume ID can use today's Add contract. If no safe Google match is available, explain that saving this Open Library edition is not yet supported; do not invent a Google ID or attach the nearest title match.
- **Future native support:** add a separately validated `open-library` book source with an **edition** ID such as `OL10236414M`, retaining `/works/OL27482W` as an independent grouping relation. Decide the accepted ID representation once and apply it consistently to frontend/PHP validators, provider resolvers, detail routes, import, caches and tests. A work group is not interchangeable with a physical/digital edition record.
- **Optional additive work mapping:** a future `book_works`/media-to-work relation could link existing media records to external work IDs with provenance, confidence and review state. It must not replace media or account IDs. This is a proposal, not a migration performed here.
- **No silent cross-provider deduplication:** normalize/check ISBNs and compare author, language, title, format and collection/adaptation status. Use mappings as suggestions until verified. ISBN reuse/bad cataloguing and work merges/redirects need conflict handling and aliases; title matching alone is insufficient. Users may intentionally track multiple editions of one work.
- **Ownership boundaries remain unchanged:** public discovery/detail caches contain no account tracking data. Existing authenticated Library mutations, CSRF checks and list ownership/cascades continue to operate on the original account entry IDs.

## Suggested phased implementation

| Phase | Deliverable | Acceptance gate |
| --- | --- | --- |
| 0 — Policy and broader evidence | Confirm provider-use/branding permissions and actual quotas; repeat a predeclared corpus across several days, including Dutch/Turkish books, obscure titles, duplicate titles, additional valid/invalid ISBNs, adaptations and missing metadata | Agreed relevance rubric and failure categories; measured work/edition/language errors; no assumption that this seven-query sample proves a universal winner |
| 1 — Transport/adapter prototype | Read-only provider adapters, bounded batches, language mapping, public caching and separate result/error contracts; feature flag only | Deterministic provider fixtures; no per-card metadata fan-out; timeout/429/503/malformed and stale-route tests |
| 2 — Work/edition UX pilot | Open Library grouped discovery, selected edition labels, explicit provider recovery and safe disabled-saving behavior where necessary | All supplied queries plus the broader corpus; transparent guides/sets; meaningful empty/error states; keyboard and responsive Light/Dark review |
| 3 — Saving compatibility | First exercise validated Google ISBN resolution; add native Open Library edition support only if approved, with additive work mapping if useful | Original IDs, personal state and memberships unchanged; no duplicate account records from retries; existing Google routes/imports still work; isolated disposable database safeguards for any writing tests |
| 4 — Controlled rollout | Opt-in traffic, budget/error monitoring, provider rollback flag and a decision on the default provider | Sustained observed quality and acceptable policy/capacity fit; rollback changes discovery only and never rewrites saved records |

**Decision at this stage:** Open Library merits a bounded work-oriented pilot, especially for author/series breadth and edition language/ISBN paths. Retain Google compatibility and useful metadata; do not promise that switching providers alone will fix relevance, identity ambiguity or service availability.

## Validation and boundaries

Report validation covers request counts/bounds, error-versus-empty classification, result/metadata counts, primary-source links and absence of credential-shaped values in the retained evidence. No application tests/build were rerun for this documentation-only task. No application code, environment configuration, database records, original QA artifacts or deployed assets were modified. No commit/push was made: pushing `main` would trigger the deployment explicitly excluded from this evaluation.

## Appendix A — Initial broad-search first ten results

The following tables preserve provider order from G01–G07 and OL01–OL07, without MyFunList reranking. Google cells include subtitle where supplied; Open Library cells use the work title and flag a different selected-edition title where relevant. Metadata tags and edition IDs remain available in the evidence snapshot. “Not returned” means that the successful response returned no row at that rank, not an API failure.

### A1 - Hobbit

Google G01; Open Library OL01.

| Rank | Google volume | Open Library work / selected edition |
| --- | --- | --- |
| 1 | The Hobbit - John Ronald Reuel Tolkien [en] | The Hobbit - J.R.R. Tolkien [eng] |
| 2 | The Hobbit - J.R.R. Tolkien [en] | The Hobbit - Charles Dixon; Sean Deming; J.R.R. Tolkien [eng] |
| 3 | Der Hobit, Oder, Ahin Un Vider Tsurik - J. R. R. Tolkien [yi] | The Hobbit & The Lord of the Rings [collection/set] - J.R.R. Tolkien [eng] |
| 4 | Hobbit, czyli tam i z powrotem - John Ronald Reuel Tolkien [pl] | J.R.R. Tolkien's The hobbit - Patsey Gray [eng] |
| 5 | The Hobbit - J. R. R. Tolkien [en] | The Hobbit - Jude Fisher [eng] |
| 6 | El hobbit - John Ronald Reuel Tolkien [es] | The Hobbit companion - David Day [eng]; selected edition: Hobbit Companion, The |
| 7 | The Hobbit (braille) - John Ronald Revel Toiken [en] | The Hobbit, an unexpected journey - Brian Sibley [eng] |
| 8 | The Hobbit: Or There and Back Again - J. R. R Tolkien [en] | A hobbit's journal - Michael Green [eng] |
| 9 | Bilbo le hobbit, ou, Histoire d'un aller et retour - John Ronald Reuel Tolkien [fr] | The spiritual world of The hobbit - James S. Bell; James Stuart Bell; Sam O'Neal [eng] |
| 10 | The Annotated Hobbit: The Hobbit, Or, There and Back Again - John Ronald Reuel Tolkien; Douglas Allen Anderson [en] | Bilbo's Last Song (At the Grey Havens) - J.R.R. Tolkien [fre]; selected edition: L'album de Bilbo le Hobbit |

### A2 - The Hobbit

Google G02; Open Library OL02.

| Rank | Google volume | Open Library work / selected edition |
| --- | --- | --- |
| 1 | The Hobbit - John Ronald Reuel Tolkien [en] | The Hobbit - J.R.R. Tolkien [eng] |
| 2 | The Hobbit - J.R.R. Tolkien [en] | The Hobbit - Charles Dixon; Sean Deming; J.R.R. Tolkien [eng] |
| 3 | The Hobbit - J. R. R. Tolkien [en] | The Hobbit & The Lord of the Rings [collection/set] - J.R.R. Tolkien [eng] |
| 4 | The Hobbit, the Desolation of Smaug: Official Movie Guide - Brian Sibley [en] | J.R.R. Tolkien's The hobbit - Patsey Gray [eng] |
| 5 | The Hobbit: The Desolation of Smaug - Jude Fisher; J. R. R. Tolkien [en] | The Hobbit companion - David Day [eng]; selected edition: Hobbit Companion, The |
| 6 | The Hobbit: Or There and Back Again - J. R. R Tolkien [en] | The Hobbit - Jude Fisher [eng] |
| 7 | The Hobbit: A Graphic Novel - J R R Tolkien [en] | The spiritual world of The hobbit - James S. Bell; James Stuart Bell; Sam O'Neal [eng] |
| 8 | The Hobbit (Enhanced Edition) - J. R. R. Tolkien [en] | The Hobbit : The Desolation of Smaug - Brian Sibley [eng] |
| 9 | The Hobbit: The Enchanting Prelude to The Lord of the Rings - J.R.R. Tolkien [en] | The History of the Hobbit - John D. Rateliff [eng] |
| 10 | The Hobbit: The Prelude to the Lord of the Rings : Prima's Official Strategy Guide - Jeff Barton [en] | The Hobbit - author unknown [language unknown] |

### A3 - Harry Potter

Google G03; Open Library OL03.

| Rank | Google volume | Open Library work / selected edition |
| --- | --- | --- |
| 1 | Harry Potter en de Steen der Wijzen - J.K. Rowling [nl] | Harry Potter and the Philosopher's Stone - J. K. Rowling [eng]; selected edition: Harry Potter and the Sorcerer's Stone |
| 2 | Harry Potter en de Halfbloed Prins - J.K. Rowling [nl] | Harry Potter and the Chamber of Secrets - J. K. Rowling [eng]; selected edition: Harry Potter & the Chamber of Secrets |
| 3 | Harry Potter en de Gevangene van Azkaban - J.K. Rowling [nl] | Harry Potter and the Prisoner of Azkaban - J. K. Rowling [eng] |
| 4 | Harry Potter en de Vuurbeker - J.K. Rowling [nl] | Harry Potter and the Deathly Hallows - J. K. Rowling [eng] |
| 5 | Harry Potter and the Deathly Hallows - J.K. Rowling [en] | Harry Potter and the Goblet of Fire - J. K. Rowling [vie]; selected edition: Harry Potter & chiếc cốc lửa |
| 6 | Harry Potter and the Prisoner of Azkaban - J. K. Rowling [en] | Harry Potter and the Order of the Phoenix - J. K. Rowling [eng] |
| 7 | Harry Potter and the Chamber of Secrets - J. K. Rowling [en] | Harry Potter and the Half-Blood Prince - J. K. Rowling [eng]; selected edition: Harry Potter & the Half-Blood Prince |
| 8 | Harry Potter and the Prisoner of Azkaban: Literature Guide - J. K. Rowling; Linda Ward Beech [en] | Harry Potter (series) 1-7 - J. K. Rowling [eng]; selected edition: Harry Potter Boxset Books 1-7 |
| 9 | Harry Potter and the Goblet of Fire - J. K. Rowling [en] | Harry Potter and the Cursed Child - Jack Thorne; John Tiffany; J. K. Rowling [eng] |
| 10 | Harry Potter - author unknown [en] | Harry Potter poster annual 2008 - Warner Bros. Entertainment Inc [eng] |

### A4 - Dune

Google G04; Open Library OL04.

| Rank | Google volume | Open Library work / selected edition |
| --- | --- | --- |
| 1 | Dune - Frank Herbert [en] | Dune - Frank Herbert [eng] |
| 2 | Dune (Movie Tie-In) - Frank Herbert [en] | Dune Messiah - Frank Herbert [eng] |
| 3 | Heretics of Dune - Frank Herbert [en] | Children of Dune - Frank Herbert [eng] |
| 4 | Dune: House Corrino - Brian Herbert; Kevin J. Anderson [en] | God Emperor of Dune - Frank Herbert [eng] |
| 5 | The Winds of Dune - Kevin J. Anderson; Brian Herbert [en] | Heretics of Dune - Frank Herbert [eng] |
| 6 | Dune: House Atreides - Brian Herbert; Kevin J. Anderson [en] | Chapterhouse Dune - Frank Herbert [eng] |
| 7 | Children Of Dune: The inspiration for the blockbuster film - Frank Herbert [en] | Dune, Dune Messiah, Children of Dune - Frank Herbert [eng]; selected edition: The Great Dune Trilogy |
| 8 | Sands of Dune - Brian Herbert; Kevin J. Anderson [en] | Sandworms of Dune - Kevin J. Anderson; Brian Herbert [eng] |
| 9 | Dune: The Lady of Caladan - Brian Herbert; Kevin J. Anderson [en] | Go Ask Alice - Beatrice Sparks [fre]; selected edition: L'herbe Bleue |
| 10 | The Second Great Dune Trilogy: God Emperor of Dune, Heretics of Dune, Chapter House Dune - Frank Herbert [en] | Dune - Brian Herbert; Kevin J. Anderson [eng] |

### A5 - Ursula Le Guin

Google G05; Open Library OL05.

| Rank | Google volume | Open Library work / selected edition |
| --- | --- | --- |
| 1 | Earthsea Revisioned - Ursula K. Le Guin [en] | A Wizard of Earthsea - Ursula K. Le Guin [eng] |
| 2 | Malafrena - Ursula K. Le Guin [en] | The Left Hand of Darkness - Ursula K. Le Guin [eng] |
| 3 | The Masters: A Story - Ursula K. Le Guin [en] | The Dispossessed - Ursula K. Le Guin [eng] |
| 4 | So Far So Good - Ursula K. Le Guin [en] | The Tombs of Atuan - Ursula K. Le Guin [eng] |
| 5 | Earthsea: Tales from Earthsea. 5 - Ursula K. Le Guin [en] | The Lathe of Heaven - Ursula K. Le Guin [eng] |
| 6 | L'Autre côté du rêve - Ursula Le Guin [fr] | The Farthest Shore - Ursula K. Le Guin [eng] |
| 7 | Dancing at the Edge of the World: Thoughts on Words, Women, Places - Ursula K. Le Guin [en] | The ones who walk away from Omelas - Ursula K. Le Guin [eng] |
| 8 | Very Far Away from Anywhere Else - Ursula K. Le Guin [en] | Tales from Earthsea - Ursula K. Le Guin [eng] |
| 9 | Ursula K. Le Guin: Hainish Novels and Stories Vol. 2 (LOA #297): The Word for World Is Forest / Five Ways to Forgiveness / The Telling / stories - Ursula K. Le Guin [en] | Tehanu (The Earthsea Cycle, Book 4) - Ursula K. Le Guin [eng] |
| 10 | Quatre chemins du pardon - Ursula Le Guin [fr] | The Other Wind - Ursula K. Le Guin [eng] |

### A6 - Le Guin

Google G06; Open Library OL06.

| Rank | Google volume | Open Library work / selected edition |
| --- | --- | --- |
| 1 | The Found and the Lost: The Collected Novellas of Ursula K. Le Guin - Ursula K. Le Guin [en] | A Wizard of Earthsea - Ursula K. Le Guin [eng] |
| 2 | Ursula K. Le Guin - Jeremy K. Brown [en] | The Left Hand of Darkness - Ursula K. Le Guin [eng] |
| 3 | Earthsea: Tales from Earthsea. 5 - Ursula K. Le Guin [en] | The Dispossessed - Ursula K. Le Guin [eng] |
| 4 | Informatie over Ursula K. Le Guin - Meulenhoff Nederland bv [nl] | The Tombs of Atuan - Ursula K. Le Guin [eng] |
| 5 | Malafrena - Ursula K. Le Guin [en] | The Lathe of Heaven - Ursula K. Le Guin [eng] |
| 6 | So Far So Good - Ursula K. Le Guin [en] | The Farthest Shore - Ursula K. Le Guin [eng] |
| 7 | Dreams Must Explain Themselves: The Selected Non-Fiction of Ursula K. Le Guin - Ursula K. Le Guin [en] | The ones who walk away from Omelas - Ursula K. Le Guin [eng] |
| 8 | Ursula K. Le Guin - Ursula K. Le Guin [en] | Tales from Earthsea - Ursula K. Le Guin [eng] |
| 9 | Planet of exile: Ursula Le Guin - Ursula Kroeber Le Guin [fr] | Tehanu (The Earthsea Cycle, Book 4) - Ursula K. Le Guin [eng] |
| 10 | The Wave in the Mind: Talks and Essays on the Writer, the Reader, and the Imagination - Ursula K. Le Guin [en] | The Other Wind - Ursula K. Le Guin [eng] |

### A7 - ISBN 9780261103344

Google G07; Open Library OL07.

| Rank | Google volume | Open Library work / selected edition |
| --- | --- | --- |
| 1 | Not returned | The Hobbit - J.R.R. Tolkien [eng] |

## Phase 0 extension and Phase 1 implementation — 31 October 2026

Baseline inspected: `180bab0a18ae608e81cd9e6e4b49dfeff82e67c9`. The original evaluation above and its [30 October evidence](evidence/book-search-v2-2026-10-30.json) are retained. Its SHA-256 is `1bc6785e847cb50f652cba3e3b773124d32ec507c5fd45355b4ba4a3e69e7e70`.

### Phase 0 findings

Official sources verified on **31 October 2026**:

| Primary source | Finding and implementation consequence |
| --- | --- |
| [API policy, identification and limits](https://openlibrary.org/developers/api) | Human-driven lookup, caching and application/contact identification are encouraged; bulk harvesting and high-traffic commercial backend use are outside the intended scope. Default budget is 1 request/second; identified requests receive 3/second. The adapter conservatively stays below the default budget even with identification. Application registration is requested by the documentation. |
| [Search API](https://openlibrary.org/dev/docs/api/search) | Search returns Works with a selected Edition; `lang` is a preference, while `language:eng/dut/tur` constrains matches. The schema can change. Use explicit fields and bounded results; validate the selected Edition independently. |
| [Covers API](https://openlibrary.org/dev/docs/api/covers) | Public covers should link directly to the cover host; a backlink is appreciated. ISBN and other non-CoverID/non-OLID lookups have a separate limit. The adapter returns a CoverID URL and makes no image request. |
| [Licensing](https://openlibrary.org/developers/licensing) | Internet Archive asserts no new proprietary rights over the database, but existing rights can remain. This is not blanket clearance for every cover or contribution. Preserve provider attribution and canonical backlinks. |

**Policy decision:** a small, human-triggered discovery pilot appears consistent with the documented lookup use cases; this is an interpretation, not provider approval for MyFunList. It must not become a generic data backend, crawler or high-traffic dependency. Before enabling regular use, the owner must register/confirm the use case, configure a managed contact address and establish the shared hosting budget described below. No registration or message to the provider was sent in this task. These operational prerequisites remain open; the deployed pilot stays disabled.

The predefined corpus and exact public parameters are in the [Open Library extension evidence](evidence/book-search-v2-phase01-network-2026-10-31.json). It covers Hobbit, the less familiar *The Vet's Daughter*, *De aanslag*, *Kürk Mantolu Madonna*, ambiguous *Home*, Le Guin author search, valid ISBN-13/ISBN-10, invalid ISBN, sparse metadata, adaptations, collections, preferred language and a nonexistent control. Each search requested at most ten results, with a 12-second deadline, 1 MiB body limit, sequential execution and a 1.2-second pause after each response. No retries, pagination, image reads or per-result detail expansion. An application-only User-Agent did not qualify for the identified budget. Twelve initial sandbox attempts could not connect (cURL error 7); their [transport evidence](evidence/book-search-v2-phase01-2026-10-31.json) is separate from provider responses.

The network-enabled run made **12 Open Library requests**, all HTTP 200: 11 nonempty searches and one genuine empty response. The invalid ISBN failed checksum validation locally without a request. Observed latency was 787–2,799 ms; this is a short sample from one execution host, not an uptime estimate.

| Corpus observation | Finding |
| --- | --- |
| Popular title and adaptations | Tolkien's novel is first for Hobbit, followed by its graphic adaptation and a collection/set. Exact or similar titles must not be merged automatically. |
| Obscure title | Five Works returned for *The Vet's Daughter*, with repeated Barbara Comyns title groups. Work grouping still contains catalogue duplicates. |
| Dutch and Turkish | *De aanslag* returned ten selected Editions tagged `dut`; *Kürk Mantolu Madonna* returned four tagged `tur`, including multiple Works attributed to Sabahattin Ali. Tags are metadata evidence, not independent content-language verification. |
| Ambiguous title | Home returned 126,640 reported matches, led by *Fun Home*, *At Home* and *Miss Peregrine's Home for Peculiar Children*. Title mode is not exact-title matching. |
| Author | The first three Le Guin results were *A Wizard of Earthsea*, *The Left Hand of Darkness* and *The Dispossessed*. No claim of popularity ranking follows. |
| ISBN | Both valid formats resolved Work `OL27482W` and selected Edition `OL10236414M`, retaining the requested ISBN. This tests one edition, not ISBN coverage generally. |
| Missing metadata and collections | Sparse Work `OL19659526W` has no author, cover, edition language or ISBN in the title-search projection. The Great Dune Trilogy query selected *The Second Great Dune Trilogy*, with no selected Edition. Do not infer a usable edition from a work match. |
| Preference versus filtering | Hobbit with Dutch preference kept 677 reported Works; among ten selected Editions, one matched Dutch, eight mismatched and one had unknown language. Strict Dutch/Turkish queries above produced matching selected-edition tags in this sample. |

Across **73 returned card occurrences**, 70 had authors, 72 a work publication year, 72 a selected Edition, 66 selected-edition language tags, 71 selected-edition date arrays, 59 at least one checksum-valid selected-edition ISBN, and 60 a cover locator. These are repeated occurrences, not unique-book accuracy scores. Dates retain provider text and precision. Descriptions/page counts were not requested or scored.

A [fresh Google comparison](evidence/book-search-v2-phase01-google-2026-10-31.json) used the same predefined corpus, existing Title/Author operator construction, an explicit ISBN operator for evaluation only, up to ten results, and the deployed public browser configuration without recording its key. Two read-only staging HTML/bundle requests established that configuration. The first three provider calls (Hobbit, obscure title, Dutch title) all returned **503**, triggering the predefined stop rule. No retries were made. The remaining Google comparisons were not executed. Therefore the expanded corpus has **no fresh successful matched Google comparison**; the earlier seven-query comparison remains the evidence for Google's useful edition metadata and volume-oriented identity. Errors are never scored as empty results. This extension reinforces investigating Work/Edition identity but cannot establish comparative catalogue superiority or long-term reliability.

Future validation must repeat a fixed, modest corpus on several days, record successes/errors and latency distributions, independently review relevance and actual edition language, and measure cache/budget behavior on the intended host. Do not manufacture 429s or probe quota exhaustion.

### Phase 1 architecture and API contract

The isolated implementation is in `backend/src/Provider/OpenLibraryQuery.php`, `OpenLibraryAdapter.php` and `OpenLibraryPilot.php`, with `OpenLibraryController` and a separate **GET `/api/v1/pilot/open-library/search`** route. It reuses `ProviderHttpClient` and the existing cURL transport: 3-second connection/8-second total timeout, 1 MiB response cap, HTTPS certificate checks, no redirects or automatic retries. The adapter has no database, repository, authentication or session dependency. The existing Google discovery, saved identities, detail routing, Library/List behavior and schema are unchanged. No frontend provider control or Open Library Add operation is included.

| Parameter | Contract |
| --- | --- |
| `q` | Required, trimmed Unicode text, 1–200 characters; no control characters |
| `field` | `general` (default), `title`, `author`, `isbn`; ISBN-10/13 checksums validated, spaces/hyphens normalized |
| `language` | Optional `en`, `nl`, `tr`, explicitly mapped to `eng`, `dut`, `tur` |
| `languageMode` | `preferred` (default), or `strict` requiring `language` |
| `limit` | Integer string 1–10, default 10; first page only, no arbitrary pagination |

Unknown parameters and array-valued/repeated bracket parameters return 422. Standard PHP parsing collapses repeated scalar keys; the final parsed value is validated. Search text is quoted as literal tokens rather than accepted as Solr operators. Title/Author modes constrain fields without promising phrase/exact-title matching. Strict mode adds the provider language constraint and then retains only an unambiguous matching selected-edition tag. Preference retains mismatches/unknowns and labels them. It is not a fallback query.

Successful responses use the existing `data` envelope with:

- `provider: "open-library"`, `items`, `providerTotal`, `limit`, requested `language`/`languageMode`, `omitted` counters (`invalid`, `duplicateWork`, `language`, `isbn`), and Open Library `attribution`.
- Each item: `provider`, `workId`, `workTitle`, `authors`, `firstPublicationYear`, `editionCount`, nullable `selectedEdition`, nullable `cover`, canonical Work `url`, and `provenance`.
- Selected Edition: `editionId`, nullable `title`, `languages`, `languageStatus`, `publicationDates` and checksum-valid `isbns`. Work ISBN/language unions are never substituted for edition values. ISBN searches omit a selected Edition that does not contain the requested normalized ISBN; no extra lookup is attempted.
- `languageStatus`: `match`, `mismatch`, `ambiguous`, `unknown`, `inconsistent`, or `unverified` when no language was requested. Contradictory Work/Edition tags, malformed tags and undetermined metadata cannot pass strict filtering. Provider tags cannot reveal all catalogue errors or translated-title/tag inconsistencies.
- A cover contains its numeric `id` and direct HTTPS CoverID `url`; selected-edition cover is preferred, with explicit work-cover fallback provenance. A locator is not confirmation that an image exists.
- `provenance` records provider field paths and `present`/`missing`/`invalid` states. Absent scalar fields are `null`; absent arrays are `[]`. Invalid optional values are not invented. Essential invalid Work identities/titles are omitted; an entirely invalid nonempty result set is a 502. Valid empty responses remain successful empty `items`.

`OL…W` and `OL…M` are validated separately; no Work ID can become an Edition ID. Repeated identical Work IDs are suppressed without merging different Works sharing a title. No canonical `sourceId`/saved-media contract is assigned to these pilot records. Provider totals describe upstream Works before local omissions; this is a bounded first-page sample, not exhaustive filtering.

Disabled pilot: 404 `not_found` before validation, storage or network access. Invalid input: 422 `validation_error`. Provider 429/503/timeouts and unavailable shared storage/budget/configuration: safe 503 `provider_unavailable`, with conservative `Retry-After: 60`. Malformed provider data: 502 `provider_error`. Upstream bodies, URLs, contact details and configuration never enter public error messages. Success/provider-error responses use `Cache-Control: no-store`; only the private server cache stores successful normalized public metadata. The unchanged transport suite covers HTTP status, timeout, malformed JSON and oversized-body handling.

### Policy and hosting constraints

All four backend-only settings are required for an active network pilot:

1. `OPEN_LIBRARY_PILOT_ENABLED=true` (absent/other values disable; example configuration is `false`).
2. `OPEN_LIBRARY_SHARED_BUDGET_CONFIRMED=true` only after the owner verifies that **all** relevant PHP workers/releases share this exact state inode and filesystem locks, and all Open Library requests sharing the egress budget are coordinated. This is an explicit operational assertion, not automatic hosting detection.
3. `OPEN_LIBRARY_STATE_FILE` is the canonical absolute path to an existing private writable regular file, outside `backend/public` and the server document root. Symlink paths and world-accessible files on Unix are rejected. Provision a private directory (recommended 0700) and file (0600), initially containing `{"version":1,"nextRequestAt":0,"cache":[]}`. Do not delete, replace or reset the active file during deployment or cleanup; stop/drain workers before deliberate recovery. Never put it under a release-specific temporary path.
4. `OPEN_LIBRARY_USER_AGENT` starts with `MyFunList` and contains a real managed contact email in parentheses, kept only in private backend configuration. The example leaves it blank; no fictional contact is supplied to the provider.

One nonblocking exclusive `flock` covers cache recheck, durable request reservation, HTTP I/O and cache publication across PHP workers. Only one provider request can be active. Starts are at least 1.1 seconds apart globally for this state file; failures impose a 60-second shared cooldown. A reservation is flushed/synced **before** I/O, so a crashed worker leaves a cooldown. Corrupt/missing state fails closed instead of resetting the budget. Lock contention returns 503 immediately; identical concurrent misses cannot both call the provider, and later requests reuse the shared result. This is request suppression, not a waiting response queue.

The file stores only query hashes, scheduling times and normalized public results: five-minute TTL, 20-entry LRU and 2 MiB total bound. Successful empty results are cached; failures are not. Cache hits still work during a cooldown when the lock is free. No raw query, provider contact/header, upstream payload or personal account state is cached. Limiter/cache state is filesystem coordination, not a Library/List/database write.

This design is suitable only where a stable private filesystem with working cross-process locks and a single coordinated egress budget is verified. Separate hosts, containers, duplicate state files, filesystem resets, unrelated API users behind the same IP or unreliable network-filesystem locking invalidate the guarantee. The intended Hostinger topology and permissions have **not** been independently verified here. Keep the pilot disabled until that is resolved; use a genuinely shared coordinator if the host cannot satisfy it. The existing staging workflow additionally checks that the pilot route returns 404 without sending query input, so an accidentally enabled flag fails deployment verification without making a provider call.

### Verification and Phase 2 readiness

Automated checks passed: `composer --working-dir=backend validate --strict`, `composer --working-dir=backend run test:providers`, `composer --working-dir=backend run test:api`, `php backend/tests/database_safety.php`, syntax checks across 70 PHP files, **256 frontend tests**, and `npm run build`. Local tools were PHP 8.2.12 and Node 24.11.0; staging CI uses the project's prescribed Node 24.15.0. The new deterministic fixture suite covers modes/input/ISBN checksums, identity separation, languages/mismatches, missing fields, empty/malformed/oversized results, sanitized errors, flags, bounds, cache TTL/LRU/byte bounds/empty caching, durable reservation, shared cooldown and competing PHP processes. A database double rejects all access through the actual bootstrapped pilot route; no Library/List writes or sessions occur. Transport failure coverage uses the existing scripted cURL tests, without live provider calls. No database-writing suite or migration was run.

Staging workflow/HTTP verification is reported separately in task delivery after pushing the tested commit; it is not implied by local checks. No local visual preview or independent live-browser QA was performed for this backend-only pilot. Neither these tests nor the short provider samples establish public-launch or production readiness.

Phase 2 remains gated on policy/use-case confirmation, real-host shared-budget verification, multi-day provider sampling and a reviewed Work/Edition UX/identity plan. Edition selection can change between queries and catalogue Work/Edition associations can be wrong. Edition pagination, popularity signals, provider selection UI, saved-record support, identity migration and Add to Library remain outside this implementation.
