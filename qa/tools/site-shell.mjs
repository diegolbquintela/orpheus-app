// Dark shell (epic #66, #68; spec attachments/site-style-spec.md ST0 / ST1, and ST6-03 / -04 as they apply to
// the shell) in a real browser at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900.
//
// Signed out: /, /calculator, /dashboard/sign-in and a 404 (/no-such-page); signed-out /dashboard → 307 to sign-in, and
// signed-out /personal-finance → 307 to /dashboard/sign-in?next=/personal-finance (#102). Signed in (only when QA_EMAIL /
// QA_PASSWORD are in env; through session.mjs, never logged): /dashboard and /personal-finance (#97 bar item; #102).
//
// Per page and width:
//   (#286, 2026-11-01: the bar is now lyre Orpheus / Search / Menu, the page links in the full-page overlay; HDR ACs.)
//   ST1-01 one thin charcoal bar (≤ 48 px), sticky at the top on scroll, Orpheus left / Calculator, Dashboard,
//          Personal Finance right (#97; order, hrefs, one line, text only, 12 px below 640 px / 14 px from 640,
//          links ≥ 44 px tall), no dropdowns, no horizontal page scroll
//   ST1-02 exactly one current item (aria-current="page") in off-white + underline, the others dim; none on a 404
//   ST1-03 the footer is charcoal and reads exactly "Orpheus Wisdom"
//   ST1-04 the same bar markup on every page (aria-current aside); plain links
//   ST0-01 (#68 part) the page behind the content is charcoal with off-white base type on every page except
//          /dashboard, whose page and content panel stay as on main (white, ink; spec Q13)
//   ST0-03 / ST6-03 (shell part) AA: every visible text in the bar, the content and the footer against its
//          effective background (4.5:1, 3:1 for large text), and the bar's focus ring (≥ 3:1)
//   plus noindex meta + X-Robots-Tag, one Vercel Analytics script; a screenshot per page and width.
//
// #287 (HBM, qa/CANONICAL-AC-PACK.md; attachments/header-menu-spec.md "§ #287 mobile"), at 360 / 390 / 768 / 1440:
//   the Menu trigger (44 px) opens the full-screen dialog; below 768 the links come first as full-width ≥ 48 px rows,
//   then Search, then the panel's lyre + `Orpheus Wisdom` block; from 768 the #286 layout (Search first, no panel
//   block); no overflow; Tab wraps; Esc closes with focus back on Menu; at 390 each link lands on its path with one
//   aria-current. Signed in (HBM-03/04): the owner (QA_EMAIL / QA_PASSWORD) sees `Renaissance Man` and it navigates;
//   the Read user (QA_CFO_READ_EMAIL / QA_CFO_READ_PASSWORD) never does. Unset: SKIPPED (NOT A PASS), exit 3. Nothing is
//   saved (HBM-10: the step only reads; localStorage and sessionStorage are asserted empty of new keys).
//   Every log line masks email addresses (qa/tools/redact.mjs).
//
// --compare-url <url> (optional; a build of the base branch on the SAME data: locally two servers on one
// database, or for ST0-05 the BASE PR's preview signed in with the same QA account (QA_EMAIL / QA_PASSWORD);
// never production, which has no QA sign-in; spec ST0-05, EL N7): the content panels that must not change (the
// signed-in /dashboard content; the calculator converted in #70, home in #69, sign-in in #73) are screenshotted on both hosts and must be
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
import { refuseIfProd, signedOutProd } from "./prod-guard.mjs";
import { eachViewport } from "./session.mjs";
import { fontsSettled } from "./fonts.mjs";
import { installConsoleMask } from "./redact.mjs";
import { headerSkip, headerSkips, headersApply } from "./lib/local-headers.mjs";
import { viewportsFromArgv } from "./lib/viewports.mjs";

installConsoleMask();

