import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "node:fs";
import {
  EXPORT_UNAVAILABLE,
  handlePersonalFinanceChartRequest,
  handlePersonalFinanceReportExportRequest,
  handlePersonalFinanceReportItemRequest,
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceReportsRequest,
  handlePersonalFinanceRequest,
  handlePersonalFinanceSeriesRequest,
  PF_CHART_ALLOW,
  PF_EXPORT_ALLOW,
  PF_REPORT_ALLOW,
  PF_REPORT_ITEM_ALLOW,
  PF_REPORTS_ALLOW,
  PF_SERIES_ALLOW,
} from "./account.server.ts";
import {
  CHARTS_ALLOW,
  CHARTS_MESSAGES,
  CHARTS_ROUTES,
  chartQuery,
  chartSaved,
  createReport,
  deleteReport,
  errorCode,
  exportReport,
  exportUrl,
  getReport,
  listReports,
  seriesQuery,
  updateReport,
  type ChartsApiError,
  type Result,
} from "./charts-api.ts";
import { DEFAULT_NAME_FIXED, NAME_MAX, NAME_TAKEN, REPORT_LIMIT, REPORT_NOT_FOUND, REPORTS_BODY_MAX, REPORTS_MAX } from "./reports.ts";
import { INVALID_REPORT, RANGE_MONTHS_MAX, REPORT_MAX_BYTES, REPORT_TOO_LARGE, SERIES_MAX, type Report } from "./report.ts";
import { CHART_MAX_BYTES, NO_SAVED_REPORT } from "./chart.ts";
import { SERIES_MAX_BYTES } from "./series.ts";
import { crc32 } from "./export.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";

// #158 (spec section 40, PFAPI-04..PFAPI-13): the chart report API contract end to end on PGlite (migrations
// 0010-0012, unchanged) through the REAL handlers, called via the typed client (`charts-api.ts`) with a fetch that
// dispatches to the handlers exactly like the route files do. alice owns; bob is a Read CFO; dave has no PF grant.
// Runs under TZ=UTC and TZ=America/Los_Angeles (npm test both ways).
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string | null, e: Record<string, string> = env) => ({
  env: e,
  getUser: async () => (id ? { id, email: `${id}@example.com` } : null),
  getDb: async () => db,
});
const NOW = new Date("2026-10-16T16:00:00Z");
const clock = () => NOW;

/** The route table, as the six route files wire it (path → handler). */
function dispatch(who: string | null, e: Record<string, string> = env) {
  return async (input: string, init: RequestInit = {}): Promise<Response> => {
    const req = new Request(`http://localhost${input}`, init);
    const path = new URL(req.url).pathname;
    const d = as(who, e);
    if (path === "/api/personal-finance/series") return handlePersonalFinanceSeriesRequest(req, d, clock);
    if (path === "/api/personal-finance/chart") return handlePersonalFinanceChartRequest(req, d, clock);
    if (path === "/api/personal-finance/reports") return handlePersonalFinanceReportsRequest(req, d);
    if (path === "/api/personal-finance/report") return handlePersonalFinanceReportRequest(req, d);
    let m = /^\/api\/personal-finance\/reports\/([^/]+)\/export$/.exec(path);
    if (m) return handlePersonalFinanceReportExportRequest(req, decodeURIComponent(m[1]), d, clock);
    m = /^\/api\/personal-finance\/reports\/([^/]+)$/.exec(path);
    if (m) return handlePersonalFinanceReportItemRequest(req, decodeURIComponent(m[1]), d);
    throw new Error(`no route ${path}`);
  };
}
const alice = dispatch("alice");
const ok = <T>(r: Result<T>, status = 200): T => {
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.status, status);
  return (r as { data: T }).data;
};
const refused = <T>(r: Result<T>): ChartsApiError => {
  assert.equal(r.ok, false, JSON.stringify(r));
  return r as ChartsApiError;
};
let base = 0;
const actions = async () => (await pg.query<{ action: string }>("SELECT action FROM audit_event WHERE id > $1 ORDER BY id", [base])).rows.map((r) => r.action);
const L = (id: string, amount: string, category = "", account = ""): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
const record = {
  [STORAGE_KEY]: JSON.stringify({ fixed: [L("rent", "1000", "Home", "Chequing")], variable: [], accounts: ["Chequing"], categories: ["Home"] }),
  [MONTHS_KEY]: JSON.stringify({
    "2026-03": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [L("t", "200", "Travel", "Chequing")], people: [] },
    "2026-09": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [], people: [] },
  }),
};
const R1: Report = { series: [{ kind: "group", id: "fixed" }], range: { preset: "12m" }, chart: "line" };
const R2: Report = { series: [{ kind: "group", id: "all" }, { kind: "metric", id: "expenses" }], range: { preset: "12m" }, chart: "bar" };

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "dave"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'), ('dave', 'dashboard', true, true, 'alice')`);
  const r = await handlePersonalFinanceRequest(new Request("http://localhost/api/personal-finance", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: record }) }), as("alice"));
  assert.equal(r.status, 200);
  // audit_event is append-only: later checks read rows after this baseline.
  base = (await pg.query<{ n: number }>("SELECT COALESCE(MAX(id), 0)::int AS n FROM audit_event")).rows[0].n;
});

