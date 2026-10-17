/**
 * Personal Finance expenses (#84 v1.1; spec `attachments/personal-finance-spec.md` §5–§6, PF-03..07). Pure helpers:
 * amounts, conversion, percentages, totals, accounts and this browser's `localStorage` (one key, no login, no
 * server). A missing or broken storage just reads as an empty page. `% of income` is wired by #85; `Equity to cover`
 * (#86, spec section 13): the yearly amount ÷ (rate ÷ 100), and a typed value overrides it (Q3). Foreign currency
 * (#87, section 14): a line may be in another currency with a typed `FX rate` (household units per 1 unit of the
 * line's currency, Q12); every total, percentage and `Equity to cover` uses the household amount (amount × rate);
 * a foreign line without a valid rate contributes `—` (null) to every household figure and to any total containing it
 * (Q14, decided; the Q10 pattern). `Monthly` / `Yearly` fields stay in the line's currency.
 */

import { formatMoney } from "./money.ts";
import { type CurrencyCode, DEFAULT_HOUSEHOLD, isCurrency } from "./currency.ts";

/**
 * #102: v2 holds rates in the new direction (foreign units per 1 household unit, ÷). v1 (#84–#94) held them as
 * household units per 1 foreign unit (×); `migrateExpenses` converts a v1 value once.
 */
export const STORAGE_KEY = "orpheus.finance.expenses.v2";
export const LEGACY_EXPENSES_KEY = "orpheus.finance.expenses.v1";
export const NAME_MAX = 80;
export const ACCOUNT_MAX = 40;
export const ACCOUNTS_MAX = 50;
export const LINES_MAX = 100;
export const AMOUNT_ERROR = "Enter a number, 0 or more.";
export const ACCOUNT_ERROR = "Name the account.";
/** #105 (PF-44): categories, like accounts. */
export const CATEGORY_MAX = 40;
export const CATEGORIES_MAX = 50;
export const CATEGORY_ERROR = "Name the category.";
export const NO_CATEGORY = "No category";
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
  "Category",
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
  /** #105: a category name from `categories`, or "" for none (an older line reads as ""). */
  category: string;
};

/**
 * #165 (spec section 35, CFO option A KEEP): a deleted category or account. `from` is the month it was deleted on: that
 * month and later ones lost it on Save; earlier months keep it on their lines, shown as `<name> (deleted)`.
 */
export type Deleted = { name: string; from: string };

export type Expenses = {
  fixed: Line[];
  variable: Line[];
  accounts: string[];
  categories: string[];
  /** #165: deleted accounts / categories still on earlier months' lines (absent when none). */
  deletedAccounts?: Deleted[];
  deletedCategories?: Deleted[];
};

export const EMPTY: Expenses = { fixed: [], variable: [], accounts: [], categories: [] };

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

/** 1 ÷ a valid rate (#102: the rate is foreign units per 1 household unit), else null. */
export const factorFromRate = (text: string): number | null => {
  const rate = parseRate(text);
  return rate === null ? null : 1 / rate;
};

/**
 * What one unit of the line's amount is worth in the household currency: 1, 1 ÷ its valid rate (#102; #87 was ×
 * rate), or null (`—`) for a foreign line without a valid rate (Q14, decided).
 */
export const factorOf = (line: Line, household: CurrencyCode = DEFAULT_HOUSEHOLD): number | null =>
  isForeign(line, household) ? factorFromRate(line.rate) : 1;

