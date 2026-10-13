# Dashboard: company view (#95)

Status: DESIGN + BUILD (EL kickoff 2026-10-12 22:59 ET). Brief (#95, Diego via CoS 2026-10-11): a company view like
Fiscal.ai's company page (information architecture, not a pixel clone) for the **Portfolio Manager**, opened from a
holding (Palantir first): Profile (market cap, EV, shares, revenue, employees), Margins, Returns (ROA, ROE, ROCE,
ROIC), Valuation (P/E, EV/EBIT, P/FCF), Growth, Dividends, Price chart. Dark style, lyre mark, footer `Orpheus Wisdom`
only, no gold, US/EU/CA only. #71 stays cancelled / on hold: this is not its restyle. Data source and caching are
decided here (section 3); no new vendor. Open questions: section 9 (`PM` = a product question for the Portfolio
Manager).

## 1. Where it lives

- Route `/dashboard/company/<SYMBOL>` (e.g. `/dashboard/company/PLTR`), behind the same gate as `/dashboard`: 404 while
  `DASHBOARD_ENABLED` is off, signed out → `/dashboard/sign-in`, a temporary password → `/account`, no Dashboard read
  grant → the 403 page (#90). Read-only grants see the same page (it has no writes). `noindex, nofollow`.
- Only symbols in the owner's holdings (the data the Dashboard grant shows, #90 Q-D1); any other symbol → the page's
  own "Not in your holdings." state with a link back (Q-C1).
- Opened from a holding: the expanded holding row gets an `Open company view` link (no change to the collapsed row).
- API: `GET /api/dashboard/company/<SYMBOL>` (same gate order as the other per-user Dashboard APIs: 404 flag off, 405,
  401, 503, 403 without a Dashboard read grant, 404 `not_held`).

## 2. What it shows (top to bottom, phone first; desktop: two columns of sections under the chart)

| Section | Rows | Definition (latest fiscal year from SEC filings unless said) |
|---------|------|--------------------------------------------------------------|
| Header | name, ticker · exchange · currency, last close and its date | `instruments`, latest `daily_closes` |
| Price chart | 1Y / 5Y / Max (default 1Y), the change over the range | stored daily closes (an SVG line; no chart library) |
| Profile | Market cap, Enterprise value, Shares (diluted), Revenue, Employees | market cap = last close × diluted weighted shares (FY); EV = market cap + total debt − cash (the ROIC debt rules, §8 of dashboard-spec); employees: not in SEC XBRL data → `Not reported` (Q-C3) |
| Margins | Gross, Operating (EBIT), Net, Free cash flow | ÷ revenue; FCF = operating cash flow − capital expenditure |
| Returns | ROA, ROE, ROCE, ROIC | ROA = net income ÷ avg total assets; ROE = net income ÷ avg parent equity; ROCE = EBIT ÷ avg (total assets − current liabilities); ROIC = the stored `roic_1y` (dashboard-spec §8) |
| Valuation | P/E, EV/EBIT, P/FCF | last close ÷ diluted EPS; EV ÷ EBIT; market cap ÷ FCF. Negative denominators → `n/m` |
| Growth | Revenue 1y, Revenue CAGR 3y / 5y / 10y, EPS 1y | stored `metric_values` (rev_*) and EPS from `fundamentals_annual` |
| Dividends | Dividends per share (TTM), Yield (TTM), Last ex-date | `corporate_actions` dividends in the last 365 days; yield = TTM ÷ last close; none → `No dividends` |

- Averages use the latest and prior fiscal year ends; one missing → the latest alone (labelled `(year end)` in help).
- Every value shows `—` with a reason when it can't be computed: `Not covered` (no SEC filings: most EU / CA
  listings), `n/m` (negative or zero denominator), `Pending` (data not fetched yet).
- Money in the company's reporting / listing currency, compact (`$412.3B`); percentages one decimal; multiples
  one decimal with `×`. Market cap / EV use the listing currency only when it equals the reporting currency;
  otherwise `—` (`currency mismatch`, Q-C4).
- Fiscal year shown under the section titles (`FY2025`), and the sources line at the bottom: `SEC filings
  (companyfacts) · daily closes as stored by the Dashboard`.

## 3. Data source and caching (no new vendor)

- Fundamentals: the existing SEC EDGAR `companyfacts` ingest (T08, dashboard-spec §7), extended with seven concepts:
  `net_income`, `total_assets`, `current_liabilities`, `operating_cash_flow`, `capex`, `diluted_shares`,
  `dividends_paid` (us-gaap tags plus the ifrs-full equivalents). `FUNDAMENTALS_PARSER_VERSION` 2 → 3, so the daily
  job re-fetches each SEC symbol once (the existing staleness rule); nothing else changes in the ingest.
- Prices and dividends: the stored `daily_closes` / `corporate_actions` (Yahoo via the existing provider, backfilled
  from 2000). The page reads the database only; it never calls a feed (DASH-14 rule).
- Caching: none beyond the database (the daily job is the cache). The API answers `private, max-age=60`.

## 4. Style

Same dark Dashboard shell (#53 tokens: ink on paper, hairlines); section titles use the shared `.ow-label` (#92), the
range buttons the shared `.ow-button` look at a compact size; no gold, no new colours; the chart line uses `ink`, the
area under it none. Numbers tabular. Phone 400 × 860 one column; desktop 1440 × 900 two columns. Strict CLS 0 (the
chart has a fixed aspect box).

## 5. Code

- `src/lib/dashboard/company.ts` (pure): `companyView(input)` → sections, rows, statuses; formatting helpers.
- `src/lib/dashboard/company.server.ts`: loads one symbol's instrument, closes, fundamentals, metrics and dividends.
- `src/lib/dashboard/company-api.server.ts` + `src/routes/api/dashboard/company.$symbol.ts`.
- `src/routes/dashboard_.company.$symbol.tsx` + `src/components/dashboard/company-view.tsx`.
- `src/lib/dashboard/fundamentals.server.ts`: the seven concepts, parser version 3.
- QA: `qa/tools/dashboard-company.mjs` (CV-08..CV-14 on the preview).

## 6. Not in scope

Peers, segments, estimates, transcripts, news, quarterly data, editing anything, non-US/EU/CA listings, #71's
restyle, the lyre / footer, any new data vendor or env var.

## 7. Decision log

| # | Decision | Why |
|---|----------|-----|
| C1 | Own route per symbol, not a panel inside the holdings list | Fiscal.ai IA (a company page); shareable URL; no change to the list |
| C2 | SEC companyfacts + stored closes only | Brief: no new vendor; the data is already ingested daily |
| C3 | Annual (latest fiscal year), not TTM, for fundamentals | The ingest is annual (T08); TTM needs quarterly facts (Q-C2) |
| C4 | Market cap from diluted weighted shares | The only annual share count in companyfacts that lines up with the fiscal year |
| C5 | SVG chart, no library | Bundle size, CLS 0, dark tokens |
| C6 | Holdings only | The Dashboard grant covers the owner's book; a free ticker search is a new product |

## 8. Acceptance

CV-01..CV-14 in `qa/CANONICAL-AC-PACK.md`.

## 9. Open questions (recommendation built until answered)

- **Q-C1 (PM)** Any ticker, or only holdings? → Holdings only (C6).
- **Q-C2 (PM)** Annual or trailing twelve months? → Annual now (C3); TTM is a follow-up (needs quarterly ingest).
- **Q-C3 (PM)** Employees are not in SEC XBRL data. → Show `Not reported`; a source needs a vendor (no new vendor).
- **Q-C4 (PM)** Foreign filers report in another currency than the listing (e.g. ADRs). → Show per-share ratios only when
  the currencies match; otherwise `—` (`currency mismatch`); no FX conversion in #95.
- **Q-C5 (PM)** Which chart ranges? → 1Y / 5Y / Max, default 1Y.
- **Q-C6** EU / CA listings without SEC filings show only price, chart and dividends (`Not covered` elsewhere). → Accept
  (dashboard-spec §7 "The EU and CA gap").
