// Full redesign regression (#59, epic #53 ticket 6, spec §0.7 DR6-06): one run over tickets 1–5 and the site,
// at phone 400 × 860, wide 1024 × 800 and desktop 1440 × 900.
//
//   QA_EMAIL=… QA_PASSWORD=… node qa/tools/dashboard-redesign.mjs --base-url <url> --out <dir> [--smoke preview|on]
//     [--read-only] [--empty]   (env QA_EMPTY_EMAIL / QA_EMPTY_PASSWORD: an account with no holdings, for --empty)
//
// 1. Site (HTTP + one signed-out browser, no sign-in here): `/`, `/calculator`, `/dashboard/sign-in` 200 with
//    `X-Robots-Tag: noindex, nofollow` and the robots meta; signed-out `/dashboard` → 307 to the sign-in page;
//    `/api/dashboard/status` → `{"dashboard":"enabled"}` (the flag on this deployment); one Vercel Analytics
//    script, page views without query / hash, no request to any other host (no other tracker); the
//    Referrer-Policy header is recorded. Flag off is checked by `npm run check:dashboard-built` (it builds both).
// 2. The existing tools, each with its own --out subfolder, QA_VIEWPORTS=phone,wide,desktop (site.mjs has its
//    own widths): site.mjs (menu, home, footer "Orpheus Wisdom", noindex, the $313,000 calculator case, VOD.L),
//    dashboard-leaveouts (DR6-01..05, DR0-07), dashboard-list (DR2: rows, detail, Edit / Delete shown, never
//    clicked), dashboard-add (DR3: blank cost, Edit fills / clears; writes one holding, QA_ADD_SYMBOL),
//    dashboard-metrics (DR4 + D1 page width + D2 exact name; chip saves restored), dashboard-book (DR5: one
//    total, donut, Other, Book row). --read-only skips the two that write (add, metrics).
// 3. --smoke <mode>: `node scripts/release-smoke.mjs <base> <mode>` (the signed-out matrix, DR0-03).
// The delete guard (one DELETE per click, #38) is pinned by npm test (holdings.dom.test.tsx); no QA tool ever
// clicks Delete. Credentials come from env only and are handed to the child tools, never logged; every
// signed-in tool signs out in a finally (session.mjs). Writes dashboard-redesign.json; exit 1 on any FAIL.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { qaConfig } from "./config.mjs";

