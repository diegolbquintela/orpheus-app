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
| DR0-01 | BLOCK | Dark style unchanged: page, menu, footer and controls use the same colours and fonts as production before the ticket (computed background / text colours match; no light theme, no new accent colour). |
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
