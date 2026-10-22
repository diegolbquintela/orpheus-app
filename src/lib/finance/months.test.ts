import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_KEY, type Expenses } from "./expenses.ts";
import {
  chosenMonth,
  copyOfCurrent,
  openMonth,
  FIRST_MONTH,
  type MonthLines,
  MONTHS_KEY,
  readMonths,
  writeMonths,
  yearChoices,
  withCurrentCopy,
} from "./months.ts";
import { RecordStore } from "./record.ts";
import { RANGE_MONTHS_MAX } from "./report.ts";

// #163 (spec section 34, PFM-02..PFM-07, PFM-14): the Month + Year choices and the storage window.
const LINE = {
  id: "r",
  name: "Rent",
  amount: "1",
  per: "month" as const,
  equity: "",
  account: "",
  currency: "",
  rate: "",
  category: "",
};
const lines: MonthLines = { fixed: [LINE], variable: [], people: [] };

describe("#163 month choices", () => {
  // #229 (PFFM-02) supersedes Q-Y2's top year: the years run from the last open month's (current + 12) down to 2020.
  it("PFM-01 / Q-Y2 (as changed by #229): the years, the last open month's year down to 2020", () => {
    assert.deepEqual(yearChoices("2026-10"), [2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020]);
    assert.deepEqual(yearChoices("2020-01"), [2021, 2020]);
  });
  // #229 (PFFM-01/03) supersedes Q-Y1's future clamp: a future month up to current + 12 opens; past that, the last one.
  it("PFM-03 / Q-Y1 (as changed by #229): a choice opens that month (future ones up to current + 12); before 2020-01 the first month", () => {
    assert.equal(chosenMonth("2021", "03", "2026-10"), "2021-03");
    assert.equal(chosenMonth(2026, 10, "2026-10"), "2026-10");
    assert.equal(chosenMonth("2026", "11", "2026-10"), "2026-11");
    assert.equal(chosenMonth("2027", "01", "2026-10"), "2027-01");
    assert.equal(chosenMonth("2027", "10", "2026-10"), "2027-10");
    assert.equal(chosenMonth("2027", "11", "2026-10"), "2027-10");
    assert.equal(chosenMonth("2019", "12", "2026-10"), FIRST_MONTH);
    assert.equal(chosenMonth("2026", "13", "2026-10"), "2026-10");
    assert.equal(chosenMonth("", "", "2026-10"), "2026-10");
  });
});

describe("#163 storage keeps every month from 2020-01 (Q-Y5)", () => {
  const all: Record<string, typeof lines> = {};
  for (let y = 2019; y <= 2026; y++)
    for (let m = 1; m <= 12; m++) all[`${y}-${String(m).padStart(2, "0")}`] = lines;

  it("PFM-07: writeMonths / readMonths keep 2020-01 .. 2026-12 (84 months), drop 2019 and bad keys; no 24-month limit", () => {
    const store = new RecordStore({
      [STORAGE_KEY]: JSON.stringify({ fixed: [], variable: [], accounts: [], categories: [] }),
    });
    writeMonths(store, { ...all, "2026-13": lines, junk: lines });
    const stored = Object.keys(JSON.parse(store.getItem(MONTHS_KEY)!));
    assert.equal(stored.length, 84);
    assert.equal(stored[0], "2020-01");
    assert.equal(stored.at(-1), "2026-12");
    const back = Object.keys(readMonths(store)).sort();
    assert.equal(back.length, 84);
    assert.equal(back[0], "2020-01");
  });

  it("readMonths ignores a stored month before 2020-01 (never offered)", () => {
    const store = new RecordStore({
      [MONTHS_KEY]: JSON.stringify({ "2019-12": lines, "2020-01": lines }),
    });
    assert.deepEqual(Object.keys(readMonths(store)), ["2020-01"]);
  });

  it("PFM-14: the #153 report's custom range is still at most 24 months", () => {
    assert.equal(RANGE_MONTHS_MAX, 24);
  });
});

describe("#163 Q-Y6 rejected: an empty past month opens blank (PFM-15, PFM-16, PFM-18)", () => {
  const months = { "2026-08": lines, "2026-10": lines };
  it("PFM-15: an empty past month opens blank (no copy), even when the current month has lines", () => {
    assert.deepEqual(openMonth(months, "2021-03", "2026-10", true), {
      lines: { fixed: [], variable: [], people: [] },
      copiedFrom: null,
    });
  });
  it("PFM-18: an empty current month keeps decision 5 (a copy of the most recent month with lines)", () => {
    assert.deepEqual(openMonth({ "2026-08": lines }, "2026-10", "2026-10", true), {
      lines,
      copiedFrom: "2026-08",
    });
    assert.equal(openMonth({ "2026-08": lines }, "2026-10", "2026-10", false).copiedFrom, null);
  });
  it("PFM-16: Copy from current month = the current month's saved lines, or nothing when it has none", () => {
    assert.equal(copyOfCurrent(months, "2026-10"), lines);
    assert.equal(copyOfCurrent({ "2026-08": lines }, "2026-10"), null);
  });
});

describe("#166 W2 withCurrentCopy (spec 49.5)", () => {
  const line = (id: string, category = "") => ({ id, name: id, amount: "100", per: "month" as const, equity: "", account: "", currency: "", rate: "", category });
  const sep: MonthLines = { fixed: [line("rent", "Travel")], variable: [], people: [] };
  const shared = { fixed: [], variable: [], accounts: [], categories: ["Travel"] } as unknown as Expenses;
  it("an empty current month gets the latest month's lines; stored months are not changed", () => {
    const months = { "2026-09": sep };
    const out = withCurrentCopy(months, shared, "2026-10");
    assert.deepEqual(out["2026-10"], sep);
    assert.deepEqual(Object.keys(months), ["2026-09"], "input untouched");
  });
  it("a current month with stored lines, or no source, is returned as is", () => {
    const own: MonthLines = { fixed: [line("own")], variable: [], people: [] };
    const m1 = { "2026-09": sep, "2026-10": own };
    assert.equal(withCurrentCopy(m1, shared, "2026-10"), m1);
    const m2 = {};
    assert.equal(withCurrentCopy(m2, shared, "2026-10"), m2);
  });
  it("#165 Q-Z7: a name deleted on or before the current month is dropped from the copy", () => {
    const del = { ...shared, categories: [], deletedCategories: [{ name: "Travel", from: "2026-10" }] } as unknown as Expenses;
    const out = withCurrentCopy({ "2026-09": sep }, del, "2026-10");
    assert.equal(out["2026-10"].fixed[0].category, "");
    assert.equal(out["2026-10"].fixed[0].amount, "100");
  });
});
