import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { writeRates } from "./equity.ts";
import { type Line, writeExpenses } from "./expenses.ts";
import { type Person } from "./income.ts";
import { MONTHS_KEY, writeMonths } from "./months.ts";
import { NO_OVERVIEW, writeOverview } from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import { NO_VALUE, SHARED_VALUES_NOTE, storedMonths, storedYears, TOTAL_COLUMNS, yearTable } from "./history.ts";

// #214 (personal-finance-spec 53; PFHT-08..PFHT-14): the History table's year filter and grid, from a record.
// Runs under TZ=UTC and TZ=America/Los_Angeles (npm test both ways); the household month is Toronto's.
const NOW = new Date("2026-10-16T16:00:00Z");
const L = (id: string, amount: string): Line => ({ id, name: id, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "" });
const ann: Person = { id: "ann", name: "Ann", wages: "120000", bonus: "", tax: "25", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" };

function fixture(): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: [] });
  writeRates(s, { withdrawal: "4", roic: "10" });
  writeOverview(s, { ...NO_OVERVIEW, start: "100000", months: { "2024-06": { expenses: "2000", income: "5000" } } });
  writeMonths(s, {
    "2025-11": { fixed: [L("rent", "1000")], variable: [L("food", "300")], people: [ann] },
    "2025-12": { fixed: [L("rent", "1000")], variable: [], people: [ann] },
    "2026-02": { fixed: [L("rent", "1100")], variable: [L("gym", "50")], people: [] },
  });
  return s.data;
}
const col = (t: ReturnType<typeof yearTable>, id: string) => t.columns.findIndex((c) => c.id === id);
const cell = (t: ReturnType<typeof yearTable>, month: string, id: string) => t.rows.find((r) => r.month === month)!.cells[col(t, id)];

describe("#214 History table: year filter", () => {
  it("PFHT-08: stored months = months with lines or typed Overview totals, oldest first; empty months are not stored", () => {
    assert.deepEqual(storedMonths(fixture()), ["2024-06", "2025-11", "2025-12", "2026-02"]);
    assert.deepEqual(storedMonths(null), []);
    const s = new RecordStore({});
    writeMonths(s, { "2025-03": { fixed: [], variable: [], people: [] } });
    assert.deepEqual(storedMonths(s.data), []);
  });
  it("PFHT-09: the Year choices are the years with a stored month, newest first (no empty years)", () => {
    assert.deepEqual(storedYears(fixture()), [2026, 2025, 2024]);
    assert.deepEqual(storedYears({}), []);
  });
  it("PFHT-10: a year's grid holds only that year's stored months, oldest first", () => {
    const r = fixture();
    assert.deepEqual(yearTable(r, 2025, NOW).rows.map((x) => x.month), ["2025-11", "2025-12"]);
    assert.deepEqual(yearTable(r, 2026, NOW).rows.map((x) => x.month), ["2026-02"]);
    assert.deepEqual(yearTable(r, 2024, NOW).rows.map((x) => [x.month, x.label]), [["2024-06", "June 2024"]]);
    assert.deepEqual(yearTable(r, 2023, NOW), { year: 2023, currency: yearTable(r, 2023, NOW).currency, columns: [], rows: [] });
  });
});

