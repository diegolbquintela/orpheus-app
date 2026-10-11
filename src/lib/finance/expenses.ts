/**
 * Personal finance expenses (#84 v1.1; spec `attachments/personal-finance-spec.md` §5–§6, PF-03..07). Pure helpers:
 * amounts, conversion, percentages, totals, accounts and this browser's `localStorage` (one key, no login, no
 * server). A missing or broken storage just reads as an empty page. `% of income` is wired by #85; `Equity to cover`
 * (#86, spec section 13): the yearly amount ÷ (rate ÷ 100), and a typed value overrides it (Q3). Foreign currency
 * (#87, section 14): a line may be in another currency with a typed `FX rate` (household units per 1 unit of the
 * line's currency, Q12); every total, percentage and `Equity to cover` uses the household amount (amount × rate);
 * a foreign line without a valid rate contributes `—` (null) to every household figure and to any total containing it
 * (Q14, decided; the Q10 pattern). `Monthly` / `Yearly` fields stay in the line's currency.
 */

import { type CurrencyCode, DEFAULT_HOUSEHOLD, isCurrency } from "./currency.ts";

export const STORAGE_KEY = "orpheus.finance.expenses.v1";
export const NAME_MAX = 80;
export const ACCOUNT_MAX = 40;
export const ACCOUNTS_MAX = 50;
export const LINES_MAX = 100;
export const AMOUNT_ERROR = "Enter a number, 0 or more.";
export const ACCOUNT_ERROR = "Name the account.";
export const NOT_COMPUTED = "—";

export type Per = "month" | "year";
export type GroupKey = "fixed" | "variable";
export const GROUPS: readonly { key: GroupKey; title: string; total: string }[] = [
  { key: "fixed", title: "Fixed", total: "Fixed total" },
  { key: "variable", title: "Variable", total: "Variable total" },
];
export const COLUMNS = [
  "Name",
  "% of income",
  "% of expenses",
  "Monthly",
  "Yearly",
  "Currency",
  "FX rate",
  "Equity to cover",
  "Account",
] as const;

export type Line = {
  id: string;
  name: string;
  /** The amount as typed, in the period `per`. */
  amount: string;
  per: Per;
  /** Equity to cover as typed: an override of the calculated amount (#86, Q3); empty uses the calculated one. */
  equity: string;
  /** An account name from `accounts`, or "" for none. */
  account: string;
  /** #87: the line's currency code, or "" for the household currency (a v1.1–v1.3 line reads as ""). */
  currency: string;
  /** #87: the FX rate as typed, household units per 1 unit of `currency` (Q12); ignored on a household line. */
  rate: string;
};

export type Expenses = { fixed: Line[]; variable: Line[]; accounts: string[] };

export const EMPTY: Expenses = { fixed: [], variable: [], accounts: [] };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * A typed amount: commas and spaces dropped; empty is 0. Null when it is not a number 0 or more (the field check).
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.replace(/[,\s]/g, "");
  if (!trimmed) return 0;
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A typed amount as a number, 0 when it fails the field check (it counts as 0 everywhere until fixed). */
export const amountOrZero = (text: string): number => parseAmount(text) ?? 0;

export const monthlyOf = (line: Line): number =>
  line.per === "month" ? amountOrZero(line.amount) : amountOrZero(line.amount) / 12;

export const yearlyOf = (line: Line): number =>
  line.per === "year" ? amountOrZero(line.amount) : amountOrZero(line.amount) * 12;

/** True when the line is in a currency other than the household's (#87). */
export const isForeign = (line: Line, household: CurrencyCode = DEFAULT_HOUSEHOLD): boolean =>
  line.currency !== "" && line.currency !== household;

/** A typed FX rate: a number above 0 (section 5 reading), else null (the field check, Q14). */
export function parseRate(text: string): number | null {
  if (!text.trim()) return null;
  const value = parseAmount(text);
  return value !== null && value > 0 ? value : null;
}

/**
 * What one unit of the line's amount is worth in the household currency: 1, its valid rate, or null (`—`) for a
 * foreign line without a valid rate (Q14, decided).
 */
export const factorOf = (line: Line, household: CurrencyCode = DEFAULT_HOUSEHOLD): number | null =>
  isForeign(line, household) ? parseRate(line.rate) : 1;

const times = (a: number, b: number | null): number | null => (b === null ? null : a * b);

/**
 * The line's monthly / yearly amount in the household currency (#87): what every total and percentage uses; null
 * (`—`) for a foreign line without a valid rate (Q14).
 */
