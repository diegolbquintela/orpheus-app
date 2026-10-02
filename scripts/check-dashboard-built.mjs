#!/usr/bin/env node
/**
 * Post-build check of the DASHBOARD_ENABLED gate against the real built server
 * (.vercel/output/functions/__server.func), without a network or a browser.
 * Run after `npm run build`: `npm run check:dashboard-built`. CI runs it.
 *
 * Flag off (unset and other non-"true" values):
 *   - GET /dashboard and /dashboard/x: 404 HTML identical to the 404 for any
 *     unknown path (timestamps aside), with no "dashboard" anywhere in it: no
 *     dashboard title, no "Preview shell" copy, no dashboard chunk reference.
 *   - /dashboard/ redirects like any unknown path with a trailing slash.
 *   - Every method on /api/dashboard/status, /api/dashboard/db and /api/dashboard/*: 404 JSON.
 * Flag on ("true"):
 *   - GET /dashboard: 200, dashboard title, noindex, placeholder copy.
 *   - GET /api/dashboard/status: 200 {"dashboard":"enabled"}; other methods 405 JSON, Allow: GET, HEAD.
 *   - GET /api/dashboard/db (no DATABASE_URL): 200 {"state":"not_configured"}; /dashboard shows
 *     "Database: not configured"; other methods 405 JSON, Allow: GET, HEAD.
 *   - VERCEL_ENV=production: /api/dashboard/db is 404 JSON for every method; no status line.
 *   - /api/dashboard/*: 404 JSON for every method.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = resolve(".vercel/output/functions/__server.func/index.mjs");
if (!existsSync(entry)) {
  console.error(`[check-dashboard-built] ${entry} not found; run npm run build first`);
  process.exit(2);
}
// Storage must read "not configured" here: never reach a real database from this check.
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;
const { default: server } = await import(pathToFileURL(entry).href);

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

async function call(method, path, flag, vercelEnv) {
  if (flag === undefined) delete process.env.DASHBOARD_ENABLED;
  else process.env.DASHBOARD_ENABLED = flag;
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  const res = await server.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { accept: "text/html,application/json" },
      redirect: "manual",
    }),
    {},
  );
  const body = method === "HEAD" ? "" : (await res.text()).replace(/\0/g, "");
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    allow: res.headers.get("allow"),
    location: res.headers.get("location"),
    body,
  };
}

// Router state carries per-request timestamps (u:<ms>); nothing else may differ.
const normalise = (html) => html.replace(/u:\d+/g, "u:0");
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
// Routes with their own handlers (GET/HEAD when on); everything else under /api/dashboard is the catch-all.
const GATED_API_PATHS = ["/api/dashboard/status", "/api/dashboard/db"];
const API_PATHS = [
  ...GATED_API_PATHS,
  "/api/dashboard/foo",
  "/api/dashboard/a/b",
  "/api/dashboard",
];
const isJson404 = (r) =>
  r.status === 404 &&
  /application\/json/.test(r.type) &&
  (r.body === "" || r.body === '{"error":"Not found."}');

for (const flag of [undefined, "", "false", "TRUE", "1", "true "]) {
  const label = `flag ${flag === undefined ? "unset" : JSON.stringify(flag)}`;
  const baseline = await call("GET", "/orpheus-missing-path", flag);
  check(baseline.status === 404, `${label}: baseline unknown path is ${baseline.status}`);
  for (const path of ["/dashboard", "/dashboard/x"]) {
    const r = await call("GET", path, flag);
    check(
      r.status === 404 && /text\/html/.test(r.type),
      `${label}: GET ${path} -> ${r.status} ${r.type}`,
    );
    check(!/dashboard/i.test(r.body), `${label}: GET ${path} HTML mentions "dashboard"`);
    check(!/Preview shell/.test(r.body), `${label}: GET ${path} HTML has the placeholder copy`);
    check(
      /<title>Orpheus Wisdom<\/title>/.test(r.body),
      `${label}: GET ${path} title is not "Orpheus Wisdom"`,
    );
    check(
      normalise(r.body) === normalise(baseline.body),
      `${label}: GET ${path} HTML differs from the unknown-path 404`,
    );
  }
  const slash = await call("GET", "/dashboard/", flag);
  const slashBaseline = await call("GET", "/orpheus-missing-path/", flag);
  check(
    slash.status === slashBaseline.status &&
      slash.location ===
        (slashBaseline.location ?? "").replace("/orpheus-missing-path", "/dashboard"),
    `${label}: GET /dashboard/ -> ${slash.status} ${slash.location} (unknown path: ${slashBaseline.status} ${slashBaseline.location})`,
  );
  for (const method of METHODS)
    for (const path of API_PATHS) {
      const r = await call(method, path, flag);
      check(
        isJson404(r),
        `${label}: ${method} ${path} -> ${r.status} ${r.type} ${r.body.slice(0, 60)}`,
      );
    }
}

{
  const label = 'flag "true"';
  const page = await call("GET", "/dashboard", "true");
  check(page.status === 200, `${label}: GET /dashboard -> ${page.status}`);
  check(
    /<title>Dashboard · Orpheus Wisdom<\/title>/.test(page.body),
    `${label}: GET /dashboard title`,
  );
  check(
    /<meta name="robots" content="noindex, nofollow"\/>/.test(page.body),
    `${label}: GET /dashboard noindex`,
  );
  check(
    /Preview shell\. Nothing to show yet\./.test(page.body),
    `${label}: GET /dashboard placeholder copy`,
  );
  const status = await call("GET", "/api/dashboard/status", "true");
  check(
    status.status === 200 && status.body === '{"dashboard":"enabled"}',
    `${label}: GET status -> ${status.status} ${status.body}`,
  );
  check(
    /Database: not configured/.test(page.body),
    `${label}: GET /dashboard lacks the "Database: not configured" status line`,
  );
  const dbStatus = await call("GET", "/api/dashboard/db", "true");
  check(
    dbStatus.status === 200 && dbStatus.body === '{"state":"not_configured"}',
    `${label}: GET db -> ${dbStatus.status} ${dbStatus.body}`,
  );
  for (const path of GATED_API_PATHS)
    for (const method of METHODS.filter((m) => m !== "GET" && m !== "HEAD")) {
      const r = await call(method, path, "true");
      check(
        r.status === 405 &&
          /application\/json/.test(r.type) &&
          r.allow === "GET, HEAD" &&
          r.body === '{"error":"Method not allowed."}',
        `${label}: ${method} ${path} -> ${r.status} ${r.type} allow=${r.allow} ${r.body.slice(0, 60)}`,
      );
    }
  // Production hides the storage status even with the flag on.
  for (const method of METHODS) {
    const r = await call(method, "/api/dashboard/db", "true", "production");
    check(
      isJson404(r),
      `${label} + VERCEL_ENV=production: ${method} db -> ${r.status} ${r.type} ${r.body.slice(0, 60)}`,
    );
  }
  const prodPage = await call("GET", "/dashboard", "true", "production");
  check(
    prodPage.status === 200 && !/Database:/.test(prodPage.body),
    `${label} + VERCEL_ENV=production: /dashboard -> ${prodPage.status}, status line present=${/Database:/.test(prodPage.body)}`,
  );
  for (const method of METHODS)
    for (const path of API_PATHS.filter((p) => !GATED_API_PATHS.includes(p))) {
      const r = await call(method, path, "true");
      check(
        isJson404(r),
        `${label}: ${method} ${path} -> ${r.status} ${r.type} ${r.body.slice(0, 60)}`,
      );
    }
}

if (failures.length) {
  console.error(
    `[check-dashboard-built] ${failures.length} failure(s):\n  ${failures.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(
  "[check-dashboard-built] OK: flag-off 404s match the unknown-path 404; API methods answer JSON; flag-on shell, status and db OK; db hidden on production",
);
