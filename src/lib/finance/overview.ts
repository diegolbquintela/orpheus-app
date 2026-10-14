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
/** #126 (PF-85): the 3-month column. */
export const AVERAGE_3 = "3-month average";
/**
 * C7/C2 (approved 2026-10-13, PF-91+): the household's timezone. The 3-complete-month window is read from the
 * current date in this zone at render time (never hardcoded), so it rolls over on the 1st (Nov 1 → Aug–Oct).
 */
export const HOUSEHOLD_TIME_ZONE = "America/Toronto";
/** #126 (PF-79..PF-84): the equity coverage line. */
export const COVERAGE_LABEL = "Equity coverage";
export const COVERAGE_RATE_NOTE = "Set rate under Expenses";
export const COVERAGE_START_NOTE = "Set starting net assets";
/** #129 (PF-101): line 3 of the coverage block, in every state. */
export const COVERAGE_SOURCE_NOTE = "** Coverage rate is derived from Rate Used under Expenses section.";
/**
 * #129 line 2 (PF-105 / PF-106, CFO-confirmed Q-L1 / Q-L4; supersede the PF-100 / PF-103 wording):
 * Future off `* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul–Sep).`
 * Future on  `* 12.5% yearly, covers 0.50% of projected monthly expenses at horizon end (held at 12-month average).`
 * `rateText` is the Rate used as shown (`formatRate`).
 */
export const coverageRateNote = (rateText: string, share: number | null, future: boolean, window: MonthKey[]): string =>
  `* ${rateText} yearly, covers ${formatCoverageShare(share)} of ${
    future
      ? "projected monthly expenses at horizon end (held at 12-month average)"
      : `monthly expenses (3-month average, ${windowRange(window)})`
  }.`;

/** C7/C2 + PF-84 (PF-97): the dim basis label beside the coverage %. */
export const coverageBasis = (future: boolean, window: MonthKey[]): string =>
  future ? "basis: projection" : `basis: 3-mo avg (${windowRange(window)})`;
export const coverageLabel = (years: Years | null): string =>
  years === null ? `${COVERAGE_LABEL}:` : `${COVERAGE_LABEL} in ${yearsLabel(years)}:`;
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

/**
 * The 12 months, oldest → current. N1 (2026-10-13, PF-96): the current month is `householdMonth(now)` in the
 * household timezone, the same as the 3-month window, so a UTC server or a browser west of Toronto never shows next
 * month early (2026-10-31T20:30-04:00 is already Nov 1 in UTC but still October here).
 */
export function lastTwelve(now: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): MonthKey[] {
  const out: MonthKey[] = [householdMonth(now, timeZone)];
  while (out.length < 12) out.unshift(previousMonth(out[0]));
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

/** The household month (`yyyy-mm`) of an instant, read in `timeZone` (C7: an instant still Oct 31 in Toronto is October). */
export function householdMonth(today: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): MonthKey {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" }).formatToParts(today);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return monthKey(year, month - 1);
}

/** The month before `key`. */
export function previousMonth(key: MonthKey): MonthKey {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? monthKey(y - 1, 11) : monthKey(y, m - 2);
}

/**
 * C7 (approved 2026-10-13): the last 3 COMPLETE months, oldest first, excluding the current partial month of
 * `today` in the household timezone. Oct 13 2026 → 2026-07, 2026-08, 2026-09; Jan → Oct–Dec of the year before.
 */
export function completeMonths(today: Date, n: number, timeZone: string = HOUSEHOLD_TIME_ZONE): MonthKey[] {
  const out: MonthKey[] = [previousMonth(householdMonth(today, timeZone))];
  while (out.length < n) out.unshift(previousMonth(out[0]));
  return out;
}

export function completeMonths3(today: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): MonthKey[] {
  return completeMonths(today, 3, timeZone);
}

const MONTH_ABBR = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
/** `Jul–Sep` for a window. */
export const windowRange = (window: MonthKey[]): string =>
  `${MONTH_ABBR.format(toDate(window[0]))}\u2013${MONTH_ABBR.format(toDate(window[window.length - 1]))}`;
/** C7: `3-month average (Jul–Sep)`, on the column and the coverage line. */
export const average3Label = (window: MonthKey[]): string => `${AVERAGE_3} (${windowRange(window)})`;
/** #132 (PF-115..PF-117): `12-month average (Nov–Oct)` over `summary.months` (household month + 11 before), the 3-month style. */
export const average12Label = (months: MonthKey[]): string => `${AVERAGE} (${windowRange(months)})`;
/**
 * #141 Q-T1 (CFO-changed, PF-129..PF-131): all 12 complete months with data → the dated label
 * (`12-month average (Oct–Sep)`); fewer → the count replaces the range, `12-month average (8 of 12 months)`
 * (the CFO's example format); 0 → `12-month average (0 of 12 months)` with the figures `—` (Q-T3).
 */
export const average12CountLabel = (window12: MonthKey[], withData: number): string =>
  withData >= window12.length ? average12Label(window12) : `${AVERAGE} (${withData} of ${window12.length} months)`;

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
  lines?: Record<MonthKey, Figures>,
): Figures {
  const entry = overview.months[key];
  // #112 (decision 7): a month saved with lines uses its own figures; else its old typed totals; else none.
  if (lines) {
    const own = lines[key];
    if (own) return own;
    return { expenses: typedFigure(entry?.expenses), income: typedFigure(entry?.income) };
  }
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
  /**
   * C7 (approved 2026-10-13; was PF-86): the last 3 complete months (current partial month excluded), an empty
   * complete month taking the 12-month average (C8).
   */
  average3: Figures;
  /** C7: the 3 complete months behind `average3`, oldest first. */
  window3: MonthKey[];
  /** #140 (PF-121): the 12 complete months behind `average`, oldest first. */
  window12: MonthKey[];
  /** #141 Q-T1 / PF-132: how many of `window12` have an expenses figure (income-only months excluded). */
  window12WithData: number;
  points: Point[];
};

