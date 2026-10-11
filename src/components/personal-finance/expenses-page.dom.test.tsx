// Personal finance page (#84–#87, #94; spec attachments/personal-finance-spec.md; PF-02..07, PF-11..31) in jsdom with the real component.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { STORAGE_KEY } from "@/lib/finance/expenses";
import { INCOME_KEY } from "@/lib/finance/income";
import { EQUITY_KEY } from "@/lib/finance/equity";
import { CURRENCY_KEY } from "@/lib/finance/currency";
import { OVERVIEW_KEY } from "@/lib/finance/overview";
import { PersonalFinancePage } from "./expenses-page";
import { loadLocalStore } from "@/lib/finance/account-client";

let root: Root | undefined;
let container: HTMLElement | undefined;

// #94: a fixed "today" (11 October 2026, local) so the 12 months are known.
const NOW = new Date(2026, 9, 11, 12);
async function render(): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<PersonalFinancePage now={NOW} loadStore={loadLocalStore} />));
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
      ["Income", "Income table", "Expenses", "Fixed", "Variable", "Overview", "Update"],
    );
    for (const head of qa(el, "pf-head"))
      assert.deepEqual(
        [...head.children].map((c) => c.textContent),
        [
          "Name",
          "% of income",
          "% of expenses",
          "Monthly",
          "Yearly",
          "Currency",
          "FX rate",
          "Equity to cover",
          "Account",
        ],
      );
    assert.deepEqual(
      [...el.querySelectorAll("button")].map((b) => b.textContent),
      ["↳ Add person", "↳ Add expense", "↳ Add expense", "Future"],
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
    // No rate (#86, Q10): Phone and Gifts have no override, so their totals show —.
    assert.deepEqual(totals("fixed"), ["92.6%", "—", "1,250", "15,000", "—"]);
    assert.deepEqual(totals("variable"), ["7.4%", "—", "100", "1,200", "—"]);
    assert.deepEqual(totals("all"), ["100.0%", "—", "1,350", "16,200", "—"]);
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
      {
        id: "",
        name: "Gifts",
        amount: "1,200",
        per: "year",
        equity: "",
        account: "Visa",
        currency: "",
        rate: "",
      },
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

describe("income block (#85)", () => {
  const people = (el: HTMLElement) => qa(el, "pf-person");
  const table = (el: HTMLElement) =>
    qa(el, "pf-income-line")
      .concat(qa(el, "pf-net-income"))
      .map((r) => [
        r.querySelector('[data-testid="pf-income-label"]')!.textContent,
        text(r, "pf-income-biweekly"),
        text(r, "pf-income-monthly"),
        text(r, "pf-income-yearly"),
      ]);
  async function check(field: Element, on: boolean) {
    const box = field as HTMLInputElement;
    if (box.checked !== on) await click(box);
  }

  it("copy: Income, the person columns, Add person, the table with only Net income at 0 (PF-11)", async () => {
    const el = await render();
    assert.deepEqual(
      [...q(el, "pf-person-head").children].map((c) => c.textContent),
      [
        "Name",
        "Wages (yearly)",
        "Bonus rating (%)",
        "Average tax (%)",
        "Net (yearly)",
        "Count wages",
        "Count bonus",
        "Share (%)",
        "Foreign",
      ],
    );
    assert.deepEqual(
      [...q(el, "pf-table-head").children].map((c) => c.textContent),
      ["Income", "Biweekly", "Monthly", "Yearly"],
    );
    assert.deepEqual(table(el), [["Net income", "0", "0", "0"]]);
    assert.equal(
      [...el.querySelectorAll(".pf-label")]
        .filter((l) => /^0[1-3]$/.test(l.textContent!))
        .map((l) => l.textContent)
        .join(" "),
      "01 02 03",
    );
    assert.equal(dom.window.localStorage.getItem(INCOME_KEY), null);
  });

  it("the spec example: net, counted + share, table, % of income wired (PF-12..16)", async () => {
    const el = await render();
    await click(q(el, "pf-add-person"));
    await click(q(el, "pf-add-person"));
    const [me, spouse] = people(el);
    assert.equal((q(me, "pf-person-share") as HTMLInputElement).value, "100");
    assert.equal((q(me, "pf-person-count-wages") as HTMLInputElement).checked, true);
    await type(q(me, "pf-person-name"), "Me");
    await type(q(me, "pf-person-wages"), "120,000");
    await type(q(me, "pf-person-bonus"), "10");
    await type(q(me, "pf-person-tax"), "30");
    await check(q(me, "pf-person-count-bonus"), false);
    await type(q(spouse, "pf-person-name"), "Spouse");
    await type(q(spouse, "pf-person-wages"), "80,000");
    await type(q(spouse, "pf-person-bonus"), "5");
    await type(q(spouse, "pf-person-tax"), "25");
    await type(q(spouse, "pf-person-share"), "80");
    assert.deepEqual(
      [text(me, "pf-person-net"), text(spouse, "pf-person-net")],
      ["92,400", "63,000"],
    );
    assert.deepEqual(table(el), [
      ["Me · Wages", "3,230.77", "7,000", "84,000"],
      ["Me · Bonus", "0", "0", "0"],
      ["Spouse · Wages", "1,846.15", "4,000", "48,000"],
      ["Spouse · Bonus", "92.31", "200", "2,400"],
      ["Net income", "5,169.23", "11,200", "134,400"],
    ]);
    // Expenses: % of income against 11,200 a month.
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-variable"));
    const [rent, phone] = lines(el, "fixed");
    const [gifts] = lines(el, "variable");
    await type(q(rent, "pf-monthly"), "1,000");
    await type(q(phone, "pf-monthly"), "250");
    await type(q(gifts, "pf-yearly"), "1,200");
    assert.deepEqual(
      [text(rent, "pf-income"), text(phone, "pf-income"), text(gifts, "pf-income")],
      ["8.9%", "2.2%", "0.9%"],
    );
    assert.deepEqual(
      ["fixed", "variable", "all"].map((g) => text(q(el, `pf-total-${g}`), "pf-total-income")),
      ["11.2%", "0.9%", "12.1%"],
    );
    // Untick everything: no counted income → —.
    await check(q(me, "pf-person-count-wages"), false);
    await check(q(spouse, "pf-person-count-wages"), false);
    await check(q(spouse, "pf-person-count-bonus"), false);
    assert.equal(text(rent, "pf-income"), "—");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-income"), "—");
    // Field checks.
    await type(q(spouse, "pf-person-share"), "120");
    assert.equal(q(spouse, "pf-error").textContent, "Enter a percent from 0 to 100.");
    await type(q(spouse, "pf-person-share"), "80");
    await type(q(spouse, "pf-person-wages"), "lots");
    assert.equal(q(spouse, "pf-error").textContent, "Enter a number, 0 or more.");
    // Storage and reload.
    const stored = JSON.parse(dom.window.localStorage.getItem(INCOME_KEY)!);
    assert.deepEqual(
      { ...stored.people[0], id: "" },
      {
        id: "",
        name: "Me",
        wages: "120,000",
        bonus: "10",
        tax: "30",
        share: "100",
        countWages: false,
        countBonus: false,
        foreign: false,
        currency: "",
        rate: "",
      },
    );
    assert.deepEqual(Object.keys(dom.window.localStorage).sort(), [INCOME_KEY, STORAGE_KEY].sort());
    await act(async () => root!.unmount());
    container!.remove();
    const again = await render();
    assert.equal((q(people(again)[1], "pf-person-wages") as HTMLInputElement).value, "lots");
    assert.equal((q(people(again)[0], "pf-person-count-wages") as HTMLInputElement).checked, false);
    // Remove a person.
    await click(q(people(again)[1], "pf-remove-person"));
    assert.equal(people(again).length, 1);
    assert.equal(
      q(people(again)[0], "pf-remove-person").getAttribute("aria-label"),
      "Remove person",
    );
  });

  it("a malformed income value shows no people", async () => {
    dom.window.localStorage.setItem(INCOME_KEY, "{oops");
    const el = await render();
    assert.equal(people(el).length, 0);
    assert.equal(q(el, "pf-area").getAttribute("data-ready"), "true");
  });
});

describe("equity cover (#86, option A)", () => {
  const totals = (el: HTMLElement) =>
    ["fixed", "variable", "all"].map((g) => text(q(el, `pf-total-${g}`), "pf-total-equity"));
  const holders = (el: HTMLElement) =>
    qa(el, "pf-equity").map((f) => (f as HTMLInputElement).placeholder);

  it("copy: the two rate fields with visible labels and Rate used — before Fixed (PF-17)", async () => {
    const el = await render();
    const rates = q(el, "pf-rates");
    assert.deepEqual(
      [...rates.querySelectorAll(".pf-label")].map((l) => l.textContent),
      ["Withdrawal rate (%)", "Portfolio ROIC (%)", "Rate used"],
    );
    for (const id of ["pf-withdrawal", "pf-roic"]) {
      const input = q(rates, id) as HTMLInputElement;
      assert.equal(input.value, "");
      assert.equal(
        input.labels?.[0]?.textContent,
        id === "pf-withdrawal" ? "Withdrawal rate (%)" : "Portfolio ROIC (%)",
      );
    }
    assert.equal(text(rates, "pf-rate-used"), "—");
    assert.ok(
      rates.compareDocumentPosition(q(el, "pf-group-fixed")) &
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      "the rates sit before Fixed",
    );
    assert.equal(dom.window.localStorage.getItem(EQUITY_KEY), null);
  });

  it("formula A, the override, totals, storage and reload (PF-18..20)", async () => {
    const el = await render();
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-variable"));
    const [rent, phone] = lines(el, "fixed");
    const [gifts] = lines(el, "variable");
    await type(q(rent, "pf-monthly"), "1,000");
    await type(q(phone, "pf-monthly"), "250");
    await type(q(gifts, "pf-yearly"), "1,200");
    assert.deepEqual(holders(el), ["—", "—", "—"], "no rate: —");
    assert.deepEqual(totals(el), ["—", "—", "—"], "Q10: no rate → — in every total");
    // ROIC 8 → 4%: Rent 1,000 a month → 300,000.
    await type(q(el, "pf-roic"), "8");
    assert.equal(text(el, "pf-rate-used"), "4%");
    assert.deepEqual(holders(el), ["300,000", "75,000", "30,000"]);
    assert.deepEqual(totals(el), ["375,000", "30,000", "405,000"]);
    // Withdrawal rate 5 wins, used as typed.
    await type(q(el, "pf-withdrawal"), "5");
    assert.equal(text(el, "pf-rate-used"), "5%");
    assert.deepEqual(holders(el), ["240,000", "60,000", "24,000"]);
    // A typed 4 is 4% (never halved).
    await type(q(el, "pf-withdrawal"), "4");
    assert.equal(text(el, "pf-rate-used"), "4%");
    assert.equal(holders(el)[0], "300,000");
    // 0 → —; a bad rate → the check and —.
    await type(q(el, "pf-withdrawal"), "0");
    assert.equal(text(el, "pf-rate-used"), "—");
    assert.deepEqual(holders(el), ["—", "—", "—"]);
    await type(q(el, "pf-withdrawal"), "150");
    assert.equal(q(q(el, "pf-rates"), "pf-error").textContent, "Enter a percent from 0 to 100.");
    assert.equal(q(el, "pf-withdrawal").getAttribute("aria-invalid"), "true");
    assert.equal(text(el, "pf-rate-used"), "—");
    // Empty withdrawal → ROIC ÷ 2. Q11: ROIC above 100 is valid; negative is not.
    await type(q(el, "pf-withdrawal"), "");
    await type(q(el, "pf-roic"), "150");
    assert.equal(text(el, "pf-rate-used"), "75%");
    assert.equal(qa(q(el, "pf-rates"), "pf-error").length, 0);
    await type(q(el, "pf-roic"), "-8");
    assert.equal(q(q(el, "pf-rates"), "pf-error").textContent, "Enter a number, 0 or more.");
    assert.equal(text(el, "pf-rate-used"), "—");
    await type(q(el, "pf-roic"), "8");
    assert.equal(text(el, "pf-rate-used"), "4%");
    // Override (Q3): Rent typed 250,000 wins on its line only.
    await type(q(rent, "pf-equity"), "250,000");
    assert.equal((q(rent, "pf-equity") as HTMLInputElement).value, "250,000");
    assert.deepEqual(totals(el), ["325,000", "30,000", "355,000"]);
    await type(q(rent, "pf-equity"), "");
    assert.deepEqual(totals(el), ["375,000", "30,000", "405,000"], "cleared: calculated again");
    await type(q(rent, "pf-equity"), "abc");
    assert.equal(q(rent, "pf-error").textContent, "Enter a number, 0 or more.");
    assert.deepEqual(totals(el), ["375,000", "30,000", "405,000"], "Q9: a bad override falls back");
    await type(q(rent, "pf-equity"), "250,000");
    // Storage: three keys; the rates as typed.
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(EQUITY_KEY)!), {
      withdrawal: "",
      roic: "8",
    });
    assert.deepEqual(
      Object.keys(dom.window.localStorage).sort(),
      [EQUITY_KEY, STORAGE_KEY].sort(),
      "income untouched: not written",
    );
    await act(async () => root!.unmount());
    container!.remove();
    const again = await render();
    assert.equal((q(again, "pf-roic") as HTMLInputElement).value, "8");
    assert.equal(text(again, "pf-rate-used"), "4%");
    assert.deepEqual(totals(again), ["325,000", "30,000", "355,000"]);
  });

  it("a v1.1 / v1.2 line with a typed amount restores as an override; malformed rates read as empty", async () => {
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fixed: [
          { id: "r", name: "Rent", amount: "1,000", per: "month", equity: "10,000", account: "" },
        ],
        variable: [],
        accounts: [],
      }),
    );
    dom.window.localStorage.setItem(EQUITY_KEY, "{broken");
    const el = await render();
    const [rent] = lines(el, "fixed");
    assert.equal((q(rent, "pf-equity") as HTMLInputElement).value, "10,000");
    assert.equal(text(el, "pf-rate-used"), "—");
    await type(q(el, "pf-roic"), "8");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-equity"), "10,000", "the override stays");
    assert.equal((q(rent, "pf-equity") as HTMLInputElement).placeholder, "300,000");
  });

  it("currency copy: Household currency CAD (Q13) above Income; a line's Currency and FX rate — (PF-21)", async () => {
    const el = await render();
    const household = q(el, "pf-household") as HTMLSelectElement;
    assert.equal(household.value, "CAD");
    assert.deepEqual(
      [...household.options].map((o) => o.textContent),
      ["USD", "CAD", "EUR", "GBP", "BRL", "MXN", "CHF", "JPY", "AUD", "CNY"],
    );
    assert.equal(
      q(el, "pf-household-cell").querySelector("label")!.textContent,
      "Household currency",
    );
    const income = el.querySelector("h2")!;
    assert.equal(income.textContent, "Income");
    assert.ok(
      q(el, "pf-household-cell").compareDocumentPosition(income) &
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      "above 02 Income",
    );
    await click(q(el, "pf-add-fixed"));
    const [line] = lines(el, "fixed");
    const currency = q(line, "pf-currency") as HTMLSelectElement;
    assert.equal(currency.value, "CAD");
    assert.deepEqual(
      [...currency.options].map((o) => o.textContent),
      ["CAD", "USD", "EUR", "GBP", "BRL", "MXN", "CHF", "JPY", "AUD", "CNY"],
    );
    assert.equal(currency.getAttribute("aria-label"), "Currency, Fixed 1");
    assert.equal(text(line, "pf-fx-none"), "—");
    assert.equal(line.querySelector('[data-testid="pf-fx"]'), null);
    await type(household, "BRL");
    assert.deepEqual(
      [...(q(line, "pf-currency") as HTMLSelectElement).options].map((o) => o.textContent),
      ["BRL", "USD", "CAD", "EUR", "GBP", "MXN", "CHF", "JPY", "AUD", "CNY"],
    );
  });

  it("the section 14 example: conversion into the household currency, equity, no rate → —, storage (PF-22..25)", async () => {
    const el = await render();
    for (const g of ["fixed", "fixed", "fixed", "variable"]) await click(q(el, `pf-add-${g}`));
    const [rent, phone, condo] = lines(el, "fixed");
    const [gifts] = lines(el, "variable");
    await type(q(rent, "pf-monthly"), "1,000");
    await type(q(phone, "pf-monthly"), "250");
    await type(q(condo, "pf-name"), "Condo");
    await type(q(condo, "pf-monthly"), "2,000");
    await type(q(gifts, "pf-yearly"), "1,200");
    await type(q(condo, "pf-currency"), "BRL");
    // No rate yet (Q14, decided): the check, and the line contributes — to every household figure.
    const fx = q(condo, "pf-fx") as HTMLInputElement;
    assert.equal(fx.getAttribute("aria-label"), "FX rate (BRL per 1 CAD), Fixed 3");
    assert.equal(fx.getAttribute("aria-invalid"), "true");
    assert.equal(
      condo.querySelector('[data-field="rate"]')!.textContent,
      "Enter a number above 0.",
    );
    const totals = (row: string) =>
      ["pf-total-monthly", "pf-total-yearly"].map((f) => text(q(el, `pf-total-${row}`), f));
    const dashes = () => ({
      fixed: totals("fixed"),
      variable: totals("variable"),
      all: totals("all"),
      shares: [text(rent, "pf-share"), text(condo, "pf-share"), text(condo, "pf-income")],
      condo: [
        (q(condo, "pf-monthly") as HTMLInputElement).value,
        (q(condo, "pf-yearly") as HTMLInputElement).value,
      ],
    });
    const want = {
      fixed: ["—", "—"],
      variable: ["100", "1,200"],
      all: ["—", "—"],
      shares: ["—", "—", "—"],
      condo: ["2,000", "24,000"],
    };
    assert.deepEqual(dashes(), want);
    for (const bad of ["abc", "-1", "0"]) {
      await type(fx, bad);
      assert.equal(fx.getAttribute("aria-invalid"), "true", bad);
      assert.deepEqual(dashes(), want, bad);
    }
    await type(q(el, "pf-roic"), "8");
    assert.equal((q(condo, "pf-equity") as HTMLInputElement).placeholder, "—");
    assert.equal(text(q(el, "pf-total-fixed"), "pf-total-equity"), "—");
    assert.equal(text(q(el, "pf-total-variable"), "pf-total-equity"), "30,000");
    await type(q(el, "pf-roic"), "");
    await type(fx, "5");
    assert.equal(fx.getAttribute("aria-invalid"), null);
    // The line keeps its own currency; every figure is in CAD.
    assert.equal((q(condo, "pf-monthly") as HTMLInputElement).value, "2,000");
    assert.equal((q(condo, "pf-yearly") as HTMLInputElement).value, "24,000");
    assert.deepEqual(totals("fixed"), ["1,650", "19,800"]);
    assert.deepEqual(totals("variable"), ["100", "1,200"]);
    assert.deepEqual(totals("all"), ["1,750", "21,000"]);
    assert.equal(text(condo, "pf-share"), "22.9%");
    // Equity cover: ROIC 8 → 4%; Condo 4,800 ÷ 0.04.
    await type(q(el, "pf-roic"), "8");
    assert.equal((q(condo, "pf-equity") as HTMLInputElement).placeholder, "120,000");
    const equity = (row: string) => text(q(el, `pf-total-${row}`), "pf-total-equity");
    assert.deepEqual(
      [equity("fixed"), equity("variable"), equity("all")],
      ["495,000", "30,000", "525,000"],
    );
    await type(q(condo, "pf-equity"), "100,000");
    assert.equal(equity("fixed"), "475,000");
    // Storage: the household key and the line's currency / rate.
    assert.equal(
      dom.window.localStorage.getItem(CURRENCY_KEY),
      null,
      "household untouched: not written",
    );
    const stored = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)!);
    assert.deepEqual([stored.fixed[2].currency, stored.fixed[2].rate], ["BRL", "5"]);
    await type(q(el, "pf-household"), "USD");
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(CURRENCY_KEY)!), {
      household: "USD",
    });
    await act(async () => root!.unmount());
    container!.remove();
    const again = await render();
    assert.equal((q(again, "pf-household") as HTMLSelectElement).value, "USD");
    const condo2 = lines(again, "fixed")[2];
    assert.equal((q(condo2, "pf-currency") as HTMLSelectElement).value, "BRL");
    assert.equal((q(condo2, "pf-fx") as HTMLInputElement).value, "5");
    // Making BRL the household currency turns Condo into a household line (× 1); its rate stays stored.
    await type(q(again, "pf-household"), "BRL");
    assert.equal(text(condo2, "pf-fx-none"), "—");
    assert.deepEqual(
      ["pf-total-monthly", "pf-total-yearly"].map((f) => text(q(again, "pf-total-fixed"), f)),
      ["3,250", "39,000"],
    );
    assert.equal(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)!).fixed[2].rate, "5");
  });

  it("a v1.3 stored line restores as a household line; a malformed currency key reads as CAD (PF-25)", async () => {
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fixed: [{ id: "r", name: "Rent", amount: "1,000", per: "month", equity: "", account: "" }],
        variable: [],
        accounts: [],
      }),
    );
    dom.window.localStorage.setItem(CURRENCY_KEY, '{"household":"XYZ"}');
    const el = await render();
    assert.equal((q(el, "pf-household") as HTMLSelectElement).value, "CAD");
    const [rent] = lines(el, "fixed");
    assert.equal((q(rent, "pf-currency") as HTMLSelectElement).value, "CAD");
    assert.equal(text(rent, "pf-fx-none"), "—");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-monthly"), "1,000");
  });
});

