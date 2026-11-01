// #286 (HDR-06; keeps RM-21, supersedes RM-22..RM-24): the owner-only "Renaissance Man" link now sits in the menu
// overlay, by its full name, right before Account. The server decides (the root loader, `renaissanceNavLink`, tested
// in src/lib/renaissance/api.server.test.ts); the header shows the link only when given one, and with none its HTML
// holds nothing about /renaissance (fail-closed).
import { dom } from "../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteMenu } from "./site-menu";

let root: Root | undefined;
let container: HTMLElement | undefined;
async function render(node: ReactElement): Promise<HTMLElement> {
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
});

const OWNER = { href: "/renaissance", label: "Renaissance Man", short: "RM" };
const PATHS = ["/", "/calculator", "/dashboard", "/personal-finance", "/account", "/renaissance", "/nope"];
const overlayLinks = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-testid="site-menu-links"] a')].map((a) => [a.getAttribute("href"), a.textContent]);

describe("HDR-06 / RM-21 no owner link for anyone but the owner (fail-closed)", () => {
  it("no ownerLink (omitted, null or undefined): identical markup, nothing about /renaissance", () => {
    for (const p of PATHS) {
      const base = renderToStaticMarkup(<SiteMenu pathname={p} />);
      assert.equal(renderToStaticMarkup(<SiteMenu pathname={p} ownerLink={null} />), base, p);
      assert.equal(renderToStaticMarkup(<SiteMenu pathname={p} ownerLink={undefined} />), base, p);
      assert.doesNotMatch(base, /renaissance|\bRM\b|site-menu-owner/i, p);
      assert.equal(base.match(/<a /g)?.length, 6, p); // logo, five overlay links (no Get Started, HDR-02 amended)
    }
  });
  it("the overlay's items: Orpheus, Calculator, Dashboard, Personal Finance, Account", async () => {
    const el = await render(<SiteMenu pathname="/" />);
    assert.deepEqual(overlayLinks(el), [
      ["/", "Orpheus"],
      ["/calculator", "Calculator"],
      ["/dashboard", "Dashboard"],
      ["/personal-finance", "Personal Finance"],
      ["/account", "Account"],
    ]);
    assert.equal(el.querySelector('[data-testid="site-menu-owner"]'), null);
  });
});

describe("HDR-06 the owner's link", () => {
  it("one link to /renaissance in the overlay, right before Account, named Renaissance Man in full (no RM)", async () => {
    const el = await render(<SiteMenu pathname="/" ownerLink={OWNER} />);
    assert.deepEqual(overlayLinks(el), [
      ["/", "Orpheus"],
      ["/calculator", "Calculator"],
      ["/dashboard", "Dashboard"],
      ["/personal-finance", "Personal Finance"],
      ["/renaissance", "Renaissance Man"],
      ["/account", "Account"],
    ]);
    assert.equal(el.querySelectorAll('a[href="/renaissance"]').length, 1);
    const a = el.querySelector<HTMLAnchorElement>('[data-testid="site-menu-owner"] a')!;
    assert.equal(a.querySelectorAll("span").length, 0);
    assert.match(a.className, /(^| )min-h-11( |$)/);
    assert.match(a.className, /(^| )text-dim( |$)/);
    assert.equal(a.getAttribute("aria-current"), null);
    assert.doesNotMatch(el.textContent!, /\bRM\b/);
    // Not in the bar.
    assert.equal(el.querySelector('[data-testid="site-bar"] a[href="/renaissance"]'), null);
  });
  it("aria-current=page on /renaissance only; the other items keep their own current marks", async () => {
    const el = await render(<SiteMenu pathname="/renaissance" ownerLink={OWNER} />);
    assert.deepEqual(
      [...el.querySelectorAll('nav a[aria-current="page"]')].map((a) => a.getAttribute("href")),
      ["/renaissance"],
    );
    const pf = await render(<SiteMenu pathname="/personal-finance" ownerLink={OWNER} />);
    assert.deepEqual(
      [...pf.querySelectorAll('nav a[aria-current="page"]')].map((a) => a.getAttribute("href")),
      ["/personal-finance"],
    );
  });
  it("the owner's header is the anonymous header plus exactly one overlay item; the bar is unchanged", () => {
    const anon = renderToStaticMarkup(<SiteMenu pathname="/" />);
    const owner = renderToStaticMarkup(<SiteMenu pathname="/" ownerLink={OWNER} />);
    const item = owner.match(/<li data-testid="site-menu-owner">.*?<\/li>/)![0];
    assert.equal(owner.replace(item, ""), anon);
  });
});
