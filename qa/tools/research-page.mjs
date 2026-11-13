// Research heatmap (#333, RS). Signed out. Local by default. Refuses production.
//   node qa/tools/research-page.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { viewportsFromArgv } from "./lib/viewports.mjs";

// CH52. Counts and the partial years are pinned. The seed is read so a dropped
// row or an unmarked partial year fails before the browser, and the page is
// checked against the same pins.
const SEED = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/lib/research/yearly-returns.seed.json"), "utf8"));
const TICKERS = [
  { name: "SPY", count: 33, oldest: "1994", partial: false },
  { name: "QQQ", count: 28, oldest: "1999", partial: true },
  { name: "VT", count: 19, oldest: "2008", partial: true },
  { name: "UPRO", count: 18, oldest: "2009", partial: true },
  { name: "TQQQ", count: 17, oldest: "2010", partial: true },
];
for (const ticker of TICKERS) {
  const rows = SEED.rows.filter((row) => row.ticker === ticker.name);
  const oldest = rows.find((row) => String(row.year) === ticker.oldest);
  if (rows.length !== ticker.count || !oldest || Boolean(oldest.partial) !== ticker.partial) {
    console.log(`FAIL [seed] ${ticker.name} count/partial · ${JSON.stringify({ rows: rows.length, partial: oldest?.partial })}`);
    process.exit(1);
  }
}
const CFG = qaConfig(import.meta.url);
await refuseIfProd(CFG.baseUrl, "research-page");
const base = CFG.baseUrl;
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};

const browser = await chromium.launch();
try {
  for (const [vp, viewport] of viewportsFromArgv()) {
    const page = await browser.newPage({ viewport });
    const hop = await page.request.get(`${base}/calculator?ticker=KO`, { maxRedirects: 0 });
    const loc = hop.headers()["location"] ?? "";
    check(`[${vp}] /calculator keeps the query on the way to /research/dca`, [301, 302, 307, 308].includes(hop.status()) && /\/research\/dca\?ticker=KO$/.test(loc), [hop.status(), loc]);
    const res = await page.goto(`${base}/research`, { waitUntil: "networkidle" });
    check(`[${vp}] /research 200`, res?.status() === 200, res?.status());
    const cellOrder = () => page.locator('[data-testid="rs-cell"]').evaluateAll((nodes) => nodes.map((node) => ({
      year: node.getAttribute("data-year"),
      text: node.textContent ?? "",
    })));
    check(`[${vp}] up/down summary`, /^\d+ up, \d+ down$/.test((await page.getByTestId("rs-summary").innerText()).trim()));
    const note = await page.getByTestId("rs-source").evaluate((node) => {
      const style = getComputedStyle(node);
      return { text: node.textContent, cls: node.className, transform: style.textTransform, spacing: style.letterSpacing };
    });
    check(`[${vp}] source note`, note.text === "Market-price total return, dividends reinvested. Source: Yahoo Finance. Fund NAV total return can differ when the close trades at a premium or discount (SPY 1994: +0.4% market vs +1.15% NAV)." && !note.cls.split(/\s+/).includes("ow-label") && note.transform === "none" && note.spacing === "normal", note);
    for (const ticker of TICKERS) {
      await page.getByRole("button", { name: ticker.name, exact: true }).click();
      const cells = await cellOrder();
      const oldest = cells.at(-1);
      check(`[${vp}] ${ticker.name} seed count`, cells.length === ticker.count, cells.length);
      check(`[${vp}] ${ticker.name} newest first`, cells[0]?.text.includes("YTD") && oldest?.year === ticker.oldest, [cells[0]?.year, oldest?.year]);
      const marked = oldest?.text.includes("Partial") ?? false;
      check(`[${vp}] ${ticker.name} ${ticker.oldest} partial`, marked === ticker.partial, oldest?.text);
    }
    await page.goto(`${base}/research/dca`, { waitUntil: "networkidle" });
    check(`[${vp}] DCA page unchanged`, (await page.locator("h1").innerText()) === "Dollar-cost average calculator." && (await page.getByText("US, EU and CA listings, one currency per basket.", { exact: true }).count()) === 1);
    const current = await page.locator('nav[aria-label="Site"] [aria-current="page"]').allTextContents();
    check(`[${vp}] DCA Calculator is current`, JSON.stringify(current) === JSON.stringify(["DCA Calculator"]), current);
    await page.close();
  }
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `[research-page] ${failed} failed` : "[research-page] OK");
process.exit(failed ? 1 : 0);
