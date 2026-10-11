import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asRates,
  EQUITY_KEY,
  formatRate,
  NO_RATES,
  rateUsed,
  readRates,
  writeRates,
} from "./equity.ts";
import {
  calculatedEquity,
  equityOf,
  type Expenses,
  formatAmount,
  grandTotals,
  hasOverride,
  type Line,
  STORAGE_KEY,
  totalsOf,
} from "./expenses.ts";
import { INCOME_KEY } from "./income.ts";

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
  ...over,
});

// Spec section 13.2 example: Rent 1,000 a month, Phone 250 a month, Gifts 1,200 a year.
const example: Expenses = {
  fixed: [line({ id: "r" }), line({ id: "p", name: "Phone", amount: "250" })],
  variable: [line({ id: "g", name: "Gifts", amount: "1,200", per: "year" })],
  accounts: [],
};
const rates = (withdrawal: string, roic: string) => ({ withdrawal, roic });

describe("personal finance equity cover (#86, option A, PF-17..20)", () => {
  it("rate used: the typed withdrawal rate as typed, else ROIC ÷ 2; withdrawal wins; none → null", () => {
    assert.equal(rateUsed(rates("", "8")), 4);
    assert.equal(rateUsed(rates("4", "")), 4, "a typed 4% is used as 4% (never halved)");
    assert.equal(rateUsed(rates("5", "8")), 5, "the withdrawal rate wins when both are typed");
    assert.equal(rateUsed(rates("3.5", "")), 3.5);
    assert.equal(rateUsed(rates("", "7.5")), 3.75);
    assert.equal(rateUsed(NO_RATES), null);
    assert.equal(rateUsed(rates("  ", "")), null);
    assert.equal(rateUsed(rates("0", "8")), null, "a typed 0 is no rate (it still wins)");
    assert.equal(rateUsed(rates("", "0")), null);
    assert.equal(rateUsed(rates("abc", "8")), null, "a bad withdrawal rate reads as 0");
    assert.equal(rateUsed(rates("120", "")), null, "out of range reads as 0");
    assert.equal(rateUsed(rates("", "-8")), null);
  });

  it("formats the rate used", () => {
    assert.equal(formatRate(4), "4%");
    assert.equal(formatRate(3.75), "3.75%");
    assert.equal(formatRate(null), "—");
  });

  it("calculated = yearly ÷ (rate ÷ 100): Rent 1,000/mo at ROIC 8% → 300,000", () => {
    const rate = rateUsed(rates("", "8"));
    assert.equal(calculatedEquity(example.fixed[0], rate), 300000);
    assert.equal(calculatedEquity(example.fixed[1], rate), 75000);
    assert.equal(calculatedEquity(example.variable[0], rate), 30000);
    const five = rateUsed(rates("5", "8"));
    assert.deepEqual(
      [...example.fixed, ...example.variable].map((l) => calculatedEquity(l, five)),
      [240000, 60000, 24000],
    );
    assert.equal(calculatedEquity(example.fixed[0], rateUsed(rates("4", ""))), 300000);
    assert.equal(formatAmount(calculatedEquity(example.fixed[0], 3.5) ?? 0), "342,857.14");
    assert.equal(calculatedEquity(example.fixed[0], null), null);
    assert.equal(calculatedEquity(example.fixed[0], 0), null);
    assert.equal(calculatedEquity(line({ amount: "abc" }), 4), 0, "a bad amount counts as 0");
  });

  it("override (Q3): a typed value wins on its line; blank uses the calculated amount; bad counts as 0", () => {
    assert.equal(hasOverride(line({ equity: "250,000" })), true);
    assert.equal(hasOverride(line({ equity: "0" })), true);
    assert.equal(hasOverride(line({ equity: "  " })), false);
    assert.equal(equityOf(line({ equity: "250,000" }), 4), 250000);
    assert.equal(equityOf(line({ equity: "0" }), 4), 0);
    assert.equal(equityOf(line({ equity: "  " }), 4), 300000);
    assert.equal(equityOf(line({ equity: "abc" }), 4), 0);
    assert.equal(equityOf(line(), null), 0, "no override and no rate adds 0");
  });

  it("totals sum each line's override or calculated amount (PF-19)", () => {
    const withOverride: Expenses = {
      ...example,
      fixed: [line({ id: "r", equity: "250,000" }), example.fixed[1]],
    };
    assert.deepEqual(totalsOf(withOverride.fixed, 4), {
      monthly: 1250,
      yearly: 15000,
      equity: 325000,
    });
    assert.deepEqual(totalsOf(withOverride.variable, 4), {
      monthly: 100,
      yearly: 1200,
      equity: 30000,
    });
    assert.equal(grandTotals(withOverride, 4).equity, 355000);
    assert.equal(grandTotals(withOverride, null).equity, 250000, "no rate: the overrides only");
    assert.equal(grandTotals(withOverride).equity, 250000, "v1.2 call sites: no rate");
  });

  it("stores the rates as typed in their own key; malformed reads as both empty", () => {
    const m = new Memory();
    writeRates(m, rates("4", "8.5"));
    assert.deepEqual([...m.map.keys()], [EQUITY_KEY]);
    assert.notEqual(EQUITY_KEY, STORAGE_KEY);
    assert.notEqual(EQUITY_KEY, INCOME_KEY);
    assert.equal(EQUITY_KEY, "orpheus.finance.equity.v1");
    assert.deepEqual(readRates(m), rates("4", "8.5"));
    assert.deepEqual(readRates(null), NO_RATES);
    m.setItem(EQUITY_KEY, "{not json");
    assert.deepEqual(readRates(m), NO_RATES);
    assert.deepEqual(asRates([1]), NO_RATES);
    assert.deepEqual(asRates({ withdrawal: 4, roic: "8" }), rates("", "8"));
    assert.deepEqual(asRates({ withdrawal: "x".repeat(41), roic: "8" }), rates("", "8"));
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    assert.deepEqual(readRates(throwing), NO_RATES);
    writeRates(throwing, rates("4", ""));
  });
});
