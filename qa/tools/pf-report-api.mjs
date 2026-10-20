// Personal Finance saved chart report API (#153; spec section 33; design attachments/pf-chart-report-design.md;
// AC PFR-01..PFR-14). Backend only: HTTP checks against /api/personal-finance/report on a preview.
//
//   Signed out (always): PFR-01 401 for GET / PUT / DELETE, 405 for another method.
//   Signed in (QA_EMAIL / QA_PASSWORD from env; never logged; preview only, it writes to the account): PFR-02..PFR-13.
//   The account's own report and its Personal Finance record are read first and put back at the end; always signed out.
//   PFR-14 also needs a second account with a Personal Finance Read grant: QA_CFO_EMAIL / QA_CFO_PASSWORD (optional);
//   #163 adds the isolation check (the owner never sees the CFO's report) and, with QA_NONE_EMAIL /
//   QA_NONE_PASSWORD (the existing 'none' login from roles.mjs: an account without a Personal Finance grant, optional), 403 for GET / PUT / DELETE.
//
//   [QA_EMAIL=… QA_PASSWORD=… [QA_CFO_EMAIL=… QA_CFO_PASSWORD=…]] node qa/tools/pf-report-api.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BASE_URL, qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
import { refuseIfProd } from "./prod-guard.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, checks: [], shots: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const API = "/api/personal-finance/report";
const RECORD_API = "/api/personal-finance";
const REPORT_KEY = "orpheus.finance.report.v1";
const EXPENSES_KEY = "orpheus.finance.expenses.v2";
// #165: the GET / PUT / DELETE body also carries `deleted` / `labels`; `same` compares `{ report, missing }` when the
// expected value is that shape (the #165 fields are checked on their own in PFD-06).
const core = (x) => (x && typeof x === "object" && "missing" in x ? { report: x.report, missing: x.missing } : x);
// #179: the range bound refusals (Q-AF4, CFO 2026-10-17); must equal src/lib/finance/report.ts.
import { RANGE_AFTER_CURRENT, RANGE_TOO_LONG } from "./pf-helpers.mjs";
const same = (a, b) => JSON.stringify(b && typeof b === "object" && "missing" in b ? core(a) : a) === JSON.stringify(b);

