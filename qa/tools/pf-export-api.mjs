// Personal Finance report export (#157; spec section 39; design attachments/pf-export-design.md; AC PFX-01..PFX-18).
// Backend only: GET /api/personal-finance/reports/:id/export?format=pdf|png on a preview. READ-ONLY (exports are made
// on request and stored nowhere; this tool only GETs). Refuses production before any request (qa/tools/prod-guard.mjs).
//
//   Signed out (always): PFX-01 → 401 for pdf and png.
//   Signed in (QA_EMAIL / QA_PASSWORD from env; never logged): for every listed report, PDF and PNG are valid (magic,
//   structure), carry the headers, and embed exactly what /chart { saved: true, id } returns; the as-of / FX lines (and
//   the 36.11 caveat with net assets) are in the PDF text; unknown id 404; bad format 400.
//   Optional QA_NONE_EMAIL / QA_NONE_PASSWORD (no Personal Finance grant): 403.
//
//   [QA_EMAIL=… QA_PASSWORD=… [QA_NONE_…]] node qa/tools/pf-export-api.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { readPdf, readPng } from "./export-parse.mjs";
import { EXPORT_AS_OF_SUFFIX, EXPORT_FX_LINE, EXPORT_LINES_NOTE, NET_ASSETS_AS_OF_NOTE, NET_ASSETS_CAVEAT, REPORT_NOT_FOUND } from "./pf-helpers.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const url = (id, format) => `/api/personal-finance/reports/${id}/export${format ? `?format=${format}` : ""}`;
const API_VIEWPORT = [["api", { width: 1024, height: 800 }, false]];
const signedIn = async (browser, email, password, fn) =>
  await eachViewport({ browser, baseUrl: base, email, password, check, viewports: API_VIEWPORT }, async ({ page }) => fn(page.request));

// QA #174 note 1: before any GET or sign-in.
await refuseIfProd(base, "pf-export-api");
const browser = await chromium.launch();
try {
  const anon = [await fetch(`${base}${url("default", "pdf")}`), await fetch(`${base}${url("default", "png")}`)].map((r) => r.status);
  check("PFX-01 signed out: pdf / png → 401", same(anon, [401, 401]), anon);
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) console.log("INFO PFX-02..PFX-18 SKIPPED (signed in): set QA_EMAIL / QA_PASSWORD in env");
  else
    await signedIn(browser, email, password, async (request) => {
      const reports = (await (await request.fetch(`${base}/api/personal-finance/reports`)).json())?.reports ?? [];
      if (!reports.length) console.log("INFO no saved reports on this account: per-report export checks SKIPPED (save one with pf-reports-api QA_WRITE=1 or the report API)");
      for (const rep of reports) {
        const chart = await (await request.fetch(`${base}/api/personal-finance/chart`, { method: "POST", headers: { origin: base, "content-type": "application/json" }, data: JSON.stringify({ saved: true, id: rep.id }) })).json();
        for (const format of ["pdf", "png"]) {
          const r = await request.fetch(`${base}${url(rep.id, format)}`);
          const buf = Buffer.from(await r.body());
          let parsed = null;
          let err = null;
          try {
            parsed = format === "pdf" ? readPdf(buf) : readPng(buf);
          } catch (e) {
            err = String(e);
          }
          const h = r.headers();
          check(`PFX-02/03 ${rep.id} ${format}: 200, ${format} content type, attachment filename, no-store, valid file`, r.status() === 200 && h["content-type"] === (format === "pdf" ? "application/pdf" : "image/png") && /^attachment; filename="orpheus-report-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.(pdf|png)"$/.test(h["content-disposition"] ?? "") && h["cache-control"] === "no-store" && !err, { status: r.status(), err, size: buf.length });
          check(`PFX-05 ${rep.id} ${format}: embedded data equals /chart { saved: true, id }`, parsed && same(parsed.data, chart), { size: buf.length });
          if (parsed) {
            const note = format === "pdf" ? parsed.text.includes(EXPORT_LINES_NOTE) : parsed.text["orpheus-note"] === EXPORT_LINES_NOTE;
            check(`PFX-18 ${rep.id} ${format}: '${EXPORT_LINES_NOTE}' ${chart.chart === "line" ? "absent (line chart)" : `present (${chart.chart})`}`, note === (chart.chart !== "line"));
          }
          if (format === "pdf" && parsed) {
            const text = parsed.text.join("\n");
            const net = chart.series?.some((s) => s.id === "net-assets" && s.kind === "metric");
            // #171 Q-AG7 (2026-10-17): with an as-of month stored, 'Net assets from: <month> (as-of month)' and the as-of note
            // replace the caveat; without one, the caveat as before. Exactly one of the two, never both.
            const flat = text.replace(/\n/g, " ");
            const cav = flat.includes(NET_ASSETS_CAVEAT.slice(0, 60));
            const asOfNote = flat.includes(`Net assets from: ${chart.net_assets_from} ${EXPORT_AS_OF_SUFFIX}`) && flat.includes(NET_ASSETS_AS_OF_NOTE.slice(0, 60));
            check(`PFX-06/07 ${rep.id} pdf: as-of, generated, FX basis${net ? ", net assets from and either the 36.11 caveat or (#171) the as-of note" : ""}`, text.includes(`As of: ${chart.current}`) && text.includes("Generated: ") && text.includes(EXPORT_FX_LINE) && (!net || (text.includes("Net assets from:") && cav !== asOfNote)), { cav, asOfNote });
          }
        }
      }
      // PFX-17: the audit log is readable only by the owner (/api/account/audit); other accounts get 403 and skip this.
      const au = await request.fetch(`${base}/api/account/audit?limit=50`);
      if (au.status() === 200 && reports.length) {
        const ev = ((await au.json()).events ?? []).filter((e) => e.action === "pf.report_export");
        check("PFX-17 recent audit rows include a pf.report_export (format:<pdf|png> id:<code>) per export made", ev.length >= reports.length * 2 && ev.every((e) => e.action === "pf.report_export" && /^format:(pdf|png) id:[a-zA-Z_]+$/.test(e.detail ?? "")), ev.map((e) => `${e.action} ${e.detail}`));
      } else console.log(`INFO PFX-17 audit check SKIPPED (audit API ${au.status()}: only the owner can read the audit log)`);
      const nf = await request.fetch(`${base}${url("r-00000000", "pdf")}`);
      check(`PFX-09 unknown id → 404 '${REPORT_NOT_FOUND}'`, nf.status() === 404 && (await nf.json()).error === REPORT_NOT_FOUND, nf.status());
      const bf = await request.fetch(`${base}${url("default", "svg")}`);
      check("PFX-10 bad format → 400 field format", bf.status() === 400 && same(await bf.json(), { error: "Invalid value.", field: "format" }), bf.status());
    });
  if (process.env.QA_NONE_EMAIL && process.env.QA_NONE_PASSWORD)
    await signedIn(browser, process.env.QA_NONE_EMAIL, process.env.QA_NONE_PASSWORD, async (request) => {
      const r = await request.fetch(`${base}${url("default", "pdf")}`);
      check("PFX-01 no Personal Finance grant → 403", r.status() === 403, r.status());
    });
  else console.log("INFO PFX-01 no-grant SKIPPED: set QA_NONE_EMAIL / QA_NONE_PASSWORD");
} finally {
  await browser.close();
}
const failed = R.checks.filter((c) => !c.ok).length;
console.log(`\n${R.checks.length - failed}/${R.checks.length} passed`);
if (CFG.out) writeFileSync(join(CFG.out, "pf-export-api.json"), JSON.stringify(R, null, 2));
process.exit(failed ? 1 : 0);
