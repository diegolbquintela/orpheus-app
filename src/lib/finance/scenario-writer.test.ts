// #208 (spec 61.4-61.6, HTL-06 / -07 / -08): one writer for scenario.v1 (SS7), the Read copy note (AR1) and the saved
// start in cents (AS1).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { copiedNote } from "./months.ts";
import { addSaved, type SavedEntry } from "./saved-scenarios.ts";

const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const code = walk("src")
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ f: f.split("\\").join("/"), s: readFileSync(f, "utf8") }));
const uses = (re: RegExp) => code.filter(({ s }) => re.test(s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n"))).map(({ f }) => f);

describe("HTL-07 (#208 SS7): only the #223 save / delete path writes orpheus.finance.scenario.v1", () => {
  it("the PJ7 saveScenario is gone; changeSaved is the client's only writer", () => {
    const c = readFileSync("src/lib/finance/scenario-client.ts", "utf8");
    assert.match(c, /export const changeSaved = async/);
    assert.deepEqual(uses(/\bsaveScenario\b/), [], "no src file refers to it");
  });
  it("only scenario-key.ts names the key; only scenario.ts builds a value for it; only changeSaved calls withScenario", () => {
    assert.deepEqual(uses(/orpheus\.finance\.scenario\.v1/), ["src/lib/finance/scenario-key.ts"]);
    assert.deepEqual(uses(/\[SCENARIO_KEY\]\s*:/), ["src/lib/finance/scenario.ts"]);
    assert.deepEqual(uses(/\bwithScenario\(/), ["src/lib/finance/scenario-client.ts"]);
    const c = readFileSync("src/lib/finance/scenario-client.ts", "utf8");
    assert.equal(c.match(/\bwithScenario\(/g)?.length, 1, "one call");
    assert.ok(c.indexOf("withScenario(") > c.indexOf("export const changeSaved"), "inside changeSaved");
    assert.equal(c.match(/method: "PUT"/g)?.length, 1, "one PUT in the client");
  });
});

describe("HTL-06 (#208 AR1): the copy note", () => {
  it("Read users get wording without 'edit and save'; write users keep it", () => {
    assert.equal(copiedNote("August 2026"), "Copied from August 2026 — edit and save.");
    assert.equal(copiedNote("August 2026", true), "Showing August 2026's lines — nothing is saved for this month.");
    assert.ok(!/edit|save\b/.test(copiedNote("X", true).replace("saved", "")));
  });
});

describe("HTL-08 (#208 AS1): addSaved stores inputs.start in cents", () => {
  const entry = (start: number): SavedEntry => ({
    id: "a1", name: "A", savedAt: "2026-10-22T00:00:00.000Z", basis: "2026-10",
    inputs: { start, income: 1, expenses: 1, growth: 0, rate: null }, values: {}, lines: "{}",
  });
  for (const [given, stored] of [[12345.678, 12345.68], [0.005, 0.01], [-10.004, -10], [100, 100], [1 / 3, 0.33]] as const)
    it(`${given} → ${stored}`, () => {
      const r = addSaved(null, entry(given));
      assert.ok(!("error" in r));
      assert.equal(r.saved?.[0].inputs.start, stored);
      assert.equal(r.saved?.[0].inputs.income, 1, "the other inputs as given");
    });
});
