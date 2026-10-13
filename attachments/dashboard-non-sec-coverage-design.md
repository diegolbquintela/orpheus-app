# Dashboard company view: EU / Canada coverage without SEC filings (#121)

Business user: the Portfolio Manager (PM). Follow-up to #95 (C6, Q-C6). Spec `attachments/dashboard-spec.md`
section 16; AC NC-01..NC-08. Priority LOW (Diego, 2026-10-13). This ticket: a design call on the source (nothing
signed up for, no key, nothing paid) and a small build so an uncovered holding reads plainly. No env var.

## 1. Current behaviour (checked 2026-10-13 09:45 ET on a #119 preview, 1 share each added as the QA owner, refreshed, then deleted)

| Symbol | Holding add | API `/api/dashboard/company/<SYM>` | Page | Shown |
|---|---|---|---|---|
| RMS.PA (Hermès, Euronext Paris) | 201 | 200 | 200, no error | Name, `Paris · EUR`, last close €1,283.00 (2026-10-09), chart 1,579 points; Profile / Margins / Returns / Valuation / Growth rows `Not covered`, section note `No SEC filings for this listing.`; Dividends from stored corporate actions: €18.00 TTM, 1.4%, last ex 2026-04-21 |
| VDY.TO (Vanguard FTSE Canadian High Dividend Yield ETF, TSX) | 201 | 200 | 200, no error | `Toronto · CAD`, CA$75.34, chart 899 points, fundamentals rows `Not covered`; Dividends CA$2.20 TTM, 2.9%, last ex 2026-09-18 |
| VDY (bare) | 404 `VDY has no currency on the price feed.` | — | — | The price feed needs the `.TO` suffix; unchanged. |

So there is no blank or error page today: #95 already returns `Not covered` per row. Gaps this ticket closes:
(a) no single plain statement at the top; (b) the source line still says "SEC filings (companyfacts)" for a listing
with none; (c) the price chart and dividends are shown, which is right, and stay.

## 2. Build (this PR)

- `companyView` adds `coverage`: `Not covered: no SEC filings` for an uncovered listing (`instruments.fundamentals_source
  <> 'sec'` once checked), `null` otherwise (pending keeps `Pending` rows, no line). Shown under the header as one dim
  line (`company-coverage`), no instruction text (DR6).
- Source line for an uncovered listing: `Daily closes and dividends as stored by the Dashboard · no SEC filings for
  this listing`. Covered listings keep the #95 line.
- Everything else as #95: rows `Not covered`, price, chart and dividends shown when stored, dark shell, `.ow-label`,
  no gold, full digits.
- QA: `dashboard-company.mjs --seed` also adds 1 RMS.PA (when not held), checks the API and the page (NC-05..NC-07) and
  deletes it at the end.
- C4 (source-currency label on converted values): **not built**. Nothing is converted today (a reporting / listing
  currency mismatch shows `— (currency mismatch)`), so labelling needs an FX conversion design first. Deferred: Q-N7.

## 3. Sources compared (public pages read 2026-10-13; no sign-up, no key used)

