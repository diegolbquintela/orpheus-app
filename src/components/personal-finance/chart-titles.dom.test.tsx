// #280 (attachments/personal-finance-spec.md §85, AC PFCH-04..09): the scenario screen keeps BOTH charts (choice (b)),
// each with a visible title (h3) and subtitle wired to its figure (aria-labelledby / aria-describedby), through the real
// ScenarioPage against an in-memory fake of /api/personal-finance; Compare uses the same heading; the charts' data is
// pinned to what main (07ecdd0) rendered; no request, no storage write.
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
const heading = (el: HTMLElement, fig: string, head: string) => {
  const f = q(el, fig)!;
  const t = q(f, `${head}-title`)!;
  const s = q(f, `${head}-sub`)!;
  return { tag: t.tagName, title: t.textContent, sub: s.textContent, wired: f.getAttribute("aria-labelledby") === t.id && f.getAttribute("aria-describedby") === s.id && !!t.id && !!s.id && t.id !== s.id, cap: f.querySelector("figcaption")?.contains(t) ?? false };
};
const data = (el: HTMLElement, fig: string) => [q(el, fig)!.getAttribute("data-months"), q(el, fig)!.getAttribute("data-net-last")];
// Captured on main 07ecdd0 (pre-#280) with this fixture: [months, net at the last point].
const BEFORE = { overview: ["12", "9000.00"], projected12: ["13", "63000.00"], projected60: ["61", "279000.00"], overviewFuture1: ["24", "63000.00"] };

describe("#280 two clearly titled charts on the scenario screen (PFCH)", () => {
  it("PFCH-04: exactly two charts before Compare, each with its own visible h3 title and subtitle, wired to its figure", async () => {
    server(record());
    const el = await render();
    assert.equal(el.querySelectorAll("figure.pf-chart").length, 2);
    const ov = heading(el, "pf-chart", "pf-chart-head");
    const pj = heading(el, "pf-scenario-chart", "pf-scenario-chart-head");
    assert.deepEqual(ov, { tag: "H3", title: "Last 12 months", sub: "Income, expenses and net assets for each month up to October 2026.", wired: true, cap: true });
    assert.deepEqual(pj, { tag: "H3", title: "Next 12 months from now", sub: "This screen's October 2026 income and expenses held flat, starting from Net assets now.", wired: true, cap: true });
    assert.notEqual(ov.title, pj.title);
    assert.equal(el.querySelectorAll("figcaption.sr-only").length, 0, "no hidden-only captions left");
  });

  it("PFCH-05: the Projected path title follows the horizon; the Overview subtitle follows Future (and says how it relates)", async () => {
    server(record());
    const el = await render();
    await click(q(el, "pf-horizon-60")!);
    assert.equal(heading(el, "pf-scenario-chart", "pf-scenario-chart-head").title, "Next 5 years from now");
    assert.equal(heading(el, "pf-chart", "pf-chart-head").title, "Last 12 months", "Overview does not follow the horizon");
    await click(q(el, "pf-future-toggle")!);
    assert.equal(heading(el, "pf-chart", "pf-chart-head").sub, "Income, expenses and net assets for each month up to October 2026, then 1 year ahead: net assets as in Projected path, income and expenses at 12-month averages.");
  });

  it("PFCH-06: the charts plot exactly what they did before #280 (months and last net, Future off/on, horizons)", async () => {
    server(record());
    const el = await render();
    assert.deepEqual(data(el, "pf-chart"), BEFORE.overview);
    assert.deepEqual(data(el, "pf-scenario-chart"), BEFORE.projected12);
    await click(q(el, "pf-horizon-60")!);
    assert.deepEqual(data(el, "pf-scenario-chart"), BEFORE.projected60);
    await click(q(el, "pf-future-toggle")!);
    assert.deepEqual(data(el, "pf-chart"), BEFORE.overviewFuture1);
  });

  it("PFCH-07: Compare's chart uses the same heading (title, subtitle with the horizon, wiring)", async () => {
    server(record());
    const el = await render();
    await click(q(el, "pf-horizon-36")!);
    await click(box(el, 1));
    await click(q(el, "pf-saved-compare-button")!);
    assert.deepEqual(heading(el, "pf-compare-chart", "pf-compare-chart-head"), { tag: "H3", title: "Net assets by scenario", sub: "This screen and the saved scenario, each projected over 3 years from its own net assets now.", wired: true, cap: true });
    assert.equal(el.querySelectorAll(".pf-chart-head").length, 3, "one heading per chart, the same component");
  });

  it("PFCH-08: reopening a saved scenario keeps both titled charts (the view the issue reports)", async () => {
    server(record());
    const el = await render();
    const open = qa(el, "pf-saved-open")[1] ?? [...el.querySelectorAll("button")].find((b) => b.textContent === "Open");
    assert.ok(open, "an Open button");
    await click(open!);
    await act(async () => {});
    assert.equal(heading(el, "pf-chart", "pf-chart-head").title, "Last 12 months");
    assert.equal(heading(el, "pf-scenario-chart", "pf-scenario-chart-head").title, "Next 12 months from now");
    assert.equal(el.querySelectorAll("figure.pf-chart").length, 2);
  });

  it("PFCH-09: headings send no request and write no storage", async () => {
    const calls = server(record());
    const el = await render();
    const before = { calls: calls.length, storage: storage() };
    for (const t of ["pf-horizon-36", "pf-future-toggle", "pf-horizon-12", "pf-future-toggle"]) await click(q(el, t)!);
    assert.equal(calls.length, before.calls);
    assert.equal(storage(), before.storage);
  });
});
