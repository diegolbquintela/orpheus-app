import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badComma, parseScenarioAmount } from "./scenario-input.ts";
import { parseAmount } from "./expenses.ts";
import { growthOk, parseGrowth, parseNetAssets, xTickIndexes } from "./scenario.ts";

describe("#221 QA AO2-AO4 (spec 57.15)", () => {
  it("PFPJ-71 (AO3): a decimal comma is refused on the scenario screen; thousands commas pass; the main parser is unchanged", () => {
    for (const t of ["10,5", "1.234,56", "1,00", "12,3456", ",5"]) {
      assert.equal(badComma(t), true, t);
      assert.equal(parseScenarioAmount(t), null, t);
      assert.equal(parseNetAssets(t), null, t);
    }
    assert.equal(parseScenarioAmount("12,345.67"), 12345.67);
    assert.equal(parseScenarioAmount("1,000"), 1000);
    assert.equal(parseScenarioAmount("1,234,567"), 1234567);
    assert.equal(parseScenarioAmount(""), 0);
    assert.equal(parseScenarioAmount("-5"), null, "unsigned by default");
    // The main page's parseAmount is unchanged (drops every comma).
    assert.equal(parseAmount("10,5"), 105);
    assert.equal(parseAmount("1.234,56"), 1.23456);
  });
  it("PFPJ-72 (AO4): scenario growth is signed, -50..+50; the main parser still refuses -50", () => {
    assert.equal(parseGrowth("-50"), -50);
    assert.equal(parseGrowth("\u221250"), -50);
    assert.equal(parseGrowth("+50"), 50);
    assert.equal(parseGrowth("-12.5"), -12.5);
    assert.equal(parseGrowth("10,5"), null);
    assert.equal(parseGrowth("-"), null);
    assert.ok(growthOk(-50) && growthOk(50) && !growthOk(-50.01) && !growthOk(51));
    assert.equal(parseAmount("-50"), null);
  });
  it("PFPJ-73 (AO2): x ticks always start at Now (index 0), at most 5, for every horizon", () => {
    for (const n of [13, 37, 61, 121]) {
      const t = xTickIndexes(n);
      assert.equal(t[0], 0, `n=${n}`);
      assert.ok(t.length <= 5 && t.length >= 3, `n=${n}: ${t}`);
      assert.ok(t.every((i) => i < n));
    }
    assert.deepEqual(xTickIndexes(13), [0, 3, 6, 9, 12]);
    assert.deepEqual(xTickIndexes(121), [0, 30, 60, 90, 120]);
  });
});
