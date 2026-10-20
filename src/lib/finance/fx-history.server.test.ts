import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  handlePersonalFinanceChartRequest,
  handlePersonalFinanceReportExportRequest,
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceReportsRequest,
  handlePersonalFinanceRequest,
  handlePersonalFinanceSeriesRequest,
} from "./account.server.ts";
import { chartData } from "./chart.ts";
import { CURRENCY_KEY, FX_HISTORY_NOTE } from "./currency.ts";
import { crc32, FX_LINE, FX_LINE_HISTORICAL, fxMixedLine } from "./export.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { backfillPfFx, parseValet, valetUrl } from "./fx-backfill.server.ts";
import { applyHistoricalFx, historicalRate, monthlyAverages, PF_BOC_QUOTES, rateText } from "./fx-history.ts";
import { MONTHS_KEY } from "./months.ts";
import { OVERVIEW_KEY } from "./overview.ts";
import { seriesValues } from "./series.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";
import * as H from "../../../qa/tools/pf-helpers.mjs";

// #170 (spec 43, PFFX-*): historical FX. PGlite with the real `fx_rates` (migration 0002, unchanged) and the PF tables
// (0010-0012), the real handlers, fixed clocks and a recorded Bank of Canada Valet response (no network). Runs under
// TZ=UTC and TZ=America/Los_Angeles.
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db });
const OCT = new Date("2026-10-16T16:00:00Z");
const J = { "content-type": "application/json" };
const rq = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: J, body: body === undefined ? undefined : JSON.stringify(body) });
const FIXTURE = readFileSync(new URL("./fixtures/boc-valet-2020-01.json", import.meta.url), "utf8");

const L = (id: string, amount: string, currency = "", rate = "") => ({ id, name: id, amount, per: "month", equity: "", account: "", currency, rate, category: "" });
const P = { id: "p1", name: "A", wages: "36000", bonus: "0", tax: "0", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" };
const month = (lines: object[]) => ({ fixed: lines, variable: [], people: [P] });
type Rec = Record<string, string>;
const recordOf = (months: Record<string, object[]>, household = "CAD", overview: object = { start: "10000", growth: "", future: false, years: 1, months: {} }): Rec => ({
  [STORAGE_KEY]: JSON.stringify({ fixed: [L("u", "1000", "USD", "0.7")], variable: [], accounts: [], categories: [] }),
  [MONTHS_KEY]: JSON.stringify(Object.fromEntries(Object.entries(months).map(([k, ls]) => [k, month(ls)]))),
  [CURRENCY_KEY]: JSON.stringify({ household }),
  [OVERVIEW_KEY]: JSON.stringify(overview),
});
const put = async (data: Rec) => assert.equal((await handlePersonalFinanceRequest(rq("PUT", "/api/personal-finance", { data }), as("alice"), () => OCT)).status, 200);
const rows = async (list: [string, string, string][]) => {
  for (const [q, d, v] of list) await pg.query("INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source) VALUES ($1, $2, $3, 'BOC')", [q, d, v]);
};
const ALL = [{ kind: "group", id: "all" }, { kind: "metric", id: "income" }, { kind: "metric", id: "expenses" }, { kind: "metric", id: "surplus" }, { kind: "metric", id: "net-assets" }];
const series = async (range: object, s: object[] = ALL) => handlePersonalFinanceSeriesRequest(rq("POST", "/api/personal-finance/series", { series: s, range }), as("alice"), () => OCT);
const chart = async (body: object) => handlePersonalFinanceChartRequest(rq("POST", "/api/personal-finance/chart", body), as("alice"), () => OCT);
const exportBytes = async (f: "pdf" | "png") => {
  const r = await handlePersonalFinanceReportExportRequest(rq("GET", `/api/personal-finance/reports/default/export?format=${f}`), "default", as("alice"), () => OCT);
  assert.equal(r.status, 200);
  return Buffer.from(await r.arrayBuffer());
};
const pdfText = async () => (readPdf(await exportBytes("pdf")).text as string[]).join("\n");
const cents = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
const PRESETS = ["3m", "6m", "12m", "24m", "ytd", "all"].map((preset) => ({ preset }));
const RANGES: object[] = [...PRESETS, { from: "2024-01", to: "2026-10" }];

/** Every surface QA names in PFFX-17a, as text (PDF/PNG bytes are deterministic: the clock is fixed). */
async function surfaces(): Promise<string[]> {
  const out: string[] = [];
  out.push(await (await handlePersonalFinanceRequest(rq("GET", "/api/personal-finance"), as("alice"), () => OCT)).text());
  out.push(await (await handlePersonalFinanceReportRequest(rq("GET", "/api/personal-finance/report"), as("alice"), () => OCT)).text());
  out.push(await (await handlePersonalFinanceReportsRequest(rq("GET", "/api/personal-finance/reports"), as("alice"), () => OCT)).text());
  for (const r of RANGES) out.push(await (await series(r)).text());
  out.push(await (await chart({ series: ALL, range: { preset: "all" }, chart: "line" })).text());
  out.push(await (await chart({ saved: true })).text());
  out.push((await exportBytes("pdf")).toString("base64"), (await exportBytes("png")).toString("base64"));
  return out;
}

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0002_dashboard.sql", "0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', ["alice", "alice@example.com"]);
  const r = await handlePersonalFinanceReportRequest(rq("PUT", "/api/personal-finance/report", { report: { series: ALL, range: { preset: "all" }, chart: "line" } }), as("alice"), () => OCT);
  assert.equal(r.status, 200);
});
beforeEach(async () => {
  await pg.exec("DELETE FROM fx_rates");
});

