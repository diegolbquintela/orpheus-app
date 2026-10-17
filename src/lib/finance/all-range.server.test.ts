import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  handlePersonalFinanceChartRequest,
  handlePersonalFinanceReportExportRequest,
  handlePersonalFinanceReportItemRequest,
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceReportsRequest,
  handlePersonalFinanceRequest,
  handlePersonalFinanceSeriesRequest,
} from "./account.server.ts";
import { crc32, headerLines, rangeLabel, ALL_DATA, NO_DATA_YET } from "./export.ts";
import { chartData, fromReport } from "./chart.ts";
import { rangeError, reportError, REPORT_KEY, RANGE_AFTER_CURRENT, RANGE_BEFORE_FIRST, RANGE_PRESETS, type Report } from "./report.ts";
import { REPORTS_KEY } from "./reports.ts";
import { FIRST_SAVED_MONTH, type RangePreset } from "./charts-api.ts";
import { FIRST_MONTH } from "./months.ts";
import { householdMonth } from "./overview.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";

// #179 (spec section 41, PFALL-01..PFALL-14; folds in #173): saved reports accept the dynamic `all` range through the
// ONE range validator; saves are bounded to 2020-01..the current Toronto month; old stored reports keep working.
// PGlite (migrations 0010-0012, unchanged), real handlers, fixed clocks. Runs under TZ=UTC and TZ=America/Los_Angeles.
// PFALL-14: the QA list's copies (qa/tools/pf-helpers.mjs, read as text so tsc doesn't type-check the QA tool).
const helpers = readFileSync(new URL("../../../qa/tools/pf-helpers.mjs", import.meta.url), "utf8");
const helperConst = (name: string) => new RegExp(`export const ${name} = "([^"]*)";`).exec(helpers)?.[1];
const EXPORT_ALL_DATA = ALL_DATA;
const exportAllRange = (from: string, to: string) => `Range: ${ALL_DATA} (${from} to ${to})`;
const exportAllNoData = (month: string) => `Range: ${ALL_DATA} (${NO_DATA_YET}, ${month})`;
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db });
const OCT = new Date("2026-10-16T16:00:00Z");
const J = { "content-type": "application/json" };
const rq = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: J, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const post = (who: string, body: unknown, at = OCT) => handlePersonalFinanceReportsRequest(rq("POST", "/api/personal-finance/reports", body), as(who), () => at);
const list = async (who: string) => (await (await handlePersonalFinanceReportsRequest(rq("GET", "/api/personal-finance/reports"), as(who))).json()).reports;
const put = (who: string, id: string, body: unknown, at = OCT) => handlePersonalFinanceReportItemRequest(rq("PUT", `/api/personal-finance/reports/${id}`, body), id, as(who), () => at);
const get = (who: string, id: string) => handlePersonalFinanceReportItemRequest(rq("GET", `/api/personal-finance/reports/${id}`), id, as(who));
const del = (who: string, id: string) => handlePersonalFinanceReportItemRequest(rq("DELETE", `/api/personal-finance/reports/${id}`), id, as(who));
const legacyPut = (who: string, report: unknown, at = OCT) => handlePersonalFinanceReportRequest(rq("PUT", "/api/personal-finance/report", { report }), as(who), () => at);
const legacyGet = (who: string) => handlePersonalFinanceReportRequest(rq("GET", "/api/personal-finance/report"), as(who));
const chart = async (who: string, id: string | undefined, at = OCT) =>
  handlePersonalFinanceChartRequest(rq("POST", "/api/personal-finance/chart", id === undefined ? { saved: true } : { saved: true, id }), as(who), () => at);
const exp = (who: string, id: string, f: "pdf" | "png", at = OCT) =>
  handlePersonalFinanceReportExportRequest(rq("GET", `/api/personal-finance/reports/${id}/export?format=${f}`), id, as(who), () => at);
