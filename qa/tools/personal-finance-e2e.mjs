// Personal Finance end-to-end (#126 adds PF-89: Equity coverage and the 3-month average; #98; #105 adds PF-40..47: toggles, hidden income lines, categories; #112 the month control; #119 PF-67..PF-73, PF-76 the Expenses summary / account filter; spec attachments/personal-finance-spec.md section 17, PFE-01..13): one journey a
// CFO would type, on the preview, at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900.
//
//   Signed out (always): PFE-01 entry points (bar item, home Platforms Open, the URL) end on the sign-in form with
//   ?next=/personal-finance (server 307); PFE-02 the `next` allowlist (evil / protocol-relative / other path dropped,
//   a faked sign-in goes to /dashboard; /personal-finance kept) and the API gate (401 / 405).
//   Signed in (QA_EMAIL / QA_PASSWORD from env, e.g. the EL-named preview account qa-pf@orpheus.test; never logged,
//   never created; through session.mjs's eachViewport, which always signs out): PFE-03 entry points signed in; PFE-04
//   income; PFE-05 Brazilian Dividends 37,000 BRL at 3.70 → 10,000; PFE-06 expenses incl. Condo BRL at 5; PFE-07
//   equity cover + override; PFE-08 Overview / the month control (#112; today fixed at 11 October 2026); PFE-09 Future at growth 5;
//   PFE-10 reload / second device / ?userId 403 / Not saved.; PFE-11 style + strict CLS 0 cold load of the full
//   budget; PFE-13 the QA account's Personal Finance record is RESET before each viewport and left empty.
//   #277 BW1 PFNT: a note on a Fixed line (maxlength 500, counter, Save, reload), a REAL Read user (QA_CFO_READ) sees
//   plain text with no non-GET /api/* (SKIPPED (NOT A PASS) when unset), then qa-pf is reset to its snapshot.
//   #278 CA1 PFSO-23: Saved scenarios sort (name / From cycle, aria-sort, Compare follows), owner + Read user, no writes, reset.
//   #280 PFCH-15..17: chart titles / subtitles on the main page and the scenario screen, Overview 12 months with Future on,
//   Projected path present, no writes; Read user (QA_CFO_READ) or SKIPPED (NOT A PASS); reset.
//   #281 PFWI-11..16: the Scenario what-if note (owner text / Read text, under the title), the Net assets now hint, old
//   strings absent, no writes; Read user (QA_CFO_READ) or SKIPPED (NOT A PASS); reset. Runs before PFCH.
//   #282 PFGR-01/03..08/10: the Growth earned line, the "Count equity coverage as income" box (off, 44 px, on rows with
//   Over "—", existing rows identical, reload off, no writes / storage); Read user (QA_CFO_READ) or SKIPPED; reset.
//   #278: every log line and the JSON artifact mask email addresses as <email> (qa/tools/redact.mjs).
//   PFE-12 (regression) is site-style-regression.mjs's run on the same preview.
// The signed-in part refuses to run against production (it writes to the account).
//
//   QA_EMAIL=… QA_PASSWORD=… [AXE_PATH=…] node qa/tools/personal-finance-e2e.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BASE_URL, qaConfig } from "./config.mjs";
// #278 CA (QA 2026-11-02): every log line and the JSON artifact mask email-shaped strings as <email>.
import { installConsoleMask, maskedJson } from "./redact.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { eachViewport } from "./session.mjs";
import { API, FX_HISTORY_NOTE, PATH, acct, contrastScan, line, pickMonth, ready, settle, shownMonth, totals, trackSaves, txt, val } from "./pf-helpers.mjs";
// #285: the window labels come from the PAGE's pinned clock (TODAY), not the runner's wall clock (qa/tools/pf-window.mjs).
import { avg3Label as avg3At, avg12Label as avg12At, householdMonth } from "./pf-window.mjs";

installConsoleMask();
const CFG = qaConfig(import.meta.url);
// #157 (QA run 2026-10-17 F2, EL): refuse production before any request or sign-in (qa/tools/prod-guard.mjs).
const GUARD = await refuseIfProd(CFG.baseUrl, "personal-finance-e2e");
const base = CFG.baseUrl;
const R = { base, checks: [], shots: [], skipped: [] };
// #276 BV4 (EL): a skipped check is logged loudly and counted, so it is never read as a pass. Names only, never values.
const skip = (name) => { R.skipped.push(name); console.log(`SKIPPED (NOT A PASS): ${name}`); };
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
const TODAY = new Date(2026, 9, 11, 12);
// #285: expected labels and the "current month" follow TODAY, the date page.clock.setFixedTime gives the app.
const avg3Label = () => avg3At(TODAY);
const avg12Label = (withData = 12) => avg12At(TODAY, withData);
const SIGN_IN_NEXT = "/dashboard/sign-in?next=%2Fpersonal-finance";
const shot = async (page, name) => {
  const file = join(CFG.out, name);
  await page.screenshot({ path: file, fullPage: true });
  R.shots.push(file);
};
// PFE-09 / PF-89 (#280 QA r3 CF1, EL): the harness Future formula (monthly x ← x × (1 + g)^(1/12) + average surplus,
// from 10,000 + … = 75,533.33) is the BI2 model and disagrees with the app, so it was removed; the forward net is the
// app's own figure, read back from its coverage line.

let AXE = null;
if (process.env.AXE_PATH) AXE = readFileSync(process.env.AXE_PATH, "utf8");
else console.log("INFO axe-core not run (set AXE_PATH to axe.min.js); the contrast scan covers PFE-11");

// Every figure the journey produces (PFE-10 compares them after a reload and on another device).
async function figures(pg) {
  const rows = await pg.locator("[data-testid=pf-income-line], [data-testid=pf-net-income]").evaluateAll((rs) => rs.map((r) => ["pf-income-label", "pf-income-biweekly", "pf-income-monthly", "pf-income-yearly"].map((id) => r.querySelector(`[data-testid=${id}]`).textContent.trim())));
  const people = await pg.getByTestId("pf-person").evaluateAll((ps) => ps.map((p) => [p.querySelector("[data-testid=pf-person-name]").value, p.querySelector("[data-testid=pf-person-net]").textContent.trim(), p.querySelector("[data-testid=pf-person-converted]")?.textContent.trim() ?? null]));
  const lines = await pg.locator("[data-testid=pf-line]").evaluateAll((ls) => ls.map((l) => [l.querySelector("[data-testid=pf-name]").value, l.querySelector("[data-testid=pf-monthly]").value, l.querySelector("[data-testid=pf-yearly]").value, l.querySelector("[data-testid=pf-currency]").value, l.querySelector("[data-testid=pf-fx]")?.value ?? "—", l.querySelector("[data-testid=pf-share]").textContent.trim(), l.querySelector("[data-testid=pf-income]").textContent.trim(), l.querySelector("[data-testid=pf-equity]").value || l.querySelector("[data-testid=pf-equity]").placeholder, l.querySelector("[data-testid=pf-account]").value, l.querySelector("[data-testid=pf-category]").value]));
  const ov = await pg.evaluate(() => Object.fromEntries(["expenses", "income", "surplus"].map((r) => [r, ["now", "avg"].map((c) => document.querySelector(`[data-testid=pf-ov-${r}] [data-testid=pf-ov-${c}]`)?.textContent.trim())])));
  const chart = await pg.getByTestId("pf-chart").evaluate((f) => ({ months: f.dataset.months, net: f.dataset.netLast }));
  const cats = await pg.getByTestId("pf-cat-row").evaluateAll((rs) => rs.map((r) => ["pf-cat-name", "pf-cat-share", "pf-cat-monthly", "pf-cat-yearly"].map((id) => r.querySelector(`[data-testid=${id}]`).textContent.trim())));
  return {
    household: await pg.getByTestId("pf-household").inputValue(),
    people,
    rows,
    lines,
    totals: { fixed: await totals(pg, "fixed"), variable: await totals(pg, "variable"), all: await totals(pg, "all") },
    used: await txt(pg.getByTestId("pf-rate-used")),
    ov,
    start: await val(pg.getByTestId("pf-start")),
    growth: await val(pg.getByTestId("pf-growth")),
    future: await pg.getByTestId("pf-future-toggle").getAttribute("aria-pressed"),
    chart,
    cats,
  };
}
// #105 (PF-40): the three toggles' aria-expanded and whether each body has content.
const sections = (pg) => pg.evaluate(() => ["income", "expenses", "overview"].map((k) => [k, document.querySelector(`[data-testid=pf-toggle-${k}]`)?.getAttribute("aria-expanded"), document.querySelector(`[data-testid=pf-body-${k}]`)?.children.length > 0]));

