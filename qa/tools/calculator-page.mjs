// Calculator page (epic #66, #70; spec attachments/site-style-spec.md §7 / §7a, ST4-01..16, plus ST0 / ST6 as
// they apply) in a real browser at 360 × 780, 400 × 860 (phone rules: below 1024 px), 1024 × 800 and 1440 × 900
// (wide layout: from 1024 px). Read-only, signed out; the only network writes are the calculator's own
// GET /api/chart requests for the $313,000 regression case.
//
// Before a run, per width:
//   ST4-01 Botticelli band under the bar: alt names the painting; <picture> with AVIF + WebP sources and a JPEG
//          <img>, srcset + sizes, width / height on the img and every source; served from the app; every hero
//          file ≤ 300 KB and the file served at 1440 px, 2x (DPR 2) ≤ 300 KB
//   ST4-01 layout shift (QA round 1, D1): a PerformanceObserver ('layout-shift', buffered) from before the first
//          paint until 2 s after load, counting EVERY entry (no hadRecentInput exclusion: Playwright's isMobile /
//          hasTouch emulation tags load-time shifts as recent input). Cold loads only: a fresh context each time
//          with the cache disabled (CDP), CLS_RUNS (default 3) times per width, the last one with the hero files
//          held back 1 s. Pass: CLS from the hero = 0 (no entry with a source inside the band; band, image and
//          wash still) and the page total < 0.001 on every run. A strict page 0 is #72 (self-hosted fonts; Q16)
//   ST4-02 `01` and the exact h1 lower left in plain type (site font, weight 400, no caps, no letter-spacing,
//          no text effects; h1 ≤ 32 px on a phone, ≤ 48 px wide); chalk on the wash ≥ 4.5:1 at the worst pixel
//          (the wash screenshotted with the text made transparent, the lightest pixel measured)
//   ST4-15 (new, EL A4) the wash box contains the bounding boxes of `01` and the title (element + text rects)
//   ST4-15 (N4, QA round 1) the wash hugs the text (≤ 12 px of padding a side on a phone, ≤ 24 px wide),
//          anchored lower left, and is at most 50% of the band's height at 360 and 400
//   ST4-14 (new, EL A3) the wash (with its soft shadow) and the text do not overlap Venus: her region comes from
//          the crop's figure box (data-figure-*), the object-fit / object-position maths and the img box; a
//          screenshot with both boxes outlined is saved (hero-<width>.png)
//   ST4-11 phone: the band ≤ 200 px tall, Venus at least 90% inside it
//   ST4-03 every field (tickers, weights, start, end, starting capital, contribution, frequency): calculator
//          class, no box border, no fill, no radius, 1 px rule (#8b9298) underline, visible label, a 2 px chalk
//          focus ring; ST4-16 the primary button: chalk fill, night text, no radius, chalk focus ring
//   ST4-04 the listings note: exact text, 13 px, dim, one line (no wrap, not clipped) directly under the form
//   ST0-01 / ST4-03 (D2, QA round 1) color-scheme dark on <html> and <body>; the select and every <option>:
//          charcoal background, chalk text, ≥ 4.5:1 (the list Chrome opens uses them); date inputs dark scheme
//   ST4-07 / ST6-02 no instruction text (intro, swipe hint, scale note, field hints); ST6-01 one image, no CSS
//          background-image on the page
//   ST4-08 phone: the fields stack, full width, the ticker above its weight with the remove control beside it
//   Q8 an empty submit shows the error in #ff8f87
//   AA for every visible text against its background; no horizontal page scroll; the bar on one line
// After the regression run (PLTR 50 / TQQQ 50, 2020-10-02..2026-10-01, 1,000 + 1,000 weekly):
//   ST4-05 one chart, one series (one area, no line series), green line, 16% green fill, the last value in a
//          22 px green pill (night text) equal to the DCA "NLV at end" value, unclipped
//   ST4-06 eight metrics, captions word for word, `Lump sum` / `DCA` label-value rows, no <table>, no boxes or
//          borders; DCA Total invested $313,000; captions: "Dividends reinvested.", then the fixed method sentence
//          word for word (EL N1), then only run-specific lines
//   ST4-09 phone: the chart spans the content column (same edges as the form)
//   ST4-10 two columns while each column is ≥ 150 px, else stacked (Lump sum above DCA); every value on one
//          line inside its column (expected: two columns at 360 and 400); (D3, QA round 1) every label-value
//          row's main line is one line: the value's figure on the label's line, never wrapped under it (a date
//          sits on its own muted line inside the value cell)
//   ST4-12 wide: form left, results right; no horizontal scroll at any width
// Screenshots: calculator-<w>.png (before), calculator-<w>-result.png (after), hero-<w>.png (boxes outlined).
//   node qa/tools/calculator-page.mjs --base-url <url> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
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
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const DIM = "rgb(168, 174, 180)";
const RULE = "rgb(139, 146, 152)";
const GREEN = "rgb(92, 192, 138)";
const ALERT = "rgb(255, 143, 135)";
const TITLE = "Dollar-cost average calculator.";
const ALT = "Sandro Botticelli, The Birth of Venus";
const NOTE = "US, EU and CA listings, one currency per basket.";
const LABELS = [
  "Total invested",
  "NLV at end",
  "Money-weighted return (XIRR, per year)",
  "Total return",
  "CAGR on total invested, as if all invested day one",
  "Max drop",
  "NLV at that drop",
  "Return to the drop",
];
const CASE = { rows: [["PLTR", 50], ["TQQQ", 50]], start: "2020-10-02", end: "2026-10-01", capital: 1000, contribution: 1000, frequency: "weekly" };
const MAX_BYTES = 300 * 1024;
const RUNS = Number(process.env.CLS_RUNS ?? 3); // cold loads per width for ST4-01
const METHOD = "Prices are raw daily closes. Lump sum starts on the first session every name has a price. A contribution date with no session goes in at the next session's close.";
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

