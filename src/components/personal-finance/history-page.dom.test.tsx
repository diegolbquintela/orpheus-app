// #214 / #263 (personal-finance-spec 53, 77; PFHT-03..PFHT-07, PFHT-16, PFHE-01..PFHE-08): the History page in jsdom with the real component.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { loadLocalStore } from "@/lib/finance/account-client";
import { writeRates } from "@/lib/finance/equity";
import { AMOUNT_ERROR, type Line, writeExpenses } from "@/lib/finance/expenses";
import {
  CHOOSE_YEAR,
  HISTORY_LINK,
  HISTORY_PATH,
  LOAD_ERROR,
  NO_MONTHS,
  PICK_YEAR_NOTE,
  SHARED_VALUES_NOTE,
} from "@/lib/finance/history";
import { type SaveHistoryResult, type Version } from "@/lib/finance/history-client";
import { type Person } from "@/lib/finance/income";
import { writeMonths } from "@/lib/finance/months";
import { NO_OVERVIEW, writeOverview } from "@/lib/finance/overview";
import { RecordStore, STALE_MESSAGE, type PfRecord } from "@/lib/finance/record";
import { PersonalFinancePage } from "./expenses-page";
import { HistoryPage, type LoadResult } from "./history-page";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  dom.window.localStorage.clear();
});

const NOW = () => new Date("2026-10-16T16:00:00Z");
const line = (id: string, amount: string): Line => ({
  id,
  name: id,
  amount,
  per: "month",
  equity: "",
  account: "",
  currency: "",
  rate: "",
  category: "",
});
const ann: Person = {
  id: "ann",
  name: "Ann",
  wages: "120000",
  bonus: "",
  tax: "25",
  share: "100",
  countWages: true,
  countBonus: false,
  foreign: false,
  currency: "",
  rate: "",
};

function record(): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: [] });
  writeRates(s, { withdrawal: "4", roic: "10" });
  writeOverview(s, { ...NO_OVERVIEW, start: "100000" });
  writeMonths(s, {
    "2025-03": { fixed: [line("rent", "1000")], variable: [], people: [ann] },
    "2025-07": { fixed: [line("rent", "1050")], variable: [line("food", "200")], people: [ann] },
    "2026-01": { fixed: [line("rent", "1100")], variable: [], people: [ann] },
  });
  return s.data;
}

async function render(
  load: () => Promise<LoadResult>,
  onSignedOut = () => {},
  opts: {
    readOnly?: boolean;
    save?: (rec: PfRecord, baseVersion?: Version) => Promise<SaveHistoryResult>;
  } = {},
) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <HistoryPage
        load={load}
        save={opts.save}
        now={NOW}
        readOnly={opts.readOnly}
        onSignedOut={onSignedOut}
      />,
    ),
  );
  await act(async () => {});
  return container;
}

const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (el: ParentNode, id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];

