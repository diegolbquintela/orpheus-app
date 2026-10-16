import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STORAGE_KEY } from "./expenses.ts";
import {
  chosenMonth,
  FIRST_MONTH,
  type MonthLines,
  MONTHS_KEY,
  readMonths,
  writeMonths,
  yearChoices,
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
  it("PFM-01 / Q-Y2: the years, the current year down to 2020", () => {
    assert.deepEqual(yearChoices("2026-10"), [2026, 2025, 2024, 2023, 2022, 2021, 2020]);
    assert.deepEqual(yearChoices("2020-01"), [2020]);
  });
  it("PFM-03 / Q-Y1: a choice opens that month; a future one the current month; before 2020-01 the first month", () => {
    assert.equal(chosenMonth("2021", "03", "2026-10"), "2021-03");
    assert.equal(chosenMonth(2026, 10, "2026-10"), "2026-10");
    assert.equal(chosenMonth("2026", "11", "2026-10"), "2026-10");
    assert.equal(chosenMonth("2027", "01", "2026-10"), "2026-10");
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
