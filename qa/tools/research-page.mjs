// Research heatmap (#333, RS). Signed out. Local by default. Refuses production.
//   node qa/tools/research-page.mjs
import { chromium } from "playwright";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { viewportsFromArgv } from "./lib/viewports.mjs";

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
    const grid = await page.locator('[data-testid="rs-cell"]').count();
    const cellOrder = () => page.locator('[data-testid="rs-cell"]').evaluateAll((nodes) => nodes.map((node) => ({
      year: node.getAttribute("data-year"),
      text: node.textContent ?? "",
    })));
    check(`[${vp}] SPY seed grid`, grid >= 30 && (await page.locator('[data-testid="rs-cell"][data-year="1994"]').count()) === 1 && (await page.locator('[data-testid="rs-cell"][data-year="2026"]').innerText()).includes("YTD"), grid);
    const spy = await cellOrder();
    check(`[${vp}] SPY newest first`, spy[0]?.text.includes("YTD") && spy.at(-1)?.year === "1994", [spy[0]?.year, spy.at(-1)?.year]);
    check(`[${vp}] up/down summary`, /^\d+ up, \d+ down$/.test((await page.getByTestId("rs-summary").innerText()).trim()));
    const note = await page.getByTestId("rs-source").evaluate((node) => node.textContent);
    check(`[${vp}] source note`, note === "Market-price total return, dividends reinvested. Source: Yahoo Finance. Fund NAV total return can differ when the close trades at a premium or discount (SPY 1994: +0.4% market vs +1.15% NAV).");
    await page.getByRole("button", { name: "QQQ", exact: true }).click();
    const qqq = await cellOrder();
    check(`[${vp}] QQQ newest first`, qqq[0]?.text.includes("YTD") && qqq.at(-1)?.year === "1999", [qqq[0]?.year, qqq.at(-1)?.year]);
    check(`[${vp}] QQQ partial inception year`, (await page.locator('[data-testid="rs-cell"][data-year="1999"]').innerText()).includes("Partial"));
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
