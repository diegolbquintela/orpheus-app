import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceRequest,
} from "./account.server.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { REPORT_KEY, type Report } from "./report.ts";
import { deleteReport, loadReport, REPORT_API, saveReport } from "./report-client.ts";

// #153 (spec section 33, PFR-01..PFR-15): /api/personal-finance/report on PGlite (migrations 0010-0012, unchanged)
// with a fake session lookup. alice is the owner; bob a CFO with Read; dave has no Personal Finance grant.
const pg = new PGlite();
const db = {
  query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows,
};
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string | null, e: Record<string, string> = env) => ({
  env: e,
  getUser: async () => (id ? { id, email: `${id}@example.com` } : null),
  getDb: async () => db,
});
const req = (method: string, body?: unknown, path = REPORT_API) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const rep = (method: string, who: string | null, body?: unknown) =>
  handlePersonalFinanceReportRequest(req(method, body), as(who));
const rec = (method: string, who: string, body?: unknown) =>
  handlePersonalFinanceRequest(req(method, body, "/api/personal-finance"), as(who));
/** The client helpers with `fetch` going straight into the real handler as `who`. */
const via = (who: string) => async (input: string, init?: RequestInit) =>
  handlePersonalFinanceReportRequest(new Request(`http://localhost${input}`, init), as(who));
const row = async (id: string) =>
  (
    await pg.query<{ data: Record<string, string> }>(
      "SELECT data FROM personal_finance WHERE user_id = $1",
      [id],
    )
  ).rows[0]?.data ?? null;
const audits = async () =>
  (await pg.query<{ action: string }>("SELECT action FROM audit_event ORDER BY id")).rows.map(
    (r) => r.action,
  );

/** #165: `deleted` / `labels` are pinned in report-deleted.server.test.ts; these #153 checks compare the rest. */
const core = (j: { report: unknown; missing: unknown }) => ({ report: j.report, missing: j.missing });
const line = (id: string) => ({
  id,
  name: id,
  amount: "1",
  per: "month",
  equity: "",
  account: "",
  currency: "",
  rate: "",
  category: "",
});
const record = {
  [STORAGE_KEY]: JSON.stringify({
    fixed: [line("q1")],
    variable: [],
    accounts: ["Chequing"],
    categories: [],
  }),
};
const report: Report = {
  series: [
    { kind: "line", id: "q1" },
    { kind: "line", id: "gone" },
    { kind: "account", id: "Chequing" },
    { kind: "metric", id: "net-assets" },
  ],
  range: { preset: "12m" },
  chart: "stacked-bar",
};

