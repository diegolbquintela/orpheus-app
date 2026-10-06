// Dark shell (epic #66, #68; spec attachments/site-style-spec.md ST0 / ST1, and ST6-03 / -04 as they apply to
// the shell) in a real browser at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900.
//
// Signed out: /, /calculator, /dashboard/sign-in and a 404 (/no-such-page); signed-out /dashboard → 307 to
// sign-in. Signed in (only when QA_EMAIL / QA_PASSWORD are in env; through session.mjs, never logged): /dashboard.
//
// Per page and width:
//   ST1-01 one thin charcoal bar (≤ 48 px), sticky at the top on scroll, Orpheus left / Calculator, Dashboard
//          right (order, hrefs, one line), no dropdowns, no horizontal page scroll
//   ST1-02 exactly one current item (aria-current="page") in off-white + underline, the others dim; none on a 404
//   ST1-03 the footer is charcoal and reads exactly "Orpheus Wisdom"
//   ST1-04 the same bar markup on every page (aria-current aside); plain links
//   ST0-01 (#68 part) the page behind the content is charcoal with off-white base type on every page except
//          /dashboard, whose page and content panel stay as on main (white, ink; spec Q13)
//   ST0-03 / ST6-03 (shell part) AA: every visible text in the bar, the content and the footer against its
//          effective background (4.5:1, 3:1 for large text), and the bar's focus ring (≥ 3:1)
//   plus noindex meta + X-Robots-Tag, one Vercel Analytics script; a screenshot per page and width.
//
// --compare-url <url> (optional; a build of the base branch on the SAME data, e.g. two local servers on one
// database, or production with the same QA account for ST0-05): the content panels that must not change (the
// sign-in white panel and the home cards until #73 / #69 and, signed in, the whole /dashboard content; the
// calculator converted in #70) are screenshotted on both hosts and must be
// pixel-identical (canvas diff; the top / bottom device-pixel rows, where a fractional edge blends with the page background,
// and ≤ 0.01% anti-aliasing noise aside).
//
// Read-only: never clicks Add, Edit, Delete or submits a form. Exit 1 on any FAIL.
//   node qa/tools/site-shell.mjs --base-url <url> --out <dir> [--compare-url <url>]
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";

