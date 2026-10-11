import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkFields, checkListings, parseAmount, type FieldInput } from "./field-checks.ts";
import { RESULT_LINES } from "./result-lines.ts";

const ok: FieldInput = {
  rows: [
    { ticker: "pltr", weight: "50" },
    { ticker: "TQQQ", weight: "50" },
  ],
  start: "2020-10-02",
  end: "2026-10-01",
  capital: "1,000",
  contribution: "1000",
  frequency: "weekly",
};
const errors = (input: Partial<FieldInput>) => {
  const result = checkFields({ ...ok, ...input });
  return result.ok ? {} : result.errors;
};

describe("calculator field checks (#78, spec §4 / ST4-17)", () => {
  it("the regression basket passes, tickers upper-cased, amounts parsed", () => {
    const result = checkFields(ok);
    assert.ok(result.ok);
    assert.deepEqual(result.basket, [
      { index: 0, ticker: "PLTR", weight: 50 },
      { index: 1, ticker: "TQQQ", weight: 50 },
    ]);
    assert.equal(result.capital, 1000);
    assert.equal(result.contribution, 1000);
  });

  it("tickers: an empty basket, a weight without a ticker, a duplicate (named, under the second)", () => {
    assert.deepEqual(errors({ rows: [{ ticker: "", weight: "" }] }), {
      "ticker-0": "Add a ticker.",
    });
    assert.deepEqual(errors({ rows: [{ ticker: "  ", weight: "10" }] }), {
      "ticker-0": "Add a ticker.",
    });
    assert.deepEqual(
      errors({
        rows: [
          { ticker: "PLTR", weight: "50" },
          { ticker: "", weight: "" },
          { ticker: "pltr", weight: "50" },
        ],
      }),
      { "ticker-2": "PLTR is already in the basket." },
    );
  });

  it("weights above 0", () => {
    for (const weight of ["", "0", "-5", "abc"]) {
      assert.deepEqual(
        errors({ rows: [{ ticker: "PLTR", weight }] }),
        { "weight-0": "Enter a weight above 0." },
        weight,
      );
    }
  });

  it("dates: both filled, start before end (equal refused, decision 4)", () => {
    assert.deepEqual(errors({ start: "" }), { start: "Add a start date." });
    assert.deepEqual(errors({ end: "" }), { end: "Add an end date." });
    assert.deepEqual(errors({ end: ok.start }), { end: "End must be after the start." });
    assert.deepEqual(errors({ end: "2019-01-01" }), { end: "End must be after the start." });
  });

  it("amounts: numbers above 0 (decision A); text, negatives, 0 and blanks refused", () => {
    for (const bad of ["", "abc", "-1", "0", "1e"]) {
      assert.deepEqual(
        errors({ capital: bad, contribution: bad }),
        {
          capital: "Enter a number above 0.",
          contribution: "Enter a number above 0.",
        },
        bad,
      );
    }
    assert.equal(parseAmount("1,000.5"), 1000.5);
    assert.equal(parseAmount(""), null);
  });

  it("frequency weekly or monthly only", () => {
    assert.deepEqual(errors({ frequency: "" }), { frequency: "Choose weekly or monthly." });
    assert.deepEqual(errors({ frequency: "daily" }), { frequency: "Choose weekly or monthly." });
    assert.deepEqual(errors({ frequency: "monthly" }), {});
  });

  it("every bad field at once", () => {
    assert.deepEqual(
      Object.keys(
        errors({ rows: [{ ticker: "", weight: "" }], start: "", capital: "x", frequency: "" }),
      ),
      ["ticker-0", "start", "capital", "frequency"],
    );
  });
});

describe("listing checks after the prices are read (#78, decision 1)", () => {
  it("the venue refusal under that ticker, word for word", () => {
    const message = "VOD.L lists on LSE. US, EU, and CA listings only.";
    assert.deepEqual(
      checkListings([
        { index: 0, ticker: "PLTR", ok: true, currency: "USD" },
        { index: 1, ticker: "VOD.L", ok: false, message },
      ]),
      { "ticker-1": message },
    );
  });

  it("a refusal that doesn't name the ticker is prefixed with it", () => {
    assert.deepEqual(
      checkListings([{ index: 0, ticker: "ZZ", ok: false, message: "Ticker looks wrong." }]),
      {
        "ticker-0": "ZZ: Ticker looks wrong.",
      },
    );
  });

  it("one currency per basket: the first ticker's currency is the basket's", () => {
    assert.deepEqual(
      checkListings([
        { index: 0, ticker: "PLTR", ok: true, currency: "USD" },
        { index: 1, ticker: "SHOP.TO", ok: true, currency: "CAD" },
        { index: 2, ticker: "TQQQ", ok: true, currency: "USD" },
      ]),
      { "ticker-1": "SHOP.TO trades in CAD; this basket is in USD. One currency per basket." },
    );
    assert.deepEqual(checkListings([{ index: 0, ticker: "PLTR", ok: true, currency: "USD" }]), {});
  });
});

describe("result lines (#78, decision 2)", () => {
  it("four lines, labels word for word, in order", () => {
    assert.deepEqual(
      RESULT_LINES.map((l) => [l.key, l.label]),
      [
        ["nlv", "Final value"],
        ["invested", "Total invested"],
        ["total", "Return (%)"],
        ["cagr", "CAGR (%)"],
      ],
    );
  });
});
