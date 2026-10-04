import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADVICE_PATTERN } from "../../../scripts/build-fixtures.ts";
import {
  CALCULATOR_NOTE,
  currentSection,
  FOOTER_LINE,
  HOME_CARDS,
  HOME_LINE,
  homeRedirectHref,
  MENU_ITEMS,
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

  it("home: exactly two cards with the issue texts and links", () => {
    assert.deepEqual(HOME_CARDS, [
      { title: "Calculator", text: "compare a lump sum with contributions", href: "/calculator" },
      { title: "Dashboard", text: "holdings, value, stored figures", href: "/dashboard" },
    ]);
  });

  it("footer text is exactly 'Orpheus Wisdom'", () => {
    assert.equal(FOOTER_LINE, "Orpheus Wisdom");
  });

  it("the calculator keeps its listings note under the form, as before the move", () => {
    assert.equal(CALCULATOR_NOTE, "US, EU and CA listings, one currency per basket.");
    assert.match(
      readFileSync("src/components/desk.tsx", "utf8"),
      />US, EU and CA listings, one currency per basket\.</,
    );
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
    for (const file of ["src/routes/index.tsx", "src/components/home.tsx"]) {
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
      HOME_LINE,
      FOOTER_LINE,
      ...HOME_CARDS.flatMap((c) => [c.title, c.text]),
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
