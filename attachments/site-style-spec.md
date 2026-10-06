# Orpheus site style: white, mobile first (epic #66): spec

Status: **approved brief** (epic #66, Diego via CoS and EL, 2026-10-05). Written out in #67 (ticket 1, docs only;
no product code). This file is the source of truth for the look of every page in tickets #68–#73. Where it differs
from older style lines in `attachments/dashboard-spec.md` §0 or `attachments/dca-app-spec.md` ("Site and routes"),
this file wins; those lines are marked superseded in place, not deleted.

**Why a separate file (simplest reading, noted for EL):** the style spans home, the calculator, the dashboard and
sign-in, so it doesn't belong to either existing spec. The calculator rules stay in `dca-app-spec.md`, the
dashboard data rules in `dashboard-spec.md`; both are unchanged by this epic.

## 1. Superseding decision (2026-10-05)

**White replaces the dark style** from the dashboard redesign brief (#53, spec `dashboard-spec.md` §0.1 rules,
§0.4 "The dark visual style", DR0-01, and AGENTS.md "Don't change the visual style (same dark desk)"). From the
day a page is converted (section 5), its own style rows (ST0–ST6 below) replace DR0-01 for that page. Pages not
yet converted keep the dark style unchanged, and DR0-01 still holds for them until their day.

