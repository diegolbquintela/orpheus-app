/**
 * Holdings valuation for `/dashboard` (T07 #15; spec §1, §9, §10, §11 "Staleness"; DASH-13, 14, 25).
 * Server-only. Reads Postgres only (stored closes from T05, stored FX rates from T06); nothing here
 * calls a price or FX feed, so reloading the page can't change a value (DASH-14).
 *
 * Per holding, with the FX factor f = base units per 1 listing-currency unit at the rate for the close's
 * session date (else the latest earlier rate, its date shown):
 * - market value (base) = shares × last close × f
 * - cost (base)         = shares × average cost × f   (D8: the same current rate as the price)
 * - total return (base) = market value − cost
 * - total return %      = (close − average cost) / average cost, in the listing currency (n/m when the
 *                         average cost is 0). With one rate for value and cost it equals the base-currency %.
 * - % of portfolio      = market value / Σ market value of the valued holdings.
 * Holdings with no close yet ("price pending") or no FX rate yet ("FX pending") are left out of the
 * totals and of % of portfolio, and listed under the total (§9).
 */
import { lastRun, priceViews, type PriceView } from "./daily-refresh.server.ts";
import { fxFactor, type RateUsed } from "./fx.server.ts";
import { metricViews, type MetricView } from "./fundamentals.server.ts";
import { isMetricKey, METRIC_KEYS, type MetricKey } from "./metrics.ts";
import { portfolioMetrics, type PortfolioCell } from "./portfolio.ts";
import { getUserSettings, listHoldings, listMetricColumns, type BaseCurrency, type Queryable } from "./store.server.ts";

/** More than this many calendar days since the last successful daily run: "Prices are out of date". */
export const STALE_AFTER_DAYS = 4;

export type ValuedHolding = {
  symbol: string;
  /** shares × last close, in the base currency; null when price or FX is pending. */
  value: number | null;
  /** shares × average cost at the same rate as `value` (D8); null when pending. */
  cost: number | null;
  /** value − cost, base currency; null when pending. */
  returnAmount: number | null;
  /** (close − avg cost) / avg cost × 100, listing currency; null when pending or avg cost is 0 (n/m). */
  returnPct: number | null;
  /** value / total × 100; null when pending. */
  weight: number | null;
  /** Rates used (non-CAD), with their dates. */
  rates: RateUsed[];
  sessionDate: string | null;
  /** A rate older than the session date was used (no rate that day). */
  fallback: boolean;
  status: "ok" | "price_pending" | "fx_pending";
};

export type Valuation = {
  base: BaseCurrency;
  rows: ValuedHolding[];
  /** Σ market value (total position), base currency. */
  total: number;
  /**
   * Σ cost and Σ return over the valued holdings that have a cost (#56: a holding with no cost is left out
   * of both, not counted as 0); null when no valued holding has a cost.
   */
  totalCost: number | null;
  totalReturn: number | null;
  /** totalReturn / totalCost × 100; null when the total cost is 0 or null. */
  totalReturnPct: number | null;
  /** Symbols left out of the totals (price or FX pending). */
  excluded: string[];
  /** Latest session date among the valued holdings' closes (header "Prices as of … close"). */
  pricesAsOf: string | null;
  /** Latest rate date among the FX rates used (header "· FX …"); null when no rate was needed. */
  fxAsOf: string | null;
};

/** `avgCost` null or missing = no cost (#56): cost and return stay null; value and weight don't change. */
type HoldingInput = { symbol: string; shares: string; avgCost?: string | null };
type PriceInput = { close: string | null; currency: string | null; sessionDate: string | null } | undefined;

const maxDate = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a > b ? a : b);

