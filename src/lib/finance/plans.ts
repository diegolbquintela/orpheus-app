import { type CurrencyCode, DEFAULT_HOUSEHOLD, readHousehold } from "./currency.ts";
import { householdMonthlyOf, type Line } from "./expenses.ts";
import { incomeLines, monthly, netIncomeYearly } from "./income.ts";
import { hasLines, isFuture, type MonthLines, type Months, readMonths } from "./months.ts";
import type { MonthKey } from "./overview.ts";

/**
 * #231 (personal-finance-spec §65, AC PFPV; FM6, CFO Q1..Q5): planned vs actual.
 * `orpheus.finance.plans.v1` = `{ "<yyyy-mm>": { lines: { fixed, variable, people }, capturedAt } }`: a month's lines as
 * last saved while it was still a FUTURE month. The plan freezes when the month starts (Q1): the page writes plans for
 * future months only, and the server (`mergePlansText`, in `writeRecord`) keeps the stored plan of every current or past
 * month whatever the body says, keeps stored plans the body leaves out (an older tab), and never clears one (Q5).
 */
import { monthErrors } from "./field-errors.ts";
import { PLANS_KEY } from "./plans-key.ts";
import { type Plan, rawPlans, readPlans } from "./plans-read.ts";
export { PLANS_KEY, readPlans };
export type { Plan, Plans } from "./plans-read.ts";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * #231 (spec 65.3, PFPV-01..06): the server's plans after a record save. Stored plans are the base; an incoming plan
 * replaces a stored one only for a month AFTER `current` (server clock, household month); a current or past month keeps
 * what is stored (incoming ignored, even when nothing is stored). Absent / unreadable incoming keeps everything stored.
 * Nothing is ever removed. Returns the text to store, or undefined when there is nothing to store.
 */
export function mergePlansText(stored: string | undefined, incoming: string | undefined, current: MonthKey): string | undefined {
  const base = rawPlans(stored) ?? {};
  const next: Record<string, unknown> = { ...base };
  for (const [k, p] of Object.entries(rawPlans(incoming) ?? {})) if (k > current) next[k] = p;
  const keys = Object.keys(next).sort();
  if (!keys.length) return stored === undefined ? undefined : stored;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = next[k];
  return JSON.stringify(out);
}

const sameLines = (a: MonthLines, b: MonthLines): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * #231 Q1 + backfill (spec 65.2): every FUTURE month with saved lines gets its plan = those lines. `onlyMissing` (the
 * first-load backfill) adds absent plans only. A month emptied or not stored keeps its plan (Q5). Current / past months
 * are never written. Returns true when the plans value changed (the caller saves).
 */
export function syncFuturePlans(storage: StorageLike | null, months: Months, current: MonthKey, at: Date, onlyMissing = false): boolean {
  if (!storage) return false;
  const plans = readPlans(storage);
  const household = readHousehold(storage).household;
  let changed = false;
  for (const k of Object.keys(months).sort()) {
    const m = months[k];
    if (!isFuture(k, current) || !hasLines(m)) continue;
    // #231 PV1 (spec 65.7, PFPV-29/30): a month that fails the page's field checks (blank FX rate included) gets no plan.
    if (monthErrors(m, household).length) continue;
    const have = plans[k];
    if (have && (onlyMissing || sameLines(have.lines, m))) continue;
    plans[k] = { lines: m, capturedAt: at.toISOString() };
    changed = true;
  }
  if (!changed) return false;
  try {
    storage.setItem(PLANS_KEY, JSON.stringify(Object.fromEntries(Object.keys(plans).sort().map((k) => [k, plans[k]]))));
  } catch {
    return false;
  }
  return true;
}

/** First load (spec 65.2): copy future saved months into absent plans. */
export const backfillPlans = (storage: StorageLike | null, current: MonthKey, at: Date): boolean =>
  syncFuturePlans(storage, readMonths(storage), current, at, true);

export type Kind = "expenses" | "income" | "surplus";
export type Tone = "worse" | "better" | "even";
export type Variance = {
  planned: number | null;
  actual: number | null;
  /** actual − planned. */
  diff: number | null;
  /** diff ÷ planned × 100; null when planned is 0 or unknown. */
  pct: number | null;
  label: "Over plan" | "Under plan" | "On plan" | "—";
  tone: Tone | null;
};
export type VarianceLine = Variance & { kind: "expenses" | "income"; id: string; name: string };
/** `noActuals` (#231 AX3, spec 65.8): the month has no saved lines yet, so nothing is compared. */
export type Comparison = { expenses: Variance; income: Variance; surplus: Variance; lines: VarianceLine[]; noActuals?: boolean };
/** #231 AX3 (spec 65.8, PFPV-31): shown in the Direction column when the month has no actuals yet. */
export const NO_ACTUALS = "No actuals yet";
const pending = <V extends Variance>(v: V): V => ({ ...v, actual: null, diff: null, pct: null, label: "—", tone: null });

