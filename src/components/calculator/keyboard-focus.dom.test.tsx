// #274 keyboard focus (attachments/keyboard-focus-spec.md; KBF-01..KBF-05). jsdom has no Tab navigation, so the
// sequential focus order is derived the way a browser does for these controls (DOM order, tabIndex >= 0, not
// disabled, not hidden) and every Tab keydown is dispatched through React to prove nothing swallows it.
// The phone/desktop basket-row order comes from the stylesheet's grid areas plus `reading-flow: grid-rows`.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Desk } from "../desk";

// React DOM's old-browser input fallback hooks focus through IE's attachEvent (see calculator.dom.test.tsx).
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
});
async function renderDesk(): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Desk />));
  return container;
}

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";
/** Tab stops in sequential order (no positive tabindex is used on the site, KBF-03). */
function tabStops(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (e) =>
      e.tabIndex >= 0 &&
      !(e as HTMLButtonElement).disabled &&
      !e.closest("[hidden], [inert]") &&
      e.getAttribute("type") !== "hidden",
  );
}
/** The visible label (Ticker, Start, ...) or, for a button, its test id / text. */
const name = (e: HTMLElement) =>
  e.closest("label")?.querySelector(".calc-label")?.textContent?.trim() ??
  e.getAttribute("data-testid") ??
  (e.textContent!.trim() || e.tagName);

