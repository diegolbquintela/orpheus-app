// #124 fund / ETF detection (attachments/etf-detection-design.md; AC FD-01..FD-08). Recorded OpenFIGI answers
// (test-fixtures/openfigi/mapping-2026-10-14.json); `post` is injected, so no live call.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { companyView, NOT_COVERED_LINE, SOURCE_LINE, SOURCE_LINE_ESEF, SOURCE_LINE_UNCOVERED, type CompanyInput } from "./company.ts";
import { loadCompany } from "./company.server.ts";
import { classifyFigi, FUND_LINE, SOURCE_LINE_FUND, type FigiResult } from "./fund.ts";
import {
  createOpenFigiSource,
  figiJob,
  FIGI_MIN_INTERVAL_MS,
  OPENFIGI_URL,
  refreshClassification,
  type FigiJob,
  type FigiPost,
} from "./openfigi.server.ts";
import type { Queryable } from "./store.server.ts";

type Answer = { job: FigiJob; result: FigiResult };
const FIXTURE = JSON.parse(readFileSync("test-fixtures/openfigi/mapping-2026-10-14.json", "utf8")) as { answers: Answer[] };
const answer = (idValue: string, exchCode: string) =>
  FIXTURE.answers.find((a) => a.job.idValue === idValue && a.job.exchCode === exchCode)?.result ?? { warning: "No identifier found." };

/** Replays the recorded answers; records every request. */
function fakePost(opts: { status?: number; text?: string; throws?: boolean } = {}) {
  const calls: { url: string; jobs: FigiJob[]; headers: Record<string, string> }[] = [];
  const post: FigiPost = async (url, body, headers) => {
    calls.push({ url, jobs: JSON.parse(body), headers });
    if (opts.throws) throw new Error("network down");
    if (opts.status) return { status: opts.status, text: opts.text ?? "" };
    if (opts.text !== undefined) return { status: 200, text: opts.text };
    const jobs = JSON.parse(body) as FigiJob[];
    return { status: 200, text: JSON.stringify(jobs.map((j) => answer(j.idValue, j.exchCode))) };
  };
  return { post, calls };
}

describe("FD-01, FD-02: job mapping and classification", () => {
  it("FD-01: Yahoo symbol → OpenFIGI job", () => {
    assert.deepEqual(figiJob("VDY.TO"), { idType: "TICKER", idValue: "VDY", exchCode: "CN" });
    assert.deepEqual(figiJob("RMS.PA"), { idType: "TICKER", idValue: "RMS", exchCode: "FP" });
    assert.deepEqual(figiJob("PLTR"), { idType: "TICKER", idValue: "PLTR", exchCode: "US" });
    assert.deepEqual(figiJob("BRK-B"), { idType: "TICKER", idValue: "BRK/B", exchCode: "US" });
    assert.equal(figiJob("ASML.AS")?.exchCode, "NA");
    assert.equal(figiJob("SAP.DE")?.exchCode, "GY");
    assert.equal(figiJob("X.ZZ"), null);
  });
  it("FD-02: recorded answers classify as fund / company / unknown", () => {
    for (const [t, e] of [["VDY", "CN"], ["VDY", "CT"], ["XEQT", "CN"], ["SPY", "US"], ["PDI", "US"], ["VFIAX", "US"]])
      assert.equal(classifyFigi(answer(t, e)), "fund", `${t}/${e}`);
    for (const [t, e] of [["RMS", "FP"], ["PLTR", "US"], ["RY", "CN"], ["BRK/B", "US"], ["O", "US"], ["ASML", "NA"], ["SAP", "GY"]])
      assert.equal(classifyFigi(answer(t, e)), "company", `${t}/${e}`);
    assert.equal(classifyFigi(answer("ZZZQQQ", "US")), "unknown");
    assert.equal(classifyFigi(undefined), "unknown");
  });
});