const file = async (r: Response, f: "pdf" | "png") => {
  assert.equal(r.status, 200);
  const b = Buffer.from(await r.arrayBuffer());
  return f === "pdf" ? readPdf(b) : readPng(b, crc32);
};
const stored = async (who: string) => (await pg.query<{ data: Record<string, string> }>("SELECT data FROM personal_finance WHERE user_id = $1", [who])).rows[0]?.data ?? null;
const L = (id: string, amount: string): Line => ({ id, name: id, amount, per: "month", equity: "", account: "Chequing", currency: "", rate: "", category: "Home" });
const recordWith = (months: Record<string, string>) => ({
  [STORAGE_KEY]: JSON.stringify({ fixed: [L("rent", "1000")], variable: [], accounts: ["Chequing"], categories: ["Home"] }),
  [MONTHS_KEY]: JSON.stringify(Object.fromEntries(Object.entries(months).map(([k, a]) => [k, { fixed: [L("rent", a)], variable: [], people: [] }]))),
});
const saveRecord = async (record: object) => {
  const r = await handlePersonalFinanceRequest(rq("PUT", "/api/personal-finance", { data: record }), as("alice"));
  assert.equal(r.status, 200);
};
const ALL: Report = { series: [{ kind: "group", id: "all" }], range: { preset: "all" }, chart: "line" };
const custom = (from: string, to: string): Report => ({ ...ALL, range: { from, to } });

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "carol"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'), ('carol', 'personal_finance', true, false, 'alice')`);
  await saveRecord(recordWith({ "2025-03": "900", "2026-09": "1000" }));
});

describe("#179 PFALL-01 / 02 saved reports accept `all`, stored as `all`", () => {
  it("POST, PUT :id, PUT default and legacy PUT accept { preset: 'all' }; stored exactly as all", async () => {
    const c = await post("bob", { name: "All time", report: ALL });
    assert.equal(c.status, 201);
    const item = await c.json();
    assert.deepEqual(item.report.range, { preset: "all" });
    assert.deepEqual(JSON.parse((await stored("bob"))![REPORTS_KEY])[0].report.range, { preset: "all" });
    const u = await put("bob", item.id, { name: "All time 2", report: { ...ALL, chart: "bar" } });
    assert.equal(u.status, 200);
    assert.deepEqual((await u.json()).report.range, { preset: "all" });
    assert.equal((await put("bob", "default", { report: ALL })).status, 200);
    assert.deepEqual(JSON.parse((await stored("bob"))![REPORT_KEY]).range, { preset: "all" });
    assert.equal((await legacyPut("carol", ALL)).status, 200);
    assert.deepEqual((await (await legacyGet("carol")).json()).report.range, { preset: "all" });
    assert.deepEqual(JSON.parse((await stored("carol"))![REPORT_KEY]).range, { preset: "all" });
    // Q-AF9: list / GET return the stored `all`, not resolved months
    assert.deepEqual((await list("bob")).map((r: { report: Report }) => r.report.range), [{ preset: "all" }, { preset: "all" }]);
    assert.deepEqual((await (await get("bob", item.id)).json()).report.range, { preset: "all" });
    await del("bob", item.id);
    await del("bob", "default");
  });
});

describe("#179 PFALL-03 / 04 / 05 `all` is dynamic: resolved when the report runs", () => {
  it("grows with new data months and with the clock; export embeds the chart and prints All data", async () => {
    const id = (await (await post("bob", { name: "Dyn", report: ALL })).json()).id;
    const c1 = await (await chart("bob", id)).json();
    assert.equal(c1.source, "saved");
    assert.deepEqual([c1.range.from, c1.range.to], ["2025-03", "2026-10"]);
    assert.equal(c1.months.length, 20);
    // export: data = chart, header says All data (from to to)
    for (const f of ["pdf", "png"] as const) {
      const x = await file(await exp("bob", id, f), f);
      assert.deepEqual(x.data, c1, f);
    }
    const pdfText = ((await file(await exp("bob", id, "pdf"), "pdf")).text as string[]).join("\n");
    assert.ok(pdfText.includes(exportAllRange("2025-03", "2026-10")), pdfText.slice(0, 300));
    // a new earlier data month arrives: the SAME stored report now starts earlier (never frozen)
    await saveRecord(recordWith({ "2021-05": "800", "2025-03": "900", "2026-09": "1000" }));
    const c2 = await (await chart("bob", id)).json();
    assert.deepEqual([c2.range.from, c2.range.to], ["2021-05", "2026-10"]);
    // the clock moves on: it ends later
    const c3 = await (await chart("bob", id, new Date("2027-01-10T15:00:00Z"))).json();
    assert.equal(c3.range.to, "2027-01");
    assert.deepEqual(JSON.parse((await stored("bob"))![REPORTS_KEY]).find((r: { id: string }) => r.id === id).report.range, { preset: "all" }, "still stored as all");
    const x3 = await file(await exp("bob", id, "pdf", new Date("2027-01-10T15:00:00Z")), "pdf");
    assert.deepEqual(x3.data, c3);
    assert.ok((x3.text as string[]).join("\n").includes(exportAllRange("2021-05", "2027-01")));
    await del("bob", id);
    await saveRecord(recordWith({ "2025-03": "900", "2026-09": "1000" }));
  });

  it("PFALL-05: an `all` report with no data months charts the current month only (nulls) and prints no data yet", () => {
    const d = chartData(fromReport(ALL), null, OCT, "saved");
    assert.deepEqual(d.months, ["2026-10"]);
    assert.deepEqual(d.series[0].values, [null]);
    assert.equal(rangeLabel(d, ALL.range), `${ALL_DATA} (${NO_DATA_YET}, 2026-10)`);
    assert.ok(headerLines(d, { name: "x", generatedAt: OCT.toISOString(), range: ALL.range }).some((l) => l.includes(exportAllNoData("2026-10"))));
  });

  it("PFALL-14: the QA list (pf-helpers) carries the exact new export text", () => {
    assert.equal(helperConst("EXPORT_ALL_DATA"), ALL_DATA);
    assert.equal(helperConst("EXPORT_NO_DATA_YET"), NO_DATA_YET);
    // #179 Q-AF4: the QA list's copies of the bound messages equal the server's
    assert.ok(helpers.includes(`export const RANGE_BEFORE_FIRST = ${JSON.stringify(RANGE_BEFORE_FIRST)};`));
    assert.ok(helpers.includes(`export const RANGE_AFTER_CURRENT = ${JSON.stringify(RANGE_AFTER_CURRENT)};`));
    assert.ok(helpers.includes("export const exportAllRange = (from, to) => `Range: ${EXPORT_ALL_DATA} (${from} to ${to})`;"));
    assert.ok(helpers.includes("export const exportAllNoData = (month) => `Range: ${EXPORT_ALL_DATA} (${EXPORT_NO_DATA_YET}, ${month})`;"));
  });
});

