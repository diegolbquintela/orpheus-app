import { chromium } from 'playwright';
import fs from 'fs';
import { qaConfig } from "./config.mjs";
const CFG = qaConfig(import.meta.url);
const URL = CFG.baseUrl;
const OUT = CFG.out;
const fixtures = JSON.parse(fs.readFileSync(CFG.fixtures,'utf8'));
const browser = await chromium.launch();
const results = {};
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); // fresh, logged out
for (const fx of fixtures) {
  const page = await ctx.newPage();
  const api = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/chart')) {
      let body = null; try { body = await r.json(); } catch { /* non-JSON body: keep null */ }
      api.push({ url: r.url(), status: r.status(), body });
    }
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  const res = { id: fx.id, kind: fx.kind };
  if (fx.kind === 'content') {
    res.initialText = await page.evaluate(() => document.body.innerText);
    res.html = await page.content();
    await page.screenshot({ path: `${OUT}/${fx.id}-initial.png`, fullPage: true });
    results[fx.id] = res; await page.close(); continue;
  }
  const inp = fx.inputs;
  for (let i = 1; i < inp.tickers.length; i++) await page.getByRole('button', { name: /Add name/ }).click();
  const rows = page.locator('.basket-row');
  for (let i = 0; i < inp.tickers.length; i++) {
    const r = rows.nth(i).locator('input');
    await r.nth(0).fill(inp.tickers[i]);
    await r.nth(1).fill(String(inp.weights[i]));
  }
  const dates = page.locator('input[type=date]');
  await dates.nth(0).fill(inp.start);
  await dates.nth(1).fill(inp.end);
  await page.locator('label:has-text("Starting capital") input').fill(String(inp.capital));
  await page.locator('label:has-text("Contribution") input').fill(String(inp.contribution));
  await page.locator('select').selectOption(inp.frequency);
  await page.screenshot({ path: `${OUT}/${fx.id}-inputs.png`, fullPage: true });
  await page.getByRole('button', { name: 'Compare plans' }).click();
  await Promise.race([
    page.waitForSelector('h2:has-text("Result")', { timeout: 60000 }),
    page.waitForSelector('[role=alert]', { timeout: 60000 }),
  ]).catch(e => res.waitError = String(e));
  await page.waitForTimeout(1500);
  res.alert = await page.locator('[role=alert]').allInnerTexts();
  res.tables = await page.evaluate(() => [...document.querySelectorAll('table')].map(t => [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.innerText.trim()))));
  res.note = await page.evaluate(() => { const p = [...document.querySelectorAll('section p.text-muted')].pop(); return p ? p.innerText : null; });
  // chart tooltips at first/last points
  const svg = page.locator('.recharts-surface').first();
  if (await svg.count()) {
    const grid = await page.locator('.recharts-cartesian-grid').first().boundingBox().catch(()=>null);
    const box = grid || await svg.boundingBox();
    res.tooltips = {};
    for (const [k, x] of [['first', box.x + 1], ['last', box.x + box.width - 1]]) {
      await page.mouse.move(x, box.y + box.height / 2);
      await page.waitForTimeout(400);
      res.tooltips[k] = await page.locator('.recharts-tooltip-wrapper').first().innerText().catch(()=>null);
      await page.screenshot({ path: `${OUT}/${fx.id}-chart-${k}.png`, fullPage: false });
    }
  }
  res.fullText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${OUT}/${fx.id}-result.png`, fullPage: true });
  res.api = api.map(a => ({ url: a.url, status: a.status, error: a.body?.error, currency: a.body?.currency, exchange: a.body?.exchange ?? a.body?.exchangeName, keys: a.body ? Object.keys(a.body) : null, bars: a.body?.bars?.length, dividends: a.body?.dividends, splits: a.body?.splits }));
  fs.writeFileSync(`${OUT}/${fx.id}-api.json`, JSON.stringify(api, null, 1));
  results[fx.id] = res;
  await page.close();
}
fs.writeFileSync(`${OUT}/observed.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log('done');