describe("#214 History table: grid", () => {
  it("PFHT-11: columns = the year's income lines, its expense lines (by id, first seen), then the fixed totals", () => {
    const t = yearTable(fixture(), 2025, NOW);
    assert.deepEqual(t.columns.map((c) => [c.id, c.label]), [
      ["income:ann-wages", "Ann · Wages"],
      ["expense:rent", "rent"],
      ["expense:food", "food"],
      ...TOTAL_COLUMNS.map((c) => [c.id, c.label]),
    ]);
    assert.ok(t.rows.every((r) => r.cells.length === t.columns.length));
    assert.deepEqual(yearTable(fixture(), 2026, NOW).columns.slice(0, 2).map((c) => c.id), ["expense:rent", "expense:gym"]);
  });
  it("PFHT-12: line cells are the month's own monthly amounts; a line the month doesn't hold is —", () => {
    const t = yearTable(fixture(), 2025, NOW);
    assert.equal(cell(t, "2025-11", "income:ann-wages"), "7,500.00");
    assert.equal(cell(t, "2025-11", "expense:food"), "300.00");
    assert.equal(cell(t, "2025-12", "expense:food"), NO_VALUE);
  });
  it("PFHT-13: totals, surplus and net assets are the Charts series values (typed rates); net assets carry from the first data month", () => {
    const t = yearTable(fixture(), 2025, NOW);
    assert.deepEqual(["income", "fixed", "variable", "expenses", "surplus", "net-assets"].map((id) => cell(t, "2025-11", id)), ["7,500.00", "1,000.00", "300.00", "1,300.00", "6,200.00", "109,200.00"]);
    assert.deepEqual(["expenses", "surplus", "net-assets"].map((id) => cell(t, "2025-12", id)), ["1,000.00", "6,500.00", "115,700.00"]);
    // A typed-totals month: no lines, so no group totals; totals from the typed figures.
    const old = yearTable(fixture(), 2024, NOW);
    assert.deepEqual(["income", "fixed", "variable", "expenses", "surplus", "net-assets"].map((id) => cell(old, "2024-06", id)), ["5,000.00", NO_VALUE, NO_VALUE, "2,000.00", "3,000.00", "103,000.00"]);
  });
  it("PFHT-14: equity coverage per month = that month's net assets × Rate used ÷ 12, and ÷ that month's expenses; no rate → —", () => {
    const t = yearTable(fixture(), 2025, NOW);
    assert.equal(cell(t, "2025-11", "coverage"), "364.00");
    assert.equal(cell(t, "2025-11", "coverage-share"), "28.00%");
    const r = fixture();
    const s = new RecordStore(r);
    writeRates(s, { withdrawal: "", roic: "" });
    const none = yearTable(s.data, 2025, NOW);
    assert.equal(cell(none, "2025-11", "coverage"), NO_VALUE);
    assert.equal(cell(none, "2025-11", "coverage-share"), NO_VALUE);
  });
  it("PFHT-21 (CFO, Q-HT2): a month with zero expenses shows — for the coverage %, never a division by zero", () => {
    const s = new RecordStore(fixture());
    writeMonths(s, {
      "2025-11": { fixed: [L("rent", "0")], variable: [], people: [ann] },
      "2025-12": { fixed: [L("rent", "1000")], variable: [], people: [ann] },
    });
    writeOverview(s, { ...NO_OVERVIEW, start: "100000", months: { "2025-10": { expenses: "0", income: "5000" } } });
    const t = yearTable(s.data, 2025, NOW);
    for (const m of ["2025-10", "2025-11"]) {
      assert.equal(cell(t, m, "coverage-share"), NO_VALUE, m);
      assert.notEqual(cell(t, m, "coverage"), NO_VALUE, m); // the monthly amount still shows (rate and net assets set)
    }
    assert.match(cell(t, "2025-12", "coverage-share"), /^\d+\.\d{2}%$/);
    for (const r of t.rows) for (const c of r.cells) assert.doesNotMatch(c, /Infinity|NaN/);
  });
  it("PFHT-23 (CFO, Q-HT6): the shared-values note names Rate used, household currency and starting net assets as today's values", () => {
    assert.match(SHARED_VALUES_NOTE, /Rate used/);
    assert.match(SHARED_VALUES_NOTE, /household currency/);
    assert.match(SHARED_VALUES_NOTE, /starting net assets/);
    assert.match(SHARED_VALUES_NOTE, /today's values, not per-month values/);
  });
  it("PFHT-15: read-only: building the grid never changes the record", () => {
    const r = fixture();
    const before = JSON.stringify(r);
    yearTable(r, 2025, NOW);
    storedYears(r);
    assert.equal(JSON.stringify(r), before);
    assert.ok(MONTHS_KEY in r);
  });
});

describe("#263 History table: editable cells and record updates (PFHE-02..05)", () => {
  it("PFHE-02: isEditableCell identifies stored expense/income lines and legacy overview-only months vs derived and — cells", async () => {
    const { isEditableCell } = await import("./history.ts");
    const r = fixture();
    // 2025-11 has rent, food, ann-wages
    assert.equal(isEditableCell(r, "2025-11", "expense:rent"), true);
    assert.equal(isEditableCell(r, "2025-11", "expense:food"), true);
    assert.equal(isEditableCell(r, "2025-11", "income:ann-wages"), true);
    // 2025-12 has rent and ann-wages, but NOT food (food is — in 2025-12)
    assert.equal(isEditableCell(r, "2025-12", "expense:rent"), true);
    assert.equal(isEditableCell(r, "2025-12", "expense:food"), false);
    // Derived totals are read-only when month has lines
    for (const id of ["income", "fixed", "variable", "expenses", "surplus", "net-assets", "coverage", "coverage-share"]) {
      assert.equal(isEditableCell(r, "2025-11", id), false, id);
    }
    // 2024-06 is a legacy overview-only month (no lines in months["2024-06"]), so income and expenses are editable
    assert.equal(isEditableCell(r, "2024-06", "income"), true);
    assert.equal(isEditableCell(r, "2024-06", "expenses"), true);
    assert.equal(isEditableCell(r, "2024-06", "surplus"), false);
  });

  it("PFHE-03: applyHistoryEdit updates household and foreign expense lines, wages, bonus (preserving bonus when wages change), and legacy overview months", async () => {
    const { applyHistoryEdit } = await import("./history.ts");
    const { readExpenses } = await import("./expenses.ts");
    const { readIncome } = await import("./income.ts");
    const s = new RecordStore(fixture());
    const bob: Person = {
      id: "bob",
      name: "Bob",
      wages: "120000",
      bonus: "20",
      tax: "25",
      share: "100",
      countWages: true,
      countBonus: true,
      foreign: false,
      currency: "",
      rate: "",
    };
    const usdSub: Line = {
      id: "sub",
      name: "Cloud",
      amount: "140",
      per: "month",
      equity: "",
      account: "",
      currency: "USD",
      rate: "1.4",
      category: "",
    };
    writeMonths(s, {
      "2025-11": { fixed: [L("rent", "1000"), usdSub], variable: [L("food", "300")], people: [bob] },
      "2026-10": { fixed: [L("rent", "1000")], variable: [], people: [bob] },
    });

    // 1. Edit household expense line
    let next = applyHistoryEdit(s.data, "2025-11", "expense:rent", "1,250.50", NOW)!;
    assert.ok(next);
    let t = yearTable(next, 2025, NOW);
    assert.equal(cell(t, "2025-11", "expense:rent"), "1,250.50");
    assert.equal(cell(t, "2025-11", "fixed"), "1,350.50"); // 1250.50 + 100 (Cloud USD 140 / 1.4)

    // 2. Edit foreign expense line (1.4 rate -> 200 CAD monthly = 280 USD)
    next = applyHistoryEdit(next, "2025-11", "expense:sub", "200", NOW)!;
    t = yearTable(next, 2025, NOW);
    assert.equal(cell(t, "2025-11", "expense:sub"), "200.00");
    assert.equal(cell(t, "2025-11", "fixed"), "1,450.50");

    // 3. Edit Bob wages from 7,500.00 to 9,000.00 -> preserves Bob bonus at 1,500.00!
    t = yearTable(next, 2025, NOW);
    assert.equal(cell(t, "2025-11", "income:bob-wages"), "7,500.00");
    assert.equal(cell(t, "2025-11", "income:bob-bonus"), "1,500.00");
    next = applyHistoryEdit(next, "2025-11", "income:bob-wages", "9000", NOW)!;
    t = yearTable(next, 2025, NOW);
    assert.equal(cell(t, "2025-11", "income:bob-wages"), "9,000.00");
    assert.equal(cell(t, "2025-11", "income:bob-bonus"), "1,500.00");
    assert.equal(cell(t, "2025-11", "income"), "10,500.00");

    // 4. Edit Bob bonus from 1,500.00 to 1,800.00
    next = applyHistoryEdit(next, "2025-11", "income:bob-bonus", "1800", NOW)!;
    t = yearTable(next, 2025, NOW);
    assert.equal(cell(t, "2025-11", "income:bob-bonus"), "1,800.00");
    assert.equal(cell(t, "2025-11", "income"), "10,800.00");

    // 5. Editing current month (2026-10) syncs top-level expenses.v2 and income.v1
    next = applyHistoryEdit(next, "2026-10", "expense:rent", "1400", NOW)!;
    next = applyHistoryEdit(next, "2026-10", "income:bob-wages", "8250", NOW)!;
    const checkStore = new RecordStore(next);
    assert.equal(readExpenses(checkStore).fixed[0].amount, "1400");
    assert.equal(readIncome(checkStore).people[0].wages, "132000");

    // 6. Legacy overview-only month edit (2024-06)
    next = applyHistoryEdit(next, "2024-06", "expenses", "2450", NOW)!;
    const t2024 = yearTable(next, 2024, NOW);
    assert.equal(cell(t2024, "2024-06", "expenses"), "2,450.00");
    assert.equal(cell(t2024, "2024-06", "surplus"), "2,550.00");
  });
});
