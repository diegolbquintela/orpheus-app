// #233 (spec 66, AC PFSR): rename / update in place; helpers copied from the #223 test. Was: #223 on the scenario screen, through the REAL client
// (`loadForScenario` / `changeSaved`) against an in-memory fake of `/api/personal-finance`: save, reopen, compare, delete,
// Read users, and the sandbox proof (every PUT differs from the fetched record in the scenario value only).
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScenarioPage } from "./scenario-page";
import { writeRates } from "@/lib/finance/equity";
import { writeExpenses } from "@/lib/finance/expenses";
import { MONTHS_KEY, writeMonths } from "@/lib/finance/months";
import { NO_OVERVIEW, writeOverview } from "@/lib/finance/overview";
import { RecordStore, type PfRecord } from "@/lib/finance/record";
import { readScenario, SCENARIO_KEY } from "@/lib/finance/scenario-key";
import { NAME_TAKEN, SCENARIO_GONE } from "@/lib/finance/saved-scenarios";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

const NOW = new Date("2026-10-16T16:00:00Z");
const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month" as const, equity: "", account: "", currency: "", rate: "", category: "" });
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
const names = (el: HTMLElement) => qa(el, "pf-saved-item-name").map((n) => n.textContent);
const confirmAs = (answer: boolean) => {
  const asked: string[] = [];
  dom.window.confirm = (m?: string) => {
    asked.push(String(m));
    return answer;
  };
  return asked;
};
/** Every PUT: only the scenario value differs from the record fetched just before it (PFSS-40). */
function onlyScenarioChanged(st: ReturnType<typeof server>) {
  const puts = st.calls.filter((c) => c.method === "PUT");
  for (const p of puts) {
    const keys = new Set([...Object.keys(p.before!), ...Object.keys(p.body!.data)]);
    for (const k of keys) if (k !== SCENARIO_KEY) assert.equal(p.body!.data[k], p.before![k], `PUT changed ${k}`);
  }
  return puts.length;
}
async function saveAs(el: HTMLElement, name: string) {
  await type(q(el, "pf-saved-name")!, name);
  await click(q(el, "pf-saved-save")!);
}


const methods = (st: ReturnType<typeof server>) => st.calls.map((c) => c.method);
const others = (st: ReturnType<typeof server>, id: string) => readScenario(st.record)!.saved!.filter((e) => e.id !== id);

describe("#233 rename / update a saved scenario", () => {
  it("PFSR-01/02/03/04/07/11: rename inline; refused and cancelled send nothing; OK is GET + one PUT of that name only", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    await click(qa(el, "pf-saved-open")[0]);
    const before = readScenario(st.record)!.saved!;
    const n = st.calls.length;
    await click(qa(el, "pf-saved-rename")[0]);
    assert.equal((q(el, "pf-saved-rename-name") as HTMLInputElement).value, "A");
    await type(q(el, "pf-saved-rename-name")!, "x");
    await click(q(el, "pf-saved-rename-cancel")!);
    assert.equal(q(el, "pf-saved-rename-name"), null);
    await click(qa(el, "pf-saved-rename")[0]);
    await type(q(el, "pf-saved-rename-name")!, "b");
    await click(q(el, "pf-saved-rename-save")!);
    assert.equal(q(el, "pf-saved-rename-error")!.textContent, NAME_TAKEN);
    await type(q(el, "pf-saved-rename-name")!, "  ");
    await click(q(el, "pf-saved-rename-save")!);
    assert.equal(st.calls.length, n, "nothing sent yet");
    await type(q(el, "pf-saved-rename-name")!, " Alpha ");
    await click(q(el, "pf-saved-rename-save")!);
    assert.deepEqual(methods(st).slice(n), ["GET", "PUT"]);
    const after = readScenario(st.record)!.saved!;
    assert.deepEqual(after[0], { ...before[0], name: "Alpha" });
    assert.deepEqual(after[1], before[1]);
    assert.deepEqual(names(el), ["Alpha", "B"]);
    assert.match(q(el, "pf-saved-section")!.textContent!, /Showing "Alpha"/);
    assert.equal(onlyScenarioChanged(st), 3);
  });

  it("PFSR-05/06/07: Update asks; Cancel sends nothing; OK replaces values (id/name kept), others untouched", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    const before = readScenario(st.record)!.saved!;
    await type(qa(el, "pf-monthly")[0], "3,500");
    const n = st.calls.length;
    let asked = confirmAs(false);
    await click(qa(el, "pf-saved-update")[1]);
    assert.deepEqual(asked, ['Update the scenario "B" with what the screen shows now? Its old values are replaced.']);
    assert.equal(st.calls.length, n);
    asked = confirmAs(true);
    await click(qa(el, "pf-saved-update")[1]);
    assert.deepEqual(methods(st).slice(n), ["GET", "PUT"]);
    const b = readScenario(st.record)!.saved![1];
    assert.equal(b.id, before[1].id);
    assert.equal(b.name, "B");
    assert.equal(b.inputs.expenses, 4000);
    assert.equal(before[1].inputs.expenses, 3000);
    assert.deepEqual(others(st, b.id), [before[0]]);
    assert.equal(onlyScenarioChanged(st), 3);
    assert.equal(st.record[MONTHS_KEY], record()[MONTHS_KEY]);
  });

  it("PFSR-08: a scenario deleted elsewhere is not recreated; nothing is PUT", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    st.record = { ...st.record, [SCENARIO_KEY]: JSON.stringify({ ...readScenario(st.record)!, saved: [] }) };
    confirmAs(true);
    const puts = st.calls.filter((c) => c.method === "PUT").length;
    await click(q(el, "pf-saved-update")!);
    assert.equal(q(el, "pf-saved-status")!.textContent, SCENARIO_GONE);
    assert.equal(st.calls.filter((c) => c.method === "PUT").length, puts);
  });

  it("PFSR-09: every non-write interaction on the screen sends zero writes", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    const n = st.calls.length;
    await type(qa(el, "pf-monthly")[0], "3,900");
    await type(q(el, "pf-scenario-net")!, "1,000");
    for (const h of [...el.querySelectorAll('[data-testid^="pf-horizon-"]')]) await click(h);
    for (const b of qa(el, "pf-saved-compare")) await click(b);
    await click(qa(el, "pf-saved-open")[1]);
    await click(q(el, "pf-saved-latest")!);
    await click(qa(el, "pf-saved-rename")[0]);
    await type(q(el, "pf-saved-rename-name")!, "b");
    await click(q(el, "pf-saved-rename-save")!);
    await click(q(el, "pf-saved-rename-cancel")!);
    confirmAs(false);
    await click(qa(el, "pf-saved-update")[0]);
    await click(qa(el, "pf-saved-delete")[0]);
    assert.equal(st.calls.slice(n).filter((c) => c.method !== "GET").length, 0, "zero writes");
    assert.equal(st.calls.length, n, "nothing sent at all");
  });

  it("PFSR-01: Read users get no Rename and no Update", async () => {
    const rec = record();
    const st = server(rec, false);
    st.record = { ...rec, [SCENARIO_KEY]: JSON.stringify({ income: {}, expenses: {}, rate: null, growth: null, start: null, saved: [{
      id: "a", name: "Plan", savedAt: "2026-10-01T00:00:00Z", basis: "2026-10",
      inputs: { start: 0, income: 7500, expenses: 2000, growth: 0, rate: 4 }, values: {}, lines: "{}",
    }] }) };
    const el = await render();
    assert.equal(q(el, "pf-saved-rename"), null);
    assert.equal(q(el, "pf-saved-update"), null);
    assert.deepEqual(methods(st), ["GET"]);
  });
});
