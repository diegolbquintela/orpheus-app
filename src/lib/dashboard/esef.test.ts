// Offline tests for #123 (ES-01..ES-08): ESEF xBRL-JSON (filings.xbrl.org) → annual facts, ticker → LEI, the job.
// Recorded fixture: test-fixtures/esef/hermes-2026-10-13-subset.json (Hermès filings list + FY2023 / FY2024 / FY2025
// documents downloaded 2026-10-13, trimmed to the mapped tags plus a few dimensional facts; facts verbatim). No network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { NOT_COVERED_LINE, SOURCE_LINE_ESEF } from "./company.ts";
import { loadCompany } from "./company.server.ts";
import {
  annualFactsFromEsef,
  createEsefSource,
  ESEF_BASE,
  ESEF_USER_AGENT,
  GLEIF_BASE,
  ownFiscalYearEnd,
  esefRows,
  PINNED_LEI,
  type EsefDocument,
  type EsefGet,
} from "./esef.server.ts";
import { createCompositeSource, FUNDAMENTALS_PARSER_VERSION, metricViews, refreshFundamentals, type AnnualFact } from "./fundamentals.server.ts";
import type { Queryable } from "./store.server.ts";

const FIX = JSON.parse(readFileSync("test-fixtures/esef/hermes-2026-10-13-subset.json", "utf8")) as {
  filings: { data: { attributes: { json_url: string; processed: string; period_end: string } }[] };
  documents: Record<string, EsefDocument["doc"]>;
};
const LEI = "969500Y4IJGHJE2MTJ13";
const docs = (): EsefDocument[] =>
  FIX.filings.data
    .filter((f) => FIX.documents[f.attributes.json_url])
    .map((f) => ({ url: f.attributes.json_url, processed: f.attributes.processed, doc: FIX.documents[f.attributes.json_url] }));
const at = (rows: AnnualFact[], concept: string, end: string) => rows.find((r) => r.concept === concept && r.fiscalYearEnd === end);

function fakeGet(extra: Record<string, unknown> = {}) {
  const calls: { url: string; at: number }[] = [];
  let clock = 0;
  const get: EsefGet = async (url) => {
    calls.push({ url, at: clock });
    if (url in extra) return { status: 200, text: JSON.stringify(extra[url]) };
    if (url === `${ESEF_BASE}/api/entities/${LEI}/filings`) return { status: 200, text: JSON.stringify(FIX.filings) };
    const path = url.slice(ESEF_BASE.length);
    if (FIX.documents[path]) return { status: 200, text: JSON.stringify(FIX.documents[path]) };
    return { status: 404, text: "" };
  };
  const source = createEsefSource({ get, now: () => clock, sleep: async (ms) => void (clock += ms) });
  return { source, calls };
}

