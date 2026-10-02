// Offline tests for T05 (#13): the Yahoo DailyCloseProvider, the daily close job (lock, idempotence,
// catch-up, completed sessions only, DASH-09/14), the cron route's 401 (DASH-10), the preview-only
// refresh button, and the holdings -> "user" cascade from 0004. PGLite and recorded-shape Yahoo payloads:
// no network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { listingError } from "../dca/venues.ts";
import type { YahooPayload } from "../dca/yahoo.server.ts";
import { dateInZone, type DailyCloseProvider } from "./close-provider.ts";
import {
  acquireRunLock,
  backfillSymbol,
  priceViews,
  runDailyRefresh,
} from "./daily-refresh.server.ts";
import {
  cronAuthorized,
  handleCronRequest,
  handlePreviewRefreshRequest,
  previewRefreshAvailable,
} from "./refresh-api.server.ts";
import type { Queryable } from "./store.server.ts";
import { createYahooCloseProvider, SETTLE_MS } from "./yahoo-closes.server.ts";

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

async function reset() {
  await pg.exec(`
    DELETE FROM holdings; DELETE FROM daily_closes; DELETE FROM corporate_actions; DELETE FROM price_coverage;
    DELETE FROM instruments; DELETE FROM refresh_runs; DELETE FROM "user";
    INSERT INTO "user" (id, name, email, "emailVerified") VALUES
      ('alice', 'alice', 'alice@example.com', false), ('bob', 'bob', 'bob@example.com', false);
    INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES
      ('alice', 'KO', 10, 50), ('alice', 'ASML.AS', 1, 600), ('bob', 'KO', 1, 1), ('bob', 'RY.TO', 3, 140);
  `);
}

// ------------------------------------------------------------------ recorded-shape Yahoo payloads

type Listing = { tz: string; open: [number, number]; close: [number, number]; currency: string; code: string; full: string };
const LISTINGS: Record<string, Listing> = {
  KO: { tz: "America/New_York", open: [13, 30], close: [20, 0], currency: "USD", code: "NYQ", full: "NYSE" },
  "RY.TO": { tz: "America/Toronto", open: [13, 30], close: [20, 0], currency: "CAD", code: "TOR", full: "Toronto" },
  "ASML.AS": { tz: "Europe/Amsterdam", open: [7, 0], close: [15, 30], currency: "EUR", code: "AMS", full: "Amsterdam" },
  "VOD.L": { tz: "Europe/London", open: [7, 0], close: [15, 30], currency: "GBp", code: "LSE", full: "LSE" },
};
const at = (iso: string, [h, m]: [number, number]) => {
  const [y, mo, d] = iso.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, h, m);
};

type Series = {
  bars: [string, number][];
  dividends?: [string, number][];
  splits?: [string, number, number][];
  today: string;
  currency?: string;
};
const SERIES: Record<string, Series> = {};
const calls: { symbol: string; query: string }[] = [];

function payloadFor(symbol: string): YahooPayload {
  const l = LISTINGS[symbol];
  const s = SERIES[symbol];
  if (!l || !s) return { chart: { result: null, error: { description: "No data found, symbol may be delisted" } } };
  return {
    chart: {
      result: [
        {
          meta: {
            currency: s.currency ?? l.currency,
            exchangeName: l.code,
            fullExchangeName: l.full,
            exchangeTimezoneName: l.tz,
            longName: `${symbol} Inc.`,
            currentTradingPeriod: {
              regular: { start: at(s.today, l.open) / 1000, end: at(s.today, l.close) / 1000 },
            },
          },
          timestamp: s.bars.map(([d]) => at(d, l.open) / 1000),
          indicators: { quote: [{ close: s.bars.map(([, c]) => c) }] },
          events: {
            dividends: Object.fromEntries(
              (s.dividends ?? []).map(([d, amount]) => [String(at(d, l.open) / 1000), { amount, date: at(d, l.open) / 1000 }]),
            ),
            splits: Object.fromEntries(
              (s.splits ?? []).map(([d, numerator, denominator]) => [
                String(at(d, l.open) / 1000),
                { date: at(d, l.open) / 1000, numerator, denominator },
              ]),
            ),
          },
        },
      ],
      error: null,
    },
  };
}

