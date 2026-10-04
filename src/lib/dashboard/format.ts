/** "10.500000" -> "10.5", "3.000000" -> "3". NUMERIC comes back as an exact string. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
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
 * Portfolio row cell (T14, spec §9): "12.4% · 78% covered"; the EPS column shows weighted 1y EPS growth,
 * labelled (D9). 0% coverage: "— · 0% covered". Nothing valued: "—".
 */
export function formatPortfolioCell(
  metricKey: string,
  cell: { value: number | null; coverage: number | null } | undefined,
): { label: string | null; text: string } {
  const label = metricKey === "eps_1y" ? "EPS growth 1y (weighted)" : null;
  if (!cell || cell.coverage === null) return { label, text: "—" };
  const value = cell.value === null ? "—" : `${(cell.value * 100).toFixed(1)}%`;
  return { label, text: `${value} · ${formatCoverage(cell.coverage)}` };
}
