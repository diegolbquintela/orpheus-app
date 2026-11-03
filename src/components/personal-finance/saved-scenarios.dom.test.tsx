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
async function openTable(el: HTMLElement) {
  const btn = q(el, "pf-saved-toggle")!;
  if (btn.getAttribute("aria-expanded") !== "true") await click(btn);
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
    assert.equal(q(el, "pf-saved-table"), null, "table stays closed until toggled");
    await openTable(el);
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
    await openTable(el);
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
    await openTable(el);
    await click(q(el, "pf-saved-open")!);
    assert.match(q(el, "pf-saved-basis")!.textContent!, /^Saved from August 2026\. The latest month is now October 2026/);
    assert.equal(monthCell(el, "expenses"), "1,000.00");
  });

  // #279 (spec §84, PF2C): amended from 2..3 saved to This screen + exactly 1 saved (This screen counts as one of 2).
  it("PFSS-30/31 (amended #279): Compare shows the screen and 1 saved scenario side by side, with a net-assets chart", async () => {
    server(record());
    const el = await render();
    for (const [n, amt] of [["A", "3,000"], ["B", "3,500"], ["C", "4,000"], ["D", "4,500"]] as const) {
      await type(qa(el, "pf-monthly")[0], amt);
      await saveAs(el, n);
    }
    await openTable(el);
    const boxes = qa(el, "pf-saved-compare") as HTMLInputElement[];
    assert.equal(q(el, "pf-saved-compare-button"), null);
    await click(boxes[1]);
    assert.ok(q(el, "pf-saved-compare-button"), "1 checked (with This screen = 2) shows Compare selected");
    assert.equal(q(el, "pf-compare-section"), null, "CompareTable waits for Compare selected click");
    await click(boxes[2]);
    await click(boxes[3]);
    await click(q(el, "pf-saved-compare-button")!);
    // #299 (spec §88): This screen + 2 saved; a 3rd saved can't be picked.
    assert.deepEqual(qa(el, "pf-compare-head").map((h) => h.textContent), ["This screen", "B", "C"]);
    assert.equal(boxes[3].getAttribute("aria-disabled"), "true", "a 3rd saved can't be picked");
    assert.equal(boxes[3].checked, false);
    assert.equal(q(el, "pf-compare-chart")!.getAttribute("data-lines"), "3");
    const exp = qa(q(el, "pf-compare-row-expenses")!, "pf-compare-cell").map((c) => c.textContent);
    assert.deepEqual(exp, ["5,000.00", "4,000.00", "4,500.00"]);
  });

  it("PFSS-35/36/40: Delete asks; Cancel keeps it; OK removes only that scenario (scenario value only)", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    await openTable(el);
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
    await openTable(el);
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

  it("PFSS-45 / PFST-05: Read users can open and compare saved scenarios but get no Save, Rename, Update, or Delete", async () => {
    const rec = record();
    const st = server(rec, false);
    st.record = { ...rec, [SCENARIO_KEY]: JSON.stringify({ income: {}, expenses: {}, rate: null, growth: null, start: null, saved: [
      {
        id: "a", name: "Plan", savedAt: "2026-10-01T00:00:00Z", basis: "2026-10",
        inputs: { start: 0, income: 7500, expenses: 2000, growth: 0, rate: 4 }, values: {}, lines: JSON.stringify({ fixed: [line("rent", "2000")], variable: [], people: [person] }),
      },
      {
        id: "b", name: "Alt", savedAt: "2026-10-02T00:00:00Z", basis: "2026-10",
        inputs: { start: 0, income: 7500, expenses: 2500, growth: 0, rate: 4 }, values: {}, lines: JSON.stringify({ fixed: [line("rent", "2500")], variable: [], people: [person] }),
      },
    ] }) };
    const el = await render();
    await openTable(el);
    assert.equal(q(el, "pf-saved-save"), null);
    assert.equal(q(el, "pf-saved-rename"), null);
    assert.equal(q(el, "pf-saved-update"), null);
    assert.equal(q(el, "pf-saved-delete"), null);
    await click(qa(el, "pf-saved-open")[0]);
    assert.equal(monthCell(el, "expenses"), "2,000.00");
    assert.equal(q(el, "pf-saved-compare-button"), null);
    await click(qa(el, "pf-saved-compare")[1]);
    await click(q(el, "pf-saved-compare-button")!);
    assert.deepEqual(qa(el, "pf-compare-head").map((h) => h.textContent), ["This screen", "Alt"]);
    assert.deepEqual(st.calls.map((c) => c.method), ["GET"], "nothing sent");
  });
});

