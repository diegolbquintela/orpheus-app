/**
 * #221 (personal-finance-spec 57.13, AC PFPJ-60..66; Diego 2026-10-22, CFO Q-PJ9): the scenario screen's
 * Monthly / Yearly choice for a flow amount. Pure; the stored (calculated) value stays in the field's own period.
 */
import { parseAmount } from "./expenses.ts";
import { formatMoney } from "./money.ts";

export type Per = "month" | "year";
export const PER_LABEL: Record<Per, string> = { month: "Monthly", year: "Yearly" };
const factor = (from: Per, to: Per): number => (from === to ? 1 : from === "month" ? 12 : 1 / 12);

/** What the field shows in period `shown` for the stored text in period `base`: blank or invalid text as is;
 * otherwise the (converted) amount rounded to cents for display (the stored value is not rounded). Typed text is shown
 * as typed until the next switch (`PeriodInput`). */
export function shownText(stored: string, base: Per, shown: Per): string {
  if (!stored.trim()) return stored;
  const n = parseAmount(stored);
  return n === null ? stored : formatMoney(n * factor(base, shown));
}

/** What a typed text in period `shown` stores in period `base`: blank or invalid text as is (so the field's own error
 * shows); otherwise the exact converted amount, unrounded (Yearly 6,000 → 500 a month; 1,000 → 83.333… a month). */
export function storedText(typed: string, base: Per, shown: Per): string {
  if (base === shown || !typed.trim()) return typed;
  const n = parseAmount(typed);
  return n === null ? typed : String(n * factor(shown, base));
}
