import { readHousehold } from "./currency.ts";
import { rateUsed, readRates } from "./equity.ts";
import { householdMonthlyOf, NO_CATEGORY } from "./expenses.ts";
import { incomeLines, monthly } from "./income.ts";
import { latestWithLines, readMonths } from "./months.ts";
import {
  equityCoverage,
  HOUSEHOLD_TIME_ZONE,
  householdMonth,
  type MonthKey,
  monthName,
  monthShort,
  nextMonth,
  readOverview,
  typedFigure,
} from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import {
  asScenario,
  CHANGE_MAX,
  CHANGE_MIN,
  GROWTH_MAX,
  GROWTH_MIN,
  NO_SCENARIO,
  RATE_MAX,
  RATE_MIN,
  readScenario,
  SCENARIO_KEY,
  type Scenario,
  scenarioValueOk,
} from "./scenario-key.ts";
import { seriesValues } from "./series.ts";

/**
 * #215 (personal-finance-spec section 55; AC PFSC): the destination analysis / scenario screen. A what-if layer over
 * the stored record: the person moves levers and every figure is recalculated on the spot, in the browser. Nothing is
 * written unless the person presses `Save scenario` (Q-SC1: the levers, and only the levers, are stored in the existing
 * record under `SCENARIO_KEY`; never a month, line or rate). Read users see it and cannot save.
 */
export {
  asScenario,
  CHANGE_MAX,
  CHANGE_MIN,
  GROWTH_MAX,
  GROWTH_MIN,
  NO_SCENARIO,
  RATE_MAX,
  RATE_MIN,
  readScenario,
  SCENARIO_KEY,
  scenarioValueOk,
};
export type { Scenario };
export const SCENARIO_PATH = "/personal-finance/scenario";
export const SCENARIO_TITLE = "Scenario.";
export const SCENARIO_LINK = "Scenario";
export const WHAT_IF_NOTE =
  "What-if only. Your saved months, lines and rates are never changed here.";
export const SAVE_SCENARIO = "Save scenario";
export const RESET = "Reset levers";
export const SAVED = "Scenario saved.";
export const NOT_SAVED = "Not saved.";
export const UNSAVED = "Unsaved changes";
export const READ_ONLY_NOTE = "Read only. You can try levers; saving needs Read and write.";
export const NO_BASELINE =
  "No month with lines yet. Add income and expenses on the Personal Finance page first.";
export const LOADING = "Loading…";
export const LOAD_ERROR = "Couldn't load your figures.";
export const LEVER_ERROR = "Enter a number from -100 to 1000.";
export const NO_VALUE = "—";

/** Horizons in months (Q-SC4): 12 months by default, then 3, 5 and 10 years. */
export const HORIZONS = [12, 36, 60, 120] as const;
export type Horizon = (typeof HORIZONS)[number];
export const DEFAULT_HORIZON: Horizon = 12;
export const horizonLabel = (h: Horizon): string => (h === 12 ? "12 months" : `${h / 12} years`);

