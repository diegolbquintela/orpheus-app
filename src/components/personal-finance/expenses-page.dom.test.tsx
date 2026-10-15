// Personal Finance page (#84–#87, #94; spec attachments/personal-finance-spec.md; PF-02..07, PF-11..31) in jsdom with the real component.
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
import { VIEW_KEY } from "@/lib/finance/view";
import { MONTHS_KEY } from "@/lib/finance/months";
import { PersonalFinancePage } from "./expenses-page";
import { loadAccountStore, loadLocalStore, type LoadStore } from "@/lib/finance/account-client";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest } from "@/lib/finance/account.server";
import { RecordStore } from "@/lib/finance/record";

let root: Root | undefined;
let container: HTMLElement | undefined;

// #94: a fixed "today" (11 October 2026, local) so the 12 months are known.
const NOW = new Date(2026, 9, 11, 12);
async function render(now: Date = NOW, readOnly = false): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(<PersonalFinancePage now={now} loadStore={loadLocalStore} readOnly={readOnly} />),
  );
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
/** #144 PF-171: `Unsaved changes` as seen: its text while shown, "" while hidden (its space is kept) or absent. */
const shownUnsaved = (el: ParentNode) => {
  const ind = el.querySelector('[data-testid="pf-unsaved"]');
  return ind && ind.getAttribute("data-shown") === "true" ? ind.textContent : "";
};
const lines = (el: HTMLElement, group: string) => qa(q(el, `pf-group-${group}`), "pf-line");
// #112: `Save` writes the whole record (the shown month's lines and every shared value).
const SAVED_KEYS = [
  STORAGE_KEY,
  INCOME_KEY,
  EQUITY_KEY,
  CURRENCY_KEY,
  OVERVIEW_KEY,
  MONTHS_KEY,
].sort();
// #113: removals ask first; the browser confirm is answered with `answer` and every question recorded.
const confirm = { answer: true, asked: [] as string[] };
dom.window.confirm = (message?: string) => {
  confirm.asked.push(String(message));
  return confirm.answer;
};
// #112: nothing is stored until `Save` (shown only while something is unsaved).
async function saveNow() {
  const button = container?.querySelector('[data-testid="pf-month-save"]');
  if (button) await click(button);
}
async function persisted(key: string): Promise<string> {
  await saveNow();
  return dom.window.localStorage.getItem(key) ?? "null";
}

describe("personal finance page (#84)", () => {
  it("exact copy: title, section, groups, column labels, add buttons, totals (PF-02)", async () => {
    const el = await render();
    assert.equal(el.querySelector("h1")!.textContent, "Personal Finance.");
    assert.deepEqual(
      [...el.querySelectorAll("h2, h3")].map((h) => h.textContent),
      ["Income", "Income table", "Expenses", "Fixed", "Variable", "Expenses summary", "Overview"],
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
          "Category",
        ],
      );
    assert.deepEqual(
      [...el.querySelectorAll("button")].map((b) => b.textContent),
      [
        "Income",
        "↳ Add person",
        "Expenses",
        "↳ Add expense",
        "↳ Add expense",
        "Expenses summary", // #119 (PF-67)
        "Overview",
        "Future",
      ],
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
    // Remove (#113, PF-61): asked first; Cancel keeps the line, OK removes it.
    confirm.asked = [];
    confirm.answer = false;
    await click(q(phone, "pf-remove"));
    assert.equal(lines(el, "fixed").length, 2);
    confirm.answer = true;
    await click(q(phone, "pf-remove"));
    assert.equal(lines(el, "fixed").length, 1);
    assert.equal(confirm.asked.length, 2);
    assert.match(confirm.asked[0], /^Delete .+\? This cannot be undone\.$/);
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
    const stored = JSON.parse(await persisted(STORAGE_KEY));
    assert.deepEqual(Object.keys(dom.window.localStorage).sort(), SAVED_KEYS);
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
        category: "",
      },
    );
    await saveNow();
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
      "01 02 03 03", // #119 (PF-67): Expenses summary is numbered 03 (Q-S1)
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
    // #143 (PF-134): Save is blocked while it shows; fix it before saving.
    await type(q(spouse, "pf-person-wages"), "80,000");
    // Storage and reload.
    const stored = JSON.parse(await persisted(INCOME_KEY));
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
    assert.deepEqual(Object.keys(dom.window.localStorage).sort(), SAVED_KEYS);
    await saveNow();
    await act(async () => root!.unmount());
    container!.remove();
    const again = await render();
    assert.equal((q(people(again)[1], "pf-person-wages") as HTMLInputElement).value, "80,000");
    assert.equal((q(people(again)[0], "pf-person-count-wages") as HTMLInputElement).checked, false);
    // Remove a person (#113, PF-62): asked first.
    confirm.asked = [];
    confirm.answer = false;
    await click(q(people(again)[1], "pf-remove-person"));
    assert.equal(people(again).length, 2);
    confirm.answer = true;
    await click(q(people(again)[1], "pf-remove-person"));
    assert.match(confirm.asked[0], /^Delete .+\? This cannot be undone\.$/);
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
    // #138 PF-150 / PF-156: withdrawal 5 and ROIC 8 → the lower, 4% (was: 5 wins → 240,000 / 60,000 / 24,000).
    await type(q(el, "pf-withdrawal"), "5");
    assert.equal(text(el, "pf-rate-used"), "4%");
    assert.equal(text(el, "pf-rate-source"), "from half of Portfolio ROIC");
    assert.deepEqual(holders(el), ["300,000", "75,000", "30,000"]);
    await type(q(el, "pf-withdrawal"), "3");
    assert.equal(text(el, "pf-rate-used"), "3%");
    assert.equal(text(el, "pf-rate-source"), "from Withdrawal Rate");
    assert.deepEqual(holders(el), ["400,000", "100,000", "40,000"]);
    // A typed 4 is 4% (never halved).
    await type(q(el, "pf-withdrawal"), "4");
    assert.equal(text(el, "pf-rate-used"), "4%");
    assert.equal(text(el, "pf-rate-source"), "Withdrawal Rate and half of Portfolio ROIC are equal");
    assert.equal(holders(el)[0], "300,000");
    // #138 PF-152 (Q-R2): a typed 0 is not set → ROIC ÷ 2; a bad rate → the check and — (PF-153).
    await type(q(el, "pf-withdrawal"), "0");
    assert.equal(text(el, "pf-rate-used"), "4%");
    assert.deepEqual(holders(el), ["300,000", "75,000", "30,000"]);
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
    assert.deepEqual(JSON.parse(await persisted(EQUITY_KEY)), {
      withdrawal: "",
      roic: "8",
    });
    assert.deepEqual(
      Object.keys(dom.window.localStorage).sort(),
      SAVED_KEYS,
      "#112: Save writes the whole record",
    );
    await saveNow();
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
    const stored = JSON.parse(await persisted(STORAGE_KEY));
    assert.deepEqual([stored.fixed[2].currency, stored.fixed[2].rate], ["BRL", "5"]);
    await type(q(el, "pf-household"), "USD");
    assert.deepEqual(JSON.parse(await persisted(CURRENCY_KEY)), {
      household: "USD",
    });
    await saveNow();
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
    assert.equal(JSON.parse(await persisted(STORAGE_KEY)).fixed[2].rate, "5");
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

describe("Overview and the month control (#94, #112; PF-26..31, PF-48..56)", () => {
  const ov = (el: HTMLElement, row: string) =>
    [q(el, `pf-ov-${row}`)].map((r) => [text(r, "pf-ov-now"), text(r, "pf-ov-avg")])[0];
  const month = (el: HTMLElement) => q(el, "pf-month") as HTMLSelectElement;
  const hasSave = (el: HTMLElement) => qa(el, "pf-month-save").length === 1;
  const monthly = (line: Element) =>
    (line.querySelector('[data-testid="pf-monthly"]') as HTMLInputElement).value;
  const LINE = {
    id: "rent",
    name: "Rent",
    amount: "1,750",
    per: "month",
    equity: "",
    account: "",
    currency: "",
    rate: "",
    category: "",
  };
  async function confirmWith(answer: boolean, run: () => Promise<void>) {
    const asked: string[] = [];
    const before = dom.window.confirm;
    dom.window.confirm = (message?: string) => {
      asked.push(String(message));
      return answer;
    };
    try {
      await run();
    } finally {
      dom.window.confirm = before;
    }
    return asked;
  }

  it("copy and a new page: all —, Future off, the month control, no Update (PF-26, PF-48)", async () => {
    const el = await render();
    const table = q(el, "pf-ov-table");
    assert.deepEqual(
      [...table.querySelectorAll("[role=columnheader]")].map((c) => c.textContent),
      ["Overview", "This month", "3-month average (Jul–Sep)", "12-month average (0 of 12 months)"], // #141 Q-T1 / PF-131: no complete month with data
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
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "12");
    assert.equal(qa(el, "pf-update").length, 0, "#112: 05 Update is gone");
    assert.equal(q(el, "pf-month-control").querySelector("label")!.textContent, "Month");
    const options = [...month(el).options].map((o) => o.textContent);
    assert.equal(options.length, 12);
    assert.equal(options[0], "October 2026");
    assert.equal(options[4], "June 2026");
    assert.equal(options[11], "November 2025");
    assert.equal(month(el).value, "2026-10");
    assert.equal(hasSave(el), false, "Save hidden when nothing changed");
    assert.equal(text(el, "pf-month-note"), "");
    assert.equal(dom.window.localStorage.length, 0, "nothing written");
  });

  it("explicit Save, a copied past month, the averages after Save, discard confirm (PF-27, PF-29, PF-30, PF-49..54)", async () => {
    const el = await render();
    await click(q(el, "pf-add-fixed"));
    await type(lines(el, "fixed")[0].querySelector('[data-testid="pf-monthly"]')!, "1,750");
    await click(q(el, "pf-add-person"));
    await type(q(el, "pf-person-wages"), "134,400");
    assert.equal(hasSave(el), true, "a change shows Save");
    assert.equal(dom.window.localStorage.length, 0, "no autosave");
    // #144 (Q-V1, PF-159): 04 is live (was "04 follows saved months": `—` until Save); nothing is stored yet.
    assert.deepEqual(ov(el, "expenses"), ["1,750", "—"], "04 is live before Save");
    assert.equal(shownUnsaved(el), "Unsaved changes");
    await click(q(el, "pf-month-save"));
    assert.equal(shownUnsaved(el), "", "a successful Save clears the indicator");
    assert.equal(hasSave(el), false, "Save hides after saving");
    // #140 (PF-124): only the current month is saved → the 12-complete-month average is —.
    assert.deepEqual(ov(el, "expenses"), ["1,750", "—"]);
    assert.deepEqual(ov(el, "income"), ["11,200", "—"]);
    assert.deepEqual(Object.keys(JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!)), [
      "2026-10",
    ]);
    // An empty past month: a copy of the current saved lines and the note; nothing stored.
    await type(month(el), "2026-06");
    assert.equal(month(el).value, "2026-06");
    assert.equal(text(el, "pf-month-note"), "Copied from October 2026 — edit and save.");
    assert.equal(hasSave(el), true, "a copy is unsaved");
    assert.equal(monthly(lines(el, "fixed")[0]), "1,750");
    assert.deepEqual(Object.keys(JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!)), [
      "2026-10",
    ]);
    await type(lines(el, "fixed")[0].querySelector('[data-testid="pf-monthly"]')!, "4,000");
    await type(q(el, "pf-person-wages"), "108,000");
    await click(q(el, "pf-month-save"));
    assert.equal(month(el).value, "2026-06", "stays on the saved month");
    assert.equal(text(el, "pf-month-note"), "");
    assert.equal(hasSave(el), false);
    // #140: the 12-month average is June alone (October, the current month, is excluded).
    assert.deepEqual(ov(el, "expenses"), ["1,750", "4,000"]);
    assert.deepEqual(ov(el, "income"), ["11,200", "9,000"]);
    assert.deepEqual(ov(el, "surplus"), ["9,450", "5,000"]);
    const stored = JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!);
    assert.deepEqual(Object.keys(stored), ["2026-06", "2026-10"]);
    assert.equal(stored["2026-10"].fixed[0].amount, "1,750", "the current month unchanged");
    assert.equal(stored["2026-06"].fixed[0].amount, "4,000");
    // Shared values: Starting net assets shows Save; the chart; Future.
    await type(q(el, "pf-start"), "10,000");
    assert.equal(hasSave(el), true);
    assert.equal(q(el, "pf-chart").getAttribute("data-net-last"), "74450.00"); // #140: 10,000 + 10 × 5,000 + 5,000 + 9,450
    await type(q(el, "pf-growth"), "5");
    await click(q(el, "pf-future-toggle"));
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "24");
    assert.equal(q(el, "pf-chart").getAttribute("data-net-last"), "139535.39");
    await click(qa(el, "pf-year")[1]);
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "72");
    assert.equal(q(el, "pf-chart").getAttribute("data-net-last"), "434087.85");
    await type(q(el, "pf-growth"), "five");
    assert.equal(text(q(el, "pf-overview"), "pf-error"), "Enter a number, 0 or more.");
    // Switching with unsaved changes asks; Cancel keeps the month and the edits; OK drops them.
    let asked = await confirmWith(false, () => type(month(el), "2026-10"));
    assert.deepEqual(asked, ["Discard unsaved changes?"]);
    assert.equal(month(el).value, "2026-06");
    assert.equal((q(el, "pf-start") as HTMLInputElement).value, "10,000");
    asked = await confirmWith(true, () => type(month(el), "2026-10"));
    assert.equal(asked.length, 1);
    assert.equal(month(el).value, "2026-10");
    assert.equal((q(el, "pf-start") as HTMLInputElement).value, "", "unsaved shared edits dropped");
    assert.equal(monthly(lines(el, "fixed")[0]), "1,750");
    assert.equal(hasSave(el), false);
    // Undoing a change hides Save again; nothing unsaved → no question.
    await type(q(el, "pf-start"), "5");
    assert.equal(hasSave(el), true);
    await type(q(el, "pf-start"), "");
    assert.equal(hasSave(el), false);
    asked = await confirmWith(false, () => type(month(el), "2026-06"));
    assert.equal(asked.length, 0);
    assert.equal(month(el).value, "2026-06");
    assert.equal(monthly(lines(el, "fixed")[0]), "4,000", "a saved month shows its own lines");
    assert.equal(text(el, "pf-month-note"), "");
  });

  it("existing data: lines become the current month; old totals count until the month is saved (PF-31, PF-55)", async () => {
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fixed: [LINE], variable: [], accounts: [], categories: [] }),
    );
    dom.window.localStorage.setItem(
      OVERVIEW_KEY,
      JSON.stringify({
        start: "10,000",
        growth: "5",
        future: true,
        years: 10,
        months: { "2026-06": { expenses: "4,000", income: "" } },
      }),
    );
    let el = await render();
    assert.equal(hasSave(el), false, "no change shown");
    assert.deepEqual(Object.keys(JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!)), [
      "2026-10",
    ]);
    assert.deepEqual(ov(el, "expenses"), ["1,750", "4,000"], "the old June total still counts (#140: June alone in the 12 complete months)");
    await type(month(el), "2026-06");
    assert.equal(text(el, "pf-month-note"), "Copied from October 2026 — edit and save.");
    assert.equal(monthly(lines(el, "fixed")[0]), "1,750");
    await click(q(el, "pf-month-save"));
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(OVERVIEW_KEY)!).months, {});
    assert.deepEqual(ov(el, "expenses"), ["1,750", "1,750"]);
    await act(async () => root!.unmount());
    container!.remove();
    el = await render();
    assert.equal(month(el).value, "2026-10", "opens on the current month");
    assert.equal((q(el, "pf-start") as HTMLInputElement).value, "10,000");
    assert.equal(qa(el, "pf-year")[2].getAttribute("aria-pressed"), "true");
    dom.window.localStorage.setItem(OVERVIEW_KEY, "{broken");
    await act(async () => root!.unmount());
    container!.remove();
    el = await render();
    assert.equal(q(el, "pf-future-toggle").getAttribute("aria-pressed"), "false");
    assert.equal(qa(el, "pf-error").length, 0);
  });

  it("Q-M1: a read-only CFO sees an empty month's copy preview and note, never Save (PF-57)", async () => {
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fixed: [LINE], variable: [], accounts: [], categories: [] }),
    );
    dom.window.localStorage.setItem(
      MONTHS_KEY,
      JSON.stringify({ "2026-10": { fixed: [LINE], variable: [], people: [] } }),
    );
    const before = dom.window.localStorage.getItem(MONTHS_KEY);
    const el = await render(NOW, true);
    await type(month(el), "2026-06");
    assert.equal(month(el).value, "2026-06");
    assert.equal(text(el, "pf-month-note"), "Copied from October 2026 — edit and save.");
    assert.equal(monthly(lines(el, "fixed")[0]), "1,750");
    assert.equal(hasSave(el), false);
    assert.equal(dom.window.localStorage.getItem(MONTHS_KEY), before);
  });

  it("rollover: a new empty month copies the most recent month with lines (PF-56)", async () => {
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fixed: [], variable: [], accounts: [], categories: [] }),
    );
    dom.window.localStorage.setItem(
      MONTHS_KEY,
      JSON.stringify({ "2026-10": { fixed: [LINE], variable: [], people: [] } }),
    );
    const el = await render(new Date(2026, 10, 1, 9));
    assert.equal(month(el).value, "2026-11");
    assert.equal([...month(el).options][0].textContent, "November 2026");
    assert.equal(text(el, "pf-month-note"), "Copied from October 2026 — edit and save.");
    assert.equal(monthly(lines(el, "fixed")[0]), "1,750");
    assert.equal(hasSave(el), true);
    assert.deepEqual(Object.keys(JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!)), [
      "2026-10",
    ]);
    await click(q(el, "pf-month-save"));
    assert.deepEqual(Object.keys(JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!)), [
      "2026-10",
      "2026-11",
    ]);
    assert.equal(text(el, "pf-month-note"), "");
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
    const stored = JSON.parse(await persisted(INCOME_KEY)).people[0];
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
    assert.equal(JSON.parse(await persisted(STORAGE_KEY)).fixed[0].rate, "5");
  });
});

