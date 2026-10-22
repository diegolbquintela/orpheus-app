// #215 (personal-finance-spec 55; AC PFSC-17..PFSC-23): the Scenario page in jsdom with the real component.
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
import {
  NOT_SAVED,
  READ_ONLY_NOTE,
  SAVED,
  SCENARIO_KEY,
  type Scenario,
  UNSAVED,
  WHAT_IF_NOTE,
} from "@/lib/finance/scenario";
import type { SaveResult, ScenarioLoad } from "@/lib/finance/scenario-client";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

const NOW = () => new Date("2026-10-16T16:00:00Z");
const line = (id: string, amount: string, category = "") => ({
  id,
  name: id,
  amount,
  per: "month" as const,
  equity: "",
  account: "",
  currency: "",
  rate: "",
  category,
});
const person = {
  id: "p1",
  name: "Ana",
  wages: "120,000",
  bonus: "",
  tax: "25",
  share: "100",
  countWages: true,
  countBonus: false,
  foreign: false,
  currency: "",
  rate: "",
};
function record(extra: PfRecord = {}): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: ["Home"] });
  writeRates(s, { withdrawal: "4", roic: "" });
  writeOverview(s, { ...NO_OVERVIEW, start: "0" });
  writeMonths(s, {
    "2026-10": {
      fixed: [line("rent", "2500", "Home")],
      variable: [line("food", "500")],
      people: [person],
    },
  });
  return { ...s.data, ...extra };
}
const RW = { owner: true, write: true };
const READ = { owner: false, write: false };

