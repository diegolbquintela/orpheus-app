import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NET_BASIS_NONE, netBasis, overviewNow, project } from "./scenario.ts";
import { lastTwelve, NO_OVERVIEW, type Overview } from "./overview.ts";
import { projectNet } from "./projection.ts";

const NOW = new Date("2026-10-16T16:00:00Z");
const months = lastTwelve(NOW);
const flat = (income: number, expenses: number) => Object.fromEntries(months.map((k) => [k, { income, expenses }]));

describe("#222 scenario validation (spec 58)", () => {
  it("PFSV-31 (AO5): no as-of month: Starting net assets is the value at the start of the 12-month window, plus each month's surplus", () => {
    const ov: Overview = { ...NO_OVERVIEW, start: "85,000", growth: "" };
    const o = overviewNow(ov, NOW, { income: null, expenses: null }, flat(5000, 3000));
    assert.equal(o.net, 85000 + 12 * 2000);
    assert.equal(
      netBasis(ov, NOW, o.net, undefined, { income: null, expenses: null }, flat(5000, 3000)),
      // #228 (spec 64.4): the aligned basis sentence (the first month with figures here is November 2025).
      "Basis: no as-of month is set, so Starting net assets 85,000.00 counts from the start of November 2025 (the first month with figures), plus each month's own surplus to the end of October 2026; a month without figures adds nothing (the same as /series).",
    );
  });
  it("PFSV-32 (AO5): with an as-of month inside the window, the start is at the start of that month", () => {
    const ov: Overview = { ...NO_OVERVIEW, start: "85000", asOf: "2026-07", growth: "" };
    const o = overviewNow(ov, NOW, { income: null, expenses: null }, flat(5000, 3000));
    assert.equal(o.net, 85000 + 4 * 2000, "July..October");
    assert.equal(netBasis(ov, NOW, o.net), "Basis: Starting net assets 85,000.00 at the start of July 2026 (the as-of month), plus each month's own surplus to the end of October 2026; a month without figures adds nothing (the same as /series).");
  });
  it("PFSV-33 (AO5 / F2): no Overview figure → the stated basis says it starts at 0.00", () => {
    assert.equal(netBasis(NO_OVERVIEW, NOW, null), NET_BASIS_NONE);
    assert.match(NET_BASIS_NONE, /starts at 0\.00/);
  });
  it("PFSV-34 math audit: A = 17,143.65, B = -17,520 exactly, C = 4,102.37 ±0.01 at 9 %/yr over 12 months (shared step and the screen's projection)", () => {
    const end = (start: number, surplus: number) => projectNet(start, surplus, 9, 12)[12];
    assert.ok(Math.abs(end(10000, 500) - 17143.65) < 0.005, String(end(10000, 500)));
    assert.equal(end(0, -1460), -17520);
    assert.ok(Math.abs(end(-2000, 500) - 4102.37) <= 0.01, String(end(-2000, 500)));
    const p = (start: number, s: number) => project({ current: "2026-10", start, income: s > 0 ? s : 0, expenses: s > 0 ? 0 : -s, growth: 9, rate: 4 }, 12);
    assert.equal(p(10000, 500).points[12].net, 17143.65);
    assert.equal(p(0, -1460).points[12].net, -17520);
    assert.equal(p(-2000, 500).points[12].net, 4102.37);
  });
});
