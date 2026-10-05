// The book (epic #53 ticket 5, #58; spec §0.2 "Book", §9, DR5-02..05): the weighting behind the metrics
// sheet's `Book` row and the donut's slices. Pure functions, no database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPortfolioCell } from "./format.ts";
import { PIE_MAX_SLICES, piePct, pieSlices } from "./pie.ts";
import { portfolioMetrics } from "./portfolio.ts";

const ok = (value: string) => ({ value, status: "ok" });
const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-12;

describe("DR5-03/04: book figure = weight-weighted mean over the holdings that have a figure", () => {
  // Market values A 100, B 300, C 600 (total 1,000); D has no price (no weight at all).
  const rows = [
    { symbol: "A", value: 100 },
    { symbol: "B", value: 300 },
    { symbol: "C", value: 600 },
    { symbol: "D", value: null },
  ];

  it("every holding has a figure: plain weighted mean, 100% covered", () => {
    const views = { A: { coverage: "covered", metrics: { m: ok("0.10") } }, B: { coverage: "covered", metrics: { m: ok("0.20") } }, C: { coverage: "covered", metrics: { m: ok("0.30") } } };
    const p = portfolioMetrics(rows, views, ["m"]).m;
    assert.ok(close(p.value, 0.1 * 0.1 + 0.3 * 0.2 + 0.6 * 0.3)); // 0.25
    assert.equal(p.coverage, 1);
    assert.equal(formatPortfolioCell("m", p).text, "25.0% · 100% covered");
  });

  it("dashes are left out and the remaining weights renormalised, never counted as zero", () => {
    // B is n/m, C is not covered → only A counts: the figure is A's own (10%), not 10% × 0.1 = 1%.
    const views = { A: { coverage: "covered", metrics: { m: ok("0.10") } }, B: { coverage: "covered", metrics: { m: { value: null, status: "n/m" } } }, C: { coverage: "not_covered", metrics: {} } };
    const p = portfolioMetrics(rows, views, ["m"]).m;
    assert.ok(close(p.value, 0.1));
    assert.ok(close(p.coverage, 0.1));
    assert.deepEqual(p.included, ["A"]);
    assert.equal(formatPortfolioCell("m", p).text, "10.0% · 10% covered");
  });

  it("two of three: weights renormalised over A and C (100 : 600), B's dash excluded", () => {
    const views = {
      A: { coverage: "covered", metrics: { m: ok("0.40") } },
      B: { coverage: "covered", metrics: { m: { value: null, status: "insufficient_history" } } },
      C: { coverage: "covered", metrics: { m: ok("-0.05") } }, // negative values count as they are
    };
    const p = portfolioMetrics(rows, views, ["m"]).m;
    assert.ok(close(p.value, (100 * 0.4 + 600 * -0.05) / 700)); // 1.43%; counting B as 0 would give 1.0%
    assert.ok(close(p.coverage, 0.7));
    assert.equal(formatPortfolioCell("m", p).text, "1.4% · 70% covered");
  });

  it("a holding with no price is outside both the weights and the coverage", () => {
    const views = { A: { coverage: "covered", metrics: { m: ok("0.10") } }, B: { coverage: "covered", metrics: { m: ok("0.10") } }, C: { coverage: "covered", metrics: { m: ok("0.10") } }, D: { coverage: "covered", metrics: { m: ok("9") } } };
    const p = portfolioMetrics(rows, views, ["m"]).m;
    assert.ok(close(p.value, 0.1));
    assert.equal(p.coverage, 1);
    assert.ok(!p.included.includes("D"));
  });

  it("no holding has a figure: the book shows '—' alone (not '— · 0% covered', not 0.0%)", () => {
    const views = { A: { coverage: "pending", metrics: {} }, B: { coverage: "covered", metrics: { m: { value: null, status: "n/m" } } }, C: { coverage: "not_covered", metrics: {} } };
    const p = portfolioMetrics(rows, views, ["m"]).m;
    assert.equal(p.value, null);
    assert.equal(p.coverage, 0);
    assert.equal(formatPortfolioCell("m", p).text, "—");
    assert.equal(formatPortfolioCell("eps_1y", p).text, "—");
    assert.equal(formatPortfolioCell("eps_1y", p).label, "EPS growth 1y (weighted)");
    // Nothing valued at all → "—" too.
    assert.equal(formatPortfolioCell("m", portfolioMetrics([{ symbol: "D", value: null }], views, ["m"]).m).text, "—");
  });

  it("the EPS chip's book figure is the weighted 1y EPS growth (D9), not a weighted EPS amount", () => {
    const views = { A: { coverage: "covered", metrics: { eps_1y: ok("3.04"), eps_g_1y: ok("0.20") } }, B: { coverage: "covered", metrics: { eps_1y: ok("100"), eps_g_1y: ok("0.10") } }, C: { coverage: "not_covered", metrics: {} } };
    const p = portfolioMetrics(rows, views, ["eps_1y"]).eps_1y;
    assert.equal(p.source, "eps_g_1y");
    assert.ok(close(p.value, (100 * 0.2 + 300 * 0.1) / 400));
  });
});

describe("DR5-02: donut slices = the rows' share of the book, largest first, Other past ten names", () => {
  // 13 valued holdings in scrambled order, values 1..13 (two ties at 7), plus one with no price.
  const values: [string, number][] = [["K", 3], ["B", 12], ["M", 1], ["A", 13], ["H", 7], ["G", 7], ["C", 11], ["L", 2], ["E", 9], ["D", 10], ["F", 8], ["I", 5], ["J", 4]];
  const rows = [...values.map(([symbol, value]) => ({ symbol, value, status: "ok" })), { symbol: "Z", value: null, status: "price_pending" }];
  const total = values.reduce((s, [, v]) => s + v, 0);

  it("largest first (ties by ticker), the ten largest keep a slice, the rest is one 'Other'", () => {
    const { slices } = pieSlices(rows);
    assert.equal(PIE_MAX_SLICES, 10);
    assert.equal(slices.length, 11);
    assert.deepEqual(slices.map((s) => s.label), ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "Other"]);
    assert.deepEqual(slices[10].symbols, ["K", "L", "M"]);
    assert.equal(slices[10].value, 3 + 2 + 1);
    for (let i = 1; i < 10; i++) assert.ok(slices[i - 1].value >= slices[i].value, "largest first");
    assert.ok(Math.abs(slices.reduce((s, x) => s + x.pct, 0) - 100) < 1e-9);
    assert.equal(piePct(slices[0].pct), piePct((13 / total) * 100));
    assert.ok(!slices.some((s) => s.symbols.includes("Z")), "no price → no slice");
  });

  it("exactly ten valued names: no Other; eleven: Other holds the smallest one", () => {
    assert.ok(!pieSlices(rows.slice(0, 10)).slices.some((s) => s.label === "Other"));
    const eleven = pieSlices(rows.slice(0, 11)).slices;
    assert.equal(eleven.length, 11);
    assert.equal(eleven[10].label, "Other");
    assert.deepEqual(eleven[10].symbols, ["M"]);
  });

  it("no valued holding: no slices (the page then shows no donut)", () => {
    assert.deepEqual(pieSlices([{ symbol: "Z", value: null, status: "price_pending" }]).slices, []);
  });
});
