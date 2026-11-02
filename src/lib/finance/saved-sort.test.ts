// #278 (AC PFSO-01..05): the Saved scenarios column sort: cycle, both columns both ways, stable tiebreak on the stored
// order, aria-sort and labels; the input list is never reordered.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ariaSort, nextSort, sortLabel, sortSaved, type SavedSort } from "./saved-sort.ts";
import type { SavedEntry } from "./scenario-key.ts";

const e = (id: string, name: string, basis: string): SavedEntry => ({
  id, name, basis, savedAt: "2026-10-01T00:00:00Z", inputs: { start: 0, income: 0, expenses: 0, growth: 0, rate: null }, values: {}, lines: "{}",
});
// Stored order 0..4. Ties: "Éclair" = "Eclair" (accents ignored); 2026-05 twice and 2026-09 twice.
const FIXTURE = [e("0", "Delta", "2026-05"), e("1", "alpha 2", "2026-09"), e("2", "Éclair", "2026-05"), e("3", "alpha 10", "2025-12"), e("4", "Eclair", "2026-09")];
const ids = (s: SavedSort) => sortSaved(FIXTURE, s).map((x) => x.id).join("");

test("PFSO-01 the cycle: none → ascending → descending → none; another column starts ascending", () => {
  assert.deepEqual(nextSort(null, "name"), { column: "name", dir: "ascending" });
  assert.deepEqual(nextSort({ column: "name", dir: "ascending" }, "name"), { column: "name", dir: "descending" });
  assert.equal(nextSort({ column: "name", dir: "descending" }, "name"), null);
  assert.deepEqual(nextSort({ column: "name", dir: "descending" }, "from"), { column: "from", dir: "ascending" });
  assert.deepEqual(nextSort({ column: "from", dir: "ascending" }, "name"), { column: "name", dir: "ascending" });
});

test("PFSO-02 Scenario name: case- and accent-blind, numeric (2 before 10); ties keep the stored order both ways", () => {
  assert.equal(ids(null), "01234");
  assert.equal(ids({ column: "name", dir: "ascending" }), "13024");
  assert.equal(ids({ column: "name", dir: "descending" }), "24031");
});

test("PFSO-03 From: month order (2025-12 before 2026-05); ties keep the stored order both ways", () => {
  assert.equal(ids({ column: "from", dir: "ascending" }), "30214");
  assert.equal(ids({ column: "from", dir: "descending" }), "14023");
});

test("PFSO-04 sortSaved returns a new array and never reorders (or copies into) the saved list", () => {
  const before = FIXTURE.map((x) => x.id).join("");
  const out = sortSaved(FIXTURE, { column: "name", dir: "descending" });
  assert.notEqual(out, FIXTURE);
  assert.equal(FIXTURE.map((x) => x.id).join(""), before);
  assert.ok(out.every((x, i) => x === FIXTURE.find((f) => f.id === out[i].id)), "same entry objects");
  assert.deepEqual(sortSaved([], { column: "from", dir: "ascending" }), []);
});

test("PFSO-05 aria-sort and the button names", () => {
  const s: SavedSort = { column: "from", dir: "descending" };
  assert.deepEqual([ariaSort(null, "name"), ariaSort(s, "name"), ariaSort(s, "from")], ["none", "none", "descending"]);
  assert.equal(sortLabel("Scenario name", null, "name"), "Scenario name. Sort ascending");
  assert.equal(sortLabel("From", { column: "from", dir: "ascending" }, "from"), "From, sorted ascending. Sort descending");
  assert.equal(sortLabel("From", s, "from"), "From, sorted descending. Back to saved order");
  assert.equal(sortLabel("Scenario name", s, "name"), "Scenario name. Sort ascending");
});
