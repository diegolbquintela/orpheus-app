import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asOverview,
  average3Label,
  average12Label,
  average12CountLabel,
  completeMonths,
  completeMonths3,
  COVERAGE_SOURCE_NOTE,
  coverageRateNote,
  coverageBasis,
  householdMonth,
  equityCoverage,
  formatCoverageShare,
  overviewCoverage,
  lastTwelve,
  monthName,
  NO_OVERVIEW,
  OVERVIEW_KEY,
  type Overview,
  readOverview,
  setMonth,
  summarize,
  surplusOf,
  writeOverview,
  yearsLabel,
} from "./overview.ts";

class Memory {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const NOW = new Date(2026, 9, 11, 12); // 11 October 2026, local
const PAGE = { expenses: 1750, income: 11200 };
const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
const ov = (over: Partial<Overview> = {}): Overview => ({ ...NO_OVERVIEW, ...over });

describe("#94 months", () => {
  it("lists the last 12 months, oldest → current, across a year end", () => {
    const m = lastTwelve(NOW);
    assert.equal(m.length, 12);
    assert.equal(m[0], "2025-11");
    assert.equal(m[11], "2026-10");
    assert.equal(lastTwelve(new Date(2026, 0, 31))[0], "2025-02");
  });
  it("names months in English", () => {
    assert.equal(monthName("2026-06"), "June 2026");
    assert.equal(monthName("2025-11"), "November 2025");
    assert.deepEqual(
      [1, 5, 10, 15].map((y) => yearsLabel(y as 1)),
      ["1 year", "5 years", "10 years", "15 years"],
    );
  });
});

describe("#94 this month and the 12-month average (Q17, Q18)", () => {
  it("an empty page and nothing typed: all —", () => {
    const s = summarize(NO_OVERVIEW, NOW, { expenses: 0, income: 0 });
    assert.deepEqual(s.thisMonth, { expenses: null, income: null });
    assert.deepEqual(s.average, { expenses: null, income: null });
    assert.equal(s.points.length, 12);
    assert.equal(s.points[11].net, null);
  });
  it("the current month takes the page figures; a `—` page expense is no figure", () => {
    const s = summarize(NO_OVERVIEW, NOW, PAGE);
    assert.deepEqual(s.thisMonth, PAGE);
    // #140 (PF-124): the current month never enters the 12-month average (12 complete months only).
    assert.deepEqual(s.average, { expenses: null, income: null });
    assert.equal(
      summarize(NO_OVERVIEW, NOW, { expenses: null, income: 5 }).thisMonth.expenses,
      null,
    );
  });
  it("a typed past month updates the average (spec 15.2 example)", () => {
    const o = setMonth(setMonth(NO_OVERVIEW, "2026-06", { expenses: "4,000" }), "2026-06", {
      income: "9000",
    });
    const s = summarize({ ...o, start: "10,000" }, NOW, PAGE);
    // #140: the 12-month average is over Oct 2025..Sep 2026, so June alone (the current month is excluded).
    assert.deepEqual(s.average, { expenses: 4000, income: 9000 });
    assert.equal(surplusOf(s.thisMonth), 9450);
    assert.equal(surplusOf(s.average), 5000);
    // Net assets: 10,000 + 10 × 5,000 + 5,000 + 9,450.
    assert.equal(s.points[11].net, 74450);
    // Empty months plot the average.
    assert.equal(s.points[0].expenses, 4000);
    assert.equal(s.points[7].expenses, 4000);
  });
  it("a typed current month replaces the page; a bad value is not used; clearing empties", () => {
    let o = setMonth(NO_OVERVIEW, "2026-10", { expenses: "2,000" });
    assert.equal(summarize(o, NOW, PAGE).thisMonth.expenses, 2000);
    o = setMonth(o, "2026-10", { expenses: "abc" });
    assert.equal(summarize(o, NOW, PAGE).thisMonth.expenses, 1750);
    o = setMonth(o, "2026-10", { expenses: "" });
    assert.deepEqual(o.months, {});
  });
  it("months outside the 12 complete months are kept but unused (#140: Oct 2025 is now inside)", () => {
    const o = setMonth(NO_OVERVIEW, "2025-09", { expenses: "99" });
    assert.deepEqual(summarize(o, NOW, PAGE).average, { expenses: null, income: null });
    assert.equal(summarize(setMonth(NO_OVERVIEW, "2025-10", { expenses: "99" }), NOW, PAGE).average.expenses, 99);
  });
});

describe("#94 Future (Q20, Q21)", () => {
  const base = setMonth(NO_OVERVIEW, "2026-06", { expenses: "4,000", income: "9,000" });
  it("off: ends at the current month", () => {
    assert.equal(summarize({ ...base, start: "10,000", years: 5 }, NOW, PAGE).points.length, 12);
  });
  it("on: flat at the average, net assets compound monthly at the typed rate", () => {
    const s1 = summarize(
      { ...base, start: "10,000", growth: "5", future: true, years: 1 },
      NOW,
      PAGE,
    );
    assert.equal(s1.points.length, 24);
    assert.equal(s1.points[12].key, "2026-11");
    // #140 (PF-125): future months are held at the 12-complete-month average (June alone).
    assert.equal(s1.points[23].expenses, 4000);
    assert.equal(s1.points[23].income, 9000);
    assert.equal(round2(s1.points[23].net), 139535.39);
    const s5 = summarize(
      { ...base, start: "10,000", growth: "5", future: true, years: 5 },
      NOW,
      PAGE,
    );
    assert.equal(s5.points.length, 72);
    assert.equal(round2(s5.points[71].net), 434087.85);
  });
  it("growth 0 or bad: the surplus only", () => {
    const s = summarize(
      { ...base, start: "10,000", growth: "x", future: true, years: 1 },
      NOW,
      PAGE,
    );
    assert.equal(s.points[23].net, 74450 + 12 * 5000);
  });
});

describe("#94 storage", () => {
  it("round-trips through orpheus.finance.overview.v1 only", () => {
    const mem = new Memory();
    const o = ov({
      start: "1",
      growth: "5",
      future: true,
      years: 10,
      months: { "2026-06": { expenses: "4", income: "" } },
    });
    writeOverview(mem, o);
    assert.deepEqual([...mem.map.keys()], [OVERVIEW_KEY]);
    assert.deepEqual(readOverview(mem), o);
  });
  it("malformed reads as empty, never throws", () => {
    const mem = new Memory();
    mem.setItem(OVERVIEW_KEY, "{nope");
    assert.deepEqual(readOverview(mem), NO_OVERVIEW);
    assert.deepEqual(asOverview([]), NO_OVERVIEW);
    assert.deepEqual(
      asOverview({
        start: 5,
        years: 3,
        future: "yes",
        months: {
          bad: { expenses: "1" },
          "2026-13": {},
          "2026-01": { expenses: "x".repeat(41), income: "" },
        },
      }),
      NO_OVERVIEW,
    );
    assert.deepEqual(readOverview(null), NO_OVERVIEW);
  });
  it("keeps at most 60 months, newest first", () => {
    const months: Record<string, { expenses: string; income: string }> = {};
    for (let i = 0; i < 70; i++)
      months[`${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`] = {
        expenses: "1",
        income: "",
      };
    const keys = Object.keys(asOverview({ months }).months);
    assert.equal(keys.length, 60);
    assert.ok(!keys.includes("2020-01"));
  });
});

describe("#126 equity coverage and 3-month average (PF-80..PF-86)", () => {
  it("PF-80: annual = start × rate ÷ 100, monthly ÷ 12, share of expenses (two decimals)", () => {
    const c = equityCoverage(13125, 4, 8254.72);
    assert.equal(c.status, "ok");
    if (c.status !== "ok") return;
    assert.equal(c.yearly, 525);
    assert.equal(c.monthly, 43.75);
    assert.equal(formatCoverageShare(c.share), "0.53%");
  });
  it("PF-82: no rate, no start, no expenses", () => {
    assert.deepEqual(equityCoverage(13125, null, 1000), { status: "no_rate" });
    assert.deepEqual(equityCoverage(13125, 0, 1000), { status: "no_rate" });
    assert.deepEqual(equityCoverage(null, 4, 1000), { status: "no_start" });
    assert.deepEqual(equityCoverage(0, 4, 1000), { status: "no_start" });
    const c = equityCoverage(12000, 4, 0);
    assert.equal(c.status === "ok" && c.share, null);
    assert.equal(formatCoverageShare(null), "—");
  });
  it("PF-86 → C7: 3-month average = mean of the last 3 complete months (Jul–Sep on Oct 11), empty months taking the 12-month average", () => {
    const s = summarize(ov({ months: { "2026-01": { expenses: "7,000", income: "" }, "2026-09": { expenses: "1,000", income: "" }, "2026-10": { expenses: "4,000", income: "" } } }), NOW, { expenses: null, income: null });
    assert.equal(s.average.expenses, 4000);
    assert.equal(s.average3.expenses, 3000);
    assert.equal(s.average3.income, null);
    assert.equal(summarize(NO_OVERVIEW, NOW, { expenses: null, income: null }).average3.expenses, null);
  });
  it("PF-83 / PF-84: today uses this month else the average; Future uses the projected net assets", () => {
    const o = ov({ start: "100,000", months: { "2026-09": { expenses: "2,000", income: "3,000" } } });
    const s = summarize(o, NOW, { expenses: null, income: null });
    const now = overviewCoverage(o, s, 6);
    assert.equal(now.status === "ok" && now.share, 500 / 2000);
    const f = { ...o, future: true, years: 5 as const };
    const sf = summarize(f, NOW, { expenses: null, income: null });
    const fut = overviewCoverage(f, sf, 6);
    assert.equal(fut.status === "ok" && round2(fut.yearly), round2(sf.points.at(-1)!.net! * 0.06));
  });
});


describe("C7/C2 (approved 2026-10-13): the 3-month average of complete months, coverage against it", () => {
  const TZ = "America/Toronto";
  it("PF-91: mid-month Oct 13 2026 → Jul, Aug, Sep (the current partial month excluded)", () => {
    assert.deepEqual(completeMonths3(new Date("2026-10-13T12:00:00-04:00"), TZ), ["2026-07", "2026-08", "2026-09"]);
  });
  it("PF-92: year boundary: any day in January 2027 → Oct, Nov, Dec 2026; Feb → Nov–Jan", () => {
    assert.deepEqual(completeMonths3(new Date("2027-01-01T12:00:00-05:00"), TZ), ["2026-10", "2026-11", "2026-12"]);
    assert.deepEqual(completeMonths3(new Date("2027-01-31T12:00:00-05:00"), TZ), ["2026-10", "2026-11", "2026-12"]);
    assert.deepEqual(completeMonths3(new Date("2027-02-15T12:00:00-05:00"), TZ), ["2026-11", "2026-12", "2027-01"]);
    assert.equal(average3Label(completeMonths3(new Date("2027-01-05T12:00:00-05:00"), TZ)), "3-month average (Oct\u2013Dec)");
  });
  it("PF-95: month rollover: Oct 31 → Jul–Sep, Nov 1 → Aug–Oct; computed from the date, never hardcoded", () => {
    assert.deepEqual(completeMonths3(new Date("2026-10-31T23:59:00-04:00"), TZ), ["2026-07", "2026-08", "2026-09"]);
    assert.deepEqual(completeMonths3(new Date("2026-11-01T00:01:00-04:00"), TZ), ["2026-08", "2026-09", "2026-10"]);
  });
  it("PF-95: timezone edge: 2026-11-01T03:30Z is still Oct 31 in Toronto → Jul–Sep; 04:30Z (00:30 Nov 1 EDT) → Aug–Oct", () => {
    const lateOct = new Date("2026-11-01T03:30:00Z");
    assert.equal(householdMonth(lateOct, TZ), "2026-10");
    assert.equal(householdMonth(lateOct, "UTC"), "2026-11", "UTC alone would already say November");
    assert.deepEqual(completeMonths3(lateOct, TZ), ["2026-07", "2026-08", "2026-09"]);
    assert.equal(average3Label(completeMonths3(lateOct, TZ)), "3-month average (Jul\u2013Sep)");
    const nov1 = new Date("2026-11-01T04:30:00Z");
    assert.deepEqual(completeMonths3(nov1, TZ), ["2026-08", "2026-09", "2026-10"]);
    assert.equal(average3Label(completeMonths3(nov1, TZ)), "3-month average (Aug\u2013Oct)");
    // summarize() takes the same instant and household zone at render time.
    assert.deepEqual(summarize(NO_OVERVIEW, lateOct, { expenses: null, income: null }, undefined, TZ).window3, ["2026-07", "2026-08", "2026-09"]);
    assert.deepEqual(summarize(NO_OVERVIEW, nov1, { expenses: null, income: null }, undefined, TZ).window3, ["2026-08", "2026-09", "2026-10"]);
  });
  it("PF-93: C8 on complete months: an empty complete month takes the 12-month average; the current month is ignored", () => {
    // Jul 3,000, Aug empty, Sep 6,000, Oct (partial) 30,000. #140: 12-month avg = 4,500 (Oct excluded); 3-month = (3,000 + 4,500 + 6,000) / 3.
    const o = ov({ months: { "2026-07": { expenses: "3,000", income: "" }, "2026-09": { expenses: "6,000", income: "" }, "2026-10": { expenses: "30,000", income: "" } } });
    const s = summarize(o, new Date("2026-10-13T12:00:00-04:00"), { expenses: null, income: null });
    assert.deepEqual(s.window3, ["2026-07", "2026-08", "2026-09"]);
    assert.equal(s.average.expenses, 4500);
    assert.equal(s.average3.expenses, 4500);
    assert.equal(s.thisMonth.expenses, 30000, "This month still shows the partial month");
    // The page's own figure only fills the current month, never a complete one.
    assert.equal(summarize(NO_OVERVIEW, new Date("2026-10-13T12:00:00-04:00"), PAGE).average3.expenses, null, "#140 Q-T3/Q-T5: only the current month → 12-month average empty → 3-month —");
  });
  it("PF-94: C2: coverage % against the 3-month average of complete months, not this month", () => {
    const o = ov({ start: "120,000", months: { "2026-07": { expenses: "1,000", income: "" }, "2026-08": { expenses: "2,000", income: "" }, "2026-09": { expenses: "3,000", income: "" }, "2026-10": { expenses: "10,000", income: "" } } });
    const s = summarize(o, new Date("2026-10-13T12:00:00-04:00"), { expenses: null, income: null });
    const c = overviewCoverage(o, s, 4); // 120,000 × 4% = 4,800/yr = 400/mo; ÷ 2,000 (Jul–Sep) = 20%
    assert.equal(c.status === "ok" && c.share, 0.2);
  });
  it("PF-91: the label names the window: 3-month average (Jul–Sep)", () => {
    assert.equal(average3Label(["2026-07", "2026-08", "2026-09"]), "3-month average (Jul\u2013Sep)");
    assert.equal(average3Label(["2026-07", "2026-08", "2026-09"]), "3-month average (Jul–Sep)");
  });
});

describe("N1 (PF-96) and the basis label (PF-97), 2026-10-13", () => {
  const TZ = "America/Toronto";
  const P = { expenses: null, income: null };
  for (const at of ["2026-10-31T20:00:00-04:00", "2026-10-31T20:30:00-04:00", "2026-10-31T23:59:00-04:00"]) {
    it(`PF-96: ${at} (already Nov 1 in UTC) → This month = Oct, window Jul–Sep, no month counted twice`, () => {
      const now = new Date(at);
      assert.equal(now.getUTCMonth(), 10, "November in UTC");
      const months = lastTwelve(now, TZ);
      assert.equal(months[11], "2026-10");
      assert.equal(months[0], "2025-11");
      assert.equal(new Set(months).size, 12);
      const s = summarize(ov({ months: { "2026-10": { expenses: "5,000", income: "" }, "2026-11": { expenses: "9,999", income: "" } } }), now, P, undefined, TZ);
      assert.equal(s.current, "2026-10");
      assert.equal(s.thisMonth.expenses, 5000);
      assert.deepEqual(s.window3, ["2026-07", "2026-08", "2026-09"]);
      assert.ok(!s.window3.includes(s.current));
    });
  }
  it("PF-96: 00:00 Nov 1 ET → This month = Nov, window Aug–Oct", () => {
    const s = summarize(NO_OVERVIEW, new Date("2026-11-01T00:00:00-04:00"), P, undefined, TZ);
    assert.equal(s.current, "2026-11");
    assert.deepEqual(s.window3, ["2026-08", "2026-09", "2026-10"]);
  });
  it("PF-97: basis label: 3-mo avg (window) with Future off, projection with Future on", () => {
    assert.equal(coverageBasis(false, ["2026-07", "2026-08", "2026-09"]), "basis: 3-mo avg (Jul\u2013Sep)");
    assert.equal(coverageBasis(false, ["2026-10", "2026-11", "2026-12"]), "basis: 3-mo avg (Oct\u2013Dec)");
    assert.equal(coverageBasis(true, ["2026-07", "2026-08", "2026-09"]), "basis: projection");
  });
});

describe("#129 coverage layout notes (PF-99..PF-101, PF-103)", () => {
  const W = ["2026-07", "2026-08", "2026-09"];
  it("PF-99 / PF-100: the brief's example: 4,000 × 12.5% = 41.67/mo, ÷ 8,333.33 → 0.50% on Jul–Sep", () => {
    const c = equityCoverage(4000, 12.5, 8333.33);
    assert.ok(c.status === "ok");
    assert.equal(round2(c.monthly), 41.67);
    assert.equal(c.yearly, 500);
    assert.equal(coverageRateNote("12.5%", c.share, false, W), "* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul\u2013Sep).");
    assert.equal(coverageRateNote("12.5%", null, false, W), "* 12.5% yearly, covers — of monthly expenses (3-month average, Jul\u2013Sep).");
    assert.equal(coverageRateNote("4%", 0.2, false, ["2026-10", "2026-11", "2026-12"]), "* 4% yearly, covers 20.00% of monthly expenses (3-month average, Oct\u2013Dec).");
  });
  it("PF-103: Future on → 12-month average expenses (projection)", () => {
    assert.equal(coverageRateNote("4%", 0.1234, true, W), "* 4% yearly, covers 12.34% of projected monthly expenses at horizon end (held at 12-month average).");
  });
  it("PF-101: the source note text", () => {
    assert.equal(COVERAGE_SOURCE_NOTE, "** Coverage rate is derived from Rate Used under Expenses section.");
  });
});

describe("#129 Q-L4 option b (PF-106, PF-107): Future on divides by the horizon-end point's expenses", () => {
  // #140: Jan 10,000 (not Oct) so the 12-complete-month average (4,000) differs from the 3-month (2,000).
  const o = ov({ start: "120,000", future: true, years: 5, months: { "2026-01": { expenses: "10,000", income: "3,000" }, "2026-07": { expenses: "1,000", income: "3,000" }, "2026-08": { expenses: "2,000", income: "3,000" }, "2026-09": { expenses: "3,000", income: "3,000" } } });
  const s = summarize(o, new Date("2026-10-13T12:00:00-04:00"), { expenses: null, income: null });
  it("PF-107: today the horizon-end point's expenses equal the 12-month average (held flat); 3-month average differs", () => {
    const end = s.points.at(-1)!;
    assert.equal(end.future, true);
    assert.equal(s.average.expenses, 4000);
    assert.equal(end.expenses, s.average.expenses);
    assert.equal(s.average3.expenses, 2000);
  });
  it("PF-106: the share = horizon-end monthly coverage ÷ the horizon-end point's expenses", () => {
    const c = overviewCoverage(o, s, 4);
    const end = s.points.at(-1)!;
    assert.ok(c.status === "ok");
    assert.equal(round2(c.share), round2((end.net! * 0.04) / 12 / end.expenses!));
    assert.equal(round2(c.share), round2((end.net! * 0.04) / 12 / 4000));
  });
  it("PF-106: a missing horizon point → none, as before", () => {
    assert.deepEqual(overviewCoverage(o, { ...s, points: [] }, 4), { status: "none" });
  });
  it("PF-105 / PF-106: line 2 wording", () => {
    assert.equal(coverageRateNote("12.5%", 0.005, false, ["2026-07", "2026-08", "2026-09"]), "* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul\u2013Sep).");
    assert.equal(coverageRateNote("12.5%", 0.005, true, ["2026-07", "2026-08", "2026-09"]), "* 12.5% yearly, covers 0.50% of projected monthly expenses at horizon end (held at 12-month average).");
  });
});

describe("#132 the 12-month range (PF-115..PF-118)", () => {
  const TZ = "America/Toronto";
  const label = (at: string) => average12Label(lastTwelve(new Date(at), TZ));
  it("PF-115 / PF-116: Oct 14 2026 → 12-month average (Nov–Oct), the months the average uses", () => {
    assert.equal(label("2026-10-14T12:00:00-04:00"), "12-month average (Nov\u2013Oct)");
    const s = summarize(NO_OVERVIEW, new Date("2026-10-14T12:00:00-04:00"), { expenses: null, income: null }, undefined, TZ);
    assert.equal(average12Label(s.months), "12-month average (Nov\u2013Oct)");
    assert.deepEqual([s.months[0], s.months[11]], ["2025-11", "2026-10"]);
  });
  it("PF-117: rollover in Toronto: Oct 31 23:59 ET → Nov–Oct; Nov 1 00:00 ET → Dec–Nov; 2026-11-01T03:30Z → Nov–Oct; Jan → Feb–Jan", () => {
    assert.equal(label("2026-10-31T23:59:00-04:00"), "12-month average (Nov\u2013Oct)");
    assert.equal(label("2026-11-01T00:00:00-04:00"), "12-month average (Dec\u2013Nov)");
    assert.equal(label("2026-11-01T03:30:00Z"), "12-month average (Nov\u2013Oct)");
    assert.equal(label("2027-01-15T12:00:00-05:00"), "12-month average (Feb\u2013Jan)");
  });
  it("PF-118: the 3-month label is unchanged", () => {
    assert.equal(average3Label(completeMonths3(new Date("2026-10-14T12:00:00-04:00"), TZ)), "3-month average (Jul\u2013Sep)");
  });
});

describe("#140 the 12-month average over 12 complete months (PF-121..PF-125)", () => {
  const TZ = "America/Toronto";
  const P = { expenses: null, income: null };
  const at = (iso: string) => new Date(iso);
  it("PF-121: Oct 14 2026 → Oct 2025..Sep 2026, label Oct–Sep; the current month is excluded", () => {
    const s = summarize(ov({ months: { "2025-10": { expenses: "1,000", income: "" }, "2026-09": { expenses: "3,000", income: "" }, "2026-10": { expenses: "50,000", income: "" } } }), at("2026-10-14T12:00:00-04:00"), P, undefined, TZ);
    assert.deepEqual([s.window12[0], s.window12[11], s.window12.length], ["2025-10", "2026-09", 12]);
    assert.equal(average12Label(s.window12), "12-month average (Oct\u2013Sep)");
    assert.equal(s.average.expenses, 2000);
    assert.equal(s.thisMonth.expenses, 50000, "This month unchanged");
    assert.deepEqual([s.months[0], s.months[11]], ["2025-11", "2026-10"], "PF-126: chart months unchanged");
  });
  it("PF-122: rollover / timezone edges", () => {
    const label = (iso: string) => average12Label(completeMonths(at(iso), 12, TZ));
    assert.equal(label("2026-10-31T23:59:00-04:00"), "12-month average (Oct\u2013Sep)");
    assert.equal(label("2026-11-01T00:00:00-04:00"), "12-month average (Nov\u2013Oct)");
    assert.equal(label("2026-11-01T03:30:00Z"), "12-month average (Oct\u2013Sep)");
    assert.equal(label("2027-01-15T12:00:00-05:00"), "12-month average (Jan\u2013Dec)");
    assert.deepEqual(completeMonths(at("2027-01-15T12:00:00-05:00"), 12, TZ), ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    const o = ov({ months: { "2025-10": { expenses: "1,200", income: "" }, "2026-10": { expenses: "2,400", income: "" } } });
    assert.equal(summarize(o, at("2026-10-31T23:59:00-04:00"), P, undefined, TZ).average.expenses, 1200);
    assert.equal(summarize(o, at("2026-11-01T00:00:00-04:00"), P, undefined, TZ).average.expenses, 2400, "Oct 2026 completes, Oct 2025 leaves");
    assert.equal(summarize(o, at("2026-11-01T03:30:00Z"), P, undefined, TZ).average.expenses, 1200);
  });
  it("PF-123: fewer than 12 complete months with data → their mean; empty months left out; full-window label", () => {
    const s = summarize(ov({ months: { "2026-08": { expenses: "1,000", income: "500" }, "2026-09": { expenses: "2,000", income: "" } } }), at("2026-10-14T12:00:00-04:00"), P, undefined, TZ);
    assert.deepEqual(s.average, { expenses: 1500, income: 500 });
    assert.equal(average12Label(s.window12), "12-month average (Oct\u2013Sep)");
  });
  it("PF-124: no complete month with a figure → — ; 3-month —; Future not computed", () => {
    const o = ov({ start: "10,000", future: true, years: 1, months: { "2026-10": { expenses: "1,000", income: "2,000" } } });
    const s = summarize(o, at("2026-10-14T12:00:00-04:00"), P, undefined, TZ);
    assert.deepEqual(s.average, { expenses: null, income: null });
    assert.deepEqual(s.average3, { expenses: null, income: null });
    assert.equal(s.points.at(-1)!.net, null);
    assert.equal(overviewCoverage(o, s, 4).status, "none");
  });
  it("PF-125: the C8 fill and Future use the new average; Future-on coverage divides by it", () => {
    const o = ov({ start: "120,000", future: true, years: 1, months: { "2025-10": { expenses: "6,000", income: "9,000" }, "2026-09": { expenses: "2,000", income: "9,000" }, "2026-10": { expenses: "40,000", income: "9,000" } } });
    const s = summarize(o, at("2026-10-14T12:00:00-04:00"), P, undefined, TZ);
    assert.equal(s.average.expenses, 4000);
    assert.equal(round2(s.average3.expenses), round2((4000 + 4000 + 2000) / 3), "Jul, Aug take 4,000");
    assert.equal(s.points[0].expenses, 4000, "Nov 2025 (empty) plots the new average");
    assert.equal(s.points.at(-1)!.expenses, 4000);
    const c = overviewCoverage(o, s, 4);
    assert.ok(c.status === "ok");
    assert.equal(round2(c.share), round2((s.points.at(-1)!.net! * 0.04) / 12 / 4000));
  });
});

describe("#141 Q-T1 (CFO-changed): the 12-month label shows the count when fewer than 12 months have data (PF-129..PF-131)", () => {
  const TZ = "America/Toronto";
  const P = { expenses: null, income: null };
  const NOW = new Date("2026-10-14T12:00:00-04:00");
  const months = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, { expenses: "1,000", income: "" }]));
  const W = completeMonths(NOW, 12, TZ);
  it("PF-129: 12 of 12 → the dated label 12-month average (Oct–Sep)", () => {
    const s = summarize(ov({ months: months(W) }), NOW, P, undefined, TZ);
    assert.equal(s.window12WithData, 12);
    assert.equal(average12CountLabel(s.window12, s.window12WithData), "12-month average (Oct\u2013Sep)");
    const nov = summarize(ov({ months: months([...W.slice(1), "2026-10"]) }), new Date("2026-11-01T00:00:00-04:00"), P, undefined, TZ);
    assert.equal(average12CountLabel(nov.window12, nov.window12WithData), "12-month average (Nov\u2013Oct)");
  });
  it("PF-130: 8 of 12 → 12-month average (8 of 12 months), no range; an income-only month counts", () => {
    const m = months(W.slice(4, 11));
    m["2026-09"] = { expenses: "", income: "2,000" };
    const s = summarize(ov({ months: m }), NOW, P, undefined, TZ);
    assert.equal(s.window12WithData, 8);
    assert.equal(average12CountLabel(s.window12, s.window12WithData), "12-month average (8 of 12 months)");
    assert.equal(s.average.expenses, 1000, "calculation unchanged (Q-T1 is labelling only)");
  });
  it("PF-131: 0 of 12 (only the current month) → 12-month average (0 of 12 months), figures null (Q-T3)", () => {
    const s = summarize(ov({ months: { "2026-10": { expenses: "1,000", income: "2,000" } } }), NOW, P, undefined, TZ);
    assert.equal(s.window12WithData, 0);
    assert.equal(average12CountLabel(s.window12, 0), "12-month average (0 of 12 months)");
    assert.deepEqual(s.average, { expenses: null, income: null });
  });
});
