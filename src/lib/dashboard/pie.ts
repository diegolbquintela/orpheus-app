/**
 * Holdings pie (T15 #23; spec §9 "Pie chart", DASH-24). Pure: built from the T07 valuation rows (market
 * value in the base currency), so each slice's % is the table's "% of portfolio" (same value / same total,
 * same 1-decimal formatting).
 * - One slice per valued holding, largest first (ties: ticker A→Z).
 * - More than 10 valued holdings: the 10 largest keep their slice and the rest are grouped into "Other".
 * - Holdings with no market value (no close yet → "price pending", or no FX rate yet → "FX pending") get no
 *   slice and are listed under the chart, like the table's totals.
 * - Labels are ticker + %; no colour or wording implies good/bad.
 */
export const PIE_MAX_SLICES = 10;

export type PieSlice = {
  /** Ticker, or "Other". */
  label: string;
  /** Tickers in the slice (several for "Other"). */
  symbols: string[];
  /** Market value in the base currency. */
  value: number;
  /** value / total × 100 (unrounded; the slices sum to 100). */
  pct: number;
};

export type PieData = { slices: PieSlice[]; total: number; pricePending: string[]; fxPending: string[] };

type Row = { symbol: string; value: number | null; status: string };

export function pieSlices(rows: Row[]): PieData {
  const valued = rows
    .filter((r): r is Row & { value: number } => r.value !== null && Number.isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol));
  const total = valued.reduce((s, r) => s + r.value, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const top = valued.slice(0, PIE_MAX_SLICES);
  const rest = valued.slice(PIE_MAX_SLICES);
  const slices: PieSlice[] = top.map((r) => ({ label: r.symbol, symbols: [r.symbol], value: r.value, pct: pct(r.value) }));
  if (rest.length) {
    const v = rest.reduce((s, r) => s + r.value, 0);
    slices.push({ label: "Other", symbols: rest.map((r) => r.symbol), value: v, pct: pct(v) });
  }
  return {
    slices,
    total,
    pricePending: rows.filter((r) => r.value === null && r.status !== "fx_pending").map((r) => r.symbol),
    fxPending: rows.filter((r) => r.value === null && r.status === "fx_pending").map((r) => r.symbol),
  };
}

/** Same formatting as the table's "% of portfolio" column. */
export const piePct = (pct: number) => `${pct.toFixed(1)}%`;

/** Neutral greys (no red/green, no ranking meaning), cycled by slice order. */
export const PIE_COLOURS = ["#1e2124", "#4a4f55", "#6f757c", "#8e949a", "#aab0b6", "#c4c9ce", "#5c6166", "#7d8389", "#9ca2a8", "#b7bcc1", "#d6d9dc"];

/**
 * Total-row flag (EL, #43): holdings left out of the weights and coverage because they have no price
 * (or no FX rate yet). "1 holding without a price excluded" / "N holdings without a price excluded";
 * "… without a price or FX rate excluded" when an FX-pending one is among them. null when N = 0.
 */
export function excludedNote(pricePending: number, fxPending: number): string | null {
  const n = pricePending + fxPending;
  if (n <= 0) return null;
  return `${n} ${n === 1 ? "holding" : "holdings"} without a price${fxPending > 0 ? " or FX rate" : ""} excluded`;
}
