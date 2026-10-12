// #90 (ROLE-05..08, -14..20): /api/account/* and the access gate end to end on PGLite with a real Better Auth
// instance: the owner creates people with a temporary password, grants, resets, removes; people change their own
// password and email; sessions are revoked. No network, no secrets (a fixed test-only auth secret).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { parseAllowList } from "../auth/config.ts";
import { createOrpheusAuth } from "../auth/instance.server.ts";
import { pgliteDialect } from "../auth/pglite-dialect.ts";
import { type DashboardApiDeps, handleAuthRequest } from "../dashboard/session.server.ts";
import { maskCode, recordAudit } from "./audit.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import { handlePersonalFinanceRequest } from "../finance/account.server.ts";
import { handleHoldingsRequest } from "../dashboard/holdings.server.ts";
import {
  handleAccountAccessRequest,
  handleAccountAuditRequest,
  handleAccountEmailRequest,
  handleAccountMeRequest,
  handleAccountPasswordRequest,
  handleAccountResetRequest,
  handleAccountWhoRequest,
} from "./account-api.server.ts";

const ORIGIN = "http://localhost:3000";
const TEST_SECRET = "test-only-secret-0123456789abcdef0123456789";
const OWNER = "owner@example.com";
const ON = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: OWNER };
// Throwaway values for this in-memory database only.
const OWNER_PW = "owner-test-pass-1";

let pg: PGlite;
let db: Queryable;
let auth: ReturnType<typeof createOrpheusAuth>;

