// Offline tests for T06 (#14): BoC Valet + ECB-cross FX rates, the rate-date rule (DASH-11), base
// currency and re-expressed totals (DASH-12), and GET /api/dashboard/fx. Recorded responses in
// test-fixtures/fx/ (BoC Valet and ECB eurofxref, fetched 2026-10-02): no network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { runDailyRefresh } from "./daily-refresh.server.ts";
import { handleFxRequest } from "./fx-api.server.ts";
import {
  BOC_URL,
  createFxFetcher,
  ECB_URL,
  parseBocValet,
  parseEcbXml,
  rateOnOrBefore,
  refreshFx,
  valueHoldings,
} from "./fx.server.ts";
import { handleDashboardSettingsRequest } from "./session.server.ts";
import { getUserSettings, type Queryable } from "./store.server.ts";
import type { DailyCloseProvider } from "./close-provider.ts";

const BOC = JSON.parse(
  readFileSync("test-fixtures/fx/boc-valet-FXUSDCAD-FXEURCAD-FXSEKCAD-FXPLNCAD-2026-09-21_2026-10-02.json", "utf8"),
);
const ECB = readFileSync("test-fixtures/fx/ecb-eurofxref-hist-90d-2026-09-21_2026-10-02.xml", "utf8");

let pg: PGlite;
let db: Queryable;
before(async () => {
  pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  await pg.waitReady;
  await pg.exec("CREATE TABLE _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const { name } of pendingMigrations(readdirSync("migrations"), [])) {
    await pg.exec(readFileSync(`migrations/${name}`, "utf8"));
    await pg.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
  }
  db = { query: async (text, params) => (await pg.query(text, params)).rows as never[] };
});
after(async () => {
  await pg.close();
});

/** Serves the recorded responses for the URLs the live fetcher builds; records every request. */
const requests: string[] = [];
let failing = false;
const fixtureFetcher = () =>
  createFxFetcher(async (url) => {
    requests.push(url);
    if (failing) throw new Error("HTTP 503");
    if (url.startsWith(BOC_URL)) {
      const series = url.slice(BOC_URL.length + 1).split("/")[0].split(",");
      // Valet returns only the requested series.
      return JSON.stringify({
        observations: BOC.observations.map((o: Record<string, unknown>) =>
          Object.fromEntries(Object.entries(o).filter(([k]) => k === "d" || series.includes(k))),
        ),
      });
    }
    if (url === ECB_URL) return ECB;
    throw new Error(`unexpected URL ${url}`);
  });

const stored = async (quote: string, date: string) =>
  (
    await pg.query<{ v: string; source: string }>(
      "SELECT cad_per_unit::text AS v, source FROM fx_rates WHERE quote = $1 AND rate_date = $2",
      [quote, date],
    )
  ).rows[0];

