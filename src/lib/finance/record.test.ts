import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invertRate, LEGACY_EXPENSES_KEY, STORAGE_KEY } from "./expenses.ts";
import {
  INCOME_KEY,
  incomeLines,
  netIncomeYearly,
  type Person,
  personConverted,
} from "./income.ts";
import {
  checkRecord,
  clearLegacy,
  prepareRecord,
  RECORD_MAX_BYTES,
  RecordStore,
} from "./record.ts";

class Local {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
const V1 = JSON.stringify({
  fixed: [
    {
      id: "c",
      name: "Condo",
      amount: "2,000",
      per: "month",
      equity: "",
      account: "",
      currency: "BRL",
      rate: "0.2",
    },
    {
      id: "d",
      name: "Bad",
      amount: "1",
      per: "month",
      equity: "",
      account: "",
      currency: "EUR",
      rate: "abc",
    },
  ],
  variable: [],
  accounts: [],
});

describe("#102 rate migration (Q27)", () => {
  it("inverts a valid rate once, keeps bad / empty as typed", () => {
    assert.equal(invertRate("0.2"), "5");
    assert.equal(invertRate("0.27"), "3.703704");
    assert.equal(invertRate("1,000"), "0.001");
    for (const t of ["", "abc", "0", "-1"]) assert.equal(invertRate(t), t);
  });
});

describe("#102 prepareRecord (Q28)", () => {
  it("an empty account imports this browser's old keys, migrating v1 → v2", () => {
    const local = new Local();
    local.setItem(LEGACY_EXPENSES_KEY, V1);
    local.setItem(INCOME_KEY, '{"people":[]}');
    local.setItem("unrelated", "x");
    const p = prepareRecord(null, local);
    assert.equal(p.imported, true);
    assert.equal(p.migrated, true);
    assert.deepEqual(Object.keys(p.record).sort(), [STORAGE_KEY, INCOME_KEY].sort());
    const rates = JSON.parse(p.record[STORAGE_KEY]).fixed.map((l: { rate: string }) => l.rate);
    assert.deepEqual(rates, ["5", "abc"]);
    clearLegacy(local);
    assert.deepEqual([...local.map.keys()], ["unrelated"]);
  });
  it("an account with a record ignores the browser", () => {
    const local = new Local();
    local.setItem(LEGACY_EXPENSES_KEY, V1);
    const p = prepareRecord({ [INCOME_KEY]: '{"people":[]}' }, local);
    assert.deepEqual(p, {
      record: { [INCOME_KEY]: '{"people":[]}' },
      imported: false,
      migrated: false,
    });
  });
  it("nothing anywhere: an empty record, nothing to save", () => {
    assert.deepEqual(prepareRecord(null, new Local()), {
      record: {},
      imported: false,
      migrated: false,
    });
    assert.deepEqual(prepareRecord(null, null), { record: {}, imported: false, migrated: false });
  });
});

describe("#102 checkRecord", () => {
  it("allows the five names with string values only", () => {
    assert.deepEqual(checkRecord({ [STORAGE_KEY]: "{}" }), {
      ok: true,
      record: { [STORAGE_KEY]: "{}" },
    });
    assert.equal(checkRecord({ [LEGACY_EXPENSES_KEY]: "{}" }).ok, false);
    assert.equal(checkRecord({ [STORAGE_KEY]: 5 }).ok, false);
    assert.equal(checkRecord([]).ok, false);
    assert.equal(checkRecord(null).ok, false);
    const big = checkRecord({ [STORAGE_KEY]: "x".repeat(RECORD_MAX_BYTES) });
    assert.deepEqual(big.ok ? null : big.status, 413);
  });
  it("RecordStore notifies on change only", () => {
    let n = 0;
    const s = new RecordStore({}, () => n++);
    s.setItem("a", "1");
    s.setItem("a", "1");
    s.removeItem("b");
    s.removeItem("a");
    assert.equal(n, 2);
  });
});

describe("#102 foreign income (PF-37)", () => {
  const p = (over: Partial<Person> = {}): Person => ({
    id: "b",
    name: "Brazilian Dividends",
    wages: "37,000",
    bonus: "",
    tax: "",
    share: "100",
    countWages: true,
    countBonus: true,
    foreign: true,
    currency: "BRL",
    rate: "3.70",
    ...over,
  });
  it("converts ÷ rate into the household currency", () => {
    assert.equal(personConverted(p()), 10000);
    assert.equal(incomeLines([p()])[0].yearly, 10000);
    assert.equal(netIncomeYearly([p()]), 10000);
  });
  it("no valid rate → null (—) everywhere it counts; unticked or household currency → × 1", () => {
    assert.equal(personConverted(p({ rate: "" })), null);
    assert.equal(netIncomeYearly([p({ rate: "0" })]), null);
    assert.equal(netIncomeYearly([p({ foreign: false })]), 37000);
    assert.equal(netIncomeYearly([p()], "BRL"), 37000);
    assert.equal(
      incomeLines([p({ rate: "x", countWages: false })])[0].yearly,
      0,
      "an uncounted line stays 0",
    );
  });
});