describe("#158 PFAPI-04..06 end-to-end chain through the typed client and the real handlers", () => {
  it("create → chart → export pdf/png (audited) → update → chart (new values) → delete → chart/export/GET 404", async () => {
    // create
    const created = ok(await createReport({ name: "  Spend  ", report: R1 }, alice), 201);
    assert.match(created.id, /^r-[0-9a-f]{8}$/);
    assert.equal(created.name, "Spend");
    assert.equal(created.default, false);
    assert.deepEqual(created.report, R1);
    assert.equal(created.created_at, created.updated_at);
    const id = created.id;
    assert.deepEqual(ok(await getReport(id, alice)), created);
    assert.deepEqual(ok(await listReports(alice)).reports.map((r) => r.id), [id]);

    // chart it: { saved: true, id } === the same query sent directly
    const c1 = ok(await chartSaved(id, alice));
    assert.equal(c1.source, "saved");
    assert.equal(c1.chart, "line");
    const direct1 = ok(await chartQuery({ ...R1 }, alice));
    assert.deepEqual({ ...c1, source: "request" }, direct1);

    // export pdf and png: bytes embed exactly c1, one audit row each
    for (const f of ["pdf", "png"] as const) {
      const x = ok(await exportReport(id, f, alice));
      assert.equal(x.contentType, f === "pdf" ? "application/pdf" : "image/png");
      assert.match(x.filename ?? "", new RegExp(`^orpheus-report-spend-2026-10-16\\.${f}$`));
      const buf = Buffer.from(x.bytes);
      assert.deepEqual((f === "pdf" ? readPdf(buf) : readPng(buf, crc32)).data, c1, `${f} embeds the chart`);
    }
    const rows = (await pg.query<{ action: string; detail: string | null }>("SELECT action, detail FROM audit_event WHERE id > $1 ORDER BY id", [base])).rows;
    assert.deepEqual(rows.map((r) => r.action), ["pf.report_save", "pf.report_export", "pf.report_export"]);
    assert.match(rows[1].detail ?? "", /^format:pdf id:/);
    assert.match(rows[2].detail ?? "", /^format:png id:/);

    // update: new series and chart type; the chart shows the new values
    const updated = ok(await updateReport(id, { name: "Spend all", report: R2 }, alice));
    assert.equal(updated.created_at, created.created_at);
    assert.ok((updated.updated_at ?? "") >= (created.updated_at ?? ""));
    const c2 = ok(await chartSaved(id, alice));
    assert.equal(c2.chart, "bar");
    assert.deepEqual(c2.series.map((s) => [s.kind, s.id]), [["group", "all"], ["metric", "expenses"]]);
    assert.notDeepEqual(c2.series[0].values, c1.series[0].values, "all (fixed + variable) differs from fixed in 2026-03");
    const march = c2.months.indexOf("2026-03");
    assert.equal(c2.series[0].values[march], 1200);
    assert.equal(c1.series[0].values[c1.months.indexOf("2026-03")], 1000);
    const x2 = ok(await exportReport(id, "pdf", alice));
    assert.deepEqual(readPdf(Buffer.from(x2.bytes)).data, c2, "export after update embeds the new values");

    // delete; then chart / export / GET are all 404 (one code via the client)
    assert.deepEqual(ok(await deleteReport(id, alice)), { deleted: id });
    const gone = [refused(await chartSaved(id, alice)), refused(await exportReport(id, "pdf", alice)), refused(await exportReport(id, "png", alice)), refused(await getReport(id, alice)), refused(await deleteReport(id, alice))];
    assert.deepEqual(gone.map((g) => [g.status, g.code]), Array(5).fill([404, "not_found"]));
    assert.deepEqual(gone.map((g) => g.error), [NO_SAVED_REPORT, REPORT_NOT_FOUND, REPORT_NOT_FOUND, REPORT_NOT_FOUND, REPORT_NOT_FOUND]);
    assert.deepEqual(ok(await listReports(alice)).reports, []);

    // PFAPI-06: exactly these audit rows; reads and 404s write none
    assert.deepEqual(await actions(), ["pf.report_save", "pf.report_export", "pf.report_export", "pf.report_save", "pf.report_export", "pf.report_delete"]);
  });
});