export const PLAN_TITLE = "Planned vs actual";
export const planNote = (planned: string): string =>
  `Planned = this month's lines as last saved before it started (${planned}). Actual = what is saved now. Difference = actual − planned.`;
/** #231 PV4 (spec 65.6, PFPV-26): the household zone the capture time is shown in (stored as UTC ISO). */
export const PLAN_TIME_ZONE = "America/Toronto";
/**
 * #231 PV4: `capturedAt` (UTC ISO) shown in Eastern time, the same on every device and server zone:
 * `yyyy-mm-dd hh:mm ET` (24 h). An unreadable value gives "".
 */
export function formatCaptured(iso: string, timeZone: string = PLAN_TIME_ZONE): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")} ET`;
}
export const TONE_TEXT: Record<Tone, string> = { worse: "worse than plan", better: "better than plan", even: "as planned" };

/** #231 Q2: direction. Expenses over plan, income under plan and surplus under plan read as worse. */
export function variance(kind: Kind, planned: number | null, actual: number | null): Variance {
  if (planned === null || actual === null) return { planned, actual, diff: null, pct: null, label: "—", tone: null };
  const diff = Math.round((actual - planned) * 100) / 100;
  const pct = planned !== 0 ? (diff / Math.abs(planned)) * 100 : null;
  if (diff === 0) return { planned, actual, diff: 0, pct: planned !== 0 ? 0 : null, label: "On plan", tone: "even" };
  const over = diff > 0;
  const worse = kind === "expenses" ? over : !over;
  return { planned, actual, diff, pct, label: over ? "Over plan" : "Under plan", tone: worse ? "worse" : "better" };
}

const sumOrNull = (vs: (number | null)[]): number | null =>
  vs.reduce<number | null>((s, v) => (s === null || v === null ? null : s + v), 0);

const expenseMap = (m: MonthLines, h: CurrencyCode) => {
  const out = new Map<string, { name: string; value: number | null }>();
  for (const l of [...m.fixed, ...m.variable] as Line[]) out.set(l.id, { name: l.name.trim() || "Unnamed line", value: householdMonthlyOf(l, h) });
  return out;
};
const incomeMap = (m: MonthLines, h: CurrencyCode) => {
  const out = new Map<string, { name: string; value: number | null }>();
  for (const l of incomeLines(m.people, h)) out.set(l.id, { name: l.label, value: monthly(l.yearly) });
  return out;
};

/** #231 Q2: totals and per line (matched by line id; a line only in one side counts 0 on the other). */
export function comparePlan(plan: MonthLines, actual: MonthLines, household: CurrencyCode = DEFAULT_HOUSEHOLD): Comparison {
  const lines: VarianceLine[] = [];
  const side = (kind: "expenses" | "income", p: Map<string, { name: string; value: number | null }>, a: typeof p) => {
    for (const id of [...p.keys(), ...[...a.keys()].filter((k) => !p.has(k))]) {
      const pv = p.get(id), av = a.get(id);
      const v = variance(kind, pv ? pv.value : 0, av ? av.value : 0);
      if (v.planned === 0 && v.actual === 0) continue;
      lines.push({ ...v, kind, id, name: (av ?? pv)!.name });
    }
  };
  side("expenses", expenseMap(plan, household), expenseMap(actual, household));
  side("income", incomeMap(plan, household), incomeMap(actual, household));
  const exp = (m: MonthLines) => sumOrNull([...expenseMap(m, household).values()].map((x) => x.value));
  const inc = (m: MonthLines) => monthly(netIncomeYearly(m.people, household));
  const pe = exp(plan), ae = exp(actual), pi = inc(plan), ai = inc(actual);
  const sur = (i: number | null, e: number | null) => (i === null || e === null ? null : i - e);
  return {
    expenses: variance("expenses", pe, ae),
    income: variance("income", pi, ai),
    surplus: variance("surplus", sur(pi, pe), sur(ai, ae)),
    lines,
  };
}

/** #231 Q4: the comparison for a shown month: current or past, with a plan; else null. Read-only (Q3). */
export function planFor(storage: StorageLike | null, month: MonthKey, current: MonthKey): { plan: Plan; comparison: Comparison } | null {
  if (isFuture(month, current)) return null;
  const plan = readPlans(storage)[month];
  if (!plan) return null;
  const saved = readMonths(storage)[month];
  const household = readHousehold(storage).household;
  // #231 AX3 (spec 65.8): "no actuals" = no saved lines for this month in months.v1 (absent, or saved with no line and
  // no person). Planned figures still show; actual, difference, % and direction are "—" (no result is implied).
  if (!saved || !hasLines(saved)) {
    const c = comparePlan(plan.lines, { fixed: [], variable: [], people: [] }, household);
    return { plan, comparison: { expenses: pending(c.expenses), income: pending(c.income), surplus: pending(c.surplus), lines: c.lines.filter((l) => l.planned !== 0).map(pending), noActuals: true } };
  }
  const actual = saved;
  return { plan, comparison: comparePlan(plan.lines, actual, household) };
}
