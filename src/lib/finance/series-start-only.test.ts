import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_OVERVIEW, OVERVIEW_KEY, type Overview } from "./overview.ts";
import { MONTHS_KEY } from "./months.ts";
import { seriesValues, type SeriesQuery } from "./series.ts";

// #239 (spec 71, AC PFSN): /series with only a Starting net assets saved returns the start as the current month's
// net-assets point (the Overview's #228 AQ1 rule). Runs under TZ=UTC and TZ=America/Los_Angeles; household month is Toronto's.
const NOW = new Date("2026-10-16T16:00:00Z");
const rec = (o: Partial<Overview>) => ({ [OVERVIEW_KEY]: JSON.stringify({ ...NO_OVERVIEW, ...o }) });
const NET: SeriesQuery["series"] = [{ kind: "metric", id: "net-assets" }];
const q = (range: SeriesQuery["range"], series = NET): SeriesQuery => ({ series, range });

describe("#239 PFSN: /series with only Starting net assets", () => {
  it("PFSN-01: all preset gives one point, the current month, valued at the start", () => {
    const r = seriesValues(q({ preset: "all" }), rec({ start: "85000" }), NOW);
    assert.deepEqual(r.months, ["2026-10"]);
    assert.deepEqual(r.series[0].values, [85000]);
    assert.equal(r.net_assets_from, "2026-10");
    assert.equal(r.partial, true);
  });
  it("PFSN-02: 12m preset: null before the current month, the start at it", () => {
    const r = seriesValues(q({ preset: "12m" }), rec({ start: "85000" }), NOW);
    assert.equal(r.months.length, 12);
    assert.deepEqual(r.series[0].values, [...Array(11).fill(null), 85000]);
  });
  it("PFSN-03: a custom range ending before the current month has no point", () => {
    const r = seriesValues(q({ from: "2026-01", to: "2026-09" }), rec({ start: "85000" }), NOW);
    assert.ok(r.series[0].values.every((v) => v === null));
    assert.equal(r.net_assets_from, "2026-10");
  });
  it("PFSN-04: no start typed (empty) and no record keep no anchor, all null", () => {
    const r = seriesValues(q({ preset: "12m" }), rec({ start: "" }), NOW);
    assert.equal(r.net_assets_from, null);
    assert.ok(r.series[0].values.every((v) => v === null));
    const z = seriesValues(q({ preset: "12m" }), null, NOW);
    assert.equal(z.net_assets_from, null);
  });
  it("PFSN-05: income / expenses / surplus stay null (no months)", () => {
    const s: SeriesQuery["series"] = [{ kind: "metric", id: "income" }, { kind: "metric", id: "expenses" }, { kind: "metric", id: "surplus" }];
    const r = seriesValues(q({ preset: "3m" }, s), rec({ start: "85000" }), NOW);
    for (const x of r.series) assert.deepEqual(x.values, [null, null, null]);
  });
  it("PFSN-06: once a month is saved, the anchor is that month as before (unchanged)", () => {
    const r = seriesValues(q({ preset: "3m" }), { ...rec({ start: "85000", months: { "2026-09": { expenses: "1000", income: "3000" } } }), [MONTHS_KEY]: "{}" }, NOW);
    assert.equal(r.net_assets_from, "2026-09");
    assert.deepEqual(r.series[0].values, [null, 87000, 87000]);
  });
  it("PFSN-07: an as-of month still wins (unchanged)", () => {
    const r = seriesValues(q({ preset: "3m" }), rec({ start: "85000", asOf: "2026-08" } as Partial<Overview>), NOW);
    assert.equal(r.net_assets_from, "2026-08");
    assert.deepEqual(r.series[0].values, [85000, 85000, 85000]);
  });
});
