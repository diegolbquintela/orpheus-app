import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addCategory,
  asExpenses,
  CATEGORIES_MAX,
  CATEGORY_ERROR,
  categoryTotals,
  type Expenses,
  grandTotals,
  type Line,
  newLine,
} from "./expenses.ts";
import { incomeLines, netIncomeYearly, type Person, shownIncomeLines } from "./income.ts";
import { checkRecord, RECORD_NAMES } from "./record.ts";
import { asView, isOpen, readView, toggleSection, VIEW_KEY, writeView } from "./view.ts";

class Memory {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const line = (over: Partial<Line> = {}): Line => ({
  id: "a",
  name: "Rent",
  amount: "1,000",
  per: "month",
  equity: "",
  account: "",
  currency: "",
  rate: "",
  category: "",
  ...over,
});

describe("#105 section toggles (PF-40..41)", () => {
  it("every section open by default; toggling flips one, kept in page order; stored as the account's view value", () => {
    const m = new Memory();
    const v0 = readView(m);
    assert.deepEqual(v0, { closed: [] });
    assert.equal(isOpen(v0, "income"), true);
    const v1 = toggleSection(toggleSection(v0, "overview"), "income");
    assert.deepEqual(v1, { closed: ["income", "overview"] });
    assert.equal(isOpen(v1, "expenses"), true);
    assert.deepEqual(toggleSection(v1, "income"), { closed: ["overview"] });
    writeView(m, v1);
    assert.deepEqual([...m.map.keys()], [VIEW_KEY]);
    assert.deepEqual(readView(m), v1);
    assert.ok((RECORD_NAMES as readonly string[]).includes(VIEW_KEY));
    assert.equal(checkRecord({ [VIEW_KEY]: JSON.stringify(v1) }).ok, true);
  });

  it("malformed or odd values read as all open (never throws)", () => {
    const m = new Memory();
    m.setItem(VIEW_KEY, "{not json");
    assert.deepEqual(readView(m), { closed: [] });
    assert.deepEqual(readView(null), { closed: [] });
    assert.deepEqual(asView([]), { closed: [] });
    assert.deepEqual(asView({ closed: "income" }), { closed: [] });
    assert.deepEqual(asView({ closed: ["update", 3, "expenses", "expenses"] }), {
      closed: ["expenses"],
    });
  });
});

describe("#105 hide empty income lines (PF-42)", () => {
  const person = (over: Partial<Person> = {}): Person => ({
    id: "p",
    name: "Me",
    wages: "120,000",
    bonus: "10",
    tax: "30",
    countWages: true,
    countBonus: false,
    share: "100",
    foreign: false,
    currency: "",
    rate: "",
    ...over,
  });

  it("shows only counted, non-zero lines; Net income unchanged", () => {
    const people = [person(), person({ id: "s", name: "Spouse", bonus: "", countBonus: true })];
    assert.equal(incomeLines(people).length, 4);
    assert.deepEqual(
      shownIncomeLines(people).map((l) => [l.label, l.yearly]),
      [
        ["Me · Wages", 84000],
        ["Spouse · Wages", 84000],
      ],
    );
    assert.equal(netIncomeYearly(people), 168000);
    assert.deepEqual(shownIncomeLines([person({ wages: "", countWages: true })]), []);
  });

  it("a counted foreign line without a valid rate stays (`—`, not 0)", () => {
    const lines = shownIncomeLines([person({ foreign: true, currency: "BRL", rate: "" })]);
    assert.deepEqual(
      lines.map((l) => [l.label, l.yearly]),
      [["Me · Wages", null]],
    );
  });
});

describe("#105 expense categories (PF-44..46)", () => {
  it("adds a category like an account: trimmed, reused in any case, checked, capped", () => {
    assert.deepEqual(addCategory([], "  Home "), { categories: ["Home"], name: "Home" });
    assert.deepEqual(addCategory(["Home"], "home"), { categories: ["Home"], name: "Home" });
    assert.deepEqual(addCategory([], "   "), { error: CATEGORY_ERROR });
    assert.equal(CATEGORY_ERROR, "Name the category.");
    assert.equal((addCategory([], "x".repeat(60)) as { name: string }).name.length, 40);
    const full = Array.from({ length: CATEGORIES_MAX }, (_, i) => `c${i}`);
    assert.deepEqual(addCategory(full, "new"), { categories: full, name: "" });
  });

  it("a new line can start in a category (a line added while filtered)", () => {
    assert.equal(newLine().category, "");
    assert.equal(newLine("Home").category, "Home");
  });

  it("stores categories and each line's category; older values and unknown names read as none", () => {
    const read = asExpenses({
      fixed: [line({ category: "Home" }), line({ id: "b", category: "Ghost" })],
      variable: [],
      accounts: [],
      categories: ["Home", "home", "", 4],
    });
    assert.deepEqual(read.categories, ["Home"]);
    assert.deepEqual(
      read.fixed.map((l) => l.category),
      ["Home", ""],
    );
    const old = asExpenses({
      fixed: [{ ...line(), category: undefined }],
      variable: [],
      accounts: [],
    });
    assert.deepEqual(old.categories, []);
    assert.equal(old.fixed[0].category, "");
  });

  it("subtotals per used category then No category, household currency; they sum to the master total", () => {
    const e: Expenses = {
      fixed: [
        line({ id: "r", category: "Home" }),
        line({
          id: "c",
          name: "Condo",
          amount: "2,000",
          currency: "BRL",
          rate: "5",
          category: "Home",
        }),
      ],
      variable: [line({ id: "g", name: "Gifts", amount: "1,200", per: "year" })],
      accounts: [],
      categories: ["Travel", "Home"],
    };
    const rows = categoryTotals(e, 4, "CAD");
    assert.deepEqual(
      rows.map((r) => [r.name, r.totals.monthly, r.totals.yearly]),
      [
        ["Home", 1400, 16800],
        ["", 100, 1200],
      ],
    );
    const grand = grandTotals(e, 4, "CAD");
    assert.equal(
      rows.reduce((a, r) => a + (r.totals.monthly ?? 0), 0),
      grand.monthly,
    );
    assert.deepEqual(
      categoryTotals({ ...e, fixed: e.fixed.map((l) => ({ ...l, category: "" })) }),
      [],
    );
  });
});
