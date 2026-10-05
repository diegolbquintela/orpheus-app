// Add holding with an optional average cost (#56, epic #53 ticket 3, spec §0.2 "Add", DR3): the real
// HoldingsSection in jsdom with a mocked fetch. Pins that a blank cost is sent as null (never 0), that the
// detail's average cost, cost and return render blank (not 0, n/m, — or NaN) until a cost is entered, that
// entering one later shows them, and that Edit can clear it again. The listing check itself is server-side
// (holdings.test.ts, check-dashboard-built --with-database).
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import { costForRequest, HoldingsSection } from "./holdings";

// react-dom is loaded after the jsdom globals exist (a static import would be evaluated before the bundled
// dom-setup), so React sees a DOM and handles text inputs through the "input" event like a browser.
const { createRoot } = await import("react-dom/client");

type Props = ComponentProps<typeof HoldingsSection>;
let container: HTMLElement;
let root: Root;
let calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }>;
let changed = 0;

const usd = { quote: "USD", cadPerUnit: "1.4243", rateDate: "2026-10-01", source: "BOC" };
const koRow = (cost: number | null) => ({
  symbol: "KO",
  value: 997.01,
  cost,
  returnAmount: cost === null ? null : 997.01 - cost,
  returnPct: cost === null ? null : 16.67,
  weight: 30.75,
  rates: [usd],
  sessionDate: "2026-10-01",
  fallback: false,
  status: "ok",
});
const asmlRow = { symbol: "ASML.AS", value: 2244.2, cost: 1923.6, returnAmount: 320.6, returnPct: 16.67, weight: 69.25, rates: [], sessionDate: "2026-10-01", fallback: false, status: "ok" };
/** Page data as the loader returns it, with KO's average cost `koCost` (null = no cost). */
const page = (koCost: string | null): Props => ({
  holdings: [
    { id: 1, symbol: "KO", shares: "10.000000", avgCost: koCost },
    { id: 3, symbol: "ASML.AS", shares: "2.000000", avgCost: "600.000000" },
  ],
  prices: {
    KO: { close: "70", currency: "USD", sessionDate: "2026-10-01", pending: false, name: "Coca-Cola Co" },
    "ASML.AS": { close: "700", currency: "EUR", sessionDate: "2026-10-01", pending: false, name: "ASML Holding NV" },
  },
  baseCurrency: "CAD",
  valuation: {
    base: "CAD",
    rows: [koRow(koCost === null ? null : 854.58), asmlRow],
    total: 3241.21,
    totalCost: koCost === null ? 1923.6 : 2778.18,
    totalReturn: koCost === null ? 320.6 : 463.03,
    totalReturnPct: 16.67,
    excluded: [],
    pricesAsOf: "2026-10-01",
    fxAsOf: "2026-10-01",
  },
  freshness: { lastGoodRun: "2026-10-02", stale: false },
  metricColumns: [],
  metrics: {},
  portfolio: {},
  storage: "ok",
  onChanged: () => {
    changed += 1;
  },
});

beforeEach(() => {
  calls = [];
  changed = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return new Response(JSON.stringify({ holding: { id: 9 } }), { status: init?.method === "POST" ? 201 : 200 });
  }) as typeof fetch;
});