/** What the line's amount is divided by (#102): 1 for a household line, its valid rate, or null (`—`). */
export const divisorOf = (
  line: Line,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null => (isForeign(line, household) ? parseRate(line.rate) : 1);

/** amount ÷ divisor, null when the divisor is (no valid rate). Division, not × (1 ÷ rate), keeps 37,000 ÷ 3.7 exact. */
export const over = (amount: number, divisor: number | null): number | null =>
  divisor === null ? null : amount / divisor;

/**
 * The line's monthly / yearly amount in the household currency (#87): what every total and percentage uses; null
 * (`—`) for a foreign line without a valid rate (Q14).
 */
export const householdMonthlyOf = (
  line: Line,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null => over(monthlyOf(line), divisorOf(line, household));
export const householdYearlyOf = (
  line: Line,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): number | null => over(yearlyOf(line), divisorOf(line, household));

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
  return formatMoney(field === "month" ? monthlyOf(line) : yearlyOf(line));
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

/** Adds a name to a list: trimmed, ≤ max characters, ≤ limit names, an existing one reused in any case. */
function addName(
  list: readonly string[],
  typed: string,
  max: number,
  limit: number,
  error: string,
): { list: string[]; name: string } | { error: string } {
  const name = typed.trim().slice(0, max);
  if (!name) return { error };
  const existing = list.find((a) => a.toLowerCase() === name.toLowerCase());
  if (existing) return { list: [...list], name: existing };
  // Full list: the page hides the add choice at the limit, so this only guards a stale call (nothing added).
  if (list.length >= limit) return { list: [...list], name: "" };
  return { list: [...list, name], name };
}

/**
 * Adds an account to the shared list. Trims; refuses an empty name; reuses an existing one with the same name in
 * any case; ≤ 40 characters, ≤ 50 accounts. Returns the list and the name to select, or the field check.
 */
export function addAccount(
  accounts: readonly string[],
  typed: string,
): { accounts: string[]; name: string } | { error: string } {
  const r = addName(accounts, typed, ACCOUNT_MAX, ACCOUNTS_MAX, ACCOUNT_ERROR);
  return "error" in r ? r : { accounts: r.list, name: r.name };
}

/** #105 (PF-44): the same rules for a category (≤ 40 characters, ≤ 50, `Name the category.`). */
export function addCategory(
  categories: readonly string[],
  typed: string,
): { categories: string[]; name: string } | { error: string } {
  const r = addName(categories, typed, CATEGORY_MAX, CATEGORIES_MAX, CATEGORY_ERROR);
  return "error" in r ? r : { categories: r.list, name: r.name };
}

/**
 * #105 (PF-46): subtotals by category, household currency: each category with a line (in the order added), then
 * `No category` (name "") for the rest; empty when no line has a category. They sum to the grand totals.
 */
export function categoryTotals(
  expenses: Expenses,
  rate: number | null = null,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): { name: string; totals: Totals }[] {
  const all = [...expenses.fixed, ...expenses.variable];
  if (!all.some((l) => l.category)) return [];
  // #165: deleted categories still on this month's lines get their own row (shown `<name> (deleted)`).
  const known = [...expenses.categories, ...(expenses.deletedCategories ?? []).map((d) => d.name)];
  const names = [...known.filter((c) => all.some((l) => l.category === c)), ""];
  return names
    .map((name) => ({ name, lines: all.filter((l) => l.category === name) }))
    .filter((g) => g.lines.length > 0)
    .map((g) => ({ name: g.name, totals: totalsOf(g.lines, rate, household) }));
}

/**
 * #119 (PF-69): subtotals by account, household currency: each account with a line (in the order added), then
 * `No account` (name "") for the rest; empty when no line has an account. They sum to the grand totals.
 */
export function accountTotals(
  expenses: Expenses,
  rate: number | null = null,
  household: CurrencyCode = DEFAULT_HOUSEHOLD,
): { name: string; totals: Totals }[] {
  const all = [...expenses.fixed, ...expenses.variable];
  if (!all.some((l) => l.account)) return [];
  const known = [...expenses.accounts, ...(expenses.deletedAccounts ?? []).map((d) => d.name)];
  const names = [...known.filter((a) => all.some((l) => l.account === a)), ""];
  return names
    .map((name) => ({ name, lines: all.filter((l) => l.account === name) }))
    .filter((g) => g.lines.length > 0)
    .map((g) => ({ name: g.name, totals: totalsOf(g.lines, rate, household) }));
}

export const NO_ACCOUNT = "No account";

/** #119 (PF-71): a line shows when it matches both filters ("" = every line). */
export const matchesFilters = (line: Line, category: string, account: string): boolean =>
  (category === "" || line.category === category) && (account === "" || line.account === account);

/** #105 / #119: a new line starts on the chosen category and account. */
export function newFilteredLine(category = "", account = ""): Line {
  return { ...newLine(category), account };
}

let counter = 0;
export function newLine(category = ""): Line {
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
    category,
  };
}

const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function asLine(
  value: unknown,
  accounts: readonly string[],
  categories: readonly string[],
): Line | null {
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
    category: typeof v.category === "string" && categories.includes(v.category) ? v.category : "",
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
  const categories: string[] = [];
  if (Array.isArray(v.categories)) {
    for (const c of v.categories) {
      if (!isText(c, CATEGORY_MAX) || !c.trim()) continue;
      if (categories.some((b) => b.toLowerCase() === c.toLowerCase())) continue;
      if (categories.length < CATEGORIES_MAX) categories.push(c);
    }
  }
  const deletedAccounts = asDeleted(v.deletedAccounts, accounts, ACCOUNT_MAX);
  const deletedCategories = asDeleted(v.deletedCategories, categories, CATEGORY_MAX);
  // #165: a line keeps a deleted name (earlier months' history); pickers still offer only the live lists.
  const knownAccounts = [...accounts, ...deletedAccounts.map((d) => d.name)];
  const knownCategories = [...categories, ...deletedCategories.map((d) => d.name)];
  const lines = (list: unknown): Line[] => {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    const out: Line[] = [];
    for (const item of list.slice(0, LINES_MAX)) {
      const line = asLine(item, knownAccounts, knownCategories);
      if (line && !seen.has(line.id)) {
        seen.add(line.id);
        out.push(line);
      }
    }
    return out;
  };
  const out: Expenses = { fixed: lines(v.fixed), variable: lines(v.variable), accounts, categories };
  if (deletedAccounts.length) out.deletedAccounts = deletedAccounts;
  if (deletedCategories.length) out.deletedCategories = deletedCategories;
  return out;
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** #165: the stored deleted names (valid, unique in any case, not also live), else none. */
function asDeleted(value: unknown, live: readonly string[], max: number): Deleted[] {
  if (!Array.isArray(value)) return [];
  const out: Deleted[] = [];
  for (const d of value) {
    if (!d || typeof d !== "object") continue;
    const { name, from } = d as Record<string, unknown>;
    if (!isText(name, max) || !name.trim() || typeof from !== "string" || !MONTH_KEY.test(from)) continue;
    const lower = name.toLowerCase();
    if (live.some((n) => n.toLowerCase() === lower) || out.some((n) => n.name.toLowerCase() === lower)) continue;
    if (out.length < 200) out.push({ name, from });
  }
  return out;
}

/** An old-direction rate inverted once (#102, Q27): 1 ÷ rate, ≤ 6 decimals, no trailing zeros; bad / empty kept. */
export function invertRate(text: string): string {
  const rate = parseRate(text);
  if (rate === null) return text;
  return String(Number((1 / rate).toFixed(6)));
}

type MigratableStorage = StorageLike & { removeItem?: (key: string) => void };

/**
 * #102: a v1 expenses value (old rate direction) becomes v2 with every valid rate inverted; v1 is then removed.
 * No-op when v2 already exists or there is no v1. Returns true when it converted.
 */
export function migrateExpenses(storage: MigratableStorage | null): boolean {
  try {
    const old = storage?.getItem(LEGACY_EXPENSES_KEY);
    if (!storage || !old) return false;
    if (storage.getItem(STORAGE_KEY)) {
      storage.removeItem?.(LEGACY_EXPENSES_KEY);
      return false;
    }
    const value = asExpenses(JSON.parse(old));
    const flip = (l: Line): Line => ({ ...l, rate: invertRate(l.rate) });
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...value,
        fixed: value.fixed.map(flip),
        variable: value.variable.map(flip),
      }),
    );
    storage.removeItem?.(LEGACY_EXPENSES_KEY);
    return true;
  } catch {
    return false;
  }
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

