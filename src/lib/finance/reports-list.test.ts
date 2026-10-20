// #160 (spec 45; PFCL-03..05, PFCL-08): pure helpers for the Charts reports list.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atLimit, chartText, limitText, namedCount, rangeText, seriesSummary, torontoDate } from "./reports-list.ts";
import type { ReportItem } from "./charts-api.ts";

const item = (id: string, def = false): ReportItem => ({
  id, name: def ? "Default" : id, default: def, report: { series: [], range: { preset: "12m" }, chart: "line" },
  missing: [], deleted: [], labels: [], created_at: null, updated_at: null,
});
const named = (n: number) => Array.from({ length: n }, (_, i) => item(`r-${String(i).padStart(8, "0")}`));

describe("#160 reports list helpers", () => {
  it("PFCL-03 / Q-AJ3: Toronto date, whatever the process TZ", () => {
    assert.equal(torontoDate("2026-10-18T03:30:00Z"), "2026-10-17");
    assert.equal(torontoDate("2026-10-18T04:30:00Z"), "2026-10-18");
    assert.equal(torontoDate("2026-01-01T04:59:59Z"), "2025-12-31");
  });
  it("PFCL-04 / Q-AJ2: null or bad timestamp → null", () => {
    assert.equal(torontoDate(null), null);
    assert.equal(torontoDate("nope"), null);
  });
  it("PFCL-05 / Q-AJ5: first 3 labels, +N more, chart, range", () => {
    const r = { ...item("x"), labels: ["Rent", "Food", "Travel", "Amex"] };
    assert.equal(seriesSummary(r), "Rent, Food, Travel, +1 more · Line · Last 12 months");
    assert.equal(seriesSummary({ ...r, labels: ["Rent", "Food", "Travel"] }), "Rent, Food, Travel · Line · Last 12 months");
    assert.equal(seriesSummary({ ...r, labels: ["Rent"], report: { ...r.report, chart: "stacked-bar", range: { preset: "all" } } }), "Rent · Stacked bar · All data");
    assert.equal(rangeText({ from: "2025-01", to: "2025-12" }), "2025-01 to 2025-12");
    // QA M2: every preset, every chart type, and the stored custom shape { from, to }.
    assert.deepEqual((["3m", "6m", "12m", "24m", "ytd", "all"] as const).map((preset) => rangeText({ preset })), ["Last 3 months", "Last 6 months", "Last 12 months", "Last 24 months", "Year to date", "All data"]);
    assert.deepEqual((["line", "bar", "stacked-bar"] as const).map(chartText), ["Line", "Bar", "Stacked bar"]);
    assert.equal(seriesSummary({ labels: ["Rent"], report: { series: [], chart: "bar", range: { from: "2025-01", to: "2025-12" } } }), "Rent · Bar · 2025-01 to 2025-12");
  });
  it("PFCL-08 / Q-AJ7: 19 named → not at limit; 20 → at limit; the default is not counted", () => {
    assert.equal(atLimit({ reports: named(19), limit: 20 }), false);
    assert.equal(atLimit({ reports: [item("default", true), ...named(19)], limit: 20 }), false);
    assert.equal(namedCount([item("default", true), ...named(19)]), 19);
    assert.equal(atLimit({ reports: named(20), limit: 20 }), true);
    assert.equal(atLimit({ reports: [item("default", true), ...named(20)], limit: 20 }), true);
    assert.equal(limitText(20), "Limit of 20 reports reached.");
  });
});
