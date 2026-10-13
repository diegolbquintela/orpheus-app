// Dashboard company view (#95; design attachments/dashboard-company-view-design.md, CV-08..CV-14 in
// qa/CANONICAL-AC-PACK.md), on a preview with the #90 QA accounts. Credentials from env only, never logged or written:
//   QA_OWNER_EMAIL / QA_OWNER_PASSWORD (the owner), QA_PM_* (Dashboard Read and write), QA_NONE_* (no grant).
// #121: --seed also adds 1 RMS.PA (no SEC filings) when not held, checks NC-05 / NC-06 and deletes it at the end.
// Read-only unless --seed: then, when the owner holds no PLTR, the tool adds 1 PLTR share as the owner, runs the
// preview-only daily refresh (closes, SEC companyfacts, metrics) and deletes that holding again at the end. The symbol
// is PLTR when held, else the first holding (reported).
// API: CV-10 (401 / 403 / 404 not_held / 405 / 400), CV-11 (API rows = page rows).
// Browser at 400 × 860 and 1440 × 900 as the owner and the PM: CV-08 order, CV-09 ranges, CV-12 dark shell / lyre /
// footer / no gold / .ow-label / noindex, CV-13 one or two columns, no horizontal scroll, strict CLS 0, CV-14 the PM.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = [];
function check(name, pass, detail) {
  R.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
}
const env = process.env;
const ACC = {
  owner: [env.QA_OWNER_EMAIL, env.QA_OWNER_PASSWORD],
  pm: [env.QA_PM_EMAIL, env.QA_PM_PASSWORD],
  none: [env.QA_NONE_EMAIL, env.QA_NONE_PASSWORD],
};
for (const [k, [e, p]] of Object.entries(ACC))
  if (!e || !p) {
    console.error(`[dashboard-company] missing credentials for ${k} in env`);
    process.exit(2);
  }

class Jar {
  c = new Map();
  header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  take(res) {
    for (const sc of res.headers.getSetCookie()) {
      const kv = sc.split(";")[0];
      const i = kv.indexOf("=");
      if (!kv.slice(i + 1) || /max-age=0\b/i.test(sc)) this.c.delete(kv.slice(0, i));
      else this.c.set(kv.slice(0, i), kv.slice(i + 1));
    }
  }
}
async function http(jar, method, path, body) {
  const headers = { origin: base, accept: "application/json" };
  if (jar?.c.size) headers.cookie = jar.header();
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  jar?.take(r);
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: r.status, cc: r.headers.get("cache-control"), json };
}
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function signIn(email, password) {
  for (let i = 0; i < 6; i++) {
    const jar = new Jar();
    const r = await http(jar, "POST", "/api/auth/sign-in/email", { email, password });
    if (r.status === 429) {
      await wait(11000);
      continue;
    }
    return { jar: r.status === 200 ? jar : null, status: r.status };
  }
  return { jar: null, status: 429 };
}


const st = await http(null, "GET", "/api/dashboard/status");
if (!st.json || st.json.dashboard !== "enabled" || st.json.ownerEmail !== "set") {
  console.error(`[dashboard-company] refusing: ${base} is not a preview with the Dashboard on and ORPHEUS_OWNER_EMAIL set`);
  process.exit(3);
}
const jars = {};
for (const k of Object.keys(ACC)) {
  const s = await signIn(...ACC[k]);
  jars[k] = s.jar;
  check(`sign-in ${k}`, s.jar, s.status);
  if (!s.jar) process.exit(1);
}