let pg: PGlite;
let db: Queryable;
before(async () => {
  pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  await pg.waitReady;
  await pg.exec("CREATE TABLE _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const { name } of pendingMigrations(readdirSync("migrations"), [])) await pg.exec(readFileSync(`migrations/${name}`, "utf8"));
  db = { query: async (text, params) => (await pg.query(text, params)).rows as never[] };
});
after(async () => pg.close());
const SYMBOLS: [string, string, string, string, string][] = [
  ["VDY.TO", "Vanguard FTSE Canadian High Dividend Yield Index ETF", "Toronto", "CA", "CAD"],
  ["RMS.PA", "Hermès International", "Paris", "EU", "EUR"],
  ["PLTR", "Palantir Technologies Inc.", "NasdaqGS", "US", "USD"],
];
beforeEach(async () => {
  await pg.exec(`DELETE FROM holdings; DELETE FROM instruments; DELETE FROM daily_closes; DELETE FROM corporate_actions; DELETE FROM "user";`);
  await pg.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('u1', 'D', 'd@example.com', false)`);
  for (const [s, n, e, r, c] of SYMBOLS) {
    await pg.query(`INSERT INTO instruments (symbol, name, exchange, region, currency, provider_ids) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [
      s, n, e, r, c, JSON.stringify({ yahoo: s }),
    ]);
    await pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('u1', $1, 1, 1)", [s]);
  }
});
const stored = async () =>
  Object.fromEntries(
    (await db.query<{ symbol: string; ids: Record<string, unknown> }>("SELECT symbol, provider_ids AS ids FROM instruments ORDER BY symbol")).map((r) => [
      r.symbol,
      r.ids,
    ]),
  );
const NOW = Date.UTC(2026, 9, 14, 10);
const noSleep = async () => {};

describe("FD-03..FD-06: the job", () => {
  it("FD-03: stores provider_ids.openfigi and keeps the other provider ids", async () => {
    const { post, calls } = fakePost();
    const s = await refreshClassification(db, createOpenFigiSource({ post }), { nowMs: NOW, sleep: noSleep });
    assert.deepEqual([s.checked, s.funds, s.errors.length], [3, 1, 0]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, OPENFIGI_URL);
    const ids = await stored();
    assert.deepEqual(ids["VDY.TO"], {
      yahoo: "VDY.TO",
      openfigi: { kind: "fund", securityType: "ETP", securityType2: "Mutual Fund", figi: "BBG003M5XN19", checkedAt: new Date(NOW).toISOString() },
    });
    assert.equal((ids["RMS.PA"].openfigi as { kind: string }).kind, "company");
    assert.equal((ids.PLTR.openfigi as { kind: string }).kind, "company");
  });
  it("FD-04: found results wait 30 days, not-found 7 days", async () => {
    await pg.query("INSERT INTO instruments (symbol, name, exchange, region, currency) VALUES ('ZZZQQQ', 'Z', 'NYSE', 'US', 'USD')");
    await pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('u1', 'ZZZQQQ', 1, 1)");
    const src = () => createOpenFigiSource({ post: fakePost().post });
    await refreshClassification(db, src(), { nowMs: NOW, sleep: noSleep });
    assert.equal(((await stored()).ZZZQQQ.openfigi as { kind: string }).kind, "unknown");
    const day = 86_400_000;
    assert.equal((await refreshClassification(db, src(), { nowMs: NOW + 6 * day, sleep: noSleep })).checked, 0);
    assert.equal((await refreshClassification(db, src(), { nowMs: NOW + 7 * day, sleep: noSleep })).checked, 1, "unknown rechecked after 7 days");
    assert.equal((await refreshClassification(db, src(), { nowMs: NOW + 29 * day, sleep: noSleep })).checked, 1, "only the unknown one (22 days old)");
    assert.equal((await refreshClassification(db, src(), { nowMs: NOW + 30 * day, sleep: noSleep })).checked, 3, "the 3 found ones after 30 days (the unknown one is 1 day old)");
  });
  it("FD-05: ≤ 10 jobs a request, ≥ 2.5 s apart, ≤ 3 requests a run, no API key header", async () => {
    for (let i = 0; i < 32; i++) {
      await pg.query("INSERT INTO instruments (symbol, name, exchange, region, currency) VALUES ($1, 'T', 'NYSE', 'US', 'USD')", [`T${i}`]);
      await pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('u1', $1, 1, 1)", [`T${i}`]);
    }
    const { post, calls } = fakePost();
    const sleeps: number[] = [];
    const s = await refreshClassification(db, createOpenFigiSource({ post }), { nowMs: NOW, sleep: async (ms) => void sleeps.push(ms) });
    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => c.jobs.length <= 10));
    assert.deepEqual(sleeps, [FIGI_MIN_INTERVAL_MS, FIGI_MIN_INTERVAL_MS]);
    assert.ok(FIGI_MIN_INTERVAL_MS >= 2500);
    assert.deepEqual([s.checked, s.deferred], [30, 5]);
    assert.ok(calls.every((c) => !Object.keys(c.headers).some((h) => /api-?key/i.test(h))));
  });
  it("FD-06: 429 / 500 / thrown / bad JSON store nothing and are reported; the next run asks again", async () => {
    for (const o of [{ status: 429, text: "Too Many Requests" }, { status: 500 }, { throws: true }, { text: "not json" }]) {
      const s = await refreshClassification(db, createOpenFigiSource({ post: fakePost(o).post }), { nowMs: NOW, sleep: noSleep });
      assert.equal(s.checked, 0);
      assert.equal(s.errors.length, 1, JSON.stringify(o));
      assert.ok(Object.values(await stored()).every((ids) => !("openfigi" in ids)));
    }
    assert.equal((await refreshClassification(db, createOpenFigiSource({ post: fakePost().post }), { nowMs: NOW, sleep: noSleep })).checked, 3);
  });
});

