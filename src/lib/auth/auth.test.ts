// Offline tests for T03 (#11): Better Auth email/password with the sign-up allow-list (D12),
// sessions, the per-user dashboard APIs (401/403/404/405) and cross-user isolation (DASH-06),
// plus the auth migrations. Runs on PGLite (Postgres in WASM): no network, no Neon, no secrets.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import {
  allowListFromEnv,
  authOrigins,
  authReadiness,
  isEmailAllowed,
  parseAllowList,
  SIGNUP_ALLOWLIST_ENV,
} from "./config.ts";
import { createOrpheusAuth, SESSION_TOKEN_COOKIE, SIGNUP_NOT_ALLOWED_MESSAGE } from "./instance.server.ts";
import { pgliteDialect } from "./pglite-dialect.ts";
import {
  dashboardAuthDiagnostics,
  handleAuthRequest,
  handleDashboardMeRequest,
  handleDashboardSettingsRequest,
  type DashboardApiDeps,
} from "../dashboard/session.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";

const ORIGIN = "http://localhost:3000";
// A fixed test-only value (not a real secret): Better Auth needs >= 32 chars.
const TEST_SECRET = "test-only-secret-0123456789abcdef0123456789";
const ON = { DASHBOARD_ENABLED: "true" };

let pg: PGlite;
let db: Queryable;
let auth: ReturnType<typeof createOrpheusAuth>;

async function applyMigrations(target: PGlite) {
  await target.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const done = (await target.query<{ name: string }>("SELECT name FROM _migrations")).rows.map((r) => r.name);
  const applied: string[] = [];
  for (const { name } of pendingMigrations(readdirSync("migrations"), done)) {
    await target.transaction(async (tx) => {
      await tx.exec(readFileSync(`migrations/${name}`, "utf8"));
      await tx.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    });
    applied.push(name);
  }
  return applied;
}

before(async () => {
  pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  await pg.waitReady;
  await applyMigrations(pg);
  db = { query: async (text, params) => (await pg.query(text, params)).rows as never[] };
  auth = createOrpheusAuth({
    database: { dialect: pgliteDialect(() => pg), type: "postgres" },
    secret: TEST_SECRET,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    allowList: parseAllowList(" Alice@Example.com, bob@example.com ;carol@example.com"),
  });
});
after(async () => {
  await pg.close();
});

const post = (path: string, body: unknown, cookie?: string) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );

/** `name=value` pairs from Set-Cookie, ready for a Cookie header. */
const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");

const deps = (env: Record<string, string | undefined> = ON): DashboardApiDeps => ({
  env,
  getUser: async (headers) => {
    const session = await auth.api.getSession({ headers });
    return session?.user ? { id: session.user.id, email: session.user.email } : null;
  },
  getDb: async () => db,
});

const api = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
};

