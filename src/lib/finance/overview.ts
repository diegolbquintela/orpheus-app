import { parseAmount } from "./expenses.ts";

/**
 * Overview and Update (#94; spec `attachments/personal-finance-spec.md` section 15, PF-26..32). Simplest reading
 * (Q17–Q23 open for EL): a month's figure is the value typed for it in `05` Update, else (current month only) the
 * page's own monthly figure when above 0, else the month is empty; the 12-month average is the mean of the months
 * with a figure and empty months use it; net assets start at the typed `Starting net assets` and add each month's
 * surplus; under Future they compound monthly at (1 + growth ÷ 100)^(1/12) and add the average surplus.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const OVERVIEW_KEY = "orpheus.finance.overview.v1";
export const OVERVIEW_TITLE = "Overview";
export const UPDATE_TITLE = "Update";
export const THIS_MONTH = "This month";
export const AVERAGE = "12-month average";
export const EXPENSES = "Expenses";
export const INCOME = "Income";
export const SURPLUS = "Surplus";
export const NET_ASSETS = "Net assets";
export const START_LABEL = "Starting net assets";
export const GROWTH_LABEL = "Growth rate (%)";
export const FUTURE_LABEL = "Future";
export const MONTH_LABEL = "Month";
/** #105 (PF-43): the Update panel. */
export const UPDATE_MONTH = "Update month";
export const SAVE = "Save";
export const CANCEL = "Cancel";
export const CHART_CAPTION = "Expenses, income and net assets by month";
export const YEARS = [1, 5, 10, 15] as const;
export type Years = (typeof YEARS)[number];
export const yearsLabel = (years: Years): string => `${years} ${years === 1 ? "year" : "years"}`;

export const MONTHS_KEPT = 60;
const TEXT_MAX = 40;

/** A month key, `yyyy-mm`. */
export type MonthKey = string;
export type MonthEntry = { expenses: string; income: string };
export type Overview = {
  start: string;
  growth: string;
  future: boolean;
  years: Years;
  months: Record<MonthKey, MonthEntry>;
};
export const NO_OVERVIEW: Overview = { start: "", growth: "", future: false, years: 1, months: {} };

const pad = (n: number): string => String(n).padStart(2, "0");
export const monthKey = (year: number, month0: number): MonthKey => `${year}-${pad(month0 + 1)}`;

/** The 12 months, oldest → current, for a local date. */
export function lastTwelve(now: Date): MonthKey[] {
  const out: MonthKey[] = [];
  for (let back = 11; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    out.push(monthKey(d.getFullYear(), d.getMonth()));
  }
  return out;
}

const MONTH_NAME = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const toDate = (key: MonthKey): Date => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};
/** `October 2026`. */
export const monthName = (key: MonthKey): string => MONTH_NAME.format(toDate(key));
/** `Oct 26` (chart ticks). */
export const monthShort = (key: MonthKey): string => MONTH_SHORT.format(toDate(key));

/** The month after `key`. */
export function nextMonth(key: MonthKey): MonthKey {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? monthKey(y + 1, 0) : monthKey(y, m);
}

/** A typed value as a figure: a valid number (section 5 reading), else null (empty or the field check). */
export function typedFigure(text: string | undefined): number | null {
  if (!text || !text.trim()) return null;
  return parseAmount(text);
}

/** A typed rate / start: empty 0; bad → null (the check; counts as 0). */
export const orZero = (text: string): number => parseAmount(text) ?? 0;

export type Figures = { expenses: number | null; income: number | null };
export type PageFigures = { expenses: number | null; income: number | null };

/** A month's figures (Q17): typed, else the page's for the current month when above 0, else null (empty). */
export function monthFigures(
  overview: Overview,
  key: MonthKey,
  current: MonthKey,
  page: PageFigures,
): Figures {
  const entry = overview.months[key];
  const fallback = (value: number | null): number | null =>
    key === current && value !== null && value > 0 ? value : null;
  return {
    expenses: typedFigure(entry?.expenses) ?? fallback(page.expenses),
    income: typedFigure(entry?.income) ?? fallback(page.income),
  };
}

