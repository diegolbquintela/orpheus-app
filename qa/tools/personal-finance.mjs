// Personal finance page (#84 v1.1, #85 v1.2 income, #86 v1.3 equity cover, #87 v1.4 foreign currency; spec
// attachments/personal-finance-spec.md PF-01..25, plus the lyre ST1-05) in a
// real browser at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900, signed out. Everything it types stays in that
// browser context's localStorage (no server write exists), so it is safe on any host.
//
//   PF-01 shell: 200, title, noindex meta + X-Robots-Tag, color-scheme dark, charcoal + chalk, the bar unchanged
//         (#97: Orpheus / Calculator / Dashboard / Personal finance, Personal finance current), footer `Orpheus Wisdom`, one Analytics script, no
//         painting; ST1-05 the lyre (aria-hidden SVG) first in the Orpheus link, bar ≤ 48 px, links ≥ 44 px;
//         /favicon.svg is the lyre
//   PF-02 exact copy of the new page (phone: labelled cells; wide: the column-label rows), nothing else
//   PF-03 add / remove lines; Monthly ↔ Yearly conversion; typed value stays as typed; the field check
//   PF-04 % of expenses per line / group / Total; % of income `—` with no income, then (#85) wired to the counted
//         net income (8.9% / 2.2% / 0.9%; totals 11.2% / 0.9% / 12.1% on the spec example)
//   PF-05 totals (the spec example: Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200)
//   PF-06 accounts: inline add, `Name the account.`, any-case reuse, shared by both groups, Cancel
//   PF-07 reload keeps everything from the one key; no /api request, no cookie / sessionStorage / IndexedDB; a new
//         context is empty; a malformed value shows the empty page without an error
//   PF-08 layout (phone stacked, wide one row per line in column order), no horizontal scroll, controls ≥ 44 px,
//         AA (contrast scan; axe-core color-contrast too with AXE_PATH), a ≥ 3:1 focus mark on every Tab stop,
//         no tnum / tabular-nums
//   PF-09 strict page CLS 0 on CLS_RUNS (default 2) cold loads per width, cache disabled, empty and restored
//   PF-11 income copy; PF-12 people (add / remove, defaults, field checks); PF-13 net per person; PF-14 counted +
//         share (own bonus excluded, spouse 80%); PF-15 income table (biweekly = yearly ÷ 26); PF-16 % of income
//         follows every income change, income restored from orpheus.finance.income.v1 (malformed → no people)
//   PF-17 equity-cover copy (the two rates, Rate used); PF-18 formula A (ROIC 8 → 4% → Rent 300,000; withdrawal 5
//         wins; a typed 4 is 4%; 0 → —; the percent check); PF-19 the override (placeholder = calculated, typed
//         wins, a bad one falls back (Q9), cleared → calculated, totals; no rate → — (Q10)); ROIC > 100 valid (Q11); PF-20 rates restored from orpheus.finance.equity.v1, layout
//   PF-21 currency copy (Household currency CAD by default (Q13) above Income, ten codes; a line's Currency, FX rate — on a household
//         line); PF-22 conversion (Condo 2,000 BRL at 0.2 → 400: Fixed 1,650 / 19,800, Total 1,750 / 21,000, 22.9%,
//         % of income 3.6% / 14.7% / 15.6%); PF-23 equity on the household amount (120,000; 495,000 / 30,000 /
//         525,000; override 100,000 → 475,000); PF-24 no valid rate → `Enter a number above 0.` and — in every household
//         figure and total containing the line (Q14), its own Monthly / Yearly as typed; household = the
//         line's currency → × 1; PF-25 orpheus.finance.currency.v1 restored, layout, focus, AA, CLS with a foreign line
//   #94 (today fixed at 11 October 2026): PF-26 the 04 Overview / 05 Update copy (empty page); PF-27 / PF-28 the current
//         month takes the page (1,750 / 11,200), June 2026 typed (4,000 / 9,000) → average 2,875 / 10,100 / 7,225, the Month
//         dropdown (12, October 2026 … November 2025), clearing a month; PF-29 the chart (three lines, net assets 96,700);
//         PF-30 Future 1 / 5 / 10 / 15 years at growth 5 (190,204.37 / 613,370.68), a bad growth rate; PF-31 the overview
//         key restored, malformed → empty; PF-32 layout, 44 px, focus, AA, axe, no gold, CLS with the overview restored
//   PF-10 is the other tools' job (site-style-regression.mjs runs them all, site.mjs the $313,000).
// Screenshots: pf-empty-<w>.png, pf-income-<w>.png, pf-equity-<w>.png, pf-filled-<w>.png, pf-account-<w>.png, pf-check-<w>.png,
//   pf-fx-<w>.png (#87: the foreign line), pf-overview-<w>.png and pf-overview-section-<w>.png (#94).
//   node qa/tools/personal-finance.mjs --base-url <url> --out <dir>
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
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
const PATH = "/personal-finance";
const KEY = "orpheus.finance.expenses.v1";
const INCOME_KEY = "orpheus.finance.income.v1";
const EQUITY_KEY = "orpheus.finance.equity.v1";
const CURRENCY_KEY = "orpheus.finance.currency.v1";
const OVERVIEW_KEY = "orpheus.finance.overview.v1";
const CODES = ["USD", "CAD", "EUR", "GBP", "BRL", "MXN", "CHF", "JPY", "AUD", "CNY"];
// A line's Currency choices under the default household CAD (Q13): CAD first, then the other nine in list order.
const CODES_CAD = ["CAD", "USD", "EUR", "GBP", "BRL", "MXN", "CHF", "JPY", "AUD", "CNY"];
const PERSON_COLUMNS = ["Name", "Wages (yearly)", "Bonus rating (%)", "Average tax (%)", "Net (yearly)", "Count wages", "Count bonus", "Share (%)"];
const TABLE_COLUMNS = ["Income", "Biweekly", "Monthly", "Yearly"];
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const DIM = "rgb(168, 174, 180)";
const ALERT = "rgb(255, 143, 135)";
const COLUMNS = ["Name", "% of income", "% of expenses", "Monthly", "Yearly", "Currency", "FX rate", "Equity to cover", "Account"];
const CLS_RUNS = Number(process.env.CLS_RUNS ?? 2);
const lum = ([r, g, b]) => {
  const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const rgb = (s) => (/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/.exec(s) ?? []).slice(1).map(Number);

// The empty page's copy in <main>, in order (PF-02). Phone: each total row shows its cells' labels; wide: the
// column-label row of each group and the totals' values only (the cells' labels are visually hidden).
const totalTexts = (label, wide, v = { share: "—", monthly: "0", yearly: "0", equity: "0" }) =>
  wide
    ? [label, "—", v.share, v.monthly, v.yearly, v.equity]
    : [label, "% of income", "—", "% of expenses", v.share, "Monthly", v.monthly, "Yearly", v.yearly, "Equity to cover", v.equity];
const emptyTexts = (wide) => [
  "01",
  "Personal finance.",
  "Household currency",
  "02",
  "Income",
  ...(wide ? PERSON_COLUMNS : []),
  "↳ Add person",
  "Income table",
  ...(wide ? TABLE_COLUMNS : []),
  ...(wide ? ["Net income", "0", "0", "0"] : ["Net income", "Biweekly", "0", "Monthly", "0", "Yearly", "0"]),
  "03",
  "Expenses",
  "Withdrawal rate (%)",
  "Portfolio ROIC (%)",
  "Rate used",
  "—",
  "Fixed",
  ...(wide ? COLUMNS : []),
  "↳ Add expense",
  ...totalTexts("Fixed total", wide),
  "Variable",
  ...(wide ? COLUMNS : []),
  "↳ Add expense",
  ...totalTexts("Variable total", wide),
  ...totalTexts("Total", wide),
  // #94: 04 Overview and 05 Update (the chart's plot is aria-hidden and skipped; its legend counts).
  "04",
  "Overview",
  "This month",
  "12-month average",
  "Expenses", "—", "—",
  "Income", "—", "—",
  "Surplus", "—", "—",
  "Starting net assets",
  "Growth rate (%)",
  "Future",
  "Expenses",
  "Income",
  "Net assets",
  "05",
  "Update",
  "Month",
  "Expenses",
  "Income",
];

// In the page: WCAG contrast of every visible text node's element against its effective background.
async function contrastScan(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(c);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
    };
    const lum = ([r, g, b]) => {
      const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const blend = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    const bgOf = (el) => {
      const stack = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) {
          stack.push(c);
          if (c[3] === 1) break;
        }
      }
      let bg = [255, 255, 255];
      for (const c of stack.reverse()) bg = blend(c, bg);
      return bg;
    };
    const bad = [];
    let n = 0;
    const check = (el, text) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden") return;
      let o = 1;
      for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      if (o < 0.99) return;
      const fg = parse(cs.color);
      if (!fg || fg[3] === 0) return;
      const bg = bgOf(el);
      const c = blend(fg, bg);
      const [hi, lo] = [lum(c), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      n++;
      if (ratio < (large ? 3 : 4.5)) bad.push({ text: text.slice(0, 40), ratio: Math.round(ratio * 100) / 100 });
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      const el = t.parentElement;
      if (!el || el.closest("script, style, noscript, option, .sr-only")) continue;
      check(el, t.nodeValue.trim());
    }
    // Field values (typed text and the shown conversion) and the selects' shown option.
    for (const el of document.querySelectorAll("main input:not([type=checkbox]), main select"))
      if ((el.value ?? "").trim()) check(el, el.tagName === "SELECT" ? el.selectedOptions[0]?.text ?? "" : el.value);
    return { n, bad: bad.slice(0, 10) };
  });
}

