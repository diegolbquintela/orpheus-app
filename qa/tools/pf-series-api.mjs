// Personal Finance historical series API (#154; spec section 36; design attachments/pf-series-design.md; AC
// PFS-01..PFS-16). Backend only: HTTP checks against POST /api/personal-finance/series on a preview. READ-ONLY: it
// never writes to the account (the series API stores nothing; the record is only read with GET).
//
//   Signed out (always): PFS-01 POST / GET → 401 (or 405 for GET).
//   Signed in (QA_EMAIL / QA_PASSWORD from env; never logged): PFS-02..PFS-12 / PFS-14 / PFS-16 on the owner's data.
//   Optional QA_CFO_EMAIL / QA_CFO_PASSWORD (Personal Finance Read): the same series as the owner (PFS-02).
//   Optional QA_NONE_EMAIL / QA_NONE_PASSWORD (no Personal Finance grant, the 'none' login): 403 (PFS-01).
//
//   [QA_EMAIL=… QA_PASSWORD=… [QA_CFO_…] [QA_NONE_…]] node qa/tools/pf-series-api.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { eachViewport } from "./session.mjs";

const CFG = qaConfig(import.meta.url);
// #157 (QA run 2026-10-17 F2, EL): refuse production before any request or sign-in (qa/tools/prod-guard.mjs).
const GUARD = await refuseIfProd(CFG.baseUrl, "pf-series-api");
const base = CFG.baseUrl;
const R = { base, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
};
const API = "/api/personal-finance/series";
const EXPENSES_KEY = "orpheus.finance.expenses.v2";
import { RANGE_AFTER_CURRENT, RANGE_BEFORE_FIRST } from "./pf-helpers.mjs";
import { seriesNetChecks, storedStart } from "./pf-asof-checks.mjs";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The current household month (America/Toronto), as the server computes it. */
const current = (() => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
})();
const monthsFrom2020 = (Number(current.slice(0, 4)) - 2020) * 12 + Number(current.slice(5, 7));

