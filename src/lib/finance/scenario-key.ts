/** #215 (personal-finance-spec 55, Q-SC1): the record name the saved scenario levers live under (no other module deps). */
export const SCENARIO_KEY = "orpheus.finance.scenario.v1";

/** Lever bounds: a percent change of a line or category; rates as percents. */
export const CHANGE_MIN = -100;
export const CHANGE_MAX = 1000;
export const RATE_MIN = 0;
export const RATE_MAX = 100;
export const GROWTH_MIN = -100;
export const GROWTH_MAX = 1000;

/** The stored levers. `rate` / `growth` / `start` null = use the record's own value. */
export type Scenario = {
  income: Record<string, number>;
  expenses: Record<string, number>;
  rate: number | null;
  growth: number | null;
  start: number | null;
};
export const NO_SCENARIO: Scenario = {
  income: {},
  expenses: {},
  rate: null,
  growth: null,
  start: null,
};

const finiteIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const LEVERS_MAX = 200;
const ID_MAX = 120;

/** A stored scenario, or null when the value is not one (the server refuses it; the page ignores it). */
export function asScenario(value: unknown): Scenario | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const changes = (m: unknown): Record<string, number> | null => {
    if (m === undefined) return {};
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    const out: Record<string, number> = {};
    const entries = Object.entries(m as Record<string, unknown>);
    if (entries.length > LEVERS_MAX) return null;
    for (const [k, n] of entries) {
      if (k.length > ID_MAX || !finiteIn(n, CHANGE_MIN, CHANGE_MAX)) return null;
      out[k] = n;
    }
    return out;
  };
  const opt = (n: unknown, lo: number, hi: number): number | null | undefined =>
    n === undefined || n === null ? null : finiteIn(n, lo, hi) ? n : undefined;
  const income = changes(v.income);
  const expenses = changes(v.expenses);
  const rate = opt(v.rate, RATE_MIN, RATE_MAX);
  const growth = opt(v.growth, GROWTH_MIN, GROWTH_MAX);
  const start = opt(v.start, -1e12, 1e12);
  if (!income || !expenses || rate === undefined || growth === undefined || start === undefined)
    return null;
  return { income, expenses, rate, growth, start };
}

/** The stored scenario in a record (absent or unreadable → null). */
export function readScenario(record: Record<string, string> | null): Scenario | null {
  const text = record?.[SCENARIO_KEY];
  if (typeof text !== "string") return null;
  try {
    return asScenario(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Whether a record's scenario value, when present, is storable (server check). */
export const scenarioValueOk = (record: Record<string, string>): boolean =>
  !(SCENARIO_KEY in record) || readScenario(record) !== null;