let clock = 0;
const provider = () =>
  createYahooCloseProvider({
    fetchChart: async (symbol, query) => {
      calls.push({ symbol, query });
      return payloadFor(symbol);
    },
    now: () => clock,
    sleep: async () => {},
  });

/** Week of Mon 2026-09-28 .. Thu 2026-10-01; "now" Thursday at `hhmm` UTC. */
function week(today = "2026-10-01") {
  SERIES.KO = { bars: [["2026-09-28", 60.11], ["2026-09-29", 60.22999954223633], ["2026-09-30", 60.5], ["2026-10-01", 61]], today };
  SERIES["RY.TO"] = { bars: [["2026-09-28", 140], ["2026-09-29", 141], ["2026-09-30", 142], ["2026-10-01", 143]], today };
  SERIES["ASML.AS"] = { bars: [["2026-09-28", 600], ["2026-09-29", 610], ["2026-09-30", 620], ["2026-10-01", 630]], today };
}

const snapshot = async () => ({
  closes: (await pg.query("SELECT symbol, session_date, close::text, currency, source, fetched_at FROM daily_closes ORDER BY 1, 2")).rows,
  actions: (await pg.query("SELECT * FROM corporate_actions ORDER BY 1, 2, 3")).rows,
  coverage: (await pg.query("SELECT symbol, first_session_date, last_session_date FROM price_coverage ORDER BY 1")).rows,
});
const latest = async (symbol: string) =>
  (
    await pg.query<{ session_date: string; close: string }>(
      "SELECT session_date, close::text FROM daily_closes WHERE symbol = $1 ORDER BY session_date DESC LIMIT 1",
      [symbol],
    )
  ).rows[0];

beforeEach(async () => {
  await reset();
  calls.length = 0;
  for (const k of Object.keys(SERIES)) delete SERIES[k];
  week();
});

// ------------------------------------------------------------------ the provider

describe("Yahoo DailyCloseProvider", () => {
  it("drops today's bar while the exchange is open, keeps it once the session has ended (R1)", async () => {
    clock = at("2026-10-01", [19, 0]); // 15:00 New York: open
    let closes = await provider().getCloses(["KO"], "2026-10-01");
    assert.deepEqual(closes.map((c) => c.date), ["2026-09-28", "2026-09-29", "2026-09-30"]);
    clock = at("2026-10-01", [20, 0]) + SETTLE_MS - 1; // just before the settle window ends
    closes = await provider().getCloses(["KO"], "2026-10-01");
    assert.equal(closes.at(-1)?.date, "2026-09-30");
    clock = at("2026-10-01", [20, 0]) + SETTLE_MS;
    closes = await provider().getCloses(["KO"], "2026-10-01");
    assert.equal(closes.at(-1)?.date, "2026-10-01");
    assert.deepEqual(closes.at(-1), { symbol: "KO", date: "2026-10-01", close: 61, currency: "USD", source: "yahoo" });
  });

  it("never returns a bar dated after today in the exchange's zone, or after `date`", async () => {
    SERIES.KO.bars.push(["2026-10-02", 62]);
    clock = at("2026-10-01", [23, 0]);
    const closes = await provider().getCloses(["KO"], "2026-10-01");
    assert.ok(closes.every((c) => c.date <= "2026-10-01"));
    assert.deepEqual((await provider().getCloses(["KO"], "2026-09-29")).map((c) => c.date), ["2026-09-28", "2026-09-29"]);
  });

  it("uses exchange-local dates (Amsterdam), rounds float noise to 4 decimals", async () => {
    clock = at("2026-10-01", [16, 30]); // after Amsterdam's close + settle
    const asml = await provider().getCloses(["ASML.AS"], "2026-10-01");
    assert.equal(asml.at(-1)?.date, "2026-10-01");
    assert.equal(asml[0].currency, "EUR");
    const ko = await provider().getCloses(["KO"], "2026-09-30");
    assert.equal(ko.find((c) => c.date === "2026-09-29")?.close, 60.23);
  });

  it("stores RAW closes and unadjusted dividends (rawBars/rawDividends), splits as from -> to", async () => {
    // A 4-for-1 split on 09-30: Yahoo scales earlier closes and dividends down by 4.
    SERIES.KO = {
      bars: [["2026-09-28", 25], ["2026-09-29", 25.5], ["2026-09-30", 26]],
      dividends: [["2026-09-28", 0.125]],
      splits: [["2026-09-30", 4, 1]],
      today: "2026-10-01",
    };
    clock = at("2026-10-01", [23, 0]);
    const p = provider();
    const closes = await p.getCloses(["KO"], "2026-10-01");
    assert.deepEqual(closes.map((c) => c.close), [100, 102, 26]);
    const actions = await p.getCorporateActions("KO");
    assert.deepEqual(actions, [
      { symbol: "KO", exDate: "2026-09-28", kind: "dividend", cashUnadjusted: 0.5, source: "yahoo" },
      { symbol: "KO", exDate: "2026-09-30", kind: "split", splitFrom: 1, splitTo: 4, source: "yahoo" },
    ]);
    assert.equal(calls.length, 1, "closes and events come from one request");
    const listing = await p.getListing!("KO");
    assert.deepEqual(listing, {
      symbol: "KO",
      name: "KO Inc.",
      exchange: "NYSE",
      region: "US",
      mic: "XNYS",
      currency: "USD",
      providerIds: { yahoo: "KO" },
    });
  });

  it("refuses non-US/EU/CA listings with listingError()'s exact text", async () => {
    SERIES["VOD.L"] = { bars: [["2026-09-28", 70]], today: "2026-10-01" };
    clock = at("2026-10-01", [23, 0]);
    await assert.rejects(provider().getCloses(["VOD.L"], "2026-10-01"), {
      message: listingError("VOD.L", "LSE", "LSE")!,
    });
  });
});

