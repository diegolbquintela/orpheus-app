/**
 * Calculator results (#78, spec §7 / ST4-06, EL decision 2): each plan shows exactly four lines, labels word for
 * word. Display only: the values come from the engine's existing figures through the existing money / percent
 * formatters (src/lib/dca is not changed; the money-weighted return, max drop, value at the drop and return to the
 * drop are still computed there, just not shown).
 */
import { money, pct } from "../dca/format.ts";
import type { PlanStats } from "../dca/types.ts";

export type ResultLineKey = "nlv" | "invested" | "total" | "cagr";

export type ResultLine = {
  key: ResultLineKey;
  label: string;
  value: (plan: PlanStats, currency: string) => string;
};

export const RESULT_LINES: readonly ResultLine[] = [
  { key: "nlv", label: "Final value", value: (p, c) => money(p.endNlv, c) },
  { key: "invested", label: "Total invested", value: (p, c) => money(p.invested, c) },
  { key: "total", label: "Return (%)", value: (p) => pct(p.totalReturn) },
  { key: "cagr", label: "CAGR (%)", value: (p) => pct(p.cagr) },
];
