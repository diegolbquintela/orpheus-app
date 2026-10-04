// Click-level test for the holdings delete guard (#37, #38; QA N1 on #45): renders the real
// HoldingsSection in jsdom with a mocked fetch and clicks the buttons like a user would.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HoldingsSection } from "./holdings";

type Call = { url: string; method: string };
let calls: Call[];
let container: HTMLElement;
let root: Root;
let pendingRefetch: Promise<void>;

function mockFetch(status: number) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return new Response(status === 200 ? '{"deleted":true}' : '{"error":"Server error."}', {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function render() {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <HoldingsSection
        holdings={[{ id: 7, symbol: "KO", shares: "10", avgCost: "60" }]}
        prices={{ KO: { close: "70", currency: "USD", sessionDate: "2026-10-01", pending: false } }}
        baseCurrency="CAD"
        valuation={null}
        storage="ok"
        // The page's refetch (router.invalidate) is slow on Vercel: keep it pending, so the row stays on screen.
        onChanged={() => pendingRefetch}
      />,
    );
  });
}

const row = () => container.querySelector('[data-testid="holding-row"][data-symbol="KO"]') as HTMLElement;
const button = (name: string) => [...row().querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;
const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
};
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  calls = [];
  pendingRefetch = new Promise(() => {});
  dom.window.confirm = () => true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("holdings delete guard (click level, mocked fetch)", () => {
  it("a successful DELETE: one request; further clicks on the row send nothing; the row shows 'Deleted'", async () => {
    mockFetch(200);
    await render();
    const del = button("Delete")!;
    await click(del);
    await click(del); // second click on the same element right away
    await settle();
    assert.deepEqual(calls, [{ url: "/api/dashboard/holdings/7", method: "DELETE" }]);
    assert.equal(row().querySelector('[data-testid="holding-deleted"]')?.textContent?.trim(), "Deleted");
    assert.equal(button("Delete"), undefined, "no Delete button on a deleted row");
    assert.equal(button("Edit"), undefined, "no Edit button on a deleted row");
    assert.equal(row().getAttribute("aria-busy"), "true");
    // More clicks anywhere in the row (and on the detached old button) still send nothing.
    await click(row());
    for (const el of row().querySelectorAll("*")) await click(el);
    await click(del);
    await settle();
    assert.equal(calls.length, 1);
  });

  it("a failed DELETE re-enables the buttons, shows the error, and lets the user retry", async () => {
    mockFetch(500);
    await render();
    await click(button("Delete")!);
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(row().querySelector('[data-testid="holding-deleted"]'), null);
    assert.equal(button("Delete")!.disabled, false);
    assert.equal(button("Edit")!.disabled, false);
    assert.match(row().querySelector('[role="alert"]')?.textContent ?? "", /Server error\./);
    await click(button("Delete")!);
    await settle();
    assert.equal(calls.length, 2, "a retry after an error sends a new DELETE");
  });

  it("cancelling the confirm sends nothing", async () => {
    mockFetch(200);
    dom.window.confirm = () => false;
    await render();
    await click(button("Delete")!);
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(button("Delete")!.disabled, false);
  });
});
