import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import seedFile from "../../lib/research/yearly-returns.seed.json" with { type: "json" };
import { MARKET_RETURN_NOTE, normalizeReturn, type YearReturn } from "../../lib/research/returns.ts";
import { Heatmap } from "./heatmap";

const seed = (seedFile as { rows: YearReturn[] }).rows.map((row) => normalizeReturn(row));

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

const cells = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-testid="rs-cell"]')];

describe("research heatmap (#333)", () => {
  it("renders the full seed grid for each ticker", async () => {
    const el = await render(<Heatmap rows={seed} />);
    for (const ticker of ["SPY", "QQQ", "VT", "UPRO", "TQQQ"]) {
      const button = [...el.querySelectorAll("button")].find((node) => node.textContent === ticker)!;
      await act(async () => button.click());
      const mine = seed.filter((row) => row.ticker === ticker).slice().sort((a, b) => b.year - a.year);
      const shown = cells(el);
      assert.equal(shown.length, mine.length, ticker);
      const years = shown.map((cell) => Number(cell.getAttribute("data-year")));
      assert.deepEqual(years, mine.map((row) => row.year), ticker);
      for (let i = 1; i < years.length; i++) assert.ok(years[i - 1]! > years[i]!, `${ticker} descending`);
      assert.equal(shown[0]?.getAttribute("data-year"), String(Math.max(...years)), ticker);
      assert.match(shown[0]?.textContent ?? "", /YTD/, ticker);
      if (ticker === "SPY") assert.equal(shown.at(-1)?.getAttribute("data-year"), "1994");
      if (ticker === "QQQ") assert.equal(shown.at(-1)?.getAttribute("data-year"), "1999");
    }
    assert.match(el.querySelector('[data-testid="rs-summary"]')!.textContent ?? "", /^\d+ up, \d+ down$/);
    const note = el.querySelector('[data-testid="rs-source"]');
    assert.ok(note);
    assert.equal(note.textContent, MARKET_RETURN_NOTE);
    assert.equal(note.classList.contains("rs-note"), true);
    assert.equal(note.classList.contains("ow-label"), false);
    assert.equal(note.closest(".ow-label"), null);
    for (let node: Element | null = note; node; node = node.parentElement) {
      assert.equal(node.classList.contains("ow-label"), false);
      assert.doesNotMatch(node.getAttribute("style") ?? "", /uppercase/i);
    }
    assert.equal(note.previousElementSibling?.tagName, "H1");
    const rule = readFileSync("src/styles.css", "utf8").match(/\.rs-note\s*\{[^}]+\}/)?.[0] ?? "";
    assert.match(rule, /color:\s*var\(--color-dim\)/);
    assert.match(rule, /letter-spacing:\s*normal/);
    assert.match(rule, /text-transform:\s*none/);
    assert.doesNotMatch(rule, /uppercase|0\.14em|ow-label/);
    assert.doesNotMatch(el.innerHTML, /gold|#c9a227|#d4af37/i);
  });

  it("a stored year changes only that cell", async () => {
    const overridden = seed.map((row) => (row.ticker === "SPY" && row.year === 2008 ? { ...row, return_pct: -1 } : row));
    const el = await render(<Heatmap rows={overridden} />);
    const cell = cells(el).find((node) => node.getAttribute("data-year") === "2008")!;
    assert.equal(cell.getAttribute("data-sign"), "down");
    assert.match(cell.style.backgroundColor, /255[, ]+143[, ]+135/);
    const up = cells(el).find((node) => node.getAttribute("data-sign") === "up");
    assert.ok(up);
    assert.match(up.style.backgroundColor, /92, 192, 138|92 192 138/);
    assert.equal(cells(el).length, seed.filter((row) => row.ticker === "SPY").length);
  });
});
