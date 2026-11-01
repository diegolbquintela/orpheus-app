// Site shell (#46) in jsdom: the menu on each route, home (#69) and the footer, rendered with the
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

// #286 (HDR-01..HDR-12; supersedes RM-22..RM-24 and the #46/#90/#97 five-link bar): the Palantir-style header. The
// open/close, Esc, focus trap and owner tests live in site-header.dom.test.tsx; here, the bar and the overlay's links.
describe("site header (#286)", () => {
  for (const [path, want] of [
    ["/", "Orpheus"],
    ["/calculator", "Calculator"],
    ["/dashboard", "Dashboard"],
    ["/dashboard/sign-in", "Dashboard"],
    ["/personal-finance", "Personal Finance"],
    ["/account", "Account"],
  ] as const)
    it(`HDR-05 ${path}: aria-current=page on the overlay's ${want} only`, async () => {
      const el = await render(<SiteMenu pathname={path} />);
      assert.deepEqual(current(el), [want]);
      assert.ok(el.querySelector('[data-testid="site-menu-links"] [aria-current="page"]'));
    });

  it("HDR-05 unknown path (e.g. the flag-off /dashboard 404): no current page", async () => {
    const el = await render(<SiteMenu pathname="/__not-found" />);
    assert.deepEqual(current(el), []);
  });

  it("HDR-01 the bar: lyre + Orpheus home link, Get Started to /calculator, Search and Menu buttons, nothing else", async () => {
    const el = await render(<SiteMenu pathname="/calculator" />);
    const nav = el.querySelector('nav[aria-label="Site"][data-testid="site-menu"]')!;
    assert.ok(nav);
    const bar = nav.querySelector('[data-testid="site-bar"]')!;
    assert.deepEqual(
      [...bar.querySelectorAll("a, button")].map((x) => x.getAttribute("data-testid")),
      ["site-logo", "site-get-started", "site-search-open", "site-menu-open"],
    );
    const logo = bar.querySelector<HTMLAnchorElement>('[data-testid="site-logo"]')!;
    assert.equal(logo.getAttribute("href"), "/");
    assert.equal(logo.textContent, "Orpheus");
    const lyre = logo.firstElementChild!;
    assert.equal(lyre.getAttribute("data-testid"), "lyre");
    assert.equal(lyre.getAttribute("aria-hidden"), "true");
    assert.equal(lyre.getAttribute("stroke"), "currentColor");
    // Bar links never carry aria-current (release-smoke's `current()` reads one entry per page).
    assert.equal(bar.querySelectorAll("[aria-current]").length, 0);
    for (const id of ["site-search-open", "site-menu-open"]) {
      const b = bar.querySelector(`[data-testid="${id}"]`)!;
      assert.equal(b.getAttribute("type"), "button");
      assert.equal(b.getAttribute("aria-expanded"), "false");
      assert.equal(b.getAttribute("aria-controls"), nav.querySelector('[data-testid="site-overlay"]')!.id);
      assert.equal(b.querySelector("svg")!.getAttribute("aria-hidden"), "true");
    }
    assert.equal(bar.querySelector('[data-testid="site-search-open"]')!.getAttribute("aria-label"), "Search");
    assert.equal(bar.querySelector('[data-testid="site-menu-open"]')!.getAttribute("aria-label"), "Menu");
  });

  it("HDR-02 Get Started: one link to /calculator, chalk on charcoal (no gold), 44 px tall, never hidden", async () => {
    const el = await render(<SiteMenu pathname="/" />);
    const gs = el.querySelector<HTMLAnchorElement>('[data-testid="site-get-started"]')!;
    assert.equal(gs.getAttribute("href"), "/calculator");
    assert.equal(gs.textContent, "Get Started");
    for (const c of ["inline-flex", "h-11", "bg-chalk", "text-night", "whitespace-nowrap"])
      assert.match(gs.className, new RegExp(`(^| )${c}( |$)`), c);
    assert.doesNotMatch(gs.className, /(^| )(hidden|sr-only|max-\w+:hidden)( |$)|gold|amber|yellow/);
    assert.equal(gs.getAttribute("aria-current"), null);
  });

  it("HDR-04 the overlay is in the HTML, hidden, with every page by its full name, Account last", async () => {
    const el = await render(<SiteMenu pathname="/" />);
    const ov = el.querySelector<HTMLElement>('[data-testid="site-overlay"]')!;
    assert.equal(ov.hidden, true);
    assert.equal(ov.getAttribute("role"), "dialog");
    assert.equal(ov.getAttribute("aria-modal"), "true");
    assert.deepEqual(
      [...ov.querySelectorAll('[data-testid="site-menu-links"] a')].map((a) => [a.getAttribute("href"), a.textContent]),
      [
        ["/", "Orpheus"],
        ["/calculator", "Calculator"],
        ["/dashboard", "Dashboard"],
        ["/personal-finance", "Personal Finance"],
        ["/account", "Account"],
      ],
    );
    for (const c of ["fixed", "inset-0", "bg-night", "text-chalk", "overflow-y-auto"])
      assert.match(ov.className, new RegExp(`(^| )${c}( |$)`), c);
    // No abbreviations: no RM, no glyph-only items.
    assert.doesNotMatch(ov.textContent!, /\bRM\b/);
    assert.equal(el.querySelector('[data-testid="person-glyph"]'), null);
  });

  it("HDR-01 stays put on scroll (sticky top-0) and every target is 44 px", async () => {
    const el = await render(<SiteMenu pathname="/" />);
    const nav = el.querySelector("nav")!;
    assert.match(nav.className, /(^| )sticky( |$)/);
    assert.match(nav.className, /(^| )top-0( |$)/);
    for (const x of nav.querySelectorAll("a, button"))
      assert.match(x.className, /(^| )(h-11|min-h-11)( |$)/, x.outerHTML.slice(0, 80));
    for (const x of nav.querySelectorAll("button, [data-testid=site-logo]")) assert.match(x.className, /(^| )(w-11|min-w-11)( |$)/);
  });
});

