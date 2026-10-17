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
import { RANGE_PRESETS } from "./report.ts";
import { FIRST_MONTH } from "./months.ts";
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
function dispatch(who: string | null, e: Record<string, string> = env, getDb?: () => Promise<unknown>) {
  return async (input: string, init: RequestInit = {}): Promise<Response> => {
    const req = new Request(`http://localhost${input}`, init);
    const path = new URL(req.url).pathname;
    const d = getDb ? ({ ...as(who, e), getDb } as never as ReturnType<typeof as>) : as(who, e);
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

// ---- #158 QA round 1 F2 (2026-10-17): every doc message and cap tied to the SERVER (wire output), not the client ----
describe("#158 F2 contract section 8: every message × route and every cap, driven through the real handlers", () => {
  const doc = readFileSync(new URL("../../../attachments/pf-charts-api-contract.md", import.meta.url), "utf8");
  const sec = (from: string, to?: string) => doc.slice(doc.indexOf(from), to ? doc.indexOf(to, doc.indexOf(from) + 1) : undefined);
  const table = (from: string, to?: string) =>
    sec(from, to).split("\n").filter((l) => /^\| `?[^-|]/.test(l) && !/^\| (Message|Cap) \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const MSGS = table("### 8.1", "### 8.2").map(([m, st, routes]) => ({ msg: m.replace(/^`|`$/g, ""), status: Number(st), routes: routes.split(/\s+/) }));
  const CAPS = table("### 8.2", "## 9.").map(([cap, value, routes, constant]) => ({ cap, value, routes: routes.split(/\s+/), constant }));
  const ROUTE = { R1: "/api/personal-finance/series", R2: "/api/personal-finance/chart", R3: "/api/personal-finance/reports", R4: "/api/personal-finance/reports/default", R5: "/api/personal-finance/reports/default/export?format=pdf", L1: "/api/personal-finance/report" } as const;
  type RK = keyof typeof ROUTE;
  const OK_METHOD: Record<RK, string> = { R1: "POST", R2: "POST", R3: "GET", R4: "GET", R5: "GET", L1: "GET" };
  const WRITE: Record<string, [string, string]> = { R1: ["POST", ROUTE.R1], R2: ["POST", ROUTE.R2], R3: ["POST", ROUTE.R3], R4: ["PUT", ROUTE.R4], L1: ["PUT", ROUTE.L1] };
  const J = { "content-type": "application/json" };
  const call = (d: ReturnType<typeof dispatch>, method: string, path: string, body?: string) => d(path, { method, headers: J, body });
  const failingAudit = async () => ({ query: async (text: string, params?: unknown[]) => {
    if (/INSERT INTO audit_event/.test(text)) throw new Error("audit down");
    return (await pg.query(text, params)).rows;
  } });
  /** A body of exactly n bytes that is valid JSON. */
  const sized = (n: number) => `{"x":"${"a".repeat(n - 8)}"}`;
  const bob = dispatch("bob");
  let named = "";
  before(async () => {
    await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', ["eve", "eve@example.com"]);
    await pg.query("INSERT INTO account_state (user_id, must_change_password) VALUES ('eve', true) ON CONFLICT (user_id) DO UPDATE SET must_change_password = true");
    named = ok(await createReport({ name: "F2 named", report: R1 }, bob), 201).id;
  });

  const trigger = async (msg: string, k: RK): Promise<Response> => {
    const M = CHARTS_MESSAGES;
    const [wm, wp] = WRITE[k] ?? ["GET", ROUTE[k]];
    switch (msg) {
      case M.disabled: return call(dispatch("alice", { ...env, DASHBOARD_ENABLED: "false" }), OK_METHOD[k], ROUTE[k]);
      case M.methodNotAllowed: return call(alice, "PATCH", ROUTE[k]);
      case M.unauthorized: return call(dispatch(null), OK_METHOD[k], ROUTE[k]);
      case M.forbidden: return call(dispatch("dave"), OK_METHOD[k], ROUTE[k]);
      case M.mustChange: return call(dispatch("eve"), OK_METHOD[k], ROUTE[k]);
      case M.storage: return call(dispatch("alice", env, async () => null), OK_METHOD[k], ROUTE[k]);
      case M.badJson: return call(bob, wm, wp, "{");
      case M.notObject: return call(bob, wm, wp, "[]");
      case M.invalid:
        if (k === "R5") return call(bob, "GET", "/api/personal-finance/reports/default/export?format=gif");
        return call(bob, wm, wp, k === "L1" ? '{"report":{}}' : "{}");
      case M.queryTooLarge:
      case M.reportTooLarge: {
        const cap = Number(CAPS.find((c) => c.cap === "body-bytes" && c.routes.includes(k))!.value);
        return call(bob, wm, wp, sized(cap + 1));
      }
      case M.noSavedReport: return call(bob, "POST", ROUTE.R2, '{"saved":true,"id":"r-00000000"}');
      case M.reportNotFound: return call(bob, "GET", k === "R5" ? "/api/personal-finance/reports/r-00000000/export?format=pdf" : "/api/personal-finance/reports/r-00000000");
      case M.nameTaken:
        return k === "R3" ? call(bob, "POST", ROUTE.R3, JSON.stringify({ name: "default", report: R1 })) : call(bob, "PUT", `/api/personal-finance/reports/${named}`, JSON.stringify({ name: "DEFAULT", report: R1 }));
      case M.defaultNameFixed: return call(bob, "PUT", ROUTE.R4, JSON.stringify({ name: "Other", report: R1 }));
      case M.exportUnavailable: {
        await call(bob, "PUT", ROUTE.R4, JSON.stringify({ report: R1 }));
        return call(dispatch("bob", env, failingAudit), "GET", ROUTE.R5);
      }
      case M.reportLimit: {
        const have = ok(await listReports(bob)).reports.filter((r) => !r.default).length;
        const cap = Number(CAPS.find((c) => c.cap === "named-reports")!.value);
        const made: string[] = [];
        for (let i = have; i < cap; i++) made.push(ok(await createReport({ name: `lim ${i}`, report: R1 }, bob), 201).id);
        const r = await call(bob, "POST", ROUTE.R3, JSON.stringify({ name: "one too many", report: R1 }));
        for (const id of made) ok(await deleteReport(id, bob));
        return r;
      }
    }
    throw new Error(`no trigger for ${msg}`);
  };

  it("the 8.1 table lists exactly the section 5 messages (no more, no fewer)", () => {
    const sec5 = (sec("## 5. Messages", "## 6.").match(/`[^`]+`/g) ?? []).map((m) => m.slice(1, -1));
    assert.deepEqual(MSGS.map((m) => m.msg).sort(), [...sec5].sort());
    assert.equal(MSGS.length, 17);
    assert.deepEqual(Object.values(CHARTS_MESSAGES).sort(), [...sec5].sort(), "the client's copy equals the doc too");
  });

  it("each message × route in 8.1: the real handler answers that status with exactly that error text (JSON, no-store)", async () => {
    const errLog = console.error;
    console.error = () => {};
    try {
      let n = 0;
      for (const m of MSGS)
        for (const k of m.routes as RK[]) {
          assert.ok(k in ROUTE, `route ${k}`);
          const r = await trigger(m.msg, k);
          const body = (await r.json()) as { error?: string };
          assert.deepEqual([r.status, body.error], [m.status, m.msg], `${m.msg} on ${k}`);
          assert.equal(r.headers.get("cache-control"), "no-store", `${m.msg} on ${k}`);
          n++;
        }
      assert.equal(n, 61, "message × route pairs driven");
    } finally {
      console.error = errLog;
    }
  });

  it("each cap in 8.2 equals its server constant and holds at the boundary on every route listed", async () => {
    const CONST: Record<string, number> = { SERIES_MAX_BYTES, CHART_MAX_BYTES, REPORTS_BODY_MAX, REPORT_MAX_BYTES, SERIES_MAX, RANGE_MONTHS_MAX, REPORTS_MAX, NAME_MAX };
    assert.deepEqual(CAPS.map((c) => c.cap), ["body-bytes", "body-bytes", "body-bytes", "body-bytes", "series-max", "saved-custom-range-months", "query-custom-range-months", "named-reports", "name-chars"]);
    for (const c of CAPS) {
      if (c.value === "none") continue;
      const name = c.constant.replace(/`/g, "");
      assert.equal(Number(c.value), CONST[name], `${c.cap} ${c.routes} = ${name}`);
    }
    for (const c of CAPS.filter((x) => x.cap === "body-bytes"))
      for (const k of c.routes) {
        const [m, p] = WRITE[k];
        const v = Number(c.value);
        assert.notEqual((await call(bob, m, p, sized(v))).status, 413, `${k}: ${v} bytes is allowed`);
        assert.equal((await call(bob, m, p, sized(v + 1))).status, 413, `${k}: ${v + 1} bytes is 413`);
      }
    const sm = Number(CAPS.find((c) => c.cap === "series-max")!.value);
    const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: "line" as const, id: `l${i}` }));
    assert.equal((await seriesQuery({ series: lines(sm), range: { preset: "12m" } }, bob)).status, 200);
    assert.equal(refused(await seriesQuery({ series: lines(sm + 1), range: { preset: "12m" } }, bob)).field, "series");
    assert.equal((await chartQuery({ series: lines(sm), range: { preset: "12m" }, chart: "line" }, bob)).status, 200);
    assert.equal(refused(await chartQuery({ series: lines(sm + 1), range: { preset: "12m" }, chart: "line" }, bob)).field, "series");
    const atMax = ok(await createReport({ name: "series max", report: { ...R1, series: lines(sm) } }, bob), 201);
    ok(await deleteReport(atMax.id, bob));
    assert.equal(refused(await createReport({ name: "series max+1", report: { ...R1, series: lines(sm + 1) } }, bob)).field, "report.series");
    const rm = Number(CAPS.find((c) => c.cap === "saved-custom-range-months")!.value);
    const span = (n: number) => ({ from: "2024-01", to: `${2024 + Math.floor((n - 1) / 12)}-${String(((n - 1) % 12) + 1).padStart(2, "0")}` });
    const inRange = ok(await createReport({ name: "range max", report: { ...R1, range: span(rm) } }, bob), 201);
    ok(await deleteReport(inRange.id, bob));
    assert.equal(refused(await createReport({ name: "range max+1", report: { ...R1, range: span(rm + 1) } }, bob)).field, "report.range");
    assert.equal(CAPS.find((c) => c.cap === "query-custom-range-months")!.value, "none");
    for (const q of [seriesQuery({ series: R1.series, range: { from: "2020-01", to: "2026-10" } }, bob), chartQuery({ ...R1, range: { from: "2020-01", to: "2026-10" } }, bob)])
      assert.equal((await q).status, 200, "R1 / R2: an 82-month custom range is allowed (no cap)");
    const nm = Number(CAPS.find((c) => c.cap === "name-chars")!.value);
    const longOk = ok(await createReport({ name: "n".repeat(nm), report: R1 }, bob), 201);
    ok(await deleteReport(longOk.id, bob));
    assert.equal(refused(await createReport({ name: "n".repeat(nm + 1), report: R1 }, bob)).field, "name");
  });

  it("every cap written in the prose (sections 3 and 4) matches the 8.2 values", () => {
    const BYTE_CAPS = new Set([SERIES_MAX_BYTES, CHART_MAX_BYTES, REPORTS_BODY_MAX, REPORT_MAX_BYTES]);
    const prose = sec("## 3. Per route", "## 5.");
    for (const n of prose.match(/\b\d{4}\b/g) ?? []) if (!["2000", "2020", "2100"].includes(n)) assert.ok(BYTE_CAPS.has(Number(n)), `prose byte cap ${n} is a server constant`);
    const r1 = sec("### R1", "### R2"), r2 = sec("### R2", "### R3"), r3 = sec("### R3", "### R4"), l1 = sec("### L1", "## 4."), lim = sec("## 4. Limits", "## 5.");
    assert.ok(r1.includes(`(> ${SERIES_MAX_BYTES} bytes)`), "R1 413 cap");
    assert.ok(r2.includes(`(> ${CHART_MAX_BYTES})`), "R2 413 cap");
    assert.ok(r3.includes(`(body > ${REPORTS_BODY_MAX} bytes, or a canonical report > ${REPORT_MAX_BYTES})`), "R3 413 cap");
    assert.ok(l1.includes(`(> ${REPORT_MAX_BYTES})`), "L1 413 cap");
    assert.ok(r1.includes("with **no 24-month cap**"), "R1: no custom-range cap (8.2 query-custom-range-months none)");
    assert.ok(!/\ba \d+-month cap\b/.test(r1 + r2), "R1 / R2 never claim a month cap");
    assert.ok(r3.includes(`**at most ${RANGE_MONTHS_MAX} months**`) && r3.includes(`1..${SERIES_MAX}`) && r3.includes(`1..${NAME_MAX} chars`) && r3.includes(`limit: ${REPORTS_MAX} }`), "R3 caps");
    assert.ok(r1.includes(`Series[1..${SERIES_MAX}]`), "R1 series cap");
    for (const s of [`1..${SERIES_MAX}, no duplicates`, `≤ ${RANGE_MONTHS_MAX} months`, `${REPORTS_MAX} per person`, `1..${NAME_MAX} chars`, `${SERIES_MAX_BYTES} B (R1, R2, L1); ${REPORTS_BODY_MAX} B (R3, R4); canonical report ≤ ${REPORT_MAX_BYTES} B`])
      assert.ok(lim.includes(s), `limits table: ${s}`);
  });
});

// ---- #179 (spec 41, PFALL-13; contract section 9.1, 2026-10-17): range bounds tied to the server, at their boundaries ----
describe("#179 contract 9.1 range bounds drive the real handlers", () => {
  const doc = readFileSync(new URL("../../../attachments/pf-charts-api-contract.md", import.meta.url), "utf8");
  const s91 = doc.slice(doc.indexOf("### 9.1"));
  const rows = s91.split("\n").filter((l) => /^\| [a-z]/.test(l) && !l.startsWith("| Bound")).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const B = Object.fromEntries(rows.map(([k, v, routes, src]) => [k, { v, routes: routes.split(/\s+/), src }]));
  const bob = dispatch("bob");
  const at = new Date("2026-10-16T16:00:00Z");
  const cur = "2026-10";
  const prev = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
  const next = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };
  const send = async (k: string, range: unknown): Promise<number> => {
    const report = { series: [{ kind: "group", id: "all" }], range, chart: "line" };
    const J = { "content-type": "application/json" };
    const req = (m: string, p: string, b: unknown) => new Request(`http://localhost${p}`, { method: m, headers: J, body: JSON.stringify(b) });
    const d = as("bob");
    if (k === "R1") return (await handlePersonalFinanceSeriesRequest(req("POST", "/x", { series: report.series, range }), d, () => at)).status;
    if (k === "R2") return (await handlePersonalFinanceChartRequest(req("POST", "/x", report), d, () => at)).status;
    if (k === "R3") {
      const r = await handlePersonalFinanceReportsRequest(req("POST", "/x", { name: `b${Math.random()}`, report }), d, () => at);
      if (r.status === 201) await handlePersonalFinanceReportItemRequest(new Request("http://localhost/x", { method: "DELETE" }), (await r.json()).id, d);
      return r.status;
    }
    if (k === "R4") return (await handlePersonalFinanceReportItemRequest(req("PUT", "/x", { report }), "default", d, () => at)).status;
    return (await handlePersonalFinanceReportRequest(req("PUT", "/x", { report }), d, () => at)).status;
  };
  it("the table names the server sources with the server values", () => {
    assert.deepEqual(Object.keys(B).sort(), ["query-from-min", "query-presets", "query-to-max", "saved-from-min", "saved-presets", "saved-to-max"]);
    for (const k of ["saved-from-min", "query-from-min"]) assert.deepEqual([B[k].v, B[k].src], [FIRST_MONTH, "`FIRST_MONTH`"]);
    for (const k of ["saved-presets", "query-presets"]) assert.deepEqual([B[k].v.split(" "), B[k].src], [[...RANGE_PRESETS], "`RANGE_PRESETS`"]);
    for (const k of ["saved-to-max", "query-to-max"]) assert.equal(B[k].v, "current-month");
  });
  it("each bound holds at its boundary on every route listed (min allowed, min-1 refused; current allowed, next refused; every preset accepted)", async () => {
    void bob;
    for (const k of B["saved-from-min"].routes.concat(B["query-from-min"].routes)) {
      const min = (B["saved-from-min"].routes.includes(k) ? B["saved-from-min"] : B["query-from-min"]).v;
      assert.ok((await send(k, { from: min, to: next(next(min)) })) < 300, `${k} from ${min}`);
      assert.equal(await send(k, { from: prev(min), to: next(min) }), 400, `${k} from ${prev(min)}`);
    }
    for (const k of B["saved-to-max"].routes.concat(B["query-to-max"].routes)) {
      assert.ok((await send(k, { from: prev(prev(cur)), to: cur })) < 300, `${k} to ${cur}`);
      assert.equal(await send(k, { from: prev(cur), to: next(cur) }), 400, `${k} to ${next(cur)}`);
    }
    for (const key of ["saved-presets", "query-presets"]) for (const k of B[key].routes) for (const p of B[key].v.split(" ")) assert.ok((await send(k, { preset: p })) < 300, `${k} preset ${p}`);
    await handlePersonalFinanceReportItemRequest(new Request("http://localhost/x", { method: "DELETE" }), "default", as("bob"));
  });
});