describe("usability (#105, PF-40..46)", () => {
  it("section toggles: Income / Expenses / Overview collapse from their heading, stored, restored (PF-40, PF-41)", async () => {
    let el = await render();
    const toggles = ["income", "expenses", "overview"].map((k) => q(el, `pf-toggle-${k}`));
    assert.deepEqual(
      toggles.map((t) => [
        t.closest("h2")!.textContent,
        t.getAttribute("aria-expanded"),
        t.getAttribute("aria-controls"),
      ]),
      [
        ["Income", "true", "pf-income-body"],
        ["Expenses", "true", "pf-expenses-body"],
        ["Overview", "true", "pf-overview-body"],
      ],
    );
    assert.equal(qa(el, "pf-toggle-update").length, 0, "05 Update is not collapsible");
    await click(q(el, "pf-toggle-expenses"));
    await click(q(el, "pf-toggle-overview"));
    assert.equal(q(el, "pf-toggle-expenses").getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-body-expenses").children.length, 0);
    assert.equal(qa(el, "pf-add-fixed").length, 0);
    assert.equal(qa(el, "pf-chart").length, 0);
    assert.ok(q(el, "pf-body-income").children.length > 0);
    assert.ok(el.querySelector("#pf-expenses-body"), "aria-controls target stays in the page");
    assert.deepEqual(JSON.parse(await persisted(VIEW_KEY)), {
      closed: ["expenses", "overview"],
    });
    await saveNow();
    await act(async () => root!.unmount());
    container!.remove();
    el = await render();
    assert.equal(q(el, "pf-toggle-expenses").getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-toggle-overview").getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-toggle-income").getAttribute("aria-expanded"), "true");
    await click(q(el, "pf-toggle-expenses"));
    assert.equal(qa(el, "pf-add-fixed").length, 1);
    assert.deepEqual(JSON.parse(await persisted(VIEW_KEY)), {
      closed: ["overview"],
    });
  });

  it("categories: add inline, filter, a new line under the filter, By category subtotals; master totals unchanged (PF-44..46)", async () => {
    const el = await render();
    assert.equal(qa(el, "pf-filter").length, 0, "no filter before a category exists");
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-variable"));
    const [rent, condo] = lines(el, "fixed");
    const [gifts] = lines(el, "variable");
    await type(q(rent, "pf-name"), "Rent");
    await type(q(rent, "pf-monthly"), "1,000");
    await type(q(condo, "pf-name"), "Condo");
    await type(q(condo, "pf-monthly"), "2,000");
    await type(q(condo, "pf-currency"), "BRL");
    await type(q(condo, "pf-fx"), "5");
    await type(q(gifts, "pf-name"), "Gifts");
    await type(q(gifts, "pf-yearly"), "1,200");
    assert.equal(qa(el, "pf-categories").length, 0, "no subtotals before a category is used");
    assert.deepEqual(
      [...(q(rent, "pf-category") as HTMLSelectElement).options].map((o) => o.textContent),
      ["—", "Add category…"],
    );
    assert.equal(q(rent, "pf-category").getAttribute("aria-label"), "Category, Fixed 1");
    await type(q(rent, "pf-category"), "__add-category__");
    assert.equal(text(q(rent, "pf-new-category"), "pf-new-category-input") !== null, true);
    assert.equal(
      q(rent, "pf-new-category").querySelector(".pf-label")!.textContent,
      "New category",
    );
    await click(q(rent, "pf-new-category-add"));
    assert.equal(text(rent, "pf-error"), "Name the category.");
    await type(q(rent, "pf-new-category-input"), "Home");
    await click(q(rent, "pf-new-category-add"));
    await type(q(condo, "pf-category"), "__add-category__");
    await type(q(condo, "pf-new-category-input"), "home");
    await click(q(condo, "pf-new-category-add"));
    assert.equal(
      (q(condo, "pf-category") as HTMLSelectElement).value,
      "Home",
      "reused in any case",
    );
    const stored = JSON.parse(await persisted(STORAGE_KEY));
    assert.deepEqual(stored.categories, ["Home"]);
    assert.deepEqual(
      stored.fixed.map((l: { category: string }) => l.category),
      ["Home", "Home"],
    );
    const before = ["fixed", "variable", "all"].map((g) =>
      [...q(el, `pf-total-${g}`).querySelectorAll(".pf-value")].map((v) => v.textContent),
    );
    // Subtotals.
    assert.equal(q(el, "pf-categories").querySelector("h3")!.textContent, "By category");
    assert.deepEqual(
      qa(el, "pf-cat-row").map((r) => [
        text(r, "pf-cat-name"),
        text(r, "pf-cat-share"),
        text(r, "pf-cat-monthly"),
        text(r, "pf-cat-yearly"),
      ]),
      [
        ["Home", "93.3%", "1,400", "16,800"],
        ["No category", "6.7%", "100", "1,200"],
      ],
    );
    // Filter.
    assert.deepEqual(
      [...(q(el, "pf-filter") as HTMLSelectElement).options].map((o) => o.textContent),
      ["All", "Home"],
    );
    assert.equal(q(el, "pf-filter-cell").querySelector("label")!.textContent, "Filter by category");
    await type(q(el, "pf-filter"), "Home");
    assert.deepEqual([lines(el, "fixed").length, lines(el, "variable").length], [2, 0]);
    const after = ["fixed", "variable", "all"].map((g) =>
      [...q(el, `pf-total-${g}`).querySelectorAll(".pf-value")].map((v) => v.textContent),
    );
    assert.deepEqual(after, before, "the filter never changes the master totals");
    await click(q(el, "pf-add-variable"));
    const [added] = lines(el, "variable");
    assert.equal((q(added, "pf-category") as HTMLSelectElement).value, "Home");
    await type(q(el, "pf-filter"), "");
    assert.deepEqual([lines(el, "fixed").length, lines(el, "variable").length], [2, 2]);
    assert.equal(
      dom.window.localStorage.getItem("orpheus.finance.filter"),
      null,
      "the filter is not stored",
    );
    // #113 (PF-63, PF-64): rename the chosen category.
    assert.equal(q(el, "pf-rename-category").hasAttribute("disabled"), true, "nothing chosen");
    await type(q(el, "pf-filter"), "Home");
    await click(q(el, "pf-rename-category"));
    assert.equal(q(el, "pf-new-rename").querySelector(".pf-label")!.textContent, "New name");
    assert.equal((q(el, "pf-new-rename-input") as HTMLInputElement).value, "Home");
    await type(q(el, "pf-new-rename-input"), "  ");
    await click(q(el, "pf-new-rename-add"));
    assert.equal(text(q(el, "pf-new-rename"), "pf-error"), "Name the category.");
    await type(q(el, "pf-new-rename-input"), "House");
    await click(q(el, "pf-new-rename-add"));
    assert.equal(qa(el, "pf-new-rename").length, 0);
    assert.equal((q(el, "pf-filter") as HTMLSelectElement).value, "House");
    assert.deepEqual(
      [...(q(el, "pf-filter") as HTMLSelectElement).options].map((o) => o.textContent),
      ["All", "House"],
    );
    assert.deepEqual(
      [...lines(el, "fixed"), ...lines(el, "variable")].map(
        (l) => (q(l, "pf-category") as HTMLSelectElement).value,
      ),
      ["House", "House", "House"],
    );
    assert.equal(text(qa(el, "pf-cat-row")[0], "pf-cat-name"), "House");
    await type(q(el, "pf-filter"), "");
    assert.deepEqual(
      ["fixed", "variable", "all"].map((g) =>
        [...q(el, `pf-total-${g}`).querySelectorAll(".pf-value")].map((v) => v.textContent),
      )[0],
      before[0],
      "master totals unchanged",
    );
    // Another category's name (any case) is refused.
    await type(q(lines(el, "variable")[0], "pf-category"), "__add-category__");
    await type(q(lines(el, "variable")[0], "pf-new-category-input"), "Fun");
    await click(q(lines(el, "variable")[0], "pf-new-category-add"));
    await type(q(el, "pf-filter"), "Fun");
    await click(q(el, "pf-rename-category"));
    await type(q(el, "pf-new-rename-input"), "house");
    await click(q(el, "pf-new-rename-add"));
    assert.equal(text(q(el, "pf-new-rename"), "pf-error"), "That category exists.");
    await click(q(el, "pf-new-rename-cancel"));
    assert.equal(qa(el, "pf-new-rename").length, 0);
    // Saved: every stored month follows (PF-65).
    const saved = JSON.parse(await persisted(MONTHS_KEY));
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)!).categories, [
      "House",
      "Fun",
    ]);
    assert.equal(saved["2026-10"].fixed[0].category, "House");
  });

  it("a rename reaches every stored month on Save (PF-65)", async () => {
    const line = (category: string) => ({
      id: "l1",
      name: "Rent",
      amount: "1,000",
      per: "month",
      equity: "",
      account: "",
      currency: "",
      rate: "",
      category,
    });
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fixed: [line("Home")], variable: [], accounts: [], categories: ["Home"] }),
    );
    dom.window.localStorage.setItem(
      MONTHS_KEY,
      JSON.stringify({
        "2026-06": { fixed: [line("Home")], variable: [], people: [] },
        "2026-10": { fixed: [line("Home")], variable: [], people: [] },
      }),
    );
    const el = await render();
    await type(q(el, "pf-filter"), "Home");
    await click(q(el, "pf-rename-category"));
    await type(q(el, "pf-new-rename-input"), "House");
    await click(q(el, "pf-new-rename-add"));
    const saved = JSON.parse(await persisted(MONTHS_KEY));
    assert.equal(saved["2026-06"].fixed[0].category, "House");
    assert.equal(saved["2026-10"].fixed[0].category, "House");
  });
});

