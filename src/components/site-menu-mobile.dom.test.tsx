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

describe("HBM-03 below md: links first as full-width rows, Search after them, owner link fail-closed", () => {
  it("links in order by full name, each a full-width 48 px row with a hairline; the list is ordered before Search", async () => {
    const el = await mount();
    const links = [...el.querySelectorAll('[data-testid="site-menu-links"] a')];
    assert.deepEqual(links.map((a) => a.textContent), NAMES);
    for (const a of links) assert.deepEqual(mobile(a), ["max-md:flex", "max-md:w-full", "max-md:min-h-12", "max-md:border-b", "max-md:border-hair"]);
    const main = q(el, "site-menu-main");
    assert.deepEqual(mobile(main), ["max-md:flex", "max-md:flex-col"]);
    assert.ok(mobile(q(el, "site-menu-links")).includes("max-md:order-1"));
    const s = q(el, "site-search-block");
    assert.ok(mobile(s).includes("max-md:order-2"));
    assert.ok(s.contains(q(el, "site-search")) && s.contains(q(el, "site-search-note")));
    // DOM order unchanged (focus trap / HDR-09): Search block, then the list.
    assert.equal(main.firstElementChild, s);
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
