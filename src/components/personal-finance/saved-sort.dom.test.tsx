// #278 (attachments/pf-saved-scenarios-sort-spec.md, AC PFSO-06..12): the Saved scenarios table's sortable headers,
// through the real ScenarioPage against an in-memory fake of `/api/personal-finance`: every data column ascending /
// descending / back to the saved order, the stable tiebreak, aria-sort, the button names, keyboard reach, no request,
// no storage write, the calculation and each row's values unchanged.
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
import { NO_SCENARIO, SCENARIO_KEY, type SavedEntry } from "@/lib/finance/scenario-key";

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
const entry = (id: string, name: string, basis: string): SavedEntry => ({
  id, name, basis, savedAt: "2026-10-01T00:00:00Z", inputs: { start: 0, income: 7500, expenses: 3000, growth: 5, rate: null }, values: {}, lines: "{}",
});
// Stored (default) order 0..4; ties: Éclair = Eclair (accents ignored), From 2026-05 twice and 2026-09 twice.
const SAVED = [entry("s0", "Delta", "2026-05"), entry("s1", "alpha 2", "2026-09"), entry("s2", "Éclair", "2026-05"), entry("s3", "alpha 10", "2025-12"), entry("s4", "Eclair", "2026-09")];
const ROW = { s0: "Delta|May 2026", s1: "alpha 2|September 2026", s2: "Éclair|May 2026", s3: "alpha 10|December 2025", s4: "Eclair|September 2026" } as const;
type Id = keyof typeof ROW;

function record(): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: [] });
  writeRates(s, { withdrawal: "4", roic: "" });
  writeOverview(s, { ...NO_OVERVIEW, start: "0", growth: "" });
  writeMonths(s, { "2026-09": { fixed: [line("rent", "2500")], variable: [line("food", "500")], people: [person] } });
  return { ...s.data, [SCENARIO_KEY]: JSON.stringify({ ...NO_SCENARIO, saved: SAVED }) };
}
function server(initial: PfRecord) {
  const calls: string[] = [];
  const spy = async (_url: unknown, init?: { method?: string }) => {
    calls.push(init?.method ?? "GET");
    return new Response(JSON.stringify({ data: initial, access: { owner: true, write: true } }), { status: 200 });
  };
  (dom.window as unknown as { fetch: unknown }).fetch = spy;
  (globalThis as unknown as { fetch: unknown }).fetch = spy;
  return calls;
}
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (el: ParentNode, id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}
async function render() {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<ScenarioPage now={NOW} chartWidth={360} />));
  await act(async () => {});
  await click(q(container, "pf-saved-toggle")!);
  return container;
}
/** Each shown row as "name|From", top to bottom. */
const rows = (el: HTMLElement) => qa(el, "pf-saved-item").map((tr) => [...tr.querySelectorAll("td")].slice(1, 3).map((td) => td.textContent!.trim()).join("|"));
const order = (...ids: Id[]) => ids.map((i) => ROW[i]);
const state = (el: HTMLElement) => ["name", "from"].map((c) => q(el, `pf-saved-th-${c}`)!.getAttribute("aria-sort"));
const storage = () => JSON.stringify([{ ...dom.window.localStorage }, { ...dom.window.sessionStorage }]);

