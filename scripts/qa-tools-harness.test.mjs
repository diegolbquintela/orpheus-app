// #208 (spec 61.2, HTL-03 / -04; the qa/tools check deferred from #219). Every qa/tools/*.mjs is classified: either it
// calls the production guard (the GUARDED set pinned in qa-prod-guard.test.mjs) or it is pinned here as UNGUARDED
// (shared helpers and tools that never sign in or write). A new file in neither set fails, so a new QA tool is
// classified before it lands. No test here sends real traffic (scripts/fixtures/fake-net.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = (f) => readFileSync(`qa/tools/${f}`, "utf8");
const callsGuard = (f) => /\brefuseIfProd\(/.test(src(f).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));
const MJS = readdirSync("qa/tools").filter((f) => f.endsWith(".mjs") && f !== "prod-guard.mjs").sort();
// Never sign in (no *_PASSWORD; qa-prod-guard.test.mjs proves every sign-in tool is guarded) and never write.
// #247 BB1: pf-plan-seed.mjs is a pure helper (no network, no account); pf-scenario-e2e.mjs, which uses it, is guarded.
const UNGUARDED = ["book-math.mjs", "c5live.mjs", "config.mjs", "export-parse.mjs", "fonts.mjs", "full.mjs", "leaveouts-rules.mjs", "no-grok.mjs", "pf-asof-checks.mjs", "pf-helpers.mjs", "pf-plan-seed.mjs", "pr3-mobile-cue.mjs", "pr3.mjs", "run.mjs", "session.mjs", "sidebyside.mjs"];

test("HTL-03: every qa/tools/*.mjs is guarded or pinned as unguarded (a new unclassified tool fails here)", () => {
  const unguarded = MJS.filter((f) => !callsGuard(f));
  assert.deepEqual(unguarded, UNGUARDED, "classify the new qa/tools file: call refuseIfProd (and pin it in qa-prod-guard.test.mjs GUARDED) or add it to UNGUARDED with a reason");
  for (const f of UNGUARDED) assert.ok(!src(f).includes("_PASSWORD") || f === "session.mjs", `${f} reads a password, so it must be guarded`);
  assert.ok(MJS.filter(callsGuard).includes("pf-scenario-e2e.mjs"));
});

test("HTL-04: pf-scenario-e2e.mjs --help prints usage, exits 0 and makes zero network requests", () => {
  const dir = mkdtempSync(join(tmpdir(), "qahelp-"));
  const log = join(dir, "requests.log");
  writeFileSync(log, "");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, FAKE_LOG: log, NODE_OPTIONS: `--import ${join(process.cwd(), "scripts/fixtures/fake-net.mjs")}` };
  for (const flag of ["--help", "-h"]) {
    const r = spawnSync(process.execPath, ["qa/tools/pf-scenario-e2e.mjs", flag], { encoding: "utf8", env, timeout: 60_000 });
    assert.equal(r.status, 0, `${flag}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /usage: .*pf-scenario-e2e\.mjs --base-url <preview> --out <dir>/i);
    assert.deepEqual(readFileSync(log, "utf8").split("\n").filter(Boolean), [], `${flag} made a request`);
  }
});

test("HTL-05 (source order): roles.mjs checks the scenario save before the CFO's Read-and-write flip, and checks no grant", () => {
  const r = src("roles.mjs");
  const flip = r.indexOf('grants("read_write", "none")');
  for (const id of ["PFSC-15", "PFSC-16", "PFSC-13", "PFSC-03", "HTL-05 no grant: saving", "HTL-05 no grant: /personal-finance/scenario"]) {
    const at = r.indexOf(`check("${id}`);
    assert.ok(at > 0 && at < flip, `${id} runs before the ROLE-11 flip`);
  }
  assert.match(r, /http\(none\.jar, "PUT", "\/api\/personal-finance", \{ data: \{ \.\.\.PF_RECORD, \[SC\]: lev \} \}\)/);
});
