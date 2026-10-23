// #223 (personal-finance-spec 60, AC PFSS): named saved scenarios on the scenario screen, through the REAL client
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
import { RecordStore, STALE_MESSAGE, type PfRecord } from "@/lib/finance/record";
import { readScenario, SCENARIO_KEY } from "@/lib/finance/scenario-key";
import { NAME_TAKEN } from "@/lib/finance/saved-scenarios";

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

describe("#223 saved scenarios", () => {
  it("PFSS-01/02/40: the unsaved screen sends nothing; Save scenario does one GET + one PUT changing only the scenario value", async () => {
    const st = server(record());
    const el = await render();
    assert.equal(q(el, "pf-saved-none")!.textContent, "No saved scenarios yet.");
    await type(qa(el, "pf-monthly")[0], "3,500");
    await type(q(el, "pf-scenario-net")!, "10,000");
    assert.deepEqual(st.calls.map((c) => c.method), ["GET"], "edits send nothing");
    await saveAs(el, "  Rent up  ");
    assert.deepEqual(st.calls.map((c) => c.method), ["GET", "GET", "PUT"]);
    assert.equal(onlyScenarioChanged(st), 1);
    const saved = readScenario(st.record)!.saved!;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, "Rent up");
    assert.equal(saved[0].basis, "2026-10");
    assert.equal(saved[0].inputs.expenses, 4000);
    assert.equal(saved[0].inputs.start, 10000);
    assert.deepEqual(names(el), ["Rent up"]);
    // The main record's months are exactly as before (sandbox).
    assert.equal(st.record[MONTHS_KEY], record()[MONTHS_KEY]);
  });

  it("PFSS-10/11: a blank or duplicate name (ignoring case) is refused with a field error and nothing is sent", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "Base");
    const before = st.calls.length;
    await saveAs(el, "   ");
    assert.equal(q(el, "pf-saved-error")!.textContent, "Name the scenario.");
    await saveAs(el, "base");
    assert.equal(q(el, "pf-saved-error")!.textContent, NAME_TAKEN);
    assert.equal(q(el, "pf-saved-name")!.getAttribute("aria-invalid"), "true");
    assert.equal(st.calls.length, before, "nothing sent");
  });

  it("PFSS-20/21: Open reopens the saved values (no new GET); Back to the latest month shows the latest data again", async () => {
    const st = server(record());
    const el = await render();
    await type(qa(el, "pf-monthly")[0], "3,500");
    await saveAs(el, "Rent up");
    // A fresh screen (the latest data again) then reopen.
    await click(q(el, "pf-saved-open")!);
    assert.equal(monthCell(el, "expenses"), "4,000.00");
    const gets = st.calls.filter((c) => c.method === "GET").length;
    await click(q(el, "pf-saved-latest")!);
    assert.equal(monthCell(el, "expenses"), "3,000.00", "latest month again");
    await click(q(el, "pf-saved-open")!);
    assert.equal(monthCell(el, "expenses"), "4,000.00");
    assert.equal(st.calls.filter((c) => c.method === "GET").length, gets, "reopen fetches nothing");
    assert.equal(onlyScenarioChanged(st), 1);
  });

  it("PFSS-22 (Q-SS4): a scenario saved from an earlier month says so and shows its values on the latest month", async () => {
    const rec = record();
    const st = server(rec);
    const s = { income: {}, expenses: {}, rate: null, growth: null, start: null, saved: [{
      id: "a", name: "Old", savedAt: "2026-08-20T00:00:00Z", basis: "2026-08",
      inputs: { start: 0, income: 7500, expenses: 1000, growth: 0, rate: 4 },
      values: {}, lines: JSON.stringify({ fixed: [line("rent", "900")], variable: [line("food", "100")], people: [person] }),
    }] };
    st.record = { ...rec, [SCENARIO_KEY]: JSON.stringify(s) };
    const el = await render();
    await click(q(el, "pf-saved-open")!);
    assert.match(q(el, "pf-saved-basis")!.textContent!, /^Saved from August 2026\. The latest month is now October 2026/);
    assert.equal(monthCell(el, "expenses"), "1,000.00");
  });

  it("PFSS-30/31: Compare shows the screen and up to 3 saved scenarios side by side, with a net-assets chart", async () => {
    server(record());
    const el = await render();
    for (const [n, amt] of [["A", "3,000"], ["B", "3,500"], ["C", "4,000"], ["D", "4,500"]] as const) {
      await type(qa(el, "pf-monthly")[0], amt);
      await saveAs(el, n);
    }
    const boxes = qa(el, "pf-saved-compare") as HTMLInputElement[];
    for (const b of boxes) await click(b);
    assert.deepEqual(qa(el, "pf-compare-head").map((h) => h.textContent), ["This screen", "A", "B", "C"]);
    assert.equal(boxes[3].disabled, true, "a 4th can't be picked");
    assert.equal(q(el, "pf-compare-chart")!.getAttribute("data-lines"), "4");
    const exp = qa(q(el, "pf-compare-row-expenses")!, "pf-compare-cell").map((c) => c.textContent);
    assert.deepEqual(exp, ["5,000.00", "3,500.00", "4,000.00", "4,500.00"]);
  });

  it("PFSS-35/36/40: Delete asks; Cancel keeps it; OK removes only that scenario (scenario value only)", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    let asked = confirmAs(false);
    await click(qa(el, "pf-saved-delete")[0]);
    assert.deepEqual(asked, ['Delete the scenario "A"? This cannot be undone.']);
    assert.deepEqual(names(el), ["A", "B"]);
    const puts = st.calls.filter((c) => c.method === "PUT").length;
    asked = confirmAs(true);
    await click(qa(el, "pf-saved-delete")[0]);
    assert.deepEqual(names(el), ["B"]);
    assert.equal(st.calls.filter((c) => c.method === "PUT").length, puts + 1);
    assert.deepEqual(readScenario(st.record)!.saved!.map((e) => e.name), ["B"]);
    assert.equal(onlyScenarioChanged(st), 3);
    assert.equal(st.record[MONTHS_KEY], record()[MONTHS_KEY]);
  });

  it("#242 QA BI1 (PFTW-09): Delete refused as stale (409) shows the server's reload message, keeps the scenario", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    const inner = globalThis.fetch;
    const stale = async (url: unknown, init?: { method?: string; body?: string }) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ error: STALE_MESSAGE, code: "stale" }), { status: 409 })
        : (inner as (u: unknown, i?: unknown) => Promise<Response>)(url, init);
    (dom.window as unknown as { fetch: unknown }).fetch = stale;
    (globalThis as unknown as { fetch: unknown }).fetch = stale;
    confirmAs(true);
    await click(qa(el, "pf-saved-delete")[0]);
    await act(async () => {});
    assert.equal(q(el, "pf-saved-status")!.textContent, STALE_MESSAGE);
    assert.match(STALE_MESSAGE, /Reload/);
    assert.deepEqual(names(el), ["A"]);
    assert.deepEqual(readScenario(st.record)!.saved!.map((e) => e.name), ["A"]);
  });

  it("PFSS-45: Read users can open and compare saved scenarios but get no Save and no Delete", async () => {
    const rec = record();
    const st = server(rec, false);
    st.record = { ...rec, [SCENARIO_KEY]: JSON.stringify({ income: {}, expenses: {}, rate: null, growth: null, start: null, saved: [{
      id: "a", name: "Plan", savedAt: "2026-10-01T00:00:00Z", basis: "2026-10",
      inputs: { start: 0, income: 7500, expenses: 2000, growth: 0, rate: 4 }, values: {}, lines: JSON.stringify({ fixed: [line("rent", "2000")], variable: [], people: [person] }),
    }] }) };
    const el = await render();
    assert.equal(q(el, "pf-saved-save"), null);
    assert.equal(q(el, "pf-saved-delete"), null);
    await click(q(el, "pf-saved-open")!);
    assert.equal(monthCell(el, "expenses"), "2,000.00");
    await click(q(el, "pf-saved-compare")!);
    assert.equal(qa(el, "pf-compare-head").length, 2);
    assert.deepEqual(st.calls.map((c) => c.method), ["GET"], "nothing sent");
  });
});

describe("#236 PFTX-03: the saved-scenario Compare checkbox's tap target is its label", () => {
  it("each pf-saved-compare is the only control in its label.pf-saved-compare-label; a click on the label picks it; nothing is sent", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    const box = q(el, "pf-saved-compare") as HTMLInputElement;
    const label = box.closest("label")!;
    assert.ok(label.classList.contains("pf-saved-compare-label"), label.className);
    assert.equal(label.querySelectorAll("input,button,select,a").length, 1);
    const puts = st.calls.filter((c) => c.method === "PUT").length;
    await click(label);
    assert.equal((q(el, "pf-saved-compare") as HTMLInputElement).checked, true);
    assert.equal(qa(el, "pf-compare-head").length, 2);
    assert.equal(st.calls.filter((c) => c.method === "PUT").length, puts, "compare sends nothing");
  });
});
