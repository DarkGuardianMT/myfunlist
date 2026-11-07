# MyFunList visual direction — Cinematic

The owner-selected Cinematic concept defines the shared foundation and every major frontend surface in the complete redesign candidate. See the [current implementation and prototype adaptation](CINEMATIC_COMPLETE.md). The [Phase 1 archive comparison](CINEMATIC_PHASE1.md) remains a historical scope record.

## Theme and typography

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#F7F8F2` | `#101310` |
| Surface | `#FFFFFF` | `#191E19` |
| Text | `#242923` | `#F3F4E9` |
| Muted | `#616B5C` | `#ACB6A7` |
| Primary | `#41612B` | `#CFEF8A` |

Tokens live in [global styles](../src/style.css). [Cinematic styles](../src/styles/cinematic.css) compose the shell and Home, [discovery styles](../src/styles/bookDiscovery.css) compose all provider searches, [collection styles](../src/styles/collections.css) compose Library/Lists and [account styles](../src/styles/account.css) compose security forms. Card and Detail components own their scoped presentation. Dark is the first-visit default, with saved preferences honored before paint. Local Segoe UI Variable/Segoe UI/system stacks avoid font downloads; exact metrics depend on local fonts.

Spacing follows the existing 4/8/12/16/24/32/48px scale. Cards and controls use 8px corners. Discover artwork uses contain-fit, with book inset and native landscape game frames. The fallback explicitly says when artwork is missing. Titles/authors remain complete in the DOM; compact book previews retain Full info.

## Composition and interaction

The desktop shell uses top navigation within a 1344px maximum content width. Mobile keeps five labeled bottom destinations, safe-area spacing, theme switching and a separate account menu with registration/settings/logout. Native menus close on route/account changes, outside clicks and Escape; Escape returns focus to their summary. Lists remains active on nested list pages. The main content has a keyboard skip link.

Home pairs a large display introduction with actionable provider search. Four category entry points work without sample content. Signed-in users see a shelf derived from their shared Library, with honest loading/error/retry/empty states. There is no fake curation, progress percentage or recommendation feed.

Discover shares a heading, icon category switcher, compact search panel and artwork-first results. Portrait grids fit columns with a 190px minimum on larger screens (six at 1440px), two on phones above 360px and one on narrower phones. Games use landscape wells with a 300px minimum and one mobile column. Google filters sit beside search on wide screens. Open Library uses the same cover-first rhythm; expanded Work/Edition disclosures span the grid with distinct metadata and read-only controls.

Library uses a dedicated shared collection card rather than Discover cards with tracking forms appended. Comfortable grids use substantial 190px-minimum artwork wells; Compact uses 145px minimums; List uses a small jacket alongside identity and controls. Games use uncropped landscape artwork when filtered to Games. Native status/rating controls remain immediately available; Manage groups lazy list actions and removal. Undo reopens the restored menu before returning focus. Only density is persisted on the device; account data and title queries are not written to storage.

Private list previews derive from existing Library records and guarded, paginated membership reads, without a per-list detail request. Detail combines prominent artwork, identity, tracking and full synopsis, followed by metadata rows. Login/Register share a compact mobile and split desktop shell; Profile separates identity and security forms.

Native search/filter controls, attribution, cache/history/return navigation, account actions and provider errors retain their contracts. Inputs/actions/disclosure summaries use visible focus and at least 44px control heights. Hover movement is limited to pointer devices without reduced motion. Static skeletons are hidden from assistive technology. There are no fake feeds, progress figures, catalogue records or account statistics.

## Verification and review

The [complete redesign](CINEMATIC_COMPLETE.md#retained-complete-cinematic-qa) retains its review findings and verification after owner-approved temporary-evidence cleanup. The [retained Cinematic Phase 1 QA](CINEMATIC_PHASE1.md#retained-cinematic-qa) documents the earlier approved release and cleanup. The following retained section records the earlier editorial Books release and its measurements, not current geometry. Historical findings and evidence remain preserved.

## Retained Phase 1 QA

The approved implementation at `54c0f44f420a488cc064eaaa7ab72029d332ee7e` was reviewed with four baseline and fourteen final screenshots, all opened and visually inspected. Desktop used 1440×900 with full-page captures; mobile used 390×844 viewport crops with fixed navigation. Both themes, Google/Open Library results, search and expanded Edition details were covered; geometry checks also exercised 320px and 768px with disclosures open and closed.

Inspection found clearer title/author hierarchy, balanced cover/text proportions, complete artwork, visible keyboard focus and no obvious horizontal clipping or action/navigation overlap in the selected views. Missing-cover, missing-metadata and long-title fixtures remained honest. Expanded mobile records retained labels, preview controls and the read-only notice; expanded desktop records placed Work and Edition data side by side.

First-card measurements for the same fictional book, in CSS pixels; expanded records and long titles can grow:

| View | Before | Approved design |
| --- | --- | --- |
| Desktop Google card | 260×305; cover 88×132 | 538×230; cover 120×180 |
| Desktop Open Library card | 1100×326; cover 88×132 | 538×287; cover 120×180 |
| Mobile Google card | 350×284; cover 88×132 | 350×277; cover 96×144 |
| Mobile Open Library card | 350×541; cover 96×144 | 350×272; cover 96×144 |

Original verification used Node 24.15.0, Playwright 1.64.1 and Chromium headless shell 156.0.8078.4: `npm test` **342 passed, 12 existing platform skips, 0 failed** (354 total); `npm run build` **passed**, 94 modules; isolated `npm run test:ui` **18 passed**, nine per desktop/mobile project. All 28 focused service/view/card tests were included in the unit suite. Browser assertions recorded zero unexpected requests, failed requests, console/page errors or unexpected HTTP failures. Production assets excluded the test harness. Documentation/link checks and `git diff --check` passed.

Final merge preparation repeated the unit suite, build and isolated headless suite with the same passing results. Checks covered 22 Markdown files, 129 local links and 20 fragments; SHA-256 comparison confirmed 20 other tracked documentation/evidence files unchanged. Application code, tests and configuration remain identical to the approved implementation. The temporary visual evidence was removed after approval; its inspection findings above are retained rather than claimed as a fresh visual review.

Coverage preserves Google default/manual provider switching, 401/403 guidance without logout, provider identities and filters, Work/Edition separation, Library behavior, cache/history/stale-response guards, loading/empty/error states and manual-only cooldown recovery. Earlier implementation issues with 320px intrinsic grid sizing, Node CSS imports and definition-list whitespace were corrected before the passing checks. Visual fixtures use rasterized fictional jackets, decoded-image readiness and separate contexts with explicit theme assertions; existing tests separately cover theme toggles.

Body/muted/button contrast spot checks exceeded 4.5:1: light 11.86/5.37/8.00; dark 15.21/7.77/8.80. This does not establish full WCAG compliance. Existing `NO_COLOR`/`FORCE_COLOR` and unit mock-component `showProviderLink` warnings were nonblocking.

All provider, artwork and session data were synthetic. The loopback-only headless server reads no private env files, proxies no backend and keeps the Open Library build flag false; the existing component harness alone injects its enabled prop. Unknown external requests and non-GET requests are blocked. No live provider, account, database or staging/production browser was used for visual QA. Synthetic attribution cannot prove live branding delivery. Physical-device, screen-reader and broader accessibility acceptance remain future work. No cinematic alternative is included.
