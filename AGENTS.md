# AGENTS.md: harness for bots working in orpheus-app

This is the harness for any bot (SWE, QA, Triage, Engineering Lead, Nightly Audit) working in this repo.
Read it before you touch anything. Plain build conventions only; team process lives in the vault
(`Orpheus/kb/specs/TECH-TEAM.md`, `Orpheus/kb/specs/HARNESS.md`) and is summarized here where it
affects the repo.

## Source-of-truth rule (Diego, 2026-10-02)

**Always the harness, then the specs, then the work.**

- The harness (this `AGENTS.md`), the spec docs (`attachments/dca-app-spec.md` for the calculator;
  `attachments/dashboard-spec.md` for the signed-in dashboard, **approved by Diego 2026-10-02 for
  all decisions D1–D13**: D8, D9 and D12 were approved as recommended, and Amendment A
  (section 14) is decided as D13: $0, Yahoo primary, Neon cache, Alpha Vantage free fallback; its **section 0**
  is the source of truth for the epic #53 redesign, see below; `attachments/site-style-spec.md` for the site style,
  epic #66: the dark shell, the calculator, home and sign-in pages) and `README.md` are the source of truth for
  this app.
- Every feature PR updates `README.md`, the relevant spec and this harness **in the same PR**, or says
  in the PR body, for each of the three, why it did not change.
- QA fails a PR that skips this.

## Site style: dark, mobile first (epic #66). Read this before any styling work

*Harness for #67 (harness + specs), #68 (dark shell, every page), #70 (calculator), #69 (home), #73 (sign-in),
#72 (leave-outs and regression); #71 (dashboard content) is ON HOLD. Brief re-scoped by Diego via CoS and EL,
2026-10-05 21:26 ET.*

- **Source of truth:** `attachments/site-style-spec.md` (the dark brief verbatim, decision log, schedule, exact
  copy, tokens with measured contrast, shell / calculator / phone / home / sign-in rules, ST rows, questions).
  Harness first, then the spec, then the work; the spec beats chat. If they disagree, stop and ask EL.
- **Decision:** a white style was proposed on 2026-10-05 and **dropped at 21:26 ET; dark wins.** Nothing white
  gets merged. The #53 dark style stands and is extended (charcoal page, bar and footer, off-white type). Don't
  reintroduce white surfaces on shipped pages.
- **Loop:** one PR at a time: draft PR off the latest `main` ("Closes #N. Part of #66."), EL answers, QA on the
  preview, merge, prod check.
- **Order:** #67, #68, #70 (then #78, #80), #69, #73 landed; #72 (leave-outs, regression, self-hosted font,
  punctuation, bar tap targets, dark 404) is the last shipped-pages ticket. #71 dashboard: on hold (ST5a deferred).
- **Shell (#68) on every page:** restyle the one `SiteMenu` and one `SiteFooter` (charcoal, `Orpheus` left,
  `Calculator` and `Dashboard` right, current page marked; footer `Orpheus Wisdom`). **On `/dashboard` only the
  bar and footer may change:** don't touch `src/routes/dashboard.tsx`, `src/components/dashboard/*`, existing
  token values or the shared `.field` / `.kicker` / `.section` classes; the dashboard stays released and visible.
  Add new dark tokens next to the old ones (spec §5).