// #119 (PF-67..PF-74): Expenses summary, account filter, totals by account.
describe("#119 Expenses summary", () => {
  async function account(line: Element, name: string) {
    await type(q(line, "pf-account"), "__add-account__");
    await type(q(line, "pf-new-account-input"), name);
    await click(q(line, "pf-new-account-add"));
  }
  const vals = (el: ParentNode) =>
    ["fixed", "variable", "all"].map((g) =>
      [...q(el, `pf-total-${g}`).querySelectorAll(".pf-value")].map((v) => v.textContent),
    );
  it("its own section and toggle; By account / By category; filter by account; totals unchanged", async () => {
    const el = await render();
    const block = q(el, "pf-summary-block");
    assert.equal(block.querySelector(".pf-label")!.textContent, "03");
    assert.equal(block.querySelector("h2")!.textContent, "Expenses summary");
    assert.equal(
      block.previousElementSibling!.getAttribute("data-testid"),
      "pf-expenses-block",
      "right after 03 Expenses",
    );
    assert.equal(qa(el, "pf-accounts").length, 0, "nothing before an account is used");
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-variable"));
    const [rent, car] = lines(el, "fixed");
    const [food] = lines(el, "variable");
    await type(q(rent, "pf-monthly"), "1,000");
    await type(q(car, "pf-monthly"), "300");
    await type(q(food, "pf-yearly"), "2,400");
    await account(rent, "Chase");
    await account(car, "Amex");
    await type(q(rent, "pf-category"), "__add-category__");
    await type(q(rent, "pf-new-category-input"), "Home");
    await click(q(rent, "pf-new-category-add"));
    // By category moved into the Summary.
    assert.equal(qa(q(el, "pf-body-expenses"), "pf-categories").length, 0);
    assert.equal(qa(block, "pf-categories").length, 1);
    const acct = q(block, "pf-accounts");
    assert.equal(acct.querySelector("h3")!.textContent, "By account");
    const rows = () =>
      qa(el, "pf-acct-row").map((r) => [
        text(r, "pf-acct-name"),
        text(r, "pf-acct-share"),
        text(r, "pf-acct-monthly"),
        text(r, "pf-acct-yearly"),
        r.getAttribute("aria-current"),
      ]);
    assert.deepEqual(rows(), [
      ["Chase", "66.7%", "1,000", "12,000", null],
      ["Amex", "20.0%", "300", "3,600", null],
      ["No account", "13.3%", "200", "2,400", null],
    ]);
    // Account filter.
    assert.equal(
      q(el, "pf-acct-filter-cell").querySelector("label")!.textContent,
      "Filter by account",
    );
    assert.deepEqual(
      [...(q(el, "pf-acct-filter") as HTMLSelectElement).options].map((o) => o.textContent),
      ["All", "Chase", "Amex"],
    );
    const before = vals(el);
    await type(q(el, "pf-acct-filter"), "Amex");
    assert.deepEqual([lines(el, "fixed").length, lines(el, "variable").length], [1, 0]);
    assert.deepEqual(vals(el), before, "the filter never changes a total");
    assert.deepEqual(
      rows().map((r) => [r[0], r[4]]),
      [
        ["Chase", null],
        ["Amex", "true"],
        ["No account", null],
      ],
    );
    // Combined with the category filter: Amex ∧ Home = nothing.
    await type(q(el, "pf-filter"), "Home");
    assert.deepEqual([lines(el, "fixed").length, lines(el, "variable").length], [0, 0]);
    assert.equal(qa(el, "pf-cat-row")[0].getAttribute("aria-current"), "true");
    await type(q(el, "pf-filter"), "");
    // New line under the account filter starts on it.
    await click(q(el, "pf-add-variable"));
    assert.equal((q(lines(el, "variable")[0], "pf-account") as HTMLSelectElement).value, "Amex");
    assert.equal(qa(el, "pf-month-save").length, 1, "unsaved until Save (#112)");
    await type(q(el, "pf-acct-filter"), "");
    assert.deepEqual([lines(el, "fixed").length, lines(el, "variable").length], [2, 2]);
  });

  it("collapsing Expenses leaves the Summary; each toggles alone; remembered", async () => {
    const el = await render();
    await click(q(el, "pf-add-fixed"));
    const [rent] = lines(el, "fixed");
    await type(q(rent, "pf-monthly"), "10");
    await account(rent, "Chase");
    await click(q(el, "pf-toggle-expenses"));
    assert.equal(q(el, "pf-toggle-expenses").getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-toggle-summary").getAttribute("aria-expanded"), "true");
    assert.equal(qa(el, "pf-acct-row").length, 1, "Summary still visible");
    await click(q(el, "pf-toggle-summary"));
    assert.equal(qa(el, "pf-acct-row").length, 0);
    await click(q(el, "pf-toggle-expenses"));
    assert.equal(lines(el, "fixed").length, 1);
    assert.equal(q(el, "pf-toggle-summary").getAttribute("aria-expanded"), "false");
    assert.deepEqual(JSON.parse(await persisted(VIEW_KEY)), { closed: ["summary"] });
  });

  it("read-only (S7 amended): filters work, totals unchanged; every write stays locked", async () => {
    const L = (id: string, amount: string, account: string, category: string) => ({
      id,
      name: id,
      amount,
      per: "month",
      equity: "",
      account,
      currency: "",
      rate: "",
      category,
    });
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fixed: [L("Rent", "1000", "Chase", "Home"), L("Car", "300", "Amex", "")],
        variable: [L("Food", "200", "", "")],
        accounts: ["Chase", "Amex"],
        categories: ["Home"],
      }),
    );
    const el = await render(NOW, true);
    const before = vals(el);
    assert.equal(q(el, "pf-acct-filter").matches(":disabled"), false);
    assert.equal(q(el, "pf-filter").matches(":disabled"), false);
    await type(q(el, "pf-acct-filter"), "Amex");
    assert.deepEqual([lines(el, "fixed").length, lines(el, "variable").length], [1, 0]);
    assert.equal(qa(el, "pf-acct-row")[1].getAttribute("aria-current"), "true");
    await type(q(el, "pf-acct-filter"), "");
    await type(q(el, "pf-filter"), "Home");
    assert.deepEqual([lines(el, "fixed").length, lines(el, "variable").length], [1, 0]);
    assert.deepEqual(vals(el), before, "filters never change a total");
    // Every write stays locked: add (S4 path), rename, remove, fields, no Save.
    for (const id of [
      "pf-add-fixed",
      "pf-add-variable",
      "pf-rename-category",
      "pf-remove",
      "pf-monthly",
      "pf-account",
      "pf-roic",
    ])
      assert.equal(q(el, id).matches(":disabled"), true, id);
    assert.equal(qa(el, "pf-month-save").length, 0);
    await click(q(el, "pf-toggle-summary"));
    assert.equal(qa(el, "pf-acct-row").length, 0);
  });
});

