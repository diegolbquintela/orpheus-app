// #320: QA runs locally by default (qa/tools/lib/base-url.mjs, lib/viewports.mjs, lib/local-headers.mjs,
// refuseFullOnProd in prod-guard.mjs). No build, no server, no network: starters and fetch are fakes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_BASE_URL, qaConfig } from "../qa/tools/config.mjs";
import { childEnv, LOCAL_BASE_URL, localCommands, PROD_BASE_URL, resolveTarget, startLocal } from "../qa/tools/lib/base-url.mjs";
import { DEFAULT_VIEWPORTS, DEFAULT_WIDTHS, pickViewports, viewportsFromArgv } from "../qa/tools/lib/viewports.mjs";
import { headersApply, headerSkip, headerSkips } from "../qa/tools/lib/local-headers.mjs";
import { RELEASE_WARNING } from "../qa/tools/prod-guard.mjs";

const out = mkdtempSync(join(tmpdir(), "qa-base-url-"));
const URL_ = new URL("../qa/tools/no-grok.mjs", import.meta.url).href;

test("LQ-01 the default target is local (127.0.0.1:4173), never production", () => {
  assert.equal(DEFAULT_BASE_URL, "http://127.0.0.1:4173");
  assert.equal(LOCAL_BASE_URL, DEFAULT_BASE_URL);
  assert.notEqual(new URL(DEFAULT_BASE_URL).hostname, new URL(PROD_BASE_URL).hostname);
  assert.deepEqual(resolveTarget([], {}), { target: "local", url: null, from: "default (local)" });
  let started = 0;
  const c = qaConfig(URL_, [], { QA_OUT_DIR: out }, { start: () => (started++, { url: LOCAL_BASE_URL }) });
  assert.equal(started, 1, "the default starts the local server");
  assert.deepEqual([c.baseUrl, c.baseFrom, c.target], [LOCAL_BASE_URL, "default", "local"]);
});

test("LQ-02 --target=preview|prod are explicit opt-ins; --base-url and QA_BASE_URL start nothing", () => {
  const none = () => assert.fail("must not start a local server");
  assert.equal(qaConfig(URL_, ["--target=prod"], { QA_OUT_DIR: out }, { start: none }).baseUrl, PROD_BASE_URL);
  assert.equal(qaConfig(URL_, ["--target=preview", "--base-url", "https://p.example"], { QA_OUT_DIR: out }, { start: none }).target, "preview");
  assert.equal(qaConfig(URL_, [], { QA_OUT_DIR: out, QA_BASE_URL: "https://env.example" }, { start: none }).baseUrl, "https://env.example");
  assert.equal(qaConfig(URL_, ["--base-url=http://127.0.0.1:4173", "--target=local"], { QA_OUT_DIR: out }, { start: none }).target, "local");
  assert.throws(() => resolveTarget(["--target=preview"], {}), /needs --base-url/);
  assert.throws(() => resolveTarget(["--target", "staging"], {}), /unknown staging/);
});

