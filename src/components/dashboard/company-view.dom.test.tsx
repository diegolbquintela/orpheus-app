// #95 company view in jsdom (CV-07..CV-09 at the DOM level): sections in order, rows with statuses, the range buttons.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { companyView } from "../../lib/dashboard/company";
import { CompanyViewPage } from "./company-view";

let container: HTMLElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const closes = Array.from({ length: 3000 }, (_, i) => ({
  date: new Date(Date.UTC(2017, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
  close: 5 + i / 100,
}));
const view = companyView({
  symbol: "PLTR",
  name: "Palantir Technologies Inc.",
  exchange: "NASDAQ",
  currency: "USD",
  covered: true,
  checked: true,
  closes,
  years: [{ end: "2024-12-31", values: { revenue: 2.865e9, net_income: 4.6e8, diluted_shares: 2.5e9 }, units: { revenue: "USD" } }],
  metrics: {},
  dividends: [],
  today: closes.at(-1)!.date,
});

describe("CompanyViewPage", () => {
  it("renders header, chart, six sections in order; range buttons switch the chart", () => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<CompanyViewPage view={view} />));
    const q = (s: string) => container.querySelector(s);
    assert.equal(q('[data-testid="company-name"]')?.textContent, "Palantir Technologies Inc.");
    assert.equal(q('[data-testid="company-meta"]')?.textContent, "PLTR · NASDAQ · USD");
    const titles = [...container.querySelectorAll("section h2")].map((h) => h.textContent);
    assert.deepEqual(titles, ["Profile", "Margins", "Returns", "Valuation", "Growth", "Dividends"]);
    assert.ok([...container.querySelectorAll("section h2")].every((h) => h.className === "ow-label"));
    assert.equal(q('[data-testid="company-row-revenue"] dd')?.textContent, "$2,865,000,000");
    assert.equal(q('[data-testid="company-row-employees"]')?.getAttribute("data-status"), "not_reported");
    const box = () => Number(q(".company-chart-box")?.getAttribute("data-points"));
    assert.equal(q('[data-testid="company-range-1y"]')?.getAttribute("aria-pressed"), "true");
    const one = box();
    act(() => (q('[data-testid="company-range-max"]') as HTMLButtonElement).click());
    assert.equal(q('[data-testid="company-range-max"]')?.getAttribute("aria-pressed"), "true");
    assert.ok(box() > one);
    assert.match(q('[data-testid="company-change"]')?.textContent ?? "", /^\+\d+\.\d% over Max$/);
    assert.match(q('[data-testid="company-source"]')?.textContent ?? "", /SEC filings/);
  });
  it("#123 ES-14: derived rows carry a dim 'derived' marker (.ow-label) with an accessible explanation; reported rows none", () => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.append(container);
    root = createRoot(container);
    const derivedView = companyView({
      symbol: "RMS.PA",
      name: "Hermès International",
      exchange: "Paris",
      currency: "EUR",
      covered: true,
      fundamentalsSource: "esef",
      checked: true,
      closes,
      years: [
        {
          end: "2024-12-31",
          values: { revenue: 15.17e9, net_income: 4.603e9, diluted_shares: 104924778, operating_cash_flow: 5.139e9, capex: 1.067e9, operating_income: 6.15e9 },
          units: { revenue: "EUR" },
          derived: { diluted_shares: "shares_from_eps", capex: "capex_broad_ifrs" },
        },
      ],
      metrics: {},
      dividends: [],
      today: closes.at(-1)!.date,
    });
    act(() => root.render(<CompanyViewPage view={derivedView} />));
    const mark = (k: string) => container.querySelector(`[data-testid="company-derived-${k}"]`);
    for (const k of ["shares", "market_cap", "ev", "ev_ebit", "fcf_margin", "p_fcf"]) {
      assert.equal(mark(k)?.textContent, "derived", k);
      assert.equal(mark(k)?.className, "ow-label ml-2", k);
      assert.match(mark(k)?.getAttribute("title") ?? "", /^Derived: /, k);
      assert.match(mark(k)?.getAttribute("aria-label") ?? "", /^derived: Derived: /, k);
    }
    assert.match(mark("shares")?.getAttribute("title") ?? "", /net income ÷ diluted EPS/);
    assert.match(mark("fcf_margin")?.getAttribute("title") ?? "", /broad IFRS line/);
    assert.match(mark("p_fcf")?.getAttribute("title") ?? "", /net income ÷ diluted EPS.*broad IFRS line/);
    for (const k of ["revenue", "net_margin", "pe", "gross_margin"]) assert.equal(mark(k), null, k);
    // The figure itself is unchanged (the marker sits with the label, not in the value).
    assert.equal(container.querySelector('[data-testid="company-row-revenue"] dd')?.textContent, "€15,170,000,000");
    // A reported view (PLTR above) has no marker.
    act(() => root.render(<CompanyViewPage view={view} />));
    assert.equal(container.querySelectorAll('[data-testid^="company-derived-"]').length, 0);
  });
  it("#121 NC-04: an uncovered listing shows the coverage line, Not covered rows, the chart", () => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.append(container);
    root = createRoot(container);
    const nc = companyView({
      symbol: "RMS.PA",
      name: "Hermès International",
      exchange: "Paris",
      currency: "EUR",
      covered: false,
      checked: true,
      closes,
      years: [],
      metrics: {},
      dividends: [{ exDate: closes.at(-30)!.date, cash: 18 }],
      today: closes.at(-1)!.date,
    });
    act(() => root.render(<CompanyViewPage view={nc} />));
    const q = (s: string) => container.querySelector(s);
    assert.equal(q('[data-testid="company-coverage"]')?.textContent, "Not covered: no SEC filings");
    assert.equal(q('[data-testid="company-row-revenue"] dd')?.textContent, "Not covered");
    assert.equal(q('[data-testid="company-row-dps_ttm"] dd')?.textContent, "€18.00");
    assert.ok(q('[data-testid="company-chart-svg"]'));
    assert.match(q('[data-testid="company-source"]')?.textContent ?? "", /no SEC filings for this listing$/);
  });
  it("a covered listing has no coverage line", () => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<CompanyViewPage view={view} />));
    assert.equal(container.querySelector('[data-testid="company-coverage"]'), null);
  });
});

