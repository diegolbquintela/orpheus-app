import { rateUsed, readRates } from "./equity.ts";
import { savedOverviewFigures } from "./months.ts";
import { parseAmount } from "./expenses.ts";
import {
  equityCoverage,
  type Figures,
  HOUSEHOLD_TIME_ZONE,
  householdMonth,
  type MonthKey,
  monthName,
  monthShort,
  nextMonth,
  type Overview,
  readOverview,
  summarize,
  typedFigure,
} from "./overview.ts";
import { projectNet } from "./projection.ts";
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

/**
 * #215 (personal-finance-spec 55) / #221 (spec 57, AC PFPJ): the scenario screen. Since #221 it is the Personal Finance
 * page itself (Income through Overview, categories removed), prefilled from the saved record (the current month, or its
 * unsaved copy of last month, #199), whose edits are what-ifs that are never sent; below it the projection and totals.
 * Nothing on the screen is ever written (CFO scope cut 2026-10-22: net assets is a local starting value too). The
 * stored-scenario value (#215 Q-SC1) and its route handling are unchanged (Q-PJ7).
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
export const WHAT_IF_NOTE = "What-if only. Nothing on this screen is ever saved.";
export const BASED_ON_LAST_MONTH = "Based on last month";
export const LOAD_ERROR = "Couldn't load your figures.";
export const NET_ASSETS_ERROR = "Enter an amount, for example 25,000 or -1,500.50.";
export const GROWTH_ERROR = "Growth must be from -50 to 50 % a year here.";
export const GROWTH_BOUND = 50;
export const NO_DATA = "No figures yet. Add income and expenses on the Personal Finance page; the projection starts from them.";
export const NOW_LABEL = "Now";

/** Horizons in months (Q-SC4): 12 months by default, then 3, 5 and 10 years. */
export const HORIZONS = [12, 36, 60, 120] as const;
export type Horizon = (typeof HORIZONS)[number];
export const DEFAULT_HORIZON: Horizon = 12;
export const horizonLabel = (h: Horizon): string => (h === 12 ? "12 months" : `${h / 12} years`);

export const NOTHING_SAVED = "Nothing saved yet: every figure starts at 0.";
/** The basis note: last month's copy (#199), this month's saved lines, or nothing saved (F2). */
export const basisNote = (copiedFrom: MonthKey | null, current: MonthKey, saved = true): string =>
  copiedFrom
    ? `${BASED_ON_LAST_MONTH} (${monthName(copiedFrom)}).`
    : saved
      ? `Based on this month's saved figures (${monthName(current)}).`
      : NOTHING_SAVED;


export type Inputs = {
  current: MonthKey;
  /** Month 0: net assets at the end of the current month (Overview's own value), or the typed one. */
  start: number;
  /** A month: Overview's own income and expenses for the current month (Q-PJ1: latest month, not an average). */
  income: number;
  expenses: number;
  /** Growth, % a year. */
  growth: number;
  rate: number | null;
};

/**
 * The current month as the Overview shows it (`summarize`: the month's own figures, the unsaved copy, typed totals,
 * else the average, #166 / #199): its income, expenses and end-of-month net assets. Null net = no net assets shown.
 */
export function overviewNow(
  overview: Overview,
  now: Date,
  page: Figures,
  lines: Record<MonthKey, Figures> | undefined,
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): { current: MonthKey; income: number; expenses: number; net: number | null } {
  const s = summarize({ ...overview, future: false }, now, page, lines, timeZone);
  const p = s.points.find((x) => x.key === s.current);
  return { current: s.current, income: p?.income ?? 0, expenses: p?.expenses ?? 0, net: p?.net ?? null };
}