describe("Overview and Update (#94, PF-26..31)", () => {
  const ov = (el: HTMLElement, row: string) =>
    [q(el, `pf-ov-${row}`)].map((r) => [text(r, "pf-ov-now"), text(r, "pf-ov-avg")])[0];

  it("copy and a new page: all —, Future off, 12 months newest first (PF-26, PF-28)", async () => {
    const el = await render();
    const table = q(el, "pf-ov-table");
    assert.deepEqual(
      [...table.querySelectorAll("[role=columnheader]")].map((c) => c.textContent),
      ["Overview", "This month", "12-month average"],
    );
    assert.deepEqual(
      [...table.querySelectorAll("[role=rowheader]")].map((c) => c.textContent),
      ["Expenses", "Income", "Surplus"],
    );
    for (const row of ["expenses", "income", "surplus"]) assert.deepEqual(ov(el, row), ["—", "—"]);
    assert.deepEqual(
      [...q(el, "pf-overview").querySelectorAll("label")].map((l) => l.textContent),
      ["Starting net assets", "Growth rate (%)"],
    );
    assert.equal(q(el, "pf-future-toggle").getAttribute("aria-pressed"), "false");
    assert.equal(qa(el, "pf-year").length, 0);
    assert.deepEqual(
      [...q(el, "pf-legend").children].map((c) => c.textContent),
      ["Expenses", "Income", "Net assets"],
    );
    assert.equal(
      q(el, "pf-chart").querySelector(".pf-chart-plot")!.getAttribute("aria-hidden"),
      "true",
    );
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "12");
    assert.deepEqual(
      [...q(el, "pf-update").querySelectorAll("label")].map((l) => l.textContent),
      ["Month", "Expenses", "Income"],
    );
    const options = [...(q(el, "pf-month") as HTMLSelectElement).options].map((o) => o.textContent);
    assert.equal(options.length, 12);
    assert.equal(options[0], "October 2026");
    assert.equal(options[4], "June 2026");
    assert.equal(options[11], "November 2025");
    assert.equal((q(el, "pf-month") as HTMLSelectElement).value, "2026-10");
    assert.equal(
      dom.window.localStorage.getItem(OVERVIEW_KEY),
      null,
      "nothing written until a change",
    );
  });

  it("the page figures, a typed past month updates the average, net assets, Future (PF-27, PF-29, PF-30)", async () => {
    const el = await render();
    // The page: one 1,750 monthly expense, one person netting 11,200 a month (134,400 a year, no tax).
    await click(q(el, "pf-add-fixed"));
    await type(lines(el, "fixed")[0].querySelector('[data-testid="pf-monthly"]')!, "1,750");
    await click(q(el, "pf-add-person"));
    await type(q(el, "pf-person-wages"), "134,400");
    assert.deepEqual(ov(el, "expenses"), ["1,750", "1,750"]);
    assert.deepEqual(ov(el, "income"), ["11,200", "11,200"]);
    // Current month: placeholders are the page figures.
    assert.equal(q(el, "pf-month-expenses").getAttribute("placeholder"), "1,750");
    await type(q(el, "pf-month"), "2026-06");
    assert.equal(
      q(el, "pf-month-expenses").getAttribute("placeholder"),
      "1,750",
      "a past month: the average",
    );
    await type(q(el, "pf-month-expenses"), "4,000");
    await type(q(el, "pf-month-income"), "9,000");
    assert.deepEqual(ov(el, "expenses"), ["1,750", "2,875"]);
    assert.deepEqual(ov(el, "income"), ["11,200", "10,100"]);
    assert.deepEqual(ov(el, "surplus"), ["9,450", "7,225"]);
    await type(q(el, "pf-start"), "10,000");
    assert.equal(q(el, "pf-chart").getAttribute("data-net-last"), "96700.00");
    // Future.
    await type(q(el, "pf-growth"), "5");
    await click(q(el, "pf-future-toggle"));
    assert.equal(q(el, "pf-future-toggle").getAttribute("aria-pressed"), "true");
    assert.deepEqual(
      qa(el, "pf-year").map((b) => [b.textContent, b.getAttribute("aria-pressed")]),
      [
        ["1 year", "true"],
        ["5 years", "false"],
        ["10 years", "false"],
        ["15 years", "false"],
      ],
    );
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "24");
    assert.equal(q(el, "pf-chart").getAttribute("data-net-last"), "190204.37");
    await click(qa(el, "pf-year")[1]);
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "72");
    assert.equal(q(el, "pf-chart").getAttribute("data-net-last"), "613370.68");
    // A bad growth rate: the check, counts as 0.
    await type(q(el, "pf-growth"), "five");
    assert.equal(text(q(el, "pf-overview"), "pf-error"), "Enter a number, 0 or more.");
    assert.equal(
      q(el, "pf-chart").getAttribute("data-net-last"),
      String((96700 + 60 * 7225).toFixed(2)),
    );
    // A typed current month replaces the page; clearing June empties it.
    await type(q(el, "pf-month"), "2026-10");
    await type(q(el, "pf-month-expenses"), "2,000");
    assert.deepEqual(ov(el, "expenses"), ["2,000", "3,000"]);
    await type(q(el, "pf-month"), "2026-06");
    assert.equal((q(el, "pf-month-expenses") as HTMLInputElement).value, "4,000");
    await type(q(el, "pf-month-expenses"), "");
    await type(q(el, "pf-month-income"), "");
    assert.deepEqual(ov(el, "expenses"), ["2,000", "2,000"]);
    // Off again: the chart ends at the current month.
    await click(q(el, "pf-future-toggle"));
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "12");
  });

  it("everything survives a reload from orpheus.finance.overview.v1 (PF-31)", async () => {
    let el = await render();
    await type(q(el, "pf-start"), "10,000");
    await type(q(el, "pf-growth"), "5");
    await click(q(el, "pf-future-toggle"));
    await click(qa(el, "pf-year")[2]);
    await type(q(el, "pf-month"), "2026-06");
    await type(q(el, "pf-month-expenses"), "4,000");
    const saved = JSON.parse(dom.window.localStorage.getItem(OVERVIEW_KEY)!);
    assert.deepEqual(saved, {
      start: "10,000",
      growth: "5",
      future: true,
      years: 10,
      months: { "2026-06": { expenses: "4,000", income: "" } },
    });
    await act(async () => root!.unmount());
    container!.remove();
    el = await render();
    assert.equal((q(el, "pf-start") as HTMLInputElement).value, "10,000");
    assert.equal(qa(el, "pf-year")[2].getAttribute("aria-pressed"), "true");
    assert.deepEqual(ov(el, "expenses"), ["—", "4,000"]);
    dom.window.localStorage.setItem(OVERVIEW_KEY, "{broken");
    await act(async () => root!.unmount());
    container!.remove();
    el = await render();
    assert.equal(q(el, "pf-future-toggle").getAttribute("aria-pressed"), "false");
    assert.equal(qa(el, "pf-error").length, 0);
  });
});

