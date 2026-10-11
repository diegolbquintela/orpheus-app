/**
 * Personal finance equity cover (#86 v1.3; spec `attachments/personal-finance-spec.md` section 13, PF-17..20). EL
 * option A: two household rates, typed (withdrawal rate 0–100; ROIC 0 or more, no cap, Q11). The rate used is the typed withdrawal rate (as typed, never halved; it wins
 * when both are typed), else portfolio ROIC ÷ 2 (Diego's default); a rate of 0 is no rate. Each line's calculated
 * `Equity to cover` = its yearly amount ÷ (rate ÷ 100) (`calculatedEquity` in `expenses.ts`); a typed value on the
 * line overrides it (Q3). Stored in this browser's `localStorage`, its own key; the other two keys are unchanged.
 */
import { formatAmount, NOT_COMPUTED, parseAmount } from "./expenses.ts";
import { parsePercent } from "./income.ts";

export const EQUITY_KEY = "orpheus.finance.equity.v1";
export const WITHDRAWAL_LABEL = "Withdrawal rate (%)";
export const ROIC_LABEL = "Portfolio ROIC (%)";
export const RATE_USED_LABEL = "Rate used";

export type Rates = {
  /** Withdrawal rate percent as typed (empty: use ROIC ÷ 2). */
  withdrawal: string;
  /** Portfolio ROIC percent as typed. */
  roic: string;
};
export const NO_RATES: Rates = { withdrawal: "", roic: "" };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const positive = (value: number): number | null => (value > 0 ? value : null);

/** Withdrawal rate: a percent 0–100. Portfolio ROIC: 0 or more, no upper cap (Q11). Null when it fails its check. */
export const parseWithdrawal = (text: string): number | null => parsePercent(text);
export const parseRoic = (text: string): number | null => parseAmount(text);

/** The rate used, a percent (4 for 4%), or null when there is none (neither typed, 0, or a bad field). */
export function rateUsed(rates: Rates): number | null {
  if (rates.withdrawal.trim()) return positive(parseWithdrawal(rates.withdrawal) ?? 0);
  if (rates.roic.trim()) return positive((parseRoic(rates.roic) ?? 0) / 2);
  return null;
}

/** `Rate used` as shown: `4%`, `3.75%`, or `—`. */
export const formatRate = (rate: number | null): string =>
  rate === null ? NOT_COMPUTED : `${formatAmount(rate)}%`;

const isText = (v: unknown): v is string => typeof v === "string" && v.length <= 40;

/** A stored value back into the rates, or both empty when it isn't one (never throws). */
export function asRates(value: unknown): Rates {
  if (!value || typeof value !== "object") return NO_RATES;
  const v = value as Record<string, unknown>;
  return {
    withdrawal: isText(v.withdrawal) ? v.withdrawal : "",
    roic: isText(v.roic) ? v.roic : "",
  };
}

export function readRates(storage: StorageLike | null): Rates {
  try {
    const text = storage?.getItem(EQUITY_KEY);
    return text ? asRates(JSON.parse(text)) : NO_RATES;
  } catch {
    return NO_RATES;
  }
}

export function writeRates(storage: StorageLike | null, rates: Rates): void {
  try {
    storage?.setItem(EQUITY_KEY, JSON.stringify(rates));
  } catch {
    // Storage full or blocked: the page keeps working for this visit.
  }
}
