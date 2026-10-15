/**
 * Personal Finance equity cover (#86 v1.3; spec `attachments/personal-finance-spec.md` section 13, PF-17..20). EL
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
/**
 * #131 (spec section 24, PF-108): the description above `Withdrawal rate (%)`, one string per line. Line 2 follows
 * `rateUsed()`; #138 changed it to "the lower of" (PF-155).
 */
export const WITHDRAWAL_DESC_LINES = [
  "Withdrawal rate used to calculate how much equity can cover expenses.",
  // #138 (PF-155, Q-R5; supersedes Q-W1's line): the lower-of rule.
  "Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.",
] as const;
/** #138 (PF-154, Q-R4): the line under `Rate used` naming the rate that won. */
export const RATE_SOURCE = {
  withdrawal: "from Withdrawal Rate",
  roic: "from half of Portfolio ROIC",
  equal: "Withdrawal Rate and half of Portfolio ROIC are equal",
} as const;

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
/**
 * #138 (spec section 30, PF-150..PF-153; supersedes PF-18's formula A): the two candidates, each null when not set
 * (blank or 0, Q-R2); `bad` when either field fails its check (Q-R3 → `—`).
 */
function candidates(rates: Rates): { bad: boolean; wr: number | null; half: number | null } {
  const wr = parseWithdrawal(rates.withdrawal);
  const roic = parseRoic(rates.roic);
  if (wr === null || roic === null) return { bad: true, wr: null, half: null };
  return { bad: false, wr: positive(wr), half: positive(roic / 2) };
}

/** Rate used = min(withdrawal, ROIC ÷ 2) of the set ones; one set → it; none or a field in error → null. */
export function rateUsed(rates: Rates): number | null {
  const { bad, wr, half } = candidates(rates);
  if (bad) return null;
  if (wr !== null && half !== null) return Math.min(wr, half);
  return wr ?? half;
}

/** #138 (Q-R4): which input gave `rateUsed`, or null when it is `—`. */
export function rateSource(rates: Rates): keyof typeof RATE_SOURCE | null {
  const { bad, wr, half } = candidates(rates);
  if (bad || (wr === null && half === null)) return null;
  if (wr !== null && half !== null) return wr === half ? "equal" : wr < half ? "withdrawal" : "roic";
  return wr !== null ? "withdrawal" : "roic";
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
