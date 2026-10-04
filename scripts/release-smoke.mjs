#!/usr/bin/env node
/**
 * Read-only release smoke check (#24, docs/release/dashboard-release.md; site shell #46).
 * Sends only GET requests, never with credentials, so it changes nothing anywhere (the cron route
 * without its Authorization header answers 401/404 and runs nothing).
 *
 *   node scripts/release-smoke.mjs <base-url> off       # dashboard flag off (rollback): every dashboard path 404
 *   node scripts/release-smoke.mjs <base-url> on        # production with the dashboard on
 *   node scripts/release-smoke.mjs <base-url> preview   # a Vercel preview / release candidate (flag on)
 *
 * Every mode also checks the site shell (#46): the menu (Orpheus / Calculator / Dashboard, the current
 * page marked, Dashboard shown even with the flag off), home `/` with exactly two cards, the footer (exactly "Orpheus Wisdom"),
 * the calculator at `/calculator`, `/?query` → `/calculator?query`, noindex meta + X-Robots-Tag on every
 * page, and the calculator's VOD.L refusal (GET /api/chart: 400 with the exact message).
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
  const res = await fetch(url(p), {
    method: "GET",
    redirect: "manual",
    headers: { accept: "text/html,application/json" },
  });
  return {
    status: res.status,
    location: res.headers.get("location") ?? "",
    robots: res.headers.get("x-robots-tag") ?? "",
    body: await res.text(),
  };
};

// Site shell helpers (#46).
const MENU = /<nav aria-label="Site" data-testid="site-menu"[\s\S]*?<\/nav>/;
const menu = (r) => r.body.match(MENU)?.[0] ?? "";
const current = (r) =>
  [...menu(r).matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
const menuOk = (r, want) =>
  /href="\/"[^>]*>Orpheus</.test(menu(r)) &&
  /href="\/calculator"[^>]*>Calculator</.test(menu(r)) &&
  /href="\/dashboard"[^>]*>Dashboard</.test(menu(r)) &&
  JSON.stringify(current(r)) === JSON.stringify(want ? [want] : []);
const noindex = (r) =>
  /<meta name="robots" content="noindex, nofollow"\/?>/.test(r.body) && /noindex/i.test(r.robots);
const footer = (r) =>
  /<footer[^>]*><p[^>]*data-testid="site-footer"[^>]*>Orpheus Wisdom<\/p><\/footer>/.test(r.body);
const cards = (r) =>
  [
    ...r.body.matchAll(
      /<a href="([^"]+)" data-testid="home-card"[\s\S]*?<h2[^>]*>([^<]*)<\/h2>[\s\S]*?<p[^>]*>([^<]*)<\/p>/g,
    ),
  ]
    .map((m) => m.slice(1).join("|"))
    .join(" ");
const HOME_CARDS =
  "/calculator|Calculator|compare a lump sum with contributions /dashboard|Dashboard|holdings, value, stored figures";
const page = (r, want) => r.status === 200 && noindex(r) && menuOk(r, want) && footer(r);
const VOD_L = "VOD.L lists on LSE. US, EU, and CA listings only.";

const on = mode !== "off";
const checks = [
  // Site shell (#46), every mode.
  [
    "/",
    (r) => page(r, "Orpheus") && cards(r) === HOME_CARDS && !/<form|Compare plans/.test(r.body),
    "200 home: noindex + X-Robots-Tag, menu (Orpheus current, Dashboard shown), exactly two cards, footer, no calculator",
  ],
  [
    "/calculator",
    (r) =>
      page(r, "Calculator") &&
      /Compare plans/.test(r.body) &&
      />US, EU and CA listings, one currency per basket\.</.test(r.body),
    "200 calculator: noindex + X-Robots-Tag, menu (Calculator current), listings note, footer",
  ],
  [
    "/?ticker=KO&start=2020-10-02",
    (r) =>
      [301, 302, 307, 308].includes(r.status) &&
      new URL(r.location, base).pathname === "/calculator" &&
      new URL(r.location, base).search === "?ticker=KO&start=2020-10-02",
    "redirect to /calculator?ticker=KO&start=2020-10-02",
  ],
  [
    "/api/chart?ticker=VOD.L&start=2023-01-03&end=2024-12-31",
    (r) => r.status === 400 && JSON.parse(r.body || "{}").error === VOD_L,
    `400 "${VOD_L}"`,
  ],
  // Dashboard matrix (unchanged).
  on
    ? [
        "/dashboard",
        (r) => [302, 303, 307].includes(r.status) && r.location.includes("/dashboard/sign-in"),
        "redirect to /dashboard/sign-in",
      ]
    : [
        "/dashboard",
        (r) =>
          r.status === 404 &&
          menuOk(r, null) &&
          !/dashboard/i.test(r.body.replace(MENU, "").replace(/<script[\s\S]*?<\/script>/g, "")),
        "404, no dashboard copy outside the site menu",
      ],
  on
    ? [
        "/dashboard/sign-in",
        (r) => page(r, "Dashboard"),
        "200, noindex + X-Robots-Tag, menu (Dashboard current), footer",
      ]
    : ["/dashboard/sign-in", (r) => r.status === 404, "404"],
  mode === "on"
    ? [
        "/api/dashboard/status",
        (r) => r.status === 200 && r.body === '{"dashboard":"enabled"}',
        '200 {"dashboard":"enabled"} only',
      ]
    : mode === "preview"
      ? [
          "/api/dashboard/status",
          (r) => r.status === 200 && /"signIn":"ready"/.test(r.body),
          "200 with signIn ready",
        ]
      : ["/api/dashboard/status", (r) => r.status === 404, "404"],
  mode === "preview"
    ? [
        "/api/dashboard/db",
        (r) =>
          r.status === 200 &&
          /"state":"connected"/.test(r.body) &&
          /"missingTables":\[\]/.test(r.body),
        "200 connected, no missing tables",
      ]
    : ["/api/dashboard/db", (r) => r.status === 404, "404 (never served on production)"],
  ["/api/dashboard/holdings", (r) => r.status === (on ? 401 : 404), on ? "401 signed out" : "404"],
  ["/api/dashboard/columns", (r) => r.status === (on ? 401 : 404), on ? "401 signed out" : "404"],
  [
    "/api/cron/daily-refresh",
    (r) => r.status === (on ? 401 : 404),
    on ? "401 without the cron header" : "404",
  ],
  [
    "/api/dashboard/refresh",
    (r) => r.status === (mode === "preview" ? 405 : 404),
    mode === "preview" ? "405 (POST-only, preview)" : "404 (preview-only)",
  ],
];

let failed = 0;
for (const [path, ok, want] of checks) {
  const r = await get(path);
  let pass = false;
  try {
    pass = ok(r);
  } catch {
    pass = false;
  }
  if (!pass) failed++;
  console.log(
    `${pass ? "PASS" : "FAIL"} GET ${path} -> ${r.status}${r.location ? ` (${r.location})` : ""}; expected ${want}`,
  );
}
console.log(
  failed ? `[release-smoke] ${failed} check(s) failed (${mode})` : `[release-smoke] OK (${mode})`,
);
process.exit(failed ? 1 : 0);
