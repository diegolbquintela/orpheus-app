// Offline tests for T08 (#16): SEC EDGAR fundamentals ingest (ticker → CIK, companyfacts → fundamentals_annual),
// the User-Agent and rate limit, the 7-day refresh, failure isolation, DASH-21 (no SEC coverage → "not covered")
// and DASH-15 (the per-user metric column picker). PGLite + recorded SEC fixtures (test-fixtures/sec, downloaded
// 2026-10-02 and trimmed to the mapped tags; facts verbatim). No network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { handleColumnsRequest } from "./columns-api.server.ts";
import type { DailyCloseProvider } from "./close-provider.ts";
import { runDailyRefresh } from "./daily-refresh.server.ts";
import {
  annualFactsFromCompanyFacts,
  createSecFundamentalsSource,
  FUNDAMENTALS_MAX_AGE_MS,
  metricViews,
  refreshFundamentals,
  sameCompany,
  SEC_FACTS_URL,
  SEC_TICKERS_URL,
  secSourceFromEnv,
  secUserAgent,
  type AnnualFact,
  type SecGet,
} from "./fundamentals.server.ts";
import { METRIC_KEYS, METRICS } from "./metrics.ts";
import { publicSummary } from "./refresh-api.server.ts";
import type { Queryable } from "./store.server.ts";
import { loadDashboardHoldings } from "./valuation.server.ts";

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

const FIX = "test-fixtures/sec";
const TICKERS = readFileSync(`${FIX}/company_tickers_exchange-2026-10-02-subset.json`, "utf8");
const facts = (cik: string) => readFileSync(`${FIX}/companyfacts-CIK${cik}-2026-10-02-subset.json`, "utf8");
const CIK = { KO: "0000021344", ASML: "0000937966", RY: "0001000275", SHOP: "0001594805", PHG: "0000313216" };
const parsed = (cik: string) => annualFactsFromCompanyFacts(JSON.parse(facts(cik)));
const fact = (rows: AnnualFact[], concept: string, fyEnd: string) =>
  rows.find((r) => r.concept === concept && r.fiscalYearEnd === fyEnd);
const years = (rows: AnnualFact[], concept: string) =>
  rows.filter((r) => r.concept === concept).map((r) => r.fiscalYearEnd.slice(0, 4));

/** T10: recorded filer profiles (SIC) for KO and RY; other CIKs 404 (SIC unknown). */
function submission(url: string) {
  const cik = url.match(/CIK(\d{10})\.json$/)?.[1];
  try {
    return { status: 200, text: readFileSync(`${FIX}/submissions-CIK${cik}-2026-10-03-subset.json`, "utf8") };
  } catch {
    return { status: 404, text: "" };
  }
}


const CONTACT = "dashboard-owner@example.com"; // placeholder for tests; the real one is the SEC_CONTACT_EMAIL env var
const UA = secUserAgent({ SEC_CONTACT_EMAIL: CONTACT })!;

