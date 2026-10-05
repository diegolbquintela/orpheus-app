// Dashboard book (#58, spec §0.7 DR5) in a real browser at phone 400 × 860 and desktop 1440 × 900. Signs in
// with an existing test account (QA_EMAIL / QA_PASSWORD env only; never logged) that holds at least one
// holding, then checks, read-only:
//  - DR5-01: exactly one total under the list (full digits, two decimals, base code, or "—"); no total cost
//    or return; the excluded line only when a row has no value.
//  - DR5-02: a donut (data-shape="donut", aria-label "Donut chart of share of the book: …") whose legend is
//    the valued rows' share of the book, largest first (ties by ticker), the 10 largest + "Other" past ten
//    names, each % equal to the row's share; no "price pending" / "FX pending" list; no donut when nothing
//    is valued.
//  - DR5-03/04/05: the metrics sheet's foot is the `Book` row with one figure per kept chip, in chip order;
//    each figure is "—" alone or "x.x% · N% covered" (never "0% covered"); the EPS chip carries
//    "EPS growth 1y (weighted)"; Share of the book reads 100.0% (± 0.1). For the % chips the figure is
//    re-derived from the visible row cells and row weights (dashes left out, weights renormalised; rounding
//    tolerance 0.15 points, coverage ± 1 point).
// No writes: never adds, edits, saves chips or clicks Delete. Signs out at the end. Writes
// dashboard-book.json and screenshots to --out. Exit 1 on a fail.
import { chromium } from "playwright";
import fs from "fs";
import { qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
const CFG = qaConfig(import.meta.url);
const { QA_EMAIL: email, QA_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error("dashboard-book.mjs needs QA_EMAIL and QA_PASSWORD (a test account on the allow-list)");
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
const pct = (t) => (/^-?\d+(\.\d+)?%$/.test(t) ? Number(t.slice(0, -1)) : null);
const browser = await chromium.launch();
try {
await eachViewport({ browser, baseUrl: CFG.baseUrl, email, password, check }, async ({ vp, viewport, mobile, page }) => {
  await page.goto(`${CFG.baseUrl}/dashboard`, { waitUntil: "networkidle" });
  const nRows = await page.getByTestId("holding-row").count();
  if (!nRows) {
    skip(`[${vp}] book checks (the account has no holdings; add one first)`);
  } else {
    // Rows as the list shows them: symbol, value text, share text.
    const rows = await page.getByTestId("holding-row").evaluateAll((lis) =>
      lis.map((li) => ({
        symbol: li.dataset.symbol,
        value: li.querySelector('[data-testid="holding-value"]')?.textContent.trim(),
        weight: li.querySelector('[data-testid="holding-weight"]')?.textContent.trim(),
      })),
    );
    // DR5-01
    const totals = await page.getByTestId("holdings-total").allInnerTexts();
    check(`[${vp}] DR5-01 exactly one total`, totals.length === 1, totals);
    check(`[${vp}] DR5-01 total is full digits + base code (or —)`, /^(—|\d{1,3}(,\d{3})*\.\d{2} (CAD|USD|EUR))$/.test(totals[0]?.trim() ?? ""), totals[0]);
    check(`[${vp}] DR5-01 no total cost / return`, (await page.locator('[data-testid^="holdings-total-cost"], [data-testid^="holdings-total-return"]').count()) === 0);
    const unvalued = rows.filter((r) => r.value === "—").length;
    const note = await page.getByTestId("holdings-total-excluded-count").count();
    check(`[${vp}] DR5-01 excluded line only when a row has no value`, unvalued ? note === 1 : note === 0, { unvalued, note });
    // DR5-02
    const valued = rows.filter((r) => pct(r.weight) !== null).map((r) => ({ ...r, w: pct(r.weight) }));
    const pie = page.getByTestId("holdings-pie");
    if (!valued.length) check(`[${vp}] DR5-02 no donut with nothing valued`, (await pie.count()) === 0);
    else {
      check(`[${vp}] DR5-02 donut`, (await pie.getAttribute("data-shape")) === "donut" && /^Donut chart of share of the book: /.test((await pie.locator('div[role="img"]').first().getAttribute("aria-label")) ?? ""));
      const legend = await page.getByTestId("pie-slice").evaluateAll((lis) => lis.map((li) => [li.dataset.label, li.querySelector('[data-testid="pie-slice-pct"]').textContent.trim()]));
      const order = [...valued].sort((a, b) => b.w - a.w || a.symbol.localeCompare(b.symbol));
      const top = order.slice(0, 10);
      const want = top.map((r) => r.symbol).concat(order.length > 10 ? ["Other"] : []);
      // Ties in the rounded weight may order differently from the exact values; compare as sets per rounded weight.
      const sameOrder = legend.length === want.length && legend.every(([l], i) => l === want[i] || (l !== "Other" && valued.find((r) => r.symbol === l)?.w === valued.find((r) => r.symbol === want[i])?.w));
      check(`[${vp}] DR5-02 largest first, Other past ten names`, sameOrder, { legend: legend.map((l) => l[0]), want });
      const pctsMatch = legend.filter(([l]) => l !== "Other").every(([l, p]) => valued.find((r) => r.symbol === l)?.weight === p);
      check(`[${vp}] DR5-02 legend % = the rows' share of the book`, pctsMatch, legend);
      for (let i = 1; i < legend.length; i++) if (legend[i][0] !== "Other" && pct(legend[i][1]) > pct(legend[i - 1][1])) check(`[${vp}] DR5-02 legend descending`, false, legend);
    }
    check(`[${vp}] DR5-02 no pending lists under the donut`, (await page.locator('[data-testid="pie-price-pending"], [data-testid="pie-fx-pending"]').count()) === 0 && !/price pending:|FX pending:/.test(await page.locator("body").innerText()));
    check(`[${vp}] no horizontal scroll (list)`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width);
    await page.screenshot({ path: `${CFG.out}/book-${vp}-list.png`, fullPage: true });
    // DR5-03..05
    if (mobile) await page.getByTestId("sheet-switch-metrics").click();
    const chips = await page.getByTestId("metric-chip").evaluateAll((els) => els.map((e) => e.dataset.key));
    const foot = page.getByTestId("book-row");
    if (!chips.length) check(`[${vp}] no chips → no Book row`, (await foot.count()) === 0);
    else {
      check(`[${vp}] DR5-03 the foot is the Book row`, (await foot.locator("td").first().innerText()).trim() === "Book");
      const cells = await foot.locator('[data-testid="portfolio-metric"]').evaluateAll((els) =>
        els.map((e) => ({ key: e.dataset.key, text: e.querySelector('[data-testid="portfolio-metric-value"]').textContent.trim(), label: e.querySelector('[data-testid="portfolio-metric-label"]')?.textContent.trim() ?? null })),
      );
      check(`[${vp}] DR5-03 one book figure per kept chip, in chip order`, JSON.stringify(cells.map((c) => c.key)) === JSON.stringify(chips), cells.map((c) => c.key));
      for (const c of cells) {
        if (c.key === "share_of_book") {
          const v = pct(c.text);
          check(`[${vp}] DR5-05 Share of the book = sum of the weights`, valued.length ? v !== null && Math.abs(v - 100) <= 0.1 : c.text === "—", c.text);
          continue;
        }
        const m = /^(-?\d+\.\d)% · (\d+)% covered$/.exec(c.text);
        check(`[${vp}] DR5-04 ${c.key}: "—" alone or "x.x% · N% covered" (never 0% covered)`, c.text === "—" || (m && m[2] !== "0"), c.text);
        if (c.key === "eps_1y") {
          check(`[${vp}] DR5-03 EPS book figure labelled`, c.label === "EPS growth 1y (weighted)", c.label);
          continue;
        }
        // Re-derive from the visible row cells (rounded) and row weights.
        const figs = await page.locator(`[data-testid="metric-row"]`).evaluateAll((trs, key) =>
          trs.map((tr) => {
            const cell = tr.querySelector(`[data-testid="metric-cell"][data-key="${key}"]`);
            return { symbol: tr.dataset.symbol, ok: cell?.dataset.status === "ok", text: cell?.textContent.trim() };
          }), c.key);
        const used = figs.filter((f) => f.ok && pct(f.text) !== null && valued.some((r) => r.symbol === f.symbol));
        const wsum = used.reduce((s, f) => s + valued.find((r) => r.symbol === f.symbol).w, 0);
        if (!used.length) check(`[${vp}] DR5-04 ${c.key}: nobody has a figure → "—"`, c.text === "—", c.text);
        else if (wsum > 0 && m) {
          const want = used.reduce((s, f) => s + valued.find((r) => r.symbol === f.symbol).w * pct(f.text), 0) / wsum;
          const cov = (wsum / valued.reduce((s, r) => s + r.w, 0)) * 100;
          check(`[${vp}] DR5-03/04 ${c.key}: weighted over holdings with a figure (dashes left out)`, Math.abs(Number(m[1]) - want) <= 0.15 && Math.abs(Number(m[2]) - cov) <= 1.01, { shown: c.text, want: want.toFixed(2), coverage: cov.toFixed(1) });
        }
      }
    }
    check(`[${vp}] no horizontal scroll (metrics)`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width);
    await page.screenshot({ path: `${CFG.out}/book-${vp}${mobile ? "-metrics" : ""}.png`, fullPage: true });
  }
});
} finally {
  await browser.close();
}
fs.writeFileSync(`${CFG.out}/dashboard-book.json`, JSON.stringify(R, null, 2));
const failed = R.checks.filter((c) => !c.ok).length;
const skipped = R.checks.filter((c) => c.skipped).length;
console.log(`${failed ? "FAIL" : "PASS"}: ${R.checks.length - failed - skipped}/${R.checks.length - skipped}${skipped ? ` (${skipped} skipped)` : ""} · out ${CFG.out}`);
process.exit(failed ? 1 : 0);
