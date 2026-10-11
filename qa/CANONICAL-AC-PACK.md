<!-- Canonical copy. Seeded 2026-10-02 from QA's box (/workspace/orpheus-app/qa/CANONICAL-AC-PACK.md);
     from now on edit this repo file, not the box copy. Only change since seeding: the "Fixtures:" line
     now points at the repo's qa/fixtures.json. 2026-10-04 (#54): added the "Dashboard: mobile-first redesign"
     section from epic #53; the DCA rows are unchanged. -->
# Canonical AC pack: orpheus-app DCA calculator and dashboard

Source: Chief of Staff relay, 2026-10-02 (Diego-approved direction). Six rules only; no invented ACs.
Report to: Engineering Lead. Live URL: https://orpheus-app-beta.vercel.app. Fixtures: [`qa/fixtures.json`](fixtures.json) in this repo (an empty array counts as a pack defect).

Specs behind each section: the DCA rows, [`attachments/dca-app-spec.md`](../attachments/dca-app-spec.md); site style
(ST rows, epic #66), [`attachments/site-style-spec.md`](../attachments/site-style-spec.md); dashboard (DR rows,
epic #53), [`attachments/dashboard-spec.md`](../attachments/dashboard-spec.md).

| AC | Tier | Rule | Pass when (on the live page) |
|----|------|------|------------------------------|
| DCA-01 | BLOCK | Dividends reinvested | The result reflects reinvested dividends (stated, or visible in the output) |
| DCA-02 | BLOCK | DCA = extra cash on each date | Each scheduled date adds the contribution on top of prior holdings |
| DCA-03 | BLOCK | Lump sum on day one | Starting capital is fully deployed on the start date |
| DCA-04 | BLOCK | Multi-ticker weighted basket | The basket accepts several tickers with weights and applies those weights |
| DCA-05 | BLOCK | US/EU/CA listings only | Tickers outside US/EU/CA are refused or not offered |
| DCA-06 | BLOCK | No buy/sell advice | The page outputs no buy, sell, hold, or recommendation, however it's worded. A missing 'Not a recommendation' disclaimer is intended and is not a fail (Diego rule change via Engineering Lead, 2026-10-02). |

Exact expected numbers need fixtures (tickers, dates, amounts) from the owner. Until those exist, numeric checks are BLOCKED rather than guessed.

## Site style: dark, mobile first (epic #66)

Source of truth: [`attachments/site-style-spec.md`](../attachments/site-style-spec.md) (dark brief, re-scoped by
Diego via CoS and EL, 2026-10-05 21:26 ET; the row text below is copied from its section 11). **A white style was
proposed on 2026-10-05 and dropped at 21:26 ET; dark wins and nothing white gets merged.** The #53 dark style
stands and is extended. Widths: phone 400 × 860, 1024 × 800, 1440 × 900, plus 360 × 780 for the calculator's
phone rows (ST4-08..12, ST4-17, ST4-19..24) and ST4-14 / -15, and home's ST3-01, -02, -05, -06 (#69); phone rules below 1024 px, the wide layout from 1024 px. ST2 (hover) is retired; ST5a (dashboard content) is deferred while #71 is on hold.

**Per-ticket QA:** each ticket's own rows plus a no-regression pass on everything else (the dashboard content
always: ST0-05).

| # | Ticket | Rows | No-regression pass on |
|---|---|---|---|
| 1 | #67 (docs) | ST0-04 | n/a |
| 2 | #68 dark shell | ST1 on every page; ST0-05 | page content everywhere unchanged (calculator, home, sign-in, dashboard) and still AA-readable |
| 3 | #70 calculator | ST0-01..03, ST4 on `/calculator`; ST0-05 | `/`, `/dashboard/sign-in`, `/dashboard` |
| 4 | #69 home | ST0-01..03, ST3 on `/`; ST0-05 | `/calculator` (ST4), sign-in, `/dashboard` |
| 3a | #78 calculator polish | ST0-01..03, ST4 on `/calculator` (ST4-06, -10, -12, -13 amended; ST4-17 field checks, ST4-18 wide layout new); ST0-05 | `/` (ST3), sign-in, `/dashboard` |
| 3b | #80 saved searches | ST0-01..03, ST4 on `/calculator` (ST4-19..24 new: button always visible and closed by default, list of 5 + Load, auto-save, refresh restore (multi-name restore page CLS < 0.1, EL Q18), no auth / `localStorage` only, isolation + clear-site-data) ; ST0-05 | `/` (ST3), sign-in, `/dashboard` |
| 5 | #73 sign-in | ST0-01..03, ST5b-01..05 on `/dashboard/sign-in` (ST5b-04 AA / color-scheme / autofill and ST5b-05 layout / noindex new; `qa/tools/signin-page.mjs`); ST0-05 | `/`, `/calculator`, `/dashboard` |
| 6 | #72 leave-outs + regression | ST6-01..09 (ST6-06 font / strict CLS, -07 punctuation, -08 bar tap targets, -09 dark 404 new; ST3-01 / ST4-01 CLS now strict 0) and every row above except ST5a, shipped pages; `qa/tools/site-style-regression.mjs` | `/dashboard` (ST0-05) |
| 7 | #84 Personal Finance v1.1 + lyre | PF-01..10 on `/personal-finance` (`qa/tools/personal-finance.mjs`); ST1-05 the lyre on every page; EL (≈ 12:05 ET): URL only (Q1 (d): ST1-01 three items, ST3-03 two home lines unchanged), unitless amounts until #87 (Q2), a typed `Equity to cover` overrides #86's calculated amount (Q3, for #86), `__grok/icon-180.png` out of scope (Q4); ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`: `/`, `/calculator`, sign-in, the 404; `$313,000`) |
| 8 | #85 Personal Finance v1.2 income | PF-11..16 new (people, net, counted + share, income table, `% of income` wired); PF-02, -04, -07, -09, -10 amended (`02` Income / `03` Expenses, `% of income` computed, the income key, CLS with people restored); `qa/tools/personal-finance.mjs`; ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`; `$313,000`); #86 / #87 not started. EL (≈ 13:11 ET): Q5–Q8 accepted as built (bonus rating = % of yearly wages; one average tax % per person; one Share (%) per person on each counted line; biweekly = yearly ÷ 26) |
| 9 | #86 Personal Finance v1.3 equity cover | PF-17..20 new (the two household rates and `Rate used`, formula A, the override, the equity key); PF-02, -05, -07, -09 amended (the rate cells' copy, totals = override or calculated, the third key, CLS with rates restored); `qa/tools/personal-finance.mjs`; ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`; `$313,000`); #87 / #94 / #90 / #71 not started; no currency symbol (Q2). EL (≈ 14:12 ET): Q9 bad override → calculated; Q10 no rate → `—` in line and totals; Q11 ROIC no upper cap |
| 10 | #97 home + bar for Personal Finance | ST1-01 (four bar items; 12 px text below 640 px, Q21), ST1-02 (`Personal finance` current on `/personal-finance`), ST3-03 (three Platforms lines, the approved copy; Q22 Dashboard line), ST3-06 (four items on one line on a phone); PF-01 / PF-10 amended (Q1 (d) superseded: nav first-class, URL still works); `qa/tools/site-shell.mjs`, `home-page.mjs`, `personal-finance.mjs`; ST0-05 | every shipped page (`qa/tools/site-style-regression.mjs`; `$313,000`); `/personal-finance` content untouched; #87 / #94 / #98 / #71 not started |
| — | #71 dashboard (on hold) | ST5a deferred | n/a |

