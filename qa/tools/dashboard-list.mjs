// Dashboard holdings list (#55, spec §0.7 DR2) in a real browser at phone 400 × 860 and desktop 1440 × 900.
// Signs in with an existing test account (QA_EMAIL / QA_PASSWORD env only; never logged) that already
// holds at least one priced holding, then checks: no horizontal page scroll at 400 px (DR2-01), each row
// shows exactly name, shares, value in base currency and share of the book (DR2-02), a tap opens the detail
// with the old fields + Edit/Delete and a second tap closes it (DR2-03; nothing is edited or deleted), no
// helper paragraph (DR2-04), the old T07 table is gone (DR2-07), one total and the metrics still reachable.
// An account with no holdings SKIPs the row checks (QA N3: not a FAIL). Signs out at the end of each
// viewport. Read-only apart from the sign-in / sign-out. Writes dashboard-list.json and screenshots to --out.
// Exit 1 on a fail (skips don't fail the run).
import { chromium } from "playwright";
import fs from "fs";
import { qaConfig } from "./config.mjs";
const CFG = qaConfig(import.meta.url);
const { QA_EMAIL: email, QA_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error("dashboard-list.mjs needs QA_EMAIL and QA_PASSWORD (a test account on the allow-list)");
  process.exit(2);
}
const R = { base: CFG.baseUrl, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const skip = (name, detail) => {
  R.checks.push({ name, ok: true, skipped: true, detail });
  console.log(`SKIP ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const signOut = async (page, vp) => {
  const out = await page.request.post(`${CFG.baseUrl}/api/auth/sign-out`, { data: {}, headers: { origin: CFG.baseUrl } });
  check(`[${vp}] sign-out`, out.ok(), out.status());
};
const browser = await chromium.launch();
for (const [vp, viewport, mobile] of [["phone", { width: 400, height: 860 }, true], ["desktop", { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const login = await page.request.post(`${CFG.baseUrl}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: CFG.baseUrl } });
  check(`[${vp}] sign-in`, login.ok(), login.status());
  await page.goto(`${CFG.baseUrl}/dashboard`, { waitUntil: "networkidle" });
  const rows = page.getByTestId("holding-row");
  const n = await rows.count();
  if (!n) {
    skip(`[${vp}] row checks (the account has no holdings; add one first)`, n);
    check(`[${vp}] empty state is one line "Add a holding"`, (await page.getByTestId("holdings-empty").innerText()).trim() === "Add a holding");
    await signOut(page, vp);
    await ctx.close();
    continue;
  }
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${vp}] no horizontal page scroll`, scrollW <= viewport.width, scrollW);
  const toggle = rows.first().getByTestId("holding-row-toggle");
  const fields = await toggle.evaluate((b) => ({ children: b.children.length, ids: ["holding-name", "holding-shares", "holding-value", "holding-weight"].filter((id) => b.querySelector(`[data-testid="${id}"]`)).length }));
  check(`[${vp}] row = name, shares, value, share of the book (exactly four fields)`, fields.children === 4 && fields.ids === 4, fields);
  const value = await rows.first().getByTestId("holding-value").first().innerText();
  check(`[${vp}] value has full digits and a currency code (no K/M/B)`, /^(—|FX pending|[\d,]+\.\d{2} (CAD|USD|EUR))$/.test(value.trim()), value);
  check(`[${vp}] no old table headers`, (await page.locator("th", { hasText: /^(Cost|Market value|Total return|% of portfolio)/ }).count()) === 0);
  check(`[${vp}] no helper paragraph`, !/Average cost is per share|Bank of Canada daily average|daily averages, not/.test(await page.locator("main").innerText()));
  const detail = rows.first().getByTestId("holding-detail");
  check(`[${vp}] detail closed at first`, !(await detail.isVisible()));
  await page.screenshot({ path: `${CFG.out}/dashboard-${vp}.png`, fullPage: true });
  await rows.first().getByTestId("holding-row-toggle").click();
  check(`[${vp}] tap opens the detail`, await detail.isVisible());
  const labels = await detail.locator("dt").allInnerTexts();
  check(`[${vp}] detail fields`, ["Ticker", "Name", "Shares", "Average cost", "Last close", "Return", "Share of the book"].every((l) => labels.map((x) => x.trim().toLowerCase()).includes(l.toLowerCase())), labels);
  check(`[${vp}] Edit and Delete in the detail`, (await detail.getByRole("button", { name: "Edit" }).isVisible()) && (await detail.getByRole("button", { name: "Delete" }).isVisible()));
  check(`[${vp}] no horizontal page scroll with the detail open`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width);
  await page.screenshot({ path: `${CFG.out}/dashboard-${vp}-detail.png`, fullPage: true });
  await rows.first().getByTestId("holding-row-toggle").click();
  check(`[${vp}] second tap closes it`, !(await detail.isVisible()));
  check(`[${vp}] one total`, (await page.getByTestId("holdings-total").count()) === 1 && (await page.getByTestId("holdings-total-cost").count()) === 0);
  check(`[${vp}] metrics sheet on the page (#57)`, (await page.getByTestId("metric-search").count()) === 1);
  await signOut(page, vp);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${CFG.out}/dashboard-list.json`, JSON.stringify(R, null, 2));
const failed = R.checks.filter((c) => !c.ok).length;
const skipped = R.checks.filter((c) => c.skipped).length;
console.log(`${failed ? "FAIL" : "PASS"}: ${R.checks.length - failed - skipped}/${R.checks.length - skipped}${skipped ? ` (${skipped} skipped)` : ""} · out ${CFG.out}`);
process.exit(failed ? 1 : 0);
