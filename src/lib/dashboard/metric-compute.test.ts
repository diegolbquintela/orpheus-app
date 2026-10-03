// Offline tests for T09 (#17): revenue growth 1y and revenue CAGR 3y/5y/10y (spec §8, DASH-16), from the
// recorded SEC fixtures (test-fixtures/sec, live 2026-10-02) through the T08 ingest into PGLite. No network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { createSecFundamentalsSource, metricViews, refreshFundamentals, SEC_TICKERS_URL, type SecGet } from "./fundamentals.server.ts";
import { computeStoredMetrics, fiscalYearBack, revenueGrowth } from "./metric-compute.server.ts";
import { STATUS_REASON } from "./metrics.ts";
import type { Queryable } from "./store.server.ts";

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
const CIKS = ["0000021344", "0000937966", "0001000275", "0001594805", "0000313216"];
const get: SecGet = async (url) => {
  if (url.includes("/submissions/")) {
    const cik = url.match(/CIK(\d{10})\.json$/)?.[1];
    return ["0000021344", "0001000275"].includes(cik ?? "")
      ? { status: 200, text: readFileSync(`${FIX}/submissions-CIK${cik}-2026-10-03-subset.json`, "utf8") }
      : { status: 404, text: "" };
  }
  if (url === SEC_TICKERS_URL) return { status: 200, text: readFileSync(`${FIX}/company_tickers_exchange-2026-10-02-subset.json`, "utf8") };
  const cik = url.match(/CIK(\d{10})\.json$/)?.[1];
  return cik && CIKS.includes(cik)
    ? { status: 200, text: readFileSync(`${FIX}/companyfacts-CIK${cik}-2026-10-02-subset.json`, "utf8") }
    : { status: 404, text: "" };
};
const source = () => createSecFundamentalsSource({ userAgent: "test (t@example.com)", get, minIntervalMs: 0 });
const NOW = Date.UTC(2026, 9, 3, 12, 0);

