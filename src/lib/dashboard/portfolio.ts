/**
 * Portfolio row for the metric columns (T14 #22; spec §9, D9; DASH-22, DASH-23). Pure, computed at read
 * time from the stored valuation (T07, base currency) and the stored `metric_values` (T09–T13); nothing
 * here fetches anything.
 *
 * For metric m: value = Σ(wᵢ · mᵢ) over valued holdings with a valid mᵢ, wᵢ = MVᵢ / Σ MV of those same
 * holdings (renormalised). Coverage = Σ MV of those holdings / Σ MV of all valued holdings.
 * - Valid = the company is covered and its stored status is "ok" with a finite value. "n/m", insufficient
 *   history/data, not covered, coverage pending and not yet computed are excluded and count against
 *   coverage; they are never treated as zero. Negative values are included as they are.
 * - Holdings without a market value (price or FX pending) carry no weight and are outside both sums
 *   (listed as pending under the total).
 * - EPS column (D9): per-share amounts in different currencies don't add up, so the portfolio cell is the
 *   weighted 1-year EPS growth, from each company's stored `eps_g_1y`.
 * - 0% coverage → value null (shown as "—").
 */
export const PORTFOLIO_SOURCE_KEY: Record<string, string> = { eps_1y: "eps_g_1y" };

export type PortfolioCell = {
  /** Weighted mean (fraction, e.g. 0.124 = 12.4%); null when coverage is 0. */
  value: number | null;
  /** Σ MV covered / Σ MV valued, 0..1; null when nothing is valued. */
  coverage: number | null;
  /** The stored metric the cell is built from (eps_g_1y for the EPS column). */
  source: string;
  /** Symbols in the weighted mean. */
  included: string[];
};

type ValuedRowInput = { symbol: string; value: number | null };
type MetricViewInput = { coverage: string; metrics: Record<string, { value: string | null; status: string } | undefined> };

export function portfolioMetrics(
  rows: ValuedRowInput[],
  views: Record<string, MetricViewInput | undefined>,
  metricKeys: readonly string[],
): Record<string, PortfolioCell> {
  const valued = rows.filter((r) => r.value !== null && Number.isFinite(r.value) && (r.value as number) > 0);
  const total = valued.reduce((s, r) => s + (r.value as number), 0);
  const out: Record<string, PortfolioCell> = {};
  for (const key of metricKeys) {
    const source = PORTFOLIO_SOURCE_KEY[key] ?? key;
    let covered = 0;
    let weighted = 0;
    const included: string[] = [];
    for (const r of valued) {
      const view = views[r.symbol];
      const cell = view?.coverage === "covered" ? view.metrics[source] : undefined;
      const v = cell && cell.status === "ok" && cell.value !== null ? Number(cell.value) : NaN;
      if (!Number.isFinite(v)) continue;
      covered += r.value as number;
      weighted += (r.value as number) * v;
      included.push(r.symbol);
    }
    out[key] = {
      value: covered > 0 ? weighted / covered : null,
      coverage: total > 0 ? covered / total : null,
      source,
      included,
    };
  }
  return out;
}