async function call(request, method, json, raw) {
  const r = await request.fetch(`${base}${method === "GET" && json === undefined ? "/api/personal-finance" : API}`, {
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
const MAIN = { series: [G("fixed"), G("variable"), G("all"), M("expenses"), M("income"), M("surplus"), M("net-assets")], range: { preset: "all" } };

const browser = await chromium.launch();
try {
  const anon = async (method) =>
    (await fetch(`${base}${API}`, { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(MAIN) : undefined })).status;
  const get = await anon("GET");
  if (GUARD.signedOutProd) {
    // #157 F7: no POST on production; GET only.
    console.log("INFO signed-out write probes SKIPPED (signed-out prod mode)");
    check("PFS-01 signed out (prod, GET only): GET → 401 or 405", get === 401 || get === 405, { get });
  } else {
    const post = await anon("POST");
    check("PFS-01 signed out: POST → 401; GET → 401 or 405", post === 401 && (get === 401 || get === 405), { post, get });
  }

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) console.log("INFO PFS-02..PFS-16 SKIPPED (signed in): set QA_EMAIL / QA_PASSWORD in env");
  else {
    let owner = null;
    await signedIn(browser, email, password, async (request) => {
      const record = (await call(request, "GET")).body?.data ?? null;
      let r = await call(request, "POST", MAIN);
      owner = r.body;
      const j = r.body ?? {};
      check("PFS-02 owner: 200 with range / months / current / partial / currency / series", r.status === 200 && Array.isArray(j.months) && j.current === current && j.partial === true && typeof j.currency === "string" && j.series?.length === 7 && j.series.every((s) => s.values.length === j.months.length), { status: r.status, current: j.current, from: j.range?.from });
      const ok = (s) => s.values.every((v) => v === null || typeof v === "number");
      check("PFS-10 every value is a number or null (no data → null)", (j.series ?? []).every(ok));
      let eq = true;
      const bad = [];
      (j.months ?? []).forEach((k, i) => {
        const [f, v, a, e] = j.series.slice(0, 4).map((s) => s.values[i]);
        if (a === null) return;
        if (Math.abs(f + v - a) > 0.005 || (e !== null && Math.abs(e - a) > 0.005) || (e === null && a > 0)) {
          eq = false;
          bad.push(k);
        }
      });
      check("PFS-11 totals: fixed + variable = all = metric expenses, every month with data", eq, bad);
      r = await call(request, "POST", { series: [G("all")], range: { from: "2020-01", to: current } });
      check(`PFS-08 custom 2020-01..${current}: 200, ${monthsFrom2020} months (no 24-month cap)`, r.status === 200 && r.body?.months?.length === monthsFrom2020, { status: r.status, n: r.body?.months?.length });
      r = await call(request, "POST", { series: [G("all")], range: { preset: "12m" } });
      check("PFS-12 12m: 12 months ending at the current household month", r.status === 200 && r.body?.months?.length === 12 && r.body.range.to === current, r.body?.range);
      const cases = [
        [{ series: [{ kind: "pie", id: "x" }], range: { preset: "all" } }, "series.0.kind"],
        [{ series: [], range: { preset: "all" } }, "series"],
        [{ series: [G("all")], range: { preset: "5y" } }, "range.preset"],
        // #179 Q-AF4 (CFO, 2026-10-17): the bounds say why (status and field unchanged). 2100-01 is a valid month (inside
        // 2000..2100) after the current month → the end message; 2101-01 is outside the span → still Invalid value.
        [{ series: [G("all")], range: { from: "2019-12", to: "2020-03" } }, "range", RANGE_BEFORE_FIRST],
        [{ series: [G("all")], range: { from: "2020-01", to: "2100-01" } }, "range", RANGE_AFTER_CURRENT],
        [{ series: [G("all")], range: { from: "2020-01", to: "2101-01" } }, "range"],
        [{ ...MAIN, chart: "line" }, "query"],
      ];
      const got = [];
      for (const [body, field, error = "Invalid value."] of cases) {
        const x = await call(request, "POST", body);
        got.push(x.status === 400 && same(x.body, { error, field }) ? "ok" : { field, error, ...x });
      }
      check("PFS-03..PFS-06 refusals: 400 { error (Invalid value., or the #179 range bound messages), field }", got.every((g) => g === "ok"), got);
      r = await call(request, "POST", undefined, JSON.stringify(MAIN) + " ".repeat(4100));
      check("PFS-07 above 4 KB → 413", r.status === 413, r);
      r = await call(request, "POST", { series: [{ kind: "line", id: "qa-series-gone" }], range: { preset: "3m" } });
      check("PFS-14 an unknown line → missing, all null", r.status === 200 && r.body.series[0].missing === true && r.body.series[0].values.every((v) => v === null), r.body?.series);
      let deleted = [];
      try {
        const e = JSON.parse(record?.[EXPENSES_KEY] ?? "{}");
        deleted = [...(e.deletedCategories ?? []).map((d) => ({ kind: "category", id: d.name })), ...(e.deletedAccounts ?? []).map((d) => ({ kind: "account", id: d.name }))].slice(0, 12);
      } catch {
        deleted = [];
      }
      if (!deleted.length) console.log("INFO PFS-09 SKIPPED: the account's record has no deleted category / account (PGlite test covers it)");
      else {
        r = await call(request, "POST", { series: deleted, range: { preset: "all" } });
        const s = r.body?.series ?? [];
        check("PFS-09 deleted names: label '<name> (deleted)', deleted: true (or missing when no line holds them)", r.status === 200 && s.every((x) => x.missing || (x.deleted && x.label === `${x.id} (deleted)`)), s.map((x) => [x.label, x.deleted, x.missing]));
      }
      // #154 2026-10-17: Q-AA3 condition and the anchored net assets (Q-AA4 change, Q-AA10).
      check("PFS-19 fx_basis: current", j.fx_basis === "current", j.fx_basis);
      const na = j.series?.[6]?.values ?? [];
      const from = j.net_assets_from ?? null;
      // #171 (2026-10-17) + Q-AG1 (CFO change) + QA early finding 2 (on 1ca3c3d, QA's): months before net_assets_from
      // are back-filled (not null) when the as-of month is after the first data month; the anchor month's value is
      // non-null and equals start + its surplus (start = the stored Starting net assets); every month after the first
      // value = the one before + its own surplus. Shared logic: pf-asof-checks.mjs (replayed in as-of.server.test.ts).
      const sur = j.series?.[5]?.values ?? [];
      const nc = seriesNetChecks(j, na, sur, storedStart(record));
      check("PFS-20 net assets start at or before net_assets_from (back-filled, Q-AG1); the anchor month = start + its surplus", nc.pfs20, { from, ...nc });
      check("PFS-18 net assets: never null after the first value; each month = the one before + its surplus (none → flat)", nc.pfs18, { from });
      const pick = j.months?.length ? j.months[Math.max(0, j.months.length - 2)] : null;
      const vals = [];
      for (const range of [{ preset: "all" }, { preset: "24m" }, { from: pick && pick >= "2020-02" ? pick.slice(0, 5) + "01" : pick, to: current }]) {
        const x = await call(request, "POST", { series: [M("net-assets")], range });
        vals.push(x.status === 200 ? x.body.series[0].values[x.body.months.indexOf(pick)] : `status ${x.status}`);
      }
      check(`PFS-17 net assets for ${pick} equal across all / 24m / custom`, vals.every((v) => JSON.stringify(v) === JSON.stringify(vals[0])), vals);
      const after = (await call(request, "GET")).body?.data ?? null;
      check("PFS-16 read-only: the record is unchanged", same(after, record));
    });
    const cfoE = process.env.QA_CFO_EMAIL;
    const cfoP = process.env.QA_CFO_PASSWORD;
    if (cfoE && cfoP)
      await signedIn(browser, cfoE, cfoP, async (request) => {
        const r = await call(request, "POST", MAIN);
        check("PFS-02 CFO (Read): 200, the same series as the owner", r.status === 200 && same(r.body, owner), r.status);
      });
    else console.log("INFO PFS-02 CFO SKIPPED: set QA_CFO_EMAIL / QA_CFO_PASSWORD");
    const noneE = process.env.QA_NONE_EMAIL;
    const noneP = process.env.QA_NONE_PASSWORD;
    if (noneE && noneP)
      await signedIn(browser, noneE, noneP, async (request) => {
        const r = await call(request, "POST", MAIN);
        check("PFS-01 no Personal Finance grant → 403", r.status === 403, r.status);
      });
    else console.log("INFO PFS-01 no-grant SKIPPED: set QA_NONE_EMAIL / QA_NONE_PASSWORD");
  }
} finally {
  await browser.close();
}
const failed = R.checks.filter((c) => !c.ok).length;
console.log(`\n${R.checks.length - failed}/${R.checks.length} passed`);
if (CFG.out) writeFileSync(join(CFG.out, "pf-series-api.json"), JSON.stringify(R, null, 2));
process.exit(failed ? 1 : 0);
