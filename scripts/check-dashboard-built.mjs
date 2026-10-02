#!/usr/bin/env node
/**
 * Post-build check of the dashboard gate and sign-in against the real built server
 * (.vercel/output/functions/__server.func), without a network or a browser.
 * Run after `npm run build`: `npm run check:dashboard-built`. CI runs it.
 *
 * Default mode (CI): no database, and VERCEL=1 so the server behaves like a Vercel deployment
 * that has no BETTER_AUTH_SECRET or database URL.
 *   Flag off (unset and other non-"true" values):
 *   - GET /dashboard, /dashboard/x, /dashboard/sign-in: 404 HTML identical to the 404 for any
 *     unknown path (timestamps aside), with no "dashboard" anywhere in it.
 *   - /dashboard/ redirects like any unknown path with a trailing slash.
 *   - Every method on /api/dashboard/{status,db,me,settings}, /api/dashboard/* and /api/auth/*: 404 JSON.
 *   Flag on ("true"), signed out:
 *   - GET /dashboard redirects to /dashboard/sign-in (DASH-04); the sign-in page renders (noindex).
 *   - /api/dashboard/me and /settings: 401 JSON; unsupported methods 405 JSON.
 *   - /api/dashboard/status 200, /api/dashboard/db {"state":"not_configured"}; other methods 405.
 *   - /api/auth/*: 503 JSON (sign-in not configured: fail closed).
 *   - VERCEL_ENV=production: /api/dashboard/db is 404 JSON for every method.
 *   - Unknown /api/dashboard/*: 404 JSON for every method.
 *
 * `--with-database` (manual; needs DATABASE_URL for a throwaway, already migrated Postgres, never
 * a shared one): the same signed-out checks, then sign-up with the allow-list (denied 403 /
 * allowed), the signed-in /dashboard ("Signed in as", "connected · 9/9 tables"), /api/dashboard/me,
 * settings isolation between two accounts (403), the production status-line rule and sign-out.
 *
 *   node scripts/migrate.mjs && node scripts/check-dashboard-built.mjs --with-database
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = resolve(".vercel/output/functions/__server.func/index.mjs");
if (!existsSync(entry)) {
  console.error(`[check-dashboard-built] ${entry} not found; run npm run build first`);
  process.exit(2);
}
const WITH_DB = process.argv.includes("--with-database");
const keepDb = WITH_DB ? process.env.DATABASE_URL : undefined;
if (WITH_DB && !keepDb) {
  console.error("[check-dashboard-built] --with-database needs DATABASE_URL (a throwaway database)");
  process.exit(2);
}
// Default mode never reaches a real database: storage must read "not configured".
for (const name of Object.keys(process.env))
  if (/DATABASE_URL|POSTGRES_URL|^BETTER_AUTH_|^VERCEL|^VITE_AUTH_ENABLED$|SIGNUP_ALLOWLIST/.test(name))
    delete process.env[name];
if (WITH_DB) process.env.DATABASE_URL = keepDb;
// No VERCEL: local rules (loopback origins, per-process secret). VERCEL=1 without a secret or
// database: sign-in must be off.
else process.env.VERCEL = "1";
// Test-only addresses.
const ALLOWED = "qa-allowed@example.com";
process.env.DASHBOARD_SIGNUP_ALLOWLIST = `${ALLOWED}, other@example.com`;
const ORIGIN = "http://localhost";
const { default: server } = await import(pathToFileURL(entry).href);

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

async function call(method, path, flag, vercelEnv, { cookie, body: payload } = {}) {
  if (flag === undefined) delete process.env.DASHBOARD_ENABLED;
  else process.env.DASHBOARD_ENABLED = flag;
  if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnv;
  const res = await server.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        accept: "text/html,application/json",
        origin: ORIGIN,
        ...(cookie ? { cookie } : {}),
        ...(payload ? { "content-type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
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
    cookie: res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .filter((c) => !c.endsWith("="))
      .join("; "),
    body,
  };
}

// Router state carries per-request timestamps (u:<ms>); nothing else may differ.
const normalise = (html) => html.replace(/u:\d+/g, "u:0");
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
// Routes with their own handlers (GET/HEAD when on); everything else under /api/dashboard is the catch-all.
const GATED_API_PATHS = ["/api/dashboard/status", "/api/dashboard/db"];
// Per-user routes: 401 signed out (GET), own data signed in.
const SESSION_API_PATHS = ["/api/dashboard/me", "/api/dashboard/settings"];
const AUTH_PATHS = ["/api/auth/get-session", "/api/auth/sign-up/email", "/api/auth/sign-in/email"];
const API_PATHS = [
  ...GATED_API_PATHS,
  ...SESSION_API_PATHS,
  ...AUTH_PATHS,
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
  for (const path of ["/dashboard", "/dashboard/x", "/dashboard/sign-in"]) {
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

const METHODS_NOT_GET = METHODS.filter((m) => m !== "GET" && m !== "HEAD");
const json405 = (r) =>
  r.status === 405 &&
  /application\/json/.test(r.type) &&
  r.body === '{"error":"Method not allowed."}';
const isRedirectTo = (r, path) =>
  r.status >= 300 && r.status < 400 && new URL(r.location ?? "/x", ORIGIN).pathname === path;

{
  const label = 'flag "true", signed out';
  const page = await call("GET", "/dashboard", "true");
  check(isRedirectTo(page, "/dashboard/sign-in"), `${label}: GET /dashboard -> ${page.status} ${page.location}`);
  const signIn = await call("GET", "/dashboard/sign-in", "true");
  check(signIn.status === 200, `${label}: GET /dashboard/sign-in -> ${signIn.status}`);
  check(/<title>Sign in · Orpheus Wisdom<\/title>/.test(signIn.body), `${label}: sign-in title`);
  check(/<meta name="robots" content="noindex, nofollow"\/>/.test(signIn.body), `${label}: sign-in noindex`);
  check(
    WITH_DB ? /data-testid="sign-in-form"/.test(signIn.body) : /Sign-in is not configured/.test(signIn.body),
    `${label}: sign-in page ${WITH_DB ? "lacks the form" : 'lacks "not configured"'}`,
  );
  for (const path of SESSION_API_PATHS) {
    const r = await call("GET", path, "true");
    check(
      r.status === 401 && /application\/json/.test(r.type) && r.body === '{"error":"Unauthorized."}',
      `${label}: GET ${path} -> ${r.status} ${r.body.slice(0, 60)}`,
    );
  }
  for (const method of METHODS_NOT_GET) {
    const me = await call(method, "/api/dashboard/me", "true");
    check(json405(me), `${label}: ${method} /api/dashboard/me -> ${me.status}`);
    if (method !== "PUT") {
      const st = await call(method, "/api/dashboard/settings", "true");
      check(json405(st), `${label}: ${method} /api/dashboard/settings -> ${st.status}`);
    }
  }
  const status = await call("GET", "/api/dashboard/status", "true");
  check(
    status.status === 200 && status.body === '{"dashboard":"enabled"}',
    `${label}: GET status -> ${status.status} ${status.body}`,
  );
  for (const path of GATED_API_PATHS)
    for (const method of METHODS_NOT_GET) {
      const r = await call(method, path, "true");
      check(json405(r) && r.allow === "GET, HEAD", `${label}: ${method} ${path} -> ${r.status} allow=${r.allow}`);
    }
  // Production hides the storage status even with the flag on.
  for (const method of METHODS) {
    const r = await call(method, "/api/dashboard/db", "true", "production");
    check(isJson404(r), `${label} + VERCEL_ENV=production: ${method} db -> ${r.status} ${r.body.slice(0, 60)}`);
  }
  for (const method of METHODS)
    for (const path of API_PATHS.filter((p) => ![...GATED_API_PATHS, ...SESSION_API_PATHS, ...AUTH_PATHS].includes(p))) {
      const r = await call(method, path, "true");
      check(isJson404(r), `${label}: ${method} ${path} -> ${r.status} ${r.type} ${r.body.slice(0, 60)}`);
    }
}

if (!WITH_DB) {
  // Like a Vercel deployment without BETTER_AUTH_SECRET or a database: sign-in is off, fail closed.
  const label = 'flag "true", no database';
  for (const [method, path] of [["GET", "/api/auth/get-session"], ["POST", "/api/auth/sign-up/email"]]) {
    const r = await call(method, path, "true", undefined, method === "POST" ? { body: { email: ALLOWED, password: "check-password-1", name: "qa" } } : {});
    check(
      r.status === 503 && r.body === '{"error":"Sign-in is not configured on this deployment."}',
      `${label}: ${method} ${path} -> ${r.status} ${r.body.slice(0, 80)}`,
    );
  }
  const dbStatus = await call("GET", "/api/dashboard/db", "true");
  check(
    dbStatus.status === 200 && dbStatus.body === '{"state":"not_configured"}',
    `${label}: GET db -> ${dbStatus.status} ${dbStatus.body}`,
  );
} else {
  const label = 'flag "true", with database';
  const signUp = (email) =>
    call("POST", "/api/auth/sign-up/email", "true", undefined, {
      body: { email, password: "check-password-1", name: "qa" },
    });
  const denied = await signUp("not-invited@example.com");
  check(
    denied.status === 403 && !denied.cookie && /invited email addresses/.test(denied.body),
    `${label}: non-allow-listed sign-up -> ${denied.status} cookie=${Boolean(denied.cookie)} ${denied.body.slice(0, 80)}`,
  );
  const allowed = await signUp("QA-Allowed@Example.com");
  check(allowed.status === 200 && allowed.cookie, `${label}: allow-listed sign-up -> ${allowed.status} ${allowed.body.slice(0, 80)}`);
  const session = allowed.cookie;
  const token = session.split("; ").filter((c) => c.includes("session_token=")).join("; ");
  const again = await call("GET", "/dashboard/sign-in", "true", undefined, { cookie: session });
  check(isRedirectTo(again, "/dashboard"), `${label}: signed in, GET /dashboard/sign-in -> ${again.status} ${again.location}`);
  const page = await call("GET", "/dashboard", "true", undefined, { cookie: token });
  check(page.status === 200, `${label}: GET /dashboard -> ${page.status}`);
  check(/<title>Dashboard · Orpheus Wisdom<\/title>/.test(page.body), `${label}: GET /dashboard title`);
  check(/<meta name="robots" content="noindex, nofollow"\/>/.test(page.body), `${label}: GET /dashboard noindex`);
  check(/Preview shell\. Nothing to show yet\./.test(page.body), `${label}: GET /dashboard placeholder copy`);
  check(/Signed in as (<!-- -->)?qa-allowed@example\.com/.test(page.body), `${label}: GET /dashboard lacks "Signed in as"`);
  check(/Database: connected · 9\/9 tables/.test(page.body), `${label}: GET /dashboard lacks "Database: connected · 9/9 tables"`);
  const me = await call("GET", "/api/dashboard/me", "true", undefined, { cookie: token });
  check(me.status === 200 && me.body.includes(`"email":"${ALLOWED}"`), `${label}: GET me -> ${me.status} ${me.body}`);
  const put = await call("PUT", "/api/dashboard/settings", "true", undefined, { cookie: token, body: { baseCurrency: "USD" } });
  check(put.status === 200 && put.body === '{"settings":{"baseCurrency":"USD"}}', `${label}: PUT settings -> ${put.status} ${put.body}`);
  // A second account cannot read or change the first one's settings (DASH-06).
  const other = await signUp("other@example.com");
  const otherToken = other.cookie.split("; ").filter((c) => c.includes("session_token=")).join("; ");
  const myId = JSON.parse(me.body).user.id;
  const peek = await call("GET", `/api/dashboard/settings?userId=${encodeURIComponent(myId)}`, "true", undefined, { cookie: otherToken });
  check(peek.status === 403, `${label}: other user GET settings?userId=<first> -> ${peek.status}`);
  const poke = await call("PUT", "/api/dashboard/settings", "true", undefined, { cookie: otherToken, body: { userId: myId, baseCurrency: "EUR" } });
  check(poke.status === 403, `${label}: other user PUT settings {userId:<first>} -> ${poke.status}`);
  const own = await call("GET", "/api/dashboard/settings", "true", undefined, { cookie: otherToken });
  check(own.body === '{"settings":{"baseCurrency":"CAD"}}', `${label}: other user's own settings -> ${own.body}`);
  const mine = await call("GET", "/api/dashboard/settings", "true", undefined, { cookie: token });
  check(mine.body === '{"settings":{"baseCurrency":"USD"}}', `${label}: first user's settings after the attempts -> ${mine.body}`);
  // Production hides the status line even signed in with the flag on.
  const prodPage = await call("GET", "/dashboard", "true", "production", { cookie: token });
  check(prodPage.status === 200 && !/Database:/.test(prodPage.body), `${label} + VERCEL_ENV=production: /dashboard -> ${prodPage.status}, status line present=${/Database:/.test(prodPage.body)}`);
  const out = await call("POST", "/api/auth/sign-out", "true", undefined, { cookie: session, body: {} });
  check(out.status === 200, `${label}: POST /api/auth/sign-out -> ${out.status}`);
  const after = await call("GET", "/api/dashboard/me", "true", undefined, { cookie: token });
  check(after.status === 401, `${label}: GET me after sign-out -> ${after.status}`);
  const back = await call("GET", "/dashboard", "true", undefined, { cookie: token });
  check(isRedirectTo(back, "/dashboard/sign-in"), `${label}: GET /dashboard after sign-out -> ${back.status}`);
}

if (failures.length) {
  console.error(`[check-dashboard-built] ${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(
  WITH_DB
    ? "[check-dashboard-built] OK (with database): allow-list sign-up denied/allowed; signed-in shell, connected 9/9; me; settings isolation (403); sign-out"
    : "[check-dashboard-built] OK: flag-off 404s match the unknown-path 404 (sign-in and auth routes too); API methods answer JSON; signed out -> sign-in redirect + 401; sign-in off without secret/database (503); status and db OK; db hidden on production",
);