/** A fake SEC: serves the fixtures, records each request (url, headers, fake time), with a fake clock. */
function fakeSec(opts: { fail?: Record<string, number | "network"> } = {}) {
  let t = 1_000_000;
  const calls: { url: string; headers: Record<string, string>; at: number }[] = [];
  const get: SecGet = async (url, headers) => {
    calls.push({ url, headers, at: t });
    if (url === SEC_TICKERS_URL) return { status: 200, text: TICKERS };
    if (url.includes("/submissions/")) return submission(url);
    const cik = url.match(/CIK(\d{10})\.json$/)?.[1];
    const fail = cik ? opts.fail?.[cik] : undefined;
    if (fail === "network") throw new TypeError("fetch failed");
    if (fail) return { status: fail, text: "" };
    if (cik && Object.values(CIK).includes(cik)) return { status: 200, text: facts(cik) };
    return { status: 404, text: "" };
  };
  const source = createSecFundamentalsSource({
    userAgent: UA,
    get,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  return { source, calls, tick: (ms: number) => (t += ms) };
}

const USER = "user-diego";
const OTHER = "user-other";
const NOW = Date.UTC(2026, 9, 2, 23, 0);
const LISTINGS: [string, string, string, string, string][] = [
  ["KO", "The Coca-Cola Company", "NYSE", "US", "USD"],
  ["PHG", "Koninklijke Philips N.V.", "NYSE", "US", "USD"],
  ["ASML.AS", "ASML Holding N.V.", "Amsterdam", "EU", "EUR"],
  ["RY.TO", "Royal Bank of Canada", "Toronto", "CA", "CAD"],
  ["SHOP.TO", "Shopify Inc.", "Toronto", "CA", "CAD"],
  ["MC.PA", "LVMH Moët Hennessy Louis Vuitton, Société Européenne", "Paris", "EU", "EUR"],
  ["ATD.TO", "Alimentation Couche-Tard Inc.", "Toronto", "CA", "CAD"],
];
async function seed(symbols = LISTINGS.map((l) => l[0])) {
  await pg.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'D', 'd@example.com', false), ($2, 'O', 'o@example.com', false)`, [USER, OTHER]);
  for (const l of LISTINGS.filter((l) => symbols.includes(l[0])))
    await pg.query("INSERT INTO instruments (symbol, name, exchange, region, currency) VALUES ($1, $2, $3, $4, $5)", l);
  for (const s of symbols) await pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ($1, $2, 1, 1)", [USER, s]);
}
beforeEach(async () => {
  await pg.exec(`DELETE FROM holdings; DELETE FROM instruments; DELETE FROM fundamentals_annual; DELETE FROM metric_values;
    DELETE FROM user_metric_columns; DELETE FROM refresh_runs; DELETE FROM price_coverage; DELETE FROM daily_closes;
    DELETE FROM user_settings; DELETE FROM "user";`);
});

// ------------------------------------------------------------------ the adapter (parsing)

describe("companyfacts → annual facts (one adapter, tags stitched per concept)", () => {
  it("KO: revenue stitched SalesRevenueGoodsNet (to FY2015) → Revenues (FY2016+); values match EDGAR", () => {
    const ko = parsed(CIK.KO);
    assert.equal(fact(ko, "revenue", "2015-12-31")?.sourceTag, "us-gaap:SalesRevenueGoodsNet");
    assert.equal(fact(ko, "revenue", "2016-12-31")?.sourceTag, "us-gaap:Revenues");
    assert.deepEqual(
      ["2023-12-31", "2024-12-31", "2025-12-31"].map((d) => fact(ko, "revenue", d)?.value),
      ["45754000000", "47061000000", "47941000000"],
    );
    assert.equal(fact(ko, "revenue", "2025-12-31")?.unit, "USD");
    assert.equal(fact(ko, "operating_income", "2025-12-31")?.value, "13762000000");
    assert.equal(fact(ko, "gross_profit", "2025-12-31")?.value, "29544000000");
    assert.equal(fact(ko, "eps_diluted", "2025-12-31")?.value, "3.04");
    assert.equal(fact(ko, "eps_diluted", "2025-12-31")?.unit, "USD/shares");
    // One row per (fiscal year, concept); every row names its tag and filing.
    const keys = ko.map((r) => `${r.concept}@${r.fiscalYearEnd}`);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(ko.every((r) => r.sourceTag && r.accession && r.filed));
  });

  it("ASML (20-F, EUR): SalesRevenueNet to FY2015, then RevenueFromContractWithCustomerExcludingAssessedTax", () => {
    const asml = parsed(CIK.ASML);
    const r2010 = asml.find((r) => r.concept === "revenue" && r.fiscalYearEnd.startsWith("2010"));
    assert.equal(r2010?.sourceTag, "us-gaap:SalesRevenueNet");
    const r2025 = asml.find((r) => r.concept === "revenue" && r.fiscalYearEnd.startsWith("2025"));
    assert.equal(r2025?.sourceTag, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax");
    assert.equal(r2025?.value, "32667300000");
    assert.equal(r2025?.unit, "EUR");
    assert.equal(asml.find((r) => r.concept === "eps_diluted" && r.fiscalYearEnd.startsWith("2025"))?.value, "24.71");
  });

  it("Philips (IFRS 20-F): ifrs-full Revenue FY2015–FY2025 in EUR", () => {
    const phg = parsed(CIK.PHG);
    assert.deepEqual(years(phg, "revenue"), ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"]);
    const r = fact(phg, "revenue", phg.filter((x) => x.concept === "revenue").at(-1)!.fiscalYearEnd)!;
    assert.equal(r.value, "17834000000");
    assert.equal(r.unit, "EUR");
    assert.equal(r.sourceTag, "ifrs-full:Revenue");
  });

  it("Royal Bank (IFRS 40-F, FYE 31 Oct): 9 revenue years in CAD; no operating income or gross profit (bank)", () => {
    const ry = parsed(CIK.RY);
    assert.equal(years(ry, "revenue").length, 9);
    assert.equal(fact(ry, "revenue", "2025-10-31")?.value, "66605000000");
    assert.equal(fact(ry, "revenue", "2025-10-31")?.unit, "CAD");
    assert.deepEqual(years(ry, "operating_income"), []);
    assert.deepEqual(years(ry, "gross_profit"), []);
  });

  it("Shopify (10-K): RevenueFromContract… to FY2021, then Revenues", () => {
    const shop = parsed(CIK.SHOP);
    assert.equal(fact(shop, "revenue", "2021-12-31")?.sourceTag, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax");
    assert.equal(fact(shop, "revenue", "2022-12-31")?.sourceTag, "us-gaap:Revenues");
    assert.equal(fact(shop, "revenue", "2025-12-31")?.value, "11556000000");
  });

  it("annual only: quarterly facts and 10-Q forms are ignored; the latest filing wins for a restated year", () => {
    const doc = {
      cik: 1,
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                { start: "2024-01-01", end: "2024-12-31", val: 100, accn: "a1", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" },
                { start: "2024-01-01", end: "2024-12-31", val: 110, accn: "a2", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
                { start: "2025-01-01", end: "2025-03-31", val: 30, accn: "q1", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-05-01" },
                { start: "2025-01-01", end: "2025-12-31", val: 120, accn: "a2", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" },
              ],
            },
          },
        },
      },
    };
    const rows = annualFactsFromCompanyFacts(doc as never).filter((r) => r.concept === "revenue");
    assert.deepEqual(
      rows.map((r) => [r.fiscalYearEnd, r.value, r.accession]),
      [
        ["2024-12-31", "110", "a2"],
        ["2025-12-31", "120", "a2"],
      ],
    );
  });
});

// ------------------------------------------------------------------ coverage (ticker → CIK + name check)

describe("coverage: ticker → CIK; non-US listings need the same company name (else not covered, not an error)", () => {
  const resolve = (symbol: string, region: "US" | "EU" | "CA", name: string | null) =>
    fakeSec().source.resolve({ symbol, region, name });
  it("covered: KO, RY.TO, ASML.AS, SHOP.TO, BN.TO", async () => {
    assert.deepEqual(await resolve("KO", "US", "The Coca-Cola Company"), { id: CIK.KO, name: "COCA COLA CO" });
    assert.equal((await resolve("RY.TO", "CA", "Royal Bank of Canada"))?.id, CIK.RY);
    assert.equal((await resolve("ASML.AS", "EU", "ASML Holding N.V."))?.id, CIK.ASML);
    assert.equal((await resolve("SHOP.TO", "CA", "Shopify Inc."))?.id, CIK.SHOP);
    assert.ok(await resolve("BN.TO", "CA", "Brookfield Corporation"));
  });
  it("not covered: same ticker, different company (MC.PA, L.TO, AIR.PA, CNR.TO); no SEC ticker (ATD.TO, PHIA.AS)", async () => {
    for (const [s, r, n] of [
      ["MC.PA", "EU", "LVMH Moët Hennessy Louis Vuitton, Société Européenne"],
      ["L.TO", "CA", "Loblaw Companies Limited"],
      ["AIR.PA", "EU", "Airbus SE"],
      ["CNR.TO", "CA", "Canadian National Railway Company"],
      ["ATD.TO", "CA", "Alimentation Couche-Tard Inc."],
      ["PHIA.AS", "EU", "Koninklijke Philips N.V."],
      ["RY.TO", "CA", null],
    ] as const)
      assert.equal(await resolve(s, r, n), null, s);
  });
  it("name matching ignores case, punctuation and legal suffixes, and never matches on one shared word", () => {
    assert.ok(sameCompany("ROYAL BANK OF CANADA", "Royal Bank of Canada"));
    assert.ok(sameCompany("ASML HOLDING NV", "ASML Holding N.V."));
    assert.ok(!sameCompany("LOEWS CORP", "Loblaw Companies Limited"));
    assert.ok(!sameCompany("AAR CORP", "Airbus SE"));
  });
});

// ------------------------------------------------------------------ SEC request rules

describe("SEC rules: User-Agent with a contact, ≤5 requests/s, ticker map once, nothing without a contact", () => {
  it("every request carries the descriptive User-Agent with the contact address", async () => {
    await seed(["KO", "ASML.AS", "RY.TO"]);
    const sec = fakeSec();
    await refreshFundamentals(db, sec.source, { nowMs: NOW });
    assert.equal(sec.calls.length, 7, "ticker map + 3 companyfacts + 3 filer profiles (SIC, T10)");
    for (const c of sec.calls) {
      assert.equal(c.headers["User-Agent"], `OrpheusWisdom/1.0 (orpheus-app dashboard; ${CONTACT})`);
      assert.match(c.url, /^https:\/\/(www\.sec\.gov|data\.sec\.gov)\//);
    }
    assert.equal(sec.calls.filter((c) => c.url === SEC_TICKERS_URL).length, 1, "ticker map fetched once per run");
    assert.ok(sec.calls.some((c) => c.url === `${SEC_FACTS_URL}/CIK${CIK.KO}.json`));
  });

  it("requests are at least 200 ms apart (≤5/s, under SEC's 10/s)", async () => {
    await seed();
    const sec = fakeSec();
    await refreshFundamentals(db, sec.source, { nowMs: NOW, now: () => 0 });
    for (let i = 1; i < sec.calls.length; i++) assert.ok(sec.calls[i].at - sec.calls[i - 1].at >= 200, `gap ${i}`);
  });

  it("no SEC_CONTACT_EMAIL (or an invalid one): no source, no request, the run says skipped", async () => {
    for (const env of [{}, { SEC_CONTACT_EMAIL: "" }, { SEC_CONTACT_EMAIL: "not-an-address" }]) {
      assert.equal(secUserAgent(env), null);
      assert.equal(secSourceFromEnv(env), null);
    }
    await seed(["KO"]);
    const s = await refreshFundamentals(db, null, { nowMs: NOW });
    assert.match(s.skipped ?? "", /SEC_CONTACT_EMAIL/);
    assert.equal(s.checked, 0);
    assert.equal((await metricViews(db, ["KO"])).KO.coverage, "pending");
  });

  it("refresh at most every 7 days: nothing fetched inside the window, refetched after it", async () => {
    await seed(["KO", "MC.PA"]);
    const first = fakeSec();
    assert.equal((await refreshFundamentals(db, first.source, { nowMs: NOW })).checked, 2);
    const again = fakeSec();
    const s = await refreshFundamentals(db, again.source, { nowMs: NOW + FUNDAMENTALS_MAX_AGE_MS - 60_000 });
    assert.equal(s.checked, 0);
    assert.equal(again.calls.length, 0, "no SEC request within 7 days");
    const later = fakeSec();
    assert.equal((await refreshFundamentals(db, later.source, { nowMs: NOW + FUNDAMENTALS_MAX_AGE_MS })).checked, 2);
    assert.ok(later.calls.some((c) => c.url.endsWith(`CIK${CIK.KO}.json`)));
  });

  it("caps symbols per run; the rest are deferred to the next run", async () => {
    await seed();
    const s = await refreshFundamentals(db, fakeSec().source, { nowMs: NOW, maxSymbols: 3 });
    assert.equal(s.checked, 3);
    assert.equal(s.deferred, LISTINGS.length - 3);
  });
});

// ------------------------------------------------------------------ storage + failure isolation

describe("the ingest job stores facts and one symbol's failure doesn't fail the run", () => {
  it("stores fundamentals_annual for covered symbols and marks the source", async () => {
    await seed();
    const s = await refreshFundamentals(db, fakeSec().source, { nowMs: NOW });
    assert.deepEqual([s.checked, s.covered, s.notCovered, s.errors.length], [7, 5, 2, 0]);
    const rev = await pg.query<{ value: string; source_tag: string }>(
      "SELECT value::text, source_tag FROM fundamentals_annual WHERE symbol = 'KO' AND concept = 'revenue' AND fiscal_year_end = '2025-12-31'",
    );
    assert.deepEqual(rev.rows, [{ value: "47941000000", source_tag: "us-gaap:Revenues" }]);
    const inst = await pg.query<{ symbol: string; fundamentals_source: string; sec_cik: string | null }>(
      "SELECT symbol, fundamentals_source, sec_cik FROM instruments ORDER BY symbol",
    );
    assert.deepEqual(
      inst.rows.map((r) => [r.symbol, r.fundamentals_source, r.sec_cik]),
      [
        ["ASML.AS", "sec", CIK.ASML],
        ["ATD.TO", "none", null],
        ["KO", "sec", CIK.KO],
        ["MC.PA", "none", null],
        ["PHG", "sec", CIK.PHG],
        ["RY.TO", "sec", CIK.RY],
        ["SHOP.TO", "sec", CIK.SHOP],
      ],
    );
  });

  it("a 500 or a network error for one symbol is recorded; the others still succeed and it's retried next run", async () => {
    await seed(["KO", "ASML.AS", "RY.TO"]);
    const sec = fakeSec({ fail: { [CIK.ASML]: 500, [CIK.RY]: "network" } });
    const s = await refreshFundamentals(db, sec.source, { nowMs: NOW });
    assert.equal(s.covered, 1);
    assert.deepEqual(s.errors.map((e) => e.symbol).sort(), ["ASML.AS", "RY.TO"]);
    assert.ok(s.errors.every((e) => !e.error.includes(CONTACT)), "errors never echo the contact");
    const rows = await pg.query<{ symbol: string; checked: boolean; error: string | null }>(
      "SELECT symbol, fundamentals_checked_at IS NOT NULL AS checked, fundamentals_error AS error FROM instruments ORDER BY symbol",
    );
    assert.deepEqual(rows.rows.map((r) => [r.symbol, r.checked, Boolean(r.error)]), [
      ["ASML.AS", false, true],
      ["KO", true, false],
      ["RY.TO", false, true],
    ]);
    const retry = await refreshFundamentals(db, fakeSec().source, { nowMs: NOW + 60_000 });
    assert.deepEqual([retry.checked, retry.covered, retry.errors.length], [2, 2, 0]);
  });

  it("a companyfacts 404 (CIK in the map, no XBRL facts) is not covered, not an error", async () => {
    await seed(["KO"]);
    // BRK-B's CIK is in the ticker subset but has no companyfacts fixture → 404.
    await pg.exec(`UPDATE holdings SET symbol = 'BRK-B'; INSERT INTO instruments (symbol, name, exchange, region, currency)
      VALUES ('BRK-B', 'Berkshire Hathaway Inc.', 'NYSE', 'US', 'USD')`);
    const s = await refreshFundamentals(db, fakeSec().source, { nowMs: NOW });
    assert.deepEqual([s.notCovered, s.errors.length], [1, 0]);
  });

  it("the daily run includes fundamentals; a fundamentals error makes it partial, never failed", async () => {
    await seed(["KO", "ASML.AS"]);
    const provider: DailyCloseProvider = {
      id: "fake",
      supports: () => true,
      budget: { perMinute: 60, perDay: 100 },
      getCloses: async (symbols) => symbols.map((symbol) => ({ symbol, date: "2026-10-02", close: 1, currency: symbol === "KO" ? "USD" : "EUR", source: "fake" })),
      getCorporateActions: async () => [],
    };
    const sec = fakeSec({ fail: { [CIK.ASML]: 503 } });
    const run = await runDailyRefresh(db, provider, { trigger: "cron", now: () => NOW, fundamentals: sec.source });
    assert.equal(run.status, "partial");
    assert.ok("fundamentals" in run && run.fundamentals);
    assert.deepEqual(publicSummary(run), {
      status: "partial",
      runDate: "2026-10-02",
      symbols: 2,
      inserted: 2,
      actions: 0,
      errors: 0,
      deferred: 0,
      fxInserted: 0,
      fxErrors: 0,
      fundamentalsChecked: 1,
      fundamentalsErrors: 1,
      fundamentalsSkipped: false,
    });
    const skipped = await runDailyRefresh(db, provider, { trigger: "cron", now: () => NOW + 86_400_000, fundamentals: null });
    assert.equal(publicSummary(skipped).fundamentalsSkipped, true, "ASML.AS still due, no contact → skipped");
  });
});

// ------------------------------------------------------------------ DASH-21

describe("DASH-21: a holding without SEC coverage reads “not covered” in every metric cell", () => {
  it("not covered → not_covered metric_values for all metric keys; covered → none; unchecked → pending", async () => {
    await seed(["KO", "MC.PA", "ATD.TO", "RY.TO"]);
    await refreshFundamentals(db, fakeSec().source, { nowMs: NOW, only: ["KO", "MC.PA", "ATD.TO"] });
    const views = await metricViews(db, ["KO", "MC.PA", "ATD.TO", "RY.TO"]);
    for (const s of ["MC.PA", "ATD.TO"]) {
      assert.equal(views[s].coverage, "not_covered");
      assert.deepEqual(Object.keys(views[s].metrics).sort(), [...METRIC_KEYS].sort());
      assert.ok(Object.values(views[s].metrics).every((m) => m.status === "not_covered" && m.value === null));
    }
    assert.equal(views.KO.coverage, "covered");
    // T09: a covered symbol gets its revenue metrics computed right after the ingest.
    assert.deepEqual(Object.keys(views.KO.metrics).sort(), ["eps_1y", "rev_cagr_10y", "rev_cagr_3y", "rev_cagr_5y", "rev_g_1y", "roic_1y"]);
    assert.deepEqual(views["RY.TO"], { coverage: "pending", metrics: {} });
  });

  it("the page data carries coverage per symbol and the cell component renders “—” + “not covered”", async () => {
    await seed(["KO", "MC.PA"]);
    await refreshFundamentals(db, fakeSec().source, { nowMs: NOW });
    await pg.query("INSERT INTO user_metric_columns (user_id, metric_key, position) VALUES ($1, 'roic_1y', 0), ($1, 'rev_g_1y', 1)", [USER]);
    const d = await loadDashboardHoldings(db, USER, { previewRefresh: false, nowMs: NOW });
    assert.deepEqual(d.metricColumns, ["roic_1y", "rev_g_1y"]);
    assert.equal(d.metrics["MC.PA"].coverage, "not_covered");
    assert.equal(d.metrics.KO.coverage, "covered");
    const cell = readFileSync("src/components/dashboard/metric-columns.tsx", "utf8");
    assert.match(cell, /view\?\.coverage === "not_covered"\s*\?\s*"not_covered"/);
    assert.match(readFileSync("src/lib/dashboard/metrics.ts", "utf8"), /not_covered: "not covered"/);
    assert.match(cell, /—<span className="ml-1 text-xs">\{reason\}<\/span>/);
  });

  it("pages read stored data only: no SEC call on the page path", () => {
    for (const f of ["src/lib/dashboard/valuation.server.ts", "src/lib/dashboard/gate.ts", "src/routes/dashboard.tsx", "src/components/dashboard/metric-columns.tsx"]) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /sec\.gov|createSecFundamentalsSource|secSourceFromEnv|refreshFundamentals/, f);
    }
  });
});

// ------------------------------------------------------------------ DASH-15

describe("DASH-15: the metric column picker persists per user (add, remove, reorder)", () => {
  const USERS: Record<string, { id: string; email: string }> = {
    diego: { id: USER, email: "d@example.com" },
    other: { id: OTHER, email: "o@example.com" },
  };
  const call = (opts: { method?: string; as?: string; body?: unknown; query?: string; env?: Record<string, string | undefined> } = {}) =>
    handleColumnsRequest(
      new Request(`http://localhost/api/dashboard/columns${opts.query ?? ""}`, {
        method: opts.method ?? "GET",
        headers: { ...(opts.as ? { "x-test-session": opts.as } : {}), "content-type": "application/json" },
        body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
      }),
      {
        env: opts.env ?? { DASHBOARD_ENABLED: "true" },
        getUser: async (h) => USERS[h.get("x-test-session") ?? ""] ?? null,
        getDb: async () => db,
      },
    );
  const put = (columns: unknown, as = "diego") => call({ method: "PUT", as, body: { columns } });
  const get = async (as = "diego") => ((await (await call({ as })).json()) as { columns: string[] }).columns;

  it("starts empty and lists every available metric", async () => {
    await seed([]);
    const res = await call({ as: "diego" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { columns: [], available: METRICS });
  });

  it("add, reorder and remove persist across requests and the page load, per user", async () => {
    await seed([]);
    assert.equal((await put(["rev_g_1y"])).status, 200);
    assert.deepEqual(await get(), ["rev_g_1y"]);
    await put(["rev_g_1y", "roic_1y", "eps_1y"]);
    assert.deepEqual(await get(), ["rev_g_1y", "roic_1y", "eps_1y"]);
    await put(["eps_1y", "rev_g_1y", "roic_1y"]);
    assert.deepEqual(await get(), ["eps_1y", "rev_g_1y", "roic_1y"]);
    await put(["eps_1y", "roic_1y"]);
    assert.deepEqual(await get(), ["eps_1y", "roic_1y"]);
    assert.deepEqual(await get("other"), [], "another user's columns are separate");
    await put(["gross_margin_1y"], "other");
    assert.deepEqual(await get(), ["eps_1y", "roic_1y"]);
    const page = await loadDashboardHoldings(db, USER, { previewRefresh: false, nowMs: NOW });
    assert.deepEqual(page.metricColumns, ["eps_1y", "roic_1y"]);
    await put([]);
    assert.deepEqual(await get(), []);
  });

  it("400 for unknown or repeated keys or a bad body; nothing changes", async () => {
    await seed([]);
    await put(["roic_1y"]);
    for (const [body, msg] of [
      [{ columns: ["roic_1y", "buy_score"] }, "Unknown metric column: buy_score."],
      [{ columns: ["roic_1y", "roic_1y"] }, "Each metric column can be added once."],
      [{ columns: "roic_1y" }, "columns must be a list of metric keys."],
      ["not json", "Body must be JSON."],
    ] as const) {
      const res = await call({ method: "PUT", as: "diego", body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(await res.json(), { error: msg });
    }
    assert.deepEqual(await get(), ["roic_1y"]);
  });

  it("404 flag off, 405 other methods, 401 signed out, 403 naming another user", async () => {
    await seed([]);
    assert.equal((await call({ as: "diego", env: {} })).status, 404);
    const post = await call({ method: "POST", as: "diego", body: { columns: [] } });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD, PUT");
    assert.equal((await call({})).status, 401);
    assert.equal((await call({ method: "PUT", body: { columns: [] } })).status, 401);
    assert.equal((await call({ as: "diego", query: `?userId=${OTHER}` })).status, 403);
    assert.equal((await call({ method: "PUT", as: "diego", body: { columns: [], userId: OTHER } })).status, 403);
  });
});
