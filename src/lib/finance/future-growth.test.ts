// #226 (spec 63, AC PFFG): the scenario screen's Overview 'Future' line uses the chart's signed growth, negative
// included (the main page keeps its own rule: a negative growth is refused there and counts 0 %).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarize, type Overview } from "./overview.ts";
import { monthlyRate, projectNet } from "./projection.ts";
import { scenarioGrowthBad, scenarioGrowthOrZero } from "./scenario.ts";

const NOW = new Date("2026-10-15T12:00:00Z");
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
// Typed Update totals for the 12 complete months (income = expenses), as-of the first: net now = start, surplus 0.
const KEYS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const ov = (growth: string, start = "10000"): Overview => ({
  start,
  growth,
  future: true,
  years: 1,
  asOf: "2025-10",
  months: Object.fromEntries(KEYS.map((k) => [k, { expenses: "1000", income: "1000" }])),
});
// Surplus 0 (income = expenses) so the pinned values are growth alone.
const fut = (o: Overview, signed?: number) => {
  const s = summarize(o, NOW, { expenses: null, income: null }, undefined, undefined, signed);
  const now = s.points.find((p) => p.key === s.current)!.net as number;
  assert.equal(now, Number(o.start), "net now = start (surplus 0)");
  return { now: s.points.find((p) => p.key === s.current)!.net as number, f: s.points.filter((p) => p.future).map((p) => p.net as number) };
};

describe("#226 PFFG: Overview Future growth on the scenario screen", () => {
  it("PFFG-01: with the signed growth passed, the Future line equals the chart's projectNet, negative included", () => {
    for (const g of [-50, -10, -0.5, 0, 9, 50]) {
      const { now, f } = fut(ov(String(g)), g);
      const want = projectNet(now, 0, g, 12).slice(1);
      f.forEach((n, i) => near(n, want[i]));
    }
  });
  it("PFFG-02: pinned negative cases (10,000, surplus 0): -10 % → 9,000 after 12 months; -50 % → 5,000; month 1 at r_m", () => {
    near(fut(ov("-10"), -10).f[11], 9000);
    near(fut(ov("-50"), -50).f[11], 5000);
    near(fut(ov("-10"), -10).f[0], 10000 * (1 + monthlyRate(-10)));
    assert.ok(monthlyRate(-10) < 0 && Math.abs(monthlyRate(-10) - -0.1 / 12) > 1e-6, "r_m, never annual ÷ 12");
  });
  it("PFFG-03: the 9 % pinned case still holds (10,000 → 10,900; month 1 ≈ +0.7207 %), and SC3 still applies: no growth on ≤ 0", () => {
    near(fut(ov("9"), 9).f[11], 10900);
    near(fut(ov("9")).f[11], 10900);
    near(monthlyRate(9) * 100, 0.7207, 0.0001);
    // SC3 (#215, kept for both): growth only on a positive opening balance; the chart and the Overview share stepNet.
    for (const g of [-10, 9]) for (const n of projectNet(-5000, 0, g, 12)) assert.equal(n, -5000);
    for (const g of [-10, 9]) for (const n of fut(ov(String(g), "0"), g).f) assert.equal(n, 0);
  });
  it("PFFG-04: the main page is unchanged: without the signed growth a negative growth counts 0 %", () => {
    for (const n of fut(ov("-10")).f) near(n, 10000);
  });
  it("PFFG-05: the scenario's growth reader: signed in -50..+50; refused text or out of bound → 0 (as the chart)", () => {
    assert.equal(scenarioGrowthOrZero("-10"), -10);
    assert.equal(scenarioGrowthOrZero("-50"), -50);
    assert.equal(scenarioGrowthOrZero(""), 0);
    for (const t of ["-", "-51", "51", "abc"]) {
      assert.equal(scenarioGrowthBad(t), true, t);
      assert.equal(scenarioGrowthOrZero(t), 0, t);
    }
    assert.equal(scenarioGrowthBad("9"), false);
  });
});
