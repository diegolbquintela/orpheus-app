// Personal Finance month control (#112; design attachments/pf-month-control-design.md, spec section 19, PF-48..PF-58),
// on a preview, signed in as the QA account (QA_EMAIL / QA_PASSWORD from env; never logged; through session.mjs's
// eachViewport, which always signs out). The account's Personal Finance record is read first and put back at the end.
//
//   PF-48 the control (Month, 12 months newest first, the current month shown), `05 Update` gone
//   PF-49 / PF-50 Save hidden until a change, hidden again after; no PUT before Save; one PUT on Save;
//   #144 04 live before Save and `Unsaved changes` beside Save (PF-159 / PF-162 / PF-167)
//   PF-51 / PF-52 / PF-53 an empty past month is a copy with the note; Save stays on it; the averages follow
//   PF-54 switching with unsaved changes asks; leaving the page asks (beforeunload)
//   PF-55 an old record (lines, no months value, an old June total) → the current month; June's total counts
//   PF-56 rollover: the clock on 1 November 2026 → November copies October with the note
//   #163 PFM-01..PFM-08: Month + Year; an old month (March 2021) copies, saves and reloads; no future month
//   #163 PFM-15..PFM-17 (Q-Y6 rejected): an empty past month opens blank; "Copy from current month" copies; stored only on Save
//   PF-58 layout: the row under the title, select / Save ≥ 44 px, no gold, no horizontal scroll, strict CLS 0
//   #165 PFD-01..PFD-04 / PFD-12: delete a category / account on June keeps March's history, "(deleted)"
//   PF-58 per change (#163, EL 2026-10-16): data → data strict CLS 0; data → blank exempt, but the controls, Save and Copy line stay put
//
//   QA_EMAIL=… QA_PASSWORD=… node qa/tools/pf-months.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BASE_URL, qaConfig } from "./config.mjs";
import { refuseIfProd } from "./prod-guard.mjs";
import { eachViewport } from "./session.mjs";
import { BLANK_PAST, DELETE_ACCOUNT, DELETE_CATEGORY, DELETED_SUFFIX, deleteNameQuestion, PATH, acct, blankMonth, line, monthChoices, pickMonth, ready, shownMonth, trackSaves, txt, val } from "./pf-helpers.mjs";

