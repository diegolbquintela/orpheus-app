// #241 (spec 74, AC PFAV-01..03): the scenario screen's Overview 'Future' line adds the chart's surplus (the current
// month's income − expenses), not the 12-month average; the main page (and the CFO API, which calls summarize the
// main way) keep the average.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarize, type Overview } from "./overview.ts";
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
