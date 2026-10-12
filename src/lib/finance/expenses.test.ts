import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNT_ERROR,
  ACCOUNTS_MAX,
  addAccount,
  asExpenses,
  COLUMNS,
  EMPTY,
  fieldText,
  formatAmount,
  formatShare,
  grandTotals,
  type Line,
  LINES_MAX,
  newLine,
  parseAmount,
  readExpenses,
  STORAGE_KEY,
  totalsOf,
  writeExpenses,
} from "./expenses.ts";

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

describe("personal finance expenses (#84, PF-03..07)", () => {
  it("has the ten columns in order (#87 adds Currency and FX rate after Yearly; #105 Category last)", () => {
    assert.deepEqual(
      [...COLUMNS],
      [
        "Name",
        "% of income",
        "% of expenses",
        "Monthly",
        "Yearly",
        "Currency",
        "FX rate",
        "Equity to cover",
        "Account",
        "Category",
      ],
    );
  });

  it("reads amounts with commas; empty is 0; bad or negative fails the check", () => {
    assert.equal(parseAmount("1,000"), 1000);
    assert.equal(parseAmount(" 1 200.50 "), 1200.5);
    assert.equal(parseAmount(""), 0);
    assert.equal(parseAmount(".5"), 0.5);
    for (const bad of ["-1", "abc", "1e3", "1.2.3", ".", "$5"])
      assert.equal(parseAmount(bad), null, bad);
  });

  it("converts monthly and yearly; the typed side stays as typed", () => {
    const m = line({ amount: "1,000", per: "month" });
    assert.equal(fieldText(m, "month"), "1,000");
    assert.equal(fieldText(m, "year"), "12,000");
    const y = line({ amount: "1000", per: "year" });
    assert.equal(fieldText(y, "year"), "1000");
    assert.equal(fieldText(y, "month"), "83.33");
    assert.equal(fieldText(line({ amount: "x" }), "year"), "");
    assert.equal(fieldText(line({ amount: "" }), "year"), "");
  });

  it("formats with commas, up to two decimals, and shares with one decimal or —", () => {
    assert.equal(formatAmount(1350), "1,350");
    assert.equal(formatAmount(16200), "16,200");
    assert.equal(formatAmount(83.3333), "83.33");
    assert.equal(formatAmount(0), "0");
    assert.equal(formatShare(1, 8), "12.5%");
    assert.equal(formatShare(5, 5), "100.0%");
    assert.equal(formatShare(0, 0), "—");
  });

  it("totals the spec example (PF-05) and counts a bad amount as 0", () => {
    const expenses = {
      fixed: [
        line({ id: "a", amount: "1,000", equity: "10,000" }),
        line({ id: "b", amount: "250", equity: "5" }),
      ],
      variable: [
        line({ id: "c", amount: "1,200", per: "year" as const, equity: "0" }),
        line({ id: "d", amount: "oops", equity: "0" }),
      ],
      accounts: [],
      categories: [],
    };
    assert.deepEqual(totalsOf(expenses.fixed), { monthly: 1250, yearly: 15000, equity: 10005 });
    assert.deepEqual(totalsOf(expenses.variable), { monthly: 100, yearly: 1200, equity: 0 });
    assert.deepEqual(grandTotals(expenses), { monthly: 1350, yearly: 16200, equity: 10005 });
    assert.equal(formatShare(1250, 1350), "92.6%");
    assert.equal(formatShare(100, 1350), "7.4%");
  });

  it("adds accounts: trims, refuses empty, reuses any case, caps the list", () => {
    assert.deepEqual(addAccount([], "  "), { error: ACCOUNT_ERROR });
    assert.deepEqual(addAccount([], " Chequing "), { accounts: ["Chequing"], name: "Chequing" });
    assert.deepEqual(addAccount(["Chequing"], "chequing"), {
      accounts: ["Chequing"],
      name: "Chequing",
    });
    assert.equal((addAccount([], "x".repeat(60)) as { name: string }).name.length, 40);
    const full = Array.from({ length: ACCOUNTS_MAX }, (_, i) => `A${i}`);
    assert.deepEqual(addAccount(full, "New"), { accounts: full, name: "" });
  });

  it("stores under one key and reads back as typed", () => {
    const storage = new Memory();
    const saved = {
      fixed: [line({ account: "Visa" })],
      variable: [line({ id: "b", amount: "1,200", per: "year" as const })],
      accounts: ["Visa"],
      categories: [],
    };
    writeExpenses(storage, saved);
    assert.deepEqual([...storage.map.keys()], [STORAGE_KEY]);
    assert.deepEqual(readExpenses(storage), saved);
  });

  it("reads missing, malformed or odd values as the empty page (never throws)", () => {
    assert.deepEqual(readExpenses(null), EMPTY);
    const storage = new Memory();
    assert.deepEqual(readExpenses(storage), EMPTY);
    for (const bad of ["{", "null", "42", '"x"', "[]", '{"fixed":"no"}']) {
      storage.setItem(STORAGE_KEY, bad);
      assert.deepEqual(readExpenses(storage), EMPTY, bad);
    }
    const throwing = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(readExpenses(throwing), EMPTY);
    writeExpenses(throwing, EMPTY);
  });

  it("drops bad lines, duplicate ids, unknown accounts, duplicate accounts; caps lines", () => {
    const value = asExpenses({
      accounts: ["Visa", "visa", "", 7, "Cash"],
      fixed: [
        line(),
        line(),
        { ...line({ id: "z" }), per: "week" },
        line({ id: "y", account: "Nope" }),
      ],
      variable: Array.from({ length: LINES_MAX + 5 }, (_, i) => line({ id: `v${i}` })),
    });
    assert.deepEqual(value.accounts, ["Visa", "Cash"]);
    assert.deepEqual(
      value.fixed.map((l) => [l.id, l.account]),
      [
        ["a", ""],
        ["y", ""],
      ],
    );
    assert.equal(value.variable.length, LINES_MAX);
  });

  it("makes new empty monthly lines with unique ids", () => {
    const a = newLine();
    const b = newLine();
    assert.notEqual(a.id, b.id);
    assert.deepEqual(
      { ...a, id: "" },
      {
        id: "",
        name: "",
        amount: "",
        per: "month",
        equity: "",
        account: "",
        currency: "",
        rate: "",
        category: "",
      },
    );
  });
});
