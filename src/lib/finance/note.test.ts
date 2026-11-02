// #277 (personal-finance-spec §82, AC PFNT): an optional free-text note on each Fixed / Variable expense line, kept
// inside the existing JSON values (no table, column, migration or new key).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { chartData } from "./chart.ts";
import { buildPdf, buildPng, dataJson } from "./export.ts";
import { GOLDEN_CASES, GOLDEN_NOW, GOLDEN_RECORD } from "./export-golden/capture.ts";
import { asExpenses, asNote, grandTotals, type Line, newLine, NOTE_MAX, noteBad, linesJson, readExpenses, STORAGE_KEY, writeExpenses } from "./expenses.ts";
import { recordFieldError, recordRefusal } from "./field-errors.ts";
import { applyHistoryEdit } from "./history.ts";
import { asLines, copyOfCurrent, MONTHS_KEY, openMonth, withCurrentCopy, readMonths, savedOverviewFigures, writeMonths } from "./months.ts";
import { PLANS_KEY } from "./plans-key.ts";
import { mergePlansText, syncFuturePlans } from "./plans.ts";
import { readPlans } from "./plans-read.ts";
import { RecordStore } from "./record.ts";

const L = (id: string, amount: string, note?: unknown): Record<string, unknown> => ({
  id, name: id, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "", ...(note === undefined ? {} : { note }),
});
const person = { id: "p1", name: "Me", wages: "60,000", bonus: "", tax: "0", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" };
const shared = (fixed: unknown[], variable: unknown[] = []) => JSON.stringify({ fixed, variable, accounts: [], categories: [] });
const long = "x".repeat(NOTE_MAX);

describe("#277 PFNT-01/02 the note is read with the line (asLine)", () => {
  it("PFNT-01: Line carries note; a new line and an older line (no note) read as ''", () => {
    assert.equal(newLine().note, "");
    assert.equal(asExpenses({ fixed: [L("a", "1")], variable: [], accounts: [] }).fixed[0].note, "");
  });
  it("PFNT-02: a string is kept trimmed up to 500; over 500 (after trim), a number, null, an object read as ''", () => {
    const read = (note: unknown) => asExpenses({ fixed: [L("a", "1", note)], variable: [], accounts: [] }).fixed[0];
    assert.equal(read("  Paid on the 3rd  ").note, "Paid on the 3rd");
    assert.equal(read(long).note, long);
    assert.equal(read(` ${long} `).note, long);
    assert.equal(read(`${long}y`).note, "");
    for (const bad of [5, null, true, { a: 1 }, ["x"]]) assert.equal(read(bad).note, "", String(bad));
    // the line itself is kept (a bad note never drops a line), and everything else reads unchanged
    const kept = read(7);
    assert.deepEqual({ ...kept, note: undefined }, { ...read(undefined), note: undefined });
    assert.equal(asNote("ok"), "ok");
    assert.equal(NOTE_MAX, 500);
  });
  it("PFNT-02: the note never changes a figure (totals with and without notes are equal)", () => {
    const a = asExpenses({ fixed: [L("a", "1,000")], variable: [L("b", "250")], accounts: [] });
    const b = asExpenses({ fixed: [L("a", "1,000", "rent")], variable: [L("b", "250", "food")], accounts: [] });
    assert.deepEqual(grandTotals(b, 4, "CAD"), grandTotals(a, 4, "CAD"));
  });
});

describe("#277 PFNT-06 the note is kept through save / reload, month copy, plan capture and history edits", () => {
  it("save then reload (expenses and months values)", () => {
    const s = new RecordStore({});
    const line = { ...newLine(), name: "Rent", amount: "1000", note: "Lease ends June" } as Line;
    writeExpenses(s, { fixed: [line], variable: [], accounts: [], categories: [] });
    writeMonths(s, { "2026-10": { fixed: [line], variable: [], people: [] } });
    const again = new RecordStore(JSON.parse(JSON.stringify(s.data)));
    assert.equal(readExpenses(again).fixed[0].note, "Lease ends June");
    assert.equal(readMonths(again)["2026-10"].fixed[0].note, "Lease ends June");
  });
  it("an empty month opens as the copy of the latest saved month, notes included", () => {
    const sh = asExpenses({ fixed: [], variable: [], accounts: [] });
    const sept = asLines({ fixed: [L("rent", "1000", "keep")], variable: [L("food", "200", "weekly")], people: [] }, sh);
    const opened = openMonth({ "2026-09": sept }, "2026-10", "2026-10", true);
    assert.equal(opened.copiedFrom, "2026-09");
    assert.equal(opened.lines.fixed[0].note, "keep");
    assert.equal(opened.lines.variable[0].note, "weekly");
    // the current month's unsaved copy (deleted names dropped, #165) keeps the notes too
    const withDel = asExpenses({ fixed: [], variable: [], accounts: [], categories: [], deletedCategories: [{ name: "Gone", from: "2026-10" }] });
    const copy = withCurrentCopy({ "2026-09": sept }, withDel, "2026-10")["2026-10"];
    assert.equal(copy.fixed[0].note, "keep");
    assert.equal(copyOfCurrent({ "2026-10": sept }, "2026-10")!.fixed[0].note, "keep");
  });
  it("plan capture keeps the note; an edited note is a plan change (new capturedAt)", () => {
    const s = new RecordStore({});
    const sh = asExpenses({ fixed: [], variable: [], accounts: [] });
    const nov = (note: string) => asLines({ fixed: [L("rent", "1000", note)], variable: [], people: [person] }, sh);
    const at = new Date("2026-10-15T12:00:00Z");
    assert.equal(syncFuturePlans(s, { "2026-11": nov("a") }, "2026-10", at), true);
    assert.equal(readPlans(s)["2026-11"].lines.fixed[0].note, "a");
    assert.equal(syncFuturePlans(s, { "2026-11": nov("a") }, "2026-10", new Date("2026-10-16T00:00:00Z")), false);
    const later = new Date("2026-10-20T00:00:00Z");
    assert.equal(syncFuturePlans(s, { "2026-11": nov("b") }, "2026-10", later), true);
    assert.equal(readPlans(s)["2026-11"].lines.fixed[0].note, "b");
    assert.equal(readPlans(s)["2026-11"].capturedAt, later.toISOString());
    // the server merge keeps a FUTURE month's new note, ignores one sent for the current month
    const stored = s.getItem(PLANS_KEY)!;
    const edited = JSON.stringify({ "2026-11": { ...JSON.parse(stored)["2026-11"], lines: { fixed: [L("rent", "1000", "c")], variable: [], people: [] } } });
    assert.equal(JSON.parse(mergePlansText(stored, edited, "2026-10")!)["2026-11"].lines.fixed[0].note, "c");
    assert.equal(JSON.parse(mergePlansText(stored, edited, "2026-11")!)["2026-11"].lines.fixed[0].note, "b");
  });
  it("a history (Year table) edit keeps the line's note", () => {
    const record = {
      [STORAGE_KEY]: shared([L("rent", "1000", "keep me")]),
      [MONTHS_KEY]: JSON.stringify({ "2026-09": { fixed: [L("rent", "1000", "keep me")], variable: [], people: [] } }),
    };
    const out = applyHistoryEdit(record, "2026-09", "expense:rent", "1200", new Date("2026-10-15T12:00:00Z"));
    assert.ok(out);
    const m = readMonths(new RecordStore(out!))["2026-09"].fixed[0];
    assert.equal(m.amount, "1200");
    assert.equal(m.note, "keep me");
  });
});

describe("#277 PFNT-01 a line without a note is stored as before #277", () => {
  it("linesJson leaves out an empty note and keeps a note with text", () => {
    const before = { fixed: [L("a", "1")], variable: [] };
    const read = asExpenses(before);
    assert.equal(read.fixed[0]!.note, "");
    assert.ok(!linesJson(read).includes("note"));
    read.fixed[0]!.note = "x";
    assert.ok(linesJson(read).includes('"note":"x"'));
  });
  it("writeExpenses stores no empty note", () => {
    const store = new RecordStore({});
    writeExpenses(store, asExpenses({ fixed: [L("a", "1")], variable: [] }));
    assert.ok(!store.getItem(STORAGE_KEY)!.includes("note"));
  });
});

describe("#277 PFNT-03 the PUT refuses a non-string or over-long note (Invalid value, #143)", () => {
  const C = "2026-10";
  it("expenses, months and written future plans; the field names the line", () => {
    assert.equal(recordFieldError({ [STORAGE_KEY]: shared([L("a", "1", "fine")]) }, C), null);
    assert.equal(recordFieldError({ [STORAGE_KEY]: shared([L("a", "1", long)]) }, C), null);
    assert.equal(recordFieldError({ [STORAGE_KEY]: shared([L("a", "1", ` ${long} `)]) }, C), null);
    assert.equal(recordFieldError({ [STORAGE_KEY]: shared([L("a", "1", `${long}y`)]) }, C), "expenses.fixed.0.note");
    assert.equal(recordFieldError({ [STORAGE_KEY]: shared([L("a", "1")], [L("b", "1"), L("c", "1", 5)]) }, C), "expenses.variable.1.note");
    assert.deepEqual(recordRefusal({ [STORAGE_KEY]: shared([L("a", "1", null)]) }, C), { field: "expenses.fixed.0.note", error: "Invalid value." });
    const months = (note: unknown) => ({ [MONTHS_KEY]: JSON.stringify({ "2026-09": { fixed: [L("a", "1", note)], variable: [], people: [] } }) });
    assert.equal(recordFieldError(months("ok"), C), null);
    assert.equal(recordFieldError(months({}), C), "months.2026-09.fixed.0.note");
    const plans = (note: unknown, key = "2026-11") => ({ [PLANS_KEY]: JSON.stringify({ [key]: { lines: { fixed: [L("a", "1", note)], variable: [], people: [] }, capturedAt: "" } }) });
    assert.equal(recordFieldError(plans("ok"), C, "{}"), null);
    assert.equal(recordFieldError(plans(`${long}y`), C, "{}"), "plans.2026-11.fixed.0.note");
    // a current / past plan is ignored by the merge, so never blocks; an unchanged stored plan never blocks (legacy)
    assert.equal(recordFieldError(plans(`${long}y`, "2026-10"), C, "{}"), null);
    const p = plans(`${long}y`);
    assert.equal(recordFieldError(p, C, p[PLANS_KEY]), null);
  });
  it("an amount error still comes first, unchanged", () => {
    assert.equal(recordFieldError({ [STORAGE_KEY]: shared([L("a", "x", 5)]) }, C), "expenses.fixed.0.amount");
  });
  it("noteBad: absent ok; string ≤ 500 after trim ok; anything else bad", () => {
    assert.equal(noteBad(undefined), false);
    assert.equal(noteBad(""), false);
    assert.equal(noteBad(long), false);
    assert.equal(noteBad(`${long}y`), true);
    assert.equal(noteBad(null), true);
    assert.equal(noteBad(1), true);
  });
});

describe("#277 PFNT-07 exports are unchanged (no Note in the PDF / PNG / data JSON)", () => {
  const withNotes = (): Record<string, string> => {
    const r: Record<string, string> = { ...(GOLDEN_RECORD as Record<string, string>) };
    const add = (v: { fixed: Record<string, unknown>[]; variable: Record<string, unknown>[] }) => {
      for (const l of [...v.fixed, ...v.variable]) l.note = "NOTE-MARKER-277 private text";
    };
    const e = JSON.parse(r[STORAGE_KEY]);
    add(e);
    r[STORAGE_KEY] = JSON.stringify(e);
    const m = JSON.parse(r[MONTHS_KEY]);
    for (const k of Object.keys(m)) add(m[k]);
    r[MONTHS_KEY] = JSON.stringify(m);
    return r;
  };
  for (const [name, q] of Object.entries(GOLDEN_CASES))
    it(name, () => {
      const meta = { name: "Default", generatedAt: GOLDEN_NOW.toISOString(), range: q.range };
      const a = chartData(q as never, GOLDEN_RECORD as never, GOLDEN_NOW, "saved");
      const b = chartData(q as never, withNotes() as never, GOLDEN_NOW, "saved");
      assert.equal(dataJson(b), dataJson(a));
      assert.ok(!dataJson(b).includes("NOTE-MARKER-277"));
      const sha = (x: Buffer) => createHash("sha256").update(x).digest("hex");
      assert.equal(sha(buildPdf(b, meta)), sha(buildPdf(a, meta)));
      assert.equal(sha(buildPng(b, meta)), sha(buildPng(a, meta)));
    });
  it("Overview figures are unchanged by notes", () => {
    const at = "2026-10";
    assert.deepEqual(savedOverviewFigures(new RecordStore(withNotes()), at), savedOverviewFigures(new RecordStore({ ...(GOLDEN_RECORD as Record<string, string>) }), at));
  });
});
