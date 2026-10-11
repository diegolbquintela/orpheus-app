// Calculator page (#70 / #78, spec §7 / §7a; ST4-03, -04, -05, -06, -07, -17) in jsdom with the real components:
// one chart series and the last-value pill, four result lines per plan with no table, the field checks, the calculator's own underline field class,
// the listings note directly under the form, and the hero's image markup. Layout (columns, widths, the band
// height, CLS) is checked in a real browser by qa/tools/calculator-page.mjs.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { money } from "@/lib/dca/format";
import type { DeskRun, PlanStats } from "@/lib/dca/types";
import { CALCULATOR_NOTE, METHOD_CAPTION } from "@/lib/site/site";
import { Desk } from "../desk";
import { DcaChart } from "./dca-chart";
import { ResultRows } from "./result-rows";

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

const stats = (over: Partial<PlanStats>): PlanStats => ({
  invested: 1000,
  endNlv: 12965,
  totalReturn: 11.965,
  cagr: 0.533,
  mwr: 0.533,
  maxDrop: -0.799,
  maxDropDate: "2022-12-28",
  nlvAtDrop: 588,
  returnToDrop: -0.412,
  ...over,
});
const RUN: DeskRun = {
  sessions: 4,
  years: 6,
  lastPrices: [10, 20],
  shares: { lump: [1, 2], dca: [3, 4] },
  lump: stats({}),
  dca: stats({ invested: 313000, endNlv: 2020136, mwr: 0.653, maxDropDate: "2022-05-11" }),
  chart: [
    { date: "2020-10-02", lump: 1000, dca: 1000 },
    { date: "2022-01-03", lump: 5000, dca: 90000 },
    { date: "2024-06-03", lump: 4000, dca: 400000 },
    { date: "2026-10-01", lump: 12965, dca: 2020136 },
  ],
  missedContributions: 0,
};
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8"); // run from the repo root (bundled)
const rule = (selector: string) => {
  const at = css.indexOf(`  ${selector} {`);
  assert.ok(at >= 0, `${selector} rule in styles.css`);
  return css.slice(at, css.indexOf("}", at));
};

describe("calculator chart (#70, ST4-05)", () => {
  it("one series: one area (the DCA portfolio value), no line series, green line and 16% green fill", async () => {
    const el = await render(<DcaChart run={RUN} currency="USD" width={600} height={224} />);
    assert.equal(el.querySelectorAll(".recharts-area").length, 1);
    assert.equal(el.querySelectorAll(".recharts-line").length, 0);
    assert.equal(el.querySelectorAll(".recharts-wrapper").length, 1);
    const curve = el.querySelector(".recharts-area-curve")!;
    assert.equal(curve.getAttribute("stroke"), "var(--color-green)");
    assert.equal(curve.getAttribute("stroke-width"), "2");
    const area = el.querySelector(".recharts-area-area")!;
    assert.equal(area.getAttribute("fill"), "var(--color-green)");
    assert.equal(area.getAttribute("fill-opacity"), "0.16");
  });

  it("the last value in one small green pill, in the results' money format", async () => {
    const el = await render(<DcaChart run={RUN} currency="USD" width={600} height={224} />);
    const pills = el.querySelectorAll('[data-testid="chart-pill"]');
    assert.equal(pills.length, 1);
    assert.equal(pills[0].textContent, money(2020136, "USD"));
    assert.equal(pills[0].textContent, "$2,020,136");
    assert.ok(pills[0].classList.contains("calc-pill"));
    const pill = rule(".calc-pill");
    assert.match(pill, /height: 1\.375rem;/); // 22 px
    assert.match(pill, /background: var\(--color-green\);/);
    assert.match(pill, /color: var\(--color-night\);/);
  });

  it("no legend, no caption text, no scale note", async () => {
    const el = await render(<DcaChart run={RUN} currency="USD" width={600} height={224} />);
    assert.equal(el.querySelectorAll(".recharts-legend-wrapper").length, 0);
    assert.doesNotMatch(el.textContent ?? "", /scale/i);
  });
});

