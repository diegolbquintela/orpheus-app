import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceChartRequest, handlePersonalFinanceReportRequest, handlePersonalFinanceRequest, handlePersonalFinanceSeriesRequest } from "./account.server.ts";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { OVERVIEW_KEY } from "./overview.ts";

// #155 (spec section 37, PFC-01..PFC-16): POST /api/personal-finance/chart (built on #154 /series) on PGlite (migrations 0010-0012,
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
const ser = (who: string, body: unknown) => handlePersonalFinanceSeriesRequest(req("POST", body), as(who), () => NOW);
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
const row = async () => (await pg.query<{ data: unknown }>("SELECT data FROM personal_finance WHERE user_id = 'alice'")).rows[0]?.data;
const audits = async () => (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event")).rows[0].n;

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

const c = (series: object[], range: object = { preset: "all" }, chart = "line") => ({ series, range, chart });
const G = (id: string) => ({ kind: "group", id });
const M = (id: string) => ({ kind: "metric", id });

describe("#155 /api/personal-finance/chart", () => {
  it("PFC-01: flag off 404; signed out 401; GET / PUT 405; no Personal Finance grant 403", async () => {
    const body = c([G("all")]);
    assert.equal((await ch("alice", body, "POST", NOW, {} as typeof env)).status, 404);
    assert.equal((await ch(null, body)).status, 401);
    assert.equal((await ch("alice", undefined, "GET")).status, 405);
    assert.equal((await ch("alice", body, "PUT")).status, 405);
    assert.equal((await ch("dave", body)).status, 403);
  });

  it("PFC-02: several series share one month axis; rows[i].values[j] = series[j].values[i]", async () => {
    const r = await ch("alice", c([{ kind: "category", id: "Home" }, { kind: "category", id: "Travel" }, M("expenses"), M("net-assets")]));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const j = await r.json();
    assert.equal(j.rows.length, j.months.length);
    assert.equal(j.labels.length, j.months.length);
    j.rows.forEach((row: { month: string; values: unknown[] }, i: number) => {
      assert.equal(row.month, j.months[i]);
      assert.deepEqual(row.values, j.series.map((s: { values: unknown[] }) => s.values[i]));
    });
  });

  it("PFC-03 (#154 conventions): fx_basis current, net_assets_from, values equal to /series exactly", async () => {
    const series = [{ kind: "category", id: "Travel" }, G("all"), M("net-assets")];
    const j = await (await ch("alice", c(series, { from: "2024-12", to: "2025-04" }))).json();
    const s = await (await ser("alice", { series, range: { from: "2024-12", to: "2025-04" } })).json();
    assert.equal(j.fx_basis, "current");
    assert.equal(j.net_assets_from, "2020-01");
    for (const k of ["range", "months", "current", "partial", "currency", "fx_basis", "net_assets_from"]) assert.deepEqual(j[k], s[k], k);
    assert.deepEqual(j.series.map((x: { values: unknown }) => x.values), s.series.map((x: { values: unknown }) => x.values));
    assert.deepEqual(j.series[2].values, [10000, 10300, 10300, 10500, 10500]);
  });

  it("PFC-04 (Q-AB2): axis = level for net-assets, flow for everything else", async () => {
    const j = await (await ch("alice", c([G("all"), M("income"), M("net-assets"), { kind: "line", id: "rent" }]))).json();
    assert.deepEqual(j.series.map((s: { axis: string }) => s.axis), ["flow", "flow", "level", "flow"]);
  });

  it("PFC-05 (Q-AB3): stacked-bar stacks parts only (lines, accounts, categories, fixed / variable), never all or metrics", async () => {
    const series = [{ kind: "category", id: "Home" }, { kind: "account", id: "Amex" }, { kind: "line", id: "rent" }, G("fixed"), G("all"), M("expenses")];
    const st = await (await ch("alice", c(series, { preset: "all" }, "stacked-bar"))).json();
    assert.deepEqual(st.series.map((s: { stack: boolean }) => s.stack), [true, true, true, true, false, false]);
    for (const chart of ["line", "bar"]) {
      const j = await (await ch("alice", c(series, { preset: "all" }, chart))).json();
      assert.ok(j.series.every((s: { stack: boolean }) => s.stack === false), chart);
      assert.equal(j.chart, chart);
    }
  });

  it("PFC-06 (#165): a deleted category keeps its history and label in the chart; parts still add up to all", async () => {
    const j = await (await ch("alice", c([{ kind: "category", id: "Home" }, { kind: "category", id: "Travel" }, G("all")], { preset: "all" }, "stacked-bar"))).json();
    assert.equal(j.series[1].label, "Travel (deleted)");
    for (const k of ["2020-01", "2026-03", "2026-09"]) {
      const row = j.rows[j.months.indexOf(k)];
      assert.equal(row.values[0] + row.values[1], row.values[2], k);
    }
  });

  it("PFC-07: labels are short month names; the current month's row is partial", async () => {
    const j = await (await ch("alice", c([G("all")], { preset: "3m" }))).json();
    assert.deepEqual(j.months, ["2026-08", "2026-09", "2026-10"]);
    assert.deepEqual(j.rows.map((r: { partial: boolean }) => r.partial), [false, false, true]);
    assert.equal(j.labels[2], j.rows[2].label);
    assert.match(j.labels[2], /Oct/);
  });

  it("PFC-08..PFC-11: refusals name the field (400) or 413; not JSON 400", async () => {
    const cases: [unknown, string][] = [
      [c([{ kind: "pie", id: "x" }]), "series.0.kind"],
      [c([]), "series"],
      [c([G("all")], { preset: "5y" }), "range.preset"],
      [c([G("all")], { from: "2019-12", to: "2020-02" }), "range"],
      [c([G("all")], { preset: "all" }, "pie"), "chart"],
      [{ series: [G("all")], range: { preset: "all" } }, "chart"],
      [{ ...c([G("all")]), extra: 1 }, "query"],
      [{ saved: false }, "query"],
      [{ saved: true, chart: "line" }, "query"],
      [[1], "query"],
    ];
    for (const [body, field] of cases) {
      const r = await ch("alice", body);
      assert.equal(r.status, 400, JSON.stringify(body));
      // #179 Q-AF4 (CFO, 2026-10-17): the from-bound says why; status and field unchanged.
      const from = (body as { range?: { from?: string } }).range?.from;
      assert.deepEqual(await r.json(), { error: from === "2019-12" ? "Range can't start before 2020-01." : "Invalid value.", field });
    }
    assert.equal((await ch("alice", "{nope")).status, 400);
    assert.equal((await ch("alice", JSON.stringify(c([G("all")])) + " ".repeat(4100))).status, 413);
  });

  it("PFC-12 (Q-AB5): { saved: true } with no saved report → 404 No saved report.", async () => {
    const r = await ch("bob", { saved: true });
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: "No saved report." });
  });

  it("PFC-13 (Q-AB5): { saved: true } charts the person's own saved report (series, range, chart as saved)", async () => {
    const report = { series: [{ kind: "category", id: "Travel" }, G("all")], range: { preset: "12m" }, chart: "stacked-bar" };
    assert.equal((await rep("bob", "PUT", { report })).status, 200);
    const j = await (await ch("bob", { saved: true })).json();
    assert.equal(j.source, "saved");
    assert.equal(j.chart, "stacked-bar");
    assert.equal(j.months.length, 12);
    const direct = await (await ch("bob", c(report.series, report.range, report.chart))).json();
    assert.deepEqual({ ...j, source: "request" }, direct);
    assert.equal((await ch("alice", { saved: true })).status, 404, "alice has no report: bob's is his own");
  });

  it("PFC-14: a CFO with Read gets the same chart data as the owner", async () => {
    const body = c([{ kind: "category", id: "Travel" }, M("net-assets")]);
    assert.deepEqual(await (await ch("bob", body)).json(), await (await ch("alice", body)).json());
  });

  it("PFC-15: a missing series keeps its column (all null) and does not shift the others", async () => {
    const j = await (await ch("alice", c([{ kind: "line", id: "gone" }, { kind: "line", id: "rent" }]))).json();
    assert.equal(j.series[0].missing, true);
    assert.ok(j.rows.every((r: { values: unknown[] }) => r.values[0] === null));
    assert.equal(j.rows[j.months.indexOf("2020-01")].values[1], 900);
  });

  it("PFC-16: read-only: the owner's row and the audit log are unchanged by chart calls", async () => {
    const before = [await row(), await audits()];
    await ch("alice", c([G("all")]));
    await ch("bob", { saved: true });
    assert.deepEqual([await row(), await audits()], before);
  });

  it("PFC-17 (CFO condition on Q-AB2): mixed_axes is true only with both a level and a flow series, in request and saved modes", async () => {
    const mixed = await (await ch("alice", c([M("net-assets"), G("all")]))).json();
    assert.equal(mixed.mixed_axes, true);
    assert.equal(typeof mixed.chart, "string");
    const level = await (await ch("alice", c([M("net-assets")]))).json();
    assert.equal(level.mixed_axes, false);
    const flow = await (await ch("alice", c([G("all"), M("income"), { kind: "category", id: "Travel" }]))).json();
    assert.equal(flow.mixed_axes, false);
    const report = { series: [M("net-assets"), M("expenses")], range: { preset: "6m" }, chart: "line" };
    assert.equal((await rep("bob", "PUT", { report })).status, 200);
    const saved = await (await ch("bob", { saved: true })).json();
    assert.equal(saved.source, "saved");
    assert.equal(saved.mixed_axes, true);
    assert.equal((await rep("bob", "PUT", { report: { ...report, series: [M("expenses")] } })).status, 200);
    assert.equal((await (await ch("bob", { saved: true })).json()).mixed_axes, false);
  });
});
