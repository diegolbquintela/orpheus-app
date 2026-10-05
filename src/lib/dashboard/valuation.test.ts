// Offline tests for T07 (#15): holdings valuation (DASH-13), stored data only (DASH-14), the as-of line and
// the out-of-date note (DASH-25), and D8 (cost at the same rate as the price). PGLite, no network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import type { DailyCloseProvider } from "./close-provider.ts";
import { runDailyRefresh } from "./daily-refresh.server.ts";
import type { Queryable } from "./store.server.ts";
import { freshness, loadDashboardHoldings, STALE_AFTER_DAYS, valueHoldings } from "./valuation.server.ts";

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

const USER = "user-diego";
const NOW = Date.UTC(2026, 9, 2, 16, 0); // 2026-10-02 12:00 ET, markets open
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

async function seed(opts: { base?: "CAD" | "USD" | "EUR" } = {}) {
  await pg.exec(`
    INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('${USER}', 'D', 'd@example.com', false);
    INSERT INTO instruments (symbol, name, exchange, region, currency) VALUES
      ('KO', 'The Coca-Cola Company', 'NYSE', 'US', 'USD'),
      ('ASML.AS', 'ASML Holding N.V.', 'Amsterdam', 'EU', 'EUR'),
      ('RY.TO', 'Royal Bank of Canada', 'Toronto', 'CA', 'CAD');
    INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES
      ('${USER}', 'KO', 10, 60), ('${USER}', 'ASML.AS', 2, 600), ('${USER}', 'RY.TO', 5, 200);
    INSERT INTO daily_closes (symbol, session_date, close, currency, source) VALUES
      ('KO', '2026-09-30', 68, 'USD', 'yahoo'), ('KO', '2026-10-01', 70, 'USD', 'yahoo'),
      ('ASML.AS', '2026-10-01', 700, 'EUR', 'yahoo'), ('RY.TO', '2026-10-01', 180, 'CAD', 'yahoo');
    -- Bank of Canada Valet values (test-fixtures/fx), 2026-09-30 is a BoC holiday.
    INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source) VALUES
      ('USD', '2026-09-29', 1.4188, 'BOC'), ('EUR', '2026-09-29', 1.6084, 'BOC'),
      ('USD', '2026-10-01', 1.4243, 'BOC'), ('EUR', '2026-10-01', 1.6030, 'BOC');`);
  if (opts.base)
    await pg.query("INSERT INTO user_settings (user_id, base_currency) VALUES ($1, $2)", [USER, opts.base]);
}

beforeEach(async () => {
  await pg.exec(`DELETE FROM holdings; DELETE FROM daily_closes; DELETE FROM fx_rates; DELETE FROM instruments;
    DELETE FROM refresh_runs; DELETE FROM price_coverage; DELETE FROM corporate_actions; DELETE FROM user_settings;
    DELETE FROM "user";`);
});

const load = () => loadDashboardHoldings(db, USER, { previewRefresh: false, nowMs: NOW });

