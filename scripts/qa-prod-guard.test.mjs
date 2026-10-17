// #157 (QA's #174 note 1): pf-report-api, pf-reports-api and pf-export-api refuse production before any request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prodReason, staticProdReason, PROD_ALIAS } from "../qa/tools/prod-guard.mjs";

// Every QA tool that signs in (reads a *_PASSWORD from env), enumerated, not listed by hand (QA run 2026-10-17 F2, EL).
const TOOLS = readdirSync("qa/tools").filter((f) => f.endsWith(".mjs") && f !== "session.mjs" && readFileSync(`qa/tools/${f}`, "utf8").includes("_PASSWORD")).sort();
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

test("each tool exits 2 with REFUSED for the prod alias, before any request or browser launch", () => {
  const dir = mkdtempSync(join(tmpdir(), "prodguard-"));
  const pre = join(dir, "no-net.mjs");
  // No traffic: fetch, http(s) requests and browser launches all abort the process with exit 9 if reached.
  writeFileSync(pre, [
    "const no = (what) => () => { console.log('NETWORK ' + what); process.exit(9); };",
    "globalThis.fetch = async (u) => no('fetch ' + u)();",
    "import http from 'node:http'; import https from 'node:https'; import net from 'node:net';",
    "http.request = no('http'); https.request = no('https'); http.get = no('http'); https.get = no('https'); net.connect = no('net'); net.createConnection = no('net');",
  ].join("\n"));
  for (const t of TOOLS) {
    const r = spawnSync(process.execPath, ["--import", pre, `qa/tools/${t}`, "--base-url", PROD_ALIAS, "--out", dir], {
      encoding: "utf8",
      env: { ...process.env, QA_EMAIL: "x@example.com", QA_PASSWORD: "unused", QA_WRITE: "1", QA_OWNER_EMAIL: "x@example.com", QA_OWNER_PASSWORD: "unused", QA_PM_EMAIL: "x@example.com", QA_PM_PASSWORD: "unused" },
    });
    assert.equal(r.status, 2, `${t}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, new RegExp(`^REFUSED ${t.replace(".mjs", "")}: `, "m"), t);
    assert.doesNotMatch(r.stdout, /NETWORK|PASS|FAIL/);
  }
});

test("site-shell also refuses a production --compare-url before any request", () => {
  const dir = mkdtempSync(join(tmpdir(), "prodguard-"));
  const pre = join(dir, "no-net.mjs");
  writeFileSync(pre, "globalThis.fetch = async (u) => { console.log('NETWORK ' + u); process.exit(9); };\n");
  const r = spawnSync(process.execPath, ["--import", pre, "qa/tools/site-shell.mjs", "--base-url", "http://localhost:9", "--compare-url", PROD_ALIAS, "--out", dir], { encoding: "utf8" });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /^REFUSED site-shell \(--compare-url\): /m);
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