/** One HTTP call with the context's cookies; `raw` is sent as the body text as is. */
async function call(request, method, path, { json, raw } = {}) {
  const r = await request.fetch(`${base}${path}`, {
    method,
    headers: { origin: base, accept: "application/json", ...(json !== undefined || raw !== undefined ? { "content-type": "application/json" } : {}) },
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

/** Signed in through session.mjs's eachViewport (always signs out); one API-only "viewport". */
const API_VIEWPORT = [["api", { width: 1024, height: 800 }, false]];
const signedIn = async (browser, email, password, fn) =>
  await eachViewport({ browser, baseUrl: base, email, password, check, viewports: API_VIEWPORT }, async ({ page }) => fn(page.request));

const LINE = { id: "qa-r1", name: "QA report line", amount: "1", per: "month", equity: "", account: "", currency: "", rate: "", category: "" };
const REPORT = {
  series: [{ kind: "line", id: "qa-r1" }, { kind: "line", id: "qa-gone" }, { kind: "group", id: "all" }, { kind: "metric", id: "net-assets" }],
  range: { preset: "12m" },
  chart: "stacked-bar",
};

// #157 (QA #174 note 1): refuse production before any GET or sign-in.
const GUARD = await refuseIfProd(base, "pf-report-api");
const browser = await chromium.launch();
try {
  // PFR-01 signed out.
  // No cookies: plain fetch.
  const anon = async (method, body) =>
    (await fetch(`${base}${API}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })).status;
  const out = [];
  if (GUARD.signedOutProd) {
    // #157 F7: no PUT / DELETE / POST on production; GET only.
    console.log("INFO signed-out write probes SKIPPED (signed-out prod mode)");
    out.push(await anon("GET"));
    check("PFR-01 signed out (prod, GET only): GET → 401", same(out, [401]), { out });
  } else {
    for (const m of ["GET", "PUT", "DELETE"]) out.push(await anon(m, m === "PUT" ? { report: REPORT } : undefined));
    const post = await anon("POST", {});
    check("PFR-01 signed out: GET / PUT / DELETE → 401; POST → 405 (or 401 before the method check is reached)", same(out, [401, 401, 401]) && (post === 405 || post === 401), { out, post });
  }

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  const prod = new URL(base).hostname === new URL(DEFAULT_BASE_URL).hostname;
  if (!email || !password) console.log("INFO PFR-02..PFR-14 SKIPPED (signed in): set QA_EMAIL / QA_PASSWORD in env (the preview QA account)");
  else if (prod) check("pf-report-api signed-in checks run on a preview only (they write to the account): refused on production", false, base);
  else
    await signedIn(browser, email, password, async (request) => {
      const originalReport = (await call(request, "GET", API)).body?.report ?? null;
      const originalRecord = (await call(request, "GET", RECORD_API)).body?.data ?? null;
      try {
        await call(request, "DELETE", API);
        let r = await call(request, "GET", API);
        check("PFR-02 nothing saved: GET → { report: null, missing: [] }", r.status === 200 && same(r.body, { report: null, missing: [] }), r);

        const record = { ...(originalRecord ?? {}), [EXPENSES_KEY]: JSON.stringify({ fixed: [LINE], variable: [], accounts: [], categories: [] }) };
        const put = await call(request, "PUT", RECORD_API, { json: { data: record } });
        const shuffled = { chart: REPORT.chart, range: REPORT.range, series: REPORT.series.map((s) => ({ id: s.id, kind: s.kind })) };
        r = await call(request, "PUT", API, { json: { report: shuffled } });
        const back = await call(request, "GET", API);
        check("PFR-03 / PFR-11 PUT stores (keys in the canonical order); GET returns it; missing = [1] (qa-gone)", put.status === 200 && r.status === 200 && same(r.body, { report: REPORT, missing: [1] }) && same(core(back.body), core(r.body)), { put: put.status, r, back });

        const next = { series: [{ kind: "category", id: "QA" }], range: { from: "2026-01", to: "2026-09" }, chart: "bar" };
        r = await call(request, "PUT", API, { json: { report: next } });
        check("PFR-04 / PFR-08 / PFR-11 PUT replaces the whole report (custom range); a missing category → missing [0]", r.status === 200 && same((await call(request, "GET", API)).body, { report: next, missing: [0] }), r);
        await call(request, "PUT", API, { json: { report: REPORT } });

        const refusals = [
          ["PFR-05 kind", { report: { ...REPORT, series: [{ kind: "pie", id: "x" }] } }, 400, "series.0.kind"],
          ["PFR-05 id", { report: { ...REPORT, series: [{ kind: "metric", id: "coverage" }] } }, 400, "series.0.id"],
          ["PFR-06 none", { report: { ...REPORT, series: [] } }, 400, "series"],
          ["PFR-06 13", { report: { ...REPORT, series: Array.from({ length: 13 }, (_, i) => ({ kind: "line", id: `l${i}` })) } }, 400, "series"],
          ["PFR-06 duplicate", { report: { ...REPORT, series: [REPORT.series[0], REPORT.series[0]] } }, 400, "series"],
          // #179 (spec 41): `all` is a saved preset now (asserted accepted below); an unknown preset is still refused.
          ["PFR-07 preset", { report: { ...REPORT, range: { preset: "5y" } } }, 400, "range.preset"],
          ["PFR-08 reversed", { report: { ...REPORT, range: { from: "2026-09", to: "2026-01" } } }, 400, "range"],
          // #179 Q-AF4: 2025-10..2027-10 ends after the current month; the bound is checked before the 24-month cap.
          ["PFR-08 25 months", { report: { ...REPORT, range: { from: "2025-10", to: "2027-10" } } }, 400, "range", RANGE_AFTER_CURRENT],
          // #171 CFO round (2026-10-17): 25 months inside the bounds → the cap's own message (same 400, field range).
          ["PFR-08 cap", { report: { ...REPORT, range: { from: "2020-01", to: "2022-01" } } }, 400, "range", RANGE_TOO_LONG],
          ["PFR-09 chart", { report: { ...REPORT, chart: "pie" } }, 400, "chart"],
          ["PFR-10 unknown key", { report: { ...REPORT, title: "x" } }, 400, "report"],
        ];
        for (const preset of ["3m", "6m", "12m", "24m", "ytd"]) {
          const p = await call(request, "PUT", API, { json: { report: { ...REPORT, range: { preset } } } });
          check(`PFR-07 preset ${preset} accepted`, p.status === 200, p.status);
        }
        // #179 PFALL-02: a saved `all` → 200, stored and read back as { preset: "all" } (resolved only when charted).
        const all = await call(request, "PUT", API, { json: { report: { ...REPORT, range: { preset: "all" } } } });
        const allBack = await call(request, "GET", API);
        check("PFR-07 / PFALL-02 preset all accepted: 200, stored as { preset: 'all' }", all.status === 200 && same(all.body?.report?.range, { preset: "all" }) && same(allBack.body?.report?.range, { preset: "all" }), { all: all.status, range: allBack.body?.report?.range });
        for (const chart of ["line", "bar", "stacked-bar"]) {
          const p = await call(request, "PUT", API, { json: { report: { ...REPORT, chart } } });
          check(`PFR-09 chart ${chart} accepted`, p.status === 200, p.status);
        }
        // #179: re-baseline right before the refusals, so PFR-10 holds whatever the earlier steps stored.
        await call(request, "PUT", API, { json: { report: REPORT } });
        const baseline = await call(request, "GET", API);
        for (const [name, body, status, field, error = "Invalid value."] of refusals) {
          const p = await call(request, "PUT", API, { json: body });
          check(`${name} → ${status} { error: "${error}", field: "${field}" }`, p.status === status && same(p.body, { error, field }), p);
        }
        const notJson = await call(request, "PUT", API, { raw: "{not json" });
        const big = await call(request, "PUT", API, { json: { report: REPORT, pad: "x".repeat(5000) } });
        const kept = await call(request, "GET", API);
        check("PFR-10 not JSON → 400; > 4 KB → 413 \"Report too large.\"; nothing stored on any refusal", notJson.status === 400 && big.status === 413 && same(big.body, { error: "Report too large." }) && same(core(kept.body), core(baseline.body)) && same(kept.body?.report, REPORT), { notJson, big: big.status, kept: kept.body, baseline: baseline.body });

        // #179: PFR-13 compares against what is stored right now (REPORT), whatever earlier steps did.
        await call(request, "PUT", API, { json: { report: REPORT } });
        const before13 = await call(request, "GET", API);
        const recGet = await call(request, "GET", RECORD_API);
        const recPut = await call(request, "PUT", RECORD_API, { json: { data: record } });
        const named = await call(request, "PUT", RECORD_API, { json: { data: { ...record, [REPORT_KEY]: "{}" } } });
        const after = await call(request, "GET", API);
        check("PFR-13 the record API: GET has no report; a record PUT keeps the report; naming it → 400 Unknown name", !(REPORT_KEY in (recGet.body?.data ?? {})) && recPut.status === 200 && named.status === 400 && /^Unknown name/.test(named.body?.error ?? "") && same(core(after.body), core(before13.body)) && same(after.body?.report, REPORT), { recGet: Object.keys(recGet.body?.data ?? {}), recPut: recPut.status, named, after: after.body });

        const del = await call(request, "DELETE", API);
        const gone = await call(request, "GET", API);
        check("PFR-12 DELETE → { report: null, missing: [] }; GET → null", del.status === 200 && same(del.body, { report: null, missing: [] }) && same(gone.body, { report: null, missing: [] }), { del, gone });
      } finally {
        // Put the record and the report back as they were.
        const rec = originalRecord ? await call(request, "PUT", RECORD_API, { json: { data: originalRecord } }) : await call(request, "DELETE", RECORD_API);
        const rep = originalReport ? await call(request, "PUT", API, { json: { report: originalReport } }) : await call(request, "DELETE", API);
        check("the QA account's record and report restored", rec.status === 200 && rep.status === 200, { record: rec.status, report: rep.status });
      }
    });

  const cfoEmail = process.env.QA_CFO_EMAIL;
  const cfoPassword = process.env.QA_CFO_PASSWORD;
  if (email && password && !prod && cfoEmail && cfoPassword)
    await signedIn(browser, cfoEmail, cfoPassword, async (request) => {
      // #162 R2 / CFO decision 1 (2026-10-20, spec 33.10): Read means read only. A Read CFO's PUT / DELETE → 403
      // `Forbidden.` and the stored report is unchanged, so there is nothing to restore (no write is made).
      const before = await call(request, "GET", API);
      const mine = { series: [{ kind: "metric", id: "income" }, { kind: "line", id: "qa-cfo-gone" }], range: { preset: "ytd" }, chart: "line" };
      const p = await call(request, "PUT", API, { json: { report: mine } });
      const d = await call(request, "DELETE", API);
      const after = await call(request, "GET", API);
      check("PFR-14 (#162) a Read CFO's PUT and DELETE → 403 `Forbidden.`; GET still 200 and unchanged", p.status === 403 && p.body?.error === "Forbidden." && d.status === 403 && d.body?.error === "Forbidden." && before.status === 200 && after.status === 200 && same(after.body, before.body), { p, d, before: before.body, after: after.body });
      let ownerSees = "not run";
      await signedIn(browser, email, password, async (ownerRequest) => {
        ownerSees = (await call(ownerRequest, "GET", API)).body?.report ?? null;
      });
      check("PFR-14 isolation: the owner's GET never returns the CFO's attempted report", ownerSees !== "not run" && !same(ownerSees, mine), { ownerSees });
    });
  else if (email && password && !prod) console.log("INFO PFR-14 SKIPPED: set QA_CFO_EMAIL / QA_CFO_PASSWORD (an account with a Personal Finance Read grant)");

  // #153 QA follow-up (folded into #163): an account with no Personal Finance grant → 403 for every method.
  const noEmail = process.env.QA_NONE_EMAIL;
  const noPassword = process.env.QA_NONE_PASSWORD;
  if (!prod && noEmail && noPassword)
    await signedIn(browser, noEmail, noPassword, async (request) => {
      const st = [];
      for (const m of ["GET", "PUT", "DELETE"]) st.push((await call(request, m, API, m === "PUT" ? { json: { report: REPORT } } : {})).status);
      check("PFR-14 no Personal Finance grant: GET / PUT / DELETE → 403", same(st, [403, 403, 403]), st);
    });
  else if (!prod) console.log("INFO PFR-14 no-grant SKIPPED: set QA_NONE_EMAIL / QA_NONE_PASSWORD (the existing 'none' login from roles.mjs: an account without a Personal Finance grant)");
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "pf-report-api.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
