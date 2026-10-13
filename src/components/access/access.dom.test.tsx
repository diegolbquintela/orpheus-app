// #90 (ROLE-03, -04, -06, -08, -10, -14): the /account page, the denied page and the read-only Personal Finance page in
// jsdom with the real components.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccountPage } from "./account-page";
import { DeniedPage } from "./denied";
import { PersonalFinancePage } from "@/components/personal-finance/expenses-page";
import { loadLocalStore } from "@/lib/finance/account-client";
import { INCOME_KEY } from "@/lib/finance/income";
import { STORAGE_KEY } from "@/lib/finance/expenses";
import type { AccountPageData } from "@/lib/access/gate";

let root: Root | undefined;
let container: HTMLElement | undefined;
async function render(node: ReactNode): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  dom.window.localStorage.clear();
});
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`);
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
async function type(field: Element, value: string) {
  const el = field as HTMLInputElement;
  await act(async () => {
    el.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(
      el,
      value,
    );
    el.dispatchEvent(new dom.window.Event("keyup", { bubbles: true }));
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

const base: AccountPageData = {
  signedIn: true,
  name: "Diego",
  email: "owner@example.com",
  owner: true,
  mustChange: false,
  grants: { personal_finance: "read_write", dashboard: "read_write" },
  roles: ["Owner"],
  people: [
    {
      id: "o",
      name: "Diego",
      email: "owner@example.com",
      owner: true,
      grants: { personal_finance: "read_write", dashboard: "read_write" },
    },
    {
      id: "c",
      name: "Cfo",
      email: "cfo@example.com",
      owner: false,
      grants: { personal_finance: "read", dashboard: "none" },
    },
  ],
  audit: null,
};

describe("/account page (#90)", () => {
  it("ROLE-03 / ROLE-04: the owner sees 01 You, 02 Password, 03 Email (blocked), 04 Who has access, 05 Grant access", async () => {
    const el = await render(<AccountPage data={base} />);
    assert.equal(el.querySelector("h1")?.textContent, "Account");
    assert.deepEqual(
      [...el.querySelectorAll("h2")].map((h) => h.textContent),
      ["You", "Password", "Email", "Who has access", "Grant access"],
    );
    assert.deepEqual(
      [...el.querySelectorAll(".pf-label")].map((p) => p.textContent),
      ["01", "02", "03", "04", "05"],
    );
    assert.equal(q(el, "account-email")?.textContent, "owner@example.com");
    assert.equal(q(el, "account-role")?.textContent, "Owner");
    assert.equal(q(el, "account-owner-email")?.textContent, "Owner email can't be changed here.");
    assert.equal(q(el, "account-email-form"), null);
    assert.equal(q(el, "account-sign-out")?.textContent, "Sign out");
    assert.equal(el.querySelectorAll('[data-testid="account-who-row"]').length, 2);
    // Only non-owners are editable.
    const rows = [...el.querySelectorAll('[data-testid="account-grant-row"]')];
    assert.deepEqual(
      rows.map((r) => r.getAttribute("data-email")),
      ["cfo@example.com"],
    );
    const select = rows[0].querySelector("select") as HTMLSelectElement;
    assert.deepEqual(
      [...select.options].map((o) => o.textContent),
      ["No access", "Read", "Read and write"],
    );
    assert.equal(select.value, "read");
    assert.ok(q(el, "account-add-form"));
    assert.equal(q(el, "account-add-submit")?.textContent, "Create account");
  });

  it("a grantee: no 05; the email form; their role lines", async () => {
    const el = await render(
      <AccountPage
        data={{
          ...base,
          owner: false,
          email: "cfo@example.com",
          roles: ["CFO · Personal Finance · Read"],
          people: base.people,
        }}
      />,
    );
    assert.deepEqual(
      [...el.querySelectorAll("h2")].map((h) => h.textContent),
      ["You", "Password", "Email", "Who has access"],
    );
    assert.equal(q(el, "account-grant"), null);
    assert.ok(q(el, "account-email-form"));
    assert.equal(q(el, "account-role")?.textContent, "CFO · Personal Finance · Read");
  });

  it("ROLE-08: a temporary password shows only You and Password, with the one line", async () => {
    const el = await render(
      <AccountPage data={{ ...base, owner: false, mustChange: true, people: [] }} />,
    );
    assert.deepEqual(
      [...el.querySelectorAll("h2")].map((h) => h.textContent),
      ["You", "Password"],
    );
    assert.equal(q(el, "account-must-change")?.textContent, "Set a new password to continue.");
  });

  it("ROLE-05: the password field checks run before any request", async () => {
    let fetches = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches++;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const el = await render(<AccountPage data={base} />);
      const save = q(el, "account-password-save") as HTMLButtonElement;
      await act(async () => save.click());
      assert.equal(q(el, "account-password-error")?.textContent, "Enter your current password.");
      await type(q(el, "account-current-password")!, "current-pass-1");
      await type(q(el, "account-new-password")!, "short");
      await act(async () => save.click());
      assert.equal(q(el, "account-password-error")?.textContent, "Use 8 or more characters.");
      await type(q(el, "account-new-password")!, "long-enough-1");
      await type(q(el, "account-confirm-password")!, "long-enough-2");
      await act(async () => save.click());
      assert.equal(q(el, "account-password-error")?.textContent, "Passwords don't match.");
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("denied and read-only (#90)", () => {
  it("ROLE-14: the denied page: the page name, one line, Account and Home; nothing else", async () => {
    const el = await render(<DeniedPage surface="personal_finance" />);
    assert.equal(el.querySelector("h1")?.textContent, "Personal Finance");
    assert.equal(
      q(el, "access-denied-line")?.textContent,
      "You don't have access to Personal Finance.",
    );
    assert.deepEqual(
      [...el.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]),
      [
        ["Account", "/account"],
        ["Home", "/"],
      ],
    );
    await act(async () => root?.unmount());
    const dash = await render(<DeniedPage surface="dashboard" />);
    assert.equal(
      q(dash, "access-denied-line")?.textContent,
      "You don't have access to the Dashboard.",
    );
  });

  it("ROLE-10: read-only Personal Finance: `Read only`; every field, select and action disabled; the toggles still work", async () => {
    dom.window.localStorage.setItem(
      INCOME_KEY,
      JSON.stringify({
        people: [
          {
            id: "p1",
            name: "Ana",
            wages: "100000",
            bonus: "",
            tax: "30",
            share: "100",
            countWages: true,
            countBonus: true,
          },
        ],
      }),
    );
    dom.window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fixed: [{ id: "l1", name: "Rent", amount: "2000", per: "month", equity: "", account: "" }],
        variable: [],
        accounts: [],
      }),
    );
    const el = await render(
      <PersonalFinancePage readOnly loadStore={loadLocalStore} now={new Date(2026, 9, 11, 12)} />,
    );
    assert.equal(q(el, "read-only")?.textContent, "Read only");
    const controls = [
      ...el.querySelectorAll("input, select, textarea, button"),
    ] as HTMLInputElement[];
    const open = controls.filter((c) => !c.matches(":disabled"));
    assert.ok(controls.length > 10);
    assert.deepEqual(
      open.map((c) => c.getAttribute("data-testid")),
      [
        "pf-month",
        "pf-toggle-income",
        "pf-toggle-expenses",
        "pf-toggle-summary",
        "pf-toggle-overview",
      ],
      "only the month control (#112, PF-57) and the section toggles stay enabled",
    );
    await act(async () => (q(el, "pf-toggle-income") as HTMLButtonElement).click());
    assert.equal(q(el, "pf-toggle-income")?.getAttribute("aria-expanded"), "false");
  });

  it("the owner's page has no lock and no Read only line", async () => {
    const el = await render(
      <PersonalFinancePage loadStore={loadLocalStore} now={new Date(2026, 9, 11, 12)} />,
    );
    assert.equal(q(el, "read-only"), null);
    assert.equal(q(el, "pf-lock"), null);
  });

  it("AUDIT-08 (#91): the owner's 06 Activity: columns, ET times, masked codes; empty line; Show older only with more", async () => {
    const events = [
      {
        id: 2,
        at: "2026-10-12T14:05:00.000Z",
        actor: "p-0a1b2c3d",
        role: "cfo",
        action: "access.denied",
        target: null,
        outcome: "denied",
        detail: "personal_finance PUT",
      },
      {
        id: 1,
        at: "2026-10-12T13:00:00.000Z",
        actor: "owner",
        role: "owner",
        action: "access.add",
        target: "p-0a1b2c3d",
        outcome: "ok",
        detail: "pf:read dash:none",
      },
    ];
    const el = await render(<AccountPage data={{ ...base, audit: { events, more: true } }} />);
    assert.equal([...el.querySelectorAll("h2")].at(-1)?.textContent, "Activity");
    assert.equal(
      [...el.querySelectorAll(".pf-label")].filter((p) => /^0\d$/.test(p.textContent ?? "")).at(-1)
        ?.textContent,
      "06",
    );
    assert.deepEqual(
      [...el.querySelectorAll("th")].map((t) => t.textContent),
      ["When", "Who", "Role", "Action", "Target", "Result"],
    );
    const cells = [...el.querySelectorAll('[data-testid="account-activity-row"]')].map((r) =>
      [...r.querySelectorAll("td")].map((c) => c.textContent),
    );
    assert.deepEqual(cells, [
      [
        "2026-10-12 10:05 ET",
        "p-0a1b2c3d",
        "cfo",
        "access.denied (personal_finance PUT)",
        "—",
        "denied",
      ],
      [
        "2026-10-12 09:00 ET",
        "owner",
        "owner",
        "access.add (pf:read dash:none)",
        "p-0a1b2c3d",
        "ok",
      ],
    ]);
    assert.ok(q(el, "account-activity-older"));
    const empty = await render(
      <AccountPage data={{ ...base, audit: { events: [], more: false } }} />,
    );
    assert.equal(q(empty, "account-activity-empty")?.textContent, "No activity yet.");
    assert.equal(q(empty, "account-activity-older"), null);
  });
});