describe("#170 pure: monthly average, cross rate, rate text (spec 43.9)", () => {
  it("PFFX-19a: 1.35 / 1.36 / 1.37 average 1.36; skips bad rows; partial month = days so far", () => {
    const fx = monthlyAverages([
      { quote: "USD", date: "2024-03-01", cadPerUnit: "1.3500" },
      { quote: "USD", date: "2024-03-04", cadPerUnit: "1.3600" },
      { quote: "USD", date: "2024-03-05", cadPerUnit: "1.3700" },
      { quote: "USD", date: "2024-03-06", cadPerUnit: "0" },
      { quote: "USD", date: "bad", cadPerUnit: "9" },
      { quote: "USD", date: "2026-10-01", cadPerUnit: "1.3800" },
      { quote: "USD", date: "2026-10-02", cadPerUnit: "1.4000" },
    ]);
    assert.equal(cents(fx["2024-03"].USD), 1.36);
    assert.equal(cents(fx["2026-10"].USD), 1.39);
    assert.deepEqual(Object.keys(fx).sort(), ["2024-03", "2026-10"]);
  });
  it("Q-AH10: rate = CAD per household unit / CAD per line unit; CAD is 1; missing side → null", () => {
    const fx = { "2024-03": { USD: 1.36, EUR: 1.48 } };
    assert.equal(historicalRate(fx, "2024-03", "USD", "CAD"), 1 / 1.36);
    assert.equal(historicalRate(fx, "2024-03", "USD", "EUR"), 1.48 / 1.36);
    assert.equal(historicalRate(fx, "2024-03", "GBP", "CAD"), null);
    assert.equal(historicalRate(fx, "2024-04", "USD", "CAD"), null);
    assert.equal(Number(rateText(1 / 1.36)), 1 / 1.36);
    assert.doesNotMatch(rateText(1e-9), /e/);
  });
  it("applyHistoricalFx: untouched object when nothing is historical", () => {
    const rec = recordOf({ "2024-03": [L("u", "1000", "USD", "0.7")] });
    const r = applyHistoricalFx(rec, { "2024-04": { USD: 1.3 } }, "2026-10");
    assert.equal(r.record, rec);
    assert.equal(r.basis, "current");
    assert.equal(applyHistoricalFx(rec, undefined, "2026-10").record, rec);
  });
  it("PFFX-30: mixed export line names the earliest 5 months, then ' and N more'", () => {
    const ms = (n: number) => Array.from({ length: n }, (_, i) => `20${20 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    assert.equal(fxMixedLine(ms(5).reverse()), "FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2020-01, 2020-02, 2020-03, 2020-04, 2020-05)");
    assert.equal(fxMixedLine(ms(6)), "FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2020-01, 2020-02, 2020-03, 2020-04, 2020-05 and 1 more)");
    assert.equal(fxMixedLine(ms(17)), "FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2020-01, 2020-02, 2020-03, 2020-04, 2020-05 and 12 more)");
    assert.equal(fxMixedLine(["2021-07", "2020-03"]), "FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2020-03, 2021-07)");
  });
  it("the QA lists carry the exact texts (pf-helpers)", () => {
    assert.equal(H.EXPORT_FX_LINE, FX_LINE);
    assert.equal(H.EXPORT_FX_LINE_HISTORICAL, FX_LINE_HISTORICAL);
    assert.equal(H.exportFxMixedLine(["2020-03", "2021-07"]), fxMixedLine(["2020-03", "2021-07"]));
    assert.equal(H.exportFxMixedLine(["2020-01", "2020-02", "2020-03", "2020-04", "2020-05", "2020-06"]), fxMixedLine(["2020-01", "2020-02", "2020-03", "2020-04", "2020-05", "2020-06"]));
    assert.equal(H.FX_HISTORY_NOTE, FX_HISTORY_NOTE);
    assert.deepEqual([H.FX_BASIS_CURRENT, H.FX_BASIS_HISTORICAL, H.FX_BASIS_MIXED], ["current", "historical", "mixed"]);
  });
});

describe("#170 PFFX-17a / 18a: byte-identical to the typed-rate path when no row applies", () => {
  it("PFFX-17a: USD / EUR / GBP lines in 2024-03, rows only for 2026-09 → every surface unchanged, fx_basis current", async () => {
    await put(recordOf({ "2024-03": [L("u", "1000", "USD", "0.7"), L("e", "500", "EUR", "0.6"), L("g", "200", "GBP", "0.5")] }));
    const before = await surfaces();
    await rows([["USD", "2026-09-01", "1.3600"], ["EUR", "2026-09-01", "1.4800"]]);
    assert.deepEqual(await surfaces(), before);
    const j = await (await series({ preset: "all" })).json();
    assert.equal(j.fx_basis, "current");
    assert.equal("fx_fallback_months" in j, false);
    assert.ok((await pdfText()).includes(FX_LINE));
    // And the reply equals the typed-rate (d1308bc) computation exactly.
    const stored = (await (await handlePersonalFinanceRequest(rq("GET", "/api/personal-finance"), as("alice"), () => OCT)).json()).data;
    assert.equal(JSON.stringify(j), JSON.stringify(seriesValues({ series: ALL, range: { preset: "all" } } as never, stored, OCT)));
  });
  it("PFFX-18a: CAD-only lines with USD and GBP rows seeded → every surface unchanged", async () => {
    await put(recordOf({ "2024-03": [L("c", "1000")] }));
    const before = await surfaces();
    await rows([["USD", "2024-03-01", "1.3600"], ["GBP", "2024-03-01", "1.7000"]]);
    assert.deepEqual(await surfaces(), before);
  });
});

describe("#170 historical conversion through the handlers (spec 43.9 worked examples)", () => {
  const MARCH: [string, string, string][] = [["USD", "2024-03-01", "1.3500"], ["USD", "2024-03-04", "1.3600"], ["USD", "2024-03-05", "1.3700"]];
  it("PFFX-19a: USD 1,000 in March 2024 → CAD 1,360.00, fx_basis historical; /chart equals /series; export line", async () => {
    await put(recordOf({ "2024-03": [L("u", "1000", "USD", "0.7")] }));
    await rows(MARCH);
    const j = await (await series({ from: "2024-03", to: "2024-03" })).json();
    assert.equal(cents(j.series[0].values[0]), 1360);
    assert.equal(j.fx_basis, "historical");
    assert.equal("fx_fallback_months" in j, false);
    const c = await (await chart({ series: ALL, range: { from: "2024-03", to: "2024-03" }, chart: "line" })).json();
    assert.equal(c.fx_basis, "historical");
    assert.deepEqual(c.series.map((s: { values: unknown }) => s.values), j.series.map((s: { values: unknown }) => s.values));
    const t = await pdfText();
    assert.ok(t.includes(FX_LINE_HISTORICAL) && !t.includes(FX_LINE), t);
    const png = readPng(await exportBytes("png"), crc32);
    assert.equal(png.data.fx_basis, "historical"); // the PNG draws the header lines as pixels; its embedded data carries the basis
  });
  it("PFFX-23/24: GBP without rows (typed 0.5) → CAD 2,000.00 as typed, fx_basis mixed, fx_fallback_months right after fx_basis", async () => {
    await put(recordOf({ "2024-03": [L("u", "1000", "USD", "0.7"), L("g", "1000", "GBP", "0.5")], "2024-05": [L("g", "1000", "GBP", "0.5")] }));
    await rows(MARCH);
    const r = await series({ from: "2024-03", to: "2024-05" });
    const text = await r.clone().text();
    const j = await r.json();
    assert.equal(cents(j.series[0].values[0]), 3360);
    assert.equal(cents(j.series[0].values[2]), 2000);
    assert.equal(j.fx_basis, "mixed");
    assert.deepEqual(j.fx_fallback_months, ["2024-03", "2024-05"]);
    assert.match(text, /"fx_basis":"mixed","fx_fallback_months":\["2024-03","2024-05"\],"net_assets_from"/);
    assert.ok((await pdfText()).includes("FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2024-03, 2024-05)"));
  });
  it("Q-AH10: EUR household, USD 1,000 → EUR 918.92", async () => {
    await put(recordOf({ "2024-03": [L("u", "1000", "USD", "0.9")] }, "EUR"));
    await rows([...MARCH, ["EUR", "2024-03-01", "1.4700"], ["EUR", "2024-03-04", "1.4800"], ["EUR", "2024-03-05", "1.4900"]]);
    const j = await (await series({ from: "2024-03", to: "2024-03" })).json();
    assert.equal(cents(j.series[0].values[0]), 918.92);
    assert.equal(j.fx_basis, "historical");
  });
  it("Q-AH10: EUR household without EUR rows → typed (current)", async () => {
    await put(recordOf({ "2024-03": [L("u", "1000", "USD", "0.8")] }, "EUR"));
    await rows(MARCH);
    const j = await (await series({ from: "2024-03", to: "2024-03" })).json();
    assert.equal(cents(j.series[0].values[0]), 1250);
    assert.equal(j.fx_basis, "current");
  });
  it("Q-AH9: the partial current month uses the days published so far (1.38, 1.40 → CAD 1,390.00)", async () => {
    await put(recordOf({ "2026-10": [L("u", "1000", "USD", "0.7")] }));
    await rows([["USD", "2026-10-01", "1.3800"], ["USD", "2026-10-02", "1.4000"]]);
    const j = await (await series({ preset: "3m" })).json();
    assert.equal(cents(j.series[0].values.at(-1)), 1390);
    assert.equal(j.partial, true);
  });
  it("a foreign person's income in a month with rows uses the average too", async () => {
    const data = recordOf({ "2024-03": [] });
    const m = JSON.parse(data[MONTHS_KEY]);
    m["2024-03"].people = [{ ...P, foreign: true, currency: "USD", rate: "0.7" }];
    data[MONTHS_KEY] = JSON.stringify(m);
    await put(data);
    await rows(MARCH);
    const j = await (await series({ from: "2024-03", to: "2024-03" })).json();
    assert.equal(cents(j.series[1].values[0]), 4080);
    assert.equal(j.fx_basis, "historical");
  });
  it("PFFX-28 (Q-AH13): a month without rows keeps the record off 'historical' until covered", async () => {
    await put(recordOf({ "2024-02": [L("u", "1000", "USD", "0.7")], "2024-03": [L("u", "1000", "USD", "0.7")] }));
    await rows(MARCH);
    assert.equal((await (await series({ from: "2024-02", to: "2024-03" })).json()).fx_basis, "mixed");
    await rows([["USD", "2024-02-01", "1.3400"]]);
    assert.equal((await (await series({ from: "2024-02", to: "2024-03" })).json()).fx_basis, "historical");
  });
});

describe("#170 PFFX-21a: the #171 anchor rule with historical rates", () => {
  const AV: [string, string, string][] = [["USD", "2024-02-01", "1.3400"], ["USD", "2024-03-01", "1.3600"], ["USD", "2024-04-01", "1.3000"]];
  const lines = { "2024-02": [L("u", "1000", "USD", "0.7")], "2024-03": [L("u", "1000", "USD", "0.7")], "2024-04": [L("u", "1000", "USD", "0.7")] };
  const NET = [{ kind: "metric", id: "surplus" }, { kind: "metric", id: "net-assets" }];
  it("asOf 2024-04 (after the first data month): 8,360 / 10,000 / 11,700 (spec 43.9 fixture)", async () => {
    await put(recordOf(lines, "CAD", { start: "10000", growth: "", future: false, years: 1, months: {}, asOf: "2024-04" }));
    await rows(AV);
    const j = await (await series({ from: "2024-02", to: "2024-04" }, NET)).json();
    assert.deepEqual(j.series[0].values.map(cents), [1660, 1640, 1700]);
    assert.deepEqual(j.series[1].values.map(cents), [8360, 10000, 11700]);
    assert.equal(j.net_assets_from, "2024-04");
  });
  it("no asOf: anchored at the first data month, forward roll of the historical surplus", async () => {
    await put(recordOf(lines));
    await rows(AV);
    const j = await (await series({ from: "2024-02", to: "2024-04" }, NET)).json();
    assert.deepEqual(j.series[1].values.map(cents), [11660, 13300, 15000]);
    assert.equal(j.net_assets_from, "2024-02");
  });
  it("asOf before the first data month: carried flat, then the historical surplus", async () => {
    await put(recordOf(lines, "CAD", { start: "10000", growth: "", future: false, years: 1, months: {}, asOf: "2024-01" }));
    await rows(AV);
    const j = await (await series({ from: "2024-01", to: "2024-04" }, NET)).json();
    assert.deepEqual(j.series[1].values.map(cents), [10000, 11660, 13300, 15000]);
  });
  it("contract 11.2 / 12.1 messages unchanged", async () => {
    const r = await handlePersonalFinanceRequest(rq("PUT", "/api/personal-finance", { data: recordOf(lines, "CAD", { start: "1", asOf: "2019-12" }) }), as("alice"), () => OCT);
    assert.deepEqual(await r.json(), { error: "Month can't be before 2020-01.", field: "overview.asOf" });
    const c = await handlePersonalFinanceReportRequest(rq("PUT", "/api/personal-finance/report", { report: { series: ALL, range: { from: "2024-01", to: "2026-02" }, chart: "line" } }), as("alice"), () => OCT);
    assert.deepEqual(await c.json(), { error: "Range can't be longer than 24 months.", field: "range" });
  });
});

describe("#170 backfill (PFFX-20a / 20b): recorded Valet fixture, idempotent, fills before the oldest row", () => {
  const get = async (url: string) => {
    assert.equal(url, valetUrl(PF_BOC_QUOTES, "2020-01-01", "2020-02-07"));
    return FIXTURE;
  };
  it("parseValet: 27 business days × 9 quotes; January 2020 USD averages 1.30867…", () => {
    const r = parseValet(JSON.parse(FIXTURE), PF_BOC_QUOTES);
    assert.equal(r.length, 27 * 9);
    assert.equal(r[0].date, "2020-01-02");
    const fx = monthlyAverages(r);
    assert.equal(Math.round(fx["2020-01"].USD * 1e6), Math.round(1.3086727272727 * 1e6));
  });
  it("min(rate_date) 2020-01-02 for every quote, USD/EUR filled before their oldest row; a second run inserts 0", async () => {
    await rows([["USD", "2020-01-15", "1.3050"], ["EUR", "2020-01-15", "1.4500"]]);
    const s1 = await backfillPfFx(db, get, { today: "2020-02-07" });
    assert.equal(s1.inserted, 27 * 9 - 2);
    const per = await pg.query<{ quote: string; n: number; d: string }>("SELECT quote, count(*)::int AS n, min(rate_date)::text AS d FROM fx_rates GROUP BY quote ORDER BY quote");
    assert.deepEqual(per.rows.map((r) => r.quote), [...PF_BOC_QUOTES].sort());
    for (const r of per.rows) assert.deepEqual([r.n, r.d], [27, "2020-01-02"], r.quote);
    // The pre-existing row is kept as it was (ON CONFLICT DO NOTHING).
    assert.equal((await pg.query<{ v: string }>("SELECT cad_per_unit::text AS v FROM fx_rates WHERE quote='USD' AND rate_date='2020-01-15'")).rows[0].v, "1.3050");
    const s2 = await backfillPfFx(db, get, { today: "2020-02-07" });
    assert.equal(s2.inserted, 0);
    assert.equal((await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM fx_rates WHERE source <> 'BOC'")).rows[0].n, 0);
  });
  it("refuses a start before 2020-01-01", async () => {
    await assert.rejects(backfillPfFx(db, get, { today: "2020-02-07", from: "2019-12-31" }));
  });
});

// #170 QA tools (pf-series PFS-19, pf-chart PFC-03, pf-export PFX-06/07): their shared checks from pf-helpers replayed
// through the real handlers for current / historical / mixed (17 fallback months → the 5-month cap), plus text pins.
describe("#170 QA tools: the updated signed-in expectations hold on the real handlers", () => {
  const tool = (f: string) => readFileSync(new URL(`../../../qa/tools/${f}`, import.meta.url), "utf8");
  const many: Record<string, object[]> = {};
  for (let i = 0; i < 17; i++) many[`${2024 + Math.floor(i / 12)}-${String(1 + (i % 12)).padStart(2, "0")}`] = [L("g", "1000", "GBP", "0.5")];
  many["2024-03"] = [L("u", "1000", "USD", "0.7"), L("g", "1000", "GBP", "0.5")];
  const cases: [string, Rec, [string, string, string][]][] = [
    ["current", recordOf({ "2024-03": [L("u", "1000", "USD", "0.7")] }), []],
    ["historical", recordOf({ "2024-03": [L("u", "1000", "USD", "0.7")] }), [["USD", "2024-03-04", "1.3600"]]],
    ["mixed", recordOf(many), [["USD", "2024-03-04", "1.3600"]]],
  ];
  for (const [basis, rec, seed] of cases)
    it(`PFS-19 / PFC-03 / PFX-06/07 pass on a ${basis} record`, async () => {
      await put(rec);
      await rows(seed);
      const range = { from: "2024-01", to: "2025-06" };
      const s = await (await series(range)).json();
      const c = await (await chart({ series: ALL, range, chart: "line" })).json();
      assert.equal(s.fx_basis, basis);
      assert.ok(H.fxBasisOk(s) && H.fxBasisOk(c) && c.fx_basis === s.fx_basis);
      assert.equal(JSON.stringify(c.fx_fallback_months), JSON.stringify(s.fx_fallback_months));
      if (basis === "mixed") {
        assert.equal(s.fx_fallback_months.length, 17);
        assert.ok(H.expectedFxLine(s).endsWith(" and 12 more)"), H.expectedFxLine(s));
        // the mutations the checks must catch
        assert.equal(H.fxBasisOk({ ...s, fx_fallback_months: undefined }), false);
        assert.equal(H.fxBasisOk({ ...s, fx_basis: "historical" }), false);
      }
      const saved = await (await chart({ saved: true, id: "default" })).json();
      const flat = (await pdfText()).replace(/\n/g, " ");
      assert.ok(flat.includes(H.expectedFxLine(saved)), flat);
    });
  it("the tools carry exactly these checks and still call the prod guard", () => {
    assert.ok(tool("pf-series-api.mjs").includes("fxBasisOk(j), { fx: j.fx_basis, fallback: j.fx_fallback_months });"));
    assert.ok(tool("pf-chart-api.mjs").includes("fxBasisOk(j) && j.fx_basis === s.body?.fx_basis && same(j.fx_fallback_months, s.body?.fx_fallback_months)"));
    assert.ok(tool("pf-export-api.mjs").includes('text.replace(/\\n/g, " ").includes(expectedFxLine(chart))'));
    for (const t of ["pf-series-api.mjs", "pf-chart-api.mjs", "pf-export-api.mjs"]) assert.match(tool(t), /await refuseIfProd\(/, t);
  });
});

describe("#170 chartData without fx is the typed-rate path", () => {
  it("fx undefined → fx_basis current and no fallback field", () => {
    const d = chartData({ series: ALL as never, range: { preset: "all" }, chart: "line" }, recordOf({ "2024-03": [L("u", "1000", "USD", "0.7")] }), OCT);
    assert.equal(d.fx_basis, "current");
    assert.equal("fx_fallback_months" in d, false);
  });
});

describe("#170 drift: contract section 13.1 equals the code", () => {
  it("every row of 13.1 equals its server constant", async () => {
    const E = await import("./export.ts");
    const F = await import("./fx-history.ts");
    const doc = readFileSync(new URL("../../../attachments/pf-charts-api-contract.md", import.meta.url), "utf8");
    const sec = doc.slice(doc.indexOf("### 13.1"));
    const rows = Object.fromEntries([...sec.matchAll(/^\| ([a-z-]+) \| (.+?) \|$/gm)].map((m) => [m[1], m[2]]));
    assert.deepEqual(rows, {
      "basis-values": "current, historical, mixed",
      "fallback-field": "fx_fallback_months",
      "first-month": F.FX_HISTORY_FROM,
      "line-current": E.FX_LINE,
      "line-historical": E.FX_LINE_HISTORICAL,
      "line-mixed": E.fxMixedLine(["<months>"]),
      "mixed-shown": String(E.FX_MIXED_SHOWN),
    });
  });
});

describe("#170 QA G1 / G5 (spec 43.11): fx_basis scope and the concrete PFFX-23/24/28 examples", () => {
  const MAR: [string, string, string][] = [["USD", "2024-03-04", "1.3600"]];
  const IE = [{ kind: "metric", id: "income" }, { kind: "metric", id: "expenses" }];
  it("PFFX-23/24: USD lines in 2024-01 (no rows) and 2024-03 (rows), range 2024-03: without net assets → historical", async () => {
    await put(recordOf({ "2024-01": [L("u", "1000", "USD", "0.7")], "2024-03": [L("u", "1000", "USD", "0.7")] }));
    await rows(MAR);
    const j = await (await series({ from: "2024-03", to: "2024-03" }, IE)).json();
    assert.equal(j.fx_basis, "historical");
    assert.equal("fx_fallback_months" in j, false);
  });
  it("PFFX-23/24: the same with net assets in the reply → mixed, fx_fallback_months ['2024-01'] (before the range)", async () => {
    await put(recordOf({ "2024-01": [L("u", "1000", "USD", "0.7")], "2024-03": [L("u", "1000", "USD", "0.7")] }));
    await rows(MAR);
    const j = await (await series({ from: "2024-03", to: "2024-03" }, [...IE, { kind: "metric", id: "net-assets" }])).json();
    assert.equal(j.fx_basis, "mixed");
    assert.deepEqual(j.fx_fallback_months, ["2024-01"]);
  });
  it("PFFX-28: USD rows only from 2026-09, lines in 2024-03 and 2026-09 → mixed ['2024-03']; after the backfill → historical", async () => {
    await put(recordOf({ "2024-03": [L("u", "1000", "USD", "0.7")], "2026-09": [L("u", "1000", "USD", "0.7")] }));
    await rows([["USD", "2026-09-01", "1.3800"]]);
    const before = await (await series({ preset: "all" })).json();
    assert.equal(before.fx_basis, "mixed");
    assert.deepEqual(before.fx_fallback_months, ["2024-03"]);
    await rows(MAR);
    const after = await (await series({ preset: "all" })).json();
    assert.equal(after.fx_basis, "historical");
    assert.equal("fx_fallback_months" in after, false);
  });
});
