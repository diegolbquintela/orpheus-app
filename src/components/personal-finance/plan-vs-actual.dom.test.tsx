// #231 (personal-finance-spec §65.4, AC PFPV-19..24): Planned vs actual in the month view, in jsdom with the real page.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MONTHS_KEY } from "@/lib/finance/months";
import { PLANS_KEY } from "@/lib/finance/plans";
import { PersonalFinancePage } from "./expenses-page";
import { loadLocalStore } from "@/lib/finance/account-client";

let root: Root | undefined;
let container: HTMLElement | undefined;
const NOW = new Date(2026, 9, 11, 12); // 11 October 2026: the current month is 2026-10
async function render(opts: { readOnly?: boolean; scenario?: boolean } = {}): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <PersonalFinancePage now={NOW} loadStore={loadLocalStore} readOnly={!!opts.readOnly} scenario={opts.scenario ? { render: () => null } : undefined} />,
    ),
  );
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  dom.window.localStorage.clear();
});
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
async function type(field: Element, value: string) {
  const el = field as HTMLSelectElement;
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`);
async function pick(el: ParentNode, key: string) {
  const [y, m] = key.split("-");
  if ((q(el, "pf-month-year") as HTMLSelectElement).value !== y) await type(q(el, "pf-month-year")!, y);
  if ((q(el, "pf-month") as HTMLSelectElement).value !== m) await type(q(el, "pf-month")!, m);
}
const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "" });
const person = (wages: string) => ({ id: "p1", name: "Me", wages, bonus: "", tax: "0", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" });
const ml = (rent: string, wages: string) => ({ fixed: [line("Rent", rent)], variable: [], people: [person(wages)] });
const seed = (months: Record<string, unknown>, plans?: Record<string, unknown>) => {
  dom.window.localStorage.setItem(MONTHS_KEY, JSON.stringify(months));
  if (plans) dom.window.localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
};
const plans = () => JSON.parse(dom.window.localStorage.getItem(PLANS_KEY) ?? "null");
const OCT_PLAN = { "2026-10": { lines: ml("1,000", "60,000"), capturedAt: "2026-09-30T12:00:00.000Z" } };

describe("#231 PFPV Planned vs actual (month view)", () => {
  it("PFPV-19: the current month with a plan shows totals and lines: actual − planned, % of plan, direction (Q2, Q4)", async () => {
    seed({ "2026-10": ml("1,200", "54,000") }, OCT_PLAN);
    const el = await render();
    assert.ok(q(el, "pf-plan"), "the table shows");
    const exp = q(el, "pf-plan-expenses")!;
    assert.match(exp.textContent!, /1,000\.00.*1,200\.00.*\+200\.00.*\+20\.0%.*Over plan · worse than plan/);
    assert.equal(exp.getAttribute("data-tone"), "worse");
    const inc = q(el, "pf-plan-income")!;
    assert.match(inc.textContent!, /5,000\.00.*4,500\.00.*-500\.00.*-10\.0%.*Under plan · worse than plan/);
    assert.match(q(el, "pf-plan-surplus")!.textContent!, /4,000\.00.*3,300\.00.*-700\.00/);
    assert.equal(el.querySelectorAll('[data-testid="pf-plan-line"]').length, 2);
    assert.match(q(el, "pf-plan-note")!.textContent!, /2026-09-30/);
  });
  it("PFPV-20: Read users see the same table, view only; nothing is written (Q3)", async () => {
    seed({ "2026-10": ml("900", "60,000"), "2026-12": ml("5", "60,000") }, OCT_PLAN);
    const el = await render({ readOnly: true });
    assert.match(q(el, "pf-plan-expenses")!.textContent!, /Under plan · better than plan/);
    assert.equal(el.querySelector("[data-testid=pf-plan] button, [data-testid=pf-plan] input"), null);
    assert.equal(plans()["2026-12"], undefined, "no backfill for a Read user");
  });
  it("PFPV-21: a future month, or a month without a plan, shows no table (Q4)", async () => {
    seed({ "2026-10": ml("1,000", "60,000"), "2026-11": ml("1,000", "60,000") }, { "2026-11": OCT_PLAN["2026-10"] });
    const el = await render();
    assert.equal(q(el, "pf-plan"), null, "October has no plan");
    await pick(el, "2026-11");
    assert.equal(q(el, "pf-plan"), null, "November is a future month");
    await pick(el, "2026-09");
    assert.equal(q(el, "pf-plan"), null);
  });
  it("PFPV-22: first load copies saved future months into absent plans (a writer); never the current month", async () => {
    seed({ "2026-10": ml("1", "60,000"), "2026-11": ml("2", "60,000") }, { "2026-12": OCT_PLAN["2026-10"] });
    await render();
    const p = plans();
    assert.deepEqual(Object.keys(p), ["2026-11", "2026-12"]);
    assert.equal(p["2026-11"].lines.fixed[0].amount, "2");
    assert.equal(p["2026-12"].lines.fixed[0].amount, "1,000");
  });
  it("PFPV-23: Save on a future month writes its plan; the current month gets none (Q1)", async () => {
    seed({ "2026-10": ml("1", "60,000") });
    const el = await render();
    assert.equal(plans(), null, "nothing planned for the current month on load");
    await pick(el, "2026-11"); // opens a copy of October: unsaved, Save shows
    await act(async () => (q(el, "pf-month-save") as HTMLButtonElement).click());
    assert.equal(plans()["2026-11"].lines.fixed[0].amount, "1");
    assert.equal(plans()["2026-10"], undefined);
  });
  it("PFPV-24: the scenario sandbox shows no table and writes no plan", async () => {
    seed({ "2026-10": ml("1,200", "54,000"), "2026-11": ml("2", "60,000") }, OCT_PLAN);
    const el = await render({ scenario: true });
    assert.equal(q(el, "pf-plan"), null);
    assert.deepEqual(Object.keys(plans()), ["2026-10"]);
  });
});
