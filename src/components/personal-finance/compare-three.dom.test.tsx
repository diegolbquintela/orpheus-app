// #299 (attachments/personal-finance-spec.md §88, AC PF2C-17..22): Compare is This screen + 2 saved. Through the real
// ScenarioPage against an in-memory fake of /api/personal-finance (the #279 fixture): lock after 2, third blocked,
// order, per-column figures, subtitle, clash dash (later column only), no request / storage, read-only.
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
import { COMPARE_CLASH_DASH, COMPARE_COLOURS, compareColour } from "@/lib/finance/saved-scenarios";

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
const SUB1 = /^This screen and the saved scenario, each projected over /;
const SUB2 = /^This screen and the saved scenarios, each projected over /;
const nameIdx = (el: HTMLElement, name: string) => qa(el, "pf-saved-item").findIndex((tr) => q(tr, "pf-saved-item-name")!.textContent === name);
const cells = (el: HTMLElement, k: string) => qa(q(el, `pf-compare-row-${k}`)!, "pf-compare-cell").map((c) => c.textContent);
const ROWS = ["income", "expenses", "surplus", "start", "end", "growth-earned"];
const legend = (el: HTMLElement) => qa(el, "pf-compare-legend-item").map((li) => [li.getAttribute("data-colour"), li.getAttribute("data-dash")]);
const swatch = (el: HTMLElement) => qa(el, "pf-compare-legend-item").map((li) => (li.querySelector(".pf-swatch") as HTMLElement).style.background);
async function pick(el: HTMLElement, names: string[]) {
  for (const tr of qa(el, "pf-saved-item")) if ((q(tr, "pf-saved-compare") as HTMLInputElement).checked) await click(q(tr, "pf-saved-compare")!);
  for (const n of names) await click(box(el, nameIdx(el, n)));
  if (!q(el, "pf-compare-table")) await click(q(el, "pf-saved-compare-button")!);
}

