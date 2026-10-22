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
  /** #223 (spec 60, AC PFSS): the named saved scenarios, oldest first (absent = none). Same record value, same key. */
  saved?: SavedEntry[];
};

/**
 * #223: one named scenario. `inputs` are the projection's inputs as saved (compare uses them as is); `values` are the
 * screen's page value texts by record name and `lines` the shown month's lines (JSON), used to reopen it; `basis` is the
 * latest month it was seeded from. Never read by the main page.
 */
export type SavedEntry = {
  id: string;
  name: string;
  savedAt: string;
  basis: string;
  inputs: { start: number; income: number; expenses: number; growth: number; rate: number | null };
  values: Record<string, string>;
  lines: string;
};
/** #223 CFO Q-SS3 (built): at most 20 saved scenarios; Q-SS2: a name is 1 to 60 characters after trimming. */
export const SAVED_MAX = 20;
export const NAME_MAX = 60;
const VALUE_NAMES_MAX = 10;
const MONEY = 1e12;

/** The saved list, or null when it is not one (unique ids, unique names ignoring case, every field in shape). */
export function asSaved(value: unknown): SavedEntry[] | null {
  if (!Array.isArray(value) || value.length > SAVED_MAX) return null;
  const out: SavedEntry[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const e = item as Record<string, unknown>;
    const str = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max;
    if (!str(e.id, ID_MAX) || !str(e.savedAt, 40) || !(typeof e.basis === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.basis)))
      return null;
    if (typeof e.name !== "string" || e.name !== e.name.trim() || !str(e.name, NAME_MAX)) return null;
    const key = e.name.toLowerCase();
    if (ids.has(e.id as string) || names.has(key)) return null;
    ids.add(e.id as string);
    names.add(key);
    const i = e.inputs as Record<string, unknown> | null;
    if (!i || typeof i !== "object") return null;
    const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MONEY;
    if (!num(i.start) || !num(i.income) || !num(i.expenses) || !num(i.growth) || !(i.rate === null || num(i.rate))) return null;
    const v = e.values;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length > VALUE_NAMES_MAX || entries.some(([k, t]) => k.length > ID_MAX || typeof t !== "string")) return null;
    if (typeof e.lines !== "string") return null;
    out.push({
      id: e.id as string,
      name: e.name,
      savedAt: e.savedAt as string,
      basis: e.basis as string,
      inputs: { start: i.start as number, income: i.income as number, expenses: i.expenses as number, growth: i.growth as number, rate: i.rate as number | null },
      values: Object.fromEntries(entries) as Record<string, string>,
      lines: e.lines,
    });
  }
  return out;
}
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
  if (v.saved === undefined) return { income, expenses, rate, growth, start };
  // #223: the saved list rides in the same value; an unreadable list makes the whole value unreadable (server 400).
  const saved = asSaved(v.saved);
  return saved ? { income, expenses, rate, growth, start, saved } : null;
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