describe("#278 Saved scenarios column sort (PFSO)", () => {
  it("PFSO-06/07/08: Scenario name and From each go ascending → descending → saved order, ties in saved order, aria-sort follows", async () => {
    server(record());
    const el = await render();
    const name = q(el, "pf-saved-sort-name")!;
    const from = q(el, "pf-saved-sort-from")!;
    assert.deepEqual(rows(el), order("s0", "s1", "s2", "s3", "s4"), "default = the stored order");
    assert.deepEqual(state(el), ["none", "none"]);
    await click(name);
    assert.deepEqual(rows(el), order("s1", "s3", "s0", "s2", "s4"));
    assert.deepEqual(state(el), ["ascending", "none"]);
    await click(name);
    assert.deepEqual(rows(el), order("s2", "s4", "s0", "s3", "s1"), "descending; Éclair / Eclair tie keeps the stored order");
    assert.deepEqual(state(el), ["descending", "none"]);
    await click(name);
    assert.deepEqual(rows(el), order("s0", "s1", "s2", "s3", "s4"));
    assert.deepEqual(state(el), ["none", "none"]);
    await click(from);
    assert.deepEqual(rows(el), order("s3", "s0", "s2", "s1", "s4"));
    assert.deepEqual(state(el), ["none", "ascending"]);
    await click(from);
    assert.deepEqual(rows(el), order("s1", "s4", "s0", "s2", "s3"), "descending; same-month ties keep the stored order");
    assert.deepEqual(state(el), ["none", "descending"]);
    await click(name);
    assert.deepEqual(rows(el), order("s1", "s3", "s0", "s2", "s4"), "another column starts ascending");
    assert.deepEqual(state(el), ["ascending", "none"]);
    await click(name);
    await click(name);
    assert.deepEqual(rows(el), order("s0", "s1", "s2", "s3", "s4"));
  });

  it("PFSO-09: the headers are real buttons in the tab order, named with the state and the next step; the mark is aria-hidden, CSS-drawn from data-sort (no text in the header)", async () => {
    server(record());
    const el = await render();
    const name = q(el, "pf-saved-sort-name")! as HTMLButtonElement;
    assert.equal(name.tagName, "BUTTON");
    assert.equal(name.type, "button");
    assert.equal(name.getAttribute("tabindex"), null);
    assert.equal(name.closest("th")!.getAttribute("scope"), "col");
    assert.equal(name.getAttribute("aria-label"), "Scenario name. Sort ascending");
    assert.equal(q(el, "pf-saved-sort-mark-name")!.getAttribute("aria-hidden"), "true");
    assert.equal(q(el, "pf-saved-sort-mark-name")!.textContent, "");
    assert.equal(q(el, "pf-saved-sort-mark-name")!.getAttribute("data-sort"), "none");
    await click(name);
    assert.equal(name.getAttribute("aria-label"), "Scenario name, sorted ascending. Sort descending");
    assert.equal(q(el, "pf-saved-sort-mark-name")!.getAttribute("data-sort"), "ascending");
    await click(name);
    assert.equal(name.getAttribute("aria-label"), "Scenario name, sorted descending. Back to saved order");
    assert.equal(q(el, "pf-saved-sort-mark-name")!.getAttribute("data-sort"), "descending");
    assert.equal(q(el, "pf-saved-sort-from")!.getAttribute("aria-label"), "From. Sort ascending");
    // Select and Actions are not data columns: no sort button, no aria-sort.
    const ths = [...el.querySelectorAll("[data-testid=pf-saved-table] thead th")];
    assert.deepEqual(ths.map((t) => [t.textContent!.trim(), t.getAttribute("aria-sort"), !!t.querySelector("button")]), [
      ["Select", null, false], ["Scenario name", "descending", true], ["From", "none", true], ["Actions", null, false],
    ]);
  });

  it("PFSO-10/11/12: sorting sends nothing, writes no storage, keeps every row's values, actions and the calculation unchanged", async () => {
    const calls = server(record());
    const el = await render();
    const before = { calls: calls.length, storage: storage(), calc: q(el, "pf-scenario-path")!.textContent, rows: [...rows(el)].sort() };
    const actions = () => Object.fromEntries(qa(el, "pf-saved-item").map((tr) => [tr.querySelector("[data-testid=pf-saved-item-name]")!.textContent, q(tr, "pf-saved-open")!.getAttribute("aria-label")]));
    const acts = actions();
    for (const c of ["name", "name", "from", "from", "from", "name"]) {
      await click(q(el, `pf-saved-sort-${c}`)!);
      assert.equal(calls.length, before.calls, "no request");
      assert.equal(storage(), before.storage, "no localStorage / sessionStorage write");
      assert.equal(q(el, "pf-scenario-path")!.textContent, before.calc, "the calculation is unchanged");
      assert.deepEqual([...rows(el)].sort(), before.rows, "the same rows and values, only the order changes");
      assert.deepEqual(actions(), acts, "each row's Open still names its own scenario");
    }
    // The compare checkbox stays with its scenario across a re-sort.
    await click(q(qa(el, "pf-saved-item")[0], "pf-saved-compare")!);
    const checked = () => qa(el, "pf-saved-item").filter((tr) => (q(tr, "pf-saved-compare") as HTMLInputElement).checked).map((tr) => q(tr, "pf-saved-item-name")!.textContent);
    const first = checked();
    await click(q(el, "pf-saved-sort-from")!);
    assert.deepEqual(checked(), first);
  });
});
