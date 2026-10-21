// #214 (personal-finance-spec 53; PFHT-03..PFHT-07, PFHT-16): the History page in jsdom with the real component.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HistoryPage, type LoadResult } from "./history-page";
import { writeRates } from "@/lib/finance/equity";
import { writeExpenses } from "@/lib/finance/expenses";
import { SHARED_VALUES_NOTE, CHOOSE_YEAR, LOAD_ERROR, NO_MONTHS, PICK_YEAR_NOTE } from "@/lib/finance/history";
import { writeMonths } from "@/lib/finance/months";
import { RecordStore, type PfRecord } from "@/lib/finance/record";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

const NOW = () => new Date("2026-10-16T16:00:00Z");
const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month" as const, equity: "", account: "", currency: "", rate: "", category: "" });
function record(): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: [] });
  writeRates(s, { withdrawal: "4", roic: "10" });
  writeMonths(s, {
    "2025-03": { fixed: [line("rent", "1000")], variable: [], people: [] },
    "2025-07": { fixed: [line("rent", "1050")], variable: [line("food", "200")], people: [] },
    "2026-01": { fixed: [line("rent", "1100")], variable: [], people: [] },
  });
  return s.data;
}

async function render(load: () => Promise<LoadResult>, onSignedOut = () => {}) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<HistoryPage load={load} now={NOW} onSignedOut={onSignedOut} />));
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

describe("#214 History page", () => {
  it("PFHT-03: one load on mount; the year comes first: Year select (newest first), no grid until a year is chosen", async () => {
    let calls = 0;
    const el = await render(async () => (calls++, { ok: true, record: record() }));
    assert.equal(calls, 1);
    const opts = [...(q(el, "pf-history-year") as HTMLSelectElement).options].map((o) => o.textContent);
    assert.deepEqual(opts, [CHOOSE_YEAR, "2026", "2025"]);
    assert.equal(q(el, "pf-history-grid"), null);
    assert.equal(q(el, "pf-history-pick")?.textContent, PICK_YEAR_NOTE);
  });
  it("PFHT-04: choosing a year shows only that year's stored months; another year swaps them", async () => {
    const el = await render(async () => ({ ok: true, record: record() }));
    await pick(el, "2025");
    assert.deepEqual(qa(el, "pf-history-row").map((r) => r.dataset.month), ["2025-03", "2025-07"]);
    assert.deepEqual(qa(el, "pf-history-row").map((r) => r.querySelector("th")?.textContent), ["March 2025", "July 2025"]);
    assert.match(q(el, "pf-history-caption")!.textContent!, /^2025: 2 stored months, monthly figures in [A-Z]{3}\.$/);
    await pick(el, "2026");
    assert.deepEqual(qa(el, "pf-history-row").map((r) => r.dataset.month), ["2026-01"]);
    await pick(el, "");
    assert.equal(q(el, "pf-history-grid"), null);
  });
  it("PFHT-05: an Excel-style grid: Month row headers, one column header per figure, a cell per column", async () => {
    const el = await render(async () => ({ ok: true, record: record() }));
    await pick(el, "2025");
    const heads = qa(el, "pf-history-col").map((h) => h.textContent);
    assert.deepEqual(heads.slice(0, 2), ["rent", "food"]);
    assert.ok(heads.includes("Equity coverage (monthly)") && heads.includes("Net assets") && heads.includes("Expenses"));
    for (const r of qa(el, "pf-history-row")) assert.equal(r.querySelectorAll("td").length, heads.length);
    const march = qa(el, "pf-history-row")[0];
    assert.deepEqual([...march.querySelectorAll("td")].slice(0, 2).map((c) => c.textContent), ["1,000.00", "—"]);
    const scroll = q(el, "pf-history-scroll")!;
    assert.equal(scroll.getAttribute("role"), "region");
    assert.equal(scroll.getAttribute("tabindex"), "0");
    assert.ok(el.querySelector("caption")?.textContent?.startsWith("Stored months in 2025"));
  });
  it("PFHT-22 (CFO, Q-HT6): the shared-values note shows with the grid, above it, and not before a year is chosen", async () => {
    const el = await render(async () => ({ ok: true, record: record() }));
    assert.equal(q(el, "pf-history-shared-note"), null);
    await pick(el, "2025");
    const note = q(el, "pf-history-shared-note")!;
    assert.equal(note.textContent, SHARED_VALUES_NOTE);
    assert.ok(note.compareDocumentPosition(q(el, "pf-history-scroll")!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  });
  it("PFHT-06: read-only: no inputs or buttons in the grid, and no write request", async () => {
    const seen: string[] = [];
    const orig = dom.window.fetch;
    (dom.window as unknown as { fetch: unknown }).fetch = async (u: string, init?: RequestInit) => (seen.push(`${init?.method ?? "GET"} ${u}`), new Response("{}"));
    try {
      const el = await render(async () => ({ ok: true, record: record() }));
      await pick(el, "2025");
      assert.equal(q(el, "pf-history-grid")!.querySelectorAll("input, button, select, textarea, [contenteditable]").length, 0);
      assert.deepEqual(seen, []);
      assert.ok(q(el, "pf-history-readonly")?.textContent?.startsWith("Read-only."));
    } finally {
      (dom.window as unknown as { fetch: unknown }).fetch = orig;
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
});
