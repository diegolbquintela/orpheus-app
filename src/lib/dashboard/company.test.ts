// #95 company view formulas (attachments/dashboard-company-view-design.md section 2; CV-01..CV-06). Pure.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyView, rangeOf, shiftDays, totalDebt, type CompanyInput } from "./company.ts";

const closes = Array.from({ length: 800 }, (_, i) => {
  const d = new Date(Date.UTC(2023, 7, 1) + i * 86_400_000).toISOString().slice(0, 10);
  return { date: d, close: 10 + i * 0.01 };
}).filter((c) => c.date <= "2025-10-10");
const last = closes.at(-1)!;

const BASE: CompanyInput = {
  symbol: "PLTR",
  name: "Palantir Technologies Inc.",
  exchange: "NASDAQ",
  currency: "USD",
  covered: true,
  checked: true,
  closes,
  years: [
    {
      end: "2024-12-31",
      values: {
        revenue: 1000, gross_profit: 800, operating_income: 200, net_income: 150, operating_cash_flow: 300, capex: 50,
        total_assets: 2200, current_liabilities: 400, equity_parent: 1600, diluted_shares: 100, eps_diluted: 1.5,
        cash: 100, long_term_debt: 40,
      },
      units: { revenue: "USD" },
    },
    { end: "2023-12-31", values: { total_assets: 1800, current_liabilities: 200, equity_parent: 1400, eps_diluted: 1.0 }, units: {} },
  ],
  metrics: { roic_1y: { value: 0.123, status: "ok" }, rev_g_1y: { value: 0.287, status: "ok" }, rev_cagr_10y: { value: null, status: "insufficient_history" } },
  dividends: [],
  today: "2025-10-12",
};
const rows = (v: ReturnType<typeof companyView>) => Object.fromEntries(v.sections.flatMap((s) => s.rows.map((r) => [r.key, r])));

describe("company view (CV-01..CV-06)", () => {
  const v = companyView(BASE);
  const r = rows(v);
  it("sections in order", () => {
    assert.deepEqual(v.sections.map((s) => s.title), ["Profile", "Margins", "Returns", "Valuation", "Growth", "Dividends"]);
    assert.equal(v.fiscalYear, "FY2024");
  });
  it("CV-01 profile", () => {
    assert.equal(r.market_cap.value, last.close * 100);
    assert.equal(r.ev.value, last.close * 100 + 40 - 100);
    assert.equal(r.shares.text, "100");
    assert.equal(r.revenue.text, "$1,000.00");
    assert.equal(r.employees.text, "Not reported");
    assert.equal(companyView({ ...BASE, years: [{ ...BASE.years[0], values: { ...BASE.years[0].values, revenue: 5e11 } }] }).sections[0].rows[3].text, "$500,000,000,000");
  });
  it("CV-02 margins", () => {
    assert.equal(r.gross_margin.text, "80.0%");
    assert.equal(r.operating_margin.text, "20.0%");
    assert.equal(r.net_margin.text, "15.0%");
    assert.equal(r.fcf_margin.text, "25.0%");
    const neg = rows(companyView({ ...BASE, years: [{ ...BASE.years[0], values: { ...BASE.years[0].values, revenue: 0 } }] }));
    assert.equal(neg.gross_margin.text, "n/m");
  });
  it("CV-03 returns on averages", () => {
    assert.equal(r.roa.text, "7.5%"); // 150 / 2000
    assert.equal(r.roe.text, "10.0%"); // 150 / 1500
    assert.equal(r.roce.text, "11.8%"); // 200 / ((1800 + 1600) / 2)
    assert.equal(r.roic.text, "12.3%");
    const one = rows(companyView({ ...BASE, years: [BASE.years[0]] }));
    assert.equal(one.roa.text, "6.8%", "latest alone: 150 / 2200");
  });
  it("CV-04 valuation", () => {
    assert.equal(r.pe.text, `${(last.close / 1.5).toFixed(1)}×`);
    assert.equal(r.ev_ebit.text, `${((last.close * 100 - 60) / 200).toFixed(1)}×`);
    assert.equal(r.p_fcf.text, `${((last.close * 100) / 250).toFixed(1)}×`);
    const loss = rows(companyView({ ...BASE, years: [{ ...BASE.years[0], values: { ...BASE.years[0].values, eps_diluted: -0.2 } }] }));
    assert.equal(loss.pe.text, "n/m");
  });
  it("CV-05 growth and dividends", () => {
    assert.equal(r.rev_g_1y.text, "28.7%");
    assert.equal(r.rev_cagr_10y.text, "n/m");
    assert.equal(r.eps_g_1y.text, "50.0%");
    assert.equal(r.dps_ttm.text, "No dividends");
    const d = rows(companyView({ ...BASE, dividends: [{ exDate: "2024-01-05", cash: 9 }, { exDate: "2025-03-01", cash: 0.5 }, { exDate: "2025-09-01", cash: 0.5 }] }));
    assert.equal(d.dps_ttm.text, "$1.00");
    assert.equal(d.yield_ttm.text, `${((1 / last.close) * 100).toFixed(1)}%`);
    assert.equal(d.last_ex.text, "2025-09-01");
  });
  it("CV-06 no SEC coverage / pending / currency mismatch", () => {
    const nc = companyView({ ...BASE, covered: false, years: [] });
    const nr = rows(nc);
    assert.equal(nr.market_cap.text, "Not covered");
    assert.equal(nr.roic.text, "Not covered");
    assert.equal(nc.sections[0].note, "No SEC filings for this listing.");
    assert.ok(nc.last && nc.chart.length > 0, "price and chart still shown");
    // #121 (NC-01..NC-03): one plain line and an honest source line.
    assert.equal(nc.coverage, "Not covered: no SEC filings");
    assert.equal(nc.source, "Daily closes and dividends as stored by the Dashboard · no SEC filings for this listing");
    assert.ok(nc.sections.slice(0, 5).every((s) => s.rows.every((r) => r.status === "not_covered")));
    assert.equal(companyView({ ...BASE, checked: false }).coverage, null, "pending: no line");
    assert.equal(v.coverage, null);
    assert.match(v.source, /^SEC filings/);
    assert.equal(rows(companyView({ ...BASE, checked: false })).revenue.text, "Pending");
    const mm = rows(companyView({ ...BASE, currency: "CAD" }));
    assert.equal(mm.market_cap.text, "— (currency mismatch)");
    assert.equal(mm.gross_margin.text, "80.0%", "ratios of the filings themselves still shown");
  });
  it("chart ranges and debt rules", () => {
    const y1 = rangeOf(v.chart, "1y");
    assert.ok(y1.points[0][0] >= shiftDays(last.date, -365) && y1.points[0][0] <= shiftDays(last.date, -360));
    assert.ok(rangeOf(v.chart, "max").points.length > y1.points.length);
    assert.ok(v.chart.length < closes.length, "older closes thinned");
    assert.equal(totalDebt({ long_term_debt_current: 5, long_term_debt_noncurrent: 10, long_term_debt: 99, short_term_borrowings: 1 }), 16);
  });
});
