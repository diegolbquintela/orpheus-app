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
 *   - Every method on /api/dashboard/{status,db,me,settings,holdings,holdings/1,refresh},
 *     /api/dashboard/*, /api/auth/* and /api/cron/daily-refresh: 404 JSON.
 *   Flag on ("true"), signed out:
 *   - GET /dashboard redirects to /dashboard/sign-in (DASH-04); the sign-in page renders (noindex).
 *   - /api/dashboard/{me,settings,holdings,holdings/1}: 401 JSON for served methods; others 405 JSON.
 *   - /api/dashboard/status 200 with sign-in diagnostics (names/states only; plain on production),
 *     /api/dashboard/db {"state":"not_configured"}; other methods 405.
 *   - /api/auth/*: 503 JSON (sign-in not configured: fail closed).
 *   - /api/cron/daily-refresh (T05): 401 JSON without / with a wrong `Authorization: Bearer`, and with no
 *     CRON_SECRET at all; other methods 405 (Allow: GET); right header but no database 503.
 *     CRON_SECRET here is a random per-run value made by this script, never a real one.
 *   - /api/dashboard/refresh (preview-only button): 404 JSON unless VERCEL_ENV=preview; on a preview,
 *     POST signed out 401, other methods 405 (Allow: POST).
 *   - VERCEL_ENV=production: /api/dashboard/db is 404 JSON for every method.
 *   - Unknown /api/dashboard/*: 404 JSON for every method.
 *
 * `--with-database` (manual; needs DATABASE_URL for a fresh throwaway, already migrated Postgres, never
 * a shared one): the same signed-out checks, then sign-up with the allow-list (denied 403 /
 * allowed), the signed-in /dashboard ("Signed in as", "connected · 9/9 tables"), /api/dashboard/me,
 * settings isolation between two accounts (403), holdings (T04: add KO, VOD.L and TCS.BO refused with
 * the calculator's messages, duplicate 409, quantity checks, edit, the row after a reload, another
 * account gets 404 on the holding id, delete), the daily close job (T05: "Run daily refresh" shown only
 * with VERCEL_ENV=preview, POST /api/dashboard/refresh stores KO's last completed close, a second run
 * and the cron route with the right header insert nothing, reloads show the same close), the
 * production status-line rule and sign-out.
 * Adding a holding and the refresh call the live price feed, so this mode needs network access.
 *
 *   node scripts/migrate.mjs && node scripts/check-dashboard-built.mjs --with-database
 */
import { randomUUID } from "node:crypto";
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
  if (/DATABASE_URL|POSTGRES_URL|^BETTER_AUTH_|^VERCEL|^VITE_AUTH_ENABLED$|SIGNUP_ALLOWLIST|^CRON_SECRET$/.test(name))
    delete process.env[name];
if (WITH_DB) process.env.DATABASE_URL = keepDb;
// No VERCEL: local rules (loopback origins, per-process secret). VERCEL=1 without a secret or
// database: sign-in must be off.
else process.env.VERCEL = "1";
// Test-only addresses.
const ALLOWED = "qa-allowed@example.com";
process.env.DASHBOARD_SIGNUP_ALLOWLIST = `${ALLOWED}, other@example.com`;
const ORIGIN = "http://localhost";
// Random per run, only for this process: never a real CRON_SECRET.
const CRON = `check-${randomUUID()}`;
process.env.CRON_SECRET = CRON;
const { default: server } = await import(pathToFileURL(entry).href);

const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

