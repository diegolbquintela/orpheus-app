// Personal finance page (#84, spec attachments/personal-finance-spec.md; PF-02..07) in jsdom with the real component.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { STORAGE_KEY } from "@/lib/finance/expenses";
import { PersonalFinancePage } from "./expenses-page";

let root: Root | undefined;
let container: HTMLElement | undefined;

async function render(): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<PersonalFinancePage />));
  return container;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  dom.window.localStorage.clear();
});

// React DOM's old-browser input fallback in this bundle (see calculator.dom.test.tsx): focusin, set, keyup.
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
async function type(field: Element, value: string) {
  const el = field as HTMLInputElement | HTMLSelectElement;
  const select = el.tagName === "SELECT";
  const proto = select
    ? dom.window.HTMLSelectElement.prototype
    : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event(select ? "change" : "keyup", { bubbles: true }));
    el.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}
async function click(el: Element) {
  await act(async () => (el as HTMLElement).click());
}
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`)!;
const qa = (el: ParentNode, id: string) => [...el.querySelectorAll(`[data-testid="${id}"]`)];
const text = (el: ParentNode, id: string) => q(el, id).textContent;
const lines = (el: HTMLElement, group: string) => qa(q(el, `pf-group-${group}`), "pf-line");

describe("personal finance page (#84)", () => {
  it("exact copy: title, section, groups, column labels, add buttons, totals (PF-02)", async () => {
    const el = await render();
    assert.equal(el.querySelector("h1")!.textContent, "Personal finance.");
    assert.deepEqual(
      [...el.querySelectorAll("h2, h3")].map((h) => h.textContent),
      ["Expenses", "Fixed", "Variable"],
    );
    for (const head of qa(el, "pf-head"))
      assert.deepEqual(
        [...head.children].map((c) => c.textContent),
        ["Name", "% of income", "% of expenses", "Monthly", "Yearly", "Equity to cover", "Account"],
      );
    assert.deepEqual(
      [...el.querySelectorAll("button")].map((b) => b.textContent),
      ["↳ Add expense", "↳ Add expense"],
    );
    assert.deepEqual(
      qa(el, "pf-total-all")
        .concat(qa(el, "pf-total-fixed"), qa(el, "pf-total-variable"))
        .map((r) => r.querySelector(".pf-total-label")!.textContent),
      ["Total", "Fixed total", "Variable total"],
    );
    assert.equal(text(q(el, "pf-total-all"), "pf-total-share"), "—");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-monthly"), "0");
    assert.equal(
      dom.window.localStorage.getItem(STORAGE_KEY),
      null,
      "nothing written until a change",
    );
  });

  it("the spec example: lines, conversion, shares, totals, % of income — (PF-03..05)", async () => {
    const el = await render();
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-variable"));
    const [rent, phone] = lines(el, "fixed");
    const [gifts] = lines(el, "variable");
    await type(q(rent, "pf-name"), "Rent");
    await type(q(rent, "pf-monthly"), "1,000");
    await type(q(phone, "pf-monthly"), "250");
    await type(q(gifts, "pf-yearly"), "1,200");
    await type(q(rent, "pf-equity"), "300,000");
    assert.equal(
      (q(rent, "pf-monthly") as HTMLInputElement).value,
      "1,000",
      "typed stays as typed",
    );
    assert.equal((q(rent, "pf-yearly") as HTMLInputElement).value, "12,000");
    assert.equal((q(gifts, "pf-monthly") as HTMLInputElement).value, "100");
    assert.equal(text(rent, "pf-share"), "74.1%");
    assert.equal(text(gifts, "pf-share"), "7.4%");
    for (const l of [rent, phone, gifts]) assert.equal(text(l, "pf-income"), "—");
    const totals = (id: string) =>
      ["share", "income", "monthly", "yearly", "equity"].map((f) =>
        text(q(el, `pf-total-${id}`), `pf-total-${f}`),
      );
    assert.deepEqual(totals("fixed"), ["92.6%", "—", "1,250", "15,000", "300,000"]);
    assert.deepEqual(totals("variable"), ["7.4%", "—", "100", "1,200", "0"]);
    assert.deepEqual(totals("all"), ["100.0%", "—", "1,350", "16,200", "300,000"]);
    // A bad amount: the field check, and the line counts as 0.
    await type(q(phone, "pf-monthly"), "abc");
    assert.equal(q(phone, "pf-error").textContent, "Enter a number, 0 or more.");
    assert.equal(q(phone, "pf-monthly").getAttribute("aria-invalid"), "true");
    assert.deepEqual(totals("all").slice(2, 4), ["1,100", "13,200"]);
    // Remove.
    await click(q(phone, "pf-remove"));
    assert.equal(lines(el, "fixed").length, 1);
    assert.equal(q(phone, "pf-remove").getAttribute("aria-label"), "Remove expense");
  });

  it("accounts: add inline, shared by both groups, reuse any case, empty refused (PF-06)", async () => {
    const el = await render();
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-variable"));
    const [a] = lines(el, "fixed");
    const options = (line: Element) =>
      [...(q(line, "pf-account") as HTMLSelectElement).options].map((o) => o.text);
    assert.deepEqual(options(a), ["—", "Add account…"]);
    await type(q(a, "pf-account"), "__add-account__");
    assert.equal(q(a, "pf-new-account").querySelector(".pf-label")!.textContent, "New account");
    await click(q(a, "pf-new-account-add"));
    assert.equal(q(a, "pf-error").textContent, "Name the account.");
    await type(q(a, "pf-new-account-input"), " Chequing ");
    await click(q(a, "pf-new-account-add"));
    assert.equal(qa(el, "pf-new-account").length, 0);
    assert.equal((q(a, "pf-account") as HTMLSelectElement).value, "Chequing");
    const [b] = lines(el, "variable");
    assert.deepEqual(options(b), ["—", "Chequing", "Add account…"]);
    await type(q(b, "pf-account"), "__add-account__");
    await type(q(b, "pf-new-account-input"), "chequing");
    await click(q(b, "pf-new-account-add"));
    assert.equal((q(b, "pf-account") as HTMLSelectElement).value, "Chequing");
    assert.deepEqual(options(b), ["—", "Chequing", "Add account…"]);
    await type(q(b, "pf-account"), "__add-account__");
    await click(q(b, "pf-new-account-cancel"));
    assert.equal(qa(el, "pf-new-account").length, 0);
  });

  it("everything survives a reload from the one localStorage key (PF-07)", async () => {
    const el = await render();
    await click(q(el, "pf-add-variable"));
    const [l] = lines(el, "variable");
    await type(q(l, "pf-name"), "Gifts");
    await type(q(l, "pf-yearly"), "1,200");
    await type(q(l, "pf-account"), "__add-account__");
    await type(q(l, "pf-new-account-input"), "Visa");
    await click(q(l, "pf-new-account-add"));
    const stored = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)!);
    assert.deepEqual(Object.keys(dom.window.localStorage), [STORAGE_KEY]);
    assert.deepEqual(stored.accounts, ["Visa"]);
    assert.deepEqual(
      { ...stored.variable[0], id: "" },
      { id: "", name: "Gifts", amount: "1,200", per: "year", equity: "", account: "Visa" },
    );
    await act(async () => root!.unmount());
    container!.remove();
    const again = await render();
    const [r] = lines(again, "variable");
    assert.equal((q(r, "pf-name") as HTMLInputElement).value, "Gifts");
    assert.equal((q(r, "pf-yearly") as HTMLInputElement).value, "1,200");
    assert.equal((q(r, "pf-account") as HTMLSelectElement).value, "Visa");
  });

  it("a malformed stored value shows the empty page", async () => {
    dom.window.localStorage.setItem(STORAGE_KEY, "{not json");
    const el = await render();
    assert.equal(qa(el, "pf-line").length, 0);
    assert.equal(q(el, "pf-area").getAttribute("data-ready"), "true");
  });
});
