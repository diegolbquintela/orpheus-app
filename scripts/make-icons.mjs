// #50: render the app icons from public/favicon.svg (the off-white lyre on charcoal). Run: node scripts/make-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
for (const [size, name] of [[180, "icon-180.png"], [512, "icon-512.png"], [180, "apple-touch-icon.png"]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: false });
  await page.close();
}
await browser.close();
