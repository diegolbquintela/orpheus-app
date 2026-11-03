// #312 (spec §90.4, AC PFAV2-05 amended 2026-11-03): the PFAV2-05 verdict in qa/tools/pf-coverage-check.mjs. A missing
// note, toggle or button is SKIP, never PASS; a present note passes only on a strict match. The last test pins the
// mutant that restores the old `!text ||` short-circuit (an empty note counted as a pass).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVERAGE_BASIS, coverageVerdict } from "../qa/tools/pf-coverage-check.mjs";

const good = { toggle: true, year1: true, note: true, text: `Your net assets covers 34.68% of expenses ${COVERAGE_BASIS}`, totals: "34.68%" };

test("PFAV2-05a: an empty / missing note, toggle or button is SKIP, never PASS", () => {
  for (const c of [{ ...good, note: false, text: "" }, { ...good, toggle: false }, { ...good, year1: false }, { toggle: false, year1: false, note: false, text: "", totals: null }]) {
    const v = coverageVerdict(c);
    assert.equal(v.verdict, "skip");
    assert.match(v.status, /^no /);
  }
  assert.equal(coverageVerdict({ ...good, note: false, text: "" }).status, "no pf-coverage-rate-note");
});

test("PFAV2-05b: a present note that matches is PASS", () => {
  assert.deepEqual(coverageVerdict(good), { verdict: "pass", share: "34.68%", totals: "34.68%" });
});

test("PFAV2-05c: a mismatch is FAIL (share, totals, basis, or an empty present note)", () => {
  for (const c of [{ ...good, totals: "13.01%" }, { ...good, totals: null }, { ...good, text: "covers 34.68% of expenses (12-month average)." }, { ...good, text: "" }, { ...good, text: COVERAGE_BASIS }]) {
    assert.equal(coverageVerdict(c).verdict, "fail", JSON.stringify(c));
  }
});

test("PFAV2-05d: the helper keeps no `!text ||` short-circuit and the tool never checks a SKIP", () => {
  const lib = readFileSync("qa/tools/pf-coverage-check.mjs", "utf8");
  assert.ok(!/!t(ext)?\s*\|\|/.test(lib));
  const tool = readFileSync("qa/tools/pf-scenario-e2e.mjs", "utf8");
  assert.ok(!tool.includes("!text ||"));
  assert.match(tool, /if \(v\.verdict === "skip"\) info\(`\$\{tag\} PFAV2-05 SKIPPED \(coverage not computed: \$\{v\.status\}\)`\);\n\s*else\n\s*check\(/);
});