const CFG = qaConfig(import.meta.url);
// #157 (QA run 2026-10-17 F2, EL): refuse production before any request or sign-in (qa/tools/prod-guard.mjs).
await refuseIfProd(CFG.baseUrl, "site-shell");
if (CFG.compareUrl) await refuseIfProd(CFG.compareUrl, "site-shell (--compare-url)");
const base = CFG.baseUrl;
const R = { base, compare: CFG.compareUrl, checks: [], shots: [], panels: {} };
if (CFG.compareUrl) mkdirSync(join(CFG.out, "panels"), { recursive: true });
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const info = (name, detail) => console.log(`INFO ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
// #135: wait for the site font (document.fonts.ready; a reload if font-display: optional left the fallback) before
// a font-dependent measurement. Logged as INFO when it took more than one load; the assertions are unchanged.
async function fontWait(page, tag, opts) {
  const f = await fontsSettled(page, opts);
  if (f.loads > 1 || !f.ok) info(`${tag} #135 font wait: ${f.ok ? "Schibsted Grotesk" : "still fallback"} after ${f.loads} loads`, f.fonts);
  return f;
}

// #320: phone 390 + desktop 1440 by default; 360 / 400 / 768 / 1024 opt-in with --viewports (lib/viewports.mjs).
export const SHELL_VIEWPORTS = viewportsFromArgv();
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const DIM = "rgb(168, 174, 180)";
const WHITE = "rgb(255, 255, 255)";
const INK = "rgb(30, 33, 36)";
// #90 (ROLE-01): Account last.
const ITEMS = [["Orpheus", "/"], ["Calculator", "/calculator"], ["Dashboard", "/dashboard"], ["Personal Finance", "/personal-finance"], ["Account", "/account"]];
// BY3 (#267 / #286 / #293): signed in as the owner the overlay adds `Renaissance Man` (server-decided, RM-21) before
// Account: 6 links. Signed out (and for non-owners) the HTML never holds it: the 5 above.
const ITEMS_OWNER = [...ITEMS.slice(0, -1), ["Renaissance Man", "/renaissance"], ITEMS.at(-1)];
const PAGES = [
  // path, current item, page kind, the content panel that must not change in #68 (compare mode)
  ["/", "Orpheus", "dark", null], // converted by #69 (qa/tools/home-page.mjs); no white panel left
  ["/calculator", "Calculator", "dark", null], // converted by #70 (qa/tools/calculator-page.mjs); no white panel left
  ["/dashboard/sign-in", "Dashboard", "dark", null], // converted by #73 (qa/tools/signin-page.mjs); no white panel left
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

async function shell(page, { vp, path, want, kind, viewport, owner = false }) {
  const items = owner ? ITEMS_OWNER : ITEMS;
  const tag = `[${vp}] ${path}`;
  const nav = page.locator('nav[aria-label="Site"]');
  check(`${tag} ST1-01 bar visible`, await nav.isVisible());
  // #286 (HDR, supersedes the five-link bar): the bar is lyre + Orpheus / Search / Menu; the page links (ITEMS) are in the
  // full-page overlay, hidden until opened. Bar items are read from [data-testid=site-bar] only, so hidden overlay links
  // never count as bar items.
  const bar = await nav.evaluate((n) => {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    const items = [...n.querySelector('[data-testid="site-bar"]').querySelectorAll("a, button")].map((a) => {
      const s = getComputedStyle(a);
      const b = a.getBoundingClientRect();
      return { text: a.textContent.trim() || a.getAttribute("aria-label"), href: a.getAttribute("href"), current: a.getAttribute("aria-current"), color: s.color, x: Math.round(b.left), right: Math.round(b.right), y: Math.round(b.top + b.height / 2), h: Math.round(b.height), w: Math.round(b.width) };
    });
    const links = [...n.querySelectorAll('[data-testid="site-menu-links"] a')].map((a) => ({ text: a.textContent, href: a.getAttribute("href"), current: a.getAttribute("aria-current") }));
    return { bg: cs.backgroundColor, position: cs.position, height: Math.round(r.height), items, links, overlayHidden: n.querySelector('[data-testid="site-overlay"]')?.hidden === true, popups: n.querySelectorAll("select, details, [aria-haspopup], [role=menu]").length };
  });
  check(`${tag} ST1-01 charcoal, thin (≤ 48 px)`, bar.bg === NIGHT && bar.height <= 48, { bg: bar.bg, height: bar.height });
  check(`${tag} ST1-01 (#286) bar items: Orpheus (lyre) / Search / Menu, no current mark on them`, JSON.stringify(bar.items.map((l) => [l.text, l.href])) === JSON.stringify([["Orpheus", "/"], ["Search", null], ["Menu", null]]) && bar.items.every((l) => l.current === null), bar.items.map((l) => l.text));
  check(`${tag} ST1-01 (#286) overlay links (hidden until opened): ${items.length} items${owner ? " incl. Renaissance Man (owner)" : ""}, hrefs, order, Account last`, bar.overlayHidden && JSON.stringify(bar.links.map((l) => [l.text, l.href])) === JSON.stringify(items), bar.links.map((l) => l.text));
  const ys = bar.items.map((l) => l.y);
  const colRight = Math.min(viewport.width, (viewport.width + 1152) / 2);
  const last = bar.items.at(-1);
  check(`${tag} ST1-01 (#286) Orpheus left, Search and Menu right, one line, no overlap`, bar.items[0].x < viewport.width / 4 && bar.items.every((l, i) => i === 0 || l.x >= bar.items[i - 1].right) && last.right >= colRight - 40 && last.right <= viewport.width && Math.max(...ys) - Math.min(...ys) <= 2, bar.items.map((l) => [l.x, l.right, l.y]));
  check(`${tag} ST1-01 every bar item ≥ 44 px tall and wide`, bar.items.every((l) => l.h >= 44 && l.w >= 44), bar.items.map((l) => [l.text, l.w, l.h]));
  check(`${tag} ST1-01 no dropdowns (#286: the menu is a full-page dialog)`, bar.popups === 0);
  const current = bar.links.filter((l) => l.current === "page");
  check(`${tag} ST1-02 current page ${want ?? "(none)"}`, JSON.stringify(current.map((l) => l.text)) === JSON.stringify(want ? [want] : []), current.map((l) => l.text));
  check(`${tag} ST1-02 Orpheus (bar) off-white`, bar.items[0].color === CHALK, bar.items[0].color);
  // The overlay links' paint (computed while hidden, so the Tab walk below is not moved): current chalk + underline,
  // the others dim. Opening and closing the overlay is covered by site.mjs and the DOM tests.
  const paint = await nav.evaluate((n) => [...n.querySelectorAll('[data-testid="site-menu-links"] a')].map((a) => ({ text: a.textContent, current: a.getAttribute("aria-current"), color: getComputedStyle(a).color, deco: getComputedStyle(a).textDecorationLine })));
  for (const l of paint) {
    const isCur = l.current === "page";
    check(`${tag} ST1-02 ${l.text}: ${isCur ? "off-white + underline" : "dim, no underline"}`, l.color === (isCur ? CHALK : DIM) && /underline/.test(l.deco) === isCur, { color: l.color, deco: l.deco });
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
  const html = (await nav.evaluate((n) => n.outerHTML)).replace(/ aria-current="page"/g, "").replace(/ (id|for|aria-controls|aria-describedby)="[^"]*"/g, " $1");
  // BY3: ST1-04 compares the bar per viewport within one view (signed out / owner): the owner's overlay adds one link.
  const key = `${vp}${owner ? " owner" : ""}`;
  if (!navHtml.has(key)) navHtml.set(key, new Set());
  navHtml.get(key).add(html);
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
        let res = await page.goto(`${host}${path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        const fw = await fontWait(page, `[${vp}] ${host === base ? "" : "compare "}${path}`);
        if (fw.response) res = fw.response;
        if (!compareOnly) {
          const status = res?.status();
          check(`[${vp}] ${path} HTTP ${path === "/no-such-page" ? 404 : 200}`, status === (path === "/no-such-page" ? 404 : 200), status);
          if (vp === "desktop") {
            check(`[${vp}] ${path} robots meta noindex, nofollow`, (await page.locator('meta[name="robots"]').getAttribute("content")) === "noindex, nofollow");
            const robots = res?.headers()["x-robots-tag"] ?? null;
            if (headersApply(CFG)) check(`[${vp}] ${path} X-Robots-Tag noindex, nofollow`, robots === "noindex, nofollow", robots);
            else headerSkip(`[${vp}] ${path} X-Robots-Tag`); // #320
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

// #287 HBM: the mobile menu, at one page and width (see the header).
// #320: 390 + 1440 by default; 360 / 768 opt-in with --viewports (CH14 / CH15 still cross 767 <-> 768 in-page).
const HBM_WIDTHS = SHELL_VIEWPORTS.map(([, v]) => v.width);
const HBM_LINKS = [["Orpheus", "/"], ["Calculator", "/calculator"], ["Dashboard", "/dashboard"], ["Personal Finance", "/personal-finance"], ["Account", "/account"]];
const hbmLinks = (owner) => (owner ? [...HBM_LINKS.slice(0, -1), ["Renaissance Man", "/renaissance"], HBM_LINKS.at(-1)] : HBM_LINKS);
async function hbm(page, host, width, { who = "signed out", owner = false, navigate = false } = {}) {
  const tag = `[${width} ${who}]`;
  await page.goto(`${host}/calculator`, { waitUntil: "networkidle" });
  const storage = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  const menu = page.getByTestId("site-menu-open");
  const tb = await menu.boundingBox();
  check(`${tag} HBM-01 Menu trigger visible, ≥ 44 px`, (await menu.isVisible()) && tb.width >= 44 && tb.height >= 44, tb && [tb.width, tb.height]);
  await menu.click();
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const o = document.querySelector('[data-testid="site-overlay"]');
    const r = (e) => (e ? e.getBoundingClientRect() : null);
    const ul = document.querySelector('[data-testid="site-menu-links"]');
    const links = [...ul.querySelectorAll("a")].map((a) => ({ t: a.textContent, h: a.getAttribute("href"), w: Math.round(r(a).width), ht: Math.round(r(a).height) }));
    const f = document.querySelector('[data-testid="site-menu-footer"]');
    const fv = f && getComputedStyle(f).display !== "none";
    return {
      dialog: o.getAttribute("role") === "dialog" && o.getAttribute("aria-modal") === "true" && !o.hidden,
      cover: [Math.round(r(o).width), Math.round(r(o).height), innerWidth, innerHeight],
      expanded: document.querySelector('[data-testid="site-menu-open"]').getAttribute("aria-expanded"),
      links, ulW: Math.round(r(ul).width), linksTop: Math.round(r(ul).top), searchTop: Math.round(r([...document.querySelectorAll('[data-testid="site-search"]')].find((i) => i.checkVisibility())).top),
      searchShown: [...o.querySelectorAll('[data-testid="site-search"]')].filter((i) => i.checkVisibility()).length,
      footer: fv ? { text: f.innerText.trim(), lyre: !!f.querySelector("svg"), top: Math.round(r(f).top) } : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth + Math.max(0, o.scrollWidth - o.clientWidth),
      gold: [...o.querySelectorAll("*")].some((e) => /rgb\((2[0-5]\d|1[89]\d), (1[3-9]\d|2[0-2]\d), ([0-9]|[1-9]\d)\)/.test(getComputedStyle(e).color)),
      tnum: [...o.querySelectorAll("*")].some((e) => /tabular-nums|tnum/.test(getComputedStyle(e).fontVariantNumeric + getComputedStyle(e).fontFeatureSettings)),
    };
  });
  check(`${tag} HBM-02 full-screen dialog, aria-expanded`, m.dialog && m.cover[0] === m.cover[2] && m.cover[1] === m.cover[3] && m.expanded === "true", m.cover);
  const want = hbmLinks(owner);
  check(`${tag} HBM-03 links by full name, in order${owner ? " incl. Renaissance Man (owner)" : " (no Renaissance Man)"}`, JSON.stringify(m.links.map((l) => [l.t, l.h])) === JSON.stringify(want), m.links.map((l) => l.t));
  if (width < 768) {
    check(`${tag} HBM-03 below 768: links first, full-width ≥ 48 px rows, Search below them`, m.linksTop < m.searchTop && m.links.every((l) => l.w >= m.ulW - 1 && l.ht >= 48), { linksTop: m.linksTop, searchTop: m.searchTop, ulW: m.ulW, rows: m.links.map((l) => [l.w, l.ht]) });
    check(`${tag} HBM-07 panel lyre + exactly \`Orpheus Wisdom\` below Search`, m.footer?.text === "Orpheus Wisdom" && m.footer.lyre && m.footer.top > m.searchTop, m.footer);
  } else {
    check(`${tag} HBM-08 from 768: #286 layout (Search first, no panel block)`, m.searchTop < m.linksTop && m.footer === null && m.links.every((l) => l.ht >= 44 && l.w < m.ulW), { linksTop: m.linksTop, searchTop: m.searchTop, footer: m.footer });
  }
  check(`${tag} HBM-07 no overflow, 44 px links, no gold, no tnum`, m.overflow <= 0 && m.links.every((l) => l.ht >= 44) && !m.gold && !m.tnum, { overflow: m.overflow, gold: m.gold, tnum: m.tnum });
  // #287 Q5(b) (2026-11-02): real Tab presses from X walk the dialog; phones X, links, Search; 768+ X, Search, links (#286).
  const tabName = () => page.evaluate(() => { const a = document.activeElement; return a?.getAttribute("data-testid") ?? a?.textContent ?? null; });
  await page.getByTestId("site-menu-close").focus();
  const tabs = [await tabName()];
  const names = want.map(([l]) => l);
  const wantTabs = width < 768 ? ["site-menu-close", ...names, "site-search"] : ["site-menu-close", "site-search", ...names];
  for (let i = 0; i < wantTabs.length; i++) {
    await page.keyboard.press("Tab");
    tabs.push(await tabName());
  }
  check(`${tag} HBM-06 Tab order ${width < 768 ? "X, links, Search (Q5(b))" : "X, Search, links (#286)"}; one search field displayed; Tab wraps to X`, JSON.stringify(tabs) === JSON.stringify([...wantTabs, "site-menu-close"]) && m.searchShown === 1, { tabs, searchShown: m.searchShown });
  await page.keyboard.press("Shift+Tab");
  const back = await tabName();
  check(`${tag} HBM-06 Shift-Tab on X goes to the last item`, back === wantTabs.at(-1), back);
  await page.keyboard.press("Escape");
  const esc = await page.evaluate(() => [document.querySelector('[data-testid="site-overlay"]').hidden, document.activeElement?.getAttribute("data-testid")]);
  check(`${tag} HBM-05 Esc closes, focus back on Menu`, esc[0] === true && esc[1] === "site-menu-open", esc);
  await menu.click();
  await page.getByTestId("site-menu-close").click();
  const x = await page.evaluate(() => [document.querySelector('[data-testid="site-overlay"]').hidden, document.activeElement?.getAttribute("data-testid")]);
  check(`${tag} HBM-05 X closes, focus back on Menu`, x[0] === true && x[1] === "site-menu-open", x);
  // CH14 / CH15 (#287 r3, 2026-11-02): cross 768 px with the menu open and focus in Search (390 <-> 1440, 767 <-> 768).
  const vp0 = page.viewportSize();
  for (const to of width < 768 ? [1440, 768] : [390, 767]) {
    await page.getByTestId("site-search-open").click();
    await page.waitForTimeout(150);
    await page.keyboard.type("vod");
    await page.setViewportSize({ width: to, height: vp0.height });
    await page.waitForTimeout(250);
    const rz = await page.evaluate(() => {
      const o = document.querySelector('[data-testid="site-overlay"]');
      const a = document.activeElement;
      return { inDialog: o.contains(a), search: a?.getAttribute("data-testid") === "site-search" && a.checkVisibility(), value: a?.value ?? null };
    });
    await page.keyboard.press("Tab");
    const tabIn = await page.evaluate(() => document.querySelector('[data-testid="site-overlay"]').contains(document.activeElement));
    check(`${tag} HBM-06 CH14/CH15 resize to ${to} with the menu open: focus on the displayed Search in the dialog, value kept, Tab stays inside`, rz.inDialog && rz.search && rz.value === "vod" && tabIn, { ...rz, tabIn });
    await page.keyboard.press("Escape");
    await page.setViewportSize(vp0);
    await page.waitForTimeout(150);
    await page.reload({ waitUntil: "networkidle" });
  }
  // #288 CLS (2026-11-02): scroll kept on open/close; Back to a same-document entry closes the menu (overflow cleared,
  // history length unchanged); the X's `Close` label is ≥ 44 px tall below 768 and not displayed from 768.
  {
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(100);
    const y0 = await page.evaluate(() => scrollY);
    await menu.click();
    await page.waitForTimeout(150);
    const lb = await page.evaluate(() => {
      const x = document.querySelector('[data-testid="site-menu-close"]');
      const l = x.querySelector('[data-testid="site-close-label"]');
      const shownLabel = !!l && l.checkVisibility();
      const bx = x.getBoundingClientRect();
      const lr = shownLabel ? l.getBoundingClientRect() : null;
      const logo = document.querySelector('[data-testid="site-overlay"] [aria-hidden="true"]').getBoundingClientRect();
      return { shown: shownLabel, text: shownLabel ? l.textContent : null, h: Math.round(bx.height), w: Math.round(bx.width), right: Math.round(innerWidth - bx.right), gapToLogo: lr ? Math.round(lr.left - logo.right) : null, name: x.getAttribute("aria-label") };
    });
    if (width < 768) check(`${tag} CLS-07 X shows \`Close\` in the same button, ≥ 44 px, no collision, name \`Close menu\``, lb.shown && lb.text === "Close" && lb.h >= 44 && lb.w >= 44 && lb.gapToLogo > 0 && lb.name === "Close menu", lb);
    else check(`${tag} CLS-07 from 768 the \`Close\` label is not displayed (X as #286)`, !lb.shown && lb.h === 44 && lb.w === 44, lb);
    await page.getByTestId("site-menu-close").click();
    const y1 = await page.evaluate(() => scrollY);
    check(`${tag} CLS-05 scroll position kept on open / close`, y1 === y0, [y0, y1]);
    const len0 = await page.evaluate(() => { history.pushState(history.state, "", location.pathname + "?cls=1"); return history.length; });
    await menu.click();
    await page.waitForTimeout(150);
    await page.goBack();
    await page.waitForTimeout(300);
    const pop = await page.evaluate(() => ({ hidden: document.querySelector('[data-testid="site-overlay"]').hidden, overflow: document.documentElement.style.overflow, len: history.length, url: location.pathname + location.search }));
    check(`${tag} CLS-03 Back to a same-document entry closes the menu, overflow cleared, history length unchanged`, pop.hidden && pop.overflow === "" && pop.len === len0, { ...pop, len0 });
  }
  if (navigate) {
    for (const [label, href] of want) {
      await page.goto(`${host}/calculator`, { waitUntil: "networkidle" });
      await page.getByTestId("site-menu-open").click();
      await page.locator('[data-testid="site-menu-links"] a', { hasText: label }).first().click();
      await page.waitForLoadState("networkidle");
      const u = new URL(page.url());
      const gated = who === "signed out" && href !== "/" && href !== "/calculator";
      const landed = gated ? u.pathname === "/dashboard/sign-in" && (u.searchParams.get("next") ?? "/dashboard") === href : u.pathname === href;
      const cur = await page.locator('nav[aria-label="Site"] [aria-current="page"]').allTextContents();
      const curWant = gated ? ["Dashboard"] : [label];
      check(`${tag} HBM-04 ${label} → ${gated ? `sign-in (next ${href})` : href}, one aria-current`, landed && JSON.stringify(cur) === JSON.stringify(curWant), [u.pathname + u.search, cur]);
    }
  }
  const after = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  check(`${tag} HBM-10 nothing stored (local/session storage unchanged)`, JSON.stringify(after) === JSON.stringify(storage), [storage, after]);
}
let hbmSkipped = false;

const browser = await chromium.launch();
try {
  info("viewports", SHELL_VIEWPORTS.map(([vp, v]) => `${vp} ${v.width}×${v.height}`));
  // Signed-out /dashboard: the server gate still answers 307 to sign-in.
  const r = await fetch(`${base}/dashboard`, { redirect: "manual" });
  check("signed-out /dashboard → 307 /dashboard/sign-in", r.status === 307 && /\/dashboard\/sign-in$/.test(r.headers.get("location") ?? ""), [r.status, r.headers.get("location")]);
  // #102: Personal Finance is signed-in only; signed out it redirects to sign-in and comes back after.
  const pf = await fetch(`${base}/personal-finance`, { redirect: "manual" });
  const pfTo = new URL(pf.headers.get("location") ?? "/x", base);
  check("signed-out /personal-finance → 307 /dashboard/sign-in?next=/personal-finance (#102)", pf.status === 307 && pfTo.pathname === "/dashboard/sign-in" && pfTo.searchParams.get("next") === "/personal-finance", [pf.status, pf.headers.get("location")]);
  // #90 (ROLE-02): /account signed out → sign-in with ?next=/account.
  const ac = await fetch(`${base}/account`, { redirect: "manual" });
  const acTo = new URL(ac.headers.get("location") ?? "/x", base);
  check("signed-out /account → 307 /dashboard/sign-in?next=/account (#90 ROLE-02)", ac.status === 307 && acTo.pathname === "/dashboard/sign-in" && acTo.searchParams.get("next") === "/account", [ac.status, ac.headers.get("location")]);
  // #160 (spec 45, PFCL-01): /personal-finance/charts signed out → sign-in with ?next=/personal-finance/charts, noindex.
  const ch = await fetch(`${base}/personal-finance/charts`, { redirect: "manual" });
  const chTo = new URL(ch.headers.get("location") ?? "/x", base);
  check("signed-out /personal-finance/charts → 307 /dashboard/sign-in?next=/personal-finance/charts, noindex (#160 PFCL-01)", ch.status === 307 && chTo.pathname === "/dashboard/sign-in" && chTo.searchParams.get("next") === "/personal-finance/charts" && /noindex/i.test(ch.headers.get("x-robots-tag") ?? ""), [ch.status, ch.headers.get("location"), ch.headers.get("x-robots-tag")]);
  // #214 (spec 53, PFHT-02): /personal-finance/history signed out → sign-in with ?next=/personal-finance/history, noindex.
  const hi = await fetch(`${base}/personal-finance/history`, { redirect: "manual" });
  const hiTo = new URL(hi.headers.get("location") ?? "/x", base);
  check("signed-out /personal-finance/history → 307 /dashboard/sign-in?next=/personal-finance/history, noindex (#214 PFHT-02)", hi.status === 307 && hiTo.pathname === "/dashboard/sign-in" && hiTo.searchParams.get("next") === "/personal-finance/history" && /noindex/i.test(hi.headers.get("x-robots-tag") ?? ""), [hi.status, hi.headers.get("location"), hi.headers.get("x-robots-tag")]);
  // #161 (spec 46, PFCB-01; EL O3): /new keeps its exact next; every edit URL (default included) returns to the list.
  for (const [path, next] of [["/personal-finance/charts/new", "/personal-finance/charts/new"], ["/personal-finance/charts/default/edit", "/personal-finance/charts"], ["/personal-finance/charts/r-0000abcd/edit", "/personal-finance/charts"], ["/personal-finance/charts/r-00000001", "/personal-finance/charts"], ["/personal-finance/charts/default", "/personal-finance/charts"]]) {
    const b = await fetch(`${base}${path}`, { redirect: "manual" });
    const bTo = new URL(b.headers.get("location") ?? "/x", base);
    check(`signed-out ${path} → 307 /dashboard/sign-in?next=${next}, noindex (#161 PFCB-01)`, b.status === 307 && bTo.pathname === "/dashboard/sign-in" && bTo.searchParams.get("next") === next && /noindex/i.test(b.headers.get("x-robots-tag") ?? ""), [b.status, b.headers.get("location"), b.headers.get("x-robots-tag")]);
  }
  // #90 D1 superseded by #286: the bar no longer holds the page links; at 399 / 400 px the three bar items sit on one
  // line with no horizontal scroll.
  for (const w of [399, 400]) {
    const pg = await browser.newPage({ viewport: { width: w, height: 800 } });
    await pg.goto(`${base}/`, { waitUntil: "networkidle" });
    await fontWait(pg, `[${w}] /`);
    const m = await pg.locator('nav[aria-label="Site"] [data-testid="site-bar"]').evaluate((b) => ({ ys: [...b.querySelectorAll("a, button")].map((a) => Math.round(a.getBoundingClientRect().top)), scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    check(`[${w}] #286 bar items on one line, no horizontal scroll`, new Set(m.ys).size === 1 && m.scroll <= 0, m);
    await pg.close();
  }
  await signedOut(browser, base, false);
  for (const w of HBM_WIDTHS) {
    const pg = await browser.newPage({ viewport: { width: w, height: 800 }, isMobile: w < 768, hasTouch: w < 768 });
    await hbm(pg, base, w, { navigate: w === 390 });
    await pg.close();
  }
  if (CFG.compareUrl) await signedOut(browser, CFG.compareUrl, true);

  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (!email || !password) {
    info("signed-in /dashboard and /personal-finance SKIPPED (QA_EMAIL / QA_PASSWORD not set in env)");
  } else {
    const hosts = CFG.compareUrl ? [[base, "base"], [CFG.compareUrl, "compare"]] : [[base, "base"]];
    for (const [host, which] of hosts) {
      await eachViewport({ browser, baseUrl: host, email, password, check: which === "base" ? check : () => {}, viewports: SHELL_VIEWPORTS }, async ({ vp, viewport, page }) => {
        await page.goto(`${host}/dashboard`, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
        await fontWait(page, `[${vp}] ${which} /dashboard`);
        const content = "body .flex-1 > .bg-paper";
        if (which === "base") {
          check(`[${vp}] /dashboard content visible (released)`, await page.locator('[data-testid="holdings-section"], [data-testid="holdings-empty"], [data-testid="holding-row"]').first().isVisible().catch(() => false));
          const panel = await page.locator(content).evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
          check(`[${vp}] /dashboard ST0-05 content panel as on main (white, ink)`, panel.bg === WHITE && panel.color === INK, panel);
          await shell(page, { vp, path: "/dashboard", want: "Dashboard", kind: "dashboard", viewport, owner: true });
          const file = join(CFG.out, `dashboard-${viewport.width}.png`);
          await page.screenshot({ path: file, fullPage: true });
          R.shots.push(file);
        }
        if (CFG.compareUrl) (R.panels[`${vp} /dashboard`] ??= {})[which] = await panelShot(page, content, `${vp}_dashboard-${which}`);
        if (which === "base") {
          // #97 / #102: Personal Finance, signed in (the page itself is personal-finance.mjs's).
          await page.goto(`${host}/personal-finance`, { waitUntil: "networkidle" });
          await page.waitForTimeout(300);
          await fontWait(page, `[${vp}] /personal-finance`);
          await shell(page, { vp, path: "/personal-finance", want: "Personal Finance", kind: "dark", viewport, owner: true });
          const file = join(CFG.out, `personal-finance-${viewport.width}.png`);
          await page.screenshot({ path: file, fullPage: true });
          R.shots.push(file);
        }
      });
    }
  }

  // #287 HBM signed in: the owner and the real Read user (session.mjs signs in; passwords never logged).
  const hbmViewports = HBM_WIDTHS.map((w) => [`${w}`, { width: w, height: 800 }, w < 768]);
  // CH13 (#287 r2): on prod (signed-out prod mode) eachViewport returns without running; say so loudly, exit 3.
  if (signedOutProd()) {
    hbmSkipped = true;
    console.log("SKIPPED (NOT A PASS): HBM-03/04 signed in (owner, read): signed-out prod mode never signs in");
  } else
  for (const [who, e, p, owner] of [["owner", "QA_EMAIL", "QA_PASSWORD", true], ["read", "QA_CFO_READ_EMAIL", "QA_CFO_READ_PASSWORD", false]]) {
    if (!process.env[e] || !process.env[p]) {
      hbmSkipped = true;
      console.log(`SKIPPED (NOT A PASS): HBM-03/04 signed in as ${who}: set ${e} / ${p} in env`);
      continue;
    }
    await eachViewport({ browser, baseUrl: base, email: process.env[e], password: process.env[p], check, viewports: hbmViewports }, async ({ viewport, page }) => {
      await hbm(page, base, viewport.width, { who, owner, navigate: viewport.width === 390 });
    });
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
process.exit(fails.length ? 1 : hbmSkipped || headerSkips() ? 3 : 0);
