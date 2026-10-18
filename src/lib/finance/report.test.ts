import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_KEY } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import {
  CHART_TYPES,
  checkReport,
  GROUP_IDS,
  METRIC_IDS,
  missingSeries,
  parseReport,
  RANGE_PRESETS,
  type Report,
  reportError,
  reportText,
  SERIES_MAX,
} from "./report.ts";

// #153 (spec section 33): the shared report validator (PFR-05..PFR-11, PFR-15).
const ok: Report = {
  series: [{ kind: "line", id: "q1" }],
  range: { preset: "12m" },
  chart: "line",
};
const field = (v: unknown) => reportError(v)?.field;

describe("#153 report validator", () => {
  it("PFR-05: every allowed kind and id is accepted; others name their field", () => {
    const series = [
      { kind: "line", id: "a-1_B" },
      { kind: "account", id: "Chequing" },
      { kind: "category", id: "Home" },
      ...GROUP_IDS.map((id) => ({ kind: "group", id })),
      ...METRIC_IDS.map((id) => ({ kind: "metric", id })),
    ];
    assert.equal(reportError({ ...ok, series }), null);
    assert.equal(field({ ...ok, series: [{ kind: "pie", id: "x" }] }), "series.0.kind");
    for (const s of [
      { kind: "group", id: "other" },
      { kind: "metric", id: "coverage" },
      { kind: "line", id: "has space" },
      { kind: "line", id: "x".repeat(65) },
      { kind: "account", id: " " },
      { kind: "account", id: "a".repeat(41) },
      { kind: "category", id: 3 },
    ])
      assert.equal(
        field({ ...ok, series: [{ kind: "line", id: "q1" }, s] }),
        "series.1.id",
        JSON.stringify(s),
      );
  });

  it("PFR-06: 1..12 series, no duplicate kind + id", () => {
    assert.equal(field({ ...ok, series: [] }), "series");
    const many = Array.from({ length: SERIES_MAX + 1 }, (_, i) => ({ kind: "line", id: `l${i}` }));
    assert.equal(field({ ...ok, series: many.slice(0, SERIES_MAX) }), undefined);
    assert.equal(field({ ...ok, series: many }), "series");
    assert.equal(field({ ...ok, series: [ok.series[0], { kind: "line", id: "q1" }] }), "series");
    assert.equal(
      field({
        ...ok,
        series: [
          { kind: "account", id: "q1" },
          { kind: "line", id: "q1" },
        ],
      }),
      undefined,
    );
  });

  it("PFR-07 / PFR-08: presets and custom month ranges", () => {
    for (const preset of RANGE_PRESETS)
      assert.equal(reportError({ ...ok, range: { preset } }), null, preset);
    // #179: `all` is a saved preset now (spec 41); an unknown preset is still refused.
    assert.equal(reportError({ ...ok, range: { preset: "all" } }), null);
    assert.equal(field({ ...ok, range: { preset: "5y" } }), "range.preset");
    assert.equal(reportError({ ...ok, range: { from: "2025-10", to: "2027-09" } }), null); // 24 months
    assert.equal(reportError({ ...ok, range: { from: "2026-05", to: "2026-05" } }), null);
    for (const range of [
      { from: "2025-10", to: "2027-10" }, // 25 months
      { from: "2026-06", to: "2026-05" },
      { from: "2026-13", to: "2026-12" },
      { from: "1999-12", to: "2000-01" },
      { from: "2026-1", to: "2026-02" },
      { from: "2026-01-01", to: "2026-02" },
      { from: "2026-01" },
      { preset: "12m", from: "2026-01", to: "2026-02" },
      "12m",
    ])
      assert.equal(field({ ...ok, range }), "range", JSON.stringify(range));
  });

  it("PFR-09: chart types", () => {
    for (const chart of CHART_TYPES) assert.equal(reportError({ ...ok, chart }), null, chart);
    for (const chart of ["pie", "", undefined, 1]) assert.equal(field({ ...ok, chart }), "chart");
  });

  it("PFR-10: unknown keys and non-objects are refused", () => {
    for (const v of [null, [], "x", { ...ok, name: "Mine" }]) assert.equal(field(v), "report");
    assert.equal(field({ ...ok, series: [{ kind: "line", id: "q1", colour: "red" }] }), "series.0");
    assert.equal(reportError({ ...ok }), null);
  });

  it("canonical text: fixed key order; parseReport never throws", () => {
    const shuffled = {
      chart: "bar",
      range: { to: "2026-09", from: "2026-01" },
      series: [{ id: "q1", kind: "line" }],
    };
    const c = checkReport(shuffled);
    assert.ok(c.ok);
    assert.equal(
      reportText(c.report),
      '{"series":[{"kind":"line","id":"q1"}],"range":{"from":"2026-01","to":"2026-09"},"chart":"bar"}',
    );
    assert.deepEqual(parseReport(reportText(c.report)), c.report);
    for (const t of [null, "", "{", '{"series":[]}']) assert.equal(parseReport(t), null);
  });

  it("PFR-11: missing line / account / category series by index (shared and month lines); group / metric never", () => {
    const line = (id: string, account = "", category = "") => ({
      id,
      name: id,
      amount: "1",
      per: "month",
      equity: "",
      account,
      currency: "",
      rate: "",
      category,
    });
    const record = {
      [STORAGE_KEY]: JSON.stringify({
        fixed: [line("q1", "Chequing")],
        variable: [],
        accounts: ["Chequing", "Visa"],
        categories: ["Home"],
      }),
      [MONTHS_KEY]: JSON.stringify({
        "2026-06": { fixed: [line("m9")], variable: [], people: [] },
      }),
    };
    const r: Report = {
      ...ok,
      series: [
        { kind: "line", id: "q1" },
        { kind: "line", id: "gone" },
        { kind: "line", id: "m9" },
        { kind: "account", id: "Visa" },
        { kind: "account", id: "Amex" },
        { kind: "category", id: "Home" },
        { kind: "category", id: "Travel" },
        { kind: "group", id: "all" },
        { kind: "metric", id: "net-assets" },
      ],
    };
    assert.deepEqual(missingSeries(r, record), [1, 4, 6]);
    assert.deepEqual(missingSeries(r, null), [0, 1, 2, 3, 4, 5, 6]);
  });
});
