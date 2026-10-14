import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldErrors, recordFieldError } from "./field-errors.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { INCOME_KEY } from "./income.ts";
import { EQUITY_KEY } from "./equity.ts";
import { OVERVIEW_KEY } from "./overview.ts";
import { MONTHS_KEY } from "./months.ts";
import { CURRENCY_KEY } from "./currency.ts";

// #143 (spec section 28, PF-133..PF-137): one check for the page's Save and the API's PUT.
const line = (amount: string, over: Record<string, string> = {}) => ({ id: "l1", name: "Rent", amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "", ...over });
const person = (over: Record<string, unknown> = {}) => ({ id: "p1", name: "Me", wages: "36,000", bonus: "", tax: "30", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "", ...over });
const state = (o: { fixed?: object[]; people?: object[]; withdrawal?: string; roic?: string; start?: string; growth?: string } = {}) =>
  ({
    expenses: { fixed: o.fixed ?? [line("2,200")], variable: [] },
    income: { people: o.people ?? [person()] },
    rates: { withdrawal: o.withdrawal ?? "", roic: o.roic ?? "" },
    overview: { start: o.start ?? "", growth: o.growth ?? "" },
    household: "CAD",
  }) as unknown as Parameters<typeof fieldErrors>[0];

describe("#143 fieldErrors (the page, PF-133..PF-136)", () => {
  it("valid: amounts blank / 0 / positive; percents 0–100", () => {
    assert.deepEqual(fieldErrors(state()), []);
    assert.deepEqual(fieldErrors(state({ fixed: [line("0"), line("")], people: [person({ tax: "0" }), person({ tax: "100", share: "" })] })), []);
  });
  it("each bad field is named (negative, non-number, percent over 100, foreign line without a rate)", () => {
    assert.deepEqual(fieldErrors(state({ fixed: [line("-5")] })), ["fixed.0.amount"]);
    assert.deepEqual(fieldErrors(state({ fixed: [line("1", { equity: "-1" })] })), ["fixed.0.equity"]);
    assert.deepEqual(fieldErrors(state({ fixed: [line("1", { currency: "USD", rate: "" })] })), ["fixed.0.rate"]);
    assert.deepEqual(fieldErrors(state({ fixed: [line("1", { currency: "USD", rate: "0" })] })), ["fixed.0.rate"]);
    assert.deepEqual(fieldErrors(state({ people: [person({ tax: "-1" })] })), ["people.0.tax"]);
    assert.deepEqual(fieldErrors(state({ people: [person({ tax: "101" })] })), ["people.0.tax"]);
    assert.deepEqual(fieldErrors(state({ people: [person({ wages: "lots", share: "150" })] })), ["people.0.wages", "people.0.share"]);
    assert.deepEqual(fieldErrors(state({ people: [person({ foreign: true, currency: "USD", rate: "" })] })), ["people.0.rate"]);
    assert.deepEqual(fieldErrors(state({ withdrawal: "-4", roic: "x", start: "-10", growth: "-5" })), ["rates.withdrawal", "rates.roic", "overview.start", "overview.growth"]);
  });
});

describe("#143 recordFieldError (the API, PF-137)", () => {
  const months = (fixed: object[], people: object[] = [person()]) => ({ [MONTHS_KEY]: JSON.stringify({ "2026-10": { fixed, variable: [], people } }) });
  it("a valid record → null; blank FX rate accepted (Q14)", () => {
    assert.equal(recordFieldError({}), null);
    assert.equal(recordFieldError(months([line("2,200"), line("0", { id: "l2" })])), null);
    assert.equal(recordFieldError({ ...months([line("10", { currency: "USD", rate: "" })]), [CURRENCY_KEY]: '{"household":"CAD"}' }), null);
  });
  it("an invalid value anywhere → its path (never clamped)", () => {
    assert.equal(recordFieldError(months([line("-5")])), "months.2026-10.fixed.0.amount");
    assert.equal(recordFieldError(months([line("1")], [person({ tax: "101" })])), "months.2026-10.people.0.tax");
    assert.equal(recordFieldError(months([line("1", { currency: "USD", rate: "-1" })])), "months.2026-10.fixed.0.rate");
    assert.equal(recordFieldError({ [STORAGE_KEY]: JSON.stringify({ fixed: [line("-5")], variable: [], accounts: [] }) }), "expenses.fixed.0.amount");
    assert.equal(recordFieldError({ [INCOME_KEY]: JSON.stringify({ people: [person({ tax: "-1" })] }) }), "income.people.0.tax");
    assert.equal(recordFieldError({ [EQUITY_KEY]: '{"withdrawal":"-4","roic":""}' }), "rates.withdrawal");
    assert.equal(recordFieldError({ [OVERVIEW_KEY]: JSON.stringify({ start: "-10", growth: "", future: false, years: 1, months: {} }) }), "overview.start");
  });
});
