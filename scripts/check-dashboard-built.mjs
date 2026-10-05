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
 *     unknown path (timestamps aside), with no "dashboard" anywhere in it outside the site menu
 *     (#46: the menu's Dashboard item shows on every page, flag on or off; no item is current on a 404).
 *   Site shell (#46), both flag states: / is home (menu with Orpheus current, one h1, exactly two cards,
 *   the footer reading exactly "Orpheus Wisdom", noindex, no calculator form); /calculator is the calculator
 *   (menu with Calculator current, the form, its listings note, noindex); / with a query string redirects to /calculator with the same query.
 *   - /dashboard/ redirects like any unknown path with a trailing slash.
 *   - Every method on /api/dashboard/{status,db,me,settings,holdings,holdings/1,fx,columns,refresh},
 *     /api/dashboard/*, /api/auth/* and /api/cron/daily-refresh: 404 JSON.
 *   Flag on ("true"), signed out:
 *   - GET /dashboard redirects to /dashboard/sign-in (DASH-04); the sign-in page renders (noindex).
 *   - /api/dashboard/{me,settings,holdings,holdings/1,fx,columns}: 401 JSON for served methods; others 405 JSON.
 *   - /api/dashboard/fx?date=<impossible date> (2026-02-31, 02-29, 02-30, 04-31, 0000-01-01) and the leap
 *     day 2024-02-29 signed out: 401 JSON (gate first, never 500). --with-database: 400 / 200 signed in.
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
 * production status-line rule and sign-out. T06: the base-currency select defaults to CAD; Bank of
 * Canada USD/EUR rates are stored (by the add's background backfill or the refresh; fxErrors 0, fxInserted 0
 * on the second run); GET /api/dashboard/fx returns them for KO's session date; switching the setting to CAD / EUR / USD re-expresses the total
 * (data-base, and CAD total = USD total × the USD rate used). T07: the out-of-date note before any run, then
 * (#55: the list row's name, shares, value and share of the book, the hidden detail panel) KO's stored
 * name, average cost, cost (D8: same rate), return and %, 100.0% share of the book, the one total (no
 * total cost or return), and "Prices as of <KO session> close · FX …" in USD and CAD. T08 → #57: the
 * default chips for a new user, PUT /api/dashboard/columns adds a chip at the end and removes chips (400 for
 * an unknown key, an empty list sticks), the page shows the kept chips and headers only (metric-th), the
 * sheet switch and search, and KO's metric cells render (a missing one as the dash alone). Run it without SEC_CONTACT_EMAIL
 * (the normal case): then the refresh reports fundamentalsSkipped and KO's cells read "coverage check
 * pending"; no SEC request is made by this script.
 * Adding a holding and the refresh call the live price feed and the live Bank of Canada Valet API, so
 * this mode needs network access.
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
// The site menu (#46) is on every page, the 404 included; its Dashboard item is the only allowed mention.
const SITE_MENU = /<nav aria-label="Site" data-testid="site-menu"[\s\S]*?<\/nav>/;
const withoutMenu = (html) => html.replace(SITE_MENU, "");
const menuCurrent = (html) =>
  [...(html.match(SITE_MENU)?.[0] ?? "").matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
// Routes with their own handlers (GET/HEAD when on); everything else under /api/dashboard is the catch-all.
const GATED_API_PATHS = ["/api/dashboard/status", "/api/dashboard/db"];
// Per-user routes: 401 signed out (GET), own data signed in.
const SESSION_API_PATHS = [
  "/api/dashboard/me",
  "/api/dashboard/settings",
  "/api/dashboard/holdings",
  "/api/dashboard/holdings/1",
  "/api/dashboard/fx",
  "/api/dashboard/columns",
];
// Methods each per-user route serves (anything else: 405 JSON when the flag is on).
const SESSION_ALLOW = {
  "/api/dashboard/me": ["GET", "HEAD"],
  "/api/dashboard/settings": ["GET", "HEAD", "PUT"],
  "/api/dashboard/holdings": ["GET", "HEAD", "POST"],
  "/api/dashboard/holdings/1": ["GET", "HEAD", "PUT", "DELETE"],
  "/api/dashboard/fx": ["GET", "HEAD"],
  "/api/dashboard/columns": ["GET", "HEAD", "PUT"],
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
    check(SITE_MENU.test(r.body), `${label}: GET ${path} 404 lacks the site menu`);
    check(menuCurrent(r.body).length === 0, `${label}: GET ${path} 404 marks a menu item current: ${menuCurrent(r.body)}`);
    check(!/dashboard/i.test(withoutMenu(r.body)), `${label}: GET ${path} HTML mentions "dashboard" outside the site menu`);
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

// Site shell (#46): home, calculator, the /?query redirect, menu and footer, flag off and on.
for (const flag of [undefined, "true"]) {
  const label = `site, flag ${flag ?? "unset"}`;
  const NOINDEX = /<meta name="robots" content="noindex, nofollow"\/>/;
  const FOOTER = /<footer[^>]*><p[^>]*data-testid="site-footer"[^>]*>Orpheus Wisdom<\/p><\/footer>/;
  const home = await call("GET", "/", flag);
  check(home.status === 200, `${label}: GET / -> ${home.status}`);
  check(NOINDEX.test(home.body), `${label}: / lacks noindex`);
  check(JSON.stringify(menuCurrent(home.body)) === '["Orpheus"]', `${label}: / current menu item ${menuCurrent(home.body)}`);
  check(/href="\/dashboard"[^>]*>Dashboard</.test(home.body.match(SITE_MENU)?.[0] ?? ""), `${label}: / menu lacks the Dashboard item`);
  const cards = [...home.body.matchAll(/<a href="([^"]+)" data-testid="home-card"[\s\S]*?<h2[^>]*>([^<]*)<\/h2>[\s\S]*?<p[^>]*>([^<]*)<\/p>/g)].map((m) => m.slice(1));
  check(
    JSON.stringify(cards) ===
      JSON.stringify([
        ["/calculator", "Calculator", "compare a lump sum with contributions"],
        ["/dashboard", "Dashboard", "holdings, value, stored figures"],
      ]),
    `${label}: / cards -> ${JSON.stringify(cards)}`,
  );
  check((home.body.match(/data-testid="home-card"/g) ?? []).length === 2, `${label}: / has not exactly two cards`);
  check(!/<form|Compare plans/.test(home.body), `${label}: / renders calculator UI`);
  check(FOOTER.test(home.body), `${label}: / footer is not exactly "Orpheus Wisdom"`);
  const calc = await call("GET", "/calculator", flag);
  check(calc.status === 200 && /Compare plans/.test(calc.body) && /DCA vs lump sum/.test(calc.body), `${label}: GET /calculator -> ${calc.status}`);
  check(NOINDEX.test(calc.body), `${label}: /calculator lacks noindex`);
  check(JSON.stringify(menuCurrent(calc.body)) === '["Calculator"]', `${label}: /calculator current menu item ${menuCurrent(calc.body)}`);
  check(FOOTER.test(calc.body), `${label}: /calculator footer is not exactly "Orpheus Wisdom"`);
  check(/>US, EU and CA listings, one currency per basket\.</.test(calc.body), `${label}: /calculator lacks its listings note`);
  for (const query of ["?ticker=KO", "?ticker=PLTR&start=2020-10-02&end=2026-10-01"]) {
    const r = await call("GET", `/${query}`, flag);
    check(
      r.status >= 300 && r.status < 400 && new URL(r.location ?? "/x", ORIGIN).pathname === "/calculator" && new URL(r.location ?? "/x", ORIGIN).search === query,
      `${label}: GET /${query} -> ${r.status} ${r.location}`,
    );
  }
  if (flag === "true") {
    const signIn = await call("GET", "/dashboard/sign-in", flag);
    check(JSON.stringify(menuCurrent(signIn.body)) === '["Dashboard"]', `${label}: /dashboard/sign-in current menu item ${menuCurrent(signIn.body)}`);
    check(FOOTER.test(signIn.body), `${label}: /dashboard/sign-in footer is not exactly "Orpheus Wisdom"`);
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
  const SEC = process.env.SEC_CONTACT_EMAIL ? "set" : "empty";
  const expected = WITH_DB
    ? `{"dashboard":"enabled","signIn":"ready","signUpAllowList":"set","cronSecret":"set","secContact":"${SEC}"}`
    : `{"dashboard":"enabled","signIn":"not configured (BETTER_AUTH_SECRET not set)","signUpAllowList":"set","cronSecret":"set","secContact":"${SEC}"}`;
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

// QA F1 (T06): impossible calendar dates on /api/dashboard/fx. Signed out the gate answers first
// (401 JSON, never a 500); signed in they are 400 (checked in --with-database mode and in fx.test.ts).
const IMPOSSIBLE_DATES = ["2026-02-31", "2026-02-29", "2026-02-30", "2026-04-31", "0000-01-01"];
for (const date of [...IMPOSSIBLE_DATES, "2024-02-29"]) {
  const r = await call("GET", `/api/dashboard/fx?date=${date}`, "true");
  check(
    r.status === 401 && /application\/json/.test(r.type) && r.body === '{"error":"Unauthorized."}',
    `flag "true", signed out: GET /api/dashboard/fx?date=${date} -> ${r.status} ${r.body.slice(0, 60)}`,
  );
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
  // #56 (DR3-01): Ticker, Shares, Average cost marked optional, Add; no placeholder sentences.
  const form = /<form[^>]*data-testid="holding-form"[^>]*>(.*?)<\/form>/s.exec(page.body)?.[1] ?? "";
  check(
    (form.match(/<input/g) ?? []).length === 3 && /aria-label="Average cost \(optional\)"/.test(form) && /Average cost \(optional\)</.test(form) &&
      [...form.matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1]).join("|") === "optional" && />Add<\/button>/.test(form),
    `${label}: add form is not Ticker / Shares / Average cost (optional) / Add with only the "optional" placeholder`,
  );
  // #55: the empty state is one line, "Add a holding", with no list, total, chart or helper paragraph.
  check(/data-testid="holdings-empty"[^>]*>Add a holding</.test(page.body), `${label}: GET /dashboard lacks the "Add a holding" empty state`);
  check(!/data-testid="holdings-(list|total-line|pie)"/.test(page.body) && !/Average cost is per share/.test(page.body), `${label}: empty /dashboard shows a list, total, chart or the old helper paragraph`);
  check(/Signed in as (<!-- -->)?qa-allowed@example\.com/.test(page.body), `${label}: GET /dashboard lacks "Signed in as"`);
  check(/Database: connected · 11\/11 tables/.test(page.body), `${label}: GET /dashboard lacks "Database: connected · 11/11 tables"`);
  check(!/data-testid="preview-refresh"/.test(page.body), `${label}: refresh button shown without VERCEL_ENV=preview`);
  const me = await call("GET", "/api/dashboard/me", "true", undefined, { cookie: token });
  check(me.status === 200 && me.body.includes(`"email":"${ALLOWED}"`), `${label}: GET me -> ${me.status} ${me.body}`);
  // Base currency (T06): CAD until changed.
  check(/data-testid="base-currency-select"/.test(page.body) && /<option value="CAD" selected="">/.test(page.body), `${label}: /dashboard lacks the base-currency select with CAD selected`);
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
  // T15 (#23): KO has no close yet → no slice, listed as price pending; the total row flags the exclusion.
  check(/data-testid="holdings-pie-empty"/.test(withKo.body) && /data-testid="pie-price-pending"[^>]*>price pending: (<!-- -->)?KO</.test(withKo.body), `${label}: pie before any close lacks the empty state / price-pending list`);
  check(/data-testid="holdings-total-excluded-count"[^>]*>1 holding without a price excluded</.test(withKo.body), `${label}: total row lacks "1 holding without a price excluded"`);
  // T07: no daily run has finished yet on this fresh database, so the out-of-date note shows.
  check(/data-testid="stale-note"[^>]*>Prices are out of date\.(<!-- -->)? (<!-- -->)?No daily refresh has completed yet\./.test(withKo.body), `${label}: /dashboard before any run lacks the out-of-date note`);

  // Daily close job (T05). The button shows only on previews; production never.
  const previewPage = await call("GET", "/dashboard", "true", "preview", { cookie: token });
  check(/data-testid="preview-refresh"/.test(previewPage.body) && /Run daily refresh \(preview only\)/.test(previewPage.body), `${label} + VERCEL_ENV=preview: /dashboard lacks the refresh button`);
  const prodNoButton = await call("GET", "/dashboard", "true", "production", { cookie: token });
  check(!/preview-refresh/.test(prodNoButton.body), `${label} + VERCEL_ENV=production: refresh button present`);
  const run1 = await call("POST", REFRESH_PATH, "true", "preview", { cookie: token, body: {} });
  const r1 = run1.status === 200 ? JSON.parse(run1.body) : {};
  check(run1.status === 200 && ["ok", "partial", "locked"].includes(r1.status) && !/KO/.test(run1.body), `${label}: POST refresh -> ${run1.status} ${run1.body}`);
  // Adding KO already ran the background backfill (closes + FX), so the run may insert nothing new.
  check(Number.isInteger(r1.fxInserted) && r1.fxErrors === 0, `${label}: refresh FX fields -> ${run1.body}`);
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
  check(run2.status === 200 && JSON.parse(run2.body).inserted === 0 && JSON.parse(run2.body).fxInserted === 0, `${label}: second refresh -> ${run2.status} ${run2.body}`);
  const cronOk = await call("GET", CRON_PATH, "true", undefined, { headers: { authorization: `Bearer ${CRON}` } });
  check(cronOk.status === 200 && JSON.parse(cronOk.body).inserted === 0 && !cronOk.body.includes(CRON), `${label}: cron with the right header -> ${cronOk.status} ${cronOk.body.slice(0, 160)}`);
  const reload = await call("GET", "/dashboard", "true", "preview", { cookie: token });
  const closeAgain = closeOf(reload.body);
  check(closeCell && closeAgain && closeAgain[0] === closeCell[0], `${label}: reload changed KO's close (${closeCell?.[0]} -> ${closeAgain?.[0]})`);
  // FX and base currency (T06). The base is USD (set above), so KO's value needs no rate.
  const totalOf = (html) => {
    const m = /data-testid="holdings-total" data-base="([A-Z]{3})">(.*?)(<span|<\/td>|<\/span>)/.exec(html);
    return m ? { base: m[1], text: m[2].replace(/<!-- -->/g, ""), n: Number(m[2].replace(/<!-- -->|,/g, "").split(" ")[0]) } : null;
  };
  const usdTotal = totalOf(reload.body);
  check(usdTotal && usdTotal.base === "USD" && / USD$/.test(usdTotal.text) && usdTotal.n > 0, `${label}: USD total -> ${JSON.stringify(usdTotal)}`);
  const fxRes = closeCell ? await call("GET", `/api/dashboard/fx?date=${closeCell[1]}`, "true", undefined, { cookie: token }) : { status: 0, body: "{}" };
  const fxBody = fxRes.status === 200 ? JSON.parse(fxRes.body) : { rates: [] };
  const usdRate = fxBody.rates.find((r) => r.quote === "USD");
  check(usdRate && /^\d+\.\d+$/.test(usdRate.cadPerUnit) && usdRate.rateDate <= closeCell[1] && fxBody.rates.some((r) => r.quote === "EUR"), `${label}: GET fx?date=${closeCell?.[1]} -> ${fxRes.status} ${fxRes.body.slice(0, 300)}`);
  for (const date of IMPOSSIBLE_DATES) {
    const r = await call("GET", `/api/dashboard/fx?date=${date}`, "true", undefined, { cookie: token });
    check(r.status === 400 && /application\/json/.test(r.type), `${label}: GET fx?date=${date} -> ${r.status} ${r.body.slice(0, 80)} (want 400)`);
  }
  const leap = await call("GET", "/api/dashboard/fx?date=2024-02-29", "true", undefined, { cookie: token });
  check(leap.status === 200, `${label}: GET fx?date=2024-02-29 -> ${leap.status} (want 200)`);
  const pages = {};
  const asBase = async (base) => {
    const r = await call("PUT", "/api/dashboard/settings", "true", undefined, { cookie: token, body: { baseCurrency: base } });
    check(r.status === 200, `${label}: PUT settings ${base} -> ${r.status} ${r.body}`);
    pages[base] = (await call("GET", "/dashboard", "true", undefined, { cookie: token })).body;
    return totalOf(pages[base]);
  };
  const cadTotal = await asBase("CAD");
  check(cadTotal && cadTotal.base === "CAD" && usdRate && Math.abs(cadTotal.n - usdTotal.n * Number(usdRate.cadPerUnit)) <= 0.011, `${label}: CAD total ${JSON.stringify(cadTotal)} != USD total × ${usdRate?.cadPerUnit}`);
  const eurTotal = await asBase("EUR");
  check(eurTotal && eurTotal.base === "EUR" && / EUR$/.test(eurTotal.text) && eurTotal.n !== usdTotal.n, `${label}: EUR total -> ${JSON.stringify(eurTotal)}`);
  const backToUsd = await asBase("USD");
  check(backToUsd && backToUsd.n === usdTotal.n, `${label}: back to USD -> ${JSON.stringify(backToUsd)}`);
  // Valuation (T07, DASH-13/25). KO: 12 shares, average cost 50 USD.
  const textOf = (html, id) => {
    const m = new RegExp(`data-testid="${id}"[^>]*>((?:[^<]|<!-- -->)*)`).exec(html);
    return m ? m[1].replace(/<!-- -->/g, "").trim() : null;
  };
  const fmt = (n, sign) => new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2, ...(sign ? { signDisplay: "exceptZero" } : {}) }).format(n);
  const usdPage = reload.body;
  // #55: the list row shows name, shares, value and share of the book; the rest is in the (server-rendered,
  // hidden) detail panel opened by a tap. The old T07 table headers are gone.
  for (const id of ["holding-row-toggle", "holding-name", "holding-shares", "holding-value", "holding-weight", "holding-detail"])
    check(new RegExp(`data-testid="${id}"`).test(usdPage), `${label}: /dashboard KO row lacks ${id}`);
  check(!/>Cost \(USD\)<\/th>|>Total return<\/th>|>% of portfolio<\/th>/.test(usdPage.replace(/<!-- -->/g, "")), `${label}: the old holdings table is still rendered`);
  check(/data-testid="holding-shares"[^>]*>12(<!-- -->)?<span[^>]*> shares<\/span>/.test(usdPage), `${label}: KO row shares -> ${textOf(usdPage, "holding-shares")}`);
  // QA N1: the header row is aria-hidden, so each row number carries its own visually hidden label.
  check(/data-testid="holding-shares"[^>]*>12(<!-- -->)?<span class="sm:sr-only"> shares<\/span>/.test(usdPage) && /data-testid="holding-value-label"> value </.test(usdPage) && /data-testid="holding-weight-label"> share of book </.test(usdPage), `${label}: KO row numbers lack their accessible labels`);
  const koName = textOf(usdPage, "holding-name");
  check(koName && koName !== "KO" && koName !== "—", `${label}: KO name (stored company name) -> ${koName}`);
  check(textOf(usdPage, "holding-avg-cost") === "50 USD", `${label}: KO average cost -> ${textOf(usdPage, "holding-avg-cost")}`);
  check(textOf(usdPage, "holding-cost") === "600.00 USD", `${label}: KO cost -> ${textOf(usdPage, "holding-cost")}`);
  const koClose = closeCell ? Number(closeCell[2].split(" ")[0]) : NaN;
  check(textOf(usdPage, "holding-return") === `${fmt(12 * koClose - 600, true)} USD`, `${label}: KO total return -> ${textOf(usdPage, "holding-return")} (close ${koClose})`);
  check(textOf(usdPage, "holding-return-pct") === `${fmt(((koClose - 50) / 50) * 100, true)}%`, `${label}: KO return % -> ${textOf(usdPage, "holding-return-pct")}`);
  check(textOf(usdPage, "holding-weight") === "100.0%" && textOf(usdPage, "holding-detail-weight") === "100.0%", `${label}: share of the book -> ${textOf(usdPage, "holding-weight")} / ${textOf(usdPage, "holding-detail-weight")}`);
  // T15 (#23): one slice, KO 100.0%, same as the table's % of portfolio; no exclusion note.
  check(/data-testid="holdings-pie" data-slices="1"/.test(usdPage) && textOf(usdPage, "pie-slice-pct") === "100.0%" && /data-testid="pie-slice" data-label="KO"/.test(usdPage), `${label}: pie -> ${textOf(usdPage, "pie-slice-pct")}`);
  check(!/data-testid="holdings-total-excluded-count"/.test(usdPage) && !/data-testid="pie-price-pending"/.test(usdPage), `${label}: exclusion note shown with every holding priced`);
  // #55 (EL 2026-10-04): one total, value only; no total cost or total return on the page.
  check(!/data-testid="holdings-total-(cost|return|weight)"/.test(usdPage), `${label}: total cost / return / weight still rendered`);
  check(textOf(usdPage, "as-of") === `Prices as of ${closeCell?.[1]} close · FX not needed (all in USD)`, `${label}: USD as-of -> ${textOf(usdPage, "as-of")}`);
  check(!/data-testid="stale-note"/.test(usdPage), `${label}: out-of-date note shown right after a successful run`);
  check(textOf(pages.CAD, "as-of") === `Prices as of ${closeCell?.[1]} close · FX ${usdRate?.rateDate}`, `${label}: CAD as-of -> ${textOf(pages.CAD, "as-of")}`);
  check(textOf(pages.CAD, "holding-cost") === `${fmt(600 * Number(usdRate?.cadPerUnit))} CAD`, `${label}: KO cost in CAD -> ${textOf(pages.CAD, "holding-cost")} (rate ${usdRate?.cadPerUnit})`);
  // #56 (DR3-02..04): a blank cost is stored as no cost (null) and the detail's average cost, cost and
  // return render blank, while value, share of the book, the total and the pie still count the holding.
  // Entering a cost again fills them. A POST without a cost (missing, or "") saves with avgCost null.
  const isBlank = (html, id) => new RegExp(`data-testid="${id}" data-blank="true"></span>`).test(html);
  // #57 (EL): on PUT an omitted avgCost keeps the stored cost, only an explicit null clears it, "" is a 400.
  const keepCost = await call("PUT", `${H}/${koId}`, "true", undefined, { cookie: token, body: { shares: "12" } });
  check(keepCost.status === 200 && /"avgCost":"50(\.0+)?"/.test(keepCost.body), `${label}: PUT KO without avgCost keeps 50 -> ${keepCost.status} ${keepCost.body.slice(0, 160)}`);
  const blankCost = await call("PUT", `${H}/${koId}`, "true", undefined, { cookie: token, body: { shares: "12", avgCost: "" } });
  check(blankCost.status === 400 && /"field":"avgCost"/.test(blankCost.body), `${label}: PUT KO avgCost "" -> ${blankCost.status} ${blankCost.body.slice(0, 160)}`);
  const clear = await call("PUT", `${H}/${koId}`, "true", undefined, { cookie: token, body: { shares: "12", avgCost: null } });
  check(clear.status === 200 && /"avgCost":null/.test(clear.body), `${label}: PUT KO avgCost null -> ${clear.status} ${clear.body.slice(0, 160)}`);
  const stillBlank = await call("PUT", `${H}/${koId}`, "true", undefined, { cookie: token, body: { shares: "12" } });
  check(stillBlank.status === 200 && /"avgCost":null/.test(stillBlank.body), `${label}: PUT KO without avgCost keeps no cost -> ${stillBlank.body.slice(0, 160)}`);
  const noCostPage = (await call("GET", "/dashboard", "true", undefined, { cookie: token })).body;
  for (const id of ["holding-avg-cost", "holding-cost", "holding-return"])
    check(isBlank(noCostPage, id) && textOf(noCostPage, id) === "", `${label}: no cost, ${id} -> ${JSON.stringify(textOf(noCostPage, id))} (want blank)`);
  check(!/data-testid="holding-return-pct"/.test(noCostPage) && !/NaN|n\/m/.test(noCostPage.replace(/<script.*?<\/script>/gs, "")), `${label}: no cost, return % / NaN / n/m rendered`);
  check(textOf(noCostPage, "holding-weight") === "100.0%" && textOf(noCostPage, "holding-detail-weight") === "100.0%", `${label}: no cost, share of the book -> ${textOf(noCostPage, "holding-weight")}`);
  check(JSON.stringify(totalOf(noCostPage)) === JSON.stringify(backToUsd), `${label}: no cost, total -> ${JSON.stringify(totalOf(noCostPage))} (want ${JSON.stringify(backToUsd)})`);
  check(/data-testid="holdings-pie" data-slices="1"/.test(noCostPage) && textOf(noCostPage, "pie-slice-pct") === "100.0%", `${label}: no cost, pie -> ${textOf(noCostPage, "pie-slice-pct")}`);
  const refill = await call("PUT", `${H}/${koId}`, "true", undefined, { cookie: token, body: { shares: "12", avgCost: "50" } });
  check(refill.status === 200 && /"avgCost":"50(\.0+)?"/.test(refill.body), `${label}: PUT KO avgCost 50 again -> ${refill.status} ${refill.body.slice(0, 160)}`);
  const refilled = (await call("GET", "/dashboard", "true", undefined, { cookie: token })).body;
  check(textOf(refilled, "holding-avg-cost") === "50 USD" && textOf(refilled, "holding-cost") === "600.00 USD" && textOf(refilled, "holding-return") === `${fmt(12 * koClose - 600, true)} USD`, `${label}: cost entered again -> ${textOf(refilled, "holding-avg-cost")} / ${textOf(refilled, "holding-cost")} / ${textOf(refilled, "holding-return")}`);
  for (const body of [{ symbol: "RY.TO", shares: "3" }, { symbol: "RY.TO", shares: "3", avgCost: "" }]) {
    const r = await call("POST", H, "true", undefined, { cookie: token, body });
    check(r.status === 201 && /"symbol":"RY.TO"/.test(r.body) && /"avgCost":null/.test(r.body), `${label}: POST ${JSON.stringify(body)} -> ${r.status} ${r.body.slice(0, 160)}`);
    const id = r.status === 201 ? JSON.parse(r.body).holding.id : 0;
    const got = await call("GET", `${H}/${id}`, "true", undefined, { cookie: token });
    check(got.status === 200 && /"avgCost":null/.test(got.body), `${label}: RY.TO without cost after reload -> ${got.status} ${got.body.slice(0, 160)}`);
    const d = await call("DELETE", `${H}/${id}`, "true", undefined, { cookie: token });
    check(d.status === 200, `${label}: DELETE RY.TO -> ${d.status}`);
  }
  for (const [method, body] of [["GET"], ["PUT", { shares: "999", avgCost: "1" }], ["DELETE"]]) {
    const r = await call(method, `${H}/${koId}`, "true", undefined, { cookie: otherToken, body });
    check(r.status === 404, `${label}: other user ${method} first user's holding -> ${r.status}`);
  }
  const otherList = await call("GET", H, "true", undefined, { cookie: otherToken });
  check(otherList.body === '{"holdings":[]}', `${label}: other user's holdings -> ${otherList.body}`);
  const stillMine = await call("GET", `${H}/${koId}`, "true", undefined, { cookie: token });
  check(stillMine.status === 200 && /"shares":"12(\.0+)?"/.test(stillMine.body), `${label}: KO after the other user's attempts -> ${stillMine.body.slice(0, 120)}`);
  // Metric columns (T08, DASH-15) and the metric cells (DASH-21 wording comes from the same component).
  if (!process.env.SEC_CONTACT_EMAIL)
    check(r1.fundamentalsSkipped === true && r1.fundamentalsChecked === 0, `${label}: refresh without SEC_CONTACT_EMAIL -> ${run1.body}`);
  // Metric chips (#57, DR4; T08's columns API). A user who never saved chips gets the defaults; adding puts a
  // chip at the end; a chip removes itself; an empty list sticks; per user; the page shows the kept chips only.
  const COLS = "/api/dashboard/columns";
  const DEFAULTS = ["rev_g_1y", "roic_1y", "share_of_book"];
  const colsOf = async (tok = token) => {
    const r = await call("GET", COLS, "true", undefined, { cookie: tok });
    return r.status === 200 ? JSON.parse(r.body).columns : `status ${r.status}`;
  };
  const firstGet = await call("GET", COLS, "true", undefined, { cookie: token });
  const first = firstGet.status === 200 ? JSON.parse(firstGet.body) : {};
  check(JSON.stringify(first.columns) === JSON.stringify(DEFAULTS) && first.saved === false && first.available?.length === 9, `${label}: default chips -> ${firstGet.body.slice(0, 200)}`);
  const defPage = (await call("GET", "/dashboard", "true", undefined, { cookie: token })).body;
  const chipsOn = (html) => [...html.matchAll(/data-testid="metric-chip" data-key="([a-z0-9_]+)"/g)].map((m) => m[1]);
  check(JSON.stringify(chipsOn(defPage)) === JSON.stringify(DEFAULTS), `${label}: default chips on /dashboard -> ${JSON.stringify(chipsOn(defPage))}`);
  check(/data-testid="sheet-switch"/.test(defPage) && /data-testid="metric-search"/.test(defPage) && /aria-label="Remove Share of the book"/.test(defPage), `${label}: /dashboard lacks the sheet switch, the metric search or a chip's remove control`);
  check(!/data-testid="metric-picker"|data-testid="metric-add-select"|aria-label="Move /.test(defPage), `${label}: the old column picker is still rendered`);
  check(/data-testid="metric-cell" data-key="share_of_book" data-status="ok">100\.0%</.test(defPage), `${label}: KO Share of the book chip cell is not 100.0%`);
  // QA D1 (#63): the table's scroll box is positioned (`relative`), so sr-only text in "—" cells stays inside it.
  check(/<div class="relative [^"]*overflow-x-auto" data-testid="metric-scroll">/.test(defPage), `${label}: metrics scroll box is not positioned (QA D1)`);
  for (const [cols, want] of [
    [[...DEFAULTS, "gross_margin_1y"], [...DEFAULTS, "gross_margin_1y"]],
    [["rev_g_1y", "share_of_book", "gross_margin_1y"], ["rev_g_1y", "share_of_book", "gross_margin_1y"]],
    [["eps_1y", "roic_1y"], ["eps_1y", "roic_1y"]],
  ]) {
    const r = await call("PUT", COLS, "true", undefined, { cookie: token, body: { columns: cols } });
    check(r.status === 200 && JSON.stringify(await colsOf()) === JSON.stringify(want), `${label}: PUT chips ${cols} -> ${r.status} ${r.body.slice(0, 120)}`);
  }
  const badCol = await call("PUT", COLS, "true", undefined, { cookie: token, body: { columns: ["nope"] } });
  check(badCol.status === 400 && badCol.body === JSON.stringify({ error: "Unknown metric column: nope." }), `${label}: PUT unknown column -> ${badCol.status} ${badCol.body}`);
  check(JSON.stringify(await colsOf(otherToken)) === JSON.stringify(DEFAULTS), `${label}: other user's chips -> ${JSON.stringify(await colsOf(otherToken))}`);
  const colPage = (await call("GET", "/dashboard", "true", undefined, { cookie: token })).body;
  const ths = [...colPage.matchAll(/data-testid="metric-th" data-key="([a-z0-9_]+)"/g)].map((m) => m[1]);
  check(JSON.stringify(ths) === JSON.stringify(["eps_1y", "roic_1y"]) && JSON.stringify(chipsOn(colPage)) === JSON.stringify(["eps_1y", "roic_1y"]), `${label}: metric headers / chips on /dashboard -> ${JSON.stringify(ths)}`);
  const cells = [...colPage.matchAll(/data-testid="metric-cell" data-key="([a-z0-9_]+)" data-status="([a-z_/]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  const wantStatus = process.env.SEC_CONTACT_EMAIL ? /^(eps_1y|roic_1y):(not_computed|ok|n\/m|insufficient_history)$/ : /^(eps_1y|roic_1y):pending$/;
  check(cells.length === 2 && cells.every((c) => wantStatus.test(c)), `${label}: KO metric cells -> ${JSON.stringify(cells)}`);
  // DR4-07: a missing figure is the dash alone; the reason is screen-reader text (and the tooltip).
  check(!process.env.SEC_CONTACT_EMAIL ? /data-testid="metric-cell" data-key="eps_1y" data-status="pending" title="[^"]*">—<span class="sr-only"> (<!-- -->)?coverage check pending<\/span><\/span>/.test(colPage) : true, `${label}: pending metric cell is not the dash alone`);
  // QA N3 (#44): the EPS column's portfolio cell carries a visible sub-label (not only the tooltip).
  check(/data-testid="portfolio-metric" data-key="eps_1y"[^>]*>(?:(?!<\/td>).)*data-testid="portfolio-metric-label"[^>]*>EPS growth 1y \(weighted\)</s.test(colPage), `${label}: EPS portfolio cell lacks the visible "EPS growth 1y (weighted)" sub-label`);
  check(!/data-testid="portfolio-metric" data-key="roic_1y"[^>]*>(?:(?!<\/td>).)*portfolio-metric-label/s.test(colPage), `${label}: non-EPS portfolio cell has an EPS sub-label`);
  const none = await call("PUT", COLS, "true", undefined, { cookie: token, body: { columns: [] } });
  const nonePage = (await call("GET", "/dashboard", "true", undefined, { cookie: token })).body;
  check(none.status === 200 && JSON.stringify(await colsOf()) === "[]" && chipsOn(nonePage).length === 0 && !/data-testid="metric-th"/.test(nonePage), `${label}: removing every chip does not stick -> ${none.status} ${JSON.stringify(await colsOf())}`);
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
    ? "[check-dashboard-built] OK (with database): allow-list sign-up denied/allowed; signed-in shell, connected 11/11; me; settings isolation (403); holdings CRUD, DASH-08 messages, duplicate, isolation (404); daily refresh (preview button only, close stored, second run and cron insert nothing, reload unchanged); FX (BoC rates stored once, /api/dashboard/fx, base CAD default, USD/CAD/EUR totals re-expressed); valuation (list row + detail, cost, return, share of the book, one total, as-of line, out-of-date note); optional cost (#56: add form, blank cost saves as null, cost/return blank then filled again; #57: PUT without avgCost keeps it, null clears it); metric chips (#57: defaults, add at the end, remove, empty sticks, 400, per user, chips / headers / cells on the page, dash alone); sign-out"
    : "[check-dashboard-built] OK: flag-off 404s match the unknown-path 404 (sign-in and auth routes too); site shell (home cards, calculator, /?query redirect, menu, footer); API methods answer JSON; signed out -> sign-in redirect + 401; cron 401/405/503; refresh route preview-only; fx and columns 401/405; sign-in off without secret/database (503); status and db OK; db hidden on production",
);
