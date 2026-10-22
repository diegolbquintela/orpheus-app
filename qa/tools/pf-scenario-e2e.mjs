// Scenario screen end-to-end (#222, spec section 58, PFSV-01..PFSV-30 in qa/CANONICAL-AC-PACK.md; #225 PFTT-05/06): the full
// validation run of /personal-finance/scenario after #221 / #224, on a PREVIEW, at 390 × 844 and 1440 × 900.
// Diego (2026-10-22): the screen is a SANDBOX, so every check that used to be "the net-assets save path" is a
// zero-writes check: no PUT / POST / DELETE / PATCH from the page, one GET of the record, the record byte-for-byte
// unchanged after every edit and after a reload, and the reload shows the seeded values again.
//
//   Owner (QA_OWNER_EMAIL / QA_OWNER_PASSWORD) and CFO Read (QA_CFO_EMAIL / QA_CFO_PASSWORD): layout, seeding from the
//   latest month (net assets included) and its stated basis (QA AO5), Monthly / Yearly on the income lines (÷12;
//   switching keeps the totals), the CFO math on the live page (cases A / B / C at 9 % a year), the Now tick on every
//   horizon, no Account / Category selects, zero writes, reload. Read also: the read-only line in its landmark.
//   No grant (QA_NONE_EMAIL / QA_NONE_PASSWORD): the 403 page and 403 from the record API.
//   Main page regression (owner and Read): /personal-finance Overview, /charts, /history load with no write; the
//   reports list and the first report's PDF / PNG export answer.
// Accounts come from env only and are never logged or written to the out dir. Read-only: it never saves, and it
// refuses production (qa/tools/prod-guard.mjs). Exit 1 on any FAIL.
//
//   QA_OWNER_EMAIL=… QA_OWNER_PASSWORD=… QA_CFO_EMAIL=… QA_CFO_PASSWORD=… QA_NONE_EMAIL=… QA_NONE_PASSWORD=… \
//     node qa/tools/pf-scenario-e2e.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";

// #208 (spec 61.2, HTL-04): --help prints the usage and exits before any config, guard probe or browser (no network).
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("usage: node qa/tools/pf-scenario-e2e.mjs --base-url <preview> --out <dir>  (accounts from env: QA_OWNER_*, QA_CFO_*, QA_NONE_*; previews only, read-only)");
  process.exit(0);
}
const CFG = qaConfig(import.meta.url);
await refuseIfProd(CFG.baseUrl, "pf-scenario-e2e");
const base = CFG.baseUrl;
const R = { base, checks: [], info: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const info = (m) => {
  R.info.push(m);
  console.log(`INFO ${m}`);
};
const VIEWPORTS = [
  ["390", { width: 390, height: 844 }, true],
  ["1440", { width: 1440, height: 900 }, false],
];
const SCENARIO = "/personal-finance/scenario";
const RECORD = "/api/personal-finance";
const HORIZONS = [12, 36, 60, 120];
const money = (t) => {
  const s = String(t ?? "").trim().replace(/\u2212/g, "-").replace(/,/g, "");
  return s === "" || s === "—" ? null : Number(s);
};
const fmt = (n) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** The CFO rule (spec 57.3): r_m = (1+g)^(1/12) − 1; growth on a positive opening balance only; then + surplus. */
function cfoPath(start, surplus, annual, months) {
  const r = (1 + annual / 100) ** (1 / 12) - 1;
  let n = start;
  for (let i = 0; i < months; i++) n = (n > 0 ? n * (1 + r) : n) + surplus;
  return n;
}

/** Every request the PAGE makes (APIRequestContext calls for sign-in / the record snapshot are not page traffic). */
function track(page) {
  const log = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin === new URL(base).origin) log.push(`${r.method()} ${u.pathname}`);
  });
  return {
    log,
    writes: () => log.filter((l) => !/^(GET|HEAD|OPTIONS) /.test(l)),
    recordGets: () => log.filter((l) => l === `GET ${RECORD}`).length,
    reset: () => (log.length = 0),
  };
}

