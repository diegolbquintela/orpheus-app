import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MONTHS_KEY, type MonthLines } from "./months.ts";
import { RecordStore } from "./record.ts";
import { RECORD_NAMES } from "./record.ts";
import { backfillPlans, comparePlan, mergePlansText, planFor, PLANS_KEY, readPlans, syncFuturePlans, variance } from "./plans.ts";

// #231 (personal-finance-spec §65, AC PFPV): planned vs actual (FM6).
const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "" });
const person = (wages: string) => ({ id: "p1", name: "Me", wages, bonus: "", tax: "0", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" });
const ml = (rent: string, wages = "60,000"): MonthLines => ({ fixed: [line("Rent", rent)], variable: [], people: [person(wages)] }) as unknown as MonthLines;
const plan = (rent: string) => ({ lines: ml(rent), capturedAt: "2026-10-01T00:00:00.000Z" });
const J = (v: unknown) => JSON.stringify(v);
const P = (t: string | undefined) => (t === undefined ? undefined : JSON.parse(t));

describe("#231 PFPV server merge (mergePlansText)", () => {
  const C = "2026-10";
  it("PFPV-01: a body without plans (an older tab) keeps every stored plan", () => {
    const stored = J({ "2026-11": plan("1"), "2026-09": plan("2") });
    assert.deepEqual(P(mergePlansText(stored, undefined, C)), P(stored));
  });
  it("PFPV-02: a stale body does not remove a newer stored future month; a future month in the body wins", () => {
    const stored = J({ "2026-11": plan("1"), "2026-12": plan("2") });
    const body = J({ "2026-11": plan("9") });
    assert.deepEqual(P(mergePlansText(stored, body, C)), { "2026-11": plan("9"), "2026-12": plan("2") });
  });
  it("PFPV-03: the current and past months keep the stored plan (body ignored), even when none is stored", () => {
    const stored = J({ "2026-10": plan("1"), "2026-09": plan("2") });
    const body = J({ "2026-10": plan("9"), "2026-09": plan("9"), "2026-08": plan("9") });
    assert.deepEqual(P(mergePlansText(stored, body, C)), { "2026-09": plan("2"), "2026-10": plan("1") });
  });
  it("PFPV-04: nothing is cleared (an empty or unreadable body keeps all); nothing stored + nothing sent = no value", () => {
    const stored = J({ "2026-11": plan("1") });
    assert.deepEqual(P(mergePlansText(stored, "{}", C)), P(stored));
    assert.deepEqual(P(mergePlansText(stored, "not json", C)), P(stored));
    assert.deepEqual(P(mergePlansText(stored, J({ bad: plan("9"), "2026-12": 5 }), C)), P(stored));
    assert.equal(mergePlansText(undefined, undefined, C), undefined);
    assert.deepEqual(P(mergePlansText(undefined, J({ "2026-11": plan("3") }), C)), { "2026-11": plan("3") });
  });
  it("PFPV-05: the record may hold the plans value", () => {
    assert.ok((RECORD_NAMES as readonly string[]).includes(PLANS_KEY));
    assert.equal(PLANS_KEY, "orpheus.finance.plans.v1");
  });
});

describe("#231 PFPV page plans (sync / backfill)", () => {
  const at = new Date("2026-10-15T12:00:00Z");
  it("PFPV-07: Save writes the plan of every saved FUTURE month, never the current or a past month (Q1)", () => {
    const s = new RecordStore({});
    const months = { "2026-09": ml("1"), "2026-10": ml("2"), "2026-11": ml("3"), "2026-12": { fixed: [], variable: [], people: [] } };
    assert.equal(syncFuturePlans(s, months, "2026-10", at), true);
    assert.deepEqual(Object.keys(readPlans(s)), ["2026-11"]);
    assert.equal(readPlans(s)["2026-11"].capturedAt, at.toISOString());
    // a later future-time save replaces it; unchanged lines keep the capture time
    assert.equal(syncFuturePlans(s, months, "2026-10", new Date("2026-10-20T00:00:00Z")), false);
    assert.equal(syncFuturePlans(s, { ...months, "2026-11": ml("4") }, "2026-10", at), true);
    assert.equal(readPlans(s)["2026-11"].lines.fixed[0].amount, "4");
    // once November is current, a save never changes its plan
    assert.equal(syncFuturePlans(s, { "2026-11": ml("7") }, "2026-11", at), false);
    assert.equal(readPlans(s)["2026-11"].lines.fixed[0].amount, "4");
  });
  it("PFPV-08: a future month emptied or dropped keeps its plan (Q5)", () => {
    const s = new RecordStore({});
    syncFuturePlans(s, { "2026-11": ml("3") }, "2026-10", at);
    syncFuturePlans(s, { "2026-11": { fixed: [], variable: [], people: [] } }, "2026-10", at);
    syncFuturePlans(s, {}, "2026-10", at);
    assert.equal(readPlans(s)["2026-11"].lines.fixed[0].amount, "3");
  });
  it("PFPV-09: backfill copies saved future months into ABSENT plans only, never current/past", () => {
    const s = new RecordStore({ [MONTHS_KEY]: J({ "2026-10": ml("2"), "2026-11": ml("3"), "2026-12": ml("5") }), [PLANS_KEY]: J({ "2026-12": plan("8") }) });
    assert.equal(backfillPlans(s, "2026-10", at), true);
    const p = readPlans(s);
    assert.deepEqual(Object.keys(p), ["2026-11", "2026-12"]);
    assert.equal(p["2026-11"].lines.fixed[0].amount, "3");
    assert.equal(p["2026-12"].lines.fixed[0].amount, "8");
    assert.equal(backfillPlans(s, "2026-10", at), false);
  });
});

describe("#231 PFPV comparison (Q2)", () => {
  it("PFPV-10: actual − planned, % of plan, direction (expenses over / income under / surplus under = worse)", () => {
    assert.deepEqual(variance("expenses", 1000, 1100), { planned: 1000, actual: 1100, diff: 100, pct: 10, label: "Over plan", tone: "worse" });
    assert.equal(variance("expenses", 1000, 900).tone, "better");
    assert.equal(variance("income", 5000, 4500).tone, "worse");
    assert.equal(variance("income", 5000, 4500).label, "Under plan");
    assert.equal(variance("income", 5000, 5500).tone, "better");
    assert.equal(variance("surplus", 4000, 3000).tone, "worse");
    assert.deepEqual(variance("expenses", 0, 50), { planned: 0, actual: 50, diff: 50, pct: null, label: "Over plan", tone: "worse" });
    assert.equal(variance("expenses", 10, 10).label, "On plan");
    assert.equal(variance("expenses", null, 10).diff, null);
  });
  it("PFPV-11: totals and per line, matched by line id; a line on one side only counts 0 on the other", () => {
    const planned = ml("1,000", "60,000");
    const actual = { ...ml("1,200", "54,000"), variable: [line("Gym", "50")] } as unknown as MonthLines;
    const c = comparePlan(planned, actual);
    assert.deepEqual([c.expenses.planned, c.expenses.actual, c.expenses.diff, c.expenses.tone], [1000, 1250, 250, "worse"]);
    assert.deepEqual([c.income.planned, c.income.actual, c.income.diff, c.income.pct, c.income.tone], [5000, 4500, -500, -10, "worse"]);
    assert.deepEqual([c.surplus.planned, c.surplus.actual, c.surplus.diff], [4000, 3250, -750]);
    assert.deepEqual(c.lines.map((l) => [l.kind, l.name, l.planned, l.actual, l.diff]), [
      ["expenses", "Rent", 1000, 1200, 200],
      ["expenses", "Gym", 0, 50, 50],
      ["income", "Me · Wages", 5000, 4500, -500],
    ]);
  });
  it("PFPV-12: shown for a current or past month with a plan only (Q4)", () => {
    const s = new RecordStore({ [MONTHS_KEY]: J({ "2026-10": ml("1,100") }), [PLANS_KEY]: J({ "2026-10": plan("1,000"), "2026-11": plan("5") }) });
    assert.equal(planFor(s, "2026-10", "2026-10")?.comparison.expenses.diff, 100);
    assert.equal(planFor(s, "2026-11", "2026-10"), null);
    assert.equal(planFor(s, "2026-09", "2026-10"), null);
    // once it is a past month, the frozen plan still compares against what is saved
    assert.equal(planFor(s, "2026-10", "2026-12")?.comparison.expenses.actual, 1100);
  });
});
