// Shared helpers for the Personal Finance QA tools (#98 e2e): the account record from inside the page, debounced
// saves, cell readers and the WCAG contrast scan (same rules as personal-finance.mjs).
export const PATH = "/personal-finance";
export const API = "/api/personal-finance";

// The account, from inside the page (the session cookie rides along; Playwright's API client drops the Secure cookie
// on a plain-http local server). A page not yet on this host first opens the API's own URL (a harmless GET).
export async function acct(page, base, method, data, path = API) {
  if (!page.url().startsWith(base)) await page.goto(`${base}${API}`);
  return page.evaluate(async ([m, url, d]) => {
    const r = await fetch(url, { method: m, headers: d === undefined ? {} : { "content-type": "application/json" }, body: d === undefined ? undefined : JSON.stringify({ data: d }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [method, path, data]);
}

// Saves are debounced (400 ms): wait past the debounce, then until no PUT is in flight.
const saving = new WeakMap();
export function trackSaves(page) {
  const s = { n: 0, puts: 0 };
  saving.set(page, s);
  const mine = (q) => q.method() === "PUT" && new URL(q.url()).pathname === API;
  page.on("request", (q) => { if (mine(q)) { s.n++; s.puts++; } });
  page.on("requestfinished", (q) => { if (mine(q)) s.n--; });
  page.on("requestfailed", (q) => { if (mine(q)) s.n--; });
  return s;
}
// #112: no autosave. `settle` presses `Save` when it shows, then waits until no PUT is in flight.
export async function settle(page) {
  const save = page.getByTestId("pf-month-save");
  if ((await save.isVisible().catch(() => false)) && (await save.isEnabled().catch(() => false))) await save.click().catch(() => {});
  for (let i = 0; i < 100 && (await save.isVisible().catch(() => false)) && !(await save.isEnabled().catch(() => true)); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(300);
  for (let i = 0; i < 100 && (saving.get(page)?.n ?? 0) > 0; i++) await page.waitForTimeout(100);
}
export const ready = (page) => page.locator("[data-testid=pf-area][data-ready=true]").waitFor();
export const val = (loc) => loc.inputValue();
export const txt = async (loc) => (await loc.textContent()).trim();
export const line = (page, group, i) => page.locator(`[data-testid=pf-group-${group}] [data-testid=pf-line]`).nth(i);
export const totals = async (page, id) => {
  const row = page.locator(`[data-testid=pf-total-${id}]`);
  const out = [];
  for (const f of ["share", "income", "monthly", "yearly", "equity"]) out.push(await txt(row.locator(`[data-testid=pf-total-${f}]`)));
  return out;
};
export const lum = ([r, g, b]) => {
  const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

// In the page: WCAG contrast of every visible text node's element against its effective background.
export async function contrastScan(page) {
  return page.evaluate(() => {
    const parse = (c) => {
      const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(c);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
    };
    const lum = ([r, g, b]) => {
      const f = (x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const blend = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
    const bgOf = (el) => {
      const stack = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] > 0) {
          stack.push(c);
          if (c[3] === 1) break;
        }
      }
      let bg = [255, 255, 255];
      for (const c of stack.reverse()) bg = blend(c, bg);
      return bg;
    };
    const bad = [];
    let n = 0;
    const check = (el, text) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden") return;
      let o = 1;
      for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      if (o < 0.99) return;
      const fg = parse(cs.color);
      if (!fg || fg[3] === 0) return;
      const bg = bgOf(el);
      const c = blend(fg, bg);
      const [hi, lo] = [lum(c), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      n++;
      if (ratio < (large ? 3 : 4.5)) bad.push({ text: text.slice(0, 40), ratio: Math.round(ratio * 100) / 100 });
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      const el = t.parentElement;
      if (!el || el.closest("script, style, noscript, option, .sr-only")) continue;
      check(el, t.nodeValue.trim());
    }
    // Field values (typed text and the shown conversion) and the selects' shown option.
    for (const el of document.querySelectorAll("main input:not([type=checkbox]), main select"))
      if ((el.value ?? "").trim()) check(el, el.tagName === "SELECT" ? el.selectedOptions[0]?.text ?? "" : el.value);
    return { n, bad: bad.slice(0, 10) };
  });
}

// #163 (spec section 34): the month control is Month (`pf-month`, 01..12) + Year (`pf-month-year`).
/** The month shown, `yyyy-mm`. */
export const shownMonth = async (page) =>
  `${await page.getByTestId("pf-month-year").inputValue()}-${await page.getByTestId("pf-month").inputValue()}`;
/** Choose a month as a person does: the Year (when it differs), then the Month. */
export async function pickMonth(page, key) {
  const [y, m] = key.split("-");
  if ((await page.getByTestId("pf-month-year").inputValue()) !== y) await page.getByTestId("pf-month-year").selectOption(y);
  if ((await page.getByTestId("pf-month").inputValue()) !== m) await page.getByTestId("pf-month").selectOption(m);
}
/** The control's choices: the Month options with their disabled flag, and the years. */
export const monthChoices = (page) =>
  page.getByTestId("pf-month-control").evaluate((c) => ({
    labels: [...c.querySelectorAll("label")].map((l) => l.textContent.trim()),
    months: [...c.querySelector("[data-testid=pf-month]").options].map((o) => o.textContent + (o.disabled ? " (disabled)" : "")),
    years: [...c.querySelector("[data-testid=pf-month-year]").options].map((o) => o.textContent),
  }));

// #163 (Q-Y6 rejected, PFM-15..PFM-19): an empty past month opens blank; this button copies the current month in.
export const COPY_FROM_CURRENT = "Copy from current month";
/** An empty past month as shown: lines, people, the note, Save, and the month control's own texts (labels + button). */
export const blankMonth = (page) =>
  page.evaluate(() => ({
    lines: document.querySelectorAll("[data-testid=pf-line]").length,
    people: document.querySelectorAll("[data-testid=pf-person]").length,
    note: document.querySelector("[data-testid=pf-month-note]")?.textContent.trim() ?? null,
    save: document.querySelectorAll("[data-testid=pf-month-save]").length,
    texts: [...document.querySelectorAll("[data-testid=pf-month-control] label, [data-testid=pf-month-control] button")].filter((e) => getComputedStyle(e).visibility !== "hidden").map((e) => e.textContent.trim()),
  }));
/** (#163 PFM-11: `texts` lists only visible controls; the copy line is always rendered, hidden by visibility.) What `blankMonth` reads on an empty past month for a writer (the current month has saved lines). */
export const BLANK_PAST = { lines: 0, people: 0, note: "", save: 0, texts: ["Month", "Year", COPY_FROM_CURRENT] };

// #165 (spec section 35, PFD-12): the visible texts of deleting a category / account (option A KEEP).
export const DELETE_CATEGORY = "Delete category";
export const DELETE_ACCOUNT = "Delete account";
export const DELETED_SUFFIX = " (deleted)";
export const deleteNameQuestion = (name) => `Delete ${name}? This month and later months lose it; earlier months keep it, marked (deleted).`;
export const NAME_DELETED = "That name was deleted. Add it again to restore it.";
// #155 (spec section 37): API texts of /api/personal-finance/chart (no page text; backend only).
export const NO_SAVED_REPORT = "No saved report.";
export const FX_BASIS_CURRENT = "current";
// #156 (spec section 38): API texts of /api/personal-finance/reports (no page text; backend only).
export const REPORT_NOT_FOUND = "Report not found.";
export const REPORT_LIMIT = "Report limit reached.";
export const NAME_TAKEN = "Name already used.";
export const DEFAULT_NAME_FIXED = "The default report cannot be renamed.";
export const DEFAULT_REPORT_NAME = "Default";
// #157 (spec section 39): texts printed in the PF exports (PDF / PNG; backend only).
export const EXPORT_FX_LINE = "FX basis: current (every month is valued at today's rates, not historical rates)";
export const EXPORT_MIXED_LINE = "Mixed axes: net assets (a level) share this chart with flows (amounts per month).";
export const NET_ASSETS_CAVEAT = "Starting net assets is defined at the Overview window start but anchored here at the first data month, so the absolute level can be off by the surplus between those dates. The month-to-month shape is right; the level isn't trustworthy until an explicit as-of month is stored (follow-up ticket).";
// #157 PFX-18: the note bar / stacked-bar exports carry (PNG drawn text + tEXt `orpheus-note`; PDF header line).
export const EXPORT_LINES_NOTE = "Rendered as lines";
// #157 PFX-19: 503 when the export could not be audited (fail closed; no file sent).
export const EXPORT_UNAVAILABLE = "Export unavailable. Try again.";
// #179 (spec 41.5; Q-AF1 / Q-AF2): a saved `all` report's export range text (must equal src/lib/finance/export.ts).
export const EXPORT_ALL_DATA = "All data";
export const EXPORT_NO_DATA_YET = "no data yet";
export const exportAllRange = (from, to) => `Range: ${EXPORT_ALL_DATA} (${from} to ${to})`;
export const exportAllNoData = (month) => `Range: ${EXPORT_ALL_DATA} (${EXPORT_NO_DATA_YET}, ${month})`;