const closes = Array.from({ length: 400 }, (_, i) => ({ date: new Date(Date.UTC(2025, 8, 1) + i * 86_400_000).toISOString().slice(0, 10), close: 40 + i / 100 }));
const FUND_INPUT: CompanyInput = {
  symbol: "VDY.TO",
  name: "Vanguard FTSE Canadian High Dividend Yield Index ETF",
  exchange: "Toronto",
  currency: "CAD",
  covered: false,
  checked: true,
  closes,
  years: [],
  metrics: {},
  dividends: [{ exDate: "2026-09-18", cash: 0.55 }, { exDate: "2026-06-20", cash: 0.55 }],
  today: closes.at(-1)!.date,
  kind: "fund",
  securityType: "ETP",
};

describe("FD-07, FD-08: the view", () => {
  it("FD-07: a fund shows the fund line, Dividends only, no coverage line, the fund source line", () => {
    const v = companyView(FUND_INPUT);
    assert.equal(v.kind, "fund");
    assert.equal(v.fund, FUND_LINE);
    assert.equal(FUND_LINE, "Fund: company figures do not apply");
    assert.equal(v.securityType, "ETP");
    assert.deepEqual(v.sections.map((s) => s.key), ["dividends"]);
    assert.equal(v.coverage, null);
    assert.equal(v.source, SOURCE_LINE_FUND);
    const asCompany = companyView({ ...FUND_INPUT, kind: "company" });
    assert.deepEqual(v.last, asCompany.last);
    assert.deepEqual(v.chart, asCompany.chart);
    assert.deepEqual(v.sections[0], asCompany.sections.find((s) => s.key === "dividends"));
  });
  it("FD-08: company / unknown / unclassified views are unchanged", () => {
    const six = ["profile", "margins", "returns", "valuation", "growth", "dividends"];
    for (const kind of ["company", "unknown", undefined] as const) {
      const v = companyView({ ...FUND_INPUT, kind });
      assert.deepEqual(v.sections.map((s) => s.key), six);
      assert.equal(v.fund, null);
      assert.equal(v.coverage, NOT_COVERED_LINE);
      assert.equal(v.source, SOURCE_LINE_UNCOVERED);
    }
    assert.equal(companyView({ ...FUND_INPUT, kind: undefined }).kind, "unknown");
    assert.equal(companyView({ ...FUND_INPUT, kind: "company", covered: true, fundamentalsSource: "esef" }).source, SOURCE_LINE_ESEF);
    assert.equal(companyView({ ...FUND_INPUT, kind: "company", covered: true }).source, SOURCE_LINE);
  });
  it("FD-08: loadCompany reads the stored kind (fund for VDY.TO, company for PLTR, unknown before the job)", async () => {
    const before = await loadCompany(db, "u1", "VDY.TO", "2026-10-14");
    assert.ok(before.status === "ok" && before.view.kind === "unknown" && before.view.sections.length === 6);
    await refreshClassification(db, createOpenFigiSource({ post: fakePost().post }), { nowMs: NOW, sleep: noSleep });
    const f = await loadCompany(db, "u1", "VDY.TO", "2026-10-14");
    assert.ok(f.status === "ok");
    if (f.status !== "ok") return;
    assert.deepEqual([f.view.kind, f.view.fund, f.view.securityType], ["fund", FUND_LINE, "ETP"]);
    assert.deepEqual(f.view.sections.map((s) => s.key), ["dividends"]);
    const p = await loadCompany(db, "u1", "PLTR", "2026-10-14");
    assert.ok(p.status === "ok" && p.view.kind === "company" && p.view.fund === null && p.view.sections.length === 6);
  });
});
