import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADVICE_PATTERN } from "../../../scripts/build-fixtures.ts";
import {
  CALCULATOR_NOTE,
  currentSection,
  FOOTER_LINE,
  HOME_OPEN,
  HOME_PLATFORMS,
  HOME_PLATFORMS_HEADING,
  HOME_PLATFORMS_NUMERAL,
  homeRedirectHref,
  MENU_ITEMS,
  shellBodyClass,
  shellHtmlClass,
  shellPage,
} from "./site.ts";

describe("site shell (#46)", () => {
  it("menu: Orpheus → /, Calculator, Dashboard; Dashboard is always listed (no flag input)", () => {
    assert.deepEqual(
      MENU_ITEMS.map((m) => [m.label, m.href]),
      [
        ["Orpheus", "/"],
        ["Calculator", "/calculator"],
        ["Dashboard", "/dashboard"],
      ],
    );
    assert.doesNotMatch(
      readFileSync("src/lib/site/site.ts", "utf8"),
      /process\.env|import\.meta\.env|flag\.server/,
    );
  });

  it("current page per route", () => {
    assert.equal(currentSection("/"), "home");
    assert.equal(currentSection("/calculator"), "calculator");
    assert.equal(currentSection("/calculator/"), "calculator");
    assert.equal(currentSection("/dashboard"), "dashboard");
    assert.equal(currentSection("/dashboard/sign-in"), "dashboard");
    assert.equal(currentSection("/dashboardx"), null);
    assert.equal(currentSection("/orpheus-missing-path"), null);
  });

  it("home (#69): `02` `Platforms` and exactly two lines with the spec §4 copy and links", () => {
    assert.equal(HOME_PLATFORMS_NUMERAL, "02");
    assert.equal(HOME_PLATFORMS_HEADING, "Platforms");
    assert.equal(HOME_OPEN, "Open");
    assert.deepEqual(HOME_PLATFORMS, [
      { name: "Calculator", text: "Dollar-cost average calculator.", href: "/calculator" },
      {
        name: "Dashboard",
        text: "The portfolio as a business: fundamentals for each name, and the whole.",
        href: "/dashboard",
      },
    ]);
  });

  it("footer text is exactly 'Orpheus Wisdom'", () => {
    assert.equal(FOOTER_LINE, "Orpheus Wisdom");
  });

  it("the calculator keeps its listings note (wording unchanged), rendered from CALCULATOR_NOTE under the form (#70)", () => {
    assert.equal(CALCULATOR_NOTE, "US, EU and CA listings, one currency per basket.");
    assert.match(readFileSync("src/components/desk.tsx", "utf8"), /<\/form>\s*<p className="calc-note[^"]*"[^>]*>\s*\{CALCULATOR_NOTE\}/);
  });

  it("redirect: / with a query string → /calculator with the same query; plain / stays", () => {
    assert.equal(homeRedirectHref(""), null);
    assert.equal(homeRedirectHref("?"), null);
    assert.equal(
      homeRedirectHref("?ticker=KO&start=2020-10-02"),
      "/calculator?ticker=KO&start=2020-10-02",
    );
    assert.equal(homeRedirectHref("a=1"), "/calculator?a=1");
  });

  it("home route does no calculating: no calculator, engine or price-feed code", () => {
    for (const file of ["src/routes/index.tsx", "src/components/home.tsx", "src/components/home-hero.tsx", "src/lib/site/home-hero.ts"]) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(
        text,
        /components\/desk|lib\/dca|api\/chart|fetch\(|runDesk|useQuery/,
        file,
      );
    }
    assert.match(readFileSync("src/routes/calculator.tsx", "utf8"), /components\/desk/);
  });

  it("no advice, score or disclaimer wording in the shell copy", () => {
    const re = new RegExp(
      `${ADVICE_PATTERN}|\\b(score|scores|rating|recommendation)\\b|not a recommendation`,
      "i",
    );
    for (const text of [
      FOOTER_LINE,
      HOME_PLATFORMS_HEADING,
      HOME_OPEN,
      ...HOME_PLATFORMS.flatMap((c) => [c.name, c.text]),
      ...MENU_ITEMS.map((m) => m.label),
    ])
      assert.doesNotMatch(text, re, text);
  });

  it("noindex meta on every page route (root plus each route's own head)", () => {
    for (const file of [
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/routes/calculator.tsx",
      "src/routes/dashboard.tsx",
      "src/routes/dashboard_.sign-in.tsx",
    ])
      assert.match(readFileSync(file, "utf8"), /noindex, nofollow/, file);
    assert.match(readFileSync("vite.config.ts", "utf8"), /"X-Robots-Tag": "noindex, nofollow"/);
  });
});

