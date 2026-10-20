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
import { REPORT_KEY } from "./report.ts";
import { REPORTS_KEY } from "./reports.ts";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { OVERVIEW_KEY } from "./overview.ts";

// #156 (spec section 38, PFRC-01..PFRC-18): /api/personal-finance/reports and /reports/:id on PGlite (migrations 0010-0012,
// unchanged) with a fake session lookup and a fixed clock. alice owns; bob is a CFO with Read; dave has no Personal
// Finance grant. Runs under TZ=UTC and TZ=America/Los_Angeles (npm test both ways): the household month is Toronto's.
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string | null, e: Record<string, string> = env) => ({
  env: e,
  getUser: async () => (id ? { id, email: `${id}@example.com` } : null),
  getDb: async () => db,
});
const NOW = new Date("2026-10-16T16:00:00Z");
const req = (method: string, body?: unknown, path = "/api/personal-finance/series") =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const ch = (who: string | null, body?: unknown, method = "POST", now = NOW, e = env) =>
  handlePersonalFinanceChartRequest(req(method, body, "/api/personal-finance/chart"), as(who, e), () => now);
const rep = (who: string, method: string, body?: unknown) =>
  handlePersonalFinanceReportRequest(req(method, body, "/api/personal-finance/report"), as(who));
const L = (id: string, amount: string, category = "", account = ""): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
const record = {
  [STORAGE_KEY]: JSON.stringify({
    fixed: [L("rent", "1000", "Home", "Chequing")],
    variable: [],
    accounts: ["Chequing"],
    categories: ["Home"],
    deletedCategories: [{ name: "Travel", from: "2026-06" }],
    deletedAccounts: [{ name: "Amex", from: "2026-06" }],
  }),
  [MONTHS_KEY]: JSON.stringify({
    "2020-01": { fixed: [L("rent", "900", "Home", "Chequing")], variable: [L("t", "100", "Travel", "Amex")], people: [] },
    "2026-03": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [L("t", "200", "Travel", "Amex")], people: [] },
    "2026-09": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [], people: [] },
  }),
  // #154 Q-AA4 change: typed Update totals (income) in months without lines, for the net-assets checks.
  [OVERVIEW_KEY]: JSON.stringify({ start: "10000", growth: "", future: false, years: 1, months: { "2025-01": { expenses: "500", income: "800" }, "2025-03": { expenses: "500", income: "700" } } }),
};

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "dave"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, true, 'alice') /* #162 R2: bob now has Write so his own report saves still run; Read-grant refusals are in reports-write.server.test.ts */, ('dave', 'dashboard', true, true, 'alice')`);
  const r = await handlePersonalFinanceRequest(req("PUT", { data: record }, "/api/personal-finance"), as("alice"));
  assert.equal(r.status, 200);
});

const list = (who: string | null, method = "GET", body?: unknown, e = env) =>
  handlePersonalFinanceReportsRequest(req(method, body, "/api/personal-finance/reports"), as(who, e));
const item = (who: string | null, id: string, method = "GET", body?: unknown) =>
  handlePersonalFinanceReportItemRequest(req(method, body, `/api/personal-finance/reports/${id}`), id, as(who));
const rec = (who: string, method: string, body?: unknown) =>
  handlePersonalFinanceRequest(req(method, body, "/api/personal-finance"), as(who));
const rowOf = async (id: string) => (await pg.query<{ data: Record<string, string> }>("SELECT data FROM personal_finance WHERE user_id = $1", [id])).rows[0]?.data ?? null;
const actions = async () => (await pg.query<{ action: string }>("SELECT action FROM audit_event ORDER BY id")).rows.map((r) => r.action);
const R = (chart = "line", id = "all") => ({ series: [{ kind: "group", id }], range: { preset: "12m" }, chart });
const LEGACY = { series: [{ kind: "category", id: "Travel" }, { kind: "line", id: "gone" }], range: { preset: "6m" }, chart: "bar" };

describe("#156 /api/personal-finance/reports", () => {
  it("PFRC-01: flag off 404; signed out 401; other methods 405; no Personal Finance grant 403", async () => {
    assert.equal((await list("alice", "GET", undefined, {} as typeof env)).status, 404);
    assert.equal((await list(null)).status, 401);
    assert.equal((await item(null, "default")).status, 401);
    assert.equal((await list("alice", "DELETE")).status, 405);
    assert.equal((await item("alice", "default", "POST", {})).status, 405);
    assert.equal((await list("dave")).status, 403);
    assert.equal((await list("dave", "POST", { name: "x", report: R() })).status, 403);
    assert.equal((await item("dave", "default")).status, 403);
  });

  it("PFRC-02: nothing saved → { reports: [], limit: 20 }", async () => {
    const r = await list("alice");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(await r.json(), { reports: [], limit: 20 });
  });

  it("PFRC-03 (Q-AC1 compat): a legacy PUT /report is the default report (first, named Default); legacy GET unchanged", async () => {
    assert.equal((await rep("alice", "PUT", { report: LEGACY })).status, 200);
    const l = await (await list("alice")).json();
    assert.equal(l.reports.length, 1);
    assert.deepEqual(
      { ...l.reports[0] },
      { id: "default", name: "Default", default: true, report: LEGACY, missing: [1], deleted: [0], labels: ["Travel (deleted)", "gone"], created_at: null, updated_at: null },
    );
    assert.deepEqual(await (await item("alice", "default")).json(), l.reports[0]);
    const legacy = await (await rep("alice", "GET")).json();
    assert.deepEqual(legacy, { report: LEGACY, missing: [1], deleted: [0], labels: ["Travel (deleted)", "gone"] });
  });

  it("PFRC-04: POST creates a named report (201, r-xxxxxxxx); GET returns it; the list is default first, then oldest first", async () => {
    const a = await list("alice", "POST", { name: "  Monthly spend ", report: R("bar") });
    assert.equal(a.status, 201);
    const ja = await a.json();
    assert.match(ja.id, /^r-[0-9a-f]{8}$/);
    assert.equal(ja.name, "Monthly spend");
    assert.equal(ja.default, false);
    assert.ok(ja.created_at && ja.created_at === ja.updated_at);
    const jb = await (await list("alice", "POST", { name: "Fixed", report: R("line", "fixed") })).json();
    assert.deepEqual(await (await item("alice", ja.id)).json(), ja);
    const l = await (await list("alice")).json();
    assert.deepEqual(l.reports.map((r: { id: string }) => r.id), ["default", ja.id, jb.id]);
  });

  it("PFRC-05: PUT replaces a named report's name and report; created_at kept, updated_at moves", async () => {
    const l = await (await list("alice")).json();
    const id = l.reports[1].id;
    await new Promise((r) => setTimeout(r, 5));
    const r = await item("alice", id, "PUT", { name: "Spend", report: R("stacked-bar", "variable") });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.name, "Spend");
    assert.deepEqual(j.report, R("stacked-bar", "variable"));
    assert.equal(j.created_at, l.reports[1].created_at);
    assert.ok(j.updated_at > j.created_at);
    assert.equal((await item("alice", id, "PUT", { name: "spend", report: R() })).status, 200, "own name, other case: allowed");
  });

  it("PFRC-06 (Q-AC3, Q-AC12): refusals name the field (400) or 413; nothing stored", async () => {
    const before = await rowOf("alice");
    const cases: [unknown, string][] = [
      [{ name: "", report: R() }, "name"],
      [{ name: "   ", report: R() }, "name"],
      [{ name: "x".repeat(61), report: R() }, "name"],
      [{ name: "a\u0007b", report: R() }, "name"],
      [{ report: R() }, "name"],
      [{ name: "ok", report: { ...R(), series: [{ kind: "pie", id: "x" }] } }, "report.series.0.kind"],
      [{ name: "ok", report: { ...R(), range: { from: "2026-01", to: "2028-06" } } }, "report.range"],
      [{ name: "ok", report: { ...R(), chart: "pie" } }, "report.chart"],
      [{ name: "ok" }, "report"],
      [{ name: "ok", report: R(), extra: 1 }, "body"],
      [[1], "body"],
    ];
    for (const [body, field] of cases) {
      const r = await list("alice", "POST", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      // #179 Q-AF4 (CFO, 2026-10-17): 2026-01..2028-06 also ends after the current month, and the bound is checked before
      // the 24-month cap, so it now says why (status and field unchanged). An in-bounds range over the cap stays `Invalid value.`.
      const to = (body as { report?: { range?: { to?: string } } }).report?.range?.to;
      const error = to === "2028-06" ? "Range can't end after the current month." : "Invalid value.";
      assert.deepEqual(await r.json(), { error, field }, JSON.stringify(body));
    }
    const cap = await list("alice", "POST", { name: "ok", report: { ...R(), range: { from: "2020-01", to: "2026-10" } } });
    // #171 CFO round (2026-10-17): the cap now says why (status and field unchanged).
    assert.deepEqual([cap.status, await cap.json()], [400, { error: "Range can't be longer than 24 months.", field: "report.range" }], "cap only");
    assert.equal((await list("alice", "POST", "{nope")).status, 400);
    assert.equal((await list("alice", "POST", JSON.stringify({ name: "big", report: R() }) + " ".repeat(5000))).status, 413);
    assert.deepEqual(await rowOf("alice"), before);
  });

  it("PFRC-07 (Q-AC3): names are unique in any case; Default is reserved; 409 Name already used.", async () => {
    for (const name of ["FIXED", "default", "Default "]) {
      const r = await list("alice", "POST", { name, report: R() });
      assert.equal(r.status, 409, name);
      assert.deepEqual(await r.json(), { error: "Name already used.", field: "name" });
    }
    const l = await (await list("alice")).json();
    assert.equal((await item("alice", l.reports[1].id, "PUT", { name: "fixed", report: R() })).status, 409);
  });

  it("PFRC-08 (Q-AC4): at most 20 named reports; the 21st → 409 Report limit reached.", async () => {
    const have = (await (await list("alice")).json()).reports.filter((r: { default: boolean }) => !r.default).length;
    for (let i = have; i < 20; i++) assert.equal((await list("alice", "POST", { name: `R${i}`, report: R() })).status, 201);
    const r = await list("alice", "POST", { name: "one more", report: R() });
    assert.equal(r.status, 409);
    assert.deepEqual(await r.json(), { error: "Report limit reached." });
    const l = await (await list("alice")).json();
    assert.equal(l.reports.length, 21, "20 named + the default");
  });

  it("PFRC-09: an unknown or malformed id → 404 Report not found.", async () => {
    for (const id of ["r-00000000", "nope", "r-XYZ", "DEFAULT"]) {
      const r = await item("alice", id);
      assert.equal(r.status, 404, id);
      assert.deepEqual(await r.json(), { error: "Report not found." });
      assert.equal((await item("alice", id, "PUT", { name: "x", report: R() })).status, 404);
      assert.equal((await item("alice", id, "DELETE")).status, 404);
    }
  });

  it("PFRC-10 (Q-AC5): PUT /reports/default writes the legacy value (legacy GET sees it); it cannot be renamed", async () => {
    let r = await item("alice", "default", "PUT", { report: R("line", "fixed") });
    assert.equal(r.status, 200);
    assert.equal((await rowOf("alice"))?.[REPORT_KEY], JSON.stringify(R("line", "fixed")));
    assert.deepEqual((await (await rep("alice", "GET")).json()).report, R("line", "fixed"));
    r = await item("alice", "default", "PUT", { name: "Mine", report: R() });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "The default report cannot be renamed.", field: "name" });
    assert.equal((await item("alice", "default", "PUT", { name: "default", report: LEGACY })).status, 200);
  });

  it("PFRC-11 (Q-AC6): DELETE a named report; DELETE default = the legacy DELETE (named reports stay)", async () => {
    const l = await (await list("alice")).json();
    const id = l.reports[1].id;
    let r = await item("alice", id, "DELETE");
    assert.deepEqual(await r.json(), { deleted: id });
    assert.equal((await item("alice", id)).status, 404);
    r = await item("alice", "default", "DELETE");
    assert.deepEqual(await r.json(), { deleted: "default" });
    assert.deepEqual(await (await rep("alice", "GET")).json(), { report: null, missing: [], deleted: [], labels: [] });
    assert.equal((await item("alice", "default")).status, 404);
    const after = await (await list("alice")).json();
    assert.equal(after.reports.length, 19);
    assert.ok(after.reports.every((x: { default: boolean }) => !x.default));
    assert.ok((await rowOf("alice"))?.[REPORTS_KEY]);
  });

  it("PFRC-12 (Q-AC8): reports are per person; a Read CFO keeps their own; another person's id is 404", async () => {
    const b = await (await list("bob", "POST", { name: "CFO view", report: R() })).json();
    assert.equal((await item("alice", b.id)).status, 404);
    const bl = await (await list("bob")).json();
    assert.deepEqual(bl.reports.map((x: { id: string }) => x.id), [b.id]);
    assert.equal(bl.reports[0].missing.length, 0, "series resolve against the owner's record");
  });

  it("PFRC-13 (Q-AC1 compat): the record API never shows reports and a record save keeps them", async () => {
    const before = await rowOf("alice");
    const got = await (await rec("alice", "GET")).json();
    assert.ok(!(REPORTS_KEY in (got.data ?? {})) && !(REPORT_KEY in (got.data ?? {})));
    assert.equal((await rec("alice", "PUT", { data: got.data })).status, 200);
    assert.equal((await rowOf("alice"))?.[REPORTS_KEY], before?.[REPORTS_KEY]);
    const bobRec = await (await rec("bob", "GET")).json();
    assert.ok(bobRec.data === null || !(REPORTS_KEY in bobRec.data));
    assert.equal((await rec("alice", "PUT", { data: { [REPORTS_KEY]: "[]" } })).status, 400, "the name is refused on the record API");
  });

  it("PFRC-14 (Q-AC10): chart { saved: true } still uses the default; { saved: true, id } a named report; unknown → 404", async () => {
    assert.deepEqual(await (await ch("alice", { saved: true })).json(), { error: "No saved report." }, "default deleted in PFRC-11");
    assert.equal((await rep("alice", "PUT", { report: R("bar", "all") })).status, 200);
    let j = await (await ch("alice", { saved: true })).json();
    assert.equal(j.chart, "bar");
    j = await (await ch("alice", { saved: true, id: "default" })).json();
    assert.equal(j.chart, "bar");
    const named = (await (await list("alice")).json()).reports.find((x: { default: boolean }) => !x.default);
    j = await (await ch("alice", { saved: true, id: named.id })).json();
    assert.equal(j.source, "saved");
    assert.equal(j.chart, named.report.chart);
    let r = await ch("alice", { saved: true, id: "r-00000000" });
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: "No saved report." });
    r = await ch("alice", { saved: true, id: "bad id" });
    assert.deepEqual(await r.json(), { error: "Invalid value.", field: "query" });
    const bobs = (await (await list("bob")).json()).reports[0].id;
    assert.equal((await ch("alice", { saved: true, id: bobs })).status, 404, "never another person's report");
  });

  it("PFRC-15: a stored entry that is no longer valid is skipped on read; the rest stay", async () => {
    const list0 = JSON.parse((await rowOf("bob"))![REPORTS_KEY]);
    const broken = [...list0, { id: "r-deadbeef", name: "bad", report: { series: [], range: { preset: "3m" }, chart: "line" } }, { id: "oops", name: "x", report: R() }];
    await pg.query("UPDATE personal_finance SET data = data || jsonb_build_object($2::text, $3::text) WHERE user_id = $1", ["bob", REPORTS_KEY, JSON.stringify(broken)]);
    const l = await (await list("bob")).json();
    assert.deepEqual(l.reports.map((x: { id: string }) => x.id), [list0[0].id]);
  });

  it("PFRC-16: the last named report deleted with no other data removes the person's row (as #153)", async () => {
    const before = await rowOf("bob");
    assert.ok(before && Object.keys(before).length === 1);
    const id = (await (await list("bob")).json()).reports[0].id;
    assert.equal((await item("bob", id, "DELETE")).status, 200);
    assert.equal(await rowOf("bob"), null);
  });

  it("PFRC-17: create / update audit pf.report_save; delete pf.report_delete; reads audit nothing", async () => {
    const before = (await actions()).length;
    await list("alice");
    const c = await list("alice", "POST", { name: "Audit me", report: R() });
    assert.equal(c.status, 201, "19 named after PFRC-11");
    const id = (await c.json()).id;
    await item("alice", id);
    await item("alice", id, "PUT", { name: "Audit me 2", report: R() });
    await item("alice", id, "DELETE");
    assert.deepEqual((await actions()).slice(before), ["pf.report_save", "pf.report_save", "pf.report_delete"]);
  });

  it("PFRC-18 (Q-AC1 compat): legacy PUT /report never touches named reports; legacy DELETE neither", async () => {
    const named = (await rowOf("alice"))?.[REPORTS_KEY];
    assert.equal((await rep("alice", "PUT", { report: LEGACY })).status, 200);
    assert.equal((await rep("alice", "DELETE")).status, 200);
    assert.equal((await rowOf("alice"))?.[REPORTS_KEY], named);
  });
});