async function render(
  load: () => Promise<ScenarioLoad>,
  save: (s: Scenario) => Promise<SaveResult> = async () => ({ ok: true, record: null }),
) {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(<ScenarioPage load={load} save={save} now={NOW} chartWidth={360} />),
  );
  await act(async () => {});
  return container;
}
const q = (el: ParentNode, id: string) =>
  el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const qa = (el: ParentNode, id: string) =>
  [...el.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const cell = (el: HTMLElement, row: string, col: string) =>
  q(q(el, `pf-scenario-row-${row}`)!, col)!.textContent;
// jsdom has no `oninput` support detection React trusts, so the typed value is handed to the field's own onChange
// (the React props on the element), exactly what a keystroke delivers.
async function type(field: Element, value: string) {
  const el = field as HTMLInputElement;
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"))!;
  const props = (
    el as unknown as Record<string, { onChange: (e: { target: { value: string } }) => void }>
  )[key];
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(
      el,
      value,
    );
    props.onChange({ target: { value } });
  });
}
async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("#215 Scenario page", () => {
  it("PFSC-17: one load; what-if note; levers per income line and category; table with Net income; chart 12 months by default", async () => {
    let calls = 0;
    const el = await render(async () => (calls++, { ok: true, record: record(), access: RW }));
    assert.equal(calls, 1);
    assert.equal(q(el, "pf-scenario-whatif")?.textContent, WHAT_IF_NOTE);
    assert.equal(qa(el, "pf-lever-income-field").length, 1);
    assert.equal(qa(el, "pf-lever-expenses-field").length, 2); // Home, No category
    assert.equal(
      q(el, "pf-scenario-row-income")?.querySelector("[role=rowheader]")?.textContent,
      "Net income",
    );
    assert.equal(cell(el, "income", "pf-scenario-today"), "7,500.00");
    assert.equal(cell(el, "surplus", "pf-scenario-month"), "4,500.00");
    assert.equal(q(el, "pf-scenario-chart")?.dataset.months, "12");
    assert.equal(q(el, "pf-horizon-12")?.getAttribute("aria-pressed"), "true");
    assert.equal(q(el, "pf-scenario-total-head")?.textContent, "Over 12 months");
  });
  it("PFSC-18: a lever recalculates at once, with no request; horizons switch to 3, 5 and 10 years", async () => {
    let saves = 0;
    const el = await render(
      async () => ({ ok: true, record: record(), access: RW }),
      async () => (saves++, { ok: true, record: null }),
    );
    await type(qa(el, "pf-lever-income-field")[0], "10");
    assert.equal(cell(el, "income", "pf-scenario-month"), "8,250.00");
    assert.equal(cell(el, "surplus", "pf-scenario-month"), "5,250.00");
    assert.equal(cell(el, "surplus", "pf-scenario-total"), "63,000.00");
    await type(qa(el, "pf-lever-expenses-field")[0], "-100"); // Home
    assert.equal(cell(el, "expenses", "pf-scenario-month"), "500.00");
    for (const [h, months, head] of [
      ["36", "36", "Over 3 years"],
      ["60", "60", "Over 5 years"],
      ["120", "120", "Over 10 years"],
    ] as const) {
      await click(q(el, `pf-horizon-${h}`)!);
      assert.equal(q(el, "pf-scenario-chart")?.dataset.months, months);
      assert.equal(q(el, "pf-scenario-total-head")?.textContent, head);
    }
    assert.equal(
      cell(el, "surplus", "pf-scenario-total"),
      (7750 * 120).toLocaleString("en-US", { minimumFractionDigits: 2 }),
    );
    assert.equal(saves, 0, "nothing is saved without Save scenario");
    assert.equal(q(el, "pf-scenario-status")?.textContent, UNSAVED);
  });
  it("PFSC-19: an invalid lever is shown in red, moves nothing and blocks Save", async () => {
    const el = await render(async () => ({ ok: true, record: record(), access: RW }));
    await type(q(el, "pf-lever-rate")!, "150");
    assert.equal(qa(el, "pf-error").length, 1);
    assert.equal(q(el, "pf-lever-rate")?.getAttribute("aria-invalid"), "true");
    assert.equal((q(el, "pf-scenario-save") as HTMLButtonElement).disabled, true);
  });
  it("PFSC-20: Save scenario sends the levers once, only on the click; then Saved; a failure says Not saved", async () => {
    const sent: Scenario[] = [];
    let ok = true;
    const el = await render(
      async () => ({ ok: true, record: record(), access: RW }),
      async (s) => (sent.push(s), ok ? { ok: true, record: null } : { ok: false, status: 500 }),
    );
    assert.equal(
      (q(el, "pf-scenario-save") as HTMLButtonElement).disabled,
      true,
      "nothing to save yet",
    );
    await type(qa(el, "pf-lever-income-field")[0], "10");
    assert.equal(sent.length, 0);
    await click(q(el, "pf-scenario-save")!);
    assert.deepEqual(sent, [
      { income: { "p1-wages": 10 }, expenses: {}, rate: null, growth: null, start: null },
    ]);
    assert.equal(q(el, "pf-scenario-status")?.textContent, SAVED);
    ok = false;
    await type(qa(el, "pf-lever-income-field")[0], "20");
    await click(q(el, "pf-scenario-save")!);
    assert.equal(q(el, "pf-scenario-status")?.textContent, NOT_SAVED);
  });
  it("PFSC-21: Read users see the screen and the levers but no Save; nothing is ever sent", async () => {
    let saves = 0;
    const el = await render(
      async () => ({ ok: true, record: record(), access: READ }),
      async () => (saves++, { ok: true, record: null }),
    );
    assert.equal(q(el, "pf-scenario-save"), null);
    assert.equal(q(el, "pf-scenario-readonly")?.textContent, READ_ONLY_NOTE);
    await type(qa(el, "pf-lever-income-field")[0], "10");
    assert.equal(cell(el, "income", "pf-scenario-month"), "8,250.00");
    assert.equal(q(el, "pf-scenario-status")?.textContent, "");
    assert.equal(saves, 0);
  });
  it("PFSC-22: a saved scenario is loaded into the levers; Reset clears the levers without saving", async () => {
    const saved = JSON.stringify({
      income: { "p1-wages": 10 },
      expenses: {},
      rate: null,
      growth: null,
      start: null,
    });
    let saves = 0;
    const el = await render(
      async () => ({ ok: true, record: record({ [SCENARIO_KEY]: saved }), access: RW }),
      async () => (saves++, { ok: true, record: null }),
    );
    assert.equal((qa(el, "pf-lever-income-field")[0] as HTMLInputElement).value, "10");
    assert.equal(cell(el, "income", "pf-scenario-month"), "8,250.00");
    assert.equal(q(el, "pf-scenario-status")?.textContent, "");
    await click(q(el, "pf-scenario-reset")!);
    assert.equal(cell(el, "income", "pf-scenario-month"), "7,500.00");
    assert.equal(q(el, "pf-scenario-status")?.textContent, UNSAVED);
    assert.equal(saves, 0);
  });
  it("PFSC-23: load error → alert; signed out → sign-in; no month with lines → a note", async () => {
    let el = await render(async () => ({ ok: false, status: 500 }));
    assert.ok(q(el, "pf-scenario-error"));
    await act(async () => root?.unmount());
    let out = 0;
    container = dom.window.document.createElement("div");
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <ScenarioPage
          load={async () => ({ ok: false, status: 401 })}
          now={NOW}
          onSignedOut={() => out++}
        />,
      ),
    );
    await act(async () => {});
    assert.equal(out, 1);
    await act(async () => root?.unmount());
    el = await render(async () => ({ ok: true, record: null, access: RW }));
    assert.ok(q(el, "pf-scenario-empty"));
  });
});
