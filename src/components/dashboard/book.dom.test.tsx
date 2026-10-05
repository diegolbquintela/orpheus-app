// The book (#58, epic #53 ticket 5, spec §0.2 "Book", DR5): the real HoldingsSection in jsdom. Pins the one
// total (value only), the donut (ring, largest first, Other past ten names, no pending lists, absent with
// nothing valued) and the metrics sheet's `Book` row (weighted figure per kept chip, `—` alone when none has
// a figure, the share chip 100.0%, the EPS label, a chip's figure leaving with the chip).
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import { HoldingsSection } from "./holdings";

const { createRoot } = await import("react-dom/client");

type Props = ComponentProps<typeof HoldingsSection>;
let container: HTMLElement;
let root: Root;

const ok = (value: string) => ({ value, status: "ok", fiscalYearEnd: "2025-12-31" });
const row = (symbol: string, value: number | null, weight: number | null, status = "ok") => ({
  symbol, value, cost: null, returnAmount: null, returnPct: null, weight, rates: [], sessionDate: value === null ? null : "2026-10-01", fallback: false, status,
});
const PAGE = (chips: string[]): Props => ({
  holdings: [
    { id: 1, symbol: "KO", shares: "10.000000", avgCost: "60.000000" },
    { id: 2, symbol: "MC.PA", shares: "1.000000", avgCost: null },
    { id: 3, symbol: "RY.TO", shares: "5.000000", avgCost: "150.000000" },
  ],
  prices: {
    KO: { close: "70", currency: "USD", sessionDate: "2026-10-01", pending: false, name: "Coca-Cola Co" },
    "MC.PA": { close: "600", currency: "EUR", sessionDate: "2026-10-01", pending: false, name: "LVMH" },
    "RY.TO": { close: null, currency: null, sessionDate: null, pending: true, name: null },
  },
  baseCurrency: "CAD",
  valuation: {
    base: "CAD",
    rows: [row("KO", 997.01, 50.9), row("MC.PA", 961.8, 49.1), row("RY.TO", null, null, "price_pending")],
    total: 1958.81,
    totalCost: 854.58,
    totalReturn: 142.43,
    totalReturnPct: 16.67,
    excluded: ["RY.TO"],
    pricesAsOf: "2026-10-01",
    fxAsOf: "2026-10-01",
  },
  freshness: { lastGoodRun: "2026-10-02", stale: false },
  metricColumns: chips,
  metrics: {
    KO: { coverage: "covered", metrics: { rev_g_1y: ok("0.019"), roic_1y: ok("0.174"), eps_1y: { ...ok("3.04"), currency: "USD" }, eps_g_1y: ok("0.236") } },
    "MC.PA": { coverage: "not_covered", metrics: {} },
    "RY.TO": { coverage: "covered", metrics: {} },
  },
  portfolio: {
    rev_g_1y: { value: 0.019, coverage: 0.509, source: "rev_g_1y", included: ["KO"] },
    roic_1y: { value: 0.174, coverage: 0.509, source: "roic_1y", included: ["KO"] },
    eps_1y: { value: 0.236, coverage: 0.509, source: "eps_g_1y", included: ["KO"] },
    gross_margin_1y: { value: null, coverage: 0, source: "gross_margin_1y", included: [] },
  },
  storage: "ok",
  onChanged: () => {},
});

beforeEach(() => {
  globalThis.fetch = (async () => new Response('{"columns":[]}', { status: 200 })) as typeof fetch;
});
async function render(props: Props) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<HoldingsSection {...props} />));
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const $ = (sel: string, el: ParentNode = container) => el.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string, el: ParentNode = container) => [...el.querySelectorAll(sel)] as HTMLElement[];
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const book = (key: string) => text($(`[data-testid="book-row"] [data-testid="portfolio-metric"][data-key="${key}"] [data-testid="portfolio-metric-value"]`));

