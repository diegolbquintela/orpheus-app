// Personal Finance foreign currency (#87 v1.4; spec attachments/personal-finance-spec.md section 14, PF-21..25).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asHousehold,
  CURRENCIES,
  CURRENCY_KEY,
  currencyChoices,
  DEFAULT_CURRENCY,
  readHousehold,
  writeHousehold,
} from "./currency.ts";
import {
  asExpenses,
  calculatedEquity,
  type Expenses,
  factorOf,
  fieldText,
  formatAmount,
  formatShare,
  grandTotals,
  householdMonthlyOf,
  isForeign,
  type Line,
  parseRate,
  readExpenses,
  STORAGE_KEY,
  totalsOf,
  writeExpenses,
} from "./expenses.ts";
import { EQUITY_KEY } from "./equity.ts";
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

// The section 14.2 example: household USD; Condo 2,000 a month in BRL at 5 (#102: 5 BRL per 1 CAD, ÷).
const example = (): Expenses => ({
  accounts: [],
  categories: [],
  fixed: [
    line({ id: "r" }),
    line({ id: "p", name: "Phone", amount: "250" }),
    line({ id: "c", name: "Condo", amount: "2,000", currency: "BRL", rate: "5" }),
  ],
  variable: [line({ id: "g", name: "Gifts", amount: "1,200", per: "year" })],
});

