// Site-style regression on the shipped pages (epic #66, #72; spec attachments/site-style-spec.md ST6-01..09, ST6-05
// runner). Two parts:
//
// 1. Its own ST6 checks in a real browser at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900 on `/`, `/calculator`,
//    `/dashboard/sign-in` and a 404 (`/no-such-page`), signed out, read-only (no form is submitted; #102:
//    `/personal-finance` is signed-in only, so here only its signed-out 307 to `/dashboard/sign-in?next=/personal-finance`;
//    the signed-in page is personal-finance.mjs's and site-shell.mjs's, with QA_EMAIL / QA_PASSWORD in env); ST1-05 (#84): the lyre mark first in the bar's Orpheus link on every page:
//    ST6-01 no painting but the two heroes: `/` exactly one img (the Jordaens alt), `/calculator` exactly one (the
//           Botticelli alt), sign-in and the 404 none; no CSS background-image anywhere
//    ST6-02 no instruction text: the visible texts of the content area (between the bar and the footer) are exactly
//           the shipped copy (spec §4; the calculator before a run; results and field checks: calculator-page.mjs)
//    ST6-03 AA: every visible text (contrast scan; axe-core color-contrast too with AXE_PATH), and every Tab stop
//           shows a ≥ 2 px focus ring (or a chalk underline on a field) at ≥ 3:1 against its background
//    ST6-04 shell: one bar ≤ 48 px with Orpheus / Calculator / Dashboard / Personal Finance (#97) / Account (#90), the right current item (none on the 404),
//           footer exactly `Orpheus Wisdom`, charcoal page + chalk type, color-scheme dark; signed-out /dashboard
//           → 307 sign-in (the full ST1 and ST0-05 run in site-shell.mjs, below)
//    ST6-05 noindex meta + X-Robots-Tag on every page; exactly one Vercel Analytics script; no horizontal scroll
//    ST6-06 no request to fonts.googleapis.com / fonts.gstatic.com; the font files come from /fonts/schibsted-grotesk/
//           on this host; the preload link; the text renders in Schibsted Grotesk (CDP platform fonts); page CLS a
//           strict 0 on CLS_RUNS (default 2) cold loads per page and width, cache disabled, EVERY shift counted
//    ST6-07 no element on the dark pages runs with tnum / tabular-nums; on `/` the period of `research.` is narrower
//           than the tnum period (normal punctuation)
//    ST6-08 each bar link ≥ 44 × 44 px; the bar ≤ 48 px
//    ST6-09 the 404: status 404, only `Page not found.`, no current bar item
// 2. Unless --own-only: runs every shipped-page tool against the same host and reports each one's result
//    (site-shell.mjs [--compare-url for ST0-05 signed in, with QA_EMAIL / QA_PASSWORD in env], home-page.mjs,
//    calculator-page.mjs, saved-searches.mjs, signin-page.mjs, personal-finance.mjs (#84), site.mjs ($313,000), scripts/release-smoke.mjs
//    <base> <--smoke-mode, default preview>). Each tool writes into <out>/<tool>/, its log as <tool>.log.
//
//   node qa/tools/site-style-regression.mjs --base-url <url> --out <dir> [--compare-url <base PR preview>]
//        [--own-only] [--smoke-mode preview|on|off]
// Exit 1 on any FAIL (own checks or a tool).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { qaConfig } from "./config.mjs";
import { fontsSettled } from "./fonts.mjs";
// #141 Q-T1 (CFO-changed, PF-129..PF-131): fewer than 12 complete months with data → "(N of 12 months)".
const avg12Label = (withData = 12, now = new Date()) => {
  if (withData < 12) return `12-month average (${withData} of 12 months)`;
  // #132 (PF-115) / #140 (PF-121): the 12 complete household months (America/Toronto), the 3-month label style.
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  const name = (back) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1 - back, 1)));
  return `12-month average (${name(12)}\u2013${name(1)})`; // #140 (PF-121): 12 complete months
};
const avg3Label = (now = new Date()) => {
  // C7 (approved 2026-10-13): the 3 complete months before the current one, in the household timezone.
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  const name = (back) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1 - back, 1)));
  return `3-month average (${name(3)}\u2013${name(1)})`;
};

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const argv = process.argv.slice(2);
const OWN_ONLY = argv.includes("--own-only");
const SMOKE_MODE = (() => { const i = argv.indexOf("--smoke-mode"); return i >= 0 ? argv[i + 1] : "preview"; })();
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const RUNS = Number(process.env.CLS_RUNS ?? 2);
const R = { base, checks: [], tools: [], cls: {} };
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
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const JORDAENS = "Jacob Jordaens, Triumph of Frederick Henry, Prince of Orange (1652)";
// Shipped copy in the content area (spec §4), in document order.
const PAGES = [
  {
    path: "/", current: "Orpheus", status: 200, imgs: [JORDAENS],
    texts: ["01", "Investment driven by research.", "02", "Platforms", "Calculator", "Dollar-cost average calculator.", "Open", "Dashboard", "The portfolio as a business.", "Open", "Personal Finance", "Income, expenses, and the cover.", "Open"],
  },
  {
    path: "/calculator", current: "Calculator", status: 200, imgs: [/^Sandro Botticelli, The Birth of Venus/],
    texts: ["01", "Dollar-cost average calculator.", "Saved searches", "02", "Basket", "Ticker", "Weight", "↳ Add name", "03", "Window", "Start", "End", "Starting capital", "Contribution", "Frequency", "Compare plans", "US, EU and CA listings, one currency per basket."],
  },
  { path: "/dashboard/sign-in", current: "Dashboard", status: 200, imgs: [], texts: ["Sign in", "Email", "Password", "Sign in"] }, // #90 ROLE-09: no Create an account
  { path: "/no-such-page", current: null, status: 404, imgs: [], texts: ["Page not found."] },
  // #84 / #85 (personal-finance spec §4, §12), the empty page: a phone shows each total's labelled cells; from 1024 px the
  // column-label rows are aria-hidden (not counted) and the cells' labels visually hidden.
  {
    path: "/personal-finance", current: "Personal Finance", status: 200, imgs: [], signedIn: true, // #102: browser checks skipped here
    texts: (wide) => {
      const total = (label) => (wide ? [label, "—", "—", "0", "0", "0"] : [label, "% of income", "—", "% of expenses", "—", "Monthly", "0", "Yearly", "0", "Equity to cover", "0"]);
      // #85: the income block first (`02` Income; its column-label rows aria-hidden), then `03` Expenses; #86: the
      // equity-cover rates (visible labels) before Fixed.
      const net = wide ? ["Net income", "0", "0", "0"] : ["Net income", "Biweekly", "0", "Monthly", "0", "Yearly", "0"];
      // #126: + the 3-month column and the Equity coverage line (no rate yet → — and its note).
      // #94: 04 Overview (the table all —, the two fields, the Future toggle; the chart's plot aria-hidden, its legend
      // visible) and 05 Update (Month, Expenses, Income).
      const overview = ["04", "Overview", "This month", avg3Label(), avg12Label(0), "Expenses", "—", "—", "—", "Income", "—", "—", "—", "Surplus", "—", "—", "—", "Equity coverage:", "—", "Set rate under Expenses", "** Coverage rate is derived from Rate Used under Expenses section.", "Starting net assets", "Growth rate (%)", "Future", "Expenses", "Income", "Net assets", "05", "Update", "Month", "Expenses", "Income"];
      // #131 (Q-W7): the two Withdrawal rate description lines before `Withdrawal rate (%)`.
      // #87: the Household currency select (its label; a closed select's options are not on screen) above Income.
      // #112 / #163 (PFM-12): the month control's labels, Month and Year, under the title.
      return ["01", "Personal Finance.", "Month", "Year", "Household currency", "02", "Income", "↳ Add person", "Income table", ...net, "03", "Expenses", "Withdrawal rate used to calculate how much equity can cover expenses.", "Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.", "Withdrawal rate (%)", "Portfolio ROIC (%)", "Rate used", "—", "Fixed", "↳ Add expense", ...total("Fixed total"), "Variable", "↳ Add expense", ...total("Variable total"), ...total("Total"), ...overview];
    },
  },
];
const lum = ([r, g, b]) => {
  const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const rgb = (s) => (/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/.exec(s) ?? []).slice(1).map(Number);
const r5 = (v) => Math.round(v * 1e5) / 1e5;

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
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      const el = t.parentElement;
      if (!el || el.closest("script, style, noscript, [aria-hidden=true], .sr-only")) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden") continue;
      let o = 1;
      for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      if (o < 0.99) continue;
      const svgText = el instanceof SVGElement;
      const fg = parse(svgText ? cs.fill : cs.color);
      if (!fg || fg[3] === 0) continue;
      const bg = bgOf(svgText ? el.closest("svg") : el);
      const c = blend(fg, bg);
      const [hi, lo] = [lum(c), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      n++;
      if (ratio < (large ? 3 : 4.5)) bad.push({ text: t.nodeValue.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100 });
    }
    return { n, bad: bad.slice(0, 10) };
  });
}


