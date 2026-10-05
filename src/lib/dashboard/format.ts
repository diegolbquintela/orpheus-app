/** "10.500000" -> "10.5", "3.000000" -> "3". NUMERIC comes back as an exact string. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * "% of portfolio" label, shared by the holdings table (row and total) and the pie (#24 N1): one decimal,
 * e.g. 41.7 -> "41.7%". Labels are rounded one by one, so a column of them may not sum to exactly 100.0.
 */
export function formatPortfolioPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** EPS as reported (at least 2 decimals, never rounded away: 0.105 stays 0.105) + currency code (T11). */
export function formatEps(v: number, currency: string | null | undefined): string {
  const [int, dec = ""] = String(v).split(".");
  const shown = String(v).includes("e") ? v.toFixed(2) : `${int}.${dec.padEnd(2, "0")}`;
  return currency ? `${shown} ${currency}` : shown;
}

/** Coverage share (0..1) as a whole percent; never shows 100% unless fully covered, never 0% unless none. */
export function formatCoverage(c: number): string {
  const p = Math.round(c * 100);
  return `${c < 1 ? Math.min(99, c > 0 ? Math.max(1, p) : 0) : 100}% covered`;
}

/**
 * Book row cell (T14, spec §9; the `Book` row of the metrics sheet since #58): "12.4% · 78% covered"; the EPS
 * chip shows weighted 1y EPS growth, labelled (D9). 0% coverage (no holding has a figure) and nothing valued:
 * "—" alone (spec §0.5 item 11; was "— · 0% covered" before #58).
 */
export function formatPortfolioCell(
  metricKey: string,
  cell: { value: number | null; coverage: number | null } | undefined,
): { label: string | null; text: string } {
  const label = metricKey === "eps_1y" ? "EPS growth 1y (weighted)" : null;
  if (!cell || cell.coverage === null || cell.value === null) return { label, text: "—" };
  return { label, text: `${(cell.value * 100).toFixed(1)}% · ${formatCoverage(cell.coverage)}` };
}

/** The request body's average cost: blank input is "no cost" (null), never 0 (#56). */
export const costForRequest = (input: string): string | null => (input.trim() ? input.trim() : null);