describe("household currency (#87, PF-21, PF-25)", () => {
  it("has the ten codes in order, default CAD (Q13), the household code first in a line's choices", () => {
    assert.deepEqual(
      [...CURRENCIES],
      ["USD", "CAD", "EUR", "GBP", "BRL", "MXN", "CHF", "JPY", "AUD", "CNY"],
    );
    assert.deepEqual(DEFAULT_CURRENCY, { household: "CAD" });
    assert.deepEqual(currencyChoices("BRL"), [
      "BRL",
      "USD",
      "CAD",
      "EUR",
      "GBP",
      "MXN",
      "CHF",
      "JPY",
      "AUD",
      "CNY",
    ]);
  });

  it("round-trips its own key; missing, malformed or unknown reads as CAD (never throws; Q13)", () => {
    const m = new Memory();
    assert.deepEqual(readHousehold(m), { household: "CAD" });
    writeHousehold(m, { household: "USD" });
    assert.equal(m.map.get(CURRENCY_KEY), '{"household":"USD"}');
    assert.deepEqual(readHousehold(m), { household: "USD" });
    for (const bad of ["{", "null", '"USD"', '{"household":"XYZ"}', '{"household":7}'])
      assert.deepEqual(
        readHousehold({ getItem: () => bad, setItem() {} }),
        { household: "CAD" },
        bad,
      );
    assert.deepEqual(asHousehold([]), { household: "CAD" });
    const throwing = {
      getItem(): string {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(readHousehold(throwing), { household: "CAD" });
    writeHousehold(throwing, { household: "EUR" });
    assert.ok(![STORAGE_KEY, INCOME_KEY, EQUITY_KEY].includes(CURRENCY_KEY));
  });
});

describe("foreign-currency line (#87, PF-22..25)", () => {
  it("reads a rate above 0 only (Q14)", () => {
    assert.equal(parseRate("0.2"), 0.2);
    assert.equal(parseRate("1,000.5"), 1000.5);
    for (const bad of ["", " ", "0", "0.0", "-1", "abc", "1e3"])
      assert.equal(parseRate(bad), null, bad);
  });

  it("household line factor 1; foreign line ÷ its rate (#102; Q12 superseded), null (—) without a valid rate (Q14)", () => {
    assert.equal(factorOf(line()), 1);
    assert.equal(factorOf(line({ currency: "CAD", rate: "abc" })), 1);
    assert.equal(isForeign(line({ currency: "CAD" })), false);
    assert.equal(isForeign(line({ currency: "USD" })), true, "CAD is the default household (Q13)");
    assert.equal(factorOf(line({ currency: "BRL", rate: "5" })), 0.2);
    for (const rate of ["", "0", "abc", "-1"]) {
      assert.equal(factorOf(line({ currency: "BRL", rate })), null, rate);
      assert.equal(householdMonthlyOf(line({ currency: "BRL", rate })), null, rate);
    }
    // The household currency becomes the line's: × 1, the rate ignored (kept stored).
    assert.equal(factorOf(line({ currency: "BRL", rate: "5" }), "BRL"), 1);
    assert.equal(householdMonthlyOf(line({ amount: "2,000", currency: "BRL", rate: "5" })), 400);
  });

  it("converts into the household currency for totals and percentages (the section 14.2 example)", () => {
    const e = example();
    const fixed = totalsOf(e.fixed);
    const grand = grandTotals(e);
    assert.deepEqual([fixed.monthly, fixed.yearly], [1650, 19800]);
    assert.deepEqual([grand.monthly, grand.yearly], [1750, 21000]);
    const condo = e.fixed[2];
    assert.equal(formatShare(householdMonthlyOf(condo), grand.monthly), "22.9%");
    assert.equal(formatShare(householdMonthlyOf(condo), 11200), "3.6%");
    assert.equal(formatShare(fixed.monthly, 11200), "14.7%");
    assert.equal(formatShare(grand.monthly, 11200), "15.6%");
  });

  it("equity cover uses the household yearly amount; an override is household, as typed (PF-23)", () => {
    const e = example();
    assert.equal(calculatedEquity(e.fixed[2], 4), 120000);
    assert.equal(formatAmount(totalsOf(e.fixed, 4).equity ?? -1), "495,000");
    assert.equal(grandTotals(e, 4).equity, 525000);
    e.fixed[2] = { ...e.fixed[2], equity: "100,000" };
    assert.equal(totalsOf(e.fixed, 4).equity, 475000);
  });

  it("a foreign line without a valid rate contributes — to every household figure and total (Q14, decided)", () => {
    const e = example();
    e.fixed[2] = { ...e.fixed[2], rate: "" };
    const fixed = totalsOf(e.fixed, 4);
    const variable = totalsOf(e.variable, 4);
    const grand = grandTotals(e, 4);
    assert.deepEqual(fixed, { monthly: null, yearly: null, equity: null });
    assert.deepEqual(variable, { monthly: 100, yearly: 1200, equity: 30000 });
    assert.deepEqual(grand, { monthly: null, yearly: null, equity: null });
    assert.equal(calculatedEquity(e.fixed[2], 4), null);
    assert.equal(formatShare(householdMonthlyOf(e.fixed[2]), 11200), "—");
    // Every share of a — total is —; a household line's % of income still shows.
    assert.equal(formatShare(householdMonthlyOf(e.fixed[0]), grand.monthly), "—");
    assert.equal(formatShare(householdMonthlyOf(e.fixed[0]), 11200), "8.9%");
    // A valid override is household and counts as typed (the Q10 pattern).
    e.fixed[2] = { ...e.fixed[2], equity: "100,000" };
    assert.equal(totalsOf(e.fixed, 4).equity, 475000);
    // Its own Monthly / Yearly still read the typed amount.
    assert.equal(fieldText(e.fixed[2], "year"), "24,000.00"); // #142: two decimals (PF-179)
  });

  it("v1.1–v1.3 lines restore as household lines; currency / rate round-trip; unknown code reads as household", () => {
    const old = { id: "o", name: "Rent", amount: "1,000", per: "month", equity: "", account: "" };
    const read = asExpenses({ fixed: [old], variable: [], accounts: [] });
    assert.deepEqual(read.fixed[0], {
      ...old,
      per: "month",
      currency: "",
      rate: "",
      category: "",
    });
    assert.deepEqual(totalsOf(read.fixed).monthly, 1000);
    const odd = asExpenses({
      fixed: [{ ...old, currency: "XYZ", rate: "5" }],
      variable: [],
      accounts: [],
      categories: [],
    });
    assert.equal(odd.fixed[0].currency, "");
    assert.equal(
      asExpenses({ fixed: [{ ...old, rate: 5 }], variable: [], accounts: [] }).fixed.length,
      0,
    );
    const m = new Memory();
    writeExpenses(m, example());
    assert.deepEqual(readExpenses(m), example());
    // Idempotent: reading and writing again changes nothing.
    writeExpenses(m, readExpenses(m));
    assert.deepEqual(readExpenses(m), example());
  });
});