// Visible texts in <main> in order (leaf text nodes wider and taller than 1 px).
const mainTexts = (page) =>
  page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const s = t.nodeValue.trim();
      const el = t.parentElement;
      if (!s || el.closest("option, select, .pf-chart-plot")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) out.push(s);
    }
    return out;
  });

const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });
const val = (loc) => loc.inputValue();
const txt = async (loc) => (await loc.textContent()).trim();
const line = (page, group, i) => page.locator(`[data-testid=pf-group-${group}] [data-testid=pf-line]`).nth(i);
const totals = async (page, id) => {
  const row = page.locator(`[data-testid=pf-total-${id}]`);
  const out = [];
  for (const f of ["share", "income", "monthly", "yearly", "equity"]) out.push(await txt(row.locator(`[data-testid=pf-total-${f}]`)));
  return out;
};

// PF-09: one cold load (fresh context, cache disabled), every layout shift counted; `stored` restores lines.
async function coldCls(browser, viewport, mobile, stored, overview = null) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.addInitScript(([key, value, incomeKey, income, equityKey, equity, currencyKey, currency, overviewKey, overview]) => {
    if (value) localStorage.setItem(key, value);
    if (income) localStorage.setItem(incomeKey, income);
    if (equity) localStorage.setItem(equityKey, equity);
    if (currency) localStorage.setItem(currencyKey, currency);
    if (overview) localStorage.setItem(overviewKey, overview);
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__shifts.push({ value: e.value, sources: (e.sources ?? []).map((s) => (s.node?.textContent ?? s.node?.nodeName ?? "").slice(0, 30)) });
    }).observe({ type: "layout-shift", buffered: true });
  }, [KEY, stored ?? null, INCOME_KEY, stored ? STORED_INCOME : null, EQUITY_KEY, stored ? STORED_RATES : null, CURRENCY_KEY, stored ? STORED_CURRENCY : null, OVERVIEW_KEY, overview]);
  await page.goto(`${base}${PATH}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => ({ shifts: window.__shifts, lines: document.querySelectorAll("[data-testid=pf-line], [data-testid=pf-person]").length }));
  await ctx.close();
  return { total: m.shifts.reduce((a, e) => a + e.value, 0), sources: m.shifts.flatMap((e) => e.sources), lines: m.lines };
}

const STORED_INCOME = JSON.stringify({
  people: [
    { id: "m1", name: "Me", wages: "120,000", bonus: "10", tax: "30", share: "100", countWages: true, countBonus: false },
    { id: "s1", name: "Spouse", wages: "80,000", bonus: "5", tax: "25", share: "80", countWages: true, countBonus: true },
  ],
});
const STORED_RATES = JSON.stringify({ withdrawal: "", roic: "8" });
const STORED_CURRENCY = JSON.stringify({ household: "USD" });
// #94: today is fixed at 11 October 2026 (local) for the Overview checks; June typed, Future on, 5 years.
const TODAY = new Date(2026, 9, 11, 12);
const STORED_OVERVIEW = JSON.stringify({ start: "10,000", growth: "5", future: true, years: 5, months: { "2026-06": { expenses: "4,000", income: "9,000" } } });
const OV_EXPENSES = JSON.stringify({ fixed: [{ id: "o1", name: "Rent", amount: "1,750", per: "month", equity: "", account: "" }], variable: [], accounts: [] });
const OV_INCOME = JSON.stringify({ people: [{ id: "o2", name: "Me", wages: "134,400", bonus: "", tax: "", share: "100", countWages: true, countBonus: false }] });
const STORED = JSON.stringify({
  fixed: [
    { id: "q1", name: "Rent", amount: "1,000", per: "month", equity: "300,000", account: "Chequing" },
    { id: "q2", name: "Phone", amount: "250", per: "month", equity: "", account: "" },
    { id: "q4", name: "Condo", amount: "2,000", per: "month", equity: "", account: "", currency: "BRL", rate: "0.2" },
  ],
  variable: [{ id: "q3", name: "Gifts", amount: "1,200", per: "year", equity: "", account: "Visa" }],
  accounts: ["Chequing", "Visa"],
});

let AXE = null;
if (process.env.AXE_PATH) AXE = readFileSync(process.env.AXE_PATH, "utf8");
else console.log("INFO axe-core not run (set AXE_PATH to axe.min.js); the contrast scan covers PF-08");

const browser = await chromium.launch();
try {
  {
    const r = await fetch(`${base}${PATH}`, { redirect: "manual" });
    const body = await r.text();
    check("PF-01 GET /personal-finance → 200, X-Robots-Tag noindex", r.status === 200 && /noindex/i.test(r.headers.get("x-robots-tag") ?? ""), [r.status, r.headers.get("x-robots-tag")]);
    check("PF-01 SSR: title and h1, the expenses area empty until the browser reads storage", /<title>Personal finance · Orpheus Wisdom<\/title>/.test(body) && /<h1[^>]*>Personal finance\.<\/h1>/.test(body) && /data-testid="pf-area"[^>]*data-ready="false"/.test(body), body.length);
    const fav = await fetch(`${base}/favicon.svg`);
    const svg = await fav.text();
    check("ST1-05 /favicon.svg is the lyre (chalk strokes on charcoal, no two-bar mark)", fav.status === 200 && /fill="#1e2124"/.test(svg) && /stroke="#f2f0eb"/.test(svg) && (svg.match(/<path /g) ?? []).length === 5 && !/<rect[^>]*x="6"/.test(svg), svg.length);
  }

  for (const [vp, viewport, mobile] of VIEWPORTS) {
    const tag = `[${vp}]`;
    const wide = viewport.width >= 1024;
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    const api = [];
    const errors = [];
    page.on("request", (q) => { if (new URL(q.url()).pathname.startsWith("/api/")) api.push(`${q.method()} ${new URL(q.url()).pathname}`); });
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 80)));
    try {
      const res = await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await page.locator("[data-testid=pf-area][data-ready=true]").waitFor();
      // PF-01 shell
      const sh = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Site"]');
        const home = nav.querySelector('a[href="/"]');
        const lyre = home.querySelector("svg");
        const lr = lyre?.getBoundingClientRect();
        return {
          title: document.title,
          robots: document.querySelector("meta[name=robots]")?.content,
          scheme: [getComputedStyle(document.documentElement).colorScheme, getComputedStyle(document.body).colorScheme],
          bg: getComputedStyle(document.body).backgroundColor,
          color: getComputedStyle(document.body).color,
          bar: Math.round(nav.getBoundingClientRect().height * 10) / 10,
          links: [...nav.querySelectorAll("a")].map((a) => { const r = a.getBoundingClientRect(); return [a.textContent.trim(), a.getAttribute("href"), a.getAttribute("aria-current"), Math.round(r.width), Math.round(r.height)]; }),
          lyre: lyre ? { first: home.firstElementChild === lyre, hidden: lyre.getAttribute("aria-hidden"), stroke: lyre.getAttribute("stroke"), color: getComputedStyle(lyre).color, w: Math.round(lr.width), h: Math.round(lr.height), paths: lyre.querySelectorAll("path").length } : null,
          footer: document.querySelector("footer")?.textContent.trim(),
          analytics: document.querySelectorAll('script[src*="/_vercel/insights/script.js"], script[src*="va.vercel-scripts.com"]').length,
          paint: document.querySelectorAll("img, picture").length + [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).backgroundImage !== "none").length,
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          badClass: [...document.querySelectorAll("main *")].filter((e) => typeof e.className === "string" && /(^|\s)(field|kicker|section|bg-paper|text-ink)(\s|$)/.test(e.className)).length,
        };
      });
      check(`${tag} PF-01 title, noindex meta + X-Robots-Tag, 200`, res.status() === 200 && sh.title === "Personal finance · Orpheus Wisdom" && /noindex/.test(sh.robots ?? "") && /noindex/.test(res.headers()["x-robots-tag"] ?? ""), [res.status(), sh.title, sh.robots]);
      check(`${tag} PF-01 charcoal page, chalk type, color-scheme dark; no painting; page-only classes`, sh.bg === NIGHT && sh.color === CHALK && sh.scheme.every((s) => s === "dark") && sh.paint === 0 && sh.badClass === 0, { bg: sh.bg, color: sh.color, scheme: sh.scheme, paint: sh.paint, badClass: sh.badClass });
      check(`${tag} PF-01 bar (#97): Orpheus / Calculator / Dashboard / Personal finance, Personal finance current (Q1 (d) superseded), footer, one Analytics script`, JSON.stringify(sh.links.map((l) => [l[0], l[1]])) === JSON.stringify([["Orpheus", "/"], ["Calculator", "/calculator"], ["Dashboard", "/dashboard"], ["Personal finance", "/personal-finance"]]) && JSON.stringify(sh.links.filter((l) => l[2] === "page").map((l) => l[0])) === '["Personal finance"]' && sh.footer === "Orpheus Wisdom" && sh.analytics === 1, { links: sh.links, footer: sh.footer, analytics: sh.analytics });
      check(`${tag} ST1-05 the lyre first in the Orpheus link: aria-hidden, currentColor in chalk, 20 × 20, 5 paths`, sh.lyre && sh.lyre.first && sh.lyre.hidden === "true" && sh.lyre.stroke === "currentColor" && sh.lyre.color === CHALK && sh.lyre.w === 20 && sh.lyre.h === 20 && sh.lyre.paths === 5, sh.lyre);
      check(`${tag} ST1-05 / ST6-08 bar ≤ 48 px, every link ≥ 44 × 44`, sh.bar <= 48 && sh.links.every((l) => l[3] >= 44 && l[4] >= 44), { bar: sh.bar, links: sh.links.map((l) => [l[0], l[3], l[4]]) });

      // PF-02 copy (empty page)
      const empty = await mainTexts(page);
      check(`${tag} PF-02 exact copy on the empty page, nothing else`, JSON.stringify(empty) === JSON.stringify(emptyTexts(wide)), empty);
      const h1 = await page.locator("main h1").evaluate((e) => { const c = getComputedStyle(e); return { size: parseFloat(c.fontSize), weight: c.fontWeight, color: c.color }; });
      check(`${tag} PF-02 h1 chalk, 400, ${wide ? 44 : 32} px`, h1.color === CHALK && h1.weight === "400" && h1.size === (wide ? 44 : 32), h1);
      const shotE = join(CFG.out, `pf-empty-${viewport.width}.png`);
      await page.screenshot({ path: shotE, fullPage: true });
      R.shots.push(shotE);

      // PF-03 lines
      await page.getByTestId("pf-add-fixed").click();
      await page.getByTestId("pf-add-fixed").click();
      await page.getByTestId("pf-add-variable").click();
      check(`${tag} PF-03 ↳ Add expense adds a line to its group`, (await page.locator("[data-testid=pf-group-fixed] [data-testid=pf-line]").count()) === 2 && (await page.locator("[data-testid=pf-group-variable] [data-testid=pf-line]").count()) === 1);
      const [rent, phone, gifts] = [line(page, "fixed", 0), line(page, "fixed", 1), line(page, "variable", 0)];
      await rent.getByTestId("pf-name").fill("Rent");
      await rent.getByTestId("pf-monthly").fill("1,000");
      await rent.getByTestId("pf-equity").fill("250,000");
      await phone.getByTestId("pf-name").fill("Phone");
      await phone.getByTestId("pf-monthly").fill("250");
      await gifts.getByTestId("pf-name").fill("Gifts");
      await gifts.getByTestId("pf-yearly").fill("1,200");
      const conv = [await val(rent.getByTestId("pf-monthly")), await val(rent.getByTestId("pf-yearly")), await val(gifts.getByTestId("pf-yearly")), await val(gifts.getByTestId("pf-monthly"))];
      check(`${tag} PF-03 Monthly ↔ Yearly: typed stays as typed, the other converts`, JSON.stringify(conv) === JSON.stringify(["1,000", "12,000", "1,200", "100"]), conv);
      const labels = await page.evaluate(() => [...document.querySelectorAll("[data-testid=pf-line] input, [data-testid=pf-line] select")].every((e) => (e.getAttribute("aria-label") ?? "").length > 0));
      check(`${tag} PF-03 every control in a line has an accessible label`, labels);

      // PF-04 / PF-05
      const shares = [await txt(rent.getByTestId("pf-share")), await txt(phone.getByTestId("pf-share")), await txt(gifts.getByTestId("pf-share"))];
      const incomes = await page.locator("[data-testid=pf-income], [data-testid=pf-total-income]").allTextContents();
      check(`${tag} PF-04 % of expenses per line (74.1 / 18.5 / 7.4); % of income — everywhere while there is no income`, JSON.stringify(shares) === JSON.stringify(["74.1%", "18.5%", "7.4%"]) && incomes.length === 6 && incomes.every((t) => t.trim() === "—"), { shares, incomes });
      const t = { fixed: await totals(page, "fixed"), variable: await totals(page, "variable"), all: await totals(page, "all") };
      check(`${tag} PF-05 totals: Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200 (100.0%); no rate: equity — where a line has no override (Q10)`, JSON.stringify(t) === JSON.stringify({ fixed: ["92.6%", "—", "1,250", "15,000", "—"], variable: ["7.4%", "—", "100", "1,200", "—"], all: ["100.0%", "—", "1,350", "16,200", "—"] }), t);

      // PF-17..20 equity cover (#86, option A).
      const eqTotals = async () => [await txt(page.locator("[data-testid=pf-total-fixed] [data-testid=pf-total-equity]")), await txt(page.locator("[data-testid=pf-total-variable] [data-testid=pf-total-equity]")), await txt(page.locator("[data-testid=pf-total-all] [data-testid=pf-total-equity]"))];
      const holders = () => page.locator("[data-testid=pf-equity]").evaluateAll((f) => f.map((e) => e.placeholder));
      const used = () => txt(page.getByTestId("pf-rate-used"));
      const [wd, roic] = [page.getByTestId("pf-withdrawal"), page.getByTestId("pf-roic")];
      const rateLabels = await page.getByTestId("pf-rates").evaluate((r) => [...r.querySelectorAll(".pf-label")].map((l) => ({ t: l.textContent.trim(), vis: l.getBoundingClientRect().width > 1 })));
      const names = [await wd.evaluate((e) => e.labels?.[0]?.textContent), await roic.evaluate((e) => e.labels?.[0]?.textContent)];
      check(`${tag} PF-17 Withdrawal rate (%) / Portfolio ROIC (%) inputs with visible labels, Rate used —, before Fixed`, JSON.stringify(rateLabels) === JSON.stringify([{ t: "Withdrawal rate (%)", vis: true }, { t: "Portfolio ROIC (%)", vis: true }, { t: "Rate used", vis: true }]) && JSON.stringify(names) === '["Withdrawal rate (%)","Portfolio ROIC (%)"]' && (await used()) === "—" && (await page.getByTestId("pf-rates").evaluate((r) => !!(r.compareDocumentPosition(document.querySelector("[data-testid=pf-group-fixed]")) & Node.DOCUMENT_POSITION_FOLLOWING))), { rateLabels, names });
      const h0 = await holders();
      await roic.fill("8");
      const a8 = { used: await used(), holders: await holders(), totals: await eqTotals() };
      await wd.fill("5");
      const a5 = { used: await used(), holders: await holders(), totals: await eqTotals() };
      await wd.fill("4");
      const a4 = { used: await used(), rent: (await holders())[0] };
      await wd.fill("0");
      const a0 = { used: await used(), holders: await holders() };
      check(`${tag} PF-18 no rate → —; ROIC 8 → 4%: Rent 1,000/mo → 300,000, 75,000, 30,000; withdrawal 5 wins → 240,000 / 60,000 / 24,000; a typed 4 is 4%; 0 → —`, JSON.stringify(h0) === '["—","—","—"]' && JSON.stringify(a8) === JSON.stringify({ used: "4%", holders: ["300,000", "75,000", "30,000"], totals: ["325,000", "30,000", "355,000"] }) && JSON.stringify(a5) === JSON.stringify({ used: "5%", holders: ["240,000", "60,000", "24,000"], totals: ["310,000", "24,000", "334,000"] }) && JSON.stringify(a4) === JSON.stringify({ used: "4%", rent: "300,000" }) && JSON.stringify(a0) === JSON.stringify({ used: "—", holders: ["—", "—", "—"] }), { h0, a8, a5, a4, a0 });
      await wd.fill("150");
      const rErr = { text: await txt(page.getByTestId("pf-rates").getByTestId("pf-error")), invalid: await wd.getAttribute("aria-invalid"), color: await page.getByTestId("pf-rates").getByTestId("pf-error").evaluate((e) => getComputedStyle(e).color), used: await used() };
      await wd.fill("");
      await roic.fill("150");
      const r150 = { used: await used(), errors: await page.getByTestId("pf-rates").getByTestId("pf-error").count() };
      await roic.fill("-8");
      const rNeg = { used: await used(), text: await txt(page.getByTestId("pf-rates").getByTestId("pf-error")), invalid: await roic.getAttribute("aria-invalid") };
      await roic.fill("8");
      check(`${tag} PF-17 Q11: ROIC 150 is valid → Rate used 75%; ROIC -8 → \`Enter a number, 0 or more.\` (aria-invalid), Rate used —`, JSON.stringify(r150) === '{"used":"75%","errors":0}' && JSON.stringify(rNeg) === JSON.stringify({ used: "—", text: "Enter a number, 0 or more.", invalid: "true" }), { r150, rNeg });
      check(`${tag} PF-17 a bad rate: \`Enter a percent from 0 to 100.\` (alert, aria-invalid), Rate used —; cleared → ROIC ÷ 2 again`, JSON.stringify(rErr) === JSON.stringify({ text: "Enter a percent from 0 to 100.", invalid: "true", color: ALERT, used: "—" }) && (await used()) === "4%" && (await page.getByTestId("pf-rates").getByTestId("pf-error").count()) === 0, rErr);
      const ph = await rent.getByTestId("pf-equity").evaluate((e) => getComputedStyle(e, "::placeholder").color);
      await rent.getByTestId("pf-equity").fill("");
      const cleared = { rent: await val(rent.getByTestId("pf-equity")), holder: (await holders())[0], totals: await eqTotals() };
      await rent.getByTestId("pf-equity").fill("abc");
      const badOv = { err: await txt(rent.getByTestId("pf-error")), invalid: await rent.getByTestId("pf-equity").getAttribute("aria-invalid"), totals: await eqTotals() };
      await rent.getByTestId("pf-equity").fill("250,000");
      const typed = { rent: await val(rent.getByTestId("pf-equity")), totals: await eqTotals() };
      check(`${tag} PF-19 Q9: a bad override (Rent abc) shows \`Enter a number, 0 or more.\` and falls back to the calculated 300,000 (Fixed 375,000, Total 405,000)`, JSON.stringify(badOv) === JSON.stringify({ err: "Enter a number, 0 or more.", invalid: "true", totals: ["375,000", "30,000", "405,000"] }), badOv);
      await roic.fill("");
      const noRate = await eqTotals();
      await roic.fill("8");
      check(`${tag} PF-19 Q10: no usable rate → every total with a line lacking a valid override shows —`, JSON.stringify(noRate) === '["—","—","—"]', noRate);
      check(`${tag} PF-19 override: typed 250,000 wins on Rent (Fixed 325,000, Total 355,000); cleared → the calculated 300,000 (Fixed 375,000); placeholder dim (${ratio(rgb(DIM), rgb(NIGHT))}:1)`, ph === DIM && JSON.stringify(cleared) === JSON.stringify({ rent: "", holder: "300,000", totals: ["375,000", "30,000", "405,000"] }) && JSON.stringify(typed) === JSON.stringify({ rent: "250,000", totals: ["325,000", "30,000", "355,000"] }), { ph, cleared, typed });
      const rb = { wd: await box(wd), roic: await box(roic), used: await box(page.getByTestId("pf-rate-used")) };
      check(`${tag} PF-20 ${wide ? "wide: the three rate cells in one row" : "phone: the rate cells stacked full width"}`, wide ? rb.wd.y === rb.roic.y && rb.roic.x > rb.wd.x && rb.used.x > rb.roic.x && rb.wd.h >= 44 : rb.roic.y > rb.wd.y && rb.used.y > rb.roic.y && rb.wd.x === rb.roic.x && rb.wd.w === rb.roic.w && rb.wd.w >= viewport.width - 80, rb);
      await page.evaluate(() => document.activeElement?.blur());
      const shotQ = join(CFG.out, `pf-equity-${viewport.width}.png`);
      await page.locator("section[aria-labelledby=pf-expenses]").screenshot({ path: shotQ });
      R.shots.push(shotQ);

      // PF-11..16 income (#85): the spec example, then % of income on the lines above.
      await page.getByTestId("pf-add-person").click();
      await page.getByTestId("pf-add-person").click();
      const [me, sp] = [page.getByTestId("pf-person").nth(0), page.getByTestId("pf-person").nth(1)];
      const defaults = [await val(me.getByTestId("pf-person-share")), await me.getByTestId("pf-person-count-wages").isChecked(), await me.getByTestId("pf-person-count-bonus").isChecked(), await val(me.getByTestId("pf-person-wages"))];
      check(`${tag} PF-12 a new person: Share 100, both boxes ticked, the rest empty`, JSON.stringify(defaults) === JSON.stringify(["100", true, true, ""]), defaults);
      await me.getByTestId("pf-person-name").fill("Me");
      await me.getByTestId("pf-person-wages").fill("120,000");
      await me.getByTestId("pf-person-bonus").fill("10");
      await me.getByTestId("pf-person-tax").fill("30");
      await me.getByTestId("pf-person-count-bonus").uncheck();
      await sp.getByTestId("pf-person-name").fill("Spouse");
      await sp.getByTestId("pf-person-wages").fill("80,000");
      await sp.getByTestId("pf-person-bonus").fill("5");
      await sp.getByTestId("pf-person-tax").fill("25");
      await sp.getByTestId("pf-person-share").fill("80");
      const nets = [await txt(me.getByTestId("pf-person-net")), await txt(sp.getByTestId("pf-person-net"))];
      check(`${tag} PF-13 Net (yearly) per person: 92,400 and 63,000`, JSON.stringify(nets) === '["92,400","63,000"]', nets);
      const tableNow = await page.locator("[data-testid=pf-income-line], [data-testid=pf-net-income]").evaluateAll((rows) => rows.map((r) => ["pf-income-label", "pf-income-biweekly", "pf-income-monthly", "pf-income-yearly"].map((id) => r.querySelector(`[data-testid=${id}]`).textContent.trim())));
      check(`${tag} PF-14 / PF-15 income table: counted × share, biweekly ÷ 26, Net income 5,169.23 / 11,200 / 134,400`, JSON.stringify(tableNow) === JSON.stringify([["Me · Wages", "3,230.77", "7,000", "84,000"], ["Me · Bonus", "0", "0", "0"], ["Spouse · Wages", "1,846.15", "4,000", "48,000"], ["Spouse · Bonus", "92.31", "200", "2,400"], ["Net income", "5,169.23", "11,200", "134,400"]]), tableNow);
      const ofIncome = [await txt(rent.getByTestId("pf-income")), await txt(phone.getByTestId("pf-income")), await txt(gifts.getByTestId("pf-income")), ...(await totals(page, "fixed")).slice(1, 2), ...(await totals(page, "variable")).slice(1, 2), ...(await totals(page, "all")).slice(1, 2)];
      check(`${tag} PF-04 / PF-16 % of income wired: 8.9% / 2.2% / 0.9%, totals 11.2% / 0.9% / 12.1%`, JSON.stringify(ofIncome) === JSON.stringify(["8.9%", "2.2%", "0.9%", "11.2%", "0.9%", "12.1%"]), ofIncome);
      await sp.getByTestId("pf-person-share").fill("40");
      const halfIncome = await txt(rent.getByTestId("pf-income"));
      await sp.getByTestId("pf-person-share").fill("120");
      const pctErr = await txt(sp.getByTestId("pf-error"));
      const pctInvalid = await sp.getByTestId("pf-person-share").getAttribute("aria-invalid");
      await sp.getByTestId("pf-person-share").fill("80");
      await me.getByTestId("pf-person-wages").fill("abc");
      const amtErr = await txt(me.getByTestId("pf-error"));
      await me.getByTestId("pf-person-wages").fill("120,000");
      // share 40: 84,000 + 24,000 + 1,200 = 109,200 a year → 9,100 a month; 1,000 → 11.0%.
      check(`${tag} PF-16 a share change updates % of income at once (spouse 40% → Rent 11.0%)`, halfIncome === "11.0%", halfIncome);
      check(`${tag} PF-12 field checks: Share 120 → \`Enter a percent from 0 to 100.\` (aria-invalid); Wages abc → \`Enter a number, 0 or more.\``, pctErr === "Enter a percent from 0 to 100." && pctInvalid === "true" && amtErr === "Enter a number, 0 or more." && (await page.getByTestId("pf-error").count()) === 0, { pctErr, pctInvalid, amtErr });
      // Income layout.
      const pc = {};
      for (const id of ["pf-person-name", "pf-person-wages", "pf-person-bonus", "pf-person-tax", "pf-person-net", "pf-person-count-wages", "pf-person-count-bonus", "pf-person-share", "pf-remove-person"]) pc[id] = await box(me.getByTestId(id));
      if (wide) {
        const xs = Object.values(pc).map((b) => b.x);
        const mids = Object.values(pc).map((b) => b.y + b.h / 2);
        const head = await page.locator("[data-testid=pf-person-head] span").evaluateAll((s) => s.map((e) => Math.round(e.getBoundingClientRect().left)));
        const checkCells = await me.locator(".pf-cw, .pf-cb").evaluateAll((s) => s.map((e) => Math.round(e.getBoundingClientRect().left)));
        const starts = [pc["pf-person-name"].x, pc["pf-person-wages"].x, pc["pf-person-bonus"].x, pc["pf-person-tax"].x, pc["pf-person-net"].x, ...checkCells, pc["pf-person-share"].x];
        check(`${tag} PF-16 wide: one row per person in column order under its labels`, xs.every((x, i) => i === 0 || x > xs[i - 1]) && Math.max(...mids) - Math.min(...mids) <= 2 && head.every((x, i) => Math.abs(x - starts[i]) <= 1), { head, starts });
      } else {
        check(`${tag} PF-16 phone: a person is a block (name + remove; Wages | Bonus rating; Share | Average tax; Count wages | Count bonus; Net)`, pc["pf-person-wages"].y > pc["pf-person-name"].y && pc["pf-person-wages"].y === pc["pf-person-bonus"].y && pc["pf-person-tax"].y === pc["pf-person-share"].y && pc["pf-person-tax"].x > pc["pf-person-share"].x && pc["pf-person-tax"].y > pc["pf-person-wages"].y && pc["pf-person-count-wages"].y > pc["pf-person-tax"].y && pc["pf-person-net"].y > pc["pf-person-count-wages"].y && pc["pf-person-bonus"].x > pc["pf-person-wages"].x, pc);
      }
      const shotI = join(CFG.out, `pf-income-${viewport.width}.png`);
      await page.getByTestId("pf-income-block").screenshot({ path: shotI });
      R.shots.push(shotI);

      // PF-06 accounts
      await rent.getByTestId("pf-account").selectOption("__add-account__");
      const na = rent.getByTestId("pf-new-account");
      await na.waitFor();
      const naTexts = await na.evaluate((e) => [...e.querySelectorAll("span, button")].map((x) => x.textContent.trim()));
      check(`${tag} PF-06 Add account… opens New account with Add and Cancel; the field has focus`, JSON.stringify(naTexts) === JSON.stringify(["New account", "Add", "Cancel"]) && (await na.getByTestId("pf-new-account-input").evaluate((e) => e === document.activeElement)), naTexts);
      await na.getByTestId("pf-new-account-add").click();
      const err = na.getByTestId("pf-error");
      const errStyle = await err.evaluate((e) => getComputedStyle(e).color);
      check(`${tag} PF-06 empty name → \`Name the account.\` in the alert colour (${ratio(rgb(ALERT), rgb(NIGHT))}:1)`, (await txt(err)) === "Name the account." && errStyle === ALERT);
      const shotA = join(CFG.out, `pf-account-${viewport.width}.png`);
      await page.screenshot({ path: shotA, fullPage: true });
      R.shots.push(shotA);
      await na.getByTestId("pf-new-account-input").fill(" Chequing ");
      await na.getByTestId("pf-new-account-add").click();
      const sel = await val(rent.getByTestId("pf-account"));
      const focused = await rent.getByTestId("pf-account").evaluate((e) => e === document.activeElement);
      const opts = await gifts.getByTestId("pf-account").evaluate((s) => [...s.options].map((o) => o.text));
      check(`${tag} PF-06 added: selected on the line, focus back on its dropdown, offered in the other group`, sel === "Chequing" && focused && JSON.stringify(opts) === JSON.stringify(["—", "Chequing", "Add account…"]), { sel, focused, opts });
      await gifts.getByTestId("pf-account").selectOption("__add-account__");
      await gifts.getByTestId("pf-new-account-input").fill("CHEQUING");
      await gifts.getByTestId("pf-new-account-input").press("Enter");
      const opts2 = await gifts.getByTestId("pf-account").evaluate((s) => [...s.options].map((o) => o.text));
      check(`${tag} PF-06 a repeat name (any case) reuses the account`, (await val(gifts.getByTestId("pf-account"))) === "Chequing" && JSON.stringify(opts2) === JSON.stringify(["—", "Chequing", "Add account…"]), opts2);
      await gifts.getByTestId("pf-account").selectOption("__add-account__");
      await gifts.getByTestId("pf-new-account-input").fill("Visa");
      await gifts.getByTestId("pf-new-account-cancel").click();
      check(`${tag} PF-06 Cancel closes without adding`, (await page.getByTestId("pf-new-account").count()) === 0 && (await gifts.getByTestId("pf-account").evaluate((s) => s.options.length)) === 3);
      await gifts.getByTestId("pf-account").selectOption("__add-account__");
      await gifts.getByTestId("pf-new-account-input").fill("Visa");
      await gifts.getByTestId("pf-new-account-add").click();

      // PF-08 layout with lines
      const cells = {};
      for (const id of ["pf-name", "pf-income", "pf-share", "pf-monthly", "pf-yearly", "pf-currency", "pf-fx-none", "pf-equity", "pf-account", "pf-remove"]) cells[id] = await box(rent.getByTestId(id));
      const order = Object.values(cells).map((b) => b.x);
      if (wide) {
        const tops = Object.values(cells).map((b) => b.y + b.h);
        check(`${tag} PF-08 wide: one row per line, cells in column order`, order.every((x, i) => i === 0 || x > order[i - 1]) && Math.max(...tops) - Math.min(...tops) <= 1, cells);
        const head = await page.locator("[data-testid=pf-group-fixed] [data-testid=pf-head] span").evaluateAll((s) => s.map((e) => Math.round(e.getBoundingClientRect().left)));
        check(`${tag} PF-08 wide: the nine column labels sit over their columns`, head.length === 9 && head.every((x, i) => Math.abs(x - order[i]) <= 1), { head, cells: order.slice(0, 9) });
      } else {
        check(`${tag} PF-08 / PF-25 phone: a line is a block (name; Monthly | Yearly; Currency | FX rate; % of expenses | % of income; Account | Equity to cover), remove beside the name`, cells["pf-monthly"].y > cells["pf-name"].y && cells["pf-monthly"].y === cells["pf-yearly"].y && cells["pf-currency"].y > cells["pf-monthly"].y && cells["pf-currency"].y === cells["pf-fx-none"].y && cells["pf-fx-none"].x > cells["pf-currency"].x && cells["pf-share"].y > cells["pf-currency"].y && cells["pf-equity"].y > cells["pf-share"].y && cells["pf-equity"].y === cells["pf-account"].y && cells["pf-equity"].x > cells["pf-account"].x && Math.abs(cells["pf-remove"].y + cells["pf-remove"].h - (cells["pf-name"].y + cells["pf-name"].h)) <= 1, cells);
      }
      const sizes = await page.evaluate(() => [...document.querySelectorAll("main input:not([type=checkbox]), main select, main button, main .pf-check")].map((e) => [e.dataset.testid, Math.round(e.getBoundingClientRect().height * 10) / 10, Math.round(e.getBoundingClientRect().width)]));
      check(`${tag} PF-08 every control ≥ 44 px tall (remove 44 × 44)`, sizes.every(([, h]) => h >= 44) && sizes.filter(([id]) => id === "pf-remove").every(([, , w]) => w >= 44), sizes.filter(([, h]) => h < 44));
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${tag} PF-08 no horizontal scroll`, scroll <= 0, scroll);
      const lab = await page.locator(wide ? "[data-testid=pf-head] .pf-label" : "[data-testid=pf-line] .pf-cell-label").first().evaluate((e) => { const c = getComputedStyle(e); return { color: c.color, size: parseFloat(c.fontSize), tt: c.textTransform }; });
      check(`${tag} PF-08 labels 12 px upper-case dim (${ratio(rgb(DIM), rgb(NIGHT))}:1)`, lab.color === DIM && lab.size === 12 && lab.tt === "uppercase", lab);
      const tn = await page.evaluate(() => [...document.querySelectorAll("body, body *")].filter((e) => { const c = getComputedStyle(e); return /tnum/.test(c.fontFeatureSettings) || /tabular-nums/.test(c.fontVariantNumeric); }).length);
      check(`${tag} PF-08 proportional figures: no tnum / tabular-nums`, tn === 0, tn);
      const scan = await contrastScan(page);
      check(`${tag} PF-08 AA for every visible text and field value`, scan.bad.length === 0, scan.bad.length ? scan.bad : { texts: scan.n });
      if (AXE) {
        await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast", "label", "select-name", "button-name", "aria-allowed-attr", "aria-valid-attr-value", "duplicate-id-aria", "label-content-name-mismatch"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length, html: x.nodes[0]?.html.slice(0, 80) })));
        check(`${tag} PF-08 axe-core (contrast, labels, names, aria): no violation`, v.length === 0, v);
      }
      // Focus: every Tab stop from the top shows a ≥ 2 px ring (or a chalk underline on a field) at ≥ 3:1.
      // Start the keyboard walk at the bar's Orpheus link (Shift+Tab, Tab: a keyboard focus, not a programmatic one).
      await page.locator('nav[aria-label="Site"] a[href="/"]').focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const stops = [];
      for (let i = 0; i < 80; i++) {
        if (i > 0) await page.keyboard.press("Tab");
        const s = await page.evaluate(() => {
          const e = document.activeElement;
          if (!e || e === document.body) return null;
          const c = getComputedStyle(e);
          let bg = "rgb(30, 33, 36)";
          for (let x = e.parentElement; x; x = x.parentElement) { const b = getComputedStyle(x).backgroundColor; if (b !== "rgba(0, 0, 0, 0)") { bg = b; break; } }
          return { id: e.dataset?.testid ?? e.textContent.trim().slice(0, 20), outline: [c.outlineStyle, parseFloat(c.outlineWidth), c.outlineColor], underline: c.borderBottomColor, bg, inFooter: !!e.closest("footer") };
        });
        if (!s) break;
        stops.push(s);
        if (s.inFooter || s.id === "pf-add-variable") break;
      }
      const badStops = stops.filter((s) => !(s.outline[0] !== "none" && s.outline[1] >= 2 && ratio(rgb(s.outline[2]), rgb(s.bg)) >= 3));
      check(`${tag} PF-08 every Tab stop shows a ≥ 2 px focus ring at ≥ 3:1 (${stops.length} stops)`, stops.length >= 10 && stops[0].id === "Orpheus" && stops.at(-1).id === "pf-add-variable" && badStops.length === 0, badStops.length ? badStops.slice(0, 5) : stops.map((s) => s.id));
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      const shotF = join(CFG.out, `pf-filled-${viewport.width}.png`);
      await page.screenshot({ path: shotF, fullPage: true });
      R.shots.push(shotF);

      // PF-03 field check and remove
      await phone.getByTestId("pf-monthly").fill("abc");
      const chk = phone.getByTestId("pf-error");
      const chkOk = (await txt(chk)) === "Enter a number, 0 or more." && (await phone.getByTestId("pf-monthly").getAttribute("aria-invalid")) === "true" && (await chk.evaluate((e) => getComputedStyle(e).color)) === ALERT;
      const afterBad = await totals(page, "all");
      check(`${tag} PF-03 a bad amount: \`Enter a number, 0 or more.\` (alert, aria-invalid) and the line counts as 0`, chkOk && afterBad[2] === "1,100" && afterBad[3] === "13,200", afterBad);
      const shotC = join(CFG.out, `pf-check-${viewport.width}.png`);
      await page.screenshot({ path: shotC, fullPage: true });
      R.shots.push(shotC);
      await phone.getByTestId("pf-remove").click();
      check(`${tag} PF-03 Remove expense removes the line`, (await page.locator("[data-testid=pf-group-fixed] [data-testid=pf-line]").count()) === 1 && (await totals(page, "fixed"))[2] === "1,000");

      // PF-07 storage
      const store = await page.evaluate(async ([key, incomeKey, equityKey]) => ({
        keys: Object.keys(localStorage).sort(),
        value: JSON.parse(localStorage.getItem(key) ?? "null"),
        income: JSON.parse(localStorage.getItem(incomeKey) ?? "null"),
        rates: JSON.parse(localStorage.getItem(equityKey) ?? "null"),
        session: sessionStorage.length,
        idb: indexedDB.databases ? (await indexedDB.databases()).length : 0,
      }), [KEY, INCOME_KEY, EQUITY_KEY]);
      // Cookies on this host only (the builder's extensions script brings a third-party one of its own).
      const cookies = (await ctx.cookies(base)).filter((c) => !c.domain.endsWith("grok.com")).length;
      check(`${tag} PF-07 / PF-20 the three localStorage keys only; typed values as typed; no sessionStorage / IndexedDB / cookie`, JSON.stringify(store.keys) === JSON.stringify([KEY, INCOME_KEY, EQUITY_KEY].sort()) && JSON.stringify(store.rates) === '{"withdrawal":"","roic":"8"}' && store.value?.fixed?.[0]?.equity === "250,000" && store.income?.people?.length === 2 && store.income.people[0].wages === "120,000" && store.income.people[0].countBonus === false && store.income.people[1].share === "80" && store.value?.fixed?.[0]?.amount === "1,000" && store.value?.variable?.[0]?.amount === "1,200" && store.value?.variable?.[0]?.per === "year" && JSON.stringify(store.value?.accounts) === '["Chequing","Visa"]' && store.session === 0 && store.idb === 0 && cookies === 0, { ...store, cookies });
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("[data-testid=pf-area][data-ready=true]").waitFor();
      const back = {
        rent: [await val(line(page, "fixed", 0).getByTestId("pf-name")), await val(line(page, "fixed", 0).getByTestId("pf-monthly")), await val(line(page, "fixed", 0).getByTestId("pf-equity")), await val(line(page, "fixed", 0).getByTestId("pf-account"))],
        gifts: [await val(line(page, "variable", 0).getByTestId("pf-name")), await val(line(page, "variable", 0).getByTestId("pf-yearly")), await val(line(page, "variable", 0).getByTestId("pf-account"))],
        all: await totals(page, "all"),
        people: [await val(page.getByTestId("pf-person").nth(0).getByTestId("pf-person-name")), await page.getByTestId("pf-person").nth(0).getByTestId("pf-person-count-bonus").isChecked(), await val(page.getByTestId("pf-person").nth(1).getByTestId("pf-person-share"))],
        net: await txt(page.getByTestId("pf-net-income").getByTestId("pf-income-yearly")),
        rates: [await val(page.getByTestId("pf-withdrawal")), await val(page.getByTestId("pf-roic")), await txt(page.getByTestId("pf-rate-used"))],
      };
      check(`${tag} PF-07 / PF-16 / PF-20 a reload restores every line, typed value, account, selection, person and rate (Total equity 250,000 + 30,000)`, JSON.stringify(back) === JSON.stringify({ rent: ["Rent", "1,000", "250,000", "Chequing"], gifts: ["Gifts", "1,200", "Visa"], all: ["100.0%", "9.8%", "1,100", "13,200", "280,000"], people: ["Me", false, "80"], net: "134,400", rates: ["", "8", "4%"] }), back);
      // PF-21..25 foreign currency (#87): the section 14.2 example (Rent's override cleared, Phone back, Condo in BRL).
      await line(page, "fixed", 0).getByTestId("pf-equity").fill("");
      await page.getByTestId("pf-add-fixed").click();
      await page.getByTestId("pf-add-fixed").click();
      const [fp, fc] = [line(page, "fixed", 1), line(page, "fixed", 2)];
      await fp.getByTestId("pf-name").fill("Phone");
      await fp.getByTestId("pf-monthly").fill("250");
      await fc.getByTestId("pf-name").fill("Condo");
      await fc.getByTestId("pf-monthly").fill("2,000");
      const hhSel = page.getByTestId("pf-household");
      const c21 = {
        household: await hhSel.inputValue(),
        codes: await hhSel.evaluate((s) => [...s.options].map((o) => o.text)),
        label: await hhSel.evaluate((s) => ({ t: s.labels?.[0]?.textContent, vis: (s.labels?.[0]?.getBoundingClientRect().width ?? 0) > 1 })),
        above: await page.getByTestId("pf-household-cell").evaluate((c) => !!(c.compareDocumentPosition(document.querySelector("[data-testid=pf-income-block]")) & Node.DOCUMENT_POSITION_FOLLOWING)),
        line: await fc.getByTestId("pf-currency").evaluate((s) => [s.value, s.getAttribute("aria-label"), [...s.options].map((o) => o.text)]),
        fx: await txt(fc.getByTestId("pf-fx-none")),
        inputs: await fc.getByTestId("pf-fx").count(),
      };
      check(`${tag} PF-21 Household currency CAD by default (Q13; visible label, ten codes) above Income; a line's Currency (CAD first) and FX rate —`, JSON.stringify(c21) === JSON.stringify({ household: "CAD", codes: CODES, label: { t: "Household currency", vis: true }, above: true, line: ["CAD", "Currency, Fixed 3", CODES_CAD], fx: "—", inputs: 0 }), c21);
      await fc.getByTestId("pf-currency").selectOption("BRL");
      const fx = fc.getByTestId("pf-fx");
      const dash24 = async () => ({ fixed: await totals(page, "fixed"), variable: await totals(page, "variable"), all: await totals(page, "all"), rent: [await txt(line(page, "fixed", 0).getByTestId("pf-share")), await txt(line(page, "fixed", 0).getByTestId("pf-income"))], condo: [await val(fc.getByTestId("pf-monthly")), await val(fc.getByTestId("pf-yearly")), await txt(fc.getByTestId("pf-share")), await txt(fc.getByTestId("pf-income")), await fc.getByTestId("pf-equity").getAttribute("placeholder")] });
      const want24 = { fixed: ["—", "—", "—", "—", "—"], variable: ["—", "0.9%", "100", "1,200", "30,000"], all: ["—", "—", "—", "—", "—"], rent: ["—", "8.9%"], condo: ["2,000", "24,000", "—", "—", "—"] };
      const noRate24 = { err: await txt(fc.getByTestId("pf-error")), invalid: await fx.getAttribute("aria-invalid"), label: await fx.getAttribute("aria-label"), color: await fc.getByTestId("pf-error").evaluate((e) => getComputedStyle(e).color), ...(await dash24()) };
      const bads = [];
      for (const bad of ["abc", "-1", "0"]) {
        await fx.fill(bad);
        bads.push([bad, await txt(fc.getByTestId("pf-error")), JSON.stringify(await dash24()) === JSON.stringify(want24)]);
      }
      check(`${tag} PF-24 Q14 (decided): a BRL line with no rate (empty, abc, -1, 0): \`Enter a number above 0.\` (alert, aria-invalid); it contributes — (Fixed and Total —: monthly, yearly, % of expenses, % of income, equity; every % of expenses —); its own Monthly / Yearly stay 2,000 / 24,000; Variable 100 / 1,200 / 30,000 and Rent's 8.9% of income still show`, JSON.stringify(noRate24) === JSON.stringify({ err: "Enter a number above 0.", invalid: "true", label: "FX rate, Fixed 3", color: ALERT, ...want24 }) && bads.every(([, e, ok]) => e === "Enter a number above 0." && ok), { noRate24, bads });
      await fx.fill("0.2");
      const conv22 = {
        errors: await fc.getByTestId("pf-error").count(),
        condo: [await val(fc.getByTestId("pf-monthly")), await val(fc.getByTestId("pf-yearly")), await txt(fc.getByTestId("pf-share")), await txt(fc.getByTestId("pf-income"))],
        fixed: await totals(page, "fixed"),
        variable: await totals(page, "variable"),
        all: await totals(page, "all"),
      };
      check(`${tag} PF-22 Q12: Condo 2,000 BRL × 0.2: its fields stay 2,000 / 24,000; 22.9% / 3.6%; Fixed 1,650 / 19,800 (14.7%), Variable 100 / 1,200, Total 1,750 / 21,000 (15.6%)`, JSON.stringify(conv22) === JSON.stringify({ errors: 0, condo: ["2,000", "24,000", "22.9%", "3.6%"], fixed: ["94.3%", "14.7%", "1,650", "19,800", "495,000"], variable: ["5.7%", "0.9%", "100", "1,200", "30,000"], all: ["100.0%", "15.6%", "1,750", "21,000", "525,000"] }), conv22);
      const holder23 = await page.locator("[data-testid=pf-equity]").evaluateAll((f) => f.map((e) => e.placeholder));
      await fc.getByTestId("pf-equity").fill("100,000");
      const ov23 = (await totals(page, "fixed"))[4];
      await fc.getByTestId("pf-equity").fill("");
      check(`${tag} PF-23 equity on the household yearly amount (ROIC 8): Condo 120,000 (Fixed 495,000, Total 525,000); override 100,000 (household) → Fixed 475,000`, JSON.stringify(holder23) === JSON.stringify(["300,000", "75,000", "120,000", "30,000"]) && ov23 === "475,000", { holder23, ov23 });
      // Layout, size, focus and AA with the foreign line.
      const fb = { cur: await box(fc.getByTestId("pf-currency")), fx: await box(fx), monthly: await box(fc.getByTestId("pf-monthly")), yearly: await box(fc.getByTestId("pf-yearly")), equity: await box(fc.getByTestId("pf-equity")), share: await box(fc.getByTestId("pf-share")), hh: await box(hhSel) };
      check(`${tag} PF-25 ${wide ? "wide: Currency and FX rate after Yearly, before Equity to cover, one row" : "phone: Currency | FX rate under Monthly | Yearly"}; 44 px controls; Household currency ≤ 16rem`, fb.cur.h >= 44 && fb.fx.h >= 44 && fb.hh.h >= 44 && fb.hh.w <= 256 && (wide ? fb.cur.x > fb.yearly.x && fb.fx.x > fb.cur.x && fb.equity.x > fb.fx.x && Math.abs(fb.cur.y - fb.monthly.y) <= 1 && Math.abs(fb.fx.y - fb.monthly.y) <= 1 : fb.cur.y > fb.monthly.y && fb.cur.y === fb.fx.y && fb.fx.x > fb.cur.x && fb.share.y > fb.cur.y), fb);
      await fx.focus();
      const ring = await fx.evaluate((e) => { const c = getComputedStyle(e); return [c.outlineStyle, parseFloat(c.outlineWidth), c.outlineColor]; });
      await page.evaluate(() => document.activeElement?.blur());
      const scroll25 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const scan25 = await contrastScan(page);
      check(`${tag} PF-25 FX rate focus ring 2 px chalk; no horizontal scroll; AA for every text and field value with the foreign line`, ring[0] !== "none" && ring[1] >= 2 && ring[2] === CHALK && scroll25 <= 0 && scan25.bad.length === 0, { ring, scroll25, bad: scan25.bad });
      if (AXE) {
        await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast", "label", "select-name", "aria-valid-attr-value", "label-content-name-mismatch"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length, html: x.nodes[0]?.html.slice(0, 80) })));
        check(`${tag} PF-25 axe-core with the foreign line and Household currency: no violation`, v.length === 0, v);
      }
      await fc.scrollIntoViewIfNeeded();
      const shotX = join(CFG.out, `pf-fx-${viewport.width}.png`);
      await page.screenshot({ path: shotX, fullPage: true });
      R.shots.push(shotX);
      // Storage: the line's currency / rate; the household key only once changed.
      const before = await page.evaluate((k) => [Object.keys(localStorage).includes(k[0]), JSON.parse(localStorage.getItem(k[1])).fixed[2]], [CURRENCY_KEY, KEY]);
      await hhSel.selectOption("USD");
      const cadKey = await page.evaluate((k) => localStorage.getItem(k), CURRENCY_KEY);
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("[data-testid=pf-area][data-ready=true]").waitFor();
      const fc2 = line(page, "fixed", 2);
      const back25 = { household: await page.getByTestId("pf-household").inputValue(), cur: await fc2.getByTestId("pf-currency").inputValue(), rate: await val(fc2.getByTestId("pf-fx")), all: (await totals(page, "all")).slice(2, 4) };
      check(`${tag} PF-25 storage: Condo {currency BRL, rate 0.2} in ${KEY}; ${CURRENCY_KEY} written only on change ({"household":"USD"}); a reload restores both (Total 1,750 / 21,000)`, before[0] === false && before[1].currency === "BRL" && before[1].rate === "0.2" && cadKey === '{"household":"USD"}' && JSON.stringify(back25) === JSON.stringify({ household: "USD", cur: "BRL", rate: "0.2", all: ["1,750", "21,000"] }), { before, cadKey, back25 });
      await page.getByTestId("pf-household").selectOption("BRL");
      const asHome = { fx: await txt(fc2.getByTestId("pf-fx-none")), cur: await fc2.getByTestId("pf-currency").inputValue(), fixed: (await totals(page, "fixed")).slice(2, 4), rate: await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).fixed[2].rate, KEY) };
      await page.getByTestId("pf-household").selectOption("CAD");
      check(`${tag} PF-24 household BRL makes Condo a household line: FX rate —, × 1 (Fixed 3,250 / 39,000), the rate kept stored`, JSON.stringify(asHome) === JSON.stringify({ fx: "—", cur: "BRL", fixed: ["3,250", "39,000"], rate: "0.2" }), asHome);
      check(`${tag} PF-07 no /api request; no page error`, api.length === 0 && errors.length === 0, { api, errors });
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      await ctx.close().catch(() => {});
    }

    // #94 PF-26..32: Overview and Update, today fixed at 11 October 2026; the page at Total 1,750 / Net income 11,200.
    {
      const c3 = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
      const p3 = await c3.newPage();
      const errs = [];
      const api3 = [];
      p3.on("pageerror", (e) => errs.push(String(e.message).slice(0, 80)));
      p3.on("request", (q) => { if (new URL(q.url()).pathname.startsWith("/api/")) api3.push(new URL(q.url()).pathname); });
      try {
        await p3.clock.setFixedTime(TODAY);
        await p3.addInitScript(([k, v, ik, iv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(ik, iv); sessionStorage.setItem("seeded", "1"); } }, [KEY, OV_EXPENSES, INCOME_KEY, OV_INCOME]);
        await p3.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
        await p3.locator("[data-testid=pf-area][data-ready=true]").waitFor();
        const ov = () => p3.evaluate(() => Object.fromEntries(["expenses", "income", "surplus"].map((r) => [r, [...document.querySelectorAll(`[data-testid=pf-ov-${r}] [role=cell]`)].map((c) => c.textContent.trim())])));
        const chart = () => p3.getByTestId("pf-chart").evaluate((f) => ({ months: f.dataset.months, net: f.dataset.netLast, lines: [...f.querySelectorAll(".recharts-line-curve")].map((p) => p.getAttribute("stroke")), hidden: f.querySelector(".pf-chart-plot").getAttribute("aria-hidden"), legend: [...f.querySelectorAll(".pf-legend li")].map((l) => l.textContent.trim()), h: Math.round(f.querySelector(".pf-chart-plot").getBoundingClientRect().height) }));
        const t0 = await ov();
        const opts = await p3.getByTestId("pf-month").evaluate((s) => [s.value, [...s.options].map((o) => o.textContent)]);
        const ph0 = [await p3.getByTestId("pf-month-expenses").getAttribute("placeholder"), await p3.getByTestId("pf-month-income").getAttribute("placeholder")];
        check(`${tag} PF-27 / PF-28 the current month takes the page (1,750 / 11,200 / 9,450, same average); Month: 12 choices October 2026 … November 2025, October chosen; placeholders = the page`, JSON.stringify(t0) === JSON.stringify({ expenses: ["1,750", "1,750"], income: ["11,200", "11,200"], surplus: ["9,450", "9,450"] }) && opts[0] === "2026-10" && opts[1].length === 12 && opts[1][0] === "October 2026" && opts[1][4] === "June 2026" && opts[1][11] === "November 2025" && JSON.stringify(ph0) === '["1,750","11,200"]', { t0, opts, ph0 });
        await p3.getByTestId("pf-month").selectOption("2026-06");
        await p3.getByTestId("pf-month-expenses").fill("4,000");
        await p3.getByTestId("pf-month-income").fill("9,000");
        const t1 = await ov();
        check(`${tag} PF-27 typing June 2026 (4,000 / 9,000) updates the average: 2,875 / 10,100 / 7,225; this month unchanged`, JSON.stringify(t1) === JSON.stringify({ expenses: ["1,750", "2,875"], income: ["11,200", "10,100"], surplus: ["9,450", "7,225"] }), t1);
        await p3.getByTestId("pf-start").fill("10,000");
        const ch1 = await chart();
        check(`${tag} PF-29 chart: 12 months, three lines (Expenses alert, Income green, Net assets chalk), plot aria-hidden, legend Expenses / Income / Net assets; net assets from 10,000 → 96,700.00`, ch1.months === "12" && ch1.net === "96700.00" && JSON.stringify(ch1.lines) === JSON.stringify(["var(--color-alert)", "var(--color-green)", "var(--color-chalk)"]) && ch1.hidden === "true" && JSON.stringify(ch1.legend) === '["Expenses","Income","Net assets"]', ch1);
        await p3.getByTestId("pf-growth").fill("5");
        const tog = p3.getByTestId("pf-future-toggle");
        const off = [await tog.getAttribute("aria-pressed"), await p3.getByTestId("pf-year").count()];
        await tog.click();
        const yrs = await p3.getByTestId("pf-year").evaluateAll((bs) => bs.map((b) => [b.textContent.trim(), b.getAttribute("aria-pressed")]));
        const f1 = await chart();
        await p3.locator("[data-testid=pf-year][data-years='5']").click();
        const f5 = await chart();
        await p3.locator("[data-testid=pf-year][data-years='15']").click();
        const f15 = await chart();
        check(`${tag} PF-30 Future: off (no year choices) → on: 1 year / 5 years / 10 years / 15 years, 1 year pressed; growth 5: 1 year 24 points → 190,204.37; 5 years 72 → 613,370.68; 15 years 192`, off[0] === "false" && off[1] === 0 && JSON.stringify(yrs) === JSON.stringify([["1 year", "true"], ["5 years", "false"], ["10 years", "false"], ["15 years", "false"]]) && f1.months === "24" && f1.net === "190204.37" && f5.months === "72" && f5.net === "613370.68" && f15.months === "192", { off, yrs, f1: [f1.months, f1.net], f5: [f5.months, f5.net], f15: f15.months });
        await p3.getByTestId("pf-growth").fill("five");
        const gErr = await p3.getByTestId("pf-ov-fields").getByTestId("pf-error").textContent().catch(() => null);
        const f15b = await chart();
        await p3.getByTestId("pf-growth").fill("5");
        check(`${tag} PF-30 a bad growth rate shows "Enter a number, 0 or more." and counts as 0 (15 years: 96,700 + 180 × 7,225)`, gErr === "Enter a number, 0 or more." && f15b.net === (96700 + 180 * 7225).toFixed(2), { gErr, net: f15b.net });
        await p3.locator("[data-testid=pf-year][data-years='5']").click();
        // Layout.
        const lb = { start: await box(p3.getByTestId("pf-start")), growth: await box(p3.getByTestId("pf-growth")), month: await box(p3.getByTestId("pf-month")), me: await box(p3.getByTestId("pf-month-expenses")), mi: await box(p3.getByTestId("pf-month-income")), tog: await box(tog), years: await p3.getByTestId("pf-year").evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height))), plot: (await chart()).h, legend: await box(p3.getByTestId("pf-legend")), table: await box(p3.getByTestId("pf-ov-table")) };
        const row = viewport.width >= 640;
        const okLayout = lb.start.h >= 44 && lb.growth.h >= 44 && lb.month.h >= 44 && lb.me.h >= 44 && lb.mi.h >= 44 && lb.tog.h >= 44 && lb.years.every((h) => h >= 44) && lb.plot === (wide ? 320 : 240) && (row ? lb.start.y === lb.growth.y && lb.growth.x > lb.start.x && lb.start.w <= 256 && lb.month.y === lb.me.y && lb.me.y === lb.mi.y : lb.growth.y > lb.start.y && lb.growth.x === lb.start.x && lb.me.y > lb.month.y && lb.mi.y > lb.me.y) && lb.table.w <= 640;
        check(`${tag} PF-32 layout: ${row ? "fields in one row (≤ 16rem)" : "fields stacked full width"}; every control ≥ 44 px; chart plot ${wide ? 320 : 240} px; table ≤ 40rem`, okLayout, lb);
        await p3.getByTestId("pf-growth").focus();
        await p3.keyboard.press("Tab");
        const ring = await tog.evaluate((e) => { const c = getComputedStyle(e); return [c.outlineStyle, parseFloat(c.outlineWidth), c.outlineColor, document.activeElement === e]; });
        await p3.evaluate(() => document.activeElement?.blur());
        const scroll = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const scan = await contrastScan(p3);
        const gold = await p3.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.borderColor, e.getAttribute("stroke") ?? "", e.getAttribute("fill") ?? ""].some((v) => /gold|rgb\(2[0-4]\d, 1[6-9]\d, [0-9]{1,2}\)|#c9a|#d4af/i.test(v)); }).length);
        check(`${tag} PF-32 Future (reached by Tab) focus ring 2 px chalk; no horizontal scroll; AA for every text (incl. chart ticks); no gold`, ring[0] !== "none" && ring[1] >= 2 && ring[2] === CHALK && ring[3] && scroll <= 0 && scan.bad.length === 0 && gold === 0, { ring, scroll, bad: scan.bad, gold });
        if (AXE) {
          await p3.addScriptTag({ content: AXE });
          const v = await p3.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast", "label", "select-name", "button-name", "aria-valid-attr-value", "aria-required-children", "aria-required-parent", "label-content-name-mismatch"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length, html: x.nodes[0]?.html.slice(0, 80) })));
          check(`${tag} PF-32 axe-core with Overview / Update filled and Future on: no violation`, v.length === 0, v);
        }
        await p3.getByTestId("pf-overview").scrollIntoViewIfNeeded();
        const shotO = join(CFG.out, `pf-overview-${viewport.width}.png`);
        await p3.screenshot({ path: shotO, fullPage: true });
        R.shots.push(shotO);
        const shotS = join(CFG.out, `pf-overview-section-${viewport.width}.png`);
        await p3.locator("section[aria-labelledby=pf-overview]").screenshot({ path: shotS });
        R.shots.push(shotS);
        // Storage + reload.
        const stored = await p3.evaluate((k) => [localStorage.getItem(k), Object.keys(localStorage).sort()], OVERVIEW_KEY);
        await p3.reload({ waitUntil: "networkidle" });
        await p3.locator("[data-testid=pf-area][data-ready=true]").waitFor();
        await p3.getByTestId("pf-month").selectOption("2026-06");
        const back = { t: await ov(), start: await val(p3.getByTestId("pf-start")), growth: await val(p3.getByTestId("pf-growth")), fut: await tog.getAttribute("aria-pressed"), y5: await p3.locator("[data-testid=pf-year][data-years='5']").getAttribute("aria-pressed"), june: [await val(p3.getByTestId("pf-month-expenses")), await val(p3.getByTestId("pf-month-income"))], net: (await chart()).net };
        check(`${tag} PF-31 storage: ${OVERVIEW_KEY} holds start / growth / Future / 5 years / June as typed (only the five PF keys); a reload restores it all (average 2,875 / 10,100, net 613,370.68)`, stored[0] === STORED_OVERVIEW && JSON.stringify(stored[1]) === JSON.stringify([CURRENCY_KEY, EQUITY_KEY, KEY, INCOME_KEY, OVERVIEW_KEY].filter((k) => stored[1].includes(k)).sort()) && stored[1].includes(OVERVIEW_KEY) && JSON.stringify(back) === JSON.stringify({ t: t1, start: "10,000", growth: "5", fut: "true", y5: "true", june: ["4,000", "9,000"], net: "613370.68" }), { stored, back });
        // Clearing June empties it.
        await p3.getByTestId("pf-month-expenses").fill("");
        await p3.getByTestId("pf-month-income").fill("");
        const t2 = await ov();
        const months = await p3.evaluate((k) => JSON.parse(localStorage.getItem(k)).months, OVERVIEW_KEY);
        check(`${tag} PF-27 clearing June's fields empties the month (average back to 1,750 / 11,200; dropped from storage)`, JSON.stringify(t2) === JSON.stringify(t0) && JSON.stringify(months) === "{}", { t2, months });
        check(`${tag} PF-31 no /api request; no page error (Overview / Update)`, api3.length === 0 && errs.length === 0, { api3, errs });
      } catch (e) {
        check(`${tag} PF-26..32 ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
      } finally {
        await c3.close().catch(() => {});
      }
    }

    // PF-07 a new context starts empty; a malformed value shows the empty page without an error.
    for (const [what, value] of [["a new browser context", null], ["malformed stored values (all five keys)", "{not json"]]) {
      const c2 = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
      const p2 = await c2.newPage();
      const errs = [];
      p2.on("pageerror", (e) => errs.push(String(e.message).slice(0, 80)));
      if (value) await p2.addInitScript(([k, ik, ek, ck, ok, v]) => { localStorage.setItem(k, v); localStorage.setItem(ik, v); localStorage.setItem(ek, v); localStorage.setItem(ck, v); localStorage.setItem(ok, v); }, [KEY, INCOME_KEY, EQUITY_KEY, CURRENCY_KEY, OVERVIEW_KEY, value]);
      await p2.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await p2.locator("[data-testid=pf-area][data-ready=true]").waitFor();
      const n = await p2.locator("[data-testid=pf-line], [data-testid=pf-person]").count();
      const hh = await p2.getByTestId("pf-household").inputValue();
      const fut = await p2.getByTestId("pf-future-toggle").getAttribute("aria-pressed");
      check(`${tag} PF-07 / PF-25 / PF-31 ${what}: the empty page, Household currency CAD (Q13), Future off, no error`, n === 0 && hh === "CAD" && fut === "false" && errs.length === 0 && JSON.stringify(await mainTexts(p2)) === JSON.stringify(emptyTexts(wide)), { n, hh, errs });
      await c2.close();
    }

    // PF-09 strict CLS 0, empty and restored.
    for (const [what, stored, ov] of [["empty", null, null], ["restored", STORED, null], ["restored + overview (June typed, Future on, 5 years)", STORED, STORED_OVERVIEW]]) {
      const runs = [];
      for (let i = 0; i < CLS_RUNS; i++) runs.push(await coldCls(browser, viewport, mobile, stored, ov));
      const worst = Math.max(...runs.map((r) => r.total));
      check(`${tag} PF-09 page CLS exactly 0, ${what}${stored ? " (4 lines incl. a BRL one, 2 people, rates, household USD)" : ""} (${CLS_RUNS} cold loads, every shift)`, worst === 0 && runs.every((r) => r.lines === (stored ? 6 : 0)), runs.map((r) => ({ cls: Math.round(r.total * 1e5) / 1e5, lines: r.lines, sources: r.sources.slice(0, 4) })));
    }
  }
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "personal-finance.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