before(async () => {
  pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  await pg.waitReady;
  for (const { name } of pendingMigrations(readdirSync("migrations"), []))
    await pg.exec(readFileSync(`migrations/${name}`, "utf8"));
  db = { query: async (text, params) => (await pg.query(text, params)).rows as never[] };
  auth = createOrpheusAuth({
    database: { dialect: pgliteDialect(() => pg), type: "postgres" },
    secret: TEST_SECRET,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    allowList: parseAllowList(OWNER),
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
const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
const signIn = async (email: string, password: string) => {
  const r = await post("/sign-in/email", { email, password });
  return r.status === 200 ? cookieFrom(r) : null;
};

const deps = (env: Record<string, string | undefined> = ON): DashboardApiDeps => ({
  env,
  getUser: async (headers) => {
    const s = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
    return s?.user ? { id: s.user.id, email: s.user.email, sessionId: s.session.id } : null;
  },
  getDb: async () => db,
});
const call = (
  handler: (r: Request, d: DashboardApiDeps) => Promise<Response>,
  path: string,
  init: { method?: string; cookie?: string | null; body?: unknown; headers?: Record<string, string> } = {},
  env?: Record<string, string | undefined>,
) =>
  handler(
    new Request(`${ORIGIN}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    deps(env),
  );
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

let owner = "";
const people: Record<string, { id: string; temp: string; cookie?: string; password?: string }> = {};

describe("/api/account (#90)", () => {
  it("the owner signs up through the allow-list only; public sign-up refuses anyone else (ROLE-09)", async () => {
    const r = await post("/sign-up/email", { email: OWNER, password: OWNER_PW, name: "Diego" });
    assert.equal(r.status, 200);
    owner = cookieFrom(r);
    assert.equal((await post("/sign-up/email", { email: "cfo@example.com", password: "x".repeat(12), name: "c" })).status, 403);
  });

  it("gate order: 404 flag off, 405, 401 signed out; cross-site writes 403 (ROLE-20)", async () => {
    assert.equal((await call(handleAccountMeRequest, "/api/account/me", { cookie: owner }, {})).status, 404);
    assert.equal((await call(handleAccountMeRequest, "/api/account/me", { cookie: owner, method: "POST" })).status, 405);
    assert.equal((await call(handleAccountMeRequest, "/api/account/me")).status, 401);
    for (const site of ["cross-site", "same-site"]) {
      const r = await call(handleAccountAccessRequest, "/api/account/access", {
        cookie: owner,
        method: "POST",
        body: { name: "X", email: "x@example.com" },
        headers: { "sec-fetch-site": site },
      });
      assert.equal(r.status, 403, site);
    }
    const me = await json(await call(handleAccountMeRequest, "/api/account/me", { cookie: owner }));
    assert.equal(me.owner, true);
    assert.deepEqual(me.roles, ["Owner"]);
  });

  it("ROLE-07: Add person creates the account with a temporary password once (no-store); an existing email gets grants only", async () => {
    for (const [key, name, pf, dash] of [
      ["cfo", "Cfo Read", "read", "none"],
      ["pm", "Pm Write", "none", "read_write"],
      ["none", "No Grant", "none", "none"],
      ["both", "Both", "read_write", "read"],
    ] as const) {
      const r = await call(handleAccountAccessRequest, "/api/account/access", {
        cookie: owner,
        method: "POST",
        body: { name, email: `${key.toUpperCase()}@Example.com`, personal_finance: pf, dashboard: dash },
      });
      assert.equal(r.status, 201, key);
      assert.equal(r.headers.get("cache-control"), "no-store");
      const b = await json(r);
      assert.equal(typeof b.temporaryPassword, "string");
      assert.equal((b.temporaryPassword as string).length, 18);
      const row = (await pg.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [`${key}@example.com`])).rows[0];
      people[key] = { id: row.id, temp: b.temporaryPassword as string };
    }
    const again = await call(handleAccountAccessRequest, "/api/account/access", {
      cookie: owner,
      method: "POST",
      body: { name: "Cfo Read", email: "cfo@example.com", personal_finance: "read", dashboard: "none" },
    });
    assert.equal(again.status, 200);
    assert.equal((await json(again)).temporaryPassword, null);
    // Only a hash is stored.
    const stored = await pg.query<{ password: string }>(`SELECT password FROM "account" WHERE "userId" = $1`, [people.cfo.id]);
    assert.notEqual(stored.rows[0].password, people.cfo.temp);
    for (const bad of [{ name: "", email: "a@b.co" }, { name: "A", email: "nope" }, { name: "A", email: "a@b.co", dashboard: "write" }])
      assert.equal((await call(handleAccountAccessRequest, "/api/account/access", { cookie: owner, method: "POST", body: bad })).status, 400);
  });

  it("ROLE-08: a temporary password signs in but every PF / Dashboard API is 403 until changed", async () => {
    for (const key of Object.keys(people)) {
      people[key].cookie = (await signIn(`${key}@example.com`, people[key].temp)) ?? undefined;
      assert.ok(people[key].cookie, key);
    }
    const r = await call(handlePersonalFinanceRequest, "/api/personal-finance", { cookie: people.cfo.cookie });
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { error: "Change your password first." });
    const me = await json(await call(handleAccountMeRequest, "/api/account/me", { cookie: people.cfo.cookie }));
    assert.equal(me.mustChange, true);
    assert.deepEqual((await json(await call(handleAccountWhoRequest, "/api/account/who", { cookie: people.cfo.cookie }))).people, []);
  });

  it("ROLE-05: change password: checks, wrong current refused, success signs out other sessions", async () => {
    const pw = (cookie: string | undefined, body: unknown) =>
      call(handleAccountPasswordRequest, "/api/account/password", { cookie, method: "POST", body });
    assert.deepEqual(await json(await pw(people.cfo.cookie, { currentPassword: "", newPassword: "x".repeat(10) })), {
      error: "Enter your current password.",
      field: "currentPassword",
    });
    assert.equal((await json(await pw(people.cfo.cookie, { currentPassword: people.cfo.temp, newPassword: "short" }))).error, "Use 8 or more characters.");
    assert.equal((await json(await pw(people.cfo.cookie, { currentPassword: "wrong-one-1", newPassword: "x".repeat(10) }))).error, "That password is not right.");
    const second = await signIn("cfo@example.com", people.cfo.temp);
    for (const key of Object.keys(people)) {
      people[key].password = `${key}-own-password-1`;
      const r = await pw(people[key].cookie, { currentPassword: people[key].temp, newPassword: people[key].password });
      assert.equal(r.status, 200, key);
    }
    assert.equal((await call(handleAccountMeRequest, "/api/account/me", { cookie: second })).status, 401, "the other session is signed out");
    assert.equal((await call(handleAccountMeRequest, "/api/account/me", { cookie: people.cfo.cookie })).status, 200, "this one stays");
    assert.equal(await signIn("cfo@example.com", people.cfo.temp), null, "the old password no longer works");
    assert.ok(await signIn("cfo@example.com", people.cfo.password!));
  });

  it("ROLE-10 / ROLE-12 / ROLE-14 / ROLE-15: grants decide reads and writes on the owner's data", async () => {
    const pf = (key: string, method = "GET", body?: unknown) =>
      call(handlePersonalFinanceRequest, "/api/personal-finance", { cookie: people[key].cookie, method, body });
    const hold = (key: string, method = "GET", body?: unknown) =>
      call(handleHoldingsRequest as never, "/api/dashboard/holdings", { cookie: people[key].cookie, method, body });
    assert.equal((await call(handlePersonalFinanceRequest, "/api/personal-finance", { cookie: owner, method: "PUT", body: { data: {} } })).status, 200);
    assert.equal((await pf("cfo")).status, 200);
    assert.equal((await pf("cfo", "PUT", { data: {} })).status, 403);
    assert.equal((await hold("cfo")).status, 403, "PF-only: no Dashboard");
    assert.equal((await pf("pm")).status, 403, "Dashboard-only: no PF");
    assert.equal((await hold("pm")).status, 200);
    assert.equal((await pf("none")).status, 403);
    assert.equal((await hold("none")).status, 403);
    assert.equal((await pf("both", "PUT", { data: {} })).status, 200);
    assert.equal((await hold("both")).status, 200);
    assert.equal((await hold("both", "POST", { symbol: "KO", shares: "1" })).status, 403, "Dashboard Read only");
  });

  it("ROLE-19 / Q-D14: who has access: the owner sees everyone; a grantee the owner and people on their surfaces", async () => {
    const all = (await json(await call(handleAccountWhoRequest, "/api/account/who", { cookie: owner }))).people as { email: string; owner: boolean }[];
    assert.deepEqual(all.map((p) => p.email), [OWNER, "cfo@example.com", "pm@example.com", "none@example.com", "both@example.com"]);
    assert.equal(all[0].owner, true);
    const cfo = (await json(await call(handleAccountWhoRequest, "/api/account/who", { cookie: people.cfo.cookie }))).people as {
      email: string;
      grants: Record<string, string>;
    }[];
    assert.deepEqual(cfo.map((p) => p.email), [OWNER, "cfo@example.com", "both@example.com"]);
    assert.deepEqual(cfo[2].grants, { personal_finance: "read_write", dashboard: "none" }, "levels on shared surfaces only");
    assert.deepEqual(
      ((await json(await call(handleAccountWhoRequest, "/api/account/who", { cookie: people.none.cookie }))).people as { email: string }[]).map((p) => p.email),
      [OWNER, "none@example.com"].filter((e) => e === OWNER),
    );
  });

  it("ROLE-17: /api/account/access is owner-only; the owner's own access can't be changed", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const r = await call(handleAccountAccessRequest, `/api/account/access?userId=${people.cfo.id}`, {
        cookie: people.both.cookie,
        method,
        body: method === "POST" || method === "PUT" ? { userId: people.cfo.id, name: "x", email: "y@example.com", personal_finance: "read_write" } : undefined,
      });
      assert.equal(r.status, 403, method);
    }
    assert.equal((await call(handleAccountResetRequest, "/api/account/reset", { cookie: people.both.cookie, method: "POST", body: { userId: people.cfo.id } })).status, 403);
    const ownerId = (await pg.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [OWNER])).rows[0].id;
    assert.equal((await call(handleAccountAccessRequest, "/api/account/access", { cookie: owner, method: "PUT", body: { userId: ownerId, personal_finance: "none" } })).status, 403);
    assert.equal((await call(handleAccountAccessRequest, `/api/account/access?userId=${ownerId}`, { cookie: owner, method: "DELETE" })).status, 403);
  });

  it("ROLE-16: a grant change applies on the next request; Remove clears grants and signs the person out; the account stays", async () => {
    const pf = () => call(handlePersonalFinanceRequest, "/api/personal-finance", { cookie: people.cfo.cookie, method: "PUT", body: { data: {} } });
    assert.equal((await pf()).status, 403);
    const put = await call(handleAccountAccessRequest, "/api/account/access", {
      cookie: owner,
      method: "PUT",
      body: { userId: people.cfo.id, personal_finance: "read_write", dashboard: "none" },
    });
    assert.equal(put.status, 200);
    assert.equal((await pf()).status, 200);
    const del = await call(handleAccountAccessRequest, `/api/account/access?userId=${people.cfo.id}`, { cookie: owner, method: "DELETE" });
    assert.equal(del.status, 200);
    assert.equal((await call(handleAccountMeRequest, "/api/account/me", { cookie: people.cfo.cookie })).status, 401, "signed out everywhere");
    people.cfo.cookie = (await signIn("cfo@example.com", people.cfo.password!)) ?? undefined;
    assert.ok(people.cfo.cookie, "the account stays");
    assert.equal((await call(handlePersonalFinanceRequest, "/api/personal-finance", { cookie: people.cfo.cookie })).status, 403);
  });

  it("ROLE-18: Reset password: new temporary password once, old refused, sessions revoked, forced change again", async () => {
    const r = await call(handleAccountResetRequest, "/api/account/reset", { cookie: owner, method: "POST", body: { userId: people.pm.id } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const temp = (await json(r)).temporaryPassword as string;
    assert.equal(temp.length, 18);
    assert.equal((await call(handleAccountMeRequest, "/api/account/me", { cookie: people.pm.cookie })).status, 401);
    assert.equal(await signIn("pm@example.com", people.pm.password!), null);
    people.pm.cookie = (await signIn("pm@example.com", temp)) ?? undefined;
    assert.equal((await json(await call(handleAccountMeRequest, "/api/account/me", { cookie: people.pm.cookie }))).mustChange, true);
    assert.equal((await call(handleHoldingsRequest as never, "/api/dashboard/holdings", { cookie: people.pm.cookie })).status, 403);
  });

  it("ROLE-06 / Q-D12 / Q-D16: change email: password needed, in-use refused, owner blocked; success signs out other sessions", async () => {
    const email = (cookie: string | undefined, body: unknown) =>
      call(handleAccountEmailRequest, "/api/account/email", { cookie, method: "POST", body });
    const ownerTry = await email(owner, { newEmail: "new-owner@example.com", currentPassword: OWNER_PW });
    assert.equal(ownerTry.status, 403);
    assert.deepEqual(await ownerTry.json(), { error: "Owner email can't be changed here." });
    const b = people.both;
    assert.equal((await json(await email(b.cookie, { newEmail: "cfo@example.com", currentPassword: b.password }))).error, "That email is already in use.");
    assert.equal((await json(await email(b.cookie, { newEmail: OWNER, currentPassword: b.password }))).error, "That email is already in use.");
    assert.equal((await json(await email(b.cookie, { newEmail: "both2@example.com", currentPassword: "wrong-pass-1" }))).error, "That password is not right.");
    assert.equal((await json(await email(b.cookie, { newEmail: "bad", currentPassword: b.password }))).error, "Enter an email address.");
    const second = await signIn("both@example.com", b.password!);
    assert.equal((await email(b.cookie, { newEmail: " Both2@Example.com ", currentPassword: b.password })).status, 200);
    assert.equal((await call(handleAccountMeRequest, "/api/account/me", { cookie: second })).status, 401);
    assert.equal(await signIn("both@example.com", b.password!), null);
    assert.ok(await signIn("both2@example.com", b.password!));
    assert.equal((await json(await call(handleAccountMeRequest, "/api/account/me", { cookie: b.cookie }))).email, "both2@example.com");
  });

  it("ROLE-14: with ORPHEUS_OWNER_EMAIL unset nobody has access (the owner neither)", async () => {
    const noOwner = { DASHBOARD_ENABLED: "true" };
    assert.equal((await call(handlePersonalFinanceRequest, "/api/personal-finance", { cookie: owner }, noOwner)).status, 403);
    assert.equal((await call(handleAccountAccessRequest, "/api/account/access", { cookie: owner }, noOwner)).status, 403);
    assert.deepEqual((await json(await call(handleAccountWhoRequest, "/api/account/who", { cookie: owner }, noOwner))).people, []);
  });
});

// #91 (AUDIT-01..07, -10, -12): the audit log over the same database, after the #90 journey above wrote to it.
describe("audit log (#91)", () => {
  const rows = async () =>
    (await db.query("SELECT actor, role, action, target, outcome, detail FROM audit_event ORDER BY id")) as {
      actor: string;
      role: string;
      action: string;
      target: string | null;
      outcome: string;
      detail: string | null;
    }[];

  it("AUDIT-01: append-only (UPDATE and DELETE refused)", async () => {
    await assert.rejects(db.query("UPDATE audit_event SET outcome = 'ok'"), /append-only/);
    await assert.rejects(db.query("DELETE FROM audit_event"), /append-only/);
  });

  it("AUDIT-02 / -04: the #90 actions above were recorded with the fixed codes", async () => {
    const all = await rows();
    const actions = new Set(all.map((r) => r.action));
    for (const a of ["access.add", "access.grants", "access.remove", "access.reset", "account.password", "account.email", "access.denied"])
      assert.ok(actions.has(a), a);
    const add = all.find((r) => r.action === "access.add");
    assert.deepEqual([add?.actor, add?.role, add?.outcome, add?.detail], ["owner", "owner", "ok", "pf:read dash:none"]);
    assert.equal(add?.target, maskCode("p", people.cfo.id));
    const denied = all.filter((r) => r.action === "access.denied");
    assert.ok(denied.every((r) => r.outcome === "denied" && /^(personal_finance|dashboard) [A-Z]+$/.test(r.detail ?? "")));
    assert.ok(denied.some((r) => r.detail === "personal_finance GET"));
  });

  it("AUDIT-03: masked: only codes, never an email, a name or a temporary password", async () => {
    const all = await rows();
    assert.ok(all.length > 5);
    for (const r of all) {
      assert.match(r.actor, /^(owner|anonymous|p-[0-9a-f]{8})$/);
      if (r.target !== null) assert.match(r.target, /^(owner|[ph]-[0-9a-f]{8})$/);
      const text = JSON.stringify(r);
      assert.doesNotMatch(text, /@|example|Diego|Cfo Read|Pm Write|No Grant|Both/);
    }
    // stable per person
    assert.equal(maskCode("p", people.cfo.id), maskCode("p", people.cfo.id));
    assert.notEqual(maskCode("p", people.cfo.id), maskCode("p", people.pm.id));
  });

  it("AUDIT-05: sign-in ok / failed (no email stored) and sign-out through /api/auth", async () => {
    const mod = async () => ({ authConfigured: true, authNotReadyReason: null, auth });
    const getUser = deps().getUser;
    const req = (path: string, body: unknown, cookie?: string) =>
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });
    const n = (await rows()).length;
    const bad = await handleAuthRequest(req("/sign-in/email", { email: OWNER, password: "wrong-pass-9" }), ON, mod, async () => db, getUser);
    assert.notEqual(bad.status, 200);
    const good = await handleAuthRequest(req("/sign-in/email", { email: OWNER, password: OWNER_PW }), ON, mod, async () => db, getUser);
    assert.equal(good.status, 200);
    const cookie = cookieFrom(good);
    const out = await handleAuthRequest(req("/sign-out", {}, cookie), ON, mod, async () => db, getUser);
    assert.equal(out.status, 200);
    const added = (await rows()).slice(n).map((r) => [r.action, r.outcome, r.actor]);
    assert.deepEqual(added, [
      ["auth.sign_in", "failed", "anonymous"],
      ["auth.sign_in", "ok", "owner"],
      ["auth.sign_out", "ok", "owner"],
    ]);
  });

  it("AUDIT-07: GET /api/account/audit owner only, newest first, paging, no-store", async () => {
    assert.equal((await call(handleAccountAuditRequest, "/api/account/audit", { cookie: owner }, {})).status, 404);
    assert.equal((await call(handleAccountAuditRequest, "/api/account/audit")).status, 401);
    assert.equal((await call(handleAccountAuditRequest, "/api/account/audit", { cookie: owner, method: "POST" })).status, 405);
    assert.equal((await call(handleAccountAuditRequest, "/api/account/audit", { cookie: people.cfo.cookie })).status, 403);
    const r = await call(handleAccountAuditRequest, "/api/account/audit?limit=3", { cookie: owner });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const page = (await r.json()) as { events: { id: number; at: string }[]; more: boolean };
    assert.equal(page.events.length, 3);
    assert.equal(page.more, true);
    assert.ok(page.events[0].id > page.events[1].id && page.events[1].id > page.events[2].id);
    const next = (await (await call(handleAccountAuditRequest, `/api/account/audit?limit=3&before=${page.events[2].id}`, { cookie: owner })).json()) as { events: { id: number }[] };
    assert.ok(next.events[0].id < page.events[2].id);
    const big = (await (await call(handleAccountAuditRequest, "/api/account/audit?limit=500", { cookie: owner })).json()) as { events: unknown[] };
    assert.ok(big.events.length <= 100);
  });

  it("AUDIT-10: a failing insert never throws (best effort)", async () => {
    const broken = { query: async () => { throw new Error("down"); } };
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a.join(" "));
    try {
      await recordAudit(broken as never, { actor: "owner", role: "owner", action: "pf.save" });
    } finally {
      console.error = orig;
    }
    assert.deepEqual(errors, ["[audit] could not record pf.save"]);
  });

  it("AUDIT-12: a removed person's rows stay (no foreign key)", async () => {
    const code = maskCode("p", people.cfo.id);
    const before = (await rows()).filter((r) => r.actor === code || r.target === code).length;
    await db.query('DELETE FROM "user" WHERE id = $1', [people.cfo.id]);
    assert.equal((await rows()).filter((r) => r.actor === code || r.target === code).length, before);
    assert.ok(before > 0);
  });
});
