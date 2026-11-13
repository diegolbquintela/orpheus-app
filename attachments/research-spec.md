# Research suite (#333)

Added 2026-11-13. Diego via Engineering Lead. The calculator stays the same program under a new path. This file is the source of truth for the heatmap, the rename, the yearly-returns table and the YTD cron.

## Routes

- `/research` is the heatmap. It is the default Research view. Public. No `DASHBOARD_ENABLED` gate.
- `/research/dca` renders the existing DCA desk (`src/components/desk.tsx`). The h1 stays `Dollar-cost average calculator.` Storage keys stay `orpheus.calculator.last.v1` and `orpheus.calculator.saved.v1`. The listings note stays `US, EU and CA listings, one currency per basket.`
- `/calculator` redirects to `/research/dca` and keeps the query string (`dcaRedirectHref` in `src/lib/site/site.ts`).
- `/?query` still redirects to `/calculator?query` first (`homeRedirectHref`). That hop then redirects to `/research/dca?query`.
- `currentSection` is `research` for `/research` and `/research/dca`.
- `/calculator` stays off `NEXT_ALLOWED`.

## Menu

The overlay item `Research` is a toggle (`site-research-toggle`). Its children are `Heatmap` (`/research`) and `DCA Calculator` (`/research/dca`). `aria-current="page"` is on the matching child. The home Platforms line is `Research` / `Yearly returns, and the dollar-cost average calculator.` / `Open` → `/research`.

## Data

`migrations/0015_yearly_returns.sql` creates `yearly_returns` (`CREATE TABLE IF NOT EXISTS`). Columns: `ticker`, `year`, `return_pct` (a percent: 13.4 means +13.4%), `is_ytd`, `partial`, `source`, `updated_at`. Primary key `(ticker, year)`.

The committed seed is `src/lib/research/yearly-returns.seed.json`, built by `scripts/research-yearly-seed.mjs` from Yahoo `adjclose` through the existing `pull()` (no key). SPY from 1994 (1993 is not a row). QQQ from 1999, VT from 2008, UPRO from 2009, TQQQ from 2010. The first year is `partial` when that year has no prior year-end close. The current calendar year is `is_ytd`.

The loader (`loadYearlyReturns`) is server-only and uses `getDashboardDb()`. It merges database rows over the seed per `(ticker, year)`. A null database, a missing relation (`42P01`), a connect error, or an empty table returns the full seed. One stored row replaces only that ticker and year.

## Cron

`vercel.json` keeps `/api/cron/daily-refresh` at `0 23 * * *` and adds `/api/cron/yearly-returns` at `0 22 * * *`. The new route checks `Authorization: Bearer` with the existing `CRON_SECRET` via `cronAuthorized()`. No new secret. Non-GET is 405. A bad or missing bearer is 401. No database is 503. A successful run upserts the current year (`is_ytd` true) and finalizes the previous year (`is_ytd` false). The body is `{ upserted, finalized, errors }` only. The daily-refresh route and job are not modified.

`0015` applies the same way as every other migration: `npm run build` runs `db:migrate`. Preview applies it when a migration URL is set. Production applies it only when `DASHBOARD_ENABLED` is exactly `true` at build time. QA's local `vite build` does not migrate. The heatmap still renders from the seed.

## Style

Dark tokens only. Positive cells use `--color-green`. Negative cells use `--color-alert`. No gold. The shared shell (lyre, `Orpheus Wisdom` footer) is unchanged.

## Heatmap order and source note (#335)

Added 2026-11-13. The grid lists years newest first. The current year, marked YTD, is the first cell. The oldest year is the last cell (SPY 1994, QQQ 1999, VT 2008, UPRO 2009, TQQQ 2010). `mergeReturns` stays chronological. The seed file is unchanged.

Under the title, one sentence-case line (`.rs-note`: dim, small, normal letter-spacing, no uppercase, not `.ow-label`) reads: `Market-price total return, dividends reinvested. Source: Yahoo Finance. Fund NAV total return can differ when the close trades at a premium or discount (SPY 1994: +0.4% market vs +1.15% NAV).`

The seeded figure is the market-price total return. A recorded Yahoo replay (prior-year last close, dividends reinvested at the ex-date close, no network) stays within 0.05 percentage points of SPY 1994 +0.40, QQQ 2000, VT 2009, UPRO 2010 and TQQQ 2011. The +1.15% SPY 1994 figure is the trust's NAV total investment return in the SEC financial highlights for the year ended 31 December 1994. A roughly 1 percentage point band versus issuer NAV covers that spot-check and is documented, not asserted.
