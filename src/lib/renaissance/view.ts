/**
 * #267: everything `/renaissance` draws, computed on the server from the stored rows and today's date (owner's zone).
 * Plain JSON (strings, numbers, booleans) so it crosses the server function as is.
 */
import {
  addDays,
  baselineChange,
  capSeries,
  compounding,
  contextOf,
  dateRange,
  daysBetween,
  entryHit,
  levelOf,
  liftsInWeek,
  personalBests,
  rolling,
  rollingDelta,
  stepAverage,
  streaks,
  dayShare,
  weekStart,
  type Baseline,
  type Best,
  type CompoundPoint,
  type Level,
} from "./derive.ts";
import { PILLARS, PLAN, type Entry, type Pillar } from "./model.ts";

export type GridCell = { date: string; level: Level; share: number | null; hits: string[]; picks: string[] };
export type PillarGrowth = { pillar: Pillar; r7: number | null; r30: number | null; wow: number | null; mom: number | null; current: number; best: number };
export type LogRow = { date: string; pillar: Pillar; item: string; target: number | null; actual: number | null; hit: boolean | null; note: string | null };

export type RenaissanceView = {
  today: string;
  start: string;
  dayN: number;
  streak: { current: number; best: number };
  caps: { zyn: number; coffee: number };
  liftsThisWeek: number;
  steps7: { avg: number | null; days: number };
  picksToday: string[];
  growth: PillarGrowth[];
  overall: { r7: number | null; r30: number | null; wow: number | null; mom: number | null };
  baselines: Baseline[];
  bests: Best[];
  compound: CompoundPoint[];
  /** Weeks (Monday first) × 7 days, per pillar, from the plan's first week to today's. */
  grids: { pillar: Pillar; weeks: (GridCell | null)[][] }[];
  zyn: { date: string; cap: number; actual: number | null; hit: boolean | null }[];
  coffee: { date: string; cap: number; actual: number | null; hit: boolean | null; afterNoon: boolean }[];
  steps: { date: string; steps: number | null }[];
  lifts: { week: string; lifts: number }[];
  strips: { pillar: Pillar; days: { date: string; level: Level }[]; weeks: { week: string; pct: number | null }[] }[];
  log: LogRow[];
};

export function buildView(entries: readonly Entry[], today: string, start: string = PLAN.start): RenaissanceView {
  const c = contextOf(entries, today, start);
  const days = dateRange(start, today);
  const firstWeek = weekStart(start);
  const weeks = dateRange(firstWeek, weekStart(today)).filter((_, i) => i % 7 === 0);
  const picksOf = (d: string) => [...(c.ix.get(d)?.values() ?? [])][0]?.picks ?? [];
  const cell = (d: string, p: Pillar): GridCell | null => {
    if (d < start || d > today) return null;
    const share = dayShare(c.ix, c.caps, d, p);
    const hits = [...(c.ix.get(d)?.values() ?? [])].filter((e) => e.pillar === p && entryHit(e, c.caps) === true).map((e) => e.item).sort();
    return { date: d, level: levelOf(share), share, hits, picks: picksOf(d) };
  };
  const coffeeNoon = (d: string) => c.ix.get(d)?.get(PLAN.coffeeNoon.item);
  return {
    today,
    start,
    dayN: daysBetween(start, today),
    streak: streaks(c, "all"),
    caps: {
      zyn: capSeries(c.ix, PLAN.zyn, start, today).days.at(-1)?.cap ?? PLAN.zyn.baseline,
      coffee: capSeries(c.ix, PLAN.coffee, start, today).days.at(-1)?.cap ?? PLAN.coffee.baseline,
    },
    liftsThisWeek: liftsInWeek(c, today),
    steps7: stepAverage(c),
    picksToday: picksOf(today),
    growth: PILLARS.map((p) => ({ pillar: p, r7: rolling(c, p, 7), r30: rolling(c, p, 30), wow: rollingDelta(c, p, 7), mom: rollingDelta(c, p, 30), ...streaks(c, p) })),
    overall: { r7: rolling(c, "all", 7), r30: rolling(c, "all", 30), wow: rollingDelta(c, "all", 7), mom: rollingDelta(c, "all", 30) },
    baselines: [baselineChange(c, PLAN.zyn), baselineChange(c, PLAN.coffee)],
    bests: personalBests(c),
    compound: compounding(c),
    grids: PILLARS.map((p) => ({ pillar: p, weeks: weeks.map((w) => Array.from({ length: 7 }, (_, i) => cell(addDays(w, i), p))) })),
    zyn: capSeries(c.ix, PLAN.zyn, start, today).days,
    coffee: capSeries(c.ix, PLAN.coffee, start, today).days.map((d) => {
      const n = coffeeNoon(d.date);
      return { ...d, afterNoon: n?.hit === false || (n?.actual ?? 0) > 0 };
    }),
    steps: days.map((d) => ({ date: d, steps: c.ix.get(d)?.get(PLAN.steps.item)?.actual ?? null })),
    lifts: weeks.map((w) => ({ week: w, lifts: liftsInWeek(c, addDays(w, 6) > today ? today : addDays(w, 6)) })),
    strips: (["industry", "spiritual"] as const).map((p) => ({
      pillar: p,
      days: days.map((d) => ({ date: d, level: levelOf(dayShare(c.ix, c.caps, d, p)) })),
      weeks: weeks.map((w) => ({ week: w, pct: rolling(c, p, 7, addDays(w, 6)) })),
    })),
    log: [...entries]
      .filter((e) => e.date <= today)
      .sort((a, b) => (a.date === b.date ? a.item.localeCompare(b.item) : a.date < b.date ? 1 : -1))
      .map((e) => ({ date: e.date, pillar: e.pillar, item: e.item, target: e.target, actual: e.actual, hit: entryHit(e, c.caps), note: e.note })),
  };
}
