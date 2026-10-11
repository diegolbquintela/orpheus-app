// Sign-in page (epic #66, #73; spec attachments/site-style-spec.md §9, ST5b-01..05, plus ST0-01..03 and ST1 as they
// apply on /dashboard/sign-in) in a real browser at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900.
//
//   ST5b-01 no white panel: charcoal page and chalk type; underline fields (1 px rule underline; no box, fill or
//           radius; chalk text; focused: chalk underline + 2 px chalk ring); sign-in-only classes (.signin*), no
//           .field / .kicker / bg-paper / text-ink in the page; the stylesheet's .field and .kicker as on main
//   ST5b-02 exactly: the h1 `Sign in`, `Email`, `Password`, the submit `Sign in` and `Create an account`; nothing
//           else in <main> (no invite-only note); the switch flips to heading and submit `Create account`, link
//           `Sign in`, and back, without a request; the error line only after a failed attempt (role=alert,
//           #ff8f87): ONE failed sign-in per width with a made-up @example.invalid address (never signs up)
//   ST5b-03 the page's requests: only POST /api/auth/sign-in/email on submit (no sign-up call); signed-out
//           /dashboard → 307 to sign-in (release-smoke covers the full matrix)
//   ST5b-04 AA for every visible text (contrast scan; axe-core color-contrast too with AXE_PATH), submit night on
//           chalk, error ≥ 4.5:1, underline and focus ring ≥ 3:1; color-scheme dark on <html> and <body>; the
//           :-webkit-autofill rule keeps a night fill and chalk text
//   ST5b-05 no horizontal scroll; fields, submit, switch ≥ 44 px tall, fields the column's width; title, noindex
//           meta + X-Robots-Tag; one bar with Dashboard current; footer `Orpheus Wisdom`; no img / picture /
//           background-image
// Screenshots: signin-<w>.png, signin-create-<w>.png, signin-error-<w>.png, signin-focus-<w>.png.
//   node qa/tools/signin-page.mjs --base-url <url> --out <dir>
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
  ["phone360", { width: 360, height: 780 }],
  ["phone", { width: 400, height: 860 }],
  ["wide", { width: 1024, height: 800 }],
  ["desktop", { width: 1440, height: 900 }],
];
const NIGHT = "rgb(30, 33, 36)";
const CHALK = "rgb(242, 240, 235)";
const DIM = "rgb(168, 174, 180)";
const RULE = "rgb(139, 146, 152)";
const ALERT = "rgb(255, 143, 135)";
const PATH = "/dashboard/sign-in";
const lum = ([r, g, b]) => {
  const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const rgb = (s) => (/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/.exec(s) ?? []).slice(1).map(Number);

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

// The visible texts in <main>, in order (leaf texts).
const mainTexts = (page) =>
  page.evaluate(() => {
    const out = [];
    const w = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const s = t.nodeValue.trim();
      const r = t.parentElement.getBoundingClientRect();
      if (s && r.width > 0 && r.height > 0) out.push(s);
    }
    return out;
  });