const CFG = qaConfig(import.meta.url);
const base = CFG.baseUrl;
const R = { base, compare: CFG.compareUrl, checks: [], shots: [], panels: {} };
if (CFG.compareUrl) mkdirSync(join(CFG.out, "panels"), { recursive: true });
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const info = (name, detail) => console.log(`INFO ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);

export const SHELL_VIEWPORTS = [
  ["phone360", { width: 360, height: 780 }, true],
  ["phone", { width: 400, height: 860 }, true],
  ["wide", { width: 1024, height: 800 }, false],
  ["desktop", { width: 1440, height: 900 }, false],
];
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const DIM = "rgb(168, 174, 180)";
const WHITE = "rgb(255, 255, 255)";
const INK = "rgb(30, 33, 36)";
const ITEMS = [["Orpheus", "/"], ["Calculator", "/calculator"], ["Dashboard", "/dashboard"]];
const PAGES = [
  // path, current item, page kind, the content panel that must not change in #68 (compare mode)
  ["/", "Orpheus", "dark", '[data-testid="home-card"] >> xpath=ancestor::ul[1]'],
  ["/calculator", "Calculator", "dark", null], // converted by #70 (qa/tools/calculator-page.mjs); no white panel left
  ["/dashboard/sign-in", "Dashboard", "dark", "body .flex-1 > .bg-paper"],
  ["/no-such-page", null, "dark", null],
];
const navHtml = new Map();

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
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // image / gradient: not measurable
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0) {
          stack.push(c);
          if (c[3] === 1) break;
        }
      }
      let bg = [255, 255, 255];
      for (const c of stack.reverse()) bg = blend(c, bg);
      return bg;
    };
    const roots = [document.querySelector('nav[aria-label="Site"]'), document.querySelector("body .flex-1"), document.querySelector("footer")].filter(Boolean);
    const bad = [];
    let n = 0;
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.nodeValue.trim()) continue;
        const el = t.parentElement;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("[aria-hidden=true], .sr-only, svg")) continue;
        let o = 1;
        for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
        if (o < 0.99) continue; // disabled / faded controls: out of scope for text contrast
        const bg = bgOf(el);
        const fg = parse(cs.color);
        if (!bg || !fg) continue;
        const c = blend(fg, bg);
        const [hi, lo] = [lum(c), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        const size = parseFloat(cs.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        n++;
        if (ratio < (large ? 3 : 4.5)) bad.push({ text: t.nodeValue.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100, color: cs.color });
      }
    }
    return { n, bad: bad.slice(0, 10) };
  });
}

async function shell(page, { vp, path, want, kind, viewport }) {
  const tag = `[${vp}] ${path}`;
  const nav = page.locator('nav[aria-label="Site"]');
  check(`${tag} ST1-01 bar visible`, await nav.isVisible());
  const bar = await nav.evaluate((n) => {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    const links = [...n.querySelectorAll("a")].map((a) => {
      const s = getComputedStyle(a);
      const b = a.getBoundingClientRect();
      return { text: a.textContent, href: a.getAttribute("href"), current: a.getAttribute("aria-current"), color: s.color, deco: s.textDecorationLine, x: Math.round(b.left), right: Math.round(b.right), y: Math.round(b.top + b.height / 2) };
    });
    return { bg: cs.backgroundColor, position: cs.position, height: Math.round(r.height), links, popups: n.querySelectorAll("button, select, details, [aria-haspopup], [role=menu]").length };
  });
  check(`${tag} ST1-01 charcoal, thin (≤ 48 px)`, bar.bg === NIGHT && bar.height <= 48, { bg: bar.bg, height: bar.height });
  check(`${tag} ST1-01 items, hrefs, order`, JSON.stringify(bar.links.map((l) => [l.text, l.href])) === JSON.stringify(ITEMS), bar.links.map((l) => l.text));
  const ys = bar.links.map((l) => l.y);
  // Right group right-aligned: Dashboard ends within the bar's side padding (≤ 40 px from the right edge, or
  // the 1152 px column's edge on wide screens), Calculator just before it, Orpheus at the left.
  const colRight = Math.min(viewport.width, (viewport.width + 1152) / 2);
  check(`${tag} ST1-01 Orpheus left, Calculator then Dashboard right, one line`, bar.links[0].x < viewport.width / 4 && bar.links[0].x < bar.links[1].x && bar.links[1].x < bar.links[2].x && bar.links[2].right >= colRight - 40 && Math.max(...ys) - Math.min(...ys) <= 2, bar.links.map((l) => [l.x, l.right, l.y]));
  check(`${tag} ST1-01 no dropdowns`, bar.popups === 0);
  const current = bar.links.filter((l) => l.current === "page");
  check(`${tag} ST1-02 current page ${want ?? "(none)"}`, JSON.stringify(current.map((l) => l.text)) === JSON.stringify(want ? [want] : []), current.map((l) => l.text));
  for (const l of bar.links) {
    const isCur = l.current === "page";
    const wantColor = isCur || l.text === "Orpheus" ? CHALK : DIM;
    check(`${tag} ST1-02 ${l.text}: ${isCur ? "off-white + underline" : l.text === "Orpheus" ? "off-white, no underline" : "dim, no underline"}`, l.color === wantColor && /underline/.test(l.deco) === isCur, { color: l.color, deco: l.deco });
  }
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(250);
  const top = await nav.evaluate((n) => Math.round(n.getBoundingClientRect().top));
  check(`${tag} ST1-01 sticky at the top on scroll`, ["sticky", "fixed"].includes(bar.position) && top === 0, { position: bar.position, top });
  await page.evaluate(() => window.scrollTo(0, 0));
  const scroll = await page.evaluate(() => [document.scrollingElement.scrollWidth, window.innerWidth]);
  check(`${tag} ST1-01 no horizontal page scroll`, scroll[0] <= scroll[1], scroll);
  const foot = await page.locator("footer").evaluate((f) => ({ bg: getComputedStyle(f).backgroundColor, text: f.innerText.trim(), color: getComputedStyle(f.querySelector("p")).color }));
  check(`${tag} ST1-03 footer charcoal, exactly "Orpheus Wisdom"`, foot.bg === NIGHT && foot.text === "Orpheus Wisdom" && foot.color === DIM, foot);
  const body = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color }));
  if (kind === "dark") check(`${tag} ST0-01 charcoal page, off-white base type`, body.bg === NIGHT && body.color === CHALK, body);
  else check(`${tag} Q13 page around the dashboard content as on main (white, ink)`, body.bg === WHITE && body.color === INK, body);
  const scan = await contrastScan(page);
  check(`${tag} ST0-03 AA contrast for every visible text (bar, content, footer)`, scan.bad.length === 0, scan.bad.length ? scan.bad : { texts: scan.n });
  // Strip aria-current and React's generated ids before comparing the bar across pages.
  const html = (await nav.evaluate((n) => n.outerHTML)).replace(/ aria-current="page"/g, "");
  if (!navHtml.has(vp)) navHtml.set(vp, new Set());
  navHtml.get(vp).add(html);
}

async function focusRing(page, tag) {
  // Tab until a bar link has focus (the bar is first in the document), then read its outline.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a?.closest('nav[aria-label="Site"]')) return null;
      const cs = getComputedStyle(a);
      return { text: a.textContent, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` };
    });
    if (r) return check(`${tag} ST0-03 bar focus ring off-white (≥ 3:1 on charcoal)`, r.outline.includes(CHALK) && !r.outline.startsWith("none"), r);
  }
  check(`${tag} ST0-03 bar focus ring off-white (≥ 3:1 on charcoal)`, false, "no bar link reached with Tab");
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);
async function panelShot(page, selector, name) {
  const el = page.locator(selector).first();
  if (!(await el.count())) return null;
  // The sticky bar would sit on top of a tall element while it is captured: hide the shell for the shot. Wait
  // out chart animations (the dashboard donut animates for 1.5 s).
  await page.addStyleTag({ content: 'nav[aria-label="Site"], footer { visibility: hidden !important; }' });
  await page.waitForTimeout(2000);
  const buf = await el.screenshot({ animations: "disabled", path: join(CFG.out, "panels", `${name}.png`) });
  return { sha: sha(buf), png: buf.toString("base64") };
}

