import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAmount, formatShare } from "./expenses.ts";
import {
  asIncome,
  biweekly,
  INCOME_KEY,
  incomeLines,
  monthly,
  netIncomeYearly,
  newPerson,
  NO_INCOME,
  parsePercent,
  type Person,
  PEOPLE_MAX,
  PERSON_COLUMNS,
  personLabel,
  personNet,
  readIncome,
  TABLE_COLUMNS,
  writeIncome,
} from "./income.ts";

class Memory {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const person = (over: Partial<Person> = {}): Person => ({
  id: "a",
  name: "",
  wages: "",
  bonus: "",
  tax: "",
  share: "100",
  countWages: true,
  countBonus: true,
  ...over,
});

// The spec's example (section 12.2): own bonus excluded, the spouse at 80%.
const me = person({
  id: "me",
  name: "Me",
  wages: "120,000",
  bonus: "10",
  tax: "30",
  countBonus: false,
});
const spouse = person({
  id: "sp",
  name: "Spouse",
  wages: "80,000",
  bonus: "5",
  tax: "25",
  share: "80",
});

describe("personal finance income (#85, PF-11..16)", () => {
  it("has the column labels in the spec's order", () => {
    assert.deepEqual(
      [...PERSON_COLUMNS],
      [
        "Name",
        "Wages (yearly)",
        "Bonus rating (%)",
        "Average tax (%)",
        "Net (yearly)",
        "Count wages",
        "Count bonus",
        "Share (%)",
      ],
    );
    assert.deepEqual([...TABLE_COLUMNS], ["Income", "Biweekly", "Monthly", "Yearly"]);
  });

  it("reads percents 0–100; empty is 0; anything else fails the check", () => {
    assert.equal(parsePercent("30"), 30);
    assert.equal(parsePercent(" 12.5 "), 12.5);
    assert.equal(parsePercent(""), 0);
    assert.equal(parsePercent("100"), 100);
    for (const bad of ["101", "-1", "30%", "abc"]) assert.equal(parsePercent(bad), null, bad);
  });

  it("net per person: (wages + wages × rating) × (1 − tax), whatever counts (PF-13)", () => {
    assert.equal(personNet(me), 92400);
    assert.equal(personNet(spouse), 63000);
    assert.equal(personNet(person({ wages: "50,000", bonus: "200" })), 150000);
    assert.equal(personNet(person({ wages: "x", bonus: "10" })), 0);
  });

  it("counted lines and the net income on the spec example (PF-14, PF-15)", () => {
    const lines = incomeLines([me, spouse]);
    assert.deepEqual(
      lines.map((l) => [
        l.label,
        formatAmount(l.yearly),
        formatAmount(monthly(l.yearly)),
        formatAmount(biweekly(l.yearly)),
      ]),
      [
        ["Me · Wages", "84,000", "7,000", "3,230.77"],
        ["Me · Bonus", "0", "0", "0"],
        ["Spouse · Wages", "48,000", "4,000", "1,846.15"],
        ["Spouse · Bonus", "2,400", "200", "92.31"],
      ],
    );
    const net = netIncomeYearly([me, spouse]);
    assert.deepEqual(
      [formatAmount(net), formatAmount(monthly(net)), formatAmount(biweekly(net))],
      ["134,400", "11,200", "5,169.23"],
    );
  });

  it("% of income on the spec example (PF-04)", () => {
    const m = monthly(netIncomeYearly([me, spouse]));
    assert.deepEqual(
      [1000, 250, 1250, 100, 1350].map((x) => formatShare(x, m)),
      ["8.9%", "2.2%", "11.2%", "0.9%", "12.1%"],
    );
    assert.equal(formatShare(100, monthly(netIncomeYearly([]))), "—");
  });

  it("a bad share or tax reads as 0; unnamed people are Person <n>", () => {
    assert.equal(netIncomeYearly([person({ wages: "1000", share: "150" })]), 0);
    assert.equal(netIncomeYearly([person({ wages: "1000", tax: "abc" })]), 1000);
    assert.equal(personLabel(person({ name: "  " }), 1), "Person 2");
    assert.equal(incomeLines([person()])[0].label, "Person 1 · Wages");
  });

  it("new people: empty fields, Share 100, both boxes ticked, unique ids", () => {
    const a = newPerson();
    const b = newPerson();
    assert.notEqual(a.id, b.id);
    assert.deepEqual({ ...a, id: "" }, person({ id: "" }));
  });

  it("stores under its own key and reads back as typed; malformed → no people (never throws)", () => {
    const storage = new Memory();
    writeIncome(storage, { people: [me, spouse] });
    assert.deepEqual([...storage.map.keys()], [INCOME_KEY]);
    assert.deepEqual(readIncome(storage), { people: [me, spouse] });
    for (const bad of ["{", "null", "[]", '{"people":"x"}']) {
      storage.setItem(INCOME_KEY, bad);
      assert.deepEqual(readIncome(storage), NO_INCOME, bad);
    }
    assert.deepEqual(readIncome(null), NO_INCOME);
    const value = asIncome({
      people: [
        me,
        me,
        { ...spouse, countWages: "yes" },
        ...Array.from({ length: PEOPLE_MAX + 3 }, (_, i) => person({ id: `x${i}` })),
      ],
    });
    assert.equal(value.people[0].id, "me");
    assert.equal(value.people.length, PEOPLE_MAX - 2);
  });
});
