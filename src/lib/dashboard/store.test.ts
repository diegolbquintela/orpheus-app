// Offline tests for migrations/0002_dashboard.sql and the dashboard data access layer.
// Runs against PGLite (Postgres compiled to WASM, already a dependency): no network, no Neon.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  checkDashboardDb,
  dashboardDatabaseUrl,
  describeDbStatus,
  getDashboardDb,
  handleDashboardDbRequest as handleDbApi,
  showDbStatusLine,
} from "./db.server.ts";
import * as store from "./store.server.ts";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";

const MIGRATION = readFileSync("migrations/0002_dashboard.sql", "utf8");
// Same result parsers as src/lib/db.ts: int8 -> number, date -> 'YYYY-MM-DD'.
const identity = (v: string) => v;
let pg: PGlite;
let db: store.Queryable;

before(async () => {
  pg = new PGlite({ parsers: { 20: Number, 1082: identity } });
  await pg.waitReady;
  await pg.exec("CREATE TABLE _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  // Every migration in order (0001 auth, 0002 dashboard, 0003 and 0004 add the FKs to "user").
  for (const { name } of pendingMigrations(readdirSync("migrations"), [])) {
    await pg.exec(readFileSync(`migrations/${name}`, "utf8"));
    await pg.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
  }
  // holdings and user_settings reference "user"(id) (0003, 0004).
  for (const id of ["alice", "bob", "u", "c1"])
    await pg.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $1, $1 || '@example.com', false)`, [id]);
  db = { query: async (text, params) => (await pg.query(text, params)).rows as never[] };
});
after(async () => {
  await pg.close();
});

const rejectsWithCode = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (err: { code?: string }) => err.code === code);

describe("0002_dashboard.sql", () => {
  it("creates every §5 table, and re-running it is a no-op", async () => {
    const status = await checkDashboardDb(db);
    assert.deepEqual(status, {
      state: "connected",
      tables: 11,
      expectedTables: 11,
      missingTables: [],
      migrationApplied: true,
    });
    assert.equal(describeDbStatus(status), "Database: connected · 11/11 tables");
    await pg.exec(MIGRATION); // IF NOT EXISTS everywhere
  });

  it("enforces the §5 constraints", async () => {
    const q = (sql: string, p: unknown[]) => pg.query(sql, p);
    await rejectsWithCode(q("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('u', 'X', 0, 1)", []), "23514");
    await rejectsWithCode(q("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('u', 'X', 1, -1)", []), "23514");
    await rejectsWithCode(q("INSERT INTO user_settings (user_id, base_currency) VALUES ('u', 'GBP')", []), "23514");
    await rejectsWithCode(q("INSERT INTO instruments (symbol, region, currency) VALUES ('X.L', 'UK', 'GBP')", []), "23514");
    await rejectsWithCode(q("INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source) VALUES ('USD', '2026-10-01', 1.3, 'FED')", []), "23514");
    await rejectsWithCode(q("INSERT INTO metric_values (symbol, metric_key, status) VALUES ('X', 'roic', 'great')", []), "23514");
    await q("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('c1', 'KO', 1, 1)", []);
    await rejectsWithCode(q("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('c1', 'KO', 2, 2)", []), "23505");
    await q("DELETE FROM holdings WHERE user_id = 'c1'", []);
  });
});

describe("per-user data access", () => {
  it("settings default to CAD and persist", async () => {
    assert.deepEqual(await store.getUserSettings(db, "alice"), { userId: "alice", baseCurrency: "CAD" });
    await store.setBaseCurrency(db, "alice", "EUR");
    await store.setBaseCurrency(db, "alice", "USD");
    assert.equal((await store.getUserSettings(db, "alice")).baseCurrency, "USD");
    assert.equal((await store.getUserSettings(db, "bob")).baseCurrency, "CAD");
    await assert.rejects(store.setBaseCurrency(db, "alice", "GBP" as store.BaseCurrency));
  });

  it("holdings CRUD, validation, duplicates, and isolation between users", async () => {
    const ko = await store.addHolding(db, "alice", { symbol: "KO", shares: "10.5", avgCost: 60 });
    assert.equal(typeof ko.id, "number");
    assert.equal(Number(ko.shares), 10.5);
    await store.addHolding(db, "alice", { symbol: "RY.TO", shares: 3, avgCost: "140.25" });
    await store.addHolding(db, "bob", { symbol: "KO", shares: 1, avgCost: 0 }); // same symbol, other user: fine
    await assert.rejects(store.addHolding(db, "alice", { symbol: "KO", shares: 1, avgCost: 1 }), store.DuplicateHoldingError);
    await assert.rejects(store.addHolding(db, "alice", { symbol: "ASML.AS", shares: 0, avgCost: 1 }), RangeError);
    await assert.rejects(store.addHolding(db, "alice", { symbol: "ASML.AS", shares: 1, avgCost: -1 }), RangeError);

    assert.deepEqual((await store.listHoldings(db, "alice")).map((h) => h.symbol), ["KO", "RY.TO"]);
    assert.deepEqual((await store.listHoldings(db, "bob")).map((h) => h.symbol), ["KO"]);

    // Bob can't touch Alice's rows by id.
    assert.equal(await store.updateHolding(db, "bob", ko.id, { shares: 99, avgCost: 1 }), null);
    assert.equal(await store.deleteHolding(db, "bob", ko.id), false);
    assert.equal(Number((await store.listHoldings(db, "alice"))[0].shares), 10.5);

    const updated = await store.updateHolding(db, "alice", ko.id, { shares: 12, avgCost: "61.5" });
    assert.equal(Number(updated?.shares), 12);
    assert.equal(Number(updated?.avgCost), 61.5);
    // #56: no cost is NULL (not 0), and can be set and cleared.
    const cleared = await store.updateHolding(db, "alice", ko.id, { shares: 12, avgCost: null });
    assert.equal(cleared?.avgCost, null);
    const noCost = await store.addHolding(db, "alice", { symbol: "MSFT", shares: 1, avgCost: null });
    assert.equal(noCost.avgCost, null);
    assert.equal(await store.deleteHolding(db, "alice", noCost.id), true);
    // #57: avgCost omitted keeps the stored cost; null clears it.
    await store.updateHolding(db, "alice", ko.id, { shares: 12, avgCost: "61.5" });
    const keep = await store.updateHolding(db, "alice", ko.id, { shares: 13 });
    assert.deepEqual([Number(keep?.shares), Number(keep?.avgCost)], [13, 61.5]);
    assert.equal((await store.updateHolding(db, "alice", ko.id, { shares: 13, avgCost: null }))?.avgCost, null);
    assert.equal((await store.updateHolding(db, "alice", ko.id, { shares: 14 }))?.avgCost, null);
    assert.equal(await store.deleteHolding(db, "alice", ko.id), true);
    assert.deepEqual((await store.listHoldings(db, "alice")).map((h) => h.symbol), ["RY.TO"]);
  });

  it("#57: chips default until saved; a saved empty list sticks; old rows count as saved", async () => {
    const D = ["rev_g_1y", "roic_1y", "share_of_book"];
    await store.setMetricColumns(db, "bob", []);
    await store.setMetricColumns(db, "alice", []);
    await db.query("UPDATE user_settings SET metric_chips_saved_at = NULL");
    assert.deepEqual(await store.getMetricChips(db, "alice", D), { chips: D, saved: false });
    assert.deepEqual(await store.setMetricChips(db, "alice", ["eps_1y", "share_of_book"]), ["eps_1y", "share_of_book"]);
    assert.deepEqual(await store.getMetricChips(db, "alice", D), { chips: ["eps_1y", "share_of_book"], saved: true });
    await store.setMetricChips(db, "alice", []);
    assert.deepEqual(await store.getMetricChips(db, "alice", D), { chips: [], saved: true });
    // Bob saved columns with the old picker (rows, no timestamp): they are his chips.
    await store.setMetricColumns(db, "bob", ["roic_1y"]);
    assert.deepEqual(await store.getMetricChips(db, "bob", D), { chips: ["roic_1y"], saved: true });
    await store.setMetricColumns(db, "bob", []);
    assert.deepEqual(await store.getMetricChips(db, "bob", D), { chips: D, saved: false });
    await store.setMetricChips(db, "alice", ["eps_1y"]);
    await store.setMetricColumns(db, "alice", []);
  });

  it("metric columns keep order, replace atomically, and are per user", async () => {
    await store.setMetricColumns(db, "alice", ["roic", "eps_1y", "gross_margin"]);
    await store.setMetricColumns(db, "bob", ["eps_1y"]);
    assert.deepEqual(await store.listMetricColumns(db, "alice"), ["roic", "eps_1y", "gross_margin"]);
    await store.setMetricColumns(db, "alice", ["gross_margin", "roic", "roic"]);
    assert.deepEqual(await store.listMetricColumns(db, "alice"), ["gross_margin", "roic"]);
    assert.deepEqual(await store.listMetricColumns(db, "bob"), ["eps_1y"]);
    await store.setMetricColumns(db, "alice", []);
    assert.deepEqual(await store.listMetricColumns(db, "alice"), []);
  });
});

describe("shared market data access", () => {
  it("instruments upsert", async () => {
    const ry = { symbol: "RY.TO", name: "Royal Bank of Canada", exchange: "TOR", region: "CA", currency: "CAD", secCik: "0001000275", fundamentalsSource: "sec" } as const;
    await store.upsertInstrument(db, ry);
    await store.upsertInstrument(db, { ...ry, name: "RBC" });
    assert.deepEqual(await store.getInstruments(db, ["RY.TO", "NOPE"]), [{ ...ry, name: "RBC" }]);
  });

  it("daily closes: insert is idempotent and latest close per symbol is returned", async () => {
    const rows = [
      { symbol: "KO", sessionDate: "2026-09-30", close: "70.10", currency: "USD", source: "yahoo" },
      { symbol: "KO", sessionDate: "2026-10-01", close: "70.55", currency: "USD", source: "yahoo" },
      { symbol: "RY.TO", sessionDate: "2026-10-01", close: "180.2", currency: "CAD", source: "yahoo" },
    ];
    assert.equal(await store.insertDailyCloses(db, rows), 3);
    assert.equal(await store.insertDailyCloses(db, [{ ...rows[1], close: "1" }]), 0); // DASH-09: second run changes nothing
    const latest = await store.latestCloses(db, ["KO", "RY.TO"]);
    assert.deepEqual(latest.map((c) => [c.symbol, c.sessionDate, Number(c.close)]), [
      ["KO", "2026-10-01", 70.55],
      ["RY.TO", "2026-10-01", 180.2],
    ]);
  });

  it("FX: exact date, else the previous rate (holiday)", async () => {
    await store.upsertFxRates(db, [
      { quote: "USD", rateDate: "2026-09-30", cadPerUnit: "1.3901", source: "BOC" },
      { quote: "USD", rateDate: "2026-10-02", cadPerUnit: "1.3950", source: "BOC" },
      { quote: "DKK", rateDate: "2026-10-02", cadPerUnit: "0.2041", source: "ECB_CROSS" },
    ]);
    assert.equal((await store.fxRateOnOrBefore(db, "USD", "2026-10-02"))?.cadPerUnit, "1.3950");
    const holiday = await store.fxRateOnOrBefore(db, "USD", "2026-10-01");
    assert.deepEqual([holiday?.rateDate, holiday?.cadPerUnit], ["2026-09-30", "1.3901"]);
    assert.equal(await store.fxRateOnOrBefore(db, "EUR", "2026-10-02"), null);
  });

  it("fundamentals and metric values round-trip, n/m keeps a null value", async () => {
    await store.upsertFundamentals(db, [
      { symbol: "KO", fiscalYearEnd: "2025-12-31", concept: "revenue", value: "47061000000", unit: "USD", sourceTag: "us-gaap:Revenues", accession: "0000021344-26-000010", filed: "2026-02-20" },
    ]);
    const facts = await store.listFundamentals(db, "KO");
    assert.equal(facts.length, 1);
    assert.equal(facts[0].fiscalYearEnd, "2025-12-31");
    assert.equal(Number(facts[0].value), 47061000000);

    await store.upsertMetricValues(db, [
      { symbol: "KO", metricKey: "gross_margin", value: "0.61", status: "ok", fiscalYearEnd: "2025-12-31" },
      { symbol: "RY.TO", metricKey: "gross_margin", value: null, status: "n/m", fiscalYearEnd: null },
    ]);
    const values = await store.listMetricValues(db, ["KO", "RY.TO"]);
    assert.deepEqual(values.map((v) => [v.symbol, v.status, v.value === null ? null : Number(v.value)]), [
      ["KO", "ok", 0.61],
      ["RY.TO", "n/m", null],
    ]);
    await assert.rejects(store.upsertMetricValues(db, [{ symbol: "KO", metricKey: "roic", value: null, status: "ok", fiscalYearEnd: null }]));
  });

  it("refresh runs: run_date is the lock", async () => {
    const id = await store.claimRefreshRun(db, "2026-10-01");
    assert.equal(typeof id, "number");
    assert.equal(await store.claimRefreshRun(db, "2026-10-01"), null);
    await store.finishRefreshRun(db, id as number, "ok", { symbols: 2 });
    const last = await store.lastSuccessfulRun(db);
    assert.equal(last?.runDate, "2026-10-01");
    assert.equal(last?.status, "ok");
  });
});

describe("storage availability (no database URL = unavailable)", () => {
  it("unset or blank DATABASE_URL means not configured", async () => {
    assert.equal(dashboardDatabaseUrl({}), undefined);
    assert.equal(dashboardDatabaseUrl({ DATABASE_URL: "   " }), undefined);
    // Neon integration name is the fallback; DATABASE_URL wins when both are set.
    assert.equal(dashboardDatabaseUrl({ orpheus_app_preview_DATABASE_URL: "postgresql://b" }), "postgresql://b");
    assert.equal(
      dashboardDatabaseUrl({ DATABASE_URL: "postgresql://a", orpheus_app_preview_DATABASE_URL: "postgresql://b" }),
      "postgresql://a",
    );
    assert.equal(dashboardDatabaseUrl({ orpheus_app_preview_DATABASE_URL_UNPOOLED: "postgresql://b" }), undefined);
    assert.equal(await getDashboardDb({}), null);
    const status = await checkDashboardDb(null);
    assert.deepEqual(status, { state: "not_configured" });
    assert.equal(describeDbStatus(status), "Database: not configured");
  });

  it("a failing connection reports a generic error, never the driver message", async () => {
    const broken: store.Queryable = {
      query: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED db.example:5432"), { code: "ECONNREFUSED" });
      },
    };
    const original = console.error;
    console.error = () => {};
    try {
      const status = await checkDashboardDb(broken);
      assert.deepEqual(status, { state: "error" });
      assert.doesNotMatch(describeDbStatus(status), /example|5432/);
    } finally {
      console.error = original;
    }
  });

  it("missing tables read as an incomplete schema", async () => {
    const empty = new PGlite();
    await empty.exec("CREATE TABLE _migrations (name text PRIMARY KEY)");
    const status = await checkDashboardDb({ query: async (t, p) => (await empty.query(t, p)).rows as never[] });
    await empty.close();
    assert.equal(status.state, "connected");
    assert.match(describeDbStatus(status), /0\/11 tables, schema incomplete/);
  });

  it("the status line never shows on production", () => {
    assert.equal(showDbStatusLine({ VERCEL_ENV: "production" }), false);
    assert.equal(showDbStatusLine({ VERCEL_ENV: "preview" }), true);
    assert.equal(showDbStatusLine({}), true); // local dev
  });
});

describe("/api/dashboard/db handler", () => {
  const on = { DASHBOARD_ENABLED: "true" };
  const noDb = async () => null;
  const OTHER = ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

  it("flag off: 404 JSON for every method", async () => {
    for (const env of [{}, { DASHBOARD_ENABLED: "false" }, { DASHBOARD_ENABLED: "TRUE" }])
      for (const method of ["GET", "HEAD", ...OTHER]) {
        const res = await handleDbApi(method, env, noDb);
        assert.equal(res.status, 404, `${method} ${JSON.stringify(env)}`);
        assert.match(res.headers.get("content-type") ?? "", /application\/json/);
        assert.deepEqual(await res.json(), { error: "Not found." });
      }
  });

  it("production: 404 JSON for every method even with the flag on", async () => {
    for (const method of ["GET", ...OTHER]) {
      const res = await handleDbApi(method, { ...on, VERCEL_ENV: "production" }, async () => db);
      assert.equal(res.status, 404, method);
      assert.deepEqual(await res.json(), { error: "Not found." });
    }
  });

  it("flag on: GET returns the status, other methods 405 with Allow", async () => {
    const notConfigured = await handleDbApi("GET", { ...on, VERCEL_ENV: "preview" }, noDb);
    assert.equal(notConfigured.status, 200);
    assert.deepEqual(await notConfigured.json(), { state: "not_configured" });
    const connected = await handleDbApi("GET", on, async () => db);
    assert.equal(((await connected.json()) as { state: string; tables: number }).tables, 11);
    for (const method of OTHER) {
      const res = await handleDbApi(method, on, noDb);
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.get("allow"), "GET, HEAD");
      assert.deepEqual(await res.json(), { error: "Method not allowed." });
    }
  });
});