describe("#126 Overview: equity coverage and 3-month average (PF-79..PF-88)", () => {
  const seed = (over: { start?: string; withdrawal?: string; roic?: string; months?: Record<string, { expenses: string; income: string }>; future?: boolean; years?: number; household?: string }) => {
    dom.window.localStorage.setItem(
      OVERVIEW_KEY,
      JSON.stringify({ start: over.start ?? "", growth: "", future: over.future ?? false, years: over.years ?? 1, months: over.months ?? {} }),
    );
    dom.window.localStorage.setItem(EQUITY_KEY, JSON.stringify({ withdrawal: over.withdrawal ?? "", roic: over.roic ?? "" }));
    if (over.household) dom.window.localStorage.setItem(CURRENCY_KEY, JSON.stringify({ household: over.household }));
  };
  const cov = (el: HTMLElement) => q(el, "pf-coverage");
  const covText = (el: HTMLElement) => [...cov(el).querySelectorAll("p")].map((p) => p.textContent);

  it("PF-79 / PF-80: under the table, above the fields and chart; 13,125 × 4% → 43.75 CAD/mo · 0.53% of expenses, 525 CAD/yr", async () => {
    /* #140: Sep, a complete month, so the 12-month average has it */ seed({ start: "13,125", withdrawal: "4", months: { "2026-09": { expenses: "8,254.72", income: "10,000" } } });
    const el = await render();
    assert.deepEqual(covText(el), ["Equity coverage: 43.75 CAD/mo (525 CAD/yr)", "* 4% yearly, covers 0.53% of monthly expenses (3-month average, Jul–Sep).", "** Coverage rate is derived from Rate Used under Expenses section."]);
    const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(after(q(el, "pf-ov-table"), cov(el)));
    assert.equal(q(el, "pf-ov-table").nextElementSibling, cov(el), "directly under the comparison table");
    assert.ok(after(cov(el), q(el, "pf-ov-fields")) && after(cov(el), q(el, "pf-chart")));
    assert.equal(cov(el).querySelectorAll("input, button, select").length, 0, "text only");
  });
  it("PF-81: ROIC ÷ 2 when no withdrawal rate; the household currency code", async () => {
    /* #140: Sep, a complete month, so the 12-month average has it */ seed({ start: "120,000", roic: "8", household: "USD", months: { "2026-09": { expenses: "2,000", income: "" } } });
    const el = await render();
    assert.deepEqual(covText(el), ["Equity coverage: 400 USD/mo (4,800 USD/yr)", "* 4% yearly, covers 20.00% of monthly expenses (3-month average, Jul–Sep).", "** Coverage rate is derived from Rate Used under Expenses section."]);
  });
  it("PF-82: no rate → — and Set rate under Expenses; no start → — and Set starting net assets", async () => {
    seed({ start: "13,125" });
    let el = await render();
    assert.deepEqual(covText(el), ["Equity coverage: —", "Set rate under Expenses", "** Coverage rate is derived from Rate Used under Expenses section."]);
    await act(async () => root?.unmount());
    container?.remove();
    seed({ start: "", withdrawal: "4" });
    el = await render();
    assert.deepEqual(covText(el), ["Equity coverage: —", "Set starting net assets", "** Coverage rate is derived from Rate Used under Expenses section."]);
    await type(q(el, "pf-start"), "24,000");
    assert.deepEqual(covText(el), ["Equity coverage: 80 CAD/mo (960 CAD/yr)", "* 4% yearly, covers — of monthly expenses (3-month average, Jul–Sep).", "** Coverage rate is derived from Rate Used under Expenses section."], "live, no expenses → %: —");
    assert.equal(qa(el, "pf-month-save").length, 1, "the typed start is unsaved until Save (#112)");
  });
  it("PF-83 / PF-85 / PF-86: empty this month uses the 12-month average; 3-month average fills empty months with it", async () => {
    // Aug 1,000 / Sep 3,000 typed; Oct empty; Jun 2,000. 12-month avg = 2,000; C7: 3-month (Jul–Sep) = (2,000 + 1,000 + 3,000) / 3.
    seed({
      start: "24,000",
      withdrawal: "5",
      months: { "2026-06": { expenses: "2,000", income: "4,000" }, "2026-08": { expenses: "1,000", income: "4,000" }, "2026-09": { expenses: "3,000", income: "4,000" } },
    });
    const el = await render();
    const row = (r: string) => ["pf-ov-now", "pf-ov-avg3", "pf-ov-avg"].map((c) => text(q(el, `pf-ov-${r}`), c));
    assert.deepEqual(row("expenses"), ["—", "2,000", "2,000"]);
    assert.deepEqual(row("income"), ["—", "4,000", "4,000"]);
    assert.deepEqual(row("surplus"), ["—", "2,000", "2,000"]);
    assert.deepEqual(covText(el), ["Equity coverage: 100 CAD/mo (1,200 CAD/yr)", "* 5% yearly, covers 5.00% of monthly expenses (3-month average, Jul–Sep).", "** Coverage rate is derived from Rate Used under Expenses section."], "C2: ÷ 3-month average (Jul–Sep) 2,000");
    assert.equal(q(el, "pf-chart").getAttribute("data-months"), "12", "PF-87: chart still 12 months");
  });
  it("PF-86: a different 3-month window: Aug empty, Sep 1,000, Oct 4,000; Jan 7,000 → 12-mo 4,000, 3-mo 3,000", async () => {
    seed({ months: { "2026-01": { expenses: "7,000", income: "" }, "2026-09": { expenses: "1,000", income: "" }, "2026-10": { expenses: "4,000", income: "" } } });
    const el = await render();
    assert.deepEqual(["pf-ov-now", "pf-ov-avg3", "pf-ov-avg"].map((c) => text(q(el, "pf-ov-expenses"), c)), ["4,000", "3,000", "4,000"]);
    assert.equal(text(q(el, "pf-ov-income"), "pf-ov-avg3"), "—");
  });
  it("PF-84: Future on → projected net assets at the horizon end, average expenses, 'in N years'; off restores", async () => {
    /* #140: Sep, a complete month, so the 12-month average has it */ seed({ start: "100,000", withdrawal: "4", future: true, years: 1, months: { "2026-09": { expenses: "1,000", income: "2,000" } } });
    const el = await render();
    const last = Number(q(el, "pf-chart").getAttribute("data-net-last"));
    const yearly = last * 0.04;
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
    assert.deepEqual(covText(el), [`Equity coverage in 1 year: ${fmt(yearly / 12)} CAD/mo (${fmt(yearly)} CAD/yr)`, `* 4% yearly, covers ${((yearly / 12 / 1000) * 100).toFixed(2)}% of projected monthly expenses at horizon end (held at 12-month average).`, "** Coverage rate is derived from Rate Used under Expenses section."]);
    await click(q(el, "pf-future-toggle"));
    assert.deepEqual(covText(el), ["Equity coverage: 333.33 CAD/mo (4,000 CAD/yr)", "* 4% yearly, covers 33.33% of monthly expenses (3-month average, Jul–Sep).", "** Coverage rate is derived from Rate Used under Expenses section."]);
  });
  it("C7/C2 (PF-91, PF-94): the 3-month column and the coverage % use Jul–Sep, not the partial current month", async () => {
    seed({
      start: "120,000",
      withdrawal: "4",
      months: { "2026-07": { expenses: "1,000", income: "" }, "2026-08": { expenses: "2,000", income: "" }, "2026-09": { expenses: "3,000", income: "" }, "2026-10": { expenses: "10,000", income: "" } },
    });
    const el = await render(new Date(2026, 9, 13, 12));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg3-head"), "3-month average (Jul–Sep)");
    assert.deepEqual(["pf-ov-now", "pf-ov-avg3"].map((c) => text(q(el, "pf-ov-expenses"), c)), ["10,000", "2,000"]);
    assert.deepEqual(covText(el), ["Equity coverage: 400 CAD/mo (4,800 CAD/yr)", "* 4% yearly, covers 20.00% of monthly expenses (3-month average, Jul–Sep).", "** Coverage rate is derived from Rate Used under Expenses section."]);
  });
  it("C7 (PF-95): the window rolls over on Nov 1 in the household timezone (Aug–Oct)", async () => {
    seed({ months: { "2026-08": { expenses: "1,000", income: "" }, "2026-09": { expenses: "2,000", income: "" }, "2026-10": { expenses: "3,000", income: "" } } });
    const el = await render(new Date("2026-11-01T04:30:00Z")); // 00:30 Nov 1 in Toronto
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg3-head"), "3-month average (Aug–Oct)");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg3"), "2,000");
  });
  it("#129 PF-98 / PF-99 / PF-100 / PF-101 / PF-102 / PF-105: three lines, the brief's example, notes in the smaller font", async () => {
    // Start 4,000 × Rate used 12.5% = 500/yr, 41.67/mo; Jul–Sep 8,333.33 each → 41.67 ÷ 8,333.33 = 0.50%.
    seed({
      start: "4,000",
      withdrawal: "12.5",
      months: { "2026-07": { expenses: "8,333.33", income: "" }, "2026-08": { expenses: "8,333.33", income: "" }, "2026-09": { expenses: "8,333.33", income: "" }, "2026-10": { expenses: "1,000", income: "" } },
    });
    const el = await render(new Date("2026-10-13T12:00:00-04:00"));
    const ps = [...cov(el).querySelectorAll("p")];
    assert.deepEqual(ps.map((p) => p.getAttribute("data-testid")), ["pf-coverage-amounts", "pf-coverage-rate-note", "pf-coverage-source"]);
    assert.deepEqual(covText(el), [
      "Equity coverage: 41.67 CAD/mo (500 CAD/yr)",
      "* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul–Sep).",
      "** Coverage rate is derived from Rate Used under Expenses section.",
    ]);
    assert.deepEqual(ps.map((p) => p.classList.contains("pf-coverage-sub")), [false, true, true], "PF-102: lines 2–3 smaller");
    assert.equal(cov(el).querySelector('[data-testid="pf-coverage-basis"]'), null, "PF-102: no separate basis label");
    assert.equal(q(el, "pf-ov-table").nextElementSibling, cov(el), "PF-98: directly under the table");
    const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(after(cov(el), q(el, "pf-start")), "PF-98: above Starting net assets");
  });
  it("#129 PF-100 / PF-103 / PF-105 / PF-106: no expenses → — monthly; Future on → projection basis; off restores", async () => {
    seed({ start: "4,000", withdrawal: "12.5", months: {} });
    let el = await render(new Date("2026-10-13T12:00:00-04:00"));
    assert.equal(text(cov(el), "pf-coverage-rate-note"), "* 12.5% yearly, covers — of monthly expenses (3-month average, Jul–Sep).");
    await act(async () => root?.unmount());
    container?.remove();
    seed({ start: "120,000", withdrawal: "4", months: { "2026-09": { expenses: "2,000", income: "3,000" } } });
    el = await render(new Date("2026-10-13T12:00:00-04:00"));
    assert.match(text(cov(el), "pf-coverage-rate-note"), /^\* 4% yearly, covers 20\.00% of monthly expenses \(3-month average, Jul–Sep\)\.$/);
    await click(q(el, "pf-future-toggle"));
    assert.match(text(cov(el), "pf-coverage-amounts"), /^Equity coverage in 1 year: \S+ CAD\/mo \(\S+ CAD\/yr\)$/);
    assert.match(text(cov(el), "pf-coverage-rate-note"), /^\* 4% yearly, covers \d+\.\d\d% of projected monthly expenses at horizon end \(held at 12-month average\)\.$/);
    assert.equal(text(cov(el), "pf-coverage-source"), "** Coverage rate is derived from Rate Used under Expenses section.");
    await click(q(el, "pf-future-toggle"));
    assert.equal(text(cov(el), "pf-coverage-rate-note"), "* 4% yearly, covers 20.00% of monthly expenses (3-month average, Jul–Sep).");
  });
  it("PF-96 (N1): Oct 31 20:30 ET (already Nov 1 in UTC): This month = October, window Jul–Sep", async () => {
    seed({ months: { "2026-10": { expenses: "5,000", income: "" }, "2026-11": { expenses: "9,999", income: "" } } });
    const el = await render(new Date("2026-10-31T20:30:00-04:00"));
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-now"), "5,000");
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg3-head"), "3-month average (Jul–Sep)");
    assert.equal((q(el, "pf-month") as HTMLSelectElement).value, "2026-10");
  });
  it("#140 PF-121 / PF-122 / PF-126 / PF-127 (was #132 PF-115..PF-119): 12 complete months, header Oct–Sep; the current month is excluded; rolls over in Toronto", async () => {
    seed({ start: "120,000", withdrawal: "4", months: { "2025-11": { expenses: "1,200", income: "" }, "2026-09": { expenses: "2,400", income: "" }, "2026-10": { expenses: "50,000", income: "" } } });
    let el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (2 of 12 months)", "#141 Q-T1: Nov 2025 and Sep 2026 of Oct–Sep");
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg3-head"), "3-month average (Jul–Sep)");
    assert.deepEqual(["pf-ov-now", "pf-ov-avg3", "pf-ov-avg"].map((c) => text(q(el, "pf-ov-expenses"), c)), ["50,000", "2,000", "1,800"], "Oct 50,000 is This month only; 12-month = (1,200 + 2,400) / 2; 3-month: Jul, Aug take 1,800, Sep 2,400");
    assert.equal(text(cov(el), "pf-coverage-rate-note"), "* 4% yearly, covers 20.00% of monthly expenses (3-month average, Jul–Sep).", "PF-126: Future-off coverage unchanged");
    await act(async () => root?.unmount());
    container?.remove();
    el = await render(new Date("2026-11-01T04:30:00Z")); // 00:30 Nov 1 in Toronto: October completes
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (3 of 12 months)");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg"), "17,866.67", "(1,200 + 2,400 + 50,000) / 3");
    await act(async () => root?.unmount());
    container?.remove();
    el = await render(new Date("2026-11-01T03:30:00Z"), true); // still Oct 31 in Toronto; read-only
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (2 of 12 months)");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg"), "1,800");
  });
  it("#140 PF-125 / PF-127: Future on holds expenses at the 12-complete-month average; Future-on coverage divides by it", async () => {
    seed({ start: "120,000", withdrawal: "4", future: true, years: 1, months: { "2025-10": { expenses: "6,000", income: "9,000" }, "2026-09": { expenses: "2,000", income: "9,000" }, "2026-10": { expenses: "40,000", income: "9,000" } } });
    const el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg"), "4,000");
    const last = Number(q(el, "pf-chart").getAttribute("data-net-last"));
    const share = ((last * 0.04) / 12 / 4000) * 100;
    assert.equal(text(cov(el), "pf-coverage-rate-note"), `* 4% yearly, covers ${share.toFixed(2)}% of projected monthly expenses at horizon end (held at 12-month average).`);
  });
  it("#140 PF-124: only the current month typed → 12-month and 3-month —; Future-on coverage not computed", async () => {
    seed({ start: "10,000", withdrawal: "4", future: true, years: 1, months: { "2026-10": { expenses: "1,000", income: "2,000" } } });
    const el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.deepEqual(["pf-ov-now", "pf-ov-avg3", "pf-ov-avg"].map((c) => text(q(el, "pf-ov-expenses"), c)), ["1,000", "—", "—"]);
    assert.deepEqual(covText(el), ["Equity coverage in 1 year: —", "** Coverage rate is derived from Rate Used under Expenses section."]);
  });
  // #141 Q-T1 (CFO-changed): 12 of 12 → dated label; fewer → "(N of 12 months)", the CFO's example format.
  const allMonths = (from: [number, number], n: number, value = "1,000") => {
    const out: Record<string, { expenses: string; income: string }> = {};
    for (let i = 0; i < n; i++) {
      const m = from[1] - 1 + i;
      out[`${from[0] + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`] = { expenses: value, income: "3,000" };
    }
    return out;
  };
  it("#141 PF-129: all 12 complete months with data → the dated label (Oct–Sep), rolling over to Nov–Oct in Toronto", async () => {
    seed({ start: "10,000", withdrawal: "4", future: true, years: 1, months: allMonths([2025, 10], 13) });
    let el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (Oct–Sep)");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg"), "1,000");
    assert.equal(text(cov(el), "pf-coverage-rate-note").includes("(held at 12-month average)."), true, "the Future-on note names no range or count");
    await act(async () => root?.unmount());
    container?.remove();
    el = await render(new Date("2026-11-01T04:30:00Z"));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (Nov–Oct)");
    await act(async () => root?.unmount());
    container?.remove();
    el = await render(new Date("2026-11-01T03:30:00Z"), true);
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (Oct–Sep)");
  });
  it("#141 PF-130: 8 of 12 complete months with data → \"12-month average (8 of 12 months)\", no range", async () => {
    seed({ start: "10,000", withdrawal: "4", months: allMonths([2026, 2], 8, "2,000") });
    const el = await render(new Date("2026-10-14T12:00:00-04:00"));
    const head = text(q(el, "pf-ov-table"), "pf-ov-avg-head");
    assert.equal(head, "12-month average (8 of 12 months)");
    assert.doesNotMatch(head, /\u2013/);
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg"), "2,000");
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg3-head"), "3-month average (Jul–Sep)", "the 3-month label is unchanged");
  });
  it("#141 PF-132: 8 expense months + 1 income-only month → \"(8 of 12 months)\"; the expense average divides by 8, not 9", async () => {
    const m: Record<string, { expenses: string; income: string }> = {};
    ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].forEach((k, i) => (m[k] = { expenses: String((i + 1) * 100), income: "" }));
    m["2026-01"] = { expenses: "", income: "6,000" };
    seed({ start: "10,000", withdrawal: "4", months: m });
    const el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (8 of 12 months)");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg"), "450", "(100 + … + 800) / 8; / 9 would be 400");
    assert.equal(text(q(el, "pf-ov-income"), "pf-ov-avg"), "—", "#146 PF-143: the income-only month counts toward neither average; no expense month has income → —");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg3"), "700", "Jul–Sep 600 / 700 / 800");
  });
  it("#146 PF-143 / PF-144 / PF-145 / PF-147: 8 expense months + 1 income-only → income and expenses both over 8, surplus on the same 8, (8 of 12 months); Future uses it", async () => {
    const m: Record<string, { expenses: string; income: string }> = {};
    ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].forEach((k, i) => (m[k] = { expenses: String((i + 1) * 100), income: String((i + 1) * 1000) }));
    m["2026-01"] = { expenses: "", income: "50,000" };
    seed({ start: "0", future: true, years: 1, months: m });
    const el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (8 of 12 months)");
    assert.deepEqual(["expenses", "income", "surplus"].map((r) => text(q(el, `pf-ov-${r}`), "pf-ov-avg")), ["450", "4,500", "4,050"], "income 36,000 / 8, not (36,000 + 50,000) / 9 = 9,555.56");
    const net = Number(q(el, "pf-chart").getAttribute("data-net-last"));
    assert.ok(Number.isFinite(net) && net > 0);
  });
  it("#146 PF-148 (Q-U1): an expense month with no income counts 0 income; PF-146: income-only months only → all —", async () => {
    seed({ months: { "2026-08": { expenses: "100", income: "3,000" }, "2026-09": { expenses: "300", income: "" } } });
    let el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.deepEqual(["expenses", "income", "surplus"].map((r) => text(q(el, `pf-ov-${r}`), "pf-ov-avg")), ["200", "1,500", "1,300"]);
    await act(async () => root?.unmount());
    container?.remove();
    dom.window.localStorage.clear();
    seed({ months: { "2026-01": { expenses: "", income: "9,000" } } });
    el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (0 of 12 months)");
    assert.deepEqual(["expenses", "income", "surplus"].map((r) => text(q(el, `pf-ov-${r}`), "pf-ov-avg")), ["—", "—", "—"]);
  });
  it("#141 PF-131: 0 complete months with data → \"12-month average (0 of 12 months)\" and — (Q-T3)", async () => {
    seed({ start: "10,000", withdrawal: "4", months: { "2026-10": { expenses: "1,000", income: "2,000" } } });
    const el = await render(new Date("2026-10-14T12:00:00-04:00"));
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (0 of 12 months)");
    assert.deepEqual(["expenses", "income", "surplus"].map((r) => text(q(el, `pf-ov-${r}`), "pf-ov-avg")), ["—", "—", "—"]);
  });
  it("PF-88: read-only sees the coverage and the 3-month column; no new control", async () => {
    /* #140: Sep, a complete month, so the 12-month average has it */ seed({ start: "13,125", withdrawal: "4", months: { "2026-09": { expenses: "8,254.72", income: "" } } });
    const el = await render(NOW, true);
    assert.equal(covText(el)[0], "Equity coverage: 43.75 CAD/mo (525 CAD/yr)");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-avg3"), "8,254.72");
    assert.equal(cov(el).querySelectorAll("input, button, select").length, 0);
  });
});