// Hero geometry in the page: the img box, the active crop, Venus's region on screen, the wash and text boxes.
async function heroGeometry(page) {
  return page.evaluate(() => {
    const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const hero = document.querySelector("[data-testid=calculator-hero]");
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
    const venus = { left: Math.max(full.left, ir.left), top: Math.max(full.top, ir.top), right: Math.min(full.right, ir.right), bottom: Math.min(full.bottom, ir.bottom) };
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
      venus,
      venusShare: area(venus) / Math.max(1, area(full)),
      wash: box(wr),
      washOuter: { left: wr.left - ext, top: wr.top - ext, right: wr.right + ext, bottom: wr.bottom + ext },
      shadowExtent: ext,
      textRects,
      textBoxes: [...wash.querySelectorAll("p, h1")].map((el) => box(el.getBoundingClientRect())),
      numeral: { text: numeral.textContent, ...style(numeral) },
      h1: { text: h1.textContent, count: document.querySelectorAll("h1").length, ...style(h1) },
      sources: [...hero.querySelectorAll("picture source")].map((s) => ({ type: s.type, media: s.media, srcset: s.srcset, sizes: s.sizes, width: s.getAttribute("width"), height: s.getAttribute("height") })),
      imgAttrs: { srcset: img.srcset, sizes: img.sizes, width: img.getAttribute("width"), height: img.getAttribute("height"), src: img.getAttribute("src") },
    };
  });
}

async function fill(page, { rows, start, end, capital, contribution, frequency }) {
  for (let i = 1; i < rows.length; i++) await page.getByRole("button", { name: /Add name/ }).click();
  for (let i = 0; i < rows.length; i++) {
    const r = page.locator('[data-testid="basket-row"]').nth(i).locator("input");
    await r.nth(0).fill(rows[i][0]);
    await r.nth(1).fill(String(rows[i][1]));
  }
  const d = page.locator("input[type=date]");
  await d.nth(0).fill(start);
  await d.nth(1).fill(end);
  await page.locator('label:has-text("Starting capital") input').fill(String(capital));
  await page.locator('label:has-text("Contribution") input').fill(String(contribution));
  await page.locator("select").selectOption(frequency);
  await page.getByRole("button", { name: "Compare plans" }).click();
}