describe("CompanyViewPage: funds (#124)", () => {
  const fundInput = {
    symbol: "VDY.TO",
    name: "Vanguard FTSE Canadian High Dividend Yield Index ETF",
    exchange: "Toronto",
    currency: "CAD",
    covered: false,
    checked: true,
    closes,
    years: [],
    metrics: {},
    dividends: [{ exDate: closes.at(-30)!.date, cash: 0.55 }],
    today: closes.at(-1)!.date,
  };
  const mount = (v: ReturnType<typeof companyView>) => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<CompanyViewPage view={v} />));
    return (s: string) => container.querySelector(s);
  };
  const COMPANY = ["profile", "margins", "returns", "valuation", "growth"];
  it("FD-09: a fund shows the fund line in place of the five company sections; chart and Dividends stay; no coverage line", () => {
    const q = mount(companyView({ ...fundInput, kind: "fund", securityType: "ETP" }));
    assert.equal(q('[data-testid="company-fund-line"]')?.textContent, "Fund: company figures do not apply");
    assert.equal(q('[data-testid="company-fund"] h2')?.className, "ow-label");
    for (const k of COMPANY) assert.equal(q(`[data-testid="company-section-${k}"]`), null, k);
    assert.ok(q('[data-testid="company-section-dividends"]'));
    assert.ok(q('[data-testid="company-chart-svg"]'));
    assert.ok(q('[data-testid="company-range-1y"]'));
    assert.equal(q('[data-testid="company-coverage"]'), null);
    assert.equal(q('[data-testid="company-source"]')?.textContent, "Daily closes and dividends as stored by the Dashboard · fund type from OpenFIGI");
  });
  it("FD-10: a company (or unclassified) view renders as before: six sections, no fund block", () => {
    for (const kind of ["company", undefined] as const) {
      const q = mount(companyView({ ...fundInput, kind }));
      assert.equal(q('[data-testid="company-fund"]'), null);
      assert.deepEqual([...container.querySelectorAll("section h2")].map((h) => h.textContent), ["Profile", "Margins", "Returns", "Valuation", "Growth", "Dividends"]);
      assert.equal(q('[data-testid="company-coverage"]')?.textContent, "Not covered: no SEC filings");
      act(() => root.unmount());
      container.remove();
    }
    // afterEach unmounts once more: give it a fresh root.
    mount(companyView({ ...fundInput, kind: "company" }));
  });
});

