// Holdings list as the page (#55, spec §0.2, DR2): the real HoldingsSection in jsdom with page data
// shaped like the loader's. Widths are QA's job on the preview (jsdom has no layout); this pins what the
// DOM can show: the four row fields, tap for detail, the one-line empty state, no helper paragraph, the
// one total, and today's metrics still reachable under the list.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HoldingsSection } from "./holdings";

type Props = ComponentProps<typeof HoldingsSection>;
let container: HTMLElement;
let root: Root;

const usd = { quote: "USD", cadPerUnit: "1.4243", rateDate: "2026-10-01", source: "BOC" };
const PAGE: Props = {
  holdings: [
    { id: 1, symbol: "KO", shares: "10.000000", avgCost: "60.000000" },
    { id: 2, symbol: "RY.TO", shares: "5.000000", avgCost: "150.000000" },
    { id: 3, symbol: "ASML.AS", shares: "2.000000", avgCost: "600.000000" },
  ],
  prices: {
    KO: { close: "70", currency: "USD", sessionDate: "2026-10-01", pending: false, name: "Coca-Cola Co" },
    "RY.TO": { close: null, currency: null, sessionDate: null, pending: true, name: null },
    "ASML.AS": { close: "700", currency: "EUR", sessionDate: "2026-10-01", pending: false, name: "ASML Holding NV" },
  },
  baseCurrency: "CAD",
  valuation: {
    base: "CAD",
    rows: [
      { symbol: "KO", value: 997.01, cost: 854.58, returnAmount: 142.43, returnPct: 16.67, weight: 30.75, rates: [usd], sessionDate: "2026-10-01", fallback: false, status: "ok" },
      { symbol: "RY.TO", value: null, cost: null, returnAmount: null, returnPct: null, weight: null, rates: [], sessionDate: null, fallback: false, status: "price_pending" },
      { symbol: "ASML.AS", value: 2244.2, cost: 1923.6, returnAmount: 320.6, returnPct: 16.67, weight: 69.25, rates: [], sessionDate: "2026-10-01", fallback: false, status: "ok" },
    ],
    total: 3241.21,
    totalCost: 2778.18,
    totalReturn: 463.03,
    totalReturnPct: 16.67,
    excluded: ["RY.TO"],
    pricesAsOf: "2026-10-01",
    fxAsOf: "2026-10-01",
  },
  freshness: { lastGoodRun: "2026-10-02", stale: false },
  metricColumns: ["rev_g_1y", "roic_1y"],
  metrics: {},
  portfolio: {},
  storage: "ok",
  onChanged: () => {},
};

async function render(props: Partial<Props> = {}) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<HoldingsSection {...PAGE} {...props} />));
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const $ = (sel: string, el: ParentNode = container) => el.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string, el: ParentNode = container) => [...el.querySelectorAll(sel)] as HTMLElement[];
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const rowOf = (symbol: string) => $(`[data-testid="holding-row"][data-symbol="${symbol}"]`)!;
const click = (el: Element) => act(async () => void el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));

