// #247 follow-up BB1: qa/tools/pf-plan-seed.mjs (the harness seeds missing future plans before PFSV-22).
import assert from "node:assert/strict";
import { test } from "node:test";
import { MONTHS_KEY, PLANS_KEY, torontoMonth, withSeededPlans } from "../qa/tools/pf-plan-seed.mjs";

const AT = new Date("2026-10-16T16:00:00Z");
const line = { id: "rent", name: "rent", amount: "1000", per: "month" };
const rec = (months, plans) => ({ other: "kept", [MONTHS_KEY]: JSON.stringify(months), ...(plans ? { [PLANS_KEY]: JSON.stringify(plans) } : {}) });

test("BB1-01: a future month with lines and no plan gets one; past / current / empty months do not", () => {
  const out = withSeededPlans(rec({ "2026-09": { fixed: [line] }, "2026-10": { fixed: [line] }, "2026-11": { fixed: [], variable: [], people: [] }, "2026-12": { fixed: [line] } }), "2026-10", AT);
  assert.ok(out);
  assert.equal(out.other, "kept");
  assert.deepEqual(JSON.parse(out[PLANS_KEY]), { "2026-12": { lines: { fixed: [line], variable: [], people: [] }, capturedAt: AT.toISOString() } });
});
test("BB1-02: nothing missing → null (no PUT); an existing plan is never replaced", () => {
  const plan = { lines: { fixed: [], variable: [], people: [] }, capturedAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(withSeededPlans(rec({ "2026-12": { fixed: [line] } }, { "2026-12": plan }), "2026-10", AT), null);
  assert.equal(withSeededPlans(rec({ "2026-09": { fixed: [line] } }), "2026-10", AT), null);
  assert.equal(withSeededPlans(null, "2026-10", AT), null);
  assert.equal(withSeededPlans({ [MONTHS_KEY]: "{not json" }, "2026-10", AT), null);
  const out = withSeededPlans(rec({ "2026-12": { fixed: [line] }, "2027-01": { people: [{ id: "a" }] } }, { "2026-12": plan }), "2026-10", AT);
  const plans = JSON.parse(out[PLANS_KEY]);
  assert.deepEqual(plans["2026-12"], plan);
  assert.deepEqual(Object.keys(plans), ["2026-12", "2027-01"]);
});
test("BB1-03: the household month is Toronto's", () => {
  assert.equal(torontoMonth(new Date("2026-11-01T03:00:00Z")), "2026-10");
  assert.equal(torontoMonth(new Date("2026-11-01T05:00:00Z")), "2026-11");
});