async function hold(rows: [user: string, symbol: string, currency: string, region: string][]) {
  for (const [user, symbol, currency, region] of rows) {
    await pg.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $1, $1 || '@example.com', false) ON CONFLICT DO NOTHING`,
      [user],
    );
    await pg.query(
      "INSERT INTO instruments (symbol, region, currency) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [symbol, region, currency],
    );
    await pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ($1, $2, 10, 1)", [user, symbol]);
  }
}

beforeEach(async () => {
  await pg.exec(`DELETE FROM fx_rates; DELETE FROM holdings; DELETE FROM instruments; DELETE FROM daily_closes;
    DELETE FROM price_coverage; DELETE FROM refresh_runs; DELETE FROM user_settings; DELETE FROM "user";`);
  requests.length = 0;
  failing = false;
});

describe("recorded responses parse as published", () => {
  it("BoC Valet: CAD per unit as strings; 2026-09-30 (BoC holiday) has no observation", () => {
    const days = parseBocValet(BOC, ["USD", "EUR", "SEK", "PLN"]);
    assert.deepEqual(
      days.map((d) => d.date),
      ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29", "2026-10-01", "2026-10-02"],
    );
    assert.deepEqual(days.find((d) => d.date === "2026-09-29")?.rates, { USD: "1.4188", EUR: "1.6084", SEK: "0.1419", PLN: "0.3680" });
  });

  it("ECB eurofxref: X per EUR; 2026-09-30 is an ECB working day", () => {
    const days = parseEcbXml(ECB, ["DKK", "HUF", "CZK"]);
    assert.equal(days.length, 10);
    assert.deepEqual(days.find((d) => d.date === "2026-09-30")?.rates, { DKK: "7.4755", HUF: "366.2", CZK: "24.44" });
  });
});

describe("refreshFx (DASH-11)", () => {
  it("stores USD/EUR exactly as BoC Valet publishes them, for every published date", async () => {
    const r = await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.quotes, ["USD", "EUR"]);
    for (const o of BOC.observations as { d: string; FXUSDCAD: { v: string }; FXEURCAD: { v: string } }[]) {
      assert.deepEqual(await stored("USD", o.d), { v: o.FXUSDCAD.v, source: "BOC" }, o.d);
      assert.deepEqual(await stored("EUR", o.d), { v: o.FXEURCAD.v, source: "BOC" }, o.d);
    }
    assert.equal(r.inserted, 18);
    assert.equal(await stored("USD", "2026-09-30"), undefined);
    // One Valet request for both series, starting 30 days back (nothing stored yet).
    assert.deepEqual(requests, [`${BOC_URL}/FXUSDCAD,FXEURCAD/json?start_date=2026-09-02&end_date=2026-10-02`]);
  });

  it("BoC holiday 2026-09-30: the previous rate (2026-09-29) is used and its date returned", async () => {
    await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    assert.deepEqual(await rateOnOrBefore(db, "USD", "2026-09-30"), {
      quote: "USD",
      cadPerUnit: "1.4188",
      rateDate: "2026-09-29",
      source: "BOC",
    });
    assert.equal((await rateOnOrBefore(db, "EUR", "2026-10-01"))?.cadPerUnit, "1.6030");
    assert.equal(await rateOnOrBefore(db, "USD", "2026-09-01"), null);
  });

  it("DKK/HUF/CZK when held: ECB rate × BoC FXEURCAD for the same date; SEK/PLN from BoC", async () => {
    await hold([
      ["alice", "NOVO-B.CO", "DKK", "EU"],
      ["alice", "OTP.BD", "HUF", "EU"],
      ["bob", "CEZ.PR", "CZK", "EU"],
      ["bob", "VOLV-B.ST", "SEK", "EU"],
      ["bob", "PKO.WA", "PLN", "EU"],
    ]);
    const r = await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.quotes, ["USD", "EUR", "PLN", "SEK", "CZK", "DKK", "HUF"]);
    assert.deepEqual(await stored("SEK", "2026-09-29"), { v: "0.1419", source: "BOC" });
    assert.deepEqual(await stored("PLN", "2026-10-02"), { v: "0.3661", source: "BOC" });
    const cross = (eurCad: number, perEur: number) => (eurCad / perEur).toPrecision(10);
    assert.deepEqual(await stored("DKK", "2026-10-01"), { v: cross(1.603, 7.4758), source: "ECB_CROSS" });
    assert.deepEqual(await stored("HUF", "2026-09-29"), { v: cross(1.6084, 366.38), source: "ECB_CROSS" });
    assert.deepEqual(await stored("CZK", "2026-10-02"), { v: cross(1.6037, 24.47), source: "ECB_CROSS" });
    // 2026-09-30: ECB published, BoC didn't, so there's no cross for it; the lookup falls back.
    assert.equal(await stored("DKK", "2026-09-30"), undefined);
    assert.equal((await rateOnOrBefore(db, "DKK", "2026-09-30"))?.rateDate, "2026-09-29");
    assert.equal(requests.filter((u) => u === ECB_URL).length, 1);
  });

  it("idempotent: a stored date is never requested again; a later day asks only for new dates", async () => {
    await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    const before = (await pg.query("SELECT * FROM fx_rates ORDER BY quote, rate_date")).rows;
    requests.length = 0;
    const again = await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    assert.equal(again.inserted, 0);
    assert.deepEqual(requests, [], "nothing to fetch");
    assert.deepEqual((await pg.query("SELECT * FROM fx_rates ORDER BY quote, rate_date")).rows, before);
    await refreshFx(db, fixtureFetcher(), { today: "2026-10-05" });
    assert.deepEqual(requests, [`${BOC_URL}/FXUSDCAD,FXEURCAD/json?start_date=2026-10-03&end_date=2026-10-05`]);
  });

  it("a source outage is reported, not thrown, and nothing is stored", async () => {
    failing = true;
    const r = await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    assert.equal(r.inserted, 0);
    assert.match(r.errors[0], /Bank of Canada request failed \(HTTP 503\)/);
  });

  it("the daily job runs FX after the closes; a second run inserts nothing", async () => {
    const noCloses: DailyCloseProvider = {
      id: "none",
      supports: () => true,
      budget: { perMinute: 1, perDay: 1 },
      getCloses: async () => [],
      getCorporateActions: async () => [],
    };
    const now = () => Date.UTC(2026, 9, 2, 23, 0);
    const first = await runDailyRefresh(db, noCloses, { trigger: "cron", now, fx: fixtureFetcher() });
    assert.equal(first.status !== "locked" && first.fx?.inserted, 18);
    const second = await runDailyRefresh(db, noCloses, { trigger: "cron", now, fx: fixtureFetcher() });
    assert.equal(second.status !== "locked" && second.fx?.inserted, 0);
  });
});

describe("base currency and totals (DASH-12, D8)", () => {
  const closes = {
    KO: { close: "86.1", currency: "USD", sessionDate: "2026-10-01" },
    "RY.TO": { close: "180", currency: "CAD", sessionDate: "2026-10-01" },
    "ASML.AS": { close: "700", currency: "EUR", sessionDate: "2026-10-01" },
    // A US session on the BoC holiday: valued at the 2026-09-29 rate, flagged.
    AAPL: { close: "250", currency: "USD", sessionDate: "2026-09-30" },
    PEND: { close: null, currency: null, sessionDate: null },
  };
  const holdings = [
    { symbol: "AAPL", shares: "2" },
    { symbol: "ASML.AS", shares: "1" },
    { symbol: "KO", shares: "10" },
    { symbol: "PEND", shares: "1" },
    { symbol: "RY.TO", shares: "3" },
  ];

  it("defaults to CAD and converts each position at its session date's rate", async () => {
    await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    assert.equal((await getUserSettings(db, "nobody")).baseCurrency, "CAD");
    const v = await valueHoldings(db, holdings, closes, "CAD");
    const by = Object.fromEntries(v.rows.map((r) => [r.symbol, r]));
    assert.ok(Math.abs((by.KO.value as number) - 861 * 1.4243) < 1e-9);
    assert.equal(by["RY.TO"].value, 540);
    assert.ok(Math.abs((by["ASML.AS"].value as number) - 700 * 1.603) < 1e-9);
    assert.ok(Math.abs((by.AAPL.value as number) - 500 * 1.4188) < 1e-9);
    assert.equal(by.AAPL.fallback, true);
    assert.deepEqual(by.AAPL.rates, [{ quote: "USD", cadPerUnit: "1.4188", rateDate: "2026-09-29", source: "BOC" }]);
    assert.equal(by.KO.fallback, false);
    assert.equal(by.PEND.status, "price_pending");
    assert.deepEqual(v.excluded, ["PEND"]);
    assert.ok(Math.abs(v.total - (861 * 1.4243 + 540 + 700 * 1.603 + 500 * 1.4188)) < 1e-9);
  });

  it("USD and EUR bases cross through CAD and re-express every position and the total", async () => {
    await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    const cad = await valueHoldings(db, holdings, closes, "CAD");
    for (const base of ["USD", "EUR"] as const) {
      const v = await valueHoldings(db, holdings, closes, base);
      let total = 0;
      for (const row of v.rows) {
        const c = cad.rows.find((r) => r.symbol === row.symbol)!;
        if (c.value === null) {
          assert.equal(row.value, null);
          continue;
        }
        const baseRate = Number((await rateOnOrBefore(db, base, row.sessionDate!))!.cadPerUnit);
        assert.ok(Math.abs((row.value as number) - c.value / baseRate) < 1e-9, `${base} ${row.symbol}`);
        total += row.value as number;
      }
      assert.ok(Math.abs(v.total - total) < 1e-9);
      assert.notEqual(Math.round(v.total), Math.round(cad.total));
    }
    // A USD listing in a USD base is its own amount (no FX).
    const usd = await valueHoldings(db, holdings, closes, "USD");
    assert.equal(usd.rows.find((r) => r.symbol === "KO")?.value, 861);
  });

  it("the setting persists per user through /api/dashboard/settings", async () => {
    await hold([["alice", "KO", "USD", "US"], ["bob", "KO", "USD", "US"]]);
    const deps = (user: string) => ({
      env: { DASHBOARD_ENABLED: "true" },
      getUser: async () => ({ id: user, email: null }),
      getDb: async () => db,
    });
    const put = await handleDashboardSettingsRequest(
      new Request("http://localhost/api/dashboard/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseCurrency: "EUR" }),
      }),
      deps("alice"),
    );
    assert.equal(put.status, 200);
    assert.equal((await getUserSettings(db, "alice")).baseCurrency, "EUR");
    assert.equal((await getUserSettings(db, "bob")).baseCurrency, "CAD", "other users keep their own");
  });
});

describe("GET /api/dashboard/fx", () => {
  const fx = (path: string, opts: { method?: string; signedIn?: boolean; env?: Record<string, string> } = {}) =>
    handleFxRequest(new Request(`http://localhost${path}`, { method: opts.method ?? "GET" }), {
      env: opts.env ?? { DASHBOARD_ENABLED: "true" },
      getUser: async () => (opts.signedIn === false ? null : { id: "alice", email: null }),
      getDb: async () => db,
    });

  it("404 flag off, 405, 401 signed out, 400 bad date", async () => {
    assert.equal((await fx("/api/dashboard/fx", { env: {} })).status, 404);
    const post = await fx("/api/dashboard/fx", { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
    assert.equal((await fx("/api/dashboard/fx", { signedIn: false })).status, 401);
    assert.equal((await fx("/api/dashboard/fx?date=30-09-2026")).status, 400);
  });

  it("returns the stored rates for a date, each with the date it comes from", async () => {
    await refreshFx(db, fixtureFetcher(), { today: "2026-10-02" });
    const body = (await (await fx("/api/dashboard/fx?date=2026-09-30")).json()) as {
      date: string;
      rates: { quote: string; cadPerUnit: string; rateDate: string; fallback: boolean }[];
    };
    assert.equal(body.date, "2026-09-30");
    assert.deepEqual(
      body.rates.map((r) => [r.quote, r.cadPerUnit, r.rateDate, r.fallback]),
      [
        ["EUR", "1.6084", "2026-09-29", true],
        ["USD", "1.4188", "2026-09-29", true],
      ],
    );
  });
});