describe("the book (#58, DR5)", () => {
  it("DR5-01: one total under the list, value only, with the excluded line; no total cost or return", async () => {
    await render(PAGE(["rev_g_1y", "roic_1y", "share_of_book"]));
    assert.equal($$('[data-testid="holdings-total"]').length, 1);
    assert.equal(text($('[data-testid="holdings-total"]')), "1,958.81 CAD");
    assert.equal(text($('[data-testid="holdings-total-excluded-count"]')), "1 holding without a price excluded");
    assert.equal($('[data-testid^="holdings-total-cost"], [data-testid^="holdings-total-return"]'), null);
  });

  it("DR5-02: a donut of the same weights, largest first, labels as the rows; no pending list", async () => {
    await render(PAGE(["rev_g_1y"]));
    const fig = $('[data-testid="holdings-pie"]')!;
    assert.equal(fig.getAttribute("data-shape"), "donut");
    assert.equal(text($("figcaption", fig)), "Share of the book (CAD)");
    assert.deepEqual($$('[data-testid="pie-slice"]').map((li) => `${li.getAttribute("data-label")} ${text($('[data-testid="pie-slice-pct"]', li))}`), ["KO 50.9%", "MC.PA 49.1%"]);
    assert.match($('[role="img"]', fig)!.getAttribute("aria-label")!, /^Donut chart of share of the book: KO 50\.9%, MC\.PA 49\.1%$/);
    assert.equal($('[data-testid="pie-price-pending"], [data-testid="pie-fx-pending"]'), null);
    assert.doesNotMatch(text(container), /price pending:|FX pending:/);
  });

  it("DR5-02: past ten names the rest is one 'Other' slice, last", async () => {
    const symbols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    const values = [5, 120, 30, 70, 10, 90, 20, 60, 40, 110, 50, 80]; // total 685
    const total = values.reduce((s, v) => s + v, 0);
    const p = PAGE([]);
    p.holdings = symbols.map((symbol, i) => ({ id: i + 1, symbol, shares: "1.000000", avgCost: null }));
    p.prices = Object.fromEntries(symbols.map((s) => [s, { close: "1", currency: "CAD", sessionDate: "2026-10-01", pending: false, name: null }]));
    p.valuation = { ...p.valuation!, rows: symbols.map((s, i) => row(s, values[i], (values[i] / total) * 100)), total, excluded: [] };
    p.metrics = {};
    await render(p);
    const labels = $$('[data-testid="pie-slice"]').map((li) => li.getAttribute("data-label"));
    assert.deepEqual(labels, ["B", "J", "F", "L", "D", "H", "K", "I", "C", "G", "Other"]);
    const other = $('[data-testid="pie-slice"][data-label="Other"]')!;
    assert.equal(other.getAttribute("title"), "E, A");
    assert.equal(text($('[data-testid="pie-slice-pct"]', other)), `${((15 / total) * 100).toFixed(1)}%`);
  });

  it("nothing valued: no donut and the total is '—'", async () => {
    const p = PAGE([]);
    p.valuation = { ...p.valuation!, rows: p.valuation!.rows.map((r) => row(r.symbol, null, null, "price_pending")), total: 0, excluded: ["KO", "MC.PA", "RY.TO"] };
    await render(p);
    assert.equal($('[data-testid="holdings-pie"]'), null);
    assert.equal(text($('[data-testid="holdings-total"]')), "—");
    assert.doesNotMatch(text(container), /No holdings with a price yet/);
  });

  it("DR5-03/05: the Book row shows each kept chip's weighted figure, in chip order; share of the book 100.0%", async () => {
    await render(PAGE(["rev_g_1y", "share_of_book", "roic_1y", "eps_1y"]));
    const foot = $('[data-testid="book-row"]')!;
    assert.equal(text($("td", foot)), "Book");
    assert.deepEqual($$('[data-testid="portfolio-metric"]', foot).map((c) => c.getAttribute("data-key")), ["rev_g_1y", "share_of_book", "roic_1y", "eps_1y"]);
    assert.equal(book("rev_g_1y"), "1.9% · 51% covered");
    assert.equal(book("roic_1y"), "17.4% · 51% covered");
    assert.equal(book("share_of_book"), "100.0%");
    // It wraps only between the figure and its coverage.
    const parts = $$('[data-testid="book-row"] [data-key="rev_g_1y"] [data-testid="portfolio-metric-value"] > span');
    assert.deepEqual(parts.map((p) => [p.className, p.textContent]), [["whitespace-nowrap", "1.9% ·"], ["whitespace-nowrap", "51% covered"]]);
    assert.equal(book("eps_1y"), "23.6% · 51% covered");
    assert.equal(text($('[data-testid="book-row"] [data-key="eps_1y"] [data-testid="portfolio-metric-label"]')), "EPS growth 1y (weighted)");
    assert.doesNotMatch(text(container), /Portfolio\b/, "the old Portfolio foot label is gone");
  });

  it("DR5-04: a chip nobody has a figure for shows '—' alone in the Book row", async () => {
    await render(PAGE(["gross_margin_1y"]));
    assert.equal(book("gross_margin_1y"), "—");
    assert.doesNotMatch(text($('[data-testid="book-row"]')), /covered/);
  });

  it("DR5-03: removing a chip removes its book figure; with no chips there is no Book row", async () => {
    await render(PAGE(["rev_g_1y"]));
    assert.equal($$('[data-testid="book-row"] [data-testid="portfolio-metric"]').length, 1);
    await act(async () => root.render(<HoldingsSection {...PAGE(["roic_1y"])} />));
    assert.equal($('[data-testid="book-row"] [data-key="rev_g_1y"]'), null);
    assert.equal(book("roic_1y"), "17.4% · 51% covered");
    await act(async () => root.render(<HoldingsSection {...PAGE([])} />));
    assert.equal($('[data-testid="book-row"]'), null);
  });
});
