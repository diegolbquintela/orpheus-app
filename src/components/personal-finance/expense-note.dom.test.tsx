// #277 (personal-finance-spec §82, AC PFNT-04/05/06): the Note on a Fixed / Variable expense line, in jsdom with the real
// page: a 44 px `Note` toggle next to Remove (a dot when it has a note), a textarea row only while open, saved with Save;
// a Read user sees plain text, no field.
import { dom } from "../../test/dom-setup";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NOTE_MAX, STORAGE_KEY } from "@/lib/finance/expenses";
import { MONTHS_KEY } from "@/lib/finance/months";
import { PersonalFinancePage } from "./expenses-page";
import { loadLocalStore } from "@/lib/finance/account-client";

const CSS = readFileSync("src/styles.css", "utf8");
const NOW = new Date(2026, 9, 11, 12);
let root: Root | undefined;
let container: HTMLElement | undefined;

async function render(readOnly = false): Promise<HTMLElement> {
  container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<PersonalFinancePage now={NOW} loadStore={loadLocalStore} readOnly={readOnly} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  dom.window.localStorage.clear();
});
const legacy = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
legacy.attachEvent ??= () => {};
legacy.detachEvent ??= () => {};
async function type(field: Element, value: string) {
  const proto = field.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    field.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    field.dispatchEvent(new dom.window.Event("keyup", { bubbles: true }));
    field.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
}
const click = async (el: Element) => act(async () => (el as HTMLElement).click());
const q = (el: ParentNode, id: string) => el.querySelector(`[data-testid="${id}"]`);
const lines = (el: ParentNode, group: "fixed" | "variable") => [...el.querySelectorAll(`[data-testid="pf-group-${group}"] [data-testid="pf-line"]`)];
const L = (id: string, name: string, amount: string, note?: string) => ({
  id, name, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "", ...(note === undefined ? {} : { note }),
});
function seed(fixedNote?: string) {
  const fixed = [L("rent", "Rent", "1000", fixedNote)];
  const variable = [L("food", "Food", "200")];
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ fixed, variable, accounts: [], categories: [] }));
  dom.window.localStorage.setItem(MONTHS_KEY, JSON.stringify({ "2026-10": { fixed, variable, people: [] } }));
}
const storedNote = () => JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!)["2026-10"].fixed[0].note;

