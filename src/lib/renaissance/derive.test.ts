// #267 (renaissance-spec section 5, AC RM-05..RM-12): the derived values. Pure; dates as strings, so these pass
// the same under TZ=UTC and TZ=America/Los_Angeles (the gates run both).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  baselineChange,
  capSeries,
  completion,
  compounding,
  contextOf,
  dateRange,
  dayLabel,
  daysBetween,
  dayShare,
  entryHit,
  indexEntries,
  levelOf,
  liftsInWeek,
  personalBests,
  rolling,
  rollingDelta,
  stepAverage,
  streaks,
  todayIn,
  weekdayIndex,
  weekStart,
} from "./derive.ts";
import { PLAN, type Entry, type Pillar } from "./model.ts";

const e = (date: string, item: string, o: Partial<Entry> = {}): Entry => ({
  date,
  item,
  pillar: (o.pillar ?? (item === "industry" ? "industry" : item === "spiritual" ? "spiritual" : "health")) as Pillar,
  target: o.target ?? null,
  actual: o.actual ?? null,
  hit: o.hit ?? null,
  note: o.note ?? null,
  picks: o.picks ?? [],
});
const S = "2026-10-28";

describe("RM-05 dates", () => {
  it("adds days across month, year and DST boundaries without the host zone", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-11-01", 1), "2026-11-02"); // US DST ends Nov 1 2026
    assert.equal(addDays("2026-03-08", 1), "2026-03-09"); // US DST starts Mar 8 2026
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2026-11-01", -1), "2026-10-31");
    assert.equal(daysBetween("2026-10-28", "2026-11-10"), 13);
    assert.equal(daysBetween("2026-11-10", "2026-10-28"), -13);
    assert.deepEqual(dateRange("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    assert.deepEqual(dateRange("2026-11-02", "2026-11-01"), []);
    assert.deepEqual(dateRange("2026-11-02", "2026-11-02"), ["2026-11-02"]);
  });
  it("todayIn gives the owner's calendar day (America/Toronto), whatever the host zone", () => {
    assert.equal(todayIn(new Date("2026-10-31T03:30:00Z")), "2026-10-30"); // 11:30 PM EDT
    assert.equal(todayIn(new Date("2026-10-31T04:00:00Z")), "2026-10-31"); // midnight EDT
    assert.equal(todayIn(new Date("2026-11-01T04:30:00Z")), "2026-11-01"); // 12:30 AM EDT, DST day
    assert.equal(todayIn(new Date("2026-11-02T04:30:00Z")), "2026-11-01"); // 11:30 PM EST
    assert.equal(todayIn(new Date("2026-11-02T05:00:00Z")), "2026-11-02"); // midnight EST
    assert.equal(todayIn(new Date("2027-01-01T04:59:59Z")), "2026-12-31");
    assert.equal(todayIn(new Date("2026-10-31T03:30:00Z"), "UTC"), "2026-10-31");
    assert.equal(todayIn(new Date("2026-10-31T06:30:00Z"), "America/Los_Angeles"), "2026-10-30");
  });
  it("weeks run Monday to Sunday", () => {
    assert.equal(weekdayIndex("2026-11-02"), 0); // Mon
    assert.equal(weekdayIndex("2026-11-01"), 6); // Sun
    assert.equal(weekStart("2026-11-01"), "2026-10-26");
    assert.equal(weekStart("2026-11-02"), "2026-11-02");
    assert.equal(weekStart("2026-10-28"), "2026-10-26");
    assert.equal(dayLabel("2026-10-30"), "Fri Oct 30");
    assert.equal(dayLabel("2026-11-01"), "Sun Nov 1");
  });
});

describe("RM-06 caps", () => {
  const spec = PLAN.zyn;
  it("day 0 is the baseline; the cap drops by 1 only after a hit day, holds after a miss", () => {
    const ix = indexEntries([e(S, "zyn", { actual: 16 }), e("2026-10-29", "zyn", { hit: false }), e("2026-10-30", "zyn", { actual: 15 }), e("2026-10-31", "zyn", { actual: 15 })]);
    const s = capSeries(ix, spec, S, "2026-11-01");
    assert.deepEqual(s.days.map((d) => d.cap), [16, 15, 15, 14, 14]);
    assert.deepEqual(s.days.map((d) => d.hit), [true, false, true, false, null]);
    assert.equal(s.next, 14);
  });
  it("an actual equal to the cap is a hit; one over is a miss (boundary)", () => {
    const at = capSeries(indexEntries([e("2026-10-29", "zyn", { actual: 15 })]), spec, S, "2026-10-29");
    assert.equal(at.days[1].hit, true);
    assert.equal(at.next, 14);
    const over = capSeries(indexEntries([e("2026-10-29", "zyn", { actual: 16 })]), spec, S, "2026-10-29");
    assert.equal(over.days[1].hit, false);
    assert.equal(over.next, 15);
  });
  it("the actual wins over a reported hit; with no actual the reported hit counts", () => {
    const s = capSeries(indexEntries([e("2026-10-29", "zyn", { actual: 20, hit: true }), e("2026-10-30", "zyn", { hit: true })]), spec, S, "2026-10-30");
    assert.deepEqual(s.days.map((d) => d.hit), [true, false, true]);
    assert.equal(s.next, 14);
  });
  it("an unreported past day is a miss; today unreported is pending and doesn't move the cap", () => {
    const s = capSeries(indexEntries([]), spec, S, "2026-10-31");
    assert.deepEqual(s.days.map((d) => d.hit), [true, false, false, null]);
    assert.deepEqual(s.days.map((d) => d.cap), [16, 15, 15, 15]);
    assert.equal(s.next, 15);
  });
  it("floors at the target: Zyn never below 3, coffee never below 3", () => {
    const zyn = Array.from({ length: 20 }, (_, i) => e(addDays(S, i + 1), "zyn", { actual: 0 }));
    const s = capSeries(indexEntries(zyn), spec, S, addDays(S, 20));
    assert.equal(s.days[13].cap, 3); // Nov 10, the planned date when every day is hit
    assert.equal(s.days[13].date, "2026-11-10");
    assert.equal(Math.min(...s.days.map((d) => d.cap)), 3);
    assert.equal(s.next, 3);
    const coffee = Array.from({ length: 10 }, (_, i) => e(addDays(S, i + 1), "coffee", { actual: 1 }));
    const c = capSeries(indexEntries(coffee), PLAN.coffee, S, addDays(S, 10));
    assert.deepEqual(c.days.slice(0, 6).map((d) => d.cap), [7, 6, 5, 4, 3, 3]);
    assert.equal(c.days[4].date, "2026-11-01");
  });
  it("the baseline row shows the baseline when no count was stored", () => {
    assert.equal(capSeries(indexEntries([]), spec, S, S).days[0].actual, 16);
    assert.equal(capSeries(indexEntries([e(S, "zyn", { actual: 18 })]), spec, S, S).days[0].actual, 18);
  });
  it("matches the tracker: Oct 29 missed → Oct 30 held at ≤15 / ≤6", () => {
    const c = contextOf([e(S, "zyn", { actual: 16 }), e(S, "coffee", { actual: 7 }), e("2026-10-29", "zyn", { hit: false }), e("2026-10-29", "coffee", { hit: false })], "2026-10-30");
    assert.equal(c.caps.zyn.get("2026-10-30")!.cap, 15);
    assert.equal(c.caps.coffee.get("2026-10-30")!.cap, 6);
  });
});

describe("RM-07 day shares and levels", () => {
  const today = "2026-10-31";
  it("counts each pillar's targets: steps by count, lift only on lift days, others by the reported hit", () => {
    const c = contextOf(
      [
        e("2026-10-29", "steps", { actual: 8000 }),
        e("2026-10-29", "lift", { hit: false }),
        e("2026-10-29", "zyn", { actual: 15 }),
        e("2026-10-29", "coffee", { actual: 7 }),
        e("2026-10-29", "industry", { hit: true }),
        e("2026-10-29", "spiritual", { hit: false }),
        e("2026-10-30", "steps", { actual: 7999 }),
        e("2026-10-30", "lift", { hit: true }),
        e("2026-10-30", "industry"),
      ],
      today,
    );
    assert.equal(dayShare(c.ix, c.caps, "2026-10-29", "health"), 2 / 3); // steps hit, zyn hit, coffee miss; rest day not counted
    assert.equal(dayShare(c.ix, c.caps, "2026-10-29", "industry"), 1);
    assert.equal(dayShare(c.ix, c.caps, "2026-10-29", "spiritual"), 0);
    assert.equal(dayShare(c.ix, c.caps, "2026-10-30", "health"), 1 / 2); // steps 7,999 < 8,000 miss, lift hit
    assert.equal(dayShare(c.ix, c.caps, "2026-10-30", "industry"), null); // reported but no result: gray
    assert.equal(dayShare(c.ix, c.caps, "2026-10-28", "health"), null);
    assert.equal(entryHit(e("2026-10-30", "steps", { hit: true }), c.caps), true);
    assert.equal(entryHit(e("2026-10-30", "lift", { hit: false }), c.caps), null);
  });
  it("levels: all / partial / none / unreported", () => {
    assert.equal(levelOf(null), "unreported");
    assert.equal(levelOf(0), "none");
    assert.equal(levelOf(0.01), "partial");
    assert.equal(levelOf(0.99), "partial");
    assert.equal(levelOf(1), "all");
  });
});

const keptDays = (dates: string[], pillar: "industry" | "spiritual" = "industry") => dates.map((d) => e(d, pillar, { hit: true }));

describe("RM-08 streaks", () => {
  it("current and best runs; a miss resets; today pending doesn't break the current run", () => {
    const c = contextOf([...keptDays(["2026-10-28", "2026-10-29", "2026-10-30"]), e("2026-10-31", "industry", { hit: false }), ...keptDays(["2026-11-01", "2026-11-02"])], "2026-11-03");
    assert.deepEqual(streaks(c, "industry"), { current: 2, best: 3 });
    const c2 = contextOf(keptDays(["2026-11-01", "2026-11-02", "2026-11-03"]), "2026-11-03");
    assert.deepEqual(streaks(c2, "industry"), { current: 3, best: 3 });
  });
  it("a gap (unreported day) breaks the run; nothing kept is 0/0", () => {
    const c = contextOf(keptDays(["2026-10-28", "2026-10-30"]), "2026-10-30");
    assert.deepEqual(streaks(c, "industry"), { current: 1, best: 1 });
    assert.deepEqual(streaks(contextOf([], "2026-10-30"), "industry"), { current: 0, best: 0 });
    assert.deepEqual(streaks(contextOf(keptDays(["2026-10-29"]), "2026-10-31"), "industry"), { current: 0, best: 1 });
  });
  it("'all' needs every pillar kept that day", () => {
    const day = (d: string, spirit: boolean) => [e(d, "industry", { hit: true }), e(d, "spiritual", { hit: spirit }), e(d, "steps", { actual: 9000 })];
    const c = contextOf([...day("2026-10-29", true), ...day("2026-10-30", false), ...day("2026-10-31", true)], "2026-10-31");
    assert.deepEqual(streaks(c, "all"), { current: 1, best: 1 });
  });
});

describe("RM-09 rolling completion and deltas", () => {
  it("mean share over the window, unreported past days count 0, clipped to the plan start", () => {
    const c = contextOf(keptDays(["2026-10-28", "2026-10-29"]), "2026-10-31");
    // Oct 28..31: 1, 1, 0, and today (31) unreported is left out → 2/3.
    assert.equal(rolling(c, "industry", 7), (2 / 3) * 100);
    assert.equal(completion(c, "industry", "2026-10-01", "2026-10-28"), 100);
    assert.equal(completion(c, "industry", "2026-10-01", "2026-10-27"), null);
  });
  it("today counts once reported", () => {
    const c = contextOf(keptDays(["2026-10-28", "2026-10-31"]), "2026-10-31");
    assert.equal(rolling(c, "industry", 7), 50);
    const c2 = contextOf([...keptDays(["2026-10-28"]), e("2026-10-31", "industry", { hit: false })], "2026-10-31");
    assert.equal(rolling(c2, "industry", 7), 25);
  });
  it("week-over-week = this 7 days − the 7 before; null without a previous window", () => {
    const dates = dateRange("2026-10-28", "2026-11-10");
    const hits = dates.map((d, i) => e(d, "industry", { hit: i >= 7 })); // first 7 days missed, next 7 hit
    const c = contextOf(hits, "2026-11-10");
    assert.equal(rolling(c, "industry", 7), 100);
    assert.equal(rolling(c, "industry", 7, "2026-11-03"), 0);
    assert.equal(rollingDelta(c, "industry", 7), 100);
    assert.equal(rollingDelta(contextOf(hits, "2026-11-01"), "industry", 7), null);
    assert.equal(rollingDelta(c, "industry", 30), null);
  });
  it("month-over-month over 30-day windows", () => {
    const dates = dateRange("2026-10-28", addDays("2026-10-28", 59));
    const c = contextOf(dates.map((d, i) => e(d, "spiritual", { hit: i >= 30 || i % 2 === 0 })), dates.at(-1)!);
    assert.equal(rolling(c, "spiritual", 30), 100);
    assert.equal(rolling(c, "spiritual", 30, dates[29]), 50);
    assert.equal(rollingDelta(c, "spiritual", 30), 50);
  });
  it("'all' averages the three pillars, an unreported pillar counting 0", () => {
    const c = contextOf([e("2026-10-28", "industry", { hit: true }), e("2026-10-28", "spiritual", { hit: true })], "2026-10-28");
    assert.equal(Math.round(rolling(c, "all", 7)! * 1000), Math.round((2 / 3) * 100 * 1000));
  });
});

describe("RM-10 the 1% line", () => {
  it("ideal ×1.01 a day; actual ×1.01^share; a missed day holds level, never drops", () => {
    const full = (d: string) => [e(d, "industry", { hit: true }), e(d, "spiritual", { hit: true }), e(d, "steps", { actual: 9000 })];
    const c = contextOf([...full("2026-10-28"), e("2026-10-29", "industry", { hit: false }), ...full("2026-10-30")], "2026-10-30");
    const p = compounding(c);
    assert.equal(p.length, 3);
    assert.equal(p[0].ideal, 1.01);
    assert.equal(p[0].actual, 1.01);
    assert.equal(p[1].actual, 1.01); // share 0 → ×1
    assert.ok(Math.abs(p[2].ideal - 1.01 ** 3) < 1e-12);
    assert.ok(Math.abs(p[2].actual - 1.01 ** 2) < 1e-12);
    for (let i = 1; i < p.length; i++) assert.ok(p[i].actual >= p[i - 1].actual);
  });
  it("leaves out today until something is reported", () => {
    assert.equal(compounding(contextOf([], "2026-10-30")).length, 2);
    assert.equal(compounding(contextOf([e("2026-10-30", "industry", { hit: false })], "2026-10-30")).length, 3);
  });
});

describe("RM-11 baseline, steps, lifts, bests", () => {
  it("change vs baseline uses the latest reported count", () => {
    const c = contextOf([e(S, "zyn", { actual: 16 }), e("2026-10-29", "zyn", { actual: 12 }), e("2026-10-30", "zyn", { hit: true })], "2026-10-31");
    const b = baselineChange(c, PLAN.zyn);
    assert.equal(b.latest, 12);
    assert.equal(b.latestDate, "2026-10-29");
    assert.equal(b.change, -4);
    assert.equal(b.changePct, -25);
    assert.equal(b.cap, 13); // 16 → 15 (Oct 29) → 14 (Oct 30) → 13 today; today pending holds it
    assert.equal(b.next, 13);
    const none = baselineChange(contextOf([], "2026-10-30"), PLAN.coffee);
    assert.equal(none.latest, null);
    assert.equal(none.change, null);
    assert.equal(none.cap, 6);
  });
  it("7-day steps average over reported days only", () => {
    const c = contextOf([e("2026-10-23", "steps", { actual: 1 }), e("2026-10-24", "steps", { actual: 6000 }), e("2026-10-30", "steps", { actual: 10000 })], "2026-10-30");
    assert.deepEqual(stepAverage(c), { avg: 8000, days: 2 });
    assert.deepEqual(stepAverage(contextOf([], "2026-10-30")), { avg: null, days: 0 });
  });
  it("lifts count Monday to the day, rest days not counted", () => {
    const c = contextOf([e("2026-10-25", "lift", { hit: true }), e("2026-10-26", "lift", { hit: true }), e("2026-10-27", "lift", { hit: false }), e("2026-10-30", "lift", { hit: true }), e("2026-11-02", "lift", { hit: true })], "2026-11-02");
    assert.equal(liftsInWeek(c, "2026-11-01"), 2);
    assert.equal(liftsInWeek(c, "2026-10-29"), 1);
    assert.equal(liftsInWeek(c, "2026-11-02"), 1);
  });
  it("personal bests", () => {
    const c = contextOf(
      [
        e(S, "zyn", { actual: 16 }),
        e("2026-10-29", "zyn", { actual: 13 }),
        e("2026-10-30", "zyn", { actual: 13 }),
        e("2026-10-29", "steps", { actual: 12000 }),
        e("2026-10-30", "steps", { actual: 9000 }),
        e("2026-10-29", "lift", { hit: true }),
        ...keptDays(["2026-10-29", "2026-10-30"], "spiritual"),
      ],
      "2026-10-30",
    );
    const b = Object.fromEntries(personalBests(c).map((x) => [x.label, x]));
    assert.equal(b["Most steps"].value, "12,000");
    assert.equal(b["Most steps"].date, "2026-10-29");
    assert.equal(b["Fewest Zyn"].value, "13");
    assert.equal(b["Fewest Zyn"].date, "2026-10-29"); // the first day it was reached
    assert.equal(b["Longest spiritual streak"].value, "2 d");
    assert.equal(b["Longest industry streak"].value, "0 d");
    assert.equal(b["Most lifts in a week"].value, "1/3");
    assert.equal(b["Fewest coffees"], undefined);
  });
});
