# Dashboard: EU fundamentals from ESEF XBRL (filings.xbrl.org), RMS.PA first (#123)

Addendum to `attachments/dashboard-non-sec-coverage-design.md` (#121, Q-N1 accepted by the PM; Q-N6 rules). Business
user: the Portfolio Manager. Spec `attachments/dashboard-spec.md` section 17; AC ES-01..ES-12. Free sources only, no
key, no sign-up, no env var. #124 (ETF detection) is out of scope.

## 1. Flow (daily job, never a page view)

1. The daily job / new-holding backfill calls `refreshFundamentals()` as today. The source is now a composite:
   SEC first (unchanged); when SEC does not cover an **EU** listing, ESEF.
2. **Ticker → LEI.** A pinned table in code (`PINNED_LEI`, `RMS.PA → 969500Y4IJGHJE2MTJ13`, Hermès International)
   wins. Otherwise GLEIF (`https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=<name>`, then
   `lei-records/<LEI>`): accepted only when the legal name is the same company (`sameCompany`, the SEC name rule) and
   the legal-address country matches the venue (`.PA` FR, `.AS` NL, `.DE` / `.F` DE, `.MI` IT, `.MC` ES, `.BR` BE,
   `.LS` PT, `.HE` FI, `.ST` SE, `.CO` DK, `.IR` IE, `.VI` AT, `.OL` NO). No match → not covered. The LEI is stored
   in `instruments.lei` (migration 0013).
3. **Filings.** `https://filings.xbrl.org/api/entities/<LEI>/filings`, then the newest xBRL-JSON (`json_url`) per
   fiscal year, at most 6 documents per symbol.
4. **Parse** (pure `annualFactsFromEsef`, tested on a recorded fixture): non-dimensional facts only (concept, entity,
   period, unit, optional language); the same `CONCEPTS` table as SEC (the `ifrs-full` tags are already there);
   durations 335–395 days; instants on a fiscal year end; periods are end-exclusive in xBRL-JSON
   (`2024-01-01/2025-01-01` → FY end 2024-12-31).
5. **Store** as SEC facts: `fundamentals_annual` (replace in one statement), `instruments.fundamentals_source = 'esef'`,
   metrics computed by the existing code. Refreshed every 7 days like SEC.

## 2. N6 rules (as built)

- Fiscal year from the figures: a filing's own fiscal year is the latest duration end among its facts, never the
  index's `period_end` (Hermès FY2025 is indexed as `2026-12-31`).
- Newest filing per fiscal year (by `processed` / `date_added`); duplicates (language versions, re-filings) dropped.
- Across filings, per (concept, FY end) the value from the newest filing that has it (restated comparatives win, as
  the SEC rule); a missing concept is simply absent → the row shows `n/m`.

## 3. Fields (Hermès FY2024 from the recorded fixture, EUR)

| Section field | IFRS tag | FY2024 |
|---|---|---|
| Revenue | `ifrs-full:Revenue` | 15,170,000,000 |
| Gross profit | `ifrs-full:GrossProfit` | 10,660,000,000 |
| EBIT | `ifrs-full:ProfitLossFromOperatingActivities` | 6,150,000,000 |
| Net income | `ifrs-full:ProfitLossAttributableToOwnersOfParent` | 4,603,000,000 |
| Total assets / current liabilities | `ifrs-full:Assets` / `CurrentLiabilities` | 23,084,000,000 / 3,629,000,000 |
| Equity (parent) | `ifrs-full:EquityAttributableToOwnersOfParent` | 17,327,000,000 |
| Cash | `ifrs-full:CashAndCashEquivalents` | 11,642,000,000 |
| Operating cash flow | `ifrs-full:CashFlowsFromUsedInOperatingActivities` | 5,139,000,000 |
| Capex | `ifrs-full:PurchaseOfPropertyPlantAndEquipmentIntangibleAssetsOtherThanGoodwillInvestmentPropertyAndOtherNoncurrentAssets` (new fallback tag) | 1,067,000,000 |
| Diluted EPS | `ifrs-full:DilutedEarningsLossPerShare` | 43.87 |
| Diluted shares | no tag in Hermès' filing → net income ÷ diluted EPS (Q-E1) | ≈ 104,922,000 |
| Dividends paid | `ifrs-full:DividendsPaidClassifiedAsFinancingActivities` | 2,705,000,000 |

## 4. Display

- Figures in the **source currency** (EUR) with the source line `ESEF annual reports via filings.xbrl.org · daily
  closes as stored by the Dashboard`. Valuation ratios only when the price currency equals the reporting currency
  (RMS.PA: EUR = EUR); otherwise the #95 `— (currency mismatch)` rule.
- Uncovered names keep `Not covered: no SEC filings` (Q-E2).
- `FUNDAMENTALS_PARSER_VERSION` 4: every covered symbol (SEC or ESEF) is refetched once by the daily job.

## 5. Politeness

`User-Agent: OrpheusWisdom/1.0 (orpheus-app dashboard; +https://github.com/diegolbquintela/orpheus-app)`; ≥ 1 s
between requests to each host; ≤ 6 filing documents per symbol per refresh; 7-day cache via
`fundamentals_checked_at`; a failure keeps the stored facts and records `fundamentals_error` (existing pattern).

## 6. Decision log

| # | Decision | Why |
|---|----------|-----|
| E1 | Composite source: SEC first, ESEF for EU listings SEC does not cover | One job, one storage path. |
| E2 | Pinned LEI table in code, then GLEIF name + country | Deterministic for RMS.PA; no ISIN stored today. |
| E3 | Reuse `CONCEPTS` (ifrs-full) + one capex fallback tag | Same parser rules, fewer surprises. |
| E4 | Diluted shares derived when not tagged | Hermès tags no share count but EPS and profit. |
| E5 | Parser version 4 | Refetch once with the new tag / source. |

## 7. Questions (recommendation built unless noted)

| Q | Question | Recommendation |
|---|----------|----------------|
| Q-E1 (PM) | Diluted shares when the filing has no share-count tag? | Net income ÷ diluted EPS (Hermès ≈ 104,922,000). |
| Q-E2 (PM) | Wording for an EU name with neither SEC nor ESEF filings? | Recommend `Not covered: no SEC or ESEF filings` for EU listings; **not built** (kept `no SEC filings` as the brief says) until the PM agrees. |
| Q-E3 (PM) | Source label? | `ESEF annual reports via filings.xbrl.org`. |
| Q-E4 | Refresh cadence? | 7 days like SEC; ≤ 6 documents a symbol; 1 request/s per host. |
| Q-E5 (PM) | Capex when only the broad IFRS "PPE + intangibles + other" purchase tag exists? | Use it (FCF is then slightly conservative). |
| Q-E6 | Ticker → LEI without ISIN? | Pinned table + GLEIF name/country; store an ISIN later if the price feed gives one. |
| Q-E7 (PM) | Employees? | Still `Not reported` (no standard ESEF tag). |
| Q-E8 | filings.xbrl.org down or rate-limited? | Keep stored facts, record the error, retry next run. |
