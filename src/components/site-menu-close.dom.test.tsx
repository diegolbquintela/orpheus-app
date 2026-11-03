// #288 (attachments/header-menu-spec.md "§ #288 close", AC CLS): the overlay closes on a route change, on Back /
// Forward (popstate) and on a back/forward-cache restore (pageshow persisted); the X carries a below-md `Close` label
// in the same button; the Search caret survives a resize after focus left Search (CH17).
import { dom } from "../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SiteMenu } from "./site-menu";

// React's legacy change-event path in jsdom (as access.dom.test.tsx).
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
let root: Root | undefined;
let container: HTMLElement | undefined;
const doc = () => dom.window.document;
async function mount(pathname = "/calculator"): Promise<HTMLElement> {
  container = doc().createElement("div");
  doc().body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<SiteMenu pathname={pathname} />));
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  doc().documentElement.style.overflow = "";
});
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const isOpen = (el: HTMLElement) => !q(el, "site-overlay").hidden;
const where = () => { const a = doc().activeElement; return `focus on ${a?.tagName} ${a?.id || a?.getAttribute("data-testid") || ""}`; };
async function openMenu(el: HTMLElement) {
  const m = q(el, "site-menu-open");
  m.focus();
  await act(async () => m.click());
  assert.ok(isOpen(el));
  assert.equal(doc().documentElement.style.overflow, "hidden");
}

describe("CLS-03 a route change while open closes the menu", () => {
  it("a new pathname closes it, releases the scroll lock and returns focus to Menu (focus was in the dialog)", async () => {
    const el = await mount("/calculator");
    await openMenu(el);
    await act(async () => root!.render(<SiteMenu pathname="/" />));
    assert.equal(isOpen(el), false);
    assert.equal(doc().documentElement.style.overflow, "");
    assert.ok(doc().activeElement === q(el, "site-menu-open"), where());
  });
  it("a new pathname while closed changes nothing (focus not moved)", async () => {
    const el = await mount("/calculator");
    const outside = doc().createElement("button");
    doc().body.appendChild(outside);
    outside.focus();
    await act(async () => root!.render(<SiteMenu pathname="/" />));
    assert.equal(isOpen(el), false);
    assert.ok(doc().activeElement === outside, where());
    outside.remove();
  });
  it("popstate closes it without adding a history entry; focus outside the dialog is not stolen", async () => {
    const el = await mount();
    const len = dom.window.history.length;
    await openMenu(el);
    await act(async () => void dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate", { state: null })));
    assert.equal(isOpen(el), false);
    assert.equal(doc().documentElement.style.overflow, "");
    assert.equal(dom.window.history.length, len);
    await openMenu(el);
    const outside = doc().createElement("button");
    doc().body.appendChild(outside);
    outside.focus();
    await act(async () => void dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate", { state: null })));
    assert.equal(isOpen(el), false);
    assert.ok(doc().activeElement === outside, where());
    outside.remove();
  });
});

describe("CLS-04 a back/forward-cache restore never shows the menu open", () => {
  it("pageshow persisted closes it; a plain pageshow does not", async () => {
    const el = await mount();
    await openMenu(el);
    await act(async () => void dom.window.dispatchEvent(new dom.window.PageTransitionEvent("pageshow", { persisted: false })));
    assert.equal(isOpen(el), true);
    await act(async () => void dom.window.dispatchEvent(new dom.window.PageTransitionEvent("pageshow", { persisted: true })));
    assert.equal(isOpen(el), false);
    assert.equal(doc().documentElement.style.overflow, "");
  });
});

describe("CLS-07 the X's `Close` label (below md only, same button)", () => {
  it("one button, name `Close menu`, the label aria-hidden inside it and md:hidden; md+ classes are #286's", async () => {
    const el = await mount();
    const x = q(el, "site-menu-close");
    const label = q(el, "site-close-label");
    assert.ok(x.contains(label));
    assert.equal(label.textContent, "Close");
    assert.equal(label.getAttribute("aria-hidden"), "true");
    assert.equal(x.getAttribute("aria-label"), "Close menu");
    const cls = (e: Element) => (e.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    assert.ok(cls(label).includes("md:hidden"));
    assert.ok(!cls(label).some((c) => /gold|tabular|tnum/.test(c)));
    assert.deepEqual(cls(x).filter((c) => !c.startsWith("max-md:")).sort(), ["focus-visible:outline-chalk", "h-11", "inline-flex", "items-center", "justify-center", "text-chalk", "w-11"]);
    assert.equal(x.querySelectorAll("button, a, input, [tabindex]").length, 0);
  });
});

describe("CH17 the Search caret survives a resize after focus left Search", () => {
  it("type, caret at 1, Tab away to X, cross 768 px: focus stays on X and the displayed field has the caret at 1", async () => {
    let isPhone = true;
    const listeners = new Set<() => void>();
    const proto = dom.window.HTMLElement.prototype as unknown as { checkVisibility?: () => boolean };
    proto.checkVisibility = function (this: HTMLElement) {
      if (this.closest("[hidden]")) return false;
      return isPhone ? !this.closest(".max-md\\:hidden") : !this.closest(".md\\:hidden");
    };
    const w = dom.window as unknown as { matchMedia?: unknown };
    const before = w.matchMedia;
    w.matchMedia = (query: string) => ({
      get matches() {
        return query === "(max-width: 47.99rem)" && isPhone;
      },
      media: query,
      addEventListener: (_: string, f: () => void) => listeners.add(f),
      removeEventListener: (_: string, f: () => void) => listeners.delete(f),
    });
    try {
      const el = await mount();
      await act(async () => q(el, "site-search-open").click());
      const f0 = q(el, "site-search-block-mobile").querySelector<HTMLInputElement>("input")!;
      await act(async () => {
        f0.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(f0, "vod");
        f0.dispatchEvent(new dom.window.Event("keyup", { bubbles: true }));
        f0.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      f0.setSelectionRange(1, 1);
      // The caret moved by arrow keys: the key's keyup records it.
      await act(async () => void f0.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true })));
      q(el, "site-menu-close").focus();
      isPhone = false;
      await act(async () => {
        for (const f of listeners) f();
      });
      const f1 = q(el, "site-search-block").querySelector<HTMLInputElement>("input")!;
      assert.ok(doc().activeElement === q(el, "site-menu-close"), where());
      assert.equal(f1.value, "vod");
      assert.deepEqual([f1.selectionStart, f1.selectionEnd], [1, 1]);
    } finally {
      delete proto.checkVisibility;
      w.matchMedia = before;
    }
  });
});
