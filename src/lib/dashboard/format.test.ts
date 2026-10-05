// Display formatters (#59, DR6-02: every amount shows full digits with thousands separators, never K/M/B).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayDecimal, formatEps, formatMetricPct, formatPortfolioCell, groupDigits } from "./format.ts";

describe("DR6-02: full digits with thousands separators", () => {
  it("groupDigits adds separators and never touches the decimals", () => {
    assert.equal(groupDigits("999"), "999");
    assert.equal(groupDigits("1000"), "1,000");
    assert.equal(groupDigits("17500"), "17,500");
    assert.equal(groupDigits("1234.5"), "1,234.5");
    assert.equal(groupDigits("1234567.123456"), "1,234,567.123456");
    assert.equal(groupDigits("-12345.678"), "-12,345.678");
    assert.equal(groupDigits("0.105"), "0.105");
    assert.equal(groupDigits("—"), "—");
  });
  it("stored NUMERIC strings: trimmed then grouped (shares, average cost, last close)", () => {
    assert.equal(displayDecimal("17500.000000"), "17,500");
    assert.equal(displayDecimal("10.500000"), "10.5");
    assert.equal(displayDecimal("2650.920000"), "2,650.92");
  });
  it("EPS and metric percentages are grouped too, never abbreviated", () => {
    assert.equal(formatEps(3.04, "USD"), "3.04 USD");
    assert.equal(formatEps(41234.5, "USD"), "41,234.50 USD");
    assert.equal(formatMetricPct(0.274), "27.4%");
    assert.equal(formatMetricPct(12.345), "1,234.5%");
    assert.equal(formatPortfolioCell("m", { value: 15, coverage: 0.5 }).text, "1,500.0% · 50% covered");
  });
});