describe("#179 PFALL-06 / 07 / 08 (#173) save bounds: 2020-01..the current Toronto month; 24-month cap kept", () => {
  const writers: [string, (r: Report, at?: Date) => Promise<Response>][] = [
    ["POST /reports", (r, at) => post("bob", { name: `b ${Math.random()}`, report: r }, at)],
    ["PUT /reports/default", (r, at) => put("bob", "default", { report: r }, at)],
    ["legacy PUT /report", (r, at) => legacyPut("bob", r, at)],
  ];
  let id = "";
  writers.push(["PUT /reports/:id", (r, at) => put("bob", id, { name: "Bounds", report: r }, at)]);
  it("boundaries on every write path; refusals store nothing", async () => {
    id = (await (await post("bob", { name: "Bounds", report: ALL })).json()).id;
    for (const [name, w] of writers) {
      const before = JSON.stringify(await stored("bob"));
      for (const r of [custom("2019-12", "2020-06"), custom("2026-01", "2026-11"), custom("2025-10", "2027-01"), custom("2023-10", "2025-10")]) {
        const res = await w(r);
        // /reports and /reports/:id prefix body fields with `report.` (spec 38, PFRC-06); legacy /report doesn't.
        const field = name === "legacy PUT /report" ? "range" : "report.range";
        // #179 Q-AF4 (CFO, 2026-10-17): from-bound / to-bound messages; the 24-month cap stays `Invalid value.`.
        const rr = r.range as { from: string; to: string };
        const error = rr.from < "2020-01" ? "Range can't start before 2020-01." : rr.to > "2026-10" ? "Range can't end after the current month." : "Invalid value.";
        assert.deepEqual([res.status, await res.json()], [400, { error, field }], `${name} ${JSON.stringify(r.range)}`);
      }
      assert.equal(JSON.stringify(await stored("bob")), before, `${name}: nothing stored`);
      for (const r of [custom("2020-01", "2020-06"), custom("2026-05", "2026-10"), custom("2024-11", "2026-10")]) assert.equal((await w(r)).status < 300, true, `${name} ${JSON.stringify(r.range)} allowed`);
    }
    for (const r of await list("bob")) await del("bob", r.id);
  });

  it("Toronto month boundary: 2026-11-01T03:30Z is still October; 04:30Z is November (any process TZ)", async () => {
    const lateOct = new Date("2026-11-01T03:30:00Z");
    const nov = new Date("2026-11-01T04:30:00Z");
    assert.equal(householdMonth(lateOct), "2026-10");
    assert.equal(householdMonth(nov), "2026-11");
    id = (await (await post("bob", { name: "Bounds", report: ALL })).json()).id;
    for (const [name, w] of writers) {
      assert.equal((await w(custom("2026-06", "2026-11"), lateOct)).status, 400, `${name}: Nov refused while Toronto is in October`);
      assert.ok((await w(custom("2026-06", "2026-10"), lateOct)).status < 300, `${name}: Oct allowed`);
      assert.ok((await w(custom("2026-06", "2026-11"), nov)).status < 300, `${name}: Nov allowed from 00:30 Toronto`);
    }
    for (const r of await list("bob")) await del("bob", r.id);
  });

  it("ONE validator: query mode (series / chart) has no cap; save mode caps at 24; stored mode is lenient", async () => {
    assert.equal(rangeError({ from: "2020-01", to: "2026-10" }, "query", "2026-10"), null);
    assert.equal(rangeError({ from: "2020-01", to: "2026-10" }, "save", "2026-10")?.field, "range");
    assert.equal(rangeError({ from: "2019-12", to: "2020-01" }, "query", "2026-10")?.field, "range");
    assert.equal(rangeError({ from: "2019-01", to: "2019-06" }, "stored"), null, "stored keeps the pre-#179 rule");
    assert.equal(rangeError({ from: "2030-01", to: "2030-06" }, "stored"), null);
    for (const p of RANGE_PRESETS) for (const m of ["query", "save", "stored"] as const) assert.equal(rangeError({ preset: p }, m, "2026-10"), null, `${p} ${m}`);
    const presets: RangePreset[] = [...RANGE_PRESETS];
    assert.ok(presets.includes("all"));
    assert.equal(FIRST_SAVED_MONTH, FIRST_MONTH);
    // the HTTP side of /series and /chart is unchanged: the long custom range still 200, 2019-12 still 400 range
    const s = await handlePersonalFinanceSeriesRequest(rq("POST", "/api/personal-finance/series", { series: ALL.series, range: { from: "2020-01", to: "2026-10" } }), as("alice"), () => OCT);
    assert.equal(s.status, 200);
    const s2 = await handlePersonalFinanceSeriesRequest(rq("POST", "/api/personal-finance/series", { series: ALL.series, range: { from: "2019-12", to: "2020-02" } }), as("alice"), () => OCT);
    assert.deepEqual([s2.status, await s2.json()], [400, { error: "Range can't start before 2020-01.", field: "range" }]);
  });

  it("PFALL-12: the client check uses the same save rules", () => {
    assert.equal(reportError(ALL, "2026-10"), null);
    assert.equal(reportError(custom("2026-05", "2026-11"), "2026-10")?.field, "range");
    assert.equal(reportError(custom("2019-12", "2020-02"), "2026-10")?.field, "range");
    assert.equal(reportError(custom("2026-05", "2026-10"), "2026-10"), null);
  });
});

