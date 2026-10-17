// #157 (QA's #174 note 1; QA run 2026-10-17 F2 / F7, EL option 1): every QA tool that signs in refuses production when
// any sign-in / write env is set, and otherwise runs in signed-out prod mode (no sign-in, no writes). No test here sends
// real traffic: spawned tools run under scripts/fixtures/fake-net.mjs (node networking refused, fetch answered locally,
// playwright replaced by a recording fake; children inherit it through NODE_OPTIONS), which logs every attempt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credentialVars, prodReason, staticProdReason, PROD_ALIAS, SIGNED_OUT_PROD_LINE } from "../qa/tools/prod-guard.mjs";

// Every QA tool that signs in (reads a *_PASSWORD from env), enumerated, not listed by hand (QA run 2026-10-17 F2, EL).
const TOOLS = readdirSync("qa/tools").filter((f) => f.endsWith(".mjs") && f !== "session.mjs" && f !== "prod-guard.mjs" && readFileSync(`qa/tools/${f}`, "utf8").includes("_PASSWORD")).sort();
const stub = (env, calls = []) => async (url, init) => {
  calls.push([url, init]);
  return { headers: new Headers(env === null ? {} : { "x-orpheus-env": env }) };
};

test("static: the prod alias and production-branch hosts refuse without a request; previews and local pass step 1", () => {
  for (const u of [PROD_ALIAS, `${PROD_ALIAS}/`, "https://ORPHEUS-APP-BETA.vercel.app/finance", "https://orpheus-app-git-main-diegolbquintelas-projects.vercel.app"])
    assert.match(staticProdReason(u), /production host/, u);
  assert.match(staticProdReason("not a url"), /not a URL/);
  for (const u of ["https://orpheus-app-git-feat-x-diegolbquintelas-projects.vercel.app", "http://localhost:3000"]) assert.equal(staticProdReason(u), null, u);
});

test("probe: production or a missing header refuses; preview / local pass; one HEAD, no redirects", async () => {
  const p = "https://orpheus-abc123-diegolbquintelas-projects.vercel.app/x";
  const calls = [];
  assert.match(await prodReason(p, stub("production", calls)), /production/);
  assert.deepEqual(calls, [["https://orpheus-abc123-diegolbquintelas-projects.vercel.app/", { method: "HEAD", redirect: "manual" }]]);
  assert.match(await prodReason(p, stub(null)), /can't confirm a preview/);
  assert.match(await prodReason(p, async () => { throw new Error("offline"); }), /could not check/);
  assert.equal(await prodReason(p, stub("preview")), null);
  const none = [];
  assert.equal(await prodReason("http://localhost:3000", stub(null, none)), null);
  assert.match(await prodReason(PROD_ALIAS, stub("preview", none)), /production host/);
  assert.equal(none.length, 0, "local and static refusals make no request");
});

test("the enumerated sign-in tools are the 19 known ones (a new sign-in tool lands here automatically)", () => {
  assert.deepEqual(TOOLS, ["audit.mjs", "dashboard-add.mjs", "dashboard-book.mjs", "dashboard-company.mjs", "dashboard-leaveouts.mjs", "dashboard-list.mjs", "dashboard-metrics.mjs", "dashboard-redesign.mjs", "personal-finance-e2e.mjs", "personal-finance.mjs", "pf-chart-api.mjs", "pf-export-api.mjs", "pf-months.mjs", "pf-report-api.mjs", "pf-reports-api.mjs", "pf-series-api.mjs", "roles.mjs", "site-shell.mjs", "site-style-regression.mjs"]);
});

const PRELOAD = join(process.cwd(), "scripts/fixtures/fake-net.mjs");
const CREDS = { QA_EMAIL: "x@example.com", QA_PASSWORD: "unused", QA_OWNER_EMAIL: "x@example.com", QA_OWNER_PASSWORD: "unused", QA_PM_EMAIL: "x@example.com", QA_PM_PASSWORD: "unused" };
// Run a tool under the fake network with a clean env (+ extra), return its exit status, stdout and attempted requests.
function run(tool, args, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "prodguard-"));
  const log = join(dir, "requests.log");
  writeFileSync(log, "");
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, FAKE_LOG: log, NODE_OPTIONS: `--import ${PRELOAD}`, ...extra };
  const r = spawnSync(process.execPath, [`qa/tools/${tool}`, ...args, "--out", dir], { encoding: "utf8", env, timeout: 60_000 });
  const requests = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { status: r.status, out: `${r.stdout}${r.stderr}`, requests };
}
const writesOrAuth = (requests) => requests.filter((l) => /^(POST|PUT|DELETE|PATCH|NET) /.test(l) || l.includes("/api/auth/"));

