// #247 (personal-finance-spec §68, AC PFOS-09): `selectedFigures` reads the selected month; `summarize` is unchanged.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_OVERVIEW, type Overview, selectedFigures, summarize } from "./overview.ts";

const NOW = new Date(Date.UTC(2026, 9, 11, 16)); // 11 October 2026 (Toronto): the current month is 2026-10
const page = { expenses: 1000, income: 3000 };
const lines = { "2026-08": { expenses: 700, income: 2000 }, "2026-10": { expenses: 1000, income: 3000 }, "2026-12": { expenses: 2000, income: 4000 } };
const overview: Overview = { ...NO_OVERVIEW, months: { "2027-01": { expenses: "50", income: "" } } };

describe("#247 PFOS-09 selectedFigures", () => {
  const summary = summarize(overview, NOW, page, lines);
  it("the current month (or none) is summary.thisMonth exactly", () => {
    assert.deepEqual(selectedFigures(summary, overview, "2026-10", page, lines), { key: "2026-10", figures: summary.thisMonth });
    assert.deepEqual(selectedFigures(summary, overview, null, page, lines), { key: "2026-10", figures: summary.thisMonth });
    assert.deepEqual(selectedFigures(summary, overview, undefined, page, lines).key, "2026-10");
  });
  it("a future or past month: its own lines", () => {
    assert.deepEqual(selectedFigures(summary, overview, "2026-12", page, lines).figures, { expenses: 2000, income: 4000 });
    assert.deepEqual(selectedFigures(summary, overview, "2026-08", page, lines).figures, { expenses: 700, income: 2000 });
  });
  it("no lines: typed totals, else null (never the page's current figures)", () => {
    assert.deepEqual(selectedFigures(summary, overview, "2027-01", page, lines).figures, { expenses: 50, income: null });
    assert.deepEqual(selectedFigures(summary, overview, "2027-03", page, lines).figures, { expenses: null, income: null });
    assert.deepEqual(selectedFigures(summary, overview, "2027-03", page).figures, { expenses: null, income: null });
  });
  it("summarize (the #245 /api/cfo/pf/overview input) is the same whatever is selected", () => {
    const before = JSON.stringify(summarize(overview, NOW, page, lines));
    selectedFigures(summary, overview, "2026-12", page, lines);
    assert.equal(JSON.stringify(summarize(overview, NOW, page, lines)), before);
    assert.equal(summary.current, "2026-10");
  });
});