describe("#179 PFALL-09 / 10 old stored reports read, chart and export unchanged", () => {
  // Written straight into the row, exactly as pre-#179 code stored them (no API, so the new save rules never run).
  const OLD_OUT = custom("2019-01", "2020-06"); // before 2020-01: today's saves refuse it
  const OLD_FUTURE = custom("2026-06", "2027-03"); // after the current month
  const OLD_IN: Report = { series: [{ kind: "group", id: "fixed" }], range: { preset: "12m" }, chart: "bar" };
  const named = [
    { id: "r-0000aaaa", name: "Old out", report: OLD_OUT, created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-01T00:00:00.000Z" },
    { id: "r-0000bbbb", name: "Old future", report: OLD_FUTURE, created_at: "2026-10-02T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z" },
    { id: "r-0000cccc", name: "Old in", report: OLD_IN, created_at: "2026-10-03T00:00:00.000Z", updated_at: "2026-10-03T00:00:00.000Z" },
  ];
  before(async () => {
    await pg.query(
      `INSERT INTO personal_finance (user_id, data, updated_at) VALUES ('carol', jsonb_build_object($1::text, $2::text, $3::text, $4::text), now())
       ON CONFLICT (user_id) DO UPDATE SET data = jsonb_build_object($1::text, $2::text, $3::text, $4::text)`,
      [REPORT_KEY, JSON.stringify(OLD_OUT), REPORTS_KEY, JSON.stringify(named)],
    );
  });
  it("legacy default + named, in and out of the new bounds: GET, list, chart (nulls where no data), export", async () => {
    assert.deepEqual((await (await legacyGet("carol")).json()).report, OLD_OUT);
    const items = await list("carol");
    assert.deepEqual(items.map((r: { id: string; report: Report }) => [r.id, r.report]), [["default", OLD_OUT], ...named.map((n) => [n.id, n.report])]);
    for (const id of ["default", "r-0000aaaa", "r-0000bbbb", "r-0000cccc"]) {
      assert.equal((await get("carol", id)).status, 200, id);
      const c = await (await chart("carol", id)).json();
      const rep = id === "default" ? OLD_OUT : named.find((n) => n.id === id)!.report;
      assert.deepEqual(c, chartData(fromReport(rep), (await (await handlePersonalFinanceRequest(rq("GET", "/api/personal-finance"), as("alice"))).json()).data, OCT, "saved"), `${id}: chart = the pre-#179 chartData`);
      for (const f of ["pdf", "png"] as const) assert.deepEqual((await file(await exp("carol", id, f), f)).data, c, `${id} ${f}`);
      const t = ((await file(await exp("carol", id, "pdf"), "pdf")).text as string[]).join("\n");
      assert.ok(t.includes(`Range: ${c.range.from} to ${c.range.to}`), `${id}: the pre-#179 range line`);
      assert.ok(!t.includes(EXPORT_ALL_DATA), id);
    }
    const out = await (await chart("carol", "r-0000aaaa")).json();
    assert.ok(out.series[0].values.slice(0, 12).every((v: number | null) => v === null), "2019 months chart as nulls (spec 37.8)");
    // re-saving an out-of-bounds stored report without fixing the range is refused (Q-AF5); nothing changes
    const before = JSON.stringify(await stored("carol"));
    assert.equal((await put("carol", "r-0000aaaa", { name: "Old out", report: OLD_OUT })).status, 400);
    assert.equal((await legacyPut("carol", OLD_OUT)).status, 400);
    assert.equal(JSON.stringify(await stored("carol")), before);
  });
});

describe("#179 Q-AF4 (CFO, 2026-10-17) PFALL-15 / 16 bound messages; every other range refusal stays Invalid value.", () => {
  const B = "Range can't start before 2020-01.";
  const A = "Range can't end after the current month.";
  it("validator: which inputs get which text, in every mode", () => {
    const cases: [unknown, string | null, string | null, string | null][] = [
      // range, query, save, stored (null = accepted)
      [{ from: "2019-12", to: "2020-02" }, B, B, null],
      [{ from: "2000-01", to: "2000-02" }, B, B, null],
      [{ from: "2026-09", to: "2026-11" }, A, A, null],
      [{ from: "2019-12", to: "2026-11" }, B, B, "Invalid value."], // both bounds: from wins; stored: 84 months > cap
      [{ from: "2018-01", to: "2020-06" }, B, B, "Invalid value."], // bound + over the cap: bound message in save mode
      [{ from: "2020-01", to: "2026-10" }, null, "Invalid value.", "Invalid value."], // cap only
      [{ from: "1999-12", to: "2020-02" }, "Invalid value.", "Invalid value.", "Invalid value."], // before 2000: malformed span
      [{ from: "2026-05", to: "2101-01" }, "Invalid value.", "Invalid value.", "Invalid value."], // after 2100
      [{ from: "2026-06", to: "2026-05" }, "Invalid value.", "Invalid value.", "Invalid value."], // from after to
      [{ from: "2026-13", to: "2026-12" }, "Invalid value.", "Invalid value.", "Invalid value."],
      [{ from: "2026-1", to: "2026-02" }, "Invalid value.", "Invalid value.", "Invalid value."],
      [{ from: "2026-01" }, "Invalid value.", "Invalid value.", "Invalid value."],
      [{ preset: "5y" }, "Invalid value.", "Invalid value.", "Invalid value."],
    ];
    for (const [range, q, s, st] of cases)
      for (const [mode, want] of [["query", q], ["save", s], ["stored", st]] as const) {
        const e = rangeError(range, mode, "2026-10");
        assert.equal(e?.error ?? null, want, `${mode} ${JSON.stringify(range)}`);
        if (e) assert.equal(e.status, 400);
        if (e) assert.equal(e.field, "preset" in (range as object) ? "range.preset" : "range");
      }
  });
  it("stored reports are never checked against the bounds: reading / charting / exporting an old 2019 report sends neither message", async () => {
    const r = await chart("carol", "r-0000aaaa");
    assert.equal(r.status, 200);
    const e = await exp("carol", "r-0000aaaa", "pdf");
    assert.equal(e.status, 200);
  });
});
