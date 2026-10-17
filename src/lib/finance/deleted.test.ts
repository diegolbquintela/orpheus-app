import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asExpenses,
  categoryTotals,
  deleteName,
  deletedLabel,
  NAME_DELETED,
  relinkName,
  renameCategory,
  STORAGE_KEY,
  type Expenses,
  type Line,
} from "./expenses.ts";
import { deleteInMonths, MONTHS_KEY, readMonths, withoutDeletedFor, type Months } from "./months.ts";
import { RecordStore } from "./record.ts";
import { deletedSeries, missingSeries, seriesLabels, type Report } from "./report.ts";

// #165 (spec section 35, CFO option A KEEP; PFD-01..PFD-14). Pure functions; the page → API → PGlite path is pinned
// in expenses-page.dom.test.tsx ("#165 PFD-01..PFD-07 (real path ...)").
const L = (id: string, amount: string, category = "", account = ""): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
const shared = (over: Partial<Expenses> = {}): Expenses => ({ fixed: [], variable: [], accounts: ["Amex"], categories: ["Home", "Travel"], ...over });

describe("#165 deleted categories / accounts (option A KEEP)", () => {
  it("PFD-02 (the #165 bug, fails on main 6315cfa): a stored record whose Travel was deleted from June keeps Travel on March's lines when read back", () => {
    const store = new RecordStore({
      [STORAGE_KEY]: JSON.stringify({ fixed: [], variable: [], accounts: [], categories: ["Home"], deletedCategories: [{ name: "Travel", from: "2026-06" }], deletedAccounts: [{ name: "Amex", from: "2026-06" }] }),
      [MONTHS_KEY]: JSON.stringify({ "2026-03": { fixed: [L("t", "200", "Travel", "Amex")], variable: [], people: [] } }),
    });
    const march = readMonths(store)["2026-03"];
    assert.equal(march.fixed[0].category, "Travel");
    assert.equal(march.fixed[0].account, "Amex");
    const e = asExpenses(JSON.parse(store.getItem(STORAGE_KEY)!));
    assert.deepEqual(categoryTotals({ ...e, fixed: march.fixed }).map((r) => r.name), ["Travel"], "PFD-04: March groups under Travel");
  });

  it("PFD-01 / PFD-03: deleteName leaves the live list, records `from`, strips the shown lines; amounts kept", () => {
    const e = deleteName(shared({ fixed: [L("a", "5", "Travel", "Amex")] }), "category", "Travel", "2026-06");
    assert.deepEqual(e.categories, ["Home"]);
    assert.deepEqual(e.deletedCategories, [{ name: "Travel", from: "2026-06" }]);
    assert.deepEqual([e.fixed[0].category, e.fixed[0].account, e.fixed[0].amount], ["", "Amex", "5"]);
    assert.equal(deleteName(e, "category", "Travel", "2026-07"), e, "not live: no change");
  });

  it("PFD-02: deleteInMonths changes `from` and later months; an earlier month is the same object (never rewritten)", () => {
    const months: Months = {
      "2026-03": { fixed: [L("a", "1", "Travel")], variable: [], people: [] },
      "2026-06": { fixed: [L("b", "2", "Travel")], variable: [], people: [] },
      "2026-09": { fixed: [L("c", "3", "Travel")], variable: [], people: [] },
    };
    const out = deleteInMonths(months, [{ kind: "category", name: "Travel", from: "2026-06" }]);
    assert.equal(out["2026-03"], months["2026-03"]);
    assert.deepEqual([out["2026-06"].fixed[0].category, out["2026-09"].fixed[0].category], ["", ""]);
    assert.deepEqual([out["2026-06"].fixed[0].amount, out["2026-09"].fixed[0].amount], ["2", "3"], "PFD-07 amounts kept");
  });

  it("PFD-08 (Q-Z7): a copy into a month at or after the delete drops the name; into an earlier month keeps it", () => {
    const e = deleteName(shared(), "category", "Travel", "2026-06");
    const lines = { fixed: [L("a", "1", "Travel")], variable: [], people: [] };
    assert.equal(withoutDeletedFor(lines, e, "2026-07").fixed[0].category, "");
    assert.equal(withoutDeletedFor(lines, e, "2026-05").fixed[0].category, "Travel");
  });

  it("PFD-09 (Q-Z4): re-adding a deleted name (any case) re-links it with the deleted spelling", () => {
    const e = deleteName(shared(), "category", "Travel", "2026-06");
    const r = relinkName({ ...e, categories: [...e.categories, "travel"] }, "category", "travel");
    assert.equal(r.name, "Travel");
    assert.deepEqual(r.expenses.categories, ["Home", "Travel"]);
    assert.equal(r.expenses.deletedCategories, undefined);
    const plain = relinkName(shared(), "category", "Food");
    assert.equal(plain.name, "Food");
  });

  it("PFD-10 (Q-Z6): renaming to a deleted name is refused", () => {
    const e = deleteName(shared(), "category", "Travel", "2026-06");
    assert.deepEqual(renameCategory(e, "Home", "TRAVEL"), { error: NAME_DELETED });
  });

  it("PFD-11: stored deleted entries are checked (bad month, duplicate, also live → dropped)", () => {
    const e = asExpenses({ fixed: [], variable: [], accounts: [], categories: ["Home"], deletedCategories: [{ name: "Travel", from: "2026-6" }, { name: "Home", from: "2026-06" }, { name: "Gym", from: "2026-06" }, { name: "gym", from: "2026-07" }] });
    assert.deepEqual(e.deletedCategories, [{ name: "Gym", from: "2026-06" }]);
    assert.equal(asExpenses({ fixed: [], variable: [], accounts: [], categories: [] }).deletedCategories, undefined);
  });

  it("PFD-05 / PFD-06: report series on a deleted name with history are `deleted` (labelled), not missing; with no history left they are missing", () => {
    const report: Report = { series: [{ kind: "category", id: "Travel" }, { kind: "account", id: "Amex" }, { kind: "category", id: "Home" }], range: { preset: "12m" }, chart: "line" };
    const rec = (march: Line[]) => ({
      [STORAGE_KEY]: JSON.stringify({ fixed: [], variable: [], accounts: [], categories: ["Home"], deletedCategories: [{ name: "Travel", from: "2026-06" }], deletedAccounts: [{ name: "Amex", from: "2026-06" }] }),
      [MONTHS_KEY]: JSON.stringify({ "2026-03": { fixed: march, variable: [], people: [] } }),
    });
    const kept = rec([L("t", "200", "Travel", "Amex")]);
    assert.deepEqual([missingSeries(report, kept), deletedSeries(report, kept), seriesLabels(report, kept)], [[], [0, 1], [deletedLabel("Travel"), deletedLabel("Amex"), "Home"]]);
    const gone = rec([L("t", "200")]);
    assert.deepEqual([missingSeries(report, gone), deletedSeries(report, gone)], [[0, 1], []]);
  });
});
