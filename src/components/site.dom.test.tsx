// Site shell (#46) in jsdom: the menu on each route, the home cards and the footer, rendered with the
// real components. The menu takes no flag input, so "Dashboard shown with the flag off" holds by
// construction; the flag-off 404 page is checked on the built server (check-dashboard-built.mjs).
import { dom } from "../test/dom-setup";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Home } from "./home";
import { SiteFooter } from "./site-footer";
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

const current = (el: HTMLElement) =>
  [...el.querySelectorAll('[aria-current="page"]')].map((a) => a.textContent);

describe("site menu", () => {
  for (const [path, want] of [
    ["/", "Orpheus"],
    ["/calculator", "Calculator"],
    ["/dashboard", "Dashboard"],
    ["/dashboard/sign-in", "Dashboard"],
  ] as const)
    it(`${path}: aria-current=page on ${want} only`, async () => {
      const el = await render(<SiteMenu pathname={path} />);
      assert.deepEqual(current(el), [want]);
    });

  it("unknown path (e.g. the flag-off /dashboard 404 on the server): no current page", async () => {
    const el = await render(<SiteMenu pathname="/__not-found" />);
    assert.deepEqual(current(el), []);
  });

  it("Orpheus on the left → /, Calculator and Dashboard on the right; Dashboard always shown", async () => {
    const el = await render(<SiteMenu pathname="/calculator" />);
    const nav = el.querySelector("nav")!;
    assert.equal(nav.getAttribute("aria-label"), "Site");
    const links = [...nav.querySelectorAll("a")].map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    assert.deepEqual(links, [
      ["Orpheus", "/"],
      ["Calculator", "/calculator"],
      ["Dashboard", "/dashboard"],
    ]);
    // Right group is one list, after the Orpheus link.
    assert.deepEqual(
      [...nav.querySelectorAll("ul a")].map((a) => a.textContent),
      ["Calculator", "Dashboard"],
    );
  });

  it("stays put on scroll (sticky top) and has a visual current state", async () => {
    const el = await render(<SiteMenu pathname="/" />);
    const nav = el.querySelector("nav")!;
    assert.match(nav.className, /\bsticky\b/);
    assert.match(nav.className, /\btop-0\b/);
    assert.match(
      el.querySelector('[aria-current="page"]')!.className,
      /aria-\[current=page\]:underline/,
    );
  });

  it("no dropdowns: only three links, no buttons, popups or menus", async () => {
    const el = await render(<SiteMenu pathname="/" />);
    assert.equal(el.querySelectorAll("a").length, 3);
    assert.equal(
      el.querySelectorAll("button, select, details, [aria-haspopup], [role=menu]").length,
      0,
    );
  });
});

describe("home", () => {
  it("one line plus exactly two cards with the issue texts and links; no fetch", async () => {
    let fetches = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches++;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const el = await render(<Home />);
      assert.equal(el.querySelectorAll("h1").length, 1);
      const cards = [...el.querySelectorAll('[data-testid="home-card"]')];
      assert.equal(cards.length, 2);
      assert.deepEqual(
        cards.map((c) => [
          c.getAttribute("href"),
          c.querySelector("h2")!.textContent,
          c.querySelector("p")!.textContent,
        ]),
        [
          ["/calculator", "Calculator", "compare a lump sum with contributions"],
          ["/dashboard", "Dashboard", "holdings, value, stored figures"],
        ],
      );
      assert.equal(el.querySelectorAll("form, input, table, button").length, 0);
      assert.equal(fetches, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("footer", () => {
  it("reads exactly 'Orpheus Wisdom' and nothing else", async () => {
    const el = await render(<SiteFooter />);
    const footer = el.querySelector("footer")!;
    assert.equal(footer.textContent, "Orpheus Wisdom");
    assert.equal(footer.querySelectorAll("p").length, 1);
    assert.equal(footer.querySelectorAll("a, button").length, 0);
  });
});

// Dark shell (epic #66, #68; spec ST1): one charcoal bar and one charcoal footer, the same markup on every
// route (including /dashboard, sign-in and the 404), off-white / dim type, current page off-white + underlined.
describe("dark shell (#68, ST1)", () => {
  const ROUTES = [
    ["/", "Orpheus"],
    ["/calculator", "Calculator"],
    ["/dashboard", "Dashboard"],
    ["/dashboard/", "Dashboard"],
    ["/dashboard/sign-in", "Dashboard"],
    ["/__not-found", null],
    ["/no-such-page", null],
  ] as const;

  for (const [path, want] of ROUTES)
    it(`${path}: charcoal bar, ${want ?? "no item"} marked (aria-current + off-white underline), others dim`, async () => {
      const el = await render(<SiteMenu pathname={path} />);
      const nav = el.querySelector("nav")!;
      for (const c of ["bg-night", "text-chalk", "border-hair", "sticky", "top-0"]) assert.match(nav.className, new RegExp(`(^| )${c}( |$)`), c);
      assert.doesNotMatch(nav.className, /bg-paper|bg-white|bg-card/);
      assert.deepEqual(current(el), want ? [want] : []);
      for (const a of nav.querySelectorAll("a")) {
        // The visible mark is keyed on aria-current, so it can't drift from it.
        assert.match(a.className, /aria-\[current=page\]:text-chalk/);
        assert.match(a.className, /aria-\[current=page\]:underline/);
        assert.match(a.className, /focus-visible:outline-chalk/);
        assert.doesNotMatch(a.className, /hover:/, "no hover rule (ST2 retired)");
      }
      const right = [...nav.querySelectorAll("ul a")];
      for (const a of right) assert.match(a.className, /(^| )text-dim( |$)/);
      assert.match(nav.querySelector(":scope > div > a")!.className, /(^| )text-chalk( |$)/);
    });

  it("the same markup on every route except the aria-current attribute (one shared component)", async () => {
    const strip = (html: string) => html.replace(/ aria-current="page"/g, "");
    const htmls: string[] = [];
    for (const [path] of ROUTES) htmls.push(strip((await render(<SiteMenu pathname={path} />)).innerHTML));
    assert.equal(new Set(htmls).size, 1);
  });

  it("footer: charcoal band, only 'Orpheus Wisdom' in dim type", async () => {
    const el = await render(<SiteFooter />);
    const footer = el.querySelector("footer")!;
    assert.match(footer.className, /(^| )bg-night( |$)/);
    assert.match(footer.className, /(^| )border-hair( |$)/);
    assert.match(footer.querySelector("p")!.className, /(^| )text-dim( |$)/);
    assert.equal(footer.textContent, "Orpheus Wisdom");
  });
});