async function pick(el: HTMLElement, value: string) {
  const select = q(el, "pf-history-year") as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
async function typeInput(inp: HTMLInputElement, value: string) {
  await act(async () => {
    inp.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(inp, value);
    inp.dispatchEvent(new dom.window.Event("keyup", { bubbles: true }));
    inp.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}

describe("#214 / #263 History page", () => {
  it("PFHT-16: the Personal Finance page header links to /personal-finance/history alongside Charts", async () => {
    container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<PersonalFinancePage now={NOW()} loadStore={loadLocalStore} />));
    const link = q(container, "pf-history-link") as HTMLAnchorElement | null;
    assert.ok(link);
    assert.equal(link.getAttribute("href"), HISTORY_PATH);
    assert.equal(link.textContent, HISTORY_LINK);
    assert.ok(q(container, "pf-charts-link"));
  });

  it("PFHT-03: one load on mount; the year comes first: Year select (newest first), no grid until a year is chosen", async () => {
    let calls = 0;
    const el = await render(async () => (calls++, { ok: true, record: record() }));
    assert.equal(calls, 1);
    const opts = [...(q(el, "pf-history-year") as HTMLSelectElement).options].map((o) => o.textContent);
    assert.deepEqual(opts, [CHOOSE_YEAR, "2026", "2025"]);
    assert.equal(q(el, "pf-history-grid"), null);
    assert.equal(q(el, "pf-history-pick")?.textContent, PICK_YEAR_NOTE);
  });

  it("PFHT-04 / PFHE-01: transposed grid — choosing a year shows only that year's stored months as columns (oldest first), and figures as rows", async () => {
    const el = await render(async () => ({ ok: true, record: record() }));
    await pick(el, "2025");
    assert.equal(el.querySelector("thead th.pf-history-month")?.textContent, "Figure");
    assert.deepEqual(qa(el, "pf-history-col").map((c) => c.dataset.month), ["2025-03", "2025-07"]);
    assert.deepEqual(qa(el, "pf-history-col").map((c) => c.textContent), ["March 2025", "July 2025"]);
    assert.match(q(el, "pf-history-caption")!.textContent!, /^2025: 2 stored months, monthly figures in [A-Z]{3}\.$/);
    await pick(el, "2026");
    assert.deepEqual(qa(el, "pf-history-col").map((c) => c.dataset.month), ["2026-01"]);
    await pick(el, "");
    assert.equal(q(el, "pf-history-grid"), null);
  });

  it("PFHT-05 / PFHE-02: transposed Excel-style grid: Figure row headers, one column header per stored month, editable inputs on stored lines and read-only spans on derived rows and — cells", async () => {
    const el = await render(async () => ({ ok: true, record: record() }));
    await pick(el, "2025");
    const cols = qa(el, "pf-history-col");
    assert.equal(cols.length, 2);
    const figLabels = qa(el, "pf-history-figure").map((h) => h.textContent);
    assert.deepEqual(figLabels.slice(0, 3), ["Ann · Wages", "rent", "food"]);
    assert.ok(figLabels.includes("Equity coverage (monthly)") && figLabels.includes("Net assets") && figLabels.includes("Expenses"));
    for (const r of qa(el, "pf-history-row")) assert.equal(r.querySelectorAll("td").length, cols.length);

    const foodRow = el.querySelector('tr[data-figure="expense:food"]')!;
    const foodMar = foodRow.querySelector('td[data-month="2025-03"]')!;
    const foodJulInput = foodRow.querySelector<HTMLInputElement>('td[data-month="2025-07"] input[data-testid="pf-history-input"]')!;
    assert.equal(foodMar.textContent, "—");
    assert.equal(foodMar.querySelector("input"), null);
    assert.ok(foodJulInput);
    assert.equal(foodJulInput.value, "200.00");

    // Derived rows have 0 inputs
    for (const figId of ["income", "fixed", "variable", "expenses", "surplus", "net-assets", "coverage", "coverage-share"]) {
      const row = el.querySelector(`tr[data-figure="${figId}"]`)!;
      assert.equal(row.querySelectorAll("input").length, 0, figId);
    }

    const scroll = q(el, "pf-history-scroll")!;
    assert.equal(scroll.getAttribute("role"), "region");
    assert.equal(scroll.getAttribute("tabindex"), "0");
    assert.ok(el.querySelector("caption")?.textContent?.startsWith("Stored months in 2025"));
  });

  it("PFHE-03: editing a cell live-recomputes Fixed expenses, Variable expenses, Income, Expenses, Surplus, Net assets, and Equity coverage across the grid", async () => {
    const el = await render(async () => ({ ok: true, record: record(), version: "v1" }));
    await pick(el, "2025");
    const cellText = (figId: string, month: string) =>
      el.querySelector(`tr[data-figure="${figId}"] td[data-month="${month}"]`)?.textContent;

    assert.equal(cellText("fixed", "2025-03"), "1,000.00");
    assert.equal(cellText("expenses", "2025-03"), "1,000.00");
    assert.equal(cellText("surplus", "2025-03"), "6,500.00");
    assert.equal(cellText("net-assets", "2025-03"), "106,500.00");
    assert.equal(cellText("net-assets", "2025-07"), "112,750.00");

    const rentMar = el.querySelector<HTMLInputElement>('input[data-month="2025-03"][data-figure="expense:rent"]')!;
    await typeInput(rentMar, "1500");

    assert.equal(cellText("fixed", "2025-03"), "1,500.00");
    assert.equal(cellText("expenses", "2025-03"), "1,500.00");
    assert.equal(cellText("surplus", "2025-03"), "6,000.00");
    assert.equal(cellText("net-assets", "2025-03"), "106,000.00");
    assert.equal(cellText("net-assets", "2025-07"), "112,250.00");
    assert.equal(q(el, "pf-history-status")?.textContent, "Unsaved changes");
  });

  it("PFHE-04..05: Save sends PUT with { data, baseVersion }, shows Saved., and the saved record opens with updated values on PersonalFinancePage", async () => {
    const calls: { rec: PfRecord; baseVersion?: Version }[] = [];
    const el = await render(
      async () => ({ ok: true, record: record(), version: "v-initial" }),
      () => {},
      {
        save: async (rec, baseVersion) => {
          calls.push({ rec, baseVersion });
          return { ok: true, version: "v-next", record: rec };
        },
      },
    );
    await pick(el, "2026");
    const rentJan26 = el.querySelector<HTMLInputElement>('input[data-month="2026-01"][data-figure="expense:rent"]')!;
    assert.equal(rentJan26.value, "1,100.00");
    const saveBtn = q(el, "pf-history-save") as HTMLButtonElement;
    assert.equal(saveBtn.disabled, true);

    await typeInput(rentJan26, "1350");
    assert.equal(saveBtn.disabled, false);
    assert.equal(q(el, "pf-history-status")?.textContent, "Unsaved changes");

    await act(async () => saveBtn.click());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].baseVersion, "v-initial");
    assert.equal(q(el, "pf-history-status")?.textContent, "Saved.");
    assert.equal(saveBtn.disabled, true);
    assert.equal(rentJan26.value, "1,350.00");

    // Verify round-trip: load saved record into localStorage and open January 2026 on PersonalFinancePage
    for (const [k, v] of Object.entries(calls[0].rec)) dom.window.localStorage.setItem(k, v);
    await act(async () => root!.render(<PersonalFinancePage now={NOW()} loadStore={loadLocalStore} />));
    const yearSel = q(container!, "pf-month-year") as HTMLSelectElement;
    const monthSel = q(container!, "pf-month") as HTMLSelectElement;
    await act(async () => {
      yearSel.value = "2026";
      yearSel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    await act(async () => {
      monthSel.value = "01";
      monthSel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    const monthlyInputs = qa(container!, "pf-monthly") as HTMLInputElement[];
    assert.ok(monthlyInputs.some((inp) => inp.value === "1,350" || inp.value === "1350"));
  });

  it("PFHE-06: invalid input marks aria-invalid, blocks Save (0 PUTs), focuses the invalid input, and shows Not saved.; Discard reverts edits", async () => {
    let puts = 0;
    const el = await render(
      async () => ({ ok: true, record: record(), version: "v1" }),
      () => {},
      {
        save: async () => {
          puts++;
          return { ok: true, version: "v2" };
        },
      },
    );
    await pick(el, "2025");
    const rentMar = el.querySelector<HTMLInputElement>('input[data-month="2025-03"][data-figure="expense:rent"]')!;
    await typeInput(rentMar, "abc");
    assert.equal(rentMar.getAttribute("aria-invalid"), "true");
    assert.equal(rentMar.getAttribute("title"), AMOUNT_ERROR);

    const saveBtn = q(el, "pf-history-save") as HTMLButtonElement;
    await act(async () => saveBtn.click());
    assert.equal(puts, 0);
    assert.equal(q(el, "pf-history-status")?.textContent, "Not saved.");
    assert.equal(dom.window.document.activeElement, rentMar);

    const discardBtn = q(el, "pf-history-discard") as HTMLButtonElement;
    await act(async () => discardBtn.click());
    assert.equal(rentMar.value, "1,000.00");
    assert.equal(rentMar.getAttribute("aria-invalid"), null);
    assert.equal(q(el, "pf-history-status")?.textContent, "");
  });

  it("PFHE-07: 409 stale response displays STALE_MESSAGE and keeps draft edits; switching years preserves unsaved draft edits", async () => {
    const el = await render(
      async () => ({ ok: true, record: record(), version: "v-old" }),
      () => {},
      {
        save: async () => ({ ok: false, stale: true, status: 409, message: STALE_MESSAGE }),
      },
    );
    await pick(el, "2025");
    const rentMar = el.querySelector<HTMLInputElement>('input[data-month="2025-03"][data-figure="expense:rent"]')!;
    await typeInput(rentMar, "1400");

    // Switch to 2026 and back to 2025: draft edit is preserved and carries forward into 2026 net assets
    await pick(el, "2026");
    const netJan26 = el.querySelector('tr[data-figure="net-assets"] td[data-month="2026-01"]')!;
    assert.equal(netJan26.textContent, "118,750.00");

    await pick(el, "2025");
    const rentMarAgain = el.querySelector<HTMLInputElement>('input[data-month="2025-03"][data-figure="expense:rent"]')!;
    assert.equal(rentMarAgain.value, "1400");

    await act(async () => (q(el, "pf-history-save") as HTMLButtonElement).click());
    assert.equal(q(el, "pf-history-status")?.textContent, STALE_MESSAGE);
    assert.equal(q(el, "pf-stale-error")?.textContent, STALE_MESSAGE);
    assert.equal(rentMarAgain.value, "1400");
  });

  it("PFHT-22 (CFO, Q-HT6): the shared-values note shows with the grid, above it, and not before a year is chosen", async () => {
    const el = await render(async () => ({ ok: true, record: record() }));
    assert.equal(q(el, "pf-history-shared-note"), null);
    await pick(el, "2025");
    const note = q(el, "pf-history-shared-note")!;
    assert.equal(note.textContent, SHARED_VALUES_NOTE);
    assert.ok(note.compareDocumentPosition(q(el, "pf-history-scroll")!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("PFHT-06 / PFHE-08: readOnly mode renders READ_ONLY_NOTE, 0 inputs or buttons in the grid, no Save button, and no write request", async () => {
    const seen: string[] = [];
    const orig = dom.window.fetch;
    (dom.window as unknown as { fetch: unknown }).fetch = async (u: string, init?: RequestInit) => (
      seen.push(`${init?.method ?? "GET"} ${u}`),
      new Response("{}")
    );
    try {
      const el = await render(async () => ({ ok: true, record: record() }), () => {}, { readOnly: true });
      await pick(el, "2025");
      assert.equal(q(el, "pf-history-grid")!.querySelectorAll("input, button, select, textarea, [contenteditable]").length, 0);
      assert.equal(q(el, "pf-history-save"), null);
      assert.deepEqual(seen, []);
      assert.ok(q(el, "pf-read-only")?.textContent?.startsWith("Read-only."));
      assert.ok(q(el, "pf-history-readonly")?.textContent?.startsWith("Read-only."));
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("PFHT-07: no stored months → a note, no Year select; a failed load → an error; 401 → sign-in", async () => {
    let el = await render(async () => ({ ok: true, record: null }));
    assert.equal(q(el, "pf-history-empty")?.textContent, NO_MONTHS);
    assert.equal(q(el, "pf-history-year"), null);
    await act(async () => root?.unmount());
    el = await render(async () => ({ ok: false, status: 500 }));
    assert.equal(q(el, "pf-history-error")?.textContent, LOAD_ERROR);
    await act(async () => root?.unmount());
    let out = 0;
    await render(async () => ({ ok: false, status: 401 }), () => out++);
    assert.equal(out, 1);
  });

  it("styles keep the grid inside its scroll container and the Figure column sticky; no tabular-nums on dark", () => {
    const css = readFileSync("src/styles.css", "utf8");
    assert.match(css, /\.pf-history-scroll\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/);
    assert.match(css, /\.pf-history-grid\s+\.pf-history-month\s*\{[^}]*position:\s*sticky;\s*left:\s*0;/);
    for (const m of css.matchAll(/\.pf-history[^{]*\{([^}]*)\}/g))
      assert.doesNotMatch(m[1], /tabular-nums|"tnum"/);
  });

  it("PFHE-05b: default saveHistory sends PUT /api/personal-finance with { data, baseVersion } and handles 200 and 409", async () => {
    const requests: { url: string; method: string; body: unknown }[] = [];
    const orig = globalThis.fetch;
    let nextStatus = 200;
    (globalThis as unknown as { fetch: unknown }).fetch = async (u: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return new Response(JSON.stringify({ data: record(), version: "v-100", access: { owner: true, write: true } }), { status: 200 });
      }
      requests.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (nextStatus === 409) {
        return new Response(JSON.stringify({ error: STALE_MESSAGE, code: "stale" }), { status: 409 });
      }
      return new Response(JSON.stringify({ version: "v-101" }), { status: 200 });
    };
    try {
      container = dom.window.document.createElement("div");
      dom.window.document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => root!.render(<HistoryPage now={NOW} />));
      await act(async () => {});
      await pick(container, "2025");
      const rentMar = container.querySelector<HTMLInputElement>('input[data-month="2025-03"][data-figure="expense:rent"]')!;
      await typeInput(rentMar, "1250");
      await act(async () => (q(container!, "pf-history-save") as HTMLButtonElement).click());
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, "PUT");
      assert.equal(requests[0].url, "/api/personal-finance");
      assert.equal((requests[0].body as { baseVersion?: string }).baseVersion, "v-100");
      assert.equal(q(container, "pf-history-status")?.textContent, "Saved.");

      nextStatus = 409;
      await typeInput(rentMar, "1300");
      await act(async () => (q(container!, "pf-history-save") as HTMLButtonElement).click());
      assert.equal(requests.length, 2);
      assert.equal((requests[1].body as { baseVersion?: string }).baseVersion, "v-101");
      assert.equal(q(container, "pf-history-status")?.textContent, STALE_MESSAGE);
    } finally {
      (dom.window as unknown as { fetch: unknown }).fetch = orig;
    }
  });
});
