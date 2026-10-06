<!-- Canonical copy. Seeded 2026-10-02 from QA's box (/workspace/orpheus-app/qa/CANONICAL-AC-PACK.md);
     from now on edit this repo file, not the box copy. Only change since seeding: the "Fixtures:" line
     now points at the repo's qa/fixtures.json. 2026-10-04 (#54): added the "Dashboard: mobile-first redesign"
     section from epic #53; the DCA rows are unchanged. -->
# Canonical AC pack: orpheus-app DCA calculator and dashboard

Source: Chief of Staff relay, 2026-10-02 (Diego-approved direction). Six rules only; no invented ACs.
Report to: Engineering Lead. Live URL: https://orpheus-app-beta.vercel.app. Fixtures: [`qa/fixtures.json`](fixtures.json) in this repo (an empty array counts as a pack defect).

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
phone rows (ST4-08..12). ST2 (hover) is retired; ST5a (dashboard content) is deferred while #71 is on hold.

**Per-ticket QA:** each ticket's own rows plus a no-regression pass on everything else (the dashboard content
always: ST0-05).

| Day | Ticket | Rows | No-regression pass on |
|---|---|---|---|
| Mon Oct 5 | #67 (docs) | ST0-04 | n/a |
| Mon Oct 5 | #68 dark shell | ST1 on every page; ST0-05 | page content everywhere unchanged (calculator, home, sign-in, dashboard) and still AA-readable |
| Mon Oct 5 | #70 calculator | ST0-01..03, ST4 on `/calculator`; ST0-05 | `/`, `/dashboard/sign-in`, `/dashboard` |
| Sat Oct 10 | #69 home | ST0-01..03, ST3 on `/`; ST0-05 | `/calculator` (ST4), sign-in, `/dashboard` |
| Sun Oct 11 | #73 sign-in | ST0-01..03, ST5b on `/dashboard/sign-in`; ST0-05 | `/`, `/calculator`, `/dashboard` |
| Sun Oct 11 | #72 leave-outs + regression | ST6 and every row above except ST5a, shipped pages | `/dashboard` (ST0-05) |
| On hold | #71 dashboard | ST5a deferred | n/a |

### ST0: tokens and the decision

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST0-01 | BLOCK | On every shipped page the page, bar and footer backgrounds compute to `#1e2124` and body text to `#f2f0eb`; no white surface remains on a shipped page (only the hero image itself is light). |
| ST0-02 | BLOCK | Shipped pages use only the section 5 tokens; the green `#5cc08a` appears only on the chart line, the chart fill and the last-value pill; the font is Schibsted Grotesk. |
| ST0-03 | BLOCK | Every text / token pair on a shipped page meets AA on dark (section 5 table: text ≥ 4.5:1, large text and non-text UI such as underlines, focus ring, chart line and pill ≥ 3:1); an axe-core run reports no `color-contrast` violation. |
| ST0-04 | BLOCK | Docs: the decision log records that white was proposed on 2026-10-05 and dropped at 21:26 ET, and that the #53 dark style stands and is extended; no doc says white supersedes dark. (#67) |
| ST0-05 | BLOCK | `/dashboard` content is untouched: only the bar and footer differ from `main`; holdings, chips, book, their styles and data render as before; released and visible; signed-out `/dashboard` still 307s to sign-in; no diff in `src/routes/dashboard.tsx`, `src/components/dashboard/*`, existing token values or `.field` / `.kicker` / `.section`; `qa/tools/dashboard-redesign.mjs --read-only` still passes. |

### ST1: bar and footer on every page (#68)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST1-01 | BLOCK | On every page (`/`, `/calculator`, `/dashboard`, `/dashboard/sign-in`, a 404) one thin charcoal bar (height ≤ 48 px), sticky on scroll: `Orpheus` left (→ `/`), `Calculator` and `Dashboard` right (→ `/calculator`, `/dashboard`), in that order, no other items, no dropdowns; at 400 px all three fit on one line with no horizontal page scroll. |
| ST1-02 | BLOCK | The current page's item has `aria-current="page"` and a visible mark (chalk and underline; the others dim): exactly one item on `/` (Orpheus), `/calculator`, `/dashboard` and `/dashboard/sign-in` (Dashboard); none on a 404. |
| ST1-03 | BLOCK | On every page the footer is charcoal and its only text is exactly `Orpheus Wisdom`. |
| ST1-04 | BLOCK | One bar component and one footer component serve every page (same markup on `/dashboard` as elsewhere); plain links, so every page reaches every other in one click and `/dashboard` stays server-gated. |

### ST3: home `/` (#69, Sat Oct 10)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST3-01 | BLOCK | Charcoal page in the dark shell; under the bar the Jordaens band (*Triumph of Frederick Henry, Prince of Orange*, 1652), `alt` naming it; source and licence recorded in the repo; optimised, served from the app, explicit `width` and `height`, layout shift 0. |
| ST3-02 | BLOCK | `01` and the `h1` `Investment driven by research.` sit lower left on the soft wash in plain type; at 400, 1024 and 1440 the prince and the horses are not covered by the text or the wash. |
| ST3-03 | BLOCK | `02` `Platforms` follows with exactly the two lines of section 4 (`Calculator` · `Dollar-cost average calculator.` · `Open` → `/calculator`; `Dashboard` · `The portfolio as a business: fundamentals for each name, and the whole.` · `Open` → `/dashboard`); nothing else between the bar and the footer. |
| ST3-04 | BLOCK | Home does no calculating (no price requests, no calculator code) and `/?query` still redirects to `/calculator?query`. |