describe("#277 PFNT expense line notes (page)", () => {
  it("PFNT-04: a Note toggle on every Fixed and Variable line, next to Remove; collapsed by default (no field reserved)", async () => {
    seed();
    const el = await render();
    for (const g of ["fixed", "variable"] as const) {
      const line = lines(el, g)[0];
      const actions = line.querySelector(".pf-actions")!;
      assert.ok(actions, "actions cell");
      const [note, remove] = [...actions.querySelectorAll("button")];
      assert.equal(note.dataset.testid, "pf-note-toggle");
      assert.equal(remove.dataset.testid, "pf-remove");
      assert.equal(note.textContent, "Note");
      assert.equal(note.getAttribute("aria-expanded"), "false");
      assert.equal(note.dataset.hasNote, "false");
      assert.equal(line.querySelector('[data-testid="pf-note"]'), null, "no textarea until opened (CLS 0)");
      assert.equal(line.querySelector('[data-testid="pf-note-dot"]'), null);
    }
    assert.equal(lines(el, "fixed")[0].querySelector("[data-testid=pf-note-toggle]")!.getAttribute("aria-label"), "Note, Fixed 1");
  });

  it("PFNT-04/06: open, type, Save: stored with the line; collapse keeps it; reload shows the dot and the preview", async () => {
    seed();
    let el = await render();
    const toggle = lines(el, "fixed")[0].querySelector("[data-testid=pf-note-toggle]")!;
    await click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    const row = q(el, "pf-note-row")!;
    assert.equal(toggle.getAttribute("aria-controls"), row.id);
    const area = row.querySelector("textarea")!;
    assert.equal(area.maxLength, NOTE_MAX);
    assert.equal(area.rows, 2);
    assert.equal(row.querySelector("label")!.textContent, "Note for Rent");
    assert.equal(row.querySelector("label")!.htmlFor, area.id);
    assert.equal(q(el, "pf-note-count"), null, "no counter far from the limit");
    await type(area, "Lease ends June");
    assert.equal(storedNote(), undefined, "no autosave");
    await click(q(el, "pf-month-save")!);
    assert.equal(storedNote(), "Lease ends June");
    assert.equal(JSON.parse(dom.window.localStorage.getItem(MONTHS_KEY)!)["2026-10"].fixed[0].amount, "1000", "amount unchanged");
    await click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(q(el, "pf-note-row"), null, "collapsed: the row is gone");
    await act(async () => root?.unmount());
    container?.remove();
    el = await render();
    const t2 = lines(el, "fixed")[0].querySelector("[data-testid=pf-note-toggle]")!;
    assert.equal((t2 as HTMLElement).dataset.hasNote, "true");
    assert.ok(t2.querySelector("[data-testid=pf-note-dot]"), "the dot");
    assert.equal(t2.getAttribute("aria-label"), "Note, Fixed 1 (has a note)");
    assert.equal(q(el, "pf-note-preview")!.textContent, "Lease ends June");
    await click(t2);
    assert.equal(q(el, "pf-note-preview"), null, "no preview while open");
    assert.equal((q(el, "pf-note") as HTMLTextAreaElement).value, "Lease ends June");
  });

  it("PFNT-04: the counter shows near the limit (from 400) and is linked to the field", async () => {
    seed("n".repeat(420));
    const el = await render();
    await click(lines(el, "fixed")[0].querySelector("[data-testid=pf-note-toggle]")!);
    const count = q(el, "pf-note-count")!;
    assert.equal(count.textContent, "420 / 500");
    assert.equal(q(el, "pf-note")!.getAttribute("aria-describedby"), count.id);
  });

  it("PFNT-05: a Read user sees the note as plain text: no toggle, no field", async () => {
    seed("Paid on the 3rd");
    const el = await render(true);
    const line = lines(el, "fixed")[0];
    assert.equal(line.querySelector("[data-testid=pf-note-toggle]"), null);
    assert.equal(line.querySelector("textarea"), null);
    assert.equal(line.querySelector("[data-testid=pf-note-text]")!.textContent, "Note Paid on the 3rd");
    assert.equal(lines(el, "variable")[0].querySelector("[data-testid=pf-note-text]"), null, "no note, nothing shown");
    assert.ok(line.querySelector("[data-testid=pf-remove]"), "Remove stays (disabled by the Read lock, as before)");
  });

  it("PFNT-04 CSS: 44 px toggle, full-width row, no tnum, no gold, preview hidden on phones, wraps (no overflow)", () => {
    const rule = (sel: string) => new RegExp(`${sel.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
    assert.match(rule(".pf-note-toggle"), /min-width:\s*2\.75rem;[\s\S]*height:\s*2\.75rem;/);
    assert.match(rule(".pf-note-row"), /grid-column:\s*1 \/ -1;/);
    assert.match(rule(".pf-note-row"), /min-width:\s*0;/);
    assert.match(rule(".pf-note-field"), /overflow-wrap:\s*anywhere;/);
    assert.match(rule(".pf-note-text"), /overflow-wrap:\s*anywhere;/);
    assert.match(rule(".pf-note-preview"), /display:\s*none;/);
    const note = CSS.slice(CSS.indexOf("#277 (PFNT-04)"), CSS.indexOf("  .pf-add {"));
    assert.ok(note.length > 0);
    assert.doesNotMatch(note, /tabular-nums|tnum|gold|#c9a|#d4af/i);
    // existing widths pinned: phone keeps at least the 44 px remove column; the total row's grid unchanged
    assert.match(CSS, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(2\.75rem, auto\);/);
  });
});