const snapshot = async (page) => {
  const r = await page.request.get(`${base}${RECORD}`);
  return { status: r.status(), body: r.ok() ? await r.text() : null };
};
const cell = (page, row, col) =>
  page.locator(`[data-testid=pf-scenario-row-${row}] [data-testid=${col}]`).first().textContent();
const month = (page, row) => cell(page, row, "pf-scenario-month");
const total = (page, row) => cell(page, row, "pf-scenario-total");
async function fill(page, locator, text) {
  await locator.fill(text);
  await locator.press("Enter").catch(() => {});
  await page.waitForTimeout(150);
}
async function open(page) {
  const res = await page.goto(`${base}${SCENARIO}`, { waitUntil: "networkidle" });
  await page.getByTestId("pf-scenario-path").waitFor({ timeout: 20000 }).catch(() => {});
  return res;
}

async function signedIn(browser, role, email, password, fn) {
  if (!email || !password) {
    info(`${role}: SKIPPED (no QA_${role.toUpperCase()}_EMAIL / _PASSWORD in env)`);
    return;
  }
  for (const [vp, viewport, mobile] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    const tag = `[${role} ${vp}]`;
    try {
      const login = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: base } });
      check(`${tag} sign-in`, login.ok(), login.status());
      if (login.ok()) await fn({ page, tag, vp });
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      await page.request.post(`${base}/api/auth/sign-out`, { data: {}, headers: { origin: base } }).catch(() => {});
      await ctx.close().catch(() => {});
    }
  }
}

/** #225 (spec 62, PFTT-05 / -06): every person checkbox's tap target (its label.pf-check) is ≥ 44 × 44 and the whole
 * of it hits the label or the box (no overlap), measured in the real browser. Read-only: nothing is clicked. */
async function personTargets(page, tag, ac) {
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="pf-person-count-wages"],[data-testid="pf-person-count-bonus"],[data-testid="pf-person-foreign"]')].map((box) => {
    box.scrollIntoView({ block: "center" });
    const label = box.closest("label");
    const r = (label ?? box).getBoundingClientRect();
    let miss = 0;
    for (let y = 1; y < r.height; y += 4) for (let x = 1; x < r.width; x += 4) {
      const hit = document.elementFromPoint(r.left + x, r.top + y);
      if (hit !== label && hit !== box) miss++;
    }
    return { id: box.dataset.testid, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, label: Boolean(label?.classList.contains("pf-check")), miss };
  }));
  if (!rows.length) return info(`${tag} ${ac} person checkboxes: SKIPPED (no person row on this record)`);
  check(`${tag} ${ac} person checkboxes: each label.pf-check ≥ 44 × 44 and fully tappable (${rows.length} boxes)`, rows.length % 3 === 0 && rows.every((r) => r.label && r.w >= 44 && r.h >= 44 && r.miss === 0), rows.filter((r) => !(r.label && r.w >= 44 && r.h >= 44 && r.miss === 0)));
}

