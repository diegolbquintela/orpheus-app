// #208 (spec 61.1, HTL-01 / -02): src tests run from the hard-coded `npm test` list, so a new test file nobody adds
// never runs. `missingFromList` names every src test file that is neither listed nor picked up by a runner that globs
// (`*.dom.test.tsx`, scripts/run-dom-tests.mjs); `staleInList` names listed src files that don't exist.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const TEST = /\.test\.(ts|tsx|mts|mjs)$/;
const BY_RUNNER = /\.dom\.test\.tsx$/;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** The src paths named in the `test` script (whitespace separated, quotes stripped). */
export const listedFiles = (script) =>
  script.split(/\s+/).map((w) => w.replace(/^['"]|['"]$/g, "")).filter((w) => w.startsWith("src/"));

export function srcTests(root) {
  return walk(join(root, "src")).map((f) => relative(root, f).split("\\").join("/")).filter((f) => TEST.test(f)).sort();
}

export function missingFromList(root, script) {
  const listed = new Set(listedFiles(script));
  return srcTests(root).filter((f) => !BY_RUNNER.test(f) && !listed.has(f));
}

export function staleInList(root, script) {
  return listedFiles(script).filter((f) => !existsSync(join(root, f)));
}

export const testScript = (root) => JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.test;
