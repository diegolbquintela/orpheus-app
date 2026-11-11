// #328: remote opt-in, CDN estimate, per-run budget, --budget-only. No build, no server, no network.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { qaConfig } from "../qa/tools/config.mjs";
import { LOCAL_BASE_URL } from "../qa/tools/lib/base-url.mjs";
import {
  DEFAULT_BUDGET,
  LOCAL_ESTIMATE_LINE,
  PROFILES,
  SSR_CHILDREN,
  assessRemote,
  forwardedRemoteArgs,
  forwardedViewportArgs,
  isRemoteUrl,
  plannedChildren,
} from "../qa/tools/lib/remote-budget.mjs";

const PREVIEW = "https://orpheus-app-git-feat-x.vercel.app";
const PROD = "https://orpheus-app-beta.vercel.app";
const PUBLIC = "https://example.com";
const NO_GROK = new URL("../qa/tools/no-grok.mjs", import.meta.url).href;
const out = mkdtempSync(join(tmpdir(), "qa-remote-budget-"));
const PRELOAD = join(process.cwd(), "scripts/fixtures/fake-net.mjs");

function exitThrow(code) {
  throw Object.assign(new Error(`exit ${code}`), { exitCode: code });
}

function run(tool, args) {
  const dir = mkdtempSync(join(tmpdir(), "qarb-"));
  const log = join(dir, "requests.log");
  writeFileSync(log, "");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, FAKE_LOG: log, NODE_OPTIONS: `--import ${PRELOAD}` };
  const r = spawnSync(process.execPath, [tool, ...args, "--out", dir], { encoding: "utf8", env, timeout: 60_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, requests: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("RB-01 a preview, production and any other public host are remote; loopback is not", () => {
  for (const url of [PREVIEW, PROD, PUBLIC, "https://EXAMPLE.com/x", "not a url"]) assert.equal(isRemoteUrl(url), true, url);
  for (const url of [null, "", "http://127.0.0.1:4173/", "http://localhost:8080/", "http://[::1]:9/"]) assert.equal(isRemoteUrl(url), false, String(url));
});

test("RB-02 preview, prod and example.com refuse without --release: exit 2, estimate first, zero requests", () => {
  for (const [tool, url] of [
    ["qa/tools/no-grok.mjs", PREVIEW],
    ["qa/tools/no-grok.mjs", PROD],
    ["qa/tools/run.mjs", PROD],
    ["qa/tools/no-grok.mjs", PUBLIC],
  ]) {
    const r = run(tool, ["--base-url", url]);
    assert.equal(r.status, 2, `${tool} ${url}: ${r.out}`);
    assert.match(r.out, /^CDN estimate: /m, r.out);
    assert.match(r.out, new RegExp(`^REFUSED ${tool.split("/").pop().replace(".mjs", "")}: remote host .+ needs --release`, "m"));
    assert.ok(r.out.indexOf("CDN estimate:") < r.out.indexOf("REFUSED "), tool);
    assert.deepEqual(r.requests, [], `${tool} ${url}`);
  }
});

test("RB-03 127.0.0.1 and localhost are allowed and do not count as a remote run", () => {
  let started = 0;
  const logs = [];
  const c = qaConfig(NO_GROK, ["--base-url", "http://127.0.0.1:4173"], { QA_OUT_DIR: out }, {
    start: () => { started++; return { url: LOCAL_BASE_URL }; },
    exit: exitThrow,
    log: (line) => logs.push(line),
  });
  assert.equal(c.baseUrl, "http://127.0.0.1:4173");
  assert.equal(started, 0, "an explicit local URL does not start the default server");
  assert.deepEqual(logs, [LOCAL_ESTIMATE_LINE]);
  const local = assessRemote({ script: "no-grok", baseUrl: "http://localhost:9", argv: [], env: {} });
  assert.equal(local.action, "allow");
  assert.equal(local.line, LOCAL_ESTIMATE_LINE);
});

test("RB-04 QA_BASE_URL pointing at a remote host refuses and does not start the local server", () => {
  let started = 0;
  assert.throws(() => qaConfig(NO_GROK, [], { QA_OUT_DIR: out, QA_BASE_URL: "https://x.vercel.app" }, {
    start: () => { started++; return { url: LOCAL_BASE_URL }; },
    exit: exitThrow,
    log: () => {},
  }), (err) => err.exitCode === 2);
  assert.equal(started, 0);
});

test("RB-05 budget: equal to the estimate is allowed, one under refuses, --allow-over-budget and --budget=N override, a bad value exits 2", () => {
  assert.equal(DEFAULT_BUDGET, 10000);
  const base = { script: "no-grok", baseUrl: PUBLIC, env: {} };
  const open = assessRemote({ ...base, argv: ["--release"] });
  assert.equal(open.action, "allow");
  assert.ok(open.total > 0 && open.total < DEFAULT_BUDGET, open.total);
  assert.equal(assessRemote({ ...base, argv: ["--release", `--budget=${open.total}`] }).action, "allow");
  assert.equal(assessRemote({ ...base, argv: ["--release", `--budget=${open.total - 1}`] }).action, "refuse");
  assert.match(assessRemote({ ...base, argv: ["--release", `--budget=${open.total - 1}`] }).refusal, /over the budget/);
  assert.equal(assessRemote({ ...base, argv: ["--release", `--budget=${open.total - 1}`, "--allow-over-budget"] }).action, "allow");
  assert.equal(assessRemote({ ...base, argv: ["--release", "--budget", String(open.total)] }).action, "allow");
  for (const raw of ["nope", "0", "01", "-5"]) {
    const bad = assessRemote({ ...base, argv: ["--release", `--budget=${raw}`] });
    assert.equal(bad.action, "refuse", raw);
    assert.match(bad.refusal, /positive integer/);
    assert.match(bad.line, /budget invalid/);
  }
});

test("RB-06 site-style-regression sums its children before any of them start", () => {
  assert.deepEqual(plannedChildren("site-style-regression", ["--release"], {}).map((c) => c.script), SSR_CHILDREN);
  assert.deepEqual(plannedChildren("site-style-regression", ["--own-only"], {}), []);
  const full = assessRemote({ script: "site-style-regression", baseUrl: PUBLIC, argv: ["--release"], env: {} });
  const own = 4 * 2 * 3 * 20 + 6;
  const children = {
    "site-shell": 4 * 2 * 2 * 20,
    "home-page": 1 * 2 * 2 * 20,
    "calculator-page": 1 * 2 * 2 * 20,
    "saved-searches": 1 * 2 * 1 * 20,
    signin: 1 * 2 * 2 * 20,
    "personal-finance": 1 * 2 * 2 * 20,
    site: 6 * 2 * 1 * 20,
    "pf-stale-reload": 3 * 2 * 1 * 20,
    "release-smoke": 16,
  };
  const sum = own + Object.values(children).reduce((s, n) => s + n, 0);
  assert.equal(sum, 1542);
  assert.equal(full.total, 1542);
  assert.match(full.line, /^CDN estimate: 1542 /);
  assert.equal(assessRemote({ script: "site-style-regression", baseUrl: PUBLIC, argv: ["--release", "--own-only"], env: {} }).total, own);
  const dash = plannedChildren("dashboard-redesign", ["--release", "--smoke", "preview"], { QA_EMAIL: "a@example.com", QA_PASSWORD: "x" }).map((c) => c.script);
  assert.deepEqual(dash, ["site", "dashboard-leaveouts", "dashboard-list", "dashboard-add", "dashboard-metrics", "dashboard-book", "release-smoke"]);
  assert.deepEqual(plannedChildren("dashboard-redesign", ["--empty"], { QA_EMAIL: "a@example.com", QA_PASSWORD: "x", QA_EMPTY_EMAIL: "e@example.com", QA_EMPTY_PASSWORD: "y" }).map((c) => c.script), ["site", "dashboard-leaveouts", "dashboard-list", "dashboard-book", "dashboard-leaveouts", "dashboard-list"]);
  const src = readFileSync("qa/tools/site-style-regression.mjs", "utf8");
  assert.match(src, /forwardedRemoteArgs\(argv\)/);
  assert.doesNotMatch(src, /refuseFullOnProd/);
  assert.match(readFileSync("qa/tools/dashboard-redesign.mjs", "utf8"), /forwardedRemoteArgs\(process\.argv\.slice\(2\)\)/);
  assert.deepEqual(forwardedRemoteArgs(["--release", "--budget", "50", "--allow-over-budget", "--budget-only", "--viewports=phone"]), ["--release", "--allow-over-budget", "--budget=50"]);
});

test("RB-12 forwarded --viewports and CLS_RUNS shrink argv-profile children only", () => {
  assert.deepEqual(forwardedViewportArgs([]), []);
  assert.deepEqual(forwardedViewportArgs(["--viewports=desktop"]), ["--viewports=desktop"]);
  assert.deepEqual(forwardedViewportArgs(["--viewports", "desktop"]), ["--viewports=desktop"]);
  assert.deepEqual(forwardedViewportArgs(["--viewports=phone", "--viewports", "desktop"]), ["--viewports=desktop"]);
  assert.deepEqual(forwardedRemoteArgs(["--release", "--viewports=desktop"]), ["--release"]);
  const narrowed = assessRemote({
    script: "site-style-regression",
    baseUrl: PUBLIC,
    argv: ["--release", "--viewports=desktop"],
    env: { CLS_RUNS: "1" },
  });
  const piece = (name) => narrowed.pieces.find((p) => p.label === name);
  assert.equal(narrowed.total, 822);
  assert.equal(piece("home-page").viewports, 1);
  assert.equal(piece("home-page").runs, 1);
  assert.equal(piece("site-shell").viewports, 1);
  assert.equal(piece("site-shell").runs, 2);
  assert.equal(piece("site").viewports, 2);
  assert.equal(piece("site").total, 240);
  assert.equal(piece("pf-stale-reload").viewports, 2);
  assert.equal(piece("pf-stale-reload").total, 120);
  assert.equal(piece("release-smoke").calls, 16);
  assert.equal(piece("release-smoke").total, 16);
  const src = readFileSync("qa/tools/site-style-regression.mjs", "utf8");
  assert.match(src, /const viewportArgs = forwardedViewportArgs\(argv\)/);
  assert.equal((src.match(/\.\.\.childArgs/g) ?? []).length, 9);
  assert.match(src, /env:\s*process\.env/);
  assert.doesNotMatch(readFileSync("qa/tools/dashboard-redesign.mjs", "utf8"), /forwardedViewportArgs/);
  const smoke = run("scripts/release-smoke.mjs", ["http://127.0.0.1:9", "preview", "--budget-only", "--viewports=desktop"]);
  assert.equal(smoke.status, 0, smoke.out);
  assert.ok(smoke.out.split("\n").includes(LOCAL_ESTIMATE_LINE), smoke.out);
  assert.deepEqual(smoke.requests, []);
});

test("RB-13 site-style children match the spawn list; 1542 stays; 1800 is not the formula", () => {
  const nine = [...SSR_CHILDREN];
  const spawned = [...readFileSync("qa/tools/site-style-regression.mjs", "utf8").matchAll(/runTool\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(spawned, nine);
  for (const argv of [["--release"], ["--release", "--viewports=desktop"], ["--release", "--read-only"], ["--release", "--smoke", "preview"], ["--release", "--smoke-mode", "on"]]) {
    for (const env of [{}, { QA_EMAIL: "a@example.com", QA_PASSWORD: "x", CLS_RUNS: "1" }]) {
      assert.deepEqual(plannedChildren("site-style-regression", argv, env).map((c) => c.script), nine);
    }
  }
  assert.deepEqual(plannedChildren("site-style-regression", ["--own-only"], { QA_EMAIL: "a@example.com" }), []);
  const piece = (decision, name) => decision.pieces.find((p) => p.label === name);
  const defaults = assessRemote({ script: "site-style-regression", baseUrl: PUBLIC, argv: ["--release"], env: {} });
  const desktop = assessRemote({ script: "site-style-regression", baseUrl: PUBLIC, argv: ["--release", "--viewports=desktop"], env: { CLS_RUNS: "1" } });
  const expectDefault = {
    "site-style-regression": 486,
    "site-shell": 320,
    "home-page": 80,
    "calculator-page": 80,
    "saved-searches": 40,
    "signin-page": 80,
    "personal-finance": 80,
    site: 240,
    "pf-stale-reload": 120,
    "release-smoke": 16,
  };
  const expectDesktop = {
    "site-style-regression": 166,
    "site-shell": 160,
    "home-page": 20,
    "calculator-page": 20,
    "saved-searches": 20,
    "signin-page": 40,
    "personal-finance": 20,
    site: 240,
    "pf-stale-reload": 120,
    "release-smoke": 16,
  };
  assert.equal(defaults.total, 1542);
  assert.equal(desktop.total, 822);
  for (const [name, total] of Object.entries(expectDefault)) assert.equal(piece(defaults, name).total, total, name);
  for (const [name, total] of Object.entries(expectDesktop)) assert.equal(piece(desktop, name).total, total, name);
  const childSum = (decision) => decision.pieces.filter((p) => p.label !== "site-style-regression").reduce((s, p) => s + p.total, 0);
  assert.equal(childSum(defaults), 1056);
  assert.equal(childSum(desktop), 656);
  assert.notEqual(childSum(desktop), 1800);
  assert.notEqual(childSum(desktop) - 16, 1800);
});

test("RB-07 release-smoke refuses a remote host before any GET, and --budget-only exits 0", () => {
  const refused = run("scripts/release-smoke.mjs", [PROD, "on"]);
  assert.equal(refused.status, 2, refused.out);
  assert.match(refused.out, /^REFUSED release-smoke: remote host orpheus-app-beta.vercel.app needs --release/m);
  assert.deepEqual(refused.requests, []);
  const dry = run("scripts/release-smoke.mjs", ["http://127.0.0.1:9", "on", "--budget-only"]);
  assert.equal(dry.status, 0, dry.out);
  assert.ok(dry.out.split("\n").includes(LOCAL_ESTIMATE_LINE), dry.out);
  assert.doesNotMatch(dry.out, /PASS|FAIL/);
  assert.deepEqual(dry.requests, []);
});

test("RB-08 fetch.py counts only /api/chart, refuses with no default, and does not call urlopen", () => {
  const py = `
import importlib.util, os, urllib.request
os.environ.pop("QA_BASE_URL", None)
spec = importlib.util.spec_from_file_location("fetch", "qa/tools/fetch.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
calls = []
def urlopen(req, timeout=30):
    calls.append(getattr(req, "full_url", str(req)))
    raise RuntimeError("network")
urllib.request.urlopen = urlopen
def run(argv):
    calls.clear()
    rc = mod.main(argv)
    print("RC", rc)
    print("CALLS", len(calls))
run([])
run(["--base-url", "https://example.com"])
run(["--base-url", "https://example.com", "--budget-only"])
run(["--base-url", "http://127.0.0.1:9", "--budget-only"])
code, lines = mod.decide("https://example.com", 2, True, False, None, False)
print("ALLOW", code, lines[0])
code, lines = mod.decide("https://example.com", 2, True, False, "1", False)
print("OVER", code)
code, lines = mod.decide("https://example.com", 2, True, True, "1", False)
print("FORCE", code)
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const text = r.stdout;
  assert.match(text, /No default production URL/);
  assert.match(text, /REFUSED fetch\.py: remote host example.com needs --release/);
  assert.match(text, /CDN estimate: 2 \(2 calls × 1\)/);
  assert.match(text, /CDN estimate: 0 \(local\)/);
  assert.doesNotMatch(text, /yahoo|stooq/i);
  const rcs = [...text.matchAll(/^RC (\d+)$/gm)].map((m) => m[1]);
  const calls = [...text.matchAll(/^CALLS (\d+)$/gm)].map((m) => m[1]);
  assert.deepEqual(rcs, ["2", "2", "0", "0"]);
  assert.deepEqual(calls, ["0", "0", "0", "0"]);
  assert.match(text, /ALLOW 0 CDN estimate: 2/);
  assert.match(text, /OVER 2/);
  assert.match(text, /FORCE 0/);
});

test("RB-09 --compare-url and --preview-url are gated and estimated", () => {
  const compare = assessRemote({ script: "site-shell", baseUrl: "http://127.0.0.1:9", compareUrl: PUBLIC, argv: [], env: {} });
  assert.equal(compare.action, "refuse");
  assert.equal(compare.total, 4 * 2 * 2 * 20, "the compare host is one copy of the page estimate");
  const both = assessRemote({ script: "site-shell", baseUrl: PUBLIC, compareUrl: "https://other.example", argv: ["--release"], env: {} });
  assert.equal(both.total, 4 * 2 * 2 * 20 * 2);
  const preview = assessRemote({ script: "robots-txt", baseUrl: "http://127.0.0.1:9", previewUrl: PREVIEW, argv: [], env: {} });
  assert.equal(preview.action, "refuse");
  assert.equal(preview.total, 2);
  const shell = run("qa/tools/site-shell.mjs", ["--base-url", "http://127.0.0.1:9", "--compare-url", PUBLIC]);
  assert.equal(shell.status, 2, shell.out);
  assert.deepEqual(shell.requests, []);
  const robots = run("qa/tools/robots-txt.mjs", ["--base-url", "http://127.0.0.1:9", "--preview-url", PREVIEW]);
  assert.equal(robots.status, 2, robots.out);
  assert.match(robots.out, /needs --release/);
  assert.deepEqual(robots.requests, []);
});

test("RB-10 --budget-only prints the estimate and exits 0 before any request and before startLocal", () => {
  let started = 0;
  const logs = [];
  assert.throws(() => qaConfig(NO_GROK, ["--budget-only"], { QA_OUT_DIR: out }, {
    start: () => { started++; return { url: LOCAL_BASE_URL }; },
    exit: exitThrow,
    log: (line) => logs.push(line),
  }), (err) => err.exitCode === 0);
  assert.equal(started, 0);
  assert.deepEqual(logs, [LOCAL_ESTIMATE_LINE]);
  const remote = run("qa/tools/no-grok.mjs", ["--budget-only", "--base-url", PUBLIC]);
  assert.equal(remote.status, 0, remote.out);
  assert.match(remote.out, /^CDN estimate: /m);
  assert.doesNotMatch(remote.out, /^REFUSED /m);
  assert.deepEqual(remote.requests, []);
  const ssr = run("qa/tools/site-style-regression.mjs", ["--budget-only", "--base-url", PUBLIC]);
  assert.equal(ssr.status, 0, ssr.out.slice(0, 500));
  assert.match(ssr.out, /^CDN estimate: 1542 /m);
  assert.deepEqual(ssr.requests, []);
});

test("RB-11 every qaConfig entry point has a profile, and the default cap is 10000", () => {
  const callers = readdirSync("qa/tools").filter((f) => f.endsWith(".mjs") && /qaConfig\(import\.meta\.url\)/.test(readFileSync(join("qa/tools", f), "utf8")));
  assert.ok(callers.length >= 30);
  for (const f of callers) assert.ok(PROFILES[f.replace(/\.mjs$/, "")], f);
  assert.ok(PROFILES["release-smoke"]);
  assert.equal(DEFAULT_BUDGET, 10000);
});
