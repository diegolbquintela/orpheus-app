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
export async function settle(page) {
  await page.waitForTimeout(700);
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