describe("#236 PFTX-03: the saved-scenario Compare checkbox's tap target is its label", () => {
  it("each pf-saved-compare is the only control in its label.pf-saved-compare-label; a click on the label picks it; nothing is sent", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    await openTable(el);
    const boxes = qa(el, "pf-saved-compare") as HTMLInputElement[];
    const label0 = boxes[0].closest("label")!;
    const label1 = boxes[1].closest("label")!;
    assert.ok(label0.classList.contains("pf-saved-compare-label"), label0.className);
    assert.equal(label0.querySelectorAll("input,button,select,a").length, 1);
    const puts = st.calls.filter((c) => c.method === "PUT").length;
    await click(label0);
    assert.equal(boxes[0].checked, true);
    await click(label1);
    assert.equal(boxes[1].checked, true, "#299: a 2nd saved can be picked through its label");
    await click(label0);
    assert.equal(boxes[0].checked, false, "the label unpicks it");
    await click(label0);
    assert.equal(boxes[0].checked, true);
    await click(q(el, "pf-saved-compare-button")!);
    assert.equal(qa(el, "pf-compare-head").length, 3);
    assert.equal(st.calls.filter((c) => c.method === "PUT").length, puts, "compare sends nothing");
  });
});

describe("#261 saved scenarios table + compare button (PFST-01..08)", () => {
  it("PFST-01/02/04: toggle button opens/closes the 4-column table inside .pf-scenario-scroll with Select | Scenario name | From | Actions", async () => {
    const st = server(record());
    const el = await render();
    const toggle = q(el, "pf-saved-toggle")!;
    assert.equal(toggle.textContent, "Compare with saved scenarios");
    assert.ok(toggle.classList.contains("pf-button"));
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-saved-none")!.textContent, "No saved scenarios yet.");
    assert.equal(q(el, "pf-saved-table"), null);

    await saveAs(el, "Cut dining");
    assert.equal(q(el, "pf-saved-none"), null);
    assert.equal(q(el, "pf-saved-table"), null, "still closed before clicking toggle");

    const callsBeforeToggle = st.calls.length;
    await click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    const table = q(el, "pf-saved-table")!;
    assert.equal(table.tagName, "TABLE");
    assert.ok(q(el, "pf-saved-list"), "tbody has data-testid=pf-saved-list");
    const scroll = table.closest(".pf-scenario-scroll")!;
    assert.ok(scroll, "table is wrapped in .pf-scenario-scroll");
    assert.equal(scroll.getAttribute("role"), "region");
    assert.equal(scroll.getAttribute("tabindex"), "0");

    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
    assert.deepEqual(headers, ["Select", "Scenario name", "From", "Actions"]);

    const row = qa(el, "pf-saved-item")[0];
    assert.equal(row.tagName, "TR");
    const cells = [...row.querySelectorAll("td")];
    assert.equal(cells.length, 4);
    assert.ok(cells[0].querySelector("[data-testid=\"pf-saved-compare\"]"));
    assert.equal(cells[1].querySelector("[data-testid=\"pf-saved-item-name\"]")!.textContent, "Cut dining");
    assert.equal(cells[2].textContent, "October 2026");
    assert.ok(cells[3].querySelector("[data-testid=\"pf-saved-open\"]"));
    assert.ok(cells[3].querySelector("[data-testid=\"pf-saved-rename\"]"));
    assert.ok(cells[3].querySelector("[data-testid=\"pf-saved-update\"]"));
    assert.ok(cells[3].querySelector("[data-testid=\"pf-saved-delete\"]"));

    await click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-saved-table"), null);
    assert.equal(st.calls.length, callsBeforeToggle, "toggling table sends zero network requests");
  });

  it("PFST-06/07/08 (amended #279): Compare selected shows at 1 checked (This screen + 1), opens CompareTable on click, follows a swap, and hides CompareTable when unchecked or deleted to 0 until clicked again", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    await saveAs(el, "C");
    await openTable(el);

    const callsAfterSetup = st.calls.length;
    const boxes = () => qa(el, "pf-saved-compare") as HTMLInputElement[];
    const heads = () => qa(el, "pf-compare-head").map((h) => h.textContent);

    assert.equal(q(el, "pf-saved-compare-button"), null);
    assert.equal(q(el, "pf-compare-section"), null);

    await click(boxes()[0]);
    const cmpBtn = q(el, "pf-saved-compare-button")!;
    assert.equal(cmpBtn.textContent, "Compare selected");
    assert.ok(cmpBtn.classList.contains("pf-button"));
    assert.equal(q(el, "pf-compare-section"), null, "not shown before clicking Compare selected");

    await click(cmpBtn);
    assert.ok(q(el, "pf-compare-section"));
    assert.deepEqual(heads(), ["This screen", "A"]);
    assert.equal(st.calls.length, callsAfterSetup, "checking boxes and clicking Compare selected send zero requests");

    // A 2nd saved is locked while Compare is open; swapping (uncheck A, check C) needs Compare selected again.
    // #299 (spec §88): a 2nd saved joins the open Compare; a 3rd is locked; unpicking it goes back to 2 columns.
    await click(boxes()[2]);
    assert.deepEqual(heads(), ["This screen", "A", "C"]);
    await click(boxes()[1]);
    assert.deepEqual(heads(), ["This screen", "A", "C"], "a 3rd saved is locked");
    await click(boxes()[2]);
    assert.deepEqual(heads(), ["This screen", "A"]);
    await click(boxes()[0]);
    assert.equal(q(el, "pf-saved-compare-button"), null);
    assert.equal(q(el, "pf-compare-section"), null);
    await click(boxes()[2]);
    assert.ok(q(el, "pf-saved-compare-button"));
    assert.equal(q(el, "pf-compare-section"), null, "stays hidden until Compare selected is clicked again");
    await click(q(el, "pf-saved-compare-button")!);
    assert.deepEqual(heads(), ["This screen", "C"]);

    // Renaming the compared scenario updates its column header immediately
    await click(qa(el, "pf-saved-rename")[2]);
    await type(q(el, "pf-saved-rename-name")!, "Gamma");
    await click(q(el, "pf-saved-rename-save")!);
    assert.deepEqual(heads(), ["This screen", "Gamma"]);

    // Deleting an unpicked one keeps Compare open; deleting the picked one hides it and unlocks the rest
    confirmAs(true);
    await click(qa(el, "pf-saved-delete")[1]);
    assert.deepEqual(heads(), ["This screen", "Gamma"]);
    await click(qa(el, "pf-saved-delete")[1]);
    assert.equal(q(el, "pf-saved-compare-button"), null);
    assert.equal(q(el, "pf-compare-section"), null);
    assert.equal(boxes()[0].getAttribute("aria-disabled"), null, "unlocked after the picked one is deleted");
    await click(boxes()[0]);
    assert.ok(q(el, "pf-saved-compare-button"));
    assert.equal(q(el, "pf-compare-section"), null, "after delete, CompareTable stays hidden until Compare selected is clicked again");
  });
});

