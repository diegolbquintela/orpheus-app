// QA D2 (#65): dashboard-book.mjs recomputes the Book figure from unrounded data, so a low-coverage chip
// matches the page (it used to rebuild it from the rounded 1-decimal weights and expected 62.97% for a figure
// that really is 62.60% at 8.29% coverage).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookText, expectedBookFigure, matchesAtDisplayPrecision } from "../qa/tools/book-math.mjs";
import { portfolioMetrics } from "../src/lib/dashboard/portfolio.ts";
import { formatPortfolioCell } from "../src/lib/dashboard/format.ts";

const ok = (value) => ({ value: String(value), status: "ok" });
// 13 holdings; only two small ones have a ROIC (8.29% of the book), so their rounded weights (1.2%, 7.1%)
// carry most of the error: the rounded rebuild gives ~62.97%, the real figure is 62.60%.
const rows = [
  { symbol: "A", value: 1245.0 }, { symbol: "B", value: 7045.0 },
  ...["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"].map((symbol, i) => ({ symbol, value: 8245.0 + i * 13.7 })),
  { symbol: "P", value: null },
];
const metrics = {
  A: { coverage: "covered", metrics: { roic_1y: ok(0.9), eps_g_1y: ok(0.1) } },
  B: { coverage: "covered", metrics: { roic_1y: ok(0.575), eps_g_1y: ok(-0.2) } },
  C: { coverage: "covered", metrics: { roic_1y: { value: null, status: "n/m" } } },
  D: { coverage: "not_covered", metrics: {} },
  P: { coverage: "covered", metrics: { roic_1y: ok(5) } }, // not valued: outside the book
};

describe("QA D2: Book figure from unrounded data (dashboard-book.mjs)", () => {
  const exp = expectedBookFigure(rows, metrics, "roic_1y");

  it("low coverage: weighted over the holdings with a figure, coverage of the whole book", () => {
    const total = rows.filter((r) => r.value).reduce((s, r) => s + r.value, 0);
    assert.ok(Math.abs(exp.coverage - (1245 + 7045) / total) < 1e-12);
    assert.ok(exp.coverage > 0.08 && exp.coverage < 0.09, String(exp.coverage));
    assert.ok(Math.abs(exp.value - (1245 * 0.9 + 7045 * 0.575) / (1245 + 7045)) < 1e-12);
    assert.deepEqual(exp.included, ["A", "B"]);
    assert.equal(bookText(exp), "62.4% · 8% covered");
  });

  it("matches the page's own figure (portfolioMetrics + formatPortfolioCell) exactly", () => {
    for (const chip of ["roic_1y", "eps_1y", "gross_margin_1y"]) {
      const page = formatPortfolioCell(chip, portfolioMetrics(rows, metrics, [chip])[chip]).text;
      const e = expectedBookFigure(rows, metrics, chip);
      assert.equal(bookText(e), page, chip);
      assert.ok(matchesAtDisplayPrecision(page, e), chip);
    }
  });

  it("the old rebuild from rounded 1-decimal weights would miss at display precision", () => {
    const total = rows.filter((r) => r.value).reduce((s, r) => s + r.value, 0);
    const w = (v) => Number(((v / total) * 100).toFixed(1));
    const rebuilt = (w(1245) * 90 + w(7045) * 57.5) / (w(1245) + w(7045));
    assert.ok(Math.abs(rebuilt - exp.value * 100) > 0.05, `rounded rebuild ${rebuilt} vs ${exp.value * 100}`);
    assert.equal(matchesAtDisplayPrecision(`${rebuilt.toFixed(1)}% · 8% covered`, exp), false);
  });

  it("display precision: a rounding edge passes, a real difference or a wrong coverage fails, dashes", () => {
    const edge = { value: 0.6265, coverage: 0.0829 }; // on the edge between 62.6 and 62.7
    assert.ok(matchesAtDisplayPrecision("62.7% · 8% covered", edge));
    assert.ok(matchesAtDisplayPrecision("62.6% · 8% covered", edge));
    assert.equal(matchesAtDisplayPrecision("62.8% · 8% covered", edge), false);
    assert.equal(matchesAtDisplayPrecision("62.6% · 9% covered", edge), false);
    assert.equal(bookText({ value: 12.345, coverage: 1 }), "1,234.5% · 100% covered");
    assert.equal(bookText({ value: null, coverage: 0 }), "—");
    assert.ok(matchesAtDisplayPrecision("—", expectedBookFigure(rows, metrics, "rev_cagr_10y")));
  });
});