export const householdMonthlyOf = (
  line: Line,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null => times(monthlyOf(line), factorOf(line, household));
export const householdYearlyOf = (
  line: Line,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null => times(yearlyOf(line), factorOf(line, household));

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Grouped with commas, up to two decimals, no trailing zeros, no currency symbol (Q2): `1,200`, `83.33`. */
export function formatAmount(value: number): string {
  const text = NUMBER.format(value);
  return text === "-0" ? "0" : text;
}

/** One decimal and `%`, or `—` while the whole is 0 or either side is `—` (null; #87, Q14). */
export function formatShare(part: number | null, whole: number | null): string {
  if (part === null || whole === null || !(whole > 0)) return NOT_COMPUTED;
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** What a Monthly / Yearly field shows: the typed text in its own period, the conversion in the other. */
export function fieldText(line: Line, field: Per): string {
  if (line.per === field) return line.amount;
  if (!line.amount.trim() || parseAmount(line.amount) === null) return "";
  return formatAmount(field === "month" ? monthlyOf(line) : yearlyOf(line));
}

/** True when the line's `Equity to cover` field holds a valid typed override (not blank, a number 0 or more; Q9). */
export const hasOverride = (line: Line): boolean =>
  line.equity.trim() !== "" && parseAmount(line.equity) !== null;

/**
 * The calculated `Equity to cover` (#86, option A): the line's yearly amount (in the household currency, #87) ÷
 * (rate ÷ 100), or null with no rate (null, 0 or less) or no household amount (a foreign line without a valid FX
 * rate, Q14). `rate` is the rate used, a percent (4 for 4%).
 */
export function calculatedEquity(
  line: Line,
  rate: number | null,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null {
  if (rate === null || !(rate > 0)) return null;
  const yearly = householdYearlyOf(line, household);
  return yearly === null ? null : (yearly * 100) / rate;
}

/**
 * What a line adds to the totals: its valid override, else the calculated amount (a bad override falls back to it,
 * Q9); null (`—`) with no valid override and no usable rate (Q10).
 */
export const equityOf = (
  line: Line,
  rate: number | null,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null =>
  hasOverride(line) ? amountOrZero(line.equity) : calculatedEquity(line, rate, household);

/** A total: null (`—`) when any line contributes `—` (Q10 for Equity to cover; #87 Q14 for every household figure). */
const add = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a + b;

/** Household totals; null (`—`) when a line contributes `—` (Q10, Q14). */
export type Totals = { monthly: number | null; yearly: number | null; equity: number | null };

/** Totals in the household currency (#87: each line × its factor). */
export function totalsOf(
  lines: readonly Line[],
  rate: number | null = null,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): Totals {
  return lines.reduce(
    (t, line) => ({
      monthly: add(t.monthly, householdMonthlyOf(line, household)),
      yearly: add(t.yearly, householdYearlyOf(line, household)),
      equity: add(t.equity, equityOf(line, rate, household)),
    }),
    { monthly: 0, yearly: 0, equity: 0 } as Totals,
  );
}

export function grandTotals(
  expenses: Expenses,
  rate: number | null = null,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): Totals {
  const a = totalsOf(expenses.fixed, rate, household);
  const b = totalsOf(expenses.variable, rate, household);
  return {
    monthly: add(a.monthly, b.monthly),
    yearly: add(a.yearly, b.yearly),
    equity: add(a.equity, b.equity),
  };
}

/**
 * Adds an account to the shared list. Trims; refuses an empty name; reuses an existing one with the same name in
 * any case; ≤ 40 characters, ≤ 50 accounts. Returns the list and the name to select, or the field check.
 */
export function addAccount(
  accounts: readonly string[],
  typed: string,
): { accounts: string[]; name: string } | { error: string } {
  const name = typed.trim().slice(0, ACCOUNT_MAX);
  if (!name) return { error: ACCOUNT_ERROR };
  const existing = accounts.find((a) => a.toLowerCase() === name.toLowerCase());
  if (existing) return { accounts: [...accounts], name: existing };
  // Full list: the page hides `Add account…` at 50, so this only guards a stale call (nothing added).
  if (accounts.length >= ACCOUNTS_MAX) return { accounts: [...accounts], name: "" };
  return { accounts: [...accounts, name], name };
}

let counter = 0;
export function newLine(): Line {
  counter += 1;
  return {
    id: `l${Date.now().toString(36)}${counter.toString(36)}`,
    name: "",
    amount: "",
    per: "month",
    equity: "",
    account: "",
    currency: "",
    rate: "",
  };
}

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function asLine(value: unknown, accounts: readonly string[]): Line | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isText(v.id, 40) || !v.id) return null;
  if (!isText(v.name, NAME_MAX) || !isText(v.amount, 40) || !isText(v.equity, 40)) return null;
  if (v.per !== "month" && v.per !== "year") return null;
  if (!isText(v.account, ACCOUNT_MAX)) return null;
  // #87: optional; a v1.1–v1.3 line (no currency / rate) reads as a household line; an unknown code as "".
  if (v.rate !== undefined && !isText(v.rate, 40)) return null;
  return {
    id: v.id,
    name: v.name,
    amount: v.amount,
    per: v.per,
    equity: v.equity,
    account: accounts.includes(v.account) ? v.account : "",
    currency: isCurrency(v.currency) ? v.currency : "",
    rate: typeof v.rate === "string" ? v.rate : "",
  };
}

/** A stored value back into the page, or the empty page when it isn't one (never throws). */
export function asExpenses(value: unknown): Expenses {
  if (!value || typeof value !== "object") return EMPTY;
  const v = value as Record<string, unknown>;
  const accounts: string[] = [];
  if (Array.isArray(v.accounts)) {
    for (const a of v.accounts) {
      if (!isText(a, ACCOUNT_MAX) || !a.trim()) continue;
      if (accounts.some((b) => b.toLowerCase() === a.toLowerCase())) continue;
      if (accounts.length < ACCOUNTS_MAX) accounts.push(a);
    }
  }
  const lines = (list: unknown): Line[] => {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: Line[] = [];
    for (const item of list.slice(0, LINES_MAX)) {
      const line = asLine(item, accounts);
      if (line && !seen.has(line.id)) {
        seen.add(line.id);
        out.push(line);
      }
    }
    return out;
  };
  return { fixed: lines(v.fixed), variable: lines(v.variable), accounts };
}

export function readExpenses(storage: StorageLike | null): Expenses {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text ? asExpenses(JSON.parse(text)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function writeExpenses(storage: StorageLike | null, expenses: Expenses): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch {
    // Storage full or blocked: the page keeps working for this visit.
  }
}