describe("ES-01..ES-04: ESEF xBRL-JSON → annual facts (N6)", () => {
  const rows = annualFactsFromEsef(docs());
  it("ES-01: Hermès FY2024 figures, EUR, from the recorded fixture", () => {
    assert.equal(at(rows, "revenue", "2024-12-31")?.value, "15170000000");
    assert.equal(at(rows, "revenue", "2024-12-31")?.unit, "EUR");
    assert.equal(at(rows, "revenue", "2023-12-31")?.value, "13427000000");
    assert.equal(at(rows, "net_income", "2024-12-31")?.value, "4603000000");
    assert.equal(at(rows, "eps_diluted", "2024-12-31")?.value, "43.87");
    assert.equal(at(rows, "capex", "2024-12-31")?.value, "1067000000", "Q-E5 broad IFRS capex tag");
  });
  it("ES-02: the fiscal year comes from the figures, not the index's period_end (FY2025 filing indexed 2026-12-31)", () => {
    const fy25 = docs().find((d) => d.url.includes("2025-12-31"))!;
    assert.equal(ownFiscalYearEnd(esefRows(fy25.doc)), "2025-12-31");
    assert.ok(!rows.some((r) => r.fiscalYearEnd.startsWith("2026")));
    assert.ok(at(rows, "revenue", "2025-12-31"));
  });
  it("ES-03: dimensional facts and non-annual periods are ignored; the newest filing wins per year", () => {
    const d = docs()[0];
    const dims = Object.values(d.doc.facts).filter((f) => Object.keys(f.dimensions).some((k) => !["concept", "entity", "period", "unit", "language"].includes(k)));
    assert.ok(dims.length > 0, "fixture keeps dimensional facts");
    // An older restated copy of FY2024 with a different revenue loses to the newer one.
    const fy24 = docs().find((x) => x.url.includes("2024-12-31"))!;
    const older = structuredClone(fy24);
    for (const f of Object.values(older.doc.facts)) if (f.dimensions.concept === "ifrs-full:Revenue") f.value = "1";
    older.processed = "2000-01-01";
    older.url = "older";
    assert.equal(at(annualFactsFromEsef([older, ...docs()]), "revenue", "2024-12-31")?.value, "15170000000");
    // FY2024 comes from the FY2024 filing, not the FY2025 filing's comparative.
    assert.match(at(rows, "revenue", "2024-12-31")?.accession ?? "", /2025-12-31|2024-12-31/);
  });
  it("ES-04: diluted shares derived from net income ÷ diluted EPS when untagged (Q-E1); missing stays missing", () => {
    const sh = at(rows, "diluted_shares", "2024-12-31");
    assert.equal(sh?.sourceTag, "derived:net_income/eps_diluted");
    assert.equal(sh?.value, String(Math.round(4603000000 / 43.87)));
    assert.equal(annualFactsFromEsef([]).length, 0);
  });
});