describe("calculator results (#78, ST4-06, ST4-10)", () => {
  it("two plan columns, Lump sum then DCA, each with exactly four lines, labels word for word", async () => {
    const el = await render(<ResultRows run={RUN} currency="USD" />);
    const plans = [...el.querySelectorAll('[data-testid="result-plan"]')];
    assert.deepEqual(plans.map((p) => p.getAttribute("data-plan")), ["lump", "dca"]);
    assert.deepEqual(plans.map((p) => p.querySelector("h3")!.textContent), ["Lump sum", "DCA"]);
    for (const plan of plans) {
      const lines = [...plan.querySelectorAll('[data-testid="result-line"]')];
      assert.equal(lines.length, 4);
      assert.deepEqual(lines.map((l) => l.getAttribute("data-key")), ["nlv", "invested", "total", "cagr"]);
      assert.deepEqual(lines.map((l) => l.querySelector("dt")!.textContent), [
        "Final value",
        "Total invested",
        "Return (%)",
        "CAGR (%)",
      ]);
      for (const l of lines) assert.ok(l.querySelector("dd")!.classList.contains("calc-value"));
    }
    assert.equal(el.querySelectorAll('[data-testid="result-line"]').length, 8);
    assert.ok(el.querySelector('[data-testid="results"]')!.classList.contains("calc-plans"));
  });

  it("values from the engine's figures in the results' formats (display only)", async () => {
    const el = await render(<ResultRows run={RUN} currency="USD" />);
    const value = (plan: string, key: string) =>
      el.querySelector(`[data-plan="${plan}"] [data-key="${key}"] dd`)!.textContent;
    assert.equal(value("dca", "invested"), "$313,000");
    assert.equal(value("dca", "nlv"), "$2,020,136");
    assert.equal(value("lump", "nlv"), "$12,965");
    assert.equal(value("lump", "total"), "+1196.5%");
    assert.equal(value("lump", "cagr"), "+53.3%");
    assert.doesNotMatch(el.textContent ?? "", /XIRR|Money-weighted|Max drop|drop|2022-12-28/);
  });

  it("no table, no boxes: no <table>, no border or background classes on the lines", async () => {
    const el = await render(<ResultRows run={RUN} currency="USD" />);
    assert.equal(el.querySelector("table"), null);
    assert.equal(el.querySelectorAll("[class*=border], [class*=bg-]").length, 0);
  });

  it("two columns while each is at least 150 px, stacked otherwise; values never wrap", () => {
    assert.match(rule(".calc-plans"), /grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\);/);
    assert.match(rule(".calc-value"), /white-space: nowrap;/);
    assert.match(rule(".calc-line"), /flex-direction: column;/, "label above value on a phone");
  });
});

/**
 * Types into a React-controlled field. React DOM loads before jsdom's globals here (an external import in the
 * bundle), so it uses its old-browser input fallback: it watches the focused field (focusin / focusout, through
 * IE's attachEvent, stubbed here) and reads its value on keyup. A select uses its change event.
 */
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
async function type(field: HTMLInputElement | HTMLSelectElement, value: string) {
  const select = field.tagName === "SELECT";
  const proto = select ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    field.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event(select ? "change" : "keyup", { bubbles: true }));
    field.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}
async function submit(el: HTMLElement) {
  await act(async () => {
    el.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  });
}
const errorsOf = (el: HTMLElement) =>
  Object.fromEntries(
    [...el.querySelectorAll('[data-testid="field-error"]')].map((e) => [e.getAttribute("data-field"), e.textContent]),
  );

