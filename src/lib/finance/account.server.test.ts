import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest, handlePersonalFinanceViewRequest } from "./account.server.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { VIEW_KEY } from "./view.ts";
import { MONTHS_KEY } from "./months.ts";
import { INCOME_KEY } from "./income.ts";

// #102 (spec 16.5, PF-33 / PF-36) and #90 (ROLE-10, -11, -14, Q-D1, Q-D11, Q-D13): /api/personal-finance on PGLite
// with a fake session lookup. alice is the owner; bob a CFO with Read; carol a CFO with Read and write; dave has no
// grant; erin has Read and write but a temporary password still in place.
const pg = new PGlite();
const db = {
  query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows,
};
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "Alice@Example.com" };
const as = (id: string | null, e: Record<string, string> = env) => ({
  env: e,
  getUser: async () => (id ? { id, email: `${id}@example.com` } : null),
  getDb: async () => db,
});
const req = (method: string, body?: unknown, query = "", path = "/api/personal-finance") =>
  new Request(`http://localhost${path}${query}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const pf = (method: string, who: string | null, body?: unknown, query = "") =>
  handlePersonalFinanceRequest(req(method, body, query), as(who));
const view = (who: string, v: string) =>
  handlePersonalFinanceViewRequest(req("PUT", { view: v }, "", "/api/personal-finance/view"), as(who));

before(async () => {
  await pg.exec(
    'CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  for (const f of ["0010_personal_finance.sql", "0011_access.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "carol", "dave", "erin"])
    await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'),
    ('carol', 'personal_finance', true, true, 'alice'),
    ('dave', 'dashboard', true, true, 'alice'),
    ('erin', 'personal_finance', true, true, 'alice')`);
  await pg.exec("INSERT INTO account_state (user_id, must_change_password) VALUES ('erin', true)");
});

const data = { [STORAGE_KEY]: '{"fixed":[],"variable":[],"accounts":[]}' };
const OWNER = { owner: true, write: true };

describe("/api/personal-finance (#102, #90)", () => {
  it("flag off 404; bad method 405; signed out 401", async () => {
    const off = await handlePersonalFinanceRequest(req("GET"), as("alice", {}));
    assert.equal(off.status, 404);
    assert.equal((await pf("POST", "alice", {})).status, 405);
    for (const m of ["GET", "PUT", "DELETE"])
      assert.equal((await pf(m, null, m === "PUT" ? { data: {} } : undefined)).status, 401, m);
  });

  it("the owner: GET null, PUT saves, GET returns it (another device = the same account)", async () => {
    let r = await pf("GET", "alice");
    assert.deepEqual(await r.json(), { data: null, access: OWNER });
    assert.equal(r.headers.get("cache-control"), "no-store");
    r = await pf("PUT", "alice", { data: { ...data, [VIEW_KEY]: '{"closed":["income"]}' } });
    assert.equal(r.status, 200);
    r = await pf("GET", "alice");
    assert.deepEqual(await r.json(), {
      data: { ...data, [VIEW_KEY]: '{"closed":["income"]}' },
      access: OWNER,
    });
  });

  it("ROLE-14: no Personal Finance grant (dave), or no owner configured → 403 for every method", async () => {
    for (const m of ["GET", "PUT", "DELETE"]) {
      const r = await pf(m, "dave", m === "PUT" ? { data } : undefined);
      assert.equal(r.status, 403, m);
      assert.deepEqual(await r.json(), { error: "Forbidden." });
    }
    const noOwner = { DASHBOARD_ENABLED: "true" };
    assert.equal((await handlePersonalFinanceRequest(req("GET"), as("alice", noOwner))).status, 403);
    const typo = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "nobody@example.com" };
    assert.equal((await handlePersonalFinanceRequest(req("GET"), as("alice", typo))).status, 403);
  });

  it("ROLE-08: a temporary password in place → 403 'Change your password first.'", async () => {
    const r = await pf("GET", "erin");
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { error: "Change your password first." });
  });

  it("ROLE-10: Read (bob) gets the owner's record without the owner's toggles; PUT / DELETE 403; own toggles kept apart", async () => {
    let r = await pf("GET", "bob");
    assert.deepEqual(await r.json(), { data, access: { owner: false, write: false } });
    assert.equal((await pf("PUT", "bob", { data: {} })).status, 403);
    assert.equal((await pf("DELETE", "bob")).status, 403);
    assert.equal((await view("bob", '{"closed":["expenses"]}')).status, 200);
    r = await pf("GET", "bob");
    assert.deepEqual(((await r.json()) as { data: Record<string, string> }).data[VIEW_KEY], '{"closed":["expenses"]}');
    // The owner's toggles and figures are untouched.
    r = await pf("GET", "alice");
    assert.deepEqual(((await r.json()) as { data: Record<string, string> }).data, {
      ...data,
      [VIEW_KEY]: '{"closed":["income"]}',
    });
    assert.equal((await view("dave", "{}")).status, 403, "the view route still needs a read grant");
  });

  it("ROLE-11 / Q-D13: Read and write (carol) edits the owner's record; her toggles stay hers; DELETE is owner-only", async () => {
    const next = { [STORAGE_KEY]: '{"fixed":[{"id":"x"}],"variable":[],"accounts":[]}', [VIEW_KEY]: '{"closed":["overview"]}' };
    let r = await pf("PUT", "carol", { data: next });
    assert.equal(r.status, 200);
    r = await pf("GET", "alice");
    assert.deepEqual(((await r.json()) as { data: Record<string, string> }).data, {
      [STORAGE_KEY]: next[STORAGE_KEY],
      [VIEW_KEY]: '{"closed":["income"]}',
    });
    r = await pf("GET", "carol");
    assert.deepEqual(await r.json(), { data: next, access: { owner: false, write: true } });
    assert.equal((await pf("DELETE", "carol")).status, 403);
    assert.ok((await pf("GET", "alice")).ok, "the record survives");
  });

  it("403 naming someone else; naming yourself or the owner is fine; 400 / 413 bad bodies", async () => {
    assert.equal((await pf("GET", "alice", undefined, "?userId=bob")).status, 403);
    assert.equal((await pf("PUT", "alice", { data: {}, userId: "bob" })).status, 403);
    assert.equal((await pf("GET", "bob", undefined, "?userId=dave")).status, 403);
    assert.equal((await pf("GET", "bob", undefined, "?userId=alice")).status, 200);
    assert.equal((await pf("GET", "bob", undefined, "?userId=bob")).status, 200);
    assert.equal((await pf("PUT", "alice", { data: { evil: "x" } })).status, 400);
    assert.equal((await pf("PUT", "alice", { data: { [STORAGE_KEY]: "x".repeat(1100000) } })).status, 413);
  });

  it("the owner's DELETE removes the record (owner-only)", async () => {
    await pf("DELETE", "alice");
    assert.deepEqual(await (await pf("GET", "alice")).json(), { data: null, access: OWNER });
    // bob still sees his own toggles only.
    assert.deepEqual(((await (await pf("GET", "bob")).json()) as { data: unknown }).data, {
      [VIEW_KEY]: '{"closed":["expenses"]}',
    });
  });
});