// The visible texts between the bar and the footer, in order.
const contentTexts = (page) =>
  page.evaluate(() => {
    const out = [];
    const root = document.querySelector("body .flex-1");
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const s = t.nodeValue.trim();
      const el = t.parentElement;
      const r = el.getBoundingClientRect();
      // > 1 px: a visually hidden label (1 × 1 px, clipped) is not on screen.
      // #144: a reserved, visibility-hidden line (PF Unsaved changes / the figures note) is not on screen.
      if (s && r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden" && !el.closest(".sr-only, [aria-hidden=true], script, style, noscript")) out.push(s);
    }
    return out;
  });

async function platformFont(page, selector) {
  const c = await page.context().newCDPSession(page);
  try {
    await c.send("DOM.enable");
    await c.send("CSS.enable");
    const { root } = await c.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await c.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) return null;
    return (await c.send("CSS.getPlatformFontsForNode", { nodeId })).fonts.map((f) => f.familyName);
  } finally {
    await c.detach().catch(() => {});
  }
}

// ST6-06: one cold load (fresh context, cache disabled), every layout shift counted.
async function coldCls(browser, path, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__shifts.push({ value: e.value, sources: (e.sources ?? []).map((s) => (s.node?.textContent ?? s.node?.nodeName ?? "").slice(0, 30)) });
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => ({ shifts: window.__shifts, fonts: [...document.fonts].filter((f) => f.family.includes("Schibsted Grotesk")).map((f) => f.status) }));
  await ctx.close();
  return { total: m.shifts.reduce((a, e) => a + e.value, 0), sources: m.shifts.flatMap((e) => e.sources), fonts: m.fonts };
}