// #258 (spec 80, AC PFRL-06/07): Saved scenarios' stale banner (Save / Rename / Update / Delete refused 409 or 428)
// shows the message on screen with a one-click Reload right after it, through the page's own load (in place).
describe("#258 PFRL Saved scenarios: Reload from the stale banner", () => {
  const refuse = (status: 409 | 428) => {
    const inner = globalThis.fetch as (u: unknown, i?: unknown) => Promise<Response>;
    const f = async (url: unknown, init?: { method?: string; body?: string }) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ error: "x", code: status === 409 ? "stale" : "base_version_required" }), { status })
        : inner(url, init);
    (dom.window as unknown as { fetch: unknown }).fetch = f;
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    return inner;
  };
  const restore = (inner: unknown) => {
    (dom.window as unknown as { fetch: unknown }).fetch = inner;
    (globalThis as unknown as { fetch: unknown }).fetch = inner;
  };

  it("PFRL-06: Delete refused as stale (409): visible banner + Reload right after it; Reload re-reads in place (another tab's scenario shows), banner gone, heading focused", async () => {
    const st = server(record());
    const el = await render();
    await saveAs(el, "A");
    await openTable(el);
    assert.equal(q(el, "pf-saved-stale"), null, "no banner before a refusal");
    const inner = refuse(409);
    confirmAs(true);
    await click(qa(el, "pf-saved-delete")[0]);
    const banner = q(el, "pf-saved-stale")!;
    assert.ok(banner, "a visible banner");
    assert.equal(banner.querySelector("p")!.textContent, STALE_MESSAGE);
    const btn = q(el, "pf-saved-reload") as HTMLButtonElement;
    assert.equal(btn.textContent, "Reload");
    assert.equal(banner.querySelector("p")!.nextElementSibling, btn.parentElement, "right after the banner text");
    assert.ok(btn.classList.contains("pf-button"), "44px pf-button");
    // Another tab adds a scenario meanwhile.
    const sc = readScenario(st.record)!;
    st.record = { ...st.record, [SCENARIO_KEY]: JSON.stringify({ ...sc, saved: [...sc.saved!, { ...sc.saved![0], id: "other", name: "Other" }] }) };
    restore(inner);
    const gets = st.calls.filter((c) => c.method === "GET").length;
    const puts = st.calls.filter((c) => c.method === "PUT").length;
    await click(btn);
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    assert.equal(st.calls.filter((c) => c.method === "GET").length, gets + 1, "one fresh GET");
    assert.equal(st.calls.filter((c) => c.method === "PUT").length, puts, "nothing written");
    assert.deepEqual(names(el), ["A", "Other"], "the fresh record");
    assert.equal(q(el, "pf-saved-stale"), null, "banner gone");
    assert.equal(dom.window.document.activeElement?.tagName, "H1", "focus on the page heading");
    confirmAs(true);
    await click(qa(el, "pf-saved-delete")[0]);
    assert.deepEqual(names(el), ["Other"], "Delete works after the reload");
    assert.equal(q(el, "pf-saved-stale"), null);
  });

  it("PFRL-07: Save refused 428: banner + Reload; while reloading disabled + Reloading…; a failed reload keeps the typed name and focuses an inline error", async () => {
    server(record());
    const el = await render();
    const inner = refuse(428);
    await saveAs(el, "Plan B");
    assert.ok(q(el, "pf-saved-stale"), "428 shows the same banner");
    assert.equal(q(el, "pf-saved-error"), null, "Q-RL2: no field error under the name on a stale Save");
    assert.equal(q(el, "pf-saved-name")!.getAttribute("aria-invalid"), null);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const failing = async (url: unknown, init?: { method?: string }) => {
      if ((init?.method ?? "GET") === "GET") {
        await gate;
        return new Response("{}", { status: 500 });
      }
      return (inner as (u: unknown, i?: unknown) => Promise<Response>)(url, init);
    };
    restore(failing);
    await act(async () => (q(el, "pf-saved-reload") as HTMLButtonElement).click());
    assert.equal((q(el, "pf-saved-reload") as HTMLButtonElement).disabled, true);
    assert.equal(q(el, "pf-saved-reload")!.textContent, "Reloading…");
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 10));
    });
    assert.equal(q(el, "pf-saved-reload-error")?.textContent, "Couldn't reload. Your edits are kept; try again.");
    assert.equal(dom.window.document.activeElement?.getAttribute("data-testid"), "pf-saved-reload-error", "focus on the error");
    assert.equal((q(el, "pf-saved-name") as HTMLInputElement).value, "Plan B", "the typed name is kept");
    assert.ok(q(el, "pf-saved-stale"), "the banner stays");
    restore(inner);
  });
});