describe("CompanyViewPage: the ROIC method tooltip (#130, CV-16..CV-20)", () => {
  const TEXT =
    "Operating income after tax ÷ average (equity + debt − cash). Cash excluded.";
  const roicView = (status: string, value: number | null) =>
    companyView({
      symbol: "RMS.PA",
      name: "Hermès International",
      exchange: "Paris",
      currency: "EUR",
      covered: true,
      checked: true,
      closes,
      years: [{ end: "2024-12-31", values: { revenue: 1.517e10, net_income: 4.6e9, equity_parent: 1.84e10 }, units: { revenue: "EUR" } }],
      metrics: { roic_1y: { value, status } },
      dividends: [],
      today: closes.at(-1)!.date,
    });
  const mount = (v: ReturnType<typeof companyView>) => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<CompanyViewPage view={v} />));
  };
  const btn = () => container.querySelector('[data-testid="company-roic-info"]') as HTMLButtonElement;
  const tip = () => container.querySelector('[data-testid="company-roic-tip"]') as HTMLElement;
  const isOpen = () => tip().getAttribute("data-open") === "true";
  const fire = (el: EventTarget, type: string, Ctor: typeof Event = dom.window.MouseEvent as unknown as typeof Event) =>
    act(() => void el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true })));
  const esc = () => act(() => void dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  /** A tap: pointerdown, then the touch-emulated hover and focus, then the click (as a phone fires them). */
  const tap = (el: HTMLElement) => {
    fire(el, "pointerdown");
    fire(el, "mouseover");
    act(() => el.focus());
    act(() => el.click());
  };

  it("CV-16 / CV-19: one button by the ROIC label only; the exact text; role tooltip; aria-describedby / aria-expanded; always in the DOM", () => {
    mount(roicView("ok", 0.706));
    const roicDt = container.querySelector('[data-testid="company-row-roic"] dt')!;
    assert.equal(btn().closest("dt"), roicDt, "beside the ROIC label");
    assert.equal(container.querySelectorAll('[data-testid="company-roic-info"]').length, 1, "ROIC only");
    for (const k of ["roa", "roe", "roce"]) assert.equal(container.querySelector(`[data-testid="company-row-${k}"] button`), null, k);
    assert.equal(btn().getAttribute("aria-label"), "How ROIC is calculated");
    assert.equal(btn().getAttribute("type"), "button");
    assert.equal(tip().getAttribute("role"), "tooltip");
    assert.equal(tip().textContent, TEXT);
    assert.ok(tip().id);
    assert.equal(btn().getAttribute("aria-describedby"), tip().id);
    assert.equal(dom.window.document.getElementById(btn().getAttribute("aria-describedby")!), tip());
    assert.equal(isOpen(), false);
    assert.equal(btn().getAttribute("aria-expanded"), "false");
    assert.equal(container.querySelector('[data-testid="company-row-roic"] dd')?.textContent, "70.6%", "the value is unchanged");
  });
  it("CV-17: hover (the button, then the tooltip itself) opens it; leaving closes it", () => {
    mount(roicView("ok", 0.706));
    fire(btn(), "mouseover");
    assert.equal(isOpen(), true);
    assert.equal(btn().getAttribute("aria-expanded"), "true");
    fire(btn(), "mouseout"); // moving within the wrapper onto the tooltip keeps it open (WCAG 1.4.13)
    fire(tip(), "mouseover");
    assert.equal(isOpen(), true);
    act(() => void tip().dispatchEvent(new dom.window.MouseEvent("mouseout", { bubbles: true, relatedTarget: dom.window.document.body })));
    assert.equal(isOpen(), false);
  });
  it("CV-17: keyboard focus opens it; blur closes it; Escape closes it while focused", () => {
    mount(roicView("ok", 0.706));
    act(() => btn().focus());
    assert.equal(isOpen(), true);
    esc();
    assert.equal(isOpen(), false);
    assert.equal(dom.window.document.activeElement, btn(), "focus stays on the button");
    act(() => btn().blur());
    act(() => btn().focus());
    assert.equal(isOpen(), true);
    act(() => btn().blur());
    assert.equal(isOpen(), false);
  });
  it("CV-18: a tap opens it; a second tap closes it; a tap elsewhere closes it; Escape closes it", () => {
    mount(roicView("ok", 0.706));
    tap(btn());
    assert.equal(isOpen(), true, "first tap: open (not toggled shut by its own hover and focus)");
    tap(btn());
    assert.equal(isOpen(), false, "second tap: closed");
    tap(btn());
    assert.equal(isOpen(), true);
    fire(dom.window.document.body, "pointerdown");
    assert.equal(isOpen(), false, "a tap elsewhere");
    tap(btn());
    esc();
    assert.equal(isOpen(), false, "Escape");
  });
  it("CV-20: shown for any ROIC status; a fund has none", () => {
    for (const [status, value] of [["n/m", null], ["insufficient_history", null]] as const) {
      mount(roicView(status, value));
      assert.equal(tip().textContent, TEXT, status);
      act(() => root.unmount());
      container.remove();
    }
    mount(companyView({ symbol: "VDY.TO", name: "ETF", exchange: "Toronto", currency: "CAD", covered: false, checked: true, closes, years: [], metrics: {}, dividends: [], today: closes.at(-1)!.date, kind: "fund", securityType: "ETP" }));
    assert.equal(btn(), null);
  });
});
