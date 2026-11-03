// #241 (spec 74, AC PFAV-01..03): the scenario screen's Overview 'Future' line adds the chart's surplus (the current
// month's income − expenses), not the 12-month average; the main page (and the CFO API, which calls summarize the
// main way) keep the average.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { asOverview, overviewCoverage, summarize, type Overview } from "./overview.ts";
import { overviewNow, project } from "./scenario.ts";

const NOW = new Date("2026-10-15T12:00:00Z");
const KEYS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const PAGE = { expenses: null, income: null };
// 12 complete months: surplus 2,000 each (the 12-month average); the current month 2026-10: surplus 2,500.
const ov = (growth: string, years: 1 | 5 = 1, current = { expenses: "1500", income: "4000" }): Overview => ({
  start: "10000",
  growth,
  future: true,
  years,
  asOf: "2025-10",
  months: { ...Object.fromEntries(KEYS.map((k) => [k, { expenses: "1000", income: "3000" }])), "2026-10": current },
});
const future = (o: Overview, g: number, chart: boolean) =>
  summarize(o, NOW, PAGE, undefined, undefined, g, chart).points.filter((p) => p.future).map((p) => p.net as number);
const chart = (o: Overview, g: number) => {
  const n = overviewNow(o, NOW, PAGE, undefined);
  return project({ current: n.current, start: n.net ?? 0, income: n.income, expenses: n.expenses, growth: g, rate: null }, o.years * 12).points.map((p) => p.net);
};
const cents = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.005, `${a} vs ${b}`);

describe("#241 PFAV: scenario Overview Future uses the chart's surplus", () => {
  it("PFAV-01: each Future month adds the current month's surplus; the last point = the chart's month 12 (to the cent)", () => {
    const o = ov("0");
    const f = future(o, 0, true);
    const now = summarize(o, NOW, PAGE, undefined, undefined, 0, true).points.find((p) => p.key === "2026-10")!.net as number;
    cents(f[0] - now, 2500);
    cents(f[11], now + 12 * 2500);
    cents(f[11], chart(o, 0)[12]);
    assert.ok(Math.abs(future(o, 0, false)[11] - f[11]) > 1000, "differs from the average path");
  });
  it("PFAV-02: positive, negative and zero growth, 1 and 5 years: every Future month equals the chart's", () => {
    for (const g of [-50, -10, 0, 7, 9, 50])
      for (const y of [1, 5] as const) {
        const o = ov(String(g), y);
        const f = future(o, g, true);
        const c = chart(o, g).slice(1);
        assert.equal(f.length, c.length);
        f.forEach((n, i) => cents(n, c[i]));
      }
  });
  it("PFAV-02b: no income figure anywhere (income shown as —) counts income 0, as the chart", () => {
    const o: Overview = { ...ov("9"), months: Object.fromEntries([...KEYS, "2026-10"].map((k) => [k, { expenses: "1000", income: "" }])) };
    assert.equal(summarize(o, NOW, PAGE, undefined, undefined, 9, true).points.find((p) => p.key === "2026-10")!.income, null);
    const f = future(o, 9, true);
    chart(o, 9).slice(1).forEach((n, i) => cents(f[i], n));
  });
  it("PFAV-03: without the chart surplus (main page / CFO API) the Future line still adds the 12-month average", () => {
    const o = ov("0");
    const s = summarize(o, NOW, PAGE);
    const now = s.points.find((p) => p.key === "2026-10")!.net as number;
    const f = s.points.filter((p) => p.future).map((p) => p.net as number);
    cents(f[0] - now, 2000);
    cents(f[11], now + 12 * 2000);
    assert.deepEqual(future(o, 0, false), future(o, 0, false));
  });
});

// #260 (spec 90, AC PFAV2-01/02, CFO Q1/Q2): on the scenario screen (chart surplus) the projected months hold this
// month's figures (overviewNow), so the Overview's coverage share is the Totals' share; the main page keeps the average.
describe("#260 PFAV2: scenario Overview projected figures on the chart basis", () => {
  const D = new Date(Date.UTC(2026, 9, 11, 16));
  const P = { expenses: 1500, income: 12033.33 };
  const fx = (years: 1 | 5) =>
    asOverview({ start: "10,000", growth: "5", future: true, years, months: { "2026-06": { expenses: "4,000", income: "9,000" }, "2026-10": { expenses: "1,500", income: "12,033.33" } } });
  it("PFAV2-01: chart surplus → every projected point holds overviewNow's income / expenses; without it, the 12-month average", () => {
    for (const years of [1, 5] as const) {
      const o = fx(years);
      const n = overviewNow(o, D, P, undefined);
      const sc = summarize(o, D, P, undefined, undefined, 5, true).points.filter((p) => p.future);
      assert.equal(sc.length, years * 12);
      for (const p of sc) assert.deepEqual([p.income, p.expenses], [n.income, n.expenses]);
      const main = summarize(o, D, P).points.filter((p) => p.future);
      for (const p of main) assert.deepEqual([p.income, p.expenses], [9000, 4000], "main page: the 12-month average (June alone)");
    }
  });
  it("PFAV2-02: the scenario Overview coverage share equals project().totals.coverageShare: 34.68% (1 year), 165.98% (5 years)", () => {
    for (const [years, want] of [[1, "34.68"], [5, "165.98"]] as const) {
      const o = fx(years);
      const c = overviewCoverage(o, summarize(o, D, P, undefined, undefined, 5, true), 4);
      const n = overviewNow(o, D, P, undefined);
      const t = project({ current: n.current, start: n.net ?? 0, income: n.income, expenses: n.expenses, growth: 5, rate: 4 }, years * 12).totals;
      assert.equal(c.status, "ok");
      if (c.status !== "ok") return;
      assert.equal((c.share! * 100).toFixed(2), want);
      assert.equal((t.coverageShare! * 100).toFixed(2), want);
      const m = overviewCoverage(o, summarize(o, D, P), 4);
      assert.ok(m.status === "ok" && (m.share! * 100).toFixed(2) !== want, "the main page keeps its 12-month-average share");
    }
  });
});
