// #229 (personal-finance-spec 59, AC PFFM): future months on the main PF page (pure parts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordStore } from "./record.ts";
import {
  chosenMonth,
  copySourceFor,
  FUTURE_MONTHS,
  isFuture,
  lastOpenMonth,
  MONTHS_KEY,
  type MonthLines,
  openMonth,
  resetQuestion,
  resetSource,
  savedOverviewFigures,
  yearChoices,
} from "./months.ts";
import { storedMonths, storedYears } from "./history.ts";
import { rangeMonths } from "./series.ts";

const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "" });
const lines = (amount: string): MonthLines => ({ fixed: [line("rent", amount)] as never, variable: [], people: [] });
const NOW = "2026-10";

describe("#229 future months", () => {
  it("PFFM-01/02/03: up to current + 12 can be chosen; the Year select reaches that year; past it gives the last", () => {
    assert.equal(FUTURE_MONTHS, 12);
    assert.equal(lastOpenMonth(NOW), "2027-10");
    assert.equal(lastOpenMonth("2026-12"), "2027-12");
    assert.equal(lastOpenMonth("2026-01"), "2027-01");
    assert.equal(chosenMonth("2026", "11", NOW), "2026-11");
    assert.equal(chosenMonth("2028", "01", NOW), "2027-10");
    assert.equal(yearChoices(NOW)[0], 2027);
    assert.ok(isFuture("2026-11", NOW) && !isFuture(NOW, NOW) && !isFuture("2026-09", NOW));
  });

  it("PFFM-10: an EMPTY future month opens as a copy of the latest saved month before it", () => {
    const months = { "2026-08": lines("100"), "2026-09": lines("200") };
    const o = openMonth(months, "2026-12", NOW, true);
    assert.equal(o.copiedFrom, "2026-09");
    assert.equal(o.lines, months["2026-09"]);
    // A saved future month before it is the latest saved previous month.
    const withNov = { ...months, "2026-11": lines("300") };
    assert.equal(openMonth(withNov, "2026-12", NOW, true).copiedFrom, "2026-11");
    // Saved current month wins over older ones.
    assert.equal(openMonth({ ...months, [NOW]: lines("250") }, "2026-11", NOW, true).copiedFrom, NOW);
  });

  it("PFFM-11: with nothing saved before it, an empty future month opens blank", () => {
    const o = openMonth({ "2027-02": lines("1") }, "2026-11", NOW, true);
    assert.equal(o.copiedFrom, null);
    assert.equal(o.lines.fixed.length, 0);
  });

  it("PFFM-12: a SAVED future month opens with its own lines and never re-copies", () => {
    const months = { "2026-09": lines("200"), "2026-11": lines("999") };
    const o = openMonth(months, "2026-11", NOW, true);
    assert.equal(o.copiedFrom, null);
    assert.equal(o.lines, months["2026-11"]);
  });

  it("PFFM-13 (#199): the current month's unsaved copy never comes from a saved future month", () => {
    const months = { "2026-09": lines("200"), "2026-11": lines("999") };
    assert.equal(openMonth(months, NOW, NOW, true).copiedFrom, "2026-09");
    assert.equal(copySourceFor(months, NOW), "2026-09");
    const store = new RecordStore({ [MONTHS_KEY]: JSON.stringify(months) });
    const f = savedOverviewFigures(store, NOW);
    assert.equal(f[NOW].expenses, 200);
  });

  it("PFFM-14: an empty past month still opens blank (#163 unchanged)", () => {
    assert.equal(openMonth({ "2026-09": lines("200") }, "2026-05", NOW, true).copiedFrom, null);
  });

  it("PFFM-20/21: Reset is offered for a SAVED future month only, from the latest saved month before it", () => {
    const months = { "2026-09": lines("200"), "2026-11": lines("999"), "2026-12": lines("5") };
    assert.equal(resetSource(months, "2026-11", NOW), "2026-09");
    assert.equal(resetSource(months, "2026-12", NOW), "2026-11");
    assert.equal(resetSource(months, "2027-01", NOW), null, "empty future month: no Reset");
    assert.equal(resetSource(months, "2026-09", NOW), null, "past month: no Reset");
    assert.equal(resetSource({ ...months, [NOW]: lines("1") }, NOW, NOW), null, "current month: no Reset");
    assert.equal(resetSource({ "2026-11": lines("9") }, "2026-11", NOW), null, "nothing saved before: no Reset");
    assert.match(resetQuestion("September 2026"), /^Reset this month to September 2026's values\?/);
  });

  it("PFFM-40/41: History and the `all` range stop at the current month", () => {
    const record = { [MONTHS_KEY]: JSON.stringify({ "2026-09": lines("200"), "2027-02": lines("1") }) };
    assert.deepEqual(storedMonths(record, NOW), ["2026-09"]);
    assert.deepEqual(storedYears(record, NOW), [2026]);
    assert.deepEqual(storedMonths(record), ["2026-09", "2027-02"], "without through: unchanged");
    const r = rangeMonths({ preset: "all" } as never, NOW, record);
    assert.equal(r[r.length - 1], NOW);
    const onlyFuture = { [MONTHS_KEY]: JSON.stringify({ "2027-02": lines("1") }) };
    assert.deepEqual(rangeMonths({ preset: "all" } as never, NOW, onlyFuture), [NOW]);
  });
});