- **Calculator (#70):** Botticelli hero with `01` + `Dollar-cost average calculator.`, underline-only fields with
  their own class, listings note one line under the form, one green chart line + fill + last-value pill, Lump sum
  and DCA as two plan columns of exactly four lines each (`Final value`, `Total invested`, `Return (%)`,
  `CAGR (%)`; #78), field checks under each field (#78). Phone rules below 1024 px (spec §7a, checked at 360 and
  400): fields stack, chart full width, the two result columns side by side while each is ≥ 150 px, short painting
  band; wide from 1024 px (#78): one column, the window fields in one row, the results below the form at full
  width. Saved searches (#80, spec §7b): a `Saved searches` button above the basket, closed by default, the last
  5 calculated searches with `Load`, the last search restored on refresh; this browser's `localStorage` only.
  Logic files untouched; `$313,000` unchanged.
- **Sign-in (#73, spec §9, ST5b-01..05):** `/dashboard/sign-in` dark in the shared shell: drop the white
  `bg-paper text-ink` panel; heading, `Email`, `Password`, submit and the `Create an account` / `Sign in` mode
  switch only (the invite-only note goes); sign-in-only classes `.signin*` (Q10: never `.field` / `.kicker`);
  underline fields, chalk submit (Q6), `#ff8f87` errors (Q8), autofill stays dark. Only
  `src/routes/dashboard_.sign-in.tsx` and `src/styles.css` change; the auth calls, the mode switch, the redirect,
  the `Sign-in is not configured on this deployment.` state and everything under `src/lib/auth/*` stay as they
  are. QA: `qa/tools/signin-page.mjs`.
- **#72 (spec §6, ST6-01..09):** the font is self-hosted (`public/fonts/schibsted-grotesk/`, Google Fonts' files
  verbatim, SIL OFL 1.1, `SOURCE.md` + `OFL.txt`; `@font-face` in `src/styles.css`, `font-display: optional`, the
  upright latin file preloaded in `__root.tsx`); never add a Google Fonts link back, and keep the size-adjusted
  fallback (it is what shows when the font misses its window, so the page CLS stays a strict 0). `tnum` is off on
  dark pages (`body.scheme-dark`: it widens `# % , . : ;` in Schibsted); don't add `tabular-nums` to dark-page
  classes. `/dashboard` keeps `main`'s body `tnum` (ST0-05). Bar links are 44 px tall hit areas inside the 45 px
  bar. The 404 is `src/components/not-found.tsx` (`Page not found.`), the root route's `notFoundComponent`.
  QA runner: `qa/tools/site-style-regression.mjs` (every shipped-page tool + the ST6 checks).
- **Lyre mark (#84, ST1-05):** the bar's `Orpheus` link starts with an inline lyre SVG (`src/components/lyre.tsx`,
  decorative, `aria-hidden`); `public/favicon.svg` is the same lyre. Don't bring the two-bar mark back.
- **Personal Finance (#84 v1.1+):** `attachments/personal-finance-spec.md` (PF rows; business user the CFO) on top of
  every shell rule here. `/personal-finance`: Fixed and Variable expenses, manual entry only (no Plaid, no feeds).
  **Since #102 (spec section 16; Q24–Q31 open, simplest readings):** signed-in only (the route's `beforeLoad` asks
  `getPersonalFinanceViewer` (`src/lib/finance/gate.ts`, the dashboard's `dashboardViewer`, behind `DASHBOARD_ENABLED`);
  signed out → 307 to `/dashboard/sign-in?next=/personal-finance`, the only other `next` the sign-in page accepts);
  the five values live in the account (`personal_finance` table, `migrations/0010_personal_finance.sql`;
  `GET` / `PUT` / `DELETE /api/personal-finance`, `src/lib/finance/account.server.ts`, gate order 404 / 405 / 401 /
  403 / 400 / 413 / 503); the page loads the record once (`account-client.ts` → a `RecordStore` the page reads like
  `localStorage`) and PUTs the whole record 400 ms after a change (last write wins; failure → `Not saved.`). First
  signed-in visit with no record imports this browser's old `localStorage` keys, then removes them. **Every FX rate is
  foreign units per 1 household unit and household = amount ÷ rate** (#87's × superseded; v1 expense rates inverted
  once into `orpheus.finance.expenses.v2`). Each person has a `Foreign` box (Currency, `FX rate (BRL per 1 CAD)`,
  `Converted (yearly)`); income figures use the converted amount. No second auth system, no roles / account menu (#90).
  Before #102 (history): this browser's `localStorage` only (`orpheus.finance.expenses.v1`; no auth, no server write).
  v1.2 (#85): `02` Income above `03` Expenses (spec section 12): people (wages, bonus rating %, average tax %,
  net), Count wages / Count bonus and a Share % per person, an income table (biweekly = yearly ÷ 26); stored in
  `orpheus.finance.income.v1`; `% of income` = expense monthly ÷ counted net income monthly (`—` at 0).
  EL decided Q5–Q8 (as built): bonus rating = % of yearly wages; one average tax % per person on wages and bonus;
  one Share (%) per person on each counted line; biweekly = yearly ÷ 26. Landed #85 in PR #89 (draft, in QA).
  v1.3 (#86, spec section 13, EL option A): `Withdrawal rate (%)` and `Portfolio ROIC (%)` (household, typed) at
  the top of `03` Expenses; rate used = the typed withdrawal rate (never halved; wins when both are typed), else
  ROIC ÷ 2; calculated `Equity to cover` = yearly expense ÷ (rate ÷ 100) (`—` with no rate), shown as the field's
  placeholder; a typed value overrides it (Q3, implemented; v1.1 values carry over as overrides); totals add the
  override or the calculated amount; key `orpheus.finance.equity.v1` (`src/lib/finance/equity.ts`,
  `equity-rates.tsx`). Don't halve a typed withdrawal rate or divide a monthly amount by a yearly rate.
  EL Q9–Q11 (≈ 14:12 ET): a bad override falls back to the calculated amount; no usable rate → `—` for a line
  without a valid override and for any total containing it; ROIC 0 or more with no cap (withdrawal rate 0–100).
  Page-only classes `.pf-*`.
  First-class since #97 (Q1 (d) superseded): the bar's fourth item `Personal finance` (current on this page,
  ST1-01 / ST1-02) and the third home line (ST3-03); the URL still works. Bar text is 12 px below 640 px (Q21, EL-decided); since #90 (five items) 11 px through 399 px (EL).
  v1.4 (#87, spec section 14; Q12–Q16 decided by EL ≈ 16:26 ET): `Household currency` (one select above `02` Income,
  ten codes, default `CAD` (Q13, Diego); key `orpheus.finance.currency.v1`, `src/lib/finance/currency.ts`); each expense line
  has `Currency` and, when foreign, a typed `FX rate` = household units per 1 unit of the line's currency
  (household = amount × rate); `Monthly` / `Yearly` stay in the line's currency, every total, both percentages and
  the calculated `Equity to cover` use the household amount (`householdMonthlyOf` / `householdYearlyOf` in
  `expenses.ts`); no valid rate → `Enter a number above 0.` and the line contributes `—` to every household figure and any
  total containing it (Q14; `factorOf` / `householdMonthlyOf` return null, totals null-propagate like Q10); an
  override is household; one rate per line (Q16); no symbol, no converted column (Q15).
  Lines gain optional `currency` / `rate` in the expenses key (old lines read as household lines). No live FX.
  #94 Overview and Update (spec section 15; Q17–Q23 decided by EL as built; Q19 option A: net assets may go negative over time, the start field stays ≥ 0): `04` Overview (this month vs the
  12-month average for Expenses / Income / Surplus; `Starting net assets`, `Growth rate (%)`; a `Future` toggle with 1 / 5 /
  10 / 15 years; a recharts line chart, Expenses / Income on the left axis, Net assets on the right, plot aria-hidden) and
  `05` Update (`Month` = the last 12 months incl. the current one; typed Expenses / Income per month). A month's figure =
  typed, else (current month only) the page's `Total` / `Net income` monthly when > 0, else empty; the average = mean of
  months with a figure; empty months use it; net assets = start + each month's surplus; Future: × (1 + g/100)^(1/12) +
  average surplus monthly. Key `orpheus.finance.overview.v1`, `src/lib/finance/overview.ts`,
  `src/components/personal-finance/overview-block.tsx`; the page takes an optional `now` (tests).
  Amounts stay unitless (Q2, kept by #87, Q15). For #86: a typed `Equity to cover` overrides the calculated amount for that
  line; calculated is the default when empty (Q3). `__grok/*` builder assets are out of scope (Q4; since #50 they are gone, see "Template leftovers removed").
  #105 (spec section 18, PF-40..47): `02` Income / `03` Expenses / `04` Overview collapse from their heading
  (`SectionHead` `toggle`; closed list stored against the ACCOUNT as `orpheus.finance.view.v1`, `src/lib/finance/view.ts`);
  the income table hides uncounted / 0 lines (`shownIncomeLines`); `05` Update is a `Update month` button → panel
  (draft until `Save`; `Cancel` / Escape discard); expense lines have a `Category` (inline add like accounts),
  a session-only `Filter by category` and `By category` subtotals (`categoryTotals`); master totals never change.
  No helper sentence (no instruction text). EL decided Q35–Q39 as built (≈ 21:43 ET).
  E2E (#98, spec section 17, PFE-01..13): `qa/tools/personal-finance-e2e.mjs` (helpers `qa/tools/pf-helpers.mjs`): one CFO
  journey at 360 / 400 / 1024 / 1440 (signed out always; signed in with QA_EMAIL / QA_PASSWORD, the preview account
  `qa-pf@orpheus.test`; RESETS its record, refuses production); PFE-12 = `site-style-regression.mjs` on the same preview.
  A local server must pass every `Set-Cookie` through (`headers.getSetCookie()`), or only the last auth cookie survives.
  QA: `qa/tools/personal-finance.mjs` (#102: signed in with QA_EMAIL / QA_PASSWORD through `session.mjs`; it RESETS
  that account's Personal finance record; without them only the signed-out PF-33 checks run). Locally: sign up an
  allow-listed address on a throwaway database (PGLite `pglite-server -m 20`: one connection is not enough).
- **Landed: #84 Personal Finance v1.1 + lyre (PR #88).** `src/routes/personal-finance.tsx`,
  `src/components/personal-finance/expenses-page.tsx` (`[data-testid=pf-line]`, `pf-add-<group>`,
  `pf-total-<fixed|variable|all>`), `src/lib/finance/expenses.ts` (pure), `src/components/lyre.tsx`,
  `public/favicon.svg`. EL answers Q1–Q4 (2026-10-11, docs-only) as above.
- **Constraints:** no hires; calculator rules and dashboard data rules unchanged; noindex meta + `X-Robots-Tag`
  and the analytics rules unchanged; AA contrast on dark; no extra instructions anywhere; no painting except the
  two heroes; no buy / sell wording, no disclaimer. #50, #51 and PR #52 stay paused until Oct 12.
- **Copy:** use the exact strings in spec §4.
- **Landed: #68 dark shell (PR #75).** Tokens `night` / `chalk` / `dim` / `rule` / `hair` / `green` / `alert`
  (Tailwind `bg-night`, `text-chalk`, …). `shellBodyClass(pathname)` in `src/lib/site/site.ts` sets the
  charcoal page on `<body>` everywhere except exact `/dashboard`. `SiteMenu` / `SiteFooter` are the only bar
  and footer (don't add per-page variants). Pages still on white panels pin `text-ink` on the panel (`desk.tsx`,
  `dashboard_.sign-in.tsx`, the home cards): when #70 / #69 / #73 convert a page, drop that panel's
  `bg-paper text-ink` and style the content on charcoal with the new tokens. Never touch the dashboard's own
  wrapper. QA: `qa/tools/site-shell.mjs` (`--compare-url` = a base-branch build on the same data, for the
  content-unchanged pixel diff).

- **Landed: #70 calculator (PR #76).** `src/components/desk.tsx` (form, layout) with
  `src/components/calculator/` (`hero.tsx`, `dca-chart.tsx`, `result-rows.tsx`); hero data in
  `src/lib/site/hero.ts` (crops, widths, Venus's figure box per crop: change the crop and you must change the box);
  files and licence in `public/hero/` (`calculator-SOURCE.md`; every file ≤ 300 KB). Calculator-only classes in
  `src/styles.css` (`.calc`, `.calc-field`, `.calc-label`, `.calc-row`, `.calc-button`, `.calc-note`,
  `.calc-caption`, `.calc-plans` / `.calc-plan` / `.calc-line` / `.calc-value` / `.calc-error` (#78; `.calc-pairs` gone), `.calc-title`, `.calc-wash`, `.calc-pill`; sizes in spec §7); the shared `.field` / `.kicker` /
  `.section` are untouched, and the unused `.mast-grid` / `.basket-row` were removed. `color-scheme: dark` comes
  from `shellHtmlClass()` on `<html>` and `shellBodyClass()` on `<body>` (`scheme-dark`) on every dark page, and
  `html.scheme-dark select, option` gives every select charcoal + chalk (a transparent select opens a white list
  in Chrome). The hero title has a font-independent box (`.calc-title`, one text node) and `--font-sans` a
  size-adjusted local fallback (`Schibsted Grotesk Fallback`, `unicode-range` = the web font's subsets only, so
  `→` / `↳` keep their old system glyphs), so a font that arrives late shifts nothing in the hero
  (ST4-01 counts every layout shift; keep both: since #72 the font is self-hosted with `font-display: optional` and the page CLS is a strict 0). A value with ` · date`
  rendered the date on its own muted line (#70; gone with #78's four lines). Basket rows carry `data-testid="basket-row"`;
  results (since #78) `[data-testid=result-plan][data-plan=lump|dca] [data-testid=result-line][data-key=…] dd`
  (`qa/tools/site.mjs` reads the `$313,000` there). Don't import from `src/lib/dca/*` anything new that changes logic; presentation helpers
  (`METRIC_ROWS`, `planName`, `money`) are read-only. QA: `qa/tools/calculator-page.mjs` (ST4 at 360 / 400 /
  1024 / 1440, before and after the regression run; screenshots incl. `hero-<w>.png` with Venus and the wash
  outlined). The pre-#70 tools that read the old tables (`pr3*.mjs`, `sidebyside.mjs`, `full.mjs`, `run.mjs`,
  `c5live.mjs`) are historical and don't apply to the new page. ST0-05's `/dashboard` compare runs signed in
  against the base PR's preview (`site-shell.mjs --compare-url`), never production (no QA sign-in there).

- **Landed: #69 home.** `src/components/home.tsx` (page) and `home-hero.tsx` (the Jordaens band); hero data in
  `src/lib/site/home-hero.ts` (two crops, widths, the prince-and-horses figure box per crop: change a crop and
  you must change its box); files `public/hero/frederick-*` and `public/hero/home-SOURCE.md` (Commons / RKD,
  public domain; every file ≤ 300 KB, the 2880 wide file AVIF only). Home-only classes in `src/styles.css`
  (`.home`, `.home-title`, `.home-wash`, `.home-label`, `.home-line`, `.home-name`, `.home-text`, `.home-open`; sizes in spec §8); the `.calc-*`
  classes are untouched. The title box is font-independent like the calculator's (5.3em × 3.3em, one text node,
  three lines). Wide, the hero text's left edge is `min(content column, 33.24vw − 280px)` so the wash never
  reaches the horses on very wide screens. The home cards (`HOME_LINE`, `HOME_CARDS`, `data-testid="home-card"`)
  are gone: the Platforms lines are `[data-testid=platform-line][data-href=…]` with `[data-testid=platform-open]`.
  QA: `qa/tools/home-page.mjs` (ST3-01..07 + ST0-01..03 at 360 / 400 / 1024 / 1440; screenshots incl.
  `hero-<w>.png` with the figure and the wash outlined). Q17 closed (EL): the home phone band stays
  `min(66.667vw, 480px)` (240 px at 360, 267 px at 400); #72 fixed the `tnum` punctuation and the calculator's
  `w-full` above ≈ 1886 px.
- **Landed: #78 calculator polish.** Results: `src/components/calculator/result-rows.tsx` renders
  `[data-testid=results]` with one `[data-testid=result-plan][data-plan=lump|dca]` per plan and exactly four
  `[data-testid=result-line][data-key=nlv|invested|total|cagr]` (labels `Final value`, `Total invested`,
  `Return (%)`, `CAGR (%)`); the label→value mapping is `src/lib/site/result-lines.ts` (display only, reads the
  existing money / percent formatters; `src/lib/dca/*` untouched, `METRIC_ROWS` no longer rendered). Field
  checks: `src/lib/site/field-checks.ts` (pure; copy in spec §4) runs before any price request; the venue and
  currency checks after the prices are read; each message is `[data-testid=field-error][data-field=…]` under its
  field (tickers / weights per row: `ticker-<n>`, `weight-<n>`, 0-based; then `start`, `end`, `capital`,
  `contribution`, `frequency`), the input `aria-invalid` + `aria-describedby`; errors with no field stay
  `[role=alert]` under the listings note. Wide: one column, `[data-testid=window-row]` with the five fields in one row, the
  button under it, the results below. QA: `qa/tools/calculator-page.mjs` (ST4-06, -10, -17, -18 added),
  `qa/tools/site.mjs` (`$313,000` from the DCA `Total invested` line; VOD.L under its field).
- **Landed: #80 saved searches.** `src/components/calculator/saved-searches.tsx` (the `Saved searches` button
  `[data-testid=saved-toggle]` and panel `[data-testid=saved-panel]`, lines `[data-testid=saved-line]` with
  `[data-testid=saved-load]`) and `src/lib/site/saved-searches.ts` (pure: keys, guarded read / write, dedupe, cap
  5, line text). `desk.tsx` saves after a successful calculation and restores the last search once after
  hydration (a refresh with a multi-name basket adds rows after load; the hero never moves). QA:
  `qa/tools/saved-searches.mjs` (ST4-19..24 at 360 / 400 / 1024 / 1440: closed by default, list + Load, auto-save,
  cap 5, refresh restore, no auth, the two keys only, a second context sees nothing, clear-site-data wipes).
  EL answers (2026-10-11, docs-only): Q18 accepted (multi-name restore page CLS under 0.1; keep restoring on
  load, never hide the form or restore only on tap); Q19 the line shows the search's own contribution, no
  weekly / monthly; Q20 the button always visible, closed by default, empty list `No saved searches yet.`

## Dashboard redesign: mobile first (epic #53). Read this before any dashboard work

*Harness for tickets 1–6 of epic #53 (#54 harness + specs, #55 holdings list, #56 add holding, #57 metrics
sheet and chips, #58 book, #59 leave-outs and regression). Approved by Diego via the Chief of Staff,
2026-10-04.*

- **Source of truth:** `attachments/dashboard-spec.md` **section 0** (the architect's brief verbatim, the
  page, the leave-out list, what stays unchanged, interpretations, the ticket table, acceptance DR0–DR6 and
  the map of old DASH IDs). It wins over the older dashboard sections of the spec and over the T07 / T14 /
  T15 notes below where they differ; the data math in those notes doesn't change. The brief calls the file
  `docs/dashboard-spec.md`; it stays at `attachments/` (code and docs link there).
- **Order:** harness first (this section), then the specs (spec section 0, `README.md`,
  `qa/CANONICAL-AC-PACK.md`), all in ticket 1's PR; then tickets 2–6, one PR each, in order, each off the
  latest `main` after the previous one merges. Ticket 1 changes no app code.
- **Rules (#53):** no hires. Don't change the visual style (same dark desk: colours, fonts, tokens; epic #66
  keeps and extends it, and from #68 only the shared bar and footer change on `/dashboard`). Don't
  hide the dashboard: it stays released, and nobody touches `DASHBOARD_ENABLED`, the flag code or any env
  var. Small tickets; a draft PR is the proof of start; QA on the preview before merge, then on production.
- **Phone first:** build and check at about 400 px first (QA: 400 × 860), then wide screen (1024 px and up;
  QA: 1440 × 900). Below 1024 px one column with a `Holdings` | `Metrics` switch; at 1024 px and up the
  metrics sheet sits on the right.
- **Leave out (never add, and ticket 6 removes what's left):** Connect broker, K/M/B abbreviated amounts,
  an ownership toggle, download / export, instructions under (or above) the table. No helper paragraphs.
- **Keep:** the signed-out matrix (`release-smoke.mjs`, `check:dashboard-built`), the calculator and its
  $313,000 regression, noindex, the analytics rules (and the referrer rule on `main` when #50 lands), no
  buy / sell / hold / rating / target wording and no disclaimer, stored data only on page loads (DASH-14),
  writes through `fetch()` only (never a plain HTML form post). A schema change (ticket 3's optional cost)
  is a new numbered migration, never an edit to a shipped one.
- **Missing figures** are `—` alone (reason only in the tooltip / accessible name). **Blank cost and
  return** are empty, not a dash.
- **Every ticket 2–6 PR body** lists the DR IDs it implements, the old DASH IDs it supersedes (spec 0.8),
  any new interpretation (added to spec 0.5 in the same PR), and the preview alias for its final SHA.
- **Tests:** jsdom has no layout, so widths are QA's job on the preview; component tests
  (`*.dom.test.tsx`) cover what the DOM can show: the four row fields, tap-to-detail, the one-line empty
  state, no helper paragraph, chips add / remove / defaults, `—` cells, the one total, the leave-outs
  absent. New test files go into the `test` script in `package.json`.
- **EL decisions (2026-10-04):** one total, value only (no total cost / return on the page); accounts with
  saved columns keep them as chips, defaults only for users with nothing saved; the 1024 px breakpoint and the
  empty-state text `Add a holding`; the ticket 3 / 4 migrations are fine if nullable and idempotent and run
  through `check:dashboard-built --with-database`.
- **Landed:** ticket 2 (#55), see "Dashboard holdings list (#55)" below and spec 0.9. Ticket 3 (#56, PR #62):
  "Dashboard add holding / optional cost (#56)" below. Ticket 4 (#57, PR #63, stacked on #62): "Dashboard
  metrics sheet and chips (#57)" below. Ticket 5 (#58, PR #64, stacked on #63): "Dashboard book (#58)" below. Ticket 6 (#59, PR #65, on main since
  #64 merged): "Dashboard leave-outs and regression (#59)" below. All six tickets are implemented; the epic closes
  once they're merged and production QA passes.
- **Paused / not this epic:** don't touch `chore/remove-grok-leftovers` / PR #52 or issues #50 / #51
  unless handed them.

## What the app is

Orpheus Wisdom: TanStack Start + Vite + React, deployed on Vercel. One site, three routes (#46):

- `/`: home (#69): the Jordaens band with `01` + `Investment driven by research.`, then `02` `Platforms` with
  three lines (Calculator, Dashboard, Personal finance; #97), each `Open` a link. It does no calculating.
- `/calculator`: the DCA vs lump-sum calculator (moved here from `/` in #46, behaviour unchanged).
  DCA logic lives in `src/lib/dca/*`; the UI is `src/components/desk.tsx`; the price feed is the
  server route `src/routes/api/chart.ts` → `src/lib/dca/yahoo.server.ts`. See `README.md` for the six
  DCA rules.
- `/dashboard`: the signed-in dashboard, gated by `DASHBOARD_ENABLED` (sections below).

Every page has the site menu and the footer; see "Site shell" below.

## Commands

Node 22 (≥ 22.12, required by `@tanstack/react-start`), npm.

| Command | What it does |
|---|---|
| `npm ci` | Clean install from `package-lock.json` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` (warnings allowed, errors fail) |
| `npm test` | Node test runner: `scripts/**/*.test.mjs`, then the listed `src/**/*.test.ts` files (includes the DCA engine, results helpers and the offline fixture replay) |
| `npm run build` | `vite build` (Vercel preset, output in `.vercel/output/`) then `db:migrate` (skips when no database URL is set; see `scripts/db-env.mjs`) |
| `npm run fixtures:build` | Rebuild `qa/fixtures.json` offline from `qa/snapshots/*.json` through the app's own `loadChart()` and `runDesk()`. Add `-- --refresh` to re-pull Yahoo (network) |
| `npm run fixtures:hand-check` | Independent recomputation from the raw snapshots (shares no code with `src/lib/dca`); rewrites `qa/HAND-CHECK.md`, exits non-zero on mismatch |
| `npm run check:dashboard-built` | After `npm run build`: drives the built server function for each `DASHBOARD_ENABLED` value (no network/browser). Flag-off `/dashboard` 404 must equal any unknown-path 404; every method on `/api/dashboard/*` must answer JSON (404, or 405 with `Allow: GET, HEAD` on `status` and `db` when on); `/api/dashboard/db` reads `not_configured` and is 404 under `VERCEL_ENV=production`. CI runs it after Build |
| `npm run dev` | Local dev server (Vite) on port 8080 |

A new test file is only run if it is added to the `test` script in `package.json`.

## Test gate

- CI is `.github/workflows/ci.yml`: on every pull request and on push to `main` it runs
  `npm ci`, `typecheck`, `lint`, `test`, `build` on Node 22. **CI must be green** before review.
- Run the same five commands locally before pushing.

## Branches and PRs

- Branch off the latest `origin/main`. Open a **draft** PR against `main`.
- **No direct pushes to `main`. No force-pushes to `main`. Only Engineering Lead merges, after QA passes on the preview.**
- Loop: SWE writes the PR → CI green → Engineering Lead reviews → QA passes on the PR's **Vercel
  preview URL** (vercel[bot] comments it on the PR) → Engineering Lead merges → Vercel deploys `main`
  to production (https://orpheus-app-beta.vercel.app) → QA re-checks production.
- The PR body states which of `README.md` / spec / `AGENTS.md` changed and why the others did not.
- Never message Diego. Blockers go to the Engineering Lead; the Chief of Staff relays.

## Ticket handoff rules (Diego, 2026-10-02)

These rules exist so no ticket gets missed.
1. Every handoff that starts work goes out urgent (SendToAgent with priority true), never as a queued note.
2. Whoever receives a ticket confirms within their next turn, either by opening a draft PR or by replying "blocked: X". If there's no draft PR, the ticket hasn't started.
3. When a PR merges, Engineering Lead hands off the next ticket in the same turn.
4. Stall check: the daily orpheus-app loop and any active run look for open tickets with no PR activity for 30 minutes during an active run, or none since the last loop run. Engineering Lead re-pings the owner urgently and reports the stall to Chief of Staff. Reporting a stall to Chief of Staff is an allowed ping for Engineering Lead.
5. The GitHub issues and their labels are the task list of record. Each ticket carries exactly one status label: `todo`, then `in-progress` (draft PR open), then `in-QA` (CI green, sent to QA), then `done` (merged and prod-checked). Whoever moves the ticket moves its label in the same turn. Engineering Lead moves `in-QA` to `done` after the merge and the production check.

## Feature flags: feature work lands behind a flag until a release go

*Active since 2026-10-02, when the dashboard spec was approved.*

> **Status 2026-10-04:** production serves the dashboard (issue #46: "Prod has the dashboard ON"; a read-only
> `release-smoke.mjs … on` against production on 2026-10-04 passed: `/dashboard` 307 → sign-in, status
> `{"dashboard":"enabled"}`). The Preview-only wording below is the pre-release history; when and how the flip
> was done isn't recorded in this repo. Bots still never set or change env vars.

- New user-facing features merge to `main` **behind a flag** and stay hidden on production until Diego
  gives a release go. Each ticket still gets its own PR, preview and QA pass.
- Mechanism (dashboard): one **server-only** env var, `DASHBOARD_ENABLED`, set to `true` only in the Vercel
  **Preview** environment (the Engineering Lead added it for Preview on 2026-10-02 for ticket T01, #9; it is not set for Production). Every dashboard route, server function and API route returns 404 unless it is
  exactly `true` (missing = off). Never gate with a `VITE_*` variable (those are inlined into the client
  bundle at build time).
- QA reaches the feature on the PR's Vercel preview URL (e.g. `/dashboard`); on production it must be a 404
  until the release go.
- Release = Diego's go after every ticket is merged with QA PASS and a full flag-on QA run passes (see the
  "Release plan" in the spec). Rollback = flag off for Production + redeploy.
- Bots never set or change env vars in Vercel; the Engineering Lead or Diego does.

## What bots may not touch

- **Engine math** (`src/lib/dca/simulate.ts`, `calendar.ts`, `raw.ts`, and anything else that changes
  computed numbers) without a spec change approved first. Presentation code (`desk.tsx`,
  `src/lib/dca/results.ts`, `format.ts` labels) is fine within the spec.
- **Secrets.** Environment variables live only in Vercel project settings: `VITE_AUTH_ENABLED`,
  `BETTER_AUTH_SECRET`. Never commit their values, never create a `.env` file in the repo, never paste
  values into chat, PR bodies, logs or the vault. (Vercel sets `VITE_AUTH_ENABLED` per environment; since #51 there is
  no repo file for it, and an unset value means on.) The approved dashboard
  spec adds more Vercel-only variables as its tickets land. Variables that exist now (names only,
  never values):
  - `DASHBOARD_ENABLED`: a plain variable set on **Preview only**, not Production (since 2026-10-02).
  - The Neon integration's `orpheus_app_preview_*` variables, e.g. `orpheus_app_preview_DATABASE_URL` and
    `orpheus_app_preview_DATABASE_URL_UNPOOLED`: set on **Preview and Development**, none in Production.

  - `DASHBOARD_SIGNUP_ALLOWLIST` (T03, #11): the sign-up email allow-list (D12, approved), server-only, for
    **Preview** (Production at the release go). Emails are personal data: never paste the value anywhere.
    Since #90 it is for the owner's own account only (the public `Create account` is gone).
  - `ORPHEUS_OWNER_EMAIL` (#90, Q-D12): the owner's email, server-only, set by Diego / EL on **Preview** and on
    **Production at the release go**, never by a bot. Unset: nobody can open Personal Finance or the Dashboard
    (fail closed, 403). Never paste the value anywhere.

  Still to come, each added by an owner when its ticket lands: `BETTER_AUTH_URL` (Production only, at the
  release go; previews derive their origin), `CRON_SECRET` on Production at the release go (T05, #13: set on
  Preview 2026-10-02 as a sensitive variable; bots never read, print or ask for it), an SEC contact for the User-Agent, and an Alpha
  Vantage free key for the daily-close fallback (D13). Nobody claims the Alpha Vantage key until the fallback ticket starts
  and Diego OKs it, asked through the Chief of Staff.
- **`.vercel/output/`**: build output, git-ignored. Never commit it.
- **Advice.** No buy, sell or hold recommendation anywhere: UI copy, code comments, docs, fixtures.
  The DCA-06 check in `src/lib/dca/fixtures.test.ts` scans user-facing copy for it.
- **Trackers.** Only Vercel Web Analytics (anonymous page views, cookieless; see its section). No other
  analytics, pixels or session recording, and no custom events.
- **Browser storage (#80, Diego, locked).** The calculator keeps its saved searches in this browser's
  `localStorage` only, under exactly `orpheus.calculator.last.v1` and `orpheus.calculator.saved.v1` (≤ 5). No
  login and never the account (#73 parked): no server copy, no cookie, no `sessionStorage` / IndexedDB, no
  request beyond `GET /api/chart`. Nothing else on the site writes browser storage; never send these values to
  the analytics.
- **Listings.** US, EU and CA listings only, one currency per basket (`src/lib/dca/venues.ts`). Do not
  widen this without a spec change.

## Reproducing CI and QA checks locally

```bash
export PATH=/path/to/node22/bin:$PATH   # Node >= 22.12
npm ci
npm run typecheck && npm run lint && npm test && npm run build

# QA fixtures (AC pack DCA-01..06): offline, deterministic
npm run fixtures:build          # must leave qa/fixtures.json unchanged unless engine/fixtures changed on purpose
git diff --exit-code qa/fixtures.json
npm run fixtures:hand-check     # must print "hand check: MATCH"
```

- Fixtures: `qa/fixtures.json`, schema and cases in `qa/README.md`, raw data in `qa/snapshots/`,
  independent arithmetic in `qa/HAND-CHECK.md`.
- `npm test` replays every fixture offline (no network) through `loadChart()` and `runDesk()`.
- QA's acceptance pass runs the six DCA rules against the PR preview, then production, using the
  canonical pack `qa/CANONICAL-AC-PACK.md`. Run logs go in `qa/runs/YYYY-MM-DD-<label>.md` with small
  JSON/text evidence beside them; no images in git, scrub cookies/tokens first (policy in `qa/README.md`).

### QA tools against a preview or production URL

The scripts in `qa/tools/` drive the deployed app (they do not start a local server). Pass the URL as
`--base-url` or `QA_BASE_URL`; the default is production, https://orpheus-app-beta.vercel.app. Output
(screenshots, JSON) goes to `--out` / `QA_OUT_DIR`, default a temp dir outside the repo. For `sidebyside.mjs`,
pass production (https://orpheus-app-beta.vercel.app) as the explicit `--compare-url` target.

```bash
npx playwright install chromium                     # once; playwright is already a devDependency
PREVIEW=https://<vercel-bot-preview>.vercel.app
node qa/tools/run.mjs   --base-url "$PREVIEW"       # baseline fixture cases (reads qa/fixtures.json)
node qa/tools/full.mjs  --base-url "$PREVIEW"       # full DCA round, desktop + mobile
node qa/tools/pr3.mjs   --base-url "$PREVIEW"       # results table / charts / mobile cue
node qa/tools/site.mjs  --base-url "$PREVIEW"       # site shell (#46) + $313,000 and VOD.L at /calculator
node qa/tools/sidebyside.mjs --base-url "$PREVIEW" --compare-url https://orpheus-app-beta.vercel.app --compare-path /calculator
QA_BASE_URL="$PREVIEW" python3 qa/tools/fetch.py --out /tmp/orpheus-fetch   # raw Yahoo/app/stooq data
```

Since #46 the calculator scripts open `--calculator-path` (default `/calculator`; pass `/` for a deployment
from before the redesign; `sidebyside.mjs` takes `--compare-path` for the second host, default `/`). Full list and flags: `qa/tools/README.md`. The `.mjs` tools are linted by `npm run lint` (they are not
in `tsconfig`, so `typecheck` skips them); they are not part of `npm test` or CI because they need a
browser and the network.

### Site shell: menu, home, footer (#46)

- Code: `src/lib/site/site.ts` (pure: `MENU_ITEMS`, `HOME_PLATFORMS`, `FOOTER_LINE`,
  `currentSection()`, `homeRedirectHref()`), `src/components/site-menu.tsx`, `site-footer.tsx`, `home.tsx`,
  wired in `src/routes/__root.tsx` around the `<Outlet />`, so every page (calculator, home, `/dashboard`,
  `/dashboard/sign-in`, the 404) gets them. Routes: `src/routes/index.tsx` (home) and `calculator.tsx`.
- **Menu:** a thin ink bar, `position: sticky; top: 0`. "Orpheus" on the left → `/`; "Calculator" and
  "Dashboard" on the right. No dropdowns. The current page gets `aria-current="page"` and a visual state
  (full-strength text plus underline, styled from the attribute). `/dashboard/sign-in` counts as Dashboard; a
  404 has no current item. Plain links (full page loads), so `/dashboard` always goes through its server gate.
- **The Dashboard item and the home Platforms line show even when `DASHBOARD_ENABLED` is off** (Diego, #46). The shell
  never reads the flag or imports dashboard code (`flag.test.ts`); flag off, the link lands on the plain 404.
  This replaces the old rule "no nav link when the flag is off" (spec §2, DASH-01 updated).
- **Home `/` (#69, replaces the #46 line and cards):** the Jordaens hero (`home-hero.tsx`, data in
  `src/lib/site/home-hero.ts`) with `01` + `HOME_TITLE`, then `02` `Platforms` and exactly the two
  `HOME_PLATFORMS` lines (spec §4 copy verbatim; `Open` → `/calculator`, `/dashboard`). No fetches, no calculator
  code in the route (`site.test.ts` checks the imports).
- **`/?query` → `/calculator?query`** (307, from the home route's `beforeLoad`). The calculator reads no URL
  parameters today, so this only keeps old links with a query string landing on the calculator. Plain `/` is home.
- **Footer:** exactly "Orpheus Wisdom", nothing else (#46 brief update, 2026-10-04). No listings line, no
  disclaimer. The calculator keeps its own note "US, EU and CA listings, one currency per basket." under the
  basket, as before.
- noindex: the root `head()` sets `robots: noindex, nofollow` for every page, each page route repeats it, and
  `vite.config.ts` adds `X-Robots-Tag: noindex, nofollow` to every response.
- Tests: `src/lib/site/site.test.ts` (menu items, current page per route, the two Platforms lines, footer text,
  redirect, home imports, noindex in every route file), `src/components/site.dom.test.tsx` (jsdom:
  `aria-current` per route, Dashboard always shown, no dropdowns, sticky, exactly two Platforms lines and no fetch,
  footer text), `check-dashboard-built.mjs` (built server, flag off and on: home, calculator, redirect, menu
  current item, footer, the flag-off 404 has no dashboard copy outside the menu), `release-smoke.mjs` (every
  mode) and `qa/tools/site.mjs` (browser: menu fixed on scroll, the Platforms `Open` links, footer, $313,000 and VOD.L at
  `/calculator`).

### Vercel Web Analytics (#48)

- **What's collected:** anonymous page views only, **no cookies**, no custom events. Per Vercel's
  [privacy page](https://vercel.com/docs/analytics/privacy-policy) (checked 2026-10-04) a page view stores the
  URL path, referrer, coarse geolocation, OS, browser and device type; visitors are counted by a hash of the
  request that is discarded after 24 hours. **Why:** to see which tools get used (home, calculator, dashboard).
  Diego enabled Web Analytics on the Vercel project; there's no env var for it.
- Code: `<Analytics beforeSend={analyticsBeforeSend} />` from `@vercel/analytics/react` (the package has no
  TanStack Start entry; the React one works in any React app), rendered **once** in `src/routes/__root.tsx`, so it
  covers every page. On a deployment it loads Vercel's script from the same origin (`/_vercel/insights/script.js`
  by default; package v2 may use a build-seeded path, "Resilient Intake") and renders nothing on the server. `src/lib/site/analytics.ts` `analyticsBeforeSend` strips the query string and hash
  from every page-view URL (page paths carry no personal data, but `/?query` keeps its query on the way to
  `/calculator`) and drops any custom event.
- Rules: never call `track()` or use `@vercel/analytics/server`; never send emails, tickers, holdings or ids;
  no other trackers or analytics packages. `src/lib/site/analytics.test.ts` (in `npm test`) checks the single
  mount, no `track()` in `src`, no other tracker dependency, and the URL stripping.

### Dashboard flag locally (`DASHBOARD_ENABLED`)

The dashboard is gated by the server-only `DASHBOARD_ENABLED` flag (only the exact string `true` enables;
code in `src/lib/dashboard/flag.server.ts`). Check both states before pushing dashboard work:

```bash
DASHBOARD_ENABLED=true npm run dev               # /dashboard -> 307 to /dashboard/sign-in; /api/dashboard/status -> 200
npm run dev                                      # flag unset -> both 404 (DASH-01, DASH-02)
curl -sI http://localhost:8080/dashboard | head -1
curl -s  http://localhost:8080/api/dashboard/status
```

- Flag off, the server router reads `/dashboard` and anything under it as an unmatched path
  (`rewrite` in `src/router.tsx`, helpers in `src/lib/dashboard/paths.ts`), so the 404 is byte-for-byte
  the app's ordinary 404: title "Orpheus Wisdom", no dashboard chunk, no dashboard copy (spec §2). The only
  "Dashboard" on it is the site menu's item, which every page has (#46).
- New dashboard pages live under `/dashboard`, call `ensureDashboardEnabled()` (`src/lib/dashboard/gate.ts`)
  in `beforeLoad`, and gate `head()` on loader data (`loaderData?.enabled`) so a client-side 404 shows no
  dashboard title either.
  New `/api/dashboard/*` handlers start with `guardDashboardApi()`, which returns the 404 JSON when off,
  and add `ANY: () => dashboardUnsupportedMethod([...allowed])` so other methods get JSON (404 off, 405
  with `Allow` on) instead of the HTML app shell.
  Unknown `/api/dashboard/*` paths hit the catch-all `src/routes/api/dashboard/$.ts` (404 JSON, any method).
- `src/lib/dashboard/flag.test.ts` and `paths.test.ts` (in `npm test`) cover flag parsing, the API guard
  and 405 helper, the flag-off rewrite, the no-advice scan of dashboard files, and checks that the
  calculator neither links to nor reads the flag (the site shell links to `/dashboard` but never reads it, #46). `npm run check:dashboard-built` checks the built server.
- On a PR preview the flag comes from the Vercel Preview environment. Bots never set it; if
  `/dashboard` is a 404 on a preview, the variable isn't set there yet.

### Dashboard storage locally (`DATABASE_URL` / `orpheus_app_preview_DATABASE_URL`)

- Env vars, resolved in `scripts/db-env.mjs` (tests in `scripts/db-env.test.mjs`):
  - App (pooled): **`DATABASE_URL`**, else **`orpheus_app_preview_DATABASE_URL`**. The prefixed names come
    from the Vercel Neon integration (database `neon-almond-lever`), scoped to Preview and Development
    only; Production has none. Neon preview branching is **on** (Engineering Lead decision 2026-10-02), so
    a preview deploy may get its own branch. The dashboard code doesn't depend on that: it reads whatever
    URL is injected, and migrations are idempotent and tracked by name. It works the same against one
    shared preview branch or a fresh branch per deploy.
  - **Branch cap (owner / Engineering Lead action; bots never do this):** Neon Free caps a project at 10
    branches. A preview branch is deleted only when its Vercel deployment is deleted. To prune, delete old
    preview deployments in Vercel, or delete stale preview branches in the Neon console or integration.
  - Migrations (direct): `DATABASE_URL_UNPOOLED` (else `DATABASE_URL`), else
    `orpheus_app_preview_DATABASE_URL_UNPOOLED` (else `orpheus_app_preview_DATABASE_URL`).
  - Neither pooled name set means storage is unavailable ("not configured"). Blank counts as unset.
  - Set by an owner, never by a bot. Never commit, paste or log a value; `migrate.mjs` logs only the name
    and redacts URLs from errors.
- **Migration guard:** `scripts/migrate.mjs` exits 0 without connecting when `VERCEL_ENV=production` and
  `DASHBOARD_ENABLED` isn't exactly `true`. It logs `[migrate] skipped: VERCEL_ENV=production and dashboard
  flag off` (no values). The dashboard schema stays out of the production database until the release go.
  The decision function is `migrationSkipReason()` in `scripts/db-env.mjs`; tests are in
  `scripts/db-env.test.mjs`, including a script-level run.
- Schema: `migrations/0001_auth.sql` (Better Auth, a verbatim copy of `migrations/auth/0001_auth.sql`;
  `scripts/migration-plan.test.mjs` fails if they differ), `0002_dashboard.sql` (spec §5) and
  `0003_user_settings_fk.sql` (the spec's `user_settings.user_id -> "user"(id) ON DELETE CASCADE`, T03).
  Never edit a shipped migration; add the next number (`0004_*.sql`).
- Data access: `src/lib/dashboard/store.server.ts`. Every per-user function takes the `userId` from the
  verified session (`requireUserId()`), never from the client. Connection and status:
  `src/lib/dashboard/db.server.ts`. It has no PGLite fallback, so a deployment without a database URL
  reports "not configured".
- `GET /api/dashboard/db` follows the dashboard API pattern. Flag off: 404 JSON for every method. Flag on:
  GET/HEAD return the status JSON and any other method gets **405 JSON with `Allow: GET, HEAD`**. On
  production (`VERCEL_ENV=production`) it's 404 JSON for every method, and `/dashboard` has no status line.
- Tests: `src/lib/dashboard/store.test.ts` (in `npm test`) applies the migration to in-process PGLite and
  exercises every function plus the `/api/dashboard/db` handler (404/405/200 cases). No network or Neon
  needed, and it runs in CI. `npm run check:dashboard-built` covers the same route on the built server.
- Run migrations against a real Postgres (your own local or throwaway database, never production):

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/db node scripts/migrate.mjs   # "applied 0002_dashboard.sql", then "up to date"
DATABASE_URL=... DASHBOARD_ENABLED=true npm run dev     # /dashboard shows "Database: connected · 13/13 tables"
curl -s http://localhost:8080/api/dashboard/db          # JSON status; 404 when the flag is off or VERCEL_ENV=production
curl -s -X POST -i http://localhost:8080/api/dashboard/db | head -1   # 405, Allow: GET, HEAD (flag on)
```

  No local Postgres? Install `@electric-sql/pglite` and `@electric-sql/pglite-socket` **outside the repo** and
  run its `pglite-server -p 15433` for a throwaway one (that's how T02 was checked end to end).
  Plain `npm run dev` without a database URL also applies `migrations/*.sql` to the template's in-memory
  PGLite (catches SQL errors), but the dashboard status still reads "not configured" by design.

### Dashboard sign-in (Better Auth email/password, T03 #11)

- Code: `src/lib/auth/config.ts` (allow-list, origins, readiness; pure), `instance.server.ts` (the Better
  Auth config: email/password only, allow-list hooks, `__Host-orpheus-auth.*` cookies), `server.ts` (wires
  the database via `scripts/db-env.mjs`, the secret and origins), `verify.server.ts` (session lookup).
  Routes: `/api/auth/*` (`src/routes/api/auth/$.ts`), `/dashboard/sign-in` (`dashboard_.sign-in.tsx`).
  The Grok broker (`genericOAuth`), gate-identity, popup and bearer-token paths are gone.
- Everything is behind `DASHBOARD_ENABLED`: flag off, `/api/auth/*` is 404 JSON for every method and the
  auth module never loads; `/dashboard/sign-in` is the plain 404. The calculator doesn't import auth.
- **Roles (#90):** `src/lib/access/` holds the rules (`access.ts`, pure, with every string in `COPY`), the server
  helpers (`access.server.ts`: owner, grants, people, temporary passwords, password and email changes), the
  `/api/account/*` handlers and the 403 status middleware. Every Personal Finance and Dashboard API goes through
  `gateDashboardRequest(request, allow, deps, { surface, need })` (404 flag off → 405 → 401 → 503 → 403 forced
  change / no grant / write needed) and works on the **owner's** user id; never take a user id from the client.
  `ORPHEUS_OWNER_EMAIL` unset means no owner and 403 for everyone. Passwords are hashed with Better Auth's
  `hashPassword`; a temporary password is returned once (`Cache-Control: no-store`) and never logged.
- **Allow-list (D12):** `DASHBOARD_SIGNUP_ALLOWLIST`, emails separated by commas, semicolons or spaces,
  case-insensitive. Unset or empty: nobody can sign up (fail closed). Enforced twice: a `before` hook on
  `/sign-up/email` (runs before the existing-user check) and a `user.create.before` database hook.
- **Readiness:** on Vercel (`VERCEL` set) sign-in needs `BETTER_AUTH_SECRET` and a database URL;
  `VITE_AUTH_ENABLED=false` turns it off anywhere. Not ready: `/api/auth/*` answers 503 JSON, the sign-in
  page says "not configured", the server log names the missing variable (never a value).
- **Origins:** production uses `BETTER_AUTH_URL`. Previews use exactly `VERCEL_BRANCH_URL` and `VERCEL_URL`
  (https) and ignore `BETTER_AUTH_URL`, so one value can't pin all previews to a host. Local: loopback.
- **Dashboard APIs that touch user data** (`/api/dashboard/me`, `/api/dashboard/settings`, and every
  future one) use `src/lib/dashboard/session.server.ts`: flag off 404 JSON, unsupported method 405 JSON,
  no session **401 JSON**, a client-named user id that isn't the session's **403 JSON**. The user id comes
  only from the session. They never fall back to the template's dev user. `/api/dashboard/status` and
  `/db` are diagnostics with no user data and stay public. Off production, `/status` also reports
  `signIn` (`ready` or `not configured (<variable>)`) and `signUpAllowList` (`set`/`empty`), names and
  states only, so QA and the Engineering Lead can see what a preview is missing without the build logs.
- Tests: `src/lib/auth/auth.test.ts` (PGLite, offline): allow-list allowed/denied/case-insensitive/empty,
  untrusted origin, sign-in/sign-out, 401/403/404/405, cross-user isolation, the FK cascade, migration
  order on a database that already had `0002`. `npm run check:dashboard-built` covers the built server
  without a database (redirect, 401s, 503). With a throwaway Postgres (never a shared one):
  `DATABASE_URL=... node scripts/migrate.mjs && node scripts/check-dashboard-built.mjs --with-database`
  runs the signed-in flow too (sign-up denied/allowed, `/dashboard`, isolation, sign-out).
- Test accounts on a preview: use clearly fake addresses on the allow-list. Bots can't delete users
  (no admin endpoint, no bot database access); an owner removes them in the Neon console
  (`DELETE FROM "user" WHERE email = ...` cascades to sessions, accounts, `user_settings` and, since 0004, `holdings`).

### Dashboard holdings (T04 #12)

- Code: `src/lib/dashboard/holdings.server.ts` (handlers, validation), `listing.server.ts` (listing check;
  since T07 it goes through `DailyCloseProvider.getListing(symbol, { fetch: true })`, see the T07 section), `store.server.ts` (`listHoldings`/`getHolding`/insert/update/
  delete, all scoped by `user_id`). Routes: `src/routes/api/dashboard/holdings.ts` and
  `holdings_.$id.ts` (flat file on purpose: `flag.test.ts` reads `src/routes/api/dashboard` without
  recursing). UI: `src/components/dashboard/holdings.tsx`, rendered by `src/routes/dashboard.tsx`; the
  loader uses `getDashboardHoldings` in `gate.ts`.
- API: `GET`/`POST /api/dashboard/holdings` (`Allow: GET, HEAD, POST`), `GET`/`PUT`/`DELETE
  /api/dashboard/holdings/<id>` (`Allow: GET, HEAD, PUT, DELETE`). Gate from `session.server.ts` (404 flag
  off, 405, 401, 403 for a client-named other user id). A holding id that isn't the session user's (or
  isn't numeric) answers **404 "Holding not found."**, never 403, so ids don't leak. No database: 503.
- Rules: shares > 0, avg cost ≥ 0 or blank (no cost, stored `NULL` since #56), ≤ 6 decimals. **`PUT`
  (edit, EL change in #57):** an omitted `avgCost` leaves the stored cost unchanged, only an explicit `null`
  clears it, a number sets it, a blank string is a 400; the UI always sends an explicit value; duplicate ticker 409 "<SYM> is already in your
  holdings." (checked before any feed call); `PUT` takes `{shares, avgCost}` only and refuses `symbol`;
  cap 200 per user. Ticker check only on `POST`: one Yahoo chart-metadata request; non-US/EU/CA gets
  `listingError()`'s exact text (400), unknown symbol 404, feed down 503. Page loads never call a feed and
  T04 never writes `instruments` (T05's job).
- Tests: `src/lib/dashboard/holdings.test.ts` (PGLite, offline; the real listing check through the
  Yahoo provider with recorded chart metadata): CRUD and reload,
  validation, duplicate, cap, DASH-06 isolation (other user's id 404 on GET/PUT/DELETE, 403 on named
  userId), DASH-08 exact messages incl. BSE. `check:dashboard-built` checks holdings 404/405/401 without
  a database; `--with-database` adds the signed-in CRUD run and **needs network** (it adds `KO` and
  checks `VOD.L`/`TCS.BO` against live Yahoo).
- `holdings.user_id` → `"user"(id)` on delete cascade (migration `0004_daily_close.sql`, T05), so deleting
  a test user removes their holdings too. 0004 first deletes holdings whose user no longer exists.

### Dashboard holdings list (#55, epic #53 ticket 2)

- `src/components/dashboard/holdings.tsx`: `Row` is an `<li>` with a toggle button (four fields: `holding-name`,
  `holding-shares`, `holding-value`, `holding-weight`) and a detail panel (`holding-detail`, `hidden` while
  closed but always rendered, so SSR HTML and `check-dashboard-built` still see `holding-avg-cost`,
  `holding-close`, `holding-cost`, `holding-return(-pct)`, `holding-fx`, `holding-detail-value`,
  `holding-detail-weight`). Edit / Delete live in the panel; `remove()` and its #38 guard are unchanged (the
  source checks in `metric-compute.test.ts` still pin them).
- Under the list: one total (`holdings-total`, value only, `—` when nothing is valued) with the excluded-count
  line and the T15 pie (ticket 5 makes it a donut). The interim `MetricsTable` from #55 was replaced by the
  metrics sheet in ticket 4 (#57).
- No helper paragraph; empty state `Add a holding`. Tests: `holdings-list.dom.test.tsx`,
  `holdings.dom.test.tsx`; browser check `qa/tools/dashboard-list.mjs` (needs `QA_EMAIL` / `QA_PASSWORD`;
  skips the row checks with zero holdings and signs out at the end, QA N3).
- QA N1: each row number carries a visually hidden label (`holding-value-label` " value ", the shares
  span `sm:sr-only` " shares", `holding-weight-label` " share of book "), because the header row is
  `aria-hidden`. Keep the labels outside the `holding-*` testid spans so their text stays the bare figure.

### Dashboard add holding / optional cost (#56, epic #53 ticket 3)

- Add form: one compact row at every width (`holding-form-symbol`, `-shares`, `-cost`; cost placeholder
  `optional`; visible label `Avg cost` below 1024 px). No other placeholders or help text (DR3-01). QA N3
  (#58): no `aria-label` on the cost input; the `<label>` names it, so the name contains what is shown:
  `Avg cost (optional)` below 1024 px (the suffix is `sr-only`), `Average cost (optional)` from 1024 px.
- QA N2 (#58): `parseQuantity()` answers a wrong-type value (`true`, `{}`, `[]`, NaN / Infinity) with
  "<Label> must be a number with at most 6 decimals." (was "is required"), so `avgCost` gets the number
  message on `POST` and `PUT`.
- **No cost is `NULL`, never 0.** `migrations/0008_holdings_avg_cost_nullable.sql` (idempotent `DROP NOT
  NULL`, CHECK kept, no data converted). `parseOptionalCost()` maps missing / `null` / blank to `null` on
  `POST`. On `PUT` (since #57) `parseEditCost()`: omitted → keep the stored cost, `null` → clear, number →
  set, blank → 400. The client sends `costForRequest(input)` (in `format.ts`; blank → `null`), so Edit can
  still clear it. `Holding.avgCost` and `HoldingView.avgCost` are `string | null`.
- `valueHoldings()`: no cost → `cost` / `returnAmount` / `returnPct` `null`; value, weight, total and pie as
  usual; `totalCost` / `totalReturn` over costed holdings only, `null` when none (never shown: one total,
  value only). A cost of 0 is a real cost (return % `n/m`).
- Detail: blank avg cost, cost and return render `<span data-blank="true">` (empty, not `—`/`0`/`n/m`).
- Edit → Save has a ref guard (QA N6): one `PUT` per click burst, released on error or after the refetch.
- Tests: `holdings-add.dom.test.tsx`, `holdings.test.ts`, `store.test.ts`, `valuation.test.ts`,
  `auth.test.ts` (migration list), `check-dashboard-built.mjs --with-database`; browser
  `qa/tools/dashboard-add.mjs` (adds `QA_ADD_SYMBOL`, default MSFT, with a blank cost, fills and clears it;
  refuses a symbol held with a cost; never Delete).

### Dashboard daily closes (T05 #13)

- Code: `src/lib/dashboard/close-provider.ts` (the `DailyCloseProvider` interface from spec A.4, plus an
  optional `getListing()`), `yahoo-closes.server.ts` (Yahoo implementation: reuses `pull()` and `toChart()`
  from `src/lib/dca/yahoo.server.ts`, so `rawBars()`/`rawDividends()` apply), `daily-refresh.server.ts`
  (the job, the lock, the new-holding backfill, `priceViews()` for the page), `refresh-api.server.ts`
  (cron and preview-button handlers). Routes: `src/routes/api/cron/daily-refresh.ts`,
  `src/routes/api/dashboard/refresh.ts`. Schema: `migrations/0004_daily_close.sql` (A.3 deltas:
  `instruments.mic`/`provider_ids`, `daily_closes.adj_close_src`, `corporate_actions`, `price_coverage`;
  plus the holdings FK). `vercel.json` has the cron (`0 23 * * *` UTC).
- **Nothing else calls a price feed for the dashboard.** Pages read Postgres only (DASH-14). Only the
  cron route, the preview button and the new-holding backfill (`waitUntil()` from `@vercel/functions`)
  call the provider. The T04 listing check on `POST /api/dashboard/holdings` still makes its one
  metadata request; it isn't a price and stores nothing.
- Cron route order: flag off 404 → non-GET 405 (`Allow: GET`) → `Authorization: Bearer <CRON_SECRET>`
  compared in constant time, else **401** (also when `CRON_SECRET` is unset; the log says it's unset,
  never a value) → no database 503 → run summary. On production the flag is off, so the cron call gets
  404 until the release go. `/api/dashboard/status` shows `cronSecret: set|empty` off production.
- Preview button: `POST /api/dashboard/refresh`, 404 unless flag on **and** `VERCEL_ENV=preview`
  (production and local dev never have it), 405, 401 signed out. It calls the job directly, so
  CRON_SECRET never reaches the browser. Its response is counts only (no other users' tickers).
- Job rules: lock = upsert on `refresh_runs.run_date` (UTC date) that only succeeds when no run for that
  date is `running` (a run stuck > 10 min is taken over). Per held symbol: fetch from the day after
  `price_coverage.last_session_date` (from 2000-01-01 on a backfill), insert `ON CONFLICT DO NOTHING`,
  refuse a currency that differs from `instruments`, refresh `corporate_actions` weekly, record errors in
  `price_coverage.last_error` and carry on. Budget: 30 requests/min, 500 per run, 240 s per run; the rest
  waits for the next run. Closes are rounded to 4 decimals (Yahoo float noise).
- Completed sessions only: bars after today (exchange zone) are dropped; today's bar is kept only 30 min
  after `currentTradingPeriod.regular.end`.
- Tests: `src/lib/dashboard/daily-close.test.ts` (PGLite, recorded-shape Yahoo payloads, offline): open
  vs closed market, raw closes across a split, unadjusted dividends, non-US/EU/CA refusal, DASH-09 (latest
  close per symbol, second run changes nothing and makes no request), catch-up of missed sessions, the
  lock, DASH-14 (a revised feed never changes a stored close), per-symbol errors, currency guard, backfill
  once, cron 401/404/405/200, preview button visibility and 404/405/401, the holdings cascade, vercel.json.
  `check:dashboard-built` covers the built routes; `--with-database` also runs the button and the cron
  route against live Yahoo (network needed).

### Dashboard FX and base currency (T06 #14)

- Code: `src/lib/dashboard/fx.server.ts` (Valet / ECB parsers, `createFxFetcher()`, `refreshFx()`,
  `rateOnOrBefore()`, `convert()`, `fxFactor()`; `valueHoldings()` moved to `valuation.server.ts` in T07),
  `fx-api.server.ts` + `src/routes/api/dashboard/fx.ts`
  (`GET /api/dashboard/fx?date=`, `Allow: GET, HEAD`, usual 404/405/401 gate, 400 bad date, 503 no db).
  `date` must be a real calendar date (`isCalendarDate()` in `src/lib/dashboard/dates.ts`: strict
  `YYYY-MM-DD`, year >= 1, round-trips through a UTC `Date`), checked after the gate and before any
  database access, so 2026-02-31 or 0000-01-01 is 400, not a Postgres error (500). The Valet/ECB parsers
  drop provider rows with impossible dates the same way. Tests: `dates.test.ts`, `fx.test.ts`.
  `gate.ts` adds `baseCurrency` and `valuation` to the page data; `holdings.tsx` has the "Base currency"
  select, the "Value (BASE)" column with an FX line per rate, and the total row.
- Sources: BoC Valet `https://www.bankofcanada.ca/valet/observations/<series>/json?start_date=&end_date=`
  (USD, EUR always; SEK, PLN only when held). ECB: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml`
  (DKK, HUF, CZK only when held). The ECB data API (`data-api.ecb.europa.eu`) answered 502 on 2026-10-02,
  so the eurofxref file is used; it only covers the last 90 days, which is enough because a cross is only
  built for dates the BoC also published and the job runs daily.
- Cross: `cad = FXEURCAD(d) / ECB_X(d)`, stored with `toPrecision(10)`, source `ECB_CROSS`; only for dates
  both sources have (none for a BoC holiday; the lookup falls back to the previous day). BoC values are
  stored verbatim (source `BOC`).
- Fetch rules: `refreshFx()` runs at the end of `runDailyRefresh()` (cron and preview button) and in the
  new-holding backfill. Per currency it asks from the day after the last stored date (first time: 30 days
  back, or the oldest held close − 7 days), inserts `ON CONFLICT DO NOTHING`, never throws (errors make the
  run `partial`; `fxInserted`/`fxErrors` in the summary). Page loads and `/api/dashboard/fx` only read.
- Rate date: `rateOnOrBefore(quote, sessionDate)`; `fallback` = rate date ≠ session date, shown as
  "(previous rate)". Unknown currencies or missing rates → `fx_pending`, left out of the total.
- Tests: `src/lib/dashboard/fx.test.ts` (PGLite, offline) with the recorded responses in `test-fixtures/fx/`
  (BoC Valet 2026-09-21..10-02 verbatim; ECB 90-day file trimmed to the same dates), checked against live
  Valet/ECB on 2026-10-02. DASH-11 (stored = Valet; 2026-09-30 → 2026-09-29 rate; DKK/HUF/CZK cross),
  idempotence, outage, job wiring, DASH-12 (CAD default, USD/EUR re-express every value and the total,
  setting persists per user), `/api/dashboard/fx`. `check:dashboard-built --with-database` also checks the
  select, `/api/dashboard/fx` and the CAD/EUR/USD totals against live BoC.

### Dashboard holdings valuation (T07 #15)

*Epic #53: the math below stays; the presentation (nine columns, total row) was replaced in #55 by the
four-field row, the tap detail and one total (value only); average cost becomes optional in ticket 3.*

- Code: `src/lib/dashboard/valuation.server.ts`: `valueHoldings()` (moved here from `fx.server.ts`; uses
  `fxFactor()` from `fx.server.ts`), `freshness()` and `loadDashboardHoldings()`, which the `/dashboard`
  loader (`gate.ts` `getDashboardHoldings`) calls. `priceViews()` now also returns `instruments.name`.
  UI: `holdings.tsx` (`AsOf`, the new columns and the total row).
- Formulas, with f = base units per listing-currency unit at the rate for the close's session date (else
  the latest earlier rate): market value = shares × close × f; cost = shares × avg cost × f (**D8**: the same
  rate); total return = value − cost; return % = (close − avg) / avg in the listing currency (`n/m` when
  avg is 0); % of portfolio = value / Σ value. Price- or FX-pending rows are left out of the totals and the
  %, and listed under the total row. Total return % = Σ return / Σ cost.
- Header: "Prices as of <latest session date of the valued rows> close · FX <latest rate date used>"
  ("FX not needed (all in BASE)" when no rate was used). Out-of-date note (DASH-25) when the latest
  `refresh_runs` row with status `ok` or `partial` is more than 4 calendar days (UTC) before today, or there
  is none ("No daily refresh has completed yet."; that's what a fresh preview shows until the button runs,
  since the new-holding backfill doesn't write `refresh_runs`).
- EL confirmed both choices (2026-10-02, recorded in spec §11): (a) a daily run that finishes with some
  per-ticker errors (`partial`) still counts as successful for the out-of-date note, because each row shows
  its own close date; (b) the note shows when no run has ever finished.
- Stored data only (DASH-14): nothing in `valuation.server.ts` takes a provider or a fetcher; a test
  checks the source for feed calls.
- Listing check (EL decision 2026-10-02): it stays on add, but `listing.server.ts` now calls
  `DailyCloseProvider.getListing(symbol, { fetch: true })` (`listingLookupFrom(provider)`;
  `providerListingLookup` = a fresh Yahoo provider per request). Without `fetch` (the daily job) the
  provider only reads its cached response. `ProviderError.kind` (`refused` / `not_found` /
  `unavailable`) maps to 400 / 404 / 503. Nothing in `holdings.server.ts` or `listing.server.ts`
  imports the Yahoo `pull()` directly.
- Tests: `src/lib/dashboard/valuation.test.ts` (PGLite, offline): the DASH-13 hand check (KO USD, ASML.AS
  EUR, RY.TO CAD, CAD base: 4,141.21 / 3,778.18 / +363.03, weights 24.1 / 54.2 / 21.7 = 100.0), D8, USD/EUR
  bases, pending rows, avg cost 0, DASH-14 (reloads identical, values change only after `runDailyRefresh`),
  DASH-25 (as-of dates incl. the 2026-09-30 BoC holiday, the 4/5-day boundary, partial/running/failed).
  `check:dashboard-built --with-database` checks the rendered columns and values.

### Dashboard metrics sheet and chips (#57, epic #53 ticket 4)

- `src/components/dashboard/metrics-sheet.tsx` (`MetricsSheet`, `data-testid="metrics"`) replaces the #55
  picker and table. Testids: `metric-search` (label `Add a metric`), `metric-options` / `metric-option`
  (only while the query is non-empty; Enter adds the first match), `metric-chips` / `metric-chip` /
  `metric-chip-remove` (`aria-label="Remove <label>"`), `metric-th` / `metric-row` / `metric-cell`, the
  interim `Portfolio` foot (`portfolio-metric-*`, ticket 5 makes it the `Book` row). One `PUT` per click burst.
- `holdings.tsx` `HoldingsSection`: with holdings, below 1024 px a `Holdings` | `Metrics` switch
  (`sheet-switch`, `sheet-switch-holdings` / `-metrics`, `aria-pressed`, `lg:hidden`); the hidden sheet is
  `hidden lg:block`. From `lg` a grid `minmax(0,3fr) minmax(0,2fr)` (`holdings-sheet` left, `metrics` right).
  No holdings: no switch, no sheet.
- Catalog (`metrics.ts`): `CHIPS` = the 8 metric keys + `share_of_book` (the row weight); `DEFAULT_CHIPS`
  `rev_g_1y`, `roic_1y`, `share_of_book`; `matchingChips()` (every query word in the label, kept chips out).
- Storage: `user_metric_columns` (now chip keys) + `user_settings.metric_chips_saved_at` from
  `migrations/0009_metric_chips_saved.sql` (nullable, `ADD COLUMN IF NOT EXISTS`). `getMetricChips()`:
  rows or a timestamp = saved (an empty list sticks; accounts with old saved columns keep them, EL); else the
  defaults. `GET /api/dashboard/columns` → `{columns, saved, available}`; `PUT {columns}` takes chip keys.
- Missing figure: `—` alone, reason in `title` + a visually hidden span (DR4-07; supersedes DASH-21's text).
  Keep the table's scroll box (`metric-scroll`) `relative` (QA D1): `sr-only` is `position: absolute`, and an
  unpositioned box lets it escape and widen the whole page.
- Search ranking / Enter (QA D2): `matchingChips()` ranks exact label > prefix > whole words > substring
  (catalog order within a rank); Enter takes `exactChip(query)` first, else the first match. The input is never
  `disabled` while saving (only the option buttons are), option `mousedown` is prevented, and `add()` returns
  early without clearing the query while a save is in flight.
- Tests: `metrics-sheet.dom.test.tsx`, `fundamentals.test.ts` (chips API), `store.test.ts`,
  `check-dashboard-built.mjs --with-database`; browser `qa/tools/dashboard-metrics.mjs` (both widths; adds and
  removes Gross margin on the phone pass unless it is already kept; signs out; never Delete).

### Dashboard fundamentals and metric columns (T08 #16)

*Epic #53: the eight metric columns become searchable chips on the metrics sheet (ticket 4; defaults Revenue
growth 1y, ROIC (1y), Share of the book; no reorder), and a missing figure shows `—` alone.*

- Code: `src/lib/dashboard/fundamentals.server.ts` (the one `FundamentalsSource` adapter:
  `createSecFundamentalsSource()`, `annualFactsFromCompanyFacts()`, the `CONCEPTS` tag map, name matching,
  `refreshFundamentals()` (the job), `metricViews()` (page read)); `metrics.ts` (the 8 metric keys and
  labels, status reasons); `columns-api.server.ts` + `src/routes/api/dashboard/columns.ts`
  (`GET`/`HEAD`/`PUT`); UI `src/components/dashboard/metric-columns.tsx` (`MetricCell`; the picker went in #57, see `metrics-sheet.tsx`), wired
  in `holdings.tsx`. Migration `0005_fundamentals.sql` adds `instruments.fundamentals_checked_at` and
  `fundamentals_error` (still 11 tables).
- SEC rules: User-Agent `OrpheusWisdom/1.0 (orpheus-app dashboard; <SEC_CONTACT_EMAIL>)`. The address is an
  env var the owner sets on Vercel; never commit one. Without it no SEC request is made and the run says
  `fundamentalsSkipped: true`. ≥200 ms between requests (≤5/s; SEC allows 10/s), ticker map once per run,
  companyfacts only when unchecked or ≥7 days old, ≤25 symbols and ≤60 s per run (whole run capped at
  270 s). Fetches happen only in the daily job / preview button and the new-holding backfill; pages and
  `/api/dashboard/columns` read Postgres only.
- Coverage: US symbol = SEC ticker. CA/EU: strip the venue suffix (`RY.TO` → `RY`) and require the same
  company name (tokens after dropping case, punctuation and legal suffixes; a prefix match needs ≥2
  tokens). No match, or a companyfacts 404 → `fundamentals_source='none'` + `not_covered` rows in
  `metric_values` for every key (DASH-21: "— not covered"). Errors (5xx, network) → `fundamentals_error`,
  retried next run, run `partial`.
- Stitching: per concept a ranked tag list; per fiscal year the most recently filed annual fact wins
  (10-K/20-F/40-F, fp FY, 335–395-day durations; instants only at fiscal year ends), one unit per concept.
- Metric values themselves come in T09–T13; until then a covered cell reads "— not computed yet".

### Dashboard revenue growth (T09 #17)

- Code: `src/lib/dashboard/metric-compute.server.ts`: `revenueGrowth()` (pure), `fiscalYearBack()`,
  `computeRevenueMetrics(db, symbol)` (reads `fundamentals_annual`, upserts `metric_values` for
  `rev_g_1y`, `rev_cagr_3y/5y/10y`) and `symbolsMissingRevenueMetrics()`. Called from `refreshFundamentals()`
  right after a covered symbol's facts are stored, and at the start of every `refreshFundamentals()` call for
  covered held symbols with missing rows (Postgres only, also when no SEC contact is set). Summary field
  `computed`. Pages still read `metric_values` only. T10–T13 add their metrics to the same module.
- Rules (spec §8): FY0 = latest stored fiscal year end (any concept); FY−n = stored year end n years back
  ± 45 days (closest). 1y: `n/m` when either value ≤ 0 or missing. CAGR: `n/m` when an endpoint ≤ 0 or FY0
  revenue missing; `insufficient_history` when FY−n missing. Values are fractions (`toPrecision(12)`),
  shown as % with 1 decimal. The portfolio cell for these metrics is T14 (spec §9).
- Tests: `src/lib/dashboard/metric-compute.test.ts` (SEC fixtures → ingest → metrics): KO hand check
  (1.9 / 3.7 / 7.7 / 0.8 %, 10y base from `SalesRevenueGoodsNet`), Philips (PHG), RY 10y insufficient history,
  zero/negative base, fiscal-year alignment, catch-up without SEC calls.

### Dashboard ROIC (T10 #18)

- Code: `metric-compute.server.ts` `roic()`, `roicTaxRate()`, `investedCapital()`, `isFinancialSic()`;
  `computeStoredMetrics()` (renamed from `computeRevenueMetrics`) now writes the 4 revenue rows + `roic_1y`;
  `symbolsMissingMetrics()` / `COMPUTED_METRIC_KEYS` drive the catch-up. Tooltip text: `METRIC_HELP` in
  `metrics.ts` (column header `title` and cell `title`).
- Data: migration `0006_instrument_sic.sql` (`ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sic INTEGER`,
  idempotent; previews share the main Neon branch). The SEC source gained `sic(id)` = one
  `https://data.sec.gov/submissions/CIK##########.json` request per covered symbol per 7-day refresh (same
  UA and ≥200 ms spacing; failure keeps the stored code). `CONCEPTS` gained fallback debt tags
  `LongTermDebtAndCapitalLeaseObligations{,Current,IncludingCurrentMaturities}` (KO tags only these since
  FY2024; they include finance leases). Named deviation (EL 2026-10-03): debt tags that include finance
  leases are a fallback only, used per fiscal year only when no lease-excluded tag exists (tag order enforces it).
- Rules: NOPAT = operating income FY0 × (1 − t); t = tax / pre-tax clamped 0–50%, 25% if pre-tax ≤ 0 or
  either missing. Invested capital = equity incl. NCI (else parent equity) + short-term borrowings (else
  CP + other short-term) + LTD total (else current + noncurrent; IFRS current-borrowings total when it's
  the only current line) − cash; missing debt/cash = 0. Average of FY0 and FY−1 (FY−1 = ±45 days).
  `n/m`: SIC 6000–6399, no FY0 operating income, no FY0 equity, average ≤ 0. `insufficient_history`: no FY−1
  equity. Symbols ingested before T10 have no SIC until their next 7-day SEC refresh (the operating-income
  rule still applies).
- QA fixes (#37 run 2026-10-03): **F2** `FUNDAMENTALS_PARSER_VERSION` (2) stored per instrument
  (`fundamentals_parser_version`, migration `0007`, idempotent; it also widens the `metric_values.status`
  CHECK with `insufficient_data`). Covered symbols with an older version are refetched regardless of the
  7-day window, their `fundamentals_annual` rows are replaced (not merged), and until then metrics that need
  the newer parser (`METRIC_MIN_PARSER`: `roic_1y` → 2) are stored as `insufficient_data` ("— insufficient
  data"). Invested capital: a line group (short-term debt / long-term debt / cash) never reported by the
  company in any stored year = 0; reported in other years but missing at FY0 or FY−1 → `insufficient_data`
  (this replaces the old "missing debt or cash lines = 0"). **F1** debt concepts are `rankFirst`: tag order
  beats filing date, so lease-inclusive tags are used for a year only when no lease-excluded tag exists
  (KO FY2023 → `LongTermDebt*` filed 2024-02-20). Holdings rows: one DELETE per row (ref guard), 404 = done
  (remaining DELETE 404s: issue #38). EL 2026-10-03 accepted `insufficient_data` as a cell state (spec §8
  table + dash reasons) and 0007's CHECK widening as is.
- Atomic refetch: `replaceFundamentals(db, symbol, facts)` replaces a symbol's `fundamentals_annual` rows in
  ONE SQL statement (CTE: upsert the new set + delete rows not in it). The app's Neon client is a `pg` Pool
  where each `query()` may use a different connection, so BEGIN/COMMIT across calls isn't safe; a single
  statement is atomic everywhere. A failing value leaves the old rows untouched (tested).
- Tests: `metric-compute.test.ts` DASH-17 block: KO hand check (17.4%), Philips (PHG) IFRS path, RY n/m (SIC
  6029), negative ROIC, SIC range, avg ≤ 0, insufficient history, tax clamp/fallback, invested-capital
  fallbacks, tooltip. Fixtures: KO companyfacts gained the 3 lease-inclusive debt tags (verbatim from a
  2026-10-03 live download); `submissions-CIK{KO,RY}-2026-10-03-subset.json` (cik, name, sic only).
  D9 (portfolio EPS) is T14.
- Tests: `src/lib/dashboard/fundamentals.test.ts` with `test-fixtures/sec/` (live 2026-10-02, trimmed to
  the mapped tags, facts verbatim; values checked against live EDGAR companyconcept once).

### Dashboard EPS (T11 #19)

- Code: `metric-compute.server.ts` `eps()` + `epsCurrency()`; `computeStoredMetrics()` writes `eps_1y`
  (`COMPUTED_METRIC_KEYS` now 6, so the catch-up fills it for companies stored earlier; no new tags, no
  parser bump, no migration). `metricViews()` adds `currency` (from the stored FY0 `eps_diluted` unit,
  "USD/shares" → "USD"). Display: `formatEps()` in `format.ts` (as reported, ≥ 2 decimals, + code);
  tooltip in `METRIC_HELP`.
- Rules: diluted EPS for FY0 (the latest stored fiscal year end, any concept), as reported; basic EPS is
  never substituted; no FY0 diluted EPS → `n/m`; a unit that isn't `<CUR>/shares` → `insufficient_data`.
  Splits: FY0's value is the most recent filing's (a 10-K/A restatement wins); only FY0 is used, so no
  cross-year adjustment. IFRS: `ifrs-full:DilutedEarningsLossPerShare`. The portfolio EPS cell (D9,
  weighted 1y EPS growth) is T14.
- Tests: `metric-compute.test.ts` DASH-18 block: KO 3.04 USD hand check, Philips (PHG) 0.93 EUR (IFRS; PHIA.AS is not covered),
  RY 14.07 CAD, ASML 24.71 EUR, missing → n/m, basic-only filer, negative EPS, odd unit, 10-K/A
  restatement, display without rounding.
- #38 (second DELETE on one click) is not folded in: the cause isn't obvious from the client code (the
  per-row guard already blocks double clicks); left for its own ticket.

### Dashboard EBIT margin (T12 #20)

- Code: `metric-compute.server.ts` `ebitMargin()`; `computeStoredMetrics()` writes `ebit_margin_1y`
  (`COMPUTED_METRIC_KEYS` now 7; the catch-up fills companies stored earlier). Revenue and operating income
  tags are unchanged since T08: no new tags, no parser bump, no migration. Tooltip in `METRIC_HELP`.
- Rules (spec §8): FY0 operating income / FY0 revenue, both as stored (no adjustments). `n/m`: FY0 revenue
  ≤ 0 or missing, or no FY0 operating income (banks such as RY). `insufficient_data`: the two facts are in
  different units. Negative margins are values. No SIC rule (the spec has none for this metric).
- Tests: `metric-compute.test.ts` DASH-19 block: KO 13,762 / 47,941 = 28.7%, Philips (PHG) 8.0% (IFRS),
  ASML, RY n/m, negative margin, revenue ≤ 0 / missing, unit mismatch, tooltip.

### Dashboard gross margin (T13 #21)

- Code: `metric-compute.server.ts` `grossMargin()`; `computeStoredMetrics()` writes `gross_margin_1y`
  (`COMPUTED_METRIC_KEYS` now 8; the catch-up fills companies stored earlier). `gross_profit` and
  `cost_of_revenue` tags exist since T08: no new tags, no parser bump, no migration. Tooltip in `METRIC_HELP`.
- Rules (spec §8): FY0 gross profit / FY0 revenue; if there is no FY0 gross-profit fact, (FY0 revenue − FY0
  cost of revenue) / FY0 revenue (decided per FY0, so all inputs are from the same year). `n/m`: FY0 revenue
  ≤ 0 or missing, or neither concept for FY0 (banks such as RY). `insufficient_data`: facts in different
  units. Negative margins are values.
- Tests: `metric-compute.test.ts` DASH-20 block: KO 29,544 / 47,941 = 61.6%, the fallback (KO with
  GrossProfit removed → same 61.6% from `CostOfGoodsAndServicesSold`), Philips (PHG) 45.2%, ASML, RY n/m,
  revenue ≤ 0 / missing, negative, unit mismatch, tooltip.

### Dashboard portfolio aggregates (T14 #22)

*Epic #53: the math below stays; the figures move to the metrics sheet's `Book` row (ticket 5), 0% coverage
shows `—`.*

- Code: `src/lib/dashboard/portfolio.ts` `portfolioMetrics()` (pure; called by `loadDashboardHoldings()`
  → `portfolio`, computed at read time from the stored valuation and `metric_values`; no new table, no
  migration). UI: `PortfolioMetricCell` in `metric-columns.tsx`, rendered in the holdings `<tfoot>` total
  row; text from `format.ts` `formatPortfolioCell()` / `formatCoverage()`.
- Rules (spec §9): value = Σ MVᵢ·mᵢ / Σ MVᵢ over valued holdings whose company is covered and whose stored
  status is `ok`; coverage = that Σ MV / Σ MV of all valued holdings. Everything else (n/m, insufficient
  history/data, not covered, pending, not computed) is excluded and counts against coverage; negatives are
  included. Price/FX-pending holdings are outside both sums. 0% coverage → `—` alone (since #58; was
  `— · 0% covered`); nothing valued → `—`.
  Coverage is a whole percent, never rounded to 100% (or 0%) unless exact.
- D9: new stored per-company metric `eps_g_1y` (`epsGrowth()` in `metric-compute.server.ts`; not a picker
  column) = diluted EPS FY0 / FY−1 − 1; n/m if FY0 EPS missing or either ≤ 0; insufficient history if no
  FY−1 (±45-day match); insufficient data if units differ. The EPS column's portfolio cell uses it, labelled
  "EPS growth 1y (weighted)". `COMPUTED_METRIC_KEYS` now 9 (catch-up fills stored companies; no parser bump).
- Tests: `metric-compute.test.ts` DASH-22/23 block: hand-checked CAD portfolio KO + ASML.AS + RY.TO + PHG +
  MC.PA (not covered) from the fixtures (EBIT margin 3 of 5, 71% covered; D9 KO/ASML/RY growth, PHG n/m),
  every metric vs Σ formula, negatives (PHG revenue growth), pending price, 0% coverage, epsGrowth rules.

- EL approved (#42 / #43): whole-% coverage that never rounds to 0% or 100% unless exact; price/FX-pending
  holdings outside both the weights and coverage; no FY−1 diluted EPS → `insufficient_history`.

### Dashboard pie chart (T15 #23) and the excluded-holdings flag

*Epic #53: `pieSlices()` stays; since ticket 5 (#58) the pie is a donut under the one total, the pending
lists and the empty sentence are gone (see "Dashboard book (#58)"). The excluded-holdings line stays.*

- Code: `src/lib/dashboard/pie.ts` `pieSlices()` (pure, from `valuation.rows`: value / total × 100, the same
  numbers as the table's % column, labelled with the same `toFixed(1)`), `PIE_MAX_SLICES = 10` (10 largest +
  "Other"), ties by ticker, neutral greys `PIE_COLOURS`; `excludedNote()`. UI:
  `src/components/dashboard/holdings-pie.tsx` (recharts `PieChart`, the library the DCA chart already
  uses; no new dependency) rendered under the table; the legend list doubles as the accessible text and
  the server-rendered content (the chart itself mounts client-side). Empty state "No holdings with a price
  yet."; "price pending: …" / "FX pending: …" lists under the chart.
- Total row (EL, #43): `holdings-total-excluded-count` under "Total": "1 holding without a price excluded" /
  "N holdings without a price excluded" ("… or FX rate" when one is FX pending); absent when N = 0.
- Tests: `valuation.test.ts` DASH-24 block (KO + ASML.AS + RY.TO in CAD: slice = row weight, same label,
  sum 100.0; price pending; > 10 → Other; ties; empty / FX pending; greys) and the excluded-flag block;
  `check-dashboard-built.mjs --with-database` checks the empty/price-pending pie, the "1 holding without a
  price excluded" flag before the first close, and KO 100.0% afterwards.

### Dashboard book (#58, epic #53 ticket 5)

- One total (`holdings-total`, value only, `—` when nothing is valued) + excluded line, unchanged from #55.
- Donut: `holdings-pie.tsx` renders `pieSlices()` with `innerRadius="58%"` (`data-shape="donut"`, caption
  `Share of the book (<base>)`, `aria-label` "Donut chart of share of the book: …"); 10 largest + `Other`,
  largest first, ties by ticker; returns `null` with no valued holding (no sentence). No pending lists.
- Book row: the metrics sheet's `<tfoot>` row (`book-row`, label `Book`). Per chip `PortfolioMetricCell`
  with `portfolio[key]` from `portfolioMetrics()` (math unchanged: dashes excluded, weights renormalised);
  `formatPortfolioCell()` gives `x.x% · N% covered` or `—` alone (0% coverage too); `bookFigure()` wraps only
  between figure and coverage. Share chip: sum of the valued weights (100.0%), no suffix.
- Metric search (#58): `metric-search` is a `role="combobox"` input over the `role="listbox"`
  `metric-options` (`metric-option` = `role="option"` `<li>`, `aria-selected`, no button inside); arrows /
  Home / End move `aria-activedescendant`, Enter adds the label equal to the query if any (QA D2, `exactChip`),
  else the highlighted option (ranked best first, so the exact name is also first and highlighted), Escape
  clears; mousedown on an option is prevented and the input is neither `disabled` nor `readOnly` while saving
  (QA (b): focus stays and typed keys aren't dropped; `add()` ignores a pick while a save is in flight).
- QA tools that sign in (`dashboard-list`, `-add`, `-metrics`, `-book`, and `-leaveouts` since #59) go through `qa/tools/session.mjs`
  `eachViewport()`: sign-in, checks, and sign-out in a `finally` (QA N4); a thrown error is a FAIL. Don't
  add a tool that signs in or out by itself (`scripts/qa-tools-session.test.mjs` enforces it).
- Tests: `book.test.ts`, `book.dom.test.tsx`, `check-dashboard-built.mjs --with-database` (book section);
  browser `qa/tools/dashboard-book.mjs` (read-only; since #65 it recomputes every chip's book figure with
  `qa/tools/book-math.mjs` from the page's unrounded data, never from the rounded weights on screen, and
  compares at display precision; `scripts/qa-book-math.test.mjs`).
- Release doc: migration 0008 is forward-only; null costs must be cleared before any production rollback
  past #56 (`docs/release/dashboard-release.md`, "Migrations against production").

### Dashboard leave-outs and regression (#59, epic #53 ticket 6)

- Leave-outs (spec §0.3): never add Connect broker / a broker link, K/M/B amounts, an ownership toggle, a
  download / export / CSV control, or any paragraph beyond the kept data lines (`KEPT_LINES` in
  `qa/tools/leaveouts-rules.mjs`). If you add a new single data line, add it there.
- Numbers: show stored NUMERIC strings with `displayDecimal()` (trim + `groupDigits()`, decimals kept), money
  with the 2-decimal `Intl` formatters in `holdings.tsx`, metric % with `formatMetricPct()`; never
  `notation: "compact"`. Edit inputs keep raw values (they're parsed back).
- Tests: `leaveouts.dom.test.tsx` (rules on the rendered page + a source scan), `scripts/qa-leaveouts-rules.test.mjs`,
  `format.test.ts`. The rules file is shared with the browser tool, so a rule change applies to both. The
  preview refresh panel's lines (`Last run: <date> (UTC) · running|ok|partial|failed`, `No run yet.`, its
  button notes) are kept lines too (QA D1, #65; pinned in `leaveouts.dom.test.tsx`): change `PreviewRefresh`'s
  copy and `KEPT_LINES` together.
- QA: `qa/tools/dashboard-redesign.mjs` is the one-run regression (site-wide checks, then every dashboard tool
  at 400 / 1024 / 1440 via `QA_VIEWPORTS=phone,wide,desktop`; `--read-only` skips the writing tools, `--empty`
  adds an account with no holdings via `QA_EMPTY_EMAIL` / `QA_EMPTY_PASSWORD` and **implies `--read-only`**
  (#65: the add tool must not put a holding back before the empty checks; run add / metrics without
  `--empty`), `--smoke <mode>` runs `release-smoke.mjs`). It never signs in itself; the tools do, through `session.mjs`. Locally, the
  `X-Robots-Tag` checks fail by design (the header is a Vercel route rule from `vite.config.ts`).

### Holding delete: one DELETE per click (#38, PR #44)

- Root cause: after a successful DELETE the row released its guard and re-enabled Edit/Delete while the page
  loader's refetch (`router.invalidate()`) was still running (seconds on Vercel), so the deleted row stayed
  on screen and clickable; every further click sent DELETE for an id that no longer exists → 404 (the
  server is right). The route's `ANY` handler is not involved: each request runs one handler (checked
  against the built server).
- Fix (`holdings.tsx` `Row.remove()`): the guard is released only on an error; on success the row shows
  "Deleted" (dimmed, `aria-busy`) with no buttons until the refetch removes it. Test: `metric-compute.test.ts`
  "QA: holdings delete fires once (#37, #38)".
- QA N3 in the same PR: the EPS column's portfolio cell shows "EPS growth 1y (weighted)" as a visible
  sub-label under the value (`PortfolioMetricCell`); `check-dashboard-built --with-database` checks it.

### Dashboard release prep (#24, prep only)

- `docs/release/dashboard-release.md`: DASH-00..26 + DCA-01..06 checklist by ticket, Production env list
  (names, purpose, format, who sets, required; never values), DB options (recommended: dedicated Neon
  production branch, `DATABASE_URL` / `DATABASE_URL_UNPOOLED`), migration commands, cron, ordered runbook with
  rollback, Diego's test-account steps and removal SQL, open decisions (N3: keep `/api/dashboard/db` 404 on
  production as coded; `/status` public with only `{"dashboard":"enabled"}` there).
- `scripts/release-smoke.mjs <url> off|on|preview`: GET-only, no credentials; test `scripts/release-smoke.test.mjs`.
  Since #46 every mode also checks the site shell (menu, home Platforms lines (#69; the home cards until then), footer, `/calculator`, the `/?query`
  redirect, noindex meta + `X-Robots-Tag`) and `GET /api/chart?ticker=VOD.L…` → 400 with the exact message.
- #45 release decisions (EL) are recorded in `docs/release/dashboard-release.md` §5.
- N1: `format.ts` `formatPortfolioPct()` is the one "% of portfolio" formatter (table `weightPct` and pie
  `piePct` are that function); test in `valuation.test.ts`. N2: rounded labels may not sum to exactly 100.0.
- Bots never flip production or touch Vercel env; production gets read-only GETs only.
- QA N1 (#45): click-level component tests `src/**/*.dom.test.tsx` run in jsdom via `scripts/run-dom-tests.mjs`
  (rolldown bundles the TSX into `node_modules/.cache/dom-tests`, then `node --test`); part of `npm test`, so
  CI runs them. Setup: `src/test/dom-setup.ts`. First test: `holdings.dom.test.tsx` (delete guard: a 200
  DELETE then more clicks → one request and "Deleted"; a 500 re-enables the buttons; cancel sends nothing).
  devDependencies: `jsdom`, `@types/jsdom`, `rolldown` (pinned to the version Vite already installs).

## Repo leftovers from the Grok template

The Grok App Builder template's files are gone (#50: the PWA / OG middleware, `/__grok`, the preview bridge;
#51: `.grok/`, `startup.sh`, `scripts/preview*.mjs`, `with-app-env`, `app-env-plugin`, `check-auth-invariant`,
`write-atomic`, `browser-smoke*`, `browser-guard`, `screenshots/app-builder-*`). `dev` / `build` / `preview` run
Vite directly; never re-add them. Deploying
through Grok has stopped: Vercel is the only deploy path, and production is https://orpheus-app-beta.vercel.app.
The old template `AGENTS.md` (sandbox, port-8080 preview proxy, Grok
chat rules) was replaced by this file. Still from the template (parked, #50 N2): `src/lib/app-data/*`
(the `GROK_*` connector env, `connectors.grok.me`), unused by any page.

## Template leftovers removed (#50)

- Gone, never re-add: `scripts/grok-pwa-*`, `scripts/install-page.html`, `server/` (the `grok-pwa` middleware and the
  `virtual:grok-og-identity` types; `vite.config.ts` no longer sets Nitro `serverDir`), `public/__grok/`,
  `scripts/brand-check.mjs`, `src/lib/preview-embedder-origin.ts`, `src/lib/preview-host-bridge.ts`,
  `src/components/preview-host-bridge.tsx`. No page may load anything from `grok.com` or set a `.grok.com` cookie.
- The head (`src/routes/__root.tsx`) now carries what the middleware used to inject: `apple-mobile-web-app-title`
  `Orpheus Wisdom`, `apple-mobile-web-app-status-bar-style` `black`, `og:title` `Orpheus Wisdom` (the
  `twitter:card` and the Grok OG image service were dropped), `rel=manifest` → `/manifest.webmanifest`,
  `rel=apple-touch-icon` → `/icons/apple-touch-icon.png`.
- Icons: change `public/favicon.svg`, then `node scripts/make-icons.mjs` and commit the PNGs.
- `.grok/` and the rest of the template tooling: removed in #51. `src/lib/app-data/*` (GROK_* connector env) parked.
- QA: `qa/tools/no-grok.mjs` (NG-01..09 in `qa/CANONICAL-AC-PACK.md`).

## Audit log of actions (#91)

- Design `attachments/audit-log-design.md`; AC AUDIT-01..12; tool `qa/tools/audit.mjs`.
- Every new write API calls `auditFor(db, access, "<area>.<verb>", …)` from `src/lib/access/audit.server.ts` after the
  write succeeds; add the code to `AUDIT_ACTIONS` and the design's section 3. Never pass request text: `target` is
  `maskCode("p" | "h", id)` / `personTarget`, `detail` only `grantsDetail` / `deniedDetail` (the table's CHECKs refuse
  anything else). Logging is best effort and must never change the action's answer.
- `audit_event` is append-only (a trigger refuses UPDATE / DELETE); never add a foreign key or an email / name column.

## Personal Finance month control (#112)

- Design `attachments/pf-month-control-design.md` (EL option A, decisions 1–7), spec section 19, AC PF-48..PF-58.
- Per-month lines live in `orpheus.finance.months.v1` (`src/lib/finance/months.ts`); the page edits a draft and
  writes only on `Save`. Never reintroduce autosave; section toggles are the one immediate write.
- QA tools that type into the page must click `Save` (`pf-month-save`) before checking the stored record.

## Personal Finance usability (#113)

- The product name is "Personal Finance" (capital F) in every visible string; QA tools assert it exactly.
- Removals in Personal Finance go through `confirmDelete(name)` (`Delete [name]? This cannot be undone.`).
- Renaming a category goes through `renameCategory` (src/lib/finance/expenses.ts); on Save the rename is applied to
  every stored month (`renameInMonths`). Spec section 20, AC PF-59..PF-66, Q-F1..Q-F8.


## Shared page parts (#92)

- New page code uses `.ow-label` / `.ow-button` (`src/styles/parts.css`); do not copy their declarations into a page
  rule. Fonts only in `src/styles/fonts.css`; the preload path only in `src/lib/site/fonts.ts`.
- `scripts/shared-parts.test.mjs` enforces it (SP-01..SP-05). Site-style-spec section 16.


## Dashboard company view (#95)

- `/dashboard/company/<SYMBOL>` reads the database only (SEC companyfacts + stored closes / dividends); never call a
  price or fundamentals feed from a page or API request. Holdings only (Q-C1).
- Formulas live in `src/lib/dashboard/company.ts` (pure, tested); a new concept goes into `CONCEPTS` with a
  `FUNDAMENTALS_PARSER_VERSION` bump. Section titles use `.ow-label`; no gold.
- Design `attachments/dashboard-company-view-design.md`, AC CV-01..CV-15, Q-C1..Q-C7.


## Personal Finance expenses summary (#119)

- `Expenses summary` is its own section (`summary` in `src/lib/finance/view.ts` `SECTIONS`); `By account` and
  `By category` live there, not in the Expenses body. Totals by account: `accountTotals` (pure, tested).
- Filters (category, account) are per visit and never change a total. Design `attachments/pf-expenses-summary-design.md`,
  AC PF-67..PF-78, Q-S1..Q-S8 (CFO).
- #119 S7 (EL 07:51): read-only may filter (filters sit outside `Lock`); anything that writes stays inside `Lock`
  or is disabled for read-only (ROLE-10a).


## Company view without SEC filings (#121)

- An uncovered listing gets `coverage` (`Not covered: no SEC filings`) and its own source line; never add a feed call
  for it from a request. Source decision pending (Q-N1 ESEF free; Q-N3 paid needs Diego). Design
  `attachments/dashboard-non-sec-coverage-design.md`, AC NC-01..NC-08.


## EU fundamentals from ESEF (#123)

- EU listings SEC does not cover get facts from filings.xbrl.org (xBRL-JSON) via LEI (`PINNED_LEI`, then GLEIF), in
  the daily job only (`src/lib/dashboard/esef.server.ts`); polite UA, ≥ 1 s between requests, ≤ 6 documents a
  symbol. Parse with `annualFactsFromEsef` (pure); tests use `src/lib/dashboard/fixtures/esef-hermes.json`, never a
  live call. Design `attachments/dashboard-esef-fundamentals-design.md`, AC ES-01..ES-12, Q-E1..Q-E8.
- #123 build note: the ESEF fixture is `test-fixtures/esef/hermes-2026-10-13-subset.json` (not under `src/lib/dashboard/`; DASH-00 scans that folder). Unit tests inject fake fetches (`createEsefSource({ get })`, `deps.fundamentals`); no live SEC / ESEF / GLEIF calls.
- #123 follow-up: derived figures (E1 shares from EPS, E5 broad IFRS capex) are flagged via `fundamentals_annual.source_tag` → `derivedMethod()` (`company.server.ts`) → `CompanyRow.derived`; the page shows a dim `.ow-label` "derived" marker with title / aria-label. Only mark when the fallback ran.
- #126 (PF Overview): `equityCoverage()` and `summarize().average3` in `src/lib/finance/overview.ts`; design `attachments/pf-equity-coverage-design.md`, spec section 22, AC PF-79..PF-90. Coverage and the 3-month average are computed, never stored.


## Funds / ETFs on the company view (#124)

- OpenFIGI mapping API, keyless (25 requests / min, ≤ 10 jobs a request), in the daily job and the new-holding backfill
  only (`refreshClassification` in `src/lib/dashboard/openfigi.server.ts`); never from a page or API request. Never
  add an OpenFIGI key or sign up.
- Stored on `instruments.provider_ids.openfigi` (`kind` fund / company / unknown; no migration). Fund rule (Q-F3) in
  `src/lib/dashboard/fund.ts`; suffix → exchCode table `SUFFIX_EXCH` (Q-F4). Failure = company view (Q-F2).
- Tests replay `test-fixtures/openfigi/mapping-2026-10-14.json` through `createOpenFigiSource({ post })`; no live call.
  `refresh-api.server.ts` turns classification off when a test injects `provider`. Design
  `attachments/etf-detection-design.md`, AC FD-01..FD-14, Q-F1..Q-F8.
- #129 (PF Overview coverage layout): three lines in `CoverageLine` (`overview-block.tsx`): amounts, `coverageRateNote()` and
  `COVERAGE_SOURCE_NOTE` (`overview.ts`), notes in `.pf-coverage-sub`. Math unchanged. Spec section 23, AC PF-98..PF-104, Q-L1..Q-L6.


## Personal Finance: Withdrawal rate description (#131)

- Under `03` Expenses, right above the rates row: `pf-withdrawal-desc` (two `<p>`, class `pf-desc` = the #129 note
  style). Copy `WITHDRAWAL_DESC_LINES` in `src/lib/finance/equity.ts`. Line 2 follows `rateUsed()` (withdrawal when
  typed, else ROIC ÷ 2), not the brief's "the lower of" (Q-W1). Formula unchanged.
- Design `attachments/pf-withdrawal-description-design.md`, spec section 24, AC PF-108..PF-114, Q-W1..Q-W7.

- #132 (PF Overview 12-month range): `average12Label()` in `src/lib/finance/overview.ts` on `summary.months` (household month + 11 before);
  header `pf-ov-avg-head`. Spec section 25, design `attachments/pf-12mo-range-design.md`, AC PF-115..PF-120, Q-M1..Q-M4.
- #140 (PF 12-month average over complete months): `completeMonths(today, 12, tz)` → `summary.window12` drives `average`
  (fill, Future, Future-on coverage) and `average12Label`. Spec section 26, design `attachments/pf-12mo-complete-design.md`, AC PF-121..PF-128, Q-T1..Q-T5.
- #141 Q-T1 (CFO-changed): the 12-month header shows `(N of 12 months)` when fewer than 12 complete months have data, and the dated range only at 12 of 12. Spec 27, PF-129..PF-131.
- #141 PF-132: the 12-month count/expense average counts only months with expense entries (income-only months excluded); `(0 of 12 months)` accepted.
- #143 (PF Save blocked by field errors): `src/lib/finance/field-errors.ts` is the one check for the page (`save()` blocks, note `SAVE_BLOCKED`) and the API (PUT → 400 `{error:"Invalid value.", field}`); never clamp. Spec 28, PF-133..PF-140.
- #146 (PF 12-month averages over the same months): `summarize()` averages income and expenses over the complete months with expense entries; an expense month with no income counts as 0 (Q-U1). Spec 29, PF-143..PF-149.
- #138 (Rate used = lower of WR and ROIC ÷ 2): `rateUsed()` takes the min of the set inputs (0 = not set; a field in error → `—`); `rateSource()` drives the `pf-rate-source` line. Spec 30, PF-150..PF-157.
- #144 (live figures + unsaved indicator): the Overview takes `liveLineFigures()` (the on-screen month and shared values as Save would store them), so every PF figure is live; `pf-unsaved` `Unsaved changes` beside Save follows `dirty`, which only a 2xx save resets. Spec 31, PF-159..PF-170, design `attachments/pf-live-figures-design.md`.
- #130 (ROIC method tooltip): `RoicInfo` in `company-view.tsx` (an `i` button after the ROIC label, `role=tooltip` always in the DOM, visibility-toggled, `aria-describedby`); text `ROIC_METHOD` in `company.ts`; disclosure only. Dashboard-spec §19, CV-16..CV-21.
- #130 Q-T1 (PM short wording): `ROIC_METHOD` is exactly `Operating income after tax ÷ average (equity + debt − cash). Cash excluded.` (CV-22, dashboard-spec §19.1). Q-T2..Q-T4 accepted as built.
- #135 (QA font wait, tools only): `qa/tools/fonts.mjs` `fontsSettled(page)` (fonts.ready + 2 frames; reload while a probe still renders a fallback, max 3 loads). Used by `site-shell.mjs` and `site-style-regression.mjs` before font-dependent measurements; cold-load checks stay cold. Site-style-spec §17, FW-01..FW-05.
- #135 addendum: `fontsSettled` max loads is 5, not 3 (the font is `max-age=0, must-revalidate`, so each reload still round-trips).
- #135 addendum (2026-10-15, QA round 2): `fontsSettled` max loads is 3 again (supersedes 5), with a 1 s settle after each reload.
- #142 (PF money format): `formatMoney` in `src/lib/finance/money.ts` (en-US, exactly 2 decimals, `-0.00` → `0.00`) for every computed PF money figure; `formatAmount` (up to 2, no trailing zeros) stays only for `formatRate`. Spec section 32, PF-175..PF-182.
- #153 (PF saved chart report, backend only): `src/lib/finance/report.ts` (`reportError` / `checkReport`, shared client + API; `missingSeries`) and `/api/personal-finance/report` (GET / PUT / DELETE, read grant, own `personal_finance` row under `orpheus.finance.report.v1`). No migration on purpose: `npm run build` runs `db:migrate` on previews. The record API strips and keeps the report. AC PFR-01..PFR-16; QA `qa/tools/pf-report-api.mjs`.
- #163 (PF any past month): the month control is `Month` (`pf-month`, values `01`..`12`) + `Year` (`pf-month-year`; `pf-year` is already the Future year buttons). `FIRST_MONTH = "2020-01"` in `months.ts` replaces `MONTHS_STORED` (no count limit, no migration). The report range keeps its own 24. Discard confirm only when edited. QA helper `pickMonth(page, key)` in `qa/tools/pf-helpers.mjs`. AC PFM-01..PFM-14.
- #163 addendum (Q-Y6 rejected): `openMonth` copies only for the current month; a past month opens blank. `copyOfCurrent` + `COPY_FROM_CURRENT` (`Copy from current month`, `pf-month-copy`, writer only, empty past month, current month has lines). QA: `blankMonth` / `BLANK_PAST` in `pf-helpers.mjs`. AC PFM-15..PFM-19.
- #165 (keep deleted): `deletedCategories` / `deletedAccounts` `[{ name, from }]` live in the shared expenses value; `asLine` accepts live or deleted names, pickers show live only. `deleteName` (on screen) + `deleteInMonths` (on Save, months `>= from` only; earlier months are the same object). `withoutDeletedFor` on copies, `relinkName` on add, `NAME_DELETED` on rename. Report: `deletedSeries` / `seriesLabels` / `seriesHistory`; API adds `deleted` / `labels`. Testids `pf-delete-category`, `pf-delete-account`.
- #165 `PF_DELETE_UI` (`src/lib/finance/flags.ts`, a code constant): it gates only the Delete buttons and confirm (the `deleteUi` prop on `PersonalFinancePage`; tests pass both values). The KEEP read path, labels and report fields never depend on it.
- #154 (PF historical series, backend only): `src/lib/finance/series.ts` (`seriesQueryError`, `rangeMonths`, `seriesValues`) on the shared `seriesListError` / `rangeError` in `report.ts` (the report keeps its 24-month cap). `POST /api/personal-finance/series` (`handlePersonalFinanceSeriesRequest`, same gate as the report API, owner's record, read-only, no audit). Tests: `series.server.test.ts` (PGlite, both TZs); QA tool `qa/tools/pf-series-api.mjs` (read-only).
- #155 (PF multi-series chart data, backend only): `src/lib/finance/chart.ts` (`chartQueryError`, `chartData`, `stacks`, `fromReport`) on `seriesValues` (#154, unchanged). `POST /api/personal-finance/chart` (`handlePersonalFinanceChartRequest`; `{ saved: true }` reads the caller's own report; 404 `No saved report.`). Tests `chart.server.test.ts` (PGlite, both TZs); QA tool `qa/tools/pf-chart-api.mjs` (read-only); texts `NO_SAVED_REPORT` / `FX_BASIS_CURRENT` in `pf-helpers.mjs`.
- #155 CFO condition (2026-10-17, spec 37.9, PFC-17): `chartData` sets a top-level `mixed_axes` (level + flow present); `chart` stays a string.
- #156 (PF report CRUD, backend only): `src/lib/finance/reports.ts` (`REPORTS_KEY` `orpheus.finance.reports.v1`, `parseNamed`, `checkBody`, `nameTaken`, ids `r-` + 8 hex, `default` = the #153 `REPORT_KEY`). Handlers `handlePersonalFinanceReportsRequest` / `handlePersonalFinanceReportItemRequest`; `readRecord` strips and `writeRecord` keeps both report keys; `/chart` takes `{ saved: true, id }`. Tests `reports.server.test.ts`; QA tool `qa/tools/pf-reports-api.mjs` (read-only unless `QA_WRITE=1`). Rolling back past #156 is unsafe once a named report exists (design note).
- #156 rollback runbook (2026-10-17, CFO pre-merge condition on PR #174): `docs/release/pf-reports-rollback.md`. Do NOT roll back past #174 without first exporting every user's PF report keys (read-only SELECT, dated file, row count); restore is a separate, marked WRITE (`docs/release/pf-reports-rollback.restore.sql`). The SQL is tested on PGlite only (`scripts/pf-reports-rollback.test.mjs`).
- #157 (PF report export stubs, backend only): `src/lib/finance/export.ts` (hand-written PDF / PNG, zero deps), handler `handlePersonalFinanceReportExportRequest`, route `GET /api/personal-finance/reports/:id/export?format=pdf|png` (spec 39, design `attachments/pf-export-design.md`). Tests `export.server.test.ts`; QA tool `qa/tools/pf-export-api.mjs`. QA tools that sign in call `refuseIfProd` (`qa/tools/prod-guard.mjs`; `X-Orpheus-Env` header from `vite.config.ts`).
- Note (2026-10-17, #157 QA F2 / EL): every QA tool that signs in now calls `refuseIfProd` (`qa/tools/prod-guard.mjs`) before any request or sign-in. The 19 tools are `audit`, `dashboard-add`, `dashboard-book`, `dashboard-company`, `dashboard-leaveouts`, `dashboard-list`, `dashboard-metrics`, `dashboard-redesign`, `personal-finance`, `personal-finance-e2e`, `pf-chart-api`, `pf-export-api`, `pf-months`, `pf-report-api`, `pf-reports-api`, `pf-series-api`, `roles`, `site-shell` (also its `--compare-url`) and `site-style-regression`. `scripts/qa-prod-guard.test.mjs` enumerates them by `*_PASSWORD`, so a new sign-in tool must call the guard first. The #157 PNG font covers printable ASCII (exact case, punctuation); see spec 39.10.
- Note (2026-10-17, #157 QA F7, EL option 1): `refuseIfProd` refuses production only when a sign-in env var the tools read (`QA_*_EMAIL` / `QA_*_PASSWORD`, `ORPHEUS_OWNER_EMAIL`) or `QA_WRITE` is set. Otherwise it prints `signed-out prod mode (prod: signed-out only)` and returns `{ signedOutProd: true }`. Tools then skip sign-in and write probes on that mode (session.mjs skips sign-in; fetch and browser contexts block writes and `/api/auth/` as a safety net). When you add a write probe to a QA tool, guard it with `GUARD.signedOutProd`. Tests: `scripts/qa-prod-guard.test.mjs` (faked network, no real traffic).
- Note (2026-10-17, #157 QA F8, EL option 1): signed-out prod mode is inherited by child processes through `ORPHEUS_QA_PROD_MODE=signed-out`, set by the parent before it spawns. Importing `qa/tools/prod-guard.mjs` turns on the GET / HEAD-only backstop when the marker is set. Every tool the runners spawn calls `refuseIfProd`, and signin-page never submits on prod. A new qa/tools file that can sign in or write must import and call the guard; `scripts/qa-tools-session.test.mjs` enforces this. Spec 39.12.
- #158 (PF chart report API contract, backend only, no wire change): the contract `attachments/pf-charts-api-contract.md` is the single source of truth for `/series`, `/chart`, `/reports`, `/reports/:id`, `/reports/:id/export` (and legacy `/report`). Spec 40, AC PFAPI-01..PFAPI-14. Typed client `src/lib/finance/charts-api.ts` (UI code calls this, never raw fetch); e2e and drift test `charts-api.server.test.ts`; live tool `qa/tools/pf-charts-contract.mjs`. When you change a route, update the contract in the same PR. Any wire change is a CFO Q-call first (Q-AE1..). Spec 39.13: zero `/api/auth/` requests reach the server in signed-out prod mode.
- #179 (saved reports: dynamic `all` + range bounds, folds in #173): ONE range validator, `rangeError(range, mode, current)` in `src/lib/finance/report.ts`, with modes `query` (/series, /chart), `save` (every saved-report write) and `stored` (lenient reads, so old stored reports never break). Never freeze `all` at save time; it resolves in `rangeMonths`. Spec 41 (Q-AF1..Q-AF9), contract section 9, AC PFALL-01..PFALL-14, tests `all-range.server.test.ts`.
- #171 (Starting net assets 'as of' month, added 2026-10-17): optional `asOf` in the overview value, with no migration. `asOfMonth` and `netAssetsFrom` in `overview.ts` are the single anchor rule, used by `seriesValues` and `summarize`. Bounds go through the #179 `rangeError` in save mode (`asOfBad` in `field-errors.ts`); the record API returns 400 `Invalid value.` with field `overview.asOf`. With no `asOf`, behaviour must stay exactly as before (regression tests). Spec 42 (Q-AG1..Q-AG12), contract section 11 (11.1 machine-checked), AC PFAO-01..PFAO-18, tests `as-of.server.test.ts`.
- #171 CFO round (added 2026-10-18; supersedes the record-API line above where they differ): the record API now refuses an `overview.asOf` before 2020-01 with 400 `Month can't be before 2020-01.` and one after the current Toronto month with 400 `Month can't be after the current month.` (field `overview.asOf`); a malformed month (or one outside 2000..2100) still gets `Invalid value.`. An `asOf` after the first data month is worked backwards to the first data month (AG1 back-fill; the month before `asOf` = the start). The existing 24-month cap on saved-report ranges (R3/R4 field `report.range`, legacy L1 field `range`) now says `Range can't be longer than 24 months.`; `/series` and `/chart` have no cap. An empty `asOf` is stripped on save. Spec 42.9–42.13; contract 11.2 and 12/12.1; AC PFAO-01..PFAO-26; shared QA checks `qa/tools/pf-asof-checks.mjs`.
- #170 (PF historical FX, added 2026-10-18; Phase 1 only): spec 43, AC PFFX-01..16, Q-AH1..6 NOT built. Facts: PF months already store their own typed line rates (series uses them); the dashboard job stores daily BoC/ECB FX in `fx_rates` (no key; `CRON_SECRET` only). With no historical rate, behaviour must equal today's exactly (`fx_basis: "current"`).
- #170 decisions (added 2026-10-20): BoC Valet via existing `fx_rates` (daily rows; monthly average derived at read time, no migration), backfill from 2020-01 (runbook in docs/release/, run is EL's call), typed-rate fallback; open Q-AH7..12 in spec 43.7; AC PFFX-17..22.
- #170 CFO/QA round (added 2026-10-20): spec 43.8 (`fx_basis` current/historical/mixed + `fx_fallback_months` only when mixed; export lines; page note `Charts and exports use historical FX`) and 43.9 (worked examples, backfill 2020-01-02.., Q-AH13 EL ruling); AC PFFX-17a..22a, PFFX-23..28.
- #170 QA G1–G5 (added 2026-10-20): spec 43.11 (fx_basis scope incl. months before the range for net assets, page note `Charts and exports use Bank of Canada rates where available`); AC PFFX-11b, 23b, 27b, 28b, 30b; contract section 13.
- #184 AG11 (added 2026-10-20, Phase 1): spec 44 (Overview equity coverage, Future off, uses the anchored previous-month net assets when an as-of month is set; no-asOf unchanged; Q-AI1..Q-AI8), AC PFEC-01..12. Not built yet.
- #160 PF Charts reports list (added 2026-10-20, Phase 1): spec 45, AC PFCL-01..14, Q-AJ1..Q-AJ12 NOT built. UI only on R3 `listReports()`; no wire/data-model change.
- #160 built (added 2026-10-20): route `src/routes/personal-finance_.charts.tsx` (same gate as /personal-finance; `NEXT_ALLOWED` gains the exact `/personal-finance/charts`), `charts-page.tsx` (one R3 GET, New report always disabled until #161, page-owned limit note), `reports-list.ts`; DOM test `charts-page.dom.test.tsx`. Spec 45.9/45.10.
- #161 PF Charts builder (added 2026-10-20, Phase 1): spec 46 (server validation mirrored in 46.3), AC PFCB-01..20, Q-AK1..Q-AK15 NOT built. Carry-overs from #160 (19 → New report enabled, no `Builder coming next (#161)`, 409 → `Report limit reached.`) are ACs PFCB-02..04.
- #161 built (added 2026-10-20): routes `personal-finance_.charts_.new.tsx` / `personal-finance_.charts_.$id_.edit.tsx` (edit → `next=/personal-finance/charts`; only `/personal-finance/charts/new` joins `NEXT_ALLOWED`), `charts-builder.tsx` (fake-able `BuilderApi`), `builder.ts` (calls the shared validators); DOM test `charts-builder.dom.test.tsx`. Spec 46.10–46.12.
- #162 PF Charts viewer (added 2026-10-20): spec 47 (47.9 CFO answers + conditions, 47.10 R2 server fix, 47.11 QA R1/R3–R5), AC PFCV-01..16 (`qa/CANONICAL-AC-PACK.md`). Route `src/routes/personal-finance_.charts_.$id.tsx` reuses `ChartsBuilder` (Delete hidden for `default` and Read, in-page confirm, `--color-danger`). Report writes need a write grant (`reportNeed`, `account.server.ts`); tests `reports-write.server.test.ts`.
- #168 PF Delete buttons (added 2026-10-20, Phase 1): spec 48, AC PFDU-01..09, Q-AM1..Q-AM8 NOT built. `PF_DELETE_UI` is a code constant (`src/lib/finance/flags.ts`), not an env var. Gap: on a Read grant the Delete buttons render disabled, not hidden (Q-AM3).
- #166 PF Overview `This month` stable on an unsaved copy (added 2026-10-20, Phase 1): spec 49, AC PFTM-01..14, Q-AN1..Q-AN7 NOT built. Client figure rule only (`lineFigures` / `liveLineFigures`); no harness rule change.
- 2026-10-20 (#vercel-ignore): `vercel.json` `ignoreCommand` runs `scripts/vercel-ignore.mjs`: preview builds are skipped when every changed path is docs-only (`*.md`, `docs/**`, `qa/runs/**`, `qa/evidence/**`); production, `main` and any error always build.
- 2026-10-20 (#200 QA X2): the docs-only preview skip never applies to `public/**` or `src/**`. Those paths always build, even `.md` files, because public files are served.
- #176 PF export Unicode fonts (added 2026-10-21, Phase 1): spec 50 (pointer at 39.14), AC PFU-01..16, Q-AO1..Q-AO10 NOT built. Server-only text rendering in `export.ts`; recommended font Noto Sans subset (OFL 1.1, ~28 KB per weight). No harness rule change.
- 2026-10-21 #176 built (PR #203): PF exports embed Noto Sans subsets (OFL 1.1, `src/lib/finance/fonts/` with `OFL.txt` + `FONTS.md`; regenerate the base64 module with `node scripts/gen-export-fonts.mjs`). A rendering change must regenerate and re-sign-off the golden crops in `qa/evidence/176/` (spec 50.9).
- 2026-10-21: grok.me is retired; production is https://orpheus-app-beta.vercel.app (the only deploy path is Vercel).
- #177 PF records snapshot at deploy (added 2026-10-21, Phase 1): spec 51 (pointer 38.12), AC PFS-01..16, Q-AP1..Q-AP12 NOT built. HARD STOP items (prod DB read at build, new secret `PF_SNAPSHOT_BLOB_TOKEN`, Vercel env) await owner / CFO; no harness rule change yet.
