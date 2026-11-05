# Discover Books — Phase 1 visual review

Review branch: `review/ui-redesign-phase1`. Base: `96139a1eb1f4a9bd666419f9ddd870770312f155` (latest fetched main). Date: 5 November 2026. **Ready for design/code review; not merged or deployed.**

## Design outcome

The old layout compressed Google titles beside small covers and spread Open Library metadata over full-width rows. On phones, Open Library stacked artwork above every metadata line. Large gaps between the introduction, catalogue select and search panel delayed the results.

The redesign establishes a paper/ink identity, serif display typography, a media/provider toolbar and one contained search/filter panel. Results use two horizontal-card columns on desktop and one on narrower screens. Larger unfiltered covers, clear authors and compact publication information establish the hierarchy; complete titles, identifiers and provenance stay accessible in native disclosures. Edition details use separate Work/Edition definition lists; the expanded desktop card spans both columns and puts the records side by side. Static skeletons and consistent status/error surfaces use the existing request state machine.

The [design system](../../../docs/UI_DESIGN_SYSTEM.md) documents colors, typography, spacing, surfaces, interaction states and breakpoints. Shared tokens recolor the app; structural redesign and compact cards are scoped to Discover Books. No framework, dependency, downloaded font, backend or deployment configuration is added.

## Measured comparison

First card with the same synthetic book, in CSS pixels. These are fixture-specific measurements, not maximum heights for every title or expanded record.

| View | Before | After |
| --- | --- | --- |
| Desktop Google card | 260×305; cover 88×132 | 538×230; cover 120×180 |
| Desktop Open Library card | 1100×326; cover 88×132 | 538×287; cover 120×180 |
| Mobile Google card | 350×284; cover 88×132 | 350×277; cover 96×144 |
| Mobile Open Library card | 350×541; cover 96×144 | 350×272; cover 96×144 |

Desktop Google cards are approximately 25% shorter with 36% wider artwork; mobile Open Library is approximately 50% shorter. Desktop now prioritizes readable text columns over four cramped cards. Long titles and expanded records intentionally grow rather than losing their complete metadata.

| Before/after | Baseline | Redesign |
| --- | --- | --- |
| Desktop Google | [Before](desktop-before-google-books-light.png) | [After](desktop-phase1-google-books-light.png) |
| Desktop Open Library | [Before](desktop-before-open-library-light.png) | [After](desktop-phase1-open-library-light.png) |
| Mobile Google | [Before](mobile-before-google-books-light.png) | [After](mobile-phase1-google-books-light.png) |
| Mobile Open Library | [Before](mobile-before-open-library-light.png) | [After](mobile-phase1-open-library-light.png) |

## Inspected screenshots

All four baseline and fourteen selected final screenshots were opened and visually inspected. Desktop screenshots show the full page; mobile screenshots are viewport crops with the real fixed bottom navigation. Result crops scroll to the first card; the separate search crops show the top of the page. The edition crops intentionally retain keyboard focus styling.

| Content | Desktop light | Desktop dark | Mobile light | Mobile dark |
| --- | --- | --- | --- | --- |
| Search and Google results | [Light](desktop-phase1-google-books-light.png) | [Dark](desktop-phase1-google-books-dark.png) | [Results](mobile-phase1-google-books-light.png) | [Results](mobile-phase1-google-books-dark.png) |
| Mobile search | — | — | [Search](mobile-phase1-book-search-light.png) | [Search](mobile-phase1-book-search-dark.png) |
| Open Library results | [Light](desktop-phase1-open-library-light.png) | [Dark](desktop-phase1-open-library-dark.png) | [Light](mobile-phase1-open-library-light.png) | [Dark](mobile-phase1-open-library-dark.png) |
| Expanded edition | [Light](desktop-phase1-expanded-edition-light.png) | [Dark](desktop-phase1-expanded-edition-dark.png) | [Light](mobile-phase1-edition-details-light.png) | [Dark](mobile-phase1-edition-details-dark.png) |

