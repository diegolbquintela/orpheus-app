// Dashboard metrics sheet and chips (#57, spec §0.7 DR4) in a real browser at phone 400 × 860 and desktop
// 1440 × 900. Signs in with an existing test account (QA_EMAIL / QA_PASSWORD env only; never logged) that
// holds at least one holding, then checks:
//  - DR4-01 phone: a Holdings | Metrics switch; the metrics are hidden until Metrics is chosen, then the list
//    is hidden; switching back shows the list unchanged; no horizontal page scroll either way.
//  - DR4-02 desktop: no switch; list and metrics sheet both visible, the sheet to the right of the list.
//  - DR4-04/05: typing "gross" offers Gross margin (1y) (never a kept chip); choosing it adds it at the end
//    and it survives a reload; its own × removes it again (survives a reload). Skipped when the account
//    already keeps Gross margin (1y).
//  - DR4-06/07: each metrics row has a name plus one cell per kept chip, in chip order; every missing figure
//    reads exactly "—" (no visible reason text).
// Writes: two chip saves on the phone pass (add Gross margin, remove it), leaving the chip list as it was
// (an account still on the defaults becomes "saved" with the same three chips). Never clicks Delete. Signs out
// at the end. Writes dashboard-metrics.json and screenshots to --out. Exit 1 on a fail.
import { chromium } from "playwright";
import fs from "fs";
import { qaConfig } from "./config.mjs";
const CFG = qaConfig(import.meta.url);
const { QA_EMAIL: email, QA_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error("dashboard-metrics.mjs needs QA_EMAIL and QA_PASSWORD (a test account on the allow-list)");
  process.exit(2);
}
const R = { base: CFG.baseUrl, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const skip = (name, detail) => {
  R.checks.push({ name, ok: true, skipped: true, detail });
  console.log(`SKIP ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const chipKeys = (page) => page.getByTestId("metric-chip").evaluateAll((els) => els.map((e) => e.dataset.key));
const noScroll = async (page, w) => (await page.evaluate(() => document.documentElement.scrollWidth)) <= w;
const browser = await chromium.launch();
for (const [vp, viewport, mobile] of [["phone", { width: 400, height: 860 }, true], ["desktop", { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const login = await page.request.post(`${CFG.baseUrl}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: CFG.baseUrl } });
  check(`[${vp}] sign-in`, login.ok(), login.status());
  await page.goto(`${CFG.baseUrl}/dashboard`, { waitUntil: "networkidle" });
  const rows = await page.getByTestId("holding-row").count();
  const sheet = page.getByTestId("metrics");
  const list = page.getByTestId("holdings-list");
  if (!rows) {
    skip(`[${vp}] metrics checks (the account has no holdings; add one first)`);
  } else if (mobile) {
    const sw = page.getByTestId("sheet-switch");
    check(`[${vp}] Holdings | Metrics switch`, (await sw.isVisible()) && (await sw.getByRole("button").allInnerTexts()).map((t) => t.trim()).join("|") === "Holdings|Metrics");
    check(`[${vp}] list first, metrics hidden`, (await list.isVisible()) && !(await sheet.isVisible()));
    check(`[${vp}] no horizontal scroll (list)`, await noScroll(page, viewport.width));
    await page.screenshot({ path: `${CFG.out}/metrics-${vp}-list.png` });
    const before = await list.innerText();
    await page.getByTestId("sheet-switch-metrics").click();
    check(`[${vp}] Metrics shows the sheet and hides the list (never beside it)`, (await sheet.isVisible()) && !(await list.isVisible()));
    check(`[${vp}] no horizontal scroll (metrics)`, await noScroll(page, viewport.width));
    await page.screenshot({ path: `${CFG.out}/metrics-${vp}-sheet.png`, fullPage: true });
    await page.getByTestId("sheet-switch-holdings").click();
    check(`[${vp}] switching back shows the list unchanged`, (await list.isVisible()) && (await list.innerText()) === before);
    await page.getByTestId("sheet-switch-metrics").click();
  } else {
    check(`[${vp}] no switch`, !(await page.getByTestId("sheet-switch").isVisible()));
    const [lb, sb] = [await list.boundingBox(), await sheet.boundingBox()];
    check(`[${vp}] list and metrics both visible, the sheet on the right`, Boolean(lb && sb && (await sheet.isVisible()) && sb.x >= lb.x + lb.width - 1), { list: lb, sheet: sb });
    check(`[${vp}] no horizontal scroll`, await noScroll(page, viewport.width));
    await page.screenshot({ path: `${CFG.out}/metrics-${vp}.png`, fullPage: true });
  }
  if (rows) {
    const chips = await chipKeys(page);
    const ths = await page.getByTestId("metric-th").evaluateAll((els) => els.map((e) => e.dataset.key));
    check(`[${vp}] headers = kept chips, in order`, JSON.stringify(ths) === JSON.stringify(chips), { chips, ths });
    const shape = await page.getByTestId("metric-row").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('[data-testid="metric-cell"]')].map((c) => c.dataset.key)));
    check(`[${vp}] each row: one cell per kept chip, in chip order`, shape.length === rows && shape.every((r) => JSON.stringify(r) === JSON.stringify(chips)), shape[0]);
    const missing = await page.locator('[data-testid="metric-cell"]:not([data-status="ok"])').evaluateAll((els) =>
      els.map((e) => {
        const c = e.cloneNode(true);
        c.querySelectorAll(".sr-only").forEach((s) => s.remove());
        return c.textContent.trim();
      }),
    );
    check(`[${vp}] every missing figure is exactly "—"`, missing.every((t) => t === "—"), [...new Set(missing)]);
    if (mobile) {
      if (chips.includes("gross_margin_1y")) skip(`[${vp}] add / remove a chip (Gross margin (1y) is already kept)`);
      else {
        const search = page.getByTestId("metric-search");
        await search.fill("gross");
        const offered = await page.getByTestId("metric-option").allInnerTexts();
        check(`[${vp}] "gross" offers Gross margin (1y)`, offered.map((t) => t.trim()).join("|") === "Gross margin (1y)", offered);
        await Promise.all([
          page.waitForResponse((r) => r.url().endsWith("/api/dashboard/columns") && r.request().method() === "PUT"),
          page.getByTestId("metric-option").first().click(),
        ]);
        await page.waitForFunction(() => document.querySelector('[data-testid="metric-chip"][data-key="gross_margin_1y"]'), null, { timeout: 20000 }).catch(() => {});
        check(`[${vp}] the chip is added at the end`, JSON.stringify(await chipKeys(page)) === JSON.stringify([...chips, "gross_margin_1y"]));
        await page.reload({ waitUntil: "networkidle" });
        await page.getByTestId("sheet-switch-metrics").click();
        check(`[${vp}] it survives a reload`, JSON.stringify(await chipKeys(page)) === JSON.stringify([...chips, "gross_margin_1y"]));
        await page.screenshot({ path: `${CFG.out}/metrics-${vp}-added.png`, fullPage: true });
        await Promise.all([
          page.waitForResponse((r) => r.url().endsWith("/api/dashboard/columns") && r.request().method() === "PUT"),
          page.getByRole("button", { name: "Remove Gross margin (1y)" }).click(),
        ]);
        await page.waitForFunction(() => !document.querySelector('[data-testid="metric-chip"][data-key="gross_margin_1y"]'), null, { timeout: 20000 }).catch(() => {});
        await page.reload({ waitUntil: "networkidle" });
        check(`[${vp}] its own × removes it (and its column), surviving a reload`, JSON.stringify(await chipKeys(page)) === JSON.stringify(chips) && (await page.locator('[data-testid="metric-th"][data-key="gross_margin_1y"]').count()) === 0);
      }
    }
  }
  const out = await page.request.post(`${CFG.baseUrl}/api/auth/sign-out`, { data: {}, headers: { origin: CFG.baseUrl } });
  check(`[${vp}] sign-out`, out.ok(), out.status());
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${CFG.out}/dashboard-metrics.json`, JSON.stringify(R, null, 2));
const failed = R.checks.filter((c) => !c.ok).length;
const skipped = R.checks.filter((c) => c.skipped).length;
console.log(`${failed ? "FAIL" : "PASS"}: ${R.checks.length - failed - skipped}/${R.checks.length - skipped}${skipped ? ` (${skipped} skipped)` : ""} · out ${CFG.out}`);
process.exit(failed ? 1 : 0);
