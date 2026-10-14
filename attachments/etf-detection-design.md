# Dashboard company view: detect funds / ETFs via OpenFIGI (#124)

Follow-up to #121 (Q-N4, accepted by the Portfolio Manager). Business user: the Portfolio Manager (PM). Spec
`attachments/dashboard-spec.md` section 18; AC FD-01..FD-14. Free source only (OpenFIGI mapping API, **no key**), no
sign-up, no env var, **no migration**. A fund view (MER, holdings, distribution yield) is a later ticket.

## 1. Keyless check (box, 2026-10-14 05:50 ET)

`POST https://api.openfigi.com/v3/mapping` without `X-OPENFIGI-APIKEY` answers 200 with headers
`ratelimit-policy: 25;w=60` (25 requests a minute keyless; up to 10 jobs a request). Recorded answers
(`test-fixtures/openfigi/mapping-2026-10-14.json`):

| Job (`idType` TICKER) | securityType | securityType2 | Class |
|---|---|---|---|
| VDY / CN (also CT) | ETP | Mutual Fund | fund |
| XEQT / CN | ETP | Mutual Fund | fund |
| SPY / US | ETP | Mutual Fund | fund |
| PDI / US | Closed-End Fund | Mutual Fund | fund |
| VFIAX / US | Open-End Fund | Mutual Fund | fund |
| RMS / FP | Common Stock | Common Stock | company |
| PLTR / US, BRK/B / US, RY / CN, ASML / NA, SAP / GY | Common Stock | Common Stock | company |
| O / US | REIT | REIT | company |
| ZZZQQQ / US | `{"warning":"No identifier found."}` | | unknown |

## 2. Flow (daily job and new-holding backfill, never a page view)

1. `refreshClassification(db, source)` (`src/lib/dashboard/openfigi.server.ts`) runs in `runDailyRefresh()` after
   fundamentals and in the new-holding backfill (`only: [symbol]`).
2. Due symbols: held, with no stored classification, a `fund` / `company` result older than 30 days, or an `unknown`
   (not found) result older than 7 days.
3. `figiJob(symbol)` maps the Yahoo symbol to an OpenFIGI job (Q-F4). A suffix not in the table: no request, nothing
   stored (the view stays the company view).
4. Up to 10 jobs a request, ≥ 2.5 s between requests (24 / min), ≤ 3 requests a run (30 symbols); the rest wait for
   the next run.
5. Stored on the existing `instruments.provider_ids` JSONB under `openfigi`:
   `{ "kind": "fund" | "company" | "unknown", "securityType", "securityType2", "figi", "checkedAt" }` (merged with
   `||`, so the Yahoo id stays). No new column, so no migration.
6. A failed request (429, 5xx, timeout, bad JSON) stores nothing, stops classification for this run and is reported
   in the run summary (`classification.errors`); the next run retries.
7. `loadCompany()` reads `provider_ids->'openfigi'`; `companyView()` gets `kind`.

## 3. View for a fund

- The Profile, Margins, Returns, Valuation and Growth sections are not rendered. In their place one block
  `company-fund` with the line **`Fund: company figures do not apply`** (dim, `.ow-label` title `Fund`, no
  instruction text, DR6).
- Header (name, meta, last close), price chart with 1Y / 5Y / Max, and Dividends stay as today.
- The #121 `Not covered: no SEC filings` coverage line and the per-section notes are not shown (Q-F5).
- Source line: `Daily closes and dividends as stored by the Dashboard · fund type from OpenFIGI`.
- API (`/api/dashboard/company/<SYM>`): `kind: "fund"`, `fund: "Fund: company figures do not apply"`,
  `securityType` (e.g. `ETP`), `sections` = Dividends only. A company: `kind: "company"` or `"unknown"`,
  `fund: null`, sections as today.

## 4. Questions (Q-numbered; recommendation first; each built as recommended)

| Q | Question | Recommendation (built) | Needs Diego's go? |
|---|---|---|---|
| Q-F1 (PM) | Cache / refresh of the classification? | Classify in the daily job and the new-holding backfill only, store on `instruments.provider_ids.openfigi` (no migration); recheck a found result after 30 days, a not-found result after 7 days. A fund rarely becomes a company; 30 days keeps calls tiny. | No |
| Q-F2 (PM) | Rate limits; what if OpenFIGI fails? | Keyless limit 25 / min: ≤ 10 jobs a request, ≥ 2.5 s apart, ≤ 3 requests a run. On failure store nothing and retry next run. The page **falls back to the company view** as today (no visible "unknown" text); the API says `kind: "unknown"` so QA can see it. | No |
| Q-F3 (PM) | Which securityType values count as a fund? | Fund when `securityType` is one of `ETP`, `ETF`, `Open-End Fund`, `Closed-End Fund`, `Mutual Fund`, `Fund of Funds`, `Unit Trust`, or `securityType2` is `Mutual Fund`. REITs, common / preferred stock, ADRs stay companies (they file company accounts). Several hits: fund only if the first hit is. | No |
| Q-F4 | Exchange-suffix mapping? | Yahoo suffix → OpenFIGI `exchCode`: none → `US`; `.TO` `.V` `.NE` `.CN` → `CN` (Canada composite; `CT` returns the same VDY record); `.PA` → `FP`; `.AS` → `NA`; `.DE` → `GY`; `.F` → `GF`; `.MI` → `IM`; `.MC` → `SM`; `.BR` → `BB`; `.ST` → `SS`; `.HE` → `FH`; `.CO` → `DC`; `.VI` → `AV`; `.LS` → `PL`; `.IR` → `ID`. US `-` class separator → `/` (`BRK-B` → `BRK/B`). Anything else: not asked, stays the company view. | No |
| Q-F5 (PM) | Hide the #121 not-covered / #123 ESEF lines for funds? | Yes. For a fund the coverage line, the section notes and the SEC / ESEF source line are replaced: the fund line plus `… · fund type from OpenFIGI`. "No SEC filings" is true but misleading for a fund. | No |
| Q-F6 (PM) | One line or rows marked `Fund`? | One line in place of the five company sections (the brief: "in place of the company rows"); Dividends keep their rows. | No |
| Q-F7 | Stop fetching SEC / ESEF fundamentals for funds, or change the Holdings metric columns? | Not in this ticket (view only); the fund view ticket decides. Nothing stored is deleted. | No |
| Q-F8 | Paid ETF data (EODHD)? | Not now (Q-N3 stands). | Yes, if wanted |

## 5. Decision log

| # | Decision | Why |
|---|---|---|
| F1 | `provider_ids.openfigi`, not a new column | No migration to apply; the column already merges per provider. |
| F2 | Failure = company view | The page never breaks or says less than today. |
| F3 | Tests replay recorded answers | No live OpenFIGI call in CI (`createOpenFigiSource({ post })`). |
