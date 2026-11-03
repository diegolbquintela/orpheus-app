// #280 (personal-finance-spec §85, AC PFCH-01..03): the chart titles and subtitles, and the findings behind keeping two
// charts on the scenario screen, pinned on one fixture through the same functions the two charts plot
// (Overview: `summarize(…, signed growth, chartSurplus)`; Projected path: `project(overviewNow → Inputs, horizon)`).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_OVERVIEW, summarize } from "./overview.ts";
import { overviewNow, parseGrowth, project, scenarioGrowthOrZero } from "./scenario.ts";
import { chartAria, COMPARE_CHART_TITLE, compareChartSub, OVERVIEW_CHART_TITLE, overviewChartSub, projectedChartSub, projectedChartTitle } from "./chart-titles.ts";

describe("#280 PFCH-01: chart titles and subtitles", () => {
  it("each chart says what it plots", () => {
    assert.equal(OVERVIEW_CHART_TITLE, "Last 12 months");
    // #280 Q-CH2 (2026-11-02): one subtitle on every screen, recorded history ending this month (no forward years).
    assert.equal(overviewChartSub("2026-10"), "Income, expenses and net assets for each month up to October 2026 (recorded history).");
    assert.equal(overviewChartSub("2027-01"), "Income, expenses and net assets for each month up to January 2027 (recorded history).");
    assert.doesNotMatch(overviewChartSub("2026-10"), /ahead|year|average/);
    assert.equal(projectedChartTitle("12 months"), "Next 12 months from now");
    assert.equal(projectedChartTitle("3 years"), "Next 3 years from now");
    assert.equal(projectedChartSub("2026-10"), "Flat forward projection: this screen's October 2026 income and expenses held flat, starting from Net assets now.");
    assert.equal(COMPARE_CHART_TITLE, "Net assets by scenario");
    assert.equal(compareChartSub("5 years"), "This screen and the saved scenario, each projected over 5 years from its own net assets now.");
    // #299 Q5 (PF2C-19): plural with 2 saved picks.
    assert.equal(compareChartSub("5 years", 1), "This screen and the saved scenario, each projected over 5 years from its own net assets now.");
    assert.equal(compareChartSub("5 years", 2), "This screen and the saved scenarios, each projected over 5 years from its own net assets now.");
    assert.deepEqual(chartAria("x"), { "aria-labelledby": "x-title", "aria-describedby": "x-sub" });
  });
});

// The findings fixture (spec §85 table): six recorded months, Starting net assets 10,000, growth 5 %.
const now = new Date("2026-10-16T16:00:00Z");
const lines = { "2026-05": { expenses: 2800, income: 7000 }, "2026-06": { expenses: 3200, income: 7400 }, "2026-07": { expenses: 2500, income: 7000 }, "2026-08": { expenses: 3500, income: 7600 }, "2026-09": { expenses: 3000, income: 7500 }, "2026-10": { expenses: 3100, income: 7500 } };
const page = { expenses: 3100, income: 7500 };
const charts = (future: boolean, horizon = 12) => {
  const ov = { ...NO_OVERVIEW, start: "10,000", growth: "5", future, years: 1 as const };
  const s = summarize(ov, now, page, lines, undefined, scenarioGrowthOrZero(ov.growth), true);
  const o = overviewNow(ov, now, page, lines);
  const p = project({ current: o.current, start: o.net ?? 0, income: o.income, expenses: o.expenses, growth: parseGrowth(ov.growth) ?? 0, rate: null }, horizon);
  return { overview: s.points, projected: p.points };
};
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

describe("#280 PFCH-02/03: what each chart plots (findings, pinned; projection math unchanged)", () => {
  it("PFCH-02: Overview = the 12 recorded months to this month (history; flows per month, 12-month average where empty; net from Starting net assets, none before the first month)", () => {
    const { overview } = charts(false);
    assert.equal(overview.length, 12);
    assert.deepEqual([overview[0].key, overview.at(-1)!.key], ["2025-11", "2026-10"]);
    assert.deepEqual(overview.map((p) => p.income), [7300, 7300, 7300, 7300, 7300, 7300, 7000, 7400, 7000, 7600, 7500, 7500]);
    assert.deepEqual(overview.map((p) => p.expenses), [3000, 3000, 3000, 3000, 3000, 3000, 2800, 3200, 2500, 3500, 3000, 3100]);
    assert.deepEqual(overview.map((p) => r2(p.net)), [null, null, null, null, null, null, 14200, 18400, 22900, 27000, 31500, 35900]);
    assert.ok(overview.every((p) => !p.future));
  });
  it("PFCH-03: Projected path = Now + the horizon, this month's flows held flat; with Future on, Overview's future NET equals it but its flows are 12-month averages", () => {
    const { overview, projected } = charts(true);
    assert.equal(projected.length, 13);
    assert.deepEqual([projected[0].key, projected[0].label, projected.at(-1)!.key], ["2026-10", "Now", "2027-10"]);
    assert.ok(projected.every((p) => p.income === 7500 && p.expenses === 3100));
    assert.deepEqual(projected.map((p) => p.net), [35900, 40446.26, 45011.04, 49594.42, 54196.48, 58817.28, 63456.91, 68115.44, 72792.95, 77489.52, 82205.22, 86940.14, 91694.34]);
    assert.equal(overview.length, 24);
    const tail = overview.slice(11);
    assert.deepEqual(tail.map((p) => r2(p.net)), projected.map((p) => p.net), "net path identical over the overlap");
    assert.ok(overview.slice(12).every((p) => p.future && p.income === 7300 && p.expenses === 3000), "Overview's future flows are the 12-month averages");
    assert.equal(charts(true, 60).projected.length, 61, "only Projected path follows the horizon");
    assert.equal(charts(true, 60).overview.length, 24);
  });
});