/** #113 (PF-61, PF-62): the confirmation before an item that removes data goes. */
export const deleteQuestion = (name: string): string => `Delete ${name}? This cannot be undone.`;
export const UNNAMED_EXPENSE = "this expense";
export const CATEGORY_EXISTS = "That category exists.";

/**
 * #113 (PF-63, PF-64): rename a category: same rules as adding (trimmed, ≤ 40 characters, `Name the category.`);
 * another category's name in any case is refused (`That category exists.`, no merge); a case-only change is fine.
 * Every line using it follows; totals do not change.
 */
export function renameCategory(
  expenses: Expenses,
  from: string,
  typed: string,
): { expenses: Expenses; name: string } | { error: string } {
  const name = typed.trim().slice(0, CATEGORY_MAX);
  if (!name) return { error: CATEGORY_ERROR };
  if (expenses.categories.some((c) => c !== from && c.toLowerCase() === name.toLowerCase()))
    return { error: CATEGORY_EXISTS };
  if ((expenses.deletedCategories ?? []).some((d) => d.name.toLowerCase() === name.toLowerCase()))
    return { error: NAME_DELETED };
  const swap = (l: Line): Line => (l.category === from ? { ...l, category: name } : l);
  return {
    name,
    expenses: {
      ...expenses,
      categories: expenses.categories.map((c) => (c === from ? name : c)),
      fixed: expenses.fixed.map(swap),
      variable: expenses.variable.map(swap),
    },
  };
}