const style = (page, sel) =>
  page.locator(sel).first().evaluate((e) => {
    const c = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return {
      bg: c.backgroundColor, color: c.color, bt: c.borderTopWidth, bl: c.borderLeftWidth, br: c.borderRightWidth,
      bb: c.borderBottomWidth, bbc: c.borderBottomColor, bbs: c.borderBottomStyle, radius: c.borderTopLeftRadius,
      outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`, h: r.height, w: r.width, left: r.left,
      deco: c.textDecorationLine, size: parseFloat(c.fontSize), weight: c.fontWeight, tt: c.textTransform, font: c.fontFamily,
    };
  });

let AXE = null;
if (process.env.AXE_PATH) AXE = readFileSync(process.env.AXE_PATH, "utf8");
else console.log("INFO axe-core not run (set AXE_PATH to axe.min.js); the contrast scan covers ST5b-04");

const browser = await chromium.launch();
try {
  // Flag check: the route must be on (preview / local with DASHBOARD_ENABLED=true).
  {
    const page = await browser.newPage();
    const res = await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
    check("sign-in route 200 (DASHBOARD_ENABLED on this host)", res.status() === 200, res.status());
    check("ST5b-05 X-Robots-Tag: noindex, nofollow", /noindex/i.test(res.headers()["x-robots-tag"] ?? ""), res.headers()["x-robots-tag"]);
    check("ST5b-05 title `Sign in · Orpheus Wisdom` and noindex meta", (await page.title()) === "Sign in · Orpheus Wisdom" && (await page.locator('meta[name=robots][content*="noindex"]').count()) >= 1, await page.title());
    check("ST5b-02 the form renders (sign-in configured on this host)", (await page.locator("[data-testid=sign-in-form]").count()) === 1);
    // ST5b-01: the shared classes in the stylesheet are as on main (the dashboard renders with them).
    const rules = await page.evaluate(() => {
      const out = {};
      for (const sh of document.styleSheets) {
        let list;
        try { list = sh.cssRules; } catch { continue; }
        const walk = (rs) => { for (const r of rs) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText) (out[r.selectorText] ??= []).push(r.style.cssText); } };
        walk(list);
      }
      return { field: out[".field"], kicker: out[".kicker"], autofill: Object.entries(out).filter(([k]) => k.includes("signin-field:-webkit-autofill")).map(([k, v]) => [k, v.join(" ")]) };
    });
    check("ST5b-01 shared .field unchanged (ink underline, ink text)", (rules.field ?? []).some((t) => /border-bottom: 1px solid var\(--color-ink\)/.test(t) && /color: var\(--color-ink\)/.test(t) && /height: 2.75rem/.test(t)), rules.field);
    check("ST5b-01 shared .kicker unchanged (0.75rem, 0.14em, uppercase)", (rules.kicker ?? []).some((t) => /font-size: 0.75rem/.test(t) && /letter-spacing: 0.14em/.test(t) && /text-transform: uppercase/.test(t)), rules.kicker);
    check("ST5b-04 :-webkit-autofill keeps a night fill and chalk text", rules.autofill.length >= 1 && rules.autofill.every(([, t]) => /-webkit-text-fill-color: var\(--color-chalk\)/.test(t) && /inset/.test(t) && /--color-night/.test(t)), rules.autofill);
    // ST5b-03: signed-out /dashboard still 307s to sign-in.
    const r = await fetch(`${base}/dashboard`, { redirect: "manual" });
    check("ST5b-03 signed-out /dashboard → 307 /dashboard/sign-in", r.status === 307 && /\/dashboard\/sign-in$/.test(r.headers.get("location") ?? ""), [r.status, r.headers.get("location")]);
    await page.close();
  }

  for (const [vp, viewport] of VIEWPORTS) {
    const tag = `[${vp}]`;
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const reqs = [];
    page.on("request", (q) => { if (/\/api\//.test(q.url())) reqs.push(`${q.method()} ${new URL(q.url()).pathname}`); });
    try {
      await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      // Shell
      const shell = await page.evaluate(() => ({
        html: getComputedStyle(document.documentElement).colorScheme,
        body: getComputedStyle(document.body).colorScheme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
        current: [...document.querySelectorAll('nav[aria-label="Site"] [aria-current="page"]')].map((a) => a.textContent.trim()),
        footer: document.querySelector("footer")?.textContent.trim(),
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        whites: [...document.querySelectorAll("body *")].filter((e) => { const c = getComputedStyle(e).backgroundColor; return c === "rgb(255, 255, 255)" || c === "rgb(250, 250, 247)"; }).map((e) => e.tagName + "." + e.className).slice(0, 5),
        paint: [...document.querySelectorAll("img, picture")].length + [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).backgroundImage !== "none").length,
        badClass: [...document.querySelectorAll("main *")].filter((e) => typeof e.className === "string" && /(^|\s)(field|kicker|bg-paper|text-ink|text-muted)(\s|$)/.test(e.className)).map((e) => e.className),
        main: (() => { const m = getComputedStyle(document.querySelector("main")); return { bg: m.backgroundColor, color: m.color }; })(),
      }));
      check(`${tag} ST5b-04 color-scheme dark on <html> and <body>`, shell.html === "dark" && shell.body === "dark", [shell.html, shell.body]);
      check(`${tag} ST5b-01 / ST0-01 charcoal page and chalk type, no white panel`, shell.bodyBg === NIGHT && shell.bodyColor === CHALK && shell.whites.length === 0 && [NIGHT, "rgba(0, 0, 0, 0)"].includes(shell.main.bg) && shell.main.color === CHALK, shell);
      check(`${tag} ST5b-01 sign-in-only classes (no .field / .kicker / bg-paper / text-ink / text-muted in <main>)`, shell.badClass.length === 0, shell.badClass);
      check(`${tag} ST5b-05 shell: Dashboard current, footer \`Orpheus Wisdom\``, JSON.stringify(shell.current) === '["Dashboard"]' && shell.footer === "Orpheus Wisdom", [shell.current, shell.footer]);
      check(`${tag} ST5b-05 no horizontal scroll`, shell.scroll <= 0, shell.scroll);
      check(`${tag} ST5b-05 no painting or CSS background image`, shell.paint === 0, shell.paint);

      // ST5b-02 exact copy
      const texts = await mainTexts(page);
      check(`${tag} ST5b-02 exactly heading, Email, Password, submit, Create an account`, JSON.stringify(texts) === JSON.stringify(["Sign in", "Email", "Password", "Sign in", "Create an account"]), texts);
      check(`${tag} ST5b-02 no error line before an attempt`, (await page.locator("[role=alert], [data-testid=sign-in-error]").count()) === 0);

      // ST5b-01 / -04 styles
      const h1 = await style(page, "main h1");
      check(`${tag} ST5b-01 heading chalk, 400, ≤ 32 px, no caps`, h1.color === CHALK && h1.weight === "400" && h1.size <= 32 && h1.tt === "none" && /Schibsted/.test(h1.font), h1);
      const label = await style(page, "main label > span");
      check(`${tag} ST5b-01 labels 12 px upper-case dim (${ratio(rgb(DIM), rgb(NIGHT))}:1)`, label.color === DIM && label.size === 12 && label.tt === "uppercase", label);
      const formW = (await page.locator("[data-testid=sign-in-form]").boundingBox()).width;
      for (const [name, sel] of [["Email", "input[type=email]"], ["Password", "input[type=password]"]]) {
        const f = await style(page, sel);
        const ok = f.bg === "rgba(0, 0, 0, 0)" && f.bt === "0px" && f.bl === "0px" && f.br === "0px" && f.bb === "1px" && f.bbs === "solid" && f.bbc === RULE && f.radius === "0px" && f.color === CHALK;
        check(`${tag} ST5b-01 ${name}: underline only (1 px rule, no box / fill / radius), chalk text`, ok, f);
        check(`${tag} ST5b-05 ${name}: ≥ 44 px tall, the column's full width`, f.h >= 44 && Math.abs(f.w - formW) <= 1, { h: f.h, w: f.w, formW });
      }
      check(`${tag} ST5b-04 underline rule ≥ 3:1 on charcoal (${ratio(rgb(RULE), rgb(NIGHT))}:1)`, ratio(rgb(RULE), rgb(NIGHT)) >= 3);
      const sub = await style(page, "button[type=submit]");
      check(`${tag} ST5b-04 submit chalk fill, night text (${ratio(rgb(sub.bg), rgb(sub.color))}:1), ≥ 44 px, radius 0`, sub.bg === CHALK && sub.color === NIGHT && sub.h >= 44 && sub.radius === "0px", sub);
      const sw = await style(page, "[data-testid=sign-in-switch]");
      check(`${tag} ST5b-02 / -05 Create an account: chalk, underlined, ≥ 44 px tap height`, sw.color === CHALK && /underline/.test(sw.deco) && sw.h >= 44, sw);

      // Focus: keyboard to the email field and the switch.
      await page.locator("input[type=email]").focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const fe = await style(page, "input[type=email]");
      check(`${tag} ST5b-04 focused field: chalk underline + 2 px chalk ring`, fe.bbc === CHALK && fe.outline === `solid 2px ${CHALK}`, fe);
      const shotF = join(CFG.out, `signin-focus-${viewport.width}.png`);
      await page.screenshot({ path: shotF, fullPage: true });
      R.shots.push(shotF);
      await page.locator("[data-testid=sign-in-switch]").focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const fs = await style(page, "[data-testid=sign-in-switch]");
      check(`${tag} ST5b-04 focused switch: 2 px chalk ring (${ratio(rgb(CHALK), rgb(NIGHT))}:1)`, fs.outline === `solid 2px ${CHALK}`, fs.outline);
      await page.locator("input[type=email]").blur();
      await page.evaluate(() => document.activeElement?.blur());

      // AA
      const scan = await contrastScan(page);
      check(`${tag} ST5b-04 AA contrast for every visible text`, scan.bad.length === 0, scan.bad.length ? scan.bad : { texts: scan.n });
      if (AXE) {
        await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length })));
        check(`${tag} ST5b-04 axe-core color-contrast: no violation`, v.length === 0, v);
      }
      const shot = join(CFG.out, `signin-${viewport.width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      R.shots.push(shot);

      // Create-account mode mirrors it; no request; back again.
      const before = reqs.length;
      await page.locator("[data-testid=sign-in-switch]").click();
      await page.waitForTimeout(150);
      const created = await mainTexts(page);
      check(`${tag} ST5b-02 create-account mode: Create account, Email, Password, Create account, Sign in (no note)`, JSON.stringify(created) === JSON.stringify(["Create account", "Email", "Password", "Create account", "Sign in"]), created);
      const scan2 = await contrastScan(page);
      check(`${tag} ST5b-04 AA in create-account mode`, scan2.bad.length === 0, scan2.bad.length ? scan2.bad : { texts: scan2.n });
      const shotC = join(CFG.out, `signin-create-${viewport.width}.png`);
      await page.screenshot({ path: shotC, fullPage: true });
      R.shots.push(shotC);
      await page.locator("[data-testid=sign-in-switch]").click();
      await page.waitForTimeout(150);
      check(`${tag} ST5b-03 the switch is in place (no request, same URL)`, reqs.length === before && new URL(page.url()).pathname === PATH, reqs.slice(before));
      check(`${tag} ST5b-02 back to sign-in`, JSON.stringify(await mainTexts(page)) === JSON.stringify(["Sign in", "Email", "Password", "Sign in", "Create an account"]));

      // One failed sign-in (made-up address; never sign-up).
      await page.locator("input[type=email]").fill(`qa-nobody-${vp}@example.invalid`);
      await page.locator("input[type=password]").fill("not-a-real-password-73");
      const resp = page.waitForResponse((r) => /\/api\/auth\/sign-in\/email$/.test(new URL(r.url()).pathname), { timeout: 15000 });
      await page.locator("button[type=submit]").click();
      const rr = await resp;
      await page.locator("[data-testid=sign-in-error]").waitFor({ timeout: 10000 });
      const err = await style(page, "[data-testid=sign-in-error]");
      const errText = (await page.locator("[data-testid=sign-in-error]").textContent()).trim();
      check(`${tag} ST5b-02 failed attempt: one role=alert line in #ff8f87 (${ratio(rgb(ALERT), rgb(NIGHT))}:1)`, err.color === ALERT && (await page.locator("[role=alert]").count()) === 1 && errText.length > 0, { status: rr.status(), errText, color: err.color });
      check(`${tag} ST5b-03 still on sign-in after a failed attempt; only sign-in calls`, new URL(page.url()).pathname === PATH && reqs.every((q) => /^(GET|POST) \/api\/auth\/(sign-in\/email|get-session)$/.test(q)), reqs);
      const scan3 = await contrastScan(page);
      check(`${tag} ST5b-04 AA with the error line`, scan3.bad.length === 0, scan3.bad.length ? scan3.bad : { texts: scan3.n });
      const shotE = join(CFG.out, `signin-error-${viewport.width}.png`);
      await page.screenshot({ path: shotE, fullPage: true });
      R.shots.push(shotE);
      check(`${tag} ST5b-03 no sign-up request`, !reqs.some((q) => /sign-up/.test(q)), reqs);
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "signin-page.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