async function ingest() {
  await pg.exec(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('u1', 'U', 'u@example.com', false);
    INSERT INTO instruments (symbol, name, exchange, region, currency) VALUES
      ('KO', 'The Coca-Cola Company', 'NYSE', 'US', 'USD'), ('PHG', 'Koninklijke Philips N.V.', 'NYSE', 'US', 'USD'),
      ('RY.TO', 'Royal Bank of Canada', 'Toronto', 'CA', 'CAD'), ('ASML.AS', 'ASML Holding N.V.', 'Amsterdam', 'EU', 'EUR'),
      ('MC.PA', 'LVMH Moët Hennessy Louis Vuitton, Société Européenne', 'Paris', 'EU', 'EUR');
    INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('u1', 'KO', 1, 1), ('u1', 'PHG', 1, 1),
      ('u1', 'RY.TO', 1, 1), ('u1', 'ASML.AS', 1, 1), ('u1', 'MC.PA', 1, 1);`);
  return refreshFundamentals(db, source(), { nowMs: NOW });
}
beforeEach(async () => {
  await pg.exec(`DELETE FROM holdings; DELETE FROM instruments; DELETE FROM fundamentals_annual; DELETE FROM metric_values; DELETE FROM "user";`);
});

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const stored = async (symbol: string) => (await metricViews(db, [symbol]))[symbol].metrics;

describe("DASH-16: revenue growth and CAGR match a hand calculation from SEC companyfacts", () => {
  it("KO (tags stitched: FY2015 SalesRevenueGoodsNet → Revenues): 1y, 3y, 5y, 10y", async () => {
    await ingest();
    const m = await stored("KO");
    // Hand values from test-fixtures/sec/companyfacts-CIK0000021344 (USD): FY2025 47,941,000,000;
    // FY2024 47,061,000,000; FY2022 43,004,000,000; FY2020 33,014,000,000; FY2015 44,294,000,000 (SalesRevenueGoodsNet).
    const hand = {
      rev_g_1y: 47941 / 47061 - 1, // 0.018699…  → 1.9%
      rev_cagr_3y: (47941 / 43004) ** (1 / 3) - 1, // 0.036889… → 3.7%
      rev_cagr_5y: (47941 / 33014) ** (1 / 5) - 1, // 0.077475… → 7.7%
      rev_cagr_10y: (47941 / 44294) ** (1 / 10) - 1, // 0.007943… → 0.8%
    };
    for (const [k, v] of Object.entries(hand)) {
      assert.equal(m[k].status, "ok", k);
      assert.equal(m[k].fiscalYearEnd, "2025-12-31");
      assert.ok(close(Number(m[k].value), v), `${k}: ${m[k].value} vs ${v}`);
    }
    assert.equal((Number(m.rev_g_1y.value) * 100).toFixed(1), "1.9");
    assert.equal((Number(m.rev_cagr_3y.value) * 100).toFixed(1), "3.7");
    assert.equal((Number(m.rev_cagr_5y.value) * 100).toFixed(1), "7.7");
    assert.equal((Number(m.rev_cagr_10y.value) * 100).toFixed(1), "0.8");
    const base = await pg.query<{ source_tag: string }>("SELECT source_tag FROM fundamentals_annual WHERE symbol = 'KO' AND concept = 'revenue' AND fiscal_year_end = '2015-12-31'");
    assert.equal(base.rows[0].source_tag, "us-gaap:SalesRevenueGoodsNet", "the 10y base comes from the older tag");
  });

  it("Philips (ifrs-full:Revenue, EUR): negative growth shown as a negative value", async () => {
    await ingest();
    const m = await stored("PHG");
    // FY2025 17,834; FY2024 18,021; FY2022 17,827; FY2020 17,313; FY2015 16,806 (EUR millions).
    assert.ok(close(Number(m.rev_g_1y.value), 17834 / 18021 - 1)); // −1.04%
    assert.ok(Number(m.rev_g_1y.value) < 0);
    assert.ok(close(Number(m.rev_cagr_3y.value), (17834 / 17827) ** (1 / 3) - 1));
    assert.ok(close(Number(m.rev_cagr_5y.value), (17834 / 17313) ** (1 / 5) - 1));
    assert.ok(close(Number(m.rev_cagr_10y.value), (17834 / 16806) ** (1 / 10) - 1));
    assert.equal((Number(m.rev_g_1y.value) * 100).toFixed(1), "-1.0");
  });

  it("RY (FYE 31 Oct, 9 years stored): 10y is insufficient history; 1y/3y/5y are values", async () => {
    await ingest();
    const m = await stored("RY.TO");
    assert.deepEqual(m.rev_cagr_10y, { value: null, status: "insufficient_history", fiscalYearEnd: "2025-10-31", currency: null });
    assert.equal(STATUS_REASON[m.rev_cagr_10y.status], "insufficient history");
    assert.ok(close(Number(m.rev_g_1y.value), 66605 / 57344 - 1));
    assert.ok(close(Number(m.rev_cagr_5y.value), (66605 / 47181) ** (1 / 5) - 1));
  });

  it("a negative or zero base (or FY0) is not meaningful; a missing FY−1 is n/m, a missing FY−n is insufficient history", () => {
    const series = (vals: [string, number][]) => vals.map(([fiscalYearEnd, value]) => ({ fiscalYearEnd, value }));
    const fy = (y: number) => `${y}-12-31`;
    const full = (base: number) => series([[fy(2015), base], [fy(2020), base], [fy(2022), base], [fy(2024), base], [fy(2025), 100]]);
    for (const base of [0, -50]) {
      const r = revenueGrowth(full(base), fy(2025));
      assert.deepEqual(r.map((x) => x.status), ["n/m", "n/m", "n/m", "n/m"], `base ${base}`);
      assert.ok(r.every((x) => x.value === null));
    }
    assert.equal(STATUS_REASON["n/m"], "not meaningful");
    const negNow = revenueGrowth(series([[fy(2024), 100], [fy(2025), -1]]), fy(2025));
    assert.deepEqual(negNow.map((x) => x.status), ["n/m", "n/m", "n/m", "n/m"]);
    const gaps = revenueGrowth(series([[fy(2023), 80], [fy(2025), 100]]), fy(2025));
    assert.deepEqual(gaps.map((x) => x.status), ["n/m", "insufficient_history", "insufficient_history", "insufficient_history"]);
    // FY0 is the company's latest fiscal year (any concept): revenue missing there → n/m, not an older year.
    assert.deepEqual(revenueGrowth(series([[fy(2023), 90], [fy(2024), 100]]), fy(2025)).map((x) => x.status), ["n/m", "n/m", "n/m", "n/m"]);
    assert.deepEqual(revenueGrowth([], null).map((x) => x.status), ["n/m", "n/m", "n/m", "n/m"]);
  });

  it("fiscal-year alignment: FY−n is the stored year end n years back, ± 45 days (52/53-week years)", () => {
    assert.equal(fiscalYearBack(["2022-12-30", "2023-12-29", "2024-12-27"], "2025-12-26", 1), "2024-12-27");
    assert.equal(fiscalYearBack(["2022-12-30"], "2025-12-26", 3), "2022-12-30");
    assert.equal(fiscalYearBack(["2024-06-30"], "2025-12-31", 1), null, "a changed year end far off is not FY−1");
    assert.equal(fiscalYearBack(["2023-02-28"], "2024-02-29", 1), "2023-02-28");
    const r = revenueGrowth([{ fiscalYearEnd: "2024-12-27", value: 100 }, { fiscalYearEnd: "2025-12-26", value: 110 }], "2025-12-26");
    assert.ok(close(r[0].value!, 0.1));
  });

  it("not covered symbols keep “not covered”; metrics are recomputed for covered symbols stored before T09", async () => {
    await ingest();
    const mc = await stored("MC.PA");
    assert.ok(["rev_g_1y", "rev_cagr_10y"].every((k) => mc[k].status === "not_covered"));
    // Simulate facts ingested by T08 (no metric rows yet): the next run fills them without any SEC call.
    await pg.exec("DELETE FROM metric_values WHERE symbol = 'KO'");
    const calls: string[] = [];
    const s = await refreshFundamentals(
      db,
      createSecFundamentalsSource({ userAgent: "t (t@example.com)", minIntervalMs: 0, get: async (u, h) => (calls.push(u), get(u, h)) }),
      { nowMs: NOW + 60_000 },
    );
    assert.equal(s.computed, 1);
    assert.deepEqual(calls, [], "within 7 days: no SEC request, metrics from stored facts");
    assert.equal((await stored("KO")).rev_g_1y.status, "ok");
    const offline = await refreshFundamentals(db, null, { nowMs: NOW + 120_000 });
    assert.equal(offline.computed, 0, "nothing missing any more");
  });

  it("computeStoredMetrics stores fractions with 12 significant digits and the FY0 date", async () => {
    await ingest();
    const out = await computeStoredMetrics(db, "ASML.AS");
    const row = await pg.query<{ value: string; fiscal_year_end: string }>(
      "SELECT value::text, fiscal_year_end FROM metric_values WHERE symbol = 'ASML.AS' AND metric_key = 'rev_g_1y'",
    );
    assert.equal(row.rows[0].value, (32667300000 / 28262900000 - 1).toPrecision(12));
    assert.equal(row.rows[0].fiscal_year_end, "2025-12-31");
    assert.equal(out.length, 6, "4 revenue metrics + ROIC (T10) + EPS (T11)");
  });

  it("the metric cell renders ok values as a percent and has no rating wording", () => {
    const cell = readFileSync("src/components/dashboard/metric-columns.tsx", "utf8");
    assert.match(cell, /\(v \* 100\)\.toFixed\(1\)\}%/);
    assert.doesNotMatch(readFileSync("src/lib/dashboard/metric-compute.server.ts", "utf8"), /\b(buy|sell|score|rating|strong|weak)\b/i);
  });
});

// ------------------------------------------------------------------ T10 (#18): ROIC (1y)

import { investedCapital, roic, roicTaxRate, type FactTable } from "./metric-compute.server.ts";
import { METRIC_HELP } from "./metrics.ts";

const table = (rows: Record<string, Record<string, number>>): FactTable =>
  new Map(Object.entries(rows).map(([fye, f]) => [fye, new Map(Object.entries(f))]));

describe("DASH-17: ROIC (1y) per spec §8", () => {
  it("KO hand check from the SEC fixtures (FY2025, USD)", async () => {
    await ingest();
    const m = await stored("KO");
    // Operating income 13,762; tax 2,861 / pre-tax 15,998 = 17.88% (inside 0–50%).
    const nopat = 13762 * (1 - 2861 / 15998); // 11,300.93
    // Invested capital = equity incl. NCI + commercial paper + other short-term borrowings
    //   + long-term debt incl. current maturities (LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities) − cash.
    const ic2025 = 34275 + 1495 + 56 + 43941 - 10270; // 69,497
    const ic2024 = 26372 + 1139 + 360 + 43023 - 10828; // 60,066
    const hand = nopat / ((ic2025 + ic2024) / 2); // 0.17445 → 17.4%
    assert.equal(m.roic_1y.status, "ok");
    assert.equal(m.roic_1y.fiscalYearEnd, "2025-12-31");
    assert.ok(close(Number(m.roic_1y.value), hand), `${m.roic_1y.value} vs ${hand}`);
    assert.equal((Number(m.roic_1y.value) * 100).toFixed(1), "17.4");
    const sic = await pg.query<{ sic: number | null }>("SELECT sic FROM instruments WHERE symbol = 'KO'");
    assert.equal(sic.rows[0].sic, 2080, "SIC from the recorded filer profile");
  });

  it("Philips (IFRS: short-term borrowings + current/non-current borrowings)", async () => {
    await ingest();
    const m = await stored("PHG");
    const ic2025 = 10990 + 52 + 1098 + 6934 - 2794;
    const ic2024 = 12043 + 92 + 434 + 7113 - 2401;
    assert.ok(close(Number(m.roic_1y.value), (1424 * (1 - 282 / 1182)) / ((ic2025 + ic2024) / 2)));
  });

  it("a bank (RY: SIC 6029, no operating income) shows not meaningful", async () => {
    await ingest();
    const m = await stored("RY.TO");
    assert.deepEqual(m.roic_1y, { value: null, status: "n/m", fiscalYearEnd: "2025-10-31", currency: null });
    assert.equal(STATUS_REASON[m.roic_1y.status], "not meaningful");
    const sic = await pg.query<{ sic: number | null }>("SELECT sic FROM instruments WHERE symbol = 'RY.TO'");
    assert.equal(sic.rows[0].sic, 6029);
  });

  const base = {
    "2024-12-31": { equity_incl_nci: 100, long_term_debt: 50, cash: 30 },
    "2025-12-31": { operating_income: 20, pretax_income: 18, income_tax: 4.5, equity_incl_nci: 110, long_term_debt: 40, cash: 20 },
  };
  it("negative ROIC is a real value; SIC 6000–6399 is n/m even with operating income", () => {
    const neg = roic(table({ ...base, "2025-12-31": { ...base["2025-12-31"], operating_income: -10 } }), "2025-12-31", 2080);
    assert.equal(neg.status, "ok");
    assert.ok(close(neg.value!, (-10 * (1 - 0.25)) / 125));
    assert.ok(neg.value! < 0);
    for (const sic of [6000, 6311, 6399]) assert.equal(roic(table(base), "2025-12-31", sic).status, "n/m", String(sic));
    assert.equal(roic(table(base), "2025-12-31", 6500).status, "ok", "real estate (65xx) is not excluded");
  });

  it("n/m when average invested capital ≤ 0 or FY0 has no operating income / equity; insufficient history without FY−1", () => {
    const cashRich = table({
      "2024-12-31": { equity_incl_nci: 10, cash: 30 },
      "2025-12-31": { operating_income: 5, equity_incl_nci: 10, cash: 10 },
    });
    assert.equal(roic(cashRich, "2025-12-31", null).status, "n/m", "average (−20 + 0) / 2 ≤ 0");
    const { operating_income: _oi, ...noOi } = base["2025-12-31"];
    void _oi;
    assert.equal(roic(table({ ...base, "2025-12-31": noOi }), "2025-12-31", null).status, "n/m");
    assert.equal(roic(table({ "2025-12-31": base["2025-12-31"] }), "2025-12-31", null).status, "insufficient_history");
    assert.equal(roic(table({ "2024-12-31": { cash: 1 }, "2025-12-31": base["2025-12-31"] }), "2025-12-31", null).status, "insufficient_history");
    assert.equal(roic(new Map(), null, null).status, "n/m");
  });

  it("tax rate: clamped to 0–50%, 25% when pre-tax ≤ 0 or tax/pre-tax missing", () => {
    assert.deepEqual(roicTaxRate(4.5, 18), { rate: 0.25, fallback: false });
    assert.deepEqual(roicTaxRate(963, 123), { rate: 0.5, fallback: false }, "Philips FY2024: 783% → 50%");
    assert.deepEqual(roicTaxRate(-5, 100), { rate: 0, fallback: false });
    assert.deepEqual(roicTaxRate(10, -5), { rate: 0.25, fallback: true });
    assert.deepEqual(roicTaxRate(undefined, 100), { rate: 0.25, fallback: true });
    assert.deepEqual(roicTaxRate(10, undefined), { rate: 0.25, fallback: true });
    const r = roic(table(base), "2025-12-31", null);
    assert.ok(close(r.value!, (20 * (1 - 0.25)) / ((130 + 120) / 2)));
  });

  it("invested capital: NCI total else parent equity; short-term borrowings else CP + other; LTD total else parts; IFRS current total", () => {
    assert.equal(investedCapital(new Map(Object.entries({ equity_parent: 100, long_term_debt_current: 5, long_term_debt_noncurrent: 20, cash: 10 }))), 115);
    assert.equal(investedCapital(new Map(Object.entries({ equity_incl_nci: 100, equity_parent: 90, short_term_borrowings: 7, commercial_paper: 3, cash: 0 }))), 107);
    assert.equal(investedCapital(new Map(Object.entries({ equity_incl_nci: 100, commercial_paper: 3, other_short_term_borrowings: 2 }))), 105);
    assert.equal(investedCapital(new Map(Object.entries({ equity_incl_nci: 100, current_borrowings_total: 9, long_term_debt_noncurrent: 20, cash: 4 }))), 125);
    assert.equal(investedCapital(new Map(Object.entries({ cash: 4 }))), null);
  });

  it("the tooltip states the formula, the tax rule and the 25% fallback; no rating wording", () => {
    const h = METRIC_HELP.roic_1y!;
    for (const part of ["NOPAT", "average invested capital", "0–50%", "25%", "Leases excluded", "banks and insurers"]) assert.ok(h.includes(part), part);
    assert.doesNotMatch(h, /\b(buy|sell|good|bad|score|rating|strong|weak)\b/i);
    assert.match(readFileSync("src/components/dashboard/holdings.tsx", "utf8"), /title=\{METRIC_HELP\[key as MetricKey\]\}/);
  });
});

// ------------------------------------------------------------------ T10 QA (#37): F1, F2

import { annualFactsFromCompanyFacts, FUNDAMENTALS_PARSER_VERSION } from "./fundamentals.server.ts";

describe("QA F1: debt tags rank before the filing date (lease-inclusive tags are a fallback only)", () => {
  const ko = annualFactsFromCompanyFacts(JSON.parse(readFileSync(`${FIX}/companyfacts-CIK0000021344-2026-10-02-subset.json`, "utf8")));
  const at = (concept: string, fye: string) => ko.find((f) => f.concept === concept && f.fiscalYearEnd === fye);
  it("KO FY2023: LongTermDebt* (filed 2024-02-20) wins over the lease-inclusive tag filed 2025-02-20", () => {
    for (const [concept, tag] of [
      ["long_term_debt", "us-gaap:LongTermDebt"],
      ["long_term_debt_current", "us-gaap:LongTermDebtCurrent"],
      ["long_term_debt_noncurrent", "us-gaap:LongTermDebtNoncurrent"],
    ]) {
      const f = at(concept, "2023-12-31")!;
      assert.equal(f.sourceTag, tag, concept);
      assert.equal(f.filed, "2024-02-20", concept);
    }
  });
  it("KO FY2024/FY2025 (no lease-excluded tag): the fallback is used", () => {
    assert.equal(at("long_term_debt", "2024-12-31")?.sourceTag, "us-gaap:LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities");
    assert.equal(at("long_term_debt", "2025-12-31")?.value, "43941000000");
  });
  it("revenue keeps most-recent-filing stitching (not rank-first)", () => {
    assert.equal(at("revenue", "2016-12-31")?.sourceTag, "us-gaap:Revenues");
  });
  it("the tooltip mentions the fallback", () => {
    assert.match(METRIC_HELP.roic_1y!, /finance leases is used only when/);
  });
});

describe("QA F2: rows from an older parser are refetched and never yield a metric from partial inputs", () => {
  /** KO as #35/#36 stored it on the shared database: parser v1 (null), no long-term debt rows for FY2024/25. */
  async function oldKo() {
    await ingest();
    await pg.exec(`DELETE FROM fundamentals_annual WHERE symbol = 'KO' AND concept LIKE 'long_term_debt%' AND fiscal_year_end >= '2024-01-01';
      UPDATE instruments SET fundamentals_parser_version = NULL, fundamentals_checked_at = '2026-10-03T00:00:00Z' WHERE symbol = 'KO';
      UPDATE metric_values SET value = 0.5306, status = 'ok' WHERE symbol = 'KO' AND metric_key = 'roic_1y';`);
  }
  it("an old stored KO shows insufficient data (not 53.1%) until the refetch, without SEC calls", async () => {
    await oldKo();
    const s = await refreshFundamentals(db, null, { nowMs: NOW + 60_000 });
    assert.equal(s.computed, 1);
    const m = await stored("KO");
    assert.deepEqual([m.roic_1y.status, m.roic_1y.value], ["insufficient_data", null]);
    assert.equal(STATUS_REASON.insufficient_data, "insufficient data");
    assert.equal(m.rev_g_1y.status, "ok", "revenue metrics don't need the newer parser");
  });
  it("the next run refetches it inside the 7-day window and stores the new fields → 17.4%", async () => {
    await oldKo();
    const calls: string[] = [];
    const s = await refreshFundamentals(
      db,
      createSecFundamentalsSource({ userAgent: "t (t@example.com)", minIntervalMs: 0, get: async (u, h) => (calls.push(u), get(u, h)) }),
      { nowMs: NOW + 60_000 },
    );
    assert.ok(calls.some((u) => u.endsWith("CIK0000021344.json") && u.includes("companyfacts")), "KO refetched");
    assert.equal(s.errors.length, 0);
    const ltd = await pg.query<{ value: string }>("SELECT value::text FROM fundamentals_annual WHERE symbol = 'KO' AND concept = 'long_term_debt' AND fiscal_year_end = '2025-12-31'");
    assert.equal(ltd.rows[0]?.value, "43941000000");
    const v = await pg.query<{ v: number }>("SELECT fundamentals_parser_version AS v FROM instruments WHERE symbol = 'KO'");
    assert.equal(v.rows[0].v, FUNDAMENTALS_PARSER_VERSION);
    assert.equal((Number((await stored("KO")).roic_1y.value) * 100).toFixed(1), "17.4");
    const again: string[] = [];
    await refreshFundamentals(
      db,
      createSecFundamentalsSource({ userAgent: "t (t@example.com)", minIntervalMs: 0, get: async (u, h) => (again.push(u), get(u, h)) }),
      { nowMs: NOW + 120_000 },
    );
    assert.deepEqual(again, [], "current parser: back to the 7-day window");
  });
  it("a debt or cash line reported in other years but missing at FY0/FY−1 → insufficient data; never reported → 0", () => {
    const t = table({
      "2023-12-31": { equity_incl_nci: 90, long_term_debt: 40, cash: 10 },
      "2024-12-31": { equity_incl_nci: 100, long_term_debt: 50, cash: 30 },
      "2025-12-31": { operating_income: 20, pretax_income: 18, income_tax: 4.5, equity_incl_nci: 110, cash: 20 },
    });
    assert.equal(roic(t, "2025-12-31", null).status, "insufficient_data", "FY2025 long-term debt missing");
    const noDebtEver = table({
      "2024-12-31": { equity_incl_nci: 100, cash: 30 },
      "2025-12-31": { operating_income: 20, pretax_income: 18, income_tax: 4.5, equity_incl_nci: 110, cash: 20 },
    });
    const r = roic(noDebtEver, "2025-12-31", null);
    assert.equal(r.status, "ok");
    assert.ok(close(r.value!, (20 * 0.75) / ((70 + 90) / 2)));
  });
});

describe("QA: holdings delete fires once", () => {
  it("the row guards a second click and treats 404 (already deleted) as done", () => {
    const src = readFileSync("src/components/dashboard/holdings.tsx", "utf8");
    assert.match(src, /if \(deleting\.current\) return;/);
    assert.match(src, /send\(`\/api\/dashboard\/holdings\/\$\{holding\.id\}`, "DELETE", undefined, \[404\]\)/);
  });
});

// ------------------------------------------------------------------ T10 QA re-check: atomic replace

import { replaceFundamentals } from "./fundamentals.server.ts";

describe("the refetch replaces a symbol's rows atomically", () => {
  const rows = async () =>
    (await pg.query<{ k: string }>("SELECT fiscal_year_end || ' ' || concept || ' ' || value::text AS k FROM fundamentals_annual WHERE symbol = 'KO' ORDER BY 1")).rows.map((r) => r.k);
  const fact = (fye: string, concept: string, value: string) => ({ fiscalYearEnd: fye, concept, value, unit: "USD", sourceTag: "t", accession: "a", filed: "2026-01-01" });

  it("a value that fails mid-way leaves the old rows exactly as they were", async () => {
    await ingest();
    const before = await rows();
    assert.ok(before.length > 50);
    await assert.rejects(replaceFundamentals(db, "KO", [fact("2025-12-31", "revenue", "1"), fact("2026-12-31", "revenue", "not-a-number")]));
    assert.deepEqual(await rows(), before);
  });

  it("a successful replace upserts the new set and drops rows not in it", async () => {
    await ingest();
    await replaceFundamentals(db, "KO", [fact("2024-12-31", "revenue", "2"), fact("2025-12-31", "revenue", "3")]);
    assert.deepEqual(await rows(), ["2024-12-31 revenue 2", "2025-12-31 revenue 3"]);
  });

  it("through the job: a source returning a bad fact records an error and keeps the stored rows and metrics", async () => {
    await ingest();
    const before = await rows();
    const metricsBefore = await stored("KO");
    await pg.exec("UPDATE instruments SET fundamentals_parser_version = NULL WHERE symbol = 'KO'");
    const bad = {
      id: "sec" as const,
      resolve: async () => ({ id: "0000021344", name: "COCA COLA CO" }),
      annualFacts: async () => [fact("2025-12-31", "revenue", "1"), fact("2026-12-31", "revenue", "oops")],
    };
    const s = await refreshFundamentals(db, bad, { nowMs: NOW + 60_000, only: ["KO"] });
    assert.deepEqual(s.errors.map((e) => e.symbol), ["KO"]);
    assert.deepEqual(await rows(), before);
    assert.equal((await stored("KO")).rev_g_1y.value, metricsBefore.rev_g_1y.value);
  });
});

// ------------------------------------------------------------------ T11 (#19): EPS (1y)

import { eps, epsCurrency } from "./metric-compute.server.ts";
import { formatEps } from "./format.ts";

describe("DASH-18: EPS (1y) = FY0 diluted EPS from companyfacts, with its reporting currency", () => {
  it("KO hand check: FY2025 EarningsPerShareDiluted 3.04 USD/shares → “3.04 USD”", async () => {
    await ingest();
    const m = await stored("KO");
    assert.equal(m.eps_1y.status, "ok");
    assert.equal(Number(m.eps_1y.value), 3.04);
    assert.equal(m.eps_1y.fiscalYearEnd, "2025-12-31");
    assert.equal(m.eps_1y.currency, "USD");
    assert.equal(formatEps(Number(m.eps_1y.value), m.eps_1y.currency), "3.04 USD");
    const src = await pg.query<{ source_tag: string; unit: string }>(
      "SELECT source_tag, unit FROM fundamentals_annual WHERE symbol = 'KO' AND concept = 'eps_diluted' AND fiscal_year_end = '2025-12-31'",
    );
    assert.deepEqual(src.rows[0], { source_tag: "us-gaap:EarningsPerShareDiluted", unit: "USD/shares" });
  });

  it("IFRS and non-USD filers: Philips 0.93 EUR (ifrs-full), RY 14.07 CAD (banks have EPS), ASML 24.71 EUR (US GAAP in EUR)", async () => {
    await ingest();
    const show = async (s: string) => {
      const m = (await stored(s)).eps_1y;
      return [m.status, formatEps(Number(m.value), m.currency)];
    };
    assert.deepEqual(await show("PHG"), ["ok", "0.93 EUR"]);
    assert.deepEqual(await show("RY.TO"), ["ok", "14.07 CAD"]);
    assert.deepEqual(await show("ASML.AS"), ["ok", "24.71 EUR"]);
  });

  it("missing diluted EPS at FY0 → n/m (basic EPS is never substituted); negative EPS is a value; odd unit → insufficient data", () => {
    assert.deepEqual(eps("2025-12-31", undefined), { key: "eps_1y", value: null, status: "n/m", fiscalYearEnd: "2025-12-31" });
    assert.equal(eps(null, undefined).status, "n/m");
    assert.deepEqual(eps("2025-12-31", { value: -0.75, unit: "EUR/shares" }), { key: "eps_1y", value: -0.75, status: "ok", fiscalYearEnd: "2025-12-31" });
    assert.equal(eps("2025-12-31", { value: 1.2, unit: "pure" }).status, "insufficient_data");
    assert.equal(epsCurrency("USD/shares"), "USD");
    assert.equal(epsCurrency("shares"), null);
    // A filer that tags only basic EPS stores no eps_diluted row at all.
    const basicOnly = annualFactsFromCompanyFacts({
      facts: {
        "us-gaap": {
          Revenues: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 10, accn: "a", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }] } },
          EarningsPerShareBasic: { units: { "USD/shares": [{ start: "2025-01-01", end: "2025-12-31", val: 1.5, accn: "a", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }] } },
        },
      },
    } as never);
    assert.equal(basicOnly.filter((f) => f.concept === "eps_diluted").length, 0);
  });

  it("splits: FY0's figure comes from the most recent filing (a 10-K/A restating FY0 after a split wins)", () => {
    const f = (val: number, form: string, filed: string) => ({ start: "2025-01-01", end: "2025-12-31", val, accn: filed, fy: 2025, fp: "FY", form, filed });
    const rows = annualFactsFromCompanyFacts({
      facts: { "us-gaap": { EarningsPerShareDiluted: { units: { "USD/shares": [f(10, "10-K", "2026-02-01"), f(5, "10-K/A", "2026-06-01")] } } } },
    } as never);
    assert.equal(rows.find((r) => r.concept === "eps_diluted")?.value, "5");
  });

  it("shown as reported: never rounded to fewer digits; the tooltip says diluted / reporting currency", () => {
    assert.equal(formatEps(0.1, "USD"), "0.10 USD");
    assert.equal(formatEps(0.105, "USD"), "0.105 USD");
    assert.equal(formatEps(-0.75, "EUR"), "-0.75 EUR");
    assert.equal(formatEps(24.71, null), "24.71");
    assert.match(METRIC_HELP.eps_1y!, /diluted/);
    assert.match(METRIC_HELP.eps_1y!, /reporting currency/);
    assert.doesNotMatch(METRIC_HELP.eps_1y!, /\b(buy|sell|good|bad|score|rating|cheap|expensive)\b/i);
  });
});