### ST0: tokens and the decision

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST0-01 | BLOCK | On every shipped page the page, bar and footer backgrounds compute to `#1e2124` and body text to `#f2f0eb`; no white surface remains on a shipped page (only the hero image itself is light). |
| ST0-02 | BLOCK | Shipped pages use only the section 5 tokens; the green `#5cc08a` appears only on the chart line, the chart fill and the last-value pill; the font is Schibsted Grotesk. |
| ST0-03 | BLOCK | Every text / token pair on a shipped page meets AA on dark (section 5 table: text ≥ 4.5:1, large text and non-text UI such as underlines, focus ring, chart line and pill ≥ 3:1); an axe-core run reports no `color-contrast` violation. |
| ST0-04 | BLOCK | Docs: the decision log records that white was proposed on 2026-10-05 and dropped at 21:26 ET, and that the #53 dark style stands and is extended; no doc says white supersedes dark. (#67) |
| ST0-05 | BLOCK | `/dashboard` content is untouched: only the bar and footer differ from `main`; holdings, chips, book, their styles and data render as before; released and visible; signed-out `/dashboard` still 307s to sign-in; no diff in `src/routes/dashboard.tsx`, `src/components/dashboard/*`, existing token values or `.field` / `.kicker` / `.section`; `qa/tools/dashboard-redesign.mjs --read-only` still passes. "Only the bar and footer differ" is checked by a screenshot compare of the main content (the dashboard's `bg-paper` wrapper, bar and footer hidden) **signed in** against the **base PR's preview** (the PR this one is stacked on; `main`'s preview for a PR on `main`) with the same QA account (`QA_EMAIL` / `QA_PASSWORD`): `qa/tools/site-shell.mjs --base-url <this preview> --compare-url <base PR preview>`, pixel-identical. Never against production: production has no sign-in for QA (EL N7, QA round 1 on #70). |

### ST1: bar and footer on every page (#68)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST1-01 | BLOCK | On every page (`/`, `/calculator`, `/dashboard`, `/dashboard/sign-in`, a 404) one thin charcoal bar (height ≤ 48 px), sticky on scroll: `Orpheus` (with the lyre) left (→ `/`), `Calculator`, `Dashboard` and `Personal finance` right (→ `/calculator`, `/dashboard`, `/personal-finance`), in that order, text only (no icons), no other items, no dropdowns; at 360 and 400 px all four fit on one line with no horizontal page scroll (#97; below 640 px 12 px text, Q21). On `/personal-finance` too. |
| ST1-02 | BLOCK | The current page's item has `aria-current="page"` and a visible mark (chalk and underline; the others dim): exactly one item on `/` (Orpheus), `/calculator`, `/dashboard` and `/dashboard/sign-in` (Dashboard), `/personal-finance` (Personal finance, #97); none on a 404. |
| ST1-03 | BLOCK | On every page the footer is charcoal and its only text is exactly `Orpheus Wisdom`. |
| ST1-04 | BLOCK | One bar component and one footer component serve every page (same markup on `/dashboard` as elsewhere); plain links, so every page reaches every other in one click and `/dashboard` stays server-gated. |
| ST1-05 | BLOCK | (#84) The lyre mark: on every page the bar's `Orpheus` link starts with the inline lyre SVG (20 × 20 px, chalk via `currentColor`, `aria-hidden`), the link text stays exactly `Orpheus`, the bar stays 45 px and the link ≥ 44 px tall; `/favicon.svg` is the lyre (no two-bar geometric mark left); the footer stays exactly `Orpheus Wisdom`. |

### ST3: home `/` (#69)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST3-01 | BLOCK | Charcoal page in the dark shell; under the bar the Jordaens band (*Triumph of Frederick Henry, Prince of Orange*, 1652), `alt` naming it, no visible credit (Q5); source and licence recorded in the repo (`public/hero/home-SOURCE.md`); optimised (`srcset`, AVIF or WebP + JPEG; every file ≤ 300 KB and the largest file served at 1440 px on a 2x screen ≤ 300 KB), served from the app, explicit `width` and `height`. Layout shift measured as ST4-01 (`PerformanceObserver`, every entry counted, cold cache-disabled loads, several runs per width at 360, 400, 1024 and 1440): CLS from the hero = 0 and the page total = 0 (strict, since #72's self-hosted font) on every run. |
| ST3-02 | BLOCK | `01` (small) and the `h1` `Investment driven by research.` sit lower left on the soft wash in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone; sizes in section 8); chalk on the wash ≥ 4.5:1 at the worst pixel. At 360, 400, 1024 and 1440 the prince and the horses are not covered by the text or the wash (with its soft edge). Protected: the prince and the four white chariot horses (with the dark head behind the leftmost); the brown horse on the far right is outside the box and may be partly cropped on phones (EL, 2026-10-10): their region is the figure box per crop in `src/lib/site/home-hero.ts` through the crop and `object-position`, checked by geometry and by a screenshot with both boxes outlined. |
| ST3-03 | BLOCK | `02` `Platforms` follows with exactly the three lines of section 4 (#97; `Calculator` · `Dollar-cost average calculator.` · `Open` → `/calculator`; `Dashboard` · `The portfolio as a business.` · `Open` → `/dashboard`; `Personal finance` · `Income, expenses, and the cover.` · `Open` → `/personal-finance`): full-width rows, a thin rule above each, no boxes (no border box, background or shadow), the same pattern for all three; nothing else between the bar and the footer (no #46 line, no cards). |
| ST3-04 | BLOCK | Home does no calculating (no price requests, no calculator code) and `/?query` still redirects to `/calculator?query`; `noindex` meta and `X-Robots-Tag: noindex, nofollow` unchanged. |
| ST3-05 | BLOCK | The wash box fully contains the bounding boxes of `01` and the title (element and text-line rects) at 360, 400, 1024 and 1440; it hugs the text, anchored lower left (≤ 12 px of padding a side on a phone, ≤ 24 px wide), and takes at most 50% of the band's height at 360 and 400 (as ST4-15). |
| ST3-06 | BLOCK | Phone (360 and 400; phone rules below 1024 px): the phone crop in its band, `min(66.667vw, 480px)`: 240 px at 360, 267 px at 400 (Q17; the ≤ 200 px cap is calculator-only), the title three lines, the Platforms lines one column (name and `Open` on a row, the description under them), every text whole, no horizontal page scroll; the bar's four items on one line (ST1-01). Wide (1024, 1440): the wide crop, each Platforms line one row. |
| ST3-07 | BLOCK | AA on dark for every text on `/` (`01`, title, `02`, `Platforms`, names, descriptions, `Open`; the focus ring ≥ 3:1); an axe-core run reports no `color-contrast` violation; `color-scheme: dark` on `<html>` and `<body>`. |

### ST4: calculator `/calculator` (#70)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST4-01 | BLOCK | Charcoal page in the dark shell; under the bar the Botticelli band (*The Birth of Venus*), `alt` naming it; source and licence recorded in the repo; optimised (`srcset`, AVIF or WebP + JPEG; the largest file served at 1440 px on a 2x screen ≤ 300 KB), served from the app, explicit `width` and `height`. Layout shift (EL, QA round 1 on #70): measured with a `PerformanceObserver` (`layout-shift`, buffered) on load, **every entry counted** (no `hadRecentInput` exclusion), on cold loads with the cache disabled, several runs per width at 360, 400, 1024 and 1440: CLS from the hero (entries with a source inside the band) = 0, and the page total = 0 (strict) on every run (#72: self-hosted font, Q16). |
| ST4-02 | BLOCK | `01` (small) and the `h1` `Dollar-cost average calculator.` sit lower left on the soft wash, in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone; `01` 12 px; sizes in section 7); chalk on the wash ≥ 4.5:1 at the worst pixel. |
| ST4-03 | BLOCK | The fields (tickers with weights, start, end, starting capital, contribution, weekly or monthly) are borderless with a thin underline only (no box border, fill or radius; a 1 px rule `#8b9298` underline, 5.1:1), with visible labels and a visible focus ring (2 px solid chalk, offset 2 px). The select and its `<option>`s carry charcoal `#1e2124` with chalk text (≥ 4.5:1; the page's own colour, so still no visible fill), so the list Chrome opens is dark and readable; `color-scheme: dark` on `<html>` (and `<body>`), so date pickers are dark too (QA round 1, D2). |
| ST4-04 | BLOCK | `US, EU and CA listings, one currency per basket.` (wording unchanged) is one line at 13 px in dim (no wrap at 360 or 400 px, nothing clipped) directly under the form; no other note there (Q2, A11). |
| ST4-05 | BLOCK | One chart with one series (the DCA portfolio value): a green line (2 px), a soft green fill (green at 16%) and the last value in a small green pill (22 px tall, night text on green, same money format as the results); no second chart and no chart note. |
| ST4-06 | BLOCK | (#78) Results are two plan columns, `Lump sum` and `DCA`, each with **exactly four lines** in this order, labels word for word: `Final value` (end value), `Total invested`, `Return (%)` (total return), `CAGR (%)` (the existing CAGR); no money-weighted return, max drop, value at the drop or return to the drop shown; no boxes, no borders around them, no `<table>` (Q12); the regression case shows DCA `Total invested` `$313,000` and each value equals the engine's figure in the results' money / percent format (display only). |
| ST4-07 | BLOCK | No instruction text: the intro paragraph, the swipe hint and the chart scale note are gone (Q2, Q12). |
| ST4-08 | BLOCK | Phone (360 and 400; phone rules below 1024 px): the fields stack, one under another (wide: ST4-18); the field rows span the full width, a basket row's ticker above its weight with the remove control beside the ticker (Q15, A2); the listings note is still one line under the form. |
| ST4-09 | BLOCK | Phone (360 and 400): the chart is full width (the content column's full width, same edges as the fields), with the green line, the soft fill and the pill unclipped. |
| ST4-10 | BLOCK | Results columns (EL A1 / A9; #78): `Lump sum` and `DCA` side by side while each column is ≥ 150 px wide, stacked (Lump sum above DCA) otherwise; expected and checked: two columns at 360 and 400 (and wide). In each column the four lines in order; on a phone each label above its value, from 1024 px label and value on one row; every value whole on one line (`nowrap`), inside its column, nothing clipped, no horizontal scroll. |
| ST4-11 | BLOCK | Phone (360 and 400): the painting is a short band (≤ 200 px tall), with `01` and the title lower left on the wash and Venus visible. |
| ST4-12 | BLOCK | Phone otherwise the same as wide: dark page, Botticelli hero, borderless underlines, green line, fill and pill, label-value results (ST4-01..07 hold at 360 and 400); the wide page (1024, 1440) as ST4-18; no horizontal page scroll at 360, 400, 1024 or 1440. |
| ST4-13 | BLOCK | Logic untouched: `qa/tools/site.mjs` passes (`$313,000`; VOD.L 400 with the exact message, read from under the VOD.L ticker field since #78; it may only change how it finds the value); DCA-01..06 pass; no diff in `src/lib/dca/*` or `src/routes/api/chart.ts`. |
| ST4-14 | BLOCK | (EL A3) At 360, 400, 1024 and 1440 the `01` / title block and its wash (with its soft edge) don't overlap Venus; her region is defined by the crop and `object-position` (the figure box per crop in `src/lib/site/hero.ts`); checked by geometry and by a screenshot with both boxes outlined. |
| ST4-15 | BLOCK | (EL A4) The wash box fully contains the bounding boxes of `01` and the title (element and text-line rects), checked by bounding rect plus screenshot, at 360, 400, 1024 and 1440. (EL N4, QA round 1) The wash hugs the text, anchored lower left (≤ 12 px of padding a side on a phone, ≤ 24 px wide), and takes at most 50% of the band's height at 360 and 400. |
| ST4-16 | BLOCK | (Q6) The primary button `Compare plans` is a chalk fill with night text (14.2:1), radius 0, the section 7 size, a chalk focus ring; while reading prices a dim fill with night text (7.2:1); not green. |
| ST4-17 | BLOCK | (#78) Field checks before the calculation, at 360 and 1440: each case's message (section 4 copy, word for word) sits directly under its field in `#ff8f87` 13 px, the field `aria-invalid` and described by it; every bad field marked at once; no field cleared (each keeps what was typed). Cases: empty basket → `Add a ticker.`; a ticker without a weight → `Enter a weight above 0.`; the same ticker twice → `<T> is already in the basket.` under the second; start or end blank → `Add a start date.` / `Add an end date.`; end on or before start → `End must be after the start.`; starting capital or contribution as text, negative, 0 or blank → `Enter a number above 0.` (decision A: above zero, the engine refuses 0); frequency blank → `Choose weekly or monthly.`; none of these sends a price request. After the prices: VOD.L → `VOD.L lists on LSE. US, EU, and CA listings only.` under VOD.L (HTTP 400); a basket mixing currencies → `<T> trades in <CUR>; this basket is in <CUR>. One currency per basket.` under the other ticker; no result shown. A valid run afterwards shows no field message. |
| ST4-18 | BLOCK | (#78) Wide (1024 and 1440): one column; the basket's ticker / weight / remove rows stacked (≤ 26rem wide); Start, End, Starting capital, Contribution and Frequency in **one row** (same top, left to right), `Compare plans` under them; the listings note one line under the form; the result (chart, then the two plan columns) below the form at full width (same left and right edges as the window row). |
| ST4-19 | BLOCK | (#80) `Saved searches` is a button (`aria-expanded`, `aria-controls`), the form's first control, above `02` Basket and the first Ticker, in the site font with the chalk focus ring; **always visible**, even with nothing saved (EL, Q20); **closed by default** on every load (the panel not rendered or hidden); it opens and closes the panel; at 360, 400, 1024 and 1440. |
| ST4-20 | BLOCK | (#80) Open: newest first, at most 5 lines, each exactly `<TICKERS> · <start> – <end> · DCA <amount>` (section 4) with the search's own contribution (EL, Q19; no `weekly` / `monthly` on the line), then `Load`; each line underlined by a 1 px `#8b9298` rule across the form's full width; empty: `No saved searches yet.` `Load` fills every field (basket rows, tickers, weights, start, end, starting capital, contribution, frequency) word for word as typed for that search (`1,000` stays `1,000`; EL, D1 follow-up), clears field marks and any result, closes the panel, sends no request. No other save control anywhere on the page. |
| ST4-21 | BLOCK | (#80) Saved automatically by a successful calculation only (a field-check or listing refusal saves nothing); the same search again moves to the top (no duplicate line; QA D1 on #81: repeats match on the standard form, tickers trimmed and upper-cased, weights and amounts with commas dropped and read as numbers, so `1,000` and `1000`, `ko` and `KO` are the same search; the list keeps one line, the newest as typed); six different searches leave the newest 5 (the oldest dropped); the `$313,000` regression case still reads `$313,000` and is saved like any search. |
| ST4-22 | BLOCK | (#80) Refresh on the same browser: the fields hold the last search, the list (closed) holds the same ≤ 5 lines; no result until `Compare plans`; calculating keeps the search in the fields. The restore moves nothing in the hero (hero CLS 0); the page shift from extra basket rows is measured and reported and stays under 0.1 (EL, Q18: accepted; the form is not hidden until the restore, the restore is not tap-only). |
| ST4-23 | BLOCK | (#80) No auth, this browser only: signed out with no account, no request to `/api/auth/*` or `/api/dashboard/*` while saving, loading or restoring (only `GET /api/chart` on a calculation); exactly two `localStorage` keys, `orpheus.calculator.last.v1` and `orpheus.calculator.saved.v1`; no cookie set, nothing in `sessionStorage` or IndexedDB from the calculator; the analytics rules unchanged. |
| ST4-24 | BLOCK | (#80) Isolation and clearing: a second browser context (another device) on the same preview sees no list and blank fields; clearing the site's data (`localStorage` cleared, e.g. DevTools "Clear site data" / `Storage.clearDataForOrigin`) and reloading shows `No saved searches yet.` and blank fields. |

### ST5a: dashboard content (#71): ON HOLD, deferred

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST5a-01 | DEFERRED | *(deferred)* Rewritten from the dashboard's new brief when it lands (via CoS). Not checked in this epic; until then ST0-05 applies. |

### ST5b: sign-in `/dashboard/sign-in` (#73)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST5b-01 | BLOCK | Dark: charcoal page, chalk type, underline fields (as ST4-03) using sign-in-only classes; `.field` and `.kicker` unchanged. |
| ST5b-02 | BLOCK | The page shows exactly `Email`, `Password`, the submit button and the `Create an account` link, plus the heading (Q4) and an error line only after a failed attempt; the invite-only note is gone. Create-account mode mirrors it with a `Sign in` link. |
| ST5b-03 | BLOCK | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix in `scripts/release-smoke.mjs`. |
| ST5b-04 | BLOCK | AA on dark at 360, 400, 1024 and 1440: every visible text ≥ 4.5:1 (labels `dim` 7.2:1, submit night on chalk 14.2:1, the error `#ff8f87` 7.3:1); the field underline (`rule`, 5.1:1) and the chalk focus ring ≥ 3:1; `color-scheme: dark` on `<html>` and `<body>`; an autofilled field stays charcoal with chalk text. |
| ST5b-05 | BLOCK | Layout and page rules at 360, 400, 1024 and 1440: no horizontal scroll; fields, submit and link ≥ 44 px tall, the fields the column's full width; title `Sign in · Orpheus Wisdom`, noindex meta and `X-Robots-Tag` unchanged; the shell holds (ST1); no painting or CSS background image. |

### ST6: leave-outs, contrast and regression (#72, shipped pages)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST6-01 | BLOCK | No painting except the Jordaens on home and the Botticelli on the calculator (no artwork `img`, `picture` or CSS `background-image` on sign-in or elsewhere). |
| ST6-02 | BLOCK | No instruction text on the shipped pages: home only hero and Platforms; the calculator only hero, form, note, chart and results (Q2, Q12); sign-in only ST5b-02; the 404 only `Page not found.` |
| ST6-03 | BLOCK | AA on dark on every shipped page (and the 404) at every width, including focus, error and disabled-but-readable states (ST0-03). |
| ST6-04 | BLOCK | The shell holds everywhere: ST1 passes on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` and a 404; ST0-05 passes. |
| ST6-05 | BLOCK | Regression on the preview, then production, at 400 / 1024 / 1440: every ST row except ST5a, DCA-01..06 (`$313,000`), noindex meta + `X-Robots-Tag` on every page, the analytics rules, `release-smoke.mjs`; `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. Runner: `qa/tools/site-style-regression.mjs` (runs every shipped-page tool and the ST6 checks; `--compare-url` for ST0-05 signed in). The dashboard's full regression waits for its new brief. |
| ST6-06 | BLOCK | Self-hosted font (Q16): no request to `fonts.googleapis.com` / `fonts.gstatic.com` on any page; Schibsted Grotesk served from the app (`/fonts/schibsted-grotesk/`, licence and source in the repo), the upright latin file preloaded, `font-display: optional`; the page CLS is a strict 0 on `/`, `/calculator`, `/dashboard/sign-in` and a 404 at 360, 400, 1024 and 1440 on cold loads, every shift counted (EL: a slow first visit may keep the fallback for that view; never a swap that adds CLS). |
| ST6-07 | BLOCK | Punctuation: on the dark pages no text runs with `tnum` (the body sets `zero` only; no `tabular-nums` in the dark pages' classes), so `.` `,` `:` `;` take their normal widths (`research.`, `business:` with no gap); figures stay proportional, result values included (EL: no `tabular-nums` back on); `/dashboard` keeps `main`'s setting. |
| ST6-08 | BLOCK | Bar tap targets (QA N1 on #73): `Orpheus`, `Calculator` and `Dashboard` each ≥ 44 px tall (and ≥ 44 px wide) on every page at 360, 400, 1024 and 1440, the bar still ≤ 48 px (45 px), the text, underline and current mark where they were. |
| ST6-09 | BLOCK | The 404 is dark (charcoal, chalk, the shell's bar with no current item and footer), status 404, and shows only the `h1` `Page not found.` in the content column; the dashboard-off paths serve the same page. |

## Dashboard: mobile-first redesign (epic #53)

Source: epic #53 (architect's brief and acceptance, approved by Diego via Chief of Staff, 2026-10-04), written out
in [`attachments/dashboard-spec.md`](../attachments/dashboard-spec.md) section 0. That section is the source of
truth for tickets 2–6; these IDs are copied from its 0.7 and, if the two ever differ, the spec wins. Run every
row on the PR preview, then on production after the merge, at **phone 400 × 860** and **desktop 1440 × 900**.
Each ticket's PR runs DR0 plus its own block. Old DASH-00..26: kept or superseded per spec 0.8.

Unchanged from this pack: DCA-01..06 above (DCA-06 included: a missing 'Not a recommendation' disclaimer is
intended and is not a fail, on the dashboard too). Brief items in one line each: holdings list is the page
(name, shares, value in base currency, share of the book; tap for the rest; no helper paragraphs; empty state
`Add a holding`); add = ticker + shares, cost optional, blank cost saves, cost and return blank until a cost,
listing check US/EU/CA; metrics = second sheet on phone, right side on wide screens, search adds a chip, chips
remove themselves, rows show kept chips only, defaults Revenue growth 1y / ROIC (1y) / Share of the book,
missing figure `—`; book = one total under the list, donut of the same weights (largest first, Other past ten),
weighted figures for kept chips, dashes left out; leave out Connect broker, K/M/B, ownership toggle, download,
instructions under the table.

### DR0: Every ticket 2–6, both widths

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR0-01 | BLOCK | (From #68, epic #66: the menu and footer follow ST1 below; the dashboard content part of this row still holds.) Dark style unchanged: page, menu, footer and controls use the same colours and fonts as production before the ticket (computed background / text colours match; no light theme, no new accent colour). |
| DR0-02 | BLOCK | Dashboard released: production `/dashboard` signed out → 307 to `/dashboard/sign-in`; `/api/dashboard/status` → 200 `{"dashboard":"enabled"}`. The PR diff touches no env var, `DASHBOARD_ENABLED`, `flag.server.ts` or `vercel.json` env. |
| DR0-03 | BLOCK | Signed-out matrix unchanged: `node scripts/release-smoke.mjs <preview> preview` and `<production> on` pass every check. |
| DR0-04 | BLOCK | Calculator unchanged: `qa/tools/site.mjs` passes ($313,000 for PLTR 50 / TQQQ 50, 2020-10-02..2026-10-01, 1,000 + 1,000 weekly; VOD.L 400 with the exact message); DCA-01..06 pass. |
| DR0-05 | BLOCK | noindex: `robots` meta `noindex, nofollow` and `X-Robots-Tag: noindex, nofollow` on `/dashboard` and `/dashboard/sign-in`. |
| DR0-06 | BLOCK | Referrer and analytics as on `main`: one Analytics mount, page-view URLs without query or hash, no custom events, no other tracker requests; the `Referrer-Policy` header / meta equal `main`'s. |
| DR0-07 | BLOCK | No buy, sell, hold, rating, target, "undervalued" / "overvalued" or recommendation wording on `/dashboard` (signed in, both widths, with and without holdings); no "Not a recommendation" disclaimer (absence is intended, not a fail). |

### DR2: Ticket 2 (#55): holdings list

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR2-01 | BLOCK | At 400 px the holdings list is the page: after the heading and the add form come the list rows; no metrics table beside or inside the list; no horizontal page scroll (`document.documentElement.scrollWidth` ≤ 400). |
| DR2-02 | BLOCK | Each row shows exactly name, shares, value in base currency (full digits, two decimals, code) and share of the book (one decimal %); seed account: weights 24.1 / 54.2 / 21.7 and values match DASH-13. A price-pending row shows `—` for value and share. |
| DR2-03 | BLOCK | Tapping a row opens its detail with ticker, name, shares, average cost, last close + session date, value, cost, return (amount and %), share of the book and the FX line; closing returns to the list. Edit and Delete work from the detail (DASH-07 rules; one DELETE per click). |
| DR2-04 | BLOCK | No helper paragraphs: the "US, EU and CA listings only. Average cost is per share…" paragraph is gone and no other explanatory paragraph is on the page; the as-of line, the out-of-date note and errors are single lines. |
| DR2-05 | BLOCK | Empty state: an account with no holdings shows exactly one line, `Add a holding`, in the list area, and no headers, total or chart. |
| DR2-06 | BLOCK | Base currency select still re-expresses every value and the total (DASH-12) and the setting persists; the as-of line and out-of-date note behave as DASH-25. |
| DR2-07 | BLOCK | At 1440 px the same rows and detail work; the nine-column T07 table is gone. |

### DR3: Ticket 3 (#56): add holding

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR3-01 | BLOCK | The add form has exactly Ticker, Shares, Average cost marked optional, and Add; no help text or placeholder sentences. |
| DR3-02 | BLOCK | Ticker + shares with cost blank saves (API `POST` without `avgCost`, or with `null` / `""`, → 201 with no cost); the row appears and survives a reload. |
| DR3-03 | BLOCK | With no cost, the detail's cost and return are blank (not `0`, `n/m` or `—`); value and share of the book still show and the holding counts in the total and the donut. |
| DR3-04 | BLOCK | Entering a cost via Edit fills cost and return (values as DASH-13 / D8); clearing it blanks them again; cost 0 is accepted (return % `n/m`). |
| DR3-05 | BLOCK | Listing check unchanged: `VOD.L` → "VOD.L lists on LSE. US, EU, and CA listings only."; `TCS.BO` → the BSE message; KO, RY.TO, ASML.AS accepted; a second KO → 409. |
| DR3-06 | BLOCK | Validation: shares ≤ 0 or more than 6 decimals refused; a given cost < 0 or more than 6 decimals refused; other users' holdings unreachable (DASH-06). |

### DR4: Ticket 4 (#57): metrics sheet and chips

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR4-01 | BLOCK | At 400 px the metrics are a second sheet behind the `Holdings` / `Metrics` switch, never beside the list; switching back shows the list unchanged; no horizontal page scroll. |
| DR4-02 | BLOCK | At 1440 px the metrics sheet sits to the right of the list, both visible without switching. |
| DR4-03 | BLOCK | A user with no saved chips sees exactly `Revenue growth 1y`, `ROIC (1y)`, `Share of the book`, in that order. |
| DR4-04 | BLOCK | The search field: typing "gross" offers Gross margin (1y) (and no chip already kept); choosing it adds the chip at the end; it survives a reload. |
| DR4-05 | BLOCK | Each chip's own `×` removes it and its figures from every row (and the book once ticket 5 lands); the change survives a reload, including removing every chip. |
| DR4-06 | BLOCK | Each metrics row shows the holding's name and figures for the kept chips only, in chip order; values equal DASH-16..20 (e.g. KO revenue growth 1y 1.9%, ROIC 17.4%, EPS 3.04 USD, EBIT margin 28.7%, gross margin 61.6%). |
| DR4-07 | BLOCK | A missing figure (RY ROIC, a not-covered name such as MC.PA, a pending check) shows exactly `—`, with no visible reason text next to it. |

### DR5: Ticket 5 (#58): book

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR5-01 | BLOCK | Exactly one total under the list: the total value in base currency (seed account 4,141.21 CAD); no total cost or total return row; the excluded line shows only when a holding has no price or FX rate. |
| DR5-02 | BLOCK | A donut (ring with a hole) of the rows' share of the book: same labels as the rows, largest first, ties by ticker; with 11+ valued holdings the 10 largest plus `Other`; neutral greys; the ticker + % list is present as text. |
| DR5-03 | BLOCK | The metrics sheet's `Book` row shows, for each kept chip, the weighted figure from section 9: DASH-22 set EBIT margin `27.6% · 71% covered`; the EPS chip shows `26.5%` labelled `EPS growth 1y (weighted)`; adding or removing a chip adds or removes its book figure. |
| DR5-04 | BLOCK | Dashes are left out: a holding with `—` for a chip is excluded from that chip's figure (not counted as 0) and counts against coverage; a chip nobody has a figure for shows `—`. |
| DR5-05 | BLOCK | The `Share of the book` chip's book figure is the sum of the valued weights (100.0% ± rounding). |

### DR6: Ticket 6 (#59): leave-outs and regression

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| DR6-01 | BLOCK | No "Connect broker" and no broker link or button anywhere on `/dashboard`, both widths. |
| DR6-02 | BLOCK | No K/M/B: every amount on `/dashboard` shows full digits with thousands separators (no `K`, `M` or `B` suffix on any amount). |
| DR6-03 | BLOCK | No ownership toggle (no switch or toggle about ownership or % owned). |
| DR6-04 | BLOCK | No download: no download / export / CSV button or link. |
| DR6-05 | BLOCK | No instructions under (or above) the list; DR2-04 still holds. Tests in `npm test` keep DR6-01..05 true. |
| DR6-06 | BLOCK | Regression: DR0, DR2..DR5 and every kept DASH ID pass in one run on the preview at both widths, then on production after the merge; `README.md`, `AGENTS.md` and this spec match the shipped page. |

How to run DR6 (#59): `QA_EMAIL=… QA_PASSWORD=… node qa/tools/dashboard-redesign.mjs --base-url <preview> --out <dir> --smoke preview`
(add `--empty` with `QA_EMPTY_EMAIL` / `QA_EMPTY_PASSWORD` for an account with no holdings; `--read-only` on
production skips the add / chip-save tools). It runs at 400, 1024 and 1440 px; DR6-02 also covers shares,
average cost and last close (spec 0.5 item 20).

## Personal Finance (#84 v1.1, #85 v1.2 income, #86 v1.3 equity cover; spec `attachments/personal-finance-spec.md`)

EL decisions (2026-10-11, ≈ 12:05 ET): reached by URL only (no bar item, no home line), amounts unitless until #87,
a typed `Equity to cover` overrides #86's calculated amount, Grok builder assets (`__grok/icon-180.png`) out of scope.
Business user: the CFO. QA at 360 × 780, 400 × 860, 1024 × 800, 1440 × 900 on `/personal-finance` with
`qa/tools/personal-finance.mjs`; the no-regression pass on the shipped pages with `qa/tools/site-style-regression.mjs`
(ST1-05 lyre on every page included). #85 income, #86 equity cover and #87 foreign currency add their rows here.
#86 (EL option A, ≈ 13:57 ET): rate used = the typed withdrawal rate, else portfolio ROIC ÷ 2 (a typed rate never
halved); calculated Equity to cover = yearly expense ÷ (rate ÷ 100); a typed Equity to cover overrides (Q3
implemented); key `orpheus.finance.equity.v1`. EL (≈ 14:12 ET): Q9 a bad override falls back to the
calculated amount; Q10 no usable rate → `—` for a line without a valid override and for any total containing it; Q11
ROIC may exceed 100 (withdrawal rate 0–100).

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| PF-01 | BLOCK | `/personal-finance` renders in the shared dark shell: charcoal page, chalk type, `color-scheme: dark`, the bar (#97: four items, `Personal finance` current; ST1-01 / ST1-02) and footer `Orpheus Wisdom`; title `Personal finance · Orpheus Wisdom`; noindex meta + `X-Robots-Tag`; one Analytics script; no painting; status 200; signed out, no flag. |
| PF-02 | BLOCK | Exact copy (sections 4 and 12): `01`, `Personal finance.`, `02`, `Income` with its copy (section 12), `03`, `Expenses`, (v1.3) `Withdrawal rate (%)`, `Portfolio ROIC (%)`, `Rate used` `—` (section 13), `Fixed`, `Variable`, the seven column labels in order, `↳ Add expense` per group, the totals rows; no other text (no instruction text). |
| PF-03 | BLOCK | Lines: add and remove lines in each group; Name, Monthly, Yearly and Equity to cover are inputs with visible labels; typing Monthly fills Yearly × 12 and typing Yearly fills Monthly ÷ 12; the typed value stays as typed; a bad amount shows `Enter a number, 0 or more.` under its field and counts as 0. |
| PF-04 | BLOCK | Percentages: `% of expenses` per line and per group = monthly ÷ the monthly total of both groups (one decimal, `—` at 0), `Total` `100.0%`; `% of income` per line, group and `Total` = monthly ÷ the monthly counted net income (section 12; one decimal), `—` while that income is 0 (v1.2: e.g. the section 12 example's 11,200 a month: Fixed 1,000 → `8.9%`, 250 → `2.2%`, Fixed total `11.2%`, Variable 100 → `0.9%`, Total `12.1%`). |
| PF-05 | BLOCK | Totals: `Fixed total`, `Variable total` and `Total` sum Monthly, Yearly and Equity to cover exactly (e.g. Fixed 1,000 + 250 monthly and Variable 1,200 yearly → Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200); v1.3: Equity to cover sums each line's valid override or calculated amount, `—` when any line contributes `—` (PF-19). |
| PF-06 | BLOCK | Account: a dropdown per line with `—`, the accounts and `Add account…`; adding one (inline `New account`, `Add`) selects it on that line and offers it on every line in both groups; an empty name shows `Name the account.`; a repeat name (any case) reuses the existing account. |
| PF-07 | BLOCK | Storage: everything typed survives a reload (lines, typed amounts as typed, accounts, selections) from `localStorage` keys `orpheus.finance.expenses.v1`, (v1.2) `orpheus.finance.income.v1` and (v1.3) `orpheus.finance.equity.v1` only; no `/api/*` request, no cookie, no `sessionStorage` / IndexedDB write; a new browser context starts empty; a malformed stored value shows an empty page without an error. |
| PF-08 | BLOCK | Layout: phone (360, 400) lines stacked with labels, no horizontal page scroll; wide (1024, 1440) one row per line in column order with the column labels; every control ≥ 44 px tall; AA for every visible text (axe-core too), a ≥ 3:1 focus mark on every Tab stop; proportional figures (no `tnum`). |
| PF-09 | BLOCK | Strict page CLS 0 on cold loads at every width, every shift counted, both empty and with stored lines (v1.2: and people; v1.3: and rates) restored. |
| PF-10 | BLOCK | Logic and shell untouched elsewhere: the calculator `$313,000`, the dashboard content (ST0-05; no diff under `src/components/dashboard/*`, `src/routes/dashboard.tsx`), sign-in, home (hero + three lines since #97, ST3-03), the bar's four items since #97 (ST1-01), the lyre (ST1-05) and the site-style regression (`qa/tools/site-style-regression.mjs`) pass. |
| PF-11 | BLOCK | (#85) Income copy (section 12.1): `02` `Income`, the person column labels in order, `↳ Add person`, `Remove person`, `Income table` with `Income`, `Biweekly`, `Monthly`, `Yearly`, the line labels `<name> · Wages` / `<name> · Bonus` (`Person <n>` while unnamed) and `Net income`; nothing else. A new page: no people, the table only its `Net income` row at `0`. |
| PF-12 | BLOCK | (#85) People: add and remove; Name, Wages (yearly), Bonus rating (%), Average tax (%) and Share (%) are inputs with accessible labels, Count wages / Count bonus checkboxes (on by default; Share `100` by default); typed values stay as typed; a bad Wages or Bonus rating shows `Enter a number, 0 or more.`, a bad Average tax or Share `Enter a percent from 0 to 100.`, and counts as 0. |
| PF-13 | BLOCK | (#85) Net: each person's `Net (yearly)` = (wages + wages × bonus rating) × (1 − average tax) (e.g. 120,000, 10%, 30% → `92,400`; 80,000, 5%, 25% → `63,000`), shown whatever is counted. |
| PF-14 | BLOCK | (#85) Counted and share: each income line counts its net × the person's share when its box is ticked, 0 when not; the section 12 example (own bonus excluded, spouse at 80%) gives the table `84,000` / `0` / `48,000` / `2,400` yearly and `Net income` `134,400` yearly, `11,200` monthly, `5,169.23` biweekly. |
| PF-15 | BLOCK | (#85) Income table: one row per person per line (Wages, then Bonus) in people order, Biweekly = yearly ÷ 26, Monthly = yearly ÷ 12, Yearly; `Net income` sums them; up to two decimals, no currency symbol (Q2). |
| PF-16 | BLOCK | (#85) `% of income` wired: changing a share, a box, a tax or wages updates every expense line's and total's `% of income` at once (PF-04); with no counted income they show `—`; income survives a reload from `orpheus.finance.income.v1` (malformed → no people, no error); layout, AA, 44 px controls (checkbox rows included) and CLS as PF-08 / PF-09. |
| PF-17 | BLOCK | (#86) Equity cover copy and inputs (section 13): under `03` `Expenses`, before `Fixed`: `Withdrawal rate (%)` and `Portfolio ROIC (%)` (inputs, visible labels, empty on a new page) and `Rate used` (computed: `—` on a new page); typed values stay as typed; a bad or out-of-range withdrawal rate shows `Enter a percent from 0 to 100.`, a bad or negative ROIC `Enter a number, 0 or more.` (alert, `aria-invalid`; Q11: ROIC above 100 is valid, e.g. `150` → `Rate used` `75%`); an invalid rate is no rate (`—`). |
| PF-18 | BLOCK | (#86) Formula A: rate used = the typed withdrawal rate, else ROIC ÷ 2; a typed withdrawal rate is used as typed (never halved) and wins when both are typed; calculated `Equity to cover` = the line's yearly amount ÷ (rate ÷ 100); e.g. ROIC `8` → `Rate used` `4%`, Rent 1,000 a month → `300,000`, Phone 250 a month → `75,000`, Gifts 1,200 a year → `30,000`; then withdrawal rate `5` → `5%`, `240,000` / `60,000` / `24,000`; neither typed, or a rate of 0 → `—`. |
| PF-19 | BLOCK | (#86, Q3 implemented) Override: an empty `Equity to cover` shows the calculated amount as the field's placeholder (dim, AA) and uses it; a valid typed value replaces it on that line only (stored as typed); a bad one shows `Enter a number, 0 or more.` and the line falls back to the calculated amount (Q9; e.g. ROIC 8, Rent `abc` → Fixed `375,000`); clearing it brings the calculated amount back; totals sum each line's valid override or calculated amount (e.g. ROIC 8, Rent override `250,000`: Fixed `325,000`, Variable `30,000`, Total `355,000`); with no usable rate a line without a valid override contributes `—` and so does its total and `Total` (Q10; e.g. no rate, Rent `250,000`, Phone and Gifts empty → `—` / `—` / `—`; every line overridden → the sum); a v1.1 / v1.2 stored line with a typed amount restores as an override. |
| PF-20 | BLOCK | (#86) The rates survive a reload from `orpheus.finance.equity.v1` (malformed → both empty, no error); changing either rate updates every line's placeholder and every total at once; layout (phone: the two fields stacked full width, then `Rate used`; wide: one row of three), 44 px controls, AA, focus ring and CLS as PF-08 / PF-09. |