describe("DASH-13: every column and the totals (hand check: USD, EUR and CAD holdings, CAD base)", () => {
  it("market value, cost (D8), total return, % of portfolio and the total row", async () => {
    await seed();
    const d = await load();
    assert.equal(d.baseCurrency, "CAD");
    assert.deepEqual(
      d.holdings.map((h) => [h.symbol, h.shares, h.avgCost]),
      [
        ["ASML.AS", "2.000000", "600.000000"],
        ["KO", "10.000000", "60.000000"],
        ["RY.TO", "5.000000", "200.000000"],
      ],
    );
    // Name and last close + session date come with the price view (listing currency).
    assert.deepEqual(
      Object.values(d.prices)
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map((p) => [p.symbol, p.name, p.close, p.currency, p.sessionDate]),
      [
        ["ASML.AS", "ASML Holding N.V.", "700", "EUR", "2026-10-01"],
        ["KO", "The Coca-Cola Company", "70", "USD", "2026-10-01"],
        ["RY.TO", "Royal Bank of Canada", "180", "CAD", "2026-10-01"],
      ],
    );
    const v = d.valuation;
    const by = Object.fromEntries(v.rows.map((r) => [r.symbol, r]));
    // By hand, rates of 2026-10-01 (USD 1.4243, EUR 1.6030):
    // KO     10 × 70  × 1.4243 =   997.01; cost 10 × 60  × 1.4243 =   854.58; return  142.43; (70−60)/60   = +16.67 %
    // ASML    2 × 700 × 1.6030 = 2,244.20; cost 2 × 600  × 1.6030 = 1,923.60; return  320.60; (700−600)/600 = +16.67 %
    // RY      5 × 180          =   900.00; cost 5 × 200          = 1,000.00; return −100.00; (180−200)/200 = −10.00 %
    const expect: Record<string, [number, number, number, number]> = {
      KO: [997.01, 854.58, 142.43, 100 / 6],
      "ASML.AS": [2244.2, 1923.6, 320.6, 100 / 6],
      "RY.TO": [900, 1000, -100, -10],
    };
    for (const [s, [value, cost, ret, pct]] of Object.entries(expect)) {
      assert.ok(close(by[s].value!, value), `${s} value ${by[s].value}`);
      assert.ok(close(by[s].cost!, cost), `${s} cost ${by[s].cost}`);
      assert.ok(close(by[s].returnAmount!, ret), `${s} return ${by[s].returnAmount}`);
      assert.ok(close(by[s].returnPct!, pct), `${s} return % ${by[s].returnPct}`);
      assert.equal(by[s].status, "ok");
    }
    // Totals: 4,141.21 / 3,778.18 / +363.03 (+9.61 %).
    assert.ok(close(v.total, 4141.21));
    assert.ok(close(v.totalCost, 3778.18));
    assert.ok(close(v.totalReturn, 363.03));
    assert.ok(close(v.totalReturnPct!, (363.03 / 3778.18) * 100));
    // % of portfolio: 24.07 / 54.19 / 21.73, summing to 100.
    assert.ok(close(by.KO.weight!, (997.01 / 4141.21) * 100));
    assert.ok(close(by["ASML.AS"].weight!, (2244.2 / 4141.21) * 100));
    assert.ok(close(v.rows.reduce((s, r) => s + r.weight!, 0), 100));
    assert.equal(v.rows.map((r) => r.weight!.toFixed(1)).join(" "), "54.2 24.1 21.7");
    assert.equal(v.rows.reduce((s, r) => s + Number(r.weight!.toFixed(1)), 0).toFixed(1), "100.0");
    assert.deepEqual(v.excluded, []);
  });

  it("D8: cost converts at the same rate as the price (the rate for the close's session date)", async () => {
    await seed();
    const v = (await load()).valuation;
    for (const r of v.rows) {
      const h = (await load()).holdings.find((x) => x.symbol === r.symbol)!;
      const p = (await load()).prices[r.symbol];
      assert.ok(close(r.cost! / r.value!, Number(h.avgCost) / Number(p.close)), r.symbol);
    }
    // The base-currency return % equals the listing-currency return % (one rate for value and cost).
    for (const r of v.rows) assert.ok(close((r.returnAmount! / r.cost!) * 100, r.returnPct!), r.symbol);
  });

  it("USD and EUR bases re-express every amount; return % and % of portfolio don't depend on the base", async () => {
    await seed({ base: "USD" });
    const usd = (await load()).valuation;
    assert.equal(usd.base, "USD");
    const ko = usd.rows.find((r) => r.symbol === "KO")!;
    assert.equal(ko.value, 700);
    assert.equal(ko.cost, 600);
    assert.ok(close(usd.total, 4141.21 / 1.4243));
    assert.ok(close(usd.totalCost, 3778.18 / 1.4243));
    await pg.query("UPDATE user_settings SET base_currency = 'EUR'");
    const eur = (await load()).valuation;
    assert.equal(eur.rows.find((r) => r.symbol === "ASML.AS")!.value, 1400);
    assert.ok(close(eur.total, 4141.21 / 1.603));
    for (const r of eur.rows) {
      const u = usd.rows.find((x) => x.symbol === r.symbol)!;
      assert.ok(close(r.returnPct!, u.returnPct!));
      assert.ok(close(r.weight!, u.weight!));
    }
  });

  it("price pending and FX pending are left out of the totals and % of portfolio, and listed", async () => {
    await seed();
    await pg.exec(`
      INSERT INTO instruments (symbol, region, currency) VALUES ('VOLV-B.ST', 'EU', 'SEK');
      INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('${USER}', 'NEW', 1, 1), ('${USER}', 'VOLV-B.ST', 3, 250);
      INSERT INTO daily_closes (symbol, session_date, close, currency, source) VALUES ('VOLV-B.ST', '2026-10-01', 260, 'SEK', 'yahoo');`);
    const v = (await load()).valuation;
    const by = Object.fromEntries(v.rows.map((r) => [r.symbol, r]));
    assert.equal(by.NEW.status, "price_pending");
    assert.equal(by["VOLV-B.ST"].status, "fx_pending");
    for (const s of ["NEW", "VOLV-B.ST"]) {
      assert.equal(by[s].value, null);
      assert.equal(by[s].cost, null);
      assert.equal(by[s].returnAmount, null);
      assert.equal(by[s].weight, null);
    }
    assert.deepEqual(v.excluded, ["NEW", "VOLV-B.ST"]);
    assert.ok(close(v.total, 4141.21));
    assert.ok(close(v.totalCost, 3778.18));
    assert.ok(close(v.rows.reduce((s, r) => s + (r.weight ?? 0), 0), 100));
  });

  it("an average cost of 0 makes that return % n/m (null); a zero total cost too", async () => {
    await seed();
    await pg.exec("UPDATE holdings SET avg_cost = 0");
    const v = (await load()).valuation;
    assert.ok(v.rows.every((r) => r.returnPct === null && r.cost === 0));
    assert.equal(v.totalReturnPct, null);
    assert.ok(close(v.totalReturn, v.total));
  });

  it("no holdings: zero totals, no dates", async () => {
    const v = await valueHoldings(db, [], {}, "CAD");
    assert.deepEqual(v, {
      base: "CAD", rows: [], total: 0, totalCost: 0, totalReturn: 0, totalReturnPct: null, excluded: [], pricesAsOf: null, fxAsOf: null,
    });
  });
});