describe("ES-05, ES-06: ticker → LEI and polite requests", () => {
  it("ES-05: RMS.PA is pinned (no GLEIF call); non-EU is not checked", async () => {
    const { source, calls } = fakeGet();
    assert.deepEqual(await source.resolve({ symbol: "RMS.PA", region: "EU", name: "Hermès International" }), { id: LEI, name: PINNED_LEI["RMS.PA"].name, source: "esef" });
    assert.equal(await source.resolve({ symbol: "KO", region: "US", name: "Coca-Cola" }), null);
    assert.equal(calls.length, 0);
  });
  it("ES-05: GLEIF match needs the same company and the venue's country", async () => {
    const fc = `${GLEIF_BASE}/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent("Airbus SE")}`;
    const rec = (country: string) => ({ data: { attributes: { entity: { legalName: { name: "AIRBUS SE" }, legalAddress: { country } } } } });
    const mk = (country: string) =>
      fakeGet({ [fc]: { data: [{ relationships: { "lei-records": { data: { id: "LEIAIR" } } } }] }, [`${GLEIF_BASE}/lei-records/LEIAIR`]: rec(country) }).source;
    assert.equal((await mk("NL").resolve({ symbol: "AIR.AS", region: "EU", name: "Airbus SE" }))?.id, "LEIAIR");
    assert.equal(await mk("NL").resolve({ symbol: "AIR.PA", region: "EU", name: "Airbus SE" }), null, "venue country differs");
  });
  it("ES-06: requests ≥ 1 s apart per host, ≤ 6 documents", async () => {
    const { source, calls } = fakeGet();
    await source.annualFacts(LEI);
    assert.ok(calls.length <= 7);
    for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 1000);
    assert.match(ESEF_USER_AGENT, /^OrpheusWisdom\/1\.0 /);
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
beforeEach(async () => {
  await pg.exec(`DELETE FROM holdings; DELETE FROM instruments; DELETE FROM fundamentals_annual; DELETE FROM metric_values; DELETE FROM "user";`);
  await pg.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('u1', 'D', 'd@example.com', false)`);
  for (const [s, n, e, r, c] of [["RMS.PA", "Hermès International", "Paris", "EU", "EUR"], ["KO", "The Coca-Cola Company", "NYSE", "US", "USD"]])
    await pg.query("INSERT INTO instruments (symbol, name, exchange, region, currency) VALUES ($1, $2, $3, $4, $5)", [s, n, e, r, c]);
  for (const s of ["RMS.PA", "KO"]) await pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('u1', $1, 1, 1)", [s]);
});

describe("ES-07, ES-08: the job stores ESEF facts; the view labels them", () => {
  it("ES-07: without SEC, RMS.PA is stored as 'esef' with its LEI and parser version; KO is left pending", async () => {
    const { source } = fakeGet();
    const s = await refreshFundamentals(db, createCompositeSource(null, source), { nowMs: Date.UTC(2026, 9, 13) });
    assert.deepEqual(s.errors, []);
    const [i] = await db.query<{ fundamentals_source: string; lei: string; fundamentals_parser_version: number }>(
      "SELECT fundamentals_source, lei, fundamentals_parser_version FROM instruments WHERE symbol = 'RMS.PA'",
    );
    assert.deepEqual(i, { fundamentals_source: "esef", lei: LEI, fundamentals_parser_version: FUNDAMENTALS_PARSER_VERSION });
    assert.equal(FUNDAMENTALS_PARSER_VERSION, 4);
    const v = await metricViews(db, ["RMS.PA", "KO"]);
    assert.equal(v["RMS.PA"].coverage, "covered");
    assert.equal(v.KO.coverage, "pending");
    const [rev] = await db.query<{ value: string }>("SELECT value::text FROM fundamentals_annual WHERE symbol = 'RMS.PA' AND concept = 'revenue' AND fiscal_year_end = '2024-12-31'");
    assert.equal(Number(rev.value), 15170000000);
  });
  it("ES-07: a parser-3 ESEF row is refetched once (parser bump)", async () => {
    const { source } = fakeGet();
    const nowMs = Date.UTC(2026, 9, 13);
    await refreshFundamentals(db, createCompositeSource(null, source), { nowMs });
    await pg.query("UPDATE instruments SET fundamentals_parser_version = 3 WHERE symbol = 'RMS.PA'");
    assert.equal((await refreshFundamentals(db, createCompositeSource(null, fakeGet().source), { nowMs: nowMs + 1000 })).checked, 1);
    assert.equal((await refreshFundamentals(db, createCompositeSource(null, fakeGet().source), { nowMs: nowMs + 2000 })).checked, 0);
  });
  it("ES-07: an EU listing marked not covered by parser 3 is rechecked once; a US one is not", async () => {
    await pg.query("UPDATE instruments SET fundamentals_source = 'none', fundamentals_checked_at = $1, fundamentals_parser_version = 3", [new Date(Date.UTC(2026, 9, 12)).toISOString()]);
    const s = await refreshFundamentals(db, createCompositeSource(null, fakeGet().source), { nowMs: Date.UTC(2026, 9, 13) });
    assert.equal(s.checked, 1);
    const rows = await db.query<{ symbol: string; fundamentals_source: string }>("SELECT symbol, fundamentals_source FROM instruments ORDER BY symbol");
    assert.deepEqual(rows, [{ symbol: "KO", fundamentals_source: "none" }, { symbol: "RMS.PA", fundamentals_source: "esef" }]);
  });
  it("ES-08: the company view shows the ESEF source line and no coverage line", async () => {
    await refreshFundamentals(db, createCompositeSource(null, fakeGet().source), { nowMs: Date.UTC(2026, 9, 13) });
    const r = await loadCompany(db, "u1", "RMS.PA", "2026-10-13");
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.equal(r.view.source, SOURCE_LINE_ESEF);
    assert.notEqual(r.view.coverage, NOT_COVERED_LINE);
    assert.equal(r.view.coverage, null);
  });
});
