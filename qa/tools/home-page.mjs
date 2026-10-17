// Home page (epic #66, #69; spec attachments/site-style-spec.md §8, ST3-01..07, plus ST0-01..03 and ST1-01 as they
// apply on `/`) in a real browser at 360 × 780, 400 × 860 (phone rules: below 1024 px), 1024 × 800 and 1440 × 900
// (wide: from 1024 px). Read-only, signed out, no form, no price requests.
//
//   ST3-01 the Jordaens band under the bar: alt names the painting, no visible credit (Q5); <picture> with AVIF +
//          WebP sources and a JPEG <img>, srcset + sizes, width / height on the img and every source; served from
//          the app; every hero file ≤ 300 KB and the file served at 1440 px, 2x ≤ 300 KB
//   ST3-01 layout shift as ST4-01: PerformanceObserver ('layout-shift', buffered), EVERY entry counted, a fresh
//          browser with the cache disabled per run, CLS_RUNS (default 3) cold loads per width, the last with the
//          hero files held back 1 s. Pass: CLS from the hero = 0 (band, image and wash still) and the page total
//          = 0 on every run (strict since #72's self-hosted font)
//   ST3-02 `01` and the exact h1 lower left in plain type (site font, 400, no caps / spacing / effects, chalk;
//          ≤ 32 px on a phone, ≤ 48 px wide); chalk on the wash ≥ 4.5:1 at the worst pixel; the wash (with its
//          soft shadow) and the text clear of the prince and the horses: their region from the crop's figure box
//          (data-figure-*), the object-fit / object-position maths and the img box; hero-<w>.png has both boxes
//          outlined; the figure ≥ 90% inside the band
//   ST3-05 the wash contains the 01 / title boxes (element + text rects), hugs them (≤ 12 px a side on a phone,
//          ≤ 24 px wide), lower left, ≤ 50% of the band at 360 / 400; the title three lines (font-independent box)
//   ST3-03 `02` `Platforms` and exactly the three lines (#97: Calculator, Dashboard, Personal Finance; name,
//          description, `Open` → href) word for word, full-width rows with a 1 px hair rule above and no box; nothing
//          else in <main>; no #46 line or cards; the `Open` links: chalk, underlined, a 2 px chalk focus ring,
//          and clicking the first lands on /calculator
//   ST3-04 no price requests, no form; `/?ticker=KO` → `/calculator?ticker=KO`; noindex meta + X-Robots-Tag
//   ST3-06 phone: name and `Open` on one row, the description under them; wide: one row per line; every text
//          whole; no horizontal page scroll; the bar's five items on one line (ST1-01 / ROLE-01, incl. 360)
//   ST3-07 / ST0-03 AA for every visible text (contrast scan; axe-core color-contrast too when AXE_PATH points
//          at axe.min.js, e.g. from a scratch `npm i axe-core`); color-scheme dark on <html> and <body>
//   ST0-01 charcoal page and chalk type; ST6-01 one painting, no CSS background-image
// Screenshots: home-<w>.png (full page), hero-<w>.png (boxes outlined).
//   node qa/tools/home-page.mjs --base-url <url> --out <dir>
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";