### ST4: calculator `/calculator` (#70, Mon Oct 5)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST4-01 | BLOCK | Charcoal page in the dark shell; under the bar the Botticelli band (*The Birth of Venus*), `alt` naming it; source and licence recorded in the repo; optimised (`srcset`, AVIF or WebP + JPEG, ≤ 300 KB at 1440), served from the app, explicit `width` and `height`, layout shift 0. |
| ST4-02 | BLOCK | `01` (small) and the `h1` `Dollar-cost average calculator.` sit lower left on the soft wash, in plain type (site font, normal weight, no all caps or effects, ≤ 48 px at 1440 and ≤ 32 px on a phone); chalk on the wash ≥ 4.5:1 at the worst pixel. |
| ST4-03 | BLOCK | The fields (tickers with weights, start, end, starting capital, contribution, weekly or monthly) are borderless with a thin underline only (no box border, fill or radius; underline ≥ 3:1), with visible labels and a visible focus ring. |
| ST4-04 | BLOCK | `US, EU and CA listings, one currency per basket.` is one line (no wrap at 360 or 400 px) directly under the form; no other note there (Q2). |
| ST4-05 | BLOCK | One chart with one series (the DCA portfolio value): a green line, a soft green fill and the last value in a small green pill (night text on green, same money format as the results); no second chart and no chart note. |
| ST4-06 | BLOCK | Results are `Lump sum` and `DCA` as label-value rows with the existing metric labels; no boxes, no borders around them, no `<table>` (Q12); the regression case shows DCA `Total invested` `$313,000`. |
| ST4-07 | BLOCK | No instruction text: the intro paragraph, the swipe hint and the chart scale note are gone (Q2, Q12). |
| ST4-08 | BLOCK | Phone (360 and 400): the fields stack, one under another, each full width (a basket row's ticker above its weight, Q15); the listings note is still one line under the form. |
| ST4-09 | BLOCK | Phone (360 and 400): the chart is full width (the content column's full width, same edges as the fields), with the green line, the soft fill and the pill unclipped. |
| ST4-10 | BLOCK | Phone (360 and 400): Lump sum and DCA sit in two columns when they fit (every value whole on one line, nothing clipped, no horizontal scroll; labels may wrap) and stack (Lump sum above DCA) only when they don't. |
| ST4-11 | BLOCK | Phone (360 and 400): the painting is a short band (≤ 200 px tall), with `01` and the title lower left on the wash and Venus visible. |
| ST4-12 | BLOCK | Phone otherwise the same as wide: dark page, Botticelli hero, borderless underlines, green line, fill and pill, label-value results (ST4-01..07 hold at 360 and 400); the wide page (1024, 1440) as briefed; no horizontal page scroll at 360, 400, 1024 or 1440. |
| ST4-13 | BLOCK | Logic untouched: `qa/tools/site.mjs` passes (`$313,000`; VOD.L 400 with the exact message; it may only change how it finds the value); DCA-01..06 pass; no diff in `src/lib/dca/*` or `src/routes/api/chart.ts`. |

### ST5a: dashboard content (#71): ON HOLD, deferred

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST5a-01 | DEFERRED | *(deferred)* Rewritten from the dashboard's new brief when it lands (via CoS). Not checked in this epic; until then ST0-05 applies. |

### ST5b: sign-in `/dashboard/sign-in` (#73, Sun Oct 11)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST5b-01 | BLOCK | Dark: charcoal page, chalk type, underline fields (as ST4-03) using sign-in-only classes; `.field` and `.kicker` unchanged. |
| ST5b-02 | BLOCK | The page shows exactly `Email`, `Password`, the submit button and the `Create an account` link, plus the heading (Q4) and an error line only after a failed attempt; the invite-only note is gone. Create-account mode mirrors it with a `Sign in` link. |
| ST5b-03 | BLOCK | The auth logic is unchanged: sign-in, sign-up (allow-list), the redirect to `/dashboard`, the signed-out matrix in `scripts/release-smoke.mjs`. |

### ST6: leave-outs, contrast and regression (#72, Sun Oct 11, shipped pages)

| AC | Tier | Pass when (on the preview / live page) |
|----|------|------------------------------|
| ST6-01 | BLOCK | No painting except the Jordaens on home and the Botticelli on the calculator (no artwork `img`, `picture` or CSS `background-image` on sign-in or elsewhere). |
| ST6-02 | BLOCK | No instruction text on the shipped pages: home only hero and Platforms; the calculator only hero, form, note, chart and results (Q2, Q12); sign-in only ST5b-02. |
| ST6-03 | BLOCK | AA on dark on every shipped page at every width, including focus, error and disabled-but-readable states (ST0-03). |
| ST6-04 | BLOCK | The shell holds everywhere: ST1 passes on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` and a 404; ST0-05 passes. |
| ST6-05 | BLOCK | Regression on the preview, then production, at 400 / 1024 / 1440: every ST row except ST5a, DCA-01..06 (`$313,000`), noindex meta + `X-Robots-Tag` on every page, the analytics rules, `release-smoke.mjs`; `README.md`, `AGENTS.md`, this spec and the QA pack match the shipped site. The dashboard's full regression waits for its new brief. |

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
