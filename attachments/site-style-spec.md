# Orpheus site style: dark, mobile first (epic #66): spec

Status: **approved brief, dark** (epic #66, re-scoped by Diego via CoS and EL, 2026-10-05 21:26 ET). Written out
in #67 (ticket 1, docs only; no product code). This file is the source of truth for the shell (every page), the
calculator, home and sign-in in tickets #68, #70, #69, #73 and #72. The dashboard's content is on hold (#71).
The calculator rules stay in `attachments/dca-app-spec.md` and the dashboard data rules in
`attachments/dashboard-spec.md`; both are unchanged by this epic. If chat and this file disagree, stop and ask EL.

## 1. Decision log

| When | Decision |
|---|---|
| 2026-10-04 | Epic #53 (dashboard redesign) keeps the **dark style**: charcoal bar (`#1e2124`), same tokens and fonts. |
| 2026-10-05, evening | A **white** site style was proposed for epic #66 (PR #74 first drafts, with a same-day schedule revision at 21:04 ET). |
| **2026-10-05 21:26 ET** | **White is dropped; dark wins** (Diego via CoS and EL). Nothing white gets merged. **The #53 dark style stands and is extended** to a charcoal page with off-white type on every page this epic ships, under a dark shell on every page. EL's earlier answers to the white-draft questions are void wherever they assume white. The white drafts survive only in the PR #74 history (commits `1aa2192`..`a9d8cca`). |
| 2026-10-05, after 21:26 ET | Diego approved the calculator's **phone layout** (via EL): fields stack, chart full width, Lump sum and DCA in two columns if they fit, short painting band (section 7a); it replaces "Phone is one column". |
| 2026-10-05, ≈ 22:00 ET | EL accepted **every section 12 default** (Q0, Q2, Q4, Q5, Q6, Q8, Q10, Q11, Q12, Q13, Q14, Q15) and the green `#5cc08a`. Q12 with a caveat: the per-name table, the summary line and the swipe hint go unless a DCA rule or acceptance row needs those figures shown (none does; #70 checked `attachments/dca-app-spec.md` and the QA pack). |
| 2026-10-05, ≈ 22:05 ET | EL amendments folded into #70: **A1 / A9** (ST4-10: short `Lump sum` / `DCA` row labels, the metric labels word for word as full-width captions, two columns while each is ≥ 150 px), **A2** (ST4-08: rows full width, remove control beside the ticker), **A3** (new ST4-14: the hero text clear of Venus), **A4** (new ST4-15: the wash contains the hero text), **A11** (ST4-04: the note 13 px dim, one line at 360 without changing its wording), exact sizes (section 7), a primary-button row (ST4-16), the 300 KB limit at 2x and CLS by PerformanceObserver (ST4-01), phone below 1024 px / wide from 1024 px (section 7a), the bar on one line at 360 (ST1-01), `color-scheme: dark` (section 6), the `/dashboard` screenshot compare against production (ST0-05; superseded at ≈ 23:00 ET by N7: against the base PR's preview, signed in). |
| 2026-10-05, ≈ 23:00 ET | **QA round 1 on #70 (PR #76 at `2d4ee7c`) failed; EL's fixes and decisions:** D1 (CLS on phones 0.0036 / 0.0028 from the web-font swap resizing the wash; the QA tool had skipped shifts Playwright's phone emulation tags `hadRecentInput`): font-independent wash and title sizes, a size-adjusted local fallback, every shift counted (ST4-01; Q16 decided: #72 self-hosts the fonts, PLANNED). D2 (the Frequency list opened white with chalk text): charcoal select and options, `color-scheme: dark` on `<html>` (section 6, ST4-03). D3 (the `Max drop` value wrapped under its label at 360 / 400): one-line rows, the date on its own muted line (ST4-10). **N1:** keep the fixed method sentence word for word as one muted caption (Q12). **N4:** the wash hugs the text lower left, ≤ 50% of the band at 360 / 400 (ST4-15). **N7:** ST0-05 compares `/dashboard` signed in against the base PR's preview with the QA accounts, never production (it has no QA sign-in). |
| 2026-10-10, ≈ 22:00 ET | **#69 kickoff (EL):** home in the dark shell keeps the Jordaens hero, `Investment driven by research.` and the Platforms lines (Q11; #69 builds them). The home rows get the calculator's bar: the largest file served at 1440 px on a 2x screen ≤ 300 KB, CLS by `PerformanceObserver` with every shift counted (hero 0, page total < 0.001 until #72), phone rules below 1024 px and wide from 1024 px (checked at 360, 400, 1024 and 1440), the bar on one line at 360, no visible credit and the `alt` naming the painting (Q5). ST3-01..04 amended and ST3-05..07 added from #69 (section 8 has the sizes); Q17 records the home phone band default. |
| 2026-10-10, ≈ 22:17 ET | **EL answers on #69 (PR #77 at `5bd0061`), docs only:** Q17 closed: keep the built home phone band, `min(66.667vw, 480px)` (240 px at 360, 267 px at 400), not a flat 240 at both; the ≤ 200 px band (section 7a) stays calculator-only. "The horses" confirmed: the prince plus the four white chariot horses (with the dark head behind the leftmost); the brown horse on the far right may be partly cropped on phones. The spaced punctuation from `tnum` in the body font settings is a shell fix on every page in #72 (not #69 / #70). The calculator band's width above ≈ 1886 px gets the same one-class `w-full` fix as home, in #72 (#70 not touched). |
| 2026-10-11, ≈ 08:22 ET | **#78 calculator polish (Diego via CoS; EL):** results show exactly four lines per plan, `Final value`, `Total invested`, `Return (%)`, `CAGR (%)` (mapped from the end value, the amount invested, the total return and the existing CAGR; money-weighted return, max drop, value at the drop and return to the drop leave the display; no calculation change; `$313,000` stays). Field checks before the calculation, each message under its field, the other fields kept. **A:** starting capital and contribution must be numbers **above 0** (the engine, `simulate.ts`, refuses 0 and stays untouched), so the issue's "zero or more" reads "above zero"; text, negatives and blanks are refused. **1:** the venue and currency checks run after the prices are read and before the calculation (the listing and currency come from the price feed), under the bad ticker, naming it; blank and duplicate tickers are checked before any request. **2:** the labels word for word as above. **3:** wide (≥ 1024 px) Start, End, Starting capital, Contribution and Frequency in one row with the button under it, the results below the form at full width (replaces "form left, results right"); the basket stays stacked ticker / weight / remove rows. **4:** start must be before end (equal dates refused). ST4-06, -08, -10, -12, -13 amended; ST4-17 (field checks) and ST4-18 (wide layout) added. |
| 2026-10-11, ≈ 09:14 ET | **#80 saved searches (Diego via CoS; EL kickoff):** a `Saved searches` button at the top of the calculator form, above the basket's Ticker, closed by default; open, a short list, newest first, each line `tickers · dates · DCA amount` (the search's own contribution in the results' money format, e.g. `$1,000`; the issue's `$100` is the example) with a `Load` that fills every field; the last 5 only, the oldest drops. Saved automatically by a successful calculation (no second save button); a refresh fills the last search and keeps the list; calculating keeps the search in the fields. **Storage (Diego, locked):** no login, never the account (#73 parked); this browser only, `localStorage` (two keys, section 7b); another device sees nothing; clearing the browser's site data clears both. ST4-19..ST4-24 added. |
| 2026-10-11, ≈ 09:29 ET | **EL answers on #80 (PR #81 at `0b0512b`; docs-only commit, no code change):** **Q18 accepted:** a refresh restoring a multi-name basket may shift the form below the hero, page CLS under 0.1 is fine (hero CLS stays 0); the form is not hidden until the restore and the restore is not tap-only; a refresh still fills the last search (ST4-22). **Q19:** each line shows that search's own contribution (the issue's `$100` was an example); no `weekly` / `monthly` on the line (ST4-20). **Q20:** the button is always visible, closed by default; the empty list reads `No saved searches yet.`; the button is not hidden until a search exists (ST4-19, ST4-20). |
| 2026-10-11, ≈ 10:09 ET | **#73 kickoff (Diego via CoS; EL):** sign-in dark in the shared shell: email, password and a `Create an account` link only; sign-in logic unchanged; its own field / label classes (Q10); charcoal page, chalk type, underline fields, AA contrast, `color-scheme: dark`. Section 9 is the build spec; ST5b-04 / -05 added. Simplest reading of the code against Q4 (noted in the PR): the heading and submit stay (`Sign in`; `Create account` in create-account mode, as today); the link keeps today's in-place mode switch (a `button`, so no auth or route change) with the text `Create an account` / `Sign in`; the deployment-state line `Sign-in is not configured on this deployment.` stays (it replaces the form only when auth is off; `check-dashboard-built` reads it). |
| 2026-10-11, ≈ 10:38 ET | **#72 kickoff (Diego via CoS; EL):** leave-outs and regression on the shipped pages (home, calculator, sign-in, the shell and the dark 404); #71 stays on hold (ST0-05 still checked). In scope: ST6-01..05; **Q16 done here:** Schibsted Grotesk self-hosted (the Google Fonts dependency dropped), so the page CLS is a strict 0 at 360 / 400 / 1024 / 1440 with every shift counted (ST3-01 / ST4-01 tightened from < 0.001); the `tnum` spaced punctuation (`research .`, `business :`) fixed on the dark pages; the bar links made ≥ 44 px tap targets (QA N1 on #73) without growing the bar; a minimal dark 404. Dated schedule wording dropped (section 3 is an order, not days). ST6-06..09 added; `qa/tools/site-style-regression.mjs` runs the regression. |
| 2026-10-11, ≈ 10:58 ET | **EL answers on #72 (PR #83 at `3759f95`; docs-only commit, no code change):** (1) **font loading decided:** `font-display: optional` and a strict page CLS of 0 are the point of Q16; a slow first visit may stay in the size-adjusted fallback for that one page view; never swap the font in a way that brings CLS above 0. (2) **Figures decided:** proportional figures on the dark pages; don't turn `tabular-nums` (or `tnum`) back on for the result values or anywhere else there: the wide comma and spaced punctuation are worse than losing digit alignment; `/dashboard` keeps `main`'s setting. (3) **404 wording decided:** `Page not found.` |
| 2026-10-11, ≈ 11:33 ET | **#84 kickoff (Diego via CoS; EL):** the **lyre** replaces the geometric mark on every page (inline SVG in the bar beside `Orpheus`, decorative; `favicon.svg`), same bar (45 px, ≥ 44 px tap targets) and footer; ST1-05 added. The Personal Finance page (`/personal-finance`) follows `attachments/personal-finance-spec.md` (PF rows) and every shell rule here; the bar's items (ST1-01) and home (ST3-03) are unchanged until EL answers its Q1 (navigation). |
| 2026-10-11, ≈ 12:05 ET | **EL answers on #84 (PR #88 at `f067c84`; docs-only commit, no code change):** `/personal-finance` is reached by URL only (Q1 (d)): **ST1-01 stays exactly three bar items** and **home stays the hero + two Platforms lines (ST3-03)**. Amounts unitless until #87 (Q2); a typed `Equity to cover` overrides #86's calculated amount (Q3, for #86); `__grok/icon-180.png` untouched, Grok builder assets out of scope for #84 (Q4). Details: `attachments/personal-finance-spec.md`. |

What "extended" means against today's site (`main`): today the bar is charcoal (`bg-ink`), the calculator has a
charcoal header band, and the pages and the footer are white (`--color-paper`). The dark brief makes the bar,
the footer and the page charcoal, with off-white type.

Unchanged by this epic: the calculator rules (DCA-01..06) and logic files (`src/lib/dca/*`,
`src/routes/api/chart.ts`), the `$313,000` regression value in `qa/tools/site.mjs`; the dashboard data rules and
its content (holdings, chips, book, its styles and data); the dashboard stays released and visible
(`DASHBOARD_ENABLED` and every env var untouched); `noindex` meta and `X-Robots-Tag: noindex, nofollow` on every
page; the analytics rules (#48); no buy / sell / hold wording and no disclaimer. No hires. #50, #51 and PR #52
stay paused until Oct 12; this epic doesn't touch them.

## 2. The brief (verbatim from epic #66, dark)

Rules: no hires. Calculator rules and dashboard data rules are unchanged. The dashboard stays released and
visible; its content is on hold until a new brief. #50, #51 and PR #52 stay paused until Oct 12. No extra
instructions anywhere, and AA contrast on dark. One PR at a time: draft PR, EL answers, QA on the preview, merge,
prod check.

- **Shell on every page (#68):** charcoal bar and page, off-white type. The bar has 'Orpheus' on the left, then
  'Calculator' and 'Dashboard' on the right, with the current page marked. Footer: 'Orpheus Wisdom'. On
  /dashboard only the shared bar and footer may change; the dashboard content (holdings, chips, book, its styles
  and data) is untouched.
- **Calculator `/calculator` (#70):**
  - Dark charcoal page under the shell.
  - Hero band: Botticelli, 'The Birth of Venus'. Public-domain image with source and license recorded,
    optimised, explicit width and height. A small '01' and the title 'Dollar-cost average calculator.' sit lower
    left on a soft wash, in plain type, not a poster.
  - Borderless fields with a thin underline only: tickers, start, end, starting capital, contribution, and
    weekly or monthly. The listings note is one line under the form.
  - Chart: one green line with a soft green fill, and the last value in a small green pill.
  - Results: Lump sum and DCA as label-value rows. No boxes, no spreadsheet table.
  - Logic untouched; the $313,000 regression unchanged. Phone is one column.

- **Home `/` (#69):** in the dark shell. The Jordaens hero, the line 'Investment driven by research.' and the
  Platforms lines all stay.
- **Sign-in (#73):** dark. Email, password and a 'Create an account' link only.

**Phone layout for the calculator (Diego via EL, 2026-10-05, after the dark brief; replaces "Phone is one
column"):** on a phone the fields stack, one under another; the chart is full width; Lump sum and DCA sit in two
columns if they fit, and stack only if they don't (check at 360 and 400); the painting is a short band;
otherwise the same: dark page, Botticelli hero, borderless underlines, green line, green pill. The wide page
stays as briefed. Section 7a.

## 3. Order (one PR at a time)

| # | Ticket | What ships | State |
|---|---|---|---|
| 1 | #67 | This spec and the harness (PR #74, rewritten to dark; docs only) | landed |
| 2 | #68 | Dark shell on every page: bar, footer, page and base type (on `/dashboard`: bar and footer only) | landed |
| 3 | #70 | Calculator: Botticelli hero, underline form, green chart, label-value results (then #78 polish, #80 saved searches) | landed |
| 4 | #69 | Home in the dark shell: Jordaens hero, `Investment driven by research.`, Platforms lines | landed |
| 5 | #73 | Sign-in, dark | landed |
| 6 | #72 | Leave-outs, contrast and regression on the shipped pages; self-hosted font (Q16), `tnum` punctuation, bar tap targets, dark 404 | this PR |
| — | #71 | Dashboard content: on hold, waits for a new brief via CoS | on hold |

## 4. Exact copy (verbatim; tests and QA compare these strings)

| Where | String |
|---|---|
| Bar, left (→ `/`) | `Orpheus` |
| Bar, right (→ `/calculator`, `/dashboard`) | `Calculator`, `Dashboard` |
| Footer (only text) | `Orpheus Wisdom` |
| Hero numeral (calculator; home, Q11) | `01` |
| Calculator title (`h1`) | `Dollar-cost average calculator.` |
| Home line (`h1`) | `Investment driven by research.` |
| Home Platforms section (Q11) | `02`, `Platforms` |
| Home Platforms line 1 (→ `/calculator`) | `Calculator`, `Dollar-cost average calculator.`, `Open` |
| Home Platforms line 2 (→ `/dashboard`) | `Dashboard`, `The portfolio as a business: fundamentals for each name, and the whole.`, `Open` |
| Calculator listings note (unchanged) | `US, EU and CA listings, one currency per basket.` |
| Calculator result plans (#78) | `Lump sum`, `DCA` |
| Calculator result lines (#78; each plan, in this order) | `Final value`, `Total invested`, `Return (%)`, `CAGR (%)` |
| Calculator saved searches (#80) | button `Saved searches`; each line `<TICKERS> · <start> – <end> · DCA <amount>` (tickers joined by `, `, dates `YYYY-MM-DD`, the amount in the results' money format), then `Load`; empty: `No saved searches yet.` |
| Calculator field checks (#78; under the field) | ticker: `Add a ticker.`, `<T> is already in the basket.`, the price feed's refusal naming the ticker (e.g. `VOD.L lists on LSE. US, EU, and CA listings only.`; prefixed `<T>: ` when the feed's text doesn't name it), `<T> trades in <CUR>; this basket is in <CUR>. One currency per basket.`; weight: `Enter a weight above 0.`; start / end: `Add a start date.`, `Add an end date.`, `End must be after the start.` (under End); starting capital / contribution: `Enter a number above 0.`; frequency: `Choose weekly or monthly.` |
| Sign-in link | `Create an account` |
| 404 (#72; the only text in `<main>`) | `Page not found.` |

The Platforms lines are the ones in the approved home brief, unchanged (Q11: `main` itself still shows the #46
home, one line `Orpheus Wisdom is a private desk with two tools.` and two cards; #69 replaces it).

## 5. Tokens (dark) and AA contrast

New tokens, added next to the existing ones by #68. **No existing token value changes** (`--color-ink`,
`--color-paper`, `--color-line`, `--color-muted`, `--color-card`, `--color-dca`, `--color-focus` and the shared
`.field` / `.kicker` / `.section` classes stay exactly as on `main`), because the dashboard content renders with
them and must not change.

| Token (proposed name) | Value | Use |
|---|---|---|
| `--color-night` (charcoal) | `#1e2124` | Page, bar, footer (the #53 bar colour, extended) |
| `--color-chalk` (off-white) | `#f2f0eb` | Body text, headings, current bar item, values, primary button fill |
| `--color-dim` | `#a8aeb4` | Secondary text: labels, other bar items, footer, captions |
| `--color-rule` | `#8b9298` | Field underlines (the only boundary of a field) |
| `--color-hair` | `#3a3f44` | Decorative hairlines only (bar / footer edge, chart grid); never a control boundary, never text |
| `--color-green` | `#5cc08a` | The one green: chart line, chart fill (at 16% over charcoal = `#283a34`), the last-value pill |
| `--color-alert` | `#ff8f87` | Error text (Q8) |
| focus ring | `--color-chalk` | `:focus-visible` outline on dark pages (the green stays for the chart only) |
| hero wash | `--color-night` at ≥ 85% opacity behind the hero text, fading out toward the painting | Soft wash under `01` and the title |

Measured contrast (WCAG 2.x relative luminance; 4.5:1 for text, 3:1 for large text and non-text UI):

| Pair | Ratio | Needed |
|---|---|---|
| chalk `#f2f0eb` on night `#1e2124` | 14.2:1 | 4.5 |
| dim `#a8aeb4` on night | 7.2:1 | 4.5 |
| rule `#8b9298` (field underline) on night | 5.1:1 | 3 (non-text) |
| green `#5cc08a` (chart line) on night | 7.2:1 | 3 (non-text) |
| green line on the green fill `#283a34` | 5.4:1 | 3 (non-text) |
| chalk on the green fill | 10.6:1 | 4.5 |
| dim (axis labels) on the green fill | 5.4:1 | 4.5 |
| night text on the green pill `#5cc08a` | 7.2:1 | 4.5 |
| alert `#ff8f87` on night | 7.3:1 | 4.5 |
| chalk focus ring on night | 14.2:1 | 3 (non-text) |
| night text on a chalk button | 14.2:1 | 4.5 |
| chalk on the hero wash, worst case (85% night over a pure white pixel = `#404245`) | 8.9:1 | 4.5 |
| dim on the hero wash, worst case | 4.5:1 | 4.5 (borderline: hero text uses chalk only) |
| hair `#3a3f44` on night | 1.5:1 | decorative only, exempt |

## 6. Shell (#68, every page)

- **Bar:** today's single `SiteMenu`, restyled: charcoal, thin (≈ 44 px), sticky on scroll, `Orpheus` left,
  `Calculator` and `Dashboard` right, no dropdowns; the current page `aria-current="page"` in chalk with an
  underline, the others in dim; plain links (full page loads), so `/dashboard` keeps its server gate. Same
  component and items on every page, including `/dashboard`, `/dashboard/sign-in` and a 404.
  **Lyre mark (#84):** a simple lyre (inline SVG, 20 × 20 px, `currentColor` strokes, `aria-hidden`) sits left of
  `Orpheus` inside the same link and replaces the geometric mark (`public/favicon.svg`, two bars, is now the same
  lyre in chalk on charcoal); see `attachments/personal-finance-spec.md` §8.
  **Tap targets (#72, QA N1 on #73):** each bar link is a 44 px tall hit area (the bar's full inner height;
  text and underline where they were), so the bar stays 45 px (44 + the 1 px `hair` rule) and ≤ 48 px (ST1-01).
- **Font (#72, Q16):** Schibsted Grotesk self-hosted from `public/fonts/schibsted-grotesk/` (the Google Fonts
  files, unmodified: upright and italic, latin and latin-ext, variable weight; SIL OFL 1.1, source and licence in
  `public/fonts/schibsted-grotesk/SOURCE.md` and `OFL.txt`), declared in `src/styles.css` with the same
  `unicode-range`s as before and `font-display: optional`; the upright latin file is preloaded from `__root.tsx`.
  Either the web font renders from the first paint or the size-adjusted fallback stays for that page view: never a
  swap, so the page CLS is a strict 0. The same face serves every page (the dashboard included, unchanged glyphs).
- **Figures and punctuation (#72):** `tnum` (whose Schibsted lookup also widens `# % , . : ;`) is off on the
  dark pages, so prose punctuation sits normally (`research.`, `business:`); figures are proportional there.
  `zero` (slashed zero) stays. `/dashboard` keeps `main`'s `tnum` body setting (its content is on hold; ST0-05).
  **Decided (EL, #72):** keep proportional figures on the dark pages, result values included; don't turn
  `tabular-nums` / `tnum` back on there (the wide comma and spaced punctuation are worse than losing digit
  alignment).
- **404 (#72):** dark like every page; the only content is the `h1` `Page not found.` (20 px chalk, weight 400) in
  the content column, answered with status 404 (the dashboard-off paths render the same page). Wording decided
  (EL, #72).
- **Footer:** today's single `SiteFooter`, restyled charcoal; the only text is `Orpheus Wisdom` (dim), on every
  page.
- **Page and base type:** charcoal page and chalk base text on every page except `/dashboard`.
- **`/dashboard`: only the bar and footer change.** The dashboard content (holdings, chips, book, its styles,
  its data, its `bg-paper` wrapper) is untouched and stays visible; no file under `src/routes/dashboard.tsx` or
  `src/components/dashboard/` changes, and no existing token or shared class changes (Q13 on the page
  background around the content).
- **Pages whose content converts later** (home until #69, sign-in until #73, both converted): #68 changes only the shell around
  them; their content keeps its current look and must stay AA-readable on the new page background (e.g. the
  home line inherits chalk; the home cards and the sign-in form keep their own white panels until their day).
- **`theme-color` meta:** `#1e2124` (already the value in `__root.tsx`).
- **`color-scheme: dark`** on the dark pages (EL, 2026-10-05; landed in #70 on the shell: `scheme-dark` on
  `<html>` via `shellHtmlClass()` and on `<body>` via `shellBodyClass()`, QA round 1 D2), so native date pickers
  and select popups open dark. A select and its options also carry charcoal `#1e2124` and chalk explicitly
  (`html.scheme-dark select, option, optgroup` in `src/styles.css`): Chrome draws the opened list from the
  select's and options' own colours, and a transparent select opened white with chalk text (1.14:1). Every
  select and date input on a dark page gets this through the shell. Not on `/dashboard` (its content stays as on
  `main`, Q13).

## 7. Calculator (#70)

- **Page:** charcoal under the shell; no white surface left on `/calculator` (the header band, the
  `bg-paper` wrappers, the sticky table cells and the right-edge fade all go dark or go away).
- **Hero band:** Sandro Botticelli, *The Birth of Venus* (c. 1484–1486), under the bar. `01` (small) and the
  `h1` `Dollar-cost average calculator.` lower left on the soft wash, in plain type: the site font
  (Schibsted Grotesk), normal weight, no all caps, no text effects, the title ≤ 48 px at 1440 and ≤ 32 px on a
  phone: a page title, not a poster. Venus and her scallop shell stay clear of the text and wash at 360, 400,
  1024 and 1440 (crop / `object-position` per width). On a phone the band is short (section 7a).
- **Image:** public domain; source and licence recorded in the repo by #70 next to the asset (e.g.
  `public/hero/calculator-SOURCE.md`); served from the app (no request to another host); optimised
  (responsive `srcset`, AVIF or WebP with a JPEG fallback, ≤ 300 KB at 1440 px); explicit `width` and `height`
  attributes, so layout shift is 0; `alt` names the painting; no visible credit (Q5).
  Candidate: Wikimedia Commons, `File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg`
  (https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg),
  from the Google Art Project; tempera on canvas, 172.5 × 278.5 cm, Uffizi, Florence (inv. 1890 no. 878).
  Licence on the file page (checked 2026-10-05): public domain (author died 1510; PD-old-100 and PD-US-expired;
  a faithful reproduction of a 2D public-domain work, PD-Art). #70 re-checks and records the exact tags.
- **Form:** borderless fields with a thin underline only (rule `#8b9298`, no box, no fill, no radius): the
  basket's tickers (each with its weight, Q14), start, end, starting capital, contribution, and weekly or monthly
  (the existing select, styled the same). Labels stay visible. Section numbering continues from the hero `01`
  (today `02` Basket, `03` window and amounts, `04` Result). The calculator gets its own field class; the shared
  `.field` stays as it is for the dashboard (Q10).
  Since #80 the form starts with the `Saved searches` button (section 7b), above `02` Basket.
- **Listings note:** `US, EU and CA listings, one currency per basket.` stays one line (no wrap at 360 or 400 px)
  under the form. Q2 for the dividends rule.
- **Chart (today: two charts, one series each; see section 10):** one chart, one series, the DCA portfolio value
  (DCA NLV over time) by default: a green line, a soft green fill under it, and the last value in a small green
  pill (night text on green, full digits, the same money format as the results). No second chart, no legend
  paragraph, no "each plan has its own scale" note.
- **Results (#78, replaces #70's eight metric captions):** two plan columns, `Lump sum` then `DCA`, each with
  **exactly four lines**: `Final value` (the end value, `NLV at end`), `Total invested`, `Return (%)` (the total
  return) and `CAGR (%)` (the existing CAGR on the total invested, as if all invested on day one). The
  money-weighted return (XIRR), max drop, value at that drop and return to the drop are no longer shown (display
  only; the engine still computes them). No boxes, no borders around them, no `<table>`. Two columns while each is
  ≥ 150 px wide, otherwise stacked (Lump sum above DCA). For PLTR 50 / TQQQ 50, 2020-10-02..2026-10-01, 1,000 +
  1,000 weekly, DCA `Total invested` reads `$313,000`.
- **Field checks (#78, before the calculation):** each bad field gets its message directly under it (section 4
  copy), with `aria-invalid` and `aria-describedby`; every bad field is marked at once and no field is cleared;
  editing a field clears its own message. Order: tickers (blank, duplicate), weights, start / end (both filled,
  start before end; equal dates refused), starting capital and contribution (numbers above 0: the engine refuses
  0, decision A; text, negatives and blanks refused), frequency (weekly or monthly). Only when all pass are prices
  read; then each ticker's venue (US / EU / CA only: the price feed's refusal, e.g. `VOD.L lists on LSE. US, EU,
  and CA listings only.`, HTTP 400, unchanged) and currency (one per basket; the first ticker's currency is the
  basket's, each other ticker in another currency is marked) go under that ticker, naming it, and nothing is
  calculated. An error that belongs to no field (the feed down, the engine's own refusals such as `No session to
  place the contributions.`) stays one line under the listings note (Q8).
- **Layout:** wide (from 1024 px, #78 decision 3): one column. `02` Basket (stacked ticker / weight / remove rows,
  at most 26rem wide: the basket is a list, so it is the exception to "one row"), then `03` Window with Start,
  End, Starting capital, Contribution and Frequency **in one row**, `Compare plans` under it, the listings note
  under the form, then `04` Result below the form at full width (chart, then the two plan columns). The phone
  layout is section 7a. No horizontal page scroll at 360, 400, 1024 or 1440.
- **Logic untouched:** no change to `src/lib/dca/*` or `src/routes/api/chart.ts`; `qa/tools/site.mjs` keeps
  `$313,000` and may only change how it finds the value (since #78: the DCA plan's `Total invested` line).
- **No extra instructions:** the intro paragraph (`Pick tickers and weights, …`), the swipe hint and the chart
  scale note go (and the two field hints, `Used only by the lump-sum plan.` and `New cash on each DCA date.`).
- **Exact sizes (EL, 2026-10-05; as built in #70):**

  | Part | Size |
  |---|---|
  | Hero `01` | 12 px, weight 400, chalk, no letter-spacing; a fixed 12 px line on a phone (line-height 1), 14.4 px from 1024 (1.2) |
  | Hero title (QA round 1, D1 / N4) | 18 px on a phone in a fixed 5.5em × 3.3em box (three lines: `Dollar-cost` / `average` / `calculator.`); 40 px at 1024, 44 px from 1280 (≤ 48 at 1440) in a fixed 9.5em × 2.2em box (two lines); line-height 1.1; weight 400; chalk; one text node. The box doesn't depend on the font, so the web-font swap moves nothing |
  | Hero wash | night at 88% behind `01` and the title, hugging them: 6 px top / bottom and 12 px side padding on a phone (87.4 px tall: 49% of the 180 px band at 360, 44% of 200 at 400), 16 / 20 px wide; lower left; a soft edge (`box-shadow 0 0 12px 4px` night at 50%); radius 0 |
  | Font fallback (QA round 1, D1) | `Schibsted Grotesk Fallback`: local Arial / Liberation Sans / Arimo with `size-adjust: 105.24%`, `ascent-override: 92.8%`, `descent-override: 24.5%`, `line-gap-override: 0%` (Schibsted's 2000 / 528 / 0 on 2048 units over the size adjust), second in `--font-sans`, limited by `unicode-range` to the web font's latin + latin-ext subsets (so glyphs outside it, such as the home cards' `→`, render exactly as before; ST0-05); kept by #72 as the face shown when the self-hosted font misses its `optional` window |
  | Phone band | `min(50vw, 200px)` tall (180 at 360, 200 at 400 and up to 1023); wide band at the crop's aspect ratio (250 at 1024, 351 at 1440), ≤ 460 px |
  | Field | 44 px tall, no box border, no fill, radius 0, 16 px text; the underline 1 px solid rule `#8b9298` (chalk while focused); the select and its options charcoal with chalk text (D2) |
  | Focus ring | 2 px solid chalk, offset 2 px, on every field (a date field's calendar button too), button and link |
  | Field label | 12 px, letter-spacing 0.14em, upper case, dim |
  | Primary button (Q6) | 48 px tall, 24 px side padding, 14 px text, chalk `#f2f0eb` fill, night `#1e2124` text (14.2:1), radius 0; while reading prices: dim fill, night text (7.2:1) |
  | Listings note (A11) | 13 px, line-height 1.4, dim (the "muted" colour on dark), one line, `nowrap` (302 px wide at 360, inside the 320 px column) |
  | Chart | 224 px tall; line 2 px green `#5cc08a`; fill green at 16% opacity (`#283a34` over night); grid hair; axis ticks 12 px dim |
  | Last-value pill | 22 px tall, radius 11 px, 8 px side padding, 12 px weight 500, night text on green (7.2:1), the results' money format |
  | Results (#78) | plan heading (`Lump sum`, `DCA`) 14 px chalk, weight 500, with a 1 px `hair` rule under it; four lines per plan: label 13 px dim, value 16 px chalk, `nowrap`, proportional figures with normal punctuation (#72, ST6-07); on a phone the label sits above its value (a 152 px column at 360 can't hold `Total invested` beside `$313,000`), from 1024 px label left and value right on one row; two columns while each is ≥ 150 px (`repeat(auto-fit, minmax(150px, 1fr))`, 16 px gap; 48 px wide) |
  | Captions under the results | 13 px dim: `Dividends reinvested.` (DCA-01, Q2), then the fixed method sentence word for word (`Prices are raw daily closes. Lump sum starts on the first session every name has a price. A contribution date with no session goes in at the next session's close.`; EL N1, Q12), then only the run-specific lines (Q12) |
  | Field check (#78) | 13 px `#ff8f87` (7.3:1), line-height 1.4, directly under its field (6 px gap); the field's underline turns `#ff8f87` while it is marked |
  | Error line (Q8) | 14 px `#ff8f87` (7.3:1), under the listings note; only for errors that belong to no field |

## 7a. Calculator on a phone (approved by Diego via EL, 2026-10-05; replaces "Phone is one column")

Phone = below 1024 px wide (EL, 2026-10-05): the phone rules apply below 1024 px and the wide layout (#78: one
column, the window fields in one row, the results below the form) from 1024 px. QA checks the phone rules at 360 and 400 and the wide layout at 1024 and 1440.

- **Fields stack**, one under another; the field rows span the full width (A2; Q15: a basket row's ticker sits
  above its weight, with the row's remove control beside the ticker). The listings note is still one line under
  the form.
- **The chart is full width** (the full content column, same left and right edges as the fields; the y-axis
  labels inside it, the pill not clipped).
- **Lump sum and DCA sit in two columns if they fit, and stack only if they don't** (EL A1 / A9; #78: plan
  columns). Each column is the plan's heading and its four lines (`Final value`, `Total invested`, `Return (%)`,
  `CAGR (%)`), each label above its value. Two columns while each column is at least 150 px wide, otherwise
  stacked (Lump sum above DCA): `repeat(auto-fit, minmax(150px, 1fr))`. Every value stays whole on one line,
  nothing is clipped, no horizontal scroll. Expected: two columns at 360 and at 400.
- **The painting is a short band** (≤ 200 px tall at 360 and 400), with `01` and the title still lower left on
  the wash and Venus visible.
- **Otherwise the same as wide:** dark page, Botticelli hero, borderless underlines, green line, green fill and
  green pill, label-value results. Calculator rules unchanged.

## 7b. Saved searches (#80, Diego via CoS; storage locked by Diego, 2026-10-11)

- **Button:** `Saved searches`, the first control in the form, above `02` Basket and its Ticker field; a plain
  text button (14 px chalk, the site font, a chevron that turns when open), `aria-expanded` and
  `aria-controls` the panel; the chalk focus ring. **Closed by default** on every load.
- **Panel (open):** directly under the button, the form's full width (wide too: not limited to the basket's
  26rem). A short list, newest first, at most **5** lines; each line is the search's text
  (`PLTR, TQQQ · 2020-10-02 – 2026-10-01 · DCA $1,000`: tickers in basket order, start – end, the DCA
  contribution in the results' money format and the basket's currency) and a `Load` button, with a 1 px rule
  underline across the full width (the fields' rule, `#8b9298`). Text 14 px chalk, wraps on a phone; `Load`
  14 px chalk, 44 px tall touch target. With no saved search: one dim 13 px line `No saved searches yet.`
- **Load** fills every field from the saved search (the basket rows with their tickers and weights, start,
  end, starting capital, contribution, frequency), clears the field marks and any result shown, and closes the
  panel. It does not calculate.
- **Saving:** automatic, only when a calculation succeeds (a result is shown); a field-check or listing refusal
  saves nothing. **No save button.** The search becomes the last search and the newest line; the same search
  again (same tickers, weights, dates, amounts and frequency, compared after normalizing: tickers upper-cased,
  commas dropped and amounts read as numbers; QA D1) moves to the top instead of repeating; a sixth
  search drops the oldest.
- **Refresh:** on the same browser the form opens with the last search in the fields (no result until
  `Compare plans`) and the list of up to 5 behind the button (still closed). Calculating keeps the search in the
  fields (nothing is cleared, as before).
- **Storage (Diego, locked):** this browser only, `window.localStorage`, two keys:
  `orpheus.calculator.last.v1` (the last search) and `orpheus.calculator.saved.v1` (the list, newest first, ≤ 5),
  each a JSON object of the values as typed (EL, D1 follow-up) plus the basket's currency. **No login, never the
  account** (no request to `/api/auth/*` or `/api/dashboard/*`; no cookie, `sessionStorage`, IndexedDB or server
  copy; the only requests stay `GET /api/chart`). Another device or browser sees nothing; clearing the site's
  data clears both. Storage unavailable or a malformed value: the list is empty and the form starts blank (no
  error shown). Nothing from it reaches the analytics (the analytics rules in `AGENTS.md` unchanged).
- **Layout shift:** a cold load has no stored search, so ST4-01 is unchanged. On a refresh with a stored basket of
  more than one name the extra basket rows appear after the page loads (the server can't read `localStorage`);
  the hero never moves (ST4-22). Accepted (EL, Q18): page CLS from the restore under 0.1; the form is not
  hidden until the restore and the restore is not tap-only.

## 8. Home (#69)

- In the dark shell, charcoal page. The Jordaens band under the bar (Jacob Jordaens, *Triumph of Frederick
  Henry, Prince of Orange*, 1652, Oranjezaal, Huis ten Bosch). `01` and the `h1` `Investment driven by research.`
  lower left on the same soft wash and plain type as the calculator, so the prince and the horses stay clear.
- Then `02` `Platforms` with the two lines of section 4, each `Open` a link. Nothing else between the bar and the
  footer (the #46 line and cards go).
- Image rules as for the calculator (public domain, recorded in the repo by #69, optimised, explicit width and
  height, `alt` names the painting, no visible credit). Candidate: Wikimedia Commons,
  `File:The_Triumph_of_Frederik_Hendrik,_by_Jacob_Jordaens_(I).jpg` (4,587 × 4,385 px; from RKD, digital ID
  249278); public domain (author died 1678; the RKD copy carries the Public Domain Mark 1.0), checked 2026-10-05.
- Home still does no calculating, and `/?query` still redirects to `/calculator?query`.
- **Crops (as built in #69; source pixels of the 4,587 × 4,385 Commons file; `public/hero/home-SOURCE.md`):**
  - phone (below 1024 px): x 0–3300, y 1880–4080 (3,300 × 2,200, 3:2): the prince on his chariot, the four
    white horses down to their hooves, and the women and the lion on the left;
  - wide (from 1024 px): x 0–3670, y 1880–3409 (3,670 × 1,529, 2.4:1): the prince and the horses' heads and
    chests, the statue, the women and the soldiers on the left.
  The protected figure (the prince with his cape, and the four white chariot horses with the dark horse's head
  behind the leftmost) is x 1220–3250, y 1940–4000 of the source; the text and wash sit left of it, over the
  women and the statue base. Willem II's brown horse on the far right is outside that box (and partly outside the
  phone crop).
- **Exact sizes (#69; the calculator's section 7 values unless stated):**

  | Part | Size |
  |---|---|
  | Band | phone `min(66.667vw, 480px)` tall: 240 px at 360, 267 px at 400 (Q17, closed: keep; the ≤ 200 px cap of section 7a is calculator-only); wide at the crop's 2.4:1 (427 at 1024, 600 at 1440), ≤ 600 px; `object-position` top centre (the 480 / 600 px caps crop only from the bottom, so the prince is never cut); the band `w-full` |
  | Hero `01` | as the calculator: 12 px, weight 400, chalk; a 12 px line on a phone, 14.4 px from 1024 |
  | Hero title | 16 px on a phone (`min(16px, 4.45vw)`: 14.2 px on a 320 px phone, so the wash stays left of the horses there too), 40 px at 1024, 44 px from 1280 (≤ 48 at 1440), in a fixed 5.3em × 3.3em box: three lines (`Investment` / `driven by` / `research.`; `Investment` is 5.20em in Schibsted, 5.12em in the fallback, and two words never fit: 8.26em and up); line-height 1.1; weight 400; chalk; one text node |
  | Hero wash | night at 88%, hugging `01` and the title: 6 px top / bottom and 8 px side padding on a phone (80.8 px tall: 34% of the band at 360, 30% at 400), 16 / 20 px wide; lower left; `box-shadow 0 0 12px 4px` night at 50%; radius 0. Wide, the text starts on the content column's left edge but never further right than `33.24vw − 280px`, so the wash stays left of the horses on any screen wider than 1440 |
  | `02` + `Platforms` | `02` 12 px dim (the calculator's section label); `Platforms` 24 px chalk, weight 400 |
  | Platforms line | a `hair` rule above each line; the name 20 px chalk; the description 14 px dim (line-height 1.5); `Open` 14 px chalk with a 1 px `rule` underline, a chalk focus ring; on a phone the name and `Open` share the first row and the description sits under them; from 1024 one row: name (12rem), description, `Open` |

## 9. Sign-in (#73)

- `/dashboard/sign-in` is its own route (`src/routes/dashboard_.sign-in.tsx`, not nested in `/dashboard`), so
  #73 changes that file only (plus sign-in-only classes, Q10). Dark: charcoal page, chalk type, underline fields.
- Shows exactly `Email`, `Password`, the submit button and the `Create an account` link (Q4: plus the heading;
  an error line only after a failed attempt). Create-account mode mirrors it with a `Sign in` link. The
  invite-only note goes. The auth logic is unchanged.
- **Build (#73 kickoff, 2026-10-11):**

  | Part | Rule |
  |---|---|
  | Page | no white panel (`bg-paper text-ink` goes): the shell's charcoal `night` and chalk base type; one column, `max-w-md`, full width less the page padding on a phone; `color-scheme: dark` from the shell (`scheme-dark` on `<html>` and `<body>`) |
  | Heading (`h1`) | `Sign in` (`Create account` in create-account mode, as today); chalk, the site font, weight 400, ≤ 32 px, no caps |
  | Labels | `Email`, `Password`, visible, 12 px upper-case `dim` (7.2:1) |
  | Fields | underline only: no box, no fill, no radius, 1 px `rule` underline (5.1:1 against charcoal, ≥ 3:1 for a UI part), chalk text, 44 px tall; focused: chalk underline and a 2 px chalk ring; a browser-autofilled field stays charcoal with chalk text (no light autofill fill) |
  | Submit | chalk fill, night text (Q6, 14.2:1), 48 px tall, no radius; `Please wait…` on a `dim` fill while busy |
  | Link | `Create an account` (`Sign in` in create-account mode), 14 px chalk, underlined, a 2 px chalk focus ring, ≥ 44 px tap height; it switches the mode in place as today (a `button`, no route) |
  | Error | after a failed attempt only, `role="alert"`, `alert` `#ff8f87` (Q8, 7.3:1), 13 px |
  | Auth off | the existing line `Sign-in is not configured on this deployment.` in `dim` replaces the form (deployment state, not an instruction; unchanged text) |

  Classes (sign-in only, Q10): `.signin`, `.signin-title`, `.signin-label`, `.signin-field`, `.signin-button`,
  `.signin-switch`, `.signin-error`, `.signin-note`. The shared `.field` / `.kicker` / `.section` and the
  `.calc-*` / `.home-*` classes don't change. No painting, no other copy.

## 10. What the code has today (for #70)

- **Chart:** two charts (`PlanChart` in `src/components/desk.tsx`), one per plan, each a recharts `LineChart`
  with **one series**: DCA NLV in `--color-dca` `#2b5945` and lump-sum NLV in `--color-ink`, each on its own
  y-axis, with a caption line per chart and the note `Each plan has its own scale, so the two charts are not
  drawn to the same height.` So: two series in total, across two charts. The dark default keeps the DCA series
  only (2.0:1 for `#2b5945` on charcoal, below 3:1, hence the new green).
- **Results:** the `result-summary` line, a plan comparison `<table>` (8 metric rows × Lump sum / DCA, sticky
  white label column, swipe hint and dots on phone), a per-name `<table>` (Name, Weight, Last, Lump sum shares,
  DCA shares), then the method paragraph (`Prices are raw daily closes. …`, plus run-specific lines).
- **Fields:** already underline-only (`.field`: no border, 1 px ink underline, transparent), shared with the
  dashboard and sign-in.

## 11. Acceptance (ST rows; QA at phone 400 × 860, 1024 × 800 and 1440 × 900, plus 360 × 780 for the calculator's and home's phone rows)

Each row is checked on the PR preview at 400, 1024 and 1440 (the calculator's and home's phone rows also at 360), then on production after the merge. "Shipped page" =
`/calculator` (from #70), `/` (from #69), `/dashboard/sign-in` (from #73). ST2 (hover) is retired: the dark brief
has no hover rule.

**ST0: tokens and the decision**

| ID | Pass when |
|---|---|
| ST0-01 | On every shipped page the page, bar and footer backgrounds compute to `#1e2124` and body text to `#f2f0eb`; no white surface remains on a shipped page (only the hero image itself is light). |
| ST0-02 | Shipped pages use only the section 5 tokens; the green `#5cc08a` appears only on the chart line, the chart fill and the last-value pill; the font is Schibsted Grotesk. |
| ST0-03 | Every text / token pair on a shipped page meets AA on dark (section 5 table: text ≥ 4.5:1, large text and non-text UI such as underlines, focus ring, chart line and pill ≥ 3:1); an axe-core run reports no `color-contrast` violation. |
| ST0-04 | Docs: the decision log records that white was proposed on 2026-10-05 and dropped at 21:26 ET, and that the #53 dark style stands and is extended; no doc says white supersedes dark. (#67) |
| ST0-05 | `/dashboard` content is untouched: only the bar and footer differ from `main`; holdings, chips, book, their styles and data render as before; released and visible; signed-out `/dashboard` still 307s to sign-in; no diff in `src/routes/dashboard.tsx`, `src/components/dashboard/*`, existing token values or `.field` / `.kicker` / `.section`; `qa/tools/dashboard-redesign.mjs --read-only` still passes. "Only the bar and footer differ" is checked by a screenshot compare of the main content (the dashboard's `bg-paper` wrapper, bar and footer hidden) **signed in** against the **base PR's preview** (the PR this one is stacked on; `main`'s preview for a PR on `main`) with the same QA account (`QA_EMAIL` / `QA_PASSWORD`): `qa/tools/site-shell.mjs --base-url <this preview> --compare-url <base PR preview>`, pixel-identical. Never against production: production has no sign-in for QA (EL N7, QA round 1 on #70). |

**ST1: bar and footer on every page (#68)**

| ID | Pass when |
|---|---|
| ST1-01 | On every page (`/`, `/calculator`, `/dashboard`, `/dashboard/sign-in`, a 404) one thin charcoal bar (height ≤ 48 px), sticky on scroll: `Orpheus` left (→ `/`), `Calculator` and `Dashboard` right (→ `/calculator`, `/dashboard`), in that order, no other items, no dropdowns; at 360 and 400 px all three fit on one line with no horizontal page scroll. |
| ST1-02 | The current page's item has `aria-current="page"` and a visible mark (chalk and underline; the others dim): exactly one item on `/` (Orpheus), `/calculator`, `/dashboard` and `/dashboard/sign-in` (Dashboard); none on a 404. |
| ST1-03 | On every page the footer is charcoal and its only text is exactly `Orpheus Wisdom`. |
| ST1-04 | One bar component and one footer component serve every page (same markup on `/dashboard` as elsewhere); plain links, so every page reaches every other in one click and `/dashboard` stays server-gated. |
| ST1-05 | (#84) The lyre mark: on every page the bar's `Orpheus` link starts with the inline lyre SVG (20 × 20 px, chalk via `currentColor`, `aria-hidden`), the link text stays exactly `Orpheus`, the bar stays 45 px and the link ≥ 44 px tall; `/favicon.svg` is the lyre (no two-bar geometric mark left); the footer stays exactly `Orpheus Wisdom`. |

**ST3: home `/` (#69)**

| ID | Pass when |
|---|---|
| ST3-01 | Charcoal page in the dark shell; under the bar the Jordaens band (*Triumph of Frederick Henry, Prince of Orange*, 1652), `alt` naming it, no visible credit (Q5); source and licence recorded in the repo (`public/hero/home-SOURCE.md`); optimised (`srcset`, AVIF or WebP + JPEG; every file ≤ 300 KB and the largest file served at 1440 px on a 2x screen ≤ 300 KB), served from the app, explicit `width` and `height`. Layout shift measured as ST4-01 (`PerformanceObserver`, every entry counted, cold cache-disabled loads, several runs per width at 360, 400, 1024 and 1440): CLS from the hero = 0 and the page total = 0 (strict, since #72's self-hosted font) on every run. |
| ST3-02 | `01` (small) and the `h1` `Investment driven by research.` sit lower left on the soft wash in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone; sizes in section 8); chalk on the wash ≥ 4.5:1 at the worst pixel. At 360, 400, 1024 and 1440 the prince and the horses are not covered by the text or the wash (with its soft edge). Protected: the prince and the four white chariot horses (with the dark head behind the leftmost); the brown horse on the far right is outside the box and may be partly cropped on phones (EL, 2026-10-10): their region is the figure box per crop in `src/lib/site/home-hero.ts` through the crop and `object-position`, checked by geometry and by a screenshot with both boxes outlined. |
| ST3-03 | `02` `Platforms` follows with exactly the two lines of section 4 (`Calculator` · `Dollar-cost average calculator.` · `Open` → `/calculator`; `Dashboard` · `The portfolio as a business: fundamentals for each name, and the whole.` · `Open` → `/dashboard`); nothing else between the bar and the footer (no #46 line, no cards). |
| ST3-04 | Home does no calculating (no price requests, no calculator code) and `/?query` still redirects to `/calculator?query`; `noindex` meta and `X-Robots-Tag: noindex, nofollow` unchanged. |
| ST3-05 | The wash box fully contains the bounding boxes of `01` and the title (element and text-line rects) at 360, 400, 1024 and 1440; it hugs the text, anchored lower left (≤ 12 px of padding a side on a phone, ≤ 24 px wide), and takes at most 50% of the band's height at 360 and 400 (as ST4-15). |
| ST3-06 | Phone (360 and 400; phone rules below 1024 px): the phone crop in its band, `min(66.667vw, 480px)`: 240 px at 360, 267 px at 400 (Q17; the ≤ 200 px cap is calculator-only), the title three lines, the Platforms lines one column (name and `Open` on a row, the description under them), every text whole, no horizontal page scroll; the bar's three items on one line (ST1-01). Wide (1024, 1440): the wide crop, each Platforms line one row. |
| ST3-07 | AA on dark for every text on `/` (`01`, title, `02`, `Platforms`, names, descriptions, `Open`; the focus ring ≥ 3:1); an axe-core run reports no `color-contrast` violation; `color-scheme: dark` on `<html>` and `<body>`. |

**ST4: calculator `/calculator` (#70)**

| ID | Pass when |
|---|---|
| ST4-01 | Charcoal page in the dark shell; under the bar the Botticelli band (*The Birth of Venus*), `alt` naming it; source and licence recorded in the repo; optimised (`srcset`, AVIF or WebP + JPEG; the largest file served at 1440 px on a 2x screen ≤ 300 KB), served from the app, explicit `width` and `height`. Layout shift (EL, QA round 1 on #70): measured with a `PerformanceObserver` (`layout-shift`, buffered) on load, **every entry counted** (no `hadRecentInput` exclusion), on cold loads with the cache disabled, several runs per width at 360, 400, 1024 and 1440: CLS from the hero (entries with a source inside the band) = 0, and the page total = 0 (strict) on every run (#72: self-hosted font, Q16). |
| ST4-02 | `01` (small) and the `h1` `Dollar-cost average calculator.` sit lower left on the soft wash, in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone; `01` 12 px; sizes in section 7); chalk on the wash ≥ 4.5:1 at the worst pixel. |
| ST4-03 | The fields (tickers with weights, start, end, starting capital, contribution, weekly or monthly) are borderless with a thin underline only (no box border, fill or radius; a 1 px rule `#8b9298` underline, 5.1:1), with visible labels and a visible focus ring (2 px solid chalk, offset 2 px). The select and its `<option>`s carry charcoal `#1e2124` with chalk text (≥ 4.5:1; the page's own colour, so still no visible fill), so the list Chrome opens is dark and readable; `color-scheme: dark` on `<html>` (and `<body>`), so date pickers are dark too (QA round 1, D2). |
| ST4-04 | `US, EU and CA listings, one currency per basket.` (wording unchanged) is one line at 13 px in dim (no wrap at 360 or 400 px, nothing clipped) directly under the form; no other note there (Q2, A11). |
| ST4-05 | One chart with one series (the DCA portfolio value): a green line (2 px), a soft green fill (green at 16%) and the last value in a small green pill (22 px tall, night text on green, same money format as the results); no second chart and no chart note. |
| ST4-06 | (#78) Results are two plan columns, `Lump sum` and `DCA`, each with **exactly four lines** in this order, labels word for word: `Final value` (end value), `Total invested`, `Return (%)` (total return), `CAGR (%)` (the existing CAGR); no money-weighted return, max drop, value at the drop or return to the drop shown; no boxes, no borders around them, no `<table>` (Q12); the regression case shows DCA `Total invested` `$313,000` and each value equals the engine's figure in the results' money / percent format (display only). |
| ST4-07 | No instruction text: the intro paragraph, the swipe hint and the chart scale note are gone (Q2, Q12). |
| ST4-08 | Phone (360 and 400; phone rules below 1024 px): the fields stack, one under another (wide: ST4-18); the field rows span the full width, a basket row's ticker above its weight with the remove control beside the ticker (Q15, A2); the listings note is still one line under the form. |
| ST4-09 | Phone (360 and 400): the chart is full width (the content column's full width, same edges as the fields), with the green line, the soft fill and the pill unclipped. |
| ST4-10 | Results columns (EL A1 / A9; #78): `Lump sum` and `DCA` side by side while each column is ≥ 150 px wide, stacked (Lump sum above DCA) otherwise; expected and checked: two columns at 360 and 400 (and wide). In each column the four lines in order; on a phone each label above its value, from 1024 px label and value on one row; every value whole on one line (`nowrap`), inside its column, nothing clipped, no horizontal scroll. |
| ST4-11 | Phone (360 and 400): the painting is a short band (≤ 200 px tall), with `01` and the title lower left on the wash and Venus visible. |
| ST4-12 | Phone otherwise the same as wide: dark page, Botticelli hero, borderless underlines, green line, fill and pill, label-value results (ST4-01..07 hold at 360 and 400); the wide page (1024, 1440) as ST4-18; no horizontal page scroll at 360, 400, 1024 or 1440. |
| ST4-13 | Logic untouched: `qa/tools/site.mjs` passes (`$313,000`; VOD.L 400 with the exact message, read from under the VOD.L ticker field since #78; it may only change how it finds the value); DCA-01..06 pass; no diff in `src/lib/dca/*` or `src/routes/api/chart.ts`. |
| ST4-14 | (EL A3) At 360, 400, 1024 and 1440 the `01` / title block and its wash (with its soft edge) don't overlap Venus; her region is defined by the crop and `object-position` (the figure box per crop in `src/lib/site/hero.ts`); checked by geometry and by a screenshot with both boxes outlined. |
| ST4-15 | (EL A4) The wash box fully contains the bounding boxes of `01` and the title (element and text-line rects), checked by bounding rect plus screenshot, at 360, 400, 1024 and 1440. (EL N4, QA round 1) The wash hugs the text, anchored lower left (≤ 12 px of padding a side on a phone, ≤ 24 px wide), and takes at most 50% of the band's height at 360 and 400. |
| ST4-16 | (Q6) The primary button `Compare plans` is a chalk fill with night text (14.2:1), radius 0, the section 7 size, a chalk focus ring; while reading prices a dim fill with night text (7.2:1); not green. |
| ST4-17 | (#78) Field checks before the calculation, at 360 and 1440: each case's message (section 4 copy, word for word) sits directly under its field in `#ff8f87` 13 px, the field `aria-invalid` and described by it; every bad field marked at once; no field cleared (each keeps what was typed). Cases: empty basket → `Add a ticker.`; a ticker without a weight → `Enter a weight above 0.`; the same ticker twice → `<T> is already in the basket.` under the second; start or end blank → `Add a start date.` / `Add an end date.`; end on or before start → `End must be after the start.`; starting capital or contribution as text, negative, 0 or blank → `Enter a number above 0.` (decision A: above zero, the engine refuses 0); frequency blank → `Choose weekly or monthly.`; none of these sends a price request. After the prices: VOD.L → `VOD.L lists on LSE. US, EU, and CA listings only.` under VOD.L (HTTP 400); a basket mixing currencies → `<T> trades in <CUR>; this basket is in <CUR>. One currency per basket.` under the other ticker; no result shown. A valid run afterwards shows no field message. |
| ST4-18 | (#78) Wide (1024 and 1440): one column; the basket's ticker / weight / remove rows stacked (≤ 26rem wide); Start, End, Starting capital, Contribution and Frequency in **one row** (same top, left to right), `Compare plans` under them; the listings note one line under the form; the result (chart, then the two plan columns) below the form at full width (same left and right edges as the window row). |
| ST4-19 | (#80) `Saved searches` is a button (`aria-expanded`, `aria-controls`), the form's first control, above `02` Basket and the first Ticker, in the site font with the chalk focus ring; **always visible**, even with nothing saved (EL, Q20); **closed by default** on every load (the panel not rendered or hidden); it opens and closes the panel; at 360, 400, 1024 and 1440. |
| ST4-20 | (#80) Open: newest first, at most 5 lines, each exactly `<TICKERS> · <start> – <end> · DCA <amount>` (section 4) with the search's own contribution (EL, Q19; no `weekly` / `monthly` on the line), then `Load`; each line underlined by a 1 px `#8b9298` rule across the form's full width; empty: `No saved searches yet.` `Load` fills every field (basket rows, tickers, weights, start, end, starting capital, contribution, frequency) word for word as typed for that search (`1,000` stays `1,000`; EL, D1 follow-up), clears field marks and any result, closes the panel, sends no request. No other save control anywhere on the page. |
| ST4-21 | (#80) Saved automatically by a successful calculation only (a field-check or listing refusal saves nothing); the same search again moves to the top (no duplicate line; QA D1 on #81: repeats match on the standard form, tickers trimmed and upper-cased, weights and amounts with commas dropped and read as numbers, so `1,000` and `1000`, `ko` and `KO` are the same search; the list keeps one line, the newest as typed); six different searches leave the newest 5 (the oldest dropped); the `$313,000` regression case still reads `$313,000` and is saved like any search. |
| ST4-22 | (#80) Refresh on the same browser: the fields hold the last search, the list (closed) holds the same ≤ 5 lines; no result until `Compare plans`; calculating keeps the search in the fields. The restore moves nothing in the hero (hero CLS 0); the page shift from extra basket rows is measured and reported and stays under 0.1 (EL, Q18: accepted; the form is not hidden until the restore, the restore is not tap-only). |
| ST4-23 | (#80) No auth, this browser only: signed out with no account, no request to `/api/auth/*` or `/api/dashboard/*` while saving, loading or restoring (only `GET /api/chart` on a calculation); exactly two `localStorage` keys, `orpheus.calculator.last.v1` and `orpheus.calculator.saved.v1`; no cookie set, nothing in `sessionStorage` or IndexedDB from the calculator; the analytics rules unchanged. |
| ST4-24 | (#80) Isolation and clearing: a second browser context (another device) on the same preview sees no list and blank fields; clearing the site's data (`localStorage` cleared, e.g. DevTools "Clear site data" / `Storage.clearDataForOrigin`) and reloading shows `No saved searches yet.` and blank fields. |

**ST5a: dashboard content (#71): ON HOLD, deferred**

| ID | Pass when |
|---|---|
| ST5a-01 | *(deferred)* Rewritten from the dashboard's new brief when it lands (via CoS). Not checked in this epic; until then ST0-05 applies. |

**ST5b: sign-in `/dashboard/sign-in` (#73)**

| ID | Pass when |
|---|---|
| ST5b-01 | Dark: charcoal page, chalk type, underline fields (as ST4-03) using sign-in-only classes; `.field` and `.kicker` unchanged. |
| ST5b-02 | The page shows exactly `Email`, `Password`, the submit button and the `Create an account` link, plus the heading (Q4) and an error line only after a failed attempt; the invite-only note is gone. Create-account mode mirrors it with a `Sign in` link. |
| ST5b-03 | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix in `scripts/release-smoke.mjs`. |
| ST5b-04 | AA on dark at 360, 400, 1024 and 1440: every visible text ≥ 4.5:1 (labels `dim` 7.2:1, submit night on chalk 14.2:1, the error `#ff8f87` 7.3:1); the field underline (`rule`, 5.1:1) and the chalk focus ring ≥ 3:1; `color-scheme: dark` on `<html>` and `<body>`; an autofilled field stays charcoal with chalk text. |
| ST5b-05 | Layout and page rules at 360, 400, 1024 and 1440: no horizontal scroll; fields, submit and link ≥ 44 px tall, the fields the column's full width; title `Sign in · Orpheus Wisdom`, noindex meta and `X-Robots-Tag` unchanged; the shell holds (ST1); no painting or CSS background image. |

**ST6: leave-outs, contrast and regression (#72, shipped pages)**

| ID | Pass when |
|---|---|
| ST6-01 | No painting except the Jordaens on home and the Botticelli on the calculator (no artwork `img`, `picture` or CSS `background-image` on sign-in or elsewhere). |
| ST6-02 | No instruction text on the shipped pages: home only hero and Platforms; the calculator only hero, form, note, chart and results (Q2, Q12); sign-in only ST5b-02; the 404 only `Page not found.` |
| ST6-03 | AA on dark on every shipped page (and the 404) at every width, including focus, error and disabled-but-readable states (ST0-03). |
| ST6-04 | The shell holds everywhere: ST1 passes on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` and a 404; ST0-05 passes. |
| ST6-05 | Regression on the preview, then production, at 400 / 1024 / 1440: every ST row except ST5a, DCA-01..06 (`$313,000`), noindex meta + `X-Robots-Tag` on every page, the analytics rules, `release-smoke.mjs`; `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. Runner: `qa/tools/site-style-regression.mjs` (runs every shipped-page tool and the ST6 checks; `--compare-url` for ST0-05 signed in). The dashboard's full regression waits for its new brief. |
| ST6-06 | Self-hosted font (Q16): no request to `fonts.googleapis.com` / `fonts.gstatic.com` on any page; Schibsted Grotesk served from the app (`/fonts/schibsted-grotesk/`, licence and source in the repo), the upright latin file preloaded, `font-display: optional`; the page CLS is a strict 0 on `/`, `/calculator`, `/dashboard/sign-in` and a 404 at 360, 400, 1024 and 1440 on cold loads, every shift counted (EL: a slow first visit may keep the fallback for that view; never a swap that adds CLS). |
| ST6-07 | Punctuation: on the dark pages no text runs with `tnum` (the body sets `zero` only; no `tabular-nums` in the dark pages' classes), so `.` `,` `:` `;` take their normal widths (`research.`, `business:` with no gap); figures stay proportional, result values included (EL: no `tabular-nums` back on); `/dashboard` keeps `main`'s setting. |
| ST6-08 | Bar tap targets (QA N1 on #73): `Orpheus`, `Calculator` and `Dashboard` each ≥ 44 px tall (and ≥ 44 px wide) on every page at 360, 400, 1024 and 1440, the bar still ≤ 48 px (45 px), the text, underline and current mark where they were. |
| ST6-09 | The 404 is dark (charcoal, chalk, the shell's bar with no current item and footer), status 404, and shows only the `h1` `Page not found.` in the content column; the dashboard-off paths serve the same page. |

## 12. Questions for EL (#67, dark defaults)

Each has a default; the tickets follow the default unless EL says otherwise. Earlier answers are void where they
assumed white.

- **Q0. Spec location.** Keep `attachments/site-style-spec.md` as the epic's spec, with short pointers in the two
  older specs? (Default: yes.)
- **Q2. Dividends rule (DCA-01) vs no extra instructions.** Default: the listings note stays the single line
  under the form. If DCA-01 needs the rule stated, it joins that line only if it still fits on one line at 360 px
  (e.g. `US, EU and CA listings, one currency per basket. Dividends reinvested.`); otherwise it is a short caption
  under the results, never a paragraph.
- **Q4. Sign-in.** Default: keep the `Sign in` heading and the submit button; the link reads `Create an account`
  (today `New here? Create an account`); the invite-only note goes.
- **Q5. Hero credit.** Default: no visible credit on either painting; the `alt` names the painting; source and
  licence live in the repo.
- **Q6. Buttons on dark.** Default: the primary button (`Compare plans`, sign-in submit) is a chalk fill with
  night text (14.2:1); not green, which stays for the chart.
- **Q8. Error colour on dark.** Default: `#ff8f87` (7.3:1 on charcoal) for the calculator's error line and, in
  #73, sign-in errors.
- **Q10. Shared classes.** Default: the calculator (#70) and sign-in (#73) get their own field / label classes;
  the shared `.field` and `.kicker` (used by the dashboard) are not touched.
- **Q11. Home copy (new).** `main`'s home is still the #46 line and two cards; the Jordaens hero, `Investment
  driven by research.` and the Platforms lines exist only in the approved briefs. Default: #69 builds them with
  the section 4 copy, including `01` on the hero and `02` `Platforms`.
- **Q12. Calculator results and notes (new).** Default: results are only the two label-value groups; the
  per-name table, the `result-summary` line and the swipe hint go; the method paragraph keeps only its
  run-specific single lines (`Weights summed to … and were scaled to 100.`, `N contribution dates had no later
  session.`) as captions, and the fixed `Prices are raw daily closes. …` sentence goes. Or keep any of these?
  **Decided (EL, QA round 1 on #70, N1):** the per-name table, the summary line and the swipe hint go; the fixed
  method sentence stays, word for word, as one muted caption under the results next to `Dividends reinvested.`
  (`Prices are raw daily closes. Lump sum starts on the first session every name has a price. A contribution
  date with no session goes in at the next session's close.`). It is method text, not an instruction (ST4-07 /
  ST6-02 don't apply to it); the run-specific lines follow it.
- **Q13. `/dashboard` page background (new).** The dashboard content sits in its own white wrapper. Default: on
  `/dashboard` #68 changes the bar and footer only, and the page background around the content stays as on
  `main` (white), so nothing but the shell changes. Or should the area outside the content go charcoal too?
- **Q14. Weights (new).** The brief's field list says "tickers"; each basket row also has a weight (DCA-04).
  Default: the weight fields stay, styled the same.
- **Q15. Basket rows on a phone (new).** "The fields stack, one under another." Default: literally, so each
  basket row's ticker sits above its weight (with the row's remove button beside the ticker). Or keep ticker and
  weight side by side on one line?

- **Q16. Web-font swap and CLS (new, from #70).** The shell loads Schibsted Grotesk from Google Fonts with
  `display=swap` (since #46). On load the fallback text is re-rendered in the web font, which moves text glyphs
  and the right-aligned bar links by a few px: measured CLS 0.0005 at 1024 and ≈ 0.00002 at 1440 (0 on phones),
  cold and warm. The hero itself causes no shift (its band is sized by CSS). Default: accept the font swap (QA
  checks the hero causes 0 and the page stays < 0.001). Exact 0 needs a shell change on every page (self-hosted
  font with a preload and `font-display: optional`, or metric-matched fallback overrides). Which?
  **Decided (EL, QA round 1 on #70):** QA then measured 0.0036 at 360 and 0.0028 at 400 with every shift counted
  (the swap resized the wash and moved it 24 px). #70 makes the hero font-independent (fixed title box) and adds
  a size-adjusted local fallback (section 7), so the hero causes 0 and the page stays < 0.001 (ST4-01).
  **Done in #72:** Schibsted Grotesk is self-hosted (section 6, Font), preloaded and `font-display: optional`,
  with the size-adjusted fallback kept; no request goes to `fonts.googleapis.com` / `fonts.gstatic.com`, and the
  page CLS is a strict 0 (ST3-01, ST4-01, ST6-06).
  **Decided (EL, #72 answers):** `font-display: optional` and the strict 0 are the point of Q16. A slow first visit
  may stay in the fallback for that one page view; never swap the font in a way that brings the CLS above 0.

- **Q17. Home band on a phone (new, from #69).** Section 8 gives home the calculator's image rules but no phone
  height; the calculator's "short band, ≤ 200 px" is section 7a, approved for the calculator only. Default (as
  built): a 3:2 crop at `min(66.667vw, 480px)` (240 px at 360, 267 at 400), so the prince and all four horses
  fit whole beside the text. Or the calculator's ≤ 200 px band (the horses then cut at the knees)?
  **Decided (EL, 2026-10-10, ≈ 22:17 ET):** keep the built band, `min(66.667vw, 480px)`: 240 px at 360, 267 px
  at 400 (not a flat 240 at both). The ≤ 200 px cap stays calculator-only (section 7a).
- **Q18. Restore shift on a refresh (new, from #80).** The server can't read `localStorage`, so a refresh that
  restores a basket of more than one name adds the extra rows after load: the hero never moves (CLS 0), but the
  form below shifts. Measured on the local build (PLTR / TQQQ restored): page CLS 0.029 at 360, 0.037 at 400,
  0.010 at 1024, 0.006 at 1440 (a one-name restore: 0). ST4-01's cold loads are unchanged (no stored search).
  Default (as built): accept it (under the Web Vitals "good" 0.1) and report it in ST4-22. Or hold the form
  until the restore (a blank form flash instead), or restore only on the user's tap?
  **Decided (EL, 2026-10-11, ≈ 09:29 ET): accept.** A multi-name restore with page CLS under 0.1 is fine. Don't
  hide the form until the restore; don't restore only on a tap. A refresh still fills the last search.
- **Q19. The saved line's amount (new, from #80).** The issue's line reads `tickers · dates · DCA amount $100`.
  Default (as built): `$100` is the example; each line shows the search's own contribution in the results'
  money format (`DCA $1,000`, `DCA $100`), without the frequency or the weights. Or add `weekly` / `monthly`?
  **Decided (EL, 2026-10-11, ≈ 09:29 ET):** each line shows that search's own contribution (the `$100` was an
  example). Don't add `weekly` / `monthly` to the line.
- **Q20. Empty list (new, from #80).** Default (as built): with nothing saved, the open panel shows one dim line
  `No saved searches yet.` (a status, not an instruction). Or show the button only once a search exists?
  **Decided (EL, 2026-10-11, ≈ 09:29 ET):** the button is always visible, closed by default; the empty list
  reads `No saved searches yet.` Don't hide the button until a search exists.

## 13. Landed

- **#68, dark shell (PR #75, stacked on #74; 2026-10-05).** New tokens `night` / `chalk` / `dim` / `rule` /
  `hair` / `green` / `alert` in `src/styles.css` next to the old ones (no existing value changed). `SiteMenu`:
  charcoal bar with a `hair` bottom line, `Orpheus` in chalk on the left, `Calculator` / `Dashboard` in dim on the
  right, the current page chalk + underline (keyed on `aria-current`), a chalk focus ring, no hover rule; one
  markup on every page. `SiteFooter`: charcoal band, `Orpheus Wisdom` in dim. `__root.tsx` puts `bg-night
  text-chalk` on `<body>` for every page except `/dashboard` (`shellPage()` / `shellBodyClass()` in
  `src/lib/site/site.ts`; exact path, so `/dashboard/sign-in` and the 404 are dark; Q13 default). The content
  that sits in its own white panel today (the calculator below its header band, the sign-in form, the home
  cards) pins `text-ink` on that panel so it renders exactly as on `main` until #70 / #73 / #69 convert it.
  Defaults used (EL hasn't answered): Q6, Q8 and Q10 are recorded but not exercised yet (no button, error or
  field on a dark surface in #68); Q13 as written.
  - Looks off until the page's own ticket (by design, not restyled here): the calculator's charcoal header
    band now runs straight into the bar and page (#70 replaces it with the Botticelli hero); on short pages a
    charcoal gap sits between the white panel and the footer (sign-in, the calculator before a result; #73,
    #70); home shows the #46 line in chalk over the page with the two white cards (#69); the 404 is the
    router's bare `Not Found` at the top left, now chalk on charcoal (unchanged content; no ticket owns it yet).
  - Checks: `src/components/site.dom.test.tsx` (menu on every route: current item, classes, one markup;
    footer), `src/lib/site/site.test.ts` (`shellPage`, token values, AA ratios), `qa/tools/site-shell.mjs`
    (ST0 / ST1 at 360 / 400 / 1024 / 1440; signed in for `/dashboard` with `QA_EMAIL` / `QA_PASSWORD`;
    `--compare-url` pixel-diffs the content panels against a build of the base branch on the same data, which
    is how ST0-05 "dashboard content unchanged" was shown locally).
- **#70, calculator (PR #76, stacked on #75; 2026-10-05).** Built to sections 7 / 7a with EL's accepted defaults
  and amendments A1 / A9, A2, A3, A4, A11 (decision log). The page has no white panel: the Botticelli band
  (`public/hero/`, source and licence in `public/hero/calculator-SOURCE.md`: Wikimedia Commons, Google Art
  Project "edited" file, public domain, PD-Art / PD-old-100-expired, checked 2026-10-05), two crops (phone 2:1
  below 1024 px, wide ≈ 4.1:1 from 1024 px), AVIF / WebP / JPEG `srcset`s with `width` / `height`, the band sized
  by CSS; `01` and the title in the wash lower left; the calculator's own classes (`.calc-*`, sizes in section 7);
  the listings note one line under the form (A11: 302 px of the 320 px column at 360, wording unchanged); one
  chart, one series; label-value results per A1 / A9 (two columns at 360 and 400); captions `Dividends
  reinvested.` (Q2: it doesn't fit on the listings line at 360 px, so it is the short caption under the results;
  DCA-01) plus the run-specific lines; error `#ff8f87`; `color-scheme: dark` on the dark shell. Removed: the
  intro paragraph, the per-name table, the `result-summary` line, the plan table with its swipe hint, dots and
  fade, the lump-sum chart, the scale note, the fixed `Prices are raw daily closes…` sentence and the two field
  hints. **Q12 outcome:** no DCA rule (DCA-01..06) or acceptance row requires the per-name figures, the summary
  line or the swipe hint (`attachments/dca-app-spec.md` "Output" describes the old presentation that this brief
  replaces, not a rule); they go. Logic files untouched; `$313,000` unchanged.
  - Checks: `src/components/calculator/calculator.dom.test.tsx`, `src/lib/site/site.test.ts` (hero files,
    `scheme-dark`), `qa/tools/calculator-page.mjs` (ST4-01..16 at 360 / 400 / 1024 / 1440, ST0-01..03 on the page,
    Q8, before and after the regression run), `qa/tools/site.mjs` (`$313,000` from the label-value rows).
  - **QA round 1 (2026-10-05, ≈ 23:00 ET; EL's decisions in the decision log).** D1: the hero title in a fixed
    em box (one text node, 18 px × three lines on a phone, 40 / 44 px × two lines wide) and a hugging wash, plus
    the size-adjusted `Schibsted Grotesk Fallback`; `calculator-page.mjs` counts every layout shift on cold,
    cache-disabled loads (three per width). D2: `color-scheme: dark` on `<html>` (`shellHtmlClass()`), charcoal
    and chalk on selects and options through the shell. D3: `Max drop`'s date on its own muted line in the value
    cell (out of flow, so the figure always fits beside the label; the ` · ` stays in the text). N1: the method
    sentence back as a caption (Q12). N4: wash 87.4 px (49% of the band at 360, 44% at 400). N7: ST0-05 against
    the base PR's preview, signed in. Q16 decided; #72 (self-hosted fonts) PLANNED.
- **#69, home (2026-10-10).** Built to section 8 with the #69 kickoff rows (decision log; ST3-01..07). The #46
  line and the two cards are gone: the Jordaens band (`public/hero/frederick-*`, source and licence in
  `public/hero/home-SOURCE.md`: Wikimedia Commons, from the RKD (249278), public domain, `PD-old-100` and the
  Public Domain Mark, checked on the Commons API 2026-10-10), two crops (phone 3:2 below 1024 px, wide 2.4:1
  from 1024 px), AVIF / WebP / JPEG `srcset`s with `width` / `height`, the band sized by CSS; `01` and the title
  in a hugging wash lower left, the title in a fixed em box (16 px on a phone, 40 / 44 px wide; three lines),
  left of the prince and the horses at every width; then `02` `Platforms` and the two lines, each `Open` a link
  (`aria-describedby` names the platform). Home's own classes (`.home-*`); the calculator's untouched. Q17 closed (EL):
  the phone band stays `min(66.667vw, 480px)`, 240 px at 360 and 267 px at 400. The redirect (`/?query` → `/calculator?query`), `noindex` and the analytics are
  unchanged.
  - Checks: `src/components/site.dom.test.tsx` (home), `src/lib/site/site.test.ts` (home hero files, copy),
    `qa/tools/home-page.mjs` (ST3-01..07 at 360 / 400 / 1024 / 1440, ST0-01..03 on the page),
    `qa/tools/site.mjs` and `scripts/release-smoke.mjs` (the two `Open` links), `qa/tools/site-shell.mjs` (ST1;
    `/` no longer has a white panel to compare).
  - **EL answers (2026-10-10, ≈ 22:17 ET; docs-only commit, no code change):** Q17 closed, keep the built band
    (`min(66.667vw, 480px)`: 240 px at 360, 267 px at 400); the protected figure confirmed (the prince and the four
    white chariot horses, with the dark head behind the leftmost; the brown horse may be partly cropped on
    phones); #72 owns the `tnum` spaced punctuation (a shell fix on every page) and the calculator band's
    `w-full` fix above ≈ 1886 px (#70 not touched).
- **#78, calculator polish (2026-10-11).** Built to the #78 decisions (decision log): results as two plan columns
  with exactly four lines each (`Final value`, `Total invested`, `Return (%)`, `CAGR (%)`; mapping in
  `src/lib/site/result-lines.ts`, display only, `src/lib/dca/*` untouched); field checks under each field
  (section 4 copy; `src/lib/site/field-checks.ts`, pure), the venue and currency checks after the prices are read;
  wide one column with the window fields in one row and the results below the form. Checks:
  `src/lib/site/field-checks.test.ts`, `src/components/calculator/calculator.dom.test.tsx`,
  `qa/tools/calculator-page.mjs` (ST4-06, -10, -17, -18), `qa/tools/site.mjs` (`$313,000` from the DCA plan's
  `Total invested` line; VOD.L under its field).
- **#80, saved searches (2026-10-11).** Built to section 7b: `src/components/calculator/saved-searches.tsx`
  (button and panel), `src/lib/site/saved-searches.ts` (pure: the two `localStorage` keys, read / write with
  guards, dedupe, cap 5, the line text). Saved on a successful calculation from `desk.tsx`; restored once after
  hydration. Checks: `src/lib/site/saved-searches.test.ts`, `calculator.dom.test.tsx`,
  `qa/tools/saved-searches.mjs` (ST4-19..24 at 360 / 400 / 1024 / 1440).
  - **EL answers (2026-10-11, ≈ 09:29 ET; docs-only commit, no code change):** Q18 accepted (multi-name restore
    page CLS under 0.1; measured on the preview 0.029 at 360, 0.037 at 400, 0.023 at 1024, 0.006 at 1440; the
    form isn't hidden and the restore isn't tap-only); Q19 each line shows the search's own contribution, no
    `weekly` / `monthly`; Q20 the button always visible, closed by default, the empty list `No saved searches
    yet.`
  - **QA D1 (2026-10-11):** a repeat typed differently (`1,000` vs `1000`) added a second, identical-looking line.
    Fixed: `normalizeSearch()` (tickers trimmed and upper-cased, weights and amounts canonical: commas dropped,
    read as numbers) is used only to match, so the existing line moves to the top. **EL follow-up (≈ 09:45 ET):**
    store what was typed: the search is kept as typed (the newest typing replaces the older line), so `Load` and a
    refresh refill `1,000` / `ko`; the line shows tickers upper-cased. Regression in `saved-searches.test.ts` and
    `saved-searches.mjs`.
- **#73, sign-in (2026-10-11).** Built to section 9: `src/routes/dashboard_.sign-in.tsx` drops its white panel and
  uses the sign-in-only classes in `src/styles.css` (`.signin*`); the auth calls, mode switch, redirect and
  `Sign-in is not configured` state are unchanged. QA: `qa/tools/signin-page.mjs` (ST5b-01..05 at 360 / 400 /
  1024 / 1440; one failed sign-in with a made-up address for the error line; never signs up).
- **#72, leave-outs and regression (2026-10-11).** Built to the #72 kickoff (decision log; ST6-01..09): the font is
  self-hosted (`public/fonts/schibsted-grotesk/`, Google Fonts' files verbatim, SIL OFL 1.1; `@font-face` in
  `src/styles.css` with `font-display: optional`, a preload in `__root.tsx`; the Google Fonts links are gone), so
  the page CLS is a strict 0 (ST3-01 / ST4-01 / ST6-06); `tnum` is off on the dark pages (`body.scheme-dark`), and
  the calculator's `tabular-nums` went with it (ST6-07); the bar links are 44 px tall hit areas in the unchanged
  45 px bar (ST6-08); the 404 shows `Page not found.` (`src/components/not-found.tsx`, ST6-09); the calculator band is
  `w-full` so it spans the page above ≈ 1886 px (owned by #72 since EL's #69 answers). QA:
  `qa/tools/site-style-regression.mjs`.
  - **EL answers (2026-10-11, ≈ 10:58 ET; docs-only commit, no code change):** font loading decided (`optional`,
    strict CLS 0; a slow first visit may keep the fallback for that view, never a swap that adds CLS); figures
    decided (proportional on the dark pages, no `tabular-nums` back on result values; `/dashboard` as on `main`);
    the 404 wording `Page not found.` decided.
- **#84, lyre mark (PR #88, with the Personal Finance page; built at `f067c84`, 2026-10-11).** ST1-05: the inline
  lyre (`src/components/lyre.tsx`, `aria-hidden`, 20 px, `currentColor`) first in the bar's `Orpheus` link on every
  page; `public/favicon.svg` the same lyre in chalk on charcoal (the two-bar mark is gone). Bar (45 px, three items,
  ≥ 44 px links) and footer unchanged. `/personal-finance` follows `attachments/personal-finance-spec.md` and is in
  the regression runner's page list.
  - **EL answers (2026-10-11, ≈ 12:05 ET; docs-only commit, no code change):** the page stays URL only (Q1 (d)):
    ST1-01 three bar items and ST3-03 home's two lines unchanged; `__grok/icon-180.png` untouched (Q4: Grok builder
    assets out of scope for #84). Q2 / Q3 in the personal-finance spec.
