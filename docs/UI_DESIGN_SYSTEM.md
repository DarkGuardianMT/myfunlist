# MyFunList visual direction — Cinematic Phase 1

The owner-selected Cinematic concept now defines the shared foundation, top/mobile navigation, Home and all four Discover types. Library, Lists, Detail and account pages retain their working layouts. See the [archive comparison and implementation scope](CINEMATIC_PHASE1.md).

## Theme and typography

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#F7F8F2` | `#101310` |
| Surface | `#FFFFFF` | `#191E19` |
| Text | `#242923` | `#F3F4E9` |
| Muted | `#616B5C` | `#ACB6A7` |
| Primary | `#41612B` | `#CFEF8A` |

Tokens live in [global styles](../src/style.css); [Cinematic styles](../src/styles/cinematic.css) compose the shell, Home and scoped Discover presentation. Dark is the first-visit default, with explicit saved light/dark preferences honored before paint. Local Segoe UI Variable/Segoe UI/system stacks provide display and body typography without font downloads. Exact metrics depend on local fonts.

Spacing follows the existing 4/8/12/16/24/32/48px scale. Cards and controls use 8px corners. Discover artwork uses contain-fit, with book inset and native landscape game frames. The fallback explicitly says when artwork is missing. Titles/authors remain complete in the DOM; compact book previews retain Full info.

## Composition and interaction

The desktop shell uses top navigation within a 1344px maximum content width. Mobile keeps five labeled bottom destinations, safe-area spacing, theme switching and a separate account menu with registration/settings/logout. Native menu disclosures close on route/account changes and Escape; Escape returns focus to their summary. The main content has a keyboard skip link.

Home pairs a large display introduction with actionable provider search. Four category entry points work without sample content. Signed-in users see a shelf derived from their shared Library, with honest loading/error/retry/empty states. There is no fake curation, progress percentage or recommendation feed.

Discover shares a heading, media switcher, search panel and result rhythm. Books/Movies/TV use four desktop poster columns, three below 1100px, two below 850px and one at 360px or below. Phones above 360px retain two portrait columns. Games use three desktop columns, two below 1100px and one on phones. The separate Open Library presentation retains its existing Work/Edition disclosures and responsive rules.

Native search/filter controls, provider attribution, cache/history/return navigation, account actions and provider errors retain their existing contracts. Search buttons, selects, links, disclosure summaries and actions keep visible focus and 44px control heights. Hover movement is limited to pointer devices with no reduced-motion preference. Static loading skeletons are hidden from assistive technology. Full Library/Lists/Detail restructuring is deferred.

## Verification and review

Current scope and temporary evidence are linked from [Cinematic Phase 1](CINEMATIC_PHASE1.md#verification). This branch is for review only; no merge or deployment is authorized. The following retained section records the earlier editorial Books release and its measurements, not the current Cinematic geometry.

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
