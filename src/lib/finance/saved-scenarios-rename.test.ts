// #233 (spec 66, AC PFSR): pure rename / update helpers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NAME_BLANK, NAME_LONG, NAME_TAKEN, renameError, renameSaved, SCENARIO_GONE, updateSaved, type SavedEntry } from "./saved-scenarios.ts";
import { NO_SCENARIO, type Scenario } from "./scenario-key.ts";

const e = (id: string, name: string): SavedEntry => ({
  id, name, savedAt: "2026-10-01T00:00:00Z", basis: "2026-10",
  inputs: { start: 1, income: 2, expenses: 3, growth: 0, rate: 4 }, values: { a: "1" }, lines: "{}",
});
const s: Scenario = { ...NO_SCENARIO, rate: 7, saved: [e("a", "Alpha"), e("b", "Beta")] };

describe("#233 renameSaved / updateSaved", () => {
  it("PFSR-03: name rules exclude the scenario itself", () => {
    assert.equal(renameError(" ", s.saved!, "a"), NAME_BLANK);
    assert.equal(renameError("x".repeat(61), s.saved!, "a"), NAME_LONG);
    assert.equal(renameError("beta", s.saved!, "a"), NAME_TAKEN);
    assert.equal(renameError("ALPHA", s.saved!, "a"), null);
  });
  it("PFSR-04/07: rename changes only that name; levers and other entries kept", () => {
    const r = renameSaved(s, "a", "  Gamma ") as Scenario;
    assert.deepEqual(r.saved, [{ ...e("a", "Alpha"), name: "Gamma" }, e("b", "Beta")]);
    assert.equal(r.rate, 7);
    assert.deepEqual(renameSaved(s, "a", "Beta"), { error: NAME_TAKEN });
  });
  it("PFSR-06/07: update keeps id and name, replaces values, others kept", () => {
    const r = updateSaved(s, "b", { savedAt: "2026-10-22T00:00:00Z", basis: "2026-11", inputs: { start: 5.555, income: 9, expenses: 8, growth: 1, rate: null }, values: {}, lines: "[]" }) as Scenario;
    assert.deepEqual(r.saved![0], e("a", "Alpha"));
    assert.deepEqual(r.saved![1], { id: "b", name: "Beta", savedAt: "2026-10-22T00:00:00Z", basis: "2026-11", inputs: { start: 5.56, income: 9, expenses: 8, growth: 1, rate: null }, values: {}, lines: "[]" });
  });
  it("PFSR-08: a missing id is refused", () => {
    assert.deepEqual(renameSaved(s, "zz", "X"), { error: SCENARIO_GONE });
    assert.deepEqual(updateSaved(null, "zz", e("q", "Q")), { error: SCENARIO_GONE });
  });
});