const CFG = qaConfig(import.meta.url);
// #157 F8 (EL option 1): the prod guard in every tool site-style-regression spawns (signed-out prod mode on prod).
await refuseIfProd(CFG.baseUrl, "home-page");
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
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const DIM = "rgb(168, 174, 180)";
const RULE = "rgb(139, 146, 152)";
const HAIR = "rgb(58, 63, 68)";
const TITLE = "Investment driven by research.";
const ALT = "Jacob Jordaens, Triumph of Frederick Henry, Prince of Orange (1652)";
const LINES = [
  ["Calculator", "Dollar-cost average calculator.", "Open", "/calculator"],
  ["Dashboard", "The portfolio as a business.", "Open", "/dashboard"],
  ["Personal Finance", "Income, expenses, and the cover.", "Open", "/personal-finance"],
];
const MAX_BYTES = 300 * 1024;
const RUNS = Number(process.env.CLS_RUNS ?? 3); // cold loads per width for ST3-01
const lum = ([r, g, b]) => {
  const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const rgb = (s) => (/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/.exec(s) ?? []).slice(1).map(Number);
const inside = (a, b, tol = 0.5) => a.left >= b.left - tol && a.top >= b.top - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol;
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

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
      if (!el || el.closest("script, style, noscript, [aria-hidden=true], .sr-only, [data-testid=hero-wash]")) continue;
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

// The lightest pixel of a PNG (decoded in a canvas), as [r, g, b].
async function lightest(browser, png) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/png;base64,${b64}`; });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      let best = [0, 0, 0];
      let bl = -1;
      for (let i = 0; i < d.length; i += 4) {
        const l = 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]);
        if (l > bl) { bl = l; best = [d[i], d[i + 1], d[i + 2]]; }
      }
      return best;
    }, png.toString("base64"));
  } finally {
    await page.close();
  }
}

async function heroGeometry(page) {
  return page.evaluate(() => {
    const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const hero = document.querySelector("[data-testid=home-hero]");
    const img = hero.querySelector("img");
    const wash = hero.querySelector("[data-testid=hero-wash]");
    const crop = /-wide-/.test(img.currentSrc) ? "wide" : "phone";
    const f = img.dataset[crop === "wide" ? "figureWide" : "figurePhone"].split(",").map(Number);
    const ir = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const scale = Math.max(ir.width / img.naturalWidth, ir.height / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const [px, py] = cs.objectPosition.split(" ").map((v) => parseFloat(v) / 100);
    const ox = ir.left + (ir.width - dw) * px;
    const oy = ir.top + (ir.height - dh) * py;
    const full = { left: ox + f[0] * dw, top: oy + f[1] * dh, right: ox + f[2] * dw, bottom: oy + f[3] * dh };
    const figure = { left: Math.max(full.left, ir.left), top: Math.max(full.top, ir.top), right: Math.min(full.right, ir.right), bottom: Math.min(full.bottom, ir.bottom) };
    const area = (b) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
    const shadow = getComputedStyle(wash).boxShadow;
    const nums = (shadow.match(/(-?[\d.]+)px/g) ?? []).map((v) => parseFloat(v));
    const ext = nums.length >= 4 ? Math.abs(nums[2]) + Math.abs(nums[3]) : 0;
    const wr = wash.getBoundingClientRect();
    const textRects = [...wash.querySelectorAll("p, h1")].flatMap((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return [box(el.getBoundingClientRect()), ...[...range.getClientRects()].map(box)];
    });
    const numeral = wash.querySelector("p");
    const h1 = wash.querySelector("h1");
    const style = (el) => { const s = getComputedStyle(el); return { family: s.fontFamily, weight: s.fontWeight, size: parseFloat(s.fontSize), transform: s.textTransform, spacing: s.letterSpacing, shadow: s.textShadow, color: s.color }; };
    return {
      crop,
      src: img.currentSrc,
      complete: img.complete && img.naturalWidth > 0,
      alt: img.alt,
      img: box(ir),
      hero: box(hero.getBoundingClientRect()),
      bar: box(document.querySelector('nav[aria-label="Site"]').getBoundingClientRect()),
      figure,
      figureShare: area(figure) / Math.max(1, area(full)),
      wash: box(wr),
      washOuter: { left: wr.left - ext, top: wr.top - ext, right: wr.right + ext, bottom: wr.bottom + ext },
      shadowExtent: ext,
      textRects,
      textBoxes: [...wash.querySelectorAll("p, h1")].map((el) => box(el.getBoundingClientRect())),
      numeral: { text: numeral.textContent, ...style(numeral) },
      h1: { text: h1.textContent, count: document.querySelectorAll("h1").length, ...style(h1) },
      h1Lines: (() => { const r = document.createRange(); r.selectNodeContents(h1); return [...r.getClientRects()].filter((x) => x.width > 1).map((x) => x.top); })(),
      sources: [...hero.querySelectorAll("picture source")].map((s) => ({ type: s.type, media: s.media, srcset: s.srcset, sizes: s.sizes, width: s.getAttribute("width"), height: s.getAttribute("height") })),
      imgAttrs: { srcset: img.srcset, sizes: img.sizes, width: img.getAttribute("width"), height: img.getAttribute("height"), src: img.getAttribute("src") },
    };
  });
}


async function heroChecks(browser, page, tag, mobile) {
  const g = await heroGeometry(page);
  check(`${tag} ST3-01 the band sits under the bar, full width`, Math.abs(g.hero.top - g.bar.bottom) <= 1 && Math.abs(g.hero.left) <= 0.5 && g.img.width >= g.hero.width - 1, { hero: g.hero, bar: g.bar.bottom });
  check(`${tag} ST3-01 alt names the painting`, g.alt === ALT, g.alt);
  check(`${tag} ST3-01 image loaded from the app (${g.crop} crop, want ${mobile ? "phone" : "wide"})`, g.complete && g.crop === (mobile ? "phone" : "wide") && new URL(g.src).origin === new URL(base).origin && /\/hero\/frederick-(phone|wide)-\d+\.(avif|webp|jpg)$/.test(new URL(g.src).pathname), g.src);
  const types = g.sources.map((s) => s.type);
  check(`${tag} ST3-01 <picture>: AVIF + WebP sources, JPEG fallback img, srcset + sizes`, types.includes("image/avif") && types.includes("image/webp") && /\.jpg/.test(g.imgAttrs.src) && g.sources.every((s) => s.srcset && s.sizes) && /\d+w/.test(g.imgAttrs.srcset), types);
  check(`${tag} ST3-01 explicit width and height on the img and every source`, [g.imgAttrs, ...g.sources].every((s) => Number(s.width) > 0 && Number(s.height) > 0), [g.imgAttrs, ...g.sources].map((s) => `${s.width}×${s.height}`));
  check(`${tag} ST3-02 "01" and the exact title, one h1`, g.numeral.text === "01" && g.h1.text === TITLE && g.h1.count === 1, [g.numeral.text, g.h1.text, g.h1.count]);
  const plain = (s) => /Schibsted Grotesk/.test(s.family) && s.weight === "400" && s.transform === "none" && (s.spacing === "normal" || s.spacing === "0px") && s.shadow === "none" && s.color === CHALK;
  check(`${tag} ST3-02 plain type (site font, 400, no caps / spacing / effects, chalk)`, plain(g.numeral) && plain(g.h1), { numeral: g.numeral, h1: g.h1 });
  const want = mobile ? 16 : page.viewportSize().width >= 1280 ? 44 : 40;
  check(`${tag} ST3-02 title ${want} px (≤ ${mobile ? 32 : 48}); 01 12 px`, g.h1.size === want && g.h1.size <= (mobile ? 32 : 48) && g.numeral.size === 12, [g.h1.size, g.numeral.size]);
  const lines = new Set(g.h1Lines.map((t) => Math.round(t))).size;
  check(`${tag} ST3-05 the title is three lines (Investment / driven by / research.)`, lines === 3, g.h1Lines);
  check(`${tag} ST3-02 lower left: wash in the left half, ≤ 32 px from the band's bottom`, g.wash.left < g.hero.width / 2 && g.wash.right < g.hero.width * 0.5 && g.hero.bottom - g.wash.bottom <= 32 && g.hero.bottom - g.wash.bottom >= 0, { wash: g.wash, heroBottom: g.hero.bottom });
  check(`${tag} ST3-05 the wash contains the 01 and title boxes`, g.textRects.every((r) => inside(r, g.wash)), { wash: g.wash, texts: g.textRects.length });
  const u = g.textBoxes.reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
  const pad = [u.top - g.wash.top, g.wash.right - u.right, g.wash.bottom - u.bottom, u.left - g.wash.left].map((v) => Math.round(v * 10) / 10);
  const maxPad = mobile ? 12 : 24;
  check(`${tag} ST3-05 the wash hugs the text: padding ≤ ${maxPad} px a side (top, right, bottom, left)`, pad.every((v) => v >= 0 && v <= maxPad), { padding: pad });
  if (mobile) {
    const share = g.wash.height / g.hero.height;
    check(`${tag} ST3-05 wash ≤ 50% of the band height (${Math.round(g.wash.height * 10) / 10} of ${g.hero.height} px)`, share <= 0.5, { wash: g.wash.height, band: g.hero.height, share: Math.round(share * 1000) / 1000 });
  }
  R.hero ??= {};
  R.hero[page.viewportSize().width] = { band: g.hero.height, wash: g.wash, washOuterRight: g.washOuter.right, figure: g.figure, gap: g.figure.left - g.washOuter.right };
  const hit = overlap(g.washOuter, g.figure) + g.textRects.reduce((s, r) => s + overlap(r, g.figure), 0);
  check(`${tag} ST3-02 01 / title / wash (incl. ${g.shadowExtent} px shadow) clear of the prince and the horses (gap ${Math.round((g.figure.left - g.washOuter.right) * 10) / 10} px)`, hit === 0, { washOuterRight: Math.round(g.washOuter.right * 10) / 10, figureLeft: Math.round(g.figure.left * 10) / 10, figure: g.figure });
  check(`${tag} ST3-02 the prince and the horses visible (≥ 90% of their box inside the band)`, g.figureShare >= 0.9, Math.round(g.figureShare * 100) / 100);
  if (mobile) check(`${tag} ST3-06 phone band min(66.667vw, 480px)`, Math.abs(g.hero.height - Math.min(page.viewportSize().width * 0.66667, 480)) <= 1, g.hero.height);
  else check(`${tag} ST3-06 wide band at the crop's 2.4:1 (≤ 600 px)`, Math.abs(g.hero.height - Math.min((page.viewportSize().width * 1529) / 3670, 600)) <= 1, g.hero.height);
  // Worst-pixel contrast of chalk on the wash: the wash alone (text transparent), its lightest pixel.
  const css = await page.addStyleTag({ content: "[data-testid=hero-wash] * { color: transparent !important; }" });
  const wb = await page.locator("[data-testid=hero-wash]").boundingBox();
  const png = await page.screenshot({ clip: { x: Math.ceil(wb.x) + 1, y: Math.ceil(wb.y) + 1, width: Math.floor(wb.width) - 3, height: Math.floor(wb.height) - 3 } });
  await css.evaluate((n) => n.remove());
  const worst = await lightest(browser, png);
  const r = ratio(rgb(CHALK), worst);
  check(`${tag} ST3-02 chalk on the wash ≥ 4.5:1 at the worst pixel`, r >= 4.5, { worst, ratio: r });
  await page.evaluate(({ v, w }) => {
    for (const [b, c] of [[v, "#ff3b30"], [w, "#00e5ff"]]) {
      const d = document.createElement("div");
      d.className = "qa-box";
      Object.assign(d.style, { position: "fixed", left: `${b.left}px`, top: `${b.top}px`, width: `${b.right - b.left}px`, height: `${b.bottom - b.top}px`, outline: `2px dashed ${c}`, zIndex: 99, pointerEvents: "none" });
      document.body.appendChild(d);
    }
  }, { v: g.figure, w: g.washOuter });
  const file = join(CFG.out, `hero-${page.viewportSize().width}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.ceil(g.hero.bottom + 4) } });
  R.shots.push(file);
  await page.evaluate(() => document.querySelectorAll(".qa-box").forEach((d) => d.remove()));
}

async function pageChecks(page, tag, mobile, viewport) {
  const p = await page.evaluate(() => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const main = document.querySelector("main");
    const sec = main.querySelector("[data-testid=platforms]");
    const lines = [...main.querySelectorAll("[data-testid=platform-line]")].map((l) => {
      const name = l.querySelector("h3");
      const text = l.querySelector("p");
      const a = l.querySelector("a");
      const s = getComputedStyle(a);
      const tr = document.createRange();
      tr.selectNodeContents(text);
      return {
        values: [name.textContent, text.textContent, a.textContent, a.getAttribute("href")],
        links: l.querySelectorAll("a").length,
        name: box(name), text: box(text), open: box(a), line: box(l),
        textRight: tr.getBoundingClientRect().right,
        sizes: [getComputedStyle(name).fontSize, getComputedStyle(text).fontSize, s.fontSize],
        colors: [getComputedStyle(name).color, getComputedStyle(text).color, s.color],
        deco: `${s.textDecorationLine} ${s.textDecorationColor}`,
        describedBy: a.getAttribute("aria-describedby") === name.id,
        frame: (() => {
          const c = getComputedStyle(l);
          return { top: `${c.borderTopWidth} ${c.borderTopColor}`, others: [c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth], bg: c.backgroundColor, shadow: c.boxShadow, radius: c.borderRadius };
        })(),
      };
    });
    const html = document.documentElement;
    return {
      numeral: sec.querySelector("p").textContent,
      heading: sec.querySelector("h2").textContent,
      numeralStyle: [getComputedStyle(sec.querySelector("p")).fontSize, getComputedStyle(sec.querySelector("p")).color],
      headingStyle: [getComputedStyle(sec.querySelector("h2")).fontSize, getComputedStyle(sec.querySelector("h2")).color],
      mainChildren: main.children.length,
      listWidth: Math.round(sec.querySelector("ul").getBoundingClientRect().width),
      mainText: main.innerText.replace(/\s+/g, " ").trim(),
      lines,
      cards: document.querySelectorAll("[data-testid=home-card]").length,
      forms: document.querySelectorAll("form, input, select, button:not(nav button)").length,
      imgs: document.querySelectorAll("body img").length,
      bgImages: [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).backgroundImage !== "none").map((e) => e.tagName),
      scroll: [document.scrollingElement.scrollWidth, window.innerWidth],
      scheme: [getComputedStyle(html).colorScheme, getComputedStyle(document.body).colorScheme],
      body: [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color],
      credit: /wikimedia|wikipedia|public domain|courtesy|rkd|jordaens|huis ten bosch/i.test(document.body.innerText),
      robots: document.querySelector('meta[name="robots"]')?.content,
      bar: [...document.querySelectorAll('nav[aria-label="Site"] a')].map((a) => Math.round(a.getBoundingClientRect().top)),
    };
  });
  check(`${tag} ST0-01 charcoal page, chalk type; ST3-07 color-scheme dark on <html> and <body>`, p.body[0] === NIGHT && p.body[1] === CHALK && p.scheme.every((s) => s === "dark"), { body: p.body, scheme: p.scheme });
  check(`${tag} ST3-03 "02" "Platforms" (12 px dim; 24 px chalk)`, p.numeral === "02" && p.heading === "Platforms" && p.numeralStyle[0] === "12px" && p.numeralStyle[1] === DIM && p.headingStyle[0] === "24px" && p.headingStyle[1] === CHALK, [p.numeral, p.heading, p.numeralStyle, p.headingStyle]);
  check(`${tag} ST3-03 (#97) three full-width rows, a 1 px hair rule above each, no boxes (no other border, background, shadow, radius)`, p.lines.length === 3 && p.lines.every((l) => Math.abs(l.line.width - p.listWidth) <= 1 && l.frame.top === `1px ${HAIR}` && l.frame.others.every((w) => w === "0px") && l.frame.bg === "rgba(0, 0, 0, 0)" && l.frame.shadow === "none" && l.frame.radius === "0px"), p.lines.map((l) => ({ w: Math.round(l.line.width), list: p.listWidth, ...l.frame })));
  check(`${tag} ST3-03 exactly the three lines, word for word, one Open link each (aria-describedby = the name)`, JSON.stringify(p.lines.map((l) => l.values)) === JSON.stringify(LINES) && p.lines.every((l) => l.links === 1 && l.describedBy), p.lines.map((l) => l.values));
  const wantText = `02 Platforms ${LINES.map((l) => l.slice(0, 3).join(" ")).join(" ")}`;
  check(`${tag} ST3-03 nothing else in <main> (no #46 line, no cards)`, p.mainChildren === 1 && p.mainText === wantText && p.cards === 0 && !/private desk/.test(p.mainText), p.mainText);
  check(`${tag} ST3-03 line sizes / colours: name 20 px chalk, description 14 px dim, Open 14 px chalk underlined (rule)`, p.lines.every((l) => JSON.stringify(l.sizes) === JSON.stringify(["20px", "14px", "14px"]) && JSON.stringify(l.colors) === JSON.stringify([CHALK, DIM, CHALK]) && l.deco === `underline ${RULE}`), p.lines.map((l) => [l.sizes, l.colors, l.deco]));
  if (mobile) {
    check(`${tag} ST3-06 phone: name and Open on one row, the description under them, inside the line`, p.lines.every((l) => Math.abs(l.open.bottom - l.name.bottom) <= 6 && l.open.left > l.name.left && l.text.top >= l.name.bottom - 0.5 && l.textRight <= l.line.right + 0.5 && Math.abs(l.open.right - l.line.right) <= 1), p.lines.map((l) => ({ name: l.name, open: l.open, text: l.text })));
  } else {
    check(`${tag} ST3-06 wide: one row per line (name, description, Open left to right)`, p.lines.every((l) => l.name.right <= l.text.left && l.text.right <= l.open.left && Math.abs(l.text.top - l.name.top) <= 8 && Math.abs(l.open.right - l.line.right) <= 1), p.lines.map((l) => ({ name: l.name, text: l.text, open: l.open })));
  }
  check(`${tag} ST3-04 no form, no fields, no calculator UI`, p.forms === 0, p.forms);
  check(`${tag} ST3-01 (Q5) no visible credit for the painting`, !p.credit);
  check(`${tag} ST6-01 one painting (the hero img), no CSS background-image`, p.imgs === 1 && p.bgImages.length === 0, { imgs: p.imgs, bg: p.bgImages });
  check(`${tag} ST3-06 no horizontal page scroll`, p.scroll[0] <= p.scroll[1], p.scroll);
  check(`${tag} ST1-01 the bar fits on one line (${viewport.width} px)`, Math.max(...p.bar) - Math.min(...p.bar) <= 2 && p.bar.length === 5, p.bar);
  check(`${tag} ST3-04 noindex meta`, p.robots === "noindex, nofollow", p.robots);
  // Focus ring on the three Open links: Tab from the bar's last item.
  await page.locator('nav[aria-label="Site"] a').last().focus();
  const rings = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a?.matches?.("[data-testid=platform-open]")) return null;
      const s = getComputedStyle(a);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`;
    });
    if (r) rings.push(r);
  }
  check(`${tag} ST3-07 all three Open links take focus with a 2 px chalk ring (offset 2 px)`, rings.length === 3 && rings.every((r) => r === `solid 2px ${CHALK} 2px`), rings);
  await page.evaluate(() => document.activeElement?.blur());
  const scan = await contrastScan(page);
  check(`${tag} ST3-07 / ST0-03 AA contrast for every visible text`, scan.bad.length === 0, scan.bad.length ? scan.bad : { texts: scan.n });
  if (AXE) {
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length })));
    check(`${tag} ST3-07 axe-core color-contrast: no violation`, v.length === 0, v);
  }
}

let AXE = null;
if (process.env.AXE_PATH) AXE = readFileSync(process.env.AXE_PATH, "utf8");
else console.log("INFO axe-core not run (set AXE_PATH to axe.min.js); the contrast scan covers ST3-07");

const browser = await chromium.launch();
try {
  // ST3-01: every hero file ≤ 300 KB; and the file a 1440 px, 2x screen is served.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const res = await page.goto(`${base}/`, { waitUntil: "networkidle" });
    check(`ST3-04 X-Robots-Tag: noindex, nofollow on /`, /noindex/i.test(res.headers()["x-robots-tag"] ?? ""), res.headers()["x-robots-tag"]);
    const files = await page.evaluate(() => {
      const hero = document.querySelector("[data-testid=home-hero]");
      const urls = new Set();
      for (const el of hero.querySelectorAll("source, img")) for (const part of (el.getAttribute("srcset") ?? "").split(",")) if (part.trim()) urls.add(new URL(part.trim().split(/\s+/)[0], location.href).href);
      urls.add(hero.querySelector("img").src);
      return { urls: [...urls], current: hero.querySelector("img").currentSrc };
    });
    const sizes = {};
    for (const u of files.urls) {
      const r = await page.request.get(u);
      sizes[new URL(u).pathname] = { status: r.status(), bytes: (await r.body()).length, type: r.headers()["content-type"] };
    }
    const big = Object.entries(sizes).filter(([, s]) => s.status !== 200 || s.bytes > MAX_BYTES);
    check(`ST3-01 every hero file 200 and ≤ 300 KB (${Object.keys(sizes).length} files)`, big.length === 0 && Object.keys(sizes).length === 19, big.length ? big : Object.fromEntries(Object.entries(sizes).map(([k, s]) => [k.replace("/hero/", ""), Math.round(s.bytes / 1024)])));
    const cur = sizes[new URL(files.current).pathname];
    check(`ST3-01 the file served at 1440 px, 2x ≤ 300 KB`, cur && cur.bytes <= MAX_BYTES && /frederick-wide-2880\.avif$/.test(files.current), { file: new URL(files.current).pathname, kb: cur && Math.round(cur.bytes / 1024), type: cur?.type });
    R.heroFiles = sizes;
    // ST3-04: /?query → /calculator?query; home makes no price request; the first Open lands on /calculator.
    const r = await page.request.get(`${base}/?ticker=KO`, { maxRedirects: 0 });
    check(`ST3-04 /?ticker=KO redirects to /calculator?ticker=KO`, [301, 302, 307, 308].includes(r.status()) && /\/calculator\?ticker=KO$/.test(r.headers()["location"] ?? ""), [r.status(), r.headers()["location"]]);
    await page.close();
  }

  for (const [vp, viewport, mobile] of VIEWPORTS) {
    const tag = `[${vp}]`;
    const scale = mobile ? 2 : 1;
    {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        const slow = i === RUNS - 1;
        // A fresh browser per run: nothing (HTTP cache, in-memory web-font cache) survives from an earlier load.
        const fresh = await chromium.launch();
        const ctx = await fresh.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: scale });
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        if (slow) await page.route("**/hero/**", async (route) => { await new Promise((r) => setTimeout(r, 1000)); await route.continue(); });
        await page.addInitScript(() => {
          window.__shifts = [];
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              const sources = (e.sources ?? []).map((s) => {
                const el = s.node ? (s.node.nodeType === 1 ? s.node : s.node.parentElement) : null;
                return {
                  node: s.node ? (s.node.nodeType === 3 ? "#text" : s.node.nodeName || "(anonymous)") : null,
                  inHero: !!el?.closest?.("[data-testid=home-hero]"),
                  text: (s.node?.textContent ?? "").slice(0, 30),
                  from: s.previousRect && [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round),
                  to: s.currentRect && [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round),
                };
              });
              window.__shifts.push({ value: e.value, at: Math.round(e.startTime), hadRecentInput: e.hadRecentInput, hero: sources.some((x) => x.inHero), sources });
            }
          }).observe({ type: "layout-shift", buffered: true });
          document.addEventListener("DOMContentLoaded", () => {
            const h = document.querySelector("[data-testid=home-hero]");
            window.__boxes = h && [h, h.querySelector("img"), h.querySelector("[data-testid=hero-wash]")].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(","); });
            window.__fonts = document.fonts.status;
          });
        });
        await page.goto(`${base}/`, { waitUntil: "load" });
        await page.waitForTimeout(2000);
        const m = await page.evaluate(() => {
          const h = document.querySelector("[data-testid=home-hero]");
          const late = [h, h.querySelector("img"), h.querySelector("[data-testid=hero-wash]")].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(","); });
          return { shifts: window.__shifts, fontsAtDomReady: window.__fonts, still: JSON.stringify(late) === JSON.stringify(window.__boxes), loaded: h.querySelector("img").complete, fontsNow: document.fonts.status };
        });
        const total = m.shifts.reduce((a, e) => a + e.value, 0);
        const hero = m.shifts.filter((e) => e.hero).reduce((a, e) => a + e.value, 0);
        runs.push({ run: i + 1, slowHero: slow, total, hero, still: m.still, loaded: m.loaded, fontsAtDomReady: m.fontsAtDomReady, fontsNow: m.fontsNow, shifts: m.shifts });
        await fresh.close();
      }
      const r5 = (v) => Math.round(v * 1e5) / 1e5;
      check(`${tag} ST3-01 CLS from the hero = 0 on ${RUNS} cold loads (all shifts counted; band, image and wash still)`, runs.every((x) => x.hero === 0 && x.still && x.loaded), runs.map((x) => ({ run: x.run, hero: x.hero, still: x.still, slowHero: x.slowHero })));
      check(`${tag} ST3-01 page CLS = 0 (strict, #72) on ${RUNS} cold loads, all shifts counted (max ${r5(Math.max(...runs.map((x) => x.total)))})`, runs.every((x) => x.total === 0), runs.map((x) => r5(x.total)));
      R.cls ??= {};
      R.cls[vp] = { width: viewport.width, hero: runs.map((x) => x.hero), total: runs.map((x) => x.total), runs };
      console.log(`INFO ${tag} CLS cold × ${RUNS} (all shifts): page ${JSON.stringify(runs.map((x) => r5(x.total)))} · hero ${JSON.stringify(runs.map((x) => x.hero))} · fonts at DOM ready ${JSON.stringify(runs.map((x) => x.fontsAtDomReady))} · sources ${JSON.stringify([...new Set(runs.flatMap((x) => x.shifts.flatMap((e) => e.sources.map((s) => `${s.node} "${s.text}" ${JSON.stringify(s.from)}→${JSON.stringify(s.to)}`))))])}`);
    }
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: scale });
    page.setDefaultTimeout(30000);
    const api = [];
    page.on("request", (req) => { if (req.url().includes("/api/")) api.push(req.url()); });
    try {
      const res = await page.goto(`${base}/`, { waitUntil: "networkidle" });
      check(`${tag} / 200`, res?.status() === 200, res?.status());
      await heroChecks(browser, page, tag, mobile);
      const shot = join(CFG.out, `home-${viewport.width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      R.shots.push(shot);
      await pageChecks(page, tag, mobile, viewport);
      check(`${tag} ST3-04 no price requests (no /api/ call)`, api.length === 0, api);
      await page.locator("[data-testid=platform-open]").first().click();
      await page.waitForURL(/\/calculator$/);
      check(`${tag} ST3-03 the Calculator line's Open lands on /calculator`, new URL(page.url()).pathname === "/calculator");
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      await page.close().catch(() => {});
    }
  }
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "home-page.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
