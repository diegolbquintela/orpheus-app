// #215 (spec 55, PFSC-12: the stored value, unchanged) and #221 (spec 57, AC PFPJ): the scenario projection math (CFO
// 2026-10-22: r_m, positive-only growth, month 0 once, Overview's own figures), the local net-assets parse, and the
// Overview's Future projection on the shared step (CFO Q-b).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeRates } from "./equity.ts";
import { writeExpenses } from "./expenses.ts";
import { recordRefusal } from "./field-errors.ts";
import { writeMonths } from "./months.ts";
import { NO_OVERVIEW, writeOverview } from "./overview.ts";
import { checkRecord, RecordStore, type PfRecord } from "./record.ts";
import { parseAmount } from "./expenses.ts";
import { lineFigures, savedOverviewFigures } from "./months.ts";
import { summarize } from "./overview.ts";
import { monthlyRate, projectNet, stepNet } from "./projection.ts";
import {
  asScenario,
  DEFAULT_HORIZON,
  formatPercent,
  growthOk,
  HORIZONS,
  horizonLabel,
  type Inputs,
  NOW_LABEL,
  parseNetAssets,
  project,
  readScenario,
  savedInputs,
  SCENARIO_KEY,
  scenarioText,
  withScenario,
} from "./scenario.ts";

const NOW = new Date("2026-10-16T16:00:00Z"); // household month 2026-10
const line = (id: string, amount: string, category = "") => ({
  id,
  name: id,
  amount,
  per: "month" as const,
  equity: "",
  account: "",
  currency: "",
  rate: "",
  category,
});
const person = {
  id: "p1",
  name: "Ana",
  wages: "120,000",
  bonus: "",
  tax: "25",
  share: "100",
  countWages: true,
  countBonus: false,
  foreign: false,
  currency: "",
  rate: "",
};

