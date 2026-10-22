// #215 (personal-finance-spec 55; AC PFSC-13..PFSC-16): saving a scenario needs a Personal Finance write grant, on the
// existing record route (no new table, column or migration). PGLite with a fake session, as account.server.test.ts.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest } from "./account.server.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { SCENARIO_KEY } from "./scenario.ts";

const pg = new PGlite();
const db = {
  query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows,
};
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "Alice@Example.com" };
const as = (id: string | null) => ({
  env,
  getUser: async () => (id ? { id, email: `${id}@example.com` } : null),
  getDb: async () => db,
});
const pf = (method: string, who: string | null, body?: unknown) =>
  handlePersonalFinanceRequest(
    new Request("http://localhost/api/personal-finance", {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    as(who),
  );
const stored = async () =>
  (
    await pg.query<{ data: Record<string, string> }>(
      "SELECT data FROM personal_finance WHERE user_id = 'alice'",
    )
  ).rows[0]?.data ?? null;

before(async () => {
  await pg.exec(
    'CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  for (const f of ["0010_personal_finance.sql", "0011_access.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "carol", "dave"])
    await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'),
    ('carol', 'personal_finance', true, true, 'alice'),
    ('dave', 'dashboard', true, true, 'alice')`);
});

const base = { [STORAGE_KEY]: '{"fixed":[],"variable":[],"accounts":[]}' };
const lev = (n: number) =>
  JSON.stringify({ income: { a: n }, expenses: {}, rate: null, growth: null, start: null });

describe("#215 saving a scenario (PUT /api/personal-finance with the scenario value)", () => {
  it("PFSC-13: the owner saves; the value is stored next to the record and read back", async () => {
    const r = await pf("PUT", "alice", { data: { ...base, [SCENARIO_KEY]: lev(10) } });
    assert.equal(r.status, 200);
    assert.equal((await stored())?.[SCENARIO_KEY], lev(10));
    const g = (await (await pf("GET", "alice")).json()) as { data: Record<string, string> };
    assert.equal(g.data[SCENARIO_KEY], lev(10));
    assert.equal(g.data[STORAGE_KEY], base[STORAGE_KEY]);
  });
  it("PFSC-14: Read and write (not owner) saves on the owner's record", async () => {
    assert.equal(
      (await pf("PUT", "carol", { data: { ...base, [SCENARIO_KEY]: lev(20) } })).status,
      200,
    );
    assert.equal((await stored())?.[SCENARIO_KEY], lev(20));
  });
  it("PFSC-15: Read → 403 and no grant → 403; nothing is written; Read still GETs the saved scenario", async () => {
    const before = JSON.stringify(await stored());
    assert.equal(
      (await pf("PUT", "bob", { data: { ...base, [SCENARIO_KEY]: lev(99) } })).status,
      403,
    );
    assert.equal(
      (await pf("PUT", "dave", { data: { ...base, [SCENARIO_KEY]: lev(99) } })).status,
      403,
    );
    assert.equal(
      (await pf("PUT", null, { data: { ...base, [SCENARIO_KEY]: lev(99) } })).status,
      401,
    );
    assert.equal(JSON.stringify(await stored()), before);
    const g = await pf("GET", "bob");
    assert.equal(g.status, 200);
    const body = (await g.json()) as { data: Record<string, string>; access: { write: boolean } };
    assert.equal(body.data[SCENARIO_KEY], lev(20));
    assert.equal(body.access.write, false);
  });
  it("PFSC-16: an invalid scenario value → 400 { field: scenario }, nothing stored (never clamped)", async () => {
    const before = JSON.stringify(await stored());
    const r = await pf("PUT", "alice", {
      data: { ...base, [SCENARIO_KEY]: JSON.stringify({ income: { a: 5000 } }) },
    });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "Invalid value.", field: "scenario" });
    assert.equal(JSON.stringify(await stored()), before);
  });
});