test("credentialVars: the sign-in variables the tools read (non-empty), or QA_WRITE; nothing else", () => {
  assert.deepEqual(credentialVars({ QA_EMAIL: "a", QA_PM_PASSWORD: "b", ORPHEUS_OWNER_EMAIL: "c", QA_WRITE: "1", QA_NONE_EMAIL: "", PATH: "/bin" }), ["ORPHEUS_OWNER_EMAIL", "QA_EMAIL", "QA_PM_PASSWORD", "QA_WRITE"]);
  assert.deepEqual(credentialVars({ PATH: "/bin", AXE_PATH: "x", SOME_APP_PASSWORD: "y", OWNER_EMAIL: "z" }), []);
  // every *_EMAIL / *_PASSWORD name a tool mentions is covered
  const names = new Set(TOOLS.flatMap((t) => readFileSync(`qa/tools/${t}`, "utf8").match(/\b(QA_\w*(EMAIL|PASSWORD)|ORPHEUS_OWNER_EMAIL)\b/g) ?? []));
  assert.ok(names.size >= 10);
  for (const n of names) assert.deepEqual(credentialVars({ [n]: "x" }), [n], n);
});

test("F7 (2): with credentials, every sign-in tool refuses the prod alias: exit 2, REFUSED, zero traffic", () => {
  for (const t of TOOLS) {
    const r = run(t, ["--base-url", PROD_ALIAS], CREDS);
    assert.equal(r.status, 2, `${t}: ${r.out}`);
    assert.match(r.out, new RegExp(`^REFUSED ${t.replace(".mjs", "")}: `, "m"), t);
    assert.deepEqual(r.requests, [], `${t}: no request at all`);
    assert.doesNotMatch(r.out, new RegExp(SIGNED_OUT_PROD_LINE.replace(/[()]/g, "\\$&")), t);
  }
});

test("F7 (3): QA_WRITE alone (no credentials) is refused on prod too, with zero traffic", () => {
  for (const t of ["pf-reports-api.mjs", "site-shell.mjs", "personal-finance.mjs"]) {
    const r = run(t, ["--base-url", PROD_ALIAS], { QA_WRITE: "1" });
    assert.equal(r.status, 2, `${t}: ${r.out}`);
    assert.match(r.out, /^REFUSED .*\(QA_WRITE\)/m, t);
    assert.deepEqual(r.requests, [], t);
  }
});

test("F7 (1): with no credentials, every sign-in tool runs signed out on the prod alias: prints the mode, never signs in or writes", () => {
  for (const t of TOOLS) {
    const r = run(t, ["--base-url", PROD_ALIAS]);
    const lines = r.out.split("\n");
    assert.equal(lines.filter((l) => l === SIGNED_OUT_PROD_LINE).length, 1, `${t}: prints exactly '${SIGNED_OUT_PROD_LINE}'\n${r.out.slice(0, 400)}`);
    assert.doesNotMatch(r.out, /^REFUSED /m, t);
    assert.deepEqual(writesOrAuth(r.requests), [], `${t}: no sign-in, no write, no raw socket`);
    assert.doesNotMatch(r.out, /BLOCKED /, `${t}: skipped by mode, not caught by the safety net`);
    assert.ok(r.requests.filter((l) => !l.startsWith("CLICK ")).every((l) => l.startsWith("GET https://orpheus-app-beta.vercel.app/") || l.startsWith("HEAD https://orpheus-app-beta.vercel.app/")), `${t}: only GET / HEAD to the (faked) prod host: ${r.requests.join(" | ")}`);
    assert.deepEqual(r.requests.filter((l) => l.startsWith("CLICK") && /submit/.test(l)), [], `${t}: no form submit clicked`);
  }
  // the post-merge signed-out prod check: these really run (they make signed-out GETs)
  for (const t of ["site-shell.mjs", "site-style-regression.mjs", "personal-finance.mjs", "personal-finance-e2e.mjs"]) assert.ok(run(t, ["--base-url", PROD_ALIAS]).requests.some((l) => l.startsWith("GET ")), `${t} ran`);
});

