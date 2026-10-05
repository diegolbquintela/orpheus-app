// Metrics sheet and chips (#57, epic #53 ticket 4, spec §0.2 "Metrics sheet", DR4): the real HoldingsSection
// in jsdom with a mocked fetch. Widths are QA's (jsdom has no layout); this pins the switch and the classes
// that hide a sheet below 1024 px, the default chips as given by the loader, search → add at the end, a chip
// removing itself (down to none), rows with the kept chips only in chip order, the dash alone for a missing
// figure, the Share of the book chip, and one PUT per click burst.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act, type ComponentProps } from "react";
import type { Root } from "react-dom/client";
import { exactChip, matchingChips } from "@/lib/dashboard/metrics";
import { HoldingsSection } from "./holdings";

// react-dom after the jsdom globals (see holdings-add.dom.test.tsx), so text inputs use the "input" event.
const { createRoot } = await import("react-dom/client");

type Props = ComponentProps<typeof HoldingsSection>;
let container: HTMLElement;
let root: Root;
let puts: unknown[];
let release: (() => void) | null;
let changed = 0;

const ok = (value: string, fy = "2025-12-31") => ({ value, status: "ok", fiscalYearEnd: fy });
const PAGE = (chips: string[]): Props => ({
  holdings: [
    { id: 1, symbol: "KO", shares: "10.000000", avgCost: "60.000000" },
    { id: 2, symbol: "MC.PA", shares: "1.000000", avgCost: "500.000000" },
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
    rows: [
      { symbol: "KO", value: 997.01, cost: 854.58, returnAmount: 142.43, returnPct: 16.67, weight: 50.9, rates: [], sessionDate: "2026-10-01", fallback: false, status: "ok" },
      { symbol: "MC.PA", value: 961.8, cost: 801.5, returnAmount: 160.3, returnPct: 20, weight: 49.1, rates: [], sessionDate: "2026-10-01", fallback: false, status: "ok" },
      { symbol: "RY.TO", value: null, cost: null, returnAmount: null, returnPct: null, weight: null, rates: [], sessionDate: null, fallback: false, status: "price_pending" },
    ],
    total: 1958.81,
    totalCost: 1656.08,
    totalReturn: 302.73,
    totalReturnPct: 18.28,
    excluded: ["RY.TO"],
    pricesAsOf: "2026-10-01",
    fxAsOf: "2026-10-01",
  },
  freshness: { lastGoodRun: "2026-10-02", stale: false },
  metricColumns: chips,
  metrics: {
    KO: { coverage: "covered", metrics: { rev_g_1y: ok("0.019"), roic_1y: ok("0.174"), gross_margin_1y: ok("0.616"), eps_1y: { ...ok("3.04"), currency: "USD" } } },
    "MC.PA": { coverage: "not_covered", metrics: {} },
    "RY.TO": { coverage: "covered", metrics: { rev_g_1y: ok("0.08", "2025-10-31"), roic_1y: { value: null, status: "n/m", fiscalYearEnd: "2025-10-31" } } },
  },
  portfolio: { rev_g_1y: { value: 0.019, coverage: 0.509, source: "rev_g_1y", included: ["KO"] }, roic_1y: { value: 0.174, coverage: 0.509, source: "roic_1y", included: ["KO"] } },
  storage: "ok",
  onChanged: () => {
    changed += 1;
  },
});
const DEFAULTS = ["rev_g_1y", "roic_1y", "share_of_book"];