describe("#143 PUT refuses invalid values, never clamps (PF-137)", () => {
  const line = (amount: string) => ({ id: "l1", name: "Rent", amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "" });
  const person = (tax: string) => ({ id: "p1", name: "Me", wages: "36,000", bonus: "", tax, share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" });
  const rec = (amount: string, tax = "30") => ({ [MONTHS_KEY]: JSON.stringify({ "2026-10": { fixed: [line(amount)], variable: [], people: [person(tax)] } }) });
  it("a valid record saves; -5 in Rent → 400 { error, field } and the stored record is unchanged", async () => {
    let r = await pf("PUT", "alice", { data: rec("2,200") });
    assert.equal(r.status, 200);
    r = await pf("PUT", "alice", { data: rec("-5") });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "Invalid value.", field: "months.2026-10.fixed.0.amount" });
    const got = (await (await pf("GET", "alice")).json()) as { data: Record<string, string> };
    assert.equal(JSON.parse(got.data[MONTHS_KEY])["2026-10"].fixed[0].amount, "2,200", "not stored, not clamped to 0");
  });
  it("a bad tax, a non-number, and a bad shared value are refused; 0 and blank are fine", async () => {
    for (const [data, field] of [
      [rec("1", "101"), "months.2026-10.people.0.tax"],
      [rec("1", "-1"), "months.2026-10.people.0.tax"],
      [rec("abc"), "months.2026-10.fixed.0.amount"],
      [{ [INCOME_KEY]: JSON.stringify({ people: [person("-3")] }) }, "income.people.0.tax"],
    ] as const) {
      const r = await pf("PUT", "alice", { data });
      assert.equal(r.status, 400, field);
      assert.equal(((await r.json()) as { field: string }).field, field);
    }
    assert.equal((await pf("PUT", "alice", { data: rec("0", "") })).status, 200);
  });
  it("Read and write (carol) is checked the same way", async () => {
    const r = await pf("PUT", "carol", { data: rec("-5") });
    assert.equal(r.status, 400);
  });
});
