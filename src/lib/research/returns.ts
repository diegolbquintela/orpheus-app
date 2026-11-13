/**
 * Yearly total returns for the Research heatmap (#333). Pure. `return_pct` is already a percent
 * (13.4 means +13.4%). Dividends are in the figure when the points are Yahoo `adjclose`.
 */

export const RETURN_SOURCE = "yahoo-adjclose";

/** One line under the /research title (#335). Market price, not NAV. */
export const MARKET_RETURN_NOTE =
  "Market-price total return, dividends reinvested. Source: Yahoo Finance. Fund NAV total return can differ when the close trades at a premium or discount (SPY 1994: +0.4% market vs +1.15% NAV).";

export const RESEARCH_TICKERS = ["SPY", "QQQ", "VT", "UPRO", "TQQQ"] as const;
export type ResearchTicker = (typeof RESEARCH_TICKERS)[number];

export type YearReturn = {
  ticker: string;
  year: number;
  return_pct: number;
  is_ytd: boolean;
  partial: boolean;
  source: string;
};

export type ClosePoint = { date: string; adj: number };

const NY = "America/New_York";

/** Calendar date in America/New_York, `YYYY-MM-DD`. */
export function dateInNewYork(when: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NY,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }> };
    } | null> | null;
  };
};

/** Last adjusted close of each session from one Yahoo chart payload (`pull()`). */
export function pointsFromYahooChart(payload: unknown): ClosePoint[] {
  const result = (payload as YahooChart).chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const adj = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const out: ClosePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const stamp = ts[i];
    const value = adj[i];
    if (typeof stamp !== "number" || typeof value !== "number" || !(value > 0)) continue;
    out.push({ date: dateInNewYork(new Date(stamp * 1000)), adj: value });
  }
  return out;
}

function roundPct(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export type PriceBar = { date: string; close: number };
export type CashDividend = { date: string; amount: number };

/**
 * Market-price total return for one full calendar year, in percent (#335).
 * The base is the last close of the prior year. A dividend whose ex-date is after
 * that close and on or before the year's last close is reinvested at that session's
 * close. Audits the seeded adjclose figures. Does not rebuild the seed.
 */
export function marketPriceYearReturn(
  bars: readonly PriceBar[],
  dividends: readonly CashDividend[],
  year: number,
): number {
  const sorted = bars
    .filter((bar) => /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && bar.close > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const byYear = new Map<number, PriceBar[]>();
  for (const bar of sorted) {
    const y = Number(bar.date.slice(0, 4));
    const list = byYear.get(y);
    if (list) list.push(bar);
    else byYear.set(y, [bar]);
  }
  const prior = byYear.get(year - 1);
  const current = byYear.get(year);
  if (!prior?.length || !current?.length) throw new Error(`missing bars for ${year}`);
  const start = prior[prior.length - 1]!;
  const end = current[current.length - 1]!;
  const onEx = new Map(
    sorted.filter((bar) => bar.date > start.date && bar.date <= end.date).map((bar) => [bar.date, bar]),
  );
  let shares = 1;
  for (const dividend of dividends.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    if (!(dividend.date > start.date && dividend.date <= end.date) || !(dividend.amount > 0)) continue;
    const bar = onEx.get(dividend.date);
    if (!bar) throw new Error(`no close on ex-date ${dividend.date}`);
    shares += (shares * dividend.amount) / bar.close;
  }
  return roundPct((shares * end.close / start.close - 1) * 100);
}

/**
 * One row per calendar year from `firstYear` through the year of `asOf`.
 * A year with a prior year-end uses that close as the base (full year, or YTD).
 * A year with no prior close uses its own first close (inception, `partial`).
 */
export function yearlyReturnsFromCloses(
  points: readonly ClosePoint[],
  opts: { ticker: string; firstYear: number; asOf: string },
): YearReturn[] {
  const sorted = points
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.adj > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const byYear = new Map<number, ClosePoint[]>();
  for (const point of sorted) {
    const year = Number(point.date.slice(0, 4));
    const list = byYear.get(year);
    if (list) list.push(point);
    else byYear.set(year, [point]);
  }
  const asOfYear = Number(opts.asOf.slice(0, 4));
  const out: YearReturn[] = [];
  for (let year = opts.firstYear; year <= asOfYear; year++) {
    const bars = byYear.get(year);
    if (!bars?.length) continue;
    const last = bars[bars.length - 1]!.adj;
    const prior = byYear.get(year - 1);
    const partial = !prior?.length;
    const base = partial ? bars[0]!.adj : prior![prior!.length - 1]!.adj;
    if (!(base > 0)) continue;
    out.push({
      ticker: opts.ticker,
      year,
      return_pct: roundPct((last / base - 1) * 100),
      is_ytd: year === asOfYear,
      partial,
      source: RETURN_SOURCE,
    });
  }
  return out;
}

export function normalizeReturn(row: {
  ticker: unknown;
  year: unknown;
  return_pct: unknown;
  is_ytd: unknown;
  partial: unknown;
  source?: unknown;
}): YearReturn {
  const flag = (value: unknown) => value === true || value === "t" || value === "true";
  return {
    ticker: String(row.ticker),
    year: Number(row.year),
    return_pct: Number(row.return_pct),
    is_ytd: flag(row.is_ytd),
    partial: flag(row.partial),
    source: row.source == null || row.source === "" ? RETURN_SOURCE : String(row.source),
  };
}

function rowKey(row: YearReturn): string {
  return `${row.ticker}|${row.year}`;
}

/** Seed order, with a database row replacing only the matching ticker and year. */
export function mergeReturns(seed: readonly YearReturn[], db: readonly YearReturn[]): YearReturn[] {
  const map = new Map(seed.map((row) => [rowKey(row), row]));
  for (const raw of db) {
    const row = normalizeReturn(raw);
    map.set(rowKey(row), row);
  }
  return [...map.values()].sort((a, b) => a.ticker.localeCompare(b.ticker) || a.year - b.year);
}

export function yearSummary(rows: readonly YearReturn[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const row of rows) {
    if (row.return_pct > 0) up += 1;
    else if (row.return_pct < 0) down += 1;
  }
  return { up, down };
}

/** Signed percent, one decimal. The value is already in percent. */
export function formatReturnPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const body = `${Math.abs(value).toFixed(1)}%`;
  if (value < 0) return `−${body}`;
  if (value > 0) return `+${body}`;
  return "0.0%";
}

export type CellSign = "up" | "down" | "flat";

export function cellSign(returnPct: number): CellSign {
  if (returnPct > 0) return "up";
  if (returnPct < 0) return "down";
  return "flat";
}

/**
 * Wash on night. Positive uses `--color-green` (#5cc08a). Negative uses `--color-alert` (#ff8f87).
 * Alpha grows with magnitude and stays low enough that chalk type keeps its contrast.
 */
export function cellBackground(returnPct: number): string {
  if (!Number.isFinite(returnPct) || returnPct === 0) return "transparent";
  const mag = Math.min(Math.abs(returnPct) / 50, 1);
  const alpha = (0.18 + mag * 0.32).toFixed(3);
  if (returnPct > 0) return `rgb(92 192 138 / ${alpha})`;
  return `rgb(255 143 135 / ${alpha})`;
}
