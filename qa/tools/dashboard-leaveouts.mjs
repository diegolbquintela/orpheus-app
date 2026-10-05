// Dashboard leave-outs (#59, spec §0.3 and §0.7 DR6-01..05, DR0-07) in a real browser, read-only, at phone
// 400 × 860 and desktop 1440 × 900 (plus wide 1024 × 800 with QA_VIEWPORTS=phone,wide,desktop). Signs in with
// QA_EMAIL / QA_PASSWORD (env only; never logged). On /dashboard, with the list, the first row's detail open
// and (phone) the metrics sheet shown, checks the visible text and every control's name:
//  - DR6-01 no "Connect broker" / broker link or button (and no broker-link host such as Plaid or SnapTrade)
//  - DR6-02 no K/M/B amounts (`1.2K`, `3M`, `4 B`), and every number of 4+ digits has thousands separators
//  - DR6-03 no ownership toggle (no switch / checkbox, nothing about ownership or % owned)
//  - DR6-04 no download / export / CSV control or link, no `a[download]`, no blob: link
//  - DR6-05 no instructions: every paragraph is one of the kept single data lines (signed in as, as-of line,
//    out-of-date note, total, excluded line, database status on previews, errors)
//  - DR0-07 no buy / sell / hold / rating / target / undervalued / overvalued / recommendation wording
// An account with no holdings checks the empty page (one line "Add a holding"). Never clicks Edit, Delete or
// Add. Signs out on every exit path (session.mjs). Writes dashboard-leaveouts.json + screenshots to --out.
import { chromium } from "playwright";
import fs from "fs";
import { qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
const CFG = qaConfig(import.meta.url);
const { QA_EMAIL: email, QA_PASSWORD: password } = process.env;
if (!email || !password) {
  console.error("dashboard-leaveouts.mjs needs QA_EMAIL and QA_PASSWORD (a test account on the allow-list)");
  process.exit(2);
}
const R = { base: CFG.baseUrl, checks: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};

// The rules themselves live in leaveouts-rules.mjs, shared with npm test (leaveouts.dom.test.tsx).
import { leaveOutFindings } from "./leaveouts-rules.mjs";

const snapshot = (page) =>
  page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== "hidden";
    const name = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || e.getAttribute("value") || "").replace(/\s+/g, " ").trim();
    return {
      text: main.innerText,
      controls: [...main.querySelectorAll("a, button, input, select, textarea, [role=switch], [role=button], [role=checkbox], [aria-pressed]")]
        .filter(visible)
        .map((e) => ({
          tag: e.tagName.toLowerCase(),
          role: e.getAttribute("role"),
          type: e.getAttribute("type"),
          name: name(e).slice(0, 120),
          href: e.getAttribute("href"),
          download: e.hasAttribute("download"),
          pressed: e.getAttribute("aria-pressed"),
        })),
      paragraphs: [...main.querySelectorAll("p")].filter(visible).map((p) => ({ text: p.innerText.replace(/\s+/g, " ").trim(), alert: p.getAttribute("role") === "alert" || !!p.closest("[role=alert]") })),
    };
  });

const browser = await chromium.launch();
try {
  await eachViewport({ browser, baseUrl: CFG.baseUrl, email, password, check }, async ({ vp, viewport, mobile, page }) => {
    await page.goto(`${CFG.baseUrl}/dashboard`, { waitUntil: "networkidle" });
    const states = [];
    const rows = page.getByTestId("holding-row");
    if (!(await rows.count())) {
      check(`[${vp}] empty state is exactly one line "Add a holding"`, (await page.getByTestId("holdings-empty").innerText()).trim() === "Add a holding");
      states.push(["empty", await snapshot(page)]);
    } else {
      states.push(["list", await snapshot(page)]);
      await rows.first().getByTestId("holding-row-toggle").click();
      states.push(["detail open", await snapshot(page)]);
      await page.screenshot({ path: `${CFG.out}/leaveouts-${vp}.png`, fullPage: true });
      await rows.first().getByTestId("holding-row-toggle").click();
      if (mobile) {
        await page.getByTestId("sheet-switch-metrics").click();
        states.push(["metrics sheet", await snapshot(page)]);
        await page.screenshot({ path: `${CFG.out}/leaveouts-${vp}-metrics.png`, fullPage: true });
        await page.getByTestId("sheet-switch-holdings").click();
      }
    }
    for (const [state, snap] of states) {
      const f = leaveOutFindings(snap);
      for (const id of Object.keys(f)) check(`[${vp}] ${state}: ${id}`, f[id].length === 0, f[id].length ? f[id].slice(0, 5) : undefined);
    }
    check(`[${vp}] no horizontal page scroll`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width);
  });
} finally {
  await browser.close();
}
fs.writeFileSync(`${CFG.out}/dashboard-leaveouts.json`, JSON.stringify(R, null, 2));
const failed = R.checks.filter((c) => !c.ok).length;
console.log(`${failed ? "FAIL" : "PASS"}: ${R.checks.length - failed}/${R.checks.length} · out ${CFG.out}`);
process.exit(failed ? 1 : 0);