describe("DASH-14: values change only after the daily job", () => {
  it("reloads read stored data only; a new close counts once the job has stored it", async () => {
    await seed();
    const first = await load();
    const again = await load();
    assert.deepEqual(again, first, "a reload during market hours changes nothing");
    // The page never takes a provider; only the job does. A provider with a later close:
    const calls: string[] = [];
    const provider: DailyCloseProvider = {
      id: "fake",
      supports: () => true,
      budget: { perMinute: 60, perDay: 100 },
      getCloses: async (symbols) => {
        calls.push(...symbols);
        return symbols.includes("KO") ? [{ symbol: "KO", date: "2026-10-02", close: 72, currency: "USD", source: "fake" }] : [];
      },
      getCorporateActions: async () => [],
    };
    assert.deepEqual((await load()).valuation, first.valuation);
    assert.deepEqual(calls, []);
    await pg.exec(`INSERT INTO price_coverage (symbol, last_session_date) VALUES ('KO', '2026-10-01'), ('ASML.AS', '2026-10-01'), ('RY.TO', '2026-10-01')
      ON CONFLICT (symbol) DO UPDATE SET last_session_date = EXCLUDED.last_session_date`);
    await runDailyRefresh(db, provider, { trigger: "cron", now: () => Date.UTC(2026, 9, 2, 23, 0) });
    const after = await load();
    const ko = after.valuation.rows.find((r) => r.symbol === "KO")!;
    assert.equal(ko.sessionDate, "2026-10-02");
    // No FX for 2026-10-02 stored in this test: the 2026-10-01 rate is used and flagged.
    assert.ok(close(ko.value!, 720 * 1.4243));
    assert.equal(ko.fallback, true);
    assert.equal(after.valuation.pricesAsOf, "2026-10-02");
  });

  it("the valuation code has no feed access", () => {
    const src = readFileSync("src/lib/dashboard/valuation.server.ts", "utf8");
    assert.doesNotMatch(src, /yahoo|fetch\(|createFxFetcher|refreshFx|getCloses/);
  });
});

describe("DASH-25: as-of line and out-of-date note", () => {
  it('"Prices as of <latest session date> close · FX <date of the rates used>"', async () => {
    await seed();
    let v = (await load()).valuation;
    assert.equal(v.pricesAsOf, "2026-10-01");
    assert.equal(v.fxAsOf, "2026-10-01");
    // KO's only close on 2026-09-30 (BoC holiday): FX falls back to 2026-09-29.
    await pg.exec("DELETE FROM daily_closes WHERE session_date = '2026-10-01'");
    await pg.exec("DELETE FROM holdings WHERE symbol <> 'KO'");
    v = (await load()).valuation;
    assert.equal(v.pricesAsOf, "2026-09-30");
    assert.equal(v.fxAsOf, "2026-09-29");
    assert.equal(v.rows[0].fallback, true);
  });

  it("no FX needed when every holding is in the base currency", async () => {
    await seed();
    await pg.exec("DELETE FROM holdings WHERE symbol <> 'RY.TO'");
    const v = (await load()).valuation;
    assert.equal(v.pricesAsOf, "2026-10-01");
    assert.equal(v.fxAsOf, null);
  });

  it(`the note appears when the last successful run is more than ${STALE_AFTER_DAYS} days old`, async () => {
    const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
    assert.deepEqual(await freshness(db, at("2026-10-02")), { lastGoodRun: null, stale: true }, "no run yet");
    await pg.exec(`INSERT INTO refresh_runs (run_date, status, finished_at) VALUES ('2026-09-28', 'ok', now())`);
    assert.deepEqual(await freshness(db, at("2026-10-02")), { lastGoodRun: "2026-09-28", stale: false }, "4 days");
    assert.deepEqual(await freshness(db, at("2026-10-03")), { lastGoodRun: "2026-09-28", stale: true }, "5 days");
    // Running or failed runs don't count; a partial one (per-symbol errors only) does.
    await pg.exec(`INSERT INTO refresh_runs (run_date, status) VALUES ('2026-10-01', 'running'), ('2026-10-02', 'failed')`);
    assert.equal((await freshness(db, at("2026-10-03"))).stale, true);
    await pg.exec(`INSERT INTO refresh_runs (run_date, status, finished_at) VALUES ('2026-09-30', 'partial', now())`);
    assert.deepEqual(await freshness(db, at("2026-10-03")), { lastGoodRun: "2026-09-30", stale: false });
  });

  it("the page data carries the freshness", async () => {
    await seed();
    await pg.exec(`INSERT INTO refresh_runs (run_date, status, finished_at) VALUES ('2026-09-27', 'ok', now())`);
    assert.deepEqual((await load()).freshness, { lastGoodRun: "2026-09-27", stale: true });
  });
});

// ------------------------------------------------------------------ T15 (#23): holdings pie (DASH-24)

import { excludedNote, PIE_COLOURS, PIE_MAX_SLICES, piePct, pieSlices } from "./pie.ts";

describe("DASH-24: pie slices = the table's % of portfolio in the base currency", () => {
  it("KO + ASML.AS + RY.TO in CAD: each slice equals the row's weight, largest first, sum 100.0", async () => {
    await seed({ base: "CAD" });
    const { valuation } = await load();
    const pie = pieSlices(valuation.rows);
    assert.deepEqual(pie.slices.map((s) => s.label), ["ASML.AS", "KO", "RY.TO"]); // 2,244.20 > 997.01 > 900.00 CAD
    for (const s of pie.slices) {
      const row = valuation.rows.find((r) => r.symbol === s.label)!;
      assert.ok(close(s.pct, row.weight!), s.label);
      assert.equal(piePct(s.pct), `${row.weight!.toFixed(1)}%`, "same label as the table's % column");
    }
    assert.ok(Math.abs(pie.slices.reduce((t, s) => t + s.pct, 0) - 100) < 1e-9);
    assert.equal(pie.slices.reduce((t, s) => t + s.pct, 0).toFixed(1), "100.0");
    assert.ok(close(pie.total, valuation.total));
    assert.deepEqual([pie.pricePending, pie.fxPending], [[], []]);
  });

  it("a holding with no close gets no slice, is listed as price pending, and the others still sum to 100", async () => {
    await seed({ base: "CAD" });
    await pg.exec(`INSERT INTO instruments (symbol, name, exchange, region, currency) VALUES ('SHOP', 'Shopify', 'NASDAQ', 'US', 'USD');
      INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('${USER}', 'SHOP', 3, 100);`);
    const { valuation } = await load();
    const pie = pieSlices(valuation.rows);
    assert.deepEqual(pie.pricePending, ["SHOP"]);
    assert.ok(!pie.slices.some((s) => s.symbols.includes("SHOP")));
    assert.ok(Math.abs(pie.slices.reduce((t, s) => t + s.pct, 0) - 100) < 1e-9);
    assert.equal(excludedNote(pie.pricePending.length, pie.fxPending.length), "1 holding without a price excluded");
  });

  it("more than 10 holdings: 10 largest + Other (sum of the rest); exactly 10: no Other; ties by ticker", () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({ symbol: `S${String(i).padStart(2, "0")}`, value: 100 - i, status: "ok" }));
    const pie = pieSlices(rows);
    assert.equal(pie.slices.length, PIE_MAX_SLICES + 1);
    assert.deepEqual(pie.slices.slice(0, 10).map((s) => s.label), rows.slice(0, 10).map((r) => r.symbol));
    const other = pie.slices[10];
    assert.deepEqual([other.label, other.symbols, other.value], ["Other", ["S10", "S11", "S12"], 90 + 89 + 88]);
    assert.ok(close(other.pct, (267 / rows.reduce((t, r) => t + r.value, 0)) * 100));
    assert.ok(Math.abs(pie.slices.reduce((t, s) => t + s.pct, 0) - 100) < 1e-9);
    assert.equal(pieSlices(rows.slice(0, 10)).slices.some((s) => s.label === "Other"), false);
    const tie = pieSlices([{ symbol: "B", value: 5, status: "ok" }, { symbol: "A", value: 5, status: "ok" }]);
    assert.deepEqual(tie.slices.map((s) => s.label), ["A", "B"]);
  });

  it("empty and pending-only portfolios: no slices; FX pending listed separately; neutral colours", () => {
    assert.deepEqual(pieSlices([]).slices, []);
    const p = pieSlices([
      { symbol: "X", value: null, status: "price_pending" },
      { symbol: "Y", value: null, status: "fx_pending" },
    ]);
    assert.deepEqual([p.slices, p.pricePending, p.fxPending, p.total], [[], ["X"], ["Y"], 0]);
    for (const c of PIE_COLOURS) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 16, `${c} is a grey`);
    }
  });
});