describe("dark shell page (#68, spec §6 / Q13)", () => {
  it("charcoal page on every page except /dashboard itself (exact path; sign-in and 404 are dark)", () => {
    for (const p of ["/", "/calculator", "/calculator/", "/dashboard/sign-in", "/dashboard/sign-in/", "/__not-found", "/nope", "/dashboardx"])
      assert.equal(shellPage(p), "dark", p);
    for (const p of ["/dashboard", "/dashboard/", "/dashboard//"]) assert.equal(shellPage(p), "dashboard", p);
    assert.equal(shellBodyClass("/calculator"), "bg-night text-chalk scheme-dark");
    assert.equal(shellBodyClass("/dashboard"), undefined, "/dashboard keeps main's white body around its content");
    // D2 (QA round 1): color-scheme dark on <html> too, not only on <body>.
    assert.equal(shellHtmlClass("/calculator"), "antialiased scheme-dark");
    assert.equal(shellHtmlClass("/"), "antialiased scheme-dark");
    assert.equal(shellHtmlClass("/dashboard/sign-in"), "antialiased scheme-dark");
    assert.equal(shellHtmlClass("/dashboard"), "antialiased");
  });

  it("dark tokens added next to the old ones; no existing token value changed (the dashboard renders with them)", () => {
    const css = readFileSync("src/styles.css", "utf8");
    for (const [k, v] of [
      ["paper", "#ffffff"], ["ink", "#1e2124"], ["muted", "#636363"], ["line", "#e3e3e3"], ["card", "#ffffff"],
      ["danger", "#ff4136"], ["dca", "#2b5945"], ["focus", "#2b5945"],
      ["night", "#1e2124"], ["chalk", "#f2f0eb"], ["dim", "#a8aeb4"], ["rule", "#8b9298"], ["hair", "#3a3f44"], ["green", "#5cc08a"], ["alert", "#ff8f87"],
    ])
      assert.match(css, new RegExp(`--color-${k}: ${v};`), k);
  });

  it("AA on charcoal for every text / token pair the shell uses (spec §5 ratios)", () => {
    const lum = (hex: string) => {
      const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const night = "#1e2124";
    assert.ok(ratio("#f2f0eb", night) >= 14.1, "chalk");
    assert.ok(ratio("#a8aeb4", night) >= 7.1, "dim");
    assert.ok(ratio("#8b9298", night) >= 3, "rule (non-text)");
    assert.ok(ratio("#5cc08a", night) >= 3, "green (non-text)");
    assert.ok(ratio(night, "#5cc08a") >= 4.5, "night on the green pill");
    assert.ok(ratio("#ff8f87", night) >= 4.5, "alert");
    assert.ok(ratio("#2b5945", night) < 3, "the old focus green fails on charcoal, hence the chalk focus ring in the bar");
  });
});


describe("calculator hero files (#70, ST4-01 / ST4-16)", () => {
  it("every file named in a srcset exists in public/, with the crop's aspect ratio, ≤ 300 KB; source recorded", async () => {
    const { HERO_CROPS, heroFile } = await import("./hero.ts");
    const { statSync, existsSync } = await import("node:fs");
    for (const crop of Object.values(HERO_CROPS))
      for (const ext of ["avif", "webp", "jpg"] as const)
        for (const w of crop.widths[ext]) {
          const path = `public${heroFile(crop.name, w, ext)}`;
          assert.ok(existsSync(path), path);
          assert.ok(statSync(path).size <= 300 * 1024, `${path} ${statSync(path).size}`);
        }
    assert.ok(HERO_CROPS.wide.widths.avif.includes(2880), "1440 px at 2x is served from a ≤ 300 KB AVIF");
    const source = readFileSync("public/hero/calculator-SOURCE.md", "utf8");
    assert.match(source, /Sandro Botticelli/);
    assert.match(source, /Public domain/i);
    assert.match(source, /commons\.wikimedia\.org\/wiki\/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited\.jpg/);
  });
});

describe("home hero files (#69, ST3-01)", () => {
  it("every file named in a srcset exists in public/, each ≤ 300 KB; the figure box sane; source and licence recorded", async () => {
    const { HOME_HERO_ALT, HOME_HERO_CROPS, HOME_TITLE, homeHeroFile } = await import("./home-hero.ts");
    const { statSync, existsSync } = await import("node:fs");
    assert.equal(HOME_TITLE, "Investment driven by research.");
    assert.match(HOME_HERO_ALT, /Jordaens, Triumph of Frederick Henry, Prince of Orange/);
    for (const crop of Object.values(HOME_HERO_CROPS)) {
      assert.ok(crop.figure.every((f) => f >= 0 && f <= 1) && crop.figure[0] < crop.figure[2], crop.name);
      for (const ext of ["avif", "webp", "jpg"] as const)
        for (const w of crop.widths[ext]) {
          const path = `public${homeHeroFile(crop.name, w, ext)}`;
          assert.ok(existsSync(path), path);
          assert.ok(statSync(path).size <= 300 * 1024, `${path} ${statSync(path).size}`);
        }
    }
    assert.ok(HOME_HERO_CROPS.wide.widths.avif.includes(2880), "1440 px at 2x is served from a ≤ 300 KB AVIF");
    const source = readFileSync("public/hero/home-SOURCE.md", "utf8");
    assert.match(source, /Jacob Jordaens/);
    assert.match(source, /Public domain/i);
    assert.match(source, /PD-old-100/);
    assert.match(source, /commons\.wikimedia\.org\/wiki\/File:The_Triumph_of_Frederik_Hendrik,_by_Jacob_Jordaens_\(I\)\.jpg/);
  });
});
