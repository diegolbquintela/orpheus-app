import { type CurrencyCode, readHousehold } from "./currency.ts";
import { type Rates, rateUsed, readRates } from "./equity.ts";
import { asExpenses, type Expenses, grandTotals, type Line, readExpenses } from "./expenses.ts";
import { asIncome, monthly, netIncomeYearly, type Person, readIncome } from "./income.ts";
import { type Figures, type MonthKey } from "./overview.ts";

/**
 * #112 (spec section 19; design `attachments/pf-month-control-design.md`, EL option A): each month's own lines.
 * `{ "<yyyy-mm>": { fixed, variable, people } }`; the 24 newest months kept. Shared values (accounts, categories,
 * currency, rates, overview fields, view) stay in their own keys.
 */
export const MONTHS_KEY = "orpheus.finance.months.v1";
export const MONTHS_STORED = 24;
export const MONTH_CONTROL_LABEL = "Month";
export const DISCARD_CONFIRM = "Discard unsaved changes?";
export const copiedNote = (name: string): string => `Copied from ${name} — edit and save.`;

export type MonthLines = { fixed: Line[]; variable: Line[]; people: Person[] };
export type Months = Record<MonthKey, MonthLines>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const isKey = (k: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);

/** A month's lines checked against the shared accounts / categories (as the page reads them). */
function asLines(value: unknown, shared: Expenses): MonthLines {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const e = asExpenses({
    accounts: shared.accounts,
    categories: shared.categories,
    fixed: v.fixed,
    variable: v.variable,
  });
  return { fixed: e.fixed, variable: e.variable, people: asIncome({ people: v.people }).people };
}

export function readMonths(storage: StorageLike | null): Months {
  try {
    const text = storage?.getItem(MONTHS_KEY);
    if (!text) return {};
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const shared = readExpenses(storage);
    const out: Months = {};
    for (const k of Object.keys(raw).filter(isKey).sort().reverse().slice(0, MONTHS_STORED))
      out[k] = asLines((raw as Record<string, unknown>)[k], shared);
    return out;
  } catch {
    return {};
  }
}

export function writeMonths(storage: StorageLike | null, months: Months): void {
  const keys = Object.keys(months).sort().reverse().slice(0, MONTHS_STORED);
  const kept: Months = {};
  for (const k of keys.sort()) kept[k] = months[k];
  try {
    storage?.setItem(MONTHS_KEY, JSON.stringify(kept));
  } catch {
    // Storage full or blocked: the page keeps working for this visit.
  }
}

export const hasLines = (m: MonthLines | undefined): m is MonthLines =>
  !!m && m.fixed.length + m.variable.length + m.people.length > 0;

/** The most recent month with lines, or null. */
export function latestWithLines(months: Months, notAfter?: MonthKey): MonthKey | null {
  const keys = Object.keys(months)
    .filter((k) => hasLines(months[k]) && (!notAfter || k <= notAfter))
    .sort();
  return keys.length ? keys[keys.length - 1] : null;
}

/**
 * Decision 4: a record without the months value gives its lines to the current month (once). Returns true when it
 * wrote the months value (the caller saves it).
 */
export function migrateMonths(storage: StorageLike | null, current: MonthKey): boolean {
  if (!storage || storage.getItem(MONTHS_KEY)) return false;
  const e = readExpenses(storage);
  const lines: MonthLines = {
    fixed: e.fixed,
    variable: e.variable,
    people: readIncome(storage).people,
  };
  if (!hasLines(lines)) return false;
  writeMonths(storage, { [current]: lines });
  return true;
}

export type Opened = { lines: MonthLines; copiedFrom: MonthKey | null };

/**
 * The lines a month opens with (decisions 3–5): its own; else (when the person may write) a copy — of the current
 * month's saved lines for a past month, of the most recent month with lines for the current one; else none.
 */
export function openMonth(
  months: Months,
  key: MonthKey,
  current: MonthKey,
  canCopy: boolean,
): Opened {
  const own = months[key];
  if (own) return { lines: own, copiedFrom: null };
  const none: Opened = { lines: { fixed: [], variable: [], people: [] }, copiedFrom: null };
  if (!canCopy) return none;
  const source = key !== current && hasLines(months[current]) ? current : latestWithLines(months);
  if (!source || source === key) return none;
  return { lines: months[source], copiedFrom: source };
}

/** Decision 7: each saved month's figures from its lines (a figure above 0, else none). */
export function lineFigures(storage: StorageLike | null): Record<MonthKey, Figures> {
  return figuresOf(readMonths(storage), readExpenses(storage), rateUsed(readRates(storage)), readHousehold(storage).household);
}

/** What is on screen (#144): the shown month, its lines and the shared values, as Save would store them. */
export type Shown = {
  month: MonthKey;
  lines: MonthLines;
  expenses: Expenses;
  rates: Rates;
  household: CurrencyCode;
};

/**
 * #144 (Q-V1, PF-159..PF-161): each month's figures as `Save` would store them: the saved months with the shown
 * month's lines replaced by the on-screen ones, and the on-screen shared values, Rate used and household currency
 * applied to every month (Save writes those for every month). Nothing is written.
 */
export function liveLineFigures(storage: StorageLike | null, shown: Shown): Record<MonthKey, Figures> {
  const months = { ...readMonths(storage), [shown.month]: shown.lines };
  return figuresOf(months, shown.expenses, rateUsed(shown.rates), shown.household);
}

function figuresOf(months: Months, shared: Expenses, rate: number | null, household: CurrencyCode): Record<MonthKey, Figures> {
  const positive = (v: number | null): number | null => (v !== null && v > 0 ? v : null);
  const out: Record<MonthKey, Figures> = {};
  for (const [k, m] of Object.entries(months)) {
    if (!hasLines(m)) continue;
    const e: Expenses = { ...shared, fixed: m.fixed, variable: m.variable };
    out[k] = {
      expenses: positive(grandTotals(e, rate, household).monthly),
      income: positive(monthly(netIncomeYearly(m.people, household))),
    };
  }
  return out;
}

/** #113 (PF-65): category renames (in order) applied to every month's lines (categories are shared). */
export function renameInMonths(months: Months, renames: readonly [string, string][]): Months {
  if (!renames.length) return months;
  const name = (c: string) => renames.reduce((acc, [from, to]) => (acc === from ? to : acc), c);
  const out: Months = {};
  for (const [k, m] of Object.entries(months)) {
    const swap = (l: Line): Line => ({
      ...l,
      category: l.category ? name(l.category) : l.category,
    });
    out[k] = { ...m, fixed: m.fixed.map(swap), variable: m.variable.map(swap) };
  }
  return out;
}