// ---- #165 (spec section 35, CFO option A KEEP, PFD-01..PFD-14) ----

export type NameKind = "account" | "category";
/** #165 Q-Z1: the label of a deleted name wherever history shows it. */
export const DELETED_SUFFIX = " (deleted)";
/** #165: the buttons beside the filters (the existing `Rename` style). */
export const DELETE_CATEGORY = "Delete category";
export const DELETE_ACCOUNT = "Delete account";
export const deletedLabel = (name: string): string => `${name}${DELETED_SUFFIX}`;
/** #165 Q-Z2: the confirmation (replaces "This cannot be undone." for these deletes: history keeps the name). */
export const deleteNameQuestion = (name: string): string =>
  `Delete ${name}? This month and later months lose it; earlier months keep it, marked (deleted).`;

const deletedOf = (e: Expenses, kind: NameKind): Deleted[] =>
  (kind === "account" ? e.deletedAccounts : e.deletedCategories) ?? [];
const withDeleted = (e: Expenses, kind: NameKind, list: Deleted[]): Expenses => {
  const key = kind === "account" ? "deletedAccounts" : "deletedCategories";
  const next: Expenses = { ...e };
  if (list.length) next[key] = list;
  else delete next[key];
  return next;
};

/** True when `name` is a deleted (not live) account / category. */
export const isDeleted = (e: Expenses, kind: NameKind, name: string): boolean =>
  !!name && deletedOf(e, kind).some((d) => d.name === name);

/** #165: lines without `name` in the `kind` field (amounts untouched). */
export function stripName<T extends { fixed: Line[]; variable: Line[] }>(m: T, kind: NameKind, name: string): T {
  const off = (l: Line): Line => (l[kind] === name ? { ...l, [kind]: "" } : l);
  return { ...m, fixed: m.fixed.map(off), variable: m.variable.map(off) };
}

/**
 * #165 (PFD-01, PFD-02): delete a live account / category while `month` is shown: it leaves the live list, is kept as
 * deleted from `month` (a live name has no deleted entry: re-adding removed it, Q-Z4), and the shown lines lose it. Earlier months are applied on Save by `deleteInMonths` (only `month` and later).
 */
export function deleteName(e: Expenses, kind: NameKind, name: string, month: string): Expenses {
  const live = kind === "account" ? e.accounts : e.categories;
  if (!live.includes(name)) return e;
  const rest = live.filter((n) => n !== name);
  const base = stripName({ ...e, [kind === "account" ? "accounts" : "categories"]: rest }, kind, name);
  const list = deletedOf(e, kind).filter((d) => d.name.toLowerCase() !== name.toLowerCase());
  return withDeleted(base, kind, [...list, { name, from: month }]);
}

/**
 * #165 Q-Z4 (PFD-09): adding a name that was deleted (any case) re-links it: the deleted entry goes, the live name takes
 * the deleted spelling, so earlier months' lines show it plain again. Otherwise `e` is returned unchanged.
 */
export function relinkName(e: Expenses, kind: NameKind, added: string): { expenses: Expenses; name: string } {
  const hit = deletedOf(e, kind).find((d) => d.name.toLowerCase() === added.toLowerCase());
  if (!hit) return { expenses: e, name: added };
  const liveKey = kind === "account" ? "accounts" : "categories";
  const live = e[liveKey].map((n) => (n === added ? hit.name : n));
  const relinked = withDeleted({ ...e, [liveKey]: live }, kind, deletedOf(e, kind).filter((d) => d !== hit));
  return { expenses: relinked, name: hit.name };
}

/** #165 Q-Z6: renaming to a deleted name (any case) is refused with this text (re-add it instead to re-link). */
export const NAME_DELETED = "That name was deleted. Add it again to restore it.";
