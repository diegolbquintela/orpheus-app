# Orpheus desk app — v1 spec

Date: 2026-10-02

## Destination

A personal fund desk. It will eventually track holdings, decisions, and desk opinions, then grow into a web app.

v1 is only the DCA calculator. Dashboards, holdings, and scorecards are later. Do not build them in this pass.

Sequence after this app, not in scope now:

- Decision log: one Diego line after each scorecard (hold / add / trim / revisit + date).
- Own checklist before the eight-desk scorecard returns.
- A boring price and holdings feed (IBKR or Fiscal.ai) before any dashboard.

## Site and routes (#46, approved by Diego 2026-10-04)

**Look updated by epic #66 (dark, 2026-10-05; `attachments/site-style-spec.md`):** the bar and footer keep their
items and copy and go charcoal on every page (#68); the calculator gets the Botticelli hero, the title
`Dollar-cost average calculator.`, underline fields, one green chart line and label-value results, with an
approved phone layout (#70); home gets the Jordaens hero, `Investment driven by research.` and the Platforms
lines (#69). The routes, the redirect, noindex, analytics and every calculator rule here stay as they are.

The app is one site with three routes. The calculator rules below don't change.

- **`/calculator`**: this calculator, moved off `/` unchanged (same inputs, output, copy and six DCA rules,
  including the note "US, EU and CA listings, one currency per basket." under the basket).
- **`/`**: home. One line saying what the desk is ("Orpheus Wisdom is a private desk with two tools.") and
  exactly two cards: **Calculator**, "compare a lump sum with contributions", opens `/calculator`;
  **Dashboard**, "holdings, value, stored figures", opens `/dashboard`. No news, no scores, no buy/sell wording.
  Home does no calculating: no price requests, no calculator code.
- **`/dashboard`**: the signed-in dashboard (`attachments/dashboard-spec.md`), still gated by `DASHBOARD_ENABLED`.
- **Menu on every page** (sign-in included): a thin bar that stays at the top on scroll. "Orpheus" on the left
  links to `/`; "Calculator" and "Dashboard" on the right. No dropdowns. The current page has
  `aria-current="page"` and a visual state. The Dashboard item shows even when the dashboard flag is off.
- **Footer on every page:** exactly "Orpheus Wisdom", nothing else. No listings line, no disclaimer.
- `/` with a query string redirects to `/calculator` with the same query (the calculator reads no URL
  parameters, so this only keeps old links working).
- `noindex` meta on every page plus the `X-Robots-Tag: noindex, nofollow` header.
- **Analytics (#48):** Vercel Web Analytics on every page. It collects anonymous page views only (the path,
  with query strings and hashes stripped), sets no cookies and sends no custom events, so no tickers,
  amounts or other inputs. Why: to see which tools get used. No other trackers.

## What v1 is

Compare two cash plans on the same window, for one name or a weighted basket.

- Lump sum buys the starting capital on the first session where every name has a price, split by weight.
- DCA does not spend that capital. On each weekly or monthly date it adds the contribution as new cash and buys by weight.
- Dividends are reinvested in the name that paid them.
- Splits change the share count.
- Prices are raw daily closes, not split-adjusted closes. Using adjusted closes and also reinvesting dividends would count dividends twice.
- No buy, sell or hold output anywhere on the page. No order ticket.

## Inputs

All fields start blank. No sample ticker, no sample dates, no sample amounts, no pre-filled result.

- Basket: one or more rows of ticker and weight percent. Add and remove rows. At least one ticker. No duplicates.
- Start date, end date.
- Starting capital. Used only by the lump-sum path.
- Contribution amount. New cash on each DCA date.
- Frequency: weekly or monthly. Empty until chosen.

Weights that do not sum to 100 are scaled to 100, and the note says so. A zero sum is an error.

## Listings

US, EU, and CA only.

Refuse BSE and other non US/EU/CA venues, and name the exchange in the error. The messages are exactly:

- BSE: `X lists on Y. BSE and other non US/EU/CA venues are not supported.`
- Any other venue outside US/EU/CA: `X lists on Y. US, EU, and CA listings only.`

X is the ticker. Y is the exchange name from the price feed, or `an unknown exchange` if it has none.

One currency per basket. Mixed currencies are an error. No FX conversion in v1.

## Prices

Source: Yahoo chart, daily interval, events for dividends and splits.

- Bar price is the raw close.
- On a split date, shares are multiplied by numerator / denominator.
- On a dividend date, shares increase by `(shares * cash dividend) / that day's close`.
- Event order on a day: split, then dividend reinvestment, then the scheduled buy.

The page must not call Yahoo from the browser. That call has no `Access-Control-Allow-Origin`. A double-clicked HTML file fails, and the chat file card does not run the page.

v1 therefore includes a tiny same-origin server:

- Serves the page.
- `GET /api/chart?ticker=&start=&end=` fetches Yahoo server-side and returns ticker, exchange, currency, bars `{t, px}`, dividends `{t, amt}`, splits `{t, ratio}`.
- No third-party key. No second bot. No public proxy.

## Output

All money is in the basket's currency.

**Summary line** above the results table, DCA first, using compact amounts (3 significant digits), e.g.
`DCA: $314k in, $2.03M now · Lump sum: $1k in, $13k now`.

**Results table.** Two columns, in this order: lump sum, then DCA. The column headers are built from the inputs, e.g. `Lump sum ($1,000 once)` and `DCA ($1,000 weekly)`. The rows, in this order:

1. Total invested. The two plans differ on purpose. Lump-sum invested is the starting capital. DCA invested is the contribution times the number of contribution dates that had a session to invest on.
2. NLV at end. Shares marked at the last close. There is no idle cash in v1, because each inflow is invested on arrival.
3. Money-weighted return (XIRR, per year). The IRR of the actual cashflows, with the ending value as the last inflow. This is the headline return for DCA, because its cash goes in over time. Its value is emphasized (medium weight) in the DCA column.
4. Total return. Ending NLV / invested − 1.
5. CAGR on total invested, as if all invested day one. Growth of the total invested over the full window. It is exact for lump sum. For DCA it treats every contribution as if it had been in from day one, and the row label says so.
6. Max drop. Peak-to-trough on NLV, with the date.
7. NLV at that drop.
8. Return to the drop. NLV at the trough / capital deployed up to that date − 1. For DCA, deployed means contributions already made, not the full-window total.

**Narrow screens (under 640px).** The results table keeps both columns and scrolls sideways; it does not stack. The row-label column stays pinned on the left. Below the table there are two column dots, where the active dot follows the scroll position, next to the name of the visible plan. Until the user has scrolled to the end, there is also:

- a fade on the right edge;
- a `Swipe for DCA →` label.

**Second table:** ticker, weight, last price, lump-sum shares, DCA shares. It also scrolls sideways on narrow screens.

**Charts:** one NLV chart per plan, DCA first, then lump sum, over the sessions in the window.

- Each chart has its own y-axis scale, so the smaller plan stays readable.
- Y-axis ticks use compact currency (2 significant digits, e.g. `$2.2M`, `$550k`, `$13k`). X-axis ticks are `YYYY-MM`.
- A line under the charts says each plan has its own scale.

**Note** (below the charts). Only what a user can't guess:

- the weight-scaling sentence, if the weights were scaled;
- "Prices are raw daily closes. Lump sum starts on the first session every name has a price. A contribution date with no session goes in at the next session's close.";
- the number of contribution dates that had no later session, if any.

The note has no session count and no names or currency line.

**Copy elsewhere:**

- The intro under the title reads: "Pick tickers and weights, a date range, and amounts. Lump sum invests your starting capital on day one. DCA adds your contribution on each date. Dividends are reinvested and splits are handled."
- A hint under the ticker inputs reads: "US, EU and CA listings, one currency per basket."
- There is no disclaimer line.

## Rules already in force

- No buy or sell.
- No BSE.
- US / EU / CA listings only.
- Do not auto-trade. Do not imply a recommendation.

## What already failed

Do not repeat these.

- A single HTML file cannot fetch prices when opened from disk or from the chat file card.
- Bundling a price series made a static sample, not an app Diego could run. He rejected defaults and still could not preview.
- The chat file card is a download, not a live site.
- A public CORS proxy is not the product.

## Done when

Diego can open the calculator (`/calculator`; `/` before #46), leave every field blank, fill a US, EU, or CA basket, and get the results table and one NLV chart per plan from live prices. A name outside that set is refused with the exchange. The page has no buy, sell or hold output.