const userCount = async (email: string) =>
  (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "user" WHERE lower(email) = lower($1)`, [email]))
    .rows[0].n;

describe("auth migrations", () => {
  it("0001_auth.sql is applied with 0002 and 0003; a re-run is a no-op", async () => {
    // (scripts/migration-plan.test.mjs checks it stays a verbatim copy of migrations/auth/.)
    const names = (await pg.query<{ name: string }>("SELECT name FROM _migrations ORDER BY name")).rows.map((r) => r.name);
    assert.deepEqual(names, ["0001_auth.sql", "0002_dashboard.sql", "0003_user_settings_fk.sql"]);
    await pg.exec(readFileSync("migrations/0001_auth.sql", "utf8"));
    await pg.exec(readFileSync("migrations/0003_user_settings_fk.sql", "utf8"));
    const fks = await pg.query(
      "SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_user_id_fkey'",
    );
    assert.equal(fks.rows.length, 1);
  });

  it("works on a database that had 0002 before 0001 (the shared preview database)", async () => {
    const old = new PGlite();
    await old.exec("CREATE TABLE _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await old.exec(readFileSync("migrations/0002_dashboard.sql", "utf8"));
    await old.query("INSERT INTO _migrations (name) VALUES ('0002_dashboard.sql')");
    await old.exec("INSERT INTO user_settings (user_id) VALUES ('orphan-test-row')");
    assert.deepEqual(await applyMigrations(old), ["0001_auth.sql", "0003_user_settings_fk.sql"]);
    assert.equal((await old.query("SELECT 1 FROM user_settings")).rows.length, 0, "orphan test row removed");
    await assert.rejects(
      old.exec("INSERT INTO user_settings (user_id) VALUES ('nobody')"),
      (err: { code?: string }) => err.code === "23503",
    );
    await old.close();
  });
});

describe("config", () => {
  it("parses the allow-list case-insensitively and fails closed", () => {
    const list = parseAllowList(" A@x.com,b@Y.com;\n c@z.com  not-an-email ");
    assert.deepEqual([...list], ["a@x.com", "b@y.com", "c@z.com"]);
    assert.equal(isEmailAllowed(" B@y.COM ", list), true);
    assert.equal(isEmailAllowed("d@x.com", list), false);
    assert.equal(isEmailAllowed(undefined, list), false);
    assert.equal(parseAllowList(undefined).size, 0);
    assert.equal(parseAllowList("  ").size, 0);
    assert.equal(SIGNUP_ALLOWLIST_ENV, "DASHBOARD_SIGNUP_ALLOWLIST");
    assert.deepEqual([...allowListFromEnv({ DASHBOARD_SIGNUP_ALLOWLIST: "Q@q.io" })], ["q@q.io"]);
  });

  it("derives origins: production from BETTER_AUTH_URL, previews from Vercel hosts, local loopback", () => {
    assert.deepEqual(authOrigins({ VERCEL_ENV: "production", BETTER_AUTH_URL: "https://orpheus-app-beta.vercel.app/" }), {
      baseURL: "https://orpheus-app-beta.vercel.app",
      trustedOrigins: ["https://orpheus-app-beta.vercel.app"],
    });
    assert.equal(authOrigins({ VERCEL_ENV: "production" }).baseURL, undefined);
    const preview = authOrigins({
      VERCEL_ENV: "preview",
      VERCEL_URL: "orpheus-abc123.vercel.app",
      VERCEL_BRANCH_URL: "orpheus-app-git-feat-x.vercel.app",
      BETTER_AUTH_URL: "https://orpheus-app-beta.vercel.app",
    });
    assert.deepEqual(preview.trustedOrigins, [
      "https://orpheus-app-git-feat-x.vercel.app",
      "https://orpheus-abc123.vercel.app",
    ]);
    assert.deepEqual(preview.baseURL, {
      allowedHosts: ["orpheus-app-git-feat-x.vercel.app", "orpheus-abc123.vercel.app"],
      protocol: "https",
      fallback: "https://orpheus-app-git-feat-x.vercel.app",
    });
    assert.ok(!preview.trustedOrigins.includes("https://orpheus-app-beta.vercel.app"), "previews ignore BETTER_AUTH_URL");
    assert.equal(authOrigins({ VERCEL_ENV: "preview" }).baseURL, undefined);
    const local = authOrigins({});
    assert.equal(typeof local.baseURL, "object");
    assert.ok(local.trustedOrigins.includes("http://localhost:*"));
  });

  it("readiness names what is missing, never values", () => {
    const vercel = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" };
    assert.deepEqual(authReadiness({ ...vercel, BETTER_AUTH_SECRET: "s".repeat(40) }, true), { ready: true });
    assert.deepEqual(authReadiness(vercel, true), { ready: false, reason: "BETTER_AUTH_SECRET not set" });
    assert.deepEqual(authReadiness({ ...vercel, BETTER_AUTH_SECRET: "s".repeat(40) }, false), {
      ready: false,
      reason: "no database URL set",
    });
    assert.deepEqual(authReadiness({ ...vercel, VITE_AUTH_ENABLED: "false" }, true), {
      ready: false,
      reason: "VITE_AUTH_ENABLED=false",
    });
    assert.deepEqual(authReadiness({ VERCEL: "1", VERCEL_ENV: "production", BETTER_AUTH_SECRET: "s" }, true), {
      ready: false,
      reason: "BETTER_AUTH_URL not set",
    });
    assert.deepEqual(authReadiness({}, false), { ready: true }, "local runs use PGLite and a per-process secret");
  });
});

describe("preview diagnostics", () => {
  it("names the missing piece and whether the allow-list is set, never values", () => {
    const vercel = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" };
    assert.deepEqual(dashboardAuthDiagnostics({ ...vercel, VITE_AUTH_ENABLED: "false" }), {
      signIn: "not configured (VITE_AUTH_ENABLED=false)",
      signUpAllowList: "empty",
    });
    const ready = dashboardAuthDiagnostics({
      ...vercel,
      BETTER_AUTH_SECRET: "never-shown-secret-value-0123456789abcdef",
      orpheus_app_preview_DATABASE_URL: "postgresql://u:never-shown@h/db",
      DASHBOARD_SIGNUP_ALLOWLIST: "hidden@example.com",
    });
    assert.deepEqual(ready, { signIn: "ready", signUpAllowList: "set" });
    assert.doesNotMatch(JSON.stringify(ready), /never-shown|hidden@/);
  });
});

describe("sign-up allow-list (D12)", () => {
  it("lets an allow-listed email sign up, matching case-insensitively", async () => {
    const res = await post("/sign-up/email", { email: "ALICE@example.COM", password: "alice-password-1", name: "alice" });
    assert.equal(res.status, 200, await res.clone().text());
    assert.match(res.headers.getSetCookie().join("\n"), new RegExp(SESSION_TOKEN_COOKIE.replace(/[.]/g, "\\.")));
    assert.equal(await userCount("alice@example.com"), 1);
  });

  it("refuses an email outside the list (403, no user row), even one that looks similar", async () => {
    for (const email of ["mallory@example.com", "alice@example.com.evil.io", "alice+x@example.com"]) {
      const res = await post("/sign-up/email", { email, password: "mallory-password-1", name: "m" });
      assert.equal(res.status, 403, email);
      const body = (await res.json()) as { message?: string };
      assert.equal(body.message, SIGNUP_NOT_ALLOWED_MESSAGE);
      assert.equal(res.headers.getSetCookie().length, 0);
      assert.equal(await userCount(email), 0);
    }
  });

  it("refuses everyone when the list is empty (fail closed)", async () => {
    const closed = createOrpheusAuth({
      database: { dialect: pgliteDialect(() => pg), type: "postgres" },
      secret: TEST_SECRET,
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      allowList: parseAllowList(undefined),
    });
    const res = await closed.handler(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ email: "bob@example.com", password: "bob-password-1", name: "bob" }),
      }),
    );
    assert.equal(res.status, 403);
    assert.equal(await userCount("bob@example.com"), 0);
  });

  it("rejects a sign-up from an untrusted origin", async () => {
    const res = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example", cookie: "x=1" },
        body: JSON.stringify({ email: "carol@example.com", password: "carol-password-1", name: "c" }),
      }),
    );
    assert.equal(res.status, 403);
    assert.equal(await userCount("carol@example.com"), 0);
  });
});

describe("sign-in, session, sign-out (DASH-05)", () => {
  it("signs in with the right password only; the session resolves; sign-out ends it", async () => {
    const bad = await post("/sign-in/email", { email: "alice@example.com", password: "wrong-password" });
    assert.equal(bad.status, 401);
    const ok = await post("/sign-in/email", { email: "Alice@Example.com", password: "alice-password-1" });
    assert.equal(ok.status, 200);
    const cookie = cookieFrom(ok);
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session?.user.email, "alice@example.com");
    // A later request with only the token cookie (no cache cookie) still resolves: survives a reload.
    const tokenOnly = cookie.split("; ").filter((c) => c.startsWith(`${SESSION_TOKEN_COOKIE}=`)).join("; ");
    assert.equal((await auth.api.getSession({ headers: new Headers({ cookie: tokenOnly }) }))?.user.email, "alice@example.com");
    const out = await post("/sign-out", {}, cookie);
    assert.equal(out.status, 200);
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: tokenOnly }) }), null);
  });
});

describe("dashboard APIs: 404 / 405 / 401 (DASH-04)", () => {
  it("/api/dashboard/me and /settings: 404 JSON with the flag off, 401 JSON signed out, 405 for other methods", async () => {
    for (const handler of [handleDashboardMeRequest, handleDashboardSettingsRequest]) {
      for (const env of [{}, { DASHBOARD_ENABLED: "TRUE" }]) {
        const r = await handler(api("/api/dashboard/me"), deps(env));
        assert.equal(r.status, 404);
        assert.deepEqual(await r.json(), { error: "Not found." });
      }
      const r401 = await handler(api("/api/dashboard/me"), deps());
      assert.equal(r401.status, 401);
      assert.match(r401.headers.get("content-type") ?? "", /application\/json/);
      assert.deepEqual(await r401.json(), { error: "Unauthorized." });
      const r405 = await handler(api("/api/dashboard/me", { method: "DELETE" }), deps());
      assert.equal(r405.status, 405);
    }
    const bogus = await handleDashboardMeRequest(
      api("/api/dashboard/me", { cookie: `${SESSION_TOKEN_COOKIE}=forged.value` }),
      deps(),
    );
    assert.equal(bogus.status, 401);
  });

  it("/api/auth/*: 404 JSON with the flag off, 503 JSON when sign-in is not configured", async () => {
    const off = await handleAuthRequest(new Request(`${ORIGIN}/api/auth/get-session`), {}, async () => {
      throw new Error("must not load the auth module while the flag is off");
    });
    assert.equal(off.status, 404);
    const notReady = await handleAuthRequest(new Request(`${ORIGIN}/api/auth/get-session`), ON, async () => ({
      authConfigured: false,
      authNotReadyReason: "BETTER_AUTH_SECRET not set",
      auth: { handler: async () => new Response("unreachable") },
    }));
    assert.equal(notReady.status, 503);
    assert.deepEqual(await notReady.json(), { error: "Sign-in is not configured on this deployment." });
    const ready = await handleAuthRequest(new Request(`${ORIGIN}/api/auth/ok`), ON, async () => ({
      authConfigured: true,
      authNotReadyReason: null,
      auth,
    }));
    assert.equal(ready.status, 200);
  });
});

describe("cross-user isolation (DASH-06)", () => {
  let alice: { cookie: string; id: string };
  let bob: { cookie: string; id: string };

  before(async () => {
    const a = await post("/sign-in/email", { email: "alice@example.com", password: "alice-password-1" });
    const b = await post("/sign-up/email", { email: "Bob@Example.com", password: "bob-password-12", name: "bob" });
    assert.equal(b.status, 200);
    const me = async (cookie: string) =>
      ((await (await handleDashboardMeRequest(api("/api/dashboard/me", { cookie }), deps())).json()) as {
        user: { id: string };
      }).user.id;
    alice = { cookie: cookieFrom(a), id: await me(cookieFrom(a)) };
    bob = { cookie: cookieFrom(b), id: await me(cookieFrom(b)) };
    assert.notEqual(alice.id, bob.id);
  });

  const settings = (cookie: string, init: RequestInit = {}, query = "") =>
    handleDashboardSettingsRequest(api(`/api/dashboard/settings${query}`, { ...init, cookie }), deps());

  it("each user reads and writes only their own settings", async () => {
    assert.equal((await settings(alice.cookie, { method: "PUT", body: JSON.stringify({ baseCurrency: "USD" }) })).status, 200);
    assert.deepEqual(await (await settings(alice.cookie)).json(), { settings: { baseCurrency: "USD" } });
    assert.deepEqual(await (await settings(bob.cookie)).json(), { settings: { baseCurrency: "CAD" } });
    await settings(bob.cookie, { method: "PUT", body: JSON.stringify({ baseCurrency: "EUR" }) });
    assert.deepEqual(await (await settings(alice.cookie)).json(), { settings: { baseCurrency: "USD" } });
  });

  it("naming the other user's id is 403, and changes nothing", async () => {
    const read = await settings(bob.cookie, {}, `?userId=${encodeURIComponent(alice.id)}`);
    assert.equal(read.status, 403);
    assert.deepEqual(await read.json(), { error: "Forbidden." });
    const write = await settings(bob.cookie, {
      method: "PUT",
      body: JSON.stringify({ userId: alice.id, baseCurrency: "EUR" }),
    });
    assert.equal(write.status, 403);
    assert.deepEqual(await (await settings(alice.cookie)).json(), { settings: { baseCurrency: "USD" } });
    // Naming yourself is fine.
    assert.equal((await settings(alice.cookie, {}, `?userId=${encodeURIComponent(alice.id)}`)).status, 200);
  });

  it("validates the body", async () => {
    assert.equal((await settings(alice.cookie, { method: "PUT", body: JSON.stringify({ baseCurrency: "GBP" }) })).status, 400);
    assert.equal((await settings(alice.cookie, { method: "PUT", body: "not json" })).status, 400);
  });

  it("deleting a user cascades to their settings (FK from 0003)", async () => {
    await pg.query(`DELETE FROM "user" WHERE id = $1`, [bob.id]);
    assert.equal((await pg.query("SELECT 1 FROM user_settings WHERE user_id = $1", [bob.id])).rows.length, 0);
    // Sessions go with the user. (The signed session_data cache cookie can outlive that by up to
    // its 5-minute maxAge; the token alone is checked against the database.)
    const tokenOnly = bob.cookie.split("; ").filter((c) => c.startsWith(`${SESSION_TOKEN_COOKIE}=`)).join("; ");
    assert.equal((await settings(tokenOnly)).status, 401);
    assert.equal((await pg.query("SELECT 1 FROM user_settings WHERE user_id = $1", [alice.id])).rows.length, 1);
  });
});