Inspection found readable title/author hierarchy, balanced cover/text proportions, consistent card actions, complete artwork, clear theme separation and no obvious overlap or horizontal clipping in the selected views. The missing-cover and long-title fixtures remain honest. Expanded mobile metadata retains its labels, preview action and read-only notice. At 320px/768px, automated geometry checks also cover both catalogues with disclosures open and closed.

## Verification

Environment: official Node 24.15.0, Playwright 1.64.1, Chromium headless shell 156.0.8078.4. Desktop 1440×900; mobile 390×844 with touch emulation, not a physical device. Additional geometry checks use 320px and 768px widths.

| Check | Result |
| --- | --- |
| `npm test` | **342 passed, 12 existing platform skips, 0 failed**; 354 total |
| `npm run build` | **Passed**; 94 modules; production test harness excluded |
| Focused service/view/card tests | **28 passed** during implementation; included in the full suite |
| `npm run test:ui` | **18 passed, 0 failed**, nine per desktop/mobile project |
| Browser/network assertions | Zero unexpected requests, failed requests, console errors, uncaught page errors or unexpected HTTP failures in the final run |
| Documentation and diff | 59 local links/fragments checked; Markdown fences, test script syntax and `git diff --check` passed |
| Theme token spot checks | Body/muted/button pairs exceed 4.5:1: light 11.86/5.37/8.00; dark 15.21/7.77/8.80. This is not a full contrast/accessibility audit |

Unit coverage preserves Google default/manual provider switching, 401/403 messages without logout, filter/identity separation, stale-response protection, caching, cooldowns and existing Library behavior. The updated card regression verifies closed technical metadata and separate Work/Edition records. Headless checks preserve fields, language/strict mode, keyboard disclosures, read-only preview, cache/history, delayed responses, loading/empty/error states and manual-only cooldown recovery. Existing navigation and Google detail/return smoke checks pass with the new shared palette.

Reproduce with the supported Node runtime and installed managed headless shell:

```sh
npm test
npm run build
npm run test:ui
```

For only the new design test: `npm run test:ui -- tests/ui/bookDesign.spec.js`. Baseline capture used `QA_DESIGN_BASELINE=true` with that test before application edits. Ordinary output stays in ignored `test-results/`; selected final PNGs were exported under fresh `*-phase1-*` filenames. Before images were retained. Intermediate capture artifacts were discarded; historical QA evidence was not changed.

## Corrected failures and warnings

The first baseline attempt expected a literal light-theme attribute, while the app represents light by absence; the test was corrected. Initial redesigned 320px geometry exposed an intrinsic grid-width overflow, fixed with a bounded grid track and shrinkable children. Moving CSS imports to the app entry kept the existing Node Vue loader compatible. Definition-list label whitespace was retained for readable combined text.

Repeated preview rendering made some intermediate covers appear incomplete. Final evidence uses rasterized fictional jackets, decoded-image readiness and separate fresh contexts for each theme, with explicit theme assertions and the normal application theme initialization mirrored in the harness. PNG pixel spot checks confirm the artwork is present. Existing tests separately exercise theme toggles. No application image filtering or provider data workaround was introduced. The runner still emits the existing `NO_COLOR`/`FORCE_COLOR` warning. The full unit suite also emits an existing mock-component `showProviderLink` attribute warning; neither is a browser console failure.

## Scope and limits

All browser API/provider/artwork responses are synthetic. The shared route fixture rejects non-GET and unknown external requests; the dedicated loopback Vite server reads no private env files and proxies no backend. The Open Library build flag stays false in this test server; only the existing test harness injects its enabled component prop. The staging workflow's enabled flag and all actual backend flags remain unchanged.

No real account, database, provider search, staging/production browser, Hostinger setting, migration, merge or deployment was used. Open Library still has no Add-to-Library implementation. Synthetic attribution graphics do not prove live branding delivery; screenshots do not establish provider relevance, physical-device behavior, screen-reader acceptance or complete WCAG compliance.

Remaining design work: apply the hierarchy to Library/Lists, film/TV/game and account/detail layouts; perform physical-device and screen-reader review. No critical regression remains in this Phase 1 review. These screenshots/report are temporary review evidence and should be removed before a separately approved merge unless permanent retention is explicitly approved; preserve all older evidence.