async function heroChecks(browser, page, tag, mobile) {
  const g = await heroGeometry(page);
  check(`${tag} ST4-01 the band sits under the bar, full width`, Math.abs(g.hero.top - g.bar.bottom) <= 1 && Math.abs(g.hero.left) <= 0.5 && g.img.width >= g.hero.width - 1, { hero: g.hero, bar: g.bar.bottom });
  check(`${tag} ST4-01 alt names the painting`, g.alt === ALT, g.alt);
  check(`${tag} ST4-01 image loaded from the app (${g.crop} crop)`, g.complete && new URL(g.src).origin === new URL(base).origin && /\/hero\/venus-(phone|wide)-\d+\.(avif|webp|jpg)$/.test(new URL(g.src).pathname), g.src);
  const types = g.sources.map((s) => s.type);
  check(`${tag} ST4-01 <picture>: AVIF + WebP sources, JPEG fallback img, srcset + sizes`, types.includes("image/avif") && types.includes("image/webp") && /\.jpg/.test(g.imgAttrs.src) && g.sources.every((s) => s.srcset && s.sizes) && /\d+w/.test(g.imgAttrs.srcset), types);
  check(`${tag} ST4-01 explicit width and height on the img and every source`, [g.imgAttrs, ...g.sources].every((s) => Number(s.width) > 0 && Number(s.height) > 0), [g.imgAttrs, ...g.sources].map((s) => `${s.width}×${s.height}`));
  check(`${tag} ST4-02 "01" and the exact title`, g.numeral.text === "01" && g.h1.text === TITLE && g.h1.count === 1, [g.numeral.text, g.h1.text, g.h1.count]);
  const plain = (s) => /Schibsted Grotesk/.test(s.family) && s.weight === "400" && s.transform === "none" && (s.spacing === "normal" || s.spacing === "0px") && s.shadow === "none" && s.color === CHALK;
  check(`${tag} ST4-02 plain type (site font, 400, no caps / spacing / effects, chalk)`, plain(g.numeral) && plain(g.h1), { numeral: g.numeral, h1: g.h1 });
  check(`${tag} ST4-02 title ≤ ${mobile ? 32 : 48} px; 01 small (12 px)`, g.h1.size <= (mobile ? 32 : 48) && g.numeral.size === 12, [g.h1.size, g.numeral.size]);
  check(`${tag} ST4-02 lower left: wash in the left half, ≤ 32 px from the band's bottom`, g.wash.left < g.hero.width / 2 && g.wash.right < g.hero.width * 0.6 && g.hero.bottom - g.wash.bottom <= 32 && g.hero.bottom - g.wash.bottom >= 0, { wash: g.wash, heroBottom: g.hero.bottom });
  check(`${tag} ST4-15 the wash contains the 01 and title boxes`, g.textRects.every((r) => inside(r, g.wash)), { wash: g.wash, texts: g.textRects.length });
  // N4: the wash hugs the text (padding per side from the union of the 01 and title element boxes), lower left.
  const u = g.textBoxes.reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
  const pad = [u.top - g.wash.top, g.wash.right - u.right, g.wash.bottom - u.bottom, u.left - g.wash.left].map((v) => Math.round(v * 10) / 10);
  const maxPad = mobile ? 12 : 24;
  check(`${tag} ST4-15 (N4) the wash hugs the text: padding ≤ ${maxPad} px a side (top, right, bottom, left)`, pad.every((v) => v >= 0 && v <= maxPad), { padding: pad });
  if (mobile) {
    const share = g.wash.height / g.hero.height;
    check(`${tag} ST4-15 (N4) wash ≤ 50% of the band height (${Math.round(g.wash.height * 10) / 10} of ${g.hero.height} px)`, share <= 0.5, { wash: g.wash.height, band: g.hero.height, share: Math.round(share * 1000) / 1000 });
    R.n4 ??= {};
    R.n4[page.viewportSize().width] = { wash: g.wash.height, band: g.hero.height, share };
  }
  const hit = overlap(g.washOuter, g.venus) + g.textRects.reduce((s, r) => s + overlap(r, g.venus), 0);
  check(`${tag} ST4-14 01 / title / wash (incl. ${g.shadowExtent} px shadow) clear of Venus`, hit === 0, { washOuterRight: Math.round(g.washOuter.right), venusLeft: Math.round(g.venus.left), venus: g.venus });
  if (mobile) {
    check(`${tag} ST4-11 short band (≤ 200 px)`, g.hero.height <= 200, g.hero.height);
    check(`${tag} ST4-11 Venus visible (≥ 90% of her box inside the band)`, g.venusShare >= 0.9, Math.round(g.venusShare * 100) / 100);
  }
  // Worst-pixel contrast of chalk on the wash: the wash alone (text transparent), its lightest pixel.
  const css = await page.addStyleTag({ content: "[data-testid=hero-wash] * { color: transparent !important; }" });
  // Inset by 1 px: the clip rounds outward, and a fractional edge would sample the painting outside the wash.
  const wb = await page.locator("[data-testid=hero-wash]").boundingBox();
  const png = await page.screenshot({ clip: { x: Math.ceil(wb.x) + 1, y: Math.ceil(wb.y) + 1, width: Math.floor(wb.width) - 3, height: Math.floor(wb.height) - 3 } });
  await css.evaluate((n) => n.remove());
  const worst = await lightest(browser, png);
  const r = ratio(rgb(CHALK), worst);
  check(`${tag} ST4-02 chalk on the wash ≥ 4.5:1 at the worst pixel`, r >= 4.5, { worst, ratio: r });
  // The screenshot that shows it: Venus (red) and the wash with its shadow (cyan) outlined.
  await page.evaluate(({ v, w }) => {
    for (const [b, c] of [[v, "#ff3b30"], [w, "#00e5ff"]]) {
      const d = document.createElement("div");
      d.className = "qa-box";
      Object.assign(d.style, { position: "fixed", left: `${b.left}px`, top: `${b.top}px`, width: `${b.right - b.left}px`, height: `${b.bottom - b.top}px`, outline: `2px dashed ${c}`, zIndex: 99, pointerEvents: "none" });
      document.body.appendChild(d);
    }
  }, { v: g.venus, w: g.washOuter });
  const file = join(CFG.out, `hero-${page.viewportSize().width}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.ceil(g.hero.bottom + 4) } });
  R.shots.push(file);
  await page.evaluate(() => document.querySelectorAll(".qa-box").forEach((d) => d.remove()));
}

async function formChecks(page, tag, mobile, viewport) {
  const f = await page.evaluate(() => {
    const box = (e) => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const form = document.querySelector("[data-testid=calculator-form]");
    const fields = [...form.querySelectorAll("input, select")].map((el) => {
      const s = getComputedStyle(el);
      const label = el.closest("label")?.querySelector("span");
      return {
        cls: el.className, type: el.type, box: box(el),
        border: [s.borderTopWidth, s.borderLeftWidth, s.borderRightWidth].join(" "),
        under: `${s.borderBottomWidth} ${s.borderBottomStyle} ${s.borderBottomColor}`,
        bg: s.backgroundColor, radius: s.borderRadius, color: s.color,
        label: label?.textContent, labelVisible: !!label && label.getBoundingClientRect().width > 1 && getComputedStyle(label).position !== "absolute",
      };
    });
    const row = form.querySelector("[data-testid=basket-row]");
    const ticker = row.querySelectorAll("input")[0];
    const weight = row.querySelectorAll("input")[1];
    const remove = row.querySelector("button");
    const button = form.querySelector("button[type=submit]");
    const bs = getComputedStyle(button);
    const note = document.querySelector("[data-testid=listings-note]");
    const ns = getComputedStyle(note);
    const range = document.createRange();
    range.selectNodeContents(note);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    const text = document.body.innerText;
    return {
      form: box(form), fields, ticker: box(ticker), weight: box(weight), remove: box(remove),
      button: { bg: bs.backgroundColor, color: bs.color, radius: bs.borderRadius, text: button.textContent },
      note: { text: note.textContent, size: ns.fontSize, color: ns.color, lines, textWidth: range.getBoundingClientRect().width, box: box(note), parent: box(note.parentElement), prev: note.previousElementSibling === form, next: note.nextElementSibling?.textContent ?? null },
      words: ["Pick tickers", "Swipe", "own scale", "Used only by", "New cash on each"].filter((w) => text.includes(w)),
      imgs: document.querySelectorAll("main img, main picture, header img").length + document.querySelectorAll("body img").length,
      bgImages: [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).backgroundImage !== "none").map((e) => e.tagName),
      scroll: [document.scrollingElement.scrollWidth, window.innerWidth],
    };
  });
  const want = ["calc-field"];
  check(`${tag} ST4-03 seven fields, each with the calculator field class (not .field)`, f.fields.length === 7 && f.fields.every((x) => want.every((c) => x.cls.split(" ").includes(c)) && !x.cls.split(" ").includes("field")), f.fields.map((x) => x.cls));
  // No fill: transparent; the select carries the page's own charcoal (D2), the same colour as the page behind it.
  check(`${tag} ST4-03 borderless: no box border, no fill (select: the page's charcoal), no radius; 1 px rule underline`, f.fields.every((x) => x.border === "0px 0px 0px" && (x.bg === "rgba(0, 0, 0, 0)" || (x.type === "select-one" && x.bg === NIGHT)) && x.radius === "0px" && x.under === `1px solid ${RULE}`), f.fields.map((x) => [x.border, x.under, x.bg, x.radius]));
  // D2: the select and its options are charcoal with chalk text (≥ 4.5:1), so the list Chrome opens is dark;
  // color-scheme dark on <html> (and <body>); the date inputs use the dark scheme (dark pickers).
  const sel = await page.evaluate(() => {
    const s = document.querySelector("[data-testid=calculator-form] select");
    const cs = (e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, scheme: c.colorScheme }; };
    return {
      html: getComputedStyle(document.documentElement).colorScheme,
      body: getComputedStyle(document.body).colorScheme,
      select: cs(s),
      options: [...s.options].map((o) => ({ text: o.textContent, ...cs(o) })),
      dates: [...document.querySelectorAll("input[type=date]")].map((d) => cs(d).scheme),
    };
  });
  const readable = (x) => rgb(x.bg).length === 3 && !/rgba\(.*, 0\)$/.test(x.bg) && ratio(rgb(x.color), rgb(x.bg)) >= 4.5;
  check(`${tag} D2 color-scheme dark on <html> and <body>`, sel.html === "dark" && sel.body === "dark", { html: sel.html, body: sel.body });
  check(`${tag} D2 select: charcoal background, chalk text (${ratio(rgb(sel.select.color), rgb(sel.select.bg))}:1)`, sel.select.bg === NIGHT && sel.select.color === CHALK && readable(sel.select), sel.select);
  check(`${tag} D2 every <option>: charcoal background, chalk text, ≥ 4.5:1 (${sel.options.length} options)`, sel.options.length >= 2 && sel.options.every((o) => o.bg === NIGHT && o.color === CHALK && readable(o)), sel.options);
  check(`${tag} D2 date inputs use the dark scheme (dark pickers)`, sel.dates.length === 2 && sel.dates.every((d) => d === "dark"), sel.dates);
  check(`${tag} ST4-03 underline ≥ 3:1 on charcoal`, ratio(rgb(RULE), rgb(NIGHT)) >= 3, ratio(rgb(RULE), rgb(NIGHT)));
  check(`${tag} ST4-03 visible labels`, f.fields.every((x) => x.labelVisible) && JSON.stringify(f.fields.map((x) => x.label)) === JSON.stringify(["Ticker", "Weight", "Start", "End", "Starting capital", "Contribution", "Frequency"]), f.fields.map((x) => [x.label, x.labelVisible]));
  // Focus ring: Tab from the bar's last item into the form; every field and the button show a 2 px chalk ring.
  const rings = [];
  await page.locator('nav[aria-label="Site"] a').last().focus();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || !a.closest("[data-testid=calculator-form]")) return null; // a date field's calendar button: :focus-within
      const s = getComputedStyle(a);
      return { tag: a.tagName, type: a.type, outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` };
    });
    if (r) rings.push(r);
  }
  const controls = rings.filter((r) => r.tag !== "BUTTON" || r.type === "submit");
  check(`${tag} ST4-03 visible focus ring (2 px solid chalk) on the fields and the button`, controls.length >= 8 && controls.every((r) => r.outline === `solid 2px ${CHALK}`), controls.map((r) => `${r.tag} ${r.outline}`));
  await page.evaluate(() => document.activeElement?.blur());
  check(`${tag} ST4-16 primary button: chalk fill, night text, no radius`, f.button.bg === CHALK && f.button.color === NIGHT && f.button.radius === "0px" && f.button.text === "Compare plans", f.button);
  check(`${tag} ST4-04 listings note: exact text, 13 px, dim`, f.note.text === NOTE && f.note.size === "13px" && f.note.color === DIM, f.note);
  check(`${tag} ST4-04 listings note on one line, not clipped (${Math.round(f.note.textWidth)} px of ${Math.round(f.note.parent.width)} px)`, f.note.lines === 1 && f.note.textWidth <= f.note.parent.width + 0.5, { lines: f.note.lines, textWidth: f.note.textWidth, column: f.note.parent.width });
  check(`${tag} ST4-04 directly under the form, no other note there`, f.note.prev && (f.note.next === null || f.note.next === ""), { prev: f.note.prev, next: f.note.next });
  check(`${tag} ST4-07 / ST6-02 no instruction text`, f.words.length === 0, f.words);
  check(`${tag} ST6-01 one painting (the hero img), no CSS background-image`, f.bgImages.length === 0, f.bgImages);
  check(`${tag} ST4-12 no horizontal page scroll (before a run)`, f.scroll[0] <= f.scroll[1], f.scroll);
  if (mobile) {
    const wide = f.fields.filter((x) => x.label !== "Ticker");
    check(`${tag} ST4-08 fields full width (weight, window, amounts, frequency)`, wide.every((x) => Math.abs(x.box.width - f.form.width) <= 1 && Math.abs(x.box.left - f.form.left) <= 1), wide.map((x) => [x.label, Math.round(x.box.width)]));
    const tops = f.fields.map((x) => x.box.top);
    check(`${tag} ST4-08 fields stack, one under another`, tops.every((t, i) => i === 0 || t > tops[i - 1] + 10), tops.map(Math.round));
    check(`${tag} ST4-08 ticker above its weight (Q15), remove control beside the ticker`, f.weight.top >= f.ticker.bottom && f.remove.left >= f.ticker.right && Math.abs(f.remove.bottom - f.ticker.bottom) <= 2 && Math.abs(f.remove.right - f.form.right) <= 1, { ticker: f.ticker, remove: f.remove, weight: f.weight });
  }
  // Q8: an empty submit shows the error line in the alert colour (≥ 4.5:1 on charcoal).
  await page.getByRole("button", { name: "Compare plans" }).click();
  const alert = await page.locator("[role=alert]").evaluate((a) => ({ text: a.textContent, color: getComputedStyle(a).color }));
  check(`${tag} Q8 error line in #ff8f87 (${ratio(rgb(ALERT), rgb(NIGHT))}:1)`, alert.color === ALERT && alert.text === "Add a ticker.", alert);
  const scan = await contrastScan(page);
  check(`${tag} ST0-03 AA contrast for every visible text (before a run, error shown)`, scan.bad.length === 0, scan.bad.length ? scan.bad : { texts: scan.n });
  const barLine = await page.locator('nav[aria-label="Site"] a').evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().top)));
  check(`${tag} the bar fits on one line (${viewport.width} px)`, Math.max(...barLine) - Math.min(...barLine) <= 2, barLine);
}

