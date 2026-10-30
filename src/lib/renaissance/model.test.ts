// #267 (renaissance-spec section 3, AC RM-03): check-in body validation.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isIsoDate, LIMITS, parseCheckin } from "./model.ts";

const ok = { date: "2026-10-30", picks: ["Zyn ≤15"], entries: [{ pillar: "health", item: "zyn", target: 15, actual: 12, hit: true, note: "ok" }] };
const bad = (patch: Record<string, unknown>, entry?: Record<string, unknown>) =>
  parseCheckin({ ...ok, ...patch, ...(entry ? { entries: [{ ...ok.entries[0], ...entry }] } : {}) });

describe("RM-03 parseCheckin", () => {
  it("accepts a full body and normalises missing fields to null / []", () => {
    const r = parseCheckin(ok);
    assert.ok(r.ok);
    assert.deepEqual(r.value, { date: "2026-10-30", picks: ["Zyn ≤15"], entries: [{ pillar: "health", item: "zyn", target: 15, actual: 12, hit: true, note: "ok" }] });
    const r2 = parseCheckin({ date: "2026-10-30", entries: [{ pillar: "industry", item: "industry" }] });
    assert.ok(r2.ok);
    assert.deepEqual(r2.value.picks, []);
    assert.deepEqual(r2.value.entries[0], { pillar: "industry", item: "industry", target: null, actual: null, hit: null, note: null });
  });
  it("trims picks and notes; a blank note is null; unknown keys are ignored", () => {
    const r = parseCheckin({ ...ok, userId: "x", picks: ["  a  "], entries: [{ ...ok.entries[0], note: "   ", extra: 1 }] });
    assert.ok(r.ok);
    assert.deepEqual(r.value.picks, ["a"]);
    assert.equal(r.value.entries[0].note, null);
  });
  it("rejects bad bodies", () => {
    for (const raw of [null, [], "x", 1]) assert.equal(parseCheckin(raw).ok, false);
    for (const date of ["2026-02-30", "2026-13-01", "26-10-30", "2026-10-30T00:00", 20261030, "1999-12-31", "2100-01-01"]) assert.equal(bad({ date }).ok, false, String(date));
    for (const picks of ["a", [1], [""], ["x".repeat(LIMITS.pick + 1)], Array(LIMITS.picks + 1).fill("a")]) assert.equal(bad({ picks }).ok, false);
    for (const entries of [undefined, [], "x", Array(LIMITS.entries + 1).fill(ok.entries[0])]) assert.equal(bad({ entries }).ok, false);
    assert.equal(bad({ entries: [ok.entries[0], ok.entries[0]] }).ok, false); // repeated item
    assert.equal(bad({ entries: [null] }).ok, false);
    for (const pillar of ["Health", "body", undefined]) assert.equal(bad({}, { pillar }).ok, false);
    for (const item of ["Zyn", "1zyn", "zyn-x", "", "a".repeat(41), 5]) assert.equal(bad({}, { item }).ok, false, String(item));
    for (const target of [-1, "3", Number.NaN, Infinity, LIMITS.value + 1]) assert.equal(bad({}, { target }).ok, false);
    for (const actual of [-0.5, "12"]) assert.equal(bad({}, { actual }).ok, false);
    for (const hit of ["true", 1]) assert.equal(bad({}, { hit }).ok, false);
    for (const note of [5, "x".repeat(LIMITS.note + 1)]) assert.equal(bad({}, { note }).ok, false);
  });
  it("accepts the edges", () => {
    assert.ok(bad({}, { target: 0, actual: LIMITS.value, note: "x".repeat(LIMITS.note) }).ok);
    assert.ok(bad({ picks: Array(LIMITS.picks).fill("a") }).ok);
    assert.ok(bad({}, { item: "a".repeat(40) }).ok);
    assert.ok(isIsoDate("2028-02-29"));
    assert.ok(!isIsoDate("2026-02-29"));
  });
});
