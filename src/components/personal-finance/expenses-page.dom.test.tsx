// Personal finance page (#84–#86, spec attachments/personal-finance-spec.md; PF-02..07, PF-11..20) in jsdom with the real component.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { STORAGE_KEY } from "@/lib/finance/expenses";
import { INCOME_KEY } from "@/lib/finance/income";
import { EQUITY_KEY } from "@/lib/finance/equity";
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
      ["Income", "Income table", "Expenses", "Fixed", "Variable"],
    );
    for (const head of qa(el, "pf-head"))
      assert.deepEqual(
        [...head.children].map((c) => c.textContent),
        ["Name", "% of income", "% of expenses", "Monthly", "Yearly", "Equity to cover", "Account"],
      );
    assert.deepEqual(
      [...el.querySelectorAll("button")].map((b) => b.textContent),
      ["↳ Add person", "↳ Add expense", "↳ Add expense"],
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
});
