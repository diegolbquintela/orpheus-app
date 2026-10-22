// #223 (personal-finance-spec 60, AC PFSS-41..47): named saved scenarios ride in the existing scenario value on the
// existing record route (no new table, column or migration). PGLite with a fake session, as scenario.server.test.ts.
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
const entry = (id: string, name: string) => ({
  id, name, savedAt: "2026-10-22T12:00:00Z", basis: "2026-10",
  inputs: { start: 1000, income: 7500, expenses: 3000, growth: 9, rate: 4 },
  values: { [STORAGE_KEY]: base[STORAGE_KEY] }, lines: "{}",
});
const value = (saved: unknown[]) => JSON.stringify({ income: {}, expenses: {}, rate: null, growth: null, start: null, saved });

describe("#223 saved scenarios on the record route", () => {
  it("PFSS-41: the owner and a writer store saved scenarios; GET reads them back", async () => {
    assert.equal((await pf("PUT", "alice", { data: { ...base, [SCENARIO_KEY]: value([entry("a", "A")]) } })).status, 200);
    assert.equal((await pf("PUT", "carol", { data: { ...base, [SCENARIO_KEY]: value([entry("a", "A"), entry("b", "B")]) } })).status, 200);
    assert.equal((await stored())?.[SCENARIO_KEY], value([entry("a", "A"), entry("b", "B")]));
  });
  it("PFSS-46/47: Read → 403 on Save/Delete (PUT), no grant → 403 on GET and PUT; nothing written; Read GETs the list", async () => {
    const before = JSON.stringify(await stored());
    assert.equal((await pf("PUT", "bob", { data: { ...base, [SCENARIO_KEY]: value([]) } })).status, 403);
    assert.equal((await pf("PUT", "dave", { data: { ...base, [SCENARIO_KEY]: value([]) } })).status, 403);
    assert.equal((await pf("GET", "dave")).status, 403);
    assert.equal(JSON.stringify(await stored()), before);
    const g = (await (await pf("GET", "bob")).json()) as { data: Record<string, string> };
    assert.equal(g.data[SCENARIO_KEY], value([entry("a", "A"), entry("b", "B")]));
  });
  it("PFSS-42: a duplicate name (any case), a blank name, over 20, or a bad entry → 400 { field: scenario }, nothing stored", async () => {
    const before = JSON.stringify(await stored());
    const bad = [
      value([entry("a", "Same"), entry("b", "same")]),
      value([entry("a", " ")]),
      value([entry("a", " padded ")]),
      value(Array.from({ length: 21 }, (_, i) => entry(`i${i}`, `N${i}`))),
      value([{ ...entry("a", "A"), inputs: { start: "x" } }]),
      value([entry("a", "A"), entry("a", "B")]),
    ];
    for (const v of bad) {
      const r = await pf("PUT", "alice", { data: { ...base, [SCENARIO_KEY]: v } });
      assert.equal(r.status, 400, v.slice(0, 80));
      assert.deepEqual(await r.json(), { error: "Invalid value.", field: "scenario" });
    }
    assert.equal(JSON.stringify(await stored()), before);
  });
});
