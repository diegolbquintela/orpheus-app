// #282 (attachments/personal-finance-spec.md §87, AC PFGR-01..08): the Growth earned line on Totals and Compare and
// the display-only "Count equity coverage as income" box, through the REAL client against an in-memory fake of
// /api/personal-finance (copied from saved-scenarios.dom.test.tsx): off by default, never stored, sent or saved.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScenarioPage } from "./scenario-page";
import { writeRates } from "@/lib/finance/equity";
import { writeExpenses } from "@/lib/finance/expenses";
import { writeMonths } from "@/lib/finance/months";
import { NO_OVERVIEW, writeOverview } from "@/lib/finance/overview";
import { RecordStore, type PfRecord } from "@/lib/finance/record";
import { readScenario } from "@/lib/finance/scenario-key";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

const NOW = new Date("2026-10-16T16:00:00Z");
const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month" as const, equity: "", account: "", currency: "", rate: "", category: "", note: "" });
const person = { id: "p1", name: "Ana", wages: "120,000", bonus: "", tax: "25", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" };
function record(basis = "2026-09"): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: [] });
  writeRates(s, { withdrawal: "4", roic: "" });
  writeOverview(s, { ...NO_OVERVIEW, start: "0", growth: "" });
  writeMonths(s, { [basis]: { fixed: [line("rent", "2500")], variable: [line("food", "500")], people: [person] } });
  return s.data;
}

/** The fake server: GET answers the record and the access; PUT stores `data` (every call logged). */
type Call = { method: string; body?: { data: PfRecord }; before?: PfRecord };
function server(initial: PfRecord, write = true) {
  const st = { record: { ...initial } as PfRecord, calls: [] as Call[] };
  const spy = async (_url: unknown, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      st.calls.push({ method });
      return new Response(JSON.stringify({ data: st.record, access: { owner: write, write } }), { status: 200 });
    }
    const body = JSON.parse(init!.body!) as { data: PfRecord };
    st.calls.push({ method, body, before: { ...st.record } });
    if (!write) return new Response("{}", { status: 403 });
    st.record = { ...body.data };
    return new Response(JSON.stringify({ data: st.record }), { status: 200 });
  };
  (dom.window as unknown as { fetch: unknown }).fetch = spy;
  (globalThis as unknown as { fetch: unknown }).fetch = spy;
  return st;
}
async function render() {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<ScenarioPage now={NOW} chartWidth={360} />));
  await act(async () => {});
  return container;
}
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (el: ParentNode, id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
async function type(field: Element, value: string) {
  const el = field as HTMLInputElement;
  const k = Object.keys(el).find((x) => x.startsWith("__reactProps$"))!;
  const props = (el as unknown as Record<string, { onChange: (e: { target: { value: string } }) => void }>)[k];
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(el, value);
    props.onChange({ target: { value } });
  });
}
async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {});
}
const monthCell = (el: HTMLElement, row: string) => q(q(el, `pf-scenario-row-${row}`)!, "pf-scenario-month")!.textContent;
async function saveAs(el: HTMLElement, name: string) {
  await type(q(el, "pf-saved-name")!, name);
  await click(q(el, "pf-saved-save")!);
}
async function openTable(el: HTMLElement) {
  const btn = q(el, "pf-saved-toggle")!;
  if (btn.getAttribute("aria-expanded") !== "true") await click(btn);
}

import { COUNT_COVERAGE_LABEL, GROWTH_EARNED_NOTE, INCOME_WITH_COVERAGE, SURPLUS_WITH_COVERAGE } from "@/lib/finance/scenario";
import { COVERAGE_RATE_NOTE } from "@/lib/finance/overview";

