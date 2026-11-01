// #285 (AC PFWB-05..07): the QA harness's PF window labels (qa/tools/pf-window.mjs) follow the date the page sees,
// in America/Toronto, at month boundaries, under any process TZ (gates: TZ=UTC and TZ=America/Los_Angeles).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { avg12Label, avg3Label, completeMonths, householdMonth } from "../qa/tools/pf-window.mjs";

const D = "\u2013";

test("PFWB-05 pinned TODAY (Oct 11 2026 12:00 local) → Jul–Sep / Oct–Sep, whatever today really is", () => {
  const TODAY = new Date(2026, 9, 11, 12);
  assert.equal(householdMonth(TODAY), "2026-10");
  assert.equal(avg3Label(TODAY), `3-month average (Jul${D}Sep)`);
  assert.equal(avg12Label(TODAY), `12-month average (Oct${D}Sep)`);
  assert.equal(avg12Label(TODAY, 1), "12-month average (1 of 12 months)");
  assert.throws(() => avg3Label(), TypeError, "no wall-clock default");
  assert.throws(() => householdMonth(new Date(Number.NaN)), TypeError);
});

test("PFWB-06 boundaries: Oct 31 last instant, Nov 1 00:00 Toronto / UTC / local, Jan 1, Feb 29 / Mar 1", () => {
  assert.equal(avg3Label(new Date(Date.UTC(2026, 10, 1, 3, 59, 59, 999))), `3-month average (Jul${D}Sep)`);
  assert.equal(avg3Label(new Date(Date.UTC(2026, 10, 1, 4))), `3-month average (Aug${D}Oct)`);
  assert.equal(avg3Label(new Date(Date.UTC(2026, 10, 1, 0))), `3-month average (Jul${D}Sep)`);
  const local = new Date(2026, 10, 1, 0, 0, 0, 0);
  const tz = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const want = { UTC: `Jul${D}Sep`, "America/Los_Angeles": `Aug${D}Oct`, "America/Toronto": `Aug${D}Oct` }[tz];
  if (want) assert.equal(avg3Label(local), `3-month average (${want})`);
  assert.deepEqual(completeMonths(new Date(Date.UTC(2027, 0, 1, 4, 59, 59, 999)), 3), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(completeMonths(new Date(Date.UTC(2027, 0, 1, 5)), 3), ["2026-10", "2026-11", "2026-12"]);
  assert.equal(avg12Label(new Date(Date.UTC(2027, 0, 1, 5))), `12-month average (Jan${D}Dec)`);
  assert.deepEqual(completeMonths(new Date(Date.UTC(2028, 1, 29, 17)), 3), ["2027-11", "2027-12", "2028-01"]);
  assert.deepEqual(completeMonths(new Date(Date.UTC(2028, 2, 1, 5)), 3), ["2027-12", "2028-01", "2028-02"]);
  assert.deepEqual(completeMonths(new Date(Date.UTC(2028, 2, 31, 16)), 3), ["2027-12", "2028-01", "2028-02"]);
});

test("PFWB-07 personal-finance-e2e derives every window label and the current month from the pinned TODAY", () => {
  const src = readFileSync(new URL("../qa/tools/personal-finance-e2e.mjs", import.meta.url), "utf8");
  assert.match(src, /const TODAY = new Date\(2026, 9, 11, 12\);/);
  assert.match(src, /const avg3Label = \(\) => avg3At\(TODAY\);/);
  assert.match(src, /const avg12Label = \(withData = 12\) => avg12At\(TODAY, withData\);/);
  assert.match(src, /const curMonth = householdMonth\(TODAY\);/);
  assert.doesNotMatch(src, /format\(new Date\(\)\)/, "no window or month read from the runner's wall clock");
  assert.doesNotMatch(src, /now = new Date\(\)/);
});
