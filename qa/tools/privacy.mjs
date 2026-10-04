// Trackers and referrers (#48, #50) in a real browser. Read-only: GETs and the app's own analytics
// beacon, no sign-in. On /, /calculator?…, /dashboard, /dashboard/sign-in?email=… and a 404:
// - no request to grok.com / grok.me and no cookie for a Grok domain (the old template's extensions.js);
// - every document answers X-Robots-Tag: noindex and Referrer-Policy: no-referrer, and has the matching
//   referrer meta; no manifest / apple-touch-icon link;
// - no request leaves with a Referer that has a path or query string, the Vercel Analytics beacon
//   (/_vercel/insights/*) included, and the beacon's page URL has no query string or hash.
// The Vercel script skips automated browsers (navigator.webdriver), so this hides that flag for the run.
// Writes privacy.json to --out. Exit 1 when a check fails.
import { chromium } from 'playwright';
import fs from 'fs';
import { qaConfig } from "./config.mjs";
const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, checks: [], requests: [] };
const check = (name, ok, detail) => { R.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ''}`); };
const GROK = /(^|\.)grok\.(com|me)$/i;
const PATHS = ['/', '/calculator?ticker=KO&start=2020-10-02', '/dashboard', '/dashboard/sign-in?email=qa-probe%40example.com', '/no-such-page-50'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: (await browser.newContext().then(async (c) => { const p = await c.newPage(); const ua = await p.evaluate(() => navigator.userAgent); await c.close(); return ua; })).replace('HeadlessChrome', 'Chrome') });
await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const requests = [];
page.on('request', async (r) => {
  const h = await r.allHeaders().catch(() => ({}));
  requests.push({ method: r.method(), url: r.url(), referer: h.referer ?? null, body: r.url().includes('/_vercel/insights/') ? r.postData() : undefined });
});
for (const path of PATHS) {
  const res = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  const h = res.headers();
  check(`${path}: X-Robots-Tag noindex`, /noindex/i.test(h['x-robots-tag'] ?? ''), h['x-robots-tag']);
  check(`${path}: Referrer-Policy no-referrer`, h['referrer-policy'] === 'no-referrer', h['referrer-policy']);
  const metas = await page.$$eval('meta[name="referrer"]', (m) => m.map((x) => x.content));
  check(`${path}: referrer meta`, metas.length > 0 && metas.every((c) => c === 'no-referrer'), metas);
  check(`${path}: no manifest / apple-touch-icon link`, (await page.locator('link[rel="manifest"], link[rel="apple-touch-icon"]').count()) === 0);
  check(`${path}: document.referrer empty after in-app loads`, path === PATHS[0] || (await page.evaluate(() => document.referrer)) === '', await page.evaluate(() => document.referrer));
  await page.waitForTimeout(1500);
}
const grokReqs = requests.filter((r) => GROK.test(new URL(r.url).hostname)).map((r) => r.url);
check('no request to grok.com / grok.me', grokReqs.length === 0, grokReqs);
const cookies = (await ctx.cookies()).map((c) => `${c.domain} ${c.name}`);
check('no Grok-domain cookies', !cookies.some((c) => /grok\./i.test(c)), cookies);
const leaky = requests.filter((r) => r.referer && (() => { try { const u = new URL(r.referer); return u.pathname !== '/' || u.search || u.hash; } catch { return true; } })());
check('no Referer with a path or query on any request', leaky.length === 0, leaky.map((r) => `${r.url} <- ${r.referer}`));
const beacons = requests.filter((r) => /\/_vercel\/insights\/(view|event)/.test(r.url));
check('analytics beacon sent (page views)', beacons.length > 0, beacons.length);
check('beacon requests carry no Referer', beacons.every((r) => !r.referer), beacons.map((r) => r.referer));
const urls = beacons.map((r) => { try { const b = JSON.parse(r.body ?? '{}'); return { o: b.o, r: b.r }; } catch { return {}; } });
check('beacon page URLs have no query or hash', urls.every((u) => !u.o || !/[?#]/.test(u.o)), urls);
R.requests = requests.map((r) => ({ method: r.method, url: r.url, referer: r.referer }));
fs.writeFileSync(`${CFG.out}/privacy.json`, JSON.stringify(R, null, 1));
await browser.close();
const failed = R.checks.filter((c) => !c.ok).length;
console.log(failed ? `[privacy] ${failed} check(s) failed` : `[privacy] OK (${R.checks.length} checks)`);
process.exit(failed ? 1 : 0);