function record(start = "100,000"): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: ["Home", "Food"] });
  writeRates(s, { withdrawal: "4", roic: "" });
  writeOverview(s, { ...NO_OVERVIEW, start, growth: "" });
  writeMonths(s, {
    "2026-08": { fixed: [line("rent", "9999", "Home")], variable: [], people: [person] },
    "2026-09": {
      fixed: [line("rent", "2000", "Home")],
      variable: [line("food", "500", "Food"), line("misc", "100")],
      people: [person],
    },
  });
  return s.data;
}
const at9 = (start: number, surplus: number): Inputs => ({
  current: "2026-10",
  start,
  income: surplus > 0 ? surplus : 0,
  expenses: surplus < 0 ? -surplus : 0,
  growth: 9,
  rate: null,
});
const near = (a: number, b: number, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

describe("#221 scenario projection (CFO 2026-10-22)", () => {
  it("PFPJ-01 A: start 10,000, +500 a month at 9 %/yr → 17,143.65 after 12 months", () => {
    const p = project(at9(10000, 500), 12);
    near(p.totals.netEnd, 17143.65);
    assert.equal(p.points[12].net, 17143.65);
    assert.notEqual(Math.round(p.totals.netEnd * 100) / 100, 17191.86, "not annual ÷ 12");
  });
  it("PFPJ-02 B: start 0, −1,460 a month → exactly −17,520 after 12 months, a straight line (no growth on ≤ 0)", () => {
    const p = project(at9(0, -1460), 12);
    assert.equal(p.totals.netEnd, -17520);
    p.points.forEach((pt, i) => assert.equal(pt.net, i === 0 ? 0 : -1460 * i, `month ${i}`));
    assert.equal(p.totals.growthEarned, 0);
  });
  it("PFPJ-03 C: start −2,000, +500 → 0 at month 4, growth only on a positive opening balance, 4,102.37 after 12 (exact 4,102.370180097717)", () => {
    const p = project(at9(-2000, 500), 12);
    near(p.totals.netEnd, 4102.37, 0.01);
    assert.equal(p.totals.netEnd, 4102.370180097717);
    assert.equal(p.points[4].net, 0);
    assert.equal(p.points[5].net, 500, "opening 0: no growth that month");
    near(p.points[6].net, 1003.6, 0.005); // 500 × (1 + r_m) + 500 = 1,003.6037, shown to the cent
  });
  it("PFPJ-04: r_m = (1 + annual)^(1/12) − 1 (9 % → 0.7207 %), never annual ÷ 12; the step grows N > 0 only, then adds the surplus", () => {
    near(monthlyRate(9) * 100, 0.7207, 0.0001);
    assert.notEqual(monthlyRate(9), 0.09 / 12);
    assert.equal(stepNet(-100, 0, monthlyRate(9)), -100);
    assert.equal(stepNet(0, 50, monthlyRate(9)), 50);
    near(stepNet(1000, 0, monthlyRate(9)), 1007.2073, 0.0001);
  });
  it("PFPJ-05: month 0 is the start, plotted once and labelled Now; horizon + 1 points; horizons 12 / 36 / 60 / 120", () => {
    assert.deepEqual([...HORIZONS], [12, 36, 60, 120]);
    assert.equal(DEFAULT_HORIZON, 12);
    assert.deepEqual(HORIZONS.map(horizonLabel), ["12 months", "3 years", "5 years", "10 years"]);
    for (const h of HORIZONS) {
      const p = project(at9(10000, 500), h);
      assert.equal(p.points.length, h + 1);
      assert.equal(p.points[0].net, 10000);
      assert.equal(p.points[0].label, NOW_LABEL);
      assert.equal(p.points[0].key, "2026-10");
      assert.equal(p.points.filter((x) => x.key === "2026-10").length, 1);
      assert.equal(p.points[1].key, "2026-11");
      assert.deepEqual(p.points.map((x) => x.net), projectNet(10000, 500, 9, h).map((n) => Math.round(n * 100) / 100));
    }
  });
  it("PFPJ-06: totals: sums over the horizon, net end = the last point, growth earned = net end − start − surplus", () => {
    const p = project({ ...at9(10000, 0), income: 3000, expenses: 2500, rate: 4 }, 12);
    assert.equal(p.totals.surplus, 6000);
    assert.equal(p.totals.income, 36000);
    assert.equal(p.points[12].net, Math.round(p.totals.netEnd * 100) / 100);
    near(p.totals.growthEarned, p.totals.netEnd - 10000 - 6000, 1e-9);
    assert.ok(p.totals.growthEarned > 0);
  });
  it("PFPJ-07: the baseline is the Overview's own current month (the unsaved copy of last month, #199): surplus = its income − expenses", () => {
    const rec = record();
    const inp = savedInputs(rec, NOW);
    const s = new RecordStore(rec);
    const sum = summarize({ ...JSON.parse(rec["orpheus.finance.overview.v1"] ?? "{}"), future: false, months: {}, years: 1 }, NOW, { expenses: null, income: null }, savedOverviewFigures(s, "2026-10"));
    const cur = sum.points[sum.points.length - 1];
    assert.equal(cur.key, "2026-10");
    assert.equal(inp.expenses, cur.expenses);
    assert.equal(inp.income, cur.income);
    assert.equal(inp.start, cur.net);
    // the copy of 2026-09 (latest month with lines), Q-PJ1: not an average
    assert.equal(inp.expenses, 2600);
    assert.equal(inp.expenses, lineFigures(s, "2026-10")["2026-10"].expenses);
    assert.equal(inp.rate, 4);
  });
  it("PFPJ-08 (AN8 / AN12 / AN6): the local net-assets field: negatives (- and U+2212), +5, .5, 5., thousands commas as the main page; 1e3 refused", () => {
    const ok: [string, number][] = [["-1500", -1500], ["\u22121,500.50", -1500.5], ["+5", 5], [".5", 0.5], ["5.", 5], ["1,234.50", 1234.5], [" 25 000 ", 25000], ["$-3", -3], ["-$3", -3]];
    for (const [t, n] of ok) assert.equal(parseNetAssets(t), n, t);
    for (const t of ["1e3", "", " ", "abc", "--5", "+-5", "5-", "."]) assert.equal(parseNetAssets(t), null, t);
    // the main page's parser is unchanged: no negatives there (parked)
    assert.equal(parseAmount("-5"), null);
    assert.equal(parseAmount("1,234.50"), 1234.5);
  });
  it("PFPJ-10 (AN11): percents show thousands separators", () => {
    assert.equal(formatPercent(123.4567), "12,345.67%");
    assert.equal(formatPercent(0.005), "0.50%");
    assert.equal(formatPercent(null), "—");
  });
  it("PFPJ-09 (AN9): the scenario's growth bound is −50..+50 % a year", () => {
    for (const g of [-50, 0, 9, 50]) assert.equal(growthOk(g), true, String(g));
    for (const g of [-50.01, 50.01, 1000, NaN]) assert.equal(growthOk(g), false, String(g));
  });
});

describe("#221 Overview Future projection on the shared step (CFO Q-b)", () => {
  // Typed Update totals: 2024 (before the window, with an as-of month in 2024) a deficit of 1,000 a month; the window's
  // months as given. The Future projection steps from the current month's net assets with the window's average surplus.
  const ov = (inc: string) => {
    const months: Record<string, { expenses: string; income: string }> = {};
    for (let m = 1; m <= 12; m++) months[`2024-${String(m).padStart(2, "0")}`] = { expenses: "1000", income: "0" };
    for (const k of ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"])
      months[k] = { expenses: "1000", income: inc };
    return { start: "0", growth: "9", future: true, years: 1 as const, asOf: "2024-01", months };
  };
  const future = (inc: string) => {
    const s = summarize(ov(inc), NOW, { expenses: null, income: null });
    const now = s.points.find((p) => p.key === s.current)!;
    return { now: now.net as number, fut: s.points.filter((p) => p.future).map((p) => p.net as number) };
  };
  it("PFPJ-20: a negative balance with a zero average surplus stays flat (no growth on ≤ 0)", () => {
    const { now, fut } = future("1000");
    assert.equal(now, -12000);
    assert.equal(fut.length, 12);
    for (const n of fut) assert.equal(n, -12000);
  });
  it("PFPJ-21: a negative balance crossing above 0: growth only once the opening balance is positive (shared projectNet)", () => {
    // #228 (spec 64): the empty current month adds nothing now, so +900 a month (not +500) still crosses 0 in the year.
    const { now, fut } = future("1900");
    assert.ok(now < 0, String(now));
    const want = projectNet(now, 900, 9, 12).slice(1);
    fut.forEach((n, i) => near(n, want[i], 1e-6));
    assert.ok(fut[0] < 0 && fut[fut.length - 1] > 0);
    // before it crosses, each step is exactly the surplus (no growth on a negative balance)
    assert.equal(fut[1] - fut[0], 900);
  });
  it("PFPJ-22: a positive balance still compounds at r_m (the Overview's rate unchanged)", () => {
    // #228: typed complete months so the average surplus (and so the Future line) exists; before, both sides were null.
    const months = Object.fromEntries(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((k) => [k, { expenses: "100", income: "100" }]));
    const s = summarize({ start: "10000", growth: "9", future: true, years: 1, months }, NOW, { expenses: 100, income: 100 });
    const fut = s.points.filter((p) => p.future).map((p) => p.net as number);
    const now = s.points.find((p) => p.key === s.current)!.net as number;
    assert.equal(now, 10000);
    near(fut[0], now * (1 + monthlyRate(9)), 1e-6);
  });
});

describe("#215 stored scenario value (unchanged)", () => {
  it("PFSC-12: the stored value: levers only, compact, read back; anything else is refused by the API (400, never clamped)", () => {
    const s = {
      income: { a: 0, b: 10 },
      expenses: { Home: -5 },
      rate: 3.5,
      growth: null,
      start: null,
    };
    assert.equal(
      scenarioText(s),
      '{"income":{"b":10},"expenses":{"Home":-5},"rate":3.5,"growth":null,"start":null}',
    );
    const r = withScenario(record(), s);
    assert.deepEqual(readScenario(r), {
      income: { b: 10 },
      expenses: { Home: -5 },
      rate: 3.5,
      growth: null,
      start: null,
    });
    // Only the scenario value changes; every month, line and rate is the same text.
    const { [SCENARIO_KEY]: _s, ...rest } = r;
    void _s;
    assert.deepEqual(rest, record());
    assert.equal(checkRecord(r).ok, true);
    assert.equal(recordRefusal(r, "2026-10"), null);
    for (const bad of [
      "nope",
      "[]",
      '{"income":{"a":2000}}',
      '{"rate":101}',
      '{"income":{"a":"10"}}',
      '{"growth":-101}',
    ])
      assert.deepEqual(
        recordRefusal({ ...record(), [SCENARIO_KEY]: bad }, "2026-10"),
        { field: "scenario", error: "Invalid value." },
        bad,
      );
    assert.equal(asScenario({}) !== null, true);
    assert.equal(readScenario({}), null);
  });
});
