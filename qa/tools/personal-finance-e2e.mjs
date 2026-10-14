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
//   PFE-12 (regression) is site-style-regression.mjs's run on the same preview.
// The signed-in part refuses to run against production (it writes to the account).
//
//   QA_EMAIL=… QA_PASSWORD=… [AXE_PATH=…] node qa/tools/personal-finance-e2e.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BASE_URL, qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
import { API, PATH, acct, contrastScan, line, ready, settle, totals, trackSaves, txt, val } from "./pf-helpers.mjs";
const avg12Label = (now = new Date()) => {
  // #132 (PF-115) / #140 (PF-121): the 12 complete household months (America/Toronto), the 3-month label style.
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  const name = (back) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1 - back, 1)));
  return `12-month average (${name(12)}\u2013${name(1)})`; // #140 (PF-121): 12 complete months
};
const avg3Label = (now = new Date()) => {
  // C7 (approved 2026-10-13): the 3 complete months before the current one, in the household timezone.
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  const name = (back) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1 - back, 1)));
  return `3-month average (${name(3)}\u2013${name(1)})`;
};

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
const TODAY = new Date(2026, 9, 11, 12);
const SIGN_IN_NEXT = "/dashboard/sign-in?next=%2Fpersonal-finance";
const shot = async (page, name) => {
  const file = join(CFG.out, name);
  await page.screenshot({ path: file, fullPage: true });
  R.shots.push(file);
};
// PFE-09: the page's Future formula (section 15): monthly x ← x × (1 + g)^(1/12) + average surplus.
const future = (x, surplus, months, g = 5) => {
  const r = (1 + g / 100) ** (1 / 12);
  for (let i = 0; i < months; i++) x = x * r + surplus;
  return x;
};
// #140 (PF-128): the 12-month average is over 12 complete months, so June alone (October is the current month).
const AVG_SURPLUS = 5000;
const NET_12 = 10000 + 10 * 5000 + 5000 + 10533 + 1 / 3; // 75,533.33

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
    for (const method of ["GET", "PUT", "DELETE", "POST"]) {
      const a = await fetch(`${base}${API}`, { method, redirect: "manual", headers: method === "PUT" ? { "content-type": "application/json" } : {}, body: method === "PUT" ? '{"data":{}}' : undefined });
      calls.push([method, a.status, await a.text()]);
    }
    check("PFE-02 /api/personal-finance signed out: GET / PUT / DELETE → 401 JSON, POST → 405", calls.slice(0, 3).every(([, st, b]) => st === 401 && b === '{"error":"Unauthorized."}') && calls[3][1] === 405, calls);

    for (const [what, start, click] of [
      ["the bar's Personal Finance item", "/calculator", 'nav[aria-label="Site"] a[href="/personal-finance"]'],
      ["the home Platforms line's Open", "/", '[data-testid="platform-line"][data-href="/personal-finance"] [data-testid="platform-open"]'],
      ["the URL", null, null],
    ]) {
      const page = await browser.newPage();
      try {
        if (start) {
          await page.goto(`${base}${start}`, { waitUntil: "networkidle" });
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
  if (!email || !password) console.log("INFO PFE-03..11 SKIPPED (signed in): set QA_EMAIL / QA_PASSWORD in env (the preview QA account, e.g. qa-pf@orpheus.test; its Personal Finance record is reset)");
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
        await page.locator(click).click();
        await page.waitForURL((u) => u.pathname === PATH, { timeout: 20000 }).catch(() => {});
        await ready(page).catch(() => {});
        entry.push([new URL(page.url()).pathname, await page.locator('nav[aria-label="Site"] a[aria-current=page]').allTextContents(), await page.title()]);
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
      check(`${tag} PFE-04 income: Me Net 92,400, Spouse Net 63,000; table Me · Wages 84,000, Spouse · Wages 48,000, Spouse · Bonus 2,400; no uncounted / 0 row (PF-42)`, JSON.stringify(f1.people.slice(0, 2)) === JSON.stringify([["Me", "92,400", null], ["Spouse", "63,000", null]]) && JSON.stringify(f1.rows.slice(0, 3).map((r) => [r[0], r[3]])) === JSON.stringify([["Me · Wages", "84,000"], ["Spouse · Wages", "48,000"], ["Spouse · Bonus", "2,400"]]) && !f1.rows.some((r) => r[3] === "0"), { people: f1.people, rows: f1.rows });
      check(`${tag} PFE-05 Brazilian Dividends 37,000 BRL at 3.70 (FX rate (BRL per 1 CAD)) → Net 37,000, Converted 10,000; its line 384.62 / 833.33 / 10,000; Net income 5,553.85 / 12,033.33 / 144,400`, JSON.stringify(f1.people[2]) === JSON.stringify(["Brazilian Dividends", "37,000", "10,000"]) && JSON.stringify(rateLabel) === JSON.stringify(["Currency", "FX rate (BRL per 1 CAD)", "Converted (yearly)"]) && JSON.stringify(f1.rows[3]) === JSON.stringify(["Brazilian Dividends · Wages", "384.62", "833.33", "10,000"]) && f1.rows.length === 5 && JSON.stringify(f1.rows.at(-1)) === JSON.stringify(["Net income", "5,553.85", "12,033.33", "144,400"]) && f1.household === "CAD", { person: f1.people[2], rateLabel, rows: f1.rows.slice(3) });

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
      await gifts.getByTestId("pf-name").fill("Gifts");
      await gifts.getByTestId("pf-yearly").fill("1,200");
      await gifts.getByTestId("pf-account").selectOption("__add-account__");
      await gifts.getByTestId("pf-new-account-input").fill("Visa");
      await gifts.getByTestId("pf-new-account-add").click();
      const f2 = await figures(page);
      const want6 = {
        lines: [["Rent", "1,000", "12,000", "CAD", "—", "66.7%", "8.3%", "—", "Chequing", ""], ["Condo", "2,000", "24,000", "BRL", "5", "26.7%", "3.3%", "—", "", ""], ["Gifts", "100", "1,200", "CAD", "—", "6.7%", "0.8%", "—", "Visa", ""]],
        totals: { fixed: ["93.3%", "11.6%", "1,400", "16,800", "—"], variable: ["6.7%", "0.8%", "100", "1,200", "—"], all: ["100.0%", "12.5%", "1,500", "18,000", "—"] },
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
      check(`${tag} PF-44 / PF-46 categories: Rent and Condo in Home (reused in any case); By category Home 93.3% / 1,400 / 16,800, No category 6.7% / 100 / 1,200; master totals unchanged`, JSON.stringify(fc.lines.map((l) => l[9])) === '["Home","Home",""]' && JSON.stringify(fc.cats) === JSON.stringify([["Home", "93.3%", "1,400", "16,800"], ["No category", "6.7%", "100", "1,200"]]) && JSON.stringify(fc.totals) === JSON.stringify(f2.totals), { cats: fc.cats, lines: fc.lines.map((l) => l[9]), totals: fc.totals });
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
        const wantAcc = [["Chequing", "66.7%", "1,000", "12,000", null], ["Visa", "6.7%", "100", "1,200", null], ["No account", "26.7%", "400", "4,800", null]];
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
      check(`${tag} PFE-07 ROIC 8 → Rate used 4%: Rent 300,000, Condo 120,000, Gifts 30,000 (totals 420,000 / 30,000 / 450,000); Rent override 250,000 → Fixed 370,000, Total 400,000`, f3.used === "4%" && JSON.stringify(f3.lines.map((l) => l[7])) === '["300,000","120,000","30,000"]' && JSON.stringify([f3.totals.fixed[4], f3.totals.variable[4], f3.totals.all[4]]) === '["420,000","30,000","450,000"]' && JSON.stringify(over) === '{"fixed":"370,000","all":"400,000"}', { used: f3.used, equity: f3.lines.map((l) => l[7]), totals: [f3.totals.fixed[4], f3.totals.variable[4], f3.totals.all[4]], over });

      // PFE-08 Overview and the month control (#112): Save October; June starts as its copy; June saved with one
      // 4,000 expense and one person netting 9,000; back on October.
      const unsaved = (await figures(page)).ov;
      await settle(page);
      const ov0 = (await figures(page)).ov;
      await page.getByTestId("pf-month").selectOption("2026-06");
      const note = (await txt(page.getByTestId("pf-month-note")));
      while ((await page.getByTestId("pf-remove").count()) > 0) { page.once("dialog", (d) => void d.accept()); await page.getByTestId("pf-remove").first().click(); }
      while ((await page.getByTestId("pf-remove-person").count()) > 0) { page.once("dialog", (d) => void d.accept()); await page.getByTestId("pf-remove-person").first().click(); }
      await page.getByTestId("pf-add-fixed").click();
      await line(page, "fixed", 0).getByTestId("pf-monthly").fill("4,000");
      await page.getByTestId("pf-add-person").click();
      await page.getByTestId("pf-person-wages").first().fill("108,000");
      await settle(page);
      const juneSaved = { month: await page.getByTestId("pf-month").inputValue(), save: await page.getByTestId("pf-month-save").count(), note: await txt(page.getByTestId("pf-month-note")) };
      await page.getByTestId("pf-month").selectOption("2026-10");
      await page.getByTestId("pf-start").fill("10,000");
      const f4 = await figures(page);
      const ch = await page.getByTestId("pf-chart").evaluate((f) => ({ lines: f.querySelectorAll(".recharts-line-curve").length, legend: [...f.querySelectorAll(".pf-legend li")].map((l) => l.textContent.trim()) }));
      check(`${tag} PFE-08 (#112) 04 follows saved months (— before the first Save); this month = October saved (1,500 / 12,033.33 / 10,533.33); June copied ("Copied from October 2026 — edit and save."), saved as 4,000 / 9,000 (stays on June, note gone) → #140 12-month average (12 complete months: June alone) 4,000 / 9,000 / 5,000, — while only October is saved; start 10,000 → 12 months, three lines, net assets 75,533.33`, JSON.stringify(unsaved) === JSON.stringify({ expenses: ["—", "—"], income: ["—", "—"], surplus: ["—", "—"] }) && JSON.stringify(ov0) === JSON.stringify({ expenses: ["1,500", "—"], income: ["12,033.33", "—"], surplus: ["10,533.33", "—"] }) && note === "Copied from October 2026 — edit and save." && JSON.stringify(juneSaved) === JSON.stringify({ month: "2026-06", save: 0, note: "" }) && JSON.stringify(f4.ov) === JSON.stringify({ expenses: ["1,500", "4,000"], income: ["12,033.33", "9,000"], surplus: ["10,533.33", "5,000"] }) && f4.chart.months === "12" && f4.chart.net === "75533.33" && ch.lines === 3 && JSON.stringify(ch.legend) === '["Expenses","Income","Net assets"]', { unsaved, ov0, note, juneSaved, ov: f4.ov, chart: f4.chart, ch });

      // #126 PF-89 + C7/C2 (approved 2026-10-13, PF-91..PF-95): Equity coverage (start 10,000 × rate used, ÷ the
      // 3-month average of complete months Jul–Sep, all empty → the 12-month average 4,000 (#140)) and that 3-month average.
      const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
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
      check(`${tag} PF-89 (#126) / PF-120 (#132) / PF-128 (#140) This month · 3-month average · ${avg12Label()}; C7: ${avg3Label()} = 4,000 / 9,000 / 5,000 (Jul, Aug, Sep empty take the 12-complete-month average, #140 PF-125); no horizontal scroll`, JSON.stringify(heads.map((h) => h.trim()).slice(1)) === JSON.stringify(["This month", avg3Label(), avg12Label()]) && JSON.stringify(avg3) === JSON.stringify(["4,000", "9,000", "5,000"]) && scroll <= 0, { heads, avg3, scroll });
      await page.getByTestId("pf-overview").scrollIntoViewIfNeeded();
      await page.getByTestId("pf-coverage").screenshot({ path: join(CFG.out, `e2e-coverage-${viewport.width}.png`) });

      // PFE-09 Future at a typed growth rate.
      await page.getByTestId("pf-growth").fill("5");
      await page.getByTestId("pf-future-toggle").click();
      const y1 = await page.getByTestId("pf-chart").evaluate((f) => ({ months: f.dataset.months, net: Number(f.dataset.netLast) }));
      await page.locator("[data-testid=pf-year][data-years='5']").click();
      const y5 = await page.getByTestId("pf-chart").evaluate((f) => ({ months: f.dataset.months, net: Number(f.dataset.netLast) }));
      const [w1, w5] = [future(NET_12, AVG_SURPLUS, 12), future(NET_12, AVG_SURPLUS, 60)];
      {
        // #126 PF-89: with Future on (5 years) the coverage uses the projected net assets and the average expenses 4,000 (#140: 12 complete months).
        const cf = await cov();
        const y = (y5.net * rateNow) / 100;
        const want = Number.isFinite(rateNow) && rateNow > 0 ? [`Equity coverage in 5 years: ${NUM.format(y / 12)} ${hh}/mo (${NUM.format(y)} ${hh}/yr)`, `* ${rateTxt} yearly, covers ${((y / 12 / 4000) * 100).toFixed(2)}% of projected monthly expenses at horizon end (held at 12-month average).`, "** Coverage rate is derived from Rate Used under Expenses section."] : ["Equity coverage in 5 years: —", "Set rate under Expenses", "** Coverage rate is derived from Rate Used under Expenses section."];
        check(`${tag} PF-89 (#126) Future 5 years: Equity coverage on the projected net assets ${y5.net.toFixed(2)} and the 12-month average expenses`, JSON.stringify(cf) === JSON.stringify(want), { cf, want });
      }
      check(`${tag} PFE-09 growth 5: 1 year 24 points ≈ ${w1.toFixed(2)}, 5 years 72 points ≈ ${w5.toFixed(2)} (± 0.01)`, y1.months === "24" && Math.abs(y1.net - w1) <= 0.011 && y5.months === "72" && Math.abs(y5.net - w5) <= 0.011, { y1, y5, w1, w5 });
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await shot(page, `e2e-full-${viewport.width}.png`);
      await page.getByTestId("pf-overview").scrollIntoViewIfNeeded();
      await page.locator("section[aria-labelledby=pf-overview]").screenshot({ path: join(CFG.out, `e2e-overview-${viewport.width}.png`) });

      // PFE-11 style on the full page.
      const sh = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Site"]');
        const home = nav.querySelector('a[href="/"]');
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
      check(`${tag} PFE-10 a reload shows every figure unchanged (from the account; Future on at 5 years)`, JSON.stringify(reloaded) === JSON.stringify(before) && before.future === "true" && before.chart.months === "72", { before, reloaded: JSON.stringify(reloaded) === JSON.stringify(before) ? "same" : reloaded });
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
writeFileSync(join(CFG.out, "personal-finance-e2e.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
