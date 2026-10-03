/**
 * Metric computation from stored annual facts (spec §8). T09 (#17): revenue growth 1y and revenue CAGR
 * 3y/5y/10y. Runs only in the background (after the SEC ingest in `refreshFundamentals`, and in the daily
 * run for covered symbols whose rows are missing); pages read `metric_values` only.
 *
 * - FY0 = the company's latest stored fiscal year end (any concept). FY−n = the stored fiscal year end
 *   n years earlier (± 45 days, for 52/53-week years and FYE changes; the closest wins).
 * - `rev_g_1y` = Rev FY0 / Rev FY−1 − 1; `n/m` when either value is ≤ 0 or missing.
 * - `rev_cagr_Ny` = (Rev FY0 / Rev FY−n)^(1/n) − 1; `n/m` when either endpoint is ≤ 0 or Rev FY0 is
 *   missing; `insufficient_history` when Rev FY−n is missing.
 * Values are fractions (0.0187 = 1.87%); negative growth is a real value.
 */
import type { MetricStatus, Queryable } from "./store.server.ts";

export type RevenueFact = { fiscalYearEnd: string; value: number };
export type ComputedMetric = { key: string; value: number | null; status: MetricStatus; fiscalYearEnd: string | null };

export const REVENUE_METRIC_KEYS = ["rev_g_1y", "rev_cagr_3y", "rev_cagr_5y", "rev_cagr_10y"] as const;
const SPANS: [string, number][] = [
  ["rev_g_1y", 1],
  ["rev_cagr_3y", 3],
  ["rev_cagr_5y", 5],
  ["rev_cagr_10y", 10],
];
/** How far a fiscal year end may sit from exactly n years before FY0 and still count as FY−n. */
export const FYE_TOLERANCE_DAYS = 45;

const dayMs = 86_400_000;
const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
function yearsBefore(iso: string, n: number): number {
  const [y, m, d] = iso.split("-").map(Number);
  // Same calendar day n years earlier (29 Feb → 28 Feb).
  const last = new Date(Date.UTC(y - n, m, 0)).getUTCDate();
  return Date.UTC(y - n, m - 1, Math.min(d, last));
}

/** The stored fiscal year end n years before `fy0`, if any. */
export function fiscalYearBack(fyEnds: string[], fy0: string, n: number): string | null {
  const target = yearsBefore(fy0, n);
  let best: string | null = null;
  let bestGap = Infinity;
  for (const e of fyEnds) {
    const gap = Math.abs(parse(e) - target);
    if (gap <= FYE_TOLERANCE_DAYS * dayMs && gap < bestGap) [best, bestGap] = [e, gap];
  }
  return best;
}

/** Revenue growth and CAGRs for one company. `fy0` = its latest fiscal year end (any concept). */
export function revenueGrowth(revenue: RevenueFact[], fy0: string | null): ComputedMetric[] {
  const byEnd = new Map(revenue.map((r) => [r.fiscalYearEnd, r.value]));
  const ends = [...byEnd.keys()];
  return SPANS.map(([key, n]) => {
    if (!fy0) return { key, value: null, status: "n/m", fiscalYearEnd: null };
    const now = byEnd.get(fy0);
    const backEnd = fiscalYearBack(ends, fy0, n);
    const base = backEnd ? byEnd.get(backEnd) : undefined;
    if (now === undefined || !(now > 0)) return { key, value: null, status: "n/m", fiscalYearEnd: fy0 };
    if (base === undefined) return { key, value: null, status: n === 1 ? "n/m" : "insufficient_history", fiscalYearEnd: fy0 };
    if (!(base > 0)) return { key, value: null, status: "n/m", fiscalYearEnd: fy0 };
    const value = n === 1 ? now / base - 1 : (now / base) ** (1 / n) - 1;
    return { key, value, status: "ok", fiscalYearEnd: fy0 };
  });
}

/** Recompute the revenue metrics for one covered symbol from `fundamentals_annual` and store them. */
export async function computeRevenueMetrics(db: Queryable, symbol: string): Promise<ComputedMetric[]> {
  const rows = await db.query<{ fye: string; concept: string; value: string }>(
    `SELECT fiscal_year_end::text AS fye, concept, value::text AS value FROM fundamentals_annual WHERE symbol = $1`,
    [symbol],
  );
  const fy0 = rows.map((r) => r.fye).sort().at(-1) ?? null;
  const revenue = rows.filter((r) => r.concept === "revenue").map((r) => ({ fiscalYearEnd: r.fye, value: Number(r.value) }));
  const out = revenueGrowth(revenue, fy0);
  for (const m of out)
    await db.query(
      `INSERT INTO metric_values (symbol, metric_key, value, status, fiscal_year_end, computed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (symbol, metric_key) DO UPDATE SET value = EXCLUDED.value, status = EXCLUDED.status,
         fiscal_year_end = EXCLUDED.fiscal_year_end, computed_at = EXCLUDED.computed_at`,
      [symbol, m.key, m.value === null ? null : m.value.toPrecision(12), m.status, m.fiscalYearEnd],
    );
  return out;
}

/** Covered symbols (SEC facts stored) that lack any revenue metric row: e.g. ingested before T09. */
export async function symbolsMissingRevenueMetrics(db: Queryable): Promise<string[]> {
  const rows = await db.query<{ symbol: string }>(
    `SELECT i.symbol FROM instruments i
     WHERE i.fundamentals_source = 'sec'
       AND i.symbol IN (SELECT DISTINCT symbol FROM holdings)
       AND (SELECT count(*) FROM metric_values m WHERE m.symbol = i.symbol AND m.metric_key = ANY($1::text[])) < $2
     ORDER BY i.symbol`,
    [REVENUE_METRIC_KEYS as unknown as string[], REVENUE_METRIC_KEYS.length],
  );
  return rows.map((r) => r.symbol);
}
