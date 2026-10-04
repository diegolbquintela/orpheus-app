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
    assert.equal(out.length, 9, "4 revenue metrics + ROIC (T10) + EPS (T11) + EBIT margin (T12) + gross margin (T13) + EPS growth (T14)");
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

  it("IFRS and non-USD filers: Philips (PHG) 0.93 EUR (ifrs-full), RY 14.07 CAD (banks have EPS), ASML 24.71 EUR (US GAAP in EUR)", async () => {
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

// ------------------------------------------------------------------ T12 (#20): EBIT margin (1y)

import { ebitMargin } from "./metric-compute.server.ts";

describe("DASH-19: EBIT margin (1y) = operating income / revenue for FY0, matching companyfacts", () => {
  const pct = (v: string | null) => (Number(v) * 100).toFixed(1);
  it("KO hand check: FY2025 OperatingIncomeLoss 13,762 / Revenues 47,941 (USD m) = 28.7%", async () => {
    await ingest();
    const m = (await stored("KO")).ebit_margin_1y;
    assert.equal(m.status, "ok");
    assert.equal(m.fiscalYearEnd, "2025-12-31");
    assert.ok(close(Number(m.value), 13762 / 47941));
    assert.equal(pct(m.value), "28.7");
  });

  it("Philips (PHG, IFRS ProfitLossFromOperatingActivities / Revenue) 8.0%; ASML 34.6%; Shopify 12.7%; RY (no operating income) n/m", async () => {
    await ingest();
    const phg = (await stored("PHG")).ebit_margin_1y;
    assert.ok(close(Number(phg.value), 1424 / 17834));
    assert.equal(pct(phg.value), "8.0");
    assert.ok(close(Number((await stored("ASML.AS")).ebit_margin_1y.value), 11301400000 / 32667300000));
    const ry = (await stored("RY.TO")).ebit_margin_1y;
    assert.deepEqual([ry.status, ry.value], ["n/m", null]);
    assert.equal(STATUS_REASON[ry.status], "not meaningful");
  });

  it("negative margin is a value; revenue ≤ 0 or missing, or no operating income → n/m; mismatched units → insufficient data", () => {
    const usd = (value: number) => ({ value, unit: "USD" });
    const neg = ebitMargin("2025-12-31", usd(5000), usd(-1418));
    assert.equal(neg.status, "ok");
    assert.ok(close(neg.value!, -1418 / 5000));
    for (const rev of [usd(0), usd(-10), undefined]) assert.equal(ebitMargin("2025-12-31", rev, usd(5)).status, "n/m");
    assert.equal(ebitMargin("2025-12-31", usd(100), undefined).status, "n/m");
    assert.equal(ebitMargin(null, usd(100), usd(5)).status, "n/m");
    assert.equal(ebitMargin("2025-12-31", usd(100), { value: 5, unit: "EUR" }).status, "insufficient_data");
  });

  it("FY0 only: a company whose latest year lacks operating income doesn't fall back to an older year", () => {
    // fy0 is the latest stored year; computeStoredMetrics passes only FY0 facts.
    assert.equal(ebitMargin("2025-12-31", { value: 100, unit: "USD" }, undefined).status, "n/m");
  });

  it("the tooltip states the formula and the n/m rule; no rating wording", () => {
    const h = METRIC_HELP.ebit_margin_1y!;
    assert.match(h, /operating income ÷ revenue/);
    assert.match(h, /no adjustments/);
    assert.doesNotMatch(h, /\b(buy|sell|good|bad|score|rating|strong|weak|healthy)\b/i);
  });
});

// ------------------------------------------------------------------ T13 (#21): gross margin (1y)

import { grossMargin } from "./metric-compute.server.ts";

describe("DASH-20: gross margin (1y) matches companyfacts; revenue − cost of revenue fallback; banks n/m", () => {
  const pct = (v: string | number | null) => (Number(v) * 100).toFixed(1);
  it("KO hand check: FY2025 GrossProfit 29,544 / Revenues 47,941 (USD m) = 61.6%", async () => {
    await ingest();
    const m = (await stored("KO")).gross_margin_1y;
    assert.deepEqual([m.status, m.fiscalYearEnd], ["ok", "2025-12-31"]);
    assert.ok(close(Number(m.value), 29544 / 47941));
    assert.equal(pct(m.value), "61.6");
  });

  it("Philips (PHG, IFRS) 45.2%; ASML 52.8%; RY (bank, neither concept) n/m", async () => {
    await ingest();
    assert.equal(pct((await stored("PHG")).gross_margin_1y.value), "45.2");
    assert.ok(close(Number((await stored("ASML.AS")).gross_margin_1y.value), 17258000000 / 32667300000));
    const ry = (await stored("RY.TO")).gross_margin_1y;
    assert.deepEqual([ry.status, ry.value], ["n/m", null]);
    assert.equal(STATUS_REASON[ry.status], "not meaningful");
  });

  it("fallback: KO without its GrossProfit rows uses (47,941 − CostOfGoodsAndServicesSold 18,397) / 47,941 = same 61.6%", async () => {
    await ingest();
    await pg.exec(`DELETE FROM fundamentals_annual WHERE symbol = 'KO' AND concept = 'gross_profit'`);
    const m = (await computeStoredMetrics(db, "KO")).find((x) => x.key === "gross_margin_1y")!;
    assert.equal(m.status, "ok");
    assert.ok(close(m.value!, (47941 - 18397) / 47941));
  });

  it("rules: gross profit wins over cost of revenue; revenue ≤ 0 / missing or neither concept → n/m; negative margin is a value; unit mismatch → insufficient data", () => {
    const usd = (value: number) => ({ value, unit: "USD" });
    const fy = "2025-12-31";
    const gp = grossMargin(fy, usd(100), usd(40), usd(70));
    assert.deepEqual([gp.basis, gp.value], ["gross_profit", 0.4]);
    const rc = grossMargin(fy, usd(100), undefined, usd(70));
    assert.equal(rc.basis, "revenue_minus_cost");
    assert.ok(close(rc.value!, 0.3));
    assert.ok(close(grossMargin(fy, usd(100), undefined, usd(130)).value!, -0.3));
    for (const rev of [usd(0), usd(-5), undefined]) assert.equal(grossMargin(fy, rev, usd(40), usd(70)).status, "n/m");
    assert.equal(grossMargin(fy, usd(100), undefined, undefined).status, "n/m");
    assert.equal(grossMargin(null, usd(100), usd(40), undefined).status, "n/m");
    assert.equal(grossMargin(fy, usd(100), { value: 40, unit: "EUR" }, undefined).status, "insufficient_data");
    assert.equal(grossMargin(fy, usd(100), undefined, { value: 70, unit: "EUR" }).status, "insufficient_data");
  });

  it("the tooltip states both formulas and the n/m rule; no rating wording", () => {
    const h = METRIC_HELP.gross_margin_1y!;
    assert.match(h, /gross profit ÷ revenue/);
    assert.match(h, /revenue − cost of revenue/);
    assert.doesNotMatch(h, /\b(buy|sell|good|bad|score|rating|strong|weak|healthy)\b/i);
  });
});

// ------------------------------------------------------------------ T14 (#22): portfolio aggregates (§9, D9)

import { epsGrowth } from "./metric-compute.server.ts";
import { portfolioMetrics } from "./portfolio.ts";
import { formatCoverage, formatPortfolioCell } from "./format.ts";
import { loadDashboardHoldings } from "./valuation.server.ts";
import { METRIC_KEYS } from "./metrics.ts";

describe("DASH-22/23: portfolio row = MV-weighted mean over covered holdings, with coverage %; EPS column = weighted 1y EPS growth", () => {
  /**
   * Hand-checked portfolio, base CAD, closes 2026-10-01, Bank of Canada rates USD 1.4243 / EUR 1.6030:
   *   KO       10 × 70 USD  =   700 × 1.4243 =   997.01 CAD
   *   ASML.AS   2 × 700 EUR =  1400 × 1.6030 =  2244.20 CAD
   *   RY.TO     5 × 180 CAD =                    900.00 CAD
   *   PHG      20 × 30 USD  =   600 × 1.4243 =   854.58 CAD
   *   MC.PA     1 × 500 EUR =   500 × 1.6030 =   801.50 CAD  (not covered: no SEC filings)
   *   total 5,797.29 CAD
   */
  const MV = { KO: 997.01, "ASML.AS": 2244.2, "RY.TO": 900, PHG: 854.58, "MC.PA": 801.5 };
  const TOTAL = 5797.29;
  async function portfolioSeed() {
    await ingest();
    await pg.exec(`UPDATE holdings SET shares = CASE symbol WHEN 'KO' THEN 10 WHEN 'ASML.AS' THEN 2 WHEN 'RY.TO' THEN 5 WHEN 'PHG' THEN 20 ELSE 1 END;
      DELETE FROM daily_closes; DELETE FROM fx_rates;
      INSERT INTO daily_closes (symbol, session_date, close, currency, source) VALUES
        ('KO', '2026-10-01', 70, 'USD', 'yahoo'), ('ASML.AS', '2026-10-01', 700, 'EUR', 'yahoo'),
        ('RY.TO', '2026-10-01', 180, 'CAD', 'yahoo'), ('PHG', '2026-10-01', 30, 'USD', 'yahoo'),
        ('MC.PA', '2026-10-01', 500, 'EUR', 'yahoo');
      INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source) VALUES
        ('USD', '2026-10-01', 1.4243, 'BOC'), ('EUR', '2026-10-01', 1.6030, 'BOC');`);
    return loadDashboardHoldings(db, "u1", { previewRefresh: false, nowMs: NOW });
  }

  it("valuation weights are the hand values (base CAD)", async () => {
    const d = await portfolioSeed();
    for (const r of d.valuation.rows) assert.ok(Math.abs((r.value ?? NaN) - MV[r.symbol as keyof typeof MV]) < 1e-6, r.symbol);
    assert.ok(Math.abs(d.valuation.total - TOTAL) < 1e-6);
  });

  it("EBIT margin: KO + ASML + PHG weighted; RY (n/m) and MC.PA (not covered) excluded and counted against coverage", async () => {
    const p = (await portfolioSeed()).portfolio.ebit_margin_1y;
    const cov = MV.KO + MV["ASML.AS"] + MV.PHG; // 4,095.79
    const hand = (MV.KO * (13762 / 47941) + MV["ASML.AS"] * (11301.4 / 32667.3) + MV.PHG * (1424 / 17834)) / cov;
    assert.ok(Math.abs(p.value! - hand) < 1e-9, `${p.value} vs ${hand}`); // ≈ 0.2760 → 27.6%
    assert.ok(Math.abs(p.coverage! - cov / TOTAL) < 1e-12); // 70.65% → "71% covered"
    assert.deepEqual(p.included.sort(), ["ASML.AS", "KO", "PHG"]);
    assert.equal(formatPortfolioCell("ebit_margin_1y", p).text, `${(hand * 100).toFixed(1)}% · 71% covered`);
  });

  it("D9 EPS column: weighted 1y EPS growth; KO 3.04/2.46, ASML 24.71/19.24, RY 14.07/11.25; PHG (FY−1 −0.75 ≤ 0) n/m, excluded", async () => {
    const d = await portfolioSeed();
    const g = { KO: 3.04 / 2.46 - 1, "ASML.AS": 24.71 / 19.24 - 1, "RY.TO": 14.07 / 11.25 - 1 };
    for (const [s, v] of Object.entries(g)) assert.ok(close(Number(d.metrics[s].metrics.eps_g_1y.value), v), s);
    assert.equal(d.metrics.PHG.metrics.eps_g_1y.status, "n/m");
    const cov = MV.KO + MV["ASML.AS"] + MV["RY.TO"];
    const hand = (MV.KO * g.KO + MV["ASML.AS"] * g["ASML.AS"] + MV["RY.TO"] * g["RY.TO"]) / cov;
    const p = d.portfolio.eps_1y;
    assert.equal(p.source, "eps_g_1y");
    assert.ok(Math.abs(p.value! - hand) < 1e-9); // ≈ 0.2651 → 26.5%
    assert.ok(Math.abs(p.coverage! - cov / TOTAL) < 1e-12); // 71.43%
    const f = formatPortfolioCell("eps_1y", p);
    assert.equal(f.label, "EPS growth 1y (weighted)");
    assert.equal(f.text, `${(hand * 100).toFixed(1)}% · 71% covered`);
  });

  it("every metric T09–T13: value = Σ MV·m / Σ MV over valid holdings, from the stored values; negatives included as they are", async () => {
    const d = await portfolioSeed();
    for (const key of METRIC_KEYS) {
      const src = key === "eps_1y" ? "eps_g_1y" : key;
      let w = 0, s = 0;
      for (const [sym, mv] of Object.entries(MV)) {
        const c = d.metrics[sym].coverage === "covered" ? d.metrics[sym].metrics[src] : undefined;
        if (c?.status === "ok") {
          w += mv;
          s += mv * Number(c.value);
        }
      }
      const p = d.portfolio[key];
      assert.ok(w === 0 ? p.value === null : Math.abs(p.value! - s / w) < 1e-9, key);
      assert.ok(Math.abs(p.coverage! - w / TOTAL) < 1e-12, key);
      assert.ok(!p.included.includes("MC.PA"), `${key}: not covered is excluded`);
    }
    // PHG FY2025 revenue 17,834 < FY2024 → negative 1y growth, included (not dropped, not zeroed).
    assert.ok(Number(d.metrics.PHG.metrics.rev_g_1y.value) < 0);
    assert.ok(d.portfolio.rev_g_1y.included.includes("PHG"));
    // RY 10y CAGR is insufficient history → excluded.
    assert.ok(!d.portfolio.rev_cagr_10y.included.includes("RY.TO"));
  });

  it("pure rules: renormalised weights; pending price carries no weight; n/m and insufficient data never count as 0; 0% coverage → —", () => {
    const rows = [
      { symbol: "A", value: 300 },
      { symbol: "B", value: 100 },
      { symbol: "C", value: 600 },
      { symbol: "P", value: null }, // price pending
    ];
    const ok = (v: number) => ({ value: String(v), status: "ok" });
    const views = {
      A: { coverage: "covered", metrics: { m: ok(0.1), x: { value: null, status: "n/m" } } },
      B: { coverage: "covered", metrics: { m: ok(-0.2), x: { value: null, status: "insufficient_data" } } },
      C: { coverage: "covered", metrics: { m: { value: null, status: "insufficient_history" } } },
      P: { coverage: "covered", metrics: { m: ok(5) } },
    };
    const p = portfolioMetrics(rows, views, ["m", "x"]);
    assert.ok(close(p.m.value!, (300 * 0.1 + 100 * -0.2) / 400)); // 0.025
    assert.ok(close(p.m.coverage!, 400 / 1000));
    assert.deepEqual(p.m.included, ["A", "B"]);
    assert.deepEqual([p.x.value, p.x.coverage], [null, 0]);
    assert.equal(formatPortfolioCell("x", p.x).text, "— · 0% covered");
    assert.equal(formatPortfolioCell("m", portfolioMetrics([{ symbol: "P", value: null }], views, ["m"]).m).text, "—");
    assert.equal(formatCoverage(0.996), "99% covered");
    assert.equal(formatCoverage(0.004), "1% covered");
    assert.equal(formatCoverage(1), "100% covered");
  });

  it("epsGrowth rules: missing FY−1 → insufficient history; ≤ 0 either year → n/m; unit change → insufficient data", () => {
    const f = (fy: string, v: number, unit = "USD/shares") => ({ fiscalYearEnd: fy, value: v, unit });
    assert.equal(epsGrowth("2025-12-31", [f("2025-12-31", 3)]).status, "insufficient_history");
    assert.equal(epsGrowth("2025-12-31", [f("2025-12-31", 3), f("2024-12-31", 0)]).status, "n/m");
    assert.equal(epsGrowth("2025-12-31", [f("2025-12-31", -1), f("2024-12-31", 2)]).status, "n/m");
    assert.equal(epsGrowth("2025-12-31", [f("2024-12-31", 2)]).status, "n/m");
    assert.equal(epsGrowth("2025-12-31", [f("2025-12-31", 3), f("2024-12-31", 2, "EUR/shares")]).status, "insufficient_data");
    assert.ok(close(epsGrowth("2025-12-28", [f("2025-12-28", 3), f("2024-12-29", 2)]).value!, 0.5), "52/53-week years match");
  });

  it("no advice, score or rating wording in the portfolio labels", () => {
    const text = formatPortfolioCell("eps_1y", { value: 0.1, coverage: 0.5 }).label!;
    assert.doesNotMatch(text, /\b(buy|sell|good|bad|score|rating|strong|weak|healthy|recommend)\b/i);
  });
});
