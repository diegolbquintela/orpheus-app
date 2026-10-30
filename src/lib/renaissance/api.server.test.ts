// #267 (renaissance-spec sections 3–4, AC RM-01..RM-04, RM-12): POST /api/renaissance/checkin and the page read on PGLite
// (migration 0014 applied in memory; never a real database). A fake session and a per-run random token.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { handleCheckinRequest, ingestAuthorized, type RenaissanceDeps, loadRenaissance, readEntries, RENAISSANCE_NAV_LINK, renaissanceNavLink, renaissanceOwnerDb } from "./api.server.ts";

const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const TOKEN = randomBytes(24).toString("hex");
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "Alice@Example.com", RENAISSANCE_INGEST_TOKEN: TOKEN };
const deps = (who: string | null, e: Record<string, string | undefined> = env) => ({
  env: e,
  getUser: async () => (who ? { id: who, email: `${who}@example.com` } : null),
  getDb: async () => db,
});
const body = { date: "2026-10-30", picks: ["Zyn ≤15"], entries: [{ pillar: "health", item: "zyn", target: 15, actual: 12, hit: true, note: null }, { pillar: "industry", item: "industry", hit: false }] };
const post = (who: string | null, b: unknown = body, headers: Record<string, string> = {}, e: Record<string, string | undefined> = env, method = "POST") =>
  handleCheckinRequest(
    new Request("http://localhost/api/renaissance/checkin", {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: method === "GET" || method === "HEAD" ? undefined : typeof b === "string" ? b : JSON.stringify(b),
    }),
    deps(who, e),
  );
const count = async () => (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM rm_entries")).rows[0].n;

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  await pg.exec(readFileSync(new URL("../../../migrations/0014_renaissance.sql", import.meta.url), "utf8"));
  await pg.exec(readFileSync(new URL("../../../migrations/0014_renaissance.sql", import.meta.url), "utf8")); // idempotent
  for (const id of ["alice", "bob"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
});

describe("RM-01 ingest auth", () => {
  it("bearer token: constant-time compare with a length guard; unset or empty refuses every token", () => {
    assert.equal(ingestAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
    assert.equal(ingestAuthorized(`Bearer ${TOKEN}x`, TOKEN), false);
    assert.equal(ingestAuthorized(`Bearer ${TOKEN.slice(0, -1)}`, TOKEN), false);
    assert.equal(ingestAuthorized(`bearer ${TOKEN}`, TOKEN), false);
    assert.equal(ingestAuthorized(TOKEN, TOKEN), false);
    assert.equal(ingestAuthorized(null, TOKEN), false);
    assert.equal(ingestAuthorized("Bearer ", ""), false);
    assert.equal(ingestAuthorized("Bearer undefined", undefined), false);
  });
  it("flag off → 404 for every method; other methods → 405 Allow: POST", async () => {
    const off = { ...env, DASHBOARD_ENABLED: "false" };
    assert.equal((await post("alice", body, {}, off)).status, 404);
    assert.equal((await post(null, body, { authorization: `Bearer ${TOKEN}` }, off)).status, 404);
    for (const m of ["GET", "PUT", "DELETE"]) {
      const r = await post("alice", body, {}, env, m);
      assert.equal(r.status, 405, m);
      assert.equal(r.headers.get("allow"), "POST");
    }
  });
  it("signed out → 401; non-owner → 403; wrong / unset token → 401 and no session fallback; nothing written", async () => {
    assert.equal((await post(null)).status, 401);
    assert.equal((await post("bob")).status, 403);
    assert.equal((await post("alice", body, { authorization: "Bearer wrong" })).status, 401); // the owner's session doesn't rescue a bad token
    assert.equal((await post(null, body, { authorization: `Bearer ${TOKEN}` }, { ...env, RENAISSANCE_INGEST_TOKEN: "" })).status, 401);
    assert.equal((await post(null, body, { authorization: `Bearer ${TOKEN}` }, { ...env, RENAISSANCE_INGEST_TOKEN: undefined })).status, 401);
    assert.equal((await post("alice", body, {}, { ...env, ORPHEUS_OWNER_EMAIL: "" })).status, 403);
    assert.equal(await count(), 0);
  });
  it("401 bodies never echo the token", async () => {
    const r = await post(null, body, { authorization: `Bearer ${TOKEN}x` });
    assert.ok(!(await r.text()).includes(TOKEN));
  });
});

describe("RM-02/03 upsert and validation", () => {
  it("400 for bad JSON or a bad body, nothing written", async () => {
    const r = await post("alice", "{not json");
    assert.equal(r.status, 400);
    assert.equal((await post("alice", { ...body, date: "2026-02-30" })).status, 400);
    assert.equal(await count(), 0);
  });
  it("the owner's session and the bearer token both write; the same post twice is idempotent", async () => {
    const r = await post("alice");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, date: "2026-10-30", upserted: 2 });
    assert.equal(r.headers.get("cache-control"), "no-store");
    const before = await pg.query("SELECT entry_date, item, pillar, target, actual, hit, note, picks FROM rm_entries ORDER BY item");
    assert.equal((await post(null, body, { authorization: `Bearer ${TOKEN}` })).status, 200);
    const after = await pg.query("SELECT entry_date, item, pillar, target, actual, hit, note, picks FROM rm_entries ORDER BY item");
    assert.deepEqual(after.rows, before.rows);
    assert.equal(await count(), 2);
  });
  it("a later post for the same (date, item) updates in place; the day's picks follow", async () => {
    await post(null, { date: "2026-10-30", picks: ["New pick"], entries: [{ pillar: "health", item: "zyn", target: 15, actual: 16, hit: false }] }, { authorization: `Bearer ${TOKEN}` });
    const rows = await readEntries(db);
    assert.equal(rows.length, 2);
    const zyn = rows.find((r) => r.item === "zyn")!;
    assert.deepEqual(zyn, { date: "2026-10-30", pillar: "health", item: "zyn", target: 15, actual: 16, hit: false, note: null, picks: ["New pick"] });
    assert.deepEqual(rows.find((r) => r.item === "industry")!.picks, ["New pick"]);
  });
});