async function render(props: Props) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<HoldingsSection {...props} />));
}
const rerender = (props: Props) => act(async () => root.render(<HoldingsSection {...props} />));
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const $ = (sel: string, el: ParentNode = container) => el.querySelector(sel) as HTMLElement | null;
const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const rowOf = (symbol: string) => $(`[data-testid="holding-row"][data-symbol="${symbol}"]`)!;
const click = (el: Element) => act(async () => void el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
const type = (el: Element, value: string) =>
  act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
const submit = (form: Element) =>
  act(async () => void form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
const button = (el: ParentNode, label: string) => [...el.querySelectorAll("button")].find((b) => text(b) === label)!;
const blank = (el: HTMLElement | null) => {
  assert.ok(el, "field is rendered");
  assert.equal(el.textContent, "", `blank, got ${JSON.stringify(el.textContent)}`);
  assert.equal(el.dataset.blank, "true");
};

describe("add holding, optional cost (#56, DR3)", () => {
  it("DR3-01: the form is Ticker, Shares, Average cost (optional) and Add; no placeholder sentences", async () => {
    await render(page("60.000000"));
    const form = $('[data-testid="holding-form"]')!;
    const inputs = [...form.querySelectorAll("input")];
    assert.equal(inputs.length, 3);
    assert.deepEqual([...form.querySelectorAll(".kicker")].map((k) => text(k)).slice(0, 2), ["Ticker", "Shares"]);
    assert.equal($('[data-testid="holding-form-cost"]')!.getAttribute("aria-label"), "Average cost (optional)");
    assert.match(text($('[data-testid="holding-form-cost-label"]')), /Average cost \(optional\)/);
    assert.deepEqual(inputs.map((i) => i.getAttribute("placeholder")), [null, null, "optional"]);
    assert.equal(text(form.querySelector("button[type=submit]")), "Add");
    assert.equal(form.querySelectorAll("p").length, 0, "no help text");
  });

  it("DR3-02: ticker + shares with a blank cost POSTs avgCost null (not 0 or \"\")", async () => {
    await render(page("60.000000"));
    await type($('[data-testid="holding-form-symbol"]')!, "msft");
    await type($('[data-testid="holding-form-shares"]')!, "3");
    await type($('[data-testid="holding-form-cost"]')!, "   ");
    await submit($('[data-testid="holding-form"]')!);
    assert.deepEqual(calls, [{ url: "/api/dashboard/holdings", method: "POST", body: { symbol: "msft", shares: "3", avgCost: null } }]);
    assert.equal(changed, 1, "the page reloads its data");
    // A given cost is sent as typed.
    await type($('[data-testid="holding-form-symbol"]')!, "KO");
    await type($('[data-testid="holding-form-shares"]')!, "1");
    await type($('[data-testid="holding-form-cost"]')!, "0");
    await submit($('[data-testid="holding-form"]')!);
    assert.deepEqual(calls[1].body, { symbol: "KO", shares: "1", avgCost: "0" });
    assert.equal(costForRequest(""), null);
    assert.equal(costForRequest(" 52.5 "), "52.5");
  });

  it("DR3-03: no cost -> average cost, cost and return blank; value, share and the total still show", async () => {
    await render(page(null));
    const ko = rowOf("KO");
    await click($('[data-testid="holding-row-toggle"]', ko)!);
    blank($('[data-testid="holding-avg-cost"]', ko));
    blank($('[data-testid="holding-cost"]', ko));
    blank($('[data-testid="holding-return"]', ko));
    assert.equal($('[data-testid="holding-return-pct"]', ko), null);
    assert.equal(text($('[data-testid="holding-detail-value"]', ko)).startsWith("997.01 CAD"), true);
    assert.equal(text($('[data-testid="holding-detail-weight"]', ko)), "30.8%");
    assert.equal(text($('[data-testid="holding-weight"]', ko)), "30.8%");
    assert.equal(text($('[data-testid="holdings-total"]')), "3,241.21 CAD");
    const detail = text($('[data-testid="holding-detail"]', ko));
    assert.doesNotMatch(detail, /NaN|null|undefined|n\/m/);
    assert.doesNotMatch(text(container), /NaN/);
    // The holding with a cost is unaffected.
    const asml = rowOf("ASML.AS");
    assert.equal(text($('[data-testid="holding-cost"]', asml)), "1,923.60 CAD");
  });

  it("DR3-04: entering a cost later (Edit) sends it and the reloaded page shows cost and return", async () => {
    await render(page(null));
    const ko = rowOf("KO");
    await click($('[data-testid="holding-row-toggle"]', ko)!);
    await click(button(ko, "Edit"));
    const input = $('input[aria-label="Average cost of KO"]', ko) as HTMLInputElement;
    assert.equal(input.value, "", "edit starts blank, not 0");
    await type(input, "60");
    await click(button(ko, "Save"));
    assert.deepEqual(calls.at(-1), { url: "/api/dashboard/holdings/1", method: "PUT", body: { shares: "10", avgCost: "60" } });
    await rerender(page("60.000000"));
    const after = rowOf("KO");
    if ($('[data-testid="holding-detail"]', after)!.hasAttribute("hidden")) await click($('[data-testid="holding-row-toggle"]', after)!);
    assert.equal(text($('[data-testid="holding-avg-cost"]', after)), "60 USD");
    assert.equal(text($('[data-testid="holding-cost"]', after)), "854.58 CAD");
    assert.match(text($('[data-testid="holding-return"]', after)), /^\+142\.43 CAD/);
    assert.equal(text($('[data-testid="holding-return-pct"]', after)), "+16.67%");
  });

  it("DR3-04: Edit can clear the cost back to blank (PUT avgCost null)", async () => {
    await render(page("60.000000"));
    const ko = rowOf("KO");
    await click($('[data-testid="holding-row-toggle"]', ko)!);
    await click(button(ko, "Edit"));
    const input = $('input[aria-label="Average cost of KO"]', ko) as HTMLInputElement;
    assert.equal(input.value, "60");
    await type(input, "");
    await click(button(ko, "Save"));
    assert.deepEqual(calls.at(-1), { url: "/api/dashboard/holdings/1", method: "PUT", body: { shares: "10", avgCost: null } });
    await rerender(page(null));
    const after = rowOf("KO");
    if ($('[data-testid="holding-detail"]', after)!.hasAttribute("hidden")) await click($('[data-testid="holding-row-toggle"]', after)!);
    blank($('[data-testid="holding-cost"]', after));
    blank($('[data-testid="holding-return"]', after));
  });

  it("QA N6: a double click on Save sends one PUT (guard like #44); a failed PUT lets the user retry", async () => {
    let status = 200;
    let release: () => void = () => {};
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      await new Promise<void>((r) => (release = r)); // the PUT is slow: both clicks land before it returns
      return new Response(JSON.stringify(status === 200 ? { holding: { id: 1 } } : { error: "Server error." }), { status });
    }) as typeof fetch;
    await render(page(null));
    const ko = rowOf("KO");
    await click($('[data-testid="holding-row-toggle"]', ko)!);
    await click(button(ko, "Edit"));
    await type($('input[aria-label="Average cost of KO"]', ko)!, "60");
    const save = button(ko, "Save");
    // Two clicks in one tick, before React re-renders the disabled button.
    await act(async () => {
      save.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      save.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await click(save);
    await act(async () => release());
    assert.equal(calls.filter((c) => c.method === "PUT").length, 1, "one PUT for a double click");
    assert.equal(changed, 1);
    // A failure releases the guard: the error shows and Save works again.
    calls = [];
    status = 500;
    await click(button(ko, "Edit"));
    await click(button(ko, "Save"));
    await act(async () => release());
    assert.equal(text($('[role="alert"]', ko)), "Server error.");
    status = 200;
    await click(button(ko, "Save"));
    await act(async () => release());
    assert.equal(calls.filter((c) => c.method === "PUT").length, 2, "retry after an error sends again");
  });
});
