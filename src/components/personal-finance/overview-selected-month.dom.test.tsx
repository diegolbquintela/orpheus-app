// #247 (personal-finance-spec §68, AC PFOS-01..08): Overview follows the selected month (past, current, future), live.
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
async function render(opts: { readOnly?: boolean } = {}): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<PersonalFinancePage now={NOW} loadStore={loadLocalStore} readOnly={!!opts.readOnly} />));
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
async function setValue(field: Element, value: string) {
  const el = field as HTMLInputElement;
  const proto = el.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event(el.tagName === "SELECT" ? "change" : "keyup", { bubbles: true }));
    el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`)!;
async function pick(el: ParentNode, key: string) {
  const [y, m] = key.split("-");
  const real = dom.window.confirm;
  dom.window.confirm = () => true;
  try {
    if ((q(el, "pf-month-year") as HTMLSelectElement).value !== y) await setValue(q(el, "pf-month-year"), y);
    if ((q(el, "pf-month") as HTMLSelectElement).value !== m) await setValue(q(el, "pf-month"), m);
  } finally {
    dom.window.confirm = real;
  }
}
const line = (id: string, amount: string) => ({ id, name: id, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "" });
const person = (wages: string) => ({ id: "p1", name: "Me", wages, bonus: "", tax: "0", share: "100", countWages: true, countBonus: false, foreign: false, currency: "", rate: "" });
const ml = (rent: string, wages: string) => ({ fixed: [line("Rent", rent)], variable: [], people: [person(wages)] });
const seed = (months: Record<string, unknown>) => dom.window.localStorage.setItem(MONTHS_KEY, JSON.stringify(months));
const now = (el: ParentNode, row: string) => q(q(el, `pf-ov-${row}`), "pf-ov-now").textContent;
const head = (el: ParentNode) => q(el, "pf-ov-now-head");
const SEED = { "2026-08": ml("700", "24,000"), "2026-10": ml("1,000", "36,000"), "2026-12": ml("2,000", "48,000") };

describe("#247 PFOS Overview follows the selected month", () => {
  it("PFOS-01: the current month: This month is October's own figures (unchanged)", async () => {
    seed(SEED);
    const el = await render();
    assert.equal(now(el, "expenses"), "1,000.00");
    assert.equal(now(el, "income"), "3,000.00");
    assert.equal(head(el).textContent, "This month");
    assert.equal(head(el).getAttribute("data-month"), "2026-10");
  });
  it("PFOS-02: a saved future month: the column is that month's figures, headed by its name", async () => {
    seed(SEED);
    const el = await render();
    await pick(el, "2026-12");
    assert.equal(now(el, "expenses"), "2,000.00");
    assert.equal(now(el, "income"), "4,000.00");
    assert.equal(now(el, "surplus"), "2,000.00");
    assert.equal(head(el).textContent, "December 2026");
    assert.equal(head(el).getAttribute("data-month"), "2026-12");
  });
  it("PFOS-03: a selected past month shows its own figures", async () => {
    seed(SEED);
    const el = await render();
    await pick(el, "2026-08");
    assert.equal(now(el, "expenses"), "700.00");
    assert.equal(now(el, "income"), "2,000.00");
    assert.equal(head(el).textContent, "August 2026");
  });
  it("PFOS-04: from page load through month switches, expense AND income edits, nothing is written until Save; Overview is live", async () => {
    seed(SEED);
    // The saved future month already has its plan (#231), so first load has no backfill write to make.
    dom.window.localStorage.setItem(PLANS_KEY, JSON.stringify({ "2026-12": { lines: SEED["2026-12"], capturedAt: "2026-10-01T12:00:00.000Z" } }));
    const before = { ...dom.window.localStorage };
    const writes: string[] = [];
    const real = dom.window.Storage.prototype.setItem;
    const realRemove = dom.window.Storage.prototype.removeItem;
    dom.window.Storage.prototype.setItem = function (k: string, v: string) {
      writes.push(`set ${k}`);
      return real.call(this, k, v);
    };
    dom.window.Storage.prototype.removeItem = function (k: string) {
      writes.push(`remove ${k}`);
      return realRemove.call(this, k);
    };
    try {
      const el = await render();
      assert.deepEqual([...writes], [], "page load writes nothing");
      await pick(el, "2026-08");
      await pick(el, "2026-12");
      assert.deepEqual([...writes], [], "month switches write nothing");
      await setValue(q(q(el, "pf-line"), "pf-monthly"), "2,500");
      assert.equal(now(el, "expenses"), "2,500.00");
      assert.equal(now(el, "surplus"), "1,500.00");
      await setValue(q(el, "pf-person-wages"), "60,000");
      assert.equal(now(el, "income"), "5,000.00");
      assert.equal(now(el, "surplus"), "2,500.00");
      assert.equal(q(el, "pf-unsaved").getAttribute("data-shown"), "true");
      assert.deepEqual([...writes], [], "expense and income edits write nothing");
      assert.deepEqual({ ...dom.window.localStorage }, before, "record unchanged before Save");
      await act(async () => (q(el, "pf-month-save") as HTMLElement).click());
      assert.ok(writes.includes(`set ${MONTHS_KEY}`), "Save writes (the spy works)");
      assert.equal(now(el, "expenses"), "2,500.00", "saved figures kept");
    } finally {
      dom.window.Storage.prototype.setItem = real;
      dom.window.Storage.prototype.removeItem = realRemove;
    }
  });
  it("PFOS-05: an empty future month shows its unsaved copy's figures, live", async () => {
    seed(SEED);
    const el = await render();
    await pick(el, "2027-02");
    assert.equal(now(el, "expenses"), "2,000.00", "the copy of December");
    await setValue(q(q(el, "pf-line"), "pf-monthly"), "3,000");
    assert.equal(now(el, "expenses"), "3,000.00");
    assert.equal(head(el).textContent, "February 2027");
  });
  it("PFOS-06: switching months follows the selection each time (and back to the current month)", async () => {
    seed(SEED);
    const el = await render();
    await pick(el, "2026-12");
    assert.equal(now(el, "expenses"), "2,000.00");
    await pick(el, "2026-08");
    assert.equal(now(el, "expenses"), "700.00");
    await pick(el, "2026-10");
    assert.equal(now(el, "expenses"), "1,000.00");
    assert.equal(head(el).textContent, "This month");
  });
  it("PFOS-07: averages and the chart stay on complete months (a future month never counts)", async () => {
    seed(SEED);
    const el = await render();
    const avg = q(q(el, "pf-ov-expenses"), "pf-ov-avg").textContent;
    const avg3 = q(q(el, "pf-ov-expenses"), "pf-ov-avg3").textContent;
    await pick(el, "2026-12");
    assert.equal(q(q(el, "pf-ov-expenses"), "pf-ov-avg").textContent, avg);
    assert.equal(q(q(el, "pf-ov-expenses"), "pf-ov-avg3").textContent, avg3);
  });
  it("PFOS-08: Read users get the selected month's saved figures too", async () => {
    seed(SEED);
    const el = await render({ readOnly: true });
    await pick(el, "2026-12");
    assert.equal(now(el, "expenses"), "2,000.00");
    assert.equal(head(el).textContent, "December 2026");
  });
});