describe("RM-12 the migration", () => {
  it("re-running 0014 is a no-op and the pillar CHECK rejects other values", async () => {
    const before = await count();
    await pg.exec(readFileSync("migrations/0014_renaissance.sql", "utf8"));
    assert.equal(await count(), before);
    await assert.rejects(pg.query("INSERT INTO rm_entries (entry_date, item, pillar) VALUES ('2026-10-30', 'x', 'wealth')"));
  });
});

describe("RM-04 the page read", () => {
  it("owner gets the rows; signed out, non-owner, flag off and no database are not_found", async () => {
    const h = new Headers();
    const r = await loadRenaissance(h, deps("alice"));
    assert.equal(r.status, "ok");
    assert.equal(r.status === "ok" && r.entries.length, 2);
    assert.equal((await loadRenaissance(h, deps(null))).status, "not_found");
    assert.equal((await loadRenaissance(h, deps("bob"))).status, "not_found");
    assert.equal((await loadRenaissance(h, deps("alice", { ...env, DASHBOARD_ENABLED: undefined }))).status, "not_found");
    assert.equal((await loadRenaissance(h, { ...deps("alice"), getDb: async () => null })).status, "not_found");
  });
  it("owner before the migration: not_configured, never a throw", async () => {
    const bare = new PGlite();
    await bare.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL)');
    await bare.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', ["alice", "alice@example.com"]);
    const bareDb = { query: async <T>(t: string, p?: unknown[]) => (await bare.query<T>(t, p)).rows };
    assert.equal((await loadRenaissance(new Headers(), { ...deps("alice"), getDb: async () => bareDb })).status, "not_configured");
  });
});

describe("RM-21 the site bar's owner-only link: the same owner check as /renaissance, fail closed", () => {
  const h = new Headers();
  it("the owner gets exactly { href: /renaissance, label: Renaissance Man, short: RM }", async () => {
    assert.deepEqual(await renaissanceNavLink(h, deps("alice")), { href: "/renaissance", label: "Renaissance Man", short: "RM" });
    assert.equal(await renaissanceNavLink(h, deps("alice")), RENAISSANCE_NAV_LINK);
    assert.equal(await renaissanceOwnerDb(h, deps("alice")), db);
  });
  it("non-owner, signed out, flag off, no database, owner env unset / empty / unmatched: null", async () => {
    const cases: [string, RenaissanceDeps][] = [
      ["non-owner", deps("bob")],
      ["signed out", deps(null)],
      ["flag off", deps("alice", { ...env, DASHBOARD_ENABLED: "false" })],
      ["flag unset", deps("alice", { ...env, DASHBOARD_ENABLED: undefined })],
      ["owner env unset", deps("alice", { ...env, ORPHEUS_OWNER_EMAIL: undefined })],
      ["owner env empty", deps("alice", { ...env, ORPHEUS_OWNER_EMAIL: "" })],
      ["owner env names nobody", deps("alice", { ...env, ORPHEUS_OWNER_EMAIL: "nobody@example.com" })],
      ["owner env names bob, viewer alice", deps("alice", { ...env, ORPHEUS_OWNER_EMAIL: "bob@example.com" })],
      ["no database", { ...deps("alice"), getDb: async () => null }],
    ];
    for (const [name, d] of cases) {
      assert.equal(await renaissanceNavLink(h, d), null, name);
      assert.equal(await renaissanceOwnerDb(h, d), null, name);
      assert.equal((await loadRenaissance(h, d)).status, "not_found", `${name}: the page agrees`);
    }
    // The env decides who the owner is: name bob, and bob (not alice) gets the link.
    assert.deepEqual(await renaissanceNavLink(h, deps("bob", { ...env, ORPHEUS_OWNER_EMAIL: "bob@example.com" })), RENAISSANCE_NAV_LINK);
  });
  it("an error in the session, the database or the owner lookup is null, never a throw", async () => {
    const boom = async () => {
      throw new Error("boom");
    };
    assert.equal(await renaissanceNavLink(h, { ...deps("alice"), getUser: boom }), null);
    assert.equal(await renaissanceNavLink(h, { ...deps("alice"), getDb: boom }), null);
    const broken = { query: boom };
    assert.equal(await renaissanceNavLink(h, { ...deps("alice"), getDb: async () => broken }), null);
    assert.equal((await loadRenaissance(h, { ...deps("alice"), getDb: async () => broken })).status, "not_found");
  });
});