test("LQ-03 local commands: npx vite build then vite preview --port 4173 --strictPort; never npm run build or db:migrate", () => {
  const cmds = localCommands();
  assert.deepEqual(cmds, [["npx", ["vite", "build"]], ["npx", ["vite", "preview", "--port", "4173", "--strictPort", "--host", "127.0.0.1"]]]);
  assert.deepEqual(localCommands({ mode: "dev" }), [["npx", ["vite", "dev", "--port", "4173", "--strictPort", "--host", "127.0.0.1"]]]);
  assert.deepEqual(localCommands({ build: false }).map(([, a]) => a[1]), ["preview"]);
  const src = readFileSync("qa/tools/lib/base-url.mjs", "utf8");
  for (const bad of [/["']npm["']/, /["']run["']\s*,\s*["']build["']/, /db:migrate["']/, /migrate\.mjs/]) assert.doesNotMatch(src.replace(/^\/\/.*$/gm, ""), bad);
});

test("LQ-04 the server children get no DATABASE_URL* / POSTGRES* var; everything else passes through", () => {
  const env = { PATH: "/bin", HOME: "/h", DATABASE_URL: "x", DATABASE_URL_UNPOOLED: "y", POSTGRES_URL: "z", POSTGRES_PRISMA_URL: "w", QA_OUT_DIR: "/o" };
  assert.deepEqual(childEnv(env), { PATH: "/bin", HOME: "/h", QA_OUT_DIR: "/o" });
  const calls = [];
  const fakeSync = (cmd, args, o) => (calls.push({ cmd, args, env: o.env }), { status: 0 });
  const fakeSpawn = (cmd, args, o) => (calls.push({ cmd, args, env: o.env, detached: o.detached }), { pid: 999999, kill() {} });
  let onExit;
  const r = startLocal({ argv: [], env, spawnImpl: fakeSpawn, spawnSyncImpl: fakeSync, onExit: (fn) => (onExit = fn), log: () => {} });
  assert.equal(r.url, LOCAL_BASE_URL);
  assert.deepEqual(calls.map((c) => [c.cmd, ...c.args.slice(0, 2)]).slice(0, 2), [["npx", "vite", "build"], ["npx", "vite", "preview"]]);
  assert.equal(calls[1].detached, true, "own process group, so the kill takes the whole server");
  assert.equal(calls[2].cmd, process.execPath, "the readiness poll runs fetch in a child");
  for (const c of calls) assert.deepEqual(Object.keys(c.env).filter((k) => /^(DATABASE_URL|POSTGRES)/.test(k)), [], `${c.cmd} ${c.args[0]}`);
  assert.equal(typeof onExit, "function", "the server is killed when the tool exits");
  // a failed build stops before any server starts
  const calls2 = [];
  assert.throws(() => startLocal({ argv: [], env, spawnImpl: () => assert.fail("no server after a failed build"), spawnSyncImpl: (c, a) => (calls2.push(a[1]), { status: 1 }), onExit: () => {}, log: () => {} }), /vite build failed/);
  assert.deepEqual(calls2, ["build"]);
});

test("LQ-05 viewports: 390 + 1440 by default; 360 / 400 / 768 / 1024 opt-in only", () => {
  assert.deepEqual(DEFAULT_WIDTHS, [390, 1440]);
  assert.deepEqual(viewportsFromArgv([]).map(([, v]) => v.width), [390, 1440]);
  assert.deepEqual(viewportsFromArgv(["--viewports=360,768,wide,phone400"]).map(([, v]) => v.width), [360, 400, 768, 1024]);
  assert.deepEqual(viewportsFromArgv(["--viewports", "phone,desktop,1024"]).map(([n]) => n), ["phone", "wide", "desktop"]);
  assert.throws(() => pickViewports("phone,1280"), /unknown viewport\(s\) 1280/);
  assert.equal(DEFAULT_VIEWPORTS[0][2], true, "390 is a touch phone");
});

test("LQ-06 no QA tool keeps a full viewport matrix or a 360 / 400 / 768 / 1024 default list", () => {
  const dir = "qa/tools";
  const legacy = new Set(["run.mjs", "full.mjs", "pr3.mjs", "pr3-mobile-cue.mjs", "site.mjs", "sidebyside.mjs", "c5live.mjs"]); // EL #320 Q6
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".mjs") && !legacy.has(x))) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(src, /^\s*\["\w+", \{ width: (360|400|768|1024), height: \d+ \}/m, `${f}: a matrix row with an opt-in width (use lib/viewports.mjs)`);
    assert.doesNotMatch(src, /HBM_WIDTHS = \[/, f);
    assert.doesNotMatch(src, /of \[\[?"?\w*"?,? ?\{ width: (360|400)/, `${f}: an inline matrix with an opt-in width`);
  }
  assert.match(readFileSync("qa/tools/dashboard-redesign.mjs", "utf8"), /QA_VIEWPORTS \?\? "phone,desktop"/);
});

test("LQ-07 browser cache on: no tool disables the HTTP cache; CLS defaults to 2 loads (1 cold + 1 warm)", () => {
  for (const f of readdirSync("qa/tools").filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(join("qa/tools", f), "utf8");
    assert.doesNotMatch(src, /setCacheDisabled|cacheDisabled: true/, f);
    for (const m of src.matchAll(/CLS_RUNS \?\? (\d+)/g)) assert.equal(m[1], "2", `${f}: CLS_RUNS default`);
  }
  for (const f of ["home-page.mjs", "calculator-page.mjs"]) assert.match(readFileSync(join("qa/tools", f), "utf8"), /if \(i === 0\) \{\n\s*warm\.browser = await chromium\.launch\(\);/, `${f}: one browser per width, reused for the warm load`);
  assert.match(readFileSync("qa/tools/site-style-regression.mjs", "utf8"), /const clsCtx = await browser\.newContext\(/);
});

// Run site-style-regression under the fake network (no real traffic), as qa-prod-guard.test.mjs does.
const PRELOAD = join(process.cwd(), "scripts/fixtures/fake-net.mjs");
function runSsr(args) {
  const dir = mkdtempSync(join(tmpdir(), "qa-ssr-"));
  const log = join(dir, "requests.log");
  writeFileSync(log, "");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, FAKE_LOG: log, NODE_OPTIONS: `--import ${PRELOAD}` };
  const r = spawnSync(process.execPath, ["qa/tools/site-style-regression.mjs", ...args, "--out", dir], { encoding: "utf8", env, timeout: 60_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, requests: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("LQ-08 site-style-regression refuses production without --release: exit 2, zero requests", () => {
  for (const args of [["--base-url", PROD_BASE_URL], ["--target=prod"]]) {
    const r = runSsr(args);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /^REFUSED site-style-regression: full site-style regression on production/m);
    assert.deepEqual(r.requests, [], "a static prod host makes no request");
    assert.doesNotMatch(r.out, new RegExp(RELEASE_WARNING.slice(0, 20)));
  }
});

test("LQ-09 --release lets it run on production, with the warning line first", () => {
  const r = runSsr(["--base-url", PROD_BASE_URL, "--release", "--own-only"]);
  assert.doesNotMatch(r.out, /^REFUSED /m, r.out.slice(0, 400));
  assert.ok(r.out.includes(RELEASE_WARNING), r.out.slice(0, 400));
  assert.ok(r.requests.some((l) => l.startsWith("GET ")), "it ran");
});

test("LQ-10 local header checks are SKIPPED (NOT A PASS), counted, and only on the local target", () => {
  assert.equal(headersApply({ target: "local" }), false);
  assert.equal(headersApply("local"), false);
  for (const t of ["url", "preview", "prod", undefined]) assert.equal(headersApply({ target: t }), true, String(t));
  const lines = [];
  const before = headerSkips();
  headerSkip("ST3-04 X-Robots-Tag on /", (l) => lines.push(l));
  assert.equal(headerSkips(), before + 1);
  assert.match(lines[0], /^SKIPPED \(NOT A PASS\): ST3-04 X-Robots-Tag on \/ \(local server: vite preview/);
  for (const f of ["home-page.mjs", "signin-page.mjs", "no-grok.mjs", "robots-txt.mjs"]) assert.match(readFileSync(join("qa/tools", f), "utf8"), /headerSkips\(\) \? 3 : 0\)/, `${f}: a header skip exits 3`);
  assert.match(readFileSync("qa/tools/site-shell.mjs", "utf8"), /hbmSkipped \|\| headerSkips\(\) \? 3 : 0/);
  assert.match(readFileSync("qa/tools/site-style-regression.mjs", "utf8"), /const local = CFG\.target === "local" \? \["--target=local"\] : \[\];/);
});