const CFG = qaConfig(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const smokeAt = argv.indexOf("--smoke");
const smoke = smokeAt >= 0 ? argv[smokeAt + 1] : null;
const base = CFG.baseUrl;
const R = { base, startedAt: new Date().toISOString(), site: [], tools: [] };
const check = (name, ok, detail) => {
  R.site.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const info = (name, detail) => {
  R.site.push({ name, ok: true, info: true, detail });
  console.log(`INFO ${name} · ${JSON.stringify(detail)}`);
};

// ---- 1. Site-wide, signed out ----
const NOINDEX = /^noindex, ?nofollow$/i;
for (const path of ["/", "/calculator", "/dashboard/sign-in"]) {
  const r = await fetch(`${base}${path}`, { redirect: "manual" });
  const html = await r.text();
  check(`${path} 200`, r.status === 200, r.status);
  check(`${path} X-Robots-Tag noindex, nofollow`, NOINDEX.test(r.headers.get("x-robots-tag") ?? ""), r.headers.get("x-robots-tag"));
  check(`${path} robots meta noindex, nofollow`, /<meta[^>]+name="robots"[^>]+content="noindex, ?nofollow"/i.test(html));
  check(`${path} footer "Orpheus Wisdom"`, /<footer[^>]*>[\s\S]*Orpheus Wisdom[\s\S]*<\/footer>/.test(html));
  if (path === "/") info("Referrer-Policy (as on main)", r.headers.get("referrer-policy"));
}
{
  const r = await fetch(`${base}/dashboard`, { redirect: "manual" });
  check("signed-out /dashboard → 307 /dashboard/sign-in", r.status === 307 && /\/dashboard\/sign-in$/.test(r.headers.get("location") ?? ""), [r.status, r.headers.get("location")]);
  check("/dashboard X-Robots-Tag noindex, nofollow", NOINDEX.test(r.headers.get("x-robots-tag") ?? ""), r.headers.get("x-robots-tag"));
  const s = await fetch(`${base}/api/dashboard/status`);
  const body = await s.json().catch(() => null);
  check('flag on: /api/dashboard/status → {"dashboard":"enabled"}', s.status === 200 && body?.dashboard === "enabled", [s.status, body]);
}
{
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const origin = new URL(base).origin;
    const foreign = [];
    const views = [];
    page.on("request", (req) => {
      const u = req.url();
      if (/^(data|blob):/.test(u)) return;
      if (new URL(u).origin !== origin) foreign.push(u);
      if (/\/_vercel\/insights\/(view|event)/.test(u)) views.push(req.postData() ?? "");
    });
    for (const path of ["/?utm_source=qa#x", "/calculator?ticker=KO&utm_source=qa", "/dashboard/sign-in?utm_source=qa"]) {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      const scripts = await page.locator('script[src*="/_vercel/insights/script.js"], script[data-sdkn="@vercel/analytics"]').count();
      check(`${path.split("?")[0]} one Vercel Analytics script`, scripts === 1, scripts);
    }
    await page.waitForTimeout(1500);
    // Hosts that main already loads (not trackers): Google Fonts, and the platform head script injected at build
    // time (scripts/grok-pwa-shared.mjs; its removal is PR #52, paused). Reported, not failed.
    const KNOWN = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\/|^https:\/\/grok\.com\/grok-app-builder\/extensions\.js$/;
    const other = foreign.filter((u) => !KNOWN.test(u));
    check("no request to any other host (no other tracker)", other.length === 0, other.slice(0, 5));
    info("hosts loaded as on main (fonts, platform head script)", [...new Set(foreign.filter((u) => KNOWN.test(u)).map((u) => new URL(u).host))]);
    const custom = views.filter((b) => /"en"|\/event/.test(b));
    check("no custom analytics events", custom.length === 0, custom.length);
    if (views.length) check("page views carry no query string or hash", views.every((b) => !/\?|#|utm_source/.test(JSON.parse(b || "{}").o ?? "")), views.map((b) => JSON.parse(b || "{}").o));
    else info("page views not sent here (Analytics only reports on Vercel deployments)", 0);
  } finally {
    await browser.close();
  }
}

// ---- 2. The existing tools ----
const run = (label, cmd, args, env = {}) =>
  new Promise((done) => {
    console.log(`\n==== ${label}`);
    const child = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let last = "";
    const fails = [];
    const onData = (buf) =>
      String(buf)
        .split("\n")
        .filter(Boolean)
        .forEach((line) => {
          console.log(`  ${line}`);
          last = line;
          if (/^FAIL /.test(line)) fails.push(line);
        });
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => {
      R.tools.push({ label, code, summary: last, fails });
      done(code);
    });
  });
const tool = (name, env = {}, sub = name) =>
  run(`${name}${env.QA_EMAIL ? ` (${env.label ?? "account"})` : ""}`, process.execPath, [join(HERE, `${name}.mjs`), "--base-url", base, "--out", join(CFG.out, sub)], {
    QA_VIEWPORTS: process.env.QA_VIEWPORTS ?? "phone,wide,desktop",
    ...env,
  });

await tool("site");
await tool("dashboard-leaveouts");
await tool("dashboard-list");
if (!has("read-only")) await tool("dashboard-add");
if (!has("read-only")) await tool("dashboard-metrics");
await tool("dashboard-book");
if (has("empty")) {
  const empty = { QA_EMAIL: process.env.QA_EMPTY_EMAIL ?? "", QA_PASSWORD: process.env.QA_EMPTY_PASSWORD ?? "", label: "empty account" };
  await tool("dashboard-leaveouts", empty, "empty-leaveouts");
  await tool("dashboard-list", empty, "empty-list");
}
if (smoke) await run(`release-smoke ${smoke}`, process.execPath, [join(REPO, "scripts", "release-smoke.mjs"), base, smoke]);

// ---- Summary ----
const siteFails = R.site.filter((c) => !c.ok).length;
const toolFails = R.tools.filter((t) => t.code !== 0);
console.log(`\n==== summary (${base})`);
console.log(`${siteFails ? "FAIL" : "PASS"} site-wide: ${R.site.filter((c) => c.ok && !c.info).length}/${R.site.filter((c) => !c.info).length}`);
for (const t of R.tools) console.log(`${t.code === 0 ? "PASS" : "FAIL"} ${t.label}: ${t.summary}`);
console.log("NOTE delete guard: npm test (holdings.dom.test.tsx); never clicked here. Flag off: npm run check:dashboard-built.");
fs.writeFileSync(join(CFG.out, "dashboard-redesign.json"), JSON.stringify(R, null, 2));
const failed = siteFails + toolFails.length;
console.log(`${failed ? "FAIL" : "PASS"}: ${failed ? `${failed} failing part(s)` : "every part"} · out ${CFG.out}`);
process.exit(failed ? 1 : 0);