// ------------------------------------------------------------------ the job

describe("daily refresh job (DASH-09, DASH-14)", () => {
  it("after a run every held symbol has its latest completed close and date; instruments and actions filled", async () => {
    clock = at("2026-10-01", [23, 0]);
    const r = await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    if (r.status === "locked") throw new Error("locked");
    assert.equal(r.status, "ok");
    assert.equal(r.symbols, 3, "KO is held twice but fetched once");
    assert.equal(calls.length, 3);
    assert.equal(r.inserted, 12);
    for (const [symbol, close] of [["KO", "61"], ["RY.TO", "143"], ["ASML.AS", "630"]])
      assert.deepEqual(await latest(symbol), { session_date: "2026-10-01", close }, symbol);
    const inst = (await pg.query("SELECT symbol, region, currency, mic, provider_ids FROM instruments ORDER BY symbol")).rows;
    assert.deepEqual(inst, [
      { symbol: "ASML.AS", region: "EU", currency: "EUR", mic: "XAMS", provider_ids: { yahoo: "ASML.AS" } },
      { symbol: "KO", region: "US", currency: "USD", mic: "XNYS", provider_ids: { yahoo: "KO" } },
      { symbol: "RY.TO", region: "CA", currency: "CAD", mic: "XTSE", provider_ids: { yahoo: "RY.TO" } },
    ]);
    const run = (await pg.query<{ status: string; run_date: string; finished_at: unknown }>("SELECT status, run_date, finished_at FROM refresh_runs")).rows;
    assert.equal(run.length, 1);
    assert.equal(run[0].status, "ok");
    assert.equal(run[0].run_date, "2026-10-01");
    assert.ok(run[0].finished_at);
  });

  it("a second run changes nothing and makes no request once everything up to today is stored", async () => {
    clock = at("2026-10-01", [23, 0]);
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    const before = await snapshot();
    calls.length = 0;
    const again = await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    if (again.status === "locked") throw new Error("locked");
    assert.equal(again.status, "ok");
    assert.equal(again.inserted, 0);
    assert.equal(calls.length, 0);
    assert.deepEqual(await snapshot(), before);
    // Next day (a Friday with no new bar yet, or a weekend): one request each, still nothing written.
    clock = at("2026-10-02", [3, 0]);
    const weekend = await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal(weekend.status !== "locked" && weekend.inserted, 0);
    assert.deepEqual(await snapshot(), before);
  });

  it("no in-progress bar is stored: a run during market hours stops at the prior session", async () => {
    clock = at("2026-10-01", [17, 0]); // 13:00 New York / Toronto; Amsterdam closed at 15:30 UTC
    await runDailyRefresh(db, provider(), { trigger: "preview", now: () => clock });
    assert.equal((await latest("KO")).session_date, "2026-09-30");
    assert.equal((await latest("RY.TO")).session_date, "2026-09-30");
    assert.equal((await latest("ASML.AS")).session_date, "2026-10-01");
    assert.equal((await pg.query("SELECT 1 FROM daily_closes WHERE symbol = 'KO' AND session_date = '2026-10-01'")).rows.length, 0);
  });

  it("DASH-14: a stored close never changes, whatever the feed later says; page reads don't change it", async () => {
    clock = at("2026-10-01", [23, 0]);
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    const view = await priceViews(db, ["KO"]);
    SERIES.KO.bars = SERIES.KO.bars.map(([d, c]) => [d, c + 5]); // feed revises everything
    await pg.query("UPDATE price_coverage SET last_session_date = '2026-09-27'"); // force a refetch window
    await runDailyRefresh(db, provider(), { trigger: "preview", now: () => clock });
    assert.deepEqual(await latest("KO"), { session_date: "2026-10-01", close: "61" });
    assert.deepEqual(await priceViews(db, ["KO"]), view);
    assert.deepEqual(view.KO, { symbol: "KO", close: "61", currency: "USD", sessionDate: "2026-10-01", pending: false, lastError: null });
  });

  it("catches up every missing session since the last stored close (gaps from missed runs)", async () => {
    week("2026-09-28");
    clock = at("2026-09-28", [23, 0]);
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal((await latest("KO")).session_date, "2026-09-28");
    // Runs on 09-29 and 09-30 were missed; the next one fills both and 10-01.
    week();
    clock = at("2026-10-01", [23, 0]);
    calls.length = 0;
    const r = await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal(r.status !== "locked" && r.inserted, 9);
    const ko = (await pg.query<{ session_date: string }>("SELECT session_date FROM daily_closes WHERE symbol = 'KO' ORDER BY 1")).rows;
    assert.deepEqual(ko.map((r) => r.session_date), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]);
    // The incremental request starts from the day after the last stored close (minus a small margin).
    const koCall = calls.find((c) => c.symbol === "KO")!;
    const period1 = Number(new URLSearchParams(koCall.query).get("period1"));
    assert.equal(dateInZone((period1 + 86400 * 3) * 1000, "UTC"), "2026-09-29");
  });

  it("the lock: a running run for today blocks a second one; a stale one is taken over", async () => {
    clock = Date.now();
    const today = dateInZone(clock, "UTC");
    const first = await acquireRunLock(db, today, "cron");
    assert.equal(typeof first, "number");
    assert.equal(await acquireRunLock(db, today, "preview"), null);
    const blocked = await runDailyRefresh(db, provider(), { trigger: "preview", now: () => clock });
    assert.deepEqual(blocked, { status: "locked", runDate: today });
    assert.equal(calls.length, 0);
    await pg.query("UPDATE refresh_runs SET started_at = now() - interval '11 minutes'");
    const taken = await runDailyRefresh(db, provider(), { trigger: "preview", now: () => clock });
    assert.notEqual(taken.status, "locked");
    assert.equal((await pg.query("SELECT 1 FROM refresh_runs")).rows.length, 1, "one row per run_date");
  });

  it("one bad symbol doesn't stop the others; its error is recorded and retried next run", async () => {
    delete SERIES["RY.TO"]; // the feed has nothing for it
    clock = at("2026-10-01", [23, 0]);
    const r = await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal(r.status, "partial");
    assert.equal((await latest("KO")).session_date, "2026-10-01");
    const cov = (await pg.query<{ last_error: string; last_session_date: string | null }>("SELECT last_error, last_session_date FROM price_coverage WHERE symbol = 'RY.TO'")).rows[0];
    assert.match(cov.last_error, /RY\.TO: No data found/);
    assert.equal(cov.last_session_date, null);
    assert.equal((await priceViews(db, ["RY.TO"]))["RY.TO"].pending, true);
    week();
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal((await latest("RY.TO")).session_date, "2026-10-01");
  });

  it("refuses to mix currencies in one series", async () => {
    clock = at("2026-10-01", [23, 0]);
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    SERIES.KO.currency = "EUR";
    SERIES.KO.bars.push(["2026-10-02", 70]);
    SERIES.KO.today = "2026-10-02";
    clock = at("2026-10-02", [23, 0]);
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal((await latest("KO")).session_date, "2026-10-01");
    const err = (await pg.query<{ last_error: string }>("SELECT last_error FROM price_coverage WHERE symbol = 'KO'")).rows[0];
    assert.match(err.last_error, /currency changed from USD to EUR/);
  });

  it("new-holding backfill fetches once; afterwards the symbol is left to the daily run", async () => {
    clock = at("2026-10-01", [23, 0]);
    assert.deepEqual((await priceViews(db, ["KO"])).KO.pending, true, "price pending before the job");
    const r = await backfillSymbol(db, provider(), "KO", () => clock);
    assert.equal(r?.inserted, 4);
    assert.equal(calls.length, 1);
    assert.match(calls[0].query, /period1=\d+&period2=\d+&interval=1d&events=div%2Csplit/);
    assert.equal(Number(new URLSearchParams(calls[0].query).get("period1")) + 86400 * 3, Date.UTC(2000, 0, 1) / 1000);
    assert.equal(await backfillSymbol(db, provider(), "KO", () => clock), null);
    assert.equal(calls.length, 1);
    assert.equal((await priceViews(db, ["KO"])).KO.pending, false);
  });

  it("corporate actions are written once and re-checked weekly, never re-writing closes", async () => {
    SERIES.KO.dividends = [["2026-09-29", 0.51]];
    clock = at("2026-10-01", [23, 0]);
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal((await pg.query("SELECT 1 FROM corporate_actions WHERE symbol = 'KO'")).rows.length, 1);
    calls.length = 0;
    clock += 3 * 86400_000; // 3 days later: no actions call needed, only the incremental closes call
    await runDailyRefresh(db, provider(), { trigger: "cron", now: () => clock });
    assert.equal(calls.filter((c) => c.symbol === "KO").length, 1);
  });
});

