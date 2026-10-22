import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shownText, storedText } from "./period.ts";

describe("#221 Monthly / Yearly conversion (spec 57.13)", () => {
  it("PFPJ-65: shown text converts and rounds to cents for display only; blank / invalid as is", () => {
    assert.equal(shownText("500", "month", "year"), "6,000.00");
    assert.equal(shownText("120,000", "year", "month"), "10,000.00");
    assert.equal(shownText("1000", "year", "month"), "83.33");
    assert.equal(shownText("12000", "year", "year"), "12,000.00");
    assert.equal(shownText("", "month", "year"), "");
    assert.equal(shownText("12a", "month", "year"), "12a");
  });
  it("PFPJ-66: typed text stores the exact converted amount (unrounded); blank / invalid pass through", () => {
    assert.equal(storedText("6,000", "month", "year"), "500");
    assert.equal(Number(storedText("1,000", "month", "year")), 1000 / 12);
    assert.equal(storedText("500", "year", "month"), "6000");
    assert.equal(storedText("", "month", "year"), "");
    assert.equal(storedText("1e3", "month", "year"), "1e3");
  });
});
