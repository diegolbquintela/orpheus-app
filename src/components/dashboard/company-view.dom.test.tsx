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
