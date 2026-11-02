// #287 (HBM-03, HBM-05..HBM-08; attachments/header-menu-spec.md "§ #287 mobile"): the #286 overlay below md (768 px).
// jsdom has no layout, so the below-md layout is asserted by its classes (every #287 class is `max-md:` or
// `md:hidden`) and the md+ classes are pinned to #286's; the real widths are checked in Chromium (qa/tools/site.mjs,
// qa/tools/site-shell.mjs).
import { dom } from "../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteMenu } from "./site-menu";

let root: Root | undefined;
let container: HTMLElement | undefined;
const doc = () => dom.window.document;
async function mount(ownerLink: { href: string; label: string; short: string } | null = null): Promise<HTMLElement> {
  container = doc().createElement("div");
  doc().body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<SiteMenu pathname="/calculator" ownerLink={ownerLink} />));
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  doc().documentElement.style.overflow = "";
});
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
const cls = (e: Element) => (e.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
const mobile = (e: Element) => cls(e).filter((c) => c.startsWith("max-md:"));
const desktop = (e: Element) => cls(e).filter((c) => !c.startsWith("max-md:")).sort();
const OWNER = { href: "/renaissance", label: "Renaissance Man", short: "RM" };
const NAMES = ["Orpheus", "Calculator", "Dashboard", "Personal Finance", "Account"];
// #286's OVERLAY_LINK (src/components/site-menu.tsx), which md+ must keep exactly (HBM-08).
const LINK_286 = "inline-flex min-h-11 items-center text-2xl leading-tight text-dim underline-offset-[8px] decoration-1 sm:text-3xl aria-[current=page]:text-chalk aria-[current=page]:underline focus-visible:outline-chalk".split(" ").sort();

// #287 Q5(b) (2026-11-02): the Tab order. jsdom has no CSS, so a phone is simulated with a checkVisibility that hides
// `max-md:hidden` (below md) and the dialog's `hidden`, plus a matchMedia that matches (the mobile slot is rendered
// below md only); without them the component assumes desktop.
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";
const order = (el: HTMLElement) =>
  [...q(el, "site-overlay").querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((e) => typeof e.checkVisibility !== "function" || e.checkVisibility())
    .map((e) => e.getAttribute("data-testid") ?? e.textContent);
function phone() {
  const proto = dom.window.HTMLElement.prototype as unknown as { checkVisibility?: () => boolean };
  proto.checkVisibility = function (this: HTMLElement) {
    return !this.closest('.max-md\\:hidden') && !this.closest("[hidden]");
  };
  const w = dom.window as unknown as { matchMedia?: unknown };
  const before = w.matchMedia;
  w.matchMedia = (query: string) => ({ matches: query === "(max-width: 47.99rem)", media: query, addEventListener() {}, removeEventListener() {} });
  return () => {
    delete proto.checkVisibility;
    w.matchMedia = before;
  };
}
const press = async (t: HTMLElement, shiftKey = false) => {
  const e = new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  await act(async () => void t.dispatchEvent(e));
  return e.defaultPrevented;
};

describe("HBM-03 below md: links first as full-width rows, Search after them, owner link fail-closed", () => {
  it("links in order by full name, each a full-width 48 px row with a hairline; Search (its own slot) after them", async () => {
    const undo = phone();
    const el = await mount().finally(undo);
    const links = [...el.querySelectorAll('[data-testid="site-menu-links"] a')];
    assert.deepEqual(links.map((a) => a.textContent), NAMES);
    for (const a of links) assert.deepEqual(mobile(a), ["max-md:flex", "max-md:w-full", "max-md:min-h-12", "max-md:border-b", "max-md:border-hair"]);
    const main = q(el, "site-menu-main");
    // Q5(b): DOM order desktop search slot, list, mobile search slot; no CSS `order` tricks left.
    assert.deepEqual([...main.children].map((c) => c.getAttribute("data-testid")), ["site-search-block", "site-menu-links", "site-search-block-mobile"]);
    for (const e of el.querySelectorAll("*")) assert.ok(!cls(e).some((c) => /(^|:)order-/.test(c)), e.outerHTML.slice(0, 80));
    assert.ok(cls(q(el, "site-search-block")).includes("max-md:hidden"));
    assert.ok(cls(q(el, "site-search-block-mobile")).includes("md:hidden"));
  });
  it("md and wider: the mobile slot is not rendered at all (#286's DOM: search block, then the list)", async () => {
    const el = await mount();
    assert.deepEqual([...q(el, "site-menu-main").children].map((c) => c.getAttribute("data-testid")), ["site-search-block", "site-menu-links"]);
  });
  it("two search slots: unique ids, each label and aria-describedby points at its own field and note", async () => {
    const undo = phone();
    const el = await mount().finally(undo);
    const ids = [...el.querySelectorAll("[id]")].map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    const inputs = [...el.querySelectorAll<HTMLInputElement>('[data-testid="site-search"]')];
    assert.equal(inputs.length, 2);
    for (const i of inputs) {
      const slot = i.closest("[data-search-slot]")!;
      assert.equal(slot.querySelector("label")!.htmlFor, i.id);
      assert.equal(slot.querySelector('[data-testid="site-search-note"]')!.id, i.getAttribute("aria-describedby"));
    }
  });
  it("Renaissance Man only with an owner link, before Account; never in a non-owner's HTML", async () => {
    const el = await mount(OWNER);
    assert.deepEqual([...el.querySelectorAll('[data-testid="site-menu-links"] a')].map((a) => a.textContent), [...NAMES.slice(0, 4), "Renaissance Man", "Account"]);
    for (const p of ["/", "/calculator", "/personal-finance"]) assert.doesNotMatch(renderToStaticMarkup(<SiteMenu pathname={p} />), /renaissance|site-menu-owner/i, p);
  });
});

describe("HBM-05 / HBM-06 the #286 dialog behaviour holds", () => {
  it("Esc closes and focus returns to Menu; Tab on Account (DOM last) wraps to X", async () => {
    const el = await mount();
    const menu = q(el, "site-menu-open");
    menu.focus();
    await act(async () => menu.click());
    assert.equal(q(el, "site-overlay").hidden, false);
    assert.equal(menu.getAttribute("aria-expanded"), "true");
    const all = [...q(el, "site-overlay").querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")];
    assert.equal(all.at(-1)!.getAttribute("href"), "/account");
    all.at(-1)!.focus();
    const t = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    await act(async () => void all.at(-1)!.dispatchEvent(t));
    assert.equal(t.defaultPrevented, true);
    assert.equal(doc().activeElement?.getAttribute("data-testid"), "site-menu-close");
    await act(async () => void doc().dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(q(el, "site-overlay").hidden, true);
    assert.equal(doc().activeElement, menu);
  });
});

describe("HBM-06 (amended 2026-11-02, Q5(b)) Tab order follows the layout", () => {
  it("phone: X, the links (owner: Renaissance Man before Account), then Search; the trap wraps Search -> X and back", async () => {
    const undo = phone();
    try {
      for (const owner of [null, OWNER]) {
        const el = await mount(owner);
        await act(async () => q(el, "site-menu-open").click());
        const names = owner ? [...NAMES.slice(0, 4), "Renaissance Man", "Account"] : NAMES;
        assert.deepEqual(order(el), ["site-menu-close", ...names, "site-search"]);
        const field = q(el, "site-search-block-mobile").querySelector<HTMLElement>("input")!;
        field.focus();
        assert.equal(await press(field), true);
        assert.equal(doc().activeElement?.getAttribute("data-testid"), "site-menu-close");
        assert.equal(await press(q(el, "site-menu-close"), true), true);
        assert.equal(doc().activeElement, field);
        await act(async () => root?.unmount());
        container?.remove();
      }
      // Search opens with focus in the phone's field.
      const el = await mount();
      await act(async () => q(el, "site-search-open").click());
      assert.equal(doc().activeElement, q(el, "site-search-block-mobile").querySelector("input"));
    } finally {
      undo();
    }
  });
  it("desktop (768 / 1440): X, Search, then the links, as #286; Tab on Account wraps to X", async () => {
    const el = await mount();
    await act(async () => q(el, "site-menu-open").click());
    assert.deepEqual(order(el), ["site-menu-close", "site-search", ...NAMES]);
    const all = [...q(el, "site-overlay").querySelectorAll<HTMLElement>(FOCUSABLE)];
    all.at(-1)!.focus();
    assert.equal(await press(all.at(-1)!), true);
    assert.equal(doc().activeElement?.getAttribute("data-testid"), "site-menu-close");
    await act(async () => q(el, "site-menu-close").click());
    await act(async () => q(el, "site-search-open").click());
    assert.equal(doc().activeElement, q(el, "site-search-block").querySelector("input"));
  });
});

describe("HBM-07 the panel's lyre + Orpheus Wisdom block, safe area, motion", () => {
  it("below md only, a div (not a second <footer>), lyre + exactly `Orpheus Wisdom`, safe-area bottom padding", async () => {
    const el = await mount();
    const f = q(el, "site-menu-footer");
    assert.ok(q(el, "site-overlay").contains(f));
    assert.equal(f.tagName, "DIV");
    assert.ok(cls(f).includes("md:hidden"));
    assert.ok(cls(f).some((c) => c.includes("env(safe-area-inset-bottom)")));
    assert.ok(f.querySelector("svg"));
    assert.equal(f.textContent, "Orpheus Wisdom");
    assert.equal(el.querySelectorAll("footer").length, 0);
  });
  it("the overlay fades in below md only; opacity/transform only; none under reduced motion", async () => {
    const el = await mount();
    assert.ok(cls(q(el, "site-overlay")).includes("site-overlay-in"));
    const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    const kf = css.match(/@keyframes site-overlay-in \{([\s\S]*?)\n\}/)?.[1] ?? "";
    assert.ok(kf, "keyframes");
    for (const prop of kf.matchAll(/([a-z-]+):/g)) assert.ok(["opacity", "transform"].includes(prop[1]), prop[1]);
    assert.match(css, /@media \(max-width: 47\.99rem\) and \(prefers-reduced-motion: no-preference\) \{\n {2}\.site-overlay-in:not\(\[hidden\]\) \{ animation: site-overlay-in/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n {2}\.site-overlay-in \{ animation: none; \}/);
    assert.equal(css.match(/\.site-overlay-in/g)?.length, 2);
  });
});

describe("HBM-08 md and wider keep #286 exactly", () => {
  it("without the max-md: classes every element carries #286's classes; the panel block is md:hidden", async () => {
    const el = await mount();
    for (const a of el.querySelectorAll('[data-testid="site-menu-links"] a')) assert.deepEqual(desktop(a), LINK_286);
    assert.deepEqual(desktop(q(el, "site-menu-links")), ["flex", "flex-col", "gap-1", "mt-8"]);
    assert.deepEqual(desktop(q(el, "site-menu-main")), ["min-w-0"]);
    assert.deepEqual(desktop(q(el, "site-search-block")), []);
    assert.deepEqual(desktop(q(el, "site-overlay")), ["bg-night", "fixed", "inset-0", "overflow-y-auto", "site-overlay-in", "text-chalk", "z-[60]"]);
    for (const e of q(el, "site-overlay").querySelectorAll("*")) {
      if (e.closest('[data-testid="site-menu-footer"]')) continue;
      assert.ok(!cls(e).some((c) => c.startsWith("md:hidden")), e.outerHTML.slice(0, 80));
    }
  });
});
