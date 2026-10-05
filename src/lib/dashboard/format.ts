/** "10.500000" -> "10.5", "3.000000" -> "3". NUMERIC comes back as an exact string. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * Thousands separators on a number string, decimals untouched (#59, DR6-02: every amount shows full digits with
 * thousands separators, never K/M/B): "17500" -> "17,500", "1234.5" -> "1,234.5", "-12345.678" -> "-12,345.678".
 * Shares, average cost and last close keep their stored decimals (no rounding); only the grouping is added.
 */
export function groupDigits(value: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(value);
  return m ? `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${m[3] ?? ""}` : value;
}

/** A stored NUMERIC string for display: trailing zeros trimmed, then grouped ("17500.000000" -> "17,500"). */
export const displayDecimal = (value: string): string => groupDigits(trimDecimal(value));

/** A metric percentage, one decimal, grouped above 999.9% (DR6-02): 0.274 -> "27.4%", 12.345 -> "1,234.5%". */
export const formatMetricPct = (v: number): string => `${groupDigits((v * 100).toFixed(1))}%`;

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
  const shown = groupDigits(String(v).includes("e") ? v.toFixed(2) : `${int}.${dec.padEnd(2, "0")}`);
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
  return { label, text: `${formatMetricPct(cell.value)} · ${formatCoverage(cell.coverage)}` };
}

/** The request body's average cost: blank input is "no cost" (null), never 0 (#56). */
export const costForRequest = (input: string): string | null => (input.trim() ? input.trim() : null);
