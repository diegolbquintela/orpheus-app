import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { deleteOwnReport, handlePersonalFinanceRequest, STALE_MESSAGE, writeOwnNamed, writeOwnReport } from "./account.server.ts";
import type { Named } from "./reports.ts";
import { STORAGE_KEY } from "./expenses.ts";

// #242 (personal-finance-spec §73, AC PFTW): two tabs. The record's version is the existing
// `personal_finance.updated_at`; a PUT with a stale `baseVersion` → 409 and nothing is written.
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db });
const pf = (method: string, who: string, body?: unknown) =>
  handlePersonalFinanceRequest(
    new Request("http://localhost/api/personal-finance", {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    as(who),
  );
const rec = (n: string) => ({ [STORAGE_KEY]: `{"fixed":[],"variable":[],"accounts":[],"n":"${n}"}` });
const get = async (who = "alice") => (await (await pf("GET", who)).json()) as { data: Record<string, string> | null; version: string | null };
const stored = async () => (await pg.query<{ data: unknown }>("SELECT data FROM personal_finance WHERE user_id = 'alice'")).rows[0]?.data ?? null;
const audits = async () => (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event")).rows[0].n;
const reset = () => pg.exec("DELETE FROM personal_finance");

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "carol"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec("INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES ('carol', 'personal_finance', true, true, 'alice')");
});

describe("#242 stale save → 409 (PFTW)", () => {
  it("PFTW-01: GET version is null with no record, text with one", async () => {
    await reset();
    assert.equal((await get()).version, null);
    assert.equal((await pf("PUT", "alice", { data: rec("a"), baseVersion: null })).status, 200);
    const v = (await get()).version;
    assert.equal(typeof v, "string");
    const [{ t }] = (await pg.query<{ t: string }>("SELECT updated_at::text AS t FROM personal_finance")).rows;
    assert.equal(v, t, "the version is updated_at, full precision");
  });

  it("PFTW-02: a save with the current version → 200 + a new version; the next save from it → 200", async () => {
    await reset();
    await pf("PUT", "alice", { data: rec("a"), baseVersion: null });
    const v1 = (await get()).version;
    const r1 = await pf("PUT", "alice", { data: rec("b"), baseVersion: v1 });
    assert.equal(r1.status, 200);
    const v2 = ((await r1.json()) as { version: string }).version;
    assert.notEqual(v2, v1);
    assert.equal(v2, (await get()).version);
    assert.equal((await pf("PUT", "alice", { data: rec("c"), baseVersion: v2 })).status, 200);
    assert.deepEqual((await get()).data, rec("c"));
  });

  it("PFTW-03: two tabs: B's save on the old version → 409 stale, A's record kept byte for byte", async () => {
    await reset();
    await pf("PUT", "alice", { data: rec("0"), baseVersion: null });
    const base = (await get()).version;
    assert.equal((await pf("PUT", "alice", { data: rec("A"), baseVersion: base })).status, 200);
    const before = await stored();
    const r = await pf("PUT", "alice", { data: rec("B"), baseVersion: base });
    assert.equal(r.status, 409);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(await r.json(), { error: STALE_MESSAGE, code: "stale" });
    assert.match(STALE_MESSAGE, /Reload/);
    assert.deepEqual(await stored(), before);
  });

  it("PFTW-04: null base with a record → 409; with none → created; a stale base on a deleted record → 409, nothing recreated", async () => {
    await reset();
    assert.equal((await pf("PUT", "alice", { data: rec("a"), baseVersion: null })).status, 200);
    assert.equal((await pf("PUT", "alice", { data: rec("b"), baseVersion: null })).status, 409);
    const v = (await get()).version;
    assert.equal((await pf("DELETE", "alice")).status, 200);
    assert.equal((await pf("PUT", "alice", { data: rec("c"), baseVersion: v })).status, 409);
    assert.equal(await stored(), null);
  });

  it("PFTW-05: no baseVersion → last write wins (older tab); a bad baseVersion → 400", async () => {
    await reset();
    await pf("PUT", "alice", { data: rec("a"), baseVersion: null });
    const r = await pf("PUT", "alice", { data: rec("legacy") });
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { version: unknown }).version, (await get()).version);
    assert.deepEqual((await get()).data, rec("legacy"));
    for (const bad of [1, true, {}]) assert.equal((await pf("PUT", "alice", { data: rec("x"), baseVersion: bad })).status, 400, String(bad));
  });

  it("PFTW-06: a write-grant person (carol) gets the same check; a 409 writes no audit row", async () => {
    await reset();
    await pf("PUT", "alice", { data: rec("a"), baseVersion: null });
    const base = (await get("carol")).version;
    assert.equal(base, (await get()).version);
    assert.equal((await pf("PUT", "alice", { data: rec("b"), baseVersion: base })).status, 200);
    const n = await audits();
    const r = await pf("PUT", "carol", { data: rec("c"), baseVersion: base });
    assert.equal(r.status, 409);
    assert.equal(await audits(), n, "no audit row for a refused save");
    assert.deepEqual((await get()).data, rec("b"));
    const ok = await pf("PUT", "carol", { data: rec("c"), baseVersion: (await get("carol")).version });
    assert.equal(ok.status, 200);
    assert.equal(await audits(), n + 1);
  });

  it("PFTW-07: saved-report writes keep the version (the record tab still saves)", async () => {
    await reset();
    // A report saved before any record: the tab saw no record (null) and still saves.
    await writeOwnReport(db, "alice", '{"r":1}');
    assert.equal((await get()).version, null);
    assert.equal((await pf("PUT", "alice", { data: rec("a"), baseVersion: null })).status, 200);
    const v = (await get()).version;
    await writeOwnReport(db, "alice", '{"r":2}');
    await deleteOwnReport(db, "alice");
    const named = [{ id: "r-0000abcd", name: "N", report: {}, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }] as unknown as Named[];
    await writeOwnNamed(db, "alice", named);
    await writeOwnNamed(db, "alice", []);
    assert.equal((await get()).version, v);
    assert.equal((await pf("PUT", "alice", { data: rec("b"), baseVersion: v })).status, 200);
  });

  it("PFTW-10: two PUTs on the same version sent together → one 200, one 409", async () => {
    await reset();
    await pf("PUT", "alice", { data: rec("a"), baseVersion: null });
    const v = (await get()).version;
    const rs = await Promise.all([pf("PUT", "alice", { data: rec("x"), baseVersion: v }), pf("PUT", "alice", { data: rec("y"), baseVersion: v })]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
  });
});
