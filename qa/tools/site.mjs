// Site shell (#46) in a real browser: the menu on every route (fixed on scroll, current page, no
// dropdowns), home with exactly two cards and no price requests, the footer (exactly "Orpheus Wisdom"),
// noindex, the calculator's listings note, then the
// calculator at /calculator: the $313,000 regression (PLTR 50 / TQQQ 50, 2020-10-02..2026-10-01,
// $1,000 start + $1,000 weekly) and the VOD.L refusal (HTTP 400, exact message). Read-only: no sign-in.
// Writes site.json and screenshots to --out. Exit 1 when a check fails.
import { chromium } from 'playwright';
import fs from 'fs';
import { qaConfig } from "./config.mjs";
const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const OUT = CFG.out;
const R = { base, checks: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ''}`); };
const VOD_L = 'VOD.L lists on LSE. US, EU, and CA listings only.';
const FOOTER = 'Orpheus Wisdom';
const browser = await chromium.launch();

async function shell(page, path, want) {
  const nav = page.locator('nav[aria-label="Site"]');
  check(`${path}: menu visible`, await nav.isVisible());
  const links = await nav.locator('a').evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute('href')]));
  check(`${path}: menu items`, JSON.stringify(links) === JSON.stringify([['Orpheus', '/'], ['Calculator', '/calculator'], ['Dashboard', '/dashboard']]), links);
  const current = await nav.locator('[aria-current="page"]').allTextContents();
  check(`${path}: current page ${want ?? '(none)'}`, JSON.stringify(current) === JSON.stringify(want ? [want] : []), current);
  if (want) {
    const style = await nav.locator('[aria-current="page"]').evaluate((a) => getComputedStyle(a).textDecorationLine);
    check(`${path}: current page has a visual state (underline)`, /underline/.test(style), style);
  }
  check(`${path}: no dropdowns`, (await nav.locator('button, select, details, [aria-haspopup], [role=menu]').count()) === 0);
  const pos = await nav.evaluate((n) => getComputedStyle(n).position);
  await page.mouse.wheel(0, 4000); await page.waitForTimeout(300);
  const top = await nav.evaluate((n) => Math.round(n.getBoundingClientRect().top));
  check(`${path}: menu stays put on scroll`, ['sticky', 'fixed'].includes(pos) && top === 0, { pos, top });
  await page.evaluate(() => window.scrollTo(0, 0));
  check(`${path}: footer reads exactly Orpheus Wisdom`, (await page.locator('footer').innerText()).trim() === FOOTER, await page.locator('footer').innerText());
  check(`${path}: noindex meta`, (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex, nofollow');
}

for (const vp of ['desktop', 'mobile']) {
  const ctx = await browser.newContext(vp === 'desktop' ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  // A 404 document logs "Failed to load resource … 404" by itself (flag-off /dashboard); that one is expected.
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(m.text()); });
  const requests = []; page.on('request', (r) => requests.push(r.url()));
  const res = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check(`[${vp}] / X-Robots-Tag`, /noindex/i.test(res.headers()['x-robots-tag'] ?? ''), res.headers()['x-robots-tag']);
  await page.screenshot({ path: `${OUT}/home-${vp}.png`, fullPage: true });
  await shell(page, `[${vp}] /`, 'Orpheus');
  const cards = await page.locator('[data-testid="home-card"]').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.querySelector('h2')?.textContent, a.querySelector('p')?.textContent]));
  check(`[${vp}] /: exactly two cards with the issue texts`, JSON.stringify(cards) === JSON.stringify([['/calculator', 'Calculator', 'compare a lump sum with contributions'], ['/dashboard', 'Dashboard', 'holdings, value, stored figures']]), cards);
  check(`[${vp}] /: no price requests, no calculator`, !requests.some((u) => u.includes('/api/chart')) && (await page.locator('form').count()) === 0, requests.filter((u) => u.includes('/api/')));
  await page.locator('[data-testid="home-card"]').first().click();
  await page.waitForURL(/\/calculator$/);
  check(`[${vp}] Calculator card opens /calculator`, new URL(page.url()).pathname === '/calculator');
  await page.waitForLoadState('networkidle');
  await shell(page, `[${vp}] /calculator`, 'Calculator');
  check(`[${vp}] /calculator: listings note under the form`, (await page.getByText('US, EU and CA listings, one currency per basket.', { exact: true }).count()) === 1);
  await page.screenshot({ path: `${OUT}/calculator-${vp}.png`, fullPage: false });
  for (const path of ['/dashboard', '/dashboard/sign-in']) {
    const r = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    const at = new URL(page.url()).pathname;
    if (r.status() === 404) {
      await shell(page, `[${vp}] ${path} (flag off, 404)`, undefined);
    } else {
      check(`[${vp}] ${path} lands on sign-in (signed out)`, at === '/dashboard/sign-in', at);
      await shell(page, `[${vp}] ${path}`, 'Dashboard');
      if (path === '/dashboard/sign-in') await page.screenshot({ path: `${OUT}/sign-in-${vp}.png`, fullPage: false });
    }
  }
  const redirect = await page.goto(`${base}/?ticker=KO`, { waitUntil: 'networkidle' });
  check(`[${vp}] /?ticker=KO → /calculator?ticker=KO`, page.url().endsWith('/calculator?ticker=KO') && redirect.ok(), page.url());
  check(`[${vp}] no page errors`, errors.length === 0, errors);
  await ctx.close();
}

// Calculator regression at /calculator (desktop).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const api = []; page.on('response', async (r) => { if (r.url().includes('/api/chart')) api.push({ url: r.url(), status: r.status(), body: await r.json().catch(() => null) }); });
  const fill = async ({ rows, start, end, capital, contribution, frequency }) => {
    await page.goto(`${base}/calculator`, { waitUntil: 'networkidle' });
    for (let i = 1; i < rows.length; i++) await page.getByRole('button', { name: /Add name/ }).click();
    // #70: basket rows carry data-testid="basket-row" (before #70: the .basket-row class).
    for (let i = 0; i < rows.length; i++) { const r = page.locator('[data-testid="basket-row"], .basket-row').nth(i).locator('input'); await r.nth(0).fill(rows[i][0]); await r.nth(1).fill(String(rows[i][1])); }
    const d = page.locator('input[type=date]'); await d.nth(0).fill(start); await d.nth(1).fill(end);
    await page.locator('label:has-text("Starting capital") input').fill(String(capital));
    await page.locator('label:has-text("Contribution") input').fill(String(contribution));
    await page.locator('select').selectOption(frequency);
    await page.getByRole('button', { name: 'Compare plans' }).click();
  };
  await fill({ rows: [['PLTR', 50], ['TQQQ', 50]], start: '2020-10-02', end: '2026-10-01', capital: 1000, contribution: 1000, frequency: 'weekly' });
  await page.waitForSelector('h2:has-text("Result")', { timeout: 90000 }); await page.waitForTimeout(1000);
  // #70 (ST4-13: only how the value is found changes): label-value rows, `[data-key=invested]` with one `dd` per
  // plan; before #70, the results table's "Total invested" row.
  const rowsNow = page.locator('[data-testid="result-metric"][data-key="invested"] dd');
  const invested = (await rowsNow.count())
    ? await rowsNow.allTextContents()
    : await page.locator('tr', { has: page.locator('th', { hasText: 'Total invested' }) }).first().locator('td').allTextContents();
  const dcaInvested = (await rowsNow.count()) ? await page.locator('[data-testid="result-metric"][data-key="invested"] [data-plan="dca"] dd').innerText() : null;
  R.regression = { invested, dcaInvested };
  check('/calculator: PLTR/TQQQ weekly DCA total invested $313,000', invested.some((t) => t.trim() === '$313,000') && (dcaInvested === null || dcaInvested.trim() === '$313,000'), R.regression);
  await page.locator('section[aria-live]').screenshot({ path: `${OUT}/calculator-result.png` });
  api.length = 0;
  await fill({ rows: [['VOD.L', 100]], start: '2023-01-03', end: '2024-12-31', capital: 10000, contribution: 500, frequency: 'monthly' });
  await page.waitForSelector('[role=alert]', { timeout: 60000 });
  const alert = (await page.locator('[role=alert]').innerText()).trim();
  const vod = api.find((a) => a.url.includes('VOD.L'));
  R.vod = { alert, status: vod?.status, body: vod?.body };
  check('/calculator: VOD.L refused, HTTP 400 + exact message', alert === VOD_L && vod?.status === 400 && vod?.body?.error === VOD_L, R.vod);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/site.json`, JSON.stringify(R, null, 2));
const failed = R.checks.filter((c) => !c.ok).length;
console.log(failed ? `[site] ${failed} check(s) failed` : '[site] OK');
process.exit(failed ? 1 : 0);
