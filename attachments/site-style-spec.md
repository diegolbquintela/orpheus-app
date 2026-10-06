# Orpheus site style: white, mobile first (epic #66): spec

Status: **approved brief** (epic #66, Diego via CoS and EL, 2026-10-05). Written out in #67 (ticket 1, docs only;
no product code). This file is the source of truth for the look of the pages converted in tickets #68–#73 (home, calculator,
sign-in; the dashboard is on hold, section 5). Where it differs
from older style lines in `attachments/dashboard-spec.md` §0 or `attachments/dca-app-spec.md` ("Site and routes"),
this file wins; those lines are marked superseded in place, not deleted.

**Schedule and bar decision: revised 2026-10-05 21:04 ET** (Diego via EL), replacing the earlier same-day
schedule and bar decision. Section 5 is current.

**Why a separate file (simplest reading, noted for EL):** the style spans home, the calculator and sign-in (and
later the dashboard), so it doesn't belong to either existing spec. The calculator rules stay in `dca-app-spec.md`, the
dashboard data rules in `dashboard-spec.md`; both are unchanged by this epic.

## 1. Superseding decision (2026-10-05)

**White replaces the dark style** from the dashboard redesign brief (#53: `dashboard-spec.md` §0.1 rules, §0.4
"The dark visual style", DR0-01, and AGENTS.md "Don't change the visual style (same dark desk)"). It applies page by
page, only to the pages this epic converts: home (#69), the calculator (#70) and the sign-in view (#73). From a
page's conversion day its style rows (ST0–ST6 below) replace DR0-01 for that page.

**The live dashboard is not restyled in this epic.** #71 is on hold (Diego is still designing it; a new brief
will come via CoS). Until that brief lands, `/dashboard` stays exactly as it is on `main`: released, visible,
the dark style, its current menu and footer untouched; DR0-01 keeps holding for it. The only exception under
`/dashboard` is the sign-in view (`/dashboard/sign-in`), converted in #73 (section 5, rule 4).

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
  behind the numbers. *(On hold since 2026-10-05 21:04 ET: #71 waits for a new brief; the live dashboard is not
  restyled in this epic. Section 5.)*
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
`DCA vs lump sum` and its intro paragraph go in #70 (Q2: by default the one line `Dividends are reinvested and splits are
handled.` stays, for DCA-01); the sign-up note
`Accounts are invite-only. …` goes in #73. Nothing on `/dashboard` itself changes (on hold).

## 4. Tokens and components (white)

- **Tokens:** on a converted page, the page, bar, footer and every band / panel background `#ffffff`
  (`--color-paper`); text `#1e2124` (`--color-ink`, 16.2:1 on white, 14.8:1 on the wash); secondary text
  `#636363` (`--color-muted`, 6.0:1 on white, 5.5:1 on the wash); rules and borders `#e3e3e3` (`--color-line`,
  1.3:1: decorative only, never the only boundary of a control; inputs keep their ink underline); focus ring
  `#2b5945` (`--color-focus`, 8.0:1). One new token for the hover wash, a very light grey (proposed `#f5f5f5`,
  `--color-wash`; text on it stays ≥ 4.5:1). No new accent colour, same fonts (Schibsted Grotesk), radius 0.
  The DCA series colour `#2b5945` stays for the chart. Error text: today's `--color-danger` `#ff4136` is only
  3.5:1 on white (it fails AA; used once, the calculator's error line, never on the dashboard), so #70 darkens it
  to `#c62828` (5.6:1) when the calculator converts (Q8). **These token values already exist in
  `src/styles.css`; no existing token value changes** (that would restyle the dashboard); the white look comes
  from the new shell components and per-page classes. The `theme-color` meta (`#1e2124` in `__root.tsx`) is
  `#ffffff` on converted pages only; `/dashboard` keeps `#1e2124`.
- **White bar (new, #68):** thin (≈ 44 px), sticky at the top on scroll, `Orpheus` left, `Calculator` and
  `Dashboard` right, no dropdowns, the current page `aria-current="page"` with a visual mark (full-strength text
  and underline), white background, ink text, a 1 px `--color-line` bottom rule. Same items, order, labels,
  hrefs and marker rule as today's menu (`MENU_ITEMS` / `currentSection()` in `src/lib/site/site.ts`). Plain
  links (full page loads), so `/dashboard` keeps its server gate. **Only on converted pages:** `/` from #69,
  `/calculator` from #70, `/dashboard/sign-in` from #73.
- **White footer (new, #68):** exactly `Orpheus Wisdom`, white; only on the same converted pages.
- **The dashboard's menu and footer stay as they are:** `/dashboard` (and any page not converted, e.g. a 404, and
  sign-in until #73) keeps today's `SiteMenu` (dark bar) and `SiteFooter`, rendering exactly as on `main` (same
  markup, classes and computed colours). #68 adds the white pieces next to them; it doesn't restyle the
  existing ones. (Today `__root.tsx` renders the menu and footer for every route; #68 picks the white pair by
  exact pathname for converted routes and the existing pair for everything else.)
- **Navigation both ways:** the white bar (and home's `Open` rows) link to `/calculator` and `/dashboard`; the
  dashboard's existing menu links to `/` and `/calculator`. Every page reaches every other page in one click.
- **Rows and Open:** a clickable row on a converted page (the home Platforms rows; not the dashboard's rows,
  on hold) takes the wash on hover
  (pointer devices) instead of today's ink inversion; its `Open` link (home) underlines on hover and on keyboard
  focus. No hover-only information.
- **Painting:** only the home hero. No background image, texture or artwork on any other page or behind any
  number.

## 5. Schedule and per-page rollout (Diego via EL, revised 2026-10-05 21:04 ET)

Replaces the earlier same-day schedule and bar decision. Each page is done and on a preview before the next one starts; the white style, bar and footer
apply only to the page shipped that day.

| Day | Tickets | Page converted to white |
|---|---|---|
| Tue Oct 6 | Home: #67 harness / specs (docs), then #68 shell pieces, then #69 home | Home `/` (with #69) |
| Wed Oct 7 | #70 calculator layout | `/calculator` |
| On hold | #71 dashboard (label `on-hold`; Diego is still designing it, a new brief comes via CoS) | none: `/dashboard` stays exactly as it is |
| Sun Oct 11 | #73 sign-in, then #72 leave-outs and regression (home, calculator, sign-in only) | `/dashboard/sign-in`; then the three shipped pages re-checked |

Rollout rules:

1. **#68 builds the shell as reusable pieces** (the white bar, the white footer, the row hover, the wash token)
   and converts no page by itself. Home adopts them with #69, the calculator with #70, sign-in with #73. (Q1:
   since #68 merges before #69 on the same day, #68 ships the pieces unused in production, so home never shows
   the white bar over the old dark-hover cards.)
2. **The white bar and footer go only on home and the calculator, each as it converts** (and on sign-in with
   #73). No new bar, footer or theme change on the `/dashboard` pages.
3. **The live dashboard stays exactly as it is:** released, visible, not restyled, its current menu (the dark
   bar) and footer untouched. Production never shows a half-converted page: no white strip on a dark page, no
   dark panel inside a white page.
4. **Sign-in is the one exception under `/dashboard`, converted on Sunday in #73.** It is its own route
   (`src/routes/dashboard_.sign-in.tsx`, path `/dashboard/sign-in`; the trailing underscore means it is not
   nested in the `/dashboard` route), so #73 changes that route file and the exact-path choice of bar / footer
   in `__root.tsx` only. Careful scoping for #73: match `/dashboard/sign-in` exactly (never a `/dashboard`
   prefix); no change to `src/routes/dashboard.tsx`, `src/components/dashboard/*`, `SiteMenu`, `SiteFooter` or
   any shared class or token value the dashboard uses; the `/dashboard` gate and its 307 to sign-in unchanged.
   The sign-in view then shows the white bar with `Dashboard` marked, while `/dashboard` keeps the dark bar
   (two different pages; the bar items and links are the same). Today the sign-in body is already white (`bg-paper`) under the dark bar,
   and it uses the shared `.field` and `.kicker` classes, so #73 is mostly the bar / footer swap and the copy
   trim (Q10 on the shared classes).
5. **Navigation between the pages works both ways** (section 4).
6. **QA per page:** each ticket's QA checks only its own ST rows and a no-regression pass on the pages not
   converted (they match `main` before the ticket; `/dashboard` always, sign-in until #73). #72 then runs ST6 on
   the three shipped pages. **The dashboard gets its own regression when its new brief lands.**
7. Same loop as #53 for every ticket: one draft PR off the latest `main`, EL answers questions, QA on the
   preview, EL merges, QA checks production.

## 6. Acceptance (ST0–ST6; QA at phone 400 × 860, 1024 × 800 and 1440 × 900)

Each row is checked on the PR preview at all three widths, then on production after the merge. "Converted page"
= home, the calculator or sign-in once its ticket has merged (section 5). `/dashboard` is never a converted page in
this epic.

**ST0: white tokens, the superseding decision, the untouched dashboard (every ticket)**

| ID | Pass when |
|---|---|
| ST0-01 | The page background, bar, footer and every band / panel / card behind content compute to `rgb(255, 255, 255)`; no element wider than a control has a dark background (luminance < 0.5) on a converted page. |
| ST0-02 | Text uses the tokens: body text `#1e2124`, secondary `#636363`, error `#c62828`, borders `#e3e3e3`, focus ring `#2b5945`, hover wash `--color-wash`; no colour outside the token list (plus the chart's DCA series colour and the dashboard donut's neutral greys) and the font is Schibsted Grotesk. |
| ST0-03 | Pages not converted yet (sign-in until #73, a 404) are unchanged from `main` (dark bar, same computed colours): no half-converted page in production. |
| ST0-04 | The spec, AGENTS.md and README record that white replaces the #53 dark style on the converted pages, the schedule, the on-hold dashboard and the bar decision; DR0-01 is marked superseded for converted pages only. (Docs, #67.) |
| ST0-05 | The live `/dashboard` is untouched (every ticket): released and visible (DR0-02), its menu (`SiteMenu`, dark) and footer (`SiteFooter`) render exactly as on `main` (same markup, classes and computed colours at 400 / 1024 / 1440), `theme-color` `#1e2124`; signed-out `/dashboard` still 307s to sign-in; no change in the diff to `src/routes/dashboard.tsx`, `src/components/dashboard/*`, `site-menu.tsx`, `site-footer.tsx` or an existing token value. |

**ST1: the white bar and footer (#68 pieces; on home, the calculator and sign-in, each from its conversion day)**

| ID | Pass when |
|---|---|
| ST1-01 | On a converted page, one thin white bar (height ≤ 48 px) at the top, sticky on scroll: `Orpheus` on the left (→ `/`), `Calculator` and `Dashboard` on the right (→ `/calculator`, `/dashboard`), in that order, no other items, no dropdowns; at 400 px all three fit on one line with no horizontal page scroll. |
| ST1-02 | The current page's item has `aria-current="page"` and a visible mark (underline and full-strength text): exactly one item marked, `Orpheus` on `/`, `Calculator` on `/calculator`, `Dashboard` on `/dashboard/sign-in` (from #73). |
| ST1-03 | The white bar and footer appear only on converted pages (`/`, `/calculator`, then `/dashboard/sign-in`); `/dashboard` and unconverted pages keep today's menu and footer (ST0-05). Navigation works both ways: from the white bar to `/calculator` and `/dashboard`, and from the dashboard's existing menu to `/` and `/calculator`. |
| ST1-04 | The white footer's only text is exactly `Orpheus Wisdom` (today's footer keeps the same text on the other pages). |

**ST2: hover (converted pages with rows: home)**

| ID | Pass when |
|---|---|
| ST2-01 | Hovering a clickable row (the home Platforms rows) gives it the light wash background; it is never inverted to ink; the text keeps ≥ 4.5:1 contrast on the wash. |
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
| ST4-01 | The page title (`h1`) is exactly `Dollar-cost average calculator.`; the dark header band and `DCA vs lump sum` are gone; no instruction text: the intro paragraph goes, except (default reading, Q2) the one method line `Dividends are reinvested and splits are handled.` under the title, which DCA-01 needs stated. |
| ST4-02 | Order: the form (basket, window, amounts, frequency, submit), then the result table, then the chart. |
| ST4-03 | The listings note `US, EU and CA listings, one currency per basket.` is one line (no wrap at 400 px) directly under the form. |
| ST4-04 | Phone (400): one column. Wide (from 1024): two columns (reading, Q3: the form on the left, the result table and chart on the right). No horizontal page scroll at any width (the table may scroll inside its own box). |
| ST4-05 | Calculator unchanged in behaviour: `qa/tools/site.mjs` passes ($313,000; VOD.L 400 with the exact message); DCA-01..06 pass; the calculator logic files are untouched in the diff. |

**ST5a: dashboard `/dashboard` (#71): ON HOLD, deferred**

On hold since 2026-10-05 21:04 ET (Diego is still designing it; a new brief comes via CoS). These rows are **not
checked** in this epic; they are kept as a placeholder and will be rewritten from the new brief. Until then ST0-05
applies (the dashboard is untouched).

| ID | Pass when (deferred) |
|---|---|
| ST5a-01 | *(deferred)* The dashboard uses the white shell and bar (ST0, ST1); no painting or image behind any number. |
| ST5a-02 | *(deferred)* Every #53 state renders white with AA contrast: empty (`Add a holding`), the list, a detail open (Edit, Delete), the add form and its errors, the `Holdings` / `Metrics` switch (400), the metrics sheet beside the list (1024, 1440), chips, the search combobox and its options, `—` cells, the one total and excluded line, the donut (neutral greys, each slice ≥ 3:1 against white or separated by a white gap) and the `Book` row, the as-of / out-of-date lines, the preview refresh panel. |
| ST5a-03 | *(deferred)* DR2–DR6 still pass (the redesign behaviour is unchanged); `qa/tools/dashboard-redesign.mjs` passes. The dashboard stays released (DR0-02). |

**ST5b: sign-in `/dashboard/sign-in` (#73, Sun Oct 11)**

| ID | Pass when |
|---|---|
| ST5b-01 | White shell, bar and footer (ST0, ST1; `Dashboard` marked) on `/dashboard/sign-in` only, in both modes (sign in, create account); `/dashboard` itself unchanged (ST0-05). |
| ST5b-02 | The form shows exactly: `Email`, `Password`, the submit button and the `Create an account` link (plus an error line only after a failed attempt); nothing else: no explanatory note (the invite-only paragraph goes) (Q4 on the heading). Create-account mode mirrors it: `Email`, `Password`, the submit button and a `Sign in` link. |
| ST5b-03 | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix (`release-smoke.mjs`). |

**ST6: leave-outs and regression (#72, Sun Oct 11, after #73; shipped pages only: home, calculator, sign-in)**

| ID | Pass when |
|---|---|
| ST6-01 | No painting or artwork except the home hero (no `img`, CSS `background-image` or `picture` with artwork on `/calculator` or `/dashboard/sign-in`). |
| ST6-02 | No instruction text on the shipped pages: home has only the hero and Platforms; the calculator only its title, form, note, method line (Q2) and results; sign-in only ST5b-02. |
| ST6-03 | WCAG 2.2 AA contrast on home, the calculator and sign-in at every width: normal text ≥ 4.5:1, large text ≥ 3:1, controls' boundaries and the focus ring ≥ 3:1, including hover and disabled-but-readable states (an axe-core run reports no `color-contrast` violation). |
| ST6-04 | No dark remnant on the shipped pages (each passes ST0-01); no page is half converted; `/dashboard` passes ST0-05 (untouched). |
| ST6-05 | Regression of the shipped pages on the preview, then production, at 400 / 1024 / 1440: every ST row except the deferred ST5a, DCA-01..06 ($313,000), noindex meta + `X-Robots-Tag` on every page, the analytics rules, `release-smoke.mjs` (signed-out matrix, sign-in); `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. The dashboard's own regression (DR rows, `dashboard-redesign.mjs`) waits for its new brief; here only ST0-05 checks it is untouched. |

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
5. **#71 is the dashboard only (on hold); #73 is sign-in** (issue #73, EL 2026-10-05). ST5 is split into ST5a
   (dashboard, deferred) and ST5b (sign-in) rather than renumbering, so ST6 stays the last row.
6. **Converted pages are per route,** chosen by exact path (`/`, `/calculator`, `/dashboard/sign-in`), never by the
   user (no theme toggle; that would be a new control).
7. **"Every page: white" in the brief** now means every page this epic ships (home, calculator, sign-in); the
   dashboard's look waits for its own brief.

## 9. Questions for EL (#67)

Each has a default (the simplest reading above); the tickets follow the default unless EL says otherwise.

- **Q0. Spec location.** A new `attachments/site-style-spec.md`, with superseded markers in `dashboard-spec.md`
  and `dca-app-spec.md`? (Default: yes.)
- **Q1. #68 vs #69 on Tuesday.** #68 ships the white pieces unused in production and home flips with #69, so prod
  never shows the white bar over the old dark-hover home cards. OK, or should #68 and #69 be one PR? (Default:
  separate PRs, #68 converts nothing.)
- **Q2. Calculator method line.** "No extra instructions" vs DCA-01 ("dividends reinvested, stated or visible").
  Default: drop `Pick tickers and weights, a date range, and amounts.` and the lump-sum / DCA sentences, keep the
  one line `Dividends are reinvested and splits are handled.` under the title. Or drop it all?
- **Q3. Calculator "wide is two".** Default: from 1024 px, the form on the left and the result table plus chart
  on the right; phone stacks form, table, chart. Or two columns inside the form only?
- **Q4. Sign-in.** "Email, password and a create-account link. Nothing else." Default: keep the `Sign in`
  heading and the submit button (needed to submit), link text `Create an account` (today `New here? Create an
  account`), the invite-only note goes; error lines only after a failed attempt. OK?
- **Q5. Hero credit.** The painting is public domain; default: no visible credit (footer stays `Orpheus Wisdom`
  only), the `alt` names the work, the source and licence live in the repo. OK?
- **Q6. Buttons.** Default: surfaces go white, primary buttons keep the ink fill with white text. Or outlined /
  white buttons too?
- **Q7. "A row lightens on hover"** on a white page. Default: a very light grey wash (`#f5f5f5`) behind the row,
  replacing today's ink inversion. Or another treatment?
- **Q8. Error colour.** `#ff4136` fails AA on white (3.5:1); default `#c62828` (5.6:1) from #70. OK?
- **Q9. Sign-in next to an unchanged dashboard (Sunday).** After #73, `/dashboard/sign-in` is white with the white
  bar and `/dashboard` keeps its dark menu, so a sign-in lands from a white page on a dark one. That follows the
  "dashboard untouched, sign-in converted" rule; confirm that's intended (default: yes, as written).
- **Q10. Shared sign-in styles.** If the sign-in form today shares classes with the dashboard's forms (e.g. `.field`,
  button classes), #73 adds sign-in-only classes rather than editing the shared ones. OK? (Default: yes.)
