#!/usr/bin/env node
/**
 * Read-only release smoke check for the dashboard (#24, docs/release/dashboard-release.md).
 * Sends only GET requests, never with credentials, so it changes nothing anywhere (the cron route
 * without its Authorization header answers 401/404 and runs nothing).
 *
 *   node scripts/release-smoke.mjs <base-url> off       # flag off (production today): every dashboard path 404
 *   node scripts/release-smoke.mjs <base-url> on        # production after the flip
 *   node scripts/release-smoke.mjs <base-url> preview   # a Vercel preview / release candidate (flag on)
 *
 * Exit code 0 when every check passes, 1 otherwise. Prints one line per check.
 */
const [base, mode] = process.argv.slice(2);
if (!base || !["off", "on", "preview"].includes(mode)) {
  console.error("usage: node scripts/release-smoke.mjs <base-url> off|on|preview");
  process.exit(2);
}
const url = (p) => new URL(p, base).toString();
const get = async (p) => {
  const res = await fetch(url(p), { method: "GET", redirect: "manual", headers: { accept: "text/html,application/json" } });
  return { status: res.status, location: res.headers.get("location") ?? "", body: await res.text() };
};

const on = mode !== "off";
const checks = [
  ["/", (r) => r.status === 200 && /noindex/.test(r.body), "200 (calculator, noindex)"],
  on
    ? ["/dashboard", (r) => [302, 303, 307].includes(r.status) && r.location.includes("/dashboard/sign-in"), "redirect to /dashboard/sign-in"]
    : ["/dashboard", (r) => r.status === 404 && !/dashboard/i.test(r.body.replace(/<script[\s\S]*?<\/script>/g, "")), "404, no dashboard copy"],
  on
    ? ["/dashboard/sign-in", (r) => r.status === 200 && /noindex/.test(r.body), "200, noindex"]
    : ["/dashboard/sign-in", (r) => r.status === 404, "404"],
  mode === "on"
    ? ["/api/dashboard/status", (r) => r.status === 200 && r.body === '{"dashboard":"enabled"}', '200 {"dashboard":"enabled"} only']
    : mode === "preview"
      ? ["/api/dashboard/status", (r) => r.status === 200 && /"signIn":"ready"/.test(r.body), "200 with signIn ready"]
      : ["/api/dashboard/status", (r) => r.status === 404, "404"],
  mode === "preview"
    ? ["/api/dashboard/db", (r) => r.status === 200 && /"state":"connected"/.test(r.body) && /"missingTables":\[\]/.test(r.body), "200 connected, no missing tables"]
    : ["/api/dashboard/db", (r) => r.status === 404, "404 (never served on production)"],
  ["/api/dashboard/holdings", (r) => r.status === (on ? 401 : 404), on ? "401 signed out" : "404"],
  ["/api/dashboard/columns", (r) => r.status === (on ? 401 : 404), on ? "401 signed out" : "404"],
  ["/api/cron/daily-refresh", (r) => r.status === (on ? 401 : 404), on ? "401 without the cron header" : "404"],
  ["/api/dashboard/refresh", (r) => r.status === (mode === "preview" ? 405 : 404), mode === "preview" ? "405 (POST-only, preview)" : "404 (preview-only)"],
];

let failed = 0;
for (const [path, ok, want] of checks) {
  const r = await get(path);
  const pass = ok(r);
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"} GET ${path} -> ${r.status}${r.location ? ` (${r.location})` : ""}; expected ${want}`);
}
console.log(failed ? `[release-smoke] ${failed} check(s) failed (${mode})` : `[release-smoke] OK (${mode})`);
process.exit(failed ? 1 : 0);
