// #279 (attachments/personal-finance-spec.md §84, AC PF2C-02..08): Compare is limited to 2 columns and This screen counts as
// one, so exactly 1 saved scenario can be picked. Through the real ScenarioPage against an in-memory fake of
// /api/personal-finance: the lock (aria-disabled + aria-describedby → the reserved hint), deselect unlocks, the 2-column
// output equals the pre-#279 columns, This screen first, sort, no request, no storage write, calc unchanged.
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
import { COMPARE_COLOURS, compareColour } from "@/lib/finance/saved-scenarios";

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
  id, name, basis, savedAt: "2026-10-01T00:00:00Z", inputs: { start: 0, income: 7000 + 100 * Number(id.slice(1)), expenses: 3000, growth: 5, rate: null }, values: {}, lines: "{}",
});
// Stored (default) order 0..4; ties: Éclair = Eclair (accents ignored), From 2026-05 twice and 2026-09 twice.
const SAVED = [entry("s0", "Delta", "2026-05"), entry("s1", "alpha 2", "2026-09"), entry("s2", "Éclair", "2026-05"), entry("s3", "alpha 10", "2025-12"), entry("s4", "Eclair", "2026-09")];

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
const storage = () => JSON.stringify([{ ...dom.window.localStorage }, { ...dom.window.sessionStorage }]);
const box = (el: HTMLElement, i: number) => q(qa(el, "pf-saved-item")[i], "pf-saved-compare") as HTMLInputElement;
const checkedIdx = (el: HTMLElement) => qa(el, "pf-saved-item").flatMap((tr, i) => ((q(tr, "pf-saved-compare") as HTMLInputElement).checked ? [i] : []));
const locked = (el: HTMLElement) => qa(el, "pf-saved-item").flatMap((tr, i) => (q(tr, "pf-saved-compare")!.getAttribute("aria-disabled") === "true" ? [i] : []));
const heads = (el: HTMLElement) => qa(el, "pf-compare-head").map((h) => h.textContent);
// #299 (spec §88, PF2C-16..22): the limit is now This screen + 2 saved, so the lock comes after the SECOND pick. These
// #279 tests are kept and re-stated for 2 picks; the 1-pick 2-column output (PF2C-06) is unchanged.
const HINT = "Compare limit reached: This screen and 2 saved scenarios.";
// Captured on main 92ae1f7 (pre-#279) with alpha 2 + Éclair compared: the This screen and alpha 2 columns.
const BEFORE: Record<string, [string, string]> = {
  income: ["7,500.00", "7,100.00"], expenses: ["3,000.00", "3,000.00"], surplus: ["4,500.00", "4,100.00"],
  start: ["9,000.00", "0.00"], end: ["63,000.00", "50,317.57"], "growth-earned": ["0.00", "1,117.57"],
};