const mean = (values: (number | null)[]): number | null => {
  const have = values.filter((v): v is number => v !== null);
  return have.length ? have.reduce((a, b) => a + b, 0) / have.length : null;
};

export type Point = {
  key: MonthKey;
  label: string;
  expenses: number | null;
  income: number | null;
  net: number | null;
  future: boolean;
};

export type Summary = {
  months: MonthKey[];
  current: MonthKey;
  thisMonth: Figures;
  average: Figures;
  points: Point[];
};

const minus = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a - b;
export const surplusOf = (f: Figures): number | null => minus(f.income, f.expenses);

/** Everything `04` shows (section 15.2). */
export function summarize(overview: Overview, now: Date, page: PageFigures): Summary {
  const months = lastTwelve(now);
  const current = months[months.length - 1];
  const figures = months.map((key) => monthFigures(overview, key, current, page));
  const average: Figures = {
    expenses: mean(figures.map((f) => f.expenses)),
    income: mean(figures.map((f) => f.income)),
  };
  let net: number | null = orZero(overview.start);
  const points: Point[] = months.map((key, i) => {
    const expenses = figures[i].expenses ?? average.expenses;
    const income = figures[i].income ?? average.income;
    net = net === null ? null : plus(net, minus(income, expenses));
    return { key, label: monthShort(key), expenses, income, net, future: false };
  });
  if (overview.future) {
    const growth = Math.pow(1 + orZero(overview.growth) / 100, 1 / 12);
    const avgSurplus = surplusOf(average);
    let key = current;
    for (let i = 0; i < overview.years * 12; i++) {
      key = nextMonth(key);
      net = net === null || avgSurplus === null ? null : net * growth + avgSurplus;
      points.push({
        key,
        label: monthShort(key),
        expenses: average.expenses,
        income: average.income,
        net,
        future: true,
      });
    }
  }
  return { months, current, thisMonth: figures[figures.length - 1], average, points };
}

const plus = (a: number, b: number | null): number | null => (b === null ? null : a + b);

/** Set one month's field; a month with both fields empty is dropped. */
export function setMonth(overview: Overview, key: MonthKey, patch: Partial<MonthEntry>): Overview {
  const entry = { ...(overview.months[key] ?? { expenses: "", income: "" }), ...patch };
  const months = { ...overview.months };
  if (!entry.expenses && !entry.income) delete months[key];
  else months[key] = entry;
  return { ...overview, months };
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length <= TEXT_MAX;
const isKey = (k: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(k);

/** A stored value back into the overview, or all empty when it isn't one (never throws). */
export function asOverview(value: unknown): Overview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return NO_OVERVIEW;
  const v = value as Record<string, unknown>;
  const months: Record<MonthKey, MonthEntry> = {};
  if (v.months && typeof v.months === "object" && !Array.isArray(v.months)) {
    const keys = Object.keys(v.months as object)
      .filter(isKey)
      .sort()
      .reverse()
      .slice(0, MONTHS_KEPT);
    for (const k of keys) {
      const e = (v.months as Record<string, unknown>)[k];
      if (!e || typeof e !== "object") continue;
      const { expenses, income } = e as Record<string, unknown>;
      const entry = {
        expenses: isText(expenses) ? expenses : "",
        income: isText(income) ? income : "",
      };
      if (entry.expenses || entry.income) months[k] = entry;
    }
  }
  return {
    start: isText(v.start) ? v.start : "",
    growth: isText(v.growth) ? v.growth : "",
    future: v.future === true,
    years: (YEARS as readonly unknown[]).includes(v.years) ? (v.years as Years) : 1,
    months,
  };
}

export function readOverview(storage: StorageLike | null): Overview {
  try {
    const text = storage?.getItem(OVERVIEW_KEY);
    return text ? asOverview(JSON.parse(text)) : NO_OVERVIEW;
  } catch {
    return NO_OVERVIEW;
  }
}

export function writeOverview(storage: StorageLike | null, overview: Overview): void {
  try {
    storage?.setItem(OVERVIEW_KEY, JSON.stringify(overview));
  } catch {
    // Storage full or blocked: the page keeps working for this visit.
  }
}