const box = (el: HTMLElement) => q(el, "pf-coverage-income-toggle") as HTMLInputElement;
/** Every existing figure the box must never touch (PFGR-05): Totals rows, both charts, Compare, the Overview. */
function snapshot(el: HTMLElement) {
  const keep = [...el.querySelectorAll('[data-testid^="pf-scenario-row-"]')].filter((r) => !/-(income|surplus)-coverage$/.test(r.getAttribute("data-testid")!));
  return {
    rows: keep.map((r) => r.outerHTML).join("\n"),
    charts: qa(el, "pf-scenario-chart").map((c) => c.outerHTML).join("") + [...el.querySelectorAll("figure")].map((f) => f.outerHTML).join(""),
    compare: q(el, "pf-compare-section")?.outerHTML ?? "",
    net: (q(el, "pf-scenario-net") as HTMLInputElement).value,
    overview: q(el, "pf-overview")?.outerHTML ?? [...el.querySelectorAll('[data-testid^="pf-coverage-"]')].filter((n) => !n.getAttribute("data-testid")!.startsWith("pf-coverage-income")).map((n) => n.outerHTML).join(""),
  };
}
let sets = 0;
const realSet = dom.window.Storage.prototype.setItem;
dom.window.Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
  sets++;
  return realSet.call(this, k, v);
};
const cell = (el: HTMLElement, row: string, col: string) => q(q(el, `pf-scenario-row-${row}`)!, col)!.textContent;
const nums = (s: string | null) => Number(s!.replace(/,/g, ""));

