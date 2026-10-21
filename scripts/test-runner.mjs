#!/usr/bin/env node
/**
 * #183: runs `node <args>` (a `node --test …` stage) with the TAP reporter, passes its output through,
 * and fails (exit 1) when node exits non-zero OR any `not ok` line appears (TODO / SKIP lines excepted).
 * Node can print `not ok` for a suite that throws while loading (e.g. a nested `describe` whose callback
 * throws or awaits a missing import) and still report `# fail 0` and exit 0; this closes that gap.
 * Usage: node scripts/test-runner.mjs --test 'scripts/**\/*.test.mjs'
 */
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const NOT_OK = /^\s*not ok\b/;
const ALLOWED = /#\s*(TODO|SKIP)\b/i;

/** The failing `not ok` lines in a TAP text (TODO / SKIP directives excepted). */
export function notOkLines(text) {
  return text.split(/\r?\n/).filter((l) => NOT_OK.test(l) && !ALLOWED.test(l));
}

/** Exit code for a stage: 1 when node failed or any failing `not ok` line was printed. */
export function stageExit(status, lines) {
  return status === 0 && lines.length === 0 ? 0 : 1;
}

/** Runs `node <args>` with the TAP reporter; resolves to the stage exit code. */
export function runNodeTest(args, { out = process.stdout, err = process.stderr, label = "test-runner" } = {}) {
  const full = args.some((a) => a.startsWith("--test-reporter")) ? args : ["--test-reporter=tap", ...args];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, full, { stdio: ["inherit", "pipe", "pipe"] });
    const bad = [];
    let buf = "";
    child.stdout.on("data", (chunk) => {
      out.write(chunk);
      buf += chunk.toString("utf8");
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      bad.push(...notOkLines(parts.join("\n")));
    });
    child.stderr.on("data", (chunk) => err.write(chunk));
    child.on("close", (code, signal) => {
      if (buf) bad.push(...notOkLines(buf));
      const status = code ?? (signal ? 1 : 0);
      const exit = stageExit(status, bad);
      if (exit !== 0 && status === 0) {
        err.write(`[${label}] FAIL: node exited 0 but printed ${bad.length} 'not ok' line(s):\n${bad.join("\n")}\n`);
      }
      resolve(exit);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  if (!args.includes("--test")) {
    console.error("[test-runner] usage: node scripts/test-runner.mjs [node flags] --test <files…>");
    process.exit(2);
  }
  process.exit(await runNodeTest(args));
}