/** The saved record's inputs (the "Today" column and the net-assets field's saved value X). */
export function savedInputs(record: PfRecord | null, now: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): Inputs {
  const s = new RecordStore(record ?? {});
  const current = householdMonth(now, timeZone);
  const overview = readOverview(s);
  const o = overviewNow(overview, now, { expenses: null, income: null }, savedOverviewFigures(s, current), timeZone);
  return {
    current,
    start: o.net ?? 0,
    income: o.income,
    expenses: o.expenses,
    growth: typedFigure(overview.growth) ?? 0,
    rate: rateUsed(readRates(s)),
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
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  /** Sums over the horizon's months (month 0 not counted: it is now). */
  income: number;
  expenses: number;
  surplus: number;
  /** Net assets at the end of the horizon. */
  netEnd: number;
  /** netEnd − start − surplus: what growth added (Q-PJ4). */
  growthEarned: number;
  coverageMonthly: number | null;
  coverageShare: number | null;
};
export type Projection = { points: ProjPoint[]; totals: Totals; start: number; growth: number; rate: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The projected path: month 0 = `start` (now, the end of the current month), plotted once, then `horizon` months, each
 * the shared step (`projection.ts`: r_m = (1+annual)^(1/12) − 1; growth only on a positive opening balance, Q-SC3;
 * then the month's surplus). `horizon + 1` points. Pure; nothing is written.
 */
export function project(inp: Inputs, horizon: Horizon | number): Projection {
  const surplus = inp.income - inp.expenses;
  const nets = projectNet(inp.start, surplus, inp.growth, horizon);
  let key = inp.current;
  const points: ProjPoint[] = nets.map((net, i) => {
    if (i > 0) key = nextMonth(key);
    return {
      key,
      label: i === 0 ? NOW_LABEL : monthShort(key),
      income: round2(inp.income),
      expenses: round2(inp.expenses),
      surplus: round2(surplus),
      net: round2(net),
    };
  });
  const netEnd = nets[nets.length - 1];
  const c = equityCoverage(netEnd, inp.rate, inp.expenses);
  return {
    points,
    start: inp.start,
    growth: inp.growth,
    rate: inp.rate,
    totals: {
      monthlyIncome: inp.income,
      monthlyExpenses: inp.expenses,
      monthlySurplus: surplus,
      income: inp.income * horizon,
      expenses: inp.expenses * horizon,
      surplus: surplus * horizon,
      netEnd,
      growthEarned: netEnd - inp.start - surplus * horizon,
      coverageMonthly: c.status === "ok" ? c.monthly : null,
      coverageShare: c.status === "ok" ? c.share : null,
    },
  };
}

export const pointName = (p: ProjPoint, i: number): string => (i === 0 ? `${NOW_LABEL} (end of ${monthName(p.key)})` : monthName(p.key));

/**
 * #221 AN8 / AN12 / AN6: the scenario's LOCAL net-assets field. A sign (`+`, `-`, U+2212 `−`) then the main page's own
 * amount parser (`parseAmount`: thousands commas and spaces, `.5`, `5.`; `1e3` refused). Empty → null. The main page's
 * `parseAmount` and the record route's validation are unchanged (negative amounts stay parked there).
 */
export function parseNetAssets(text: string): number | null {
  const t = text.trim().replace(/^\$/, "");
  const m = /^([+\-\u2212]?)\s*\$?(.*)$/.exec(t);
  if (!m || m[2].trim() === "") return null;
  const v = parseAmount(m[2]);
  if (v === null) return null;
  return m[1] === "-" || m[1] === "\u2212" ? -v : v;
}

/** AN11: a share as a percent with thousands separators (123.4567 → "12,345.67%"); null → "—". */
const PCT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatPercent = (share: number | null): string => (share === null ? "—" : `${PCT.format(share * 100)}%`);

/** AN9: the scenario's growth bound, -50..+50 % a year. */
export const growthOk = (g: number): boolean => Number.isFinite(g) && g >= -GROWTH_BOUND && g <= GROWTH_BOUND;

// #215 (spec 55, Q-SC1): the stored-scenario save helpers, unchanged (scenario-client.ts `saveScenario`; Q-PJ7).
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

/** The record to PUT on `Save scenario`: the loaded record with only the scenario value replaced. */
export const withScenario = (record: PfRecord | null, s: Scenario): PfRecord => ({
  ...(record ?? {}),
  [SCENARIO_KEY]: scenarioText(s),
});