Fields the view needs (#95 design): revenue, gross profit, operating income (EBIT), net income, total assets, current
liabilities, equity, cash, debt, operating cash flow, capex, diluted shares, diluted EPS (annual); price and dividends
are already stored for RMS.PA and VDY.TO.

| Source | Cost | Limits | RMS.PA | VDY.TO | Field match | Licence / redistribution | Key |
|---|---|---|---|---|---|---|---|
| **ESEF xBRL via filings.xbrl.org** (XBRL International) | Free | Free JSON:API; "may apply rate limits or withdraw" | **Yes**: Hermès LEI 969500Y4IJGHJE2MTJ13, FY2020–FY2025 filings, xBRL-JSON with `ifrs-full:Revenue` 15,170,000,000 EUR (FY2024), GrossProfit, ProfitLossFromOperatingActivities, ProfitLossAttributableToOwnersOfParent, Assets, CurrentLiabilities, EquityAttributableToOwnersOfParent, CashFlowsFromUsedInOperatingActivities, DilutedEarningsLossPerShare, CashAndCashEquivalents, DividendsPaid (checked) | No (Canada is not ESEF; an ETF files no company accounts) | High: the same `ifrs-full` tags #95's parser already maps; capex tag varies per issuer (Hermès: not the standard PPE tag) | "At present, there are no restrictions on the ways that the data can be used" | None |
| **SEDAR+** (Canada) | Free to read | Terms forbid robots, scraping and automated searches | n/a | Fund documents only | PDFs, no structured feed | Automated use prohibited | n/a |
| **OpenFIGI** (identifiers only) | Free | 25 mapping requests / min without a key | FIGI BBG000BDYY97, Common Stock | FIGI BBG003M5XN37, `securityType` **ETP** | IDs and security type only (no financials) | Free use | Optional |
| **EODHD** | Fundamentals $59.99 / mo; All-in-one $99.99 / mo; free tier 20 calls / day, no fundamentals | 100,000 calls / day (fundamentals cost 10) | Yes (global stocks, non-US from 2000) | Yes (ETF fundamentals: holdings, allocations; not company accounts) | High (statements, shares, dividends) | Plans are personal use: no "displaying … or granting access"; display to others needs a commercial licence | Yes |
| **Financial Modeling Prep** | Global coverage only on Ultimate $139 / mo (Starter $29, Premium $69) | 250 / day free; 300–3,000 / min paid | Ultimate only | Ultimate only | High | "Displaying or redistributing data … requires a specific Data Display and Licensing Agreement" | Yes |
| **Twelve Data** | Fundamentals from Grow (page shows $79 / mo personal; plan schema $29); EU real-time from Pro $229 | 8 / min free (800 / day); income statement costs 100 credits | Likely (EOD global equities); not verified without a key | ETF data on Ultra | Medium-high | Personal vs commercial licences; internal display on personal | Yes |
| **Finnhub** | Global fundamentals only on All-In-One $3,500 / mo (annual) | 60 / min free (US fundamentals only) | Paid tier only | Paid tier only | High | Personal use; terms apply | Yes |
| **Alpha Vantage** | Free 25 requests / day; premium $49.99–$249.99 / mo | 25 / day free | Not documented for non-US fundamentals | No | Medium (US-centric) | Terms apply | Yes |
| **Yahoo Finance (unofficial)** | Free, no official API | Unpublished, throttled | Yes | Yes | High | Not licensed for this; terms risk; can break any day | n/a |

Sources: https://filings.xbrl.org/docs/api, https://filings.xbrl.org/docs/about,
https://filings.xbrl.org/api/entities/969500Y4IJGHJE2MTJ13/filings, https://api.gleif.org (LEI lookup),
https://systems.securities-administrators.ca/terms-of-use/, https://www.openfigi.com/api/documentation,
https://eodhd.com/pricing, https://eodhd.com/financial-apis/terms-conditions,
https://site.financialmodelingprep.com/developer/docs/pricing, https://twelvedata.com/pricing,
https://finnhub.io/pricing, https://www.alphavantage.co/premium/.

**VDY is an ETF.** Company fundamentals (margins, ROE, P/E of the issuer) do not apply. A fund view would show fund
data (MER, distribution yield, holdings, top weights), from the issuer (Vanguard Canada fact sheet) or a paid feed
(EODHD ETF_Data). Until then `Not covered` is the honest state; Q-N4.

## 4. Recommendation (Q-numbered; recommendation first)

| Q | Question | Recommendation | Needs Diego's go? |
|---|----------|----------------|-------------------|
| Q-N1 (PM) | EU listings: which source? | ESEF xBRL from filings.xbrl.org: free, no key, no licence restriction, reuses the `ifrs-full` tags already mapped; map ticker → LEI once (GLEIF, free). Separate build ticket. | No (free, no sign-up); EL to schedule |
| Q-N2 (PM) | Canadian listings? | None free and automatable (SEDAR+ forbids automation; Canadian issuers do not file ESEF). Stay `Not covered`; revisit with a paid feed (Q-N3). | — |
| Q-N3 (PM) | A paid global feed instead (covers EU + CA + ETFs)? | Not now. If wanted, EODHD Fundamentals ($59.99 / mo) is the cheapest with RMS.PA and VDY.TO, but the personal licence forbids display to others; the Dashboard has PM / CFO viewers, so a commercial licence quote would be needed. | **Yes** (money + licence) |
| Q-N4 (PM) | Funds / ETFs (VDY.TO)? | Mark funds `Fund: company figures do not apply` once the security type is known (OpenFIGI `ETP`, keyless); a fund view is a later ticket. | No for detection (keyless); Yes if a paid ETF feed |
| Q-N5 (PM) | Wording for an uncovered listing? | `Not covered: no SEC filings` at the top; rows keep `Not covered`; price, chart, dividends still shown. Built. | No |
| Q-N6 | ESEF data quality (validation errors, issuer-specific capex tags, odd period labels such as Hermès FY2025 filed under `2026-12-31`)? | Read period from the facts, not the index; missing tag → `n/m` as today; take the newest filing per fiscal year. | No |
| Q-N7 (PM) | C4: converted values with the source currency labelled? | Defer: needs an FX design (which rate, which date) since nothing is converted today; ticket after Q-N1. | No |
| Q-N8 | Yahoo (unofficial)? | Do not use (licence and stability). | — |

## 5. Decision log

| # | Decision | Why |
|---|----------|-----|
| N1 | Ship the plain `Not covered: no SEC filings` line now | Brief scope 2; small; no new data. |
| N2 | Correct the source line for uncovered listings | It named SEC filings for a listing with none. |
| N3 | No new source in this PR | Design call first; paid needs Diego. |
| N4 | C4 deferred | No converted values exist yet. |