async function resultChecks(page, tag, mobile) {
  const r = await page.evaluate(() => {
    const box = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
    const result = document.querySelector("[data-testid=result]");
    const chart = result.querySelector("[data-testid=dca-chart]");
    const curve = chart.querySelector(".recharts-area-curve");
    const area = chart.querySelector(".recharts-area-area");
    const pill = chart.querySelector("[data-testid=chart-pill]");
    const ps = pill && getComputedStyle(pill);
    const metrics = [...result.querySelectorAll("[data-testid=result-metric]")].map((m) => {
      const dl = m.querySelector("dl");
      const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };
      const cols = [...dl.children].map((c) => {
        const dt = c.querySelector("dt");
        const dd = c.querySelector("dd");
        const main = dd.querySelector("[data-part=main]") ?? dd;
        const date = dd.querySelector("[data-part=date]");
        return { plan: c.dataset.plan, dt: dt.textContent, dd: dd.textContent, box: box(c), ddBox: box(main), dtBox: box(dt), mainBox: box(main), mainLines: lines(main), dateBox: date && box(date), dateColor: date && getComputedStyle(date).color, ddLines: lines(main) };
      });
      const ms = getComputedStyle(m);
      const ds = getComputedStyle(dl);
      return { key: m.dataset.key, caption: m.querySelector("p").textContent, captionBox: box(m.querySelector("p")), dl: box(dl), gap: parseFloat(ds.columnGap), cols, borders: [ms.borderTopWidth, ms.borderBottomWidth, ds.borderTopWidth, ds.borderBottomWidth, ...[...dl.children].map((c) => getComputedStyle(c).borderTopWidth)], bgs: [ms.backgroundColor, ds.backgroundColor, ...[...dl.children].map((c) => getComputedStyle(c).backgroundColor)] };
    });
    return {
      result: box(result), form: box(document.querySelector("[data-testid=calculator-form]")),
      charts: result.querySelectorAll("[data-testid=dca-chart], .recharts-wrapper").length,
      wrappers: document.querySelectorAll(".recharts-wrapper").length,
      areas: chart.querySelectorAll(".recharts-area").length,
      lines: chart.querySelectorAll(".recharts-line").length,
      stroke: curve && getComputedStyle(curve).stroke, strokeWidth: curve?.getAttribute("stroke-width"),
      fill: area && getComputedStyle(area).fill, fillOpacity: area?.getAttribute("fill-opacity"),
      chart: box(chart),
      pill: pill && { text: pill.textContent, bg: ps.backgroundColor, color: ps.color, height: box(pill).height, box: box(pill) },
      metrics,
      tables: document.querySelectorAll("table").length,
      captions: [...result.querySelectorAll("[data-testid=result-captions] p")].map((p) => p.textContent),
      text: result.innerText,
      scroll: [document.scrollingElement.scrollWidth, window.innerWidth],
    };
  });
  check(`${tag} ST4-05 one chart, one series (one area, no line series)`, r.wrappers === 1 && r.areas === 1 && r.lines === 0, { wrappers: r.wrappers, areas: r.areas, lines: r.lines });
  check(`${tag} ST4-05 green line (2 px) and a 16% green fill`, r.stroke === GREEN && r.strokeWidth === "2" && r.fill === GREEN && r.fillOpacity === "0.16", { stroke: r.stroke, width: r.strokeWidth, fill: r.fill, opacity: r.fillOpacity });
  const nlv = r.metrics.find((m) => m.key === "nlv")?.cols.find((c) => c.plan === "dca")?.dd;
  check(`${tag} ST4-05 last value in a 22 px green pill, night text, = DCA NLV at end`, r.pill && r.pill.bg === GREEN && r.pill.color === NIGHT && Math.round(r.pill.height) === 22 && r.pill.text === nlv, { pill: r.pill, nlv });
  check(`${tag} ST4-05 / ST4-09 the pill is not clipped (inside the chart)`, r.pill && inside(r.pill.box, r.chart), { pill: r.pill?.box, chart: r.chart });
  check(`${tag} ST4-05 no chart note`, !/scale/i.test(r.text), null);
  check(`${tag} ST4-06 no <table> on the page`, r.tables === 0, r.tables);
  check(`${tag} ST4-06 eight metrics, captions word for word`, JSON.stringify(r.metrics.map((m) => m.caption)) === JSON.stringify(LABELS), r.metrics.map((m) => m.caption));
  check(`${tag} ST4-06 Lump sum / DCA label-value rows (short labels)`, r.metrics.every((m) => JSON.stringify(m.cols.map((c) => c.dt)) === '["Lump sum","DCA"]'), r.metrics.map((m) => m.cols.map((c) => c.dt).join("|")));
  check(`${tag} ST4-06 no boxes, no borders`, r.metrics.every((m) => m.borders.every((b) => b === "0px") && m.bgs.every((b) => b === "rgba(0, 0, 0, 0)")), r.metrics[0]);
  const invested = r.metrics.find((m) => m.key === "invested")?.cols.find((c) => c.plan === "dca")?.dd;
  check(`${tag} ST4-06 / DCA-01..06 regression: DCA Total invested $313,000`, invested === "$313,000", invested);
  check(`${tag} Q2 / Q12 (N1) captions: "Dividends reinvested.", the method sentence word for word, then only run-specific lines`, r.captions[0] === "Dividends reinvested." && r.captions[1] === METHOD && r.captions.length === 2, r.captions);
  // ST4-10: two columns while each column is ≥ 150 px, else stacked; values on one line inside their column.
  const layout = r.metrics.map((m) => {
    const [a, b] = m.cols;
    const two = Math.abs(a.box.top - b.box.top) <= 1 && b.box.left >= a.box.right;
    const fits = (m.dl.width - m.gap) / 2 >= 150;
    const whole = m.cols.every((c) => c.ddLines === 1 && c.ddBox.right <= c.box.right + 0.5 && c.ddBox.left >= c.box.left - 0.5);
    const captionFull = Math.abs(m.captionBox.width - m.dl.width) <= 1;
    return { key: m.key, two, fits, whole, captionFull, stackedOrder: two || b.box.top >= a.box.bottom };
  });
  check(`${tag} ST4-10 two columns when each ≥ 150 px, else stacked (Lump sum above DCA)`, layout.every((l) => l.two === l.fits && l.stackedOrder), layout.map((l) => `${l.key}:${l.two ? "2col" : "stack"}`));
  if (mobile) check(`${tag} ST4-10 expected: two columns at this width (EL A1)`, layout.every((l) => l.two), layout.map((l) => l.two));
  check(`${tag} ST4-10 every value whole on one line, inside its column`, layout.every((l) => l.whole), layout.filter((l) => !l.whole));
  // D3: each label-value row's main line is a single line: the figure on the label's line (bottoms aligned, right
  // of the label), one line high (≤ 24 px); a date only on its own muted line under the figure, inside the cell.
  const rows = r.metrics.flatMap((m) => m.cols.map((c) => ({ key: m.key, plan: c.plan, ...c })));
  const rowBad = rows.filter((c) => {
    const sameLine = Math.abs(c.mainBox.bottom - c.dtBox.bottom) <= 3 && c.mainBox.left >= c.dtBox.right;
    const oneLine = c.mainLines === 1 && c.mainBox.height <= 24 && c.dtBox.height <= 24;
    const date = !c.dateBox || (c.dateBox.top >= c.mainBox.bottom - 1 && c.dateBox.right <= c.box.right + 0.5 && c.dateBox.left >= c.box.left - 0.5 && c.dateBox.bottom <= c.box.bottom + 0.5 && c.dateColor === DIM);
    return !(sameLine && oneLine && date);
  });
  check(`${tag} D3 every label-value row's main line is one line, no value wrapped under its label (${rows.length} rows)`, rowBad.length === 0, rowBad.length ? rowBad.map((c) => ({ key: c.key, plan: c.plan, dt: c.dtBox, main: c.mainBox, date: c.dateBox, cell: c.box })) : rows.filter((c) => c.dateBox).map((c) => `${c.key}/${c.plan}: label ${Math.round(c.dtBox.height)} px, figure ${Math.round(c.mainBox.height)} px on one line, date own line`));
  R.rows ??= {};
  R.rows[tag] = rows.map((c) => ({ key: c.key, plan: c.plan, label: c.dtBox.height, main: c.mainBox.height, cell: c.box.height, date: !!c.dateBox }));
  const drop = rows.filter((c) => c.key === "drop");
  check(`${tag} D3 Max drop: figure on the label's line, the date on its own muted line`, drop.length === 2 && drop.every((c) => c.dateBox && /^\d{4}-\d{2}-\d{2}$/.test(c.dd.split(" · ")[1] ?? "")), drop.map((c) => c.dd));
  check(`${tag} ST4-10 metric captions full width`, layout.every((l) => l.captionFull), layout.filter((l) => !l.captionFull).map((l) => l.key));
  check(`${tag} ST4-12 no horizontal page scroll (after a run)`, r.scroll[0] <= r.scroll[1], r.scroll);
  if (mobile) {
    check(`${tag} ST4-09 chart full width (same edges as the form)`, Math.abs(r.chart.left - r.form.left) <= 1 && Math.abs(r.chart.right - r.form.right) <= 1, { chart: r.chart, form: r.form });
    check(`${tag} phone: results under the form`, r.result.top >= r.form.bottom, [r.result.top, r.form.bottom]);
  } else {
    check(`${tag} ST4-12 wide: form left, results right`, r.result.left >= r.form.right && Math.abs(r.result.top - r.form.top) <= 4, { form: r.form, result: r.result });
  }
  const scan = await contrastScan(page);
  check(`${tag} ST0-03 AA contrast for every visible text (after a run, chart ticks and pill included)`, scan.bad.length === 0, scan.bad.length ? scan.bad : { texts: scan.n });
}

