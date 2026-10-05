# Orpheus dashboard (signed-in area): spec

Status: **APPROVED 2026-10-02. All decisions D1–D13 are decided** (see
[13. Decisions record](#13-decisions-record)). D8, D9 and D12 were approved as recommended.
[Amendment A: daily-close source](#14-amendment-a-daily-close-source) is decided as **D13: stay at $0,
with Yahoo as the primary source behind `DailyCloseProvider`, each close cached once in Neon, and Alpha
Vantage's free tier as the fallback**. Ticket T01 (#9, feature flag) is merged via PR #26. Storage, T02
(#10), is in progress in PR #28.

Date: 2026-10-02. All provider facts below were checked on the provider's own page on 2026-10-02, and
each one has its link inline. When a provider page does not say something, this document says
"not stated on provider page" and does not guess.

Spec PR: #8. Tickets: see [Tickets](#tickets).

**Redesign 2026-10-04 (epic #53, mobile first):** [section 0](#0-redesign-mobile-first-epic-53-source-of-truth-for-tickets-26)
is the source of truth for the dashboard's page, add form, metrics and book in tickets 2–6 (#55–#59). It
wins over sections 1, 9 and 12 where they differ (the old acceptance IDs are mapped in 0.8). The data math
below (prices, FX, fundamentals, metric formulas, weighting) is unchanged.

**Update 2026-10-04 (#46, site redesign):** the site has three routes: home `/` (one line, two cards), the
calculator at `/calculator` and this dashboard at `/dashboard`, with a menu and the footer "Orpheus Wisdom" on
every page (`attachments/dca-app-spec.md`, "Site and routes"). Dashboard behaviour is unchanged: still gated by
`DASHBOARD_ENABLED`, signed out `/dashboard` redirects to `/dashboard/sign-in`. Production serves the dashboard
as of 2026-10-04 (issue #46; read-only smoke the same day); the flip itself isn't recorded in this repo.

**Analytics (#48):** Vercel Web Analytics counts anonymous page views of `/dashboard` and `/dashboard/sign-in` like
any other page (path only, query strings stripped, no cookies, no custom events). No email, ticker, holding or
user id is sent. Why: to see which tools get used.

## 0. Redesign: mobile first (epic #53). Source of truth for tickets 2–6

**This section is the source of truth for tickets 2–6 of epic #53** (#55 holdings list, #56 add holding,
#57 metrics sheet and chips, #58 book, #59 leave-outs and regression). Where it differs from sections 1–12
below, this section wins; the older sections stay as the record of how the data is computed (prices, FX,
fundamentals, metric formulas, weighting), and that math does not change. Approved by Diego (via Chief of
Staff) on 2026-10-04 as epic #53; ticket 1 (#54) wrote this section, `AGENTS.md`, `README.md` and the
dashboard part of `qa/CANONICAL-AC-PACK.md`. No app code changed in ticket 1.

### 0.1 The brief (verbatim from the architect, #53)

> Mobile first, then web.
> Phone: holdings list is the page. Metrics are a second sheet, not a table beside the list. Wide screen: that sheet sits on the right.
> Holdings row: name, shares, value in base currency, share of the book. Tap a row for the rest. No helper paragraphs. Empty state is one line: add a holding.
> Add: ticker and shares only. Average cost is optional. Blank cost still saves. Cost and return stay blank until a cost is entered. Listing check unchanged: US, EU, and Canada only.
> Metrics: a search field adds a chip. A chip removes itself. The row shows only kept chips. Default chips: revenue growth 1 year, ROIC 1 year, share of the book. A missing figure is a dash, not a sentence.
> Book: one total under the list. Donut of the same weights, largest first, Other past ten names. Weighted figures for the selected chips. A dash is left out, not counted as zero.
> Leave out: Connect broker, K/M/B, ownership toggle, download, instructions under the table.

Rules from #53: no hires; the visual style doesn't change (same dark desk); the dashboard stays released
(`DASHBOARD_ENABLED` and every env var untouched); harness first, then specs, then the work; small tickets,
one draft PR each as proof of start; QA on the preview before merge, then on production after merge.

### 0.2 What the page is

Widths: **phone first, about 400 px** (QA uses 400 × 860), then **wide screen, 1024 px and up** (QA uses
1440 × 900). Below 1024 px the page is one column; at 1024 px and up the list and the metrics sheet sit side
by side.

**Holdings list (the page).** Signed in, `/dashboard` opens on the list of holdings, one row per holding,
ordered by ticker as today.

- A row shows exactly four things: **name** (the stored company name; the ticker until a name is stored),
  **shares**, **value in base currency** (full amount with thousands separators and two decimals plus the
  code, e.g. `997.01 CAD`) and **share of the book** (one decimal, e.g. `24.1%`). Nothing else in the row.
  A holding without a price or FX rate yet shows `—` for value and share.
- **Tap (or click) a row for the rest:** a detail panel for that holding with ticker, name, shares, average
  cost (listing currency, or blank), last close with its session date (listing currency), value and cost
  (base), return (amount in base, % in listing currency), share of the book, the FX rate line (with
  "previous rate" when it fell back) and the **Edit** (shares, average cost) and **Delete** controls. Tapping
  the row again, or the panel's close control, returns to the list. Delete keeps the #38 guard (one DELETE
  per click).
- **No helper paragraphs:** the explanatory paragraph that sits above today's table ("US, EU and CA
  listings only. Average cost is per share…") goes, and no other block of explanatory prose replaces it.
  Single data lines stay: the as-of line ("Prices as of … close · FX …"), the out-of-date note, error
  messages, the excluded-holdings line under the total and, on previews only, the refresh button and the
  database status line.
- **Empty state:** with no holdings the list area shows one line, `Add a holding`, and nothing else (no
  headers, no total, no donut).
- The base-currency select (CAD default, USD, EUR; DASH-12) stays, as one compact control at the top of
  the list.

**Add.** One form above the list: **Ticker**, **Shares**, **Average cost (optional)**, **Add**. No
placeholder sentences or help text.

- Ticker and shares are required (shares > 0, up to 6 decimals). Average cost may be left blank; when given
  it must be ≥ 0 with up to 6 decimals. **A blank cost saves.**
- Blank cost is stored as "no cost" (not as 0). Until a cost is entered, the holding's **cost and return
  stay blank** (empty, not `0`, not `n/m`). Its value, share of the book, metrics and its weight in the book
  are computed as for any other holding. Entering a cost later (Edit) fills cost and return; clearing it
  blanks them again. A cost of 0 is still a real cost (return % `n/m`, as today).
- **Listing check unchanged:** US, EU and Canada only, with the calculator's exact `listingError()`
  messages (DASH-08); duplicate ticker 409; 200 holdings per user.

**Metrics sheet.** On a phone the metrics are a **second sheet**, reached with a two-way switch at the top
of the page (`Holdings` | `Metrics`); they're never a table beside the list. At 1024 px and up the sheet
**sits on the right** of the list and the switch isn't needed.

- The sheet has a **search field** and a row of **chips**. Typing in the search field offers the metrics
  whose label matches and that aren't already chips; choosing one **adds a chip** at the end.
- Each chip has its own remove control (`×`, accessible name "Remove <label>"): **a chip removes itself**,
  and its figures leave every row and the book.
- The sheet has one row per holding (same order as the list): the holding's name, then a figure **for each
  kept chip only**, in chip order.
- **Default chips:** `Revenue growth 1y`, `ROIC (1y)`, `Share of the book`.
- Searchable chips: the eight existing metrics (Revenue growth 1y, Revenue CAGR 3y / 5y / 10y, ROIC (1y),
  EPS (1y), EBIT margin (1y), Gross margin (1y)) plus `Share of the book`.
- Chips are saved per user, like today's metric columns.
- **A missing figure is a dash, not a sentence:** a figure that is not meaningful, not covered,
  insufficient history or data, coverage check pending or not computed yet shows exactly `—`. The reason may
  stay in the tooltip / accessible name; it is never visible text beside the dash.

**Book.**

- **One total under the list:** the total value in base currency (Σ value of the valued holdings, as
  today's `holdings-total`). When holdings are left out for no price or FX rate, the one-line note "1 holding
  without a price excluded" / "N holdings without a price excluded" stays under it.
- **A donut of the same weights** under the total: the same slices as today's pie (`pieSlices()`: share of
  the book per holding), **largest first**, ties by ticker, **Other past ten names** (10 largest + Other),
  neutral greys, labels ticker + % from the same formatter as the rows, with the ticker + % list as the text
  alternative.
- **Weighted figures for the selected chips:** a `Book` row at the foot of the metrics sheet shows, for each
  kept chip, the market-value-weighted figure from section 9 (T14, unchanged), e.g. `27.6% · 71% covered`;
  the EPS chip's book figure is the weighted 1-year EPS growth, labelled `EPS growth 1y (weighted)` (D9).
  Adding or removing a chip adds or removes its book figure.
- **A dash is left out, not counted as zero:** holdings showing `—` for a chip are excluded from that chip's
  weighted figure and count against its coverage; nothing covered shows `—`.

### 0.3 Leave out

Not on the dashboard, at any width: **Connect broker** (no broker link or button of any kind), **K/M/B**
(no abbreviated amounts: every amount shows full digits with thousands separators, never `1.2M`),
**ownership toggle**, **download** (no download or export button or link), **instructions under the
table** (no instructions under or above the list). As of `main` 46840be only the instructions exist
(the helper paragraph above the table); ticket 2 removes it and ticket 6 adds tests that keep all five out.

### 0.4 Unchanged

- The **dark visual style** (same desk: colours, fonts, spacing tokens; no new theme, no new colours beyond
  the neutral greys already used).
- The dashboard **stays released**: production serves `/dashboard`; `DASHBOARD_ENABLED`, the flag code and
  every env var are untouched by every ticket.
- The **signed-out matrix**: `/dashboard` → 307 to `/dashboard/sign-in`, sign-in page 200, per-user APIs
  401 JSON, other methods 405 JSON (`scripts/release-smoke.mjs`, `check:dashboard-built`).
- The **calculator** at `/calculator` (DCA-01..06, the **$313,000** regression in `qa/tools/site.mjs`,
  VOD.L 400 with the exact message).
- **noindex** (meta and `X-Robots-Tag`) on every page.
- The **referrer and analytics rules on `main`**: Vercel Web Analytics page views only, query strings
  stripped, no custom events, no other trackers; whatever `Referrer-Policy` rule `main` carries when the
  ticket lands (#50 adds `no-referrer`). Writes keep using `fetch()`, never a plain HTML form post.
- **No buy/sell wording:** no buy, sell, hold, rating, target, "undervalued" / "overvalued" or
  recommendation copy anywhere; no "Not a recommendation" disclaimer either (its absence is intended).
- The data rules: stored closes and rates only on page loads (DASH-14), D8 cost FX, section 9 weighting,
  the metric formulas (section 8), the as-of line and out-of-date note (DASH-25).

### 0.5 Interpretations (where the brief is ambiguous, the simplest reading)

1. **Spec location.** The brief names `docs/dashboard-spec.md`; the spec has always lived at
   `attachments/dashboard-spec.md`, and code comments, `README.md`, `AGENTS.md` and QA logs link there. It
   is updated in place; no move.
2. **Share of the book** = the holding's value ÷ the total value of valued holdings, in base currency:
   today's "% of portfolio" (`formatPortfolioPct`), renamed. As a **chip** it shows the same figure per row
   in the metrics sheet; its book figure is the sum of the valued weights (100.0%).
3. **Existing metric columns become chips.** The eight metric columns are the chip catalog, plus Share of
   the book. The D9 EPS growth stays the EPS chip's book figure, not a chip of its own. Reordering (DASH-15)
   is dropped: a new chip goes at the end.
4. **Chip storage and defaults.** Chips are saved per user through the existing column storage
   (`user_metric_columns`, `/api/dashboard/columns`). A user with nothing saved gets the three defaults; an
   account that already saved metric columns keeps them as its chips (**decided, EL 2026-10-04**). Removing every chip must stick
   (ticket 4 picks the mechanism; if it needs a schema change, that's a new migration, never an edit).
   **Landed in ticket 4 (#57):** `migrations/0009_metric_chips_saved.sql` adds the nullable
   `user_settings.metric_chips_saved_at` (`ADD COLUMN IF NOT EXISTS`, a no-op on re-run). `NULL` and no
   `user_metric_columns` rows = never saved → the defaults; any saved row, or a set timestamp, = saved, so an
   empty list sticks. A list emptied before 0009 (no rows, no timestamp) can't be told apart from "never
   saved" and gets the defaults.
5. **Detail on tap** = the holding's T07 fields (listed in 0.2) plus Edit and Delete, in a panel that opens
   under the row (or as a sheet) at both widths.
6. **Row name** = `instruments.name`; the ticker until a name is stored. The ticker itself shows in the detail.
7. **Blank cost** is stored as no cost (`NULL`), distinct from 0; ticket 3 needs a new migration (the next
   number) that makes `holdings.avg_cost` nullable, keeping `CHECK (avg_cost >= 0)` for given values (EL
   2026-10-04: fine if nullable and idempotent, and tested with `check:dashboard-built --with-database`; the
   same applies to any ticket 4 migration). Blank
   cost and return show as empty, not as a dash (the dash rule is for metric figures). **Landed in ticket 3
   (#56):** `migrations/0008_holdings_avg_cost_nullable.sql` (`ALTER COLUMN avg_cost DROP NOT NULL`, a no-op
   on re-run); existing rows are not converted (a stored 0 stays a real cost of 0). The API takes a missing,
   `null` or blank `avgCost` on `POST` as no cost. **Changed in ticket 4 (#57, EL 2026-10-04):** on `PUT`
   (edit) an omitted `avgCost` leaves the stored cost unchanged, only an explicit `null` clears it, a number
   sets it, and a blank string is refused (400, field `avgCost`); the page always sends an explicit value
   (`null` when the field is blank). Portfolio
   cost / return aggregates (not shown on the page, item 9) sum only holdings that have a cost and are `null`
   when none has one; value, weight, the total and the pie count every valued holding.
17. **Compact add form (ticket 3, EL scope 2026-10-04):** one tight row at every width (Ticker, Shares,
   Average cost, Add on one line, about 62 px tall at 400 px), not a collapsed control, so it doesn't push the
   list down and needs no extra tap. Below 1024 px the cost label reads `Avg cost` with the placeholder
   `optional` (the full `Average cost (optional)` doesn't fit a quarter of a phone row), and from 1024 px the
   label reads `Average cost (optional)`. **QA N3 (#58):** the accessible name comes from the visible label so
   it always contains it: `Avg cost (optional)` below 1024 px (` (optional)` visually hidden),
   `Average cost (optional)` from 1024 px (no `aria-label` overriding it). The old
   ticker placeholder (`e.g. KO, RY.TO, ASML.AS`) is dropped (DR3-01: no placeholder sentences).
8. **Second sheet** = a two-way `Holdings` | `Metrics` switch below 1024 px; side by side (list left,
   metrics right) at 1024 px and up. The 1024 px breakpoint is **decided (EL 2026-10-04)**.
9. **"One total"** = the total value only. The total-cost and total-return cells of today's total row leave
   the page (per-holding cost and return stay in the detail, blank until a cost is entered). **Decided (EL
   2026-10-04)**; landed with ticket 2 (#55), see 0.9.
10. **Donut** = today's pie slices rendered with an inner radius. The "price pending" / "FX pending" lists
    under the chart go (those holdings show `—` in the list and are counted in the excluded line under the
    total); with no priced holding the donut is absent and the total shows `—`.
11. **Dash everywhere**: metric cells and book figures show `—` alone; the book's `· N% covered` suffix stays
    on a figure, and 0% coverage shows `—` (was `— · 0% covered`). Landed in ticket 5 (#58).
18. **Book row details (ticket 5, #58):** the coverage suffix stays as T14 shows it (`27.6% · 71% covered`,
    whole %, never rounded to 0% / 100% unless exact), on every % chip and the EPS chip; the figure and its
    coverage wrap as two parts on a narrow sheet, never inside a part. The `Share of the book` chip shows the
    sum of the valued weights (`100.0%`) with no coverage suffix (it always covers every valued holding).
    The donut's caption is `Share of the book (<base>)` (was `% of portfolio (<base>)`, item 2's rename). With
    no valued holding there is no donut and no sentence in its place (the total shows `—`).
19. **Non-number cost (QA N2, #58):** an `avgCost` of the wrong JSON type (`true`, `{}`, `[]`, a non-finite
    number) gets `Average cost must be a number with at most 6 decimals.` on `POST` and `PUT` (it used to get
    `Average cost is required.`); missing / `null` / blank keep their #56 / #57 meaning. `shares` of the wrong
    type gets its number message the same way.
12. **Kept controls not named in the brief:** base-currency select, as-of line, out-of-date note, sign-out,
    preview-only refresh button and database status line. They are data or controls, not helper paragraphs.
13. **Leave-outs that don't exist** (Connect broker, K/M/B, ownership toggle, download) are "must stay
    absent"; ticket 6 adds tests for them. K/M/B applies to the dashboard; the calculator's chart axis
    (`compactMoney`) is part of the unchanged calculator.
14. **T07 / T14 / T15 mapping.** T07 (valuation, D8, as-of, out-of-date) keeps its math; its columns move to
    the row (four fields) and the detail, and its total row shrinks to one total. T14 (weighted aggregates,
    coverage, D9) keeps its math and moves to the `Book` row of the metrics sheet. T15 (pie) keeps
    `pieSlices()` and becomes the donut.
15. **Edit** in the detail changes shares and average cost (cost can be cleared to blank); the ticker still
    can't be edited.
16. **Empty-state text** is exactly `Add a holding` (**decided, EL 2026-10-04**).

### 0.6 Tickets

| Ticket | Issue | Scope | Acceptance |
|---|---|---|---|
| 1 | #54 | Harness + specs: `AGENTS.md`, this section, `README.md`, `qa/CANONICAL-AC-PACK.md`. No app code | This PR's docs; DR0 unchanged |
| 2 | #55 | Holdings list as the page (phone first): four-field rows, tap for detail, one-line empty state, helper paragraph removed | DR0, DR2-01..07 |
| 3 | #56 | Add holding: ticker + shares, optional cost, blank cost saves, cost/return blank, listing check unchanged (needs the nullable-cost migration) | DR0, DR3-01..06 |
| 4 | #57 | Metrics sheet and chips: second sheet / right side, search adds chips, chips remove themselves, defaults, dashes | DR0, DR4-01..07 |
| 5 | #58 | Book: one total, donut, weighted figures for kept chips, dashes excluded | DR0, DR5-01..05 |
| 6 | #59 | Remove the leave-outs, regression and docs pass | DR0, DR6-01..06 |

Each ticket: one PR off the latest `main`, draft first, CI green, QA on the preview at 400 px and 1440 px,
Engineering Lead merges, QA re-checks production.

### 0.7 Acceptance (QA, on the preview, then production; phone 400 × 860 and desktop 1440 × 900)

Seed account for value checks: KO, ASML.AS and RY.TO in CAD (the DASH-13 hand check: total 4,141.21 CAD,
weights 24.1 / 54.2 / 21.7) on a preview after a refresh run; the DASH-22 set (KO, ASML.AS, RY.TO, PHG,
MC.PA) for book figures.

**DR0: every ticket 2–6, both widths**

| ID | Pass when |
|---|---|
| DR0-01 | Dark style unchanged: page, menu, footer and controls use the same colours and fonts as production before the ticket (computed background / text colours match; no light theme, no new accent colour). |
| DR0-02 | Dashboard released: production `/dashboard` signed out → 307 to `/dashboard/sign-in`; `/api/dashboard/status` → 200 `{"dashboard":"enabled"}`. The PR diff touches no env var, `DASHBOARD_ENABLED`, `flag.server.ts` or `vercel.json` env. |
| DR0-03 | Signed-out matrix unchanged: `node scripts/release-smoke.mjs <preview> preview` and `<production> on` pass every check. |
| DR0-04 | Calculator unchanged: `qa/tools/site.mjs` passes ($313,000 for PLTR 50 / TQQQ 50, 2020-10-02..2026-10-01, 1,000 + 1,000 weekly; VOD.L 400 with the exact message); DCA-01..06 pass. |
| DR0-05 | noindex: `robots` meta `noindex, nofollow` and `X-Robots-Tag: noindex, nofollow` on `/dashboard` and `/dashboard/sign-in`. |
| DR0-06 | Referrer and analytics as on `main`: one Analytics mount, page-view URLs without query or hash, no custom events, no other tracker requests; the `Referrer-Policy` header / meta equal `main`'s. |
| DR0-07 | No buy, sell, hold, rating, target, "undervalued" / "overvalued" or recommendation wording on `/dashboard` (signed in, both widths, with and without holdings); no "Not a recommendation" disclaimer (absence is intended, not a fail). |

**Ticket 2 (#55): holdings list**

| ID | Pass when |
|---|---|
| DR2-01 | At 400 px the holdings list is the page: after the heading and the add form come the list rows; no metrics table beside or inside the list; no horizontal page scroll (`document.documentElement.scrollWidth` ≤ 400). |
| DR2-02 | Each row shows exactly name, shares, value in base currency (full digits, two decimals, code) and share of the book (one decimal %); seed account: weights 24.1 / 54.2 / 21.7 and values match DASH-13. A price-pending row shows `—` for value and share. |
| DR2-03 | Tapping a row opens its detail with ticker, name, shares, average cost, last close + session date, value, cost, return (amount and %), share of the book and the FX line; closing returns to the list. Edit and Delete work from the detail (DASH-07 rules; one DELETE per click). |
| DR2-04 | No helper paragraphs: the "US, EU and CA listings only. Average cost is per share…" paragraph is gone and no other explanatory paragraph is on the page; the as-of line, the out-of-date note and errors are single lines. |
| DR2-05 | Empty state: an account with no holdings shows exactly one line, `Add a holding`, in the list area, and no headers, total or chart. |
| DR2-06 | Base currency select still re-expresses every value and the total (DASH-12) and the setting persists; the as-of line and out-of-date note behave as DASH-25. |
| DR2-07 | At 1440 px the same rows and detail work; the nine-column T07 table is gone. |

**Ticket 3 (#56): add holding**

| ID | Pass when |
|---|---|
| DR3-01 | The add form has exactly Ticker, Shares, Average cost marked optional, and Add; no help text or placeholder sentences. |
| DR3-02 | Ticker + shares with cost blank saves (API `POST` without `avgCost`, or with `null` / `""`, → 201 with no cost); the row appears and survives a reload. |
| DR3-03 | With no cost, the detail's cost and return are blank (not `0`, `n/m` or `—`); value and share of the book still show and the holding counts in the total and the donut. |
| DR3-04 | Entering a cost via Edit fills cost and return (values as DASH-13 / D8); clearing it blanks them again; cost 0 is accepted (return % `n/m`). |
| DR3-05 | Listing check unchanged: `VOD.L` → "VOD.L lists on LSE. US, EU, and CA listings only."; `TCS.BO` → the BSE message; KO, RY.TO, ASML.AS accepted; a second KO → 409. |
| DR3-06 | Validation: shares ≤ 0 or more than 6 decimals refused; a given cost < 0 or more than 6 decimals refused; other users' holdings unreachable (DASH-06). |

**Ticket 4 (#57): metrics sheet and chips**

| ID | Pass when |
|---|---|
| DR4-01 | At 400 px the metrics are a second sheet behind the `Holdings` / `Metrics` switch, never beside the list; switching back shows the list unchanged; no horizontal page scroll. |
| DR4-02 | At 1440 px the metrics sheet sits to the right of the list, both visible without switching. |
| DR4-03 | A user with no saved chips sees exactly `Revenue growth 1y`, `ROIC (1y)`, `Share of the book`, in that order. |
| DR4-04 | The search field: typing "gross" offers Gross margin (1y) (and no chip already kept); choosing it adds the chip at the end; it survives a reload. |
| DR4-05 | Each chip's own `×` removes it and its figures from every row (and the book once ticket 5 lands); the change survives a reload, including removing every chip. |
| DR4-06 | Each metrics row shows the holding's name and figures for the kept chips only, in chip order; values equal DASH-16..20 (e.g. KO revenue growth 1y 1.9%, ROIC 17.4%, EPS 3.04 USD, EBIT margin 28.7%, gross margin 61.6%). |
| DR4-07 | A missing figure (RY ROIC, a not-covered name such as MC.PA, a pending check) shows exactly `—`, with no visible reason text next to it. |

**Ticket 5 (#58): book**

| ID | Pass when |
|---|---|
| DR5-01 | Exactly one total under the list: the total value in base currency (seed account 4,141.21 CAD); no total cost or total return row; the excluded line shows only when a holding has no price or FX rate. |
| DR5-02 | A donut (ring with a hole) of the rows' share of the book: same labels as the rows, largest first, ties by ticker; with 11+ valued holdings the 10 largest plus `Other`; neutral greys; the ticker + % list is present as text. |
| DR5-03 | The metrics sheet's `Book` row shows, for each kept chip, the weighted figure from section 9: DASH-22 set EBIT margin `27.6% · 71% covered`; the EPS chip shows `26.5%` labelled `EPS growth 1y (weighted)`; adding or removing a chip adds or removes its book figure. |
| DR5-04 | Dashes are left out: a holding with `—` for a chip is excluded from that chip's figure (not counted as 0) and counts against coverage; a chip nobody has a figure for shows `—`. |
| DR5-05 | The `Share of the book` chip's book figure is the sum of the valued weights (100.0% ± rounding). |

**Ticket 6 (#59): leave-outs and regression**

| ID | Pass when |
|---|---|
| DR6-01 | No "Connect broker" and no broker link or button anywhere on `/dashboard`, both widths. |
| DR6-02 | No K/M/B: every amount on `/dashboard` shows full digits with thousands separators (no `K`, `M` or `B` suffix on any amount). |
| DR6-03 | No ownership toggle (no switch or toggle about ownership or % owned). |
| DR6-04 | No download: no download / export / CSV button or link. |
| DR6-05 | No instructions under (or above) the list; DR2-04 still holds. Tests in `npm test` keep DR6-01..05 true. |
| DR6-06 | Regression: DR0, DR2..DR5 and every kept DASH ID pass in one run on the preview at both widths, then on production after the merge; `README.md`, `AGENTS.md` and this spec match the shipped page. |

### 0.8 Old DASH IDs: kept or superseded

| Old ID | Status | Now |
|---|---|---|
| DASH-00 | Superseded | The dashboard is released; DR0-02 (production serves it) replaces "404 until the release go". The calculator and wording parts live on in DR0-04 / DR0-07, noindex in DR0-05. |
| DASH-01, 02 | Kept | Flag code unchanged; checked by `flag.test.ts` and `check:dashboard-built` in CI. QA doesn't flip the flag. |
| DASH-03 | Kept | Preview database status line stays. |
| DASH-04 | Kept | Part of DR0-03 (signed-out matrix). |
| DASH-05, 06 | Kept | Unchanged (DR3-06 re-checks isolation for the cost change). |
| DASH-07 | Superseded | DR3-01..06 (cost optional) and DR2-03 (edit / delete in the detail). |
| DASH-08 | Kept | Restated as DR3-05. |
| DASH-09, 10, 11 | Kept | Unchanged. |
| DASH-12 | Kept | Restated as DR2-06. |
| DASH-13 | Superseded | DR2-02 / DR2-03 (columns move to the row and the detail) and DR5-01 (one total); the hand-check numbers stay. |
| DASH-14 | Kept | Unchanged. |
| DASH-15 | Superseded | DR4-03..05 (chips; reorder dropped). |
| DASH-16..20 | Kept | The values; their display follows DR4-06 / DR4-07. |
| DASH-21 | Superseded (display) | Coverage rule kept; the cell shows `—` alone (DR4-07) instead of "— not covered". |
| DASH-22 | Kept, moved | DR5-03 / DR5-04 (the `Book` row). |
| DASH-23 | Kept, moved | DR5-03 (EPS chip book figure). |
| DASH-24 | Superseded | DR5-02 (donut, same slices; pending lists dropped). |
| DASH-25 | Kept | Restated in DR2-06. |
| DASH-26 | Superseded | DR6-06 (no new production flip; one full regression run). |

### 0.9 Landed

**Ticket 2 (#55, PR #61): holdings list as the page.** `src/components/dashboard/holdings.tsx`:

- The nine-column T07 table is gone. The list is a `<ul data-testid="holdings-list">`; each row is a button
  (`holding-row-toggle`, `aria-expanded` / `aria-controls`) with exactly four fields: name (`holding-name`:
  `instruments.name`, the ticker until one is stored), shares (`holding-shares`), value in base currency
  (`holding-value`, full digits, no FX line) and share of the book (`holding-weight`). Phone: two lines
  (name · value / shares · share); from 640 px: four columns with a small header row.
- Tap → the detail panel (`holding-detail`, always server-rendered, `hidden` while closed): ticker, name,
  shares, average cost, last close + session date, value with the FX line, cost, return (amount and %), share
  of the book, Edit (shares and average cost become inputs) and Delete with the #38 guard unchanged.
- Empty state: one line `Add a holding` (`holdings-empty`); no list, total, chart or metrics.
- The T06/T07 explanatory paragraph is removed; the "Not included in the totals (price or FX pending): …"
  line is gone (the excluded-count line under the total stays).
- **One total (value only) under the list** (`holdings-total-line` / `holdings-total`), pulled forward from
  ticket 5 so the page isn't left without a total once the table went (EL decision 9). It shows `—` when no
  holding has a value. Ticket 5 still owns DR5-01 (re-check) and the rest of the book.
- **Interim, until ticket 4 (#57):** today's metric columns stay reachable in a `Metrics` section under the
  pie (`data-testid="metrics"`): the T08 picker, one row per holding (name + the user's columns, the cells as
  today) and the T14 `Portfolio` row. It scrolls sideways inside its own box, so the page never does. The
  T15 pie is unchanged until ticket 5. The add form was unchanged until ticket 3.
- Wide screen (≥ 1024 px) uses the same single column (max-width 6xl) with the four-column rows; the
  metrics-on-the-right layout is ticket 4.
- Tests: `holdings-list.dom.test.tsx` (row fields, tap opens / closes the detail, Edit inputs, empty state,
  no helper paragraph, one total, metrics reachable), `holdings.dom.test.tsx` (the #38 guard, now via the
  detail), `check-dashboard-built.mjs --with-database` (row + detail fields, `Add a holding`, no total
  cost / return), `qa/tools/dashboard-list.mjs` (browser, both widths).

**Ticket 3 (#56, PR #62): add holding, optional average cost.**

- Add form: one compact row (interpretation 17): Ticker, Shares, Average cost (placeholder `optional`,
  accessible name `Average cost (optional)`), Add. A blank cost is sent as `null`.
- Schema: `migrations/0008_holdings_avg_cost_nullable.sql` makes `holdings.avg_cost` nullable (idempotent,
  `CHECK (avg_cost >= 0)` kept; no existing value converted). API (`holdings.server.ts`
  `parseOptionalCost`): missing, `null` or blank `avgCost` → stored `NULL` on `POST` (201, `avgCost: null`)
  and `PUT` (clears it); a given cost is still ≥ 0 with ≤ 6 decimals. Listing check, duplicate 409 and the
  200 cap unchanged.
- Valuation (`valueHoldings`): no cost → `cost`, `returnAmount`, `returnPct` `null`; value and weight as
  any holding. `totalCost` / `totalReturn` sum costed holdings only and are `null` when none has a cost (not
  on the page, item 9).
- Detail: with no cost, `holding-avg-cost`, `holding-cost` and `holding-return` render empty
  (`data-blank="true"`), no return %. Edit starts blank and can fill or clear the cost.
- QA notes folded in: **N6** Edit → Save sends one `PUT` per click burst (a ref guard like #44's delete);
  **N1** each row number has a visually hidden label from 640 px (`shares`, `value`, `share of book`; the
  header row stays `aria-hidden`); **N3** `qa/tools/dashboard-list.mjs` skips the row checks on an account
  with no holdings and signs out at the end. N4 unchanged: no portfolio total cost or return.
- Tests: `holdings-add.dom.test.tsx` (form shape, blank cost POSTs `null`, blank detail fields, a later
  cost shows, clearing, the Save guard), the N1 test in `holdings-list.dom.test.tsx`, `holdings.test.ts` /
  `store.test.ts` / `valuation.test.ts` (parse, NULL storage, 0008 re-run, aggregates),
  `check-dashboard-built.mjs --with-database` (form, POST without cost, blank then filled then cleared),
  `qa/tools/dashboard-add.mjs` (browser, both widths, never Delete).
- `PUT` semantics changed in ticket 4 (see below): blank no longer clears on edit; `null` does.

**Ticket 4 (#57, PR #63): metrics sheet and chips.** Stacked on PR #62 (base `feat/dashboard-redesign-add`).

- The interim `Metrics` section under the pie (the T08 picker and table from #55) is replaced by the
  metrics sheet (`src/components/dashboard/metrics-sheet.tsx`, `data-testid="metrics"`).
- Layout: below 1024 px, with holdings, a `Holdings` | `Metrics` switch (`sheet-switch`, `aria-pressed`)
  shows one sheet at a time; the hidden sheet stays in the page (`hidden`), so switching back shows the list
  unchanged. From 1024 px a two-column grid (list 3 : metrics 2), both visible, the switch hidden. No holdings:
  no switch and no sheet (DR2-05). Same style; no theme change. The list's number columns from 640 px are
  narrower (5 / 9 / 6 rem) so names keep room beside the sheet.
- Chips (`metrics.ts` `CHIPS`): the eight metric columns plus `Share of the book` (`share_of_book`, the
  row's weight). Defaults `Revenue growth 1y`, `ROIC (1y)`, `Share of the book`. Search (`metric-search`,
  label `Add a metric`) lists matches only once something is typed (every word of the query in the label,
  kept chips left out); a click or Enter adds the first match at the end. Each chip's `×` removes it. One
  `PUT /api/dashboard/columns` per change (guarded per click burst); it accepts chip keys.
- Storage: `user_metric_columns` + `user_settings.metric_chips_saved_at` (0009, interpretation 4). Accounts
  that already saved columns keep them (EL). `GET /api/dashboard/columns` returns `{columns, saved,
  available}` with the defaults when never saved.
- Rows: name + the kept chips' figures in chip order; a missing figure is `—` alone (the reason is in the
  cell's `title` and a visually hidden span, not visible). The table scrolls sideways inside its own box when
  many chips are kept; the page never does. **QA D1 fix:** the scroll box is `relative`, so the absolutely
  positioned sr-only reason text can't escape it and widen the page (it did with all 9 chips and an off-screen
  `—`: 724 px page at a 400 px viewport).
- **QA D2 / Chrome pass fixes:** matches are ranked (the label equal to the query, ignoring case and extra
  spaces, then labels starting with it, then whole-word matches, then the rest; ties in catalog order), and
  Enter adds the exact label if there is one, else the first match, so `Revenue CAGR 3y` + Enter never adds
  10y. The search field is no longer disabled while a chip saves (typed keys aren't dropped), a press on an
  option doesn't take focus from it, and a pick while a save is in flight keeps the typed query.
- Interim until ticket 5: the T14 `Portfolio` foot row stays (figure `· N% covered`); for the share chip it
  shows the sum of the weights. Ticket 5 turns it into the `Book` row.
- Holdings `PUT` (EL change carried from #62): omitted `avgCost` keeps the stored cost, `null` clears, a
  number sets, `""` → 400 (`parseEditCost`; `store.updateHolding` keeps `avg_cost` when no cost is given).
- Tests: `metrics-sheet.dom.test.tsx` (DR4-01..07, the PUT guard), `fundamentals.test.ts` (chips API:
  defaults, add, `[]` sticks, old rows kept), `holdings.test.ts` / `store.test.ts` (omitted / null / number /
  blank on `PUT`), `check-dashboard-built.mjs --with-database` (0009 re-run, chips, `PUT` cost rules),
  `qa/tools/dashboard-metrics.mjs` (browser, both widths, never Delete).

**Ticket 5 (#58, PR #64): book.** Stacked on PR #63 (base `feat/dashboard-redesign-metrics`).

- **One total** under the list (value only, decision 9; unchanged from #55): `holdings-total`, `—` when no
  holding has a value, the excluded line under it. No portfolio total cost or return (N4).
- **Donut** (`holdings-pie.tsx`, `data-shape="donut"`): the same `pieSlices()` as the T15 pie, drawn as a
  ring (inner radius 58%), largest first, ties by ticker, the 10 largest + `Other` past ten names, neutral
  greys; caption `Share of the book (<base>)`; the ticker + % legend is the text alternative
  (`aria-label` "Donut chart of share of the book: …"). The "price pending" / "FX pending" lists and the
  "No holdings with a price yet." sentence are gone; nothing valued → no donut.
- **Book row** (the metrics sheet's foot, `data-testid="book-row"`, label `Book`; was the interim
  `Portfolio` row): per kept chip, T14's `portfolioMetrics()` (unchanged): Σ MVᵢ·mᵢ / Σ MVᵢ over the holdings
  that have a figure, i.e. dashes left out and the weights renormalised, never counted as zero;
  `x.x% · N% covered`; `—` alone when no holding has a figure (`formatPortfolioCell`, item 11); the EPS chip
  is the weighted 1y EPS growth labelled `EPS growth 1y (weighted)`; `Share of the book` = 100.0%. Adding or
  removing a chip adds or removes its figure. Item 18 has the display choices.
- **QA notes folded in:** N2 (item 19: non-number `avgCost` → the number message on `POST` / `PUT`); N3
  (item 17: the cost field's accessible name contains the visible label at every width); N4 (every
  signed-in `qa/tools` browser tool signs out on every exit path via `qa/tools/session.mjs`); release doc:
  0008 is forward-only, null costs cleared before any production rollback past it.
- **Metric search as a combobox (EL, #58):** the `Add a metric` input is `role="combobox"`
  (`aria-autocomplete="list"`, `aria-expanded`, `aria-controls="metric-options"`, `aria-activedescendant`)
  over a `role="listbox"` of `role="option"` items (`aria-selected`); ↓ / ↑ move the highlight (wrapping),
  Home / End jump, Enter adds the option whose label equals the query (QA D2, exact-match wins), else the
  highlighted one (the first, best-ranked, by default), Escape clears; focus stays in the input after adding
  (options don't take focus; the input is neither disabled nor read-only while saving, so typed keys aren't
  dropped, and a pick during a save is ignored with the query kept).
- Carries #63's QA D1 and D2 / (b) fixes (merged from `feat/dashboard-redesign-metrics`).
- Tests: `book.test.ts` (weighting: dashes excluded and renormalised, negatives, pending outside, all missing
  → `—`, EPS growth; donut: largest first, ties, Other past ten, exactly ten / eleven, none valued),
  `book.dom.test.tsx` (one total, donut, Other, nothing valued, Book row figures / order / `—` / share /
  EPS label / chip removal, the wrap), `metric-compute.test.ts` / `valuation.test.ts` (0% → `—`, donut
  source), `holdings.test.ts` (N2), `holdings-add.dom.test.tsx` (N3), `scripts/qa-tools-session.test.mjs`
  (N4), `check-dashboard-built.mjs --with-database` (no donut before a close, total `—`, one-slice donut,
  Book row, share 100.0%, `—` alone at 0% coverage, N2 on POST / PUT, N3 label); browser
  `qa/tools/dashboard-book.mjs` (read-only, both widths) and `dashboard-add.mjs` (N3 name check).

## 1. What we are building

*Original v1 scope (2026-10-02). The page layout in items 1–3 is replaced by [section 0](#0-redesign-mobile-first-epic-53-source-of-truth-for-tickets-26) (epic #53): holdings list as the page, metrics as chips on a second sheet, one total and a donut.*

A signed-in area. A user signs in and gets two things: the existing DCA calculator (unchanged), and a new
**Dashboard**.

1. **Holdings table** at the top, like a Fiscal.ai portfolio table. The user adds ticker, share count and
   average cost basis. Market value and total return are computed from the **prior session's close**,
   refreshed **once a day, never intraday**. The table shows the total position and each holding's % of
   portfolio.
2. **Per-company metric columns** the user can add or remove. Initial list: Revenue growth (1y, plus 3y,
   5y and 10y CAGR), ROIC (1y), EPS (1y), EBIT margin (1y), Gross margin (1y).
3. **Portfolio view**: the same metrics aggregated across the portfolio (weighted), plus a pie chart of
   holdings by % of portfolio.
4. **Existing rules still apply**: US/EU/CA listings only, no buy/sell/hold output anywhere, `noindex`,
   and no secrets in the repo, vault, chat or PRs (environment variables live only in Vercel).

How this relates to `attachments/dca-app-spec.md`: that spec says dashboards and holdings are "later" and
lists "a boring price and holdings feed (IBKR or Fiscal.ai) before any dashboard". This spec uses
**manual holdings entry** and a daily close instead of a broker feed. Diego approving this spec settles
that conflict, and Diego approved it on 2026-10-02 (decision D7 in the [Decisions record](#13-decisions-record)). The DCA calculator spec and its six
rules do not change.

### Not in scope

- Intraday prices, quotes, alerts, order tickets or any link to a broker.
- Any rating, target price, "cheap/expensive" label, ranking called "best", or buy/sell/hold wording.
- Transactions history, lots, dividends received, tax lots or account types (TFSA/RRSP). Not in v1.
- Listings outside US/EU/CA (the same `listingError()` rule as the calculator, in `src/lib/dca/venues.ts`).

## 2. Feature flag and hidden route (how every ticket ships)

Every dashboard ticket merges to `main` behind one flag, so production is never exposed piece by piece.

**Mechanism (simplest that works):** one server-only environment variable, `DASHBOARD_ENABLED`.

- It is set to `true` **only in the Vercel "Preview" environment**. It is not set for Production.
  Vercel lets each variable be scoped to Production, Preview and Development separately, and a Preview
  variable applies to every non-production branch unless a branch-specific value overrides it
  ([Vercel: Environment variables, "Environments" and "Preview environment variables"](https://vercel.com/docs/environment-variables),
  checked 2026-10-02).
- It is read **on the server only** (no `VITE_` prefix). `VITE_*` values are inlined into the client
  bundle at build time, so they are not a gate. The `/dashboard` route checks the flag in its server-side
  `beforeLoad`/loader and every dashboard server function and API route checks it too. When the flag is not
  exactly `true`, they all answer **404** (route) or **404 JSON** (API). No sign-in button or dashboard copy
  is rendered when the flag is off. **Exception since #46 (Diego, 2026-10-04):** the site menu's "Dashboard"
  item and the home card linking to `/dashboard` show on every page whether the flag is on or off; the
  shell never reads the flag, and flag off the link lands on the ordinary 404.
- A changed value only applies to **new** deployments
  ([Vercel: Environment variables](https://vercel.com/docs/environment-variables), checked 2026-10-02),
  so flipping it means redeploying.
- The calculator (at `/calculator` since #46; it was at `/`) does not read the flag and does not change.

**How QA reaches it on a preview:** open the PR's Vercel preview URL (vercel[bot] posts it on the PR), go to
`/dashboard`. Because the flag is on for every Preview deployment, no extra step is needed. On production
(https://orpheus-app-beta.vercel.app/dashboard) QA expects a 404 until the release go.

**Who sets it:** the Engineering Lead (or Diego) adds `DASHBOARD_ENABLED=true` to the Preview environment
once, when ticket T01 (#9) is approved. Bots never set environment variables and never paste values anywhere.

This is an active harness rule in `AGENTS.md` (since spec approval, 2026-10-02): *feature work lands
behind a flag until a release go*.

## 3. Auth provider

### What is in the repo today

The repo already has self-hosted [Better Auth](https://www.better-auth.com/docs/installation) from the Grok
template (`src/lib/auth/*`, `better-auth ~1.6.30` in `package.json`), mounted at `/api/auth/*`, plus
`migrations/auth/0001_auth.sql` (tables `user`, `session`, `account`, `verification`). What I found by
reading the code:

- **Sign-in in the code federates to the Grok auth broker** (`https://auth.grok.me`, `genericOAuth` plugin)
  using `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`. The Grok deployer injected
  those values, but it no longer deploys this app. Since PR #25, `src/lib/auth/server.ts` reads the client
  secret **only** from `GROK_AUTH_CLIENT_SECRET`, with no fallback. Without it `authConfigured` is false
  and federated sign-in stays off. So **Grok sign-in does not work on Vercel** (`*.vercel.app`) as is.
- `VITE_AUTH_ENABLED` is the on/off switch (`"false"` = off, dev user, no DB). With auth on and
  `DATABASE_URL` set, Better Auth uses Postgres through `pg`; without `DATABASE_URL` it uses embedded
  PGLite, which does not persist on serverless.
- `BETTER_AUTH_URL` sets a fixed base URL; without it the base URL is derived only for Grok sandbox hosts
  and localhost. `trustedOrigins` is that one URL plus localhost. So **preview URLs on `*.vercel.app` are
  not trusted** unless this is changed.
- `src/lib/auth/email-password.ts` has `emailAndPasswordEnabled = false`. Flipping it turns on Better
  Auth's built-in email/password, which needs no OAuth client and no callback URL.
- `scripts/migrate.mjs` runs in `npm run build` and applies `migrations/*.sql` to `DATABASE_URL`. It does
  **not** read `migrations/auth/` (non-recursive by design). The auth schema has to be **copied** to
  `migrations/0001_auth.sql` to be applied.
- The template also has a "gate identity" path (`gate-identity.server.ts`) that is on whenever
  `VITE_AUTH_ENABLED !== "false"` and expects Grok-issued headers. It must be checked and turned off for
  Vercel in the auth ticket.
- `src/lib/auth/preview.ts` no longer holds a client secret. PR #25 removed the template's hard-coded
  preview secret; the value is still in git history, and rotating it is up to the Grok client's owner.
  The file still exports template leftovers that are not secret: `PREVIEW_CLIENT_ID` (`grok_preview`),
  `GROK_ISSUER_DEFAULT` and `PREVIEW_ALLOWED_HOSTS` (`*.grok-sandbox.com`). The auth ticket (T03, #11)
  removes the Grok broker path along with these leftovers.

### What Better Auth needs to run on Vercel

| Need | Exact value | Source |
|---|---|---|
| Database | Postgres, via `DATABASE_URL` (the existing `pg` Pool) | [Better Auth: Installation, "Configure Database"](https://www.better-auth.com/docs/installation), checked 2026-10-02 |
| Schema | Copy `migrations/auth/0001_auth.sql` to `migrations/0001_auth.sql`; `npm run build` applies it on each Vercel deploy | repo (`scripts/migrate.mjs`, `scripts/migration-plan.mjs`) |
| `BETTER_AUTH_SECRET` | At least 32 characters, high entropy (already listed as a Vercel env var) | [Better Auth: Installation, "Set Environment Variables"](https://www.better-auth.com/docs/installation), checked 2026-10-02 |
| `BETTER_AUTH_URL` | Production: `https://orpheus-app-beta.vercel.app`. Previews: derived per request (see below) | same page |
| `VITE_AUTH_ENABLED` | `true` where the dashboard is on (Preview first, Production at release) | repo |
| Trusted origins on previews | Build `baseURL`/`trustedOrigins` from Vercel's `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL` (system variables, available at build and runtime) instead of a fixed URL | [Vercel: System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), checked 2026-10-02 |
| Callback URLs | **None for email/password.** For Google: `https://<host>/api/auth/callback/google`, registered in Google Cloud Console | [Better Auth: Google](https://www.better-auth.com/docs/authentication/google), checked 2026-10-02 |

Why email/password first: Google OAuth redirect URIs **cannot contain wildcards**
([Google: OAuth 2.0 for web server apps, redirect URI validation rules](https://developers.google.com/identity/protocols/oauth2/web-server), checked 2026-10-02),
and every Vercel preview has a different host. Better Auth has an OAuth Proxy plugin for exactly this,
but it needs a shared `OAUTH_PROXY_SECRET` on production and every preview, and its docs warn that anyone
holding it "can assert provider identities"
([Better Auth: OAuth Proxy](https://www.better-auth.com/docs/plugins/oauth-proxy), checked 2026-10-02).
That is more moving parts than this app needs to start.

Note on email/password: with no email sender configured there is no "forgot password" email and no email
verification. For a small invited user set this is acceptable to start; adding Google later (production
callback only, plus the proxy for previews) is a separate ticket if Diego wants it.

**Cost:** $0. Better Auth is an open-source library already in `package.json`; it runs inside our Vercel
functions and stores users in our Postgres (cost is the database, section 4).

### Alternatives (only for comparison)

| Option | Free tier | Paid | Why not first |
|---|---|---|---|
| Clerk | Hobby: free, 50,000 monthly retained users per app, up to 3 social connections | Pro $25/mo ($20/mo billed annually) | New vendor, new SDK and env vars, and we already have Better Auth wired. [Clerk pricing](https://clerk.com/pricing), checked 2026-10-02 |
| Supabase Auth | Free: 50,000 MAU (Free projects pause after 1 week of inactivity, 2 active projects) | Pro from $25/mo | Would also move the DB to Supabase. [Supabase pricing](https://supabase.com/pricing), checked 2026-10-02 |

**Recommendation:** keep Better Auth, turn on email/password, run it on Neon Postgres (section 4).

### Implementation notes (T03, #11)

- Email/password only (D11); the Grok broker (`genericOAuth`), gate-identity, popup and bearer-token paths
  and `src/lib/auth/preview.ts` are removed. Better Auth is mounted at `/api/auth/*` **only while
  `DASHBOARD_ENABLED` is on** (404 JSON otherwise, every method), so production is unaffected until the
  release go.
- **Sign-up allow-list (D12):** server-only variable **`DASHBOARD_SIGNUP_ALLOWLIST`**, emails separated by
  commas, semicolons or whitespace, matched case-insensitively. Unset or empty: nobody can sign up (fail
  closed). Others get 403 "Sign-up is limited to invited email addresses." Existing users can always sign in.
- **Database:** the shared resolver (`scripts/db-env.mjs`): `DATABASE_URL`, else
  `orpheus_app_preview_DATABASE_URL`. Schema: `migrations/0001_auth.sql` (verbatim copy of
  `migrations/auth/0001_auth.sql`), plus `0003_user_settings_fk.sql` for the §5 FK.
- **Origins:** production uses `BETTER_AUTH_URL`; previews use exactly `VERCEL_BRANCH_URL` and `VERCEL_URL`
  (https) and ignore `BETTER_AUTH_URL`, so no Preview value is needed for it. Local runs: loopback.
- **Fail closed:** on Vercel, without `BETTER_AUTH_SECRET` or a database URL (or with
  `VITE_AUTH_ENABLED=false`), `/api/auth/*` answers 503 JSON and nobody is signed in.
- `/dashboard` redirects to `/dashboard/sign-in` without a session. Per-user dashboard APIs answer 401 JSON
  signed out and 403 JSON when a request names another user's id; the user id comes only from the session.
  `/api/dashboard/status` and `/api/dashboard/db` are diagnostics without user data and stay public.

## 4. Per-user storage on Vercel

Per-user data is small: a settings row, a few dozen holdings rows and a list of chosen columns per user.
Shared market data (daily closes, FX, fundamentals) is one copy per symbol, not per user. A relational
database fits; Better Auth also needs one.

| Option | Free tier (as stated by provider) | First paid step | Fit |
|---|---|---|---|
| **Neon Postgres via Vercel Marketplace** | Free plan, $0: 100 CU-hours per project, 1 GB storage per project (20 GB account), scale to zero after 5 min, 10 branches per project, 5 GB egress per project. Hitting CU-hours or egress suspends compute until the next period; going over 1 GB blocks writes; no data is deleted. [Neon pricing](https://neon.com/pricing), checked 2026-10-02 | Launch: pay as you go, $0.106/CU-hour, $0.35/GB-month, no monthly minimum (same page) | **Best.** Installs from Vercel, billed through Vercel, injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`, and can create a database branch per Preview deployment ([Neon: Vercel-Managed Integration](https://neon.com/docs/guides/vercel-managed-integration), [Vercel Marketplace: Neon](https://vercel.com/marketplace/neon), checked 2026-10-02). The repo's `pg` code and `db:migrate` already expect exactly `DATABASE_URL`. |
| Upstash Redis | Free: 256 MB data, 10 GB bandwidth, 500K commands per month, 1 database. [Upstash Redis pricing](https://upstash.com/pricing/redis), checked 2026-10-02 | Pay as you go $0.20 per 100K commands; fixed 250 MB at $10/mo | Key-value only; Better Auth would still need SQL. Not needed. |
| Vercel Blob | Hobby includes 1 GB/month storage, first 10,000 simple ops, first 2,000 advanced ops, first 10 GB transfer; over the limit on Hobby, Blob is blocked until 30 days pass. [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), checked 2026-10-02 | Pro usage-based | File storage, not a database. Not a fit. |
| Supabase (Postgres) | Free: 500 MB database, 5 GB egress, paused after 1 week of inactivity, 2 active projects. [Supabase pricing](https://supabase.com/pricing), checked 2026-10-02 | Pro from $25/mo (includes $10 compute credit) | Works, but the inactivity pause is a problem for a once-a-day job, and it is a second vendor outside Vercel billing. |

Preview branching caveat: on Neon Free, branches per project are capped at 10, and "hitting 10 branches
blocks branch creation" ([Neon pricing](https://neon.com/pricing), checked 2026-10-02). Preview branches
are deleted only when the Vercel deployment is removed, which by default can take months
([Neon: Vercel-Managed Integration, "Automatic branch cleanup"](https://neon.com/docs/guides/vercel-managed-integration),
checked 2026-10-02). So either keep preview branching off (previews share one "preview" database,
separate from production) or prune branches regularly. **Recommendation: preview branching off; one
Neon project with a `main` branch for Production and one `preview` branch whose `DATABASE_URL` is scoped
to the Preview environment.**

Usage numbers for this app are not measured yet; the storage ticket adds a note to check Neon's usage page
after a week of previews.

**Recommendation:** Neon Postgres (Free) through the Vercel Marketplace. Cost $0 to start. Owner action:
Diego (or the Engineering Lead with his OK) installs it from the Vercel dashboard. Bots do not sign up.

## 5. Data model

All app tables are snake_case, in new migration files (`migrations/0002_dashboard.sql`, …), as the
template's migration header asks. Per-user tables have `user_id TEXT NOT NULL` (Better Auth ids are text)
and every query is scoped to the verified session user on the server (`requireUserId()` in
`src/lib/auth/verify.server.ts`). A client-supplied user id is never trusted.

Per-user tables:

| Table | Columns | Keys |
|---|---|---|
| `user_settings` | `user_id`, `base_currency` (`CAD` \| `USD` \| `EUR`, default `CAD`), `metric_chips_saved_at` (NULL = chips never saved; since 0009, epic #53 ticket 4), `updated_at` | PK `user_id` → `"user"(id)` on delete cascade |
| `holdings` | `id`, `user_id`, `symbol` (feed symbol, e.g. `RY.TO`, `ASML.AS`, `KO`), `shares` numeric(20,6) > 0, `avg_cost` numeric(20,6) ≥ 0 or NULL = no cost (in the listing currency; nullable since 0008, epic #53 ticket 3), `created_at`, `updated_at` | PK `id`; unique (`user_id`, `symbol`); index `user_id` |
| `user_metric_columns` | `user_id`, `metric_key`, `position` | PK (`user_id`, `metric_key`) |

Shared market-data tables (written only by the daily job):

| Table | Columns | Keys |
|---|---|---|
| `instruments` | `symbol`, `name`, `exchange`, `region` (`US`/`EU`/`CA`), `currency`, `sec_cik` (nullable), `fundamentals_source` (`sec` \| `none`), `updated_at` | PK `symbol` |
| `daily_closes` | `symbol`, `session_date` (exchange-local date), `close` numeric, `currency`, `source`, `fetched_at` | PK (`symbol`, `session_date`) |
| `fx_rates` | `quote` (e.g. `USD`), `rate_date`, `cad_per_unit` numeric, `source` (`BOC` \| `ECB_CROSS`), `fetched_at` | PK (`quote`, `rate_date`) |
| `fundamentals_annual` | `symbol`, `fiscal_year_end`, `concept` (internal key, e.g. `revenue`), `value` numeric, `unit`, `source_tag` (e.g. `us-gaap:Revenues`), `accession`, `filed` | PK (`symbol`, `fiscal_year_end`, `concept`) |
| `metric_values` | `symbol`, `metric_key`, `value` numeric null, `status` (`ok` \| `n/m` \| `insufficient_history` \| `not_covered`), `fiscal_year_end`, `computed_at` | PK (`symbol`, `metric_key`) |
| `refresh_runs` | `id`, `run_date`, `started_at`, `finished_at`, `status`, `detail` jsonb | PK `id`; unique `run_date` for the lock |

Implementation notes (T02, #10):
- The FK `user_settings.user_id → "user"(id) on delete cascade` landed with T03 (#11) in its own migration,
  `0003_user_settings_fk.sql`, after the Better Auth schema (`0001_auth.sql`) entered `migrations/`.
  `0002_dashboard.sql` creates every other column, key and check above.
- Env var names as installed (2026-10-02): the Neon integration (database `neon-almond-lever`) injects
  prefixed names for Preview and Development only: `orpheus_app_preview_DATABASE_URL`, `..._UNPOOLED` and
  others. The app reads `DATABASE_URL`, else `orpheus_app_preview_DATABASE_URL`. Migrations prefer the
  direct (`_UNPOOLED`) URL of the same pair. Neon **preview branching is on** (Engineering Lead decision, 2026-10-02), not off as §4 recommends,
  so watch the Free plan's 10-branch cap (§4) and prune old preview branches.
- Without a database URL, dashboard storage is unavailable ("not configured"); there is no in-memory
  fallback for the dashboard. The preview-only status line on `/dashboard` and `GET /api/dashboard/db`
  report "connected" plus the table count (DASH-03); both are 404 or hidden on production.

Implementation notes (T04, #12):
- Ticker check: on add only, the server makes one Yahoo chart-metadata request for the symbol (the
  calculator's existing feed module) and applies `listingError()` from `src/lib/dca/venues.ts`, so DASH-08
  messages are the calculator's exact text. This is a one-off validation on `POST`, not a page load and not
  a price; nothing from it is stored. T04 doesn't write `instruments` (left to T05's daily job).
- The ticker isn't editable: `PUT` changes `shares` and `avg_cost` only (a blank / `null` cost clears it, #56); to change a ticker, delete and add.
- Duplicate (`user_id`, `symbol`) is refused with 409 "<SYM> is already in your holdings." before the feed
  call. Cap: 200 holdings per user.
- Isolation: another user's holding id answers 404 "Holding not found." (not 403, so ids don't leak); a
  request that names another user id answers 403, as in T03.
- `holdings.user_id` → `"user"(id)` on delete cascade landed with T05 (#13) in `0004_daily_close.sql`
  (the table above lists no FK for holdings; added so deleting a user removes their holdings). 0004 first
  deletes holdings whose user no longer exists, like 0003 did for `user_settings`.

Caching: the database **is** the cache. Dashboard pages read only these tables. No page load ever calls
a price, FX or fundamentals provider, so nothing on the page can be intraday.

## 6. Prices: the prior session's close

**Definition.** For a holding, "prior session close" is the official close of the most recent **completed**
regular session on that listing's own exchange, at the time the daily job runs. US, CA and EU listings each
use their own exchange calendar; a holiday on one exchange (for example a US holiday while Toronto is open)
simply means that listing keeps its previous close. The dashboard shows the session date next to the close.
A bar whose exchange-local date is "today" while that exchange is still open is discarded.

**Source.** All price fetching goes through **one provider interface, `DailyCloseProvider`**
([Amendment A](#14-amendment-a-daily-close-source)); nothing else in the dashboard calls a price
feed. The first implementation wraps the Yahoo daily chart call the calculator already uses
(`src/lib/dca/yahoo.server.ts`, raw close). D13 (Amendment A) keeps Yahoo as the primary source, caches
each close once in Neon, and uses Alpha Vantage's free tier as the fallback. Fetching runs in background
jobs only. Honest caveat: this is an unofficial endpoint with no published API terms, rate limits or
SLA (not stated on any provider page I could find), and Yahoo's Terms of Service forbid collecting data
"using any automated means … without our express, prior permission" (section 2.d.ix) and commercial
reuse without permission (section 2.e)
([Yahoo Terms of Service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), checked 2026-10-02).
The calculator already carries this risk; the dashboard adds one call per held symbol per day. **Diego
knows this risk and accepts it for now (D13).** Paid daily-close options (EODHD, Twelve Data) are marked
"revisit later" in section 14.

## 7. Fundamentals source, and 10-year CAGR coverage

### SEC EDGAR XBRL `companyfacts` (free)

- Free, no key: "These APIs do not require any authentication or API keys"; JSON per company at
  `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`; covers XBRL from 10-K, 10-Q, 20-F, 40-F
  and 6-K, standard taxonomies only (`us-gaap`, `ifrs-full`, `dei`, `srt`); no CORS (server-side only);
  nightly bulk `companyfacts.zip`
  ([SEC: EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), checked 2026-10-02).
- XBRL was "first required by the SEC in 2009" (same page).
- Fair access: "Current max request rate: 10 requests/second", and requests must declare a User-Agent
  such as "Sample Company Name AdminContact@<company>.com"
  ([SEC: Accessing EDGAR Data](https://www.sec.gov/os/accessing-edgar-data), checked 2026-10-02).
  A test request without a User-Agent returned HTTP 403; with one it returned 200 (2026-10-02).
- Ticker → CIK map: `https://www.sec.gov/files/company_tickers_exchange.json` (same page). It lists
  **US tickers only** (e.g. `RY` on NYSE, not `RY.TO`), so a TSX or EU listing has to be matched to the
  issuer's SEC filer record (strip the venue suffix, confirm by company name); no match = not covered.

**Coverage depth, measured on real `companyfacts` files on 2026-10-02** (annual frames for the revenue
concept):

| Issuer | Filer type / taxonomy | Annual revenue frames found | 10y revenue CAGR to FY2025? |
|---|---|---|---|
| Coca-Cola (KO) | 10-K, us-gaap | `SalesRevenueGoodsNet` CY2007–CY2017, then `Revenues` CY2016–CY2025 | Yes, **only by stitching two tags** |
| ASML (ASML / ASML.AS) | 20-F, us-gaap, EUR | `SalesRevenueNet` CY2007–CY2017, then `RevenueFromContractWithCustomerExcludingAssessedTax` CY2016–CY2025 | Yes, by stitching |
| Philips (PHG / PHIA.AS) | 20-F, ifrs-full, EUR | `Revenue` CY2015–CY2025 | Yes, just (needs FY2015) |
| Royal Bank of Canada (RY / RY.TO) | 40-F, ifrs-full, CAD | `Revenue` CY2017–CY2025 | **No** (9 years); 1y/3y/5y yes |
| Shopify (SHOP / SHOP.TO) | us-gaap | `RevenueFromContractWithCustomer…` CY2017–CY2023, `Revenues` CY2022–CY2025 | **No** (data starts CY2017) |

So: US domestic filers usually have 10+ years once tag changes are stitched; foreign filers that file
20-F/40-F with IFRS XBRL often start in 2015–2017; issuers that are **not SEC registrants have nothing**.

### The EU and CA gap (honest)

- **Canada:** most TSX issuers do not file with the SEC, and "SEDAR+ does not accept filings in XBRL
  format" ([SEDAR+ FAQ: Continuous disclosure](https://systems.securities-administrators.ca/onlinehelp/faqs/continuous-disclosure/),
  checked 2026-10-02). There is no free structured source for TSX-only issuers.
- **EU:** ESEF requires Inline XBRL tagging of IFRS consolidated statements in annual reports
  ([ESMA: Electronic Reporting](https://www.esma.europa.eu/issuer-disclosure/electronic-reporting), checked 2026-10-02)
  for financial years beginning on or after 1 January 2020
  ([ESMA ESEF tutorial 3 script](https://www.esma.europa.eu/sites/default/files/library/esma32-60-494_-_esef_tutorial_3_script.pdf), checked 2026-10-02).
  So at most about six annual reports exist in ESEF (FY2020–FY2025): **no 10y CAGR** from ESEF alone.
  There is no single official EU API; XBRL International's filings.xbrl.org collects ESEF filings with
  an API but says "the repository is not complete"
  ([filings.xbrl.org: About](https://filings.xbrl.org/about.html), checked 2026-10-02). Parsing ESEF is
  a bigger job than this feature; not proposed for v1.

### Paid APIs (prices from their own pages; reference only, none bought: D10, D13)

| Provider | Plan | Price | Coverage / history (as stated) |
|---|---|---|---|
| FMP | Basic | Free, 250 calls/day; financial statements limited to a fixed symbol list ("AAPL, TSLA, AMZN and 84 more") | [FMP pricing](https://site.financialmodelingprep.com/developer/docs/pricing), checked 2026-10-02 |
| FMP | Starter | $19.00/mo billed annually | US coverage, up to 5 years of history, annual fundamentals (same page) |
| FMP | Premium | $49.00/mo billed annually | US, **UK and Canada** coverage, up to 30 years; **no EU** at this tier (same page) |
| FMP | Ultimate | $99.00/mo billed annually | Global coverage, full history (same page). Monthly (non-annual) prices: not stated on the page as fetched. FMP also states that **displaying data requires a separate Data Display and Licensing Agreement** (same page). |
| EODHD | Free | $0, 20 API calls/day, 1 year history, fundamentals **not included** | [EODHD pricing](https://eodhd.com/pricing), checked 2026-10-02 |
| EODHD | EOD Historical All-World | $19.99/mo ($199/yr) | Global end-of-day prices, 30+ years; no fundamentals (same page) |
| EODHD | Fundamentals Data Feed | $59.99/mo ($599.90/yr) | Global fundamentals; **end-of-day prices not included**; fundamentals cost 10 API calls per request; "Fundamentals go back to 1985 … for major US companies and 2000 … for non-US firms" (same page) |
| EODHD | ALL-IN-ONE | $99.99/mo ($999.90/yr) | Prices + fundamentals (same page). Display/redistribution terms: not stated on provider pricing page. |

For reference only: the cheapest paid setup that would cover **EU and CA fundamentals with 10y history plus
daily closes** is EODHD Fundamentals + EOD Historical ($59.99 + $19.99 = $79.98/mo), or ALL-IN-ONE at
$99.99/mo, or FMP Ultimate at $99/mo billed annually (plus a display licence, price not stated). **Decided
(D10, D13): $0 now, nothing paid.** EODHD is a revisit-later option only, not a planned purchase.

### Recommendation

Start at **$0**: SEC EDGAR `companyfacts` for fundamentals; daily closes through the `DailyCloseProvider`
interface (Yahoo is the primary source, decided in
[Amendment A](#14-amendment-a-daily-close-source)). Every holding
without SEC coverage shows `—` with the reason "not covered" in metric cells, and portfolio metrics show
coverage % (section 9). If Diego's real holdings are mostly EU/TSX-only names, the $0 path will show a
lot of `—`; that is the expected result at $0 (D10, D13). A paid source such as EODHD is only revisited
later, as a new decision for Diego. The fundamentals ingest is behind one
small adapter so a paid source can replace it in one ticket.

The daily job refreshes a symbol's `companyfacts` only when it has no data yet or is older than 7 days
(fundamentals change with annual filings, not daily), at no more than 5 requests/second (half the SEC
limit), with a User-Agent naming the app and a contact address that the owner sets in an environment
variable (no address committed to the repo).

### Implementation notes (T08, #16)

- **Contact:** User-Agent `OrpheusWisdom/1.0 (orpheus-app dashboard; <SEC_CONTACT_EMAIL>)`, the address from
  the `SEC_CONTACT_EMAIL` env var (owner-set on Vercel; none in the repo). Not set → no SEC request; the
  run reports `fundamentalsSkipped`. A test request without a contact address got 403 (2026-10-02).
- **Schema:** `0005_fundamentals.sql` adds `instruments.fundamentals_checked_at` and `fundamentals_error`.
- **Coverage:** `company_tickers_exchange.json` ticker → CIK. US: the symbol. CA/EU: suffix stripped and
  the SEC name must match the listing name (case, punctuation and legal suffixes ignored; a prefix match
  needs ≥2 words). This rejects same-ticker decoys (MC.PA vs Moelis, L.TO vs Loews, AIR.PA vs AAR, CNR.TO
  vs Core Natural Resources). PHIA.AS is not covered (Philips files as PHG, a different ticker). Decided
  (EL 2026-10-02): filers under a different ticker stay not covered for now; a ticker mapping is a later gap. No match or a companyfacts 404 → `not_covered` (DASH-21).
- **Concepts (first matching tag per year, most recent filing wins):** revenue, cost_of_revenue,
  gross_profit, operating_income, pretax_income, income_tax, eps_diluted, equity_incl_nci, equity_parent,
  short-term borrowings / commercial paper / other short-term borrowings, long-term debt (current,
  noncurrent, total), current borrowings total, cash; us-gaap and ifrs-full tags (`CONCEPTS` in
  `fundamentals.server.ts`). Annual forms only (10-K, 20-F, 40-F and amendments), fp FY, durations
  335–395 days, one unit per concept (the latest year's).
- **Budget:** ≤5 requests/s, ≤25 symbols and ≤60 s per run, whole run ≤270 s; refetch after 7 days.
  Failures are per symbol (`fundamentals_error`, retried next run, run `partial`).
- **Picker (DASH-15):** `GET|PUT /api/dashboard/columns` (`{columns:[keys]}`; unknown/repeated → 400),
  stored in `user_metric_columns`; default no columns. Values are T09–T13; D9 is T14.

## 8. Metric definitions (the app computes every metric itself)

Each data provider computes ratios its own way, and the pricing pages above do not state their formulas,
so the app does not use provider-computed ratios. It stores raw annual values and computes:

All metrics use the company's **last reported fiscal years** (annual periods, 365 ± 30 days, the same
convention as SEC frames: [SEC: EDGAR APIs, "frames"](https://www.sec.gov/search-filings/edgar-application-programming-interfaces),
checked 2026-10-02), in the company's **reporting currency** (ratios are unitless; EPS is shown in
reporting currency with its code). FY0 = latest fiscal year, FY−n = n years earlier. Tags are mapped in a
fixed list per concept (e.g. revenue: `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`,
`SalesRevenueNet`, `SalesRevenueGoodsNet`, `ifrs-full:Revenue`), preferring the most recent filing per year.

| Key | Metric | Formula | Not meaningful (`n/m`) when |
|---|---|---|---|
| `rev_g_1y` | Revenue growth 1y | Rev FY0 / Rev FY−1 − 1 | either value ≤ 0 or missing |
| `rev_cagr_3y`, `_5y`, `_10y` | Revenue CAGR | (Rev FY0 / Rev FY−n)^(1/n) − 1 | either endpoint ≤ 0 (CAGR from a negative or zero base is undefined). FY−n missing → `insufficient_history` |
| `roic_1y` | ROIC (1y) | NOPAT FY0 / average invested capital (FY0, FY−1). NOPAT = operating income × (1 − t), t = income tax expense / pre-tax income, clamped to 0–50%; if pre-tax income ≤ 0 or tax missing, t = 25% (stated in the tooltip). Invested capital = total equity (incl. non-controlling interests) + short-term debt + long-term debt (incl. current portion) − cash and equivalents. Leases excluded (named deviation: debt tags that include finance leases are a fallback only, see T10 notes). | average invested capital ≤ 0; banks and insurers (SIC 6000–6399 or no operating-income concept), where ROIC is not meaningful. **Insufficient data** (`insufficient_data`, EL 2026-10-03): a debt or cash line group the company reports in other years is missing at FY0 or FY−1 (a group never reported counts as 0), or the stored rows predate the current parser. No FY−1 balance sheet → `insufficient_history` |
| `eps_1y` | EPS (1y) | Diluted EPS for FY0, reporting currency | missing |
| `ebit_margin_1y` | EBIT margin (1y) | Operating income FY0 / Rev FY0 (EBIT = reported operating income, no adjustments) | revenue ≤ 0 or operating income missing |
| `gross_margin_1y` | Gross margin (1y) | Gross profit FY0 / Rev FY0; if no gross-profit concept, (Rev − cost of revenue) / Rev | revenue ≤ 0 or neither concept present (e.g. banks) |

Negative values are real values and are shown as negative (negative ROIC, negative margin, negative
growth). `n/m` ("not meaningful"), `insufficient_history` ("insufficient history"), `insufficient_data`
("insufficient data": an input can't be confirmed, so no value is computed from partial inputs; EL 2026-10-03)
and `not_covered` ("not covered") cells show `—` with the reason on hover/tap.

### Implementation notes (T09, #17)

- `metric-compute.server.ts` computes `rev_g_1y` and `rev_cagr_3y/5y/10y` from `fundamentals_annual` in the
  background (after each SEC ingest; covered symbols stored earlier are caught up on the next run without
  SEC calls). FY0 = the company's latest stored fiscal year end across concepts (revenue missing there →
  `n/m`; confirmed by EL 2026-10-03: a lapsed revenue figure shows `n/m`, never an older year's growth); FY−n = the stored fiscal year end n years earlier, ± 45 days (52/53-week years), closest wins.
- Statuses exactly as in the table above: 1y `n/m` when either value is ≤ 0 or missing; CAGR `n/m` when an
  endpoint is ≤ 0, `insufficient_history` when FY−n is missing. Stored as fractions, shown as % (1 decimal).
- Hand check (fixtures, live 2026-10-02): KO FY2025 47,941 vs FY2024 47,061 / FY2022 43,004 / FY2020
  33,014 / FY2015 44,294 (`SalesRevenueGoodsNet`) USD m → 1.9% / 3.7% / 7.7% / 0.8%. RY (9 years) 10y →
  insufficient history.
- Portfolio cells for these metrics (weighted mean, coverage %) come with T14 (§9).

### Implementation notes (T10, #18)

- `roic_1y` per the table above, computed in `metric-compute.server.ts` with the other metrics.
- **SIC:** stored in `instruments.sic` (migration `0006`, idempotent `ADD COLUMN IF NOT EXISTS`) from SEC
  `submissions/CIK##########.json`, fetched with companyfacts (one extra request per covered symbol per
  7-day refresh). SIC 6000–6399 or no FY0 operating income → `n/m`.
- **Concepts:** equity = `equity_incl_nci`, else `equity_parent` (filers without NCI report only that).
  Short-term debt = `short_term_borrowings`, else commercial paper + other short-term borrowings. Long-term
  debt incl. current = `long_term_debt`, else current + noncurrent; IFRS filers whose only current line is
  "current borrowings incl. current portion" use it. Missing debt or cash lines = 0. New fallback tags
  `us-gaap:LongTermDebtAndCapitalLeaseObligations{,Current,IncludingCurrentMaturities}` (KO uses only these
  since FY2024): they include **finance** leases; operating lease liabilities are never used. **Named deviation (EL 2026-10-03): debt tags that include
  finance leases are a fallback only**, used for a fiscal year only when no lease-excluded debt tag exists for
  that year (KO FY2024+ → ROIC 17.4%).
- **Average:** (IC FY0 + IC FY−1) / 2, FY−1 as in T09 (±45 days); no FY−1 equity → `insufficient_history`.
- **QA F2 (no metric from partial inputs):** replaces "missing debt or cash lines = 0". Each line group
  (short-term debt, long-term debt, cash) that a company never reports in any stored year counts as 0; a
  group it reports in other years but not at FY0 or FY−1 → new status `insufficient_data` ("— insufficient
  data"). Rows stored by an older parser (`instruments.fundamentals_parser_version` < the code's version,
  migration `0007`) are refetched without waiting for the 7-day window and replaced; until then ROIC is
  `insufficient_data`. Migration `0007` also adds `insufficient_data` to the `metric_values.status` CHECK.
- **Atomic refetch:** a symbol's rows are replaced in one SQL statement (upsert new + delete rows not in the
  new set), so an interrupted or failing refetch leaves the previous rows intact (no partial set).
- **QA F1:** for the debt concepts the tag order decides before the filing date, so a lease-inclusive tag is
  used for a fiscal year end only when no lease-excluded tag exists for it (KO FY2023 uses `LongTermDebt*`).
- **Tooltip:** the header and every ROIC cell carry the formula, the 0–50% clamp and the 25% fallback.
- **Hand check (fixtures):** KO FY2025 NOPAT 13,762 × (1 − 2,861/15,998) = 11,300.9; IC 69,497 (FY2025) and
  60,066 (FY2024) → 17.4%. RY (SIC 6029, no operating income) → not meaningful.

### Implementation notes (T11, #19)

- `eps_1y` = the FY0 `eps_diluted` fact (us-gaap `EarningsPerShareDiluted`, ifrs-full
  `DilutedEarningsLossPerShare`) as reported, shown with the currency of its unit ("USD/shares" → "3.04 USD").
  Diluted only (basic is never substituted). Missing → `n/m`; a unit without a currency → `insufficient_data`.
- Splits: the FY0 figure is the most recent filing's (restatements win); no cross-year adjustment is needed
  because only FY0 is used. The 1y EPS growth for the portfolio cell (D9) is T14.
- Hand check (fixtures): KO FY2025 3.04 USD; Philips (PHG) 0.93 EUR; RY 14.07 CAD; ASML 24.71 EUR.

### Implementation notes (T12, #20)

- `ebit_margin_1y` = FY0 `operating_income` (us-gaap `OperatingIncomeLoss`, ifrs-full
  `ProfitLossFromOperatingActivities`) / FY0 `revenue`, both as stored. Missing FY0 revenue is treated like
  revenue ≤ 0 (`n/m`); no FY0 operating income → `n/m`; the two facts in different units →
  `insufficient_data`. No new tags, so no parser bump.
- Hand check (fixtures): KO FY2025 13,762 / 47,941 = 28.7%; Philips (PHG) 1,424 / 17,834 = 8.0%; RY → not
  meaningful (no operating income).

### Implementation notes (T13, #21)

- `gross_margin_1y` = FY0 `gross_profit` / FY0 `revenue`; when there is no FY0 `gross_profit` fact,
  (FY0 `revenue` − FY0 `cost_of_revenue`) / FY0 `revenue`. "No gross-profit concept" is read per FY0 (a
  company that dropped GrossProfit in its latest 10-K uses the derivation). Missing FY0 revenue is treated
  like revenue ≤ 0 (`n/m`); facts in different units → `insufficient_data`. No new tags, so no parser bump.
- Hand check (fixtures): KO FY2025 29,544 / 47,941 = 61.6% (also (47,941 − 18,397) / 47,941 via the
  fallback); Philips (PHG) 8,058 / 17,834 = 45.2%; RY → not meaningful.

## 9. Portfolio aggregates and weighting

- **Weight:** market value in the user's base currency (section 10). For metric *m*, the portfolio value
  is Σ(wᵢ · mᵢ) over holdings with a valid `mᵢ`, where wᵢ = MVᵢ / Σ MV of those same holdings (weights
  renormalised over covered holdings).
- **Coverage %** = Σ MV of holdings with a valid value / Σ MV of all holdings, shown next to every
  portfolio metric (e.g. `12.4% · 78% covered`). 0% coverage shows `—`.
- **Missing / `n/m` / insufficient history / not covered:** excluded from the weighted mean and counted
  against coverage. Never treated as zero.
- **Negative values** (negative ROIC, negative margins, negative growth) are included as they are.
- **CAGR from a negative or zero base** is `n/m` for that company and excluded.
- **EPS:** per-share amounts in different currencies do not add up across companies, so the portfolio row
  shows **weighted 1y EPS growth** (EPS FY0 / EPS FY−1 − 1, `n/m` if either ≤ 0) in the EPS column, labelled
  as such. (Decision D9: approved 2026-10-02.)
- Holdings with no price (no close yet) are excluded from weights and from the pie, and listed as
  "price pending".

*Epic #53: the weighting below is unchanged; the figures move to the metrics sheet's `Book` row and the pie becomes a donut with the same slices (section 0.2).*

**Pie chart:** one slice per holding by % of portfolio (base-currency market value), largest first; if
there are more than 10 holdings, the rest are grouped into "Other". Labels show ticker and %. No colour
or label implies good/bad.

### Implementation notes (T14, #22)

*Epic #53: math unchanged; shown in the `Book` row of the metrics sheet; 0% coverage shows `—` (section 0.5, items 11 and 14).*


- Computed at read time (`portfolio.ts`) from the stored valuation (T07) and `metric_values`; no new
  table. "Valid" = covered company + stored status `ok`. Price/FX-pending holdings are outside both the
  weights and the coverage denominator (they have no market value). Coverage is shown as a whole percent
  (never 100% unless fully covered, never 0% unless none); 0% shows `—` alone since #58 (was `— · 0% covered`).
- D9: per-company `eps_g_1y` stored alongside the other metrics (not a picker column): diluted EPS
  FY0 / FY−1 − 1; `n/m` if FY0 EPS is missing or either year ≤ 0; `insufficient_history` if no FY−1;
  `insufficient_data` if the units differ. Portfolio EPS cell label: "EPS growth 1y (weighted)", shown as a
  visible sub-label under the value (QA N3, #44), not only in the tooltip.
- Hand check (fixtures, base CAD, USD 1.4243 / EUR 1.6030): KO 997.01, ASML.AS 2,244.20, RY.TO 900.00,
  PHG 854.58, MC.PA 801.50 (not covered); EBIT margin over KO/ASML/PHG = 27.6% · 71% covered; EPS growth
  over KO (23.6%), ASML (28.4%), RY (25.1%) = 26.5% · 71% covered (PHG n/m: FY2024 EPS −0.75).

- EL approved (2026-10-03, #42/#43): whole-% coverage that never rounds to 0% or 100% unless exact;
  price/FX-pending holdings outside both weights and coverage; no FY−1 diluted EPS → insufficient history.
- Excluded-holdings flag (EL, #43): when N > 0 holdings are left out for no price (or no FX rate), the total
  row says "1 holding without a price excluded" / "N holdings without a price excluded" ("… without a
  price or FX rate excluded" when an FX-pending one is among them), so the coverage figure isn't read as
  covering them. Nothing is shown when N = 0.

### Implementation notes (T15, #23)

*Epic #53: `pieSlices()` unchanged, rendered as a donut under the one total; the pending lists under the chart go (section 0.5, items 10 and 14).*


- Slices from the T07 valuation rows: value / Σ value × 100, i.e. exactly the table's "% of portfolio",
  shown with the same 1-decimal rounding via one shared formatter (`formatPortfolioPct`, #24 N1). The
  rounded labels may not sum to exactly 100.0 (e.g. three equal holdings: 33.3% each); the slices themselves
  sum to 100. Largest first, ties by ticker. More than 10 valued holdings: the 10 largest + "Other" (11
  slices). Holdings without a price or FX rate: no slice, listed under the chart ("price pending" / "FX
  pending"). No priced holding: "No holdings with a price yet."
- recharts (already used by the DCA chart). Neutral greys only. A ticker + % list beside the chart (under it
  on small screens) is the text alternative; the chart has an `aria-label` with the same list.

## 10. Currency

- **Base currency:** per-user setting, `CAD` (default, Diego is Canadian), `USD` or `EUR`. All totals,
  market values, % of portfolio, weights and the pie use the base currency. Per-share columns (last close,
  average cost) stay in the listing currency, with the code shown.
- **FX source:** Bank of Canada daily exchange rates through the Valet API (free, no key), series such as
  `FXUSDCAD` and `FXEURCAD` ("Daily average exchange rate of the US dollar in Canadian dollars")
  ([Valet API docs](https://www.bankofcanada.ca/valet/docs); series description from
  `https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json`, both checked 2026-10-02).
  Rates are "published once each business day by 16:30 ET", are "indicative rates only" from averages of
  quotes, and are quoted as CAD per 1 unit of foreign currency
  ([Bank of Canada: Daily exchange rates](https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/),
  checked 2026-10-02).
- **Currencies the BoC does not publish:** the calculator's EU venues include Copenhagen, Budapest and
  Prague (DKK, HUF, CZK), which are not in the BoC daily list (same page). For those, use the ECB euro
  reference rate (X per EUR) crossed with BoC `FXEURCAD` (CAD per EUR): CAD per X = `FXEURCAD` ÷ ECB (X per EUR). ECB rates are "usually updated at around
  16:00 CET every working day, except on TARGET closing days" and are "for information purposes only"
  ([ECB: Euro reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html),
  checked 2026-10-02). SEK and PLN are in the BoC list.
- **Cross rates:** USD or EUR base converts through CAD (e.g. USD→EUR = `FXUSDCAD` / `FXEURCAD`), so one
  source drives every base.
- **Rate date:** the FX rate for the **same date as the price's session date**. If there is no rate that
  day, use the latest earlier rate and show its date. This happens: 2026-09-30 is a Bank of Canada
  holiday with no rates published, while US markets were open
  ([Bank of Canada: Daily exchange rates](https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/), table, checked 2026-10-02).
  The BoC rate is a daily average, not a 16:00 close; the dashboard says so in its note.
- **Cost basis:** average cost is entered in the listing currency. Total return % is computed in the
  listing currency ((close − avg cost) / avg cost). Base-currency amounts (market value, cost, return)
  use the **same** current FX rate for value and cost, so the FX effect since purchase is not captured.
  (Decision D8: approved 2026-10-02.)

### Implementation notes (T06, #14)

- **ECB source:** the ECB data API (`data-api.ecb.europa.eu`) answered 502 when this was built
  (2026-10-02), so the job reads the ECB's own reference-rate file
  `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml` (same rates, last 90 days).
- **Cross only on shared dates:** DKK/HUF/CZK = `FXEURCAD(d) / ECB(d)` only when both published for `d`.
  On a BoC holiday (2026-09-30: ECB published, BoC didn't) no cross is stored and the lookup uses the
  previous day's, with its date shown, like USD/EUR.
- **Storage:** BoC values stored verbatim (4 decimals as published); crosses with 10 significant digits.
  One row per currency and date, never fetched again. First fetch covers 30 days back (or the oldest held
  close − 7 days); then only dates after the last stored one. SEK/PLN/DKK/HUF/CZK only while held.
- **Where it runs:** at the end of the daily job (cron, preview button) and in the new-holding backfill;
  never in a page or API request. `GET /api/dashboard/fx?date=` reads stored rates (QA aid); a `date` that is not a real calendar date
  (e.g. 2026-02-31, 0000-01-01) is 400, checked before any database access (signed out is 401 first).
- **UI for DASH-12:** the base-currency select, a "Value (base)" column (shares × last close converted,
  with the rate and its date) and a total row were added so switching the base visibly re-expresses
  every total. T07 adds cost, return, % of portfolio and the as-of header on top of this.
- Fixtures (`test-fixtures/fx/`) were checked against live Valet and ECB on 2026-10-02; e.g. 2026-09-29
  `FXUSDCAD` 1.4188, `FXEURCAD` 1.6084; ECB 2026-09-29 DKK 7.4754, HUF 366.38, CZK 24.411.

## 11. Daily refresh

- **Mechanism:** one Vercel Cron Job calling `GET /api/cron/daily-refresh` on the production deployment.
  Vercel calls the production URL with user agent `vercel-cron/1.0`, cron times are **always UTC**
  ([Vercel: Cron Jobs](https://vercel.com/docs/cron-jobs), checked 2026-10-02). The route checks
  `Authorization: Bearer $CRON_SECRET`; Vercel sends that header automatically when a `CRON_SECRET`
  environment variable exists
  ([Vercel: Managing Cron Jobs, "Securing cron jobs"](https://vercel.com/docs/cron-jobs/manage-cron-jobs), checked 2026-10-02).
- **Hobby-plan limits:** cron jobs can run **once per day** at most (more frequent expressions fail the
  deployment), and timing is only per hour: `0 1 * * *` may run any time from 1:00 to 1:59
  ([Vercel: Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), checked 2026-10-02).
  Cron jobs count as function invocations; Hobby function max duration is 300 s, and Hobby is for
  "non-commercial, personal use only" ([Vercel: Hobby plan](https://vercel.com/docs/plans/hobby), checked 2026-10-02).
  The repo does not say which plan the project is on.
- **Schedule:** `0 23 * * *` (23:00–23:59 UTC = 19:00–19:59 ET in summer, 18:00–18:59 ET in winter).
  That is after the US/CA close (16:00 ET), after the BoC publication (16:30 ET), and long after EU closes
  and the ECB publication (16:00 CET), in both daylight and standard time. It also runs on weekends, where
  it finds Friday's data again and changes nothing.
- **Delivery is best effort:** Vercel does not retry a failed cron run, a run can occasionally be missed
  or delivered twice, and the docs ask for idempotent, reconciliation-based jobs with a lock
  ([Vercel: Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), checked 2026-10-02).
  So the job: takes a lock (`refresh_runs.run_date` unique), then for every held symbol fills **all**
  missing sessions since its last stored close via `DailyCloseProvider.getCloses()` (upserts keyed by `(symbol, session_date)`), fills missing
  FX dates, refreshes stale fundamentals, recomputes `metric_values`, and records the run. Running it twice
  gives the same result.
- **Budget:** one `DailyCloseProvider` call per batch of symbols, two FX calls, and SEC calls only for stale symbols, in batches that
  finish well under 300 s; if a batch is not done, the next run continues (reconciliation).
- **New holding added during the day:** saving the holding never calls a provider inside the browser
  request. It writes a `price_coverage` row and returns. A **background job** then calls
  `DailyCloseProvider.getCloses()` for that symbol once and stores the completed sessions (section 14, A.3):
  Vercel `waitUntil()` after the response, or else the next daily run or the preview refresh button. Until
  then the holding shows "price pending". No intraday bar is ever stored.
- **Previews:** cron only calls production, so preview QA cannot wait for it. When `VERCEL_ENV=preview`
  and the flag is on, the dashboard shows a "Run daily refresh (preview only)" button for signed-in users
  that calls the same job. It does not exist on production.
- **Staleness:** the dashboard header shows "Prices as of <latest session date> close · FX <date>". If the
  last successful run is more than 4 calendar days old, it shows a plain "Prices are out of date" note.
  EL confirmed (2026-10-02, #34): (a) a daily run that finishes with some per-ticker errors (`partial`)
  still counts as successful for this note, because each row shows its own close date; (b) the note also
  shows when no run has ever finished.

### Implementation notes (T05, #13)

- **Flag:** `/api/cron/daily-refresh` is a dashboard API route, so it answers 404 while `DASHBOARD_ENABLED`
  is off (§2). On production the daily cron call is therefore a no-op until the release go. Order: 404
  flag off, 405 for non-GET, 401 without the exact `Authorization: Bearer <CRON_SECRET>` (also when
  `CRON_SECRET` is unset: fail closed), 503 without a database, then the run.
- **Lock:** `refresh_runs.run_date` is the UTC date of the run. Taking the lock is one upsert that only
  succeeds when no run for that date is `running` (one stuck for > 10 min counts as crashed). A finished
  date can run again (the preview button, a duplicate cron delivery); writes are `ON CONFLICT DO NOTHING`,
  so a second run changes nothing.
- **Completed sessions:** bars are dated in the exchange's own time zone (Yahoo's `exchangeTimezoneName`).
  Today's bar is stored only once 30 minutes have passed since that session's regular end
  (`currentTradingPeriod.regular.end`), so the 23:00 UTC run stores that day's US, CA and EU closes and a
  run during market hours stops at the prior session.
- **Provider:** `DailyCloseProvider` exactly as A.4, plus one optional method, `getListing(symbol)`, which
  returns the exchange, region, MIC and currency from the response already fetched (no extra request), so
  the job can fill `instruments`. The Yahoo implementation reuses `pull()` and `toChart()`
  (`rawBars()`/`rawDividends()`). It doesn't read Yahoo's adjusted close, so `adj_close_src` stays empty and
  the weekly audit (A.4 rule 5) doesn't run yet. Closes are rounded to 4 decimals, dividends to 6.
- **Budget (self-imposed for Yahoo):** 30 requests a minute (one at a time), 500 per run, and no new symbol
  is started after 240 s; whatever is left waits for the next run. A symbol that already has today's close
  makes no request at all.
- **New holding:** the save writes the `price_coverage` row, then starts the backfill with `waitUntil()`
  (`@vercel/functions`) after the response. If that never finishes, the next run or the preview button
  fills it (pending rows are served first). The T04 listing check on add still makes one Yahoo metadata
  request inside that request; it isn't a price and stores nothing, but it is a provider call in a
  browser request, which A.3 says shouldn't happen. **Open question for the Engineering Lead:** keep it
  (DASH-08 needs the refusal on add) or move it behind `DailyCloseProvider`. **Answered (EL, 2026-10-02):**
  keep it on add, routed through `DailyCloseProvider.getListing()`; done in T07 (see below).
- **Preview button:** `POST /api/dashboard/refresh`, only when the flag is on and `VERCEL_ENV=preview` (404
  everywhere else, production and local dev included), signed in. It calls the job on the server, so
  `CRON_SECRET` is never needed or exposed; the response carries counts only.
- **Not in T05:** FX dates, fundamentals and `metric_values` (T06, T08+), and the "Prices as of … · FX …"
  header and stale note (they need FX; T07). The page shows each row's last close and session date, or
  "price pending"; on previews the button area shows the last run's date and status.

### Implementation notes (T07, #15)

*Epic #53: valuation math, D8, as-of line and out-of-date note unchanged; the columns move to the four-field row and the tap detail, the total row becomes one total, and average cost becomes optional (section 0.2, 0.5 items 7, 9 and 14).*


- **Columns:** ticker, name (`instruments.name`, filled by the backfill/daily job from the provider; "—"
  until then), shares, average cost and last close + session date (listing currency, code shown), market
  value and cost (base), total return (amount in base; % in the listing currency per §10), % of portfolio.
  Total row: total position, total cost, total return (amount and Σ return / Σ cost), 100.0%.
- **D8:** cost = shares × average cost × the same FX factor as the market value (the rate for the close's
  session date, else the latest earlier one), so the base-currency return % equals the listing-currency %.
- **Pending rows:** no close ("price pending") or no FX rate ("FX pending") → left out of the totals and
  % of portfolio (§9) and listed under the total row. Average cost 0 → return % `n/m`.
- **Header (§11 Staleness, DASH-25):** "Prices as of <latest session date among the valued holdings> close
  · FX <latest rate date used>"; "FX not needed (all in <base>)" when every holding is in the base
  currency. "Last successful run" = latest `refresh_runs` row with status `ok` or `partial` (a partial run
  finished and only had per-symbol errors); the note shows when it is more than 4 calendar days (UTC dates)
  old, or when no run has finished yet ("No daily refresh has completed yet.").
- **DASH-14:** the page loader (`loadDashboardHoldings`) reads Postgres only.
- **Listing check:** `listing.server.ts` → `DailyCloseProvider.getListing(symbol, { fetch: true })` (one
  metadata request when nothing is cached; without `fetch` the daily job only reads the cached response).
  `ProviderError.kind` maps refused / not found / unavailable to 400 / 404 / 503, same messages as before.

## 12. Acceptance criteria (QA checks these on the PR's Vercel preview)

*Epic #53: for tickets 2–6 the acceptance is [section 0.7](#07-acceptance-qa-on-the-preview-then-production-phone-400--860-and-desktop-1440--900) (DR0–DR6); section 0.8 says which IDs below are kept and which are superseded.*

Global (every ticket): **DASH-00** `/dashboard` and every `/api/dashboard/*` route return 404 on production
until the release go; the calculator (`/calculator` since #46) is unchanged (DCA-01..06 still pass); no buy, sell, hold,
"undervalued", "overvalued", rating or target wording anywhere in dashboard copy (extend the DCA-06 scan
to dashboard files); `noindex` still present on `/dashboard`.

| ID | Criterion |
|---|---|
| DASH-01 | Flag off: `GET /dashboard` → 404, no sign-in button or dashboard copy on any page (the site menu's Dashboard item and the home card are the #46 exception). Flag on: `/dashboard` renders. |
| DASH-02 | With no `DASHBOARD_ENABLED` value at all, the app behaves as flag off (fail closed). |
| DASH-03 | Preview: database connection status shows "connected"; tables from `0002_dashboard.sql` exist; `npm run build` logs the migration as applied once and "up to date" on a redeploy. |
| DASH-04 | Signed out: `/dashboard` redirects to sign-in; dashboard API calls return 401. |
| DASH-05 | Sign up with email + password, sign out, sign in again; session survives a page reload. |
| DASH-06 | User A cannot see or change user B's holdings or settings (two accounts on the same preview; direct API calls with A's session and B's ids return 404/403). |
| DASH-07 | Add a holding with ticker, shares and average cost; it persists after reload. Edit and delete work. Shares must be > 0, average cost ≥ 0; duplicate ticker for the same user is refused. |
| DASH-08 | A non US/EU/CA ticker is refused with the calculator's exact message (`X lists on Y. US, EU, and CA listings only.`; BSE message for BSE). |
| DASH-09 | The daily job (through `DailyCloseProvider` only) stores, per held symbol, the latest completed session's close and its session date; running it twice in a row changes nothing; no bar dated "today" is stored while that exchange is open. |
| DASH-10 | The cron route rejects a request without the right `Authorization` header (401). The preview-only refresh button exists on previews and not on production. |
| DASH-11 | FX: the stored `USD` and `EUR` rates for a date equal the BoC Valet values for that date; for a BoC holiday the previous rate is used and its date is shown. DKK/HUF/CZK (if held) use BoC `FXEURCAD` ÷ ECB X-per-EUR for the same date (CAD per X). |
| DASH-12 | Base currency defaults to CAD; changing it to USD or EUR re-expresses all totals, and the setting persists. |
| DASH-13 | (Cost-basis FX per D8, approved.) Holdings table shows: ticker, name, shares, average cost (listing ccy), last close + session date (listing ccy), market value (base), cost (base), total return (amount and %), % of portfolio; a total row with total position, total cost, total return. % of portfolio sums to 100.0% (± rounding). |
| DASH-14 | Values recompute only after the daily job: reloading during market hours does not change any price. |
| DASH-15 | Metric column picker: add/remove/reorder columns; choice persists per user. |
| DASH-16 | Revenue growth 1y and 3y/5y/10y CAGR match a hand calculation from the SEC `companyfacts` values for KO (tag stitching) and Philips (PHG; PHIA.AS is not covered); RY shows `—` "insufficient history" for 10y; a negative or zero base shows `—` "not meaningful". |
| DASH-17 | ROIC (1y) matches a hand calculation using the section 8 formula for one US filer; a bank (e.g. RY) shows `—` "not meaningful". |
| DASH-18 | EPS (1y) equals the FY0 diluted EPS in `companyfacts`, shown with its reporting currency code. |
| DASH-19 | EBIT margin (1y) = operating income / revenue for FY0, matching `companyfacts`. |
| DASH-20 | Gross margin (1y) matches `companyfacts`; uses revenue − cost of revenue when no gross-profit tag; banks show `—`. |
| DASH-21 | A holding without SEC coverage (e.g. a TSX-only or EU-only issuer) shows `—` "not covered" in every metric cell. |
| DASH-22 | Portfolio row: each metric equals the market-value-weighted mean over covered holdings (hand check with 3 holdings), with coverage % shown; `n/m`/missing are excluded, never counted as 0; negatives are included. |
| DASH-23 | Portfolio EPS column shows weighted 1y EPS growth, labelled as such. (Per D9, approved.) |
| DASH-24 | Pie chart: one slice per holding by % of portfolio in base currency, matching the table's % column; > 10 holdings group into "Other"; holdings without a price are excluded and listed as "price pending". |
| DASH-25 | Header shows "Prices as of … close · FX …"; with the last successful run older than 4 days, the out-of-date note appears. |
| DASH-26 | Release check (flag on, full pass): DASH-00..25 all pass in one run on the release candidate, then on production right after the flip. |

## Tickets

*v1 tickets T01–T16 below. The redesign tickets (#54–#59) are in [section 0.6](#06-tickets).*

Each ticket is one PR, one Vercel preview, one QA pass, merged behind `DASHBOARD_ENABLED`. All carry the
label `dashboard`. The spec was approved on 2026-10-02, and all decisions D1–D13 are decided, so `blocked: spec approval` is
removed. The tickets that implement D8, D9 and D12 say so below.

| # | Issue | Ticket | Depends on | ACs |
|---|---|---|---|---|
| T01 | #9 | Feature flag + hidden `/dashboard` route shell | spec approval | DASH-00, 01, 02 |
| T02 | #10 | Per-user storage: Neon Postgres + `0002_dashboard.sql` schema | T01 (+ owner installs Neon) | DASH-03 |
| T03 | #11 | Auth on Vercel: Better Auth email/password, auth schema, preview origins. **Sign-up limited to the email allow-list (D12, approved)** | T01, T02 | DASH-04, 05, 06 |
| T04 | #12 | Holdings table CRUD (no prices yet) | T03 | DASH-07, 08, 06 |
| T05 | #13 | Daily close job (cron, prior-session rule, preview refresh button); all fetching through the `DailyCloseProvider` interface (Amendment A) | T02, T04 | DASH-09, 10, 14 |
| T06 | #14 | FX rates (BoC + ECB cross) and base-currency setting | T02, T05 | DASH-11, 12 |
| T07 | #15 | Holdings valuation: market value, total return, % of portfolio, totals, as-of header. **Cost-basis FX per D8 (approved)**; reads stored closes only (written via `DailyCloseProvider`, never a feed directly) | T04, T05, T06 | DASH-13, 14, 25 |
| T08 | #16 | Fundamentals ingest from SEC EDGAR companyfacts (+ metric column picker) | T02, T05, T07 | DASH-15, 21 |
| T09 | #17 | Metric: Revenue growth 1y + 3y/5y/10y CAGR | T08 | DASH-16 |
| T10 | #18 | Metric: ROIC (1y) | T08 | DASH-17 |
| T11 | #19 | Metric: EPS (1y) | T08 | DASH-18 |
| T12 | #20 | Metric: EBIT margin (1y) | T08 | DASH-19 |
| T13 | #21 | Metric: Gross margin (1y) | T08 | DASH-20 |
| T14 | #22 | Portfolio aggregates (weighted, coverage %). **Portfolio EPS column per D9 (approved)** | T07 + at least one of T09–T13 (each metric gets its portfolio cell as it lands) | DASH-22, 23 |
| T15 | #23 | Holdings pie chart by % of portfolio | T07 | DASH-24 |
| T16 | #24 | Release: full flag-on QA run, then production flip on Diego's go | T01–T15 merged with QA PASS | DASH-26 |

GitHub issues #9–#24 on diegolbquintela/orpheus-app, each labelled `dashboard`, each linking back to this spec PR (#8).

## Release plan

1. **Per ticket:** harness → spec → ticket → PR → CI green → Engineering Lead review → QA PASS on the PR's
   preview → Lead merges. Production stays flag off, so `/dashboard` is a 404 there after every merge
   (DASH-00 is re-checked on production after each merge).
2. **"Cleanly" means:** every ticket T01–T15 is merged with a QA PASS on its preview, there are no open
   QA fails or open bugs labelled `dashboard`, and CI on `main` is green.
3. **Release candidate:** a preview deployment of the current `main` commit (e.g. a `release/dashboard`
   branch pointing at `main`, no other changes), flag on by Preview scope. QA runs the **full** DASH-00..25
   pack plus DCA-01..06 there in one run (DASH-26). Any fail goes back to a ticket; the run restarts after
   the fix is merged.
4. **Go:** only on Diego's explicit go, relayed by the Chief of Staff. Then the Engineering Lead (or Diego)
   sets `DASHBOARD_ENABLED=true` (and the auth/DB variables) for the **Production** environment and
   redeploys `main` (a value change only applies to new deployments,
   [Vercel: Environment variables](https://vercel.com/docs/environment-variables), checked 2026-10-02).
   QA re-runs the pack on production right away.
5. **Rollback:** set `DASHBOARD_ENABLED` to anything other than `true` (or remove it) for Production and
   redeploy; `/dashboard` is a 404 again and the calculator is untouched. User data stays in the database.
   Vercel Instant Rollback to the previous deployment is the faster fallback; note it also reverts cron
   jobs to that deployment's set ([Vercel: Managing Cron Jobs, "Rollbacks with cron jobs"](https://vercel.com/docs/cron-jobs/manage-cron-jobs), checked 2026-10-02).
6. After the release, README, this spec (status → "live") and `AGENTS.md` are updated in the T16 PR.

**Release prep (#24, prep PR):** the full checklist, Production env list (names and formats only), database
options (recommended: a dedicated Neon production branch), migration commands, ordered runbook and test-account
steps are in [`docs/release/dashboard-release.md`](../docs/release/dashboard-release.md); read-only smoke:
`scripts/release-smoke.mjs`. N3 recommendation there: keep `/api/dashboard/db` 404 on production (as coded) and
`/api/dashboard/status` public with only `{"dashboard":"enabled"}` on production.

## 13. Decisions record

Diego decided every item on 2026-10-02: D1–D12 approved (D8, D9 and D12 as recommended), and D13
(Amendment A, daily-close source) decided at $0 with Yahoo as primary. This record replaces the earlier
"Open questions" and "Decisions for Diego" lists.

| # | Decision | Outcome | Status | Cost |
|---|---|---|---|---|
| D1 | Auth | Better Auth (already in repo), email/password, Grok broker path removed (section 3) | **Approved 2026-10-02** | $0 |
| D2 | Storage | Neon Postgres Free via Vercel Marketplace, preview branching off (section 4) | **Approved 2026-10-02** | $0 |
| D3 | Data source | SEC EDGAR `companyfacts` for fundamentals; daily close through `DailyCloseProvider` (Yahoo first). **Daily-close source settled by D13: Yahoo primary, Neon cache, Alpha Vantage free fallback** | **Approved 2026-10-02** | $0 |
| D4 | Weighting | Market-value weighted in base currency, renormalised over covered holdings, coverage % shown, `n/m` excluded (section 9) | **Approved 2026-10-02** | — |
| D5 | Currency | CAD default, per-user USD/EUR; BoC daily rates (ECB cross for DKK/HUF/CZK), same date as the price (section 10) | **Approved 2026-10-02** | $0 |
| D6 | Refresh | One Vercel Cron at `0 23 * * *` UTC, idempotent catch-up, `CRON_SECRET`; preview-only manual refresh button (section 11) | **Approved 2026-10-02** | $0 |
| D7 | Holdings input | Manual holdings entry instead of an IBKR/Fiscal.ai feed first (settles the DCA spec's sequence note) | **Approved 2026-10-02** | — |
| D8 | Cost basis | Average cost in listing currency; base-currency amounts use the current FX rate for value and cost (FX effect since purchase not shown) | **Approved 2026-10-02** | — |
| D9 | Portfolio EPS | Weighted 1y EPS growth shown in the portfolio EPS column, labelled as such | **Approved 2026-10-02** | — |
| D10 | Paid data | Stay on the $0 path; non-SEC EU/TSX names show "not covered"; no paid vendor now. D13 decided $0, consistent with D10 | **Approved 2026-10-02** | $0 |
| D11 | Sign-in methods | Email/password only at launch; Google later only as its own ticket | **Approved 2026-10-02** | $0 |
| D12 | Who may sign up | Allow-list of emails in a Vercel env var, `DASHBOARD_SIGNUP_ALLOWLIST` (no open sign-up); handled in T03 (#11) | **Approved 2026-10-02** | $0 |
| D13 | Daily-close source (Amendment A, section 14) | Stay at $0: Yahoo primary behind `DailyCloseProvider`; each close cached once per ticker and date in Neon, never fetched again; Alpha Vantage free as fallback where it fits (fit partly **unverified**); no EODHD (EODHD and Twelve Data: revisit later); Yahoo ToS §2.d.ix risk known and accepted for now; consistent with D10 | **Decided 2026-10-02: $0, Yahoo primary** | $0 |

## 14. Amendment A: daily-close source

Status: **Decided 2026-10-02 (D13): stay at $0.**
- **Primary: Yahoo**, behind `DailyCloseProvider`. It wraps the calculator's existing Yahoo chart call.
- **Cache:** every close is cached **once per ticker and session date** in Neon and is never fetched
  again.
- **Fallback: Alpha Vantage's free tier**, behind the same interface, where it fits its limits (A.5). Any
  fit that isn't confirmed is marked **unverified**.
- **No paid vendor**, no EODHD, no email to any vendor and no sign-up for a paid plan. EODHD and Twelve
  Data stay in the comparison as **revisit later**.
- **Yahoo terms risk accepted:** Diego knows about the Yahoo Terms of Service risk (§2.d.ix bans automated
  collection without permission) and **accepts it for now**.
- **Consistent with D10** (stay on the $0 path).

This section condenses the Engineering Lead's research (2026-10-02, America/Toronto). Every fact comes
from the provider's own pricing, docs or terms page, linked inline. Anything that could not be confirmed
on a provider page is marked **unverified**. The only API calls made were to documented public endpoints
that need no key: Twelve Data `/exchanges` and the `demo` key its docs publish. Tiingo's public
`supported_tickers.zip` was also downloaded.

**Requirements.**
- R1: daily closes only, meaning the prior session's close and never intraday.
- R2: US, EU and CA listings, e.g. SAP.DE, ASML.AS, PHIA.AS, RMS.PA, RY.TO and SHOP.TO.
- R3: history back to about 2000, for calculator backtests.
- R4: split and dividend handling.
- R5: the terms allow automated server-side use.
- R6: the terms allow display in a private, single-user app.

### A.1 Comparison

Prices are in USD as listed on 2026-10-02. "EU" means Xetra, Euronext Amsterdam and Euronext Paris; "CA" means the TSX.

| Provider | Free tier | Coverage (US / EU / CA) | History | Splits / dividends | Display in a private app | Cheapest paid tier for US+EU+CA EOD | Meets R1–R6? |
|---|---|---|---|---|---|---|---|
| **EODHD** (revisit later) | 20 calls/day, 1 yr history | "Stocks Global" EOD. Free-tier exchange restrictions **unverified** | Paid "30+ yrs". Non-US depth **unverified** | Raw OHLC + `adjusted_close`; dividends and splits endpoints, full history in 1 call each | Personal use allowed; displaying **to others** prohibited (A.2) | **All-World $19.99/mo or $199/yr**, 100,000 calls/day | Paid: yes (R6 would need confirmation). Free: no. **Revisit later** |
| **Twelve Data** (revisit later) | 800 credits/day | Free tier is **US only**. Xetra, Euronext and TSX need Grow | AAPL to 1980-12-12. Non-US depth **unverified** | `adjust` = all/splits/dividends/none; `/dividends` and `/splits` on Grow+ | Free tier: "Internal non-display usage" only. Grow: "Internal display data access" | **Grow $29/mo ($24/mo billed yearly)** | Grow: yes. Free: no. **Revisit later** |
| **Alpha Vantage** | **25 requests/day** | US, `.LON`, `.TRT` and `.DEX` examples. Euronext **unverified** | "25+ years" | Free: raw `compact` (last 100 points). `full` history and daily adjusted are premium. `DIVIDENDS`/`SPLITS` aren't marked premium | **Yes, explicitly** ("display") | Premium **$49.99/mo** | Free: no as primary (25/day, no full history); **chosen as $0 fallback** (A.5). Premium: likely yes (Euronext **unverified**) |
| **Tiingo** | 1,000 req/day | **US only**, no TSX/EU (`supported_tickers.zip`) | "30+ Years" | `adjClose`, `divCash`, `splitFactor` | Self-display only | Power $30/mo, still no EU/CA | **No.** Free plan forbids persistent storage |
| **Massive (formerly Polygon.io)** | 5 calls/min, 2 yrs | **US only** | Up to "20+ yrs" (Advanced $199) | Corporate actions on all tiers | Personal, non-business use | None with EU/CA prices | **No** |
| **Financial Modeling Prep** | 250 calls/day, 5 yrs | Free coverage **unverified**. "Global" on Ultimate only | 30+ yrs on Premium/Ultimate | By plan, **unverified** | Multi-user display needs an agreement; single-user use **unverified** | Ultimate $99/mo billed annually; monthly price **unverified** | Coverage yes, but storage terms are hostile to caching |
| **Marketstack** | 100 requests/**month** | 72+ exchanges claimed; Xetra/Euronext/TSX **unverified** | Professional "15+ Years"; reaching 2000 **unverified** | Listed on all tiers | **Unverified** | Coverage unverified | **No / unverified** (R3) |
| **Nasdaq Data Link** | No free EOD equities | **US only** (**unverified**) | 1996 to present (**unverified**) | Yes (**unverified**) | **Unverified** | Price not public (**unverified**) | **No** |
| **Stooq** | No documented API (**unverified**) | **Unverified** | **Unverified** | **Unverified** | Redistribution needs consent (terms 5.3) | No paid API found | **No.** Same scraping risk as Yahoo |
| *Yahoo (current, stays primary)* | Unofficial; no published limits (**unverified** fit) | US/EU/CA, as the calculator uses today | As the calculator uses today | Daily bars plus dividend and split events (`events=div,split`) | Automated collection banned without permission (ToS 2.d.ix) | — | Fails R5 on paper. **Risk known and accepted for now (D13)** |

Call volume (the research's estimate for 30 holdings plus occasional backtests; similar for any provider):
- One-time backfill: about 3 calls per ticker on providers that split prices, dividends and splits into
  separate calls. On Yahoo it's 1 call, because the chart call returns events too.
- Steady state: about **30–45 calls/day, or about 900–1,350 calls/month**.
- Yahoo publishes no limits, so whether this volume fits is **unverified**. The Neon cache keeps it to
  one fetch per close.
- Alpha Vantage's free 25 requests/day can't carry this as a primary, so it is a gap-filler only.

### A.2 Terms quotes

- **EODHD.** A Non-Professional User "views or uses EOD Historical Data Information solely in a personal capacity for their own personal investment activities … Non-Professional Users are permitted to **store, manipulate, and analyze** the data for private, non-commercial purposes. However, they are prohibited from: Sharing access to their account with others … Selling, reselling, retransmitting, redistributing, **displaying**, or granting access to the Information or Services." — https://eodhd.com/financial-apis/terms-conditions
  - *Reading:* a noindex, single-user, auth-gated dashboard fits personal use, but the bare word "displaying" is ambiguous. If EODHD is revisited, it would need a written confirmation from EODHD first. **Nothing was sent; D13 chose $0.** With more users it becomes Professional (commercial) use.
  - Pricing: "History depth … 1 yr" on the free plan. All-World is $19.99/mo or $199.00/year with "30+ yrs" — https://eodhd.com/pricing
  - Data: "The OHLC fields are **raw** … The adjusted_close field is adjusted for **both splits and dividends**." — https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
  - Splits and dividends: "Both endpoints cost 1 API call per request, whatever the date range." — https://eodhd.com/financial-apis/api-splits-dividends
  - Exchange codes (`SAP.XETRA`, `ASML.AS`, `RMS.PA`, `RY.TO`): https://eodhd.com/list-of-stock-markets
  - **Unverified:** non-US history depth, whether the free tier serves non-US exchanges, and whether cached data must be deleted after cancellation.
- **Twelve Data.** §2.2 grants the right to "(a) Access, receive, process, and **store** Data solely for Internal Use … (b) **Display** Data to Authorized Users … as expressly permitted by your Subscription Tier".
  - §2.3 forbids: "(g) Store or cache Data beyond permitted timeframes specified in the Documentation", "(h) Use automated tools to exceed API Rate Limits" and "(l) Use Free Tier data for commercial purposes". — https://twelvedata.com/terms
  - The free tier is "Internal non-display usage"; Grow is "Internal display data access". — https://twelvedata.com/pricing
  - Exchange plan levels: https://api.twelvedata.com/exchanges?show_plan=true
  - **Unverified:** the caching "permitted timeframes" in §2.3(g), and non-US history depth.
- **Alpha Vantage.** §2.a: "Alpha Vantage grants the right to install, use, access, **display** and run the software … for personal, non-commercial use." — https://www.alphavantage.co/terms_of_service/
  - Free tier: "25 API requests per day". — https://www.alphavantage.co/support/
  - "The '**full' outputsize is available to premium keys**." — https://www.alphavantage.co/documentation/
  - **Unverified:** Euronext symbols, and whether DIVIDENDS/SPLITS cover non-US listings.
- **Tiingo.** §1.6(a): "If you use a Starter Plan or any free or paid trial plan … you **may not write, save, archive, back up, or otherwise retain Tiingo Data in any persistent or durable storage**." — https://app.tiingo.com/tos/
  - "you may not display or share the data with another person or organization." — https://www.tiingo.com/about/pricing
- **Massive (formerly Polygon.io).** Access is "solely for your own personal, non-commercial, and non-business purposes." — https://massive.com/legal/individuals-terms-of-service
  - Pricing: https://massive.com/pricing
- **Financial Modeling Prep.** §2.2.1: "The Customer may not copy or download any content from the Services except with the prior written approval of FMP."
  - §2.8: "Customer will notify FMP of the IP and domain aliases of any location where data is stored or processed." — https://site.financialmodelingprep.com/terms-of-service
- **Marketstack.** Pricing: https://marketstack.com/pricing. Display terms **unverified**.
- **Nasdaq Data Link.** The coverage facts in A.1 (US only, 1996 to present, dividends and splits) are **unverified**. The research's help-centre article and docs page now redirect to a 404 (checked 2026-10-02), and no live Nasdaq page confirming them was found.
- **Stooq.** Terms 5.3: "Redistribution of data found on the website is not allowed without the consent of Stooq." — https://stooq.com/terms.html
  - The page was read through the search index, because the live page is behind a JavaScript check.
  - A documented API is **unverified**.
- **Yahoo.** Collecting data "using any automated means … without our express, prior permission" is forbidden (§2.d.ix). — https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
  - **Known and accepted for now** (Diego, D13, 2026-10-02). The Neon cache keeps the exposure to one fetch per close, plus the weekly events check.

### A.3 Neon cache design

**Principle:** each close for an (instrument, session date) is fetched **once** and never fetched again.
Every dashboard read comes from Postgres, never from a provider. Corporate-action events are refreshed
weekly (flow 3). The calculator is unchanged and keeps calling Yahoo through `/api/chart` as it does
today.

**Storage is raw.** The series of record is raw closes plus explicit split and dividend events, and Orpheus
computes its own adjustment factors and total-return series.
- Yahoo's chart `close` and dividend amounts are scaled by later splits. `rawBars()` and `rawDividends()`
  in `src/lib/dca/raw.ts` already undo that, and the Yahoo implementation reuses them.
- A provider-adjusted close, where one is returned, goes only into `adj_close_src` and is **only a
  cross-check**, never the series of record.
- Today's Yahoo code doesn't read an adjusted close, and Alpha Vantage's free tier has none (its daily
  adjusted series is premium). So `adj_close_src` may stay empty, and the weekly audit (A.4, rule 5) then
  doesn't run.

**Schema delta** on the section 5 tables. It lands with T05 (#13) or a follow-up ticket, which the
Engineering Lead decides when cutting work:

| Table | Change |
|---|---|
| `instruments` | Add `mic` (XETR, XAMS, XPAR, XTSE, XNYS, XNAS) and `provider_ids` jsonb, e.g. `{"yahoo":"SAP.DE","alphavantage":"SAP.DEX"}`. `currency` stays one per series and is never mixed. |
| `daily_closes` | `close` stays the raw as-traded value. Add `adj_close_src` numeric null, the provider's adjusted close, used only for validation. `source` records the provider. A row, once written, is never fetched again. |
| `corporate_actions` (new) | `symbol`, `ex_date`, `kind` (`dividend` \| `split`), `cash_unadj` (dividend per share as declared, **not** split-adjusted), `split_from`, `split_to`, `source`, `fetched_at`. PK (`symbol`, `ex_date`, `kind`). |
| `price_coverage` (new) | `symbol` (PK), `first_session_date`, `last_session_date`, `actions_checked_at`, `last_error`. It records what is already stored, so nothing is fetched again. A row with no `last_session_date` is a backfill still waiting to run. |

**Fetching runs in background jobs only.** No browser request ever calls a provider.
1. **Backfill on a new holding.** The server function that saves the holding only writes a
   `price_coverage` row and returns. A background job does the fetch after the response is sent:
   - Vercel's `waitUntil()`
     ([Vercel Functions package](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package),
     checked 2026-10-02), or else the next daily run or the preview refresh button.
   - It fetches full history from 2000-01-01 plus the dividend and split events. On Yahoo that's 1 call.
   - Rows are written with `on conflict do nothing`. Until the job finishes, the holding shows "price
     pending" (DASH-24).
2. **Nightly incremental.** For each held symbol, fetch only from `last_session_date + 1`. This runs in the
   D6 cron job at `0 23 * * *` UTC.
   - Whether every exchange's close is published on Yahoo by then is **unverified**.
   - Any session missed is picked up by the next run's idempotent catch-up.
   - Any bar dated today or later in the exchange's time zone is rejected (R1).
3. **Corporate actions.** Refreshed weekly per held symbol through `getCorporateActions()`. Only
   `corporate_actions` is written; closes in the same response are never written again.
4. **Guards.** A per-provider budget applies: Alpha Vantage at 25/day, and a conservative self-imposed cap
   for Yahoo, which publishes none. Concurrency is 1–2.

### A.4 Provider interface: primary plus fallback

`DailyCloseProvider` (section 6) stays the only way to fetch prices. Amendment A extends it, and
`getCloses()` keeps its signature:

```ts
interface DailyClose {
  symbol: string;        // app symbol, e.g. "RY.TO"; providers map it via instruments.provider_ids
  date: string;          // exchange-local session date, YYYY-MM-DD (completed sessions only)
  close: number;         // RAW official close, listing currency (series of record)
  currency: string;      // ISO code, must match the instruments row
  source: string;        // provider id: "yahoo" or "alphavantage"
  adjCloseSrc?: number;  // provider-adjusted close, stored only as a cross-check
}

interface CorporateAction {
  symbol: string;
  exDate: string;              // YYYY-MM-DD
  kind: "dividend" | "split";
  cashUnadjusted?: number;     // dividend per share as declared (not split-adjusted)
  splitFrom?: number;          // e.g. 1 -> 4
  splitTo?: number;
  source: string;
}

interface DailyCloseProvider {
  id: string;                                  // "yahoo" (primary) | "alphavantage" (fallback)
  supports(symbol: string): boolean;           // exchange coverage
  budget: { perMinute: number; perDay: number };
  /** Raw closes for completed sessions on or before `date` (the latest one, plus any missing since `since`). */
  getCloses(symbols: string[], date: string, opts?: { since?: string }): Promise<DailyClose[]>;
  /** Unadjusted dividends and splits, full history or since `since`. */
  getCorporateActions(symbol: string, opts?: { since?: string }): Promise<CorporateAction[]>;
}
```

**Resolution.** The primary is tried first, then the fallback, then the call fails soft. If both fail, the
UI shows the last cached close with a "stale since <date>" badge and never a made-up value.
- A stored close is never replaced, whichever provider wrote it; its `source` column records which one.
- Only background jobs call the provider: the daily job (T05, #13) and the new-holding backfill job. T07 #15, T14 #22 and T15 #23 read stored rows only.

**Reconciliation:**
1. **Overlap check.** On the first fallback fetch, compare raw closes on overlapping dates. If the median absolute difference is > 0.5%, flag a mapping or currency problem and don't write.
2. **Raw history only.** Request unadjusted bars where a provider offers them. Otherwise divide out known splits before storing, as `rawBars()` already does for Yahoo.
3. **Unadjusted dividends.** Store unadjusted dividend amounts. Split-adjusted amounts, such as Yahoo's, are multiplied back by the cumulative split factor (`rawDividends()`).
4. **No listing substitution.** A fallback never uses a different listing, e.g. the US ADR `ASML` for `ASML.AS`. Currency and MIC must match the `instruments` row.
5. **Weekly audit** (only where `adj_close_src` exists). The locally adjusted series must match `adj_close_src` within 0.1%. A mismatch triggers a refetch of corporate actions only; closes are never fetched again.

### A.5 Decision (D13, decided 2026-10-02)

- **Primary: Yahoo ($0).** It wraps `src/lib/dca/yahoo.server.ts` behind `DailyCloseProvider` and caches
  each close once in Neon (A.3).
  - Its terms risk (ToS §2.d.ix) is **known and accepted for now**.
  - Its fit for this volume is **unverified**, because Yahoo publishes no limits.
- **Fallback: Alpha Vantage free key ($0)**, behind the same interface and used only when Yahoo fails for a
  symbol. Its terms explicitly allow personal display.
  - Free `TIME_SERIES_DAILY` `compact` (the last 100 sessions) plus `DIVIDENDS`/`SPLITS` can fill missed
    days.
  - It can't backfill: full history is premium, so a backfill waits for Yahoo.
  - A full gap-fill for one symbol takes 3 requests: `TIME_SERIES_DAILY`, `DIVIDENDS` and `SPLITS`. At 25
    requests/day that covers about **8 symbols a day** (25 ÷ 3). Anything beyond that waits for the next
    run.
  - **Unverified:** Euronext Paris/Amsterdam coverage (check `SYMBOL_SEARCH` once a key exists), and
    whether DIVIDENDS/SPLITS cover non-US listings. A symbol it doesn't cover just keeps its last close,
    marked "stale since <date>".
  - The key is a free Alpha Vantage key, not a paid plan. Nobody claims it until the fallback ticket
    starts and Diego OKs it, asked through the Chief of Staff. The owner then claims it and adds it as a
    Vercel env var; bots never do.
- **Revisit later (no action now):**
  - EODHD All-World, $19.99/mo or $199/yr. It would need EODHD's written usage-terms confirmation.
  - Twelve Data Grow, $29/mo ($24/mo yearly).
- **Rejected:**
  - Tiingo: no EU/CA, and the free plan bans storage.
  - Massive and Nasdaq Data Link: US only (the Nasdaq facts are **unverified**).
  - FMP: $99/mo, and storage-hostile terms.
  - Marketstack: history to 2000 **unverified**.
  - Stooq: scraping risk.
  - Free-only stacks other than Yahoo + Alpha Vantage: none meets R2 + R3.
- **Tradeoffs accepted:**
  - The Yahoo terms risk, and the fact that Yahoo can change or block the endpoint without notice. If it
    does, the fallback fills gaps where it can, the dashboard shows "stale since <date>", and D13 is
    revisited.
  - Non-US depth is checked at backfill time and logged in `price_coverage.first_session_date`.

### A.6 Rollout

1. **T05 (#13):** the daily close job implements `DailyCloseProvider` with Yahoo and the Neon cache (A.3,
   A.4). Fetching runs in background jobs only.
2. **Alpha Vantage fallback**, as its own small ticket once T05 has merged. When it starts, the Chief of
   Staff asks Diego to OK the free key. Only after that OK does the owner claim it and set it in Vercel;
   nobody claims it earlier, and bots never do. Run the overlap check (A.4, rule 1) and record Euronext coverage.
3. **Revisit EODHD or Twelve Data** only if Yahoo fails in practice or Diego reopens D13.

The calculator stays on Yahoo, so nothing in `attachments/dca-app-spec.md` or `README.md` changes. No
dashboard ticket (#9–#24) changes, because they all go through `DailyCloseProvider`.

## Sources (all checked 2026-10-02)

- Vercel: [Environment variables](https://vercel.com/docs/environment-variables) ·
  [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) ·
  [Cron Jobs](https://vercel.com/docs/cron-jobs) · [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) ·
  [Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Hobby plan](https://vercel.com/docs/plans/hobby) ·
  [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) · [Marketplace: Neon](https://vercel.com/marketplace/neon)
- Neon: [Pricing](https://neon.com/pricing) · [Vercel-Managed Integration](https://neon.com/docs/guides/vercel-managed-integration)
- Upstash: [Redis pricing](https://upstash.com/pricing/redis) · Supabase: [Pricing](https://supabase.com/pricing) · Clerk: [Pricing](https://clerk.com/pricing)
- Better Auth: [Installation](https://www.better-auth.com/docs/installation) · [Google](https://www.better-auth.com/docs/authentication/google) ·
  [OAuth Proxy](https://www.better-auth.com/docs/plugins/oauth-proxy) · Google: [OAuth 2.0 for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- SEC: [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) · [Accessing EDGAR Data](https://www.sec.gov/os/accessing-edgar-data)
- Canada: [SEDAR+ FAQ](https://systems.securities-administrators.ca/onlinehelp/faqs/continuous-disclosure/) ·
  [Bank of Canada Valet API](https://www.bankofcanada.ca/valet/docs) · [BoC daily exchange rates](https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/)
- EU: [ESMA Electronic Reporting](https://www.esma.europa.eu/issuer-disclosure/electronic-reporting) ·
  [ESMA ESEF tutorial 3](https://www.esma.europa.eu/sites/default/files/library/esma32-60-494_-_esef_tutorial_3_script.pdf) ·
  [filings.xbrl.org](https://filings.xbrl.org/about.html) · [ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- Daily-close vendors for Amendment A (EODHD, Twelve Data, Alpha Vantage, Tiingo, Massive, FMP, Marketstack,
  Stooq): linked inline in section 14. Nasdaq Data Link: no live source (facts marked unverified).
- Data vendors: [FMP pricing](https://site.financialmodelingprep.com/developer/docs/pricing) · [EODHD pricing](https://eodhd.com/pricing) ·
  [Yahoo Terms of Service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)
