// #286 (HDR-03, HDR-07..HDR-09): the header's overlay in use: open from Menu or Search, close with X or Esc, the focus
// trap, focus back to the trigger, the inert search placeholder.
import { dom } from "../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SiteMenu } from "./site-menu";

let root: Root | undefined;
let container: HTMLElement | undefined;
const doc = () => dom.window.document;
async function mount(): Promise<HTMLElement> {
  container = doc().createElement("div");
  doc().body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<SiteMenu pathname="/calculator" />));
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  doc().documentElement.style.overflow = "";
});
const q = <T extends HTMLElement = HTMLElement>(el: HTMLElement, id: string) =>
  el.querySelector<T>(`[data-testid="${id}"]`)!;
const activeId = () => (doc().activeElement as HTMLElement | null)?.getAttribute("data-testid") ?? null;
const click = (b: HTMLElement) => act(async () => b.click());
const key = async (target: EventTarget, k: string, shiftKey = false) => {
  const e = new dom.window.KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true });
  await act(async () => void target.dispatchEvent(e));
  return e;
};

describe("HDR-03 the Menu button opens a full-page overlay; X closes it", () => {
  it("opens (not hidden, aria-expanded, scroll locked, focus on X) and X closes it with focus back on Menu", async () => {
    const el = await mount();
    const menu = q<HTMLButtonElement>(el, "site-menu-open");
    menu.focus();
    await click(menu);
    assert.equal(q(el, "site-overlay").hidden, false);
    assert.equal(menu.getAttribute("aria-expanded"), "true");
    assert.equal(q(el, "site-search-open").getAttribute("aria-expanded"), "false");
    assert.equal(doc().documentElement.style.overflow, "hidden");
    assert.equal(activeId(), "site-menu-close");
    assert.equal(q(el, "site-menu-close").getAttribute("aria-label"), "Close menu");
    await click(q(el, "site-menu-close"));
    assert.equal(q(el, "site-overlay").hidden, true);
    assert.equal(menu.getAttribute("aria-expanded"), "false");
    assert.equal(doc().documentElement.style.overflow, "");
    assert.equal(activeId(), "site-menu-open");
  });
});

describe("HDR-08 Esc closes; focus returns to the trigger", () => {
  it("Esc closes the menu opened from Menu, focus back on Menu", async () => {
    const el = await mount();
    await click(q(el, "site-menu-open"));
    const e = await key(doc(), "Escape");
    assert.equal(e.defaultPrevented, true);
    assert.equal(q(el, "site-overlay").hidden, true);
    assert.equal(activeId(), "site-menu-open");
  });
  it("Esc closes the overlay opened from Search, focus back on Search", async () => {
    const el = await mount();
    await click(q(el, "site-search-open"));
    await key(doc(), "Escape");
    assert.equal(q(el, "site-overlay").hidden, true);
    assert.equal(activeId(), "site-search-open");
  });
  it("other keys do nothing while open; Esc does nothing while closed", async () => {
    const el = await mount();
    const closed = await key(doc(), "Escape");
    assert.equal(closed.defaultPrevented, false);
    await click(q(el, "site-menu-open"));
    await key(doc(), "Enter");
    assert.equal(q(el, "site-overlay").hidden, false);
  });
});

describe("HDR-09 focus is trapped in the open overlay", () => {
  it("Tab on the last item goes to X; Shift-Tab on X goes to the last item; Tab in between is left alone", async () => {
    const el = await mount();
    await click(q(el, "site-menu-open"));
    const ov = q(el, "site-overlay");
    const all = [...ov.querySelectorAll<HTMLElement>("a[href], button, input")];
    const last = all[all.length - 1];
    assert.equal(last.getAttribute("href"), "/account");
    last.focus();
    const t = await key(last, "Tab");
    assert.equal(t.defaultPrevented, true);
    assert.equal(activeId(), "site-menu-close");
    const s = await key(q(el, "site-menu-close"), "Tab", true);
    assert.equal(s.defaultPrevented, true);
    assert.equal(doc().activeElement?.getAttribute("href"), "/account");
    const mid = ov.querySelector<HTMLElement>('a[href="/dashboard"]')!;
    mid.focus();
    const m = await key(mid, "Tab");
    assert.equal(m.defaultPrevented, false);
    const sm = await key(mid, "Tab", true);
    assert.equal(sm.defaultPrevented, false);
  });
});

describe("HDR-07 Search opens the overlay with an inert placeholder field", () => {
  it("focus in the field; typing and Enter search nothing (no fetch, no navigation, no form)", async () => {
    let fetches = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches++;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const el = await mount();
      const before = dom.window.location.href;
      await click(q(el, "site-search-open"));
      assert.equal(q(el, "site-search-open").getAttribute("aria-expanded"), "true");
      assert.equal(q(el, "site-menu-open").getAttribute("aria-expanded"), "false");
      const input = q<HTMLInputElement>(el, "site-search");
      assert.equal(activeId(), "site-search");
      assert.equal(input.type, "search");
      assert.equal(input.placeholder, "Search Orpheus");
      assert.equal(input.closest("form"), null);
      assert.equal(doc().getElementById(input.getAttribute("aria-describedby")!)!.textContent, "Search is coming soon.");
      assert.equal(el.querySelector(`label[for="${input.id}"]`)!.textContent, "Search");
      await key(input, "Enter");
      assert.equal(fetches, 0);
      assert.equal(dom.window.location.href, before);
      assert.equal(q(el, "site-overlay").hidden, false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