describe("#279 Compare limited to This screen + 1 saved (PF2C)", () => {
  it("PF2C-02: with This screen alone nothing is locked and the hint line is reserved but empty; one pick locks every other box, described by the hint", async () => {
    server(record());
    const el = await render();
    const hint = q(el, "pf-saved-compare-hint")!;
    assert.ok(hint.id, "the hint has an id");
    assert.equal(hint.textContent, "");
    assert.equal(hint.getAttribute("aria-live"), "polite");
    assert.deepEqual(locked(el), []);
    assert.equal(qa(el, "pf-saved-compare").filter((b) => b.hasAttribute("aria-describedby")).length, 0);
    await click(box(el, 3));
    assert.deepEqual(checkedIdx(el), [3]);
    assert.deepEqual(locked(el), [], "#299: one pick locks nothing");
    assert.equal(hint.textContent, "");
    await click(box(el, 0));
    assert.deepEqual(checkedIdx(el), [0, 3]);
    assert.deepEqual(locked(el), [1, 2, 4]);
    assert.equal(hint.textContent, HINT);
    assert.equal(hint.getAttribute("data-shown"), "true");
    for (const i of [1, 2, 4]) assert.equal(box(el, i).getAttribute("aria-describedby"), hint.id);
    for (const i of [0, 3]) {
      assert.equal(box(el, i).getAttribute("aria-describedby"), null, "a picked box is not locked");
      assert.equal(box(el, i).getAttribute("aria-disabled"), null);
    }
  });

  it("PF2C-03: a further pick is blocked with two saved picked (#299), on repeated attempts; Compare is unchanged", async () => {
    server(record());
    const el = await render();
    await click(box(el, 1));
    await click(box(el, 3));
    await click(q(el, "pf-saved-compare-button")!);
    assert.deepEqual(heads(el), ["This screen", "alpha 2", "alpha 10"]);
    for (const i of [0, 2, 4, 0]) {
      await click(box(el, i));
      assert.deepEqual(checkedIdx(el), [1, 3], `box ${i} stays unchecked`);
      assert.equal(box(el, i).checked, false);
      assert.deepEqual(heads(el), ["This screen", "alpha 2", "alpha 10"]);
    }
    // Keyboard: Space on a locked, focused box toggles nothing either.
    box(el, 0).focus();
    assert.equal(dom.window.document.activeElement, box(el, 0), "a locked box stays focusable");
    await act(async () => {
      box(el, 0).dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
      box(el, 0).click();
    });
    assert.deepEqual(checkedIdx(el), [1, 3]);
  });

  it("PF2C-04: deselecting the pick unlocks every box and empties the hint; a different one can then be picked", async () => {
    server(record());
    const el = await render();
    await click(box(el, 0));
    await click(box(el, 1));
    assert.deepEqual(locked(el), [2, 3, 4]);
    await click(box(el, 0));
    assert.deepEqual(checkedIdx(el), [1]);
    assert.deepEqual(locked(el), []);
    assert.equal(q(el, "pf-saved-compare-hint")!.textContent, "");
    assert.equal(q(el, "pf-saved-compare-hint")!.getAttribute("data-shown"), "false");
    await click(box(el, 4));
    assert.deepEqual(checkedIdx(el), [1, 4]);
    assert.deepEqual(locked(el), [0, 2, 3]);
  });

  it("PF2C-05: locked boxes are aria-disabled, not disabled, and stay in the tab order", async () => {
    server(record());
    const el = await render();
    await click(box(el, 2));
    await click(box(el, 0));
    for (const i of [1, 3, 4]) {
      assert.equal(box(el, i).getAttribute("aria-disabled"), "true");
      assert.equal(box(el, i).disabled, false);
      assert.equal(box(el, i).getAttribute("tabindex"), null);
      assert.equal(box(el, i).closest("label")!.classList.contains("pf-saved-compare-label"), true);
    }
  });

  it("PF2C-06/07: the 2-column Compare equals the pre-#279 columns; This screen is first under every sort", async () => {
    server(record());
    const el = await render();
    await click(box(el, 1));
    await click(q(el, "pf-saved-compare-button")!);
    assert.deepEqual(heads(el), ["This screen", "alpha 2"]);
    for (const [k, v] of Object.entries(BEFORE)) assert.deepEqual(qa(q(el, `pf-compare-row-${k}`)!, "pf-compare-cell").map((c) => c.textContent), v, k);
    assert.equal(q(el, "pf-compare-chart")!.getAttribute("data-lines"), "2");
    for (const col of ["name", "name", "from", "from", "from"]) {
      await click(q(el, `pf-saved-sort-${col}`)!);
      assert.deepEqual(heads(el), ["This screen", "alpha 2"]);
    }
    // Sorted first, then picked: the pick is by id, not by row position.
    await click(q(el, "pf-saved-sort-name")!);
    const row = qa(el, "pf-saved-item").findIndex((tr) => q(tr, "pf-saved-item-name")!.textContent === "Delta");
    await click(box(el, qa(el, "pf-saved-item").findIndex((tr) => (q(tr, "pf-saved-compare") as HTMLInputElement).checked)));
    await click(box(el, row));
    await click(q(el, "pf-saved-compare-button")!);
    assert.deepEqual(heads(el), ["This screen", "Delta"]);
  });

  it("PF2C-08: picking, blocking and unlocking send no request, write no storage, and leave the calculation unchanged", async () => {
    const calls = server(record());
    const el = await render();
    const before = { calls: calls.length, storage: storage(), calc: q(el, "pf-scenario-path")!.textContent };
    for (const i of [0, 1, 2, 0, 3, 3]) {
      await click(box(el, i));
      assert.equal(calls.length, before.calls);
      assert.equal(storage(), before.storage);
      assert.equal(q(el, "pf-scenario-path")!.textContent, before.calc);
    }
  });

  // CB2 (spec §84 addendum 2026-11-02, AC PF2C-13/14): colours are pinned to the scenario, never the column position.
  // Fixture slots (1 + fnv1a(id) mod 3): s0 → 2 (alert), s1 → 1 (green), s3 → 3 (dim). A position-based palette would give
  // every second column slot 1 (green), so s0 and s3 kill it.
  const legend = (el: HTMLElement) => qa(el, "pf-compare-legend-item").map((li) => li.getAttribute("data-colour"));
  const swatch = (el: HTMLElement) => qa(el, "pf-compare-legend-item").map((li) => (li.querySelector(".pf-swatch") as HTMLElement).style.background);
  const pickById = async (el: HTMLElement, name: string) => {
    for (const tr of qa(el, "pf-saved-item")) if ((q(tr, "pf-saved-compare") as HTMLInputElement).checked) await click(q(tr, "pf-saved-compare")!);
    await click(box(el, qa(el, "pf-saved-item").findIndex((tr) => q(tr, "pf-saved-item-name")!.textContent === name)));
    if (!q(el, "pf-compare-table")) await click(q(el, "pf-saved-compare-button")!);
  };
  it("PF2C-13 (CB2): a scenario keeps its colour through every sort, column remove/add and re-pick; This screen is always slot 0", async () => {
    server(record());
    const el = await render();
    const want: Record<string, string> = { Delta: COMPARE_COLOURS[2], "alpha 2": COMPARE_COLOURS[1], "alpha 10": COMPARE_COLOURS[3] };
    for (const name of ["Delta", "alpha 10", "alpha 2", "Delta", "alpha 10"]) {
      await pickById(el, name);
      assert.deepEqual(heads(el), ["This screen", name]);
      assert.deepEqual(legend(el), [COMPARE_COLOURS[0], want[name]], name);
      assert.deepEqual(swatch(el), [COMPARE_COLOURS[0], want[name]], `${name} swatch`);
      for (const col of ["name", "name", "from", "from", "from"]) {
        await click(q(el, `pf-saved-sort-${col}`)!);
        assert.deepEqual(legend(el), [COMPARE_COLOURS[0], want[name]], `${name} after sorting by ${col}`);
      }
    }
    // Same as the helper on the Saved entry itself (Saved vs Compare use one function on the same id).
    for (const e of SAVED) if (want[e.name]) assert.equal(compareColour(e), want[e.name]);
  });

  it("PF2C-14 (CB2): colouring sends no request and writes no storage", async () => {
    const calls = server(record());
    const el = await render();
    const before = { calls: calls.length, storage: storage() };
    for (const name of ["Delta", "alpha 10", "Delta"]) await pickById(el, name);
    await click(q(el, "pf-saved-sort-name")!);
    assert.equal(calls.length, before.calls);
    assert.equal(storage(), before.storage);
  });
});
