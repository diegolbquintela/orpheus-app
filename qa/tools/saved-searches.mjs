// Calculator saved searches (#80; spec attachments/site-style-spec.md §7b, ST4-19..24) in a real browser at
// 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900. Signed out, no account. The only network writes are the
// calculator's own GET /api/chart requests.
//
// Per width, in a fresh browser context (an empty browser):
//   ST4-19 `Saved searches` is a button, the form's first control, above `02` Basket; closed by default
//          (aria-expanded false, no panel); opens and closes; site font; empty: `No saved searches yet.`
//   ST4-21 a refused submit (field checks) stores nothing; a successful calculation stores the search (the
//          $313,000 regression case, then VOO with a $100 monthly contribution); calculating keeps the fields
//   ST4-20 open: newest first, each line exactly `<TICKERS> · <start> – <end> · DCA <amount>` then `Load`,
//          underlined by a 1 px #8b9298 rule across the form's full width; Load fills every field, closes the
//          panel, clears the result, sends no request; no other save control
//   ST4-22 refresh: the fields hold the last search, the list (closed) the same lines; no result; layout shift
//          on the restore: hero 0, the page total reported
//   ST4-23 no auth: no request to /api/auth/* or /api/dashboard/* at any point; localStorage holds exactly the
//          two keys; no cookie; sessionStorage empty; no IndexedDB database
//   ST4-24 a second context (another device) sees no list and blank fields; clearing the site's data
//          (CDP Storage.clearDataForOrigin) and reloading shows the empty list and blank fields
// At 1440 also: six different searches leave the newest 5 (the oldest drops), a repeat moves to the top.
// Screenshots: saved-<w>.png (the open list), saved-<w>-restored.png (after a refresh).
//   node qa/tools/saved-searches.mjs --base-url <url> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, checks: [], shots: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const VIEWPORTS = [
  ["phone360", { width: 360, height: 780 }, true],
  ["phone", { width: 400, height: 860 }, true],
  ["wide", { width: 1024, height: 800 }, false],
  ["desktop", { width: 1440, height: 900 }, false],
];
const RULE = "rgb(139, 146, 152)";
const KEYS = ["orpheus.calculator.last.v1", "orpheus.calculator.saved.v1"];
const REGRESSION = { rows: [["PLTR", 50], ["TQQQ", 50]], start: "2020-10-02", end: "2026-10-01", capital: "1000", contribution: "1000", frequency: "weekly" };
const VOO = (contribution) => ({ rows: [["VOO", 100]], start: "2023-01-03", end: "2024-12-31", capital: "5000", contribution, frequency: "monthly" });
const LINE_REG = "PLTR, TQQQ · 2020-10-02 – 2026-10-01 · DCA $1,000";
const LINE_VOO = (amount) => `VOO · 2023-01-03 – 2024-12-31 · DCA $${amount}`;
const values = (s) => [...s.rows.flatMap(([t, w]) => [t, String(w)]), s.start, s.end, s.capital, s.contribution, s.frequency];

async function fill(page, { rows, start, end, capital, contribution, frequency }) {
  // Start from one basket row (a restored search may have more).
  while ((await page.locator('[data-testid="basket-row"]').count()) > 1) await page.getByRole("button", { name: "Remove name" }).last().click();
  for (let i = 1; i < rows.length; i++) await page.getByRole("button", { name: /Add name/ }).click();
  for (let i = 0; i < rows.length; i++) {
    const r = page.locator('[data-testid="basket-row"]').nth(i);
    await r.locator("[data-testid=ticker-input]").fill(rows[i][0]);
    await r.locator("[data-testid=weight-input]").fill(String(rows[i][1]));
  }
  await page.locator('input[data-field="start"]').fill(start);
  await page.locator('input[data-field="end"]').fill(end);
  await page.locator('input[data-field="capital"]').fill(capital);
  await page.locator('input[data-field="contribution"]').fill(contribution);
  await page.locator('select[data-field="frequency"]').selectOption(frequency);
}
async function calculate(page, search) {
  await fill(page, search);
  await page.getByRole("button", { name: "Compare plans" }).click();
  // Done when this search is the stored last one (a result from the previous search may still be on screen).
  await page.waitForFunction(({ ticker, contribution }) => {
    const last = JSON.parse(localStorage.getItem("orpheus.calculator.last.v1") ?? "null");
    return last && last.rows[0].ticker === ticker && last.contribution === contribution;
  }, { ticker: search.rows[0][0], contribution: search.contribution }, { timeout: 90000 });
  await page.waitForSelector("[data-testid=results]", { timeout: 90000 });
}
const fieldValues = (page) => page.evaluate(() => [...document.querySelectorAll("[data-testid=calculator-form] input, [data-testid=calculator-form] select")].map((e) => e.value));
const stored = (page) => page.evaluate(() => {
  const keys = Object.keys(localStorage).sort();
  return { keys, last: localStorage.getItem("orpheus.calculator.last.v1"), saved: JSON.parse(localStorage.getItem("orpheus.calculator.saved.v1") ?? "null"), session: sessionStorage.length };
});
async function openList(page) {
  const toggle = page.locator("[data-testid=saved-toggle]");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.waitForSelector("[data-testid=saved-panel]");
  return page.locator("[data-testid=saved-text]").allTextContents();
}
async function closeList(page) {
  const toggle = page.locator("[data-testid=saved-toggle]");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
}