// Pixel diff of two panel PNGs in a canvas: same size, and pixels that differ by more than 32 in any channel
// counted, ignoring the top and bottom 4 device-pixel rows (a fractional element edge blends them with whatever
// is around the panel, which is the page background #68 changes on purpose; 2-3 rows on a 2× phone). Pass: identical apart from ≤ 0.01% noise.
async function samePanel(browser, a, b) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([pa, pb]) => {
      const load = (b64) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = `data:image/png;base64,${b64}`;
      });
      const [ia, ib] = await Promise.all([load(pa), load(pb)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { same: false, size: [ia.width, ia.height, ib.width, ib.height] };
      const px = (img) => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 4, img.width, Math.max(1, img.height - 8)).data;
      };
      const [da, db] = [px(ia), px(ib)];
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 32) diff++;
      const total = da.length / 4;
      return { same: diff <= total * 0.0001, diff, total };
    }, [a, b]);
  } finally {
    await page.close();
  }
}

async function signedOut(browser, host, compareOnly) {
  for (const [vp, viewport, mobile] of SHELL_VIEWPORTS) {
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    page.setDefaultTimeout(30000);
    try {
      for (const [path, want, kind, panel] of PAGES) {
        const res = await page.goto(`${host}${path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        if (!compareOnly) {
          const status = res?.status();
          check(`[${vp}] ${path} HTTP ${path === "/no-such-page" ? 404 : 200}`, status === (path === "/no-such-page" ? 404 : 200), status);
          if (vp === "desktop") {
            check(`[${vp}] ${path} robots meta noindex, nofollow`, (await page.locator('meta[name="robots"]').getAttribute("content")) === "noindex, nofollow");
            const robots = res?.headers()["x-robots-tag"] ?? null;
            check(`[${vp}] ${path} X-Robots-Tag noindex, nofollow`, robots === "noindex, nofollow", robots);
            const scripts = await page.locator('script[src*="/_vercel/insights/script.js"], script[src*="va.vercel-scripts.com"]').count();
            check(`[${vp}] ${path} one Vercel Analytics script`, scripts === 1, scripts);
          }
          await shell(page, { vp, path, want, kind, viewport });
          const file = join(CFG.out, `${path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-")}-${viewport.width}.png`);
          await page.screenshot({ path: file, fullPage: true });
          R.shots.push(file);
          if (vp === "desktop") await focusRing(page, `[${vp}] ${path}`);
        }
        if (panel && CFG.compareUrl) (R.panels[`${vp} ${path}`] ??= {})[compareOnly ? "compare" : "base"] = await panelShot(page, panel, `${vp}${path.replace(/\//g, "_")}-${compareOnly ? "compare" : "base"}`);
      }
    } catch (e) {
      check(`[${vp}] signed-out pages ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      await page.close().catch(() => {});
    }
  }
}

const browser = await chromium.launch();
try {
  info("viewports", SHELL_VIEWPORTS.map(([vp, v]) => `${vp} ${v.width}×${v.height}`));
  // Signed-out /dashboard: the server gate still answers 307 to sign-in.
  const r = await fetch(`${base}/dashboard`, { redirect: "manual" });
  check("signed-out /dashboard → 307 /dashboard/sign-in", r.status === 307 && /\/dashboard\/sign-in$/.test(r.headers.get("location") ?? ""), [r.status, r.headers.get("location")]);
  await signedOut(browser, base, false);
  if (CFG.compareUrl) await signedOut(browser, CFG.compareUrl, true);

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) {
    info("signed-in /dashboard SKIPPED (QA_EMAIL / QA_PASSWORD not set in env)");
  } else {
    const hosts = CFG.compareUrl ? [[base, "base"], [CFG.compareUrl, "compare"]] : [[base, "base"]];
    for (const [host, which] of hosts) {
      await eachViewport({ browser, baseUrl: host, email, password, check: which === "base" ? check : () => {}, viewports: SHELL_VIEWPORTS }, async ({ vp, viewport, page }) => {
        await page.goto(`${host}/dashboard`, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        const content = "body .flex-1 > .bg-paper";
        if (which === "base") {
          check(`[${vp}] /dashboard content visible (released)`, await page.locator('[data-testid="holdings-section"], [data-testid="holdings-empty"], [data-testid="holding-row"]').first().isVisible().catch(() => false));
          const panel = await page.locator(content).evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
          check(`[${vp}] /dashboard ST0-05 content panel as on main (white, ink)`, panel.bg === WHITE && panel.color === INK, panel);
          await shell(page, { vp, path: "/dashboard", want: "Dashboard", kind: "dashboard", viewport });
          const file = join(CFG.out, `dashboard-${viewport.width}.png`);
          await page.screenshot({ path: file, fullPage: true });
          R.shots.push(file);
        }
        if (CFG.compareUrl) (R.panels[`${vp} /dashboard`] ??= {})[which] = await panelShot(page, content, `${vp}_dashboard-${which}`);
      });
    }
  }

  for (const [vp, set] of navHtml) check(`[${vp}] ST1-04 one bar: the same markup on every page`, set.size === 1, set.size);
  if (CFG.compareUrl)
    for (const [key, { base: a, compare: b }] of Object.entries(R.panels)) {
      const res = a && b ? (a.sha === b.sha ? { same: true, diff: 0 } : await samePanel(browser, a.png, b.png)) : { same: false, missing: [!!a, !!b] };
      check(`${key} ST0-05 content panel unchanged vs ${CFG.compareUrl} (pixel diff)`, res.same, res);
      for (const v of [a, b]) if (v) delete v.png;
    }
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "site-shell.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
