# Orpheus desk app — v1 spec

Status: handoff for a build bot. Architect designed. Do not hire Developer or QA. Do not message CoS. Do not write the vault.

Date: 2026-10-02

## Destination

A personal fund desk. It will eventually track holdings, decisions, and desk opinions, then grow into a web app.

v1 is only the DCA calculator. Dashboards, holdings, and scorecards are later. Do not build them in this pass.

Sequence after this app, not in scope now:

- Decision log: one Diego line after each scorecard (hold / add / trim / revisit + date).
- Own checklist before the eight-desk scorecard returns.
- A boring price and holdings feed (IBKR or Fiscal.ai) before any dashboard.

## What v1 is

Compare two cash plans on the same window, for one name or a weighted basket.

- Lump sum buys the starting capital on the first session where every name has a price, split by weight.
- DCA does not spend that capital. On each weekly or monthly date it adds the contribution as new cash and buys by weight.
- Dividends are reinvested in the name that paid them.
- Splits change the share count.
- Prices are raw daily closes, not split-adjusted closes. Using adjusted closes and also reinvesting dividends would count dividends twice.
- Not a recommendation. No buy or sell language. No order ticket.

## Inputs

All fields start blank. No sample ticker, no sample dates, no sample amounts, no pre-filled result.

- Basket: one or more rows of ticker and weight percent. Add and remove rows. At least one ticker. No duplicates.
- Start date, end date.
- Starting capital. Used only by the lump-sum path.
- Contribution amount. New cash on each DCA date.
- Frequency: weekly or monthly. Empty until chosen.

Weights that do not sum to 100 are scaled to 100, and the note says so. A zero sum is an error.

## Listings

US, EU, and CA only, unless Diego names an exception.

Refuse BSE and other non US/EU/CA venues, and name the exchange in the error. One currency per basket. Mixed currencies are an error. No FX conversion in v1.

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

Two columns, lump sum and DCA.

- Total invested. These differ on purpose. Lump sum invested is starting capital. DCA invested is contribution times the number of dates in the window.
- NLV at end. Shares marked at the last close. No idle cash in v1, because each inflow is invested on arrival.
- Total return. Ending NLV / invested − 1.
- CAGR. Growth of invested capital over the full window. For DCA this treats contributions as if they had been in for the whole window. Say that in the note.
- Money-weighted return. IRR of the actual cashflows, ending value as the last inflow. This is the fair comparison once DCA is new cash each date.
- Max drop. Peak-to-trough on NLV, with the date.
- NLV at that drop.
- Return from start to the drop. NLV at the trough / capital deployed up to that date − 1. For DCA, deployed means contributions already made, not the full-window total.

Second table: ticker, weight, last price, lump-sum shares, DCA shares.

Chart: two NLV lines, lump sum and DCA, over the sessions in the window.

Note: names, currency, session count, weight scaling if any, the cash-plan sentence, dividends reinvested, the CAGR caveat, and “Not a recommendation.”

## Rules already in force

- No buy or sell.
- No BSE.
- US / EU / CA listings only unless Diego names an exception.
- Do not auto-trade. Do not imply a recommendation.

## What already failed

Do not repeat these.

- A single HTML file cannot fetch prices when opened from disk or from the chat file card.
- Bundling a price series made a static sample, not an app Diego could run. He rejected defaults and still could not preview.
- The chat file card is a download, not a live site.
- A public CORS proxy is not the product.

## Done when

Diego can open the app, leave every field blank, fill a US, EU, or CA basket, and get the table and two NLV lines from live prices. A name outside that set is refused with the exchange. The page says it is not a recommendation.