describe("EL (#43): the total row flags holdings excluded for no price / FX rate", () => {
  it("singular, plural, FX wording; nothing when N = 0", () => {
    assert.equal(excludedNote(0, 0), null);
    assert.equal(excludedNote(1, 0), "1 holding without a price excluded");
    assert.equal(excludedNote(3, 0), "3 holdings without a price excluded");
    assert.equal(excludedNote(1, 1), "2 holdings without a price or FX rate excluded");
    assert.equal(excludedNote(0, 1), "1 holding without a price or FX rate excluded");
    assert.doesNotMatch(String(excludedNote(2, 1)), /\b(buy|sell|good|bad|score|rating|recommend)\b/i);
  });
  it("the holdings list renders it on the total line only when N > 0, and the pie below the list (#55)", () => {
    const src = readFileSync("src/components/dashboard/holdings.tsx", "utf8");
    assert.match(src, /\{note \? \(\s*<span[^>]*data-testid="holdings-total-excluded-count"/);
    assert.match(src, /<HoldingsPie rows=\{valuation\.rows\} base=\{baseCurrency\} \/>/);
    const pie = readFileSync("src/components/dashboard/holdings-pie.tsx", "utf8");
    assert.match(pie, /role="img" aria-label=\{`Pie chart of % of portfolio: \$\{summary\}`\}/);
    assert.match(pie, /from "recharts"/);
  });
});

describe("#24 N1: one % of portfolio formatter for the table and the pie", () => {
  it("the pie label is the table's label for every row (same function, identical output)", async () => {
    const { formatPortfolioPct } = await import("./format.ts");
    assert.equal(piePct, formatPortfolioPct);
    await seed({ base: "CAD" });
    const { valuation } = await load();
    const pie = pieSlices(valuation.rows);
    for (const s of pie.slices) assert.equal(piePct(s.pct), formatPortfolioPct(valuation.rows.find((r) => r.symbol === s.label)!.weight!));
    for (const v of [0, 0.04, 0.05, 33.333, 41.75, 99.95, 100]) assert.equal(piePct(v), formatPortfolioPct(v));
    assert.deepEqual([0.04, 0.05, 41.75, 100].map(formatPortfolioPct), ["0.0%", "0.1%", "41.8%", "100.0%"]);
    const src = readFileSync("src/components/dashboard/holdings.tsx", "utf8");
    assert.match(src, /const weightPct = formatPortfolioPct;/);
  });
  it("N2: rounded labels may not sum to exactly 100.0 (three equal holdings: 3 × 33.3%)", () => {
    const pie = pieSlices(["A", "B", "C"].map((symbol) => ({ symbol, value: 1, status: "ok" })));
    assert.ok(Math.abs(pie.slices.reduce((t, s) => t + s.pct, 0) - 100) < 1e-9);
    assert.equal(pie.slices.map((s) => piePct(s.pct)).join(" "), "33.3% 33.3% 33.3%");
  });
});