// ---------------------------------------------------------------- pick the symbol (read only)
let holdingsRes = await http(jars.owner, "GET", "/api/dashboard/holdings");
let held = (holdingsRes.json?.holdings ?? []).map((h) => h.symbol);
let seededId = null;
// #121 (NC-05..NC-07): an uncovered listing (no SEC filings), seeded like PLTR and deleted at the end.
const UNCOVERED = "RMS.PA";
let uncoveredId = null;
const SEED = process.argv.includes("--seed");
if (SEED && !held.includes(UNCOVERED)) {
  const add = await http(jars.owner, "POST", "/api/dashboard/holdings", { symbol: UNCOVERED, shares: "1", avgCost: "" });
  uncoveredId = add.json?.holding?.id ?? null;
  check(`seed: owner adds 1 ${UNCOVERED} (removed at the end)`, add.status === 201 || add.status === 200, [add.status, add.json?.error]);
}
const addPltr = SEED && !held.includes("PLTR");
const addedUncovered = SEED && !held.includes(UNCOVERED);
if (addPltr || addedUncovered) {
  if (addPltr) {
  const add = await http(jars.owner, "POST", "/api/dashboard/holdings", { symbol: "PLTR", shares: "1", avgCost: "" });
  seededId = add.json?.holding?.id ?? null;
  check("seed: owner adds 1 PLTR (removed at the end)", add.status === 201 || add.status === 200, [add.status, add.json?.error]);
  }
  for (let i = 0; i < 3; i++) {
    const run = await http(jars.owner, "POST", "/api/dashboard/refresh", {});
    console.log(`[dashboard-company] refresh ${run.status} ${run.json?.status ?? ""}`);
    if (run.json?.status !== "locked") break;
    await wait(20000);
  }
  holdingsRes = await http(jars.owner, "GET", "/api/dashboard/holdings");
  held = (holdingsRes.json?.holdings ?? []).map((h) => h.symbol);
  const idOf = (sym) => (holdingsRes.json?.holdings ?? []).find((h) => h.symbol === sym)?.id ?? null;
  if (addPltr) seededId ??= idOf("PLTR");
  if (addedUncovered) uncoveredId ??= idOf(UNCOVERED);
}
const SYMBOL = held.includes("PLTR") ? "PLTR" : held[0];
check("a held symbol to open (PLTR when held)", SYMBOL, { symbol: SYMBOL, pltr: held.includes("PLTR"), held: held.length });
if (!SYMBOL) process.exit(1);
const API = `/api/dashboard/company/${encodeURIComponent(SYMBOL)}`;