async function call(method, path, flag, vercelEnv, { cookie, body: payload, headers: extra } = {}) {
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
        ...(extra ?? {}),
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
const SESSION_API_PATHS = [
  "/api/dashboard/me",
  "/api/dashboard/settings",
  "/api/dashboard/holdings",
  "/api/dashboard/holdings/1",
];
// Methods each per-user route serves (anything else: 405 JSON when the flag is on).
const SESSION_ALLOW = {
  "/api/dashboard/me": ["GET", "HEAD"],
  "/api/dashboard/settings": ["GET", "HEAD", "PUT"],
  "/api/dashboard/holdings": ["GET", "HEAD", "POST"],
  "/api/dashboard/holdings/1": ["GET", "HEAD", "PUT", "DELETE"],
};
const AUTH_PATHS = ["/api/auth/get-session", "/api/auth/sign-up/email", "/api/auth/sign-in/email"];
// T05: the cron route and the preview-only refresh button (checked separately when the flag is on).
const CRON_PATH = "/api/cron/daily-refresh";
const REFRESH_PATH = "/api/dashboard/refresh";
const JOB_PATHS = [CRON_PATH, REFRESH_PATH];
const API_PATHS = [
  ...GATED_API_PATHS,
  ...SESSION_API_PATHS,
  ...AUTH_PATHS,
  ...JOB_PATHS,
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
  for (const path of SESSION_API_PATHS)
    for (const method of METHODS) {
      const r = await call(method, path, "true", undefined, method === "GET" || method === "HEAD" ? {} : { body: {} });
      if (SESSION_ALLOW[path].includes(method))
        check(r.status === 401, `${label}: ${method} ${path} -> ${r.status} (want 401)`);
      else check(json405(r) && r.allow === SESSION_ALLOW[path].join(", "), `${label}: ${method} ${path} -> ${r.status} allow=${r.allow}`);
    }
  const status = await call("GET", "/api/dashboard/status", "true");
  const expected = WITH_DB
    ? '{"dashboard":"enabled","signIn":"ready","signUpAllowList":"set","cronSecret":"set"}'
    : '{"dashboard":"enabled","signIn":"not configured (BETTER_AUTH_SECRET not set)","signUpAllowList":"set","cronSecret":"set"}';
  check(status.status === 200 && status.body === expected, `${label}: GET status -> ${status.status} ${status.body}`);
  const prodStatus = await call("GET", "/api/dashboard/status", "true", "production");
  check(
    prodStatus.status === 200 && prodStatus.body === '{"dashboard":"enabled"}',
    `${label} + VERCEL_ENV=production: GET status -> ${prodStatus.status} ${prodStatus.body}`,
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
    for (const path of API_PATHS.filter((p) => ![...GATED_API_PATHS, ...SESSION_API_PATHS, ...AUTH_PATHS, ...JOB_PATHS].includes(p))) {
      const r = await call(method, path, "true");
      check(isJson404(r), `${label}: ${method} ${path} -> ${r.status} ${r.type} ${r.body.slice(0, 60)}`);
    }
}

{
  // T05 (DASH-10): the cron route needs `Authorization: Bearer <CRON_SECRET>`.
  const label = 'flag "true", cron';
  const unauthorized = (r) => r.status === 401 && /application\/json/.test(r.type) && r.body === '{"error":"Unauthorized."}';
  for (const headers of [{}, { authorization: "Bearer wrong" }, { authorization: CRON }, { authorization: `Basic ${CRON}` }]) {
    const r = await call("GET", CRON_PATH, "true", undefined, { headers });
    check(unauthorized(r), `${label}: GET ${CRON_PATH} ${Object.keys(headers).length ? "with a wrong header" : "without a header"} -> ${r.status} ${r.body.slice(0, 60)}`);
  }
  for (const method of METHODS_NOT_GET) {
    const r = await call(method, CRON_PATH, "true", undefined, { headers: { authorization: `Bearer ${CRON}` } });
    check(json405(r) && r.allow === "GET", `${label}: ${method} ${CRON_PATH} -> ${r.status} allow=${r.allow}`);
  }
  delete process.env.CRON_SECRET;
  const noSecret = await call("GET", CRON_PATH, "true", undefined, { headers: { authorization: "Bearer " } });
  check(unauthorized(noSecret), `${label}: no CRON_SECRET set -> ${noSecret.status}`);
  const noSecretStatus = await call("GET", "/api/dashboard/status", "true");
  check(/"cronSecret":"empty"/.test(noSecretStatus.body), `${label}: status without CRON_SECRET -> ${noSecretStatus.body}`);
  process.env.CRON_SECRET = CRON;
  if (!WITH_DB) {
    const noDb = await call("GET", CRON_PATH, "true", undefined, { headers: { authorization: `Bearer ${CRON}` } });
    check(noDb.status === 503 && noDb.body === '{"error":"Storage not configured."}', `${label}: right header, no database -> ${noDb.status} ${noDb.body}`);
  }
  // The preview-only refresh route exists only with VERCEL_ENV=preview.
  for (const vercelEnv of [undefined, "production", "development"])
    for (const method of METHODS) {
      const r = await call(method, REFRESH_PATH, "true", vercelEnv, method === "POST" ? { body: {} } : {});
      check(isJson404(r), `flag "true", VERCEL_ENV=${vercelEnv}: ${method} ${REFRESH_PATH} -> ${r.status} ${r.body.slice(0, 60)}`);
    }
  const signedOut = await call("POST", REFRESH_PATH, "true", "preview", { body: {} });
  check(signedOut.status === 401, `flag "true", VERCEL_ENV=preview, signed out: POST ${REFRESH_PATH} -> ${signedOut.status}`);
  for (const method of METHODS.filter((m) => m !== "POST")) {
    const r = await call(method, REFRESH_PATH, "true", "preview");
    check((method === "HEAD" ? r.status === 405 : json405(r)) && r.allow === "POST", `flag "true", VERCEL_ENV=preview: ${method} ${REFRESH_PATH} -> ${r.status} allow=${r.allow}`);
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
  check(/data-testid="holding-form"/.test(page.body), `${label}: GET /dashboard lacks the holdings form`);
  check(/No holdings yet\./.test(page.body), `${label}: GET /dashboard lacks "No holdings yet."`);
  check(/Signed in as (<!-- -->)?qa-allowed@example\.com/.test(page.body), `${label}: GET /dashboard lacks "Signed in as"`);
  check(/Database: connected · 11\/11 tables/.test(page.body), `${label}: GET /dashboard lacks "Database: connected · 11/11 tables"`);
  check(!/data-testid="preview-refresh"/.test(page.body), `${label}: refresh button shown without VERCEL_ENV=preview`);
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
  // Holdings (T04): add / validate / duplicate / edit / isolation / delete. Adding asks the live
  // price feed which exchange lists the ticker, so this part needs network access.
  const H = "/api/dashboard/holdings";
  const empty = await call("GET", H, "true", undefined, { cookie: token });
  check(empty.status === 200 && empty.body === '{"holdings":[]}', `${label}: GET holdings -> ${empty.status} ${empty.body}`);
  const ko = await call("POST", H, "true", undefined, { cookie: token, body: { symbol: "ko", shares: "10.5", avgCost: "52.25" } });
  check(ko.status === 201 && /"symbol":"KO"/.test(ko.body), `${label}: POST KO -> ${ko.status} ${ko.body.slice(0, 120)}`);
  const koId = ko.status === 201 ? JSON.parse(ko.body).holding.id : 0;
  for (const [symbol, message] of [
    ["VOD.L", "VOD.L lists on LSE. US, EU, and CA listings only."],
    ["TCS.BO", "TCS.BO lists on BSE. BSE and other non US/EU/CA venues are not supported."],
  ]) {
    const r = await call("POST", H, "true", undefined, { cookie: token, body: { symbol, shares: "1", avgCost: "1" } });
    check(
      r.status === 400 && r.body === JSON.stringify({ error: message, field: "symbol" }),
      `${label}: POST ${symbol} -> ${r.status} ${r.body}`,
    );
  }
  const dup = await call("POST", H, "true", undefined, { cookie: token, body: { symbol: "KO", shares: "1", avgCost: "1" } });
  check(dup.status === 409 && /KO is already in your holdings\./.test(dup.body), `${label}: duplicate KO -> ${dup.status} ${dup.body}`);
  const zero = await call("POST", H, "true", undefined, { cookie: token, body: { symbol: "RY.TO", shares: "0", avgCost: "1" } });
  check(zero.status === 400 && /Shares must be greater than 0\./.test(zero.body), `${label}: shares 0 -> ${zero.status} ${zero.body}`);
  const neg = await call("POST", H, "true", undefined, { cookie: token, body: { symbol: "RY.TO", shares: "1", avgCost: "-1" } });
  check(neg.status === 400 && /Average cost must be 0 or more\./.test(neg.body), `${label}: avg cost -1 -> ${neg.status} ${neg.body}`);
  const edit = await call("PUT", `${H}/${koId}`, "true", undefined, { cookie: token, body: { shares: "12", avgCost: "50" } });
  check(edit.status === 200 && /"shares":"12(\.0+)?"/.test(edit.body), `${label}: PUT KO -> ${edit.status} ${edit.body.slice(0, 120)}`);
  const withKo = await call("GET", "/dashboard", "true", undefined, { cookie: token });
  check(/data-symbol="KO"/.test(withKo.body), `${label}: /dashboard lacks the KO row after a reload`);
  check(/data-testid="holding-close"/.test(withKo.body), `${label}: /dashboard lacks the KO last-close cell`);

  // Daily close job (T05). The button shows only on previews; production never.
  const previewPage = await call("GET", "/dashboard", "true", "preview", { cookie: token });
  check(/data-testid="preview-refresh"/.test(previewPage.body) && /Run daily refresh \(preview only\)/.test(previewPage.body), `${label} + VERCEL_ENV=preview: /dashboard lacks the refresh button`);
  const prodNoButton = await call("GET", "/dashboard", "true", "production", { cookie: token });
  check(!/preview-refresh/.test(prodNoButton.body), `${label} + VERCEL_ENV=production: refresh button present`);
  const run1 = await call("POST", REFRESH_PATH, "true", "preview", { cookie: token, body: {} });
  const r1 = run1.status === 200 ? JSON.parse(run1.body) : {};
  check(run1.status === 200 && ["ok", "partial", "locked"].includes(r1.status) && !/KO/.test(run1.body), `${label}: POST refresh -> ${run1.status} ${run1.body}`);
  const afterRun = await call("GET", "/dashboard", "true", "preview", { cookie: token });
  // <span data-testid="holding-close" data-session-date="D">61.23<!-- --> <!-- -->USD<span …>D close</span></span>
  const closeOf = (html) => {
    const m = /data-testid="holding-close" data-session-date="(\d{4}-\d{2}-\d{2})">(.*?)<span/.exec(html);
    return m ? [m[0], m[1], m[2].replace(/<!-- -->/g, "")] : null;
  };
  const closeCell = closeOf(afterRun.body);
  check(closeCell && /^\d+(\.\d+)? USD$/.test(closeCell[2]), `${label}: after the refresh, KO has no stored close (${closeCell ? closeCell[2] : /price pending/.test(afterRun.body) ? "price pending" : "no cell"})`);
  if (closeCell) {
    const nyToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    check(closeCell[1] <= nyToday, `${label}: KO close dated ${closeCell[1]}, after New York's today ${nyToday}`);
  }
  const run2 = await call("POST", REFRESH_PATH, "true", "preview", { cookie: token, body: {} });
  check(run2.status === 200 && JSON.parse(run2.body).inserted === 0, `${label}: second refresh -> ${run2.status} ${run2.body}`);
  const cronOk = await call("GET", CRON_PATH, "true", undefined, { headers: { authorization: `Bearer ${CRON}` } });
  check(cronOk.status === 200 && JSON.parse(cronOk.body).inserted === 0 && !cronOk.body.includes(CRON), `${label}: cron with the right header -> ${cronOk.status} ${cronOk.body.slice(0, 160)}`);
  const reload = await call("GET", "/dashboard", "true", "preview", { cookie: token });
  const closeAgain = closeOf(reload.body);
  check(closeCell && closeAgain && closeAgain[0] === closeCell[0], `${label}: reload changed KO's close (${closeCell?.[0]} -> ${closeAgain?.[0]})`);
  for (const [method, body] of [["GET"], ["PUT", { shares: "999", avgCost: "1" }], ["DELETE"]]) {
    const r = await call(method, `${H}/${koId}`, "true", undefined, { cookie: otherToken, body });
    check(r.status === 404, `${label}: other user ${method} first user's holding -> ${r.status}`);
  }
  const otherList = await call("GET", H, "true", undefined, { cookie: otherToken });
  check(otherList.body === '{"holdings":[]}', `${label}: other user's holdings -> ${otherList.body}`);
  const stillMine = await call("GET", `${H}/${koId}`, "true", undefined, { cookie: token });
  check(stillMine.status === 200 && /"shares":"12(\.0+)?"/.test(stillMine.body), `${label}: KO after the other user's attempts -> ${stillMine.body.slice(0, 120)}`);
  const del = await call("DELETE", `${H}/${koId}`, "true", undefined, { cookie: token });
  check(del.status === 200 && del.body === '{"deleted":true}', `${label}: DELETE KO -> ${del.status} ${del.body}`);
  const gone = await call("GET", H, "true", undefined, { cookie: token });
  check(gone.body === '{"holdings":[]}', `${label}: holdings after delete -> ${gone.body}`);

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
    ? "[check-dashboard-built] OK (with database): allow-list sign-up denied/allowed; signed-in shell, connected 11/11; me; settings isolation (403); holdings CRUD, DASH-08 messages, duplicate, isolation (404); daily refresh (preview button only, close stored, second run and cron insert nothing, reload unchanged); sign-out"
    : "[check-dashboard-built] OK: flag-off 404s match the unknown-path 404 (sign-in and auth routes too); API methods answer JSON; signed out -> sign-in redirect + 401; cron 401/405/503; refresh route preview-only; sign-in off without secret/database (503); status and db OK; db hidden on production",
);
