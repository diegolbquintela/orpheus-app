import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest, handlePersonalFinanceSeriesRequest } from "./account.server.ts";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { OVERVIEW_KEY } from "./overview.ts";
import { rangeMonths } from "./series.ts";

// #154 (spec section 36, PFS-01..PFS-16): POST /api/personal-finance/series on PGlite (migrations 0010-0012,
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
const ser = (who: string | null, body?: unknown, method = "POST", now = NOW, e = env) =>
  handlePersonalFinanceSeriesRequest(req(method, body), as(who, e), () => now);
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
const at = (j: { months: string[] }, k: string) => j.months.indexOf(k);

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "dave"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'), ('dave', 'dashboard', true, true, 'alice')`);
  const r = await handlePersonalFinanceRequest(req("PUT", { data: record }, "/api/personal-finance"), as("alice"));
  assert.equal(r.status, 200);
});

const q = (series: object[], range: object = { preset: "all" }) => ({ series, range });

describe("#154 /api/personal-finance/series", () => {
  it("PFS-01: flag off 404; signed out 401; GET / PUT 405; no Personal Finance grant 403", async () => {
    const body = q([{ kind: "group", id: "all" }]);
    assert.equal((await ser("alice", body, "POST", NOW, {} as typeof env)).status, 404);
    assert.equal((await ser(null, body)).status, 401);
    assert.equal((await ser("alice", undefined, "GET")).status, 405);
    assert.equal((await ser("alice", body, "PUT")).status, 405);
    assert.equal((await ser("dave", body)).status, 403);
  });

  it("PFS-02: a CFO with Read gets the owner's series, the same as the owner; no-store", async () => {
    const body = q([{ kind: "category", id: "Travel" }, { kind: "group", id: "all" }]);
    const a = await ser("alice", body);
    const b = await ser("bob", body);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.headers.get("cache-control"), "no-store");
    assert.deepEqual(await b.json(), await a.json());
  });

  it("PFS-03..PFS-07: refusals name the field (400) or 413", async () => {
    const ok = [{ kind: "group", id: "all" }];
    const cases: [unknown, number, string | undefined][] = [
      [q([{ kind: "pie", id: "x" }]), 400, "series.0.kind"],
      [q([]), 400, "series"],
      [q(Array.from({ length: 13 }, (_, i) => ({ kind: "line", id: `l${i}` }))), 400, "series"],
      [q(ok, { preset: "5y" }), 400, "range.preset"],
      [q(ok, { from: "2019-12", to: "2020-06" }), 400, "range"],
      [q(ok, { from: "2026-01", to: "2026-11" }), 400, "range"],
      [q(ok, { from: "2026-05", to: "2026-04" }), 400, "range"],
      [{ ...q(ok), chart: "line" }, 400, "query"],
    ];
    for (const [body, status, field] of cases) {
      const r = await ser("alice", body);
      assert.equal(r.status, status, JSON.stringify(body));
      assert.deepEqual(await r.json(), { error: "Invalid value.", field });
    }
    let r = await ser("alice", "{not json");
    assert.equal(r.status, 400);
    r = await ser("alice", JSON.stringify(q(ok)) + " ".repeat(4100));
    assert.equal(r.status, 413);
  });

  it("PFS-08 (Q-AA1): a custom range reaches back to 2020-01 (82 months to 2026-10, no 24-month cap)", async () => {
    const r = await ser("alice", q([{ kind: "group", id: "all" }], { from: "2020-01", to: "2026-10" }));
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.months.length, 82);
    assert.deepEqual(j.range, { from: "2020-01", to: "2026-10" });
    assert.equal(j.series[0].values[0], 1000);
  });

  it("PFS-09 (#165): a deleted category / account returns its past data under its (deleted) label", async () => {
    const j = await (await ser("alice", q([{ kind: "category", id: "Travel" }, { kind: "account", id: "Amex" }]))).json();
    for (const s of j.series) {
      assert.equal(s.deleted, true);
      assert.equal(s.missing, false);
      assert.equal(s.values[at(j, "2020-01")], 100);
      assert.equal(s.values[at(j, "2026-03")], 200);
    }
    assert.equal(j.series[0].label, "Travel (deleted)");
    assert.equal(j.series[1].label, "Amex (deleted)");
  });

  it("PFS-10 (Q-AA2): no data that month → null; a month with data but none on the series → 0", async () => {
    const j = await (await ser("alice", q([{ kind: "category", id: "Travel" }, { kind: "metric", id: "expenses" }]))).json();
    assert.equal(j.series[0].values[at(j, "2026-04")], null);
    assert.equal(j.series[1].values[at(j, "2026-04")], null);
    assert.equal(j.series[0].values[at(j, "2026-09")], 0);
    assert.equal(j.series[1].values[at(j, "2026-09")], 1000);
  });

  it("PFS-11 (totals unchanged): categories add up to group all = metric expenses; fixed + variable = all", async () => {
    const j = await (
      await ser("alice", q([
        { kind: "category", id: "Home" },
        { kind: "category", id: "Travel" },
        { kind: "group", id: "fixed" },
        { kind: "group", id: "variable" },
        { kind: "group", id: "all" },
        { kind: "metric", id: "expenses" },
      ]))
    ).json();
    for (const k of ["2020-01", "2026-03", "2026-09"]) {
      const v = j.series.map((s: { values: number[] }) => s.values[at(j, k)]);
      assert.equal(v[0] + v[1], v[4], k);
      assert.equal(v[2] + v[3], v[4], k);
      assert.equal(v[5], v[4], k);
    }
    assert.equal(j.series[4].values[at(j, "2026-03")], 1200);
  });

  it("PFS-12 (Q-AA6/Q-AA7): presets end at the current household month (partial); all starts at the first data month", async () => {
    const all = await (await ser("alice", q([{ kind: "group", id: "all" }]))).json();
    assert.equal(all.range.from, "2020-01");
    assert.equal(all.current, "2026-10");
    assert.equal(all.partial, true);
    assert.equal(all.currency, "CAD");
    const y = await (await ser("alice", q([{ kind: "group", id: "all" }], { preset: "ytd" }))).json();
    assert.deepEqual(y.range, { from: "2026-01", to: "2026-10" });
    const m = await (await ser("alice", q([{ kind: "group", id: "all" }], { preset: "12m" }))).json();
    assert.equal(m.months.length, 12);
    const past = await (await ser("alice", q([{ kind: "group", id: "all" }], { from: "2026-01", to: "2026-03" }))).json();
    assert.equal(past.partial, false);
  });

  it("PFS-13: the household month is Toronto's whatever the process timezone (Nov 1 02:00 UTC is still October)", async () => {
    const j = await (await ser("alice", q([{ kind: "group", id: "all" }], { preset: "3m" }), "POST", new Date("2026-11-01T02:00:00Z"))).json();
    assert.deepEqual(j.months, ["2026-08", "2026-09", "2026-10"]);
    assert.deepEqual(rangeMonths({ preset: "all" }, "2026-10", null), ["2026-10"]);
  });

  it("PFS-14: a line / account / category not in the record is `missing` with all-null values", async () => {
    const j = await (await ser("alice", q([{ kind: "line", id: "gone" }, { kind: "line", id: "rent" }]))).json();
    assert.equal(j.series[0].missing, true);
    assert.ok(j.series[0].values.every((v: unknown) => v === null));
    assert.equal(j.series[1].values[at(j, "2020-01")], 900);
  });

  it("PFS-15 (Q-AA4): income / surplus are null in a month without income (no invented figures)", async () => {
    const j = await (await ser("alice", q([{ kind: "metric", id: "surplus" }, { kind: "metric", id: "income" }]))).json();
    for (const k of ["2020-01", "2026-03", "2026-09", "2025-02"]) for (const s of j.series) assert.equal(s.values[at(j, k)], null, `${s.id} ${k}`);
    assert.equal(j.series[0].values[at(j, "2025-01")], 300);
  });

  it("PFS-17 (Q-AA4 change, 2026-10-17): the same month has the same net assets whatever the range", async () => {
    const nets = [];
    for (const range of [{ preset: "all" }, { from: "2025-02", to: "2025-04" }, { preset: "24m" }, { from: "2025-03", to: "2025-03" }]) {
      const j = await (await ser("alice", q([{ kind: "metric", id: "net-assets" }], range))).json();
      nets.push(j.series[0].values[at(j, "2025-03")]);
    }
    assert.deepEqual(nets, [10500, 10500, 10500, 10500]);
  });

  it("PFS-18 (Q-AA4 change): a no-data month carries net assets flat (not null, nothing lost)", async () => {
    const j = await (await ser("alice", q([{ kind: "metric", id: "net-assets" }], { from: "2024-12", to: "2025-04" }))).json();
    assert.deepEqual(j.series[0].values, [10000, 10300, 10300, 10500, 10500]);
    assert.equal(j.net_assets_from, "2020-01");
  });

  it("PFS-19 (Q-AA3 condition): the response states fx_basis: current", async () => {
    const j = await (await ser("alice", q([{ kind: "group", id: "all" }], { preset: "3m" }))).json();
    assert.equal(j.fx_basis, "current");
  });

  it("PFS-16: read-only: the row and the audit log are unchanged", async () => {
    const before = [await row(), await audits()];
    await ser("alice", q([{ kind: "group", id: "all" }]));
    await ser("bob", q([{ kind: "category", id: "Travel" }]));
    assert.deepEqual([await row(), await audits()], before);
  });

  it("PFS-20 (Q-AA10): months before the anchor (the first data month) are null; the anchor month starts at Starting net assets", async () => {
    const later = {
      [MONTHS_KEY]: JSON.stringify({}),
      [OVERVIEW_KEY]: JSON.stringify({ start: "5000", growth: "", future: false, years: 1, months: { "2025-01": { expenses: "500", income: "800" } } }),
    };
    assert.equal((await handlePersonalFinanceRequest(req("PUT", { data: later }, "/api/personal-finance"), as("alice"))).status, 200);
    const j = await (await ser("alice", q([{ kind: "metric", id: "net-assets" }], { from: "2024-11", to: "2025-02" }))).json();
    assert.equal(j.net_assets_from, "2025-01");
    assert.deepEqual(j.series[0].values, [null, null, 5300, 5300]);
  });
});
