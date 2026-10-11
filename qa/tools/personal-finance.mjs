// Personal finance page (#84 v1.1, #85 v1.2 income; spec attachments/personal-finance-spec.md PF-01..16, plus the
// lyre ST1-05) in a
// real browser at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900, signed out. Everything it types stays in that
// browser context's localStorage (no server write exists), so it is safe on any host.
//
//   PF-01 shell: 200, title, noindex meta + X-Robots-Tag, color-scheme dark, charcoal + chalk, the bar unchanged
//         (Orpheus / Calculator / Dashboard, none current, Q1), footer `Orpheus Wisdom`, one Analytics script, no
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
//   PF-10 is the other tools' job (site-style-regression.mjs runs them all, site.mjs the $313,000).
// Screenshots: pf-empty-<w>.png, pf-income-<w>.png, pf-filled-<w>.png, pf-account-<w>.png, pf-check-<w>.png.
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
const PERSON_COLUMNS = ["Name", "Wages (yearly)", "Bonus rating (%)", "Average tax (%)", "Net (yearly)", "Count wages", "Count bonus", "Share (%)"];
const TABLE_COLUMNS = ["Income", "Biweekly", "Monthly", "Yearly"];
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const DIM = "rgb(168, 174, 180)";
const ALERT = "rgb(255, 143, 135)";
const COLUMNS = ["Name", "% of income", "% of expenses", "Monthly", "Yearly", "Equity to cover", "Account"];
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
  "02",
  "Income",
  ...(wide ? PERSON_COLUMNS : []),
  "↳ Add person",
  "Income table",
  ...(wide ? TABLE_COLUMNS : []),
  ...(wide ? ["Net income", "0", "0", "0"] : ["Net income", "Biweekly", "0", "Monthly", "0", "Yearly", "0"]),
  "03",
  "Expenses",
  "Fixed",
  ...(wide ? COLUMNS : []),
  "↳ Add expense",
  ...totalTexts("Fixed total", wide),
  "Variable",
  ...(wide ? COLUMNS : []),
  "↳ Add expense",
  ...totalTexts("Variable total", wide),
  ...totalTexts("Total", wide),
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
      if (!s || el.closest("option, select")) continue;
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
async function coldCls(browser, viewport, mobile, stored) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.addInitScript(([key, value, incomeKey, income]) => {
    if (value) localStorage.setItem(key, value);
    if (income) localStorage.setItem(incomeKey, income);
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__shifts.push({ value: e.value, sources: (e.sources ?? []).map((s) => (s.node?.textContent ?? s.node?.nodeName ?? "").slice(0, 30)) });
    }).observe({ type: "layout-shift", buffered: true });
  }, [KEY, stored ?? null, INCOME_KEY, stored ? STORED_INCOME : null]);
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
const STORED = JSON.stringify({
  fixed: [
    { id: "q1", name: "Rent", amount: "1,000", per: "month", equity: "300,000", account: "Chequing" },
    { id: "q2", name: "Phone", amount: "250", per: "month", equity: "", account: "" },
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
      check(`${tag} PF-01 bar unchanged (Orpheus / Calculator / Dashboard), none current (Q1), footer, one Analytics script`, JSON.stringify(sh.links.map((l) => [l[0], l[1]])) === JSON.stringify([["Orpheus", "/"], ["Calculator", "/calculator"], ["Dashboard", "/dashboard"]]) && sh.links.every((l) => l[2] === null) && sh.footer === "Orpheus Wisdom" && sh.analytics === 1, { links: sh.links, footer: sh.footer, analytics: sh.analytics });
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
      await rent.getByTestId("pf-equity").fill("300,000");
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
      check(`${tag} PF-05 totals: Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200 (100.0%), equity summed`, JSON.stringify(t) === JSON.stringify({ fixed: ["92.6%", "—", "1,250", "15,000", "300,000"], variable: ["7.4%", "—", "100", "1,200", "0"], all: ["100.0%", "—", "1,350", "16,200", "300,000"] }), t);

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
      for (const id of ["pf-name", "pf-income", "pf-share", "pf-monthly", "pf-yearly", "pf-equity", "pf-account", "pf-remove"]) cells[id] = await box(rent.getByTestId(id));
      const order = Object.values(cells).map((b) => b.x);
      if (wide) {
        const tops = Object.values(cells).map((b) => b.y + b.h);
        check(`${tag} PF-08 wide: one row per line, cells in column order`, order.every((x, i) => i === 0 || x > order[i - 1]) && Math.max(...tops) - Math.min(...tops) <= 1, cells);
        const head = await page.locator("[data-testid=pf-group-fixed] [data-testid=pf-head] span").evaluateAll((s) => s.map((e) => Math.round(e.getBoundingClientRect().left)));
        check(`${tag} PF-08 wide: the column labels sit over their columns`, head.every((x, i) => Math.abs(x - order[i]) <= 1), { head, cells: order.slice(0, 7) });
      } else {
        check(`${tag} PF-08 phone: a line is a block (name; Monthly | Yearly; % of expenses | % of income; Account | Equity to cover), remove beside the name`, cells["pf-monthly"].y > cells["pf-name"].y && cells["pf-monthly"].y === cells["pf-yearly"].y && cells["pf-equity"].y > cells["pf-share"].y && cells["pf-equity"].y === cells["pf-account"].y && cells["pf-equity"].x > cells["pf-account"].x && Math.abs(cells["pf-remove"].y + cells["pf-remove"].h - (cells["pf-name"].y + cells["pf-name"].h)) <= 1, cells);
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
      const store = await page.evaluate(async ([key, incomeKey]) => ({
        keys: Object.keys(localStorage).sort(),
        value: JSON.parse(localStorage.getItem(key) ?? "null"),
        income: JSON.parse(localStorage.getItem(incomeKey) ?? "null"),
        session: sessionStorage.length,
        idb: indexedDB.databases ? (await indexedDB.databases()).length : 0,
      }), [KEY, INCOME_KEY]);
      // Cookies on this host only (the builder's extensions script brings a third-party one of its own).
      const cookies = (await ctx.cookies(base)).filter((c) => !c.domain.endsWith("grok.com")).length;
      check(`${tag} PF-07 the two localStorage keys only; typed values as typed; no sessionStorage / IndexedDB / cookie`, JSON.stringify(store.keys) === JSON.stringify([KEY, INCOME_KEY].sort()) && store.income?.people?.length === 2 && store.income.people[0].wages === "120,000" && store.income.people[0].countBonus === false && store.income.people[1].share === "80" && store.value?.fixed?.[0]?.amount === "1,000" && store.value?.variable?.[0]?.amount === "1,200" && store.value?.variable?.[0]?.per === "year" && JSON.stringify(store.value?.accounts) === '["Chequing","Visa"]' && store.session === 0 && store.idb === 0 && cookies === 0, { ...store, cookies });
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("[data-testid=pf-area][data-ready=true]").waitFor();
      const back = {
        rent: [await val(line(page, "fixed", 0).getByTestId("pf-name")), await val(line(page, "fixed", 0).getByTestId("pf-monthly")), await val(line(page, "fixed", 0).getByTestId("pf-equity")), await val(line(page, "fixed", 0).getByTestId("pf-account"))],
        gifts: [await val(line(page, "variable", 0).getByTestId("pf-name")), await val(line(page, "variable", 0).getByTestId("pf-yearly")), await val(line(page, "variable", 0).getByTestId("pf-account"))],
        all: await totals(page, "all"),
        people: [await val(page.getByTestId("pf-person").nth(0).getByTestId("pf-person-name")), await page.getByTestId("pf-person").nth(0).getByTestId("pf-person-count-bonus").isChecked(), await val(page.getByTestId("pf-person").nth(1).getByTestId("pf-person-share"))],
        net: await txt(page.getByTestId("pf-net-income").getByTestId("pf-income-yearly")),
      };
      check(`${tag} PF-07 / PF-16 a reload restores every line, typed value, account, selection and person`, JSON.stringify(back) === JSON.stringify({ rent: ["Rent", "1,000", "300,000", "Chequing"], gifts: ["Gifts", "1,200", "Visa"], all: ["100.0%", "9.8%", "1,100", "13,200", "300,000"], people: ["Me", false, "80"], net: "134,400" }), back);
      check(`${tag} PF-07 no /api request; no page error`, api.length === 0 && errors.length === 0, { api, errors });
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      await ctx.close().catch(() => {});
    }

    // PF-07 a new context starts empty; a malformed value shows the empty page without an error.
    for (const [what, value] of [["a new browser context", null], ["malformed stored values (both keys)", "{not json"]]) {
      const c2 = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
      const p2 = await c2.newPage();
      const errs = [];
      p2.on("pageerror", (e) => errs.push(String(e.message).slice(0, 80)));
      if (value) await p2.addInitScript(([k, ik, v]) => { localStorage.setItem(k, v); localStorage.setItem(ik, v); }, [KEY, INCOME_KEY, value]);
      await p2.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await p2.locator("[data-testid=pf-area][data-ready=true]").waitFor();
      const n = await p2.locator("[data-testid=pf-line], [data-testid=pf-person]").count();
      check(`${tag} PF-07 ${what}: the empty page, no error`, n === 0 && errs.length === 0 && JSON.stringify(await mainTexts(p2)) === JSON.stringify(emptyTexts(wide)), { n, errs });
      await c2.close();
    }

    // PF-09 strict CLS 0, empty and restored.
    for (const [what, stored] of [["empty", null], ["restored", STORED]]) {
      const runs = [];
      for (let i = 0; i < CLS_RUNS; i++) runs.push(await coldCls(browser, viewport, mobile, stored));
      const worst = Math.max(...runs.map((r) => r.total));
      check(`${tag} PF-09 page CLS exactly 0, ${what}${stored ? " (3 lines, 2 people)" : ""} (${CLS_RUNS} cold loads, every shift)`, worst === 0 && runs.every((r) => r.lines === (stored ? 5 : 0)), runs.map((r) => ({ cls: Math.round(r.total * 1e5) / 1e5, lines: r.lines, sources: r.sources.slice(0, 4) })));
    }
  }
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "personal-finance.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
