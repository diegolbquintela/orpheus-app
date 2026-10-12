// Grok template leftovers removed (#50; NG-01..09 in qa/CANONICAL-AC-PACK.md, decision log in
// attachments/site-style-spec.md § "Template leftovers removed (#50)").
//
//   NG-01 no request to grok.com (or any *.grok.com / grok-sandbox.com host) while loading /, /calculator,
//         /dashboard/sign-in, /dashboard, /personal-finance (signed-out 307 is fine) and a 404, at 360 × 780 and
//         1440 × 900; no `<script>` pointing at grok in the served HTML.
//   NG-02 no cookie on a .grok.com domain in the browser context afterwards; no Set-Cookie for grok on any response.
//   NG-03 a static /manifest.webmanifest: name and short_name `Orpheus Wisdom`, charcoal background/theme colour,
//         icons 180 and 512 PNG off /__grok, each served as image/png with the declared size.
//   NG-04 <link rel=manifest> → /manifest.webmanifest; <link rel=apple-touch-icon> → the 180 PNG (not /__grok).
//   NG-05 /__grok/* gone: the old manifest, manifest.json, icon-180.png and install styles → 404; nothing links it.
//   NG-06 /?install=1 is no longer special: like any /?query it goes to /calculator?… (the #46 old-link rule), no
//         Grok install page.
//   NG-07 noindex, nofollow meta + X-Robots-Tag unchanged; favicon.svg, theme-color #1e2124 and the
//         apple-mobile-web-app title/status-bar meta still there.
//   NG-08 no preview-bridge postMessage hooks left: the HTML has no `grok-preview-bridge` string.
// The rest (shell, home, lyre, footer, $313,000, CLS 0) is site-style-regression.mjs and release-smoke (NG-09).
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";

const { baseUrl, out } = qaConfig(import.meta.url);
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
}
const GROK = /(^|\.)grok\.com$|(^|\.)grok-sandbox\.com$/i;
const PAGES = ["/", "/calculator", "/dashboard/sign-in", "/dashboard", "/personal-finance", "/no-such-page"];
const OLD = ["/__grok/manifest.webmanifest", "/__grok/manifest.json", "/__grok/icon-180.png", "/__grok/install/styles.css"];

