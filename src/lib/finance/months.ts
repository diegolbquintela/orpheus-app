import { type CurrencyCode, readHousehold } from "./currency.ts";
import { type Rates, rateUsed, readRates } from "./equity.ts";
import { asExpenses, type Expenses, grandTotals, type Line, type NameKind, readExpenses, stripName } from "./expenses.ts";
import { asIncome, monthly, netIncomeYearly, type Person, readIncome } from "./income.ts";
import { type Figures, type MonthKey } from "./overview.ts";

/**
 * #112 (spec section 19; design `attachments/pf-month-control-design.md`, EL option A): each month's own lines.
 * `{ "<yyyy-mm>": { fixed, variable, people } }`; #163: every month from `FIRST_MONTH` kept (was the 24 newest). Shared values (accounts, categories,
 * currency, rates, overview fields, view) stay in their own keys.
 */
export const MONTHS_KEY = "orpheus.finance.months.v1";
/** #163 (spec section 34, Q-Y5): the oldest month kept and offered; no count limit (the record's 1 MB limit stays). */
export const FIRST_MONTH = "2020-01";
export const FIRST_YEAR = 2020;
export const MONTH_CONTROL_LABEL = "Month";
export const YEAR_CONTROL_LABEL = "Year";
/** #163 Q-Y7: the Month select's options, as in the ticket. */
export const MONTH_OPTIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const DISCARD_CONFIRM = "Discard unsaved changes?";
export const copiedNote = (name: string): string => `Copied from ${name} — edit and save.`;

export type MonthLines = { fixed: Line[]; variable: Line[]; people: Person[] };
export type Months = Record<MonthKey, MonthLines>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const isKey = (k: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
const keptKey = (k: string): boolean => isKey(k) && k >= FIRST_MONTH;

/** #163 Q-Y2: the Year select's years, the current month's year down to `FIRST_YEAR`. */
export function yearChoices(current: MonthKey): number[] {
  const out: number[] = [];
  for (let y = Number(current.slice(0, 4)); y >= FIRST_YEAR; y--) out.push(y);
  return out;
}

/** #163 Q-Y1: the month a Year / Month choice opens; a future month (or one before `FIRST_MONTH`) gives the nearest allowed. */
export function chosenMonth(year: number | string, month: number | string, current: MonthKey): MonthKey {
  const key = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  if (!isKey(key) || key > current) return current;
  return key < FIRST_MONTH ? FIRST_MONTH : key;
}

/** A month's lines checked against the shared accounts / categories (as the page reads them). */
function asLines(value: unknown, shared: Expenses): MonthLines {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const e = asExpenses({
    accounts: shared.accounts,
    categories: shared.categories,
    // #165: earlier months keep deleted names on their lines.
    deletedAccounts: shared.deletedAccounts,
    deletedCategories: shared.deletedCategories,
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
    for (const k of Object.keys(raw).filter(keptKey).sort().reverse())
      out[k] = asLines((raw as Record<string, unknown>)[k], shared);
    return out;
  } catch {
    return {};
  }
}

export function writeMonths(storage: StorageLike | null, months: Months): void {
  const keys = Object.keys(months).filter(keptKey);
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
 * The lines a month opens with (decisions 3–5): its own; else, for the current month only, a copy of the most recent
 * month with lines; else none. #163 (Q-Y6 rejected): an empty past month opens blank (see `copyOfCurrent`).
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
  // #163 (CFO rejected Q-Y6, PFM-15): an empty PAST month opens blank; copying is the explicit
  // `Copy from current month` (copyOfCurrent). The empty current month keeps decision 5 (PF-56).
  if (!canCopy || key !== current) return none;
  const source = latestWithLines(months);
  if (!source || source === key) return none;
  return { lines: months[source], copiedFrom: source };
}

/** #163 PFM-16: what `Copy from current month` puts in an empty past month: the current month's saved lines, or null. */
export function copyOfCurrent(months: Months, current: MonthKey): MonthLines | null {
  return hasLines(months[current]) ? months[current] : null;
}

export const COPY_FROM_CURRENT = "Copy from current month";

/** Decision 7: each saved month's figures from its lines (a figure above 0, else none). */
export function lineFigures(storage: StorageLike | null, current?: MonthKey): Record<MonthKey, Figures> {
  const shared = readExpenses(storage);
  const months = readMonths(storage);
  return figuresOf(current ? withCurrentCopy(months, shared, current) : months, shared, rateUsed(readRates(storage)), readHousehold(storage).household);
}

/**
 * #166 (CFO Q-AN1, spec 49.5): while the current month has no stored lines, Overview counts it as the copy the page would
 * open (`openMonth`, decision 5), minus names deleted on or before it (#165 Q-Z7). Display only: nothing is written.
 * Without `current` (the server's /series, Q-AN4) the stored months are used unchanged.
 */
/**
 * #166 V2 (EL / CFO): when the current month has typed Update totals and no STORED lines, its unsaved on-screen lines
 * (the copy, edited or not) don't count, so the typed totals win. `typedCurrent` null → `figures` unchanged.
 */
export function dropUnsavedCurrent(figures: Record<MonthKey, Figures>, storage: StorageLike | null, typedCurrent: MonthKey | null | undefined): Record<MonthKey, Figures> {
  if (!typedCurrent || hasLines(readMonths(storage)[typedCurrent]) || !(typedCurrent in figures)) return figures;
  const out = { ...figures };
  delete out[typedCurrent];
  return out;
}

export function withCurrentCopy(months: Months, shared: Expenses, current: MonthKey): Months {
  if (hasLines(months[current])) return months;
  const opened = openMonth(months, current, current, true);
  if (!opened.copiedFrom) return months;
  return { ...months, [current]: withoutDeletedFor(opened.lines, shared, current) };
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
export function liveLineFigures(storage: StorageLike | null, shown: Shown, current?: MonthKey): Record<MonthKey, Figures> {
  const months = { ...readMonths(storage), [shown.month]: shown.lines };
  return figuresOf(current ? withCurrentCopy(months, shown.expenses, current) : months, shown.expenses, rateUsed(shown.rates), shown.household);
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

/** #165: a delete made on the shown month, applied on Save. */
export type PendingDelete = { kind: NameKind; name: string; from: MonthKey };

/**
 * #165 (PFD-01..PFD-03, CFO condition 1): each delete strips its name from `from` and every LATER stored month only;
 * a month before `from` is returned as the very same object (never rewritten). Amounts are untouched (condition 3).
 */
export function deleteInMonths(months: Months, deletes: readonly PendingDelete[]): Months {
  if (!deletes.length) return months;
  const out: Months = {};
  for (const [k, m] of Object.entries(months)) {
    let next = m;
    for (const d of deletes) if (k >= d.from) next = stripName(next, d.kind, d.name);
    out[k] = next;
  }
  return out;
}

/**
 * #165 Q-Z7 (PFD-08): a copy (decision 5, or `Copy from current month`) into `key` drops names deleted on or before
 * `key`, so a deleted name never reaches a month at or after its delete.
 */
export function withoutDeletedFor(lines: MonthLines, shared: Expenses, key: MonthKey): MonthLines {
  let out = lines;
  for (const d of shared.deletedAccounts ?? []) if (key >= d.from) out = stripName(out, "account", d.name);
  for (const d of shared.deletedCategories ?? []) if (key >= d.from) out = stripName(out, "category", d.name);
  return out;
}