before(async () => {
  await pg.exec(
    'CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "dave"])
    await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'), ('dave', 'dashboard', true, true, 'alice')`);
});

describe("#153 /api/personal-finance/report", () => {
  it("PFR-01: flag off 404; signed out 401 for GET / PUT / DELETE; another method 405", async () => {
    assert.equal(
      (await handlePersonalFinanceReportRequest(req("GET"), as("alice", {}))).status,
      404,
    );
    for (const m of ["GET", "PUT", "DELETE"])
      assert.equal((await rep(m, null, m === "PUT" ? { report } : undefined)).status, 401, m);
    assert.equal((await rep("POST", "alice", { report })).status, 405);
  });

  it("PFR-02 / PFR-03: nothing saved → null; PUT stores (canonical) and GET returns it with missing", async () => {
    let r = await rep("GET", "alice");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(core(await r.json()), { report: null, missing: [] });
    assert.equal((await rec("PUT", "alice", { data: record })).status, 200);
    r = await rep("PUT", "alice", {
      report: { chart: report.chart, range: report.range, series: report.series },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(core(await r.json()), { report, missing: [1] });
    assert.deepEqual(core(await (await rep("GET", "alice")).json()), { report, missing: [1] });
    assert.equal((await row("alice"))?.[REPORT_KEY], JSON.stringify(report));
  });

  it("PFR-04: PUT replaces the whole report (one per person)", async () => {
    const next: Report = {
      series: [{ kind: "group", id: "fixed" }],
      range: { from: "2026-01", to: "2026-09" },
      chart: "bar",
    };
    assert.equal((await rep("PUT", "alice", { report: next })).status, 200);
    assert.deepEqual(core(await (await rep("GET", "alice")).json()), { report: next, missing: [] });
    assert.equal((await rep("PUT", "alice", { report })).status, 200);
  });

  it("PFR-05..PFR-10: refusals name the field (400) or 413; nothing stored", async () => {
    const before = await row("alice");
    const cases: [unknown, number, Record<string, string>][] = [
      [
        { report: { ...report, series: [{ kind: "pie", id: "x" }] } },
        400,
        { error: "Invalid value.", field: "series.0.kind" },
      ],
      [{ report: { ...report, series: [] } }, 400, { error: "Invalid value.", field: "series" }],
      [
        // #179: `all` is now a valid saved preset (spec 41); an unknown preset is still refused.
        { report: { ...report, range: { preset: "5y" } } },
        400,
        { error: "Invalid value.", field: "range.preset" },
      ],
      [
        { report: { ...report, range: { from: "2026-09", to: "2026-01" } } },
        400,
        { error: "Invalid value.", field: "range" },
      ],
      [{ report: { ...report, chart: "pie" } }, 400, { error: "Invalid value.", field: "chart" }],
      [{ report: { ...report, owner: "x" } }, 400, { error: "Invalid value.", field: "report" }],
      [{}, 400, { error: "Invalid value.", field: "report" }],
      ["{not json", 400, { error: "Body must be JSON." }],
      [{ report, pad: "x".repeat(5000) }, 413, { error: "Report too large." }],
    ];
    for (const [body, status, json] of cases) {
      const r = await rep("PUT", "alice", body);
      assert.equal(r.status, status, JSON.stringify(json));
      assert.deepEqual(await r.json(), json);
    }
    assert.deepEqual(await row("alice"), before);
  });

  it("PFR-13: the record API never shows the report, keeps it on save, refuses the name", async () => {
    assert.deepEqual((await (await rec("GET", "alice")).json()).data, record);
    const changed = {
      [STORAGE_KEY]: JSON.stringify({ fixed: [], variable: [], accounts: [], categories: [] }),
    };
    assert.equal((await rec("PUT", "alice", { data: changed })).status, 200);
    assert.deepEqual(core(await (await rep("GET", "alice")).json()), { report, missing: [0, 1, 2] });
    const r = await rec("PUT", "alice", { data: { ...changed, [REPORT_KEY]: "{}" } });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /^Unknown name/);
    assert.equal((await rec("PUT", "alice", { data: record })).status, 200);
  });

  it("PFR-14: per person; a Read CFO saves their own; missing uses the owner's record; no grant 403", async () => {
    assert.deepEqual(core(await (await rep("GET", "bob")).json()), { report: null, missing: [] });
    const mine: Report = {
      series: [
        { kind: "line", id: "q1" },
        { kind: "category", id: "Travel" },
      ],
      range: { preset: "ytd" },
      chart: "line",
    };
    const r = await rep("PUT", "bob", { report: mine });
    assert.equal(r.status, 200);
    assert.deepEqual(core(await r.json()), { report: mine, missing: [1] });
    assert.deepEqual(core(await (await rep("GET", "alice")).json()), { report, missing: [1] });
    assert.deepEqual(core(await (await rep("GET", "bob")).json()), { report: mine, missing: [1] });
    // bob's own row holds only his report; the owner's record (what bob sees) is unchanged.
    assert.deepEqual(await row("bob"), { [REPORT_KEY]: JSON.stringify(mine) });
    assert.deepEqual((await (await rec("GET", "bob")).json()).data, record);
    for (const m of ["GET", "PUT", "DELETE"])
      assert.equal((await rep(m, "dave", m === "PUT" ? { report } : undefined)).status, 403, m);
  });

  it("PFR-12: DELETE removes it; a row that only held the report goes; the owner's record stays", async () => {
    let r = await rep("DELETE", "bob");
    assert.deepEqual(core(await r.json()), { report: null, missing: [] });
    assert.deepEqual(core(await (await rep("GET", "bob")).json()), { report: null, missing: [] });
    assert.equal(await row("bob"), null);
    r = await rep("DELETE", "alice");
    assert.equal(r.status, 200);
    assert.deepEqual(await row("alice"), record);
    assert.deepEqual(await audits(), [
      "pf.save",
      "pf.report_save",
      "pf.report_save",
      "pf.report_save",
      "pf.save",
      "pf.save",
      "pf.report_save",
      "access.denied",
      "access.denied",
      "access.denied",
      "pf.report_delete",
      "pf.report_delete",
    ]);
  });

  it("Q-X7: the owner's record DELETE (wipe) removes the owner's report too", async () => {
    assert.equal((await rep("PUT", "alice", { report })).status, 200);
    assert.equal((await rec("DELETE", "alice")).status, 200);
    assert.deepEqual(core(await (await rep("GET", "alice")).json()), { report: null, missing: [] });
    // A report saved before any record: the record still reads as none yet.
    assert.equal((await rep("PUT", "alice", { report })).status, 200);
    assert.equal((await (await rec("GET", "alice")).json()).data, null);
    assert.equal((await rep("DELETE", "alice")).status, 200);
    assert.equal(await row("alice"), null);
  });

  it("PFR-15: the client helpers use the shared validator and the real handler", async () => {
    assert.equal((await rec("PUT", "alice", { data: record })).status, 200);
    const bad = await saveReport({ ...report, chart: "pie" as Report["chart"] }, async () => {
      throw new Error("must not be sent");
    });
    assert.deepEqual(bad, { ok: false, status: 400, error: "Invalid value.", field: "chart" });
    const saved = await saveReport(report, via("bob"));
    assert.deepEqual(saved, { ok: true, report, missing: [1], deleted: [], labels: report.series.map((x) => x.id) });
    assert.deepEqual(core(await loadReport(via("bob"))), { report, missing: [1] });
    assert.equal(await deleteReport(via("bob")), true);
    assert.deepEqual(core(await loadReport(via("bob"))), { report: null, missing: [] });
  });
});