describe("#158 PFAPI-07 / PFAPI-11 / PFAPI-13 one error shape, client codes", () => {
  it("every refusal is { ok:false, status, code, error, field? } with the contract code", async () => {
    const anon = dispatch(null);
    const u = refused(await listReports(anon));
    assert.deepEqual(u, { ok: false, status: 401, code: "unauthorized", error: "Unauthorized." });
    const off = refused(await listReports(dispatch("alice", { ...env, DASHBOARD_ENABLED: "false" })));
    assert.deepEqual([off.status, off.code, off.error], [404, "disabled", "Not found."]);
    const dave = refused(await listReports(dispatch("dave")));
    assert.deepEqual([dave.status, dave.code, dave.error], [403, "forbidden", "Forbidden."]);
    const bad = refused(await createReport({ name: "", report: R1 }, alice));
    assert.deepEqual(bad, { ok: false, status: 400, code: "invalid", error: INVALID_REPORT, field: "name" });
    const badChart = refused(await chartQuery({ ...R1, chart: "pie" as never }, alice));
    assert.deepEqual([badChart.code, badChart.field], ["invalid", "chart"]);
    const big = refused(await seriesQuery({ series: Array(400).fill({ kind: "group", id: "all" }), range: { preset: "all" } }, alice));
    assert.deepEqual([big.status, big.code, big.error], [413, "too_large", "Query too large."]);
    const a = ok(await createReport({ name: "Taken", report: R1 }, alice), 201);
    const dup = refused(await createReport({ name: "taken", report: R1 }, alice));
    assert.deepEqual([dup.status, dup.code, dup.error, dup.field], [409, "name_taken", NAME_TAKEN, "name"]);
    const fixed = refused(await updateReport("default", { name: "Other", report: R1 }, alice));
    assert.deepEqual([fixed.status, fixed.code, fixed.error], [400, "default_name_fixed", DEFAULT_NAME_FIXED]);
    // Q-AE1 / Q-AE2 as documented
    const nsr = refused(await chartSaved("r-00000000", alice));
    assert.deepEqual([nsr.status, nsr.error, nsr.code], [404, NO_SAVED_REPORT, "not_found"]);
    const mal = refused(await chartSaved("nope", alice));
    assert.deepEqual([mal.status, mal.field, mal.code], [400, "query", "invalid"]);
    for (const r of [await getReport("nope", alice), await exportReport("nope", "pdf", alice)]) assert.deepEqual([r.status, (r as ChartsApiError).code], [404, "not_found"]);
    const fmt = refused(await exportReport(a.id, "gif" as never, alice));
    assert.deepEqual([fmt.status, fmt.code, fmt.field], [400, "invalid", "format"]);
    // PFAPI-13: bob (Read CFO) cannot see alice's report through any route
    const bob = dispatch("bob");
    for (const r of [await getReport(a.id, bob), await chartSaved(a.id, bob), await exportReport(a.id, "pdf", bob)]) assert.deepEqual([r.status, (r as ChartsApiError).code], [404, "not_found"]);
    // network failure and the limit code
    assert.equal(refused(await listReports(async () => { throw new Error("offline"); })).code, "network");
    assert.equal(errorCode(409, REPORT_LIMIT), "limit");
    assert.equal(errorCode(503, EXPORT_UNAVAILABLE), "export_unavailable");
    assert.equal(errorCode(403, "Change your password first."), "must_change_password");
    assert.equal(errorCode(400, "Body must be a JSON object."), "bad_json");
    ok(await deleteReport(a.id, alice));
  });
});