const browser = await chromium.launch();
try {
  for (const viewport of [{ width: 360, height: 780 }, { width: 1440, height: 900 }]) {
    const tag = `[${viewport.width}]`;
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const hits = [];
    const grokCookies = [];
    page.on("request", (r) => { try { if (GROK.test(new URL(r.url()).hostname)) hits.push(r.url()); } catch { /* data: etc. */ } });
    page.on("response", async (r) => {
      const sc = (await r.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
      for (const v of sc) if (/domain=\.?([a-z0-9-]+\.)*grok(-sandbox)?\.com/i.test(v)) grokCookies.push(v.split(";")[0].split("=")[0]);
    });
    for (const path of PAGES) {
      const res = await page.goto(baseUrl + path, { waitUntil: "load" });
      await page.waitForTimeout(1500); // let any deferred script run
      const html = await page.content();
      check(`${tag} ${path} NG-01 no grok script in the HTML`, !/<script[^>]+grok/i.test(html));
      check(`${tag} ${path} NG-08 no preview-bridge`, !html.includes("grok-preview-bridge"));
      if (["/", "/calculator", "/dashboard/sign-in", "/no-such-page"].includes(path)) {
        const head = await page.evaluate(() => ({
          robots: document.querySelector('meta[name="robots"]')?.content,
          theme: document.querySelector('meta[name="theme-color"]')?.content,
          icon: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
          manifest: [...document.querySelectorAll('link[rel="manifest"]')].map((l) => l.getAttribute("href")),
          apple: [...document.querySelectorAll('link[rel="apple-touch-icon"]')].map((l) => l.getAttribute("href")),
          appleTitle: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
          appleBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
          grokLinks: [...document.querySelectorAll("[href],[src]")].map((e) => e.getAttribute("href") ?? e.getAttribute("src")).filter((u) => /__grok|grok\.com/.test(u)),
        }));
        const xr = res?.headers()["x-robots-tag"];
        check(`${tag} ${path} NG-07 noindex meta + X-Robots-Tag, favicon.svg, theme-color, apple-mobile-web-app meta`, head.robots === "noindex, nofollow" && xr === "noindex, nofollow" && head.icon === "/favicon.svg" && head.theme === "#1e2124" && head.appleTitle === "Orpheus Wisdom" && head.appleBar === "black", { ...head, xr });
        check(`${tag} ${path} NG-04 manifest → /manifest.webmanifest, apple-touch-icon → /icons/apple-touch-icon.png`, JSON.stringify(head.manifest) === '["/manifest.webmanifest"]' && JSON.stringify(head.apple) === '["/icons/apple-touch-icon.png"]', { manifest: head.manifest, apple: head.apple });
        check(`${tag} ${path} NG-05 nothing links /__grok or grok.com`, head.grokLinks.length === 0, head.grokLinks);
      }
    }
    const inst = await page.goto(`${baseUrl}/?install=1`, { waitUntil: "load" });
    const instHtml = await page.content();
    check(`${tag} NG-06 /?install=1 follows the old-link rule (/?… → /calculator?…), the calculator 200, no install tutorial`, inst?.status() === 200 && new URL(page.url()).pathname === "/calculator" && !/Add to Home Screen|__grok\/install/i.test(instHtml) && (await page.locator("h1").count()) >= 1, { status: inst?.status(), url: page.url() });
    check(`${tag} NG-01 no request to grok.com on any page`, hits.length === 0, hits);
    const ck = (await ctx.cookies()).filter((c) => /grok/i.test(c.domain));
    check(`${tag} NG-02 no .grok.com cookies (context + Set-Cookie)`, ck.length === 0 && grokCookies.length === 0, { context: ck.map((c) => `${c.name}@${c.domain}`), setCookie: grokCookies });
    await ctx.close();
  }

  // NG-03 manifest + icons, NG-05 old paths.
  const m = await fetch(`${baseUrl}/manifest.webmanifest`);
  let man = null;
  try { man = await m.json(); } catch { man = null; }
  check("NG-03 /manifest.webmanifest 200, manifest content type", m.status === 200 && /manifest\+json|application\/json/.test(m.headers.get("content-type") ?? ""), [m.status, m.headers.get("content-type")]);
  check("NG-03 name / short_name Orpheus Wisdom, charcoal colours, standalone, start /", man?.name === "Orpheus Wisdom" && man?.short_name === "Orpheus Wisdom" && man?.background_color === "#1e2124" && man?.theme_color === "#1e2124" && man?.display === "standalone" && man?.start_url === "/", man);
  const icons = man?.icons ?? [];
  const sizes = icons.map((i) => i.sizes).sort();
  check("NG-03 icons 180x180 and 512x512 PNG, none under /__grok", JSON.stringify(sizes) === '["180x180","512x512"]' && icons.every((i) => i.type === "image/png" && !i.src.includes("__grok")), icons);
  for (const i of [...icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const r = await fetch(new URL(i.src, baseUrl));
    const buf = Buffer.from(await r.arrayBuffer());
    const png = buf.subarray(1, 4).toString() === "PNG";
    const w = png ? buf.readUInt32BE(16) : 0;
    const h = png ? buf.readUInt32BE(20) : 0;
    check(`NG-03 ${i.src} 200 image/png ${i.sizes}`, r.status === 200 && /image\/png/.test(r.headers.get("content-type") ?? "") && `${w}x${h}` === i.sizes, [r.status, r.headers.get("content-type"), `${w}x${h}`]);
  }
  for (const p of OLD) {
    const r = await fetch(baseUrl + p, { redirect: "manual" });
    check(`NG-05 ${p} gone (404)`, r.status === 404, r.status);
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
writeFileSync(join(out, "no-grok.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` · ${failed.length} FAILED` : ""}`);
process.exit(failed.length ? 1 : 0);
