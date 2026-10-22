// #221 (personal-finance-spec 57, AC PFPJ-30..PFPJ-40): the Scenario page in jsdom with the real components: the Personal
// Finance page in scenario mode (categories removed, prefilled, what-ifs never sent) and the projection below it.
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
import { BASED_ON_LAST_MONTH, GROWTH_ERROR, NET_ASSETS_ERROR, NO_DATA, NOTHING_SAVED, WHAT_IF_NOTE } from "@/lib/finance/scenario";
import type { ScenarioLoad } from "@/lib/finance/scenario-client";

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});

const NOW = new Date("2026-10-16T16:00:00Z");
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
/** Saved through 2026-09 only: the current month 2026-10 opens as its unsaved copy (#199). */
function record(extra: PfRecord = {}, growth = ""): PfRecord {
  const s = new RecordStore({});
  writeExpenses(s, { fixed: [], variable: [], accounts: [], categories: ["Home"] });
  writeRates(s, { withdrawal: "4", roic: "" });
  writeOverview(s, { ...NO_OVERVIEW, start: "0", growth });
  writeMonths(s, {
    "2026-09": {
      fixed: [line("rent", "2500", "Home")],
      variable: [line("food", "500")],
      people: [person],
    },
  });
  return { ...s.data, ...extra };
}
const RW = { owner: true, write: true };
const READ = { owner: false, write: false };