describe("#158 PFAPI-08 the client sends exactly what the routes accept", () => {
  it("client and raw requests give byte-identical responses", async () => {
    const seen: { url: string; method: string; ct: string | null; body: string | null }[] = [];
    const spy = async (input: string, init: RequestInit = {}) => {
      seen.push({ url: input, method: init.method ?? "GET", ct: new Headers(init.headers).get("content-type"), body: (init.body as string) ?? null });
      return alice(input, init);
    };
    const viaClient = ok(await chartQuery({ ...R1 }, spy));
    const raw = await (await alice("/api/personal-finance/chart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(R1) })).text();
    assert.equal(JSON.stringify(viaClient), raw);
    await seriesQuery({ series: R1.series, range: R1.range }, spy);
    await chartSaved(undefined, spy);
    await listReports(spy);
    assert.deepEqual(seen.map((s) => [s.method, s.url, s.ct, s.body]), [
      ["POST", "/api/personal-finance/chart", "application/json", JSON.stringify(R1)],
      ["POST", "/api/personal-finance/series", "application/json", JSON.stringify({ series: R1.series, range: R1.range })],
      ["POST", "/api/personal-finance/chart", "application/json", '{"saved":true}'],
      ["GET", "/api/personal-finance/reports", null, null],
    ]);
    assert.equal(exportUrl("r-0000abcd", "png"), "/api/personal-finance/reports/r-0000abcd/export?format=png");
    assert.equal(CHARTS_ROUTES.report("default"), "/api/personal-finance/reports/default");
  });
});

describe("#158 PFAPI-02 / PFAPI-10 405 Allow and HEAD", () => {
  it("every route's 405 carries the contract Allow list; HEAD mirrors GET", async () => {
    const cases: [string, string, readonly string[]][] = [
      ["/api/personal-finance/series", "GET", CHARTS_ALLOW.series],
      ["/api/personal-finance/chart", "HEAD", CHARTS_ALLOW.chart],
      ["/api/personal-finance/reports", "DELETE", CHARTS_ALLOW.reports],
      ["/api/personal-finance/reports/default", "POST", CHARTS_ALLOW.reportItem],
      ["/api/personal-finance/reports/default/export?format=pdf", "PUT", CHARTS_ALLOW.export],
      ["/api/personal-finance/report", "POST", CHARTS_ALLOW.legacyReport],
    ];
    for (const [path, method, allow] of cases) {
      for (const who of ["alice", null]) {
        const r = await dispatch(who)(path, { method });
        assert.equal(r.status, 405, `${method} ${path}`);
        assert.equal(r.headers.get("allow"), allow.join(", "));
        assert.equal(r.headers.get("cache-control"), "no-store");
        assert.deepEqual(await r.json(), { error: CHARTS_MESSAGES.methodNotAllowed });
      }
    }
    const a = ok(await createReport({ name: "Head", report: R1 }, alice), 201);
    const before = (await actions()).length;
    for (const path of ["/api/personal-finance/reports", `/api/personal-finance/reports/${a.id}`, `/api/personal-finance/reports/${a.id}/export?format=png`]) {
      const g = await alice(path, { method: "GET" });
      const h = await alice(path, { method: "HEAD" });
      assert.equal(h.status, g.status, path);
      for (const k of ["content-type", "cache-control", "x-robots-tag"]) assert.equal(h.headers.get(k), g.headers.get(k), `${path} ${k}`);
    }
    const h = await alice(`/api/personal-finance/reports/${a.id}/export?format=png`, { method: "HEAD" });
    assert.equal((await h.arrayBuffer()).byteLength, 0);
    assert.deepEqual((await actions()).slice(before), ["pf.report_export"], "only the GET export audits; HEAD writes no row");
    ok(await deleteReport(a.id, alice));
  });
});

describe("#158 PFAPI-09 the contract doc matches the code (drift guard)", () => {
  const doc = readFileSync(new URL("../../../attachments/pf-charts-api-contract.md", import.meta.url), "utf8");
  it("Allow lists match the handlers, the client and the doc's route table", () => {
    const server = { series: PF_SERIES_ALLOW, chart: PF_CHART_ALLOW, reports: PF_REPORTS_ALLOW, reportItem: PF_REPORT_ITEM_ALLOW, export: PF_EXPORT_ALLOW, legacyReport: PF_REPORT_ALLOW };
    const rows: Record<keyof typeof server, RegExp> = {
      series: /\| R1 \| `\/api\/personal-finance\/series` \| `([^`]+)` \|/,
      chart: /\| R2 \| `\/api\/personal-finance\/chart` \| `([^`]+)` \|/,
      reports: /\| R3 \| `\/api\/personal-finance\/reports` \| `([^`]+)` \|/,
      reportItem: /\| R4 \| `\/api\/personal-finance\/reports\/:id` \| `([^`]+)` \|/,
      export: /\| R5 \| `\/api\/personal-finance\/reports\/:id\/export\?format=pdf\\\|png` \| `([^`]+)` \|/,
      legacyReport: /\| L1 \| `\/api\/personal-finance\/report` \(legacy, #153\) \| `([^`]+)` \|/,
    };
    for (const k of Object.keys(server) as (keyof typeof server)[]) {
      assert.deepEqual([...CHARTS_ALLOW[k]], [...server[k]], `client ${k}`);
      const m = rows[k].exec(doc);
      assert.ok(m, `doc row ${k}`);
      assert.equal(m![1], server[k].join(", "), `doc ${k}`);
    }
  });
  it("every route file exists and wires the handler the contract names", () => {
    const files: [string, string][] = [
      ["personal-finance_.series.ts", "handlePersonalFinanceSeriesRequest"],
      ["personal-finance_.chart.ts", "handlePersonalFinanceChartRequest"],
      ["personal-finance_.reports.ts", "handlePersonalFinanceReportsRequest"],
      ["personal-finance_.reports_.$id.ts", "handlePersonalFinanceReportItemRequest"],
      ["personal-finance_.reports_.$id_.export.ts", "handlePersonalFinanceReportExportRequest"],
      ["personal-finance_.report.ts", "handlePersonalFinanceReportRequest"],
    ];
    for (const [f, h] of files) {
      const u = new URL(`../../routes/api/${f}`, import.meta.url);
      assert.ok(existsSync(u), f);
      assert.match(readFileSync(u, "utf8"), new RegExp(`${h}\\(`), f);
    }
  });
  it("every message is in the doc verbatim and equals the server constant", () => {
    const sec5 = doc.slice(doc.indexOf("## 5. Messages"), doc.indexOf("## 6."));
    for (const [k, v] of Object.entries(CHARTS_MESSAGES)) assert.ok(sec5.includes(`\`${v}\``), `doc section 5 has ${k}: ${v}`);
    assert.equal((sec5.match(/`[^`]+`/g) ?? []).length, Object.keys(CHARTS_MESSAGES).length, "no extra messages in the doc");
    const M = CHARTS_MESSAGES;
    assert.deepEqual(
      [M.reportNotFound, M.noSavedReport, M.reportLimit, M.nameTaken, M.defaultNameFixed, M.invalid, M.reportTooLarge, M.exportUnavailable],
      [REPORT_NOT_FOUND, NO_SAVED_REPORT, REPORT_LIMIT, NAME_TAKEN, DEFAULT_NAME_FIXED, INVALID_REPORT, REPORT_TOO_LARGE, EXPORT_UNAVAILABLE],
    );
    const codes = doc.slice(doc.indexOf("## 6."), doc.indexOf("## 7."));
    for (const c of ["disabled", "method_not_allowed", "unauthorized", "forbidden", "must_change_password", "storage_unavailable", "export_unavailable", "bad_json", "invalid", "default_name_fixed", "too_large", "not_found", "name_taken", "limit", "network", "unknown"])
      assert.ok(codes.includes(`| \`${c}\` |`), `code ${c}`);
  });
  it("limits in the doc match the constants", () => {
    assert.deepEqual([SERIES_MAX_BYTES, CHART_MAX_BYTES, REPORT_MAX_BYTES, REPORTS_BODY_MAX, REPORTS_MAX, NAME_MAX, SERIES_MAX, RANGE_MONTHS_MAX], [4096, 4096, 4096, 4608, 20, 60, 12, 24]);
    const lim = doc.slice(doc.indexOf("## 4. Limits"), doc.indexOf("## 5."));
    for (const s of ["1..12", "≤ 24 months", "20 per person", "1..60", "4096 B", "4608 B"]) assert.ok(lim.includes(s), s);
  });
  it("is linked from the spec, README and AGENTS", () => {
    for (const f of ["attachments/personal-finance-spec.md", "README.md", "AGENTS.md"])
      assert.ok(readFileSync(new URL(`../../../${f}`, import.meta.url), "utf8").includes("attachments/pf-charts-api-contract.md"), f);
  });
});