/** Owner and Read: the scenario screen. */
async function scenarioChecks({ page, tag, vp }, read) {
  const net = track(page);
  const before = await snapshot(page);
  check(`${tag} PFSV-01 the record is readable before the run`, before.status === 200, before.status);
  const res = await open(page);
  check(`${tag} PFSV-02 ${SCENARIO} 200`, res?.status() === 200, res?.status());
  await page.getByTestId("pf-person").first().waitFor({ timeout: 15_000 }).catch(() => {});
  await personTargets(page, tag, "PFTT-06");
  // Layout (spec 57.1): the main page's sections, no categories parts, no month control or Save; the chart below.
  const has = async (id) => (await page.getByTestId(id).count()) > 0;
  // An empty record (e.g. a fresh preview database): the empty state, then lines typed in the sandbox itself (a Read
  // user may type too; nothing is sent), so every data check still runs. With data, the seeded values are used.
  await page.getByTestId("pf-scenario-net").waitFor();
  const seedNet = await page.getByTestId("pf-scenario-net").inputValue();
  const emptyRecord = (await page.getByTestId("pf-person").count()) === 0 && (await page.getByTestId("pf-line").count()) === 0;
  if (emptyRecord) {
    check(`${tag} PFSV-19 empty record: the empty note and "Nothing saved yet"`, (await has("pf-scenario-empty")) && /^Nothing saved yet/.test((await page.getByTestId("pf-scenario-basis").textContent()) ?? ""));
    info(`${tag} the record has no lines: seeding is checked by the DOM tests (PFPJ-07 / PFSV-31); the rest runs on lines typed here`);
  }
  if ((await page.getByTestId("pf-person").count()) === 0) await page.getByTestId("pf-add-person").click();
  if ((await page.getByTestId("pf-line").count()) === 0) await page.getByTestId("pf-add-fixed").click();
  if (emptyRecord) {
    await fill(page, page.getByTestId("pf-person-wages").first(), "6,000");
    await fill(page, page.getByTestId("pf-monthly").first(), "2,500");
  }
  check(`${tag} PFSV-03 layout: Income, Expenses, summary, Overview, then 06 Projected path and 07 Totals`,
    (await has("pf-expenses-block")) && (await has("pf-summary-block")) && (await has("pf-overview")) && (await has("pf-scenario-path")) && (await has("pf-scenario-totals")) && (await page.getByTestId("pf-person").count()) > 0);
  const present = {};
  for (const id of ["pf-filter", "pf-acct-filter", "pf-month-control", "pf-month-save", "pf-account", "pf-category"]) present[id] = await page.getByTestId(id).count();
  // #223 (PFSS-50): `Save scenario` (named scenarios, scenario value only) is allowed; the main page's Save is not.
  check(`${tag} PFSV-04 no category / account filter, month control, Save, or Account / Category select on any line`,
    Object.values(present).every((n) => n === 0) && (await page.getByRole("button", { name: /^Save(?! scenario$)/ }).count()) === 0, { lines: await page.getByTestId("pf-line").count(), present });
  const title = (await page.locator("h1").first().textContent())?.trim();
  const basis = (await page.getByTestId("pf-scenario-basis").textContent().catch(() => ""))?.trim();
  check(`${tag} PFSV-05 title Scenario. and the seeding basis line`, title === "Scenario." && /^(Based on last month \(|Based on this month's saved figures \(|Nothing saved yet|No months saved yet)/.test(basis ?? ""), { title, basis });
  // Seeding (Diego): from the latest month, net assets included, with its basis stated (QA AO5, spec 58.3).
  const netShown = await page.getByTestId("pf-scenario-net").inputValue();
  const netBasis = (await page.getByTestId("pf-scenario-net-basis").textContent().catch(() => null))?.trim() ?? null;
  check(`${tag} PFSV-06 net assets is seeded (a number${emptyRecord ? ", 0 with no data" : ""}) with its as-of basis stated`, money(netShown) !== null && !!netBasis && /Starting net assets/.test(netBasis) && /(as-of month|no as-of month)/.test(netBasis), { netShown, netBasis });
  // The seeded month figures equal the main page's Overview `This month` (the same record, the same month).
  const scOv = await page.locator("[data-testid=pf-ov-table] [data-testid=pf-ov-now]").allTextContents();
  const scMonth = { income: money(await month(page, "income")), expenses: money(await month(page, "expenses")) };
  check(`${tag} PFSV-07 the Scenario month column equals the scenario's own Overview This month`,
    scMonth.expenses === money(scOv[0]) && scMonth.income === money(scOv[1]), { scMonth, scOv });
  // The Now tick on every horizon.
  for (const h of HORIZONS) {
    await page.getByTestId(`pf-horizon-${h}`).click();
    await page.waitForTimeout(250);
    const ticks = await page.locator("[data-testid=pf-scenario-chart] .recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents();
    const points = await page.getByTestId("pf-scenario-chart").getAttribute("data-months");
    check(`${tag} PFSV-08 ${h} months: Now is the first tick; ${h + 1} points`, ticks[0]?.trim() === "Now" && Number(points) === h + 1, { first: ticks[0], n: ticks.length, points });
  }
  await page.getByTestId("pf-horizon-12").click();
  // Monthly / Yearly on the income lines (spec 57.13 / 57.14).
  const sels = page.getByTestId("pf-person-wages-per");
  const nSel = await sels.count();
  const nPeople = await page.getByTestId("pf-person").count();
  check(`${tag} PFSV-09 every income line has a Monthly / Yearly select, default Monthly`, nSel === nPeople && nSel > 0 && (await sels.evaluateAll((s) => s.every((x) => x.value === "month"))), { nSel, nPeople });
  const wages = page.getByTestId("pf-person-wages").first();
  const m0 = money(await wages.inputValue());
  const inc0 = await month(page, "income");
  const surplus0 = await month(page, "surplus");
  await sels.first().selectOption("year");
  await page.waitForTimeout(150);
  const y0 = money(await wages.inputValue());
  check(`${tag} PFSV-10 switching to Yearly shows ×12 and keeps the totals`, y0 !== null && m0 !== null && Math.abs(y0 - m0 * 12) < 0.011 * 12 && (await month(page, "income")) === inc0 && (await month(page, "surplus")) === surplus0, { m0, y0, inc0 });
  await fill(page, wages, "12,000");
  const incYear = await month(page, "income");
  await sels.first().selectOption("month");
  await fill(page, wages, "1,000");
  const incMonth = await month(page, "income");
  check(`${tag} PFSV-11 Yearly 12,000 feeds the same as Monthly 1,000 (÷12)`, incYear === incMonth, { incYear, incMonth });
  // The CFO math on the live page: cases A / B / C at 9 % a year over 12 months (spec 57.3).
  const growth = page.getByTestId("pf-growth");
  await fill(page, growth, "9");
  const netField = page.getByTestId("pf-scenario-net");
  const line0 = page.getByTestId("pf-monthly").first();
  const pin = async (target) => {
    const s = money(await month(page, "surplus"));
    const amt = money(await line0.inputValue()) ?? 0;
    const next = amt + (s ?? 0) - target;
    if (s === null || next < 0) return false;
    await fill(page, line0, String(Math.round(next * 100) / 100));
    return money(await month(page, "surplus")) === target;
  };
  for (const [name, start, surplus, want, tol] of [["A", 10000, 500, 17143.65, 0.005], ["B", 0, -1460, -17520, 0], ["C", -2000, 500, 4102.37, 0.01]]) {
    await fill(page, netField, String(start));
    const ok = await pin(surplus);
    if (!ok) {
      info(`${tag} PFSV-12 case ${name}: SKIPPED (the current month's surplus is not set by its lines, e.g. typed Update totals)`);
      continue;
    }
    const got = money(await total(page, "net"));
    const ref = cfoPath(start, surplus, 9, 12);
    check(`${tag} PFSV-12 case ${name}: ${fmt(start)} and ${fmt(surplus)} a month at 9 % → ${fmt(want)} (±${tol})`, got !== null && Math.abs(got - want) <= tol + 1e-9 && Math.abs(ref - want) <= tol + 0.005, { got, ref: Math.round(ref * 100) / 100 });
  }
  // #222 F1: a field in error, then a section toggle: never "Not saved." on a sandbox.
  await fill(page, line0, "abc");
  if (await has("pf-toggle-expenses")) await page.getByTestId("pf-toggle-expenses").click();
  if (await has("pf-toggle-expenses")) await page.getByTestId("pf-toggle-expenses").click();
  check(`${tag} PFSV-28 a field error and a toggle never show "Not saved."`, (await page.getByText("Not saved.").count()) === 0 || !(await page.getByText("Not saved.").first().isVisible()));
  await fill(page, page.getByTestId("pf-monthly").first(), "100");
  // Toggles (this visit only) and every edit above: zero writes.
  for (const id of ["pf-toggle-income", "pf-toggle-summary"]) if (await has(id)) await page.getByTestId(id).click();
  const writes = net.writes();
  check(`${tag} PFSV-13 zero writes: no PUT / POST / PATCH / DELETE from any edit, switch, toggle or horizon`, writes.length === 0, writes);
  check(`${tag} PFSV-14 one GET of the record`, net.recordGets() === 1, net.recordGets());
  const mid = await snapshot(page);
  check(`${tag} PFSV-15 the record is unchanged after the edits`, mid.body === before.body);
  // Reload: nothing persisted, the seeded values are back.
  net.reset();
  await open(page);
  const netAfter = await page.getByTestId("pf-scenario-net").inputValue();
  const after = await snapshot(page);
  check(`${tag} PFSV-16 reload: the seeded net assets and figures are back; the record unchanged; still no write`, netAfter === seedNet && after.body === before.body && net.writes().length === 0 && net.recordGets() === 1, { seedNet, netAfter, writes: net.writes() });
  // Read: the read-only line sits in its landmark.
  if (read) {
    const aside = page.locator("aside[aria-label='Scenario access'] [data-testid=read-only]");
    check(`${tag} PFSV-17 Read: the read-only line in the Scenario access landmark`, (await aside.count()) === 1);
  }
  // No horizontal overflow.
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(`${tag} PFSV-18 no horizontal overflow`, !over);
  await page.screenshot({ path: join(CFG.out, `scenario-${read ? "read" : "owner"}-${vp}.png`), fullPage: true });
}

/** Owner and Read: the main Personal Finance page and its neighbours load and write nothing (regression). */
async function mainChecks({ page, tag }) {
  const net = track(page);
  for (const path of ["/personal-finance", "/personal-finance/charts", "/personal-finance/history"]) {
    const res = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    check(`${tag} PFSV-20 ${path} 200`, res?.status() === 200, res?.status());
  }
  await page.goto(`${base}/personal-finance`, { waitUntil: "networkidle" });
  const ov = await page.getByTestId("pf-ov-table").count();
  await personTargets(page, tag, "PFTT-05");
  check(`${tag} PFSV-21 the main page shows its Overview and its category filter; no Monthly / Yearly select`, ov === 1 && (await page.getByTestId("pf-person-wages-per").count()) === 0);
  check(`${tag} PFSV-22 loading the main page, charts and history writes nothing`, net.writes().length === 0, net.writes());
  const list = await page.request.get(`${base}/api/personal-finance/reports`);
  check(`${tag} PFSV-23 the reports list answers`, list.status() === 200, list.status());
  const id = list.ok() ? (await list.json())?.reports?.[0]?.id : undefined;
  if (id) {
    for (const f of ["pdf", "png"]) {
      const x = await page.request.get(`${base}/api/personal-finance/reports/${encodeURIComponent(id)}/export?format=${f}`);
      check(`${tag} PFSV-24 export ${f} 200 with its type`, x.status() === 200 && (x.headers()["content-type"] ?? "").includes(f), [x.status(), x.headers()["content-type"]]);
    }
  } else info(`${tag} PFSV-24 export: SKIPPED (no saved report)`);
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
try {
  await signedIn(browser, "owner", process.env.QA_OWNER_EMAIL, process.env.QA_OWNER_PASSWORD, async (x) => {
    await scenarioChecks(x, false);
    await mainChecks(x);
  });
  await signedIn(browser, "cfo", process.env.QA_CFO_EMAIL, process.env.QA_CFO_PASSWORD, async (x) => {
    await scenarioChecks(x, true);
    await mainChecks(x);
  });
  await signedIn(browser, "none", process.env.QA_NONE_EMAIL, process.env.QA_NONE_PASSWORD, async ({ page, tag }) => {
    const res = await page.goto(`${base}${SCENARIO}`);
    check(`${tag} PFSV-25 no grant: the 403 page`, res?.status() === 403 && (await page.getByTestId("access-denied").count()) === 1, res?.status());
    const api = await page.request.get(`${base}${RECORD}`);
    check(`${tag} PFSV-26 no grant: the record API 403`, api.status() === 403, api.status());
  });
  // Signed out: the sign-in redirect.
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const r = await p.request.get(`${base}${SCENARIO}`, { maxRedirects: 0 });
  check("PFSV-27 signed out: 307 to sign-in with next", r.status() === 307 && /sign-in\?next=%2Fpersonal-finance%2Fscenario/.test(r.headers().location ?? ""), [r.status(), r.headers().location]);
  await ctx.close();
} finally {
  await browser.close();
}
writeFileSync(join(CFG.out, "pf-scenario-e2e.json"), JSON.stringify(R, null, 2));
const failed = R.checks.filter((c) => !c.ok).length;
console.log(`${R.checks.length - failed}/${R.checks.length} PASS${failed ? ` · ${failed} FAIL` : ""}`);
process.exit(failed ? 1 : 0);