const minus = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a - b;
export const surplusOf = (f: Figures): number | null => minus(f.income, f.expenses);

/** Everything `04` shows (section 15.2). */
export function summarize(
  overview: Overview,
  now: Date,
  page: PageFigures,
  lines?: Record<MonthKey, Figures>,
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): Summary {
  const months = lastTwelve(now, timeZone);
  const current = months[months.length - 1];
  const figures = months.map((key) => monthFigures(overview, key, current, page, lines));
  // #140 (PF-121..PF-125): the 12-month average is over the last 12 COMPLETE household months (current month
  // excluded, as C7 for the 3-month); empty months are left out (Q-T2); none with a figure → null (Q-T3).
  const window12 = completeMonths(now, 12, timeZone);
  const figures12 = window12.map((key) => monthFigures(overview, key, current, page, lines));
  // #141 (CFO via EL, PF-132): a month has data only with expense entries; an income-only month is neither counted
  // nor averaged as $0 (its expenses are null, so the expense mean already leaves it out).
  const window12WithData = figures12.filter((f) => f.expenses !== null).length;
  const average: Figures = {
    expenses: mean(figures12.map((f) => f.expenses)),
    income: mean(figures12.map((f) => f.income)),
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
  // C7: the window comes from `now` in the household timezone, at render time; complete months only (C8 kept).
  const window3 = completeMonths3(now, timeZone);
  const last3 = window3.map((key) => monthFigures(overview, key, current, page, lines));
  const average3: Figures = {
    expenses: mean(last3.map((f) => f.expenses ?? average.expenses)),
    income: mean(last3.map((f) => f.income ?? average.income)),
  };
  return { months, current, thisMonth: figures[figures.length - 1], average, average3, window3, window12, window12WithData, points };
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

/** #126: the equity coverage line's figures (spec section 22.1). */
export type Coverage =
  | { status: "ok"; yearly: number; monthly: number; share: number | null }
  | { status: "no_rate" | "no_start" | "none" };

/**
 * Equity coverage (PF-80..PF-84): annual = net assets × (rate ÷ 100), monthly = annual ÷ 12, share = monthly ÷
 * expenses (null when expenses are missing or 0). `rate` is the #86 rate used (a percent, null when none).
 */
export function equityCoverage(netAssets: number | null, rate: number | null, expenses: number | null): Coverage {
  if (rate === null || !(rate > 0)) return { status: "no_rate" };
  if (netAssets === null || !(netAssets > 0)) return { status: "no_start" };
  const yearly = netAssets * (rate / 100);
  const monthly = yearly / 12;
  return { status: "ok", yearly, monthly, share: expenses !== null && expenses > 0 ? monthly / expenses : null };
}

/**
 * The coverage for the Overview: today's net assets against the 3-month average of complete months (C2, approved
 * 2026-10-13; was this month), or with Future on the projected net assets at the horizon end (PF-84, unchanged).
 */
export function overviewCoverage(overview: Overview, summary: Summary, rate: number | null): Coverage {
  if (!overview.future) {
    const start = typedFigure(overview.start);
    return equityCoverage(start, rate, summary.average3.expenses);
  }
  const c = equityCoverage(typedFigure(overview.start), rate, summary.average.expenses);
  if (c.status !== "ok") return c;
  // #129 Q-L4 (EL, option b): the share divides by the horizon-end point's own expenses (held at the 12-month
  // average by the projection today, so the figure is unchanged); a missing point is `none`, as before.
  const horizon = summary.points.at(-1);
  const projected = horizon?.net ?? null;
  return projected === null || projected <= 0 ? { status: "none" } : equityCoverage(projected, rate, horizon?.expenses ?? null);
}

/** `0.53%`: two decimals (Q-C3). */
export const formatCoverageShare = (share: number | null): string =>
  share === null ? "—" : `${(share * 100).toFixed(2)}%`;