async function ownChecks(browser) {
  // Server answers (no browser): status, X-Robots-Tag; signed-out /dashboard.
  for (const p of PAGES) {
    const r = await fetch(`${base}${p.path}`, { redirect: "manual" });
    if (p.signedIn) {
      const to = new URL(r.headers.get("location") ?? "/x", base);
      check(`ST6-04 signed-out ${p.path} → 307 /dashboard/sign-in?next=${p.path} (#102)`, r.status === 307 && to.pathname === "/dashboard/sign-in" && to.searchParams.get("next") === p.path, [r.status, r.headers.get("location")]);
      continue;
    }
    check(`ST6-05 / ST6-09 GET ${p.path} → ${p.status}, X-Robots-Tag noindex`, r.status === p.status && /noindex/i.test(r.headers.get("x-robots-tag") ?? ""), [r.status, r.headers.get("x-robots-tag")]);
  }
  {
    const r = await fetch(`${base}/dashboard`, { redirect: "manual" });
    check("ST6-04 signed-out /dashboard → 307 /dashboard/sign-in", r.status === 307 && /\/dashboard\/sign-in$/.test(r.headers.get("location") ?? ""), [r.status, r.headers.get("location")]);
  }
  let AXE = null;
  if (process.env.AXE_PATH) AXE = readFileSync(process.env.AXE_PATH, "utf8");
  else console.log("INFO axe-core not run (set AXE_PATH to axe.min.js); the contrast scan covers ST6-03");

  for (const [vp, viewport, mobile] of VIEWPORTS) {
    for (const p of PAGES) {
      if (p.signedIn) continue; // #102: signed in, checked by personal-finance.mjs (PF-01 / PF-08 / PF-09 / PF-39)
      const tag = `[${vp}] ${p.path}`;
      const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
      const page = await ctx.newPage();
      const requests = [];
      page.on("request", (q) => requests.push(q.url()));
      try {
        await page.goto(`${base}${p.path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        // ST6-06 fonts
        const fontReqs = requests.filter((u) => /\.woff2?(\?|$)/.test(u) || /fonts\.(googleapis|gstatic)\.com/.test(u));
        check(`${tag} ST6-06 no Google Fonts request; font files from this host's /fonts/schibsted-grotesk/`, fontReqs.length >= 1 && fontReqs.every((u) => u.startsWith(`${base}/fonts/schibsted-grotesk/`)), fontReqs.map((u) => u.replace(base, "")));
        const preload = await page.locator('link[rel=preload][as=font][href="/fonts/schibsted-grotesk/schibsted-grotesk-latin.woff2"][crossorigin]').count();
        check(`${tag} ST6-06 the upright latin file is preloaded (crossorigin)`, preload === 1, preload);
        // #135: the font checks below (ST6-06 h1 font, ST6-07 period width) and the rest of this page's checks
        // measure once the site font is applied (document.fonts.ready; a reload if font-display: optional left
        // the fallback). The font-request and preload checks above read the first load; the cold-load CLS check
        // below stays cold. Assertions unchanged.
        const fw = await fontsSettled(page);
        if (fw.loads > 1 || !fw.ok) console.log(`INFO ${tag} #135 font wait: ${fw.ok ? "Schibsted Grotesk" : "still fallback"} after ${fw.loads} loads · ${JSON.stringify(fw.fonts)}`);
        const fam = await platformFont(page, p.path === "/" || p.path === "/calculator" ? "header h1" : "main h1");
        check(`${tag} ST6-06 the h1 renders in Schibsted Grotesk`, fam?.length === 1 && fam[0] === "Schibsted Grotesk", fam);

        // ST6-01 painting
        const paint = await page.evaluate(() => ({
          imgs: [...document.querySelectorAll("img")].map((i) => i.alt),
          pictures: document.querySelectorAll("picture").length,
          bg: [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).backgroundImage !== "none").map((e) => `${e.tagName}.${e.className}`).slice(0, 5),
        }));
        const imgsOk = paint.imgs.length === p.imgs.length && p.imgs.every((want, i) => (want instanceof RegExp ? want.test(paint.imgs[i]) : paint.imgs[i] === want)) && paint.pictures === p.imgs.length;
        check(`${tag} ST6-01 painting: ${p.imgs.length ? "only the hero" : "none"}; no CSS background-image`, imgsOk && paint.bg.length === 0, paint);

        // ST6-02 copy
        const texts = await contentTexts(page);
        const want = typeof p.texts === "function" ? p.texts(viewport.width >= 1024) : p.texts;
        check(`${tag} ST6-02 no instruction text: the content is exactly the shipped copy`, JSON.stringify(texts) === JSON.stringify(want), texts);

        // ST6-04 / -05 / -08 shell
        const sh = await page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="Site"]');
          const home = nav.querySelector('a[href="/"]');
          const svg = home?.firstElementChild;
          const lyre = svg?.tagName.toLowerCase() === "svg" && svg.getAttribute("aria-hidden") === "true" && svg.querySelectorAll("path").length === 5 && Math.round(svg.getBoundingClientRect().width) === 20;
          const links = [...nav.querySelectorAll("a")].map((a) => { const r = a.getBoundingClientRect(); return { text: a.textContent.trim(), href: a.getAttribute("href"), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, current: a.getAttribute("aria-current") }; });
          return {
            lyre,
            bar: Math.round(nav.getBoundingClientRect().height * 10) / 10,
            barBg: getComputedStyle(nav).backgroundColor,
            links,
            footer: document.querySelector("footer")?.textContent.trim(),
            bodyBg: getComputedStyle(document.body).backgroundColor,
            bodyColor: getComputedStyle(document.body).color,
            scheme: [getComputedStyle(document.documentElement).colorScheme, getComputedStyle(document.body).colorScheme],
            scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            robots: document.querySelector('meta[name=robots]')?.content,
            analytics: document.querySelectorAll('script[src*="/_vercel/insights/script.js"], script[src*="va.vercel-scripts.com"]').length,
          };
        });
        check(`${tag} ST6-04 bar: charcoal, ≤ 48 px, Orpheus / Calculator / Dashboard / Personal Finance (#97) / Account (#90), current ${p.current ?? "none"}`, sh.barBg === NIGHT && sh.bar <= 48 && JSON.stringify(sh.links.map((l) => [l.text, l.href])) === JSON.stringify([["Orpheus", "/"], ["Calculator", "/calculator"], ["Dashboard", "/dashboard"], ["Personal Finance", "/personal-finance"], ["Account", "/account"]]) && JSON.stringify(sh.links.filter((l) => l.current === "page").map((l) => l.text)) === JSON.stringify(p.current ? [p.current] : []), { bar: sh.bar, links: sh.links.map((l) => [l.text, l.current]) });
        check(`${tag} ST1-05 the lyre mark (aria-hidden SVG, 20 px) first in the Orpheus link`, sh.lyre === true, sh.lyre);
        check(`${tag} ST6-08 bar links ≥ 44 × 44 px tap targets, bar ≤ 48 px`, sh.links.every((l) => l.h >= 44 && l.w >= 44) && sh.bar <= 48, { bar: sh.bar, links: sh.links.map((l) => [l.text, l.w, l.h]) });
        check(`${tag} ST6-04 footer exactly \`Orpheus Wisdom\`; charcoal page, chalk type, color-scheme dark`, sh.footer === "Orpheus Wisdom" && sh.bodyBg === NIGHT && sh.bodyColor === CHALK && sh.scheme.every((s) => s === "dark"), { footer: sh.footer, bg: sh.bodyBg, color: sh.bodyColor, scheme: sh.scheme });
        check(`${tag} ST6-05 noindex meta, one Analytics script, no horizontal scroll`, /noindex/.test(sh.robots ?? "") && sh.analytics === 1 && sh.scroll <= 0, { robots: sh.robots, analytics: sh.analytics, scroll: sh.scroll });

        // ST6-07 tnum
        const tn = await page.evaluate(() => [...document.querySelectorAll("body, body *")].filter((e) => { const c = getComputedStyle(e); return /tnum/.test(c.fontFeatureSettings) || /tabular-nums/.test(c.fontVariantNumeric); }).map((e) => `${e.tagName}.${typeof e.className === "string" ? e.className.slice(0, 40) : ""}`).slice(0, 8));
        check(`${tag} ST6-07 no element with tnum / tabular-nums`, tn.length === 0, tn);
        if (p.path === "/") {
          const dots = await page.evaluate(() => {
            const h1 = document.querySelector("header h1");
            const node = [...h1.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.includes("research."));
            const i = node.nodeValue.indexOf("research.") + "research".length;
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const actual = range.getBoundingClientRect().width;
            const probe = document.createElement("span");
            probe.textContent = ".";
            probe.style.cssText = 'position:absolute;visibility:hidden;font-feature-settings:"tnum" on';
            h1.appendChild(probe);
            const tnum = probe.getBoundingClientRect().width;
            probe.remove();
            return { actual: Math.round(actual * 100) / 100, tnum: Math.round(tnum * 100) / 100 };
          });
          check(`${tag} ST6-07 \`research.\`: the period at its normal width (${dots.actual} px; tnum would be ${dots.tnum} px)`, dots.actual > 0 && dots.actual < dots.tnum * 0.8, dots);
        }

        // ST6-03 AA + focus
        const scan = await contrastScan(page);
        check(`${tag} ST6-03 AA contrast for every visible text`, scan.bad.length === 0, scan.bad.length ? scan.bad : { texts: scan.n });
        if (AXE) {
          await page.addScriptTag({ content: AXE });
          const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length, html: x.nodes[0]?.html.slice(0, 80) })));
          check(`${tag} ST6-03 axe-core color-contrast: no violation`, v.length === 0, v);
        }
        const stops = [];
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press("Tab");
          const s = await page.evaluate(() => {
            const e = document.activeElement;
            if (!e || e === document.body) return null;
            const host = e.closest(".calc-field") ?? e;
            const c = getComputedStyle(e);
            const h = getComputedStyle(host);
            let bg = "rgb(30, 33, 36)";
            // The ring sits outside the element (outline-offset ≥ 0): measure it against what is behind the element.
            for (let x = host.parentElement; x; x = x.parentElement) { const b = getComputedStyle(x).backgroundColor; if (b !== "rgba(0, 0, 0, 0)") { bg = b; break; } }
            const ring = [c, h].find((st) => st.outlineStyle !== "none" && parseFloat(st.outlineWidth) >= 2);
            return {
              key: `${e.tagName}|${e.getAttribute("aria-label") ?? e.getAttribute("name") ?? e.textContent?.trim().slice(0, 20) ?? ""}|${e.getAttribute("type") ?? ""}`,
              ring: ring ? ring.outlineColor : null,
              underline: e.tagName === "INPUT" || e.tagName === "SELECT" ? h.borderBottomColor : null,
              bg,
            };
          });
          if (!s || stops.some((x) => x.key === s.key)) break;
          stops.push(s);
        }
        const badFocus = stops.filter((s) => !((s.ring && ratio(rgb(s.ring), rgb(s.bg)) >= 3) || (s.underline && s.underline === CHALK)));
        check(`${tag} ST6-03 every Tab stop shows a ≥ 3:1 focus mark (${stops.length} stops)`, stops.length >= 3 && badFocus.length === 0, badFocus.length ? badFocus : stops.length);

        const shot = join(CFG.out, `${p.path === "/" ? "home" : p.path.replace(/^\//, "").replace(/\//g, "_")}-${viewport.width}.png`);
        await page.screenshot({ path: shot, fullPage: true });
      } catch (e) {
        check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
      } finally {
        await ctx.close().catch(() => {});
      }

      // ST6-06 strict CLS on cold loads.
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(await coldCls(browser, p.path, viewport, mobile));
      (R.cls[p.path] ??= {})[viewport.width] = runs.map((x) => x.total);
      check(`${tag} ST6-06 page CLS = 0 (strict) on ${RUNS} cold loads, every shift counted (${JSON.stringify(runs.map((x) => r5(x.total)))})`, runs.every((x) => x.total === 0), runs.map((x) => ({ total: x.total, sources: x.sources.slice(0, 4), fonts: x.fonts })));
    }
  }
}