/** Every network call the page makes (it must make none: the load is injected). */
let fetches: string[] = [];
async function render(load: () => Promise<ScenarioLoad>) {
  fetches = [];
  const spy = async (url: unknown, init?: { method?: string }) => {
    fetches.push(`${init?.method ?? "GET"} ${String(url)}`);
    return new Response("{}", { status: 500 });
  };
  (dom.window as unknown as { fetch: unknown }).fetch = spy;
  (globalThis as unknown as { fetch: unknown }).fetch = spy;
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(<ScenarioPage load={load} now={NOW} chartWidth={360} />),
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

async function key(field: Element, k: string) {
  const el = field as HTMLInputElement;
  const p = Object.keys(el).find((x) => x.startsWith("__reactProps$"))!;
  const props = (el as unknown as Record<string, { onKeyDown: (e: { key: string; preventDefault: () => void }) => void }>)[p];
  await act(async () => props.onKeyDown({ key: k, preventDefault: () => {} }));
}
const ok = (rec: PfRecord | null, access = RW) => {
  let n = 0;
  const load = async (): Promise<ScenarioLoad> => {
    n++;
    return { ok: true, record: rec, access };
  };
  return { load, count: () => n };
};
const monthCell = (el: HTMLElement, row: string) => cell(el, row, "pf-scenario-month");

describe("#221 Scenario page = the Personal Finance page in scenario mode", () => {
  it("PFPJ-30: one load; Scenario title, what-if note, 'Based on last month'; Income, Expenses, summary, Overview; no categories part, no month control, no Save", async () => {
    const l = ok(record());
    const el = await render(l.load);
    assert.equal(l.count(), 1);
    assert.equal(el.querySelector("h1")?.textContent, "Scenario.");
    assert.equal(q(el, "pf-scenario-whatif")?.textContent, WHAT_IF_NOTE);
    assert.equal(q(el, "pf-scenario-basis")?.textContent, `${BASED_ON_LAST_MONTH} (September 2026).`);
    for (const id of ["pf-income-block", "pf-expenses-block", "pf-summary-block", "pf-overview", "pf-scenario-chart", "pf-scenario-totals"]) assert.ok(q(el, id), id);
    for (const id of ["pf-filter", "pf-filter-cell", "pf-categories", "pf-month-control", "pf-month-save", "pf-scenario-save"]) assert.equal(q(el, id), null, id);
    // prefilled: last month's lines (the copy), never empty
    assert.equal(qa(el, "pf-line").length, 2);
    assert.equal((qa(el, "pf-monthly")[0] as HTMLInputElement).value, "2500");
    assert.deepEqual(fetches, []);
  });

  it("PFPJ-31: month 0 plotted once (13 points at 12 months); the Scenario column is filled for net assets and coverage", async () => {
    const el = await render(ok(record()).load);
    assert.equal(q(el, "pf-scenario-chart")?.getAttribute("data-months"), "13");
    await click(q(el, "pf-horizon-36")!);
    assert.equal(q(el, "pf-scenario-chart")?.getAttribute("data-months"), "37");
    assert.notEqual(monthCell(el, "net"), "—");
    assert.ok(q(el, "pf-scenario-row-growth"), "growth earned row");
    assert.equal(monthCell(el, "expenses"), "3,000.00");
  });

  it("PFPJ-32: every edit (a line amount, income, Overview, net assets, a section toggle) recalculates live and sends nothing", async () => {
    const l = ok(record());
    const el = await render(l.load);
    await type(qa(el, "pf-monthly")[0], "3,500");
    assert.equal(monthCell(el, "expenses"), "4,000.00");
    await type(q(el, "pf-growth")!, "5");
    await type(q(el, "pf-scenario-net")!, "-5,000");
    assert.equal(monthCell(el, "net"), "-5,000.00");
    await click(q(el, "pf-toggle-income")!);
    await click(q(el, "pf-toggle-summary")!);
    assert.equal(l.count(), 1);
    assert.deepEqual(fetches, [], "no PUT or GET from any edit");
  });

  it("PFPJ-33 (AN8 / AN12 / AN13): net assets accepts a negative (− too), +5, .5, 5.; Enter commits (formatted); 1e3 shows its own error", async () => {
    const el = await render(ok(record()).load);
    const net = q(el, "pf-scenario-net")!;
    await type(net, "\u22121,500.5");
    await key(net, "Enter");
    assert.equal((q(el, "pf-scenario-net") as HTMLInputElement).value, "-1,500.50");
    assert.equal(monthCell(el, "net"), "-1,500.50");
    for (const [t, want] of [["+5", "5.00"], [".5", "0.50"], ["5.", "5.00"]]) {
      await type(q(el, "pf-scenario-net")!, t);
      assert.equal(monthCell(el, "net"), want, t);
    }
    await type(q(el, "pf-scenario-net")!, "1e3");
    assert.equal(q(el, "pf-scenario-net-error")?.textContent, NET_ASSETS_ERROR);
    assert.equal(q(el, "pf-scenario-net")?.getAttribute("aria-invalid"), "true");
    assert.deepEqual(fetches, []);
  });

  it("PFPJ-34 (AN6): amounts use the main page's parser: thousands commas count (3,500 = 3500), as on the main page", async () => {
    const el = await render(ok(record()).load);
    await type(q(el, "pf-scenario-net")!, "12,345.67");
    assert.equal(monthCell(el, "net"), "12,345.67");
  });

  it("PFPJ-35 (AN9): growth outside −50..+50 % a year shows its own error here", async () => {
    const el = await render(ok(record({}, "60")).load);
    assert.equal(q(el, "pf-scenario-growth-error")?.textContent, GROWTH_ERROR);
  });

  it("PFPJ-36: Read users get the same what-if screen (edits live, nothing sent) and the read-only line", async () => {
    const el = await render(ok(record(), READ).load);
    assert.ok(el.textContent?.includes("Read only"));
    await type(q(el, "pf-scenario-net")!, "-100");
    assert.equal(monthCell(el, "net"), "-100.00");
    assert.deepEqual(fetches, []);
  });

  it("PFPJ-37 (AN10): no data → the empty-state note; a load error → the alert", async () => {
    const el = await render(ok(null).load);
    assert.equal(q(el, "pf-scenario-empty")?.textContent, NO_DATA);
    assert.equal(q(el, "pf-scenario-basis")?.textContent, NOTHING_SAVED);
    await act(async () => root?.unmount());
    container?.remove();
    const bad = await render(async () => ({ ok: false, status: 500 }));
    assert.ok(q(bad, "pf-scenario-error"));
  });

  describe("#221 Monthly / Yearly on flow amounts (spec 57.13, CFO Q-PJ9)", () => {
    async function choose(sel: Element, value: string) {
      const el = sel as HTMLSelectElement;
      const k = Object.keys(el).find((x) => x.startsWith("__reactProps$"))!;
      const props = (el as unknown as Record<string, { onChange: (e: { target: { value: string } }) => void }>)[k];
      await act(async () => props.onChange({ target: { value } }));
    }
    it("PFPJ-60: the default is Monthly; seeded yearly wages 120,000 show as 10,000.00 a month; income unchanged", async () => {
      const el = await render(ok(record()).load);
      const sel = q(el, "pf-person-wages-per") as HTMLSelectElement;
      assert.equal(sel.value, "month");
      assert.equal([...q(el, "pf-person-head")!.children][1].textContent, "Wages");
      assert.equal((q(el, "pf-person-wages") as HTMLInputElement).value, "10,000.00");
      assert.equal(monthCell(el, "income"), "7,500.00");
    });
    it("PFPJ-61: Yearly 6,000 feeds 500 a month (the same as Monthly 500)", async () => {
      const el = await render(ok(record()).load);
      await type(q(el, "pf-person-wages")!, "500");
      const monthly = monthCell(el, "income");
      assert.equal(monthly, "375.00");
      await choose(q(el, "pf-person-wages-per")!, "year");
      await type(q(el, "pf-person-wages")!, "6,000");
      assert.equal(monthCell(el, "income"), monthly);
      assert.equal((q(el, "pf-person-wages") as HTMLInputElement).value, "6,000");
    });
    it("PFPJ-62: switching keeps the meaning (500 a month ↔ 6,000.00 a year) and the totals do not change", async () => {
      const el = await render(ok(record()).load);
      await type(q(el, "pf-person-wages")!, "1,000");
      const before = [monthCell(el, "income"), monthCell(el, "surplus"), monthCell(el, "net")];
      await choose(q(el, "pf-person-wages-per")!, "year");
      assert.equal((q(el, "pf-person-wages") as HTMLInputElement).value, "12,000.00");
      assert.deepEqual([monthCell(el, "income"), monthCell(el, "surplus"), monthCell(el, "net")], before);
      await type(q(el, "pf-person-wages")!, "1,000");
      await click(q(el, "pf-horizon-120")!);
      const yearly = [monthCell(el, "income"), cell(el, "income", "pf-scenario-total")];
      assert.equal(yearly[1], "7,500.00");
      await choose(q(el, "pf-person-wages-per")!, "month");
      assert.equal((q(el, "pf-person-wages") as HTMLInputElement).value, "83.33");
      assert.deepEqual([monthCell(el, "income"), cell(el, "income", "pf-scenario-total")], yearly, "the stored value is not rounded by a switch (10 years, not 7,497.00)");
      assert.deepEqual(fetches, []);
    });
    it("PFPJ-63: blank and invalid text are kept as typed across a switch; invalid shows the field's own error", async () => {
      const el = await render(ok(record()).load);
      await type(q(el, "pf-person-wages")!, "12a");
      assert.ok(el.querySelector('[data-field="wages"]'), "own error");
      await choose(q(el, "pf-person-wages-per")!, "year");
      assert.equal((q(el, "pf-person-wages") as HTMLInputElement).value, "12a");
      await type(q(el, "pf-person-wages")!, "");
      await choose(q(el, "pf-person-wages-per")!, "month");
      assert.equal((q(el, "pf-person-wages") as HTMLInputElement).value, "");
    });
    it("PFPJ-68: every income line (person / other income) has its own select, default Monthly; Yearly feeds ÷12 per line; switching any line keeps the totals", async () => {
      const p = (id: string, name: string, wages: string, tax = "0") => ({ ...person, id, name, wages, tax });
      const rec = record();
      const s = new RecordStore({ ...rec });
      writeMonths(s, {
        "2026-09": {
          fixed: [line("rent", "2500", "Home")],
          variable: [],
          people: [p("b", "Brazil family income", "24,000"), p("s", "Solium withdrawals", "12,000"), p("c", "Partner contribution", "6,000")],
        },
      });
      const el = await render(ok({ ...rec, ...s.data }).load);
      const sels = qa(el, "pf-person-wages-per") as HTMLSelectElement[];
      const ins = qa(el, "pf-person-wages") as HTMLInputElement[];
      assert.equal(sels.length, 3);
      assert.deepEqual(sels.map((x) => x.value), ["month", "month", "month"]);
      assert.deepEqual(ins.map((x) => x.value), ["2,000.00", "1,000.00", "500.00"]);
      assert.equal(monthCell(el, "income"), "3,500.00");
      assert.deepEqual(sels.map((x) => x.getAttribute("aria-label")), [
        "Wages, Brazil family income: Monthly or Yearly",
        "Wages, Solium withdrawals: Monthly or Yearly",
        "Wages, Partner contribution: Monthly or Yearly",
      ]);
      // Switch each line in turn: only its display changes, the totals stay.
      const totals = () => [monthCell(el, "income"), monthCell(el, "surplus"), monthCell(el, "net")];
      const before = totals();
      for (const sel of qa(el, "pf-person-wages-per")) await choose(sel, "year");
      assert.deepEqual((qa(el, "pf-person-wages") as HTMLInputElement[]).map((x) => x.value), ["24,000.00", "12,000.00", "6,000.00"]);
      assert.deepEqual(totals(), before);
      // Yearly 3,600 on the second line feeds 300 a month (income 2,000 + 300 + 500).
      await type(qa(el, "pf-person-wages")[1], "3,600");
      assert.equal(monthCell(el, "income"), "2,800.00");
      await choose(qa(el, "pf-person-wages-per")[1], "month");
      assert.equal((qa(el, "pf-person-wages")[1] as HTMLInputElement).value, "300.00");
      assert.equal((qa(el, "pf-person-wages-per")[0] as HTMLSelectElement).value, "year", "each line keeps its own choice");
      assert.equal(monthCell(el, "income"), "2,800.00");
      assert.deepEqual(fetches, []);
    });
    it("PFPJ-64: the select is a labelled, focusable native select with Monthly and Yearly", async () => {
      const el = await render(ok(record()).load);
      const sel = q(el, "pf-person-wages-per") as HTMLSelectElement;
      assert.equal(sel.tagName, "SELECT");
      assert.match(sel.getAttribute("aria-label") ?? "", /Wages, .*: Monthly or Yearly/);
      assert.deepEqual([...sel.options].map((o) => o.textContent), ["Monthly", "Yearly"]);
      assert.notEqual(sel.tabIndex, -1);
    });
  });

  describe("#221 QA AO1 / AO3 / AO4 / AO6 (spec 57.15)", () => {
    it("PFPJ-74 (AO1): no Account or Category select on any expense line", async () => {
      const el = await render(ok(record()).load);
      assert.ok(qa(el, "pf-line").length >= 2);
      assert.equal(qa(el, "pf-account").length, 0);
      assert.equal(qa(el, "pf-category").length, 0);
      assert.equal(qa(el, "pf-remove").length, qa(el, "pf-line").length, "the rest of the line stays");
    });
    it("PFPJ-75 (AO3): '10,5' and '1.234,56' get a field error on scenario inputs and count as 0", async () => {
      for (const bad of ["10,5", "1.234,56"]) {
        const el = await render(ok(record()).load);
        // A line amount: rent 2,500 + food 500 → 3,000; rent '10,5' counts 0 → 500.
        await type(qa(el, "pf-monthly")[0], bad);
        assert.equal((qa(el, "pf-monthly")[0] as HTMLInputElement).value, bad, "kept as typed");
        assert.ok(el.querySelector('[data-field="pf-monthly-comma"]'), `line error for ${bad}`);
        assert.equal(qa(el, "pf-monthly")[0].getAttribute("aria-invalid"), "true");
        assert.equal(monthCell(el, "expenses"), "500.00");
        // Wages (with the period select): counts 0, own error.
        await type(q(el, "pf-person-wages")!, "");
        const asZero = monthCell(el, "income");
        await type(q(el, "pf-person-wages")!, bad);
        assert.ok(el.querySelector('[data-field="pf-person-wages-comma"]'));
        assert.equal(monthCell(el, "income"), asZero, "counts as blank (0), not 105 or 1.23");
        // Equity to cover and the Overview's Starting net assets.
        await type(qa(el, "pf-equity")[0], bad);
        assert.ok(el.querySelector('[data-field="pf-equity-comma"]'));
        await type(q(el, "pf-start")!, bad);
        assert.ok(el.querySelector('[data-field="pf-start-comma"]'));
        // The scenario's net-assets field.
        await type(q(el, "pf-scenario-net")!, bad);
        assert.equal(q(el, "pf-scenario-net-error")?.textContent, NET_ASSETS_ERROR);
        // Fixing it clears the error.
        await type(qa(el, "pf-monthly")[0], "10.5");
        assert.equal(el.querySelector('[data-field="pf-monthly-comma"]'), null);
        assert.equal(monthCell(el, "expenses"), "510.50");
        assert.deepEqual(fetches, []);
        await act(async () => root?.unmount());
        container?.remove();
        root = undefined;
      }
    });
    it("PFPJ-76 (AO4): growth -50 is accepted on the scenario screen (no error, it moves the path); -51 shows the bound error", async () => {
      const el = await render(ok(record({}, "")).load);
      await type(q(el, "pf-scenario-net")!, "100,000");
      await click(q(el, "pf-horizon-120")!);
      const flat = cell(el, "net", "pf-scenario-total");
      await type(q(el, "pf-growth")!, "-50");
      assert.equal(el.querySelector('[data-field="pf-growth"]'), null, "no field error for -50");
      assert.equal(q(el, "pf-scenario-growth-error"), null);
      assert.notEqual(cell(el, "net", "pf-scenario-total"), flat, "-50 is used, not 0");
      await type(q(el, "pf-growth")!, "-51");
      assert.equal(q(el, "pf-scenario-growth-error")?.textContent, GROWTH_ERROR);
      await type(q(el, "pf-growth")!, "10,5");
      assert.ok(el.querySelector('[data-field="pf-growth-comma"]'));
      await type(q(el, "pf-growth")!, "-");
      assert.equal(q(el, "pf-scenario-growth-error")?.textContent, GROWTH_ERROR);
    });
    it("PFPJ-77 (AO6): the read-only line (and a load error) sit in a labelled landmark", async () => {
      const el = await render(ok(record(), READ).load);
      const line = el.querySelector('[data-testid="pf-scenario-access"]');
      assert.equal(line?.tagName, "ASIDE");
      assert.equal(line?.getAttribute("aria-label"), "Scenario access");
      assert.ok(line?.textContent?.trim(), "the read-only line is inside it");
    });
  });
});
