import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "./money.ts";
import { fieldText } from "./expenses.ts";

describe("#142 formatMoney: one PF money format (PF-175..PF-178, PF-181)", () => {
  it("PF-175 / Q-W1: always exactly two decimals with comma thousands separators", () => {
    assert.equal(formatMoney(4296.3), "4,296.30", "the QA #133 figure");
    assert.equal(formatMoney(4266.666666), "4,266.67");
    assert.equal(formatMoney(1200), "1,200.00");
    assert.equal(formatMoney(83.333), "83.33");
    assert.equal(formatMoney(0), "0.00");
    assert.equal(formatMoney(1234567.891), "1,234,567.89");
    assert.equal(formatMoney(0.5), "0.50");
  });
  it("PF-176 / Q-W2: no currency symbol", () => {
    assert.match(formatMoney(500), /^[\d,]+\.\d\d$/);
  });
  it("PF-177 / Q-W3: negatives with a leading minus; never -0.00", () => {
    assert.equal(formatMoney(-1234.5), "-1,234.50");
    assert.equal(formatMoney(-0), "0.00");
    assert.equal(formatMoney(-0.004), "0.00");
    assert.equal(formatMoney(-0.005), "-0.01", "half away from zero");
  });
  it("PF-178 / Q-W4: display rounding, half away from zero to the cent", () => {
    assert.equal(formatMoney(2.675), "2.68");
    assert.equal(formatMoney(0.125), "0.13");
    assert.equal(formatMoney(999.995), "1,000.00");
  });
  it("PF-179: the converted Monthly / Yearly field shows two decimals; the typed field as typed", () => {
    const line = { id: "a", name: "Rent", amount: "1500", per: "month" } as unknown as Parameters<typeof fieldText>[0];
    assert.equal(fieldText(line, "month"), "1500", "typed text unchanged (PF-180)");
    assert.equal(fieldText(line, "year"), "18,000.00");
  });
});
