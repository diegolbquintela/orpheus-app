import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADVICE_PATTERN } from "../../../scripts/build-fixtures.ts";
import {
  CALCULATOR_NOTE,
  currentSection,
  FOOTER_LINE,
  HOME_OPEN,
  NOT_FOUND_TITLE,
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
  it("menu: Orpheus → /, Calculator, Dashboard, Personal finance (#97), Account (#90 ROLE-01); always listed (no flag input)", () => {
    assert.deepEqual(
      MENU_ITEMS.map((m) => [m.label, m.href]),
      [
        ["Orpheus", "/"],
        ["Calculator", "/calculator"],
        ["Dashboard", "/dashboard"],
        ["Personal finance", "/personal-finance"],
        ["Account", "/account"],
      ],
    );
    assert.equal(currentSection("/account"), "account");
    assert.equal(currentSection("/account/"), "account");
    assert.equal(currentSection("/accounts"), null);
    // Below 640 px a person glyph; the word stays the link's accessible name (visually hidden there).
    const menu = readFileSync("src/components/site-menu.tsx", "utf8");
    assert.match(menu, /<PersonGlyph className="sm:hidden" \/>/);
    assert.match(menu, /<span className="sr-only sm:not-sr-only">\{item\.label\}<\/span>/);
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
    assert.equal(currentSection("/personal-finance"), "personal-finance");
    assert.equal(currentSection("/personal-finance/"), "personal-finance");
    assert.equal(currentSection("/personal-financex"), null);
    assert.equal(currentSection("/orpheus-missing-path"), null);
  });

  it("home (#69, #97): `02` `Platforms` and exactly three lines with the spec §4 copy and links", () => {
    assert.equal(HOME_PLATFORMS_NUMERAL, "02");
    assert.equal(HOME_PLATFORMS_HEADING, "Platforms");
    assert.equal(HOME_OPEN, "Open");
    assert.deepEqual(HOME_PLATFORMS, [
      { name: "Calculator", text: "Dollar-cost average calculator.", href: "/calculator" },
      { name: "Dashboard", text: "The portfolio as a business.", href: "/dashboard" },
      {
        name: "Personal finance",
        text: "Income, expenses, and the cover.",
        href: "/personal-finance",
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
      "src/routes/personal-finance.tsx",
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

describe("sign-in page (#73, spec §9, ST5b)", () => {
  const route = readFileSync("src/routes/dashboard_.sign-in.tsx", "utf8");
  const css = readFileSync("src/styles.css", "utf8");
  const block = (sel: string) => {
    const m = new RegExp(`\\n  ${sel.replace(".", "\\.")} \\{([^}]*)\\}`).exec(css);
    assert.ok(m, sel);
    return m[1].trim().split(/\s*\n\s*/);
  };

  it("dark, sign-in-only classes (Q10): no white panel, no shared .field / .kicker", () => {
    assert.doesNotMatch(route, /className="[^"]*(?<![\w-])(bg-paper|text-ink|text-muted|kicker|field)(?![\w-])/);
    for (const c of [
      "signin",
      "signin-title",
      "signin-label",
      "signin-field",
      "signin-button",
      "signin-error",
      "signin-note",
    ]) {
      assert.match(route, new RegExp(`className="[^"]*\\b${c}\\b`), c);
      assert.match(css, new RegExp(`\\.${c}[ :{,]`), c);
    }
  });

  it("the shared .field and .kicker are exactly as on main (the dashboard renders with them)", () => {
    assert.deepEqual(block(".kicker"), [
      "font-size: 0.75rem;",
      "line-height: 1.2;",
      "letter-spacing: 0.14em;",
      "text-transform: uppercase;",
      "font-variant-numeric: slashed-zero;",
    ]);
    assert.deepEqual(block(".field"), [
      "height: 2.75rem;",
      "width: 100%;",
      "border: 0;",
      "border-bottom: 1px solid var(--color-ink);",
      "border-radius: 0;",
      "background: transparent;",
      "padding: 0;",
      "color: var(--color-ink);",
      "font-variant-numeric: slashed-zero tabular-nums;",
      "appearance: none;",
    ]);
  });

  it("exact copy (Q4; #90 ROLE-09): heading, Email, Password, submit; no Create an account switch; no invite-only note", () => {
    for (const s of ['"Sign in"', ">Email<", ">Password<", "Sign-in is not configured on this deployment."])
      assert.ok(route.includes(s), s);
    assert.doesNotMatch(route, /New here|Have an account|invite-only|password reset/i);
    // Q-D6: no public create-account mode or link.
    assert.doesNotMatch(route, /Create an account|"Create account"|signUp|sign-in-switch|setMode/);
  });

  // #102: the redirect and the after-sign-in target honour `?next=/personal-finance` (the only other target
  // allowed); the default stays /dashboard.
  it("auth logic unchanged (ST5b-03): the same calls, gate and redirect", () => {
    for (const s of [
      "await ensureDashboardEnabled();",
      "const viewer = await getDashboardViewer();",
      // #102 QA D1: the allowlist on load and again before the post-auth navigation.
      "const next = safeNext((search as { next?: unknown }).next);",
      "if (viewer.user) throw redirect({ to: next });",
      "next: safeNext(context.next),",
      'await import("@/lib/auth/client")',
      "authClient.signIn.email({ email: trimmed, password })",
      "window.location.assign(safeNext(next));",
      "minLength={8}",
      'autoComplete="current-password"',
    ])
      assert.ok(route.includes(s), s);
  });
});

describe("leave-outs and regression (#72, spec §6, ST6-06..09)", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const root = readFileSync("src/routes/__root.tsx", "utf8");

  it("Schibsted Grotesk self-hosted (Q16, ST6-06): no Google Fonts host, every face local, optional, preloaded", async () => {
    const { createHash } = await import("node:crypto");
    for (const f of [root, css]) assert.doesNotMatch(f, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
    const faces = [...css.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => m[1]).filter((b) => /"Schibsted Grotesk";/.test(b));
    assert.equal(faces.length, 6, "Google's six declarations: 400 / 500 / italic 400 × latin, latin-ext");
    const source = readFileSync("public/fonts/schibsted-grotesk/SOURCE.md", "utf8");
    for (const b of faces) {
      assert.match(b, /font-display: optional;/);
      const url = /url\("(\/fonts\/schibsted-grotesk\/[a-z-]+\.woff2)"\)/.exec(b)?.[1];
      assert.ok(url, b);
      const bytes = readFileSync(`public${url}`);
      const sha = createHash("sha256").update(bytes).digest("hex");
      assert.ok(source.includes(sha), `${url} SHA-256 recorded in SOURCE.md`);
    }
    assert.match(readFileSync("public/fonts/schibsted-grotesk/OFL.txt", "utf8"), /SIL Open Font License, Version 1\.1/);
    assert.match(root, /rel: "preload",\s*href: "\/fonts\/schibsted-grotesk\/schibsted-grotesk-latin\.woff2",\s*as: "font",\s*type: "font\/woff2",\s*crossOrigin: "anonymous"/);
    assert.match(css, /font-family: "Schibsted Grotesk Fallback";/, "the size-adjusted fallback stays");
  });

  it("no tnum on the dark pages (ST6-07); /dashboard keeps main's body setting", () => {
    assert.match(css, /body \{[^}]*font-feature-settings: "tnum" on, "zero" on;/);
    assert.match(css, /body\.scheme-dark \{\s*font-feature-settings: "zero" on;\s*\}/);
    for (const m of css.matchAll(/\n {2}(\.(?:calc|home|signin|pf)[^{]*)\{([^}]*)\}/g))
      assert.doesNotMatch(m[2], /tabular-nums|"tnum"/, m[1]);
    for (const f of ["src/components/desk.tsx", "src/components/home.tsx", "src/routes/dashboard_.sign-in.tsx", "src/components/not-found.tsx", "src/components/personal-finance/expenses-page.tsx", "src/components/personal-finance/income-block.tsx", "src/components/personal-finance/equity-rates.tsx"])
      assert.doesNotMatch(readFileSync(f, "utf8"), /tabular-nums/, f);
  });

  it("the dark 404 (ST6-09): the root's notFoundComponent, only the title", () => {
    assert.match(root, /notFoundComponent: NotFound/);
    const nf = readFileSync("src/components/not-found.tsx", "utf8");
    assert.match(nf, /\{NOT_FOUND_TITLE\}/);
    assert.doesNotMatch(nf, /bg-paper|bg-white|<a\b|<img\b/);
  });
});

describe("404 copy (#72)", () => {
  it("exactly `Page not found.`", () => assert.equal(NOT_FOUND_TITLE, "Page not found."));
});

describe("lyre mark (#84, ST1-05)", () => {
  const lyre = readFileSync("src/components/lyre.tsx", "utf8");
  const favicon = readFileSync("public/favicon.svg", "utf8");
  const menu = readFileSync("src/components/site-menu.tsx", "utf8");
  const paths = [...lyre.matchAll(/^ {2}"(M[^"]+)",/gm)].map((m) => m[1]);

  it("the bar's Orpheus link carries the lyre (decorative, currentColor)", () => {
    assert.equal(paths.length, 5);
    assert.match(lyre, /stroke="currentColor"/);
    assert.match(lyre, /aria-hidden="true"/);
    assert.match(menu, /<Lyre className="shrink-0" \/>\s*<span>\{home\.label\}<\/span>/);
  });

  it("favicon.svg is the same lyre in chalk on charcoal; the two-bar mark is gone", () => {
    for (const d of paths) assert.ok(favicon.includes(`d="${d}"`), d);
    assert.match(favicon, /fill="#1e2124"/);
    assert.match(favicon, /stroke="#f2f0eb"/);
    assert.doesNotMatch(favicon, /<rect[^>]*(x="6"|height="1\.25")/);
  });
});

describe("personal finance route (#84)", () => {
  it("dark shell; #97: a bar item (Personal finance, current here; Q1 (d) superseded)", () => {
    assert.equal(shellPage("/personal-finance"), "dark");
    assert.equal(currentSection("/personal-finance"), "personal-finance");
    assert.deepEqual(
      MENU_ITEMS.map((m) => m.label),
      ["Orpheus", "Calculator", "Dashboard", "Personal finance", "Account"],
    );
    const route = readFileSync("src/routes/personal-finance.tsx", "utf8");
    assert.match(route, /title: "Personal finance · Orpheus Wisdom"/);
  });

  it("no server: the page makes no fetch and uses no cookie / sessionStorage / IndexedDB", () => {
    for (const f of [
      "src/components/personal-finance/expenses-page.tsx",
      "src/components/personal-finance/income-block.tsx",
      "src/components/personal-finance/pf-cells.tsx",
      "src/components/personal-finance/equity-rates.tsx",
      "src/lib/finance/expenses.ts",
      "src/lib/finance/income.ts",
      "src/lib/finance/equity.ts",
    ]) {
      const text = readFileSync(f, "utf8");
      assert.doesNotMatch(text, /fetch\(|\/api\/|document\.cookie|sessionStorage|indexedDB/, f);
    }
  });

  it("page-only classes: never the shared .field / .kicker / .section (Q10)", () => {
    const page = ["expenses-page", "income-block", "pf-cells", "equity-rates"]
      .map((f) => readFileSync(`src/components/personal-finance/${f}.tsx`, "utf8"))
      .join("\n");
    for (const m of page.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g))
      assert.doesNotMatch(m[1] ?? m[2], /(?<![\w-])(field|kicker|section)(?![\w-])/, m[0]);
  });
});
