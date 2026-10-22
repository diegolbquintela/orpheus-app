import { readHousehold } from "./currency.ts";
import { rateUsed, readRates } from "./equity.ts";
import { householdMonthlyOf, type Line } from "./expenses.ts";
import { incomeLines, monthly } from "./income.ts";
import { FIRST_MONTH, hasLines, readMonths } from "./months.ts";
import { equityCoverage, formatCoverageShare, lastTwelve, type MonthKey, monthName, readOverview, typedFigure } from "./overview.ts";
import { formatMoney } from "./money.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import { seriesValues } from "./series.ts";

/**
 * #214 (personal-finance-spec section 53; AC PFHT): the read-only History table. The person picks a year first; the
 * grid then shows that year's STORED months only (a month with saved lines, or typed Overview totals), one row per month,
 * one column per stored figure. Nothing is written. Totals, net assets and FX are exactly the Charts series (#154)
 * without the historical BoC rates (Q-HT1): `seriesValues` with no FX table, i.e. the rates as typed, like the page.
 */
export const HISTORY_PATH = "/personal-finance/history";
export const HISTORY_TITLE = "History.";
export const HISTORY_LINK = "History";
export const YEAR_LABEL = "Year";
export const CHOOSE_YEAR = "Choose a year";
export const PICK_YEAR_NOTE = "Choose a year to see its stored months.";
export const NO_MONTHS = "No months stored yet.";
export const LOADING = "Loading…";
export const LOAD_ERROR = "Couldn't load your figures.";
export const READ_ONLY_NOTE = "Read-only. Change a month on the Personal Finance page.";
export const NO_VALUE = "—";
export const MONTH_COLUMN = "Month";
/** #214 CFO change on Q-HT6 (2026-10-21, PFHT-23): shared values are today's, not per-month. */
export const SHARED_VALUES_NOTE =
  "Rate used, household currency and starting net assets are today's values, not per-month values. Every month in this table uses them.";

export type ColumnKind = "income-line" | "expense-line" | "total" | "coverage";
export type Column = { id: string; label: string; kind: ColumnKind };
export type Row = { month: MonthKey; label: string; cells: string[] };
export type YearTable = { year: number; currency: string; columns: Column[]; rows: Row[] };

/** The fixed figure columns, after the line columns (Q-HT3: one total per stored figure on the page). */
export const TOTAL_COLUMNS: readonly Column[] = [
  { id: "income", label: "Income", kind: "total" },
  { id: "fixed", label: "Fixed expenses", kind: "total" },
  { id: "variable", label: "Variable expenses", kind: "total" },
  { id: "expenses", label: "Expenses", kind: "total" },
  { id: "surplus", label: "Surplus", kind: "total" },
  { id: "net-assets", label: "Net assets", kind: "total" },
  { id: "coverage", label: "Equity coverage (monthly)", kind: "coverage" },
  { id: "coverage-share", label: "Equity coverage (% of expenses)", kind: "coverage" },
];

const store = (record: PfRecord | null) => new RecordStore(record ?? {});
const money = (v: number | null): string => (v === null ? NO_VALUE : formatMoney(v));

/**
 * The stored months (lines or typed Overview totals), oldest first, from `FIRST_MONTH` on; #229 (spec 59.6, CFO Q-FM3):
 * with `through`, none after it (History shows months up to the current one; saved future months are plans).
 */
export function storedMonths(record: PfRecord | null, through?: MonthKey): MonthKey[] {
  const s = store(record);
  const months = readMonths(s);
  const overview = readOverview(s);
  const keys = new Set<MonthKey>(Object.keys(months).filter((k) => hasLines(months[k])));
  for (const [k, e] of Object.entries(overview.months))
    if (typedFigure(e?.expenses) !== null || typedFigure(e?.income) !== null) keys.add(k);
  return [...keys].filter((k) => /^\d{4}-(0[1-9]|1[0-2])$/.test(k) && k >= FIRST_MONTH && (!through || k <= through)).sort();
}

/** The Year select's choices: years with at least one stored month (up to `through`), newest first. */
export function storedYears(record: PfRecord | null, through?: MonthKey): number[] {
  return [...new Set(storedMonths(record, through).map((k) => Number(k.slice(0, 4))))].sort((a, b) => b - a);
}

/** One year's grid: only that year's stored months, oldest first. Display strings; nothing is written. */
export function yearTable(record: PfRecord | null, year: number, now: Date): YearTable {
  const s = store(record);
  const household = readHousehold(s).household;
  const months = storedMonths(record, lastTwelve(now)[11]).filter((k) => k.startsWith(`${year}-`));
  if (!months.length) return { year, currency: household, columns: [], rows: [] };
  const stored = readMonths(s);

  // Line columns: every line any of the year's months holds, by id, first seen order (income, then fixed, variable).
  const income = new Map<string, string>();
  const expense = new Map<string, string>();
  for (const k of months) {
    const m = stored[k];
    if (!m) continue;
    for (const l of incomeLines(m.people, household)) if (l.counted && !income.has(l.id)) income.set(l.id, l.label);
    for (const l of [...m.fixed, ...m.variable]) if (!expense.has(l.id)) expense.set(l.id, l.name.trim() || "Unnamed expense");
  }
  const columns: Column[] = [
    ...[...income].map(([id, label]) => ({ id: `income:${id}`, label, kind: "income-line" as const })),
    ...[...expense].map(([id, label]) => ({ id: `expense:${id}`, label, kind: "expense-line" as const })),
    ...TOTAL_COLUMNS,
  ];

  const result = seriesValues(
    {
      series: [
        { kind: "metric", id: "income" },
        { kind: "group", id: "fixed" },
        { kind: "group", id: "variable" },
        { kind: "metric", id: "expenses" },
        { kind: "metric", id: "surplus" },
        { kind: "metric", id: "net-assets" },
      ],
      range: { from: months[0], to: months[months.length - 1] },
    },
    record,
    now,
  );
  const at = (k: MonthKey) => result.months.indexOf(k);
  const value = (i: number, k: MonthKey): number | null => result.series[i].values[at(k)] ?? null;
  const rate = rateUsed(readRates(s));

  const rows = months.map((k): Row => {
    const m = stored[k];
    const lines = m ? incomeLines(m.people, household) : [];
    const byId = new Map<string, Line>(m ? [...m.fixed, ...m.variable].map((l) => [l.id, l]) : []);
    const cells: string[] = [];
    for (const id of income.keys()) {
      const l = lines.find((x) => x.id === id && x.counted);
      cells.push(l ? money(monthly(l.yearly)) : NO_VALUE);
    }
    for (const id of expense.keys()) {
      const l = byId.get(id);
      cells.push(l ? money(householdMonthlyOf(l, household)) : NO_VALUE);
    }
    const [inc, fixed, variable, exp, surplus, net] = [0, 1, 2, 3, 4, 5].map((i) => value(i, k));
    // Q-HT2: a month's coverage = that month's end net assets × Rate used ÷ 12, and ÷ that month's expenses.
    const c = equityCoverage(net, rate, exp);
    // CFO change on Q-HT2 (2026-10-21, PFHT-21): zero or missing expenses → the % cell is a dash, never a division.
    const share = c.status === "ok" && exp !== null && exp > 0 && c.share !== null ? formatCoverageShare(c.share) : NO_VALUE;
    cells.push(money(inc), money(fixed), money(variable), money(exp), money(surplus), money(net));
    cells.push(c.status === "ok" ? money(c.monthly) : NO_VALUE, share);
    return { month: k, label: monthName(k), cells };
  });
  return { year, currency: household, columns, rows };
}
