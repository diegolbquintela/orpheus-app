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
  currency: "",
  rate: "",
  category: "",
  ...over,
});

// Spec section 13.2 example: Rent 1,000 a month, Phone 250 a month, Gifts 1,200 a year.
const example: Expenses = {
  fixed: [line({ id: "r" }), line({ id: "p", name: "Phone", amount: "250" })],
  variable: [line({ id: "g", name: "Gifts", amount: "1,200", per: "year" })],
  accounts: [],
  categories: [],
};
const rates = (withdrawal: string, roic: string) => ({ withdrawal, roic });

describe("personal finance equity cover (#86, option A, PF-17..20)", () => {
  it("rate used: the typed withdrawal rate as typed, else ROIC ÷ 2; withdrawal wins; none → null", () => {
    assert.equal(rateUsed(rates("", "8")), 4);
    assert.equal(rateUsed(rates("4", "")), 4, "a typed 4% is used as 4% (never halved)");
    assert.equal(rateUsed(rates("5", "8")), 4, "#138 PF-150: the lower of 5 and 8 ÷ 2 (was: withdrawal wins)");
    assert.equal(rateUsed(rates("3.5", "")), 3.5);
    assert.equal(rateUsed(rates("", "7.5")), 3.75);
    assert.equal(rateUsed(NO_RATES), null);
    assert.equal(rateUsed(rates("  ", "")), null);
    assert.equal(rateUsed(rates("0", "8")), 4, "#138 PF-152 (Q-R2): a typed 0 is not set, so ROIC ÷ 2");
    assert.equal(rateUsed(rates("", "0")), null);
    assert.equal(rateUsed(rates("abc", "8")), null, "a bad withdrawal rate reads as 0");
    assert.equal(rateUsed(rates("120", "")), null, "a withdrawal rate above 100 is invalid");
    assert.equal(rateUsed(rates("", "-8")), null, "a negative ROIC is invalid");
    assert.equal(rateUsed(rates("", "abc")), null);
    assert.equal(rateUsed(rates("", "150")), 75, "Q11: ROIC may exceed 100");
    assert.equal(rateUsed(rates("", "250")), 125);
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
    const five = rateUsed(rates("5", ""));
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

  it("override (Q3): a valid typed value wins; blank or bad (Q9) uses the calculated amount; no rate → null (Q10)", () => {
    assert.equal(hasOverride(line({ equity: "250,000" })), true);
    assert.equal(hasOverride(line({ equity: "0" })), true);
    assert.equal(hasOverride(line({ equity: "  " })), false);
    assert.equal(hasOverride(line({ equity: "abc" })), false, "a bad override is not an override");
    assert.equal(hasOverride(line({ equity: "-3" })), false);
    assert.equal(equityOf(line({ equity: "250,000" }), 4), 250000);
    assert.equal(equityOf(line({ equity: "0" }), 4), 0);
    assert.equal(equityOf(line({ equity: "  " }), 4), 300000);
    assert.equal(equityOf(line({ equity: "abc" }), 4), 300000, "Q9: a bad override falls back");
    assert.equal(equityOf(line({ equity: "-3" }), 4), 300000);
    assert.equal(equityOf(line(), null), null, "Q10: no override and no rate → —");
    assert.equal(equityOf(line({ equity: "abc" }), null), null);
    assert.equal(equityOf(line({ equity: "250,000" }), null), 250000);
  });

  it("totals sum each line's override or calculated amount; — when any line is — (PF-19, Q10)", () => {
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
    assert.equal(
      totalsOf(withOverride.fixed, null).equity,
      null,
      "no rate: Phone is —, so the total is —",
    );
    assert.equal(grandTotals(withOverride, null).equity, null);
    assert.equal(grandTotals(withOverride).equity, null);
    assert.equal(
      totalsOf([line({ equity: "250,000" })], null).equity,
      250000,
      "all overridden: the sum",
    );
    assert.equal(totalsOf([], null).equity, 0, "no lines: 0");
    const bad: Expenses = {
      ...example,
      fixed: [line({ id: "r", equity: "abc" }), example.fixed[1]],
    };
    assert.equal(totalsOf(bad.fixed, 4).equity, 375000, "Q9: Rent abc falls back to 300,000");
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

describe("#131 Withdrawal rate description (PF-108, PF-112)", () => {
  it("PF-108: the two lines; line 2 matches rateUsed (Q-W1)", async () => {
    const { WITHDRAWAL_DESC_LINES } = await import("./equity.ts");
    assert.deepEqual(
      [...WITHDRAWAL_DESC_LINES],
      [
        "Withdrawal rate used to calculate how much equity can cover expenses.",
        "Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.",
      ],
    );
  });
  it("PF-112 (superseded by #138 PF-150): 5 + ROIC 8 → 4 (the lower), else ROIC ÷ 2 (8 → 4)", () => {
    assert.equal(rateUsed({ withdrawal: "5", roic: "8" }), 4);
    assert.equal(rateUsed({ withdrawal: "", roic: "8" }), 4);
    assert.equal(rateUsed({ withdrawal: "3", roic: "8" }), 3);
  });
});

describe("#138 Rate used = the lower of the Withdrawal Rate and half of Portfolio ROIC (PF-150..PF-153)", () => {
  const r = (withdrawal: string, roic: string) => ({ withdrawal, roic });
  it("PF-150: both set → the lower; source names it; equal → equal", async () => {
    const { rateSource } = await import("./equity.ts");
    assert.deepEqual([rateUsed(r("5", "8")), rateSource(r("5", "8"))], [4, "roic"]);
    assert.deepEqual([rateUsed(r("3", "8")), rateSource(r("3", "8"))], [3, "withdrawal"]);
    assert.deepEqual([rateUsed(r("4", "8")), rateSource(r("4", "8"))], [4, "equal"]);
    assert.deepEqual([rateUsed(r("3.5", "7.5")), rateSource(r("3.5", "7.5"))], [3.5, "withdrawal"]);
  });
  it("PF-151: one set → it; neither → null", async () => {
    const { rateSource } = await import("./equity.ts");
    assert.deepEqual([rateUsed(r("5", "")), rateSource(r("5", ""))], [5, "withdrawal"]);
    assert.deepEqual([rateUsed(r("", "8")), rateSource(r("", "8"))], [4, "roic"]);
    assert.deepEqual([rateUsed(r("", "")), rateSource(r("", ""))], [null, null]);
  });
  it("PF-152 (Q-R2): a typed 0 is not set", async () => {
    const { rateSource } = await import("./equity.ts");
    assert.deepEqual([rateUsed(r("0", "8")), rateSource(r("0", "8"))], [4, "roic"]);
    assert.deepEqual([rateUsed(r("5", "0")), rateSource(r("5", "0"))], [5, "withdrawal"]);
    assert.deepEqual([rateUsed(r("0", "0")), rateSource(r("0", "0"))], [null, null]);
  });
  it("PF-153 (Q-R3): any rate field in error → null, even with the other valid", async () => {
    const { rateSource } = await import("./equity.ts");
    for (const [w, o] of [["5", "-8"], ["101", "8"], ["abc", ""], ["", "abc"], ["4", "x"]])
      assert.deepEqual([rateUsed(r(w, o)), rateSource(r(w, o))], [null, null], `${w} / ${o}`);
  });
});
