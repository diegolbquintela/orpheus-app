import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  handlePersonalFinanceChartRequest,
  handlePersonalFinanceReportItemRequest,
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceReportsRequest,
  handlePersonalFinanceRequest,
} from "./account.server.ts";
import { STORAGE_KEY } from "./expenses.ts";

// #162 R2 (Diego, 2026-10-20; spec 47.10, PFCV-14): saving, replacing and deleting reports needs a Personal Finance write
// grant or the owner. alice owns; wendy has Read + Write; rita has Read only. Runs on PGlite under TZ=UTC and
// TZ=America/Los_Angeles (npm test both ways).
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string | null) => ({ env, getUser: async () => (id ? { id, email: `${id}@example.com` } : null), getDb: async () => db });
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const R = { series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" };
const list = (who: string | null, method: string, body?: unknown) => handlePersonalFinanceReportsRequest(req(method, "/api/personal-finance/reports", body), as(who));
const item = (who: string | null, id: string, method: string, body?: unknown) =>
  handlePersonalFinanceReportItemRequest(req(method, `/api/personal-finance/reports/${id}`, body), id, as(who));
const legacy = (who: string | null, method: string, body?: unknown) => handlePersonalFinanceReportRequest(req(method, "/api/personal-finance/report", body), as(who));
const rowOf = async (id: string) => (await pg.query<{ data: unknown }>("SELECT data FROM personal_finance WHERE user_id = $1", [id])).rows[0]?.data ?? null;
const json = async (r: Response) => (await r.json()) as { error?: string; id?: string };

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "wendy", "rita"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('wendy', 'personal_finance', true, true, 'alice'), ('rita', 'personal_finance', true, false, 'alice')`);
  const record = { [STORAGE_KEY]: JSON.stringify({ fixed: [], variable: [], accounts: [], categories: [] }) };
  assert.equal((await handlePersonalFinanceRequest(req("PUT", "/api/personal-finance", { data: record }), as("alice"))).status, 200);
});

describe("#162 R2 PFCV-14: report writes need a write grant", () => {
  it("owner and Write grant: POST, PUT, DELETE (named and legacy) succeed", async () => {
    for (const who of ["alice", "wendy"]) {
      const c = await list(who, "POST", { name: `${who} one`, report: R });
      assert.equal(c.status, 201, who);
      const id = (await json(c)).id!;
      assert.equal((await item(who, id, "PUT", { name: `${who} two`, report: { ...R, chart: "bar" } })).status, 200, who);
      assert.equal((await item(who, id, "DELETE")).status, 200, who);
      assert.equal((await legacy(who, "PUT", { report: R })).status, 200, who);
      assert.equal((await legacy(who, "DELETE")).status, 200, who);
    }
  });
  it("Read grant: every report write → 403, the stored row is unchanged; GET still 200; /chart still 200", async () => {
    // rita's row is seeded directly (a report saved before #162), so the refusals have something to leave untouched.
    const seeded = { "orpheus.finance.reports.v1": JSON.stringify([{ id: "r-0000beef", name: "Old", report: R, created_at: null, updated_at: null }]) };
    await pg.query("INSERT INTO personal_finance (user_id, data) VALUES ($1, $2)", ["rita", seeded]);
    const before = JSON.stringify(await rowOf("rita"));
    for (const [what, r] of [
      ["POST /reports", await list("rita", "POST", { name: "New", report: R })],
      ["PUT /reports/:id", await item("rita", "r-0000beef", "PUT", { name: "Changed", report: R })],
      ["DELETE /reports/:id", await item("rita", "r-0000beef", "DELETE")],
      ["PUT /reports/default", await item("rita", "default", "PUT", { report: R })],
      ["DELETE /reports/default", await item("rita", "default", "DELETE")],
      ["PUT /report", await legacy("rita", "PUT", { report: R })],
      ["DELETE /report", await legacy("rita", "DELETE")],
    ] as const) {
      assert.equal(r.status, 403, what);
      assert.equal(r.headers.get("cache-control"), "no-store", what);
    }
    assert.equal(JSON.stringify(await rowOf("rita")), before, "row unchanged");
    assert.equal((await list("rita", "GET")).status, 200);
    assert.equal((await item("rita", "r-0000beef", "GET")).status, 200);
    assert.equal((await handlePersonalFinanceChartRequest(req("POST", "/api/personal-finance/chart", R), as("rita"))).status, 200, "/chart is a read-only query");
  });
  it("signed out: report writes → 401", async () => {
    assert.equal((await list(null, "POST", { name: "x", report: R })).status, 401);
    assert.equal((await item(null, "r-0000beef", "PUT", { name: "x", report: R })).status, 401);
    assert.equal((await item(null, "r-0000beef", "DELETE")).status, 401);
    assert.equal((await legacy(null, "PUT", { report: R })).status, 401);
    assert.equal((await legacy(null, "DELETE")).status, 401);
  });
});