describe("#131 Withdrawal rate description (PF-108..PF-112)", () => {
  const LINES = [
    "Withdrawal rate used to calculate how much equity can cover expenses.",
    "Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.", // #138 PF-155
  ];
  it("PF-108 / PF-109 / PF-110: two description lines right before the rates row, note style, not a title", async () => {
    const el = await render();
    const desc = q(el, "pf-withdrawal-desc");
    assert.deepEqual([...desc.querySelectorAll("p")].map((p) => p.textContent), LINES);
    assert.equal(desc.children.length, 2);
    assert.equal(desc.nextElementSibling, q(el, "pf-rates"), "nothing between the description and the rates row");
    const label = q(el, "pf-rates").querySelector(".pf-label")!;
    assert.equal(label.textContent, "Withdrawal rate (%)");
    assert.ok(desc.compareDocumentPosition(label) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(desc.classList.contains("pf-desc"));
    assert.equal(desc.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading], .pf-label, .ow-label").length, 0);
    assert.ok(!desc.matches("h1, h2, h3, h4, h5, h6, [role=heading], .pf-label, .ow-label"));
  });
  it("PF-111: the withdrawal input is described by the description, plus the error when bad", async () => {
    const el = await render();
    const desc = q(el, "pf-withdrawal-desc");
    const wd = q(el, "pf-withdrawal");
    assert.equal(wd.getAttribute("aria-describedby"), desc.id);
    assert.equal(q(el, "pf-roic").getAttribute("aria-describedby"), null);
    await type(wd, "150");
    const ids = (wd.getAttribute("aria-describedby") ?? "").split(" ");
    const err = q(el, "pf-rates").querySelector('[data-testid="pf-error"][data-field="withdrawal"]')!;
    assert.deepEqual(ids, [desc.id, err.id]);
    assert.equal(wd.getAttribute("aria-invalid"), "true");
  });
  it("PF-112: read-only sees the description inside the lock; Rate used (#138: 5 + ROIC 8 → the lower, 4%) and its source", async () => {
    dom.window.localStorage.setItem(EQUITY_KEY, JSON.stringify({ withdrawal: "5", roic: "8" }));
    const el = await render(NOW, true);
    const desc = q(el, "pf-withdrawal-desc");
    assert.deepEqual([...desc.querySelectorAll("p")].map((p) => p.textContent), LINES);
    assert.ok(desc.closest('[data-testid="pf-lock"]'));
    assert.equal(text(q(el, "pf-rates"), "pf-rate-used"), "4%");
    assert.equal(text(q(el, "pf-rates"), "pf-rate-source"), "from half of Portfolio ROIC", "PF-157: read-only sees the source");
  });
});


describe("#143 Save is blocked while a field has an error (PF-133..PF-140)", () => {
  // A store like the account's: `save()` counts PUTs, answers `ok`, and on success keeps the record (for a reload).
  const puts = { n: 0, ok: true };
  const loadCounting: LoadStore = async ({ onSaved }) => {
    const ls = dom.window.localStorage;
    const data: Record<string, string> = {};
    for (let i = 0; i < ls.length; i++) data[ls.key(i)!] = ls.getItem(ls.key(i)!)!;
    const store: RecordStore & { save?: () => Promise<boolean> } = new RecordStore(data);
    store.save = async () => {
      puts.n++;
      onSaved(puts.ok);
      if (puts.ok) for (const [k, v] of Object.entries(store.snapshot())) ls.setItem(k, v);
      return puts.ok;
    };
    return store;
  };
  async function open(readOnly = false): Promise<HTMLElement> {
    container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<PersonalFinancePage now={NOW} loadStore={loadCounting} readOnly={readOnly} />));
    return container;
  }
  async function reopen(readOnly = false) {
    await act(async () => root!.unmount());
    container!.remove();
    return open(readOnly);
  }
  const people = (el: HTMLElement) => qa(el, "pf-person");
  const now = (el: HTMLElement) => text(q(el, "pf-ov-expenses"), "pf-ov-now");
  const note = (el: HTMLElement) => text(el, "pf-month-note");
  /** October saved: one person (36,000 a year), Rent 2,200 + Phone 750 → This month 2,950. */
  async function october(): Promise<HTMLElement> {
    puts.n = 0;
    puts.ok = true;
    const el = await open();
    await click(q(el, "pf-add-person"));
    await type(q(people(el)[0], "pf-person-wages"), "36,000");
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-fixed"));
    const [rent, phone] = lines(el, "fixed");
    await type(q(rent, "pf-monthly"), "2,200");
    await type(q(phone, "pf-monthly"), "750");
    await saveNow();
    assert.equal(puts.n, 1);
    assert.equal(now(el), "2,950");
    puts.n = 0;
    return el;
  }

  it("PF-133: -5 in Rent → its error; Save sends no PUT, shows the note, focuses Rent; a reload keeps 2,950", async () => {
    const el = await october();
    const rent = q(lines(el, "fixed")[0], "pf-monthly") as HTMLInputElement;
    await type(rent, "-5");
    assert.equal(q(lines(el, "fixed")[0], "pf-error").textContent, "Enter a number, 0 or more.");
    await saveNow();
    assert.equal(puts.n, 0, "no PUT");
    assert.equal(note(el), "Fix the fields marked in red before saving.");
    assert.equal(dom.window.document.activeElement, rent, "focus on the field in error");
    // #144 (Q-V3, PF-170): the page is live, so This month counts the bad Rent as 0 while its error shows (750, as the
    // Expenses totals already did); nothing is stored, and PF-133's own check is the reload below.
    assert.equal(now(el), "750", "live, with the error shown");
    assert.equal(shownUnsaved(el), "Unsaved changes");
    assert.ok(q(el, "pf-month-save"), "Save stays shown (Q-S1)");
    const again = await reopen();
    assert.equal(now(again), "2,950");
    assert.equal((q(lines(again, "fixed")[0], "pf-monthly") as HTMLInputElement).value, "2,200");
  });
  it("PF-134: a bad tax (-1, 101), wages, share, Equity to cover, rates, Starting net assets, growth each block Save", async () => {
    const el = await october();
    const cases: [() => Element, string, string][] = [
      [() => q(people(el)[0], "pf-person-tax"), "-1", "30"],
      [() => q(people(el)[0], "pf-person-tax"), "101", "30"],
      [() => q(people(el)[0], "pf-person-wages"), "-36,000", "36,000"],
      [() => q(people(el)[0], "pf-person-share"), "150", "100"],
      [() => q(lines(el, "fixed")[1], "pf-equity"), "-1", ""],
      [() => q(el, "pf-withdrawal"), "-4", "4"],
      [() => q(el, "pf-roic"), "abc", ""],
      [() => q(el, "pf-start"), "-10", "10,000"],
      [() => q(el, "pf-growth"), "-5", "5"],
    ];
    for (const [field, bad, good] of cases) {
      await type(field(), bad);
      await saveNow();
      assert.equal(puts.n, 0, `${bad} blocks Save`);
      assert.equal(note(el), "Fix the fields marked in red before saving.", bad);
      assert.equal(dom.window.document.activeElement, field(), `focus on ${bad}`);
      await type(field(), good);
    }
    assert.equal(note(el), "", "fixed → the note clears");
    await saveNow();
    assert.equal(puts.n, 1, "PF-136: fixed → Save saves");
  });
  it("PF-135 / PF-136: 0 and blank are valid; fixing a field clears the note and Save saves", async () => {
    const el = await october();
    const rent = q(lines(el, "fixed")[0], "pf-monthly");
    await type(rent, "-5");
    await saveNow();
    assert.equal(puts.n, 0);
    await type(rent, "0");
    assert.equal(note(el), "");
    await saveNow();
    assert.equal(puts.n, 1);
    assert.equal(now(el), "750", "0 counts as 0");
    await type(q(people(el)[0], "pf-person-tax"), "0");
    await saveNow();
    assert.equal(puts.n, 2, "tax 0 is valid");
    await type(q(people(el)[0], "pf-person-tax"), "");
    await saveNow();
    assert.equal(puts.n, 3, "blank tax is 0, valid");
  });
  it("PF-134: a foreign line without a valid FX rate blocks Save on the page", async () => {
    const el = await october();
    const phone = lines(el, "fixed")[1];
    await type(q(phone, "pf-currency"), "USD");
    await saveNow();
    assert.equal(puts.n, 0);
    await type(q(lines(el, "fixed")[1], "pf-fx"), "1.4");
    await saveNow();
    assert.equal(puts.n, 1);
  });
  it("PF-138: a refused PUT shows Not saved. and keeps the edits unsaved", async () => {
    const el = await october();
    puts.ok = false;
    await type(q(lines(el, "fixed")[0], "pf-monthly"), "2,300");
    await saveNow();
    assert.equal(puts.n, 1);
    assert.equal(text(el, "pf-save"), "Not saved.");
    assert.ok(q(el, "pf-month-save"), "Save still shown");
  });
  it("PF-139: a record already holding -5 opens with the error and Save is blocked until fixed", async () => {
    const el = await october();
    const ls = dom.window.localStorage;
    const months = JSON.parse(ls.getItem(MONTHS_KEY)!);
    months["2026-10"].fixed[0].amount = "-5";
    ls.setItem(MONTHS_KEY, JSON.stringify(months));
    void el;
    const again = await reopen();
    assert.equal(q(lines(again, "fixed")[0], "pf-error").textContent, "Enter a number, 0 or more.");
    await type(q(lines(again, "fixed")[1], "pf-monthly"), "800");
    await saveNow();
    assert.equal(puts.n, 0);
    assert.equal(note(again), "Fix the fields marked in red before saving.");
  });
  it("PF-141 (Q-S6 condition, server refusal): a refused automatic save on section open/close shows Not saved. and it stays; the edits stay on screen", async () => {
    const el = await october();
    await type(q(lines(el, "fixed")[1], "pf-monthly"), "800"); // valid on screen: the toggle's save is sent
    puts.ok = false; // the API refuses the record (e.g. one already holding a bad value)
    await click(q(el, "pf-toggle-summary"));
    assert.equal(puts.n, 1, "the toggle's own save was sent (and refused)");
    assert.equal(text(el, "pf-save"), "Not saved.");
    await act(async () => new Promise((r) => setTimeout(r, 2500))); // time passes: the note does not flash away
    await click(q(el, "pf-toggle-summary")); // another blocked toggle and a re-render
    await act(async () => new Promise((r) => setTimeout(r, 500)));
    assert.equal(text(el, "pf-save"), "Not saved.", "still shown");
    assert.equal((q(lines(el, "fixed")[1], "pf-monthly") as HTMLInputElement).value, "800", "edit not reverted");
    assert.ok(q(el, "pf-month-save"), "still unsaved (Save shown)");
  });
  it("PF-142 (Q-S6 condition, the server WOULD accept): a field in error → the toggle opens / closes locally, sends no PUT, Not saved. stays; the edits stay", async () => {
    const el = await october();
    await type(q(lines(el, "fixed")[0], "pf-monthly"), "-5");
    await type(q(el, "pf-start"), "520,000");
    assert.equal(puts.ok, true, "the store would accept a PUT");
    const open0 = q(el, "pf-toggle-income").getAttribute("aria-expanded");
    await click(q(el, "pf-toggle-income"));
    assert.notEqual(q(el, "pf-toggle-income").getAttribute("aria-expanded"), open0, "the section toggles locally");
    assert.equal(puts.n, 0, "no PUT");
    assert.equal(text(el, "pf-save"), "Not saved.");
    await act(async () => new Promise((r) => setTimeout(r, 2500)));
    await click(q(el, "pf-toggle-income")); // reopen: a re-render, still no PUT
    assert.equal(q(el, "pf-toggle-income").getAttribute("aria-expanded"), open0);
    await act(async () => new Promise((r) => setTimeout(r, 500)));
    assert.equal(puts.n, 0);
    assert.equal(text(el, "pf-save"), "Not saved.", "still shown");
    assert.equal((q(lines(el, "fixed")[0], "pf-monthly") as HTMLInputElement).value, "-5");
    assert.equal((q(el, "pf-start") as HTMLInputElement).value, "520,000");
    assert.ok(q(el, "pf-month-save"));
    // Fixed and saved → the note clears; the toggled view rides along with that save.
    await type(q(lines(el, "fixed")[0], "pf-monthly"), "2,200");
    await saveNow();
    assert.equal(puts.n, 1);
    assert.equal(text(el, "pf-save"), "");
  });
  it("PF-140: read-only: no Save, no PUT", async () => {
    await october();
    const ro = await reopen(true);
    assert.equal(ro.querySelector('[data-testid="pf-month-save"]'), null);
    assert.equal(puts.n, 0);
  });
});