const browser = await chromium.launch();
try {
  // ---- Signed out (always) ----
  {
    const r = await fetch(`${base}${PATH}`, { redirect: "manual" });
    const to = new URL(r.headers.get("location") ?? "/x", base);
    check("PFE-01 GET /personal-finance signed out → 307 /dashboard/sign-in?next=%2Fpersonal-finance, X-Robots-Tag noindex", r.status === 307 && to.pathname === "/dashboard/sign-in" && to.search === "?next=%2Fpersonal-finance" && /noindex/i.test(r.headers.get("x-robots-tag") ?? ""), [r.status, r.headers.get("location"), r.headers.get("x-robots-tag")]);
    const calls = [];
    // #157 F7: on production (signed-out prod mode) only the GET is sent.
    for (const method of GUARD.signedOutProd ? ["GET"] : ["GET", "PUT", "DELETE", "POST"]) {
      const a = await fetch(`${base}${API}`, { method, redirect: "manual", headers: method === "PUT" ? { "content-type": "application/json" } : {}, body: method === "PUT" ? '{"data":{}}' : undefined });
      calls.push([method, a.status, await a.text()]);
    }
    if (GUARD.signedOutProd) {
      console.log("INFO signed-out write probes SKIPPED (signed-out prod mode)");
      check("PFE-02 signed out (prod, GET only): /api/personal-finance GET → 401 JSON", calls[0][1] === 401 && calls[0][2] === '{"error":"Unauthorized."}', calls);
    } else check("PFE-02 /api/personal-finance signed out: GET / PUT / DELETE → 401 JSON, POST → 405", calls.slice(0, 3).every(([, st, b]) => st === 401 && b === '{"error":"Unauthorized."}') && calls[3][1] === 405, calls);

    for (const [what, start, click] of [
      ["the bar's Personal Finance item", "/calculator", 'nav[aria-label="Site"] a[href="/personal-finance"]'],
      ["the home Platforms line's Open", "/", '[data-testid="platform-line"][data-href="/personal-finance"] [data-testid="platform-open"]'],
      ["the URL", null, null],
    ]) {
      const page = await browser.newPage();
      try {
        if (start) {
          await page.goto(`${base}${start}`, { waitUntil: "networkidle" });
          // #286: the bar's page links live in the menu overlay; open it first.
          if (click.startsWith('nav[aria-label="Site"]')) await page.getByTestId("site-menu-open").click();
          await page.locator(click).click();
          await page.waitForURL((u) => u.pathname === "/dashboard/sign-in", { timeout: 20000 }).catch(() => {});
          await page.waitForLoadState("networkidle");
        } else await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
        const at = new URL(page.url());
        const got = { path: at.pathname, next: at.searchParams.get("next"), form: await page.getByTestId("sign-in-form").count(), pf: await page.locator("[data-testid=pf-area]").count() };
        check(`PFE-01 signed out, ${what} → the sign-in form with ?next=/personal-finance, no page area`, JSON.stringify(got) === JSON.stringify({ path: "/dashboard/sign-in", next: PATH, form: 1, pf: 0 }), got);
      } finally {
        await page.close().catch(() => {});
      }
    }

    for (const [bad, want] of [["https://evil.example", "/dashboard"], ["//evil.example", "/dashboard"], ["/calculator", "/dashboard"], [PATH, PATH]]) {
      const page = await browser.newPage();
      const navs = [];
      try {
        page.on("request", (q) => { if (q.isNavigationRequest() && q.frame() === page.mainFrame()) navs.push(q.url()); });
        await page.route((u) => u.hostname === "evil.example", (rt) => rt.abort());
        await page.route("**/api/auth/**", (rt) =>
          rt.request().method() === "POST"
            ? rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "fake", redirect: false, user: { id: "fake", email: "fake@example.com", name: "fake", emailVerified: false, image: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }) })
            : rt.fulfill({ status: 200, contentType: "application/json", body: "null" }),
        );
        await page.goto(`${base}/dashboard/sign-in?next=${encodeURIComponent(bad)}`, { waitUntil: "networkidle" });
        const kept = new URL(page.url()).searchParams.get("next");
        const inPage = bad === PATH ? false : await page.evaluate((b) => document.documentElement.outerHTML.includes(b.includes("evil") ? "evil.example" : `next:"${b}"`), bad);
        const startAt = navs.length;
        const form = page.getByTestId("sign-in-form");
        await form.locator("input[type=email]").fill("fake@example.com");
        await form.locator("input[type=password]").fill("fake-password-1");
        await form.locator("button[type=submit]").click();
        await page.waitForTimeout(2500);
        const after = navs.slice(startAt).map((u) => { const x = new URL(u); return x.origin === new URL(base).origin ? x.pathname : x.origin; });
        check(`PFE-02 ?next=${bad}: ${bad === PATH ? "kept" : "dropped on load"}; a faked successful sign-in goes to ${want}`, kept === (bad === PATH ? PATH : null) && !inPage && after[0] === want && !after.some((u) => /evil\.example/.test(u)), { kept, inPage, after });
      } finally {
        await page.close().catch(() => {});
      }
    }
  }

  // ---- Signed in ----
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  const prod = new URL(base).hostname === new URL(DEFAULT_BASE_URL).hostname;
  if (!email || !password) skip("PFE-03..11 (signed in): set QA_EMAIL / QA_PASSWORD in env (the preview QA account, e.g. qa-pf; its Personal Finance record is reset)");
  else if (prod) check("PFE-13 the signed-in part runs on a preview only (it writes to the account): refused on production", false, base);
  else await eachViewport({ browser, baseUrl: base, email, password, check, viewports: VIEWPORTS }, async ({ vp, viewport, mobile, page, ctx }) => {
    const tag = `[${vp}]`;
    const wide = viewport.width >= 1024;
    const errors = [];
    const api = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 80)));
    page.on("request", (q) => { if (new URL(q.url()).pathname.startsWith("/api/") && !new URL(q.url()).pathname.startsWith("/api/auth/")) api.push(`${q.method()} ${new URL(q.url()).pathname}`); });
    trackSaves(page);
    await page.clock.setFixedTime(TODAY);
    try {
      const reset = await acct(page, base, "DELETE");
      check(`${tag} PFE-13 the QA account's Personal Finance record reset`, reset.status === 200, reset.status);

      // PFE-03 entry points, signed in.
      const entry = [];
      for (const [start, click] of [["/calculator", 'nav[aria-label="Site"] a[href="/personal-finance"]'], ["/", '[data-testid="platform-line"][data-href="/personal-finance"] [data-testid="platform-open"]']]) {
        await page.goto(`${base}${start}`, { waitUntil: "networkidle" });
        // #286: the bar's page links live in the menu overlay; open it first.
        if (click.startsWith('nav[aria-label="Site"]')) await page.getByTestId("site-menu-open").click();
        await page.locator(click).click();
        await page.waitForURL((u) => u.pathname === PATH, { timeout: 20000 }).catch(() => {});
        await ready(page).catch(() => {});
        await page.getByTestId("site-menu-open").click();
        entry.push([new URL(page.url()).pathname, await page.locator('nav[aria-label="Site"] [data-testid="site-menu-links"] a[aria-current=page]').allTextContents(), await page.title()]);
        await page.keyboard.press("Escape");
      }
      await page.goto(`${base}${SIGN_IN_NEXT}`, { waitUntil: "networkidle" });
      const direct = new URL(page.url()).pathname;
      await ready(page);
      const empty = await page.locator("[data-testid=pf-line], [data-testid=pf-person]").count();
      check(`${tag} PFE-03 signed in: the bar item and the home Open open /personal-finance (Personal Finance current, title); sign-in?next goes straight there; the reset account is empty`, JSON.stringify(entry) === JSON.stringify([[PATH, ["Personal Finance"], "Personal Finance · Orpheus Wisdom"], [PATH, ["Personal Finance"], "Personal Finance · Orpheus Wisdom"]]) && direct === PATH && empty === 0, { entry, direct, empty });
      await shot(page, `e2e-empty-${viewport.width}.png`);

      // PFE-04 / PFE-05 income.
      for (let i = 0; i < 3; i++) await page.getByTestId("pf-add-person").click();
      const [me, sp, bd] = [0, 1, 2].map((i) => page.getByTestId("pf-person").nth(i));
      await me.getByTestId("pf-person-name").fill("Me");
      await me.getByTestId("pf-person-wages").fill("120,000");
      await me.getByTestId("pf-person-bonus").fill("10");
      await me.getByTestId("pf-person-tax").fill("30");
      await me.getByTestId("pf-person-count-bonus").uncheck();
      await sp.getByTestId("pf-person-name").fill("Spouse");
      await sp.getByTestId("pf-person-wages").fill("80,000");
      await sp.getByTestId("pf-person-bonus").fill("5");
      await sp.getByTestId("pf-person-tax").fill("25");
      await sp.getByTestId("pf-person-share").fill("80");
      await bd.getByTestId("pf-person-name").fill("Brazilian Dividends");
      await bd.getByTestId("pf-person-wages").fill("37,000");
      await bd.getByTestId("pf-person-foreign").check();
      await bd.getByTestId("pf-person-currency").selectOption("BRL");
      const rateLabel = await bd.locator(".pf-foreign .pf-label").allTextContents();
      await bd.getByTestId("pf-person-rate").fill("3.70");
      const f1 = await figures(page);
      check(`${tag} PFE-04 income: Me Net 92,400, Spouse Net 63,000; table Me · Wages 84,000, Spouse · Wages 48,000, Spouse · Bonus 2,400; no uncounted / 0 row (PF-42)`, JSON.stringify(f1.people.slice(0, 2)) === JSON.stringify([["Me", "92,400.00", null], ["Spouse", "63,000.00", null]]) && JSON.stringify(f1.rows.slice(0, 3).map((r) => [r[0], r[3]])) === JSON.stringify([["Me · Wages", "84,000.00"], ["Spouse · Wages", "48,000.00"], ["Spouse · Bonus", "2,400.00"]]) && !f1.rows.some((r) => r[3] === "0.00"), { people: f1.people, rows: f1.rows });
      check(`${tag} PFE-05 Brazilian Dividends 37,000 BRL at 3.70 (FX rate (BRL per 1 CAD)) → Net 37,000, Converted 10,000; its line 384.62 / 833.33 / 10,000; Net income 5,553.85 / 12,033.33 / 144,400`, JSON.stringify(f1.people[2]) === JSON.stringify(["Brazilian Dividends", "37,000.00", "10,000.00"]) && JSON.stringify(rateLabel) === JSON.stringify(["Currency", "FX rate (BRL per 1 CAD)", "Converted (yearly)"]) && JSON.stringify(f1.rows[3]) === JSON.stringify(["Brazilian Dividends · Wages", "384.62", "833.33", "10,000.00"]) && f1.rows.length === 5 && JSON.stringify(f1.rows.at(-1)) === JSON.stringify(["Net income", "5,553.85", "12,033.33", "144,400.00"]) && f1.household === "CAD", { person: f1.people[2], rateLabel, rows: f1.rows.slice(3) });

      // PFE-06 expenses.
      await page.getByTestId("pf-add-fixed").click();
      await page.getByTestId("pf-add-fixed").click();
      await page.getByTestId("pf-add-variable").click();
      const [rent, condo, gifts] = [line(page, "fixed", 0), line(page, "fixed", 1), line(page, "variable", 0)];
      await rent.getByTestId("pf-name").fill("Rent");
      await rent.getByTestId("pf-monthly").fill("1,000");
      await rent.getByTestId("pf-account").selectOption("__add-account__");
      await rent.getByTestId("pf-new-account-input").fill("Chequing");
      await rent.getByTestId("pf-new-account-add").click();
      await condo.getByTestId("pf-name").fill("Condo");
      await condo.getByTestId("pf-monthly").fill("2,000");
      await condo.getByTestId("pf-currency").selectOption("BRL");
      const fxName = await condo.getByTestId("pf-fx").getAttribute("aria-label");
      await condo.getByTestId("pf-fx").fill("5");
      // #170 QA G4 (spec 43.11): the note beside every foreign FX rate field: exact text, inside its line, no overflow.
      const fxNote = await condo.getByTestId("pf-fx-note").evaluate((n) => { const r = n.getBoundingClientRect(); const l = n.closest("[data-testid=pf-line]").getBoundingClientRect(); return { text: n.textContent, inside: r.left >= l.left - 0.5 && r.right <= l.right + 0.5, overflow: n.scrollWidth > n.clientWidth + 1, page: document.documentElement.scrollWidth <= innerWidth }; });
      check(`${tag} PFFX-11 note '${FX_HISTORY_NOTE}' beside Condo's FX field; inside the line, no overflow`, fxNote.text === FX_HISTORY_NOTE && fxNote.inside && !fxNote.overflow && fxNote.page, fxNote);
      await gifts.getByTestId("pf-name").fill("Gifts");
      await gifts.getByTestId("pf-yearly").fill("1,200");
      await gifts.getByTestId("pf-account").selectOption("__add-account__");
      await gifts.getByTestId("pf-new-account-input").fill("Visa");
      await gifts.getByTestId("pf-new-account-add").click();
      const f2 = await figures(page);
      const want6 = {
        lines: [["Rent", "1,000", "12,000.00", "CAD", "—", "66.7%", "8.3%", "—", "Chequing", ""], ["Condo", "2,000", "24,000.00", "BRL", "5", "26.7%", "3.3%", "—", "", ""], ["Gifts", "100.00", "1,200", "CAD", "—", "6.7%", "0.8%", "—", "Visa", ""]],
        totals: { fixed: ["93.3%", "11.6%", "1,400.00", "16,800.00", "—"], variable: ["6.7%", "0.8%", "100.00", "1,200.00", "—"], all: ["100.0%", "12.5%", "1,500.00", "18,000.00", "—"] },
      };
      check(`${tag} PFE-06 expenses: Rent 1,000 (Chequing), Condo 2,000 BRL ÷ 5 = 400, Gifts 1,200 a year (Visa); Fixed 1,400 / 16,800, Variable 100 / 1,200, Total 1,500 / 18,000; % of expenses / income as the spec; Condo's FX field named \`FX rate (BRL per 1 CAD), Fixed 2\``, JSON.stringify({ lines: f2.lines, totals: f2.totals }) === JSON.stringify(want6) && fxName === "FX rate (BRL per 1 CAD), Fixed 2", { lines: f2.lines, totals: f2.totals, fxName });

      // PF-44..46 (#105) categories: Rent and Condo in Home (added inline, reused in any case), Gifts none.
      await rent.getByTestId("pf-category").selectOption("__add-category__");
      await rent.getByTestId("pf-new-category-input").fill("Home");
      await rent.getByTestId("pf-new-category-add").click();
      await condo.getByTestId("pf-category").selectOption("__add-category__");
      await condo.getByTestId("pf-new-category-input").fill("home");
      await condo.getByTestId("pf-new-category-add").click();
      const fc = await figures(page);
      check(`${tag} PF-44 / PF-46 categories: Rent and Condo in Home (reused in any case); By category Home 93.3% / 1,400 / 16,800, No category 6.7% / 100 / 1,200; master totals unchanged`, JSON.stringify(fc.lines.map((l) => l[9])) === '["Home","Home",""]' && JSON.stringify(fc.cats) === JSON.stringify([["Home", "93.3%", "1,400.00", "16,800.00"], ["No category", "6.7%", "100.00", "1,200.00"]]) && JSON.stringify(fc.totals) === JSON.stringify(f2.totals), { cats: fc.cats, lines: fc.lines.map((l) => l[9]), totals: fc.totals });
      await page.getByTestId("pf-filter").selectOption("Home");
      const shown = [await page.locator("[data-testid=pf-group-fixed] [data-testid=pf-line]").count(), await page.locator("[data-testid=pf-group-variable] [data-testid=pf-line]").count()];
      const tf = { fixed: await totals(page, "fixed"), variable: await totals(page, "variable"), all: await totals(page, "all") };
      await page.getByTestId("pf-filter").selectOption("");
      const back = await page.locator("[data-testid=pf-line]").count();
      check(`${tag} PF-45 Filter by category Home: Fixed shows Rent and Condo, Variable none; every total unchanged; All shows the three again`, JSON.stringify(shown) === "[2,0]" && JSON.stringify(tf) === JSON.stringify(f2.totals) && back === 3, { shown, tf, back });
      const cb = await page.evaluate(() => { const r = (sel) => { const b = document.querySelector(`[data-testid=pf-group-fixed] [data-testid=pf-line] ${sel}`).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), h: Math.round(b.height) }; }; return { acct: r("[data-testid=pf-account]"), cat: r("[data-testid=pf-category]"), rm: r("[data-testid=pf-remove]") }; });
      check(`${tag} PF-47 layout: Category ${wide ? "the last column before remove" : "on its own row under Account"}; 44 px`, cb.cat.h >= 44 && (wide ? cb.cat.y === cb.acct.y && cb.cat.x > cb.acct.x && cb.rm.x > cb.cat.x : cb.cat.y > cb.acct.y), cb);

      // #119 (PF-67..PF-73, PF-76): Expenses summary, totals by account, account filter.
      {
        const sumRows = (id) => page.getByTestId(`pf-${id}-row`).evaluateAll((rs, k) => rs.map((r) => [...["name", "share", "monthly", "yearly"].map((c) => r.querySelector(`[data-testid=pf-${k}-${c}]`).textContent.trim()), r.getAttribute("aria-current")]), id);
        const head = await page.getByTestId("pf-summary-block").evaluate((b) => ({ num: b.querySelector(".pf-label")?.textContent, title: b.querySelector("h2")?.textContent, prev: b.previousElementSibling?.getAttribute("data-testid"), next: b.nextElementSibling?.querySelector(".pf-label")?.textContent, inBody: !!document.querySelector("[data-testid=pf-body-expenses] [data-testid=pf-categories]"), inSum: !!b.querySelector("[data-testid=pf-categories]") && !!b.querySelector("[data-testid=pf-accounts]") }));
        check(`${tag} PF-67 / PF-70 Expenses summary: numeral 03, after 03 Expenses, before 04; By account and By category inside it (not in the Expenses body)`, head.num === "03" && head.title === "Expenses summary" && head.prev === "pf-expenses-block" && head.next === "04" && !head.inBody && head.inSum, head);
        const acc0 = await sumRows("acct");
        const wantAcc = [["Chequing", "66.7%", "1,000.00", "12,000.00", null], ["Visa", "6.7%", "100.00", "1,200.00", null], ["No account", "26.7%", "400.00", "4,800.00", null]];
        check(`${tag} PF-69 By account: Chequing 66.7% / 1,000 / 12,000, Visa 6.7% / 100 / 1,200, No account 26.7% / 400 / 4,800 (sum = Total 1,500)`, JSON.stringify(acc0) === JSON.stringify(wantAcc), acc0);
        const opts = await page.getByTestId("pf-acct-filter").evaluate((s) => [...s.options].map((o) => o.textContent));
        await page.getByTestId("pf-acct-filter").selectOption("Visa");
        const shownA = [await page.locator("[data-testid=pf-group-fixed] [data-testid=pf-line]").count(), await page.locator("[data-testid=pf-group-variable] [data-testid=pf-line]").count()];
        const tA = { fixed: await totals(page, "fixed"), variable: await totals(page, "variable"), all: await totals(page, "all") };
        const accA = await sumRows("acct");
        const mark = await page.locator("[data-testid=pf-acct-row][aria-current=true]").evaluate((r) => ({ shadow: getComputedStyle(r).boxShadow, name: getComputedStyle(r.querySelector("[data-testid=pf-acct-name]")).color }));
        check(`${tag} PF-71 / PF-73 Filter by account (All, Chequing, Visa) → Visa: only Gifts shows; every total unchanged`, JSON.stringify(opts) === '["All","Chequing","Visa"]' && JSON.stringify(shownA) === "[0,1]" && JSON.stringify(tA) === JSON.stringify(f2.totals), { opts, shownA, tA });
        check(`${tag} PF-72 Visa's Summary row marked (aria-current, chalk rule, no gold); Chequing and No account still listed with their totals`, JSON.stringify(accA.map((r) => r.slice(0, 4))) === JSON.stringify(wantAcc.map((r) => r.slice(0, 4))) && JSON.stringify(accA.map((r) => r[4])) === '[null,"true",null]' && mark.shadow.includes(CHALK) && mark.name === CHALK, { accA, mark });
        await page.getByTestId("pf-filter").selectOption("Home");
        const both = await page.locator("[data-testid=pf-line]").count();
        const catMark = await page.locator("[data-testid=pf-cat-row][aria-current=true]").getAttribute("data-category").catch(() => null);
        await page.getByTestId("pf-filter").selectOption("");
        await page.getByTestId("pf-acct-filter").selectOption("");
        check(`${tag} PF-71 / PF-72 Visa + Home combine (no line); the Home category row marked; All / All shows the three again`, both === 0 && catMark === "Home" && (await page.locator("[data-testid=pf-line]").count()) === 3, { both, catMark });
        // PF-68 / PF-76: Summary stays visible with Expenses collapsed; toggles alone; stored.
        await page.getByTestId("pf-toggle-expenses").click();
        const col = await page.evaluate(() => { const b = document.querySelector("[data-testid=pf-body-summary]"); const r = b.getBoundingClientRect(); return { exp: document.querySelector("[data-testid=pf-toggle-expenses]").getAttribute("aria-expanded"), expBody: document.querySelector("[data-testid=pf-body-expenses]").children.length, sum: document.querySelector("[data-testid=pf-toggle-summary]").getAttribute("aria-expanded"), rows: b.querySelectorAll("[data-testid=pf-acct-row], [data-testid=pf-cat-row]").length, h: Math.round(r.height), sw: document.documentElement.scrollWidth <= innerWidth, th: Math.round(document.querySelector("[data-testid=pf-toggle-summary]").getBoundingClientRect().height) }; });
        await shot(page, `e2e-summary-${viewport.width}.png`);
        check(`${tag} PF-68 / PF-76 Expenses collapsed: its body empty, the Summary still open with 3 account + 2 category rows; toggle ≥ 44 px; no horizontal scroll`, col.exp === "false" && col.expBody === 0 && col.sum === "true" && col.rows === 5 && col.h > 0 && col.th >= 44 && col.sw, col);
        await page.getByTestId("pf-toggle-summary").click();
        await page.getByTestId("pf-toggle-expenses").click();
        await page.waitForTimeout(1500); // the toggle saves itself; settle() would click Save (#112) early
        const view = (await acct(page, base, "GET")).body?.data?.["orpheus.finance.view.v1"];
        const st = await page.evaluate(() => ({ exp: document.querySelector("[data-testid=pf-toggle-expenses]").getAttribute("aria-expanded"), sum: document.querySelector("[data-testid=pf-toggle-summary]").getAttribute("aria-expanded"), sumBody: document.querySelector("[data-testid=pf-body-summary]").children.length, lines: document.querySelectorAll("[data-testid=pf-line]").length }));
        check(`${tag} PF-68 Summary closed alone (Expenses open, 3 lines); stored as {closed:[summary]}`, st.exp === "true" && st.sum === "false" && st.sumBody === 0 && st.lines === 3 && view === '{"closed":["summary"]}', { st, view });
        await page.getByTestId("pf-toggle-summary").click();
        await page.waitForTimeout(1500); // the toggle saves itself; settle() would click Save (#112) early
      }

      // PFE-07 equity cover.
      await page.getByTestId("pf-roic").fill("8");
      const f3 = await figures(page);
      await rent.getByTestId("pf-equity").fill("250,000");
      const over = { fixed: (await totals(page, "fixed"))[4], all: (await totals(page, "all"))[4] };
      check(`${tag} PFE-07 ROIC 8 → Rate used 4%: Rent 300,000, Condo 120,000, Gifts 30,000 (totals 420,000 / 30,000 / 450,000); Rent override 250,000 → Fixed 370,000, Total 400,000`, f3.used === "4%" && JSON.stringify(f3.lines.map((l) => l[7])) === '["300,000.00","120,000.00","30,000.00"]' && JSON.stringify([f3.totals.fixed[4], f3.totals.variable[4], f3.totals.all[4]]) === '["420,000.00","30,000.00","450,000.00"]' && JSON.stringify(over) === '{"fixed":"370,000.00","all":"400,000.00"}', { used: f3.used, equity: f3.lines.map((l) => l[7]), totals: [f3.totals.fixed[4], f3.totals.variable[4], f3.totals.all[4]], over });

      // PFE-08 Overview and the month control (#112): Save October; June starts as its copy; June saved with one
      // 4,000 expense and one person netting 9,000; back on October.
      const unsaved = (await figures(page)).ov;
      await settle(page);
      const ov0 = (await figures(page)).ov;
      // #143 (PF-133): with October saved, -5 in Rent blocks Save (no PUT, the note, focus on Rent); restored after.
      {
        const amt = rent.getByTestId("pf-monthly");
        const was = await val(amt);
        let puts143 = 0;
        const onReq = (r) => { if (r.method() === "PUT" && new URL(r.url()).pathname === API) puts143++; };
        page.on("request", onReq);
        await amt.fill("-5");
        await page.getByTestId("pf-month-save").click();
        await page.waitForTimeout(800);
        const blocked = { note: await txt(page.getByTestId("pf-month-note")), focus: await amt.evaluate((e) => e === document.activeElement), puts: puts143, now: (await figures(page)).ov.expenses[0], save: await txt(page.getByTestId("pf-save")), unsaved: await page.getByTestId("pf-unsaved").evaluate((e) => (e.getAttribute("data-shown") === "true" ? e.textContent.trim() : "")), figNote: await page.evaluate(() => { const n = document.querySelector("[data-testid=pf-figures-note]"); return n && n.getAttribute("data-shown") === "true" ? n.textContent.trim() : ""; }) };
        page.off("request", onReq);
        await amt.fill(was);
        // #144 (Q-V3 / Q-V7, PF-164 / PF-170): This month is live, so the bad Rent counts 0 (500) while its error shows; not
        // stored (PF-133's reload check is the unit/DOM one); `Not saved.` and `Unsaved changes` stay.
        check(`${tag} PF-133 (#143) -5 in Rent: Save sends no PUT, shows "Fix the fields marked in red before saving.", focus on Rent; #144 This month live 500 (Rent counts 0), \`Not saved.\`, \`Unsaved changes\` and (Q-V3 c) \`Figures leave out fields marked in red.\``, JSON.stringify(blocked) === JSON.stringify({ note: "Fix the fields marked in red before saving.", focus: true, puts: 0, now: "500.00", save: "Not saved.", unsaved: "Unsaved changes", figNote: "Figures leave out fields marked in red." }), blocked);
      }
      await pickMonth(page, "2026-06");
      // #163 (Q-Y6 rejected): June opens blank; the explicit button copies October in.
      const juneBlank = await page.locator("[data-testid=pf-line]").count();
      await page.getByTestId("pf-month-copy").click();
      const note = (await txt(page.getByTestId("pf-month-note")));
      while ((await page.getByTestId("pf-remove").count()) > 0) { page.once("dialog", (d) => void d.accept()); await page.getByTestId("pf-remove").first().click(); }
      while ((await page.getByTestId("pf-remove-person").count()) > 0) { page.once("dialog", (d) => void d.accept()); await page.getByTestId("pf-remove-person").first().click(); }
      await page.getByTestId("pf-add-fixed").click();
      await line(page, "fixed", 0).getByTestId("pf-monthly").fill("4,000");
      await page.getByTestId("pf-add-person").click();
      await page.getByTestId("pf-person-wages").first().fill("108,000");
      await settle(page);
      const juneSaved = { month: await shownMonth(page), save: await page.getByTestId("pf-month-save").count(), note: await txt(page.getByTestId("pf-month-note")) };
      await pickMonth(page, "2026-10");
      await page.getByTestId("pf-start").fill("10,000");
      const f4 = await figures(page);
      const ch = await page.getByTestId("pf-chart").evaluate((f) => ({ lines: f.querySelectorAll(".recharts-line-curve").length, legend: [...f.querySelectorAll(".pf-legend li")].map((l) => l.textContent.trim()) }));
      check(`${tag} PFE-08 (#112) #144 04 is live: the same figures before the first Save as after it (was "— before the first Save"); this month = October saved (1,500 / 12,033.33 / 10,533.33); June blank, then "Copy from current month" ("Copied from October 2026 — edit and save."), saved as 4,000 / 9,000 (stays on June, note gone) → #140 12-month average (12 complete months: June alone) 4,000 / 9,000 / 5,000, — while only October is saved; start 10,000 → 12 months, three lines, net assets 75,533.33`, JSON.stringify(unsaved) === JSON.stringify(ov0) && JSON.stringify(ov0) === JSON.stringify({ expenses: ["1,500.00", "—"], income: ["12,033.33", "—"], surplus: ["10,533.33", "—"] }) && juneBlank === 0 && note === "Copied from October 2026 — edit and save." && JSON.stringify(juneSaved) === JSON.stringify({ month: "2026-06", save: 0, note: "" }) && JSON.stringify(f4.ov) === JSON.stringify({ expenses: ["1,500.00", "4,000.00"], income: ["12,033.33", "9,000.00"], surplus: ["10,533.33", "5,000.00"] }) && f4.chart.months === "12" && f4.chart.net === "75533.33" && ch.lines === 3 && JSON.stringify(ch.legend) === '["Expenses","Income","Net assets"]', { unsaved, ov0, note, juneSaved, ov: f4.ov, chart: f4.chart, ch });

      // #126 PF-89 + C7/C2 (approved 2026-10-13, PF-91..PF-95): Equity coverage (start 10,000 × rate used, ÷ the
      // 3-month average of complete months Jul–Sep, all empty → the 12-month average 4,000 (#140)) and that 3-month average.
      const NUM = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // #142: two decimals (PF-176)
      const rateNow = Number(((await txt(page.getByTestId("pf-rate-used"))) ?? "").replace("%", ""));
      const cov = async () => page.getByTestId("pf-coverage").evaluate((c) => [...c.querySelectorAll("p")].map((p) => p.textContent.trim()));
      const hh = await page.getByTestId("pf-household").inputValue();
      const cv = await cov();
      const yr = (10000 * rateNow) / 100;
      // #129 (PF-104): three lines: amounts, the rate note (smaller) and the source note (smaller).
      const rateTxt = (await txt(page.getByTestId("pf-rate-used"))) ?? "";
      const wantCov = Number.isFinite(rateNow) && rateNow > 0 ? [`Equity coverage: ${NUM.format(yr / 12)} ${hh}/mo (${NUM.format(yr)} ${hh}/yr)`, `* ${rateTxt} yearly, covers ${((yr / 12 / 4000) * 100).toFixed(2)}% of monthly expenses (3-month average, ${avg3Label().slice(17, -1)}).`, "** Coverage rate is derived from Rate Used under Expenses section."] : ["Equity coverage: —", "Set rate under Expenses", "** Coverage rate is derived from Rate Used under Expenses section."];
      const covFont = await page.getByTestId("pf-coverage").evaluate((c) => [...c.querySelectorAll("p")].map((p) => parseFloat(getComputedStyle(p).fontSize)));
      const avg3 = await page.evaluate(() => ["expenses", "income", "surplus"].map((r) => document.querySelector(`[data-testid=pf-ov-${r}] [data-testid=pf-ov-avg3]`)?.textContent.trim()));
      const heads = await page.getByTestId("pf-ov-table").locator("[role=columnheader]").allTextContents();
      const order = await page.evaluate(() => { const t = document.querySelector("[data-testid=pf-ov-table]"); return t.nextElementSibling?.getAttribute("data-testid"); });
      const scroll = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
      check(`${tag} PF-104 (#129) coverage lines 2–3 in a smaller font than line 1 (${covFont.join(" / ")} px)`, covFont.length === 3 && covFont[1] < covFont[0] && covFont[2] < covFont[0], { covFont });
      check(`${tag} PF-89 (#126) Equity coverage directly under the table: start 10,000 × rate used ${rateNow}% → ${wantCov.join(" / ")}`, JSON.stringify(cv) === JSON.stringify(wantCov) && order === "pf-coverage", { cv, wantCov, order });
      check(`${tag} PF-89 (#126) / PF-120 (#132) / PF-128 (#140) This month · 3-month average · ${avg12Label(1)}; C7: ${avg3Label()} = 4,000 / 9,000 / 5,000 (Jul, Aug, Sep empty take the 12-complete-month average, #140 PF-125); no horizontal scroll`, JSON.stringify(heads.map((h) => h.trim()).slice(1)) === JSON.stringify(["This month", avg3Label(), avg12Label(1)]) && JSON.stringify(avg3) === JSON.stringify(["4,000.00", "9,000.00", "5,000.00"]) && scroll <= 0, { heads, avg3, scroll });
      // #184 (spec 44.3, PFEC-04 / PFEC-12): an as-of month = the current Toronto month anchors net assets at the start
      // (net(A−1) = start), so the coverage equals the typed-start line; clearing it restores it exactly.
      const curMonth = householdMonth(TODAY); // #285: the page's current month (pinned clock), not the runner's
      await page.getByTestId("pf-as-of").fill(curMonth);
      const cvAsOf = await cov();
      await page.getByTestId("pf-as-of").fill("");
      const cvCleared = await cov();
      check(`${tag} PFEC-04 (#184) as-of month ${curMonth} (current) → coverage equals the typed-start line; cleared → unchanged`, JSON.stringify(cvAsOf) === JSON.stringify(wantCov) && JSON.stringify(cvCleared) === JSON.stringify(wantCov), { cvAsOf, cvCleared });
      // #160 (spec 45, PFCL-02 / 08 / 12): in a second tab (this page keeps its unsaved state), the Charts list makes
      // exactly one GET /reports and writes nothing; New report disabled; (#162 Q-AL2) each row's name links to its viewer. The PF header links to it.
      {
        const href = await page.getByTestId("pf-charts-link").getAttribute("href");
        const linkBox = await page.getByTestId("pf-charts-link").boundingBox();
        const cp = await page.context().newPage();
        await cp.setViewportSize(viewport);
        const calls = [];
        cp.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) calls.push(`${r.method()} ${u.pathname}`); });
        await cp.goto(`${base}/personal-finance/charts`, { waitUntil: "networkidle" });
        await cp.locator("[data-testid=pf-charts-list], [data-testid=pf-charts-empty], [data-testid=pf-charts-error]").first().waitFor();
        const ch = await cp.evaluate(() => ({ title: document.title, newTag: document.querySelector("[data-testid=pf-charts-new]")?.tagName ?? null, newHref: document.querySelector("[data-testid=pf-charts-new]")?.getAttribute("href") ?? null, newH: Math.round(document.querySelector("[data-testid=pf-charts-new]")?.getBoundingClientRect().height ?? 0), placeholder: document.body.textContent.includes("Builder coming next"), links: [...document.querySelectorAll("[data-testid=pf-charts-list] a, [data-testid=pf-charts-list] button")].filter((a) => !(a.tagName === "A" && a.dataset.testid === "pf-charts-name" && a.getAttribute("href") === `/personal-finance/charts/${a.closest("[data-testid=pf-charts-row]")?.dataset.id}` && a.getBoundingClientRect().height >= 44)).length, nameLinks: document.querySelectorAll("[data-testid=pf-charts-list] a[data-testid=pf-charts-name]").length, rows: document.querySelectorAll("[data-testid=pf-charts-row]").length, error: document.querySelector("[data-testid=pf-charts-error]") !== null, back: document.querySelector("[data-testid=pf-charts-back]")?.getAttribute("href"), backH: Math.round(document.querySelector("[data-testid=pf-charts-back]")?.getBoundingClientRect().height ?? 0), scroll: document.documentElement.scrollWidth - window.innerWidth }));
        const reportCalls = calls.filter((c) => c.includes("/api/personal-finance/report"));
        // #161 QA P1: freeze the list tab's calls before navigating to /new (the listener keeps recording after it).
        const listCalls = [...calls];
        await cp.screenshot({ path: join(CFG.out, `e2e-charts-${viewport.width}.png`) });
        // #161 (spec 46; PFCB-05 / 10 / 18; tap targets): the builder from New report. Read-only here: one pick → one
        // POST /chart preview (stores nothing); no Save, so the QA account keeps no report.
        const bcalls = [];
        cp.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) bcalls.push(`${r.method()} ${u.pathname}`); });
        await cp.getByTestId("pf-charts-new").click();
        await cp.waitForURL(`${base}/personal-finance/charts/new`);
        await cp.getByTestId("pf-builder").waitFor();
        const toggle = cp.getByTestId("pf-builder-series-toggle");
        if (await toggle.isVisible()) await toggle.click();
        await cp.locator("[data-testid=pf-builder-pick][data-kind=metric][data-id=income]").check();
        await cp.getByTestId("pf-builder-figure").waitFor({ timeout: 10000 }).catch(() => {});
        const b = await cp.evaluate(() => {
          const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
          const sel = "[data-testid=pf-builder] input:not([type=checkbox]), [data-testid=pf-builder] select, [data-testid=pf-builder] button, [data-testid=pf-builder] a, [data-testid=pf-builder] summary, .pf-builder-option, [data-testid=pf-builder-back]";
          return {
            title: document.title,
            small: [...document.querySelectorAll(sel)].filter(vis).filter((e) => e.getBoundingClientRect().height < 44).map((e) => `${e.getAttribute("data-testid") ?? e.className}:${Math.round(e.getBoundingClientRect().height)}`),
            figure: !!document.querySelector("[data-testid=pf-builder-figure]"),
            plotH: Math.round(document.querySelector(".pf-builder-plot")?.getBoundingClientRect().height ?? 0),
            vh: window.innerHeight,
            scroll: document.documentElement.scrollWidth - window.innerWidth,
            sections: [...document.querySelectorAll(".pf-builder-section-title")].map((e) => e.textContent),
            save: document.querySelector("[data-testid=pf-builder-save]")?.textContent ?? null,
            exportShown: !!document.querySelector("[data-testid=pf-builder-export]"),
          };
        });
        await cp.screenshot({ path: join(CFG.out, `e2e-builder-${viewport.width}.png`) });
        await cp.close();
        const chartPosts = bcalls.filter((c) => c === "POST /api/personal-finance/chart");
        const narrow = viewport.width < 768;
        check(`${tag} PFCB-05/10/18 (#161) builder: Metrics + Groups listed, one pick → POST /chart preview, Save (no export until saved), no write; ${narrow ? "chart ≥ 60vh" : "side panel"}; no horizontal scroll`, b.sections[0] === "Metrics" && b.sections[1] === "Groups" && chartPosts.length >= 1 && b.figure && b.save === "Save" && !b.exportShown && !bcalls.some((c) => /^(PUT|DELETE) |^POST \/api\/personal-finance\/reports/.test(c)) && (!narrow || b.plotH >= Math.floor(b.vh * 0.6) - 1) && b.scroll <= 0 && b.title === "New report · Report Builder · Orpheus Wisdom", { b, bcalls });
        check(`${tag} #161 tap targets: every builder control ≥ 44 px tall`, b.small.length === 0, b.small);
        // #161 QA P2: cold loads of /new and of an edit page have CLS 0 (every viewport, 390 px included). The edit
        // page needs a saved report: the QA account's own default is written here and deleted after (QA account only;
        // refuseIfProd already ran).
        {
          const api = `${base}/api/personal-finance/reports/default`;
          const put = await page.context().request.put(api, { data: { report: { series: [{ kind: "metric", id: "income" }, { kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" } } });
          const cls = {};
          try {
            for (const path of ["/personal-finance/charts/new", "/personal-finance/charts/default/edit"]) {
              const bp = await page.context().newPage();
              await bp.setViewportSize(viewport);
              await bp.addInitScript(() => {
                window.__cls = 0;
                new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
              });
              await bp.goto(`${base}${path}`, { waitUntil: "networkidle" });
              await bp.locator("[data-testid=pf-builder-figure], [data-testid=pf-builder-problem], [data-testid=pf-builder-preview-error], [data-testid=pf-builder-load-error]").first().waitFor({ timeout: 15000 }).catch(() => {});
              await bp.waitForTimeout(1000);
              cls[path] = await bp.evaluate(() => ({ cls: Math.round(window.__cls * 10000) / 10000, ready: !!document.querySelector("[data-testid=pf-builder]"), figure: !!document.querySelector("[data-testid=pf-builder-figure]") }));
              await bp.close();
            }
          } finally {
            await page.context().request.delete(api);
          }
          check(`${tag} #161 QA P2: cold load CLS 0 on /new and on /default/edit (preview drawn)`, put.status() === 200 && Object.values(cls).every((c) => c.cls === 0 && c.ready) && cls["/personal-finance/charts/default/edit"].figure, { put: put.status(), cls });
        }
        // #160 QA N4 (EL tap-target rule): both links ≥ 44 px tall at every viewport.
        check(`${tag} N4 (#160) tap targets: pf-charts-link ${Math.round(linkBox?.height ?? 0)} px, pf-charts-back ${ch.backH} px, both ≥ 44`, (linkBox?.height ?? 0) >= 44 && ch.backH >= 44, { link: linkBox, backH: ch.backH });
        check(`${tag} PFCL-02/08/12 (#160) Charts: one GET /api/personal-finance/reports, no write, New report enabled → /new (#161 PFCB-02/03), #162 PFCV-02: each row's only link is its name → /personal-finance/charts/<id>, ≥ 44 px, linked both ways`, href === "/personal-finance/charts" && JSON.stringify(reportCalls) === JSON.stringify(["GET /api/personal-finance/reports"]) && !listCalls.some((c) => !c.startsWith("GET ")) && ch.newTag === "A" && ch.newHref === "/personal-finance/charts/new" && ch.newH >= 44 && !ch.placeholder && ch.links === 0 && ch.nameLinks === ch.rows && !ch.error && ch.back === "/personal-finance" && ch.scroll <= 0 && ch.title === "Report Builder · Personal Finance · Orpheus Wisdom", { href, listCalls, ch });
      }
      await page.getByTestId("pf-overview").scrollIntoViewIfNeeded();
      await page.getByTestId("pf-coverage").screenshot({ path: join(CFG.out, `e2e-coverage-${viewport.width}.png`) });

      // PFE-09 Future at a typed growth rate.
      // #280 Q-CH2 (CE3) + QA r3 CF1 (EL): the Overview chart is recorded history ending this month, so it no longer
      // carries the forward net; the harness Future formula (`future()`) is the BI2 model and does NOT agree with the app,
      // so it is not used for an expected value. The forward net is the APP's own figure, read back from its coverage line
      // (net = yearly × 100 / rate); PF-89 then checks the coverage lines are consistent with that net and the 12-month
      // average expenses 4,000. Any check of the forward net's VALUE against a model is BI2 (known, out of scope).
      const covNum = (t, re) => { const m = (t ?? "").match(re); return m ? Number(m[1].replace(/,/g, "")) : NaN; };
      const covNet = async () => (covNum((await cov())[0], /\(([\d,]+\.\d\d) [A-Z]{3}\/yr\)/) * 100) / rateNow;
      const y0 = await page.getByTestId("pf-chart").evaluate((f) => ({ months: f.dataset.months, net: Number(f.dataset.netLast) }));
      await page.getByTestId("pf-growth").fill("5");
      await page.getByTestId("pf-future-toggle").click();
      const y1 = await page.getByTestId("pf-chart").evaluate((f) => ({ months: f.dataset.months, net: Number(f.dataset.netLast) }));
      y1.fwd = await covNet();
      await page.locator("[data-testid=pf-year][data-years='5']").click();
      const y5 = await page.getByTestId("pf-chart").evaluate((f) => ({ months: f.dataset.months, net: Number(f.dataset.netLast) }));
      y5.fwd = await covNet();
      {
        // #126 PF-89: with Future on (5 years) the coverage uses the projected net assets (the app's, above) and the
        // 12-month average expenses 4,000 (#140: 12 complete months). Lines rebuilt from the app's yearly figure.
        const cf = await cov();
        const yr = covNum(cf[0], /\(([\d,]+\.\d\d) [A-Z]{3}\/yr\)/);
        const mo = covNum(cf[0], /: ([\d,]+\.\d\d) [A-Z]{3}\/mo/);
        const pct = covNum(cf[1], /covers ([\d.]+)%/);
        const want = Number.isFinite(rateNow) && rateNow > 0 ? [`Equity coverage in 5 years: ${NUM.format(mo)} ${hh}/mo (${NUM.format(yr)} ${hh}/yr)`, `* ${rateTxt} yearly, covers ${pct.toFixed(2)}% of projected monthly expenses at horizon end (held at 12-month average).`, "** Coverage rate is derived from Rate Used under Expenses section."] : ["Equity coverage in 5 years: —", "Set rate under Expenses", "** Coverage rate is derived from Rate Used under Expenses section."];
        const consistent = !(Number.isFinite(rateNow) && rateNow > 0) || (Math.abs(mo - yr / 12) <= 0.006 && Math.abs(pct - (yr / 12 / 4000) * 100) <= 0.006 && y5.fwd > y1.fwd && y1.fwd > y0.net);
        check(`${tag} PF-89 (#126) Future 5 years: Equity coverage on the app's projected net assets (${Number.isFinite(y5.fwd) ? y5.fwd.toFixed(2) : "—"}, from its coverage line) and the 12-month average expenses 4,000: /mo = /yr ÷ 12, % = /mo ÷ 4,000, 5-year net > 1-year net > today's`, JSON.stringify(cf) === JSON.stringify(want) && consistent, { cf, want, y0: y0.net, y1: y1.fwd, y5: y5.fwd });
      }
      check(`${tag} PFE-09 growth 5 (#280 Q-CH2): the Overview chart stays at the 12 recorded months ending this month for 1 and 5 years, with the same last net as Future off (${y0.net.toFixed(2)})`, y0.months === "12" && y1.months === "12" && y5.months === "12" && y1.net === y0.net && y5.net === y0.net, { y0, y1, y5 });
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await shot(page, `e2e-full-${viewport.width}.png`);
      await page.getByTestId("pf-overview").scrollIntoViewIfNeeded();
      await page.locator("section[aria-labelledby=pf-overview]").screenshot({ path: join(CFG.out, `e2e-overview-${viewport.width}.png`) });

      // PFE-11 style on the full page.
      const sh = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Site"]');
        const home = nav.querySelector('[data-testid="site-bar"] a[data-testid="site-logo"]');
        return {
          bg: getComputedStyle(document.body).backgroundColor,
          color: getComputedStyle(document.body).color,
          scheme: getComputedStyle(document.documentElement).colorScheme,
          lyre: home.firstElementChild?.tagName.toLowerCase() === "svg" && home.firstElementChild.getAttribute("aria-hidden") === "true",
          footer: document.querySelector("footer")?.textContent.trim(),
          robots: document.querySelector("meta[name=robots]")?.content,
          analytics: document.querySelectorAll('script[src*="/_vercel/insights/script.js"], script[src*="va.vercel-scripts.com"]').length,
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          gold: [...document.querySelectorAll("body *")].filter((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.borderColor, e.getAttribute("stroke") ?? "", e.getAttribute("fill") ?? ""].some((v) => /gold|rgb\(2[0-4]\d, 1[6-9]\d, [0-9]{1,2}\)|#c9a|#d4af/i.test(v)); }).length,
        };
      });
      const hdr = await page.evaluate(async (u) => (await fetch(u)).headers.get("x-robots-tag"), PATH);
      const scan = await contrastScan(page);
      check(`${tag} PFE-11 the full page: charcoal / chalk / dark scheme, the lyre, footer Orpheus Wisdom, no gold, noindex meta + X-Robots-Tag, one Analytics script, no horizontal scroll, AA for every text`, sh.bg === NIGHT && sh.color === CHALK && sh.scheme === "dark" && sh.lyre && sh.footer === "Orpheus Wisdom" && sh.gold === 0 && /noindex/.test(sh.robots ?? "") && /noindex/.test(hdr ?? "") && sh.analytics === 1 && sh.scroll <= 0 && scan.bad.length === 0, { ...sh, hdr, bad: scan.bad });
      if (AXE) {
        await page.addScriptTag({ content: AXE });
        const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast", "label", "select-name", "button-name", "aria-valid-attr-value", "label-content-name-mismatch"] } })).violations.map((x) => ({ id: x.id, nodes: x.nodes.length, html: x.nodes[0]?.html.slice(0, 80) })));
        check(`${tag} PFE-11 axe-core on the full page: no violation`, v.length === 0, v);
      }

      // PFE-10 persistence: reload, another device, ?userId, Not saved.
      await settle(page);
      const before = await figures(page);
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      const reloaded = await figures(page);
      check(`${tag} PFE-10 a reload shows every figure unchanged (from the account; Future on at 5 years; #280: chart at the 12 recorded months)`, JSON.stringify(reloaded) === JSON.stringify(before) && before.future === "true" && before.chart.months === "12", { before, reloaded: JSON.stringify(reloaded) === JSON.stringify(before) ? "same" : reloaded });
      let other = null;
      await eachViewport({ browser, baseUrl: base, email, password, check: (n, ok, d) => check(`${tag} PFE-10 second device ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: p2 }) => {
        await p2.clock.setFixedTime(TODAY);
        await p2.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
        await ready(p2);
        other = await figures(p2);
      });
      check(`${tag} PFE-10 a second signed-in browser context (another device) shows the same figures`, JSON.stringify(other) === JSON.stringify(before), other);
      const peek = await acct(page, base, "GET", undefined, `${API}?userId=someone-else`);
      check(`${tag} PFE-10 GET /api/personal-finance?userId=<anyone else> → 403`, peek.status === 403, peek.status);
      await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await ready(page);
      await page.route(`**${API}`, (rt) => (rt.request().method() === "PUT" ? rt.abort() : rt.continue()));
      await page.getByTestId("pf-person").nth(0).getByTestId("pf-person-name").fill("Me 2");
      await page.getByTestId("pf-month-save").click();
      await page.waitForTimeout(1200);
      const failed = await txt(page.getByTestId("pf-save"));
      await page.unroute(`**${API}`);
      await settle(page);
      await page.getByTestId("pf-person").nth(0).getByTestId("pf-person-name").fill("Me");
      await settle(page);
      const cleared = await txt(page.getByTestId("pf-save"));
      check(`${tag} PFE-10 an aborted Save shows \`Not saved.\`; the next Save clears it`, failed === "Not saved." && cleared === "", { failed, cleared });

      // PFE-11 strict CLS 0 on a cold load of the full budget (a new page, cache disabled).
      const coldLoads = async () => {
        const runs = [];
        for (let i = 0; i < Number(process.env.CLS_RUNS ?? 2); i++) {
          const p3 = await ctx.newPage();
          try {
            await p3.clock.setFixedTime(TODAY);
            const cdp = await ctx.newCDPSession(p3);
            await cdp.send("Network.enable");
            await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
            await p3.addInitScript(() => {
              window.__shifts = [];
              new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__shifts.push(e.value); }).observe({ type: "layout-shift", buffered: true });
            });
            await p3.goto(`${base}${PATH}`, { waitUntil: "load" });
            await p3.waitForTimeout(1500);
            runs.push(await p3.evaluate(() => ({ cls: window.__shifts.reduce((a, b) => a + b, 0), lines: document.querySelectorAll("[data-testid=pf-line], [data-testid=pf-person]").length })));
          } finally {
            await p3.close().catch(() => {});
          }
        }
        return runs;
      };
      const runs = await coldLoads();
      check(`${tag} PFE-11 page CLS exactly 0 on cold loads of the full budget (3 lines, 3 people)`, runs.length > 0 && runs.every((r) => r.cls === 0 && r.lines === 6), runs);

      // PF-40 / PF-41 (#105) section toggles: close Income and Overview from their headings; stored on the account;
      // a reload and another device show them closed; CLS 0 with them closed; figures untouched.
      const open0 = await sections(page);
      await page.getByTestId("pf-toggle-income").click();
      await page.getByTestId("pf-toggle-overview").press("Enter");
      const closed = await sections(page);
      const tb = await page.getByTestId("pf-toggle-expenses").evaluate((e) => Math.round(e.getBoundingClientRect().height));
      await settle(page);
      const rec = (await acct(page, base, "GET")).body?.data ?? {};
      await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await ready(page);
      const afterReload = await sections(page);
      const want = [["income", "false", false], ["expenses", "true", true], ["overview", "false", false]];
      check(`${tag} PF-40 / PF-41 Income and Overview closed from their headings (click / Enter; Expenses open; heading buttons ≥ 44 px); stored as orpheus.finance.view.v1 {closed:[income,overview]}; a reload keeps them closed`, JSON.stringify(open0) === JSON.stringify([["income", "true", true], ["expenses", "true", true], ["overview", "true", true]]) && JSON.stringify(closed) === JSON.stringify(want) && tb >= 44 && rec["orpheus.finance.view.v1"] === '{"closed":["income","overview"]}' && JSON.stringify(afterReload) === JSON.stringify(want) && (await page.evaluate(() => localStorage.length)) === 0, { open0, closed, tb, view: rec["orpheus.finance.view.v1"], afterReload });
      let other2 = null;
      await eachViewport({ browser, baseUrl: base, email, password, check: (n, ok, d) => check(`${tag} PF-41 second device ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: p2 }) => {
        await p2.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
        await ready(p2);
        other2 = await sections(p2);
      });
      check(`${tag} PF-41 a second signed-in device shows Income and Overview closed`, JSON.stringify(other2) === JSON.stringify(want), other2);
      const runs2 = await coldLoads();
      check(`${tag} PF-41 / PF-47 page CLS exactly 0 on cold loads with Income and Overview restored closed (3 lines, no person shown)`, runs2.length > 0 && runs2.every((r) => r.cls === 0 && r.lines === 3), runs2);
      await shot(page, `e2e-closed-${viewport.width}.png`);
      await page.getByTestId("pf-toggle-income").click();
      await page.getByTestId("pf-toggle-overview").click();
      await settle(page);
      // #276 (spec §81, PFPA-01..08; QA BV1 / BV2 / BV3). BV2: the server keeps a plan only for a month AFTER its REAL
      // month (mergePlansText), so a plan saved under the pinned page clock is dropped. Primary path: with the page
      // clock at the real time, save the month after the real month (computed, never hardcoded), then move the page
      // clock into that month so it is the current month with a plan. Fallback, only when that save did not store a
      // plan: inject a plan for the page's current month into the record GET (page.route, this page only). At the end
      // the step resets the account to its record from before the step (DELETE, then PUT; the script's own pattern),
      // which removes the plan it created and restores the view value.
      const PLANS = "orpheus.finance.plans.v1";
      const snap = { ...((await acct(page, base, "GET")).body?.data ?? {}) };
      delete snap[PLANS];
      const realNow = new Date();
      const [ry, rm] = householdMonth(realNow).split("-").map(Number);
      const nextY = rm === 12 ? ry + 1 : ry, nextM = rm === 12 ? 1 : rm + 1;
      const nextMonth = `${nextY}-${String(nextM).padStart(2, "0")}`;
      let viaSave = false;
      try {
        await page.clock.setFixedTime(realNow);
        await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
        await ready(page);
        await pickMonth(page, nextMonth);
        await page.getByTestId("pf-month-save").click();
        await settle(page);
        const stored = (await acct(page, base, "GET")).body?.data?.[PLANS];
        viaSave = !!JSON.parse(stored ?? "{}")[nextMonth];
      } catch { viaSave = false; }
      const pvMonth = viaSave ? nextMonth : householdMonth(TODAY);
      await page.clock.setFixedTime(viaSave ? new Date(nextY, nextM - 1, 11, 12) : TODAY);
      const pvRoute = { inject: !viaSave };
      const injectPlan = async (route) => {
        const req = route.request();
        if (req.method() !== "GET" || new URL(req.url()).pathname !== API) return route.continue();
        const res = await route.fetch();
        const body = await res.json().catch(() => null);
        if (body?.data && pvRoute.inject) {
          const months = (() => { try { return JSON.parse(body.data["orpheus.finance.months.v1"] ?? "{}"); } catch { return {}; } })();
          if (months[pvMonth]) {
            const [y, m] = pvMonth.split("-").map(Number);
            body.data[PLANS] = JSON.stringify({ [pvMonth]: { lines: months[pvMonth], capturedAt: new Date(Date.UTC(y, m - 1, 0, 12)).toISOString() } });
          }
        }
        return body ? route.fulfill({ response: res, json: body }) : route.fulfill({ response: res });
      };
      await page.route(`**${API}*`, injectPlan);
      const VIEW = "orpheus.finance.view.v1";
      const viewOf = async () => { const v = ((await acct(page, base, "GET")).body?.data ?? {})[VIEW]; try { return JSON.parse(v ?? "null")?.closed ?? []; } catch { return null; } };
      const rows = () => page.locator("[data-testid=pf-plan] tbody tr").evaluateAll((rs) => rs.map((r) => [...r.children].map((c) => c.textContent)));
      const t = page.getByTestId("pf-toggle-plan");
      const pv = {};
      // BV3: another entry in the view value must survive the plan toggle.
      await page.getByTestId("pf-toggle-overview").click();
      await settle(page);
      await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await ready(page);
      pv.shown = await page.getByTestId("pf-plan").count();
      if (pv.shown) {
        pv.heads = await page.locator("[data-testid=pf-plan] thead th").allTextContents();
        pv.note = await txt(page.getByTestId("pf-plan-note"));
        pv.saidNow = /\bnow\b/i.test(await txt(page.getByTestId("pf-plan")));
        pv.rows0 = await rows();
        pv.open0 = await t.getAttribute("aria-expanded");
        pv.h = await t.evaluate((e) => Math.round(e.getBoundingClientRect().height));
        await t.click();
        await settle(page);
        pv.closed = await t.getAttribute("aria-expanded");
        pv.bodyKids = await page.getByTestId("pf-body-plan").evaluate((e) => e.children.length);
        pv.viewClosed = await viewOf();
        await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
        await ready(page);
        pv.afterReload = await t.getAttribute("aria-expanded");
        await t.click();
        await settle(page);
        pv.reopened = await t.getAttribute("aria-expanded");
        pv.rows1 = await rows();
        pv.viewOpen = await viewOf();
        // BV4 / BV5: a REAL Read user in a second browser context (readOnly comes from the session at load). Creds from
        // env like QA_EMAIL / QA_PASSWORD; never printed. The owner's record is read before and after as raw text.
        const rEmail = process.env.QA_CFO_READ_EMAIL, rPassword = process.env.QA_CFO_READ_PASSWORD;
        if (!rEmail || !rPassword) {
          pv.readSkipped = true;
          skip(`${tag} PFPA Read-user check, QA_CFO_READ unset (set QA_CFO_READ_EMAIL / QA_CFO_READ_PASSWORD)`);
        } else {
          const ownerRaw = () => page.evaluate(async (u) => await (await fetch(u)).text(), API);
          pv.ownerBefore = await ownerRaw();
          await eachViewport({ browser, baseUrl: base, email: rEmail, password: rPassword, check: (n, ok, d) => check(`${tag} PFPA Read user ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: rp }) => {
            await rp.clock.setFixedTime(viaSave ? new Date(nextY, nextM - 1, 11, 12) : TODAY);
            if (pvRoute.inject) await rp.route(`**${API}*`, injectPlan);
            await rp.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
            await rp.locator("[data-testid=pf-area][data-ready=true]").waitFor();
            const rt = rp.getByTestId("pf-toggle-plan");
            pv.readShown = await rp.getByTestId("pf-plan").count();
            pv.readField = await rp.getByTestId("pf-monthly").first().isDisabled().catch(() => null);
            const rRows = () => rp.locator("[data-testid=pf-plan] tbody tr").evaluateAll((rs) => rs.map((r) => [...r.children].map((c) => c.textContent)));
            pv.readRows0 = await rRows();
            const writes = [];
            const onReq = (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && q.method() !== "GET") writes.push(`${q.method()} ${u.pathname}`); };
            rp.on("request", onReq);
            await rt.click();
            pv.readClosed = await rt.getAttribute("aria-expanded");
            await rt.click();
            pv.readReopened = await rt.getAttribute("aria-expanded");
            await rp.waitForTimeout(1500); // past the save debounce: any write would have been sent
            rp.off("request", onReq);
            pv.readWrites = writes;
            pv.readRows1 = await rRows();
          });
          pv.ownerSame = (await ownerRaw()) === pv.ownerBefore;
          delete pv.ownerBefore; // not logged
          check(`${tag} PFPA Read user (second context, QA_CFO_READ): sees the plan read-only, closes / reopens it; NO non-GET request to /api/* (no PUT ${API}/view); the owner's record byte-identical before / after; numbers unchanged`,
            pv.readShown === 1 && pv.readField === true && pv.readClosed === "false" && pv.readReopened === "true" && pv.readWrites?.length === 0 &&
              pv.ownerSame === true && pv.readRows0?.length >= 3 && JSON.stringify(pv.readRows1) === JSON.stringify(pv.readRows0) && JSON.stringify(pv.readRows0) === JSON.stringify(pv.rows0),
            { readShown: pv.readShown, readField: pv.readField, readClosed: pv.readClosed, readReopened: pv.readReopened, readWrites: pv.readWrites, ownerSame: pv.ownerSame });
        }
      }
      await page.unroute(`**${API}*`, injectPlan);
      check(`${tag} PFPA-01..08 Planned vs actual (${pvMonth} plan ${viaSave ? "saved as next month" : "injected into the GET (fallback)"}): heading toggle ≥ 44 px open → closed (body empty) → stays closed after a reload → reopened; the view value holds "plan" with "overview" while closed and only "overview" after reopening; numbers identical across close / reopen; heads "Planned (set before the month)" / "Actual (as saved)"; note "Actual = what is saved."; no "now" in the section`,
        pv.shown === 1 && pv.open0 === "true" && pv.h >= 44 && pv.closed === "false" && pv.bodyKids === 0 && pv.afterReload === "false" && pv.reopened === "true" &&
          JSON.stringify(pv.viewClosed) === '["plan","overview"]' && JSON.stringify(pv.viewOpen) === '["overview"]' &&
          pv.rows0?.length >= 3 && JSON.stringify(pv.rows1) === JSON.stringify(pv.rows0) &&
          pv.heads?.[1] === "Planned (set before the month)" && pv.heads?.[2] === "Actual (as saved)" &&
          /Actual = what is saved\. Difference/.test(pv.note ?? "") && pv.saidNow === false,
        { viaSave, pvMonth, ...pv });
      // Reset: the account back to its record from before the step (removes the plan this step created, restores the
      // view value), then the pinned clock again.
      await page.clock.setFixedTime(TODAY);
      const del = await acct(page, base, "DELETE");
      const put = await acct(page, base, "PUT", snap);
      const after = (await acct(page, base, "GET")).body?.data ?? {};
      check(`${tag} PFPA reset: the record is back to its pre-step value (no ${PLANS}, the view value restored)`, del.status === 200 && put.status === 200 && !(PLANS in after) && after["orpheus.finance.view.v1"] === snap["orpheus.finance.view.v1"], { del: del.status, put: put.status, plans: PLANS in after, view: after["orpheus.finance.view.v1"] });
      // #277 BW1 (spec §82, AC PFNT-01..09): a signed-in note on a Fixed line. Real clock (the server's month), so the
      // Save lands in the real current month. 501st character refused (maxlength 500, counter from 400); Save, reload,
      // stored and shown; a REAL Read user (QA_CFO_READ, BV4 pattern) sees plain text and sends no non-GET /api/*.
      // Reset at the end: snapshot → DELETE → PUT the snapshot → verify byte-identical.
      {
        const NOTE = "QA PFNT note: lease ends in June";
        const snapN = { ...((await acct(page, base, "GET")).body?.data ?? {}) };
        const nt = {};
        try {
          await page.clock.setFixedTime(new Date());
          await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
          await ready(page);
          const row = line(page, "fixed", 0);
          nt.lines = await page.locator("[data-testid=pf-group-fixed] [data-testid=pf-line]").count();
          const toggle = row.getByTestId("pf-note-toggle");
          nt.toggleH = await toggle.evaluate((e) => Math.round(e.getBoundingClientRect().height));
          nt.closed = await toggle.getAttribute("aria-expanded");
          nt.label = [await txt(toggle), await toggle.getAttribute("aria-label")];
          await toggle.click();
          nt.open = await toggle.getAttribute("aria-expanded");
          // BX2: aria-controls names the opened note row, which holds the textarea.
          nt.controls = await toggle.evaluate((b) => { const t = document.getElementById(b.getAttribute("aria-controls") ?? ""); return !!t && !!t.querySelector("[data-testid=pf-note]"); });
          const area = page.getByTestId("pf-note").first();
          nt.maxlength = await area.getAttribute("maxlength");
          await area.fill("a".repeat(10));
          nt.countShort = await page.getByTestId("pf-note-count").count();
          // BX2: the counter boundary: hidden at 399, shown at 400.
          await area.fill("a".repeat(399));
          nt.count399 = await page.getByTestId("pf-note-count").count();
          await area.fill("a".repeat(400));
          nt.count400 = await page.getByTestId("pf-note-count").count();
          await area.fill("a".repeat(499));
          await area.pressSequentially("bc"); // the 501st character is refused by maxlength
          nt.len = (await area.inputValue()).length;
          nt.countLong = await txt(page.getByTestId("pf-note-count").first()).catch(() => null);
          await area.fill(NOTE);
          await page.getByTestId("pf-month-save").click();
          await settle(page);
          const rec = (await acct(page, base, "GET")).body?.data ?? {};
          const exp = (() => { try { return JSON.parse(rec["orpheus.finance.expenses.v2"] ?? "{}"); } catch { return {}; } })();
          const mon = (() => { try { return JSON.parse(rec["orpheus.finance.months.v1"] ?? "{}"); } catch { return {}; } })();
          nt.storedExpenses = exp.fixed?.[0]?.note === NOTE;
          nt.storedMonth = mon[householdMonth(new Date())]?.fixed?.[0]?.note === NOTE;
          await page.reload({ waitUntil: "networkidle" });
          await ready(page);
          nt.dot = await row.getByTestId("pf-note-toggle").getAttribute("data-has-note");
          nt.labelAfter = await row.getByTestId("pf-note-toggle").getAttribute("aria-label");
          nt.preview = mobile ? null : await txt(row.getByTestId("pf-note-preview")).catch(() => null);
          await row.getByTestId("pf-note-toggle").click();
          nt.reloaded = await page.getByTestId("pf-note").first().inputValue();
          await row.getByTestId("pf-note-toggle").click();
          check(`${tag} PFNT-01/04/06 signed in: note toggle "Note" ≥ 44 px (aria-label "Note, …", aria-expanded false → true, aria-controls → the note row; "(has a note)" after Save), maxlength 500 refuses the 501st character, counter hidden at 399 and shown from 400, Save, reload: the note is stored (expenses + the real current month) and shown (dot${mobile ? "" : ", preview"}, textarea)`,
            nt.lines >= 1 && nt.toggleH >= 44 && nt.closed === "false" && nt.open === "true" && nt.label[0] === "Note" && /^Note, /.test(nt.label[1] ?? "") && !/has a note/.test(nt.label[1] ?? "") && nt.controls === true &&
              /\(has a note\)$/.test(nt.labelAfter ?? "") && nt.count399 === 0 && nt.count400 === 1 && nt.maxlength === "500" && nt.len === 500 && nt.countShort === 0 && /500/.test(nt.countLong ?? "") &&
              nt.storedExpenses && nt.storedMonth && nt.dot === "true" && (mobile || nt.preview === NOTE) && nt.reloaded === NOTE, nt);
          // Read user (BV4 pattern): creds from env, never printed; loud skip when unset.
          const rEmail = process.env.QA_CFO_READ_EMAIL, rPassword = process.env.QA_CFO_READ_PASSWORD;
          if (!rEmail || !rPassword) skip(`${tag} PFNT-05 Read-user note view, QA_CFO_READ unset (set QA_CFO_READ_EMAIL / QA_CFO_READ_PASSWORD)`);
          else {
            const rd = {};
            // BX2: the owner's record as raw text before / after the Read session (compared, never logged).
            const ownerRaw = () => page.evaluate(async (u) => await (await fetch(u)).text(), API);
            const ownerBefore = await ownerRaw();
            await eachViewport({ browser, baseUrl: base, email: rEmail, password: rPassword, check: (n, ok, d) => check(`${tag} PFNT Read user ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: rp }) => {
              const writes = [];
              rp.on("request", (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && q.method() !== "GET") writes.push(`${q.method()} ${u.pathname}`); });
              await rp.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
              await rp.locator("[data-testid=pf-area][data-ready=true]").waitFor();
              const rRow = rp.locator("[data-testid=pf-group-fixed] [data-testid=pf-line]").first();
              rd.text = await rRow.getByTestId("pf-note-text").textContent().catch(() => null);
              rd.textareas = await rp.getByTestId("pf-note").count();
              rd.toggles = await rp.getByTestId("pf-note-toggle").count();
              await rp.waitForTimeout(1500);
              rd.writes = writes;
            });
            rd.ownerSame = (await ownerRaw()) === ownerBefore;
            check(`${tag} PFNT-05 Read user (second context, QA_CFO_READ): the note is plain text, no textarea / toggle; NO non-GET request to /api/*; the owner's record byte-identical before / after`,
              (rd.text ?? "").includes(NOTE) && rd.textareas === 0 && rd.toggles === 0 && rd.writes?.length === 0 && rd.ownerSame === true, { textareas: rd.textareas, toggles: rd.toggles, writes: rd.writes, shown: (rd.text ?? "").includes(NOTE), ownerSame: rd.ownerSame });
          }
        } catch (e) {
          check(`${tag} PFNT step ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
        } finally {
          await page.clock.setFixedTime(TODAY);
          const d = await acct(page, base, "DELETE");
          const p = await acct(page, base, "PUT", snapN);
          const back = (await acct(page, base, "GET")).body?.data ?? {};
          const same = JSON.stringify(Object.keys(back).sort()) === JSON.stringify(Object.keys(snapN).sort()) && Object.keys(snapN).every((k) => back[k] === snapN[k]);
          check(`${tag} PFNT reset: qa-pf back to its pre-step record (DELETE, PUT the snapshot, every value byte-identical)`, d.status === 200 && p.status === 200 && same, { del: d.status, put: p.status, same });
        }
      }
      // #278 CA1 (spec §83, AC PFSO-23): signed-in Saved scenarios sort on /personal-finance/scenario. Real clock. Seeds 4
      // saved scenarios with ties (Éclair = Eclair; From month twice), cycles Scenario name and From ascending →
      // descending → saved order, checks aria-sort, that Select / Actions are not sortable, that Compare follows the sort
      // (saved order with none), and that sorting sends no non-GET /api/* and leaves the owner's record byte-identical
      // (raw text compared, never logged). A REAL Read user (QA_CFO_READ) repeats the cycle read-only; SKIPPED (NOT A PASS)
      // when unset. Reset at the end: snapshot → DELETE → PUT the snapshot → verify byte-identical.
      {
        const SCN = "orpheus.finance.scenario.v1";
        const SCEN_PATH = "/personal-finance/scenario";
        const snapS = { ...((await acct(page, base, "GET")).body?.data ?? {}) };
        const so = {};
        const ym = (k) => householdMonth(new Date(Date.now() - k * 31 * 86400000));
        const ent = (id, name, basis, inc) => ({ id, name, basis, savedAt: new Date().toISOString(), inputs: { start: 0, income: inc, expenses: 3000, growth: 5, rate: null }, values: {}, lines: "{}" });
        const [mNew, mOld] = [ym(1), ym(3)];
        // Saved order: s0 Delta (new), s1 alpha 2 (old), s2 Éclair (new), s3 Eclair (old).
        const SAVED = [ent("qa-so-0", "Delta", mNew, 7000), ent("qa-so-1", "alpha 2", mOld, 7100), ent("qa-so-2", "Éclair", mNew, 7200), ent("qa-so-3", "Eclair", mOld, 7300)];
        const N = SAVED.map((e) => e.name);
        const W = {
          savedOrder: [N[0], N[1], N[2], N[3]],
          nameAsc: [N[1], N[0], N[2], N[3]], nameDesc: [N[2], N[3], N[0], N[1]],
          fromAsc: [N[1], N[3], N[0], N[2]], fromDesc: [N[0], N[2], N[1], N[3]],
        };
        // #279 (spec §84, AC PF2C): Compare is capped at 2 columns and This screen counts as one, so ONE saved scenario is
        // ticked (alpha 2); every other box must then be locked (aria-disabled, aria-describedby → the reserved hint).
        // #299 (spec §88, AC PF2C-16..22): raised to This screen + 2 saved, so TWO are ticked (alpha 2 + Éclair) and the rest lock.
        const CMP = [1, 2]; // compare alpha 2 and Éclair beside This screen
        const HINT = "Compare limit reached: This screen and 2 saved scenarios.";
        // Lock state of every Compare box plus the hint, in row order.
        const lockState = (pg) => pg.evaluate(() => {
          const hint = document.querySelector("[data-testid=pf-saved-compare-hint]");
          return { hint: hint?.textContent ?? null, hintId: hint?.id ?? null, boxes: [...document.querySelectorAll("[data-testid=pf-saved-compare]")].map((b) => ({ on: b.checked, dis: b.getAttribute("aria-disabled"), desc: b.getAttribute("aria-describedby"), native: b.disabled })) };
        });
        const lockedOk = (l) => !!l && !!l.hintId && l.hint === HINT && l.boxes.every((b, i) => (CMP.includes(i) ? b.on && b.dis === null : !b.on && b.dis === "true" && b.desc === l.hintId && !b.native));
        const unlockedOk = (l) => !!l && l.hint === "" && l.boxes.every((b) => !b.on && b.dis === null && !b.desc);
        const cmpWant = (order) => order.filter((n) => CMP.map((i) => N[i]).includes(n));
        // One cycle on a page; returns the observed states (names, aria-sort, Compare heads after each click).
        const cycle = async (pg, compare) => {
          await pg.goto(`${base}${SCEN_PATH}`, { waitUntil: "networkidle" });
          await pg.getByTestId("pf-scenario-path").waitFor({ timeout: 20000 });
          await pg.getByTestId("pf-saved-toggle").click();
          await pg.getByTestId("pf-saved-table").waitFor();
          const names = () => pg.$$eval("[data-testid=pf-saved-item-name]", (a) => a.map((e) => e.textContent.trim()));
          const aria = () => pg.$$eval("[data-testid=pf-saved-th-name], [data-testid=pf-saved-th-from]", (a) => a.map((e) => e.getAttribute("aria-sort")));
          const heads = async () => (compare ? (await pg.$$eval("[data-testid=pf-compare-head]", (a) => a.map((e) => e.textContent.trim()))).slice(1) : null);
          const out = { th: await pg.$$eval("[data-testid=pf-saved-table] thead th", (a) => a.map((t) => [t.textContent.trim(), t.getAttribute("aria-sort"), !!t.querySelector("button")])) };
          if (compare) {
            const boxes = pg.getByTestId("pf-saved-compare");
            // PF2C: lock after one pick; clicking a locked box does nothing; deselect unlocks; re-pick for the cycle.
            out.unlocked0 = await lockState(pg);
            for (const i of CMP) await boxes.nth(i).check();
            out.locked = await lockState(pg);
            await boxes.nth(3).click({ force: true }); // #299: box 3 is the first unpicked one
            out.afterLockedClick = await lockState(pg);
            for (const i of CMP) await boxes.nth(i).uncheck();
            out.unlocked = await lockState(pg);
            for (const i of CMP) await boxes.nth(i).check();
            await pg.getByTestId("pf-saved-compare-button").click();
            await pg.getByTestId("pf-compare-table").waitFor();
            out.first = await pg.$$eval("[data-testid=pf-compare-head]", (a) => a.map((e) => e.textContent.trim()));
            // #299 PF2C-19: 3 chart lines and legend items, plural subtitle.
            out.three = await pg.evaluate(() => ({ lines: document.querySelector("[data-testid=pf-compare-chart]")?.getAttribute("data-lines"), legend: document.querySelectorAll("[data-testid=pf-compare-legend-item]").length, sub: document.querySelector("[data-testid=pf-compare-chart-head]")?.textContent ?? "" }));
          }
          out.steps = [{ names: await names(), aria: await aria(), heads: await heads() }];
          for (const c of ["name", "name", "name", "from", "from", "from"]) {
            await pg.getByTestId(`pf-saved-sort-${c}`).click();
            out.steps.push({ names: await names(), aria: await aria(), heads: await heads() });
          }
          return out;
        };
        const want = [
          [W.savedOrder, ["none", "none"]], [W.nameAsc, ["ascending", "none"]], [W.nameDesc, ["descending", "none"]], [W.savedOrder, ["none", "none"]],
          [W.fromAsc, ["none", "ascending"]], [W.fromDesc, ["none", "descending"]], [W.savedOrder, ["none", "none"]],
        ];
        const cycleOk = (o, compare) => o.steps.length === want.length && o.steps.every((s, i) => JSON.stringify(s.names) === JSON.stringify(want[i][0]) && JSON.stringify(s.aria) === JSON.stringify(want[i][1]) && (!compare || JSON.stringify(s.heads) === JSON.stringify(cmpWant(want[i][0]))));
        const thOk = (th) => JSON.stringify(th?.map((t) => [t[1] === null, t[2]])) === JSON.stringify([[true, false], [false, true], [false, true], [true, false]]);
        const ownerRaw = () => page.evaluate(async (u) => await (await fetch(u)).text(), API);
        try {
          const seed = await acct(page, base, "PUT", { ...snapS, [SCN]: JSON.stringify({ income: {}, expenses: {}, rate: null, growth: null, start: null, saved: SAVED }) });
          so.seed = seed.status;
          const writes = [];
          const onReq = (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/auth/") && q.method() !== "GET") writes.push(`${q.method()} ${u.pathname}`); };
          const before = await ownerRaw();
          page.on("request", onReq);
          const o = await cycle(page, true);
          await page.waitForTimeout(1500);
          page.off("request", onReq);
          so.same = (await ownerRaw()) === before;
          so.writes = writes;
          check(`${tag} PF2C e2e signed in: (#299) with 2 saved ticked every other Compare box is aria-disabled (not disabled) and described by the hint "${HINT}"; a click on a locked box does nothing; deselecting unlocks and empties the hint; Compare is This screen + 2 (3 lines, 3 legend items, "the saved scenarios"); NO non-GET /api/*`,
            unlockedOk(o.unlocked0) && lockedOk(o.locked) && lockedOk(o.afterLockedClick) && unlockedOk(o.unlocked) && JSON.stringify(o.first) === JSON.stringify(["This screen", N[CMP[0]], N[CMP[1]]]) && o.three?.lines === "3" && o.three.legend === 3 && /the saved scenarios, each/.test(o.three.sub) && so.writes.length === 0,
            { unlocked0: o.unlocked0, locked: o.locked, afterLockedClick: o.afterLockedClick, unlocked: o.unlocked, first: o.first, three: o.three, writes: so.writes });
          check(`${tag} PFSO-23 signed in: Scenario name and From cycle ascending → descending → saved order (ties in saved order), aria-sort follows, Select / Actions not sortable, Compare follows the sort and keeps saved order with none; NO non-GET /api/*; the owner's record byte-identical`,
            so.seed === 200 && cycleOk(o, true) && thOk(o.th) && so.writes.length === 0 && so.same === true, { seed: so.seed, steps: o.steps, th: o.th, writes: so.writes, same: so.same });
          const rEmail = process.env.QA_CFO_READ_EMAIL, rPassword = process.env.QA_CFO_READ_PASSWORD;
          if (!rEmail || !rPassword) skip(`${tag} PFSO-23 Read-user sort, QA_CFO_READ unset (set QA_CFO_READ_EMAIL / QA_CFO_READ_PASSWORD)`);
          else {
            const rd = {};
            const ownerBefore = await ownerRaw();
            await eachViewport({ browser, baseUrl: base, email: rEmail, password: rPassword, check: (n, ok, d) => check(`${tag} PFSO Read user ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: rp }) => {
              const w2 = [];
              rp.on("request", (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && q.method() !== "GET") w2.push(`${q.method()} ${u.pathname}`); });
              rd.o = await cycle(rp, true);
              await rp.waitForTimeout(1500);
              rd.writes = w2;
            });
            rd.same = (await ownerRaw()) === ownerBefore;
            check(`${tag} PFSO-23 Read user (second context, QA_CFO_READ): the same cycle and Compare order; NO non-GET /api/*; the owner's record byte-identical`,
              !!rd.o && cycleOk(rd.o, true) && rd.writes?.length === 0 && rd.same === true, { steps: rd.o?.steps, writes: rd.writes, same: rd.same });
          }
        } catch (e) {
          check(`${tag} PFSO step ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
        } finally {
          const d = await acct(page, base, "DELETE");
          const p = await acct(page, base, "PUT", snapS);
          const back = (await acct(page, base, "GET")).body?.data ?? {};
          const same = JSON.stringify(Object.keys(back).sort()) === JSON.stringify(Object.keys(snapS).sort()) && Object.keys(snapS).every((k) => back[k] === snapS[k]);
          check(`${tag} PFSO reset: qa-pf back to its pre-step record (DELETE, PUT the snapshot, every value byte-identical)`, d.status === 200 && p.status === 200 && same, { del: d.status, put: p.status, same });
        }
      }
      // #281 QA r1 CH1 (spec §86 + 86.5, AC PFWI-11..16): signed-in what-if note on /personal-finance/scenario. The owner
      // sees "What-ifs only: edits are cleared when you leave. Save scenario keeps a named copy." directly under the
      // "Scenario Analysis." title; a REAL Read user (QA_CFO_READ, BV4 pattern; SKIPPED (NOT A PASS) when unset) sees the
      // first sentence only. The Net assets now hint, the old strings absent, and viewing sends NO non-GET /api/* and writes
      // no storage. Reset at the end.
      {
        const snapW = { ...((await acct(page, base, "GET")).body?.data ?? {}) };
        const WI_OWNER = "What-ifs only: edits are cleared when you leave. Save scenario keeps a named copy.";
        const WI_READ = "What-ifs only: edits are cleared when you leave.";
        const WI_HINT = "A what-if: it never changes your saved net assets. A negative amount is allowed.";
        const WI_OLD = ["What-if only. Nothing on this screen is ever saved.", "Edits here are what-ifs: they never change your Personal Finance figures", "A what-if: never saved."];
        const view = async (pg) => {
          const w = [];
          const onReq = (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && q.method() !== "GET") w.push(`${q.method()} ${u.pathname}`); };
          pg.on("request", onReq);
          await pg.goto(`${base}/personal-finance/scenario`, { waitUntil: "networkidle" });
          await pg.getByTestId("pf-scenario-whatif").waitFor({ timeout: 20000 });
          const st0 = await pg.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
          await pg.waitForTimeout(1500);
          const o = await pg.evaluate((old) => {
            const n = [...document.querySelectorAll("[data-testid=pf-scenario-whatif]")];
            const h1 = document.querySelector("h1");
            const net = document.querySelector("[data-testid=pf-scenario-net]");
            const hint = net ? document.getElementById((net.getAttribute("aria-describedby") ?? "").split(" ")[0]) : null;
            const body = document.body.textContent ?? "";
            return { count: n.length, note: n[0]?.textContent ?? null, title: h1?.textContent ?? null,
              under: !!h1 && !!n[0] && h1.parentElement === n[0].parentElement && !!(h1.compareDocumentPosition(n[0]) & 4),
              hint: hint?.textContent ?? null, old: old.filter((s) => body.includes(s)), saveSentence: body.includes("Save scenario keeps a named copy.") };
          }, WI_OLD);
          o.storage = (await pg.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))) === st0;
          pg.off("request", onReq);
          o.writes = w;
          return o;
        };
        const placed = (o) => o.count === 1 && o.title === "Scenario Analysis." && o.under;
        const hintOk = (o) => typeof o.hint === "string" && o.hint.endsWith(WI_HINT);
        const ownerRaw = () => page.evaluate(async (u) => await (await fetch(u)).text(), API);
        try {
          const before = await ownerRaw();
          const o = await view(page);
          check(`${tag} PFWI-11 (#281) owner: one note directly under "Scenario Analysis." reading exactly "${WI_OWNER}"`, placed(o) && o.note === WI_OWNER, { count: o.count, note: o.note, title: o.title, under: o.under });
          check(`${tag} PFWI-13 (#281) owner: Net assets now hint ends "${WI_HINT}"; old strings absent (PFWI-02)`, hintOk(o) && o.old.length === 0, { hint: o.hint, old: o.old });
          const same = (await ownerRaw()) === before;
          check(`${tag} PFWI-14 (#281) owner: viewing sends NO non-GET /api/*, writes no storage; the record byte-identical`, o.writes.length === 0 && o.storage && same, { writes: o.writes, storage: o.storage, same });
          const rEmail = process.env.QA_CFO_READ_EMAIL, rPassword = process.env.QA_CFO_READ_PASSWORD;
          if (!rEmail || !rPassword) skip(`${tag} PFWI-12/15 Read-user what-if note, QA_CFO_READ unset (set QA_CFO_READ_EMAIL / QA_CFO_READ_PASSWORD)`);
          else {
            const rd = {};
            const ownerBefore = await ownerRaw();
            await eachViewport({ browser, baseUrl: base, email: rEmail, password: rPassword, check: (n, ok, d) => check(`${tag} PFWI Read user ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: rp }) => {
              rd.o = await view(rp);
            });
            rd.same = (await ownerRaw()) === ownerBefore;
            const r = rd.o;
            check(`${tag} PFWI-12 (#281) Read user (second context, QA_CFO_READ): one note under "Scenario Analysis." reading exactly "${WI_READ}", no "Save scenario keeps a named copy."`, !!r && placed(r) && r.note === WI_READ && !r.saveSentence, { count: r?.count, note: r?.note, under: r?.under, saveSentence: r?.saveSentence });
            check(`${tag} PFWI-15 (#281) Read user: Net assets now hint ends "${WI_HINT}"; old strings absent; NO non-GET /api/*; no storage write; the owner's record byte-identical`, !!r && hintOk(r) && r.old.length === 0 && r.writes.length === 0 && r.storage && rd.same === true, { hint: r?.hint, old: r?.old, writes: r?.writes, storage: r?.storage, same: rd.same });
          }
        } catch (e) {
          check(`${tag} PFWI step ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
        } finally {
          const d = await acct(page, base, "DELETE");
          const p = await acct(page, base, "PUT", snapW);
          const back = (await acct(page, base, "GET")).body?.data ?? {};
          const same = JSON.stringify(Object.keys(back).sort()) === JSON.stringify(Object.keys(snapW).sort()) && Object.keys(snapW).every((k) => back[k] === snapW[k]);
          check(`${tag} PFWI-16 reset: qa-pf back to its pre-step record (DELETE, PUT the snapshot, every value byte-identical)`, d.status === 200 && p.status === 200 && same, { del: d.status, put: p.status, same });
        }
      }
      // #282 (spec §87, AC PFGR-10): signed-in Growth earned line + "Count equity coverage as income" on
      // /personal-finance/scenario. Owner: the dim line under Growth earned, the box labelled, off, label ≥ 44 px; on
      // (when a rate and start exist; else the disabled state) the two extra rows (third cell: the summed monthly coverage, "Total over {horizon}"), every existing
      // Totals row and net assets identical on or off; toggling sends NO non-GET /api/* and writes no storage; a reload
      // shows it off. A REAL Read user (QA_CFO_READ; SKIPPED (NOT A PASS) when unset) sees and toggles it, no writes.
      // Reset at the end. (The Read sign-in per viewport is unchanged: the 429 is the known CH3 follow-up.)
      {
        const snapG = { ...((await acct(page, base, "GET")).body?.data ?? {}) };
        const GR_NOTE = "What growth added to net assets, beyond surplus.";
        const GR_LABEL = "Count equity coverage as income";
        const GR_ROWS = ["Net income + equity coverage", "Surplus + equity coverage"];
        const grView = async (pg) => {
          const w = [];
          const onReq = (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && q.method() !== "GET") w.push(`${q.method()} ${u.pathname}`); };
          pg.on("request", onReq);
          await pg.goto(`${base}/personal-finance/scenario`, { waitUntil: "networkidle" });
          await pg.getByTestId("pf-coverage-income-toggle").waitFor({ timeout: 20000 });
          const net = pg.getByTestId("pf-scenario-net");
          await net.fill("120000");
          await pg.waitForTimeout(300);
          const st0 = await pg.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
          const read = () => pg.evaluate(() => {
            const rows = [...document.querySelectorAll("[data-testid=pf-scenario-totals] [data-testid^=pf-scenario-row-]")];
            const extra = rows.filter((r) => /-(income|surplus)-coverage$/.test(r.getAttribute("data-testid")));
            const box = document.querySelector("[data-testid=pf-coverage-income-toggle]");
            const label = box?.closest("label");
            return {
              note: [...document.querySelectorAll("[data-testid=pf-scenario-row-growth] [data-testid=pf-growth-note]")].map((n) => n.textContent),
              label: label?.textContent ?? null, h: label ? label.getBoundingClientRect().height : 0, checked: !!box?.checked, disabled: !!box?.disabled,
              rateNote: document.querySelector("[data-testid=pf-coverage-income-note]")?.textContent ?? null,
              existing: rows.filter((r) => !extra.includes(r)).map((r) => r.textContent).join("|") + "|" + document.querySelector("[data-testid=pf-scenario-net]")?.value,
              extra: extra.map((r) => [r.querySelector("[role=rowheader]")?.textContent, r.querySelector("[data-testid=pf-coverage-total-caption]")?.textContent]),
              // #282 Q-GR5 (amended 2026-11-02): [value, the same row's base (Net income / Surplus) over the horizon].
              totals: extra.map((r, i) => [r.querySelector("[data-testid=pf-coverage-total-value]")?.textContent, document.querySelector(`[data-testid=pf-scenario-row-${i ? "surplus" : "income"}] [data-testid=pf-scenario-total]`)?.textContent]),
              head: document.querySelector("[data-testid=pf-scenario-total-head]")?.textContent ?? null,
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
          });
          const off = await read();
          let on = null, back = null;
          if (!off.disabled) {
            await pg.getByTestId("pf-coverage-income-toggle").click();
            on = await read();
            await pg.getByTestId("pf-coverage-income-toggle").click();
            back = await read();
          }
          const storage = (await pg.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))) === st0;
          let reload = null;
          if (on) {
            await pg.getByTestId("pf-coverage-income-toggle").click();
            await pg.reload({ waitUntil: "networkidle" });
            await pg.getByTestId("pf-coverage-income-toggle").waitFor({ timeout: 20000 });
            reload = await pg.getByTestId("pf-coverage-income-toggle").isChecked();
          }
          pg.off("request", onReq);
          return { off, on, back, storage, reload, writes: w };
        };
        const ownerRaw = () => page.evaluate(async (u) => await (await fetch(u)).text(), API);
        const grCheck = (who, o) => {
          check(`${tag} PFGR-01 (#282) ${who}: Growth earned has one dim line "${GR_NOTE}"`, o.off.note.length === 1 && o.off.note[0] === GR_NOTE, { note: o.off.note });
          check(`${tag} PFGR-03 (#282) ${who}: "${GR_LABEL}" box off by default, label ≥ 44 px, no extra rows, no overflow`, o.off.label === GR_LABEL && !o.off.checked && o.off.h >= 44 && o.off.extra.length === 0 && !o.off.overflow, { label: o.off.label, checked: o.off.checked, h: o.off.h, extra: o.off.extra.length, overflow: o.off.overflow });
          if (!o.on) {
            check(`${tag} PFGR-06 (#282) ${who}: disabled with no rate / start (rate note "Set rate under Expenses" when the rate is missing)`, o.off.disabled && (o.off.rateNote === null || o.off.rateNote === "Set rate under Expenses"), { disabled: o.off.disabled, rateNote: o.off.rateNote });
            skip(`${tag} PFGR-04/05/07 ${who} box on: qa-pf has no withdrawal rate, so the box is disabled (PFGR-06 checked instead)`);
          } else {
            // Amended 2026-11-02 (Q-GR5): the third cell is the base over the horizon + the summed monthly coverage (> the
            // base: net assets 120,000 > 0 every month), captioned "Total over {horizon}"; the shared header is unchanged.
            const num = (t) => Number(String(t ?? "").replace(/,/g, ""));
            const cap = `Total over ${String(o.on.head ?? "").replace(/^Over /, "")}`;
            check(`${tag} PFGR-04 (#282, amended Q-GR5) ${who}: on shows exactly ${GR_ROWS.join(" / ")}, each third cell a total > its row over the horizon, captioned "${cap}"; header "${o.on.head}" unchanged`, JSON.stringify(o.on.extra) === JSON.stringify(GR_ROWS.map((n) => [n, cap])) && /^Over /.test(o.on.head ?? "") && o.on.head === o.off.head && o.on.totals.every(([v, b]) => Number.isFinite(num(v)) && num(v) > num(b)) && !o.on.overflow, { extra: o.on.extra, totals: o.on.totals, head: o.on.head, overflow: o.on.overflow });
            check(`${tag} PFGR-05 (#282) ${who}: every existing Totals row and net assets identical on / off`, o.on.existing === o.off.existing && o.back.existing === o.off.existing && o.back.extra.length === 0, { same: o.on.existing === o.off.existing });
            check(`${tag} PFGR-07 (#282) ${who}: reload shows the box off`, o.reload === false, { reload: o.reload });
          }
          check(`${tag} PFGR-07/08 (#282) ${who}: NO non-GET /api/*, no storage write`, o.writes.length === 0 && o.storage, { writes: o.writes, storage: o.storage });
        };
        try {
          const before = await ownerRaw();
          grCheck("owner", await grView(page));
          check(`${tag} PFGR-07 (#282) owner: the record byte-identical after toggling`, (await ownerRaw()) === before, {});
          const rEmail = process.env.QA_CFO_READ_EMAIL, rPassword = process.env.QA_CFO_READ_PASSWORD;
          if (!rEmail || !rPassword) skip(`${tag} PFGR-08 Read-user coverage box, QA_CFO_READ unset (set QA_CFO_READ_EMAIL / QA_CFO_READ_PASSWORD)`);
          else {
            const rd = {};
            const ownerBefore = await ownerRaw();
            await eachViewport({ browser, baseUrl: base, email: rEmail, password: rPassword, check: (n, ok, d) => check(`${tag} PFGR Read user ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: rp }) => {
              rd.o = await grView(rp);
            });
            if (rd.o) grCheck("Read user (QA_CFO_READ)", rd.o);
            else check(`${tag} PFGR-08 (#282) Read user view ran`, false, {});
            check(`${tag} PFGR-08 (#282) Read user: the owner's record byte-identical`, (await ownerRaw()) === ownerBefore, {});
          }
        } catch (e) {
          check(`${tag} PFGR step ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
        } finally {
          const d = await acct(page, base, "DELETE");
          const p = await acct(page, base, "PUT", snapG);
          const back = (await acct(page, base, "GET")).body?.data ?? {};
          const same = JSON.stringify(Object.keys(back).sort()) === JSON.stringify(Object.keys(snapG).sort()) && Object.keys(snapG).every((k) => back[k] === snapG[k]);
          check(`${tag} PFGR-10 reset: qa-pf back to its pre-step record (DELETE, PUT the snapshot, every value byte-identical)`, d.status === 200 && p.status === 200 && same, { del: d.status, put: p.status, same });
        }
      }
      // #280 (spec §85 + Q-CH2 addendum, AC PFCH-15/16/17): signed-in chart titles. On /personal-finance the Overview chart
      // is titled "Last 12 months" with the recorded-history subtitle and stays at 12 months for Future off and every
      // Future year; on /personal-finance/scenario the Overview chart does the same and "Next 12 months from now" (the
      // flat forward projection) is present. NO non-GET /api/*, no storage write, the owner's record byte-identical.
      // A REAL Read user (QA_CFO_READ) repeats it read-only; SKIPPED (NOT A PASS) when unset. Reset at the end.
      {
        const snapC = { ...((await acct(page, base, "GET")).body?.data ?? {}) };
        // The subtitle month is the pinned TODAY (#285): the owner page runs on it and the Read-user context is pinned too.
        const OV_SUB = `Income, expenses and net assets for each month up to ${new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/Toronto" }).format(TODAY)} (recorded history).`;
        const thisMonth = householdMonth(TODAY);
        const head = (pg, fig) => pg.evaluate((id) => {
          const f = document.querySelector(`[data-testid=${id}]`); if (!f) return null;
          const t = f.querySelector(".pf-chart-title"), s = f.querySelector(".pf-chart-sub");
          return { tag: t?.tagName ?? null, title: t?.textContent ?? null, sub: s?.textContent ?? null, wired: !!t && !!s && f.getAttribute("aria-labelledby") === t.id && f.getAttribute("aria-describedby") === s.id, months: f.dataset.months ?? null, net: f.dataset.netLast ?? null };
        }, fig);
        const storageOf = (pg) => pg.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
        // One pass on a page: main page (Future off, on, each year), then the scenario screen (same, plus Projected path).
        // QA r3 CF2: for the Read user the MAIN page's Future toggle sits in `<fieldset disabled class="pf-lock">`, so it
        // is asserted locked and not clicked (Future off and the 12-month Overview are still checked); the scenario
        // screen's toggle works read-only, so it is clicked there. The owner clicks on both screens.
        const pass = async (pg, read = false) => {
          const out = { main: [], scen: [], read };
          await pg.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
          await pg.getByTestId("pf-chart").waitFor({ timeout: 20000 });
          out.sub = OV_SUB;
          const lockOf = () => pg.getByTestId("pf-future-toggle").evaluate((b) => { const fs = b.closest("fieldset"); return { inLock: !!fs && fs.disabled && fs.classList.contains("pf-lock"), disabled: b.matches(":disabled"), pressed: b.getAttribute("aria-pressed") }; });
          const futureOn = async (into, clickable = true) => {
            into.push(await head(pg, "pf-chart"));
            if (!clickable) return;
            const tg = pg.getByTestId("pf-future-toggle");
            if ((await tg.getAttribute("aria-pressed")) !== "true") await tg.click();
            const n = await pg.getByTestId("pf-year").count();
            for (let i = 0; i < n; i++) { await pg.getByTestId("pf-year").nth(i).click(); into.push(await head(pg, "pf-chart")); }
          };
          const st0 = await storageOf(pg);
          out.mainLock = await lockOf();
          await futureOn(out.main, !read);
          out.mainStorage = (await storageOf(pg)) === st0;
          await pg.goto(`${base}/personal-finance/scenario`, { waitUntil: "networkidle" });
          await pg.getByTestId("pf-scenario-path").waitFor({ timeout: 20000 });
          const st1 = await storageOf(pg);
          out.scenLock = await lockOf();
          await futureOn(out.scen);
          out.proj = await head(pg, "pf-scenario-chart");
          out.scenStorage = (await storageOf(pg)) === st1;
          return out;
        };
        const ovOk = (sub) => (h) => !!h && h.tag === "H3" && h.title === "Last 12 months" && h.sub === sub && h.wired && h.months === "12";
        const lockOk = (o) => (o.read ? o.mainLock?.inLock === true && o.mainLock.disabled === true : o.mainLock?.inLock === false) && o.scenLock?.disabled === false;
        const passOk = (o) => lockOk(o) && o.main.length >= (o.read ? 1 : 3) && o.main.every(ovOk(o.sub)) && new Set(o.main.map((h) => h.net)).size === 1 && o.scen.length >= 3 && o.scen.every(ovOk(o.sub)) && new Set(o.scen.map((h) => h.net)).size === 1 &&
          !!o.proj && o.proj.tag === "H3" && o.proj.title === "Next 12 months from now" && /^Flat forward projection: this screen's .+ income and expenses held flat, starting from Net assets now\.$/.test(o.proj.sub ?? "") && o.proj.wired && o.proj.months === "13" && o.mainStorage && o.scenStorage;
        const ownerRaw = () => page.evaluate(async (u) => await (await fetch(u)).text(), API);
        try {
          const writes = [];
          const onReq = (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/auth/") && q.method() !== "GET") writes.push(`${q.method()} ${u.pathname}`); };
          const before = await ownerRaw();
          page.on("request", onReq);
          const o = await pass(page);
          await page.waitForTimeout(1500);
          page.off("request", onReq);
          const same = (await ownerRaw()) === before;
          check(`${tag} PFCH-15 (#280) signed in: main page and scenario screen Overview "Last 12 months" + "(recorded history)" subtitle (h3, aria-wired), 12 months ending ${thisMonth} for Future off and every Future year; scenario "Next 12 months from now" + "Flat forward projection: …" (13 points)`,
            passOk(o), { main: o.main, scen: o.scen, proj: o.proj });
          check(`${tag} PFCH-16 (#280) signed in: the chart headings and Future years send NO non-GET /api/*, write no storage; the owner's record byte-identical`,
            writes.length === 0 && o.mainStorage && o.scenStorage && same, { writes, mainStorage: o.mainStorage, scenStorage: o.scenStorage, same });
          const rEmail = process.env.QA_CFO_READ_EMAIL, rPassword = process.env.QA_CFO_READ_PASSWORD;
          if (!rEmail || !rPassword) skip(`${tag} PFCH-17 Read-user chart titles, QA_CFO_READ unset (set QA_CFO_READ_EMAIL / QA_CFO_READ_PASSWORD)`);
          else {
            const rd = {};
            const ownerBefore = await ownerRaw();
            await eachViewport({ browser, baseUrl: base, email: rEmail, password: rPassword, check: (n, ok, d) => check(`${tag} PFCH Read user ${n}`, ok, d), viewports: [[vp, viewport, mobile]] }, async ({ page: rp }) => {
              const w2 = [];
              rp.on("request", (q) => { const u = new URL(q.url()); if (u.pathname.startsWith("/api/") && q.method() !== "GET") w2.push(`${q.method()} ${u.pathname}`); });
              await rp.clock.setFixedTime(TODAY);
              rd.o = await pass(rp, true);
              await rp.waitForTimeout(1500);
              rd.writes = w2;
            });
            rd.same = (await ownerRaw()) === ownerBefore;
            check(`${tag} PFCH-17 (#280) Read user (second context, QA_CFO_READ): main-page Future toggle locked (disabled fieldset.pf-lock, not clicked; Future off 12-month Overview), scenario screen the same Future clicks; the same titles, subtitles and 12-month Overview; NO non-GET /api/*; no storage write; the owner's record byte-identical`,
              !!rd.o && passOk(rd.o) && rd.writes?.length === 0 && rd.same === true, { mainLock: rd.o?.mainLock, scenLock: rd.o?.scenLock, main: rd.o?.main, scen: rd.o?.scen, proj: rd.o?.proj, writes: rd.writes, same: rd.same });
          }
        } catch (e) {
          check(`${tag} PFCH step ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
        } finally {
          const d = await acct(page, base, "DELETE");
          const p = await acct(page, base, "PUT", snapC);
          const back = (await acct(page, base, "GET")).body?.data ?? {};
          const same = JSON.stringify(Object.keys(back).sort()) === JSON.stringify(Object.keys(snapC).sort()) && Object.keys(snapC).every((k) => back[k] === snapC[k]);
          check(`${tag} PFCH reset: qa-pf back to its pre-step record (DELETE, PUT the snapshot, every value byte-identical)`, d.status === 200 && p.status === 200 && same, { del: d.status, put: p.status, same });
        }
      }
      await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await ready(page);
      check(`${tag} PFE-10 / PFE-13 only /api/personal-finance requests besides auth; no page error`, api.every((a) => a === `GET ${API}` || a === `PUT ${API}` || a === `DELETE ${API}`) && errors.length === 0, { api: [...new Set(api)], errors });
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      const end = await acct(page, base, "DELETE").catch(() => ({ status: 0 }));
      check(`${tag} PFE-13 the QA account's record left empty`, end.status === 200, end.status);
    }
  });
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "personal-finance-e2e.json"), maskedJson(R));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""}${R.skipped.length ? `, ${R.skipped.length} SKIPPED (NOT A PASS)` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
// BX3 (#277 harness, = BV6): a skip is never a pass. Any FAIL exits 1; otherwise any SKIPPED (NOT A PASS) item, including
// a skip-only run (e.g. no QA_EMAIL / QA_PASSWORD), exits 3 (2 stays the prod REFUSED code), so a skipped run can't read as green.
process.exit(fails.length ? 1 : R.skipped.length ? 3 : 0);
