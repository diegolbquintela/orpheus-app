// #208 (spec 61.1, HTL-01 / -02): fail `npm test` when a src test file is not in the explicit list (or a runner).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listedFiles, missingFromList, srcTests, staleInList, testScript } from "./test-list.mjs";

test("HTL-01: every src *.test.ts(x) in this repo is in the npm test list or found by run-dom-tests", () => {
  const script = testScript(process.cwd());
  assert.ok(srcTests(process.cwd()).length > 50, "the glob finds the src tests");
  const missing = missingFromList(process.cwd(), script);
  assert.deepEqual(missing, [], `not in the npm test list (add them to "test" in package.json): ${missing.join(", ")}`);
  const stale = staleInList(process.cwd(), script);
  assert.deepEqual(stale, [], `listed but missing: ${stale.join(", ")}`);
});

function fakeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "testlist-"));
  for (const f of files) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), "");
  }
  return root;
}

test("HTL-02 mutation: an unlisted src test file is named; dom tests are left to their runner; stale entries are named", () => {
  const root = fakeRepo(["src/a/x.test.ts", "src/b/y.test.ts", "src/c/z.dom.test.tsx", "src/c/w.test.tsx", "src/a/helper.ts"]);
  const script = "node scripts/test-runner.mjs --test 'scripts/**/*.test.mjs' && node scripts/test-runner.mjs --experimental-strip-types --test src/a/x.test.ts src/gone.test.ts && node scripts/run-dom-tests.mjs";
  assert.deepEqual(listedFiles(script), ["src/a/x.test.ts", "src/gone.test.ts"]);
  assert.deepEqual(missingFromList(root, script), ["src/b/y.test.ts", "src/c/w.test.tsx"]);
  assert.deepEqual(staleInList(root, script), ["src/gone.test.ts"]);
  const fixed = script.replace("src/gone.test.ts", "src/b/y.test.ts src/c/w.test.tsx");
  assert.deepEqual(missingFromList(root, fixed), []);
  assert.deepEqual(staleInList(root, fixed), []);
});