const browser = await chromium.launch();
try {
  // ST4-01: every hero file ≤ 300 KB; and the file a 1440 px, 2x screen is served.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${base}/calculator`, { waitUntil: "networkidle" });
    const files = await page.evaluate(() => {
      const hero = document.querySelector("[data-testid=calculator-hero]");
      const urls = new Set();
      for (const el of hero.querySelectorAll("source, img")) for (const part of (el.getAttribute("srcset") ?? "").split(",")) if (part.trim()) urls.add(new URL(part.trim().split(/\s+/)[0], location.href).href);
      urls.add(hero.querySelector("img").src);
      return { urls: [...urls], current: hero.querySelector("img").currentSrc };
    });
    const sizes = {};
    for (const u of files.urls) {
      const res = await page.request.get(u);
      sizes[new URL(u).pathname] = { status: res.status(), bytes: (await res.body()).length, type: res.headers()["content-type"] };
    }
    const big = Object.entries(sizes).filter(([, s]) => s.status !== 200 || s.bytes > MAX_BYTES);
    check(`ST4-01 every hero file 200 and ≤ 300 KB (${Object.keys(sizes).length} files)`, big.length === 0, big.length ? big : Object.fromEntries(Object.entries(sizes).map(([k, s]) => [k.replace("/hero/", ""), Math.round(s.bytes / 1024)])));
    const cur = sizes[new URL(files.current).pathname];
    check(`ST4-01 the file served at 1440 px, 2x ≤ 300 KB`, cur && cur.bytes <= MAX_BYTES && /venus-wide-/.test(files.current), { file: new URL(files.current).pathname, kb: cur && Math.round(cur.bytes / 1024), type: cur?.type });
    R.heroFiles = sizes;
    await page.close();
  }

  for (const [vp, viewport, mobile] of VIEWPORTS) {
    const tag = `[${vp}]`;
    const scale = mobile ? 2 : 1;
    // ST4-01 (D1, QA round 1): CLS on cold loads, EVERY layout-shift entry counted (no hadRecentInput exclusion),
    // a fresh context with the cache disabled each time, RUNS times; the last run holds the hero files back 1 s.
    // From the hero: entries with any source inside the band. Pass: hero 0 and page total < 0.001 on every run.
    {
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        const slow = i === RUNS - 1;
        const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: scale });
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
                  inHero: !!el?.closest?.("[data-testid=calculator-hero]"),
                  text: (s.node?.textContent ?? "").slice(0, 30),
                  from: s.previousRect && [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round),
                  to: s.currentRect && [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round),
                };
              });
              window.__shifts.push({ value: e.value, at: Math.round(e.startTime), hadRecentInput: e.hadRecentInput, hero: sources.some((x) => x.inHero), sources });
            }
          }).observe({ type: "layout-shift", buffered: true });
          document.addEventListener("DOMContentLoaded", () => {
            const h = document.querySelector("[data-testid=calculator-hero]");
            window.__boxes = h && [h, h.querySelector("img"), h.querySelector("[data-testid=hero-wash]")].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(","); });
            window.__fonts = document.fonts.status;
          });
        });
        await page.goto(`${base}/calculator`, { waitUntil: "load" });
        await page.waitForTimeout(2000);
        const m = await page.evaluate(() => {
          const h = document.querySelector("[data-testid=calculator-hero]");
          const late = [h, h.querySelector("img"), h.querySelector("[data-testid=hero-wash]")].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(","); });
          return { shifts: window.__shifts, fontsAtDomReady: window.__fonts, still: JSON.stringify(late) === JSON.stringify(window.__boxes), loaded: h.querySelector("img").complete, fontsNow: document.fonts.status };
        });
        const total = m.shifts.reduce((a, e) => a + e.value, 0);
        const hero = m.shifts.filter((e) => e.hero).reduce((a, e) => a + e.value, 0);
        runs.push({ run: i + 1, slowHero: slow, total, hero, still: m.still, loaded: m.loaded, fontsAtDomReady: m.fontsAtDomReady, fontsNow: m.fontsNow, shifts: m.shifts });
        await ctx.close();
      }
      const r5 = (v) => Math.round(v * 1e5) / 1e5;
      check(`${tag} ST4-01 CLS from the hero = 0 on ${RUNS} cold loads (all shifts counted; band, image and wash still)`, runs.every((x) => x.hero === 0 && x.still && x.loaded), runs.map((x) => ({ run: x.run, hero: x.hero, still: x.still, slowHero: x.slowHero })));
      check(`${tag} ST4-01 page CLS < 0.001 on ${RUNS} cold loads, all shifts counted (max ${r5(Math.max(...runs.map((x) => x.total)))})`, runs.every((x) => x.total < 0.001), runs.map((x) => r5(x.total)));
      R.cls ??= {};
      R.cls[vp] = { width: viewport.width, hero: runs.map((x) => x.hero), total: runs.map((x) => x.total), runs };
      console.log(`INFO ${tag} CLS cold × ${RUNS} (all shifts): page ${JSON.stringify(runs.map((x) => r5(x.total)))} · hero ${JSON.stringify(runs.map((x) => x.hero))} · fonts at DOM ready ${JSON.stringify(runs.map((x) => x.fontsAtDomReady))} · sources ${JSON.stringify([...new Set(runs.flatMap((x) => x.shifts.flatMap((e) => e.sources.map((s) => `${s.node} "${s.text}" ${JSON.stringify(s.from)}→${JSON.stringify(s.to)}`))))])}`);
    }
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: scale });
    page.setDefaultTimeout(30000);
    const api = [];
    page.on("response", (res) => { if (res.url().includes("/api/chart")) api.push(res.status()); });
    try {
      const res = await page.goto(`${base}/calculator`, { waitUntil: "networkidle" });
      check(`${tag} /calculator 200`, res?.status() === 200, res?.status());
      const body = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).color, getComputedStyle(document.body).colorScheme, getComputedStyle(document.documentElement).colorScheme]);
      check(`${tag} ST0-01 charcoal page, chalk type; color-scheme dark on <html> and <body> (native popups dark)`, body[0] === NIGHT && body[1] === CHALK && body[2] === "dark" && body[3] === "dark", body);
      await heroChecks(browser, page, tag, mobile);
      const before = join(CFG.out, `calculator-${viewport.width}.png`);
      await page.screenshot({ path: before, fullPage: true });
      R.shots.push(before);
      await formChecks(page, tag, mobile, viewport);
      await page.goto(`${base}/calculator`, { waitUntil: "networkidle" });
      await fill(page, CASE);
      await page.waitForSelector("[data-testid=results]", { timeout: 90000 });
      await page.waitForTimeout(800);
      await resultChecks(page, tag, mobile);
      await page.evaluate(() => window.scrollTo(0, 0));
      const after = join(CFG.out, `calculator-${viewport.width}-result.png`);
      await page.screenshot({ path: after, fullPage: true });
      R.shots.push(after);
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
writeFileSync(join(CFG.out, "calculator-page.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
