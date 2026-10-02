/**
 * Presentation helpers for the Desk results: plan labels, metric row order and
 * compact axis ticks. Pure functions over the engine output; no math changes.
 */
import { money, pct } from "./format.ts";
import type { DeskRun, Frequency, PlanStats } from "./types.ts";

export type PlanKey = "dca" | "lump";

/** Table column order (unchanged): lump sum, then DCA behind the swipe. */
export const PLAN_ORDER: PlanKey[] = ["lump", "dca"];

export type PlanContext = {
  currency: string;
  capital: number;
  contribution: number;
  frequency: Frequency;
};

export type MetricRow = {
  key: string;
  label: string;
  value: (plan: PlanStats, currency: string) => string;
};

/**
 * Total invested and end NLV lead, then the money-weighted return (XIRR), the
 * headline return for DCA because its cash goes in over time. CAGR stays, but
 * labeled for what it is: growth on the total as if all of it went in on day
 * one (exact for lump sum, not how DCA cash actually arrives).
 */
export const METRIC_ROWS: MetricRow[] = [
  { key: "invested", label: "Total invested", value: (p, c) => money(p.invested, c) },
  { key: "nlv", label: "NLV at end", value: (p, c) => money(p.endNlv, c) },
  { key: "mwr", label: "Money-weighted return (XIRR, per year)", value: (p) => pct(p.mwr) },
  { key: "total", label: "Total return", value: (p) => pct(p.totalReturn) },
  {
    key: "cagr",
    label: "CAGR on total invested, as if all invested day one",
    value: (p) => pct(p.cagr),
  },
  { key: "drop", label: "Max drop", value: (p) => `${pct(p.maxDrop)} · ${p.maxDropDate}` },
  { key: "at", label: "NLV at that drop", value: (p, c) => money(p.nlvAtDrop, c) },
  { key: "to", label: "Return to the drop", value: (p) => pct(p.returnToDrop) },
];

/** Row shown as each plan's headline return. */
export const HEADLINE_KEY = "mwr";

export function planName(plan: PlanKey): string {
  return plan === "dca" ? "DCA" : "Lump sum";
}

/** Column header from the inputs: "Lump sum ($1,000 once)" / "DCA ($1,000 weekly)". */
export function planHeading(plan: PlanKey, ctx: PlanContext): string {
  if (plan === "dca") return `DCA (${money(ctx.contribution, ctx.currency)} ${ctx.frequency})`;
  return `Lump sum (${money(ctx.capital, ctx.currency)} once)`;
}

/** One-line summary above the table, DCA first: "DCA: $314k in, $2.03M now · Lump sum: $1k in, $13k now". */
export function resultSummary(run: DeskRun, currency: string): string {
  return (["dca", "lump"] as PlanKey[])
    .map(
      (plan) =>
        `${planName(plan)}: ${compactMoney(run[plan].invested, currency, 3)} in, ${compactMoney(run[plan].endNlv, currency, 3)} now`,
    )
    .join(" · ");
}

export function planMetrics(
  run: DeskRun,
  plan: PlanKey,
  currency: string,
): { key: string; label: string; value: string }[] {
  const stats = run[plan];
  return METRIC_ROWS.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.value(stats, currency),
  }));
}

function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" })
      .formatToParts(0)
      .find((item) => item.type === "currency");
    return part?.value ?? `${currency} `;
  } catch {
    return `${currency} `;
  }
}

const UNITS: [number, string][] = [
  [1, ""],
  [1e3, "k"],
  [1e6, "M"],
  [1e9, "B"],
  [1e12, "T"],
];

/**
 * Short money label with `significant` digits: $950, $13k, $2.2M (2 digits,
 * axis ticks) or $314k, $2.03M (3 digits, summary line). Trailing zeros drop.
 */
export function compactMoney(value: number, currency: string, significant = 2): string {
  if (!Number.isFinite(value)) return "—";
  const symbol = currencySymbol(currency);
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  let unit = 0;
  while (unit + 1 < UNITS.length && abs >= UNITS[unit + 1][0]) unit += 1;
  for (; unit < UNITS.length; unit++) {
    const [size, suffix] = UNITS[unit];
    const scaled = abs / size;
    const whole = scaled >= 1 ? Math.floor(Math.log10(scaled)) + 1 : 1;
    const decimals = size === 1 ? 0 : Math.max(0, significant - whole);
    const rounded = Number(scaled.toFixed(decimals));
    // 999,999 rounds to 1000k; carry into the next unit instead.
    if (rounded >= 1000 && unit + 1 < UNITS.length) continue;
    return `${sign}${symbol}${String(rounded)}${suffix}`;
  }
  return `${sign}${symbol}${Math.round(abs)}`;
}
