// Calculator page (#70, spec §7 / §7a; ST4-03, -04, -05, -06, -07) in jsdom with the real components: one chart
// series and the last-value pill, label-value results with no table, the calculator's own underline field class,
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
import { METRIC_ROWS } from "@/lib/dca/results";
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

describe("calculator results (#70, ST4-06, ST4-10)", () => {
  it("label-value rows: every METRIC_ROWS label word for word as a caption, then Lump sum and DCA", async () => {
    const el = await render(<ResultRows run={RUN} currency="USD" />);
    const metrics = [...el.querySelectorAll('[data-testid="result-metric"]')];
    assert.deepEqual(
      metrics.map((m) => m.querySelector("p")!.textContent),
      METRIC_ROWS.map((m) => m.label),
    );
    for (const m of metrics) {
      assert.deepEqual([...m.querySelectorAll("dt")].map((d) => d.textContent), ["Lump sum", "DCA"]);
      assert.ok(m.querySelector("dl")!.classList.contains("calc-pairs"));
    }
    const invested = metrics[0].querySelector('[data-plan="dca"] dd')!;
    assert.equal(invested.textContent, "$313,000");
    assert.ok(invested.querySelector('[data-part="main"]')!.classList.contains("whitespace-nowrap"));
  });

  it("Max drop: the figure on the label's line, the date on its own muted line, wording unchanged (QA r1, D3)", async () => {
    const el = await render(<ResultRows run={RUN} currency="USD" />);
    const dd = el.querySelector('[data-key="drop"] [data-plan="lump"] dd')!;
    const drop = METRIC_ROWS.find((m) => m.key === "drop")!;
    assert.equal(dd.textContent, drop.value(RUN.lump, "USD"), "the separator stays in the text");
    assert.match(dd.querySelector('[data-part="main"]')!.textContent!, /%$/);
    const date = dd.querySelector('[data-part="date"]')!;
    assert.equal(date.textContent, "2022-12-28");
    assert.ok(["absolute", "text-xs", "text-dim", "whitespace-nowrap"].every((c) => date.classList.contains(c)));
    assert.ok(dd.classList.contains("relative") && dd.classList.contains("pb-4"), "room for the date line");
    assert.ok(dd.querySelector(".sr-only"));
  });

  it("no table, no boxes: no <table>, no border or background classes on the rows", async () => {
    const el = await render(<ResultRows run={RUN} currency="USD" />);
    assert.equal(el.querySelector("table"), null);
    assert.equal(el.querySelectorAll("[class*=border], [class*=bg-]").length, 0);
  });

  it("two columns while each is at least 150 px, stacked otherwise (CSS grid auto-fit)", () => {
    assert.match(rule(".calc-pairs"), /grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\);/);
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