describe("foreign income and the rate direction (#102, PF-35, PF-37, PF-38)", () => {
  it("Brazilian Dividends: Foreign BRL at 3.70 → Converted 10,000; table, Net income and % of income use it", async () => {
    const el = await render();
    await click(q(el, "pf-add-person"));
    const p = q(el, "pf-person");
    await type(q(p, "pf-person-name"), "Brazilian Dividends");
    await type(q(p, "pf-person-wages"), "37,000");
    assert.equal(qa(p, "pf-person-currency").length, 0, "Foreign off by default: no foreign cells");
    assert.equal((q(p, "pf-person-foreign") as HTMLInputElement).checked, false);
    await click(q(p, "pf-person-foreign"));
    assert.equal(
      (q(p, "pf-person-currency") as HTMLSelectElement).value,
      "USD",
      "default: the first non-household code",
    );
    assert.ok(
      ![...(q(p, "pf-person-currency") as HTMLSelectElement).options].some(
        (o) => o.value === "CAD",
      ),
      "the household code is not offered",
    );
    await type(q(p, "pf-person-currency"), "BRL");
    assert.deepEqual(
      [...p.querySelectorAll(".pf-fb .pf-label, .pf-foreign .pf-label")].map((l) => l.textContent),
      ["Foreign", "Currency", "FX rate (BRL per 1 CAD)", "Converted (yearly)"],
    );
    // No rate yet: the check, Converted —, Net income —.
    assert.equal(text(p, "pf-error"), "Enter a number above 0.");
    assert.equal(text(p, "pf-person-converted"), "—");
    assert.equal(text(q(el, "pf-net-income"), "pf-income-yearly"), "—");
    await type(q(p, "pf-person-rate"), "3.70");
    assert.equal(text(p, "pf-person-net"), "37,000", "Net stays in BRL");
    assert.equal(text(p, "pf-person-converted"), "10,000");
    const wagesLine = qa(el, "pf-income-line")[0];
    assert.deepEqual(
      ["pf-income-biweekly", "pf-income-monthly", "pf-income-yearly"].map((id) =>
        text(wagesLine, id),
      ),
      ["384.62", "833.33", "10,000"],
    );
    assert.equal(text(q(el, "pf-net-income"), "pf-income-yearly"), "10,000");
    // % of income on an expense of 83.33 a month: 10.0%.
    await click(q(el, "pf-add-fixed"));
    await type(q(lines(el, "fixed")[0], "pf-yearly"), "1,000");
    assert.equal(text(lines(el, "fixed")[0], "pf-income"), "10.0%");
    // Unticking keeps currency and rate stored; × 1 again.
    await click(q(p, "pf-person-foreign"));
    const stored = JSON.parse(dom.window.localStorage.getItem(INCOME_KEY)!).people[0];
    assert.deepEqual([stored.foreign, stored.currency, stored.rate], [false, "BRL", "3.70"]);
    assert.equal(text(q(el, "pf-net-income"), "pf-income-yearly"), "37,000");
  });

  it("an old v1 expenses value is migrated once: rate 0.2 → 5, Condo still 400 (PF-38)", async () => {
    dom.window.localStorage.setItem(
      "orpheus.finance.expenses.v1",
      JSON.stringify({
        fixed: [
          {
            id: "c",
            name: "Condo",
            amount: "2,000",
            per: "month",
            equity: "",
            account: "",
            currency: "BRL",
            rate: "0.2",
          },
        ],
        variable: [],
        accounts: [],
      }),
    );
    const el = await render();
    assert.equal((q(lines(el, "fixed")[0], "pf-fx") as HTMLInputElement).value, "5");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-monthly"), "400");
    assert.equal(dom.window.localStorage.getItem("orpheus.finance.expenses.v1"), null);
    assert.equal(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)!).fixed[0].rate, "5");
  });
});
