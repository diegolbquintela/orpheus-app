// #223 (personal-finance-spec 60, AC PFSS): pure parts of named saved scenarios.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MONTHS_KEY } from "./months.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { OVERVIEW_KEY } from "./overview.ts";
import { asScenario, NO_SCENARIO, SAVED_MAX, type SavedEntry, SCENARIO_KEY } from "./scenario-key.ts";
import { scenarioText, withScenario } from "./scenario.ts";
import {
  addSaved,
  keptValues,
  LIST_FULL,
  NAME_BLANK,
  NAME_LONG,
  NAME_TAKEN,
  nameError,
  removeSaved,
  reopenRecord,
} from "./saved-scenarios.ts";

const e = (id: string, name: string): SavedEntry => ({
  id, name, savedAt: "2026-10-22T12:00:00Z", basis: "2026-10",
  inputs: { start: 1, income: 2, expenses: 3, growth: 4, rate: null },
  values: { [STORAGE_KEY]: "{}" }, lines: '{"fixed":[],"variable":[],"people":[]}',
});

describe("#223 saved scenarios (pure)", () => {
  it("PFSS-10/11/12: names: trimmed, 1..60, unique ignoring case; at most 20", () => {
    assert.equal(nameError("  ", []), NAME_BLANK);
    assert.equal(nameError("x".repeat(61), []), NAME_LONG);
    assert.equal(nameError("x".repeat(60), []), null);
    assert.equal(nameError(" base ", [e("a", "Base")]), NAME_TAKEN);
    const full = Array.from({ length: SAVED_MAX }, (_, i) => e(`i${i}`, `N${i}`));
    assert.equal(nameError("New", full), LIST_FULL);
  });
  it("PFSS-13: add keeps the levers and the order; remove drops one id only", () => {
    const lev = { ...NO_SCENARIO, income: { a: 5 }, rate: 4 };
    const one = addSaved(lev, e("a", " A "));
    assert.ok(!("error" in one));
    assert.deepEqual(one.income, { a: 5 });
    assert.equal(one.rate, 4);
    assert.deepEqual(one.saved!.map((x) => x.name), ["A"]);
    const two = addSaved(one, e("b", "B"));
    assert.ok(!("error" in two));
    assert.deepEqual(removeSaved(two, "a").saved!.map((x) => x.id), ["b"]);
    assert.deepEqual(removeSaved(two, "a").income, { a: 5 });
    assert.deepEqual(addSaved(one, e("c", "a")), { error: NAME_TAKEN });
  });
  it("PFSS-14: the stored value round-trips through asScenario; a levers-only value is byte-for-byte as before (PJ7)", () => {
    const s = addSaved(null, e("a", "A"));
    assert.ok(!("error" in s));
    assert.deepEqual(asScenario(JSON.parse(scenarioText(s))), s);
    assert.equal(scenarioText(NO_SCENARIO), '{"income":{},"expenses":{},"rate":null,"growth":null,"start":null}');
  });
  it("PFSS-40: withScenario changes the scenario value only", () => {
    const rec = { [STORAGE_KEY]: "x", [MONTHS_KEY]: "y", [OVERVIEW_KEY]: "z" };
    const s = addSaved(null, e("a", "A"));
    assert.ok(!("error" in s));
    const out = withScenario(rec, s);
    assert.deepEqual(Object.keys(out).sort(), [...Object.keys(rec), SCENARIO_KEY].sort());
    for (const k of Object.keys(rec)) assert.equal(out[k], rec[k as keyof typeof rec]);
  });
  it("PFSS-21/22: reopen: saved page values over the latest record, the saved lines on the CURRENT month, other months kept", () => {
    const latest = { [STORAGE_KEY]: "latest", [OVERVIEW_KEY]: "ov", [MONTHS_KEY]: JSON.stringify({ "2026-09": { a: 1 }, "2026-10": { b: 2 } }) };
    const entry = { ...e("a", "A"), basis: "2026-08", values: { [STORAGE_KEY]: "saved", other: "ignored" } };
    const r = reopenRecord(latest, entry, "2026-10");
    assert.equal(r[STORAGE_KEY], "saved");
    assert.equal(r[OVERVIEW_KEY], "ov");
    assert.equal(r.other, undefined, "only page value names");
    const m = JSON.parse(r[MONTHS_KEY]);
    assert.deepEqual(m["2026-09"], { a: 1 });
    assert.deepEqual(m["2026-10"], { fixed: [], variable: [], people: [] });
    assert.deepEqual(keptValues({ [SCENARIO_KEY]: "s", [MONTHS_KEY]: "m" }), {});
  });
});