describe("#299 Compare: This screen + 2 saved (spec §88, PF2C-17..22)", () => {
  it("PF2C-17: one pick locks nothing; two lock the rest (described by the hint); a third is blocked; deselecting either unlocks", async () => {
    server(record());
    const el = await render();
    const hint = q(el, "pf-saved-compare-hint")!;
    assert.equal(q(el, "pf-compare-table"), null, "Q2: nothing pre-ticked, Compare closed");
    assert.deepEqual(checkedIdx(el), []);
    await click(box(el, 2));
    assert.deepEqual(locked(el), []);
    assert.equal(hint.textContent, "");
    await click(box(el, 4));
    assert.deepEqual(checkedIdx(el), [2, 4]);
    assert.deepEqual(locked(el), [0, 1, 3]);
    assert.equal(hint.textContent, HINT);
    for (const i of [0, 1, 3]) assert.equal(box(el, i).getAttribute("aria-describedby"), hint.id);
    for (let k = 0; k < 3; k++) {
      await click(box(el, 1));
      assert.deepEqual(checkedIdx(el), [2, 4], `attempt ${k}`);
    }
    for (const off of [2, 4]) {
      await click(box(el, off));
      assert.deepEqual(locked(el), [], `deselect ${off} unlocks`);
      assert.equal(hint.textContent, "");
      await click(box(el, off));
      assert.deepEqual(locked(el), [0, 1, 3]);
    }
  });

  it("PF2C-18: the 3 columns are This screen, then the Saved sort (both ways); each column's figures equal that scenario compared alone", async () => {
    server(record());
    const el = await render();
    const alone: Record<string, string[]> = {};
    for (const n of ["Delta", "alpha 10"]) {
      await pick(el, [n]);
      alone["This screen"] = ROWS.map((k) => cells(el, k)[0]);
      alone[n] = ROWS.map((k) => cells(el, k)[1]);
    }
    await pick(el, ["alpha 10", "Delta"]);
    assert.deepEqual(heads(el), ["This screen", "Delta", "alpha 10"], "saved order, not tick order");
    const check = (want: string[]) => {
      assert.deepEqual(heads(el), want);
      want.forEach((n, i) => assert.deepEqual(ROWS.map((k) => cells(el, k)[i]), alone[n], n));
    };
    check(["This screen", "Delta", "alpha 10"]);
    await click(q(el, "pf-saved-sort-name")!);
    check(["This screen", "alpha 10", "Delta"]);
    await click(q(el, "pf-saved-sort-name")!);
    check(["This screen", "Delta", "alpha 10"]);
    await click(q(el, "pf-saved-sort-from")!);
    check(["This screen", "alpha 10", "Delta"]);
    await click(q(el, "pf-saved-sort-from")!);
    check(["This screen", "Delta", "alpha 10"]);
  });

  it("PF2C-19: the subtitle is singular with 1 saved and plural with 2; the chart has one line and legend item per column", async () => {
    server(record());
    const el = await render();
    await pick(el, ["Delta"]);
    assert.match(q(el, "pf-compare-chart-head")!.textContent!, /This screen and the saved scenario, each/);
    assert.equal(q(el, "pf-compare-chart")!.getAttribute("data-lines"), "2");
    await pick(el, ["Delta", "alpha 2"]);
    assert.match(q(el, "pf-compare-chart-head")!.textContent!, /This screen and the saved scenarios, each/);
    assert.equal(q(el, "pf-compare-chart")!.getAttribute("data-lines"), "3");
    assert.equal(qa(el, "pf-compare-legend-item").length, 3);
    void SUB1; void SUB2;
  });

  // Fixture slots (1 + fnv1a(id) mod 3): s0 Delta → 2, s1 alpha 2 → 1, s2 Éclair → 1, s3 alpha 10 → 3, s4 Eclair → 1.
  it("PF2C-20: colours stay pinned; on a clash only the LATER column is dashed (6 4), swatch matching; no clash, no dash", async () => {
    server(record());
    const el = await render();
    const G = COMPARE_COLOURS[1];
    const dashed = `repeating-linear-gradient(90deg, ${G} 0 6px, transparent 6px 10px)`;
    await pick(el, ["Delta", "alpha 10"]);
    assert.deepEqual(legend(el), [[COMPARE_COLOURS[0], ""], [COMPARE_COLOURS[2], ""], [COMPARE_COLOURS[3], ""]]);
    assert.deepEqual(swatch(el), [COMPARE_COLOURS[0], COMPARE_COLOURS[2], COMPARE_COLOURS[3]]);
    // A position rule (dash the 3rd column) fails here: Delta + Eclair do not clash.
    await pick(el, ["Delta", "Eclair"]);
    assert.deepEqual(legend(el).map((x) => x[1]), ["", "", ""]);
    await pick(el, ["alpha 2", "Éclair"]);
    assert.deepEqual(heads(el), ["This screen", "alpha 2", "Éclair"]);
    assert.deepEqual(legend(el), [[COMPARE_COLOURS[0], ""], [G, ""], [G, COMPARE_CLASH_DASH]]);
    assert.deepEqual(swatch(el).slice(1), [G, dashed]);
    // Re-sort: the later column (now alpha 2) takes the dash; colours do not move.
    await click(q(el, "pf-saved-sort-name")!);
    await click(q(el, "pf-saved-sort-name")!);
    assert.deepEqual(heads(el), ["This screen", "Éclair", "alpha 2"]);
    assert.deepEqual(legend(el), [[COMPARE_COLOURS[0], ""], [G, ""], [G, COMPARE_CLASH_DASH]]);
    for (const e of SAVED) assert.equal(compareColour(e), e.id === "s0" ? COMPARE_COLOURS[2] : e.id === "s3" ? COMPARE_COLOURS[3] : G);
  });

  it("PF2C-22: picking, locking and dashing send no request, write no storage, leave the calc unchanged; a read-only user can compare 3", async () => {
    const calls = server(record());
    const el = await render();
    const before = { calls: calls.length, storage: storage(), calc: q(el, "pf-scenario-path")!.textContent };
    await pick(el, ["alpha 2", "Éclair"]);
    await click(box(el, 0));
    await click(q(el, "pf-saved-sort-name")!);
    assert.equal(calls.length, before.calls);
    assert.equal(storage(), before.storage);
    assert.equal(q(el, "pf-scenario-path")!.textContent, before.calc);
    await act(async () => root?.unmount());
    container?.remove();
    const ro = async () => new Response(JSON.stringify({ data: record(), access: { owner: false, write: false } }), { status: 200 });
    (dom.window as unknown as { fetch: unknown }).fetch = ro;
    (globalThis as unknown as { fetch: unknown }).fetch = ro;
    const el2 = await render();
    assert.equal(q(el2, "pf-saved-update"), null, "read-only: no write controls");
    await pick(el2, ["Delta", "alpha 10"]);
    assert.deepEqual(heads(el2), ["This screen", "Delta", "alpha 10"]);
    assert.deepEqual(locked(el2), [1, 2, 4]);
  });
});