describe("#282 PFGR Growth earned line + Count equity coverage as income", () => {
  it("PFGR-01: Totals keeps the row name Growth earned with the dim line under it (only that row)", async () => {
    server(record());
    const el = await render();
    const row = q(el, "pf-scenario-row-growth")!;
    assert.equal(row.querySelector('[role="rowheader"]')!.firstChild!.textContent, "Growth earned");
    const note = q(row, "pf-growth-note")!;
    assert.equal(note.textContent, GROWTH_EARNED_NOTE);
    assert.equal(note.className, "pf-history-note block");
    assert.equal(qa(q(el, "pf-scenario-totals")!, "pf-growth-note").length, 1);
  });

  it("PFGR-02: Compare's Growth earned row has the same dim line", async () => {
    server(record());
    const el = await render();
    await saveAs(el, "A");
    await openTable(el);
    await click(qa(el, "pf-saved-compare")[0]);
    await click(q(el, "pf-saved-compare-button")!);
    const row = q(el, "pf-compare-row-growth-earned")!;
    assert.match(row.querySelector('[role="rowheader"]')!.firstChild!.textContent!, /^Growth earned over /);
    assert.equal(q(row, "pf-growth-note")!.textContent, GROWTH_EARNED_NOTE);
    assert.equal(qa(q(el, "pf-compare-table")!, "pf-growth-note").length, 1);
  });

  it("PFGR-03: the box is labelled, sits above the Totals table, is off by default, and its label is the 44 px target", async () => {
    server(record());
    const el = await render();
    await type(q(el, "pf-scenario-net")!, "100,000");
    const wrap = q(el, "pf-coverage-income")!;
    const label = wrap.querySelector("label")!;
    assert.equal(label.textContent, COUNT_COVERAGE_LABEL);
    assert.ok(label.contains(box(el)));
    assert.ok(label.classList.contains("pf-saved-compare-label"), "min-height 2.75rem (styles.css)");
    assert.equal(box(el).checked, false);
    assert.equal(box(el).disabled, false);
    assert.ok(wrap.compareDocumentPosition(q(el, "pf-scenario-totals")!) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, "above the table");
    assert.equal(q(el, "pf-scenario-row-income-coverage"), null);
    assert.equal(q(el, "pf-scenario-row-surplus-coverage"), null);
    assert.ok(!el.textContent!.includes(INCOME_WITH_COVERAGE) && !el.textContent!.includes(SURPLUS_WITH_COVERAGE));
  });

  it("PFGR-04: on, the two rows follow the table: net income / surplus + monthly coverage; Over {horizon} is —", async () => {
    server(record());
    const el = await render();
    await type(q(el, "pf-scenario-net")!, "120,000");
    await click(box(el));
    const ids = [...q(el, "pf-scenario-totals")!.querySelectorAll('[data-testid^="pf-scenario-row-"]')].map((r) => r.getAttribute("data-testid"));
    assert.deepEqual(ids.slice(-2), ["pf-scenario-row-income-coverage", "pf-scenario-row-surplus-coverage"]);
    const inc = q(el, "pf-scenario-row-income-coverage")!;
    const sur = q(el, "pf-scenario-row-surplus-coverage")!;
    assert.equal(inc.querySelector('[role="rowheader"]')!.textContent, INCOME_WITH_COVERAGE);
    assert.equal(sur.querySelector('[role="rowheader"]')!.textContent, SURPLUS_WITH_COVERAGE);
    const cov = nums(monthCell(el, "coverage")); // 120,000 × 4% / 12 = 400.00
    assert.equal(cov, 400);
    assert.equal(nums(monthCell(el, "income-coverage")), nums(monthCell(el, "income")) + 400);
    assert.equal(nums(monthCell(el, "surplus-coverage")), Math.round((nums(monthCell(el, "surplus")) + 400) * 100) / 100);
    // Today: the saved figures + the saved coverage (its own Today cell).
    const today = (row: string) => nums(cell(el, row, "pf-scenario-today"));
    assert.equal(today("income-coverage"), Math.round((today("income") + nums(cell(el, "coverage", "pf-scenario-today"))) * 100) / 100);
    assert.equal(q(inc, "pf-scenario-total")!.textContent, "—");
    assert.equal(q(sur, "pf-scenario-total")!.textContent, "—");
    await click(box(el));
    assert.equal(q(el, "pf-scenario-row-income-coverage"), null, "off again");
  });

  it("PFGR-05: every existing row, chart, Compare and net assets are byte-identical with the box on or off", async () => {
    server(record());
    const el = await render();
    await type(q(el, "pf-scenario-net")!, "120,000");
    await saveAs(el, "A");
    await openTable(el);
    await click(qa(el, "pf-saved-compare")[0]);
    await click(q(el, "pf-saved-compare-button")!);
    const off = snapshot(el);
    assert.ok(off.compare.length > 0 && off.rows.length > 0);
    await click(box(el));
    assert.ok(q(el, "pf-scenario-row-income-coverage"));
    assert.deepEqual(snapshot(el), off);
    await click(box(el));
    assert.deepEqual(snapshot(el), off);
  });

  it("PFGR-06: no rate or no start → disabled; no rate shows Set rate under Expenses", async () => {
    server(record());
    let el = await render();
    await type(q(el, "pf-scenario-net")!, "0");
    assert.equal(box(el).disabled, true, "start 0");
    assert.equal(q(el, "pf-coverage-income-note"), null, "no start: no rate note");
    await act(async () => root?.unmount());
    container?.remove();
    const s = new RecordStore(record());
    writeRates(s, { withdrawal: "", roic: "" });
    server(s.data);
    el = await render();
    await type(q(el, "pf-scenario-net")!, "100,000");
    assert.equal(box(el).disabled, true);
    assert.equal(q(el, "pf-coverage-income-note")!.textContent, COVERAGE_RATE_NOTE);
    assert.equal(box(el).getAttribute("aria-describedby"), q(el, "pf-coverage-income-note")!.id);
    await click(box(el));
    assert.equal(q(el, "pf-scenario-row-income-coverage"), null);
  });

  it("PFGR-07: toggling sends and stores nothing; it is not in a saved scenario; reopen and reload show it off", async () => {
    const st = server(record());
    let el = await render();
    await type(q(el, "pf-scenario-net")!, "120,000");
    const calls = st.calls.length;
    sets = 0;
    await click(box(el));
    await click(box(el));
    await click(box(el));
    assert.equal(st.calls.length, calls, "no request");
    assert.equal(sets, 0, "no storage write");
    await saveAs(el, "On");
    await click(box(el));
    await saveAs(el, "Off");
    const [on, offS] = readScenario(st.record)!.saved!;
    const strip = (x: object) => JSON.stringify({ ...x, id: 0, name: 0, savedAt: 0 });
    assert.equal(strip(on), strip(offS), "the box is not part of a saved scenario");
    assert.ok(!JSON.stringify(st.record).includes("overage as income"));
    await click(box(el));
    await openTable(el);
    await click(qa(el, "pf-saved-open")[0]);
    assert.equal(box(el).checked, false, "reopen → off");
    assert.equal(q(el, "pf-scenario-row-income-coverage"), null);
    assert.equal(sets, 0, "no storage write");
    await act(async () => root?.unmount());
    container?.remove();
    el = await render();
    await type(q(el, "pf-scenario-net")!, "120,000");
    assert.equal(box(el).checked, false, "reload → off");
  });

  it("PFGR-08: a Read user sees the box and can toggle it, with no write", async () => {
    const st = server(record(), false);
    const el = await render();
    await type(q(el, "pf-scenario-net")!, "120,000");
    sets = 0;
    await click(box(el));
    assert.equal(box(el).checked, true);
    assert.ok(q(el, "pf-scenario-row-income-coverage"));
    assert.deepEqual([...new Set(st.calls.map((c) => c.method))], ["GET"], "no writes");
    assert.equal(sets, 0);
  });
});