describe("home (#69)", () => {
  it("the Jordaens hero with 01 + the title, then 02 Platforms and exactly three lines with Open links (#97); no fetch", async () => {
    let fetches = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches++;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const el = await render(<Home />);
      const hero = el.querySelector('[data-testid="home-hero"]')!;
      const img = hero.querySelector("picture img")!;
      assert.equal(
        img.getAttribute("alt"),
        "Jacob Jordaens, Triumph of Frederick Henry, Prince of Orange (1652)",
      );
      assert.ok(img.getAttribute("width") && img.getAttribute("height"));
      for (const source of hero.querySelectorAll("picture source"))
        assert.ok(source.getAttribute("width") && source.getAttribute("height"), source.outerHTML);
      assert.match(img.getAttribute("srcset")!, /\/hero\/frederick-phone-800\.jpg 800w/);
      // Plain type in the wash: one text node in the h1; no credit line anywhere (Q5).
      const h1s = el.querySelectorAll("h1");
      assert.equal(h1s.length, 1);
      assert.equal(h1s[0].textContent, "Investment driven by research.");
      assert.equal(h1s[0].childNodes.length, 1);
      assert.equal(hero.querySelector('[data-testid="hero-wash"] p')!.textContent, "01");
      assert.doesNotMatch(el.textContent!, /Jordaens|Wikimedia|public domain|courtesy/i);

      const platforms = el.querySelector('[data-testid="platforms"]')!;
      assert.equal(platforms.querySelector("p")!.textContent, "02");
      assert.equal(platforms.querySelector("h2")!.textContent, "Platforms");
      const lines = [...el.querySelectorAll('[data-testid="platform-line"]')];
      assert.deepEqual(
        lines.map((l) => {
          const open = l.querySelector("a")!;
          const name = l.querySelector("h3")!;
          assert.equal(open.getAttribute("aria-describedby"), name.id);
          assert.equal(l.querySelectorAll("a").length, 1);
          return [
            name.textContent,
            l.querySelector("p")!.textContent,
            open.textContent,
            open.getAttribute("href"),
          ];
        }),
        [
          ["Calculator", "Dollar-cost average calculator.", "Open", "/calculator"],
          ["Dashboard", "The portfolio as a business.", "Open", "/dashboard"],
          ["Personal Finance", "Income, expenses, and the cover.", "Open", "/personal-finance"],
        ],
      );
      // Nothing else: the #46 line and cards are gone; no calculator code.
      assert.equal(el.querySelectorAll('[data-testid="home-card"]').length, 0);
      assert.doesNotMatch(el.textContent!, /private desk with two tools/);
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
    it(`${path}: charcoal bar, ${want ?? "no item"} marked in the overlay (aria-current + chalk underline), others dim`, async () => {
      const el = await render(<SiteMenu pathname={path} />);
      const nav = el.querySelector("nav")!;
      for (const c of ["bg-night", "text-chalk", "border-hair", "sticky", "top-0"]) assert.match(nav.className, new RegExp(`(^| )${c}( |$)`), c);
      assert.doesNotMatch(nav.className, /bg-paper|bg-white|bg-card/);
      assert.deepEqual(current(el), want ? [want] : []);
      for (const a of nav.querySelectorAll("a, button, input")) {
        assert.match(a.className, /focus-visible:outline-chalk/);
        assert.doesNotMatch(a.className, /hover:/, "no hover rule (ST2 retired)");
        assert.doesNotMatch(a.className, /tabular-nums|tnum/);
      }
      for (const a of nav.querySelectorAll('[data-testid="site-menu-links"] a')) {
        assert.match(a.className, /aria-\[current=page\]:text-chalk/);
        assert.match(a.className, /aria-\[current=page\]:underline/);
        assert.match(a.className, /(^| )text-dim( |$)/);
        assert.match(a.className, /(^| )inline-flex min-h-11 items-center( |$)/, "44 px tap target (#72, ST6-08)");
      }
      assert.match(nav.querySelector('[data-testid="site-logo"]')!.className, /(^| )text-chalk( |$)/);
    });

  it("the same markup on every route except the aria-current attribute (one shared component)", async () => {
    // useId values differ per React root; everything else must match.
    const strip = (html: string) => html.replace(/ aria-current="page"/g, "").replace(/ (id|for|aria-controls|aria-describedby)="[^"]*"/g, " $1");
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