beforeEach(() => {
  puts = [];
  release = null;
  changed = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    puts.push(JSON.parse(String(init?.body)));
    if (release === null) await Promise.resolve();
    else await new Promise<void>((r) => (release = r));
    return new Response('{"columns":[]}', { status: 200 });
  }) as typeof fetch;
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
/** What a sighted user reads: the text without screen-reader-only spans. */
const visible = (el: Element) => {
  const c = el.cloneNode(true) as Element;
  for (const s of c.querySelectorAll(".sr-only")) s.remove();
  return text(c);
};
const click = (el: Element) => act(async () => void el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
const type = (el: Element, value: string) =>
  act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
const cellsOf = (symbol: string) => $$('[data-testid="metric-cell"]', $(`[data-testid="metric-row"][data-symbol="${symbol}"]`)!);

describe("metrics sheet and chips (#57, DR4)", () => {
  it("DR4-01/02: below 1024 px a Holdings | Metrics switch shows one sheet at a time; from 1024 px both", async () => {
    await render(PAGE(DEFAULTS));
    const list = $('[data-testid="holdings-sheet"]')!;
    const sheet = $('[data-testid="metrics"]')!;
    const sw = $('[data-testid="sheet-switch"]')!;
    assert.ok(sw.classList.contains("lg:hidden"), "the switch is phone-only");
    assert.deepEqual($$("button", sw).map((b) => [text(b), b.getAttribute("aria-pressed")]), [["Holdings", "true"], ["Metrics", "false"]]);
    assert.ok(!list.classList.contains("hidden"));
    assert.ok(sheet.classList.contains("hidden") && sheet.classList.contains("lg:block"), "metrics hidden on a phone, shown from 1024 px");
    await click($('[data-testid="sheet-switch-metrics"]')!);
    assert.ok(list.classList.contains("hidden") && list.classList.contains("lg:block"));
    assert.ok(!sheet.classList.contains("hidden"));
    await click($('[data-testid="sheet-switch-holdings"]')!);
    assert.ok(!list.classList.contains("hidden") && sheet.classList.contains("hidden"));
    assert.equal($$('[data-testid="holding-row"]').length, 3, "the list is unchanged after switching back");
    // From 1024 px: side by side (two columns), the list first.
    assert.match(list.parentElement!.className, /lg:grid-cols-\[minmax\(0,3fr\)_minmax\(0,2fr\)\]/);
    assert.ok(list.compareDocumentPosition(sheet) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("no holdings: no switch and no metrics sheet (the empty state is one line)", async () => {
    await render({ ...PAGE(DEFAULTS), holdings: [], prices: {}, valuation: null });
    assert.equal($('[data-testid="sheet-switch"]'), null);
    assert.equal($('[data-testid="metrics"]'), null);
    assert.equal(text($('[data-testid="holdings-empty"]')), "Add a holding");
  });

  it("DR4-03: the default chips, in order, each with its own remove control", async () => {
    await render(PAGE(DEFAULTS));
    const chips = $$('[data-testid="metric-chip"]');
    assert.deepEqual(chips.map((c) => visible(c).replace(/ ?×$/, "")), ["Revenue growth 1y", "ROIC (1y)", "Share of the book"]);
    assert.deepEqual(chips.map((c) => $("button", c)!.getAttribute("aria-label")), ["Remove Revenue growth 1y", "Remove ROIC (1y)", "Remove Share of the book"]);
    assert.equal($('[data-testid="metric-picker"]'), null, "the old picker is gone");
    assert.equal($('[data-testid="metric-add-select"]'), null);
    assert.equal($$('button[aria-label^="Move"]').length, 0, "no reorder");
  });

  it("DR4-04: typing 'gross' offers Gross margin (1y) only; choosing it PUTs the chips with it at the end", async () => {
    await render(PAGE(DEFAULTS));
    const search = $('[data-testid="metric-search"]')!;
    assert.equal($('[data-testid="metric-options"]'), null, "nothing offered before typing");
    await type(search, "gross");
    assert.deepEqual($$('[data-testid="metric-option"]').map((o) => text(o)), ["Gross margin (1y)"]);
    await type(search, "revenue");
    assert.deepEqual($$('[data-testid="metric-option"]').map((o) => o.dataset.key), ["rev_cagr_3y", "rev_cagr_5y", "rev_cagr_10y"], "a kept chip is not offered");
    await type(search, "gross");
    await click($('[data-testid="metric-option"]')!);
    assert.deepEqual(puts, [{ columns: [...DEFAULTS, "gross_margin_1y"] }]);
    assert.equal((search as HTMLInputElement).value, "", "the search clears");
    assert.equal(changed, 1, "the page reloads (the reload brings the saved chips)");
    // Enter picks the first match.
    await type(search, "ebit");
    await act(async () => void search.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.deepEqual(puts[1], { columns: [...DEFAULTS, "ebit_margin_1y"] });
    assert.deepEqual(matchingChips("share", ["rev_g_1y"]).map((c) => c.key), ["share_of_book"]);
    assert.deepEqual(matchingChips("  ", []), []);
  });

  it("#58: the search is a combobox: listbox options, arrows move, Enter adds the highlighted one, focus stays", async () => {
    await render(PAGE(DEFAULTS));
    const search = $('[data-testid="metric-search"]')! as HTMLInputElement;
    const key = (k: string) => act(async () => void search.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
    assert.equal(search.getAttribute("role"), "combobox");
    assert.equal(search.getAttribute("aria-autocomplete"), "list");
    assert.equal(search.getAttribute("aria-expanded"), "false");
    assert.equal(search.getAttribute("aria-activedescendant"), null);
    assert.equal(search.getAttribute("aria-controls"), "metric-options");
    search.focus();
    await type(search, "revenue");
    const list = $('[data-testid="metric-options"]')!;
    assert.equal(list.getAttribute("role"), "listbox");
    assert.equal(list.id, "metric-options");
    assert.equal(search.getAttribute("aria-expanded"), "true");
    const opts = () => $$('[role="option"]', list);
    const selected = () => opts().filter((o) => o.getAttribute("aria-selected") === "true").map((o) => o.dataset.key);
    assert.deepEqual(opts().map((o) => o.dataset.key), ["rev_cagr_3y", "rev_cagr_5y", "rev_cagr_10y"]);
    assert.equal(opts().filter((o) => o.querySelector("button")).length, 0, "no buttons inside options");
    assert.deepEqual(selected(), ["rev_cagr_3y"], "the first option is highlighted");
    assert.equal(search.getAttribute("aria-activedescendant"), opts()[0].id);
    await key("ArrowDown");
    await key("ArrowDown");
    assert.deepEqual(selected(), ["rev_cagr_10y"]);
    assert.equal(search.getAttribute("aria-activedescendant"), opts()[2].id);
    await key("ArrowDown");
    assert.deepEqual(selected(), ["rev_cagr_3y"], "wraps to the first");
    await key("ArrowUp");
    assert.deepEqual(selected(), ["rev_cagr_10y"], "wraps to the last");
    await key("ArrowUp");
    assert.deepEqual(selected(), ["rev_cagr_5y"]);
    assert.equal(dom.window.document.activeElement, search, "arrows keep focus in the input");
    await key("Enter");
    assert.deepEqual(puts, [{ columns: [...DEFAULTS, "rev_cagr_5y"] }], "Enter adds the highlighted option");
    assert.equal(search.value, "");
    assert.equal(dom.window.document.activeElement, search, "focus stays in the input after adding");
    assert.equal($('[data-testid="metric-options"]'), null);
    // A mouse press on an option doesn't take focus (mousedown is prevented); a click adds it.
    await type(search, "gross");
    const opt = $('[data-testid="metric-option"]')!;
    const down = new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => void opt.dispatchEvent(down));
    assert.equal(down.defaultPrevented, true);
    await click(opt);
    assert.deepEqual(puts[1], { columns: [...DEFAULTS, "gross_margin_1y"] });
    assert.equal(dom.window.document.activeElement, search);
    // Escape clears the query and closes the list.
    await type(search, "eps");
    await key("Escape");
    assert.equal(search.value, "");
    assert.equal($('[data-testid="metric-options"]'), null);
  });

  it("DR4-05: a chip removes itself; removing the last one PUTs an empty list", async () => {
    await render(PAGE(DEFAULTS));
    await click($('[aria-label="Remove ROIC (1y)"]')!);
    assert.deepEqual(puts, [{ columns: ["rev_g_1y", "share_of_book"] }]);
    await act(async () => root.render(<HoldingsSection {...PAGE(["share_of_book"])} />));
    await click($('[aria-label="Remove Share of the book"]')!);
    assert.deepEqual(puts[1], { columns: [] });
    await act(async () => root.render(<HoldingsSection {...PAGE([])} />));
    assert.equal($('[data-testid="metric-chips"]'), null);
    assert.equal($$('[data-testid="metric-th"]').length, 0);
    assert.deepEqual($$('[data-testid="metric-row"]').map((r) => visible(r)), ["Coca-Cola Co", "LVMH", "RY.TO"], "rows keep only the name");
    assert.equal($('[data-testid="metrics"] tfoot'), null);
  });

  it("DR4-06: each row shows the name, then the kept chips only, in chip order (values as DASH-16..20)", async () => {
    await render(PAGE(["gross_margin_1y", "rev_g_1y", "eps_1y", "share_of_book"]));
    assert.deepEqual($$('[data-testid="metric-th"]').map((th) => th.dataset.key), ["gross_margin_1y", "rev_g_1y", "eps_1y", "share_of_book"]);
    assert.deepEqual($$('[data-testid="metric-row"]').map((r) => r.dataset.symbol), ["KO", "MC.PA", "RY.TO"]);
    const ko = cellsOf("KO");
    assert.deepEqual(ko.map((c) => c.dataset.key), ["gross_margin_1y", "rev_g_1y", "eps_1y", "share_of_book"]);
    assert.deepEqual(ko.map((c) => visible(c)), ["61.6%", "1.9%", "3.04 USD", "50.9%"]);
    assert.equal(text($('[data-testid="metric-row"][data-symbol="KO"] td')), "Coca-Cola Co");
    assert.equal(text($('[data-testid="portfolio-metric"][data-key="share_of_book"]')), "100.0%", "share chip's foot = sum of the valued weights");
  });

  it("DR4-07: a missing figure is exactly '—' (reason only in the tooltip / screen-reader text)", async () => {
    await render(PAGE(["roic_1y", "gross_margin_1y", "share_of_book"]));
    const ry = cellsOf("RY.TO"); // n/m ROIC, not computed gross margin, no price
    const mc = cellsOf("MC.PA"); // not covered
    for (const c of [...ry, mc[0], mc[1]]) assert.equal(visible(c), "—", `${c.dataset.key}: ${text(c)}`);
    assert.deepEqual(ry.map((c) => c.dataset.status), ["n/m", "not_computed", "pending"]);
    assert.equal(text(ry[0]), "— not meaningful");
    assert.match(ry[0].getAttribute("title") ?? "", /^not meaningful/);
    assert.equal(text(mc[0]), "— not covered");
    assert.equal(visible(mc[2]), "49.1%");
    assert.doesNotMatch(visible($('[data-testid="metrics"]')!), /not covered|not meaningful|pending|not computed/);
  });

  it("QA D1: the table's scroll box is positioned, so the sr-only text of '—' cells can't widen the page", async () => {
    const all = ["rev_g_1y", "rev_cagr_3y", "rev_cagr_5y", "rev_cagr_10y", "roic_1y", "eps_1y", "ebit_margin_1y", "gross_margin_1y", "share_of_book"];
    await render(PAGE(all));
    const box = $('[data-testid="metric-scroll"]')!;
    assert.ok(box.classList.contains("overflow-x-auto"), "the table scrolls inside its own box");
    assert.ok(box.classList.contains("relative"), "the box is the containing block of absolutely positioned descendants");
    const srOnly = $$('[data-testid="metric-cell"] .sr-only');
    assert.ok(srOnly.length > 0, "the fixture has missing figures with screen-reader text");
    assert.ok(srOnly.every((s) => box.contains(s)), "every sr-only reason sits inside the scroll box");
    assert.equal(box.querySelector("table")?.closest('[data-testid="metric-scroll"]'), box);
  });

  it("QA D2: Enter on a full chip name adds exactly that chip (3y vs 10y), case-insensitive; else the best match", async () => {
    const enter = (el: Element) => act(async () => void el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    const cases: [string, string][] = [
      ["Revenue CAGR 3y", "rev_cagr_3y"],
      ["revenue cagr 10Y", "rev_cagr_10y"],
      ["  REVENUE   CAGR 5y ", "rev_cagr_5y"],
      ["Gross margin (1y)", "gross_margin_1y"],
      ["EPS (1y)", "eps_1y"],
      ["cagr 10", "rev_cagr_10y"], // no exact label: the only match
      ["cagr", "rev_cagr_3y"], // no exact label: the first in catalog order
    ];
    for (const [q, want] of cases) {
      puts = [];
      await render(PAGE(["rev_g_1y"]));
      const search = $('[data-testid="metric-search"]')!;
      await type(search, q);
      await enter(search);
      assert.deepEqual(puts, [{ columns: ["rev_g_1y", want] }], `Enter on ${JSON.stringify(q)}`);
      await act(async () => root.unmount());
      container.remove();
    }
    await render(PAGE(DEFAULTS)); // for afterEach
    // The ranking itself: the exact label first, then labels that start with the query, then catalog order.
    assert.deepEqual(matchingChips("Revenue CAGR 3y", []).map((c) => c.key), ["rev_cagr_3y"]);
    assert.deepEqual(matchingChips("revenue cagr 10y", []).map((c) => c.key), ["rev_cagr_10y"]);
    assert.deepEqual(matchingChips("1y", []).map((c) => c.key)[0], "rev_g_1y");
    assert.equal(exactChip("revenue cagr 3Y", [])?.key, "rev_cagr_3y");
    assert.equal(exactChip("Revenue CAGR 3y", ["rev_cagr_3y"]), undefined, "a kept chip is never re-added");
    assert.equal(exactChip("Revenue CAGR", []), undefined);
  });

  it("QA (b): an option press keeps focus in the search; a click during a save keeps the query; the field stays enabled", async () => {
    release = () => {};
    await render(PAGE(["rev_g_1y"]));
    const search = $('[data-testid="metric-search"]')! as HTMLInputElement;
    search.focus();
    await type(search, "gross");
    const opt = $('[data-testid="metric-option"]')!;
    const down = new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => void opt.dispatchEvent(down));
    assert.equal(down.defaultPrevented, true, "mousedown on an option is prevented (focus stays)");
    await click(opt);
    assert.equal(puts.length, 1);
    assert.equal(search.disabled, false, "the search stays enabled while saving (typed keys aren't dropped)");
    assert.equal(dom.window.document.activeElement, search);
    // A second pick while the first save is in flight: no PUT, and the typed query is kept.
    await type(search, "ebit");
    await act(async () => void search.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.equal(puts.length, 1);
    assert.equal(search.value, "ebit");
    await act(async () => release?.());
  });

  it("#58 + QA D2: in the combobox an exact name is listed first and highlighted, Enter adds it; arrows still pick others", async () => {
    const key = (el: Element, k: string) =>
      act(async () => void el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })));
    release = () => {}; // hold the save open to look at the field while saving
    await render(PAGE(["rev_g_1y"]));
    const search = $('[data-testid="metric-search"]')! as HTMLInputElement;
    search.focus();
    await type(search, "revenue cagr 3Y");
    let opts = $$('[data-testid="metric-option"]');
    assert.equal(opts[0].dataset.key, "rev_cagr_3y");
    assert.equal(opts[0].getAttribute("aria-selected"), "true");
    assert.equal(search.getAttribute("aria-activedescendant"), opts[0].id);
    await key(search, "Enter");
    assert.deepEqual(puts.at(-1), { columns: ["rev_g_1y", "rev_cagr_3y"] }, "Enter on the full name adds 3y, not 10y");
    assert.equal(search.readOnly, false, "the field takes keys while saving (QA (b))");
    assert.equal(search.disabled, false);
    assert.equal(dom.window.document.activeElement, search);
    await act(async () => release?.());
    release = null;
    await act(async () => root.unmount());
    container.remove();
    // No exact name: the highlight decides (first = best match; End moves it to 10y).
    puts = [];
    await render(PAGE(["rev_g_1y"]));
    const s2 = $('[data-testid="metric-search"]')! as HTMLInputElement;
    await type(s2, "revenue cagr");
    opts = $$('[data-testid="metric-option"]');
    assert.deepEqual(opts.map((o) => o.dataset.key), ["rev_cagr_3y", "rev_cagr_5y", "rev_cagr_10y"]);
    await key(s2, "End");
    await key(s2, "Enter");
    assert.deepEqual(puts, [{ columns: ["rev_g_1y", "rev_cagr_10y"] }]);
  });

  it("one PUT per click burst on a chip (guard like Save / Delete)", async () => {
    release = () => {};
    await render(PAGE(DEFAULTS));
    const x = $('[aria-label="Remove ROIC (1y)"]')!;
    await act(async () => {
      x.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      x.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await click($('[aria-label="Remove Share of the book"]')!);
    await act(async () => release?.());
    assert.equal(puts.length, 1);
  });
});