Unchanged by this epic: the calculator rules (`dca-app-spec.md`, DCA-01..06) and the calculator logic files
(`src/lib/dca/*`, `src/routes/api/chart.ts`), the `$313,000` regression in `qa/tools/site.mjs`; the dashboard
data rules (`dashboard-spec.md` §0.2 content, §5–§11 math) and the DR2–DR6 behaviour rows; the dashboard stays
released and visible (`DASHBOARD_ENABLED` and every env var untouched); `noindex` meta and `X-Robots-Tag:
noindex, nofollow` on every page; the analytics rules (#48); no buy / sell / hold wording and no disclaimer;
writes through `fetch()` only. No hires. #50, #51 and PR #52 stay paused (until Oct 12); this epic doesn't touch
them.

## 2. The brief (verbatim from epic #66)

- **Every page:** white. A thin bar with 'Orpheus' on the left and 'Calculator' and 'Dashboard' on the right,
  with the current page marked. Footer: 'Orpheus Wisdom' only. A row lightens on hover and 'Open' underlines. No
  extra instructions. No painting except on the home hero.
- **Home `/`:**
  - Hero: Jacob Jordaens, 'Triumph of Frederick Henry, Prince of Orange', 1652, as a band under the bar. A small
    '01' and the line 'Investment driven by research.' sit lower left on a soft white wash, so the prince and
    horses stay clear.
  - Section '02 Platforms': Calculator, 'Dollar-cost average calculator.', Open goes to /calculator. Dashboard,
    'The portfolio as a business: fundamentals for each name, and the whole.', Open goes to /dashboard.
  - On load the hero line fades up once and the two rows follow. No loop; respects prefers-reduced-motion.
- **Calculator `/calculator`:** title 'Dollar-cost average calculator.' Form, then the result table and chart.
  The listings note stays one line under the form. Phone is one column; wide is two.
- **Dashboard `/dashboard`:** same white shell and bar. Holdings, chips and the Book from #53, with no painting
  behind the numbers.
- **Sign-in:** email, password and a create-account link. Nothing else.

## 3. Exact copy (verbatim; tests and QA compare these strings)

| Where | String |
|---|---|
| Bar, left (links `/`) | `Orpheus` |
| Bar, right (links `/calculator`, `/dashboard`) | `Calculator`, `Dashboard` |
| Footer (only text) | `Orpheus Wisdom` |
| Home hero numeral | `01` |
| Home hero line (the page's `h1`) | `Investment driven by research.` |
| Home section numeral + heading | `02`, `Platforms` |
| Home row 1: name, line, link (→ `/calculator`) | `Calculator`, `Dollar-cost average calculator.`, `Open` |
| Home row 2: name, line, link (→ `/dashboard`) | `Dashboard`, `The portfolio as a business: fundamentals for each name, and the whole.`, `Open` |
| Calculator title (`h1`) | `Dollar-cost average calculator.` |
| Calculator listings note (unchanged copy) | `US, EU and CA listings, one currency per basket.` |
| Sign-in fields | `Email`, `Password` |
| Sign-in create-account link (reading, Q4) | `Create an account` |

Superseded copy: the home line `Orpheus Wisdom is a private desk with two tools.` and the two home cards
(`compare a lump sum with contributions`, `holdings, value, stored figures`) go in #69; the calculator header
`DCA vs lump sum` and its intro paragraph go in #70 (see Q2 for the method sentence); the sign-up note
`Accounts are invite-only. …` goes in #73.

## 4. Tokens and components (white)

- **Tokens:** page, bar, footer and every band / panel background `#ffffff` (`--color-paper`); text `#1e2124`
  (`--color-ink`, 16.2:1 on white, 14.8:1 on the wash); secondary text `#636363` (`--color-muted`, 6.0:1 on white, 5.5:1 on the wash); rules and borders
  `#e3e3e3` (`--color-line`, 1.3:1: decorative only, never the only boundary of a control; inputs keep their ink underline); focus ring `#2b5945`
  (`--color-focus`, 8.0:1). One new token for the hover wash, a very light grey (proposed `#f5f5f5`,
  `--color-wash`; text on it stays ≥ 4.5:1). No new accent colour, same fonts (Schibsted Grotesk), radius 0.
  The DCA series colour `#2b5945` stays for the chart. Error text: today's `--color-danger` `#ff4136` is only
  3.5:1 on white (it fails AA; used once, the calculator's error line), so #70 darkens it to `#c62828` (5.6:1)
  when the calculator converts (Q8). The `theme-color` meta (`#1e2124` in `__root.tsx`) follows the page's
  theme (`#ffffff` on converted pages) from #68's pieces.
- **Bar:** one shared component (today `site-menu.tsx`): thin (≈ 44 px), sticky at the top on scroll,
  `Orpheus` left, `Calculator` and `Dashboard` right, no dropdowns, the current page `aria-current="page"` with a
  visual mark (full-strength text and underline). It takes the page's theme: on a converted page white
  (`#ffffff` background, ink text, a 1 px `--color-line` bottom rule); on a page not converted yet, the existing
  dark bar exactly as on `main`. Plain links (full page loads), so `/dashboard` keeps its server gate.
- **Footer:** one shared component, exactly `Orpheus Wisdom`; same theme rule (it is already light on `main`, so
  it renders as today on unconverted pages).
- **Rows and Open:** a clickable row (home Platforms rows; dashboard holding rows) takes the wash on hover
  (pointer devices) instead of today's ink inversion; its `Open` link (home) underlines on hover and on keyboard
  focus. No hover-only information.
- **Painting:** only the home hero. No background image, texture or artwork on any other page or behind any
  number.

## 5. Schedule and per-page rollout (EL decision, 2026-10-05)

One page a day: each page is done and on a preview before the next one starts.

| Day | Tickets | Page converted to white |
|---|---|---|
| Tue Oct 6 | #67 harness / specs (docs), #68 shell pieces, then #69 home | Home `/` (with #69) |
| Wed Oct 7 | #70 calculator layout | `/calculator` |
| Thu Oct 8 | #71 dashboard (dashboard only) | `/dashboard` |
| Fri Oct 9 | #73 sign-in (new), then #72 leave-outs and regression | `/dashboard/sign-in`; then the whole site re-checked |

Rollout rules:

1. **#68 builds the shell as reusable pieces** (white tokens, the themed bar, the themed footer, the row hover)
   but converts no page by itself. Each page adopts the white theme on its own day, in its own ticket: home with
   #69, the calculator with #70, the dashboard with #71, sign-in with #73. (Reading for EL, Q1: since #68 merges
   before #69 on the same day, #68 ships the pieces unused in production, so home never shows the white bar
   over the old dark-hover cards.)
2. **Production never shows a half-converted page:** no white bar on a dark page, no dark panel inside a white
   page (e.g. no dark dashboard inside a white shell).
3. **The shared bar is on every page from Tuesday and renders in the page's own theme:** white on converted
   pages, the existing dark style on unconverted ones. Navigation, the three items and the current-page marker
   are the same everywhere. The footer follows the same rule.
4. **QA per page:** each ticket's QA checks only its own ST rows (plus ST0 for that page) and a no-regression
   pass on the pages not converted yet (they match `main` before the ticket: computed bar / page / button
   colours equal, DR0-01 for the dashboard and sign-in until their day). #72 then runs every ST row on every
   page.
5. Same loop as #53 for every ticket: one draft PR off the latest `main`, EL answers questions, QA on the
   preview, EL merges, QA checks production.

## 6. Acceptance (ST0–ST6; QA at phone 400 × 860, 1024 × 800 and 1440 × 900)

Each row is checked on the PR preview at all three widths, then on production after the merge. "Converted page"
= a page whose ticket has merged (section 5).

**ST0: white tokens and the superseding decision (every converted page; ticket that converts it)**

| ID | Pass when |
|---|---|
| ST0-01 | The page background, bar, footer and every band / panel / card behind content compute to `rgb(255, 255, 255)`; no element wider than a control has a dark background (luminance < 0.5) on a converted page. |
| ST0-02 | Text uses the tokens: body text `#1e2124`, secondary `#636363`, error `#c62828`, borders `#e3e3e3`, focus ring `#2b5945`, hover wash `--color-wash`; no colour outside the token list (plus the chart's DCA series colour and the dashboard donut's neutral greys) and the font is Schibsted Grotesk. |
| ST0-03 | Pages not converted yet are unchanged from `main` (dark bar, dark bands, same colours): no half-converted page in production. |
| ST0-04 | The spec, AGENTS.md and README record that white replaces the #53 dark style; DR0-01 is marked superseded per page. (Docs, #67.) |

**ST1: the bar and the footer (#68 pieces; checked on each page on its conversion day)**

| ID | Pass when |
|---|---|
| ST1-01 | One thin bar (height ≤ 48 px) at the top, sticky on scroll: `Orpheus` on the left (→ `/`), `Calculator` and `Dashboard` on the right (→ `/calculator`, `/dashboard`), in that order, no other items, no dropdowns; at 400 px all three fit on one line with no horizontal page scroll. |
| ST1-02 | The current page's item has `aria-current="page"` and a visible mark (underline and full-strength text); exactly one item is marked on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` (Dashboard); none on a 404. |
| ST1-03 | The bar renders in the page's theme: white with ink text and a 1 px line on converted pages; the existing dark bar on unconverted pages. Same items and marker either way. |
| ST1-04 | The footer's only text is exactly `Orpheus Wisdom`, on every page; same theme rule. |

**ST2: hover (converted pages with rows)**

| ID | Pass when |
|---|---|
| ST2-01 | Hovering a clickable row (home Platforms rows; dashboard holding rows) gives it the light wash background; it is never inverted to ink; the text keeps ≥ 4.5:1 contrast on the wash. |
| ST2-02 | `Open` underlines on hover and on keyboard focus (`:focus-visible` also shows the focus ring). |
| ST2-03 | Nothing is available only on hover (touch at 400 px reaches everything). |

**ST3: home `/` (#69, Tue Oct 6)**

| ID | Pass when |
|---|---|
| ST3-01 | Under the bar, a full-width band shows Jacob Jordaens, *Triumph of Frederick Henry, Prince of Orange*, 1652. The image is the painting itself (no other artwork) with an `alt` naming it. |
| ST3-02 | `01` (small) and `Investment driven by research.` (the `h1`) sit lower left on a soft white wash; at 400, 1024 and 1440 the prince (Frederick Henry in the chariot) and the horses are fully visible, not covered by the text or the wash (crop / object-position chosen per width). |
| ST3-03 | Source and licence recorded in the repo (spec section 7 and next to the asset): a public-domain image, with the source page and file name. |
| ST3-04 | Optimised: served from the app itself (no request to another host), responsive sizes (e.g. `srcset` 800 / 1600 / 2400 w) in AVIF or WebP with a JPEG fallback, the 1440 px image ≤ 300 KB; explicit dimensions or `aspect-ratio`, so Cumulative Layout Shift is 0 on load. |
| ST3-05 | Section `02` `Platforms` follows with exactly two rows in this order: `Calculator` · `Dollar-cost average calculator.` · `Open` (→ `/calculator`); `Dashboard` · `The portfolio as a business: fundamentals for each name, and the whole.` · `Open` (→ `/dashboard`). Nothing else on the page between the bar and the footer. |
| ST3-06 | On load the hero line fades up once, then the two rows follow (staggered), all within about 1 s; no loop, no re-run on scroll. With `prefers-reduced-motion: reduce` everything shows at once with no movement. The content is in the server HTML and visible without JavaScript (the animation never leaves it hidden). |
| ST3-07 | Home still does no calculating (no price requests, no calculator code) and `/?query` still redirects to `/calculator?query`. |

**ST4: calculator `/calculator` (#70, Wed Oct 7)**

| ID | Pass when |
|---|---|
| ST4-01 | The page title (`h1`) is exactly `Dollar-cost average calculator.`; the dark header band and `DCA vs lump sum` are gone; no instruction text (Q2 for the method sentence). |
| ST4-02 | Order: the form (basket, window, amounts, frequency, submit), then the result table, then the chart. |
| ST4-03 | The listings note `US, EU and CA listings, one currency per basket.` is one line (no wrap at 400 px) directly under the form. |
| ST4-04 | Phone (400): one column. Wide (from 1024): two columns (reading, Q3: the form on the left, the result table and chart on the right). No horizontal page scroll at any width (the table may scroll inside its own box). |
| ST4-05 | Calculator unchanged in behaviour: `qa/tools/site.mjs` passes ($313,000; VOD.L 400 with the exact message); DCA-01..06 pass; the calculator logic files are untouched in the diff. |

**ST5a: dashboard `/dashboard` (#71, Thu Oct 8; dashboard only)**

| ID | Pass when |
|---|---|
| ST5a-01 | The dashboard uses the white shell and bar (ST0, ST1); no painting or image behind any number. |
| ST5a-02 | Every #53 state renders white with AA contrast: empty (`Add a holding`), the list, a detail open (Edit, Delete), the add form and its errors, the `Holdings` / `Metrics` switch (400), the metrics sheet beside the list (1024, 1440), chips, the search combobox and its options, `—` cells, the one total and excluded line, the donut (neutral greys, each slice ≥ 3:1 against white or separated by a white gap) and the `Book` row, the as-of / out-of-date lines, the preview refresh panel. |
| ST5a-03 | DR2–DR6 still pass (the redesign behaviour is unchanged); `qa/tools/dashboard-redesign.mjs` passes. The dashboard stays released (DR0-02). |

**ST5b: sign-in `/dashboard/sign-in` (#73, Fri Oct 9)**

| ID | Pass when |
|---|---|
| ST5b-01 | White shell and bar (ST0, ST1; `Dashboard` marked). |
| ST5b-02 | The form shows exactly: `Email`, `Password`, the submit button and the `Create an account` link (plus an error line only after a failed attempt); nothing else: no explanatory note (the invite-only paragraph goes) (Q4 on the heading). Create-account mode mirrors it: `Email`, `Password`, the submit button and a `Sign in` link. |
| ST5b-03 | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix (`release-smoke.mjs`). |

**ST6: leave-outs and regression (#72, Fri Oct 9, after #73)**

| ID | Pass when |
|---|---|
| ST6-01 | No painting or artwork anywhere except the home hero (no `img`, CSS `background-image` or `picture` with artwork on `/calculator`, `/dashboard`, `/dashboard/sign-in`). |
| ST6-02 | No instruction text on any page: home has only the hero and Platforms; the calculator only its title, form, note and results; the dashboard only the #53 kept lines (`qa/tools/leaveouts-rules.mjs`); sign-in only ST5b-02. |
| ST6-03 | WCAG 2.2 AA contrast on every page at every width: normal text ≥ 4.5:1, large text ≥ 3:1, controls' boundaries and the focus ring ≥ 3:1, including hover and disabled-but-readable states (an axe-core run reports no `color-contrast` violation). |
| ST6-04 | No dark remnant: every page passes ST0-01; no page is half converted. |
| ST6-05 | Full regression on the preview, then production, at 400 / 1024 / 1440: every ST row, DR0 (with DR0-01 superseded by ST0), DR2–DR6, DCA-01..06 ($313,000), noindex meta + `X-Robots-Tag`, the analytics rules, `release-smoke.mjs`; `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. |

## 7. Hero image: source and licence (for #69)

- Work: Jacob Jordaens (1593–1678), *Triumph of Frederick Henry, Prince of Orange* (De triomf van Frederik
  Hendrik), 1652, oil on canvas, 728 × 755 cm, Oranjezaal, Paleis Huis ten Bosch, The Hague. Signed and dated
  lower left "J JOR fec / 1652".
- Candidate file: Wikimedia Commons, `File:The_Triumph_of_Frederik_Hendrik,_by_Jacob_Jordaens_(I).jpg`
  (4,587 × 4,385 px, 13.46 MB), https://commons.wikimedia.org/wiki/File:The_Triumph_of_Frederik_Hendrik,_by_Jacob_Jordaens_(I).jpg
  ; image from the Netherlands Institute for Art History (RKD), digital ID 249278
  (https://rkd.nl/explore/images/249278).
- Licence: public domain (the author died in 1678; Commons marks it public domain where the term is life + 100
  years or less; the RKD copy carries the Public Domain Mark 1.0). Checked 2026-10-05; #69 re-checks the file
  page, records the exact tags next to the asset (e.g. `public/hero/SOURCE.md`) and keeps a copy of the licence
  line. No visible credit on the page (public domain; the footer stays `Orpheus Wisdom` only, Q5).
- The painting is almost square; the band is a wide crop. #69 picks per-width crops (or `object-position`) that
  keep Frederick Henry in his chariot and the horses clear of the lower-left text (ST3-02).

## 8. Interpretations (simplest reading; questions for EL in the #67 PR)

1. **Spec location:** this new file, with superseded markers in the two older specs (Q0).
2. **"White" and controls:** surfaces (page, bar, bands, panels, footer) are white; the primary buttons keep
   today's ink fill with white text (a control, not a surface), unless EL says otherwise (Q6).
3. **"A row lightens on hover"** on a white page = a very light grey wash behind the row (not the ink inversion
   used today on the home cards) (Q7).
4. **Breakpoint:** "wide" = 1024 px and up, the same breakpoint as the dashboard (#53 decision).
5. **#71 is the dashboard only; #73 is sign-in** (issue #73, EL 2026-10-05). ST5 is split into ST5a (dashboard) and
   ST5b (sign-in) rather than renumbering, so ST6 stays the last row.
6. **Per-page theme:** "converted" is per route; the bar and footer pick their theme from the route, never from
   the user (no theme toggle; that would be a new control).