const CFG = qaConfig(import.meta.url);
// #157 (QA run 2026-10-17 F2, EL): refuse production before any request or sign-in (qa/tools/prod-guard.mjs).
await refuseIfProd(CFG.baseUrl, "pf-months");
const base = CFG.baseUrl;
const R = { base, checks: [], shots: [] };
const check = (name, ok, detail) => {
  R.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail !== undefined ? ` · ${JSON.stringify(detail)}` : ""}`);
};
const VIEWPORTS = [
  ["phone", { width: 400, height: 860 }, true],
  ["desktop", { width: 1440, height: 900 }, false],
];
const TODAY = new Date(2026, 9, 11, 12);
const NOV_1 = new Date(2026, 10, 1, 9);
const KEY = "orpheus.finance.expenses.v2";
const INCOME_KEY = "orpheus.finance.income.v1";
const OVERVIEW_KEY = "orpheus.finance.overview.v1";
const MONTHS_KEY = "orpheus.finance.months.v1";
const RENT = { id: "m1", name: "Rent", amount: "1,750", per: "month", equity: "", account: "", currency: "", rate: "", category: "" };
const ME = { id: "m2", name: "Me", wages: "134,400", bonus: "", tax: "", share: "100", countWages: true, countBonus: false };
// An account from before #112: lines, no months value, June typed in the old Update (4,000 / 9,000).
const OLD = {
  [KEY]: JSON.stringify({ fixed: [RENT], variable: [], accounts: [], categories: [] }),
  [INCOME_KEY]: JSON.stringify({ people: [ME] }),
  [OVERVIEW_KEY]: JSON.stringify({ start: "", growth: "", future: false, years: 1, months: { "2026-06": { expenses: "4,000", income: "9,000" } } }),
};

const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;
const prod = new URL(base).hostname === new URL(DEFAULT_BASE_URL).hostname;
const browser = await chromium.launch();
try {
  if (!email || !password) console.log("INFO SKIPPED: set QA_EMAIL / QA_PASSWORD in env (the preview QA account)");
  else if (prod) check("pf-months runs on a preview only (it writes to the account): refused on production", false, base);
  else await eachViewport({ browser, baseUrl: base, email, password, check, viewports: VIEWPORTS }, async ({ vp, viewport, page }) => {
    const tag = `[${vp}]`;
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 80)));
    const saves = trackSaves(page);
    const original = (await acct(page, base, "GET")).body?.data ?? null;
    const save = page.getByTestId("pf-month-save");
    const note = async () => (await txt(page.getByTestId("pf-month-note")));
    const ov = () => page.evaluate(() => Object.fromEntries(["expenses", "income", "surplus"].map((r) => [r, ["now", "avg"].map((c) => document.querySelector(`[data-testid=pf-ov-${r}] [data-testid=pf-ov-${c}]`)?.textContent.trim())])));
    const stored = async () => (await acct(page, base, "GET")).body?.data ?? {};
    try {
      // PF-55: the old record.
      await acct(page, base, "DELETE");
      await acct(page, base, "PUT", OLD);
      await page.clock.setFixedTime(TODAY);
      await page.addInitScript(() => {
        window.__shifts = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts += e.value; }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`${base}${PATH}`, { waitUntil: "networkidle" });
      await ready(page);
      await page.waitForTimeout(800);
      const opts = [await shownMonth(page), await monthChoices(page)];
      const first = { save: await save.count(), note: await note(), update: await page.getByTestId("pf-update").count(), updateText: await page.getByText("Update month").count(), last: await page.locator("main h2").evaluateAll((hs) => hs.map((h) => h.textContent.trim()).pop()) };
      check(`${tag} PF-48 / #163 PFM-01..PFM-03 Month (Jan..Dec, Nov / Dec disabled) and Year (2026 … 2020), October 2026 shown; no Save, no note; 05 Update gone (04 Overview last)`, opts[0] === "2026-10" && JSON.stringify(opts[1]) === JSON.stringify({"labels":["Month","Year"],"months":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov (disabled)","Dec (disabled)"],"years":["2026","2025","2024","2023","2022","2021","2020"]}) && JSON.stringify(first) === JSON.stringify({ save: 0, note: "", update: 0, updateText: 0, last: "Overview" }), { opts, first });
      const rec0 = await stored();
      const t0 = await ov();
      check(`${tag} PF-55 the old lines became October (stored once, no change shown); June's old total still counts (#140 12-month average = June alone 4,000 / 9,000)`, JSON.stringify(Object.keys(JSON.parse(rec0[MONTHS_KEY] ?? "{}"))) === '["2026-10"]' && JSON.stringify(t0) === JSON.stringify({ expenses: ["1,750.00", "4,000.00"], income: ["11,200.00", "9,000.00"], surplus: ["9,450.00", "5,000.00"] }), { months: rec0[MONTHS_KEY] ?? null, t0 });
      const cls = await page.evaluate(() => window.__shifts);

      // PF-49 / PF-50: a change shows Save; no PUT until Save.
      const puts0 = saves.puts;
      await line(page, "fixed", 0).getByTestId("pf-monthly").fill("1,800");
      await page.waitForTimeout(1200);
      const unsavedText = () => page.getByTestId("pf-unsaved").evaluate((e) => (e.getAttribute("data-shown") === "true" ? e.textContent.trim() : ""));
      const dirty = { save: await save.isVisible(), puts: saves.puts - puts0, ov: await ov(), unsaved: await unsavedText() };
      await line(page, "fixed", 0).getByTestId("pf-monthly").fill("1,750");
      const undone = { save: await save.count(), unsaved: await unsavedText(), ov: await ov() };
      // #144 (Q-V1, PF-159 / PF-162 / PF-167): 04 is live (This month 1,800, surplus 9,400 before Save; was "04 unchanged");
      // `Unsaved changes` beside Save; typing back to 1,750 hides both and 04 is the saved figures again.
      const live = { expenses: ["1,800.00", t0.expenses[1]], income: t0.income, surplus: ["9,400.00", t0.surplus[1]] };
      check(`${tag} PF-49 / PF-50 a change shows Save and \`Unsaved changes\`, nothing is sent (no PUT); #144 04 is live (This month 1,800, surplus 9,400); undoing it hides Save and the indicator, 04 back to saved`, dirty.save && dirty.puts === 0 && JSON.stringify(dirty.ov) === JSON.stringify(live) && dirty.unsaved === "Unsaved changes" && undone.save === 0 && undone.unsaved === "" && JSON.stringify(undone.ov) === JSON.stringify(t0), { dirty, undone, live });

      // PF-54 leaving with unsaved changes asks (beforeunload).
      await page.getByTestId("pf-start").fill("10,000");
      const asked = [];
      const onDialog = (d) => { asked.push(d.type()); void d.dismiss(); };
      page.on("dialog", onDialog);
      await page.goto(`${base}/`, { waitUntil: "load", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      const stayed = new URL(page.url()).pathname;
      page.off("dialog", onDialog);
      check(`${tag} PF-54 leaving with unsaved changes asks the browser's leave-page question (dismissed: stays)`, asked.includes("beforeunload") && stayed === PATH, { asked, stayed });
      await page.getByTestId("pf-start").fill("");

      // PF-51..53 June: #163 (Q-Y6 rejected, PFM-15 / PFM-16) blank; `Copy from current month` copies October's saved
      // lines with the note; edit; Save.
      await pickMonth(page, "2026-06");
      const blankJune = await blankMonth(page);
      check(`${tag} #163 PFM-15 empty June opens blank: no lines, no people, no note, no Save; the control shows Month, Year and "Copy from current month"`, JSON.stringify(blankJune) === JSON.stringify(BLANK_PAST), blankJune);
      await page.getByTestId("pf-month-copy").click();
      const copy = { note: await note(), save: await save.isVisible(), rent: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), wages: await val(page.getByTestId("pf-person-wages")) };
      check(`${tag} PF-51 / PF-55 June (old totals, no lines) after "Copy from current month" is a copy of October with "Copied from October 2026 — edit and save."; Save shown; nothing stored`, JSON.stringify(copy) === JSON.stringify({ note: "Copied from October 2026 — edit and save.", save: true, rent: "1,750", wages: "134,400" }) && (await stored())[MONTHS_KEY] === rec0[MONTHS_KEY], copy);
      await line(page, "fixed", 0).getByTestId("pf-monthly").fill("4,000");
      await page.getByTestId("pf-person-wages").fill("108,000");
      const puts1 = saves.puts;
      await save.click();
      for (let i = 0; i < 50 && (await save.count()) > 0; i++) await page.waitForTimeout(100);
      await page.waitForTimeout(500);
      const after = { month: await shownMonth(page), note: await note(), save: await save.count(), puts: saves.puts - puts1, ov: await ov() };
      const rec1 = await stored();
      const months1 = JSON.parse(rec1[MONTHS_KEY] ?? "{}");
      const legacy = JSON.parse(rec1[OVERVIEW_KEY] ?? "{}").months;
      check(`${tag} PF-52 / PF-53 Save: one PUT; stays on June; note gone; Save hidden; #140 average 4,000 / 9,000 / 5,000 from June's lines; June's old totals dropped; October unchanged`, JSON.stringify({ month: after.month, note: after.note, save: after.save, puts: after.puts }) === JSON.stringify({ month: "2026-06", note: "", save: 0, puts: 1 }) && JSON.stringify(after.ov) === JSON.stringify({ expenses: ["1,750.00", "4,000.00"], income: ["11,200.00", "9,000.00"], surplus: ["9,450.00", "5,000.00"] }) && months1["2026-06"]?.fixed?.[0]?.amount === "4,000" && months1["2026-10"]?.fixed?.[0]?.amount === "1,750" && JSON.stringify(legacy) === "{}", { after, months: Object.keys(months1), legacy });

      // PF-54 switching with unsaved changes: Cancel keeps; OK drops.
      await page.getByTestId("pf-growth").fill("5");
      const confirms = [];
      page.once("dialog", (d) => { confirms.push(d.message()); void d.dismiss(); });
      await pickMonth(page, "2026-10");
      await page.waitForTimeout(200);
      const kept = [await shownMonth(page), await val(page.getByTestId("pf-growth"))];
      page.once("dialog", (d) => { confirms.push(d.message()); void d.accept(); });
      await pickMonth(page, "2026-10");
      await page.waitForTimeout(200);
      const dropped = [await shownMonth(page), await val(page.getByTestId("pf-growth")), await val(line(page, "fixed", 0).getByTestId("pf-monthly"))];
      check(`${tag} PF-54 "Discard unsaved changes?": Cancel keeps June and the edit; OK shows October (its own lines) without it`, JSON.stringify(confirms) === JSON.stringify(["Discard unsaved changes?", "Discard unsaved changes?"]) && JSON.stringify(kept) === '["2026-06","5"]' && JSON.stringify(dropped) === '["2026-10","","1,750"]', { confirms, kept, dropped });

      // PF-58 layout + CLS + gold + scroll. #163 (QA of a936fab, EL 2026-10-16): cls2 is Save shown / hidden only; it
      // used to sum every month change since load, including data → blank ones (now measured per change below).
      await page.evaluate(() => { window.__shifts = 0; });
      await page.getByTestId("pf-start").fill("1");
      const lay = await page.evaluate(() => {
        const r = (id) => document.querySelector(`[data-testid=${id}]`).getBoundingClientRect();
        const t = document.querySelector("h1").getBoundingClientRect();
        const s = r("pf-month"), b = r("pf-month-save");
        return { below: s.top > t.bottom, sel: [Math.round(s.height), Math.round(s.width)], save: Math.round(b.height), row: Math.abs(s.top + s.height / 2 - (b.top + b.height / 2)) <= 2, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          gold: [...document.querySelectorAll("main *")].filter((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.borderColor].some((v) => /gold|rgb\(2[0-4]\d, 1[6-9]\d, [0-9]{1,2}\)/i.test(v)); }).length };
      });
      const shot = join(CFG.out, `pf-months-${viewport.width}.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: shot });
      R.shots.push(shot);
      await page.getByTestId("pf-start").fill("");
      await page.waitForTimeout(600);
      const cls2 = await page.evaluate(() => window.__shifts);
      check(`${tag} PF-58 the control under the title; select ≥ 44 px and ≤ 16rem, Save ≥ 44 px on its row; no horizontal scroll; no gold; strict CLS 0 (load, Save shown / hidden)`, lay.below && lay.sel[0] >= 44 && lay.sel[1] <= 256 && lay.save >= 44 && lay.row && lay.scroll <= 0 && lay.gold === 0 && cls === 0 && cls2 === 0, { ...lay, cls, cls2 });

      // PF-50 a reload shows only what was saved.
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      await pickMonth(page, "2026-06");
      const back = { june: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), note: await note(), ov: await ov() };
      check(`${tag} PF-50 a reload: October shown; June restores its own saved lines (4,000), no note`, back.june === "4,000" && back.note === "" && JSON.stringify(back.ov) === JSON.stringify(after.ov), back);

      // #163 PFM-03..PFM-06 / PFM-08: an old month (March 2021): Year then Month opens a copy of October without asking;
      // edit, Save, reload restores it; Year → the current year with a later month opens October (no future month).
      const dialogs163 = [];
      const onDialog163 = (d) => { dialogs163.push(d.message()); void d.accept(); };
      page.on("dialog", onDialog163);
      await pickMonth(page, "2021-03");
      const blankOld = await blankMonth(page);
      const storedBefore = Object.keys(JSON.parse((await stored())[MONTHS_KEY] ?? "{}"));
      await page.getByTestId("pf-month-copy").click();
      await page.waitForTimeout(300);
      const storedAfterCopy = Object.keys(JSON.parse((await stored())[MONTHS_KEY] ?? "{}"));
      const old = { month: await shownMonth(page), note: await note(), save: await save.isVisible(), rent: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), asked: dialogs163.length };
      await line(page, "fixed", 0).getByTestId("pf-monthly").fill("900");
      await save.click();
      for (let i = 0; i < 50 && (await save.count()) > 0; i++) await page.waitForTimeout(100);
      await page.waitForTimeout(500);
      await pickMonth(page, "2025-12");
      await page.getByTestId("pf-month-year").selectOption("2026");
      const clamp = await shownMonth(page);
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      await pickMonth(page, "2021-03");
      const oldBack = { rent: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), note: await note(), stored: Object.keys(JSON.parse((await stored())[MONTHS_KEY] ?? "{}")) };
      page.off("dialog", onDialog163);
      check(`${tag} #163 PFM-04..PFM-06 / PFM-08 / PFM-15..PFM-17 March 2021 (Year then Month, no question) opens blank; "Copy from current month" → a copy of October with the note and Save, nothing stored until Save; 900 saved; December 2025 → Year 2026 opens October 2026 (PFM-03); a reload restores March 2021 (900, no note) and keeps June and October`, JSON.stringify(blankOld) === JSON.stringify(BLANK_PAST) && JSON.stringify(storedAfterCopy) === JSON.stringify(storedBefore) && !storedAfterCopy.includes("2021-03") && JSON.stringify(old) === JSON.stringify({ month: "2021-03", note: "Copied from October 2026 — edit and save.", save: true, rent: "1,750", asked: 0 }) && clamp === "2026-10" && JSON.stringify(oldBack) === JSON.stringify({ rent: "900", note: "", stored: ["2021-03", "2026-06", "2026-10"] }), { blankOld, storedBefore, storedAfterCopy, old, clamp, oldBack, dialogs163 });

      // PF-56 rollover: 1 November 2026, November empty → a copy of October (the most recent month with lines).
      await page.clock.setFixedTime(NOV_1);
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      const roll = { month: await shownMonth(page), first: (await monthChoices(page)).years[0], disabled: (await monthChoices(page)).months.filter((m) => m.endsWith("(disabled)")), note: await note(), save: await save.isVisible(), rent: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), stored: Object.keys(JSON.parse((await stored())[MONTHS_KEY] ?? "{}")) };
      check(`${tag} PF-56 rollover (clock 1 November 2026): November shown (Dec the only disabled month), a copy of October's lines with "Copied from October 2026 — edit and save."; Save shown; nothing stored`, JSON.stringify(roll) === JSON.stringify({ month: "2026-11", first: "2026", disabled: ["Dec (disabled)"], note: "Copied from October 2026 — edit and save.", save: true, rent: "1,750", stored: ["2021-03", "2026-06", "2026-10"] }), roll);
      // #163 PF-58 / PFM-11 per change (EL ruling 2026-10-16): a change between two months that both have data is
      // strict CLS 0 (each change measured alone, by one select); data → blank is exempt from CLS, but Month, Year,
      // the Save slot and the Copy line must not move. At 360 / 400 / 1024 / 1440 (the page resized in place).
      const ME58 = (id, w) => ({ ...ME, id, wages: w });
      const R58 = (id, a) => ({ ...RENT, id, amount: a });
      await acct(page, base, "PUT", {
        [KEY]: JSON.stringify({ fixed: [R58("o1", "1,750")], variable: [], accounts: [], categories: [] }),
        [INCOME_KEY]: JSON.stringify({ people: [ME58("o2", "134,400")] }),
        [MONTHS_KEY]: JSON.stringify({
          "2026-10": { fixed: [R58("o1", "1,750")], variable: [], people: [ME58("o2", "134,400")] },
          "2025-06": { fixed: [R58("j1", "1,600")], variable: [], people: [ME58("j2", "120,000")] },
          "2025-03": { fixed: [R58("m1", "1,500")], variable: [], people: [ME58("m2", "118,000")] },
          // #165 (QA nit on #164): March 2026 too, for a Year-only data → data change.
          "2026-03": { fixed: [R58("n1", "1,550")], variable: [], people: [ME58("n2", "130,000")] },
        }),
      });
      await page.clock.setFixedTime(TODAY);
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      await pickMonth(page, "2025-06");
      const fixedPos = () => page.evaluate(() => ["pf-month", "pf-month-year", "pf-month-copy-line"].map((id) => document.querySelector(`[data-testid=${id}]`)).concat(document.querySelector(".pf-month-save")).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y + scrollY)]; }));
      const change = async (id, v) => {
        const p0 = await fixedPos();
        await page.evaluate(() => { window.__shifts = 0; });
        await page.getByTestId(id).selectOption(v);
        await page.waitForTimeout(600);
        return { cls: +(await page.evaluate(() => window.__shifts)).toFixed(4), moved: JSON.stringify(p0) !== JSON.stringify(await fixedPos()) };
      };
      const per = {};
      for (const width of [360, 400, 1024, 1440]) {
        await page.setViewportSize({ width, height: viewport.height });
        await page.waitForTimeout(300);
        const dd = await change("pf-month", "03"); // June 2025 → March 2025: both have data
        const yy = await change("pf-month-year", "2026"); // March 2025 → March 2026 by Year only: both have data
        const yy2 = await change("pf-month-year", "2025"); // and back
        const dd2 = await change("pf-month", "06"); // March → June 2025: both have data
        const db = await change("pf-month", "01"); // June → January 2025: blank (exempt from CLS)
        const bd = await change("pf-month", "06"); // January → June 2025: blank → data (exempt from CLS)
        per[width] = { dd, yy, yy2, dd2, db, bd };
      }
      await page.setViewportSize(viewport);
      check(`${tag} PF-58 / PFM-11 per change (EL 2026-10-16) at 360 / 400 / 1024 / 1440: data → data strict CLS 0 (June ⇄ March 2025, and March 2025 ⇄ March 2026 by Year only, #165); data → blank / blank → data exempt from CLS, but Month, Year, Save and the Copy line don't move`, Object.values(per).every((r) => r.dd.cls === 0 && r.dd2.cls === 0 && r.yy.cls === 0 && r.yy2.cls === 0 && !r.yy.moved && !r.yy2.moved && !r.dd.moved && !r.dd2.moved && !r.db.moved && !r.bd.moved), per);
      // #165 PFD-01..PFD-04 / PFD-12 (option A KEEP): delete Travel and Amex while June 2026 is shown, Save; March keeps
      // them on its line as "(deleted)" (stored unchanged); June and October lose them; not offered for another line.
      const T65 = (id, a) => ({ ...RENT, id, name: "Trip", amount: a, category: "Travel", account: "Amex" });
      const M65 = (id, a) => ({ fixed: [R58(`${id}r`, "1,000")], variable: [T65(`${id}t`, a)], people: [] });
      await acct(page, base, "PUT", {
        [KEY]: JSON.stringify({ fixed: [R58("o1", "1,000")], variable: [T65("ot", "400")], accounts: ["Amex"], categories: ["Travel"] }),
        [MONTHS_KEY]: JSON.stringify({ "2026-03": M65("m", "200"), "2026-06": M65("j", "300"), "2026-10": M65("o", "400") }),
      });
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      const march65 = JSON.stringify(JSON.parse((await stored())[MONTHS_KEY])["2026-03"]);
      await pickMonth(page, "2026-06");
      const hasDeleteUi = (await page.getByTestId("pf-delete-category").count()) > 0;
      if (hasDeleteUi) {
        const asked65 = [];
        const onDialog165 = (d) => { asked65.push(d.message()); d.accept(); };
        page.on("dialog", onDialog165);
        const texts65 = [await txt(page.getByTestId("pf-delete-category")), await txt(page.getByTestId("pf-delete-account"))];
        await page.getByTestId("pf-filter").selectOption("Travel");
        await page.getByTestId("pf-delete-category").click();
        await page.getByTestId("pf-acct-filter").selectOption("Amex");
        await page.getByTestId("pf-delete-account").click();
        await save.click();
        await page.waitForTimeout(1200);
        page.off("dialog", onDialog165);
        const m65 = JSON.parse((await stored())[MONTHS_KEY]);
        await pickMonth(page, "2026-03");
        const marchView = await page.evaluate(() => {
          const sel = document.querySelector("[data-testid=pf-group-variable] [data-testid=pf-line] [data-testid=pf-category]");
          const other = document.querySelector("[data-testid=pf-group-fixed] [data-testid=pf-line] [data-testid=pf-category]");
          return { line: sel?.selectedOptions[0]?.textContent, otherOffers: [...(other?.options ?? [])].some((o) => o.value === "Travel"), rows: [...document.querySelectorAll("[data-testid=pf-cat-name], [data-testid=pf-acct-name]")].map((e) => e.textContent.trim()) };
        });
        check(`${tag} #165 PFD-01..PFD-04 / PFD-12 "${DELETE_CATEGORY}" / "${DELETE_ACCOUNT}" on June 2026 ask "${deleteNameQuestion("Travel")}"; after Save June and October lose Travel / Amex, March is stored unchanged and shows "Travel${DELETED_SUFFIX}" / "Amex${DELETED_SUFFIX}"; Travel is not offered for another line`,
          JSON.stringify(texts65) === JSON.stringify([DELETE_CATEGORY, DELETE_ACCOUNT]) && JSON.stringify(asked65) === JSON.stringify([deleteNameQuestion("Travel"), deleteNameQuestion("Amex")]) && JSON.stringify(m65["2026-03"]) === march65 && m65["2026-06"].variable[0].category === "" && m65["2026-10"].variable[0].account === "" && marchView.line === `Travel${DELETED_SUFFIX}` && !marchView.otherOffers && marchView.rows.includes(`Travel${DELETED_SUFFIX}`) && marchView.rows.includes(`Amex${DELETED_SUFFIX}`),
          { texts65, asked65, march: JSON.stringify(m65["2026-03"]) === march65, june: m65["2026-06"].variable[0], marchView });
      } else {
        // PF_DELETE_UI = false (branch fix/pf-keep-deleted-protection-only): the Delete flow can't run, so it's SKIPPED
        // with this reason; the KEEP protection is still checked on a record that already has deleted names.
        console.log(`INFO ${tag} #165 PFD-01 / PFD-13 Delete flow SKIPPED: no Delete buttons (PF_DELETE_UI = false, protection-only build)`);
        await acct(page, base, "PUT", {
          [KEY]: JSON.stringify({ fixed: [R58("o1", "1,000")], variable: [], accounts: [], categories: [], deletedCategories: [{ name: "Travel", from: "2026-06" }], deletedAccounts: [{ name: "Amex", from: "2026-06" }] }),
          [MONTHS_KEY]: JSON.stringify({ "2026-03": M65("m", "200"), "2026-10": { fixed: [R58("or", "1,000")], variable: [], people: [] } }),
        });
        await page.reload({ waitUntil: "networkidle" });
        await ready(page);
        await pickMonth(page, "2026-03");
        const view = await page.evaluate(() => ({
          line: document.querySelector("[data-testid=pf-group-variable] [data-testid=pf-line] [data-testid=pf-category]")?.selectedOptions[0]?.textContent,
          rows: [...document.querySelectorAll("[data-testid=pf-cat-name], [data-testid=pf-acct-name]")].map((e) => e.textContent.trim()),
          buttons: document.querySelectorAll("[data-testid=pf-delete-category], [data-testid=pf-delete-account]").length,
          confirmText: document.body.textContent.includes("This month and later months lose it"),
        }));
        check(`${tag} #165 PFD-15 protection-only (PF_DELETE_UI = false): no Delete buttons or confirm text; March with already-deleted Travel / Amex shows "Travel${DELETED_SUFFIX}" / "Amex${DELETED_SUFFIX}"`, view.buttons === 0 && !view.confirmText && view.line === `Travel${DELETED_SUFFIX}` && view.rows.includes(`Travel${DELETED_SUFFIX}`) && view.rows.includes(`Amex${DELETED_SUFFIX}`), view);
      }
      check(`${tag} no page error; only /api/personal-finance besides auth`, errors.length === 0, errors);
    } catch (e) {
      check(`${tag} ran to the end`, false, String(e?.message ?? e).split("\n")[0]);
    } finally {
      // Put the account's record back as it was (or empty).
      page.removeAllListeners("dialog");
      await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
      await acct(page, base, "DELETE").catch(() => {});
      const end = original ? await acct(page, base, "PUT", original).catch(() => ({ status: 0 })) : { status: 200 };
      check(`${tag} the QA account's record restored`, end.status === 200, end.status);
    }
  });
} finally {
  await browser.close();
}
const fails = R.checks.filter((c) => !c.ok);
writeFileSync(join(CFG.out, "pf-months.json"), JSON.stringify(R, null, 2));
console.log(`\n${R.checks.length - fails.length}/${R.checks.length} passed${fails.length ? `, ${fails.length} FAIL` : ""} · ${R.shots.length} screenshots in ${CFG.out}`);
process.exit(fails.length ? 1 : 0);