// #258 Q-RL2 (CFO, 2026-11-01; AC PFRL-10/11): a stale Save shows only the banner; other field errors stay.
describe("#258 PFRL Q-RL2: stale Save has no field error under the name", () => {
  it("PFRL-10: Save refused 409 → banner with STALE_MESSAGE, no pf-saved-error, name not aria-invalid; the name is kept", async () => {
    server(record());
    const el = await render();
    const inner = globalThis.fetch;
    const f = async (url: unknown, init?: { method?: string; body?: string }) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ error: STALE_MESSAGE, code: "stale" }), { status: 409 })
        : (inner as (u: unknown, i?: unknown) => Promise<Response>)(url, init);
    (dom.window as unknown as { fetch: unknown }).fetch = f;
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    await saveAs(el, "Plan C");
    assert.equal(q(el, "pf-saved-stale")!.querySelector("p")!.textContent, STALE_MESSAGE);
    assert.equal(q(el, "pf-saved-error"), null);
    assert.equal(q(el, "pf-saved-name")!.getAttribute("aria-invalid"), null);
    assert.equal(qa(el, "pf-saved-section")[0].textContent!.split(STALE_MESSAGE).length - 1, 1, "the message shows once");
    assert.equal((q(el, "pf-saved-name") as HTMLInputElement).value, "Plan C");
  });

  it("PFRL-11: validation errors still show under the name (duplicate name), with no stale banner", async () => {
    server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "A");
    assert.equal(q(el, "pf-saved-error")?.textContent, NAME_TAKEN);
    assert.equal(q(el, "pf-saved-name")!.getAttribute("aria-invalid"), "true");
    assert.equal(q(el, "pf-saved-stale"), null);
    // A non-stale server refusal still shows its error under the name.
    const inner = globalThis.fetch;
    const f = async (url: unknown, init?: { method?: string; body?: string }) =>
      init?.method === "PUT" ? new Response("{}", { status: 500 }) : (inner as (u: unknown, i?: unknown) => Promise<Response>)(url, init);
    (dom.window as unknown as { fetch: unknown }).fetch = f;
    (globalThis as unknown as { fetch: unknown }).fetch = f;
    await saveAs(el, "B");
    assert.ok(q(el, "pf-saved-error")?.textContent, "a 500 keeps the field error");
    assert.equal(q(el, "pf-saved-stale"), null);
  });
});