// ------------------------------------------------------------------ routes

const fakeProvider = (): DailyCloseProvider => provider();
const SECRET = "test-only-cron-secret"; // dummy value for the offline test, not a real secret

describe("cron route (DASH-10)", () => {
  const on = { DASHBOARD_ENABLED: "true", CRON_SECRET: SECRET, VERCEL_ENV: "preview" };
  const cron = (headers: Record<string, string> = {}, method = "GET", env: Record<string, string | undefined> = on) =>
    handleCronRequest(new Request("http://localhost/api/cron/daily-refresh", { method, headers }), {
      env,
      getDb: async () => db,
      provider: fakeProvider,
      now: () => at("2026-10-01", [23, 0]),
    });

  it("404 JSON with the flag off (production today), for every method", async () => {
    for (const m of ["GET", "POST"]) {
      const res = await cron({ authorization: `Bearer ${SECRET}` }, m, { CRON_SECRET: SECRET });
      assert.equal(res.status, 404);
      assert.deepEqual(await res.json(), { error: "Not found." });
    }
  });

  it("401 without the header, with a wrong one, or when CRON_SECRET isn't set", async () => {
    for (const headers of [{} as Record<string, string>, { authorization: "Bearer nope" }, { authorization: SECRET }, { authorization: `bearer ${SECRET}` }]) {
      const res = await cron(headers);
      assert.equal(res.status, 401, JSON.stringify(headers));
      assert.deepEqual(await res.json(), { error: "Unauthorized." });
    }
    for (const secret of [undefined, ""]) {
      const res = await cron({ authorization: "Bearer " }, "GET", { ...on, CRON_SECRET: secret });
      assert.equal(res.status, 401);
    }
    assert.equal(cronAuthorized(`Bearer ${SECRET}`, SECRET), true);
    assert.equal(cronAuthorized("Bearer undefined", undefined), false);
    assert.equal((await pg.query("SELECT 1 FROM refresh_runs")).rows.length, 0, "nothing ran");
  });

  it("405 for other methods; 200 runs the job with the right header", async () => {
    const post = await cron({ authorization: `Bearer ${SECRET}` }, "POST");
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET");
    const ok = await cron({ authorization: `Bearer ${SECRET}` });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { status: string; inserted: number };
    assert.equal(body.status, "ok");
    assert.equal(body.inserted, 12);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(SECRET));
  });
});

