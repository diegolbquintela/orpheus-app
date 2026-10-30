// #271 (RM-21..RM-24): the site bar's owner-only "Renaissance Man" link. The server decides (the root loader,
// `renaissanceNavLink`, tested in src/lib/renaissance/api.server.test.ts); here, the bar shows the link only when it is
// given one, and with none its HTML is exactly what everyone saw before (no /renaissance, no Renaissance, no hidden item).
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
const PATHS = [
  "/",
  "/calculator",
  "/dashboard",
  "/personal-finance",
  "/account",
  "/renaissance",
  "/nope",
];
const links = (el: HTMLElement) =>
  [...el.querySelectorAll("nav a")].map((a) => [a.getAttribute("href"), a.textContent]);

describe("RM-22 no link for anyone but the owner", () => {
  it("no ownerLink (omitted, null or undefined): identical markup, five items, nothing about /renaissance", () => {
    for (const p of PATHS) {
      const base = renderToStaticMarkup(<SiteMenu pathname={p} />);
      assert.equal(renderToStaticMarkup(<SiteMenu pathname={p} ownerLink={null} />), base, p);
      assert.equal(renderToStaticMarkup(<SiteMenu pathname={p} ownerLink={undefined} />), base, p);
      assert.doesNotMatch(base, /renaissance|\bRM\b|site-menu-owner/i, p);
      assert.equal(base.match(/<li/g)?.length, 4, p);
      assert.equal(base.match(/<a /g)?.length, 5, p);
    }
  });
  it("the visible items are unchanged: Orpheus, Calculator, Dashboard, Personal Finance, Account", async () => {
    const el = await render(<SiteMenu pathname="/" />);
    assert.deepEqual(links(el), [
      ["/", "Orpheus"],
      ["/calculator", "Calculator"],
      ["/dashboard", "Dashboard"],
      ["/personal-finance", "Personal Finance"],
      ["/account", "Account"],
    ]);
    assert.equal(el.querySelector('[data-testid="site-menu-owner"]'), null);
    assert.doesNotMatch(el.innerHTML, /renaissance/i);
  });
});

describe("RM-23 the owner's link", () => {
  it("one link to /renaissance, right before Account, named Renaissance Man, RM below 768 px", async () => {
    const el = await render(<SiteMenu pathname="/" ownerLink={OWNER} />);
    assert.deepEqual(links(el), [
      ["/", "Orpheus"],
      ["/calculator", "Calculator"],
      ["/dashboard", "Dashboard"],
      ["/personal-finance", "Personal Finance"],
      ["/renaissance", "RMRenaissance Man"],
      ["/account", "Account"],
    ]);
    const a = el.querySelector<HTMLAnchorElement>('[data-testid="site-menu-owner"] a')!;
    assert.equal(el.querySelectorAll('a[href="/renaissance"]').length, 1);
    const [short, full] = [...a.querySelectorAll("span")];
    assert.equal(short.textContent, "RM");
    assert.equal(short.getAttribute("aria-hidden"), "true");
    assert.match(short.className, /(^| )md:hidden( |$)/);
    assert.equal(full.textContent, "Renaissance Man");
    assert.match(full.className, /(^| )sr-only( |$)/);
    assert.match(full.className, /(^| )md:not-sr-only( |$)/);
    assert.match(a.className, /\bh-11\b/);
    assert.match(a.className, /\bmin-w-11\b/);
    assert.match(a.className, /\btext-dim\b/);
    assert.equal(a.getAttribute("aria-current"), null);
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
  it("the owner's bar is the anonymous bar plus exactly one item, and may wrap (min-h-11 flex-wrap, not h-11)", () => {
    const anon = renderToStaticMarkup(<SiteMenu pathname="/" />);
    const owner = renderToStaticMarkup(<SiteMenu pathname="/" ownerLink={OWNER} />);
    const item = owner.match(/<li data-testid="site-menu-owner">.*?<\/li>/)![0];
    const ANON_ROW = "mx-auto flex h-11 w-full max-w-6xl items-center justify-between px-5 sm:px-8";
    const OWNER_ROW =
      "mx-auto flex min-h-11 w-full max-w-6xl flex-wrap items-center justify-between px-5 sm:px-8";
    assert.ok(anon.includes(`class="${ANON_ROW}"`));
    assert.doesNotMatch(anon, /flex-wrap/);
    assert.ok(owner.includes(`class="${OWNER_ROW}"`));
    assert.ok(!owner.includes(ANON_ROW));
    assert.equal(owner.replace(item, "").replace(OWNER_ROW, ANON_ROW), anon);
  });
});
