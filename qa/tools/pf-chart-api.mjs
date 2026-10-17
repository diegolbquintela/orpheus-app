// Personal Finance multi-series chart data API (#155; spec section 37; design attachments/pf-chart-data-design.md;
// AC PFC-01..PFC-17). Backend only: HTTP checks against POST /api/personal-finance/chart on a preview. READ-ONLY: it
// never writes (the record and the saved report are only read).
//
//   Signed out (always): PFC-01 POST → 401; GET → 401 or 405.
//   Signed in (QA_EMAIL / QA_PASSWORD from env; never logged): PFC-02..PFC-13 / PFC-15 / PFC-16.
//   Optional QA_CFO_EMAIL / QA_CFO_PASSWORD: the same chart data as the owner (PFC-14).
//   Optional QA_NONE_EMAIL / QA_NONE_PASSWORD (no Personal Finance grant): 403 (PFC-01).
//
//   [QA_EMAIL=… QA_PASSWORD=… [QA_CFO_…] [QA_NONE_…]] node qa/tools/pf-chart-api.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
import { FX_BASIS_CURRENT, NO_SAVED_REPORT } from "./pf-helpers.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
};
const API = "/api/personal-finance/chart";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function call(request, method, path, json, raw) {
  const r = await request.fetch(`${base}${path}`, {
    method,
    headers: { origin: base, accept: "application/json", "content-type": "application/json" },
    data: raw !== undefined ? raw : json !== undefined ? JSON.stringify(json) : undefined,
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status(), body };
}
const API_VIEWPORT = [["api", { width: 1024, height: 800 }, false]];
const signedIn = async (browser, email, password, fn) =>
  await eachViewport({ browser, baseUrl: base, email, password, check, viewports: API_VIEWPORT }, async ({ page }) => fn(page.request));

const G = (id) => ({ kind: "group", id });
const M = (id) => ({ kind: "metric", id });
const MAIN = { series: [G("fixed"), G("variable"), G("all"), M("expenses"), M("net-assets")], range: { preset: "all" }, chart: "stacked-bar" };

const browser = await chromium.launch();
try {
  const anon = async (method) =>
    (await fetch(`${base}${API}`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(MAIN) : undefined })).status;
  const post = await anon("POST");
  const get = await anon("GET");
  check("PFC-01 signed out: POST → 401; GET → 401 or 405", post === 401 && (get === 401 || get === 405), { post, get });

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) console.log("INFO PFC-02..PFC-16 SKIPPED (signed in): set QA_EMAIL / QA_PASSWORD in env");
  else {
    let owner = null;
    await signedIn(browser, email, password, async (request) => {
      const record = (await call(request, "GET", "/api/personal-finance")).body?.data ?? null;
      const savedReport = (await call(request, "GET", "/api/personal-finance/report")).body?.report ?? null;
      let r = await call(request, "POST", API, MAIN);
      owner = r.body;
      const j = r.body ?? {};
      check("PFC-02 200; rows / labels align with months; rows[i].values[j] = series[j].values[i]", r.status === 200 && j.rows?.length === j.months?.length && j.labels?.length === j.months?.length && j.rows.every((row, i) => row.month === j.months[i] && same(row.values, j.series.map((s) => s.values[i]))), { status: r.status });
      const s = await call(request, "POST", "/api/personal-finance/series", { series: MAIN.series, range: MAIN.range });
      check(`PFC-03 fx_basis '${FX_BASIS_CURRENT}', net_assets_from and values equal to /series`, j.fx_basis === FX_BASIS_CURRENT && s.status === 200 && j.net_assets_from === s.body.net_assets_from && same(j.series.map((x) => x.values), s.body.series.map((x) => x.values)), { fx: j.fx_basis, from: j.net_assets_from });
      check("PFC-04 axis: level for net-assets only", same(j.series?.map((x) => x.axis), ["flow", "flow", "flow", "flow", "level"]));
      check("PFC-05 stacked-bar stacks fixed / variable only (not all, not metrics)", same(j.series?.map((x) => x.stack), [true, true, false, false, false]));
      let bad = [];
      j.rows?.forEach((row) => {
        const [f, v, a] = row.values;
        if (a !== null && Math.abs(f + v - a) > 0.005) bad.push(row.month);
      });
      check("PFC-06 stacked parts add up to all in every month with data", bad.length === 0, bad);
      check("PFC-07 the last row is the current month, partial", j.rows?.at(-1)?.partial === true && j.rows.at(-1).month === j.current);
      const cases = [
        [{ ...MAIN, chart: "pie" }, "chart"],
        [{ series: MAIN.series, range: MAIN.range }, "chart"],
        [{ ...MAIN, series: [] }, "series"],
        [{ ...MAIN, range: { preset: "5y" } }, "range.preset"],
        [{ ...MAIN, range: { from: "2019-12", to: "2020-02" } }, "range"],
        [{ saved: false }, "query"],
      ];
      const got = [];
      for (const [body, field] of cases) {
        const x = await call(request, "POST", API, body);
        got.push(x.status === 400 && same(x.body, { error: "Invalid value.", field }) ? "ok" : { field, ...x });
      }
      check("PFC-08..PFC-10 refusals: 400 { error: 'Invalid value.', field }", got.every((g) => g === "ok"), got);
      r = await call(request, "POST", API, undefined, JSON.stringify(MAIN) + " ".repeat(4100));
      check("PFC-11 above 4 KB → 413", r.status === 413, r.status);
      r = await call(request, "POST", API, { saved: true });
      if (savedReport) check("PFC-13 { saved: true } charts the saved report (source saved, its chart type)", r.status === 200 && r.body.source === "saved" && r.body.chart === savedReport.chart, r.status);
      else check(`PFC-12 { saved: true } with none saved → 404 '${NO_SAVED_REPORT}'`, r.status === 404 && same(r.body, { error: NO_SAVED_REPORT }), r);
      r = await call(request, "POST", API, { series: [{ kind: "line", id: "qa-chart-gone" }, G("all")], range: { preset: "3m" }, chart: "line" });
      check("PFC-15 a missing series keeps an all-null column", r.status === 200 && r.body.series[0].missing === true && r.body.rows.every((row) => row.values[0] === null), r.status);
      // #155 CFO condition on Q-AB2 (2026-10-17): chart-level mixed_axes (top level; `chart` stays a string).
      const mx = [];
      for (const [series, want] of [[[M("net-assets"), G("all")], true], [[M("net-assets")], false], [[G("all"), M("income")], false]]) {
        const x = await call(request, "POST", API, { series, range: { preset: "3m" }, chart: "line" });
        mx.push(x.status === 200 && x.body.mixed_axes === want && typeof x.body.chart === "string" ? "ok" : { want, status: x.status, got: x.body?.mixed_axes });
      }
      const sv = await call(request, "POST", API, { saved: true });
      if (sv.status === 200) {
        const axes = sv.body.series.map((x) => x.axis);
        mx.push(sv.body.mixed_axes === (axes.includes("level") && axes.includes("flow")) ? "ok" : { saved: sv.body.mixed_axes, axes });
      }
      check("PFC-17 mixed_axes: true for level + flow, false for level-only / flow-only (and saved mode when a report is saved)", mx.every((m) => m === "ok") && j.mixed_axes === true, mx);
      const after = (await call(request, "GET", "/api/personal-finance")).body?.data ?? null;
      check("PFC-16 read-only: the record is unchanged", same(after, record));
    });
    if (process.env.QA_CFO_EMAIL && process.env.QA_CFO_PASSWORD)
      await signedIn(browser, process.env.QA_CFO_EMAIL, process.env.QA_CFO_PASSWORD, async (request) => {
        const r = await call(request, "POST", API, MAIN);
        check("PFC-14 CFO (Read): the same chart data as the owner", r.status === 200 && same(r.body, owner), r.status);
      });
    else console.log("INFO PFC-14 SKIPPED: set QA_CFO_EMAIL / QA_CFO_PASSWORD");
    if (process.env.QA_NONE_EMAIL && process.env.QA_NONE_PASSWORD)
      await signedIn(browser, process.env.QA_NONE_EMAIL, process.env.QA_NONE_PASSWORD, async (request) => {
        const r = await call(request, "POST", API, MAIN);
        check("PFC-01 no Personal Finance grant → 403", r.status === 403, r.status);
      });
    else console.log("INFO PFC-01 no-grant SKIPPED: set QA_NONE_EMAIL / QA_NONE_PASSWORD");
  }
} finally {
  await browser.close();
}
const failed = R.checks.filter((c) => !c.ok).length;
console.log(`\n${R.checks.length - failed}/${R.checks.length} passed`);
if (CFG.out) writeFileSync(join(CFG.out, "pf-chart-api.json"), JSON.stringify(R, null, 2));
process.exit(failed ? 1 : 0);