describe("#138 Rate used = the lower of the Withdrawal Rate and half of Portfolio ROIC (PF-150..PF-157)", () => {
  const show = (el: HTMLElement) => [text(el, "pf-rate-used"), el.querySelector('[data-testid="pf-rate-source"]')?.textContent ?? null];
  it("PF-150 / PF-151 / PF-152 / PF-153 / PF-154: lower, equal, one empty, 0, a field in error", async () => {
    const el = await render();
    const cases: [string, string, string, string | null][] = [
      ["3", "8", "3%", "from Withdrawal Rate"],
      ["5", "8", "4%", "from half of Portfolio ROIC"],
      ["4", "8", "4%", "Withdrawal Rate and half of Portfolio ROIC are equal"],
      ["", "8", "4%", "from half of Portfolio ROIC"],
      ["5", "", "5%", "from Withdrawal Rate"],
      ["", "", "—", null],
      ["0", "8", "4%", "from half of Portfolio ROIC"],
      ["0", "0", "—", null],
      ["5", "-8", "—", null],
      ["101", "8", "—", null],
    ];
    for (const [w, r, used, source] of cases) {
      await type(q(el, "pf-withdrawal"), w);
      await type(q(el, "pf-roic"), r);
      assert.deepEqual(show(el), [used, source], `${w} / ${r}`);
    }
  });
  it("PF-156: the Overview coverage uses the new rate (withdrawal 5 and ROIC 8 → 4%)", async () => {
    dom.window.localStorage.setItem(EQUITY_KEY, JSON.stringify({ withdrawal: "5", roic: "8" }));
    dom.window.localStorage.setItem(OVERVIEW_KEY, JSON.stringify({ start: "120,000", growth: "", future: false, years: 1, months: {} }));
    const el = await render();
    assert.match(q(el, "pf-coverage").textContent ?? "", /Equity coverage: 400 CAD\/mo \(4,800 CAD\/yr\)/);
  });
});