/** Dispatches Tab (or Shift-Tab) keydown on the field; returns whether anything called preventDefault. */
function pressTab(field: HTMLElement, shift = false): boolean {
  field.focus();
  const e = new dom.window.KeyboardEvent("keydown", { key: "Tab", code: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
  field.dispatchEvent(e);
  return e.defaultPrevented;
}

const FIELDS = ["Ticker", "Weight", "↳ Add name", "Start", "End", "Starting capital", "Contribution", "Frequency", "compare"];

describe("DCA calculator keyboard focus (#274)", () => {
  it("KBF-01: Tab visits the form fields in visual order, Shift-Tab in reverse", async () => {
    const el = await renderDesk();
    const form = el.querySelector<HTMLElement>('[data-testid="calculator-form"]')!;
    const stops = tabStops(form);
    const fieldStops = stops.filter((s) => !s.closest('[data-testid="saved-searches"]'));
    const names = fieldStops.map(name);
    assert.deepEqual(names, FIELDS);
    // Each field is focusable and focus really lands on it, forward and backward.
    for (const s of fieldStops) {
      s.focus();
      assert.equal(dom.window.document.activeElement, s, `${name(s)} takes focus`);
    }
    for (const s of [...fieldStops].reverse()) {
      s.focus();
      assert.equal(dom.window.document.activeElement, s);
    }
  });

  it("KBF-02: no Tab or Shift-Tab keydown is defaultPrevented on any calculator control", async () => {
    const el = await renderDesk();
    const stops = tabStops(el);
    assert.ok(stops.length >= FIELDS.length);
    for (const s of stops) {
      assert.equal(pressTab(s), false, `Tab on ${name(s)} is not swallowed`);
      assert.equal(pressTab(s, true), false, `Shift-Tab on ${name(s)} is not swallowed`);
    }
  });

  it("KBF-05: Start and End are plain text fields (one Tab stop each); every DCA field is a native input or select", async () => {
    const el = await renderDesk();
    const form = el.querySelector<HTMLElement>('[data-testid="calculator-form"]')!;
    assert.equal(form.querySelector('input[type="date"]'), null, "no native date input (its segments take 3-4 Tab stops)");
    for (const f of ["start", "end"]) {
      const input = form.querySelector<HTMLInputElement>(`input[data-field="${f}"]`)!;
      assert.equal(input.type, "text");
      assert.equal(input.placeholder, "YYYY-MM-DD");
      assert.equal(tabStops(input.closest("label")!).length, 1, `${f}: exactly one Tab stop`);
    }
    // Safari's default Tab reaches only text fields (and selects): every typed DCA field is a real <input type=text>.
    const typed = [...form.querySelectorAll<HTMLElement>(".calc-field")];
    assert.equal(typed.length, 7);
    for (const t of typed) assert.ok(t.tagName === "SELECT" || (t as HTMLInputElement).type === "text", name(t));
    assert.equal(form.querySelector('[role="textbox"], [role="combobox"], [contenteditable]'), null);
  });

  it("KBF-05: typing a date into the text field submits it like before (no errors for real dates)", async () => {
    const el = await renderDesk();
    const set = async (sel: string, value: string) => {
      const f = el.querySelector<HTMLInputElement | HTMLSelectElement>(sel)!;
      const proto = f.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      await act(async () => {
        f.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(f, value);
        f.dispatchEvent(new dom.window.Event(f.tagName === "SELECT" ? "change" : "keyup", { bubbles: true }));
        f.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
      });
    };
    await set('input[data-field="start"]', "2020-02-30");
    await set('input[data-field="end"]', "2026-10-01");
    await act(async () => {
      el.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    const msg = (f: string) => el.querySelector(`[data-testid="field-error"][data-field="${f}"]`)?.textContent ?? null;
    assert.equal(msg("start"), "Add a start date.");
    assert.equal(msg("end"), null);
    assert.equal(el.querySelector('input[data-field="start"]')!.getAttribute("aria-invalid"), "true");
    assert.equal((el.querySelector('input[data-field="start"]') as HTMLInputElement).value, "2020-02-30", "value kept as typed");
  });

  it("KBF-03: no calculator field is out of the tab order or has a positive tabindex; nothing autofocuses", async () => {
    const el = await renderDesk();
    for (const f of el.querySelectorAll<HTMLElement>("input, select, button")) {
      if (!(f as HTMLButtonElement).disabled) assert.ok(f.tabIndex === 0, `${name(f)} tabIndex is 0`);
      assert.equal(f.hasAttribute("autofocus"), false);
    }
    assert.equal(el.querySelector("[tabindex]:not([tabindex='0'])"), null);
    assert.notEqual(dom.window.document.activeElement?.closest?.('[data-testid="calculator-form"]') ?? null, el.querySelector("form"));
  });
});

// KBF-04: the basket row's reading order. DOM order is ticker, weight, remove (unchanged).
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
function areas(block: string): string[][] {
  const m = /grid-template-areas:\s*((?:"[^"]*"\s*)+);/.exec(block);
  assert.ok(m, "grid-template-areas in .calc-row");
  return [...m[1].matchAll(/"([^"]*)"/g)].map((r) => r[1].trim().split(/\s+/));
}
/** reading-flow: grid-rows order: by the row, then the column, where each area starts. */
function gridRowsOrder(grid: string[][], items: string[]): string[] {
  const start = (a: string) => {
    for (let r = 0; r < grid.length; r++) {
      const c = grid[r].indexOf(a);
      if (c >= 0) return r * 100 + c;
    }
    throw new Error(`area ${a}`);
  };
  return [...items].sort((a, b) => start(a) - start(b));
}
const rowBlock = (from: number) => css.slice(css.indexOf(".calc-row {", from), css.indexOf("}", css.indexOf(".calc-row {", from)));
const DOM_ORDER = ["ticker", "weight", "remove"];

describe("basket row tab order vs layout (#274, KBF-04)", () => {
  const phone = rowBlock(0);
  const wideAt = css.indexOf("@media (min-width: 64rem)");
  const wide = rowBlock(wideAt);

  it("the row follows its grid rows (layout-only; DOM unchanged)", async () => {
    assert.match(phone, /reading-flow: grid-rows;/);
    const el = await renderDesk();
    const row = el.querySelector('[data-testid="basket-row"]')!;
    const kids = [...row.children].map((c) => c.className.match(/calc-(ticker|weight|remove)/)?.[1]).filter(Boolean);
    assert.deepEqual(kids, DOM_ORDER, "DOM order is untouched");
  });

  it("phone: visual (grid-rows) order puts remove right after the ticker, as it is drawn", () => {
    const grid = areas(phone);
    assert.deepEqual(grid[0], ["ticker", "remove"], "phone layout unchanged: remove sits beside the ticker");
    assert.deepEqual(gridRowsOrder(grid, DOM_ORDER), ["ticker", "remove", "weight"]);
  });

  it("desktop: layout unchanged and the tab order equals DOM order", () => {
    const grid = areas(wide);
    assert.deepEqual(grid[0], ["ticker", "weight", "remove"]);
    assert.deepEqual(gridRowsOrder(grid, DOM_ORDER), DOM_ORDER);
  });
});