describe("holdings list (#55, DR2)", () => {
  it("DR2-02: a row shows exactly name, shares, value in base currency and share of the book", async () => {
    await render();
    const toggle = $('[data-testid="holding-row-toggle"]', rowOf("KO"))!;
    assert.equal(toggle.children.length, 4, "four fields in the row");
    assert.equal(text($('[data-testid="holding-name"]', toggle)), "Coca-Cola Co");
    assert.equal(text($('[data-testid="holding-shares"]', toggle)), "10 shares");
    assert.equal(text($('[data-testid="holding-value"]', toggle)), "997.01 CAD");
    assert.equal(text($('[data-testid="holding-weight"]', toggle)), "30.8%");
    assert.equal($('[data-testid="holding-fx"]', toggle), null, "no FX line in the row");
    assert.equal($('[data-testid="holding-close"]', toggle), null, "no last close in the row");
    // No stored name yet: the ticker; no price yet: a dash for value and share.
    const ry = $('[data-testid="holding-row-toggle"]', rowOf("RY.TO"))!;
    assert.equal(text($('[data-testid="holding-name"]', ry)), "RY.TO");
    assert.equal(text($('[data-testid="holding-value"]', ry)), "—");
    assert.equal(text($('[data-testid="holding-weight"]', ry)), "—");
    // Rows in the stored order (by ticker, as the loader returns them); no T07 table any more.
    assert.deepEqual($$('[data-testid="holding-row"]').map((r) => r.dataset.symbol), ["KO", "RY.TO", "ASML.AS"]);
    assert.equal($('[data-testid="holdings-list"] table'), null);
    assert.equal($('[data-testid="holding-cost"]', toggle), null, "cost is in the detail only");
  });

  it("DR2-03: a tap opens the detail with the old fields plus Edit/Delete; a second tap closes it", async () => {
    await render();
    const ko = rowOf("KO");
    const toggle = $('[data-testid="holding-row-toggle"]', ko)!;
    const detail = $('[data-testid="holding-detail"]', ko)!;
    assert.equal(detail.hasAttribute("hidden"), true);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.getAttribute("aria-controls"), detail.id);
    await click(toggle);
    assert.equal(detail.hasAttribute("hidden"), false);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    const labels = $$("dt", detail).map(text);
    assert.deepEqual(labels, ["Ticker", "Name", "Shares", "Average cost", "Last close", "Value (CAD)", "Cost (CAD)", "Return", "Share of the book"]);
    assert.equal(text($('[data-testid="holding-avg-cost"]', detail)), "60 USD");
    assert.match(text($('[data-testid="holding-close"]', detail)), /^70 USD ?2026-10-01 close$/);
    assert.match(text($('[data-testid="holding-detail-value"]', detail)), /^997\.01 CAD ?FX USD 1\.4243 · 2026-10-01$/);
    assert.equal(text($('[data-testid="holding-cost"]', detail)), "854.58 CAD");
    assert.match(text($('[data-testid="holding-return"]', detail)), /^\+142\.43 CAD ?\+16\.67%$/);
    assert.equal(text($('[data-testid="holding-detail-weight"]', detail)), "30.8%");
    assert.deepEqual($$("button", detail).map(text), ["Edit", "Delete"]);
    // Other rows stay closed.
    assert.equal($('[data-testid="holding-detail"]', rowOf("ASML.AS"))!.hasAttribute("hidden"), true);
    await click(toggle);
    assert.equal(detail.hasAttribute("hidden"), true);
  });

  it("Edit in the detail swaps shares and average cost for inputs; Cancel restores", async () => {
    await render();
    const ko = rowOf("KO");
    await click($('[data-testid="holding-row-toggle"]', ko)!);
    await click($$("button", ko).find((b) => text(b) === "Edit")!);
    assert.ok($('input[aria-label="Shares of KO"]', ko));
    assert.ok($('input[aria-label="Average cost of KO"]', ko));
    await click($$("button", ko).find((b) => text(b) === "Cancel")!);
    assert.equal($('input[aria-label="Shares of KO"]', ko), null);
  });

  it("DR2-05: no holdings → exactly one line, 'Add a holding', and no list, total, chart or metrics", async () => {
    await render({ holdings: [], valuation: null, prices: {} });
    assert.equal(text($('[data-testid="holdings-empty"]')), "Add a holding");
    for (const id of ["holdings-list", "holding-row", "holdings-total-line", "holdings-pie", "metrics", "as-of"])
      assert.equal($(`[data-testid="${id}"]`), null, `${id} on the empty page`);
    assert.equal($("table"), null);
    // Below the form: only the one line.
    const form = $('[data-testid="holding-form"]')!;
    const after: string[] = [];
    for (let el = form.nextElementSibling; el; el = el.nextElementSibling) after.push(text(el));
    assert.deepEqual(after, ["Add a holding"]);
  });

  it("DR2-04: no helper paragraphs (the T06/T07 explainer is gone; every paragraph is one line)", async () => {
    for (const props of [{}, { holdings: [], valuation: null, prices: {} }] as Partial<Props>[]) {
      await render(props);
      const all = text(container);
      for (const gone of [/US, EU and CA listings only/, /Average cost is per share/, /Bank of Canada/, /daily averages/, /left out of the totals/, /Not included in the totals/])
        assert.doesNotMatch(all, gone);
      for (const p of $$("p")) assert.ok(text(p).split(/(?<=\.)\s+(?=[A-Z])/).length <= 2 && text(p).length <= 120, `paragraph too long: ${text(p)}`);
      await act(async () => root.unmount());
      container.remove();
    }
    await render(); // for afterEach
  });

  it("one total (value only) under the list, with the excluded line; no total cost / return", async () => {
    await render();
    assert.equal(text($('[data-testid="holdings-total"]')), "3,241.21 CAD");
    assert.equal(text($('[data-testid="holdings-total-excluded-count"]')), "1 holding without a price excluded");
    for (const id of ["holdings-total-cost", "holdings-total-return", "holdings-total-weight", "holdings-excluded"]) assert.equal($(`[data-testid="${id}"]`), null, id);
    // The list comes before the total, the total before the chart.
    const order = ["holdings-list", "holdings-total-line", "holdings-pie", "metrics"].map((id) => $(`[data-testid="${id}"]`)!);
    for (let i = 1; i < order.length; i++) assert.ok(order[i - 1].compareDocumentPosition(order[i]) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("today's metric columns stay reachable under the list until #57 (picker, one row per holding, portfolio row)", async () => {
    await render();
    const metrics = $('[data-testid="metrics"]')!;
    assert.ok($('[data-testid="metric-picker"]', metrics));
    assert.deepEqual($$('[data-testid="metric-th"]', metrics).map((th) => th.dataset.key), ["rev_g_1y", "roic_1y"]);
    assert.deepEqual($$('[data-testid="metric-row"]', metrics).map((r) => r.dataset.symbol), ["KO", "RY.TO", "ASML.AS"]);
    assert.equal($$('[data-testid="portfolio-metric"]', metrics).length, 2);
    assert.equal($$('[data-testid="metric-cell"]', $('[data-testid="holdings-list"]')!).length, 0, "no metric cells in the list rows");
  });
});