describe("#138 Q-R3 condition (CFO): a rate field in error says what to fix (PF-158)", () => {
  it("PF-158: ROIC -8 / abc → `Enter a number, 0 or more.`; WR -1 / 101 / abc → `Enter a percent from 0 to 100.`; Rate used —", async () => {
    const el = await render();
    const rates = () => q(el, "pf-rates");
    const err = (field: string) => rates().querySelector(`[data-testid="pf-error"][data-field="${field}"]`)?.textContent ?? null;
    const cases: [string, string, string, string][] = [
      ["roic", "-8", "Enter a number, 0 or more.", "5"],
      ["roic", "abc", "Enter a number, 0 or more.", "5"],
      ["withdrawal", "-1", "Enter a percent from 0 to 100.", "8"],
      ["withdrawal", "101", "Enter a percent from 0 to 100.", "8"],
      ["withdrawal", "abc", "Enter a percent from 0 to 100.", "8"],
    ];
    for (const [field, bad, message, other] of cases) {
      await type(q(el, field === "roic" ? "pf-withdrawal" : "pf-roic"), other);
      await type(q(el, `pf-${field}`), bad);
      assert.equal(err(field), message, `${field} ${bad}`);
      assert.equal(q(el, `pf-${field}`).getAttribute("aria-invalid"), "true");
      assert.equal(text(el, "pf-rate-used"), "—", `${field} ${bad}: Rate used —`);
      assert.equal(el.querySelector('[data-testid="pf-rate-source"]'), null);
      await type(q(el, `pf-${field}`), "");
    }
  });
});