const browser = await chromium.launch();
try {
  for (const [vp, viewport, mobile] of VIEWPORTS) {
    const tag = `[${vp}]`;
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const requests = [];
    page.on("request", (req) => requests.push({ url: req.url(), method: req.method() }));
    try {
      await page.addInitScript(() => {
        window.__shifts = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__shifts.push({ value: e.value, hero: (e.sources ?? []).some((s) => { const el = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement); return !!el?.closest?.("[data-testid=calculator-hero]"); }) });
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${base}/calculator`, { waitUntil: "networkidle" });
      // ST4-19
      const t = await page.evaluate(() => {
        const form = document.querySelector("[data-testid=calculator-form]");
        const toggle = form.querySelector("[data-testid=saved-toggle]");
        const basket = document.querySelector("[data-testid=basket-row]").closest("section");
        const ticker = document.querySelector("[data-testid=ticker-input]");
        return {
          tag: toggle.tagName, type: toggle.type, text: toggle.textContent, expanded: toggle.getAttribute("aria-expanded"), controls: !!toggle.getAttribute("aria-controls"),
          first: form.querySelector("button, input, select") === toggle,
          above: toggle.getBoundingClientRect().bottom <= basket.getBoundingClientRect().top && toggle.getBoundingClientRect().bottom <= ticker.getBoundingClientRect().top,
          panel: !!document.querySelector("[data-testid=saved-panel]"),
          font: getComputedStyle(toggle).fontFamily === getComputedStyle(document.body).fontFamily,
          saveControls: [...document.querySelectorAll("button, input[type=submit], a")].filter((b) => /save/i.test(b.textContent ?? b.value ?? "") && b !== toggle).length,
        };
      });
      check(`${tag} ST4-19 "Saved searches" is a button, the form's first control, above 02 Basket and Ticker`, t.tag === "BUTTON" && t.type === "button" && t.text === "Saved searches" && t.first && t.above && t.controls && t.font, t);
      check(`${tag} ST4-19 closed by default`, t.expanded === "false" && !t.panel, { expanded: t.expanded, panel: t.panel });
      check(`${tag} ST4-20 no other save control on the page`, t.saveControls === 0, t.saveControls);
      await page.locator("[data-testid=saved-toggle]").focus();
      const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`; });
      check(`${tag} ST4-19 chalk focus ring`, ring === "solid 2px rgb(242, 240, 235)", ring);
      const empty = await openList(page);
      const emptyText = await page.locator("[data-testid=saved-empty]").textContent();
      check(`${tag} ST4-19 opens; empty: "No saved searches yet."`, empty.length === 0 && emptyText === "No saved searches yet.", emptyText);
      await closeList(page);
      check(`${tag} ST4-19 closes again`, (await page.locator("[data-testid=saved-panel]").count()) === 0, null);
      // ST4-21: a refused submit stores nothing.
      await page.getByRole("button", { name: "Compare plans" }).click();
      await page.waitForSelector("[data-testid=field-error]");
      check(`${tag} ST4-21 a refused submit stores nothing`, (await stored(page)).keys.length === 0, await stored(page));
      // Two successful calculations.
      await calculate(page, REGRESSION);
      const invested = await page.locator('[data-testid="result-plan"][data-plan="dca"] [data-key="invested"] dd').innerText();
      check(`${tag} ST4-21 regression: DCA Total invested $313,000`, invested === "$313,000", invested);
      check(`${tag} ST4-22 calculating keeps the search in the fields`, JSON.stringify(await fieldValues(page)) === JSON.stringify(values(REGRESSION)), await fieldValues(page));
      const regStored = (await stored(page)).last;
      await calculate(page, VOO("100"));
      const st = await stored(page);
      check(`${tag} ST4-23 localStorage holds exactly the two keys`, JSON.stringify(st.keys) === JSON.stringify(KEYS), st.keys);
      check(`${tag} ST4-21 saved on success: the last search and the list newest first`, JSON.parse(st.last).contribution === "100" && st.saved.length === 2 && st.saved[0].rows[0].ticker === "VOO" && st.saved[1].rows[0].ticker === "PLTR", { last: JSON.parse(st.last).rows, saved: st.saved.map((s) => s.rows.map((r) => r.ticker).join(",")) });
      // ST4-20: the list.
      const lines = await openList(page);
      check(`${tag} ST4-20 lines word for word, newest first (the search's own DCA amount)`, JSON.stringify(lines) === JSON.stringify([LINE_VOO("100"), LINE_REG]), lines);
      const geo = await page.evaluate(() => {
        const form = document.querySelector("[data-testid=calculator-form]").getBoundingClientRect();
        return [...document.querySelectorAll("[data-testid=saved-line]")].map((l) => {
          const s = getComputedStyle(l);
          const b = l.getBoundingClientRect();
          const load = l.querySelector("[data-testid=saved-load]");
          return { under: `${s.borderBottomWidth} ${s.borderBottomStyle} ${s.borderBottomColor}`, left: b.left - form.left, right: form.right - b.right, load: load.textContent, loadH: load.getBoundingClientRect().height, font: s.fontFamily === getComputedStyle(document.body).fontFamily, scroll: document.scrollingElement.scrollWidth <= innerWidth };
        });
      });
      check(`${tag} ST4-20 each line: 1 px rule underline across the form's full width, Load (≥ 44 px), site font`, geo.length === 2 && geo.every((g) => g.under === `1px solid ${RULE}` && Math.abs(g.left) <= 1 && Math.abs(g.right) <= 1 && g.load === "Load" && g.loadH >= 43.5 && g.font && g.scroll), geo);
      const shot = join(CFG.out, `saved-${viewport.width}.png`);
      await page.locator("[data-testid=calculator-form]").screenshot({ path: shot });
      R.shots.push(shot);
      // Load the older one (the regression case): fills every field, closes the list, clears the result, no request.
      const before = requests.length;
      await page.locator("[data-testid=saved-load]").nth(1).click();
      await page.waitForTimeout(300);
      check(`${tag} ST4-20 Load fills every field word for word`, JSON.stringify(await fieldValues(page)) === JSON.stringify(values(REGRESSION)), await fieldValues(page));
      check(`${tag} ST4-20 Load closes the list, clears the result, sends no request`, (await page.locator("[data-testid=saved-panel]").count()) === 0 && (await page.locator("[data-testid=result]").count()) === 0 && requests.length === before, { requests: requests.slice(before).map((r) => r.url) });
      // ST4-22: refresh restores the last search (VOO $100) and the list.
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      const shifts = await page.evaluate(() => window.__shifts);
      check(`${tag} ST4-22 refresh: the fields hold the last search, no result`, JSON.stringify(await fieldValues(page)) === JSON.stringify(values(VOO("100"))) && (await page.locator("[data-testid=result]").count()) === 0, await fieldValues(page));
      check(`${tag} ST4-22 refresh: the list closed, the same lines`, (await page.locator("[data-testid=saved-toggle]").getAttribute("aria-expanded")) === "false" && JSON.stringify(await openList(page)) === JSON.stringify([LINE_VOO("100"), LINE_REG]), null);
      const heroShift = shifts.filter((s) => s.hero).reduce((a, s) => a + s.value, 0);
      const pageShift = shifts.reduce((a, s) => a + s.value, 0);
      check(`${tag} ST4-22 the restore moves nothing in the hero (hero CLS 0; page ${Math.round(pageShift * 1e5) / 1e5}, reported)`, heroShift === 0, { hero: heroShift, page: pageShift });
      R.restoreCls ??= {};
      R.restoreCls[vp] = { hero: heroShift, page: pageShift };
      const restored = join(CFG.out, `saved-${viewport.width}-restored.png`);
      await page.screenshot({ path: restored, fullPage: true });
      R.shots.push(restored);
      await closeList(page);
      if (viewport.width === 1440) {
        // Cap 5: after VOO 100 and the regression case, four more: the regression case (oldest) drops.
        for (const amount of ["200", "300", "400", "500"]) await calculate(page, VOO(amount));
        const five = await openList(page);
        check(`[desktop] ST4-21 six different searches leave the newest 5, the oldest dropped`, JSON.stringify(five) === JSON.stringify(["500", "400", "300", "200", "100"].map(LINE_VOO)), five);
        await closeList(page);
        await calculate(page, VOO("300"));
        const again = await openList(page);
        check(`[desktop] ST4-21 the same search again moves to the top, no duplicate`, JSON.stringify(again) === JSON.stringify(["300", "500", "400", "200", "100"].map(LINE_VOO)), again);
        await closeList(page);
      }
      // ST4-23: no auth, nothing but localStorage.
      const auth = requests.filter((r) => /\/api\/(auth|dashboard)\b/.test(new URL(r.url).pathname));
      check(`${tag} ST4-23 no request to /api/auth or /api/dashboard (signed out, no account)`, auth.length === 0, auth);
      const apis = [...new Set(requests.filter((r) => new URL(r.url).pathname.startsWith("/api/")).map((r) => `${r.method} ${new URL(r.url).pathname}`))];
      check(`${tag} ST4-23 the only API requests are GET /api/chart`, apis.every((a) => a === "GET /api/chart"), apis);
      // The site's own cookies (a third-party font host may set its own, e.g. Cloudflare's __cf_bm on Google Fonts).
      const cookies = await ctx.cookies(base);
      const others = (await ctx.cookies()).filter((c) => !cookies.includes(c)).map((c) => `${c.name}@${c.domain}`);
      check(`${tag} ST4-23 no cookie for the site`, cookies.length === 0, { site: cookies.map((c) => c.name), thirdParty: others });
      const extra = await page.evaluate(async () => ({ session: sessionStorage.length, idb: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [], keys: Object.keys(localStorage).sort() }));
      check(`${tag} ST4-23 nothing in sessionStorage or IndexedDB; localStorage only the two keys`, extra.session === 0 && extra.idb.length === 0 && JSON.stringify(extra.keys) === JSON.stringify(KEYS), extra);
      // ST4-24: another device sees nothing.
      const other = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
      const op = await other.newPage();
      await op.goto(`${base}/calculator`, { waitUntil: "networkidle" });
      await op.waitForTimeout(500);
      const ov = await fieldValues(op);
      const ol = await openList(op);
      const oe = await op.locator("[data-testid=saved-empty]").textContent().catch(() => null);
      check(`${tag} ST4-24 another device (a second context) sees no list and blank fields`, ol.length === 0 && oe === "No saved searches yet." && ov.every((v) => v === ""), { values: ov, lines: ol });
      await other.close();
      // ST4-24: clear site data wipes both.
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Storage.clearDataForOrigin", { origin: new URL(base).origin, storageTypes: "all" });
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const cv = await fieldValues(page);
      const cl = await openList(page);
      const ck = await page.evaluate(() => Object.keys(localStorage));
      check(`${tag} ST4-24 clear site data: empty list, blank fields, no keys`, cl.length === 0 && cv.every((v) => v === "") && ck.length === 0, { values: cv, lines: cl, keys: ck });
      // ST4-22: a refresh restoring a two-name basket (the regression case) adds a basket row after load: the hero
      // never moves; the page shift is reported.
      await page.evaluate((reg) => {
        localStorage.setItem("orpheus.calculator.last.v1", reg);
        localStorage.setItem("orpheus.calculator.saved.v1", `[${reg}]`);
      }, regStored);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      const two = await page.evaluate(() => window.__shifts);
      const twoHero = two.filter((x) => x.hero).reduce((a, x) => a + x.value, 0);
      const twoPage = two.reduce((a, x) => a + x.value, 0);
      check(`${tag} ST4-22 restoring a two-name basket: the fields filled, hero CLS 0 (page ${Math.round(twoPage * 1e5) / 1e5}, reported)`, twoHero === 0 && JSON.stringify(await fieldValues(page)) === JSON.stringify(values(REGRESSION)), { hero: twoHero, page: twoPage });
      R.restoreCls[vp].twoNames = { hero: twoHero, page: twoPage };
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "saved-searches.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
