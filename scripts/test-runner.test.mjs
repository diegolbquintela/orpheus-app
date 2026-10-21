// #183 (AC TLF-xx): npm test fails when a test file errors while loading.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { notOkLines, stageExit } from "./test-runner.mjs";

const root = resolve(import.meta.dirname, "..");
const fx = (n) => join(root, "test-fixtures/test-runner", `${n}.fixture.mjs`);
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT; // run the fixtures as a top-level runner, not as a child of this one
const run = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", env });
const runner = (name) => run([join(root, "scripts/test-runner.mjs"), "--test", fx(name)]);

describe("TLF test runner", () => {
  it("TLF-01 baseline: bare node --test exits 0 with # fail 0 on the nested broken import (the bug)", () => {
    const r = run(["--test", "--test-reporter=tap", fx("nested-broken-import")]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^\s*not ok \d+ - inner/m);
    assert.match(r.stdout, /^# fail 0$/m);
  });
  for (const name of ["nested-broken-import", "nested-throw", "top-level-broken-import"]) {
    it(`TLF-02 the runner exits 1 on ${name}`, () => {
      const r = runner(name);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stdout, /not ok/);
    });
  }
  it("TLF-02 the runner names the not ok lines when node itself exited 0", () => {
    const r = runner("nested-broken-import");
    assert.match(r.stderr, /\[test-runner\] FAIL: node exited 0 but printed 2 'not ok' line\(s\)/);
  });
  it("TLF-03 a passing file exits 0; TODO not ok lines do not fail", () => {
    assert.equal(runner("pass").status, 0);
    const t = runner("todo");
    assert.equal(t.status, 0, t.stdout + t.stderr);
    assert.match(t.stdout, /not ok \d+ - later # TODO/);
  });
  it("TLF-04 notOkLines / stageExit", () => {
    const tap = "ok 1 - a\n    not ok 2 - inner\nnot ok 3 - b # TODO later\nnot ok 4 - c # SKIP\n# fail 0\n";
    assert.deepEqual(notOkLines(tap), ["    not ok 2 - inner"]);
    assert.equal(stageExit(0, []), 0);
    assert.equal(stageExit(0, ["not ok 1 - x"]), 1);
    assert.equal(stageExit(1, []), 1);
  });
  it("TLF-05 every npm test stage goes through the runner", () => {
    const test = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.test;
    const stages = test.split("&&").map((s) => s.trim());
    assert.equal(stages.length, 3);
    assert.match(stages[0], /^node scripts\/test-runner\.mjs --test 'scripts\/\*\*\/\*\.test\.mjs'$/);
    assert.match(stages[1], /^node scripts\/test-runner\.mjs --experimental-strip-types --test /);
    assert.equal(stages[2], "node scripts/run-dom-tests.mjs");
    assert.doesNotMatch(test, /(^|&&\s*)node --test/);
    const dom = readFileSync(join(root, "scripts/run-dom-tests.mjs"), "utf8");
    assert.match(dom, /runNodeTest\(\["--test", \.\.\.files\]/);
    assert.doesNotMatch(dom, /spawnSync/);
  });
});
