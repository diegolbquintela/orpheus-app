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
//   PF-58 layout: the row under the title, select / Save ≥ 44 px, no gold, no horizontal scroll, strict CLS 0
//
//   QA_EMAIL=… QA_PASSWORD=… node qa/tools/pf-months.mjs --base-url <preview> --out <dir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_BASE_URL, qaConfig } from "./config.mjs";
import { eachViewport } from "./session.mjs";
import { PATH, acct, line, ready, trackSaves, txt, val } from "./pf-helpers.mjs";

const CFG = qaConfig(import.meta.url);
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
    const sel = page.getByTestId("pf-month");
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
      const opts = await sel.evaluate((s) => [s.value, [...s.options].map((o) => o.textContent)]);
      const first = { label: await txt(page.getByTestId("pf-month-control").locator("label")), save: await save.count(), note: await note(), update: await page.getByTestId("pf-update").count(), updateText: await page.getByText("Update month").count(), last: await page.locator("main h2").evaluateAll((hs) => hs.map((h) => h.textContent.trim()).pop()) };
      check(`${tag} PF-48 Month: 12 choices October 2026 … November 2025, October shown; no Save, no note; 05 Update gone (04 Overview last)`, opts[0] === "2026-10" && opts[1].length === 12 && opts[1][0] === "October 2026" && opts[1][11] === "November 2025" && JSON.stringify(first) === JSON.stringify({ label: "Month", save: 0, note: "", update: 0, updateText: 0, last: "Overview" }), { opts, first });
      const rec0 = await stored();
      const t0 = await ov();
      check(`${tag} PF-55 the old lines became October (stored once, no change shown); June's old total still counts (#140 12-month average = June alone 4,000 / 9,000)`, JSON.stringify(Object.keys(JSON.parse(rec0[MONTHS_KEY] ?? "{}"))) === '["2026-10"]' && JSON.stringify(t0) === JSON.stringify({ expenses: ["1,750", "4,000"], income: ["11,200", "9,000"], surplus: ["9,450", "5,000"] }), { months: rec0[MONTHS_KEY] ?? null, t0 });
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
      const live = { expenses: ["1,800", t0.expenses[1]], income: t0.income, surplus: ["9,400", t0.surplus[1]] };
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

      // PF-51..53 June: a copy of October's saved lines, the note; edit; Save.
      await sel.selectOption("2026-06");
      const copy = { note: await note(), save: await save.isVisible(), rent: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), wages: await val(page.getByTestId("pf-person-wages")) };
      check(`${tag} PF-51 / PF-55 June (old totals, no lines) opens as a copy of October with "Copied from October 2026 — edit and save."; Save shown; nothing stored`, JSON.stringify(copy) === JSON.stringify({ note: "Copied from October 2026 — edit and save.", save: true, rent: "1,750", wages: "134,400" }) && (await stored())[MONTHS_KEY] === rec0[MONTHS_KEY], copy);
      await line(page, "fixed", 0).getByTestId("pf-monthly").fill("4,000");
      await page.getByTestId("pf-person-wages").fill("108,000");
      const puts1 = saves.puts;
      await save.click();
      for (let i = 0; i < 50 && (await save.count()) > 0; i++) await page.waitForTimeout(100);
      await page.waitForTimeout(500);
      const after = { month: await sel.inputValue(), note: await note(), save: await save.count(), puts: saves.puts - puts1, ov: await ov() };
      const rec1 = await stored();
      const months1 = JSON.parse(rec1[MONTHS_KEY] ?? "{}");
      const legacy = JSON.parse(rec1[OVERVIEW_KEY] ?? "{}").months;
      check(`${tag} PF-52 / PF-53 Save: one PUT; stays on June; note gone; Save hidden; #140 average 4,000 / 9,000 / 5,000 from June's lines; June's old totals dropped; October unchanged`, JSON.stringify({ month: after.month, note: after.note, save: after.save, puts: after.puts }) === JSON.stringify({ month: "2026-06", note: "", save: 0, puts: 1 }) && JSON.stringify(after.ov) === JSON.stringify({ expenses: ["1,750", "4,000"], income: ["11,200", "9,000"], surplus: ["9,450", "5,000"] }) && months1["2026-06"]?.fixed?.[0]?.amount === "4,000" && months1["2026-10"]?.fixed?.[0]?.amount === "1,750" && JSON.stringify(legacy) === "{}", { after, months: Object.keys(months1), legacy });

      // PF-54 switching with unsaved changes: Cancel keeps; OK drops.
      await page.getByTestId("pf-growth").fill("5");
      const confirms = [];
      page.once("dialog", (d) => { confirms.push(d.message()); void d.dismiss(); });
      await sel.selectOption("2026-10");
      await page.waitForTimeout(200);
      const kept = [await sel.inputValue(), await val(page.getByTestId("pf-growth"))];
      page.once("dialog", (d) => { confirms.push(d.message()); void d.accept(); });
      await sel.selectOption("2026-10");
      await page.waitForTimeout(200);
      const dropped = [await sel.inputValue(), await val(page.getByTestId("pf-growth")), await val(line(page, "fixed", 0).getByTestId("pf-monthly"))];
      check(`${tag} PF-54 "Discard unsaved changes?": Cancel keeps June and the edit; OK shows October (its own lines) without it`, JSON.stringify(confirms) === JSON.stringify(["Discard unsaved changes?", "Discard unsaved changes?"]) && JSON.stringify(kept) === '["2026-06","5"]' && JSON.stringify(dropped) === '["2026-10","","1,750"]', { confirms, kept, dropped });

      // PF-58 layout + CLS + gold + scroll.
      await page.getByTestId("pf-start").fill("1");
      const lay = await page.evaluate(() => {
        const r = (id) => document.querySelector(`[data-testid=${id}]`).getBoundingClientRect();
        const t = document.querySelector("h1").getBoundingClientRect();
        const s = r("pf-month"), b = r("pf-month-save");
        return { below: s.top > t.bottom, sel: [Math.round(s.height), Math.round(s.width)], save: Math.round(b.height), row: Math.abs(s.top + s.height / 2 - (b.top + b.height / 2)) <= 2, scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          gold: [...document.querySelectorAll("main *")].filter((e) => { const c = getComputedStyle(e); return [c.color, c.backgroundColor, c.borderColor].some((v) => /gold|rgb\(2[0-4]\d, 1[6-9]\d, [0-9]{1,2}\)/i.test(v)); }).length };
      });
      const cls2 = await page.evaluate(() => window.__shifts);
      check(`${tag} PF-58 the control under the title; select ≥ 44 px and ≤ 16rem, Save ≥ 44 px on its row; no horizontal scroll; no gold; strict CLS 0 (load, Save shown / hidden)`, lay.below && lay.sel[0] >= 44 && lay.sel[1] <= 256 && lay.save >= 44 && lay.row && lay.scroll <= 0 && lay.gold === 0 && cls === 0 && cls2 === 0, { ...lay, cls, cls2 });
      const shot = join(CFG.out, `pf-months-${viewport.width}.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: shot });
      R.shots.push(shot);
      await page.getByTestId("pf-start").fill("");

      // PF-50 a reload shows only what was saved.
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      await sel.selectOption("2026-06");
      const back = { june: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), note: await note(), ov: await ov() };
      check(`${tag} PF-50 a reload: October shown; June restores its own saved lines (4,000), no note`, back.june === "4,000" && back.note === "" && JSON.stringify(back.ov) === JSON.stringify(after.ov), back);

      // PF-56 rollover: 1 November 2026, November empty → a copy of October (the most recent month with lines).
      await page.clock.setFixedTime(NOV_1);
      await page.reload({ waitUntil: "networkidle" });
      await ready(page);
      const roll = { month: await sel.inputValue(), first: await sel.evaluate((s) => s.options[0].textContent), note: await note(), save: await save.isVisible(), rent: await val(line(page, "fixed", 0).getByTestId("pf-monthly")), stored: Object.keys(JSON.parse((await stored())[MONTHS_KEY] ?? "{}")) };
      check(`${tag} PF-56 rollover (clock 1 November 2026): November shown, a copy of October's lines with "Copied from October 2026 — edit and save."; Save shown; nothing stored`, JSON.stringify(roll) === JSON.stringify({ month: "2026-11", first: "November 2026", note: "Copied from October 2026 — edit and save.", save: true, rent: "1,750", stored: ["2026-06", "2026-10"] }), roll);
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