/** Value every holding in `base` (see the module comment). Reads stored FX rates only. */
export async function valueHoldings(
  db: Queryable,
  holdings: HoldingInput[],
  prices: Record<string, PriceInput>,
  base: BaseCurrency,
): Promise<Valuation> {
  const rows: ValuedHolding[] = [];
  const excluded: string[] = [];
  const pending = (symbol: string, status: ValuedHolding["status"], sessionDate: string | null): ValuedHolding => ({
    symbol,
    value: null,
    cost: null,
    returnAmount: null,
    returnPct: null,
    weight: null,
    rates: [],
    sessionDate,
    fallback: false,
    status,
  });
  let total = 0;
  let totalCost: number | null = null;
  let totalReturn: number | null = null;
  let pricesAsOf: string | null = null;
  let fxAsOf: string | null = null;
  for (const h of holdings) {
    const p = prices[h.symbol];
    if (!p || p.close === null || !p.currency || !p.sessionDate) {
      rows.push(pending(h.symbol, "price_pending", null));
      excluded.push(h.symbol);
      continue;
    }
    const fx = await fxFactor(db, p.currency, base, p.sessionDate);
    if (!fx) {
      rows.push(pending(h.symbol, "fx_pending", p.sessionDate));
      excluded.push(h.symbol);
      continue;
    }
    const shares = Number(h.shares);
    const close = Number(p.close);
    const avg = h.avgCost === undefined || h.avgCost === null ? null : Number(h.avgCost);
    const value = shares * close * fx.factor;
    const cost = avg === null ? null : shares * avg * fx.factor;
    total += value;
    if (cost !== null) {
      totalCost = (totalCost ?? 0) + cost;
      totalReturn = (totalReturn ?? 0) + (value - cost);
    }
    pricesAsOf = maxDate(pricesAsOf, p.sessionDate);
    for (const r of fx.rates) fxAsOf = maxDate(fxAsOf, r.rateDate);
    rows.push({
      symbol: h.symbol,
      value,
      cost,
      returnAmount: cost === null ? null : value - cost,
      returnPct: avg === null || avg === 0 ? null : ((close - avg) / avg) * 100,
      weight: null,
      rates: fx.rates,
      sessionDate: p.sessionDate,
      fallback: fx.rates.some((r) => r.rateDate < (p.sessionDate as string)),
      status: "ok",
    });
  }
  for (const r of rows) if (r.value !== null) r.weight = total > 0 ? (r.value / total) * 100 : null;
  return {
    base,
    rows,
    total,
    totalCost,
    totalReturn,
    totalReturnPct: totalCost !== null && totalReturn !== null && totalCost > 0 ? (totalReturn / totalCost) * 100 : null,
    excluded,
    pricesAsOf,
    fxAsOf,
  };
}

export type Freshness = {
  /** UTC date of the latest daily run that finished "ok" or "partial"; null if none has. */
  lastGoodRun: string | null;
  /** True when there is no such run or it is more than STALE_AFTER_DAYS calendar days old. */
  stale: boolean;
};

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * DASH-25: "Prices are out of date" when the last successful daily run (status ok or partial: the job
 * finished; a partial run only had per-symbol errors) is more than 4 calendar days before today (UTC,
 * like `refresh_runs.run_date`). A run still running, or one that failed, doesn't count.
 */
export async function freshness(db: Queryable, nowMs: number = Date.now()): Promise<Freshness> {
  const rows = await db.query<{ run_date: string }>(
    `SELECT run_date::text AS run_date FROM refresh_runs WHERE status IN ('ok', 'partial')
     ORDER BY run_date DESC LIMIT 1`,
  );
  const lastGoodRun = rows[0]?.run_date ? String(rows[0].run_date).slice(0, 10) : null;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return { lastGoodRun, stale: lastGoodRun === null || dayNumber(today) - dayNumber(lastGoodRun) > STALE_AFTER_DAYS };
}

export type DashboardHoldingsData = {
  holdings: Awaited<ReturnType<typeof listHoldings>>;
  prices: Record<string, PriceView>;
  lastRun: Awaited<ReturnType<typeof lastRun>>;
  baseCurrency: BaseCurrency;
  valuation: Valuation;
  freshness: Freshness;
  /** The user's metric columns in order (T08, DASH-15). */
  metricColumns: MetricKey[];
  /** Coverage and stored metric values per held symbol (T08, DASH-21). */
  metrics: Record<string, MetricView>;
  /** Portfolio row per metric (T14, §9): MV-weighted mean over covered holdings, with coverage. */
  portfolio: Record<string, PortfolioCell>;
};

/** Everything `/dashboard` shows for one user, from Postgres only (the page loader calls this). */
export async function loadDashboardHoldings(
  db: Queryable,
  userId: string,
  opts: { previewRefresh: boolean; nowMs?: number },
): Promise<DashboardHoldingsData> {
  const holdings = await listHoldings(db, userId);
  const prices = await priceViews(db, holdings.map((h) => h.symbol));
  const { baseCurrency } = await getUserSettings(db, userId);
  const valuation = await valueHoldings(db, holdings, prices, baseCurrency);
  const metrics = await metricViews(db, holdings.map((h) => h.symbol));
  return {
    holdings,
    prices,
    lastRun: opts.previewRefresh ? await lastRun(db) : null,
    baseCurrency,
    valuation,
    freshness: await freshness(db, opts.nowMs),
    metricColumns: (await listMetricColumns(db, userId)).filter(isMetricKey),
    metrics,
    portfolio: portfolioMetrics(valuation.rows, metrics, METRIC_KEYS),
  };
}
