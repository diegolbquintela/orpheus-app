// #215 (personal-finance-spec 55; AC PFSC-04..PFSC-12): the scenario projection math, horizons and the stored value.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeRates } from "./equity.ts";
import { writeExpenses } from "./expenses.ts";
import { recordRefusal } from "./field-errors.ts";
import { writeMonths } from "./months.ts";
import { NO_OVERVIEW, writeOverview } from "./overview.ts";
import { checkRecord, RecordStore, type PfRecord } from "./record.ts";
import {
  asScenario,
  baselineOf,
  type Baseline,
  DEFAULT_HORIZON,
  HORIZONS,
  horizonLabel,
  NO_SCENARIO,
  parseLever,
  project,
  readScenario,
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
const flat = (over: Partial<Baseline> = {}): Baseline => ({
  month: "2026-09",
  current: "2026-10",
  currency: "CAD",
  income: [{ id: "a", label: "A", monthly: 5000 }],
  categories: [
    { id: "Home", label: "Home", monthly: 2000 },
    { id: "", label: "No category", monthly: 1000 },
  ],
  rate: 4,
  growth: 0,
  start: 10000,
  ...over,
});

describe("#215 scenario baseline", () => {
  it("PFSC-04: today's figures come from the latest month with lines (income lines, expenses by category, Rate used)", () => {
    const b = baselineOf(record(), NOW);
    assert.equal(b.month, "2026-09");
    assert.equal(b.current, "2026-10");
    assert.deepEqual(
      b.income.map((l) => [l.id, l.monthly]),
      [["p1-wages", 7500]],
    ); // 120,000 × 75% ÷ 12
    assert.deepEqual(
      b.categories.map((c) => [c.id, c.label, c.monthly]),
      [
        ["Food", "Food", 500],
        ["Home", "Home", 2000],
        ["", "No category", 100],
      ],
    );
    assert.equal(b.rate, 4);
    assert.equal(b.growth, 0);
    assert.ok(Number.isFinite(b.start));
  });
  it("PFSC-04: no month with lines → no baseline month, nothing to move, start = typed Starting net assets", () => {
    const b = baselineOf({}, NOW);
    assert.equal(b.month, null);
    assert.deepEqual([b.income, b.categories], [[], []]);
    assert.equal(b.start, 0);
  });
});

describe("#215 projection math", () => {
  it("PFSC-05: no levers → today's surplus each month; net assets add it month by month (growth 0)", () => {
    const p = project(flat(), NO_SCENARIO, 12);
    assert.equal(p.points.length, 12);
    assert.deepEqual(
      [p.points[0].key, p.points[0].label, p.points[11].key],
      ["2026-11", "Nov 26", "2027-10"],
    );
    assert.deepEqual(
      [p.points[0].income, p.points[0].expenses, p.points[0].surplus, p.points[0].net],
      [5000, 3000, 2000, 12000],
    );
    assert.equal(p.points[11].net, 10000 + 12 * 2000);
    assert.deepEqual(
      [p.totals.income, p.totals.expenses, p.totals.surplus, p.totals.netEnd],
      [60000, 36000, 24000, 34000],
    );
  });
  it("PFSC-06: income and category levers are % changes of today's lines; recalculated from the levers alone", () => {
    const p = project(
      flat(),
      { ...NO_SCENARIO, income: { a: 10 }, expenses: { Home: -50, "": 100 } },
      12,
    );
    assert.deepEqual(
      [p.totals.monthlyIncome, p.totals.monthlyExpenses, p.totals.monthlySurplus],
      [5500, 3000, 2500],
    );
    assert.equal(p.totals.netEnd, 10000 + 12 * 2500);
    // A lever on an unknown id moves nothing.
    assert.equal(
      project(flat(), { ...NO_SCENARIO, income: { zzz: 50 } }, 12).totals.monthlyIncome,
      5000,
    );
    // -100 % removes a line entirely.
    assert.equal(
      project(flat(), { ...NO_SCENARIO, income: { a: -100 } }, 12).totals.monthlyIncome,
      0,
    );
  });
  it("PFSC-07: growth compounds monthly at (1 + g)^(1/12) before the surplus (the Overview Future rule)", () => {
    const p = project(flat({ income: [], categories: [] }), { ...NO_SCENARIO, growth: 12 }, 12);
    assert.ok(Math.abs(p.totals.netEnd - 11200) < 0.01, String(p.totals.netEnd)); // 10,000 × 1.12 after a year
    const q = project(flat(), { ...NO_SCENARIO, growth: 5 }, 1);
    assert.ok(Math.abs(q.points[0].net - (10000 * Math.pow(1.05, 1 / 12) + 2000)) < 0.01);
  });
  it("PFSC-08: Rate used, growth and net-assets levers replace today's; coverage at the horizon end", () => {
    const p = project(flat(), { ...NO_SCENARIO, rate: 6, start: 0 }, 12);
    assert.equal(p.rate, 6);
    assert.equal(p.start, 0);
    assert.equal(p.totals.netEnd, 24000);
    assert.equal(p.totals.coverageMonthly, (24000 * 0.06) / 12);
    assert.equal(p.totals.coverageShare, 120 / 3000);
    // No rate, or net assets ≤ 0 at the end → no coverage (never a division by zero).
    assert.equal(project(flat({ rate: null }), NO_SCENARIO, 12).totals.coverageMonthly, null);
    const neg = project(flat({ start: -100000 }), NO_SCENARIO, 12);
    assert.deepEqual([neg.totals.coverageMonthly, neg.totals.coverageShare], [null, null]);
    const noExp = project(flat({ categories: [] }), NO_SCENARIO, 12);
    assert.equal(noExp.totals.coverageShare, null);
  });
  it("PFSC-09: horizons are 12 months (default), 3, 5 and 10 years; points and totals follow the horizon", () => {
    assert.deepEqual([...HORIZONS], [12, 36, 60, 120]);
    assert.equal(DEFAULT_HORIZON, 12);
    assert.deepEqual(HORIZONS.map(horizonLabel), ["12 months", "3 years", "5 years", "10 years"]);
    for (const h of HORIZONS) {
      const p = project(flat(), NO_SCENARIO, h);
      assert.equal(p.points.length, h);
      assert.equal(p.totals.surplus, 2000 * h);
      assert.equal(p.totals.netEnd, 10000 + 2000 * h);
    }
    assert.equal(project(flat(), NO_SCENARIO, 120).points.at(-1)?.key, "2036-10");
  });
  it("PFSC-10: pure: projecting never changes the baseline or the levers", () => {
    const b = flat();
    const s = { ...NO_SCENARIO, income: { a: 10 } };
    const before = JSON.stringify([b, s]);
    project(b, s, 60);
    assert.equal(JSON.stringify([b, s]), before);
  });
});

describe("#215 levers and the stored scenario", () => {
  it("PFSC-11: a typed lever is a number in bounds, else null (shown in red, moves nothing)", () => {
    assert.equal(parseLever("10", -100, 1000), 10);
    assert.equal(parseLever("-12.5", -100, 1000), -12.5);
    assert.equal(parseLever("1,000", -100, 1000), 1000);
    for (const bad of ["", "-", "abc", "1e3", "-101", "1001", "10%"])
      assert.equal(parseLever(bad, -100, 1000), null, bad);
  });
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