describe("calculator field checks (#78, ST4-17)", () => {
  it("an empty submit marks every field under itself and sends no price request", async () => {
    const fetchBefore = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("no request expected");
    }) as typeof fetch;
    try {
      const el = await render(<Desk />);
      await submit(el);
      assert.deepEqual(errorsOf(el), {
        "ticker-0": "Add a ticker.",
        start: "Add a start date.",
        end: "Add an end date.",
        capital: "Enter a number above 0.",
        contribution: "Enter a number above 0.",
        frequency: "Choose weekly or monthly.",
      });
      assert.equal(calls, 0);
      assert.equal(el.querySelector('[role="alert"]'), null, "no general error line for field checks");
      for (const e of el.querySelectorAll('[data-testid="field-error"]')) assert.ok(e.classList.contains("calc-error"));
    } finally {
      globalThis.fetch = fetchBefore;
    }
  });

  it("marks only the bad fields, keeps every value, links each message to its field", async () => {
    const el = await render(<Desk />);
    await type(el.querySelector<HTMLInputElement>('[data-testid="ticker-input"]')!, "PLTR");
    await type(el.querySelector<HTMLInputElement>('[data-testid="weight-input"]')!, "50");
    await type(el.querySelector<HTMLInputElement>('[data-field="start"]')!, "2026-10-01");
    await type(el.querySelector<HTMLInputElement>('[data-field="end"]')!, "2026-10-01");
    await type(el.querySelector<HTMLInputElement>('[data-field="capital"]')!, "abc");
    await type(el.querySelector<HTMLInputElement>('[data-field="contribution"]')!, "0");
    await type(el.querySelector<HTMLSelectElement>('[data-field="frequency"]')!, "weekly");
    await submit(el);
    assert.deepEqual(errorsOf(el), {
      end: "End must be after the start.",
      capital: "Enter a number above 0.",
      contribution: "Enter a number above 0.",
    });
    const capital = el.querySelector<HTMLInputElement>('[data-field="capital"]')!;
    assert.equal(capital.value, "abc", "nothing is cleared");
    assert.equal(el.querySelector<HTMLInputElement>('[data-testid="ticker-input"]')!.value, "PLTR");
    assert.equal(capital.getAttribute("aria-invalid"), "true");
    const described = el.ownerDocument.getElementById(capital.getAttribute("aria-describedby")!)!;
    assert.equal(described.textContent, "Enter a number above 0.");
    assert.equal(described.parentElement, capital.closest("label")!.parentElement, "directly under its field");
    await type(capital, "1000");
    assert.equal(errorsOf(el).capital, undefined, "editing a field clears its own message");
    assert.equal(errorsOf(el).end, "End must be after the start.");
  });

  it("styles: 13 px alert colour under the field; the marked underline turns alert", () => {
    const r = rule(".calc-error");
    assert.match(r, /font-size: 0\.8125rem;/);
    assert.match(r, /color: var\(--color-alert\);/);
    assert.match(css, /\.calc-field\[aria-invalid="true"\] \{\s*border-bottom-color: var\(--color-alert\);/);
  });
});