// #258 QA BT4 (2026-11-01; AC PFRL-10 amended): a stale Rename shows only the banner; other rename errors stay.
describe("#258 PFRL BT4: stale Rename has no field error under the rename field", () => {
  const putReplies = (reply: () => Response) => {
    const inner = globalThis.fetch as (u: unknown, i?: unknown) => Promise<Response>;
    const f = async (url: unknown, init?: { method?: string; body?: string }) => (init?.method === "PUT" ? reply() : inner(url, init));
    (dom.window as unknown as { fetch: unknown }).fetch = f;
    (globalThis as unknown as { fetch: unknown }).fetch = f;
  };
  it("PFRL-10b: Rename refused 409 or 428 → banner only (no pf-saved-rename-error, not aria-invalid, typed name kept); a duplicate name and a 500 still show under the field", async () => {
    server(record());
    const el = await render();
    await saveAs(el, "A");
    await saveAs(el, "B");
    await openTable(el);
    await click(qa(el, "pf-saved-rename")[0]);
    // Validation (client-side) still shows under the field.
    await type(q(el, "pf-saved-rename-name")!, "b");
    await click(q(el, "pf-saved-rename-save")!);
    assert.equal(q(el, "pf-saved-rename-error")?.textContent, NAME_TAKEN);
    for (const status of [409, 428] as const) {
      putReplies(() => new Response(JSON.stringify({ error: "x", code: status === 409 ? "stale" : "base_version_required" }), { status }));
      await type(q(el, "pf-saved-rename-name")!, "Alpha");
      await click(q(el, "pf-saved-rename-save")!);
      assert.ok(q(el, "pf-saved-stale"), `${status}: the banner shows`);
      assert.equal(q(el, "pf-saved-stale")!.querySelector("p")!.textContent, STALE_MESSAGE);
      assert.equal(q(el, "pf-saved-rename-error"), null, `${status}: no rename field error`);
      assert.equal(q(el, "pf-saved-rename-name")!.getAttribute("aria-invalid"), null, `${status}: not invalid`);
      assert.equal((q(el, "pf-saved-rename-name") as HTMLInputElement).value, "Alpha", `${status}: typed name kept`);
      assert.equal(qa(el, "pf-saved-section")[0].textContent!.split(STALE_MESSAGE).length - 1, 1, `${status}: the message shows once`);
    }
    // A non-stale server failure still shows under the field.
    putReplies(() => new Response("{}", { status: 500 }));
    await click(q(el, "pf-saved-rename-save")!);
    assert.ok(q(el, "pf-saved-rename-error")?.textContent, "a 500 keeps the rename field error");
    assert.equal(q(el, "pf-saved-rename-name")!.getAttribute("aria-invalid"), "true");
    assert.equal(q(el, "pf-saved-stale"), null, "no stale banner on a 500");
  });
});
