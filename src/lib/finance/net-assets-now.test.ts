// #228 (spec 64, AC PFNA): 'Net assets now' is the manually entered net assets (Starting net assets, at its as-of month
// or the first month with figures) carried by each month's own surplus, the same on the Overview (main page and
// scenario screen) and on /series. AQ1: a saved Starting net assets with no month saved is named, not "every figure 0".
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeRates } from "./equity.ts";
import { writeExpenses } from "./expenses.ts";
import { savedOverviewFigures, writeMonths } from "./months.ts";
import { NO_OVERVIEW, readOverview, summarize, writeOverview, type Overview } from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import { basisNote, netBasis, NOTHING_SAVED, overviewNow, savedInputs, startOnlyNote } from "./scenario.ts";
import { seriesValues } from "./series.ts";

const NOW = new Date("2026-10-16T16:00:00Z"); // household month 2026-10
const NET = { kind: "metric", id: "net-assets" };
const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month" as const, equity: "", account: "", currency: "", rate: "", category: "" });
const person = { id: "p1", name: "Ana", wages: "60,000", bonus: "", tax: "0", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" };

/** A record: Starting net assets (+ as-of), typed Update totals, and months saved with lines (wages 5,000 a month). */
function record(o: Partial<Overview>, saved: Record<string, string> = {}): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: [] });
  writeRates(s, { withdrawal: "4", roic: "" });
  writeOverview(s, { ...NO_OVERVIEW, ...o });
  writeMonths(s, Object.fromEntries(Object.entries(saved).map(([k, rent]) => [k, { fixed: [line("rent", rent)], variable: [], people: [person] }])));
  return s.data;
}
const seriesNet = (r: PfRecord) => {
  const v = seriesValues({ series: [NET], range: { preset: "12m" } } as never, r, NOW);
  return new Map(v.months.map((k, i) => [k, v.series[0].values[i]]));
};
const overviewOf = (r: PfRecord) => {
  const s = new RecordStore(r);
  const lines = savedOverviewFigures(s, "2026-10");
  return { ov: readOverview(s), lines, sum: summarize(readOverview(s), NOW, { expenses: null, income: null }, lines) };
};
// The AO5 shape: a few saved months far apart with empty months between them (the gap QA saw).
const CASES: Record<string, PfRecord> = {
  "no as-of, gaps": record({ start: "100,000" }, { "2025-03": "4,000", "2026-02": "3,000", "2026-09": "2,000" }),
  "as-of before the data": record({ start: "100,000", asOf: "2025-01" }, { "2025-03": "4,000", "2026-09": "2,000" }),
  "as-of inside the window (back-fill)": record({ start: "100,000", asOf: "2026-06" }, { "2025-03": "4,000", "2026-09": "2,000" }),
  "typed Update totals only": record({ start: "50,000", months: { "2026-01": { expenses: "1,000", income: "3,000" }, "2026-05": { expenses: "2,000", income: "1,500" } } }),
};

describe("#228 PFNA: Net assets now, the same everywhere", () => {
  it("PFNA-01: the Overview's net assets now (end of the current month) equals /series at the current month", () => {
    for (const [name, r] of Object.entries(CASES)) {
      const { sum } = overviewOf(r);
      const now = sum.points.find((p) => p.key === sum.current)!.net;
      assert.equal(now, seriesNet(r).get("2026-10"), name);
      assert.notEqual(now, null, name);
    }
  });
  it("PFNA-02: every Overview net-assets point in the 12-month window equals /series' 12m values", () => {
    for (const [name, r] of Object.entries(CASES)) {
      const { sum } = overviewOf(r);
      const ser = seriesNet(r);
      for (const p of sum.points) assert.equal(p.net, ser.get(p.key) ?? null, `${name} ${p.key}`);
    }
  });
  it("PFNA-03: empty months add nothing (never the 12-month average): 100,000 + 1,000 + 2,000 + 3,000 + 3,000 (Oct, the #199 copy of Sep) = 109,000", () => {
    const { sum } = overviewOf(CASES["no as-of, gaps"]);
    assert.equal(sum.points.at(-1)!.net, 109000);
  });
  it("PFNA-04: the scenario screen's seeded 'Net assets now' (Overview's own value) and its Today column are the same figure", () => {
    for (const [name, r] of Object.entries(CASES)) {
      const { ov, lines } = overviewOf(r);
      const want = seriesNet(r).get("2026-10");
      assert.equal(overviewNow(ov, NOW, { expenses: null, income: null }, lines).net, want, name);
      assert.equal(savedInputs(r, NOW).start, want, name);
    }
  });
  it("PFNA-05: Future projects from the aligned value (growth 0: now + 12 × the average surplus)", () => {
    const r = CASES["typed Update totals only"];
    const s = new RecordStore(r);
    const ov = { ...readOverview(s), future: true, years: 1 as const };
    const sum = summarize(ov, NOW, { expenses: null, income: null }, savedOverviewFigures(s, "2026-10"));
    const now = seriesNet(r).get("2026-10")!;
    assert.equal(now, 50000 + 2000 - 500);
    assert.equal(sum.points.at(-1)!.net, now + 12 * ((3000 + 1500) / 2 - (1000 + 2000) / 2));
  });
  it("PFNA-06 (AQ1): Starting net assets saved, no month saved: net assets now is the typed 85,000 (not 0, not none)", () => {
    const r = record({ start: "85,000" });
    const { ov, lines, sum } = overviewOf(r);
    assert.equal(sum.points.at(-1)!.net, 85000);
    assert.equal(overviewNow(ov, NOW, { expenses: null, income: null }, lines).net, 85000);
    // Nothing typed at all: still no figure (unchanged).
    assert.equal(overviewOf(record({})).sum.points.at(-1)!.net, null);
  });
  it("PFNA-07: the scenario's basis line states the aligned rule", () => {
    const { ov, lines } = overviewOf(CASES["no as-of, gaps"]);
    assert.equal(
      netBasis(ov, NOW, 109000, undefined, { expenses: null, income: null }, lines),
      "Basis: no as-of month is set, so Starting net assets 100,000.00 counts from the start of March 2025 (the first month with figures), plus each month's own surplus to the end of October 2026; a month without figures adds nothing (the same as /series).",
    );
    const a = overviewOf(record({ start: "85,000" }));
    assert.equal(netBasis(a.ov, NOW, 85000, undefined, { expenses: null, income: null }, a.lines), "Basis: Starting net assets 85,000.00 as entered; no month has figures yet.");
  });
  it("PFNA-08 (AQ1): the banner names a saved Starting net assets when no month is saved; nothing typed keeps NOTHING_SAVED", () => {
    assert.equal(basisNote(null, "2026-10", false, 85000), startOnlyNote(85000));
    assert.equal(startOnlyNote(85000), "No months saved yet: income and expenses start at 0; net assets start at your Starting net assets (85,000.00).");
    assert.equal(basisNote(null, "2026-10", false, null), NOTHING_SAVED);
    assert.equal(basisNote(null, "2026-10", false, 0), NOTHING_SAVED);
    assert.equal(basisNote(null, "2026-10", true, 85000), "Based on this month's saved figures (October 2026).");
  });
});