// Part 2: the shipped-page tools.
function runTool(name, cmd, args) {
  return new Promise((done) => {
    const dir = join(CFG.out, name);
    mkdirSync(dir, { recursive: true });
    const log = createWriteStream(join(CFG.out, `${name}.log`));
    const child = spawn(process.execPath, [cmd, ...args.map((a) => a.replace("{out}", dir))], { cwd: REPO, env: process.env });
    let tail = "";
    const onData = (d) => { log.write(d); tail = (tail + d.toString()).slice(-4000); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => {
      log.end();
      const summary = (/(\d+\/\d+ passed[^\n]*)/.exec(tail) ?? /(\[[\w-]+\] (?:OK|FAIL)[^\n]*)/.exec(tail) ?? [null, tail.trim().split("\n").pop()])[1];
      R.tools.push({ name, code, summary });
      check(`ST6-05 ${name}: ${summary}`, code === 0, code);
      done();
    });
  });
}

const browser = await chromium.launch();
try {
  await ownChecks(browser);
} finally {
  await browser.close();
}
if (!OWN_ONLY) {
  const compare = CFG.compareUrl ? ["--compare-url", CFG.compareUrl] : [];
  if (!CFG.compareUrl || !process.env.QA_EMAIL) console.log("INFO ST0-05 signed-in /dashboard compare needs --compare-url <base PR preview> and QA_EMAIL / QA_PASSWORD in env; site-shell.mjs skips it otherwise (QA runs it)");
  const T = (f) => join(HERE, f);
  await runTool("site-shell", T("site-shell.mjs"), ["--base-url", base, "--out", "{out}", ...compare]);
  await runTool("home-page", T("home-page.mjs"), ["--base-url", base, "--out", "{out}"]);
  await runTool("calculator-page", T("calculator-page.mjs"), ["--base-url", base, "--out", "{out}"]);
  await runTool("saved-searches", T("saved-searches.mjs"), ["--base-url", base, "--out", "{out}"]);
  await runTool("signin-page", T("signin-page.mjs"), ["--base-url", base, "--out", "{out}"]);
  await runTool("personal-finance", T("personal-finance.mjs"), ["--base-url", base, "--out", "{out}"]);
  await runTool("site", T("site.mjs"), ["--base-url", base, "--out", "{out}"]);
  await runTool("release-smoke", join(REPO, "scripts", "release-smoke.mjs"), [base, SMOKE_MODE]);
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "site-style-regression.json"), JSON.stringify(R, null, 2));
console.log(`\nCLS (strict, cold): ${JSON.stringify(R.cls)}`);
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · out ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