/** Only the levers that move something (0 % changes and unset values are dropped), so equal scenarios compare equal. */
export function compact(s: Scenario): Scenario {
  const keep = (m: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(m)
        .filter(([, n]) => n !== 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  return {
    income: keep(s.income),
    expenses: keep(s.expenses),
    rate: s.rate,
    growth: s.growth,
    start: s.start,
  };
}
export const scenarioText = (s: Scenario): string => JSON.stringify(compact(s));

export type BaseLine = { id: string; label: string; monthly: number };
export type Baseline = {
  /** The month the lines come from (the latest month with lines up to this month), or null when there is none. */
  month: MonthKey | null;
  current: MonthKey;
  currency: string;
  income: BaseLine[];
  /** Expenses by category, both groups together (Q-SC2). `""` = lines without a category. */
  categories: BaseLine[];
  rate: number | null;
  growth: number;
  /** Net assets at the end of this month (the series value), else Starting net assets as typed, else 0. */
  start: number;
};

/** Today's figures the levers move. Read-only. */
export function baselineOf(
  record: PfRecord | null,
  now: Date,
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): Baseline {
  const s = new RecordStore(record ?? {});
  const household = readHousehold(s).household;
  const current = householdMonth(now, timeZone);
  const months = readMonths(s);
  const month = latestWithLines(months, current);
  const overview = readOverview(s);
  const m = month ? months[month] : undefined;
  const income: BaseLine[] = m
    ? incomeLines(m.people, household)
        .filter((l) => l.counted && l.yearly !== null && l.yearly !== 0)
        .map((l) => ({ id: l.id, label: l.label, monthly: monthly(l.yearly as number) }))
    : [];
  const byCat = new Map<string, number>();
  for (const l of m ? [...m.fixed, ...m.variable] : []) {
    const v = householdMonthlyOf(l, household);
    if (v === null) continue;
    const k = l.category.trim();
    byCat.set(k, (byCat.get(k) ?? 0) + v);
  }
  const categories = [...byCat]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([id, v]) => ({ id, label: id || NO_CATEGORY, monthly: v }));
  let start = typedFigure(overview.start) ?? 0;
  if (month) {
    const net = seriesValues(
      { series: [{ kind: "metric", id: "net-assets" }], range: { from: current, to: current } },
      record,
      now,
      timeZone,
    ).series[0]?.values[0];
    if (typeof net === "number" && Number.isFinite(net)) start = net;
  }
  return {
    month,
    current,
    currency: household,
    income,
    categories,
    rate: rateUsed(readRates(s)),
    growth: typedFigure(overview.growth) ?? 0,
    start,
  };
}

export type ProjPoint = {
  key: MonthKey;
  label: string;
  income: number;
  expenses: number;
  surplus: number;
  net: number;
};
export type Totals = {
  /** Per month (constant over the horizon: the levers are flat changes, Q-SC3). */
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  /** Sums over the horizon. */
  income: number;
  expenses: number;
  surplus: number;
  /** Net assets at the end of the horizon. */
  netEnd: number;
  /** Equity coverage at the horizon end (Rate used), null when there is no rate or no positive net assets. */
  coverageMonthly: number | null;
  coverageShare: number | null;
};
export type Projection = {
  points: ProjPoint[];
  totals: Totals;
  rate: number | null;
  growth: number;
  start: number;
};

const pct = (v: number, change: number | undefined) => v * (1 + (change ?? 0) / 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The projected path: from the month after this one, `horizon` months. Each month: income and expenses are today's
 * lines with their lever (a % change), surplus = income − expenses, and net assets compound monthly at
 * (1 + growth ÷ 100)^(1/12) then add the surplus (the Overview's Future rule, PF-84). CFO on Q-SC3 (2026-10-22): growth
 * only on a positive opening balance; at or below 0 the month grows 0 %. Pure; nothing is written.
 */
export function project(base: Baseline, levers: Scenario, horizon: Horizon | number): Projection {
  const income = base.income.reduce((t, l) => t + pct(l.monthly, levers.income[l.id]), 0);
  const expenses = base.categories.reduce((t, c) => t + pct(c.monthly, levers.expenses[c.id]), 0);
  const surplus = income - expenses;
  const rate = levers.rate ?? base.rate;
  const growth = levers.growth ?? base.growth;
  const start = levers.start ?? base.start;
  const g = Math.pow(1 + growth / 100, 1 / 12);
  const points: ProjPoint[] = [];
  let key = base.current;
  let net = start;
  for (let i = 0; i < horizon; i++) {
    key = nextMonth(key);
    // CFO on Q-SC3 (2026-10-22, PFSC-31..33): growth applies to the month's OPENING balance only when it is above 0;
    // at or below 0 that month's growth is 0 %. The surplus or deficit is then added as before.
    net = (net > 0 ? net * g : net) + surplus;
    points.push({
      key,
      label: monthShort(key),
      income: round2(income),
      expenses: round2(expenses),
      surplus: round2(surplus),
      net: round2(net),
    });
  }
  const c = equityCoverage(net, rate, expenses);
  return {
    points,
    rate,
    growth,
    start,
    totals: {
      monthlyIncome: income,
      monthlyExpenses: expenses,
      monthlySurplus: surplus,
      income: income * horizon,
      expenses: expenses * horizon,
      surplus: surplus * horizon,
      netEnd: net,
      coverageMonthly: c.status === "ok" ? c.monthly : null,
      coverageShare: c.status === "ok" ? c.share : null,
    },
  };
}

export const pointName = (p: ProjPoint): string => monthName(p.key);

/** A typed lever: "" → 0 / unset; otherwise a number in bounds, else null (shown in red, left out). */
export function parseLever(text: string, lo: number, hi: number): number | null {
  const t = text.trim().replace(/,/g, "");
  if (t === "" || t === "-") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= lo && n <= hi ? n : null;
}

/** The record to PUT on `Save scenario`: the loaded record with only the scenario value replaced. */
export const withScenario = (record: PfRecord | null, s: Scenario): PfRecord => ({
  ...(record ?? {}),
  [SCENARIO_KEY]: scenarioText(s),
});
