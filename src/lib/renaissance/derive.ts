/**
 * #267 Renaissance Man derived values (attachments/renaissance-spec.md section 5). Pure functions over the stored
 * rows and `today` (a `yyyy-mm-dd` in the owner's zone); nothing here is stored. Dates are plain `yyyy-mm-dd`
 * strings stepped in UTC, so the server's or browser's own time zone never shifts a day.
 */
import { PILLARS, PLAN, type CapSpec, type Entry, type Pillar } from "./model.ts";

const DAY_MS = 86_400_000;
const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

export function addDays(d: string, n: number): string {
  return new Date(utc(d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

/** The calendar day of `now` in `timeZone` (default the owner's, America/Toronto). */
export function todayIn(now: Date, timeZone: string = PLAN.timeZone): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(d: string): number {
  return (new Date(utc(d)).getUTCDay() + 6) % 7;
}

/** The Monday of `d`'s week (weeks run Mon–Sun). */
export function weekStart(d: string): string {
  return addDays(d, -weekdayIndex(d));
}

/** Every date from `from` to `to`, inclusive (empty when `to` is before `from`). */
export function dateRange(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `Fri Oct 30` (no year), from the string alone. */
export function dayLabel(d: string): string {
  return `${WEEKDAYS[weekdayIndex(d)]} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}

export type Index = Map<string, Map<string, Entry>>;
export function indexEntries(entries: readonly Entry[]): Index {
  const ix: Index = new Map();
  for (const e of entries) {
    const day = ix.get(e.date) ?? new Map<string, Entry>();
    day.set(e.item, e);
    ix.set(e.date, day);
  }
  return ix;
}

export type CapDay = { date: string; cap: number; actual: number | null; hit: boolean | null };

/**
 * The cap rule (Diego 2026-10-30): day 0 (`start`) is the baseline and counts as a hit; after that the cap drops by 1
 * only after a hit day (actual ≤ cap; with no actual, the reported `hit`), holds after a missed or unreported day, and
 * never goes below `floor`. Today with nothing reported is pending (`hit` null) and doesn't move the cap.
 * Returns one row per day from `start` to `today`, plus tomorrow's cap.
 */
export function capSeries(ix: Index, spec: CapSpec, start: string, today: string): { days: CapDay[]; next: number } {
  let cap = spec.baseline;
  const days: CapDay[] = [];
  for (const date of dateRange(start, today)) {
    const e = ix.get(date)?.get(spec.item);
    const actual = e?.actual ?? null;
    let hit: boolean | null;
    if (date === start) hit = true;
    else if (actual !== null) hit = actual <= cap;
    else if (e?.hit != null) hit = e.hit;
    else hit = date === today ? null : false;
    days.push({ date, cap, actual: date === start ? actual ?? spec.baseline : actual, hit });
    if (hit === true) cap = Math.max(spec.floor, cap - 1);
  }
  return { days, next: cap };
}

export type Caps = Record<string, Map<string, CapDay>>;
export function capsOf(ix: Index, start: string, today: string): Caps {
  const out: Caps = {};
  for (const spec of [PLAN.zyn, PLAN.coffee]) out[spec.item] = new Map(capSeries(ix, spec, start, today).days.map((d) => [d.date, d]));
  return out;
}

/**
 * Whether one stored entry counts as a hit for its day: true / false, or null = not counted. Zyn and coffee use the
 * derived cap; steps hit at ≥ 8,000 when a count is given; a lift row counts only on a lift day (rest days are not
 * misses, lifts are weekly); anything else uses the reported `hit`.
 */
export function entryHit(e: Entry, caps: Caps): boolean | null {
  const cap = caps[e.item]?.get(e.date);
  if (cap) return cap.hit;
  if (e.item === PLAN.steps.item) return e.actual !== null ? e.actual >= PLAN.steps.min : e.hit;
  if (e.item === PLAN.lift.item) return e.hit === true ? true : null;
  return e.hit;
}

/** Share of a pillar's counted targets hit on `date` (0..1), or null when nothing was reported (gray). */
export function dayShare(ix: Index, caps: Caps, date: string, pillar: Pillar): number | null {
  const day = ix.get(date);
  if (!day) return null;
  let counted = 0;
  let hits = 0;
  for (const e of day.values()) {
    if (e.pillar !== pillar) continue;
    const h = entryHit(e, caps);
    if (h === null) continue;
    counted++;
    if (h) hits++;
  }
  return counted ? hits / counted : null;
}

export type Level = "none" | "partial" | "all" | "unreported";
export function levelOf(share: number | null): Level {
  if (share === null) return "unreported";
  if (share >= 1) return "all";
  return share > 0 ? "partial" : "none";
}

export type Ctx = { ix: Index; caps: Caps; start: string; today: string };
export function contextOf(entries: readonly Entry[], today: string, start: string = PLAN.start): Ctx {
  const ix = indexEntries(entries);
  return { ix, caps: capsOf(ix, start, today), start, today };
}

const share = (c: Ctx, d: string, p: Pillar) => dayShare(c.ix, c.caps, d, p);
/** A day is kept for a pillar when every counted target was hit; "all" needs all three pillars kept. */
const kept = (c: Ctx, d: string, p: Pillar | "all") =>
  p === "all" ? PILLARS.every((q) => share(c, d, q) === 1) : share(c, d, p) === 1;

/**
 * Current and best runs of kept days. Today still unkept doesn't break the current streak (it may yet be kept), so
 * the current streak ends today when today is kept, else yesterday.
 */
export function streaks(c: Ctx, p: Pillar | "all"): { current: number; best: number } {
  const days = dateRange(c.start, c.today);
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = kept(c, d, p) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = 0;
  let d = kept(c, c.today, p) ? c.today : addDays(c.today, -1);
  while (d >= c.start && kept(c, d, p)) {
    current++;
    d = addDays(d, -1);
  }
  return { current, best };
}

/** The days a window over `[from, to]` measures: clipped to the plan, minus today while nothing is reported. */
function measuredDays(c: Ctx, from: string, to: string, p: Pillar | "all"): string[] {
  const lo = from < c.start ? c.start : from;
  const hi = to > c.today ? c.today : to;
  return dateRange(lo, hi).filter((d) => {
    if (d !== c.today) return true;
    return p === "all" ? PILLARS.some((q) => share(c, d, q) !== null) : share(c, d, p) !== null;
  });
}

/** Mean daily share over the measured days, in % (0–100); an unreported past day counts as 0. Null: no days. */
export function completion(c: Ctx, p: Pillar | "all", from: string, to: string): number | null {
  const days = measuredDays(c, from, to, p);
  if (!days.length) return null;
  const total = days.reduce((s, d) => s + (p === "all" ? overallShare(c, d) : share(c, d, p) ?? 0), 0);
  return (total / days.length) * 100;
}

/** The rolling n-day completion ending on `end` (inclusive). */
export function rolling(c: Ctx, p: Pillar | "all", n: number, end: string = c.today): number | null {
  return completion(c, p, addDays(end, -(n - 1)), end);
}

/** This window minus the one before it, in percentage points; null when either has no days. */
export function rollingDelta(c: Ctx, p: Pillar | "all", n: number, end: string = c.today): number | null {
  const now = rolling(c, p, n, end);
  const before = rolling(c, p, n, addDays(end, -n));
  return now === null || before === null ? null : now - before;
}

/** The mean of the three pillars' shares for a day, an unreported pillar counting as 0. */
export function overallShare(c: Ctx, d: string): number {
  return PILLARS.reduce((s, p) => s + (share(c, d, p) ?? 0), 0) / PILLARS.length;
}

export type CompoundPoint = { date: string; ideal: number; actual: number };
/**
 * The 1%-better line: from 1.0 before day 0, the ideal gains 1% every day (×1.01); the actual gains 1% scaled by
 * that day's overall share (×1.01^share), so a missed day holds level and never goes down ("never get worse").
 */
export function compounding(c: Ctx): CompoundPoint[] {
  let ideal = 1;
  let actual = 1;
  return measuredDays(c, c.start, c.today, "all").map((date) => {
    ideal *= 1.01;
    actual *= 1.01 ** overallShare(c, date);
    return { date, ideal, actual };
  });
}

export type Baseline = { item: string; baseline: number; latest: number | null; latestDate: string | null; cap: number; next: number; floor: number; change: number | null; changePct: number | null };
/** Change vs the Oct 28 baseline: the latest reported count, today's cap and the change from the baseline. */
export function baselineChange(c: Ctx, spec: CapSpec): Baseline {
  const s = capSeries(c.ix, spec, c.start, c.today);
  const reported = s.days.filter((d) => d.actual !== null && (d.date !== c.start || c.ix.get(d.date)?.has(spec.item)));
  const last = reported.at(-1) ?? null;
  const latest = last?.actual ?? null;
  return {
    item: spec.item,
    baseline: spec.baseline,
    latest,
    latestDate: last?.date ?? null,
    cap: s.days.at(-1)?.cap ?? spec.baseline,
    next: s.next,
    floor: spec.floor,
    change: latest === null ? null : latest - spec.baseline,
    changePct: latest === null ? null : ((latest - spec.baseline) / spec.baseline) * 100,
  };
}

/** Lift days in the Mon–Sun week that holds `d`, up to `d`. */
export function liftsInWeek(c: Ctx, d: string): number {
  return dateRange(weekStart(d), d).filter((x) => c.ix.get(x)?.get(PLAN.lift.item)?.hit === true).length;
}

/** Mean of the reported step counts in the 7 days ending `end`, and how many days reported. */
export function stepAverage(c: Ctx, end: string = c.today): { avg: number | null; days: number } {
  const counts = dateRange(addDays(end, -6), end)
    .map((d) => c.ix.get(d)?.get(PLAN.steps.item)?.actual ?? null)
    .filter((v): v is number => v !== null);
  return { avg: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : null, days: counts.length };
}

export type Best = { label: string; value: string; date: string | null };
function extreme(c: Ctx, item: string, pick: (a: number, b: number) => boolean): { value: number; date: string } | null {
  let out: { value: number; date: string } | null = null;
  for (const [date, day] of c.ix) {
    const v = day.get(item)?.actual;
    if (v == null || date < c.start || date > c.today) continue;
    if (!out || pick(v, out.value) || (v === out.value && date < out.date)) out = { value: v, date };
  }
  return out;
}

/** Personal bests: longest streak per pillar, most steps, fewest Zyn / coffees, most lifts in a week. */
export function personalBests(c: Ctx): Best[] {
  const out: Best[] = PILLARS.map((p) => ({ label: `Longest ${p} streak`, value: `${streaks(c, p).best} d`, date: null }));
  const steps = extreme(c, PLAN.steps.item, (a, b) => a > b);
  if (steps) out.push({ label: "Most steps", value: steps.value.toLocaleString("en-US"), date: steps.date });
  const zyn = extreme(c, PLAN.zyn.item, (a, b) => a < b);
  if (zyn) out.push({ label: "Fewest Zyn", value: String(zyn.value), date: zyn.date });
  const coffee = extreme(c, PLAN.coffee.item, (a, b) => a < b);
  if (coffee) out.push({ label: "Fewest coffees", value: String(coffee.value), date: coffee.date });
  let lifts = 0;
  let liftWeek: string | null = null;
  for (let w = weekStart(c.start); w <= c.today; w = addDays(w, 7)) {
    const sunday = addDays(w, 6);
    const n = liftsInWeek(c, sunday > c.today ? c.today : sunday);
    if (n > lifts) [lifts, liftWeek] = [n, w];
  }
  if (liftWeek) out.push({ label: "Most lifts in a week", value: `${lifts}/${PLAN.lift.perWeek}`, date: liftWeek });
  return out;
}