test("F8: no credentials, prod alias: site-style-regression and every child it spawns (signin-page included) send no POST to /api/auth/, no non-GET / HEAD, no submit", () => {
  const r = run("site-style-regression.mjs", ["--base-url", PROD_ALIAS]);
  const outDir = /out (\S+)/.exec(r.out)?.[1];
  assert.ok(outDir, r.out.slice(0, 300));
  const childLog = (name) => readFileSync(join(outDir, `${name}.log`), "utf8");
  for (const child of ["site-shell", "home-page", "calculator-page", "saved-searches", "signin-page", "personal-finance", "site"])
    assert.ok(childLog(child).split("\n").includes(SIGNED_OUT_PROD_LINE), `${child} ran in signed-out prod mode (marker inherited)`);
  assert.equal(childLog("signin-page").match(/failed sign-in submit SKIPPED \(signed-out prod mode\)/g)?.length, 4, "signin-page: the submit skipped on each of the 4 viewports");
  assert.deepEqual(writesOrAuth(r.requests), [], "no POST / PUT / DELETE / PATCH, no /api/auth/, no raw socket in parent or children");
  assert.deepEqual(r.requests.filter((l) => l.startsWith("CLICK") && /submit/.test(l)), [], "no form submit clicked");
  assert.ok(r.requests.filter((l) => l.startsWith("GET ")).length > 50, "the parent and children really ran (GETs recorded)");
  assert.doesNotMatch(`${r.out}${["signin-page", "site", "home-page"].map(childLog).join("")}`, /BLOCKED /, "skipped by mode, not caught by the backstop");
});

test("F8: the marker is inherited and honoured: a process with ORPHEUS_QA_PROD_MODE=signed-out is in the mode and blocks writes, whatever its target", () => {
  const dir = mkdtempSync(join(tmpdir(), "prodguard-"));
  const probe = join(dir, "probe.mjs");
  writeFileSync(probe, [
    `import { refuseIfProd, signedOutProd } from ${JSON.stringify(join(process.cwd(), "qa/tools/prod-guard.mjs"))};`,
    "console.log('ACTIVE ' + signedOutProd());",
    "const g = await refuseIfProd('http://localhost:9', 'probe');",
    "console.log('GUARD ' + g.signedOutProd);",
    "for (const [m, u] of [['POST', 'https://x.example/api/auth/sign-in/email'], ['GET', 'https://x.example/api/auth/get-session'], ['PUT', 'https://x.example/api/personal-finance'], ['GET', 'https://x.example/']]) {",
    "  try { await fetch(u, { method: m }); console.log('SENT ' + m + ' ' + new URL(u).pathname); } catch (e) { console.log(String(e.message)); }",
    "}",
  ].join("\n"));
  const log = join(dir, "requests.log");
  writeFileSync(log, "");
  const r = spawnSync(process.execPath, [probe], { encoding: "utf8", env: { PATH: process.env.PATH, FAKE_LOG: log, NODE_OPTIONS: `--import ${PRELOAD}`, ORPHEUS_QA_PROD_MODE: "signed-out" } });
  const out = r.stdout.split("\n");
  assert.ok(out.includes("ACTIVE true"), r.stdout + r.stderr);
  assert.ok(out.includes(SIGNED_OUT_PROD_LINE) && out.includes("GUARD true"), r.stdout);
  for (const b of ["BLOCKED POST /api/auth/sign-in/email (signed-out prod mode)", "BLOCKED GET /api/auth/get-session (signed-out prod mode)", "BLOCKED PUT /api/personal-finance (signed-out prod mode)", "SENT GET /"]) assert.ok(out.includes(b), `${b}\n${r.stdout}`);
  assert.deepEqual(readFileSync(log, "utf8").split("\n").filter(Boolean), ["GET https://x.example/"]);
  // and a parent in the mode sets the marker for its children (checked by the site-style-regression test above)
  assert.match(readFileSync("qa/tools/prod-guard.mjs", "utf8"), /process\.env\[PROD_MODE_ENV\] = "signed-out";/);
});

test("the mode line is pinned", () => assert.equal(SIGNED_OUT_PROD_LINE, "signed-out prod mode (prod: signed-out only)"));

test("site-shell also refuses a production --compare-url when credentials are set, before any request", () => {
  const r = run("site-shell.mjs", ["--base-url", "http://localhost:9", "--compare-url", PROD_ALIAS], CREDS);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /^REFUSED site-shell \(--compare-url\): /m);
  assert.deepEqual(r.requests, []);
});

test("source order: refuseIfProd runs before the first direct fetch, browser launch, spawn or sign-in in each tool", () => {
  for (const t of TOOLS) {
    const s = readFileSync(`qa/tools/${t}`, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const guard = s.indexOf("await refuseIfProd(");
    assert.ok(guard > 0, t);
    // Helpers defined above the guard may wrap request.fetch (they only run later); a bare fetch( is a direct request.
    for (const k of [/chromium\.launch\(/, /(?<![.\w])fetch\(/, /^(?!\s*(async )?function).*\bspawn(Sync)?\(/m, /^await eachViewport\(/m]) {
      const at = s.search(k);
      if (at < 0) continue;
      assert.ok(at > guard, `${t}: ${k} at ${at} before the guard at ${guard}`);
    }
  }
});