// ---------------------------------------------------------------- API (CV-10, CV-11)
const api = await http(jars.owner, "GET", API);
const c = api.json?.company;
check("CV-10 owner API 200, private cache", api.status === 200 && /private/.test(api.cc ?? ""), [api.status, api.cc]);
check("CV-08 API sections in order", JSON.stringify(c?.sections?.map((s) => s.title)) === '["Profile","Margins","Returns","Valuation","Growth","Dividends"]', c?.sections?.map((s) => s.title));
check("CV-10 signed out 401", (await http(null, "GET", API)).status === 401);
check("CV-10 no grant 403", (await http(jars.none, "GET", API)).status === 403);
check("CV-10 PM 200 (Dashboard grant)", (await http(jars.pm, "GET", API)).status === 200);
const notHeld = await http(jars.owner, "GET", "/api/dashboard/company/ZZZZQ");
check("CV-10 a symbol not held: 404 not_held", notHeld.status === 404 && notHeld.json?.error === "not_held", [notHeld.status, notHeld.json]);
check("CV-10 POST 405", (await http(jars.owner, "POST", API, {})).status === 405);
check("CV-10 malformed symbol 400", (await http(jars.owner, "GET", "/api/dashboard/company/%3Cx%3E")).status === 400);
const rowsOf = (comp) => (comp?.sections ?? []).flatMap((s) => s.rows.map((r) => [r.key, r.text]));
const apiRows = rowsOf(c);
check("CV-06/CV-08 every row has a text, statuses from the fixed list", apiRows.length >= 24 && (c?.sections ?? []).every((s) => s.rows.every((r) => r.text && ["ok", "n/m", "not_covered", "pending", "not_reported", "mismatch", "none"].includes(r.status))), apiRows.length);
check("CV-12 no K / M / B (every digit)", !apiRows.some(([, t]) => /\d[KMBT]\b/.test(t)), apiRows.filter(([, t]) => /\d[KMBT]\b/.test(t)));

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const NIGHT = "rgb(30, 33, 36)";
const toCookies = (jar) => [...jar.c].map(([name, value]) => ({ name, value, url: base }));
try {
  for (const [vp, viewport] of [["phone", { width: 400, height: 860 }], ["desktop", { width: 1440, height: 900 }]]) {
    for (const who of ["owner", "pm"]) {
      const tag = `[${vp}] [${who}] /dashboard/company/${SYMBOL}`;
      const ctx = await browser.newContext({ viewport });
      await ctx.addCookies(toCookies(jars[who]));
      await ctx.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      const page = await ctx.newPage();
      const resp = await page.goto(`${base}/dashboard/company/${encodeURIComponent(SYMBOL)}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const all = [...document.querySelectorAll("body *")];
        const colours = new Set(all.flatMap((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor, s.borderTopColor]; }));
        const secs = [...document.querySelectorAll('[data-testid^="company-section-"]')];
        const lefts = new Set(secs.map((s) => Math.round(s.getBoundingClientRect().left)));
        return {
          titles: secs.map((s) => s.querySelector("h2")?.textContent),
          labelClass: secs.every((s) => s.querySelector("h2")?.classList.contains("ow-label")),
          rows: [...document.querySelectorAll('[data-testid^="company-row-"]')].map((r) => [r.getAttribute("data-testid").slice(12), r.querySelector("dd")?.textContent]),
          name: document.querySelector('[data-testid="company-name"]')?.textContent,
          chart: !!document.querySelector('[data-testid="company-chart"]'),
          columns: lefts.size,
          scroll: document.scrollingElement.scrollWidth - window.innerWidth,
          bg: getComputedStyle(document.body).backgroundColor,
          lyre: !!document.querySelector('nav[aria-label="Site"] svg'),
          footer: document.querySelector("footer")?.textContent?.trim(),
          robots: document.querySelector('meta[name="robots"]')?.content,
          gold: [...colours].filter((c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) return false; const [r, g, b] = m.slice(1).map(Number); return r > 150 && g > 110 && b < 90 && r - b > 90; }),
          cls: window.__cls,
        };
      });
      check(`${tag} 200`, resp?.status() === 200, resp?.status());
      check(`${tag} CV-08 header, chart, six sections in order`, m.name && m.chart && JSON.stringify(m.titles) === '["Profile","Margins","Returns","Valuation","Growth","Dividends"]', [m.name, m.titles]);
      check(`${tag} CV-11 page rows = API rows`, JSON.stringify(m.rows) === JSON.stringify(apiRows), { page: m.rows.length, api: apiRows.length });
      check(`${tag} CV-12 dark shell, lyre, footer Orpheus Wisdom, noindex, .ow-label titles`, m.bg === NIGHT && m.lyre && m.footer === "Orpheus Wisdom" && m.robots === "noindex, nofollow" && m.labelClass, { bg: m.bg, lyre: m.lyre, footer: m.footer, robots: m.robots });
      check(`${tag} CV-12 no gold`, m.gold.length === 0, m.gold);
      check(`${tag} CV-13 ${vp === "phone" ? "one column" : "two columns"}`, m.columns === (vp === "phone" ? 1 : 2), m.columns);
      check(`${tag} CV-13 no horizontal scroll`, m.scroll <= 0, m.scroll);
      check(`${tag} CV-13 strict CLS 0`, m.cls === 0, m.cls);
      if (who === "owner") {
        const pressed = async (k) => page.locator(`[data-testid="company-range-${k}"]`).getAttribute("aria-pressed");
        const pts = async () => Number(await page.locator(".company-chart-box").getAttribute("data-points"));
        const p1 = await pts();
        check(`${tag} CV-09 1Y is the default`, (await pressed("1y")) === "true");
        await page.locator('[data-testid="company-range-max"]').click();
        const pMax = await pts();
        const change = await page.locator('[data-testid="company-change"]').textContent();
        check(`${tag} CV-09 Max switches the chart and the change line`, (await pressed("max")) === "true" && pMax >= p1 && /over Max$|^—$/.test(change ?? ""), [p1, pMax, change]);
        await page.locator('[data-testid="company-range-5y"]').click();
        check(`${tag} CV-09 5Y`, (await pressed("5y")) === "true" && /over 5Y$|^—$/.test((await page.locator('[data-testid="company-change"]').textContent()) ?? ""));
        await page.screenshot({ path: join(CFG.out, `company-${vp}.png`), fullPage: true });
      }
      await ctx.close();
    }
    // CV-07: the link from the holding row.
    const ctx = await browser.newContext({ viewport });
    await ctx.addCookies(toCookies(jars.owner));
    const page = await ctx.newPage();
    await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
    const row = page.locator(`[data-testid="holding-row"][data-symbol="${SYMBOL}"]`);
    await row.locator('[data-testid="holding-row-toggle"]').click();
    const link = row.locator('[data-testid="holding-company-link"]');
    check(`[${vp}] CV-07 Open company view link in the expanded row`, (await link.textContent()) === "Open company view" && (await link.getAttribute("href")) === `/dashboard/company/${encodeURIComponent(SYMBOL)}`);
    await link.click();
    await page.waitForURL(`**/dashboard/company/**`, { timeout: 15000 }).catch(() => {});
    check(`[${vp}] CV-07 the link opens the company view`, await page.locator('[data-testid="company-view"]').count() === 1, page.url());
    await ctx.close();
    // CV-10 page gate: signed out → sign-in, no grant → 403 page, not held → message.
    const anon = await browser.newContext({ viewport });
    const ap = await anon.newPage();
    await ap.goto(`${base}/dashboard/company/${SYMBOL}`, { waitUntil: "networkidle" });
    check(`[${vp}] CV-10 signed out → /dashboard/sign-in`, /\/dashboard\/sign-in$/.test(new URL(ap.url()).pathname), ap.url());
    await anon.close();
    const nctx = await browser.newContext({ viewport });
    await nctx.addCookies(toCookies(jars.none));
    const np = await nctx.newPage();
    const nr = await np.goto(`${base}/dashboard/company/${SYMBOL}`, { waitUntil: "networkidle" });
    check(`[${vp}] CV-10 no grant → 403 page, no company data`, nr?.status() === 403 && (await np.locator('[data-testid="company-view"]').count()) === 0, nr?.status());
    await nctx.close();
    const octx = await browser.newContext({ viewport });
    await octx.addCookies(toCookies(jars.owner));
    const op = await octx.newPage();
    await op.goto(`${base}/dashboard/company/ZZZZQ`, { waitUntil: "networkidle" });
    check(`[${vp}] CV-10 not held → "Not in your holdings."`, (await op.locator('[data-testid="company-not-held"]').textContent()) === "Not in your holdings.");
    await octx.close();
  }
  // ---------------------------------------------------------------- #121 an uncovered listing (NC-05, NC-06)
  if (held.includes(UNCOVERED)) {
    const ua = await http(jars.owner, "GET", `/api/dashboard/company/${encodeURIComponent(UNCOVERED)}`);
    const u = ua.json?.company;
    const fund = (u?.sections ?? []).filter((x) => x.key !== "dividends");
    check(`NC-05 ${UNCOVERED} API 200: coverage line, fundamentals rows Not covered, source line, last close`, ua.status === 200 && u?.coverage === "Not covered: no SEC filings" && fund.every((x) => x.rows.every((r) => r.status === "not_covered" && r.text === "Not covered")) && u?.source === "Daily closes and dividends as stored by the Dashboard · no SEC filings for this listing" && !!u?.last, { status: ua.status, coverage: u?.coverage, source: u?.source, last: u?.last, chart: u?.chart?.length });
    check(`NC-06 ${UNCOVERED} no K / M / B`, !rowsOf(u).some(([, t]) => /\d[KMBT]\b/.test(t)));
    for (const [vp, viewport] of [["phone", { width: 400, height: 860 }], ["desktop", { width: 1440, height: 900 }]]) {
      const ctx = await browser.newContext({ viewport });
      await ctx.addCookies(toCookies(jars.owner));
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const resp = await page.goto(`${base}/dashboard/company/${encodeURIComponent(UNCOVERED)}`, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => ({
        line: document.querySelector('[data-testid="company-coverage"]')?.textContent,
        lineColor: document.querySelector('[data-testid="company-coverage"]') ? getComputedStyle(document.querySelector('[data-testid="company-coverage"]')).color : null,
        svg: !!document.querySelector('[data-testid="company-chart-svg"]'),
        titles: [...document.querySelectorAll('[data-testid^="company-section-"] h2')].map((h) => h.textContent),
        labels: [...document.querySelectorAll('[data-testid^="company-section-"] h2')].every((h) => h.classList.contains("ow-label")),
        notCovered: [...document.querySelectorAll('[data-testid^="company-row-"][data-status="not_covered"]')].length,
        source: document.querySelector('[data-testid="company-source"]')?.textContent,
        bg: getComputedStyle(document.body).backgroundColor,
        scroll: document.scrollingElement.scrollWidth - window.innerWidth,
      }));
      await page.screenshot({ path: join(CFG.out, `uncovered-${vp}.png`), fullPage: true });
      check(`[${vp}] NC-05 ${UNCOVERED} page 200, no page error, "Not covered: no SEC filings", chart, six sections, Not covered rows, source line`, resp?.status() === 200 && errors.length === 0 && m.line === "Not covered: no SEC filings" && m.svg && m.titles.length === 6 && m.notCovered >= 20 && /no SEC filings for this listing$/.test(m.source ?? ""), { status: resp?.status(), errors, ...m });
      check(`[${vp}] NC-06 ${UNCOVERED} dark shell, .ow-label, no horizontal scroll`, m.bg === NIGHT && m.labels && m.scroll <= 0, { bg: m.bg, labels: m.labels, scroll: m.scroll });
      await ctx.close();
    }
  } else console.log(`INFO ${UNCOVERED} not held and --seed not given: NC-05 / NC-06 skipped`);
} finally {
  await browser.close();
  if (uncoveredId !== null) {
    const del = await http(jars.owner, "DELETE", `/api/dashboard/holdings/${uncoveredId}`);
    check(`NC-07 seed: the added ${UNCOVERED} holding is deleted again`, del.status === 200 || del.status === 204, del.status);
  }
  if (seededId !== null) {
    const del = await http(jars.owner, "DELETE", `/api/dashboard/holdings/${seededId}`);
    check("seed: the added PLTR holding is deleted again", del.status === 200 || del.status === 204, del.status);
  }
  for (const jar of Object.values(jars)) if (jar) await http(jar, "POST", "/api/auth/sign-out", {});
}
const failedN = R.filter((r) => !r.pass).length;
writeFileSync(join(CFG.out, "dashboard-company.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.length - failedN}/${R.length} passed${failedN ? ` · ${failedN} FAILED` : ""} · out ${CFG.out}`);
process.exit(failedN ? 1 : 0);