describe("preview-only refresh button (DASH-10)", () => {
  const user = { id: "alice", email: "alice@example.com" };
  const refresh = (env: Record<string, string | undefined>, opts: { method?: string; signedIn?: boolean } = {}) =>
    handlePreviewRefreshRequest(new Request("http://localhost/api/dashboard/refresh", { method: opts.method ?? "POST" }), {
      env,
      getUser: async () => (opts.signedIn === false ? null : user),
      getDb: async () => db,
      provider: fakeProvider,
      now: () => at("2026-10-01", [23, 0]),
    });

  it("is visible only on Vercel previews with the flag on", () => {
    assert.equal(previewRefreshAvailable({ DASHBOARD_ENABLED: "true", VERCEL_ENV: "preview" }), true);
    for (const env of [
      { DASHBOARD_ENABLED: "true", VERCEL_ENV: "production" },
      { DASHBOARD_ENABLED: "true" },
      { DASHBOARD_ENABLED: "true", VERCEL_ENV: "development" },
      { VERCEL_ENV: "preview" },
      {},
    ])
      assert.equal(previewRefreshAvailable(env), false, JSON.stringify(env));
    // The page renders the button only from the server's previewRefresh flag.
    const page = readFileSync("src/routes/dashboard.tsx", "utf8");
    assert.match(page, /\{previewRefresh && storage === "ok" \? \(\s*<PreviewRefresh/);
    assert.match(readFileSync("src/lib/dashboard/gate.ts", "utf8"), /const previewRefresh = previewRefreshAvailable\(\);/);
  });

  it("404 on production, without VERCEL_ENV, or with the flag off; 405; 401 signed out", async () => {
    for (const env of [{ DASHBOARD_ENABLED: "true", VERCEL_ENV: "production" }, { DASHBOARD_ENABLED: "true" }, { VERCEL_ENV: "preview" }]) {
      const res = await refresh(env);
      assert.equal(res.status, 404, JSON.stringify(env));
      assert.deepEqual(await res.json(), { error: "Not found." });
    }
    const preview = { DASHBOARD_ENABLED: "true", VERCEL_ENV: "preview" };
    const get = await refresh(preview, { method: "GET" });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");
    assert.equal((await refresh(preview, { signedIn: false })).status, 401);
  });

  it("runs the same job without CRON_SECRET and returns counts only (no other users' symbols)", async () => {
    const res = await refresh({ DASHBOARD_ENABLED: "true", VERCEL_ENV: "preview" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok", runDate: "2026-10-01", symbols: 3, inserted: 12, actions: 0, errors: 0, deferred: 0 });
    assert.doesNotMatch(JSON.stringify(body), /RY\.TO|KO|ASML/);
    assert.equal((await latest("RY.TO")).session_date, "2026-10-01");
  });
});

describe("0004: holdings -> user cascade, Vercel cron config", () => {
  it("deleting a user deletes their holdings (and only theirs)", async () => {
    await pg.query(`DELETE FROM "user" WHERE id = 'alice'`);
    const rows = (await pg.query<{ user_id: string; symbol: string }>("SELECT user_id, symbol FROM holdings ORDER BY 1, 2")).rows;
    assert.deepEqual(rows, [
      { user_id: "bob", symbol: "KO" },
      { user_id: "bob", symbol: "RY.TO" },
    ]);
    await assert.rejects(
      pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('ghost', 'KO', 1, 1)"),
      (err: { code?: string }) => err.code === "23503",
    );
  });

  it("re-running 0004 is a no-op", async () => {
    await pg.exec(readFileSync("migrations/0004_daily_close.sql", "utf8"));
    const fk = (await pg.query("SELECT conname FROM pg_constraint WHERE conname = 'holdings_user_id_fkey'")).rows;
    assert.equal(fk.length, 1);
  });

  it("vercel.json schedules GET /api/cron/daily-refresh at 0 23 * * * (UTC, once a day)", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: { path: string; schedule: string }[] };
    assert.deepEqual(config.crons, [{ path: "/api/cron/daily-refresh", schedule: "0 23 * * *" }]);
  });
});
