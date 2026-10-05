// Dashboard add holding with an optional average cost (#56, spec §0.7 DR3) in a real browser at phone
// 400 × 860 and desktop 1440 × 900. Signs in with an existing test account (QA_EMAIL / QA_PASSWORD env
// only; never logged), then checks: the add form is one compact row (Ticker, Shares, Average cost marked
// optional, Add; the three inputs share one line and the form is under 100 px tall, so it doesn't push the
// list down), no horizontal scroll; adds QA_ADD_SYMBOL (default MSFT) with a BLANK cost, its detail shows
// average cost, cost and return blank (not 0, n/m, — or NaN) while value and share of the book show; Edit
// enters a cost (1) and cost and return fill; Edit clears it again and they blank again.
// Writes: one add (skipped when the account already holds the symbol with no cost, e.g. a re-run) and two
// edits of that holding's cost. Refuses to touch a symbol the account already holds WITH a cost. Never
// clicks Delete: remove the test holding by hand afterwards if wanted. Writes dashboard-add.json and
// screenshots to --out. Exit 1 on a fail.
import { chromium } from "playwright";
import fs from "fs";
import { qaConfig } from "./config.mjs";
const CFG = qaConfig(import.meta.url);
const { QA_EMAIL: email, QA_PASSWORD: password } = process.env;
const SYMBOL = (process.env.QA_ADD_SYMBOL || "MSFT").trim().toUpperCase();
if (!email || !password) {
  console.error("dashboard-add.mjs needs QA_EMAIL and QA_PASSWORD (a test account on the allow-list)");
  process.exit(2);
}
const R = { base: CFG.baseUrl, symbol: SYMBOL, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const BLANK_IDS = ["holding-avg-cost", "holding-cost", "holding-return"];
const browser = await chromium.launch();
for (const [vp, viewport, mobile] of [["phone", { width: 400, height: 860 }, true], ["desktop", { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const login = await page.request.post(`${CFG.baseUrl}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: CFG.baseUrl } });
  check(`[${vp}] sign-in`, login.ok(), login.status());
  await page.goto(`${CFG.baseUrl}/dashboard`, { waitUntil: "networkidle" });

  // DR3-01 + compact on a phone.
  const form = page.getByTestId("holding-form");
  const shape = await form.evaluate((f) => {
    const inputs = [...f.querySelectorAll("input")];
    const tops = inputs.map((i) => Math.round(i.getBoundingClientRect().top));
    const btn = f.querySelector("button[type=submit]");
    return {
      inputs: inputs.length,
      oneLine: tops.every((t) => t === tops[0]) && Math.abs(Math.round(btn.getBoundingClientRect().bottom) - Math.round(inputs[0].getBoundingClientRect().bottom)) <= 2,
      height: Math.round(f.getBoundingClientRect().height),
      costName: inputs[2]?.getAttribute("aria-label"),
      placeholders: inputs.map((i) => i.getAttribute("placeholder")),
      button: btn?.textContent?.trim(),
      paragraphs: f.querySelectorAll("p").length,
    };
  });
  check(`[${vp}] form = Ticker, Shares, Average cost (optional), Add; no help text`, shape.inputs === 3 && shape.costName === "Average cost (optional)" && shape.button === "Add" && shape.paragraphs === 0 && shape.placeholders.join("|") === "||optional", shape);
  check(`[${vp}] form is one row, under 100 px tall`, shape.oneLine && shape.height < 100, shape);
  check(`[${vp}] no horizontal page scroll`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width);

  // DR3-02: add with a blank cost (or reuse this tool's earlier no-cost holding).
  const row = () => page.locator(`[data-testid="holding-row"][data-symbol="${SYMBOL}"]`);
  const api = await page.request.get(`${CFG.baseUrl}/api/dashboard/holdings`);
  const held = ((await api.json()).holdings ?? []).find((h) => h.symbol === SYMBOL);
  if (held && held.avgCost !== null) {
    check(`[${vp}] ${SYMBOL} is free to use`, false, "already held with a cost; set QA_ADD_SYMBOL to a ticker the account doesn't hold");
    await ctx.close();
    continue;
  }
  if (!held) {
    await page.getByTestId("holding-form-symbol").fill(SYMBOL);
    await page.getByTestId("holding-form-shares").fill("2");
    await page.getByTestId("holding-form-cost").fill("");
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/dashboard/holdings") && r.request().method() === "POST"),
      form.getByRole("button", { name: "Add" }).click(),
    ]);
    const list = await (await page.request.get(`${CFG.baseUrl}/api/dashboard/holdings`)).json().catch(() => ({}));
    const body = { holding: (list.holdings ?? []).find((h) => h.symbol === SYMBOL) };
    check(`[${vp}] add ${SYMBOL} with a blank cost -> 201, avgCost null`, res.status() === 201 && body.holding?.avgCost === null, { status: res.status(), avgCost: body.holding?.avgCost });
    await row().waitFor({ timeout: 20000 }).catch(() => {});
  }
  check(`[${vp}] ${SYMBOL} row on the page`, (await row().count()) === 1);
  if (!(await row().count())) {
    await ctx.close();
    continue;
  }
  await page.screenshot({ path: `${CFG.out}/dashboard-add-${vp}.png`, fullPage: false });
  const detail = row().getByTestId("holding-detail");
  // A saved edit re-mounts the row (closed), so open it again before each look.
  const open = async () => {
    if (!(await detail.isVisible())) await row().getByTestId("holding-row-toggle").click();
    await detail.waitFor({ state: "visible" });
  };
  await open();
  await row().scrollIntoViewIfNeeded();
  const blanks = async () => Object.fromEntries(await Promise.all(BLANK_IDS.map(async (id) => [id, await detail.getByTestId(id).innerText()])));
  const b1 = await blanks();
  check(`[${vp}] no cost: average cost, cost and return blank`, Object.values(b1).every((t) => t.trim() === ""), b1);
  const detailText = await detail.innerText();
  check(`[${vp}] no cost: no NaN, n/m or 0 cost in the detail`, !/NaN|n\/m|undefined|null/.test(detailText), detailText.slice(0, 200));
  check(`[${vp}] no cost: share of the book shows (or a dash while the price is pending)`, /^(\d+\.\d%|—)$/.test((await detail.getByTestId("holding-detail-weight").innerText()).trim()));
  check(`[${vp}] no cost: total still shows`, (await page.getByTestId("holdings-total").count()) === 1 && !/NaN/.test(await page.getByTestId("holdings-total").innerText()));
  await page.screenshot({ path: `${CFG.out}/dashboard-add-${vp}-nocost.png`, fullPage: false });

  // DR3-04: enter a cost, then clear it again (never Delete).
  const edit = async (cost) => {
    await open();
    await detail.getByRole("button", { name: "Edit" }).click();
    await detail.getByLabel(`Average cost of ${SYMBOL}`).fill(cost);
    const [res] = await Promise.all([
      page.waitForResponse((r) => /\/api\/dashboard\/holdings\/\d+$/.test(r.url()) && r.request().method() === "PUT"),
      detail.getByRole("button", { name: "Save" }).click(),
    ]);
    // Read the saved row back through the API (a page response's body can stall while the page reloads).
    const id = res.url().split("/").pop();
    const body = await (await page.request.get(`${CFG.baseUrl}/api/dashboard/holdings/${id}`)).json().catch(() => ({}));
    // Wait for the page's reload to show the saved cost (or its absence), then reopen the row.
    const want = body.holding?.avgCost === null ? "" : "x";
    await page.waitForFunction(([s, w]) => Boolean(document.querySelector(`[data-symbol="${s}"] [data-testid="holding-avg-cost"]`)?.textContent?.trim()) === (w === "x"), [SYMBOL, want], { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
    await open();
    return { status: res.status(), avgCost: body.holding?.avgCost };
  };
  const filled = await edit("1");
  check(`[${vp}] Edit: cost 1 saved`, filled.status === 200 && Number(filled.avgCost) === 1, filled);
  const avg = (await detail.getByTestId("holding-avg-cost").innerText()).trim();
  const cost = (await detail.getByTestId("holding-cost").innerText()).trim();
  check(`[${vp}] cost entered: average cost shows`, /^1 [A-Z]{3}$/.test(avg), avg);
  check(`[${vp}] cost entered: cost and return show (or a dash while the price is pending)`, /^([\d,]+\.\d{2} (CAD|USD|EUR)|—)$/.test(cost) && (await detail.getByTestId("holding-return").innerText()).trim() !== "", { cost });
  await page.screenshot({ path: `${CFG.out}/dashboard-add-${vp}-withcost.png`, fullPage: false });
  const cleared = await edit("");
  check(`[${vp}] Edit: cleared cost saved as null`, cleared.status === 200 && cleared.avgCost === null, cleared);
  const b2 = await blanks();
  check(`[${vp}] cleared: average cost, cost and return blank again`, Object.values(b2).every((t) => t.trim() === ""), b2);
  check(`[${vp}] no horizontal page scroll with the detail open`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width);
  const out = await page.request.post(`${CFG.baseUrl}/api/auth/sign-out`, { data: {}, headers: { origin: CFG.baseUrl } });
  check(`[${vp}] sign-out`, out.ok(), out.status());
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${CFG.out}/dashboard-add.json`, JSON.stringify(R, null, 2));
const failed = R.checks.filter((c) => !c.ok).length;
console.log(`${failed ? "FAIL" : "PASS"}: ${R.checks.length - failed}/${R.checks.length} · out ${CFG.out} · ${SYMBOL} left in the account with no cost (not deleted)`);
process.exit(failed ? 1 : 0);