describe("#144 every figure is live; Unsaved changes until a successful save (PF-159..PF-170)", () => {
  // A store like the account's that counts PUTs and keeps the record on success (for a reload). It always accepts:
  // the blocked cases below are the page's own (no PUT is sent), not a faked refusal. The refusal is PF-166's real path.
  const puts = { n: 0 };
  const loadCounting: LoadStore = async ({ onSaved }) => {
    const ls = dom.window.localStorage;
    const data: Record<string, string> = {};
    for (let i = 0; i < ls.length; i++) data[ls.key(i)!] = ls.getItem(ls.key(i)!)!;
    const store: RecordStore & { save?: () => Promise<boolean> } = new RecordStore(data);
    store.save = async () => {
      puts.n++;
      onSaved(true);
      for (const [k, v] of Object.entries(store.snapshot())) ls.setItem(k, v);
      return true;
    };
    return store;
  };
  async function open(readOnly = false): Promise<HTMLElement> {
    container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<PersonalFinancePage now={NOW} loadStore={loadCounting} readOnly={readOnly} />));
    return container;
  }
  async function reopen(readOnly = false) {
    await act(async () => root!.unmount());
    container!.remove();
    return open(readOnly);
  }
  const ovCell = (el: HTMLElement, row: string, col: string) => text(q(el, `pf-ov-${row}`), col);
  const unsaved = (el: HTMLElement) => shownUnsaved(el);
  const num = (s: string | null) => Number((s ?? "").replace(/,/g, ""));
  /** October saved: one person (36,000 a year), Rent 2,200 + Phone 750 → This month 2,950. */
  async function october(): Promise<HTMLElement> {
    puts.n = 0;
    const el = await open();
    await click(q(el, "pf-add-person"));
    await type(q(qa(el, "pf-person")[0], "pf-person-wages"), "36,000");
    await click(q(el, "pf-add-fixed"));
    await click(q(el, "pf-add-fixed"));
    const [rent, phone] = lines(el, "fixed");
    await type(q(rent, "pf-monthly"), "2,200");
    await type(q(phone, "pf-monthly"), "750");
    await saveNow();
    assert.equal(ovCell(el, "expenses", "pf-ov-now"), "2,950");
    assert.equal(unsaved(el), "");
    puts.n = 0;
    return el;
  }
  const rent = (el: HTMLElement) => q(lines(el, "fixed")[0], "pf-monthly") as HTMLInputElement;
  const leaveWarns = () => {
    const e = new dom.window.Event("beforeunload", { cancelable: true });
    dom.window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it("PF-159: the shown month's edit moves This month, the surplus and the chart while typing, before Save", async () => {
    const el = await october();
    const income = num(ovCell(el, "income", "pf-ov-now"));
    await type(rent(el), "2,300");
    assert.equal(puts.n, 0, "nothing stored");
    assert.equal(ovCell(el, "expenses", "pf-ov-now"), "3,050");
    assert.equal(num(ovCell(el, "surplus", "pf-ov-now")), income - 3050);
    assert.equal(text(q(el, "pf-total-all"), "pf-total-monthly"), "3,050", "the same figure as the Expenses total");
  });
  it("PF-159: a past month in the windows moves the 3-month and 12-month averages, surplus and N-of-12 label live", async () => {
    const el = await october();
    assert.equal(ovCell(el, "expenses", "pf-ov-avg3"), "—");
    assert.equal(ovCell(el, "expenses", "pf-ov-avg"), "—");
    await type(q(el, "pf-month"), "2026-09"); // a copy of October, unsaved
    assert.equal(unsaved(el), "Unsaved changes", "a copy is unsaved");
    assert.equal(ovCell(el, "expenses", "pf-ov-avg3"), "2,950");
    assert.equal(ovCell(el, "expenses", "pf-ov-avg"), "2,950");
    assert.equal(text(q(el, "pf-ov-table"), "pf-ov-avg-head"), "12-month average (1 of 12 months)");
    await type(q(el, "pf-start"), "10,000");
    const net0 = q(el, "pf-chart").getAttribute("data-net-last");
    assert.notEqual(net0, "");
    await type(rent(el), "1,000");
    // The chart's net line: Sep and the months filled with the 12-month average spend 1,200 a month less, so it rises.
    assert.ok(Number(q(el, "pf-chart").getAttribute("data-net-last")) > Number(net0), "the chart's net line moved");
    assert.equal(ovCell(el, "expenses", "pf-ov-avg3"), "1,750");
    assert.equal(ovCell(el, "expenses", "pf-ov-avg"), "1,750");
    const inc = num(ovCell(el, "income", "pf-ov-avg"));
    assert.equal(num(ovCell(el, "surplus", "pf-ov-avg")), inc - 1750);
    assert.equal(ovCell(el, "expenses", "pf-ov-now"), "2,950", "October (This month) is its saved lines");
    assert.equal(puts.n, 0);
  });
  it("PF-160 / PF-161: rates and Starting net assets move Rate used, Equity to cover, the coverage and the projection live", async () => {
    const el = await october();
    await type(q(el, "pf-month"), "2026-09");
    await type(q(el, "pf-start"), "120,000");
    await type(q(el, "pf-withdrawal"), "4");
    assert.equal(text(el, "pf-rate-used"), "4%");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-equity"), "885,000", "2,950 × 12 ÷ 4%");
    // 120,000 × 4% = 4,800/yr = 400/mo; ÷ the live 3-month average 2,950 = 13.56%.
    assert.equal(text(el, "pf-coverage-monthly"), "400 CAD/mo");
    assert.match(text(el, "pf-coverage-rate-note")!, /covers 13\.56% of monthly expenses/);
    await type(rent(el), "1,000"); // the live 3-month average drops to 1,750 → 22.86%
    assert.match(text(el, "pf-coverage-rate-note")!, /covers 22\.86% of monthly expenses/);
    await type(q(el, "pf-withdrawal"), "8");
    assert.equal(text(el, "pf-coverage-monthly"), "800 CAD/mo");
    const net0 = q(el, "pf-chart").getAttribute("data-net-last");
    await type(q(el, "pf-start"), "130,000");
    assert.notEqual(q(el, "pf-chart").getAttribute("data-net-last"), net0);
    assert.equal(puts.n, 0, "nothing stored while typing");
  });
  it("PF-162 / PF-163: the first edit shows Unsaved changes beside Save; a successful Save clears it; a reload shows the saved figures", async () => {
    const el = await october();
    assert.equal(unsaved(el), "");
    await type(rent(el), "2,300");
    assert.equal(unsaved(el), "Unsaved changes");
    const ind = q(el, "pf-unsaved");
    assert.equal(ind.getAttribute("role"), "status");
    assert.ok(ind.closest('[data-testid="pf-month-control"]'), "in the month row, beside Save");
    assert.ok(q(el, "pf-month-save"));
    await saveNow();
    assert.equal(puts.n, 1);
    assert.equal(unsaved(el), "");
    assert.equal(text(el, "pf-save"), "");
    const again = await reopen();
    assert.equal(ovCell(again, "expenses", "pf-ov-now"), "3,050");
    assert.equal(rent(again).value, "2,300");
    assert.equal(unsaved(again), "");
  });
  it("PF-164 / PF-168: Save with a field in error: no PUT, the note, Not saved., the indicator and the leave prompt stay", async () => {
    const el = await october();
    assert.equal(leaveWarns(), false, "nothing unsaved, no prompt");
    await type(rent(el), "-5");
    await saveNow();
    assert.equal(puts.n, 0);
    assert.equal(text(el, "pf-month-note"), "Fix the fields marked in red before saving.");
    assert.equal(text(el, "pf-save"), "Not saved.");
    assert.equal(unsaved(el), "Unsaved changes");
    assert.equal(leaveWarns(), true, "the leave prompt stays");
    await act(async () => new Promise((r) => setTimeout(r, 1500)));
    assert.equal(text(el, "pf-save"), "Not saved.", "stays");
    await type(rent(el), "2,400");
    assert.equal(text(el, "pf-save"), "Not saved.", "fixing alone does not clear it; only a successful save does");
    await saveNow();
    assert.equal(puts.n, 1);
    assert.equal(text(el, "pf-save"), "");
    assert.equal(unsaved(el), "");
    assert.equal(leaveWarns(), false, "saved: no prompt");
  });
  it("PF-165: a section toggle with a field in error sends no PUT; Not saved. and Unsaved changes stay", async () => {
    const el = await october();
    await type(rent(el), "-5");
    await click(q(el, "pf-toggle-summary"));
    assert.equal(puts.n, 0);
    assert.equal(text(el, "pf-save"), "Not saved.");
    assert.equal(unsaved(el), "Unsaved changes");
    await click(q(el, "pf-toggle-summary"));
    assert.equal(unsaved(el), "Unsaved changes");
    assert.equal(rent(el).value, "-5");
  });
  it("PF-165: a toggle with nothing in error saves the view only; it does not clear Unsaved changes", async () => {
    const el = await october();
    await type(rent(el), "2,300");
    await click(q(el, "pf-toggle-summary"));
    assert.equal(unsaved(el), "Unsaved changes", "the edit is still not saved by Save");
    assert.ok(q(el, "pf-month-save"));
  });
  it("PF-167: typing back to the saved value hides the indicator and Save; discarding on a month switch too", async () => {
    const el = await october();
    await type(rent(el), "2,300");
    assert.equal(unsaved(el), "Unsaved changes");
    await type(rent(el), "2,200");
    assert.equal(unsaved(el), "");
    assert.equal(container!.querySelector('[data-testid="pf-month-save"]'), null);
    await type(rent(el), "2,300");
    confirm.answer = true;
    confirm.asked = [];
    await type(q(el, "pf-month"), "2026-09");
    assert.deepEqual(confirm.asked, ["Discard unsaved changes?"]);
    await type(q(el, "pf-month"), "2026-10");
    assert.equal(rent(el).value, "2,200", "discarded");
    assert.equal(unsaved(el), "");
    assert.equal(puts.n, 0);
  });
  it("PF-171 / PF-174: the Save slot then the indicator in the month row; the indicator is always there (hidden, not removed) and a Save-sized slot holds the place", async () => {
    const el = await october();
    const row = el.querySelector(".pf-month-row")!;
    const group = el.querySelector(".pf-month-save")!;
    const ind = q(el, "pf-unsaved");
    assert.equal(ind.parentElement, row, "its own flex item in the row (it may wrap alone; Save stays beside the select)");
    assert.equal(group.nextElementSibling, ind, "right after the Save slot");
    assert.equal(ind.getAttribute("data-shown"), "false");
    assert.equal(ind.textContent, "Unsaved changes", "the text is kept so its width is reserved");
    assert.ok(group.querySelector(".pf-save-slot"), "a Save-sized placeholder while clean");
    await type(rent(el), "2,300");
    assert.equal(q(el, "pf-unsaved"), ind, "the same element: nothing inserted");
    assert.equal(ind.getAttribute("data-shown"), "true");
    assert.equal(q(el, "pf-month-save").parentElement, group);
    assert.equal(group.querySelector(".pf-save-slot"), null);
    assert.deepEqual([...row.children].map((c) => c.getAttribute("data-testid") ?? c.className.split(" ")[0]), ["pf-label", "pf-month", "pf-month-save", "pf-unsaved"]);
  });
  it("PF-171 / PF-174 (CSS): hidden is visibility, not display:none; Save and its slot are the same width; the indicator never breaks inside", () => {
    const css = readFileSync(new URL(`file://${process.cwd()}/src/styles.css`), "utf8");
    const rule = (sel: string) => css.slice(css.indexOf(`${sel} {`)).split("}")[0];
    assert.match(rule("  .pf-month-save"), /display: inline-flex;[\s\S]*flex: none;/);
    assert.match(rule("  .pf-unsaved"), /flex: none;[\s\S]*white-space: nowrap;/);
    assert.match(rule('  .pf-unsaved[data-shown="false"]'), /visibility: hidden;/);
    assert.doesNotMatch(css, /\.pf-unsaved[^{]*\{[^}]*display: none/);
    assert.match(rule("  .pf-month-save > .pf-button,\n  .pf-save-slot"), /width: 5\.5rem;/);
  });
  it("PF-172 (Q-V3 option c): any field in error shows `Figures leave out fields marked in red.` above the figures; fixing it clears the note; the live numbers stay", async () => {
    const el = await october();
    const note = () => q(el, "pf-figures-note");
    const shown = () => note().getAttribute("data-shown");
    assert.equal(note().textContent, "Figures leave out fields marked in red.");
    assert.equal(shown(), "false", "no error: hidden (its line kept)");
    const at = note();
    await type(rent(el), "-5");
    assert.equal(shown(), "true");
    assert.equal(note(), at, "the same element: nothing inserted");
    assert.equal(ovCell(el, "expenses", "pf-ov-now"), "750", "live numbers kept");
    assert.ok(note().compareDocumentPosition(q(el, "pf-ov-table")) & 4, "above the Overview table");
    await type(rent(el), "2,200");
    assert.equal(shown(), "false", "fixed → cleared");
    await type(q(el, "pf-roic"), "abc");
    assert.equal(shown(), "true", "a rate field too");
    await type(q(el, "pf-roic"), "");
    await type(q(qa(el, "pf-person")[0], "pf-person-tax"), "101");
    assert.equal(shown(), "true", "an income field too");
    await type(q(qa(el, "pf-person")[0], "pf-person-tax"), "");
    assert.equal(shown(), "false");
  });
  it("PF-172 (CSS): hidden by visibility, its line reserved (no display:none)", () => {
    const css = readFileSync(new URL(`file://${process.cwd()}/src/styles.css`), "utf8");
    const rule = (sel: string) => css.slice(css.indexOf(`${sel} {`)).split("}")[0];
    assert.match(rule("  .pf-figures-note"), /min-height: 1\.3rem;/);
    assert.match(rule('  .pf-figures-note[data-shown="false"]'), /visibility: hidden;/);
    assert.doesNotMatch(css, /\.pf-figures-note[^{]*\{[^}]*display: none/);
  });
  it("PF-173: read-only shows no note, even with a stored bad value", async () => {
    await october();
    const ls = dom.window.localStorage;
    const months = JSON.parse(ls.getItem(MONTHS_KEY)!);
    months["2026-10"].fixed[0].amount = "-5";
    ls.setItem(MONTHS_KEY, JSON.stringify(months));
    const ro = await reopen(true);
    assert.equal(ro.querySelector('[data-testid="pf-figures-note"]'), null);
    const rw = await reopen();
    assert.equal(q(rw, "pf-figures-note").getAttribute("data-shown"), "true", "the owner sees it");
  });
  it("PF-169: read-only: no Unsaved changes, no Save, the saved figures", async () => {
    await october();
    const ro = await reopen(true);
    assert.equal(unsaved(ro), "");
    assert.equal(ro.querySelector('[data-testid="pf-unsaved"]'), null, "PF-171: read-only has no indicator element");
    assert.equal(ro.querySelector('[data-testid="pf-month-save"]'), null);
    assert.equal(ovCell(ro, "expenses", "pf-ov-now"), "2,950");
    assert.equal(puts.n, 0);
  });
  it("PF-170: a field in error counts as #143 has it, live: Rent -5 counts 0; ROIC -8 → Rate used and Equity to cover —", async () => {
    const el = await october();
    await type(rent(el), "-5");
    assert.equal(ovCell(el, "expenses", "pf-ov-now"), "750");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-monthly"), "750");
    await type(rent(el), "2,200");
    await type(q(el, "pf-withdrawal"), "4");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-equity"), "885,000");
    await type(q(el, "pf-roic"), "-8");
    assert.equal(text(el, "pf-rate-used"), "—");
    assert.equal(text(q(el, "pf-total-all"), "pf-total-equity"), "—");
    assert.equal(ovCell(el, "expenses", "pf-ov-now"), "2,950", "the amounts do not depend on the rate");
  });
});

describe("#144 PF-166: a save the server refuses, through the real account client and the real API handler", () => {
  // The page's own store (`loadAccountStore`) talks to `handlePersonalFinanceRequest` on PGLite (as
  // account.server.test.ts), with a session lookup that can end. Nothing on the client is faked.
  const pg = new PGlite();
  const db = { query: async <T,>(sql: string, params?: unknown[]) => (await pg.query<T>(sql, params)).rows };
  let session: string | null = "alice";
  const deps = {
    env: { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" },
    getUser: async () => (session ? { id: session, email: `${session}@example.com` } : null),
    getDb: async () => db,
  };
  const realFetch = globalThis.fetch;
  const statuses: number[] = [];
  let ready: Promise<void> | null = null;
  async function setup() {
    ready ??= (async () => {
      await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
      for (const f of ["0010_personal_finance.sql", "0011_access.sql"])
        await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, `file://${process.cwd()}/src/components/personal-finance/`), "utf8"));
      await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', ["alice", "alice@example.com"]);
    })();
    await ready;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await handlePersonalFinanceRequest(new Request(new URL(String(input), "http://localhost"), init), deps);
      statuses.push(res.status);
      return res;
    }) as typeof fetch;
  }
  async function open(): Promise<HTMLElement> {
    container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root!.render(<PersonalFinancePage now={NOW} loadStore={loadAccountStore} />));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    return container;
  }
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("PF-166: the session ends → the real PUT is refused (401): Not saved., Unsaved changes and the live figures stay; signed in again, Save clears both", async () => {
    await setup();
    session = "alice";
    const el = await open();
    await click(q(el, "pf-add-fixed"));
    await type(q(lines(el, "fixed")[0], "pf-monthly"), "1,200");
    await saveNow();
    assert.equal(statuses.at(-1), 200, "a real 2xx save");
    assert.equal(shownUnsaved(el), "");
    await type(q(lines(el, "fixed")[0], "pf-monthly"), "1,500");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-now"), "1,500", "live");
    session = null; // signed out elsewhere: the API now refuses the write
    await saveNow();
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    assert.equal(statuses.at(-1), 401, "the real handler refused it");
    assert.equal(text(el, "pf-save"), "Not saved.");
    assert.equal(shownUnsaved(el), "Unsaved changes");
    assert.ok(q(el, "pf-month-save"), "Save still shown");
    assert.equal((q(lines(el, "fixed")[0], "pf-monthly") as HTMLInputElement).value, "1,500", "the edit stays");
    assert.equal(text(q(el, "pf-ov-expenses"), "pf-ov-now"), "1,500", "the live figure stays");
    session = "alice";
    await saveNow();
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    assert.equal(statuses.at(-1), 200);
    assert.equal(text(el, "pf-save"), "");
    assert.equal(shownUnsaved(el), "");
    // A reload reads the record back from the database.
    await act(async () => root!.unmount());
    container!.remove();
    const again = await open();
    assert.equal(text(q(again, "pf-ov-expenses"), "pf-ov-now"), "1,500");
  });
});
