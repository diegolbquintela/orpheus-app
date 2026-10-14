import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asOverview,
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
    assert.deepEqual(s.average, PAGE);
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
    assert.deepEqual(s.average, { expenses: 2875, income: 10100 });
    assert.equal(surplusOf(s.thisMonth), 9450);
    assert.equal(surplusOf(s.average), 7225);
    // Net assets: 10,000 + 10 × 7,225 + 5,000 + 9,450.
    assert.equal(s.points[11].net, 96700);
    // Empty months plot the average.
    assert.equal(s.points[0].expenses, 2875);
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
  it("months outside the last 12 are kept but unused", () => {
    const o = setMonth(NO_OVERVIEW, "2025-10", { expenses: "99" });
    assert.deepEqual(summarize(o, NOW, PAGE).average, PAGE);
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
    assert.equal(s1.points[23].expenses, 2875);
    assert.equal(s1.points[23].income, 10100);
    assert.equal(round2(s1.points[23].net), 190204.37);
    const s5 = summarize(
      { ...base, start: "10,000", growth: "5", future: true, years: 5 },
      NOW,
      PAGE,
    );
    assert.equal(s5.points.length, 72);
    assert.equal(round2(s5.points[71].net), 613370.68);
  });
  it("growth 0 or bad: the surplus only", () => {
    const s = summarize(
      { ...base, start: "10,000", growth: "x", future: true, years: 1 },
      NOW,
      PAGE,
    );
    assert.equal(s.points[23].net, 96700 + 12 * 7225);
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
  it("PF-86: 3-month average = mean of the last 3 months, empty months taking the 12-month average", () => {
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

