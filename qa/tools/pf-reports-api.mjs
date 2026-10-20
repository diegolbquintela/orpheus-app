// Personal Finance report CRUD API (#156; spec section 38; design attachments/pf-report-crud-design.md; AC
// PFRC-01..PFRC-18). Backend only: HTTP checks against /api/personal-finance/reports[/:id] on a preview.
//
//   Signed out (always): PFRC-01 list / item → 401.
//   Signed in (QA_EMAIL / QA_PASSWORD from env; never logged), READ-ONLY by default: list shape, the default report =
//   the legacy GET /report, item GET per listed id, 404 for unknown ids, refusals (nothing stored), chart
//   { saved: true, id } per listed report, record unchanged.
//   QA_WRITE=1 (preview only; refused on production) adds a create → GET → PUT → duplicate-name 409 → DELETE round trip
//   on a temporary report named "QA temp <time>", deleted at the end (also on failure).
//   Optional QA_NONE_EMAIL / QA_NONE_PASSWORD (no Personal Finance grant): 403 (PFRC-01).
//
//   [QA_EMAIL=… QA_PASSWORD=… [QA_WRITE=1] [QA_NONE_…]] node qa/tools/pf-reports-api.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BASE_URL, qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { DEFAULT_REPORT_NAME, NAME_TAKEN, RANGE_TOO_LONG, REPORT_NOT_FOUND } from "./pf-helpers.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
};
const LIST = "/api/personal-finance/reports";
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
const REP = { series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" };

// #157 (QA #174 note 1): refuse production before any GET or sign-in.
await refuseIfProd(base, "pf-reports-api");
const browser = await chromium.launch();
try {
  const anon = async (path) => (await fetch(`${base}${path}`)).status;
  const out = [await anon(LIST), await anon(`${LIST}/default`)];
  check("PFRC-01 signed out: GET list / item → 401", same(out, [401, 401]), out);

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  const prod = new URL(base).hostname === new URL(DEFAULT_BASE_URL).hostname;
  if (!email || !password) console.log("INFO PFRC-02..PFRC-18 SKIPPED (signed in): set QA_EMAIL / QA_PASSWORD in env");
  else
    await signedIn(browser, email, password, async (request) => {
      const record = (await call(request, "GET", "/api/personal-finance")).body?.data ?? null;
      const legacy = (await call(request, "GET", "/api/personal-finance/report")).body;
      const l = await call(request, "GET", LIST);
      const reports = l.body?.reports ?? [];
      check("PFRC-02 list: 200 { reports, limit: 20 }", l.status === 200 && Array.isArray(reports) && l.body.limit === 20, { status: l.status, n: reports.length });
      const def = reports.find((x) => x.default);
      check(`PFRC-03 the default report (${DEFAULT_REPORT_NAME}) is the legacy report, listed first`, legacy?.report ? def && reports[0] === def && def.id === "default" && def.name === DEFAULT_REPORT_NAME && same(def.report, legacy.report) && same(def.missing, legacy.missing) : !def, { legacy: Boolean(legacy?.report) });
      const items = [];
      for (const x of reports) {
        const g = await call(request, "GET", `${LIST}/${x.id}`);
        items.push(g.status === 200 && same(g.body, x) ? "ok" : { id: x.id, status: g.status });
      }
      check("PFRC-04 each listed report: GET /reports/:id returns the same item", items.every((i) => i === "ok"), items);
      const nf = await call(request, "GET", `${LIST}/r-00000000`);
      check(`PFRC-09 unknown id → 404 '${REPORT_NOT_FOUND}'`, nf.status === 404 && same(nf.body, { error: REPORT_NOT_FOUND }), nf);
      const refusals = [];
      // #171 CFO round (2026-10-17): + a 25-month in-bounds range → the cap's own message (same 400, field report.range).
      for (const [body, field, error = "Invalid value."] of [[{ name: "", report: REP }, "name"], [{ name: "ok", report: { ...REP, chart: "pie" } }, "report.chart"], [{ name: "ok", report: REP, extra: 1 }, "body"], [{ name: "ok", report: { ...REP, range: { from: "2020-01", to: "2022-01" } } }, "report.range", RANGE_TOO_LONG]]) {
        const x = await call(request, "POST", LIST, body);
        refusals.push(x.status === 400 && same(x.body, { error, field }) ? "ok" : { field, error, ...x });
      }
      check("PFRC-06 refusals: 400 { error (Invalid value., or the 24-month cap message), field } (nothing stored)", refusals.every((x) => x === "ok"), refusals);
      const charts = [];
      for (const x of reports) {
        const c = await call(request, "POST", "/api/personal-finance/chart", { saved: true, id: x.id });
        charts.push(c.status === 200 && c.body.source === "saved" && c.body.chart === x.report.chart ? "ok" : { id: x.id, status: c.status });
      }
      const cnf = await call(request, "POST", "/api/personal-finance/chart", { saved: true, id: "r-00000000" });
      check("PFRC-14 chart { saved: true, id } per listed report; unknown id → 404", charts.every((x) => x === "ok") && cnf.status === 404, { charts, unknown: cnf.status });
      if (process.env.QA_WRITE === "1" && !prod) {
        let id = null;
        try {
          const name = `QA temp ${Date.now()}`;
          const c = await call(request, "POST", LIST, { name, report: REP });
          id = c.body?.id ?? null;
          check("PFRC-04 (write) POST → 201 with an r-xxxxxxxx id", c.status === 201 && /^r-[0-9a-f]{8}$/.test(id ?? ""), c.status);
          const u = await call(request, "PUT", `${LIST}/${id}`, { name: `${name} 2`, report: { ...REP, chart: "bar" } });
          check("PFRC-05 (write) PUT replaces name and report", u.status === 200 && u.body.name === `${name} 2` && u.body.report.chart === "bar", u.status);
          const d = await call(request, "POST", LIST, { name: `${name} 2`.toUpperCase(), report: REP });
          check(`PFRC-07 (write) duplicate name in another case → 409 '${NAME_TAKEN}'`, d.status === 409 && d.body?.error === NAME_TAKEN, d);
          if (d.status === 201) await call(request, "DELETE", `${LIST}/${d.body.id}`);
        } finally {
          if (id) {
            const del = await call(request, "DELETE", `${LIST}/${id}`);
            check("PFRC-11 (write) DELETE the temporary report", del.status === 200 && (await call(request, "GET", `${LIST}/${id}`)).status === 404, del.status);
          }
        }
      } else console.log(`INFO write round trip SKIPPED: ${prod ? "production" : "set QA_WRITE=1 (preview only)"}`);
      const after = (await call(request, "GET", "/api/personal-finance")).body?.data ?? null;
      check("PFRC-13 the record is unchanged", same(after, record));
      const l2 = await call(request, "GET", LIST);
      check("PFRC-16 the list is back as it was", same(l2.body?.reports?.map((x) => x.id), reports.map((x) => x.id)));
    });
  // #162 R2 / CFO decision 1 (2026-10-20, spec 38.12): PFRC-12 Read means read only. A Read CFO's POST, PUT and DELETE →
  // 403 `Forbidden.`; the CFO's list is unchanged (nothing is written, so nothing to restore).
  if (process.env.QA_CFO_EMAIL && process.env.QA_CFO_PASSWORD)
    await signedIn(browser, process.env.QA_CFO_EMAIL, process.env.QA_CFO_PASSWORD, async (request) => {
      const before = await call(request, "GET", LIST);
      const id = before.body?.reports?.find((x) => !x.default)?.id ?? "r-0000beef";
      const st = [
        await call(request, "POST", LIST, { name: "QA CFO attempt", report: REP }),
        await call(request, "PUT", `${LIST}/${id}`, { name: "QA CFO attempt", report: REP }),
        await call(request, "DELETE", `${LIST}/${id}`),
        await call(request, "PUT", `${LIST}/default`, { report: REP }),
        await call(request, "DELETE", `${LIST}/default`),
      ];
      const after = await call(request, "GET", LIST);
      check("PFRC-12 (#162) a Read CFO's POST / PUT / DELETE (named and default) → 403 `Forbidden.`; the list is unchanged", st.every((r) => r.status === 403 && r.body?.error === "Forbidden.") && before.status === 200 && same(after.body, before.body), { st: st.map((r) => [r.status, r.body?.error]), before: before.status });
    });
  else console.log("INFO PFRC-12 SKIPPED: set QA_CFO_EMAIL / QA_CFO_PASSWORD (an account with a Personal Finance Read grant)");
  if (process.env.QA_NONE_EMAIL && process.env.QA_NONE_PASSWORD)
    await signedIn(browser, process.env.QA_NONE_EMAIL, process.env.QA_NONE_PASSWORD, async (request) => {
      const r = await call(request, "GET", LIST);
      check("PFRC-01 no Personal Finance grant → 403", r.status === 403, r.status);
    });
  else console.log("INFO PFRC-01 no-grant SKIPPED: set QA_NONE_EMAIL / QA_NONE_PASSWORD");
} finally {
  await browser.close();
}
const failed = R.checks.filter((c) => !c.ok).length;
console.log(`\n${R.checks.length - failed}/${R.checks.length} passed`);
if (CFG.out) writeFileSync(join(CFG.out, "pf-reports-api.json"), JSON.stringify(R, null, 2));
process.exit(failed ? 1 : 0);