describe("calculator page (#70, ST4-01..04, ST4-07)", () => {
  it("every field uses the calculator's own underline class (not the shared .field)", async () => {
    const el = await render(<Desk />);
    const fields = [...el.querySelectorAll("form input, form select")];
    assert.equal(fields.length, 7);
    for (const f of fields) {
      assert.ok(f.classList.contains("calc-field"), f.outerHTML);
      assert.ok(!f.classList.contains("field"), f.outerHTML);
    }
    const field = rule(".calc-field");
    assert.match(field, /border: 0;/);
    assert.match(field, /border-bottom: 1px solid var\(--color-rule\);/);
    assert.match(field, /border-radius: 0;/);
    assert.match(field, /background: transparent;/);
  });

  it("the listings note is the single line directly under the form, 13 px, dim", async () => {
    const el = await render(<Desk />);
    const note = el.querySelector('[data-testid="listings-note"]')!;
    assert.equal(note.textContent, CALCULATOR_NOTE);
    assert.equal(note.previousElementSibling, el.querySelector("form"));
    assert.ok(note.classList.contains("calc-note"));
    const r = rule(".calc-note");
    assert.match(r, /font-size: 0\.8125rem;/);
    assert.match(r, /color: var\(--color-dim\);/);
    assert.match(r, /white-space: nowrap;/);
  });

  it("primary button: chalk fill, night text (Q6)", async () => {
    const el = await render(<Desk />);
    assert.ok(el.querySelector('button[type="submit"]')!.classList.contains("calc-button"));
    const r = rule(".calc-button");
    assert.match(r, /background: var\(--color-chalk\);/);
    assert.match(r, /color: var\(--color-night\);/);
  });

  it("hero: the painting with alt, AVIF + WebP sources, a JPEG img, width and height everywhere; 01 and the title", async () => {
    const el = await render(<Desk />);
    const img = el.querySelector('[data-testid="calculator-hero"] img')!;
    assert.equal(img.getAttribute("alt"), "Sandro Botticelli, The Birth of Venus");
    assert.match(img.getAttribute("src")!, /^\/hero\/venus-phone-\d+\.jpg$/);
    const sources = [...el.querySelectorAll('[data-testid="calculator-hero"] source')];
    assert.deepEqual(
      [...new Set(sources.map((s) => s.getAttribute("type")))].sort(),
      ["image/avif", "image/jpeg", "image/webp"],
    );
    for (const e of [img, ...sources]) {
      assert.ok(Number(e.getAttribute("width")) > 0 && Number(e.getAttribute("height")) > 0, e.outerHTML);
      assert.match(e.getAttribute("srcset") ?? e.getAttribute("srcSet") ?? "", /\d+w/);
    }
    assert.equal(el.querySelector('[data-testid="hero-wash"] p')!.textContent, "01");
    assert.equal(el.querySelectorAll("h1").length, 1);
    assert.equal(el.querySelector("h1")!.textContent, "Dollar-cost average calculator.");
  });

  it("hero title and wash: font-independent sizes (QA r1, D1 / N4)", async () => {
    const el = await render(<Desk />);
    const h1 = el.querySelector("h1")!;
    assert.ok(h1.classList.contains("calc-title"));
    assert.equal(h1.childNodes.length, 1, "one text node: its start never moves when the font swaps");
    const t = rule(".calc-title");
    assert.match(t, /width: 5\.5em;/);
    assert.match(t, /height: 3\.3em;/);
    assert.match(t, /line-height: 1\.1;/);
    assert.match(t, /font-size: 1\.125rem;/);
  });

  it("a size-adjusted local fallback for the web font (QA r1, D1)", () => {
    assert.match(css, /font-family: "Schibsted Grotesk Fallback";/);
    assert.match(css, /size-adjust: 105\.24%;/);
    assert.match(css, /ascent-override: 92\.8%;/);
    // Only the web font's own subsets: glyphs outside it (→ on the home cards, ↳) render as before (ST0-05).
    assert.match(css, /unicode-range:\s*U\+0000-00FF,/);
    assert.doesNotMatch(css.slice(css.indexOf("Schibsted Grotesk Fallback"), css.indexOf("@theme")), /U\+2190-|U\+2192|U\+21B3/);
    assert.match(css, /--font-sans:\s*"Schibsted Grotesk", "Schibsted Grotesk Fallback"/);
  });

  it("selects and options on dark pages: charcoal and chalk (QA r1, D2)", () => {
    assert.match(css, /html\.scheme-dark select,\s*html\.scheme-dark option,\s*html\.scheme-dark optgroup \{\s*background-color: var\(--color-night\);\s*color: var\(--color-chalk\);/);
  });

  it("captions: Dividends reinvested., then the method sentence word for word (EL N1)", () => {
    assert.equal(METHOD_CAPTION, "Prices are raw daily closes. Lump sum starts on the first session every name has a price. A contribution date with no session goes in at the next session's close.");
    assert.match(readFileSync(join(process.cwd(), "src/components/desk.tsx"), "utf8"), /const lines = \[DIVIDENDS_CAPTION, METHOD_CAPTION\];/);
  });

  it("no instruction text (intro, swipe hint, scale note, field hints)", async () => {
    const el = await render(<Desk />);
    for (const w of ["Pick tickers", "Swipe", "own scale", "Used only by", "New cash on each"]) assert.doesNotMatch(el.textContent ?? "", new RegExp(w));
  });
});

describe("calculator saved searches (#80, ST4-19, -20, -22)", () => {
  const saved = (contribution: string, ticker = "PLTR") => ({
    rows: [
      { ticker, weight: "50" },
      { ticker: "TQQQ", weight: "50" },
    ],
    start: "2020-10-02",
    end: "2026-10-01",
    capital: "1000",
    contribution,
    frequency: "weekly",
    currency: "USD",
  });
  afterEach(() => dom.window.localStorage.clear());

  it("the form's first control, closed by default; with nothing stored the fields are blank", async () => {
    const el = await render(<Desk />);
    const form = el.querySelector("form")!;
    const toggle = el.querySelector<HTMLButtonElement>('[data-testid="saved-toggle"]')!;
    assert.equal(toggle.textContent, "Saved searches");
    assert.equal(toggle.type, "button");
    assert.equal(form.querySelector("button, input, select"), toggle, "first control, above the basket");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(el.querySelector('[data-testid="saved-panel"]'), null);
    await act(async () => toggle.click());
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(el.querySelector('[data-testid="saved-empty"]')!.textContent, "No saved searches yet.");
    assert.equal(el.querySelector<HTMLInputElement>('[data-testid="ticker-input"]')!.value, "");
    assert.equal([...el.querySelectorAll("button")].filter((b) => /save/i.test(b.textContent ?? "") && b !== toggle).length, 0, "no save button");
  });

  it("a refresh fills the last search and lists the saved ones; Load fills every field and closes the list", async () => {
    dom.window.localStorage.setItem("orpheus.calculator.last.v1", JSON.stringify(saved("1000")));
    dom.window.localStorage.setItem("orpheus.calculator.saved.v1", JSON.stringify([saved("1000"), saved("100", "VOO")]));
    const el = await render(<Desk />);
    const values = () => [...el.querySelectorAll<HTMLInputElement>("form input, form select")].map((f) => f.value);
    assert.deepEqual(values(), ["PLTR", "50", "TQQQ", "50", "2020-10-02", "2026-10-01", "1000", "1000", "weekly"]);
    assert.equal(el.querySelector('[data-testid="saved-panel"]'), null, "still closed");
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="saved-toggle"]')!.click());
    assert.deepEqual([...el.querySelectorAll('[data-testid="saved-text"]')].map((t) => t.textContent), [
      "PLTR, TQQQ · 2020-10-02 – 2026-10-01 · DCA $1,000",
      "VOO, TQQQ · 2020-10-02 – 2026-10-01 · DCA $100",
    ]);
    assert.ok(el.querySelector('[data-testid="saved-line"]')!.classList.contains("calc-saved-line"));
    await act(async () => el.querySelectorAll<HTMLButtonElement>('[data-testid="saved-load"]')[1].click());
    assert.deepEqual(values(), ["VOO", "50", "TQQQ", "50", "2020-10-02", "2026-10-01", "1000", "100", "weekly"]);
    assert.equal(el.querySelector('[data-testid="saved-panel"]'), null, "Load closes the list");
  });

  it("each line underlined by the fields' rule across the full width", () => {
    const r = rule(".calc-saved-line");
    assert.match(r, /border-bottom: 1px solid var\(--color-rule\);/);
    assert.match(r, /justify-content: space-between;/);
  });
});
