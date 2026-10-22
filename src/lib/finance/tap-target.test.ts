// #225 (spec 62, PFTT-01 / -02): the person checkboxes' tap target is the wrapping `label.pf-check`, at least
// 2.75rem × 2.75rem (44 px at the 16 px root) and pinned so it can't shrink; the visible box stays 1.25rem.
// jsdom has no layout, so this measures the stylesheet; the real-browser measurement is PFTT-05/06 (pf-scenario-e2e).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ROOT_PX = 16;
const MIN_PX = 44;
/** Every declaration block whose selector list names exactly `sel` (anywhere, media queries included). */
const blocks = (sel: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, s]) => s.split(",").some((x) => x.trim() === sel))
    .map(([, , body]) => Object.fromEntries(body.split(";").map((d) => d.split(":").map((x) => x.trim())).filter((d) => d.length === 2 && d[0])));
const px = (v: string | undefined) => {
  const m = /^([\d.]+)(rem|px)$/.exec(v ?? "");
  return m ? Number(m[1]) * (m[2] === "rem" ? ROOT_PX : 1) : NaN;
};

describe("PFTT-01: label.pf-check is a ≥ 44 × 44 px target that can't shrink", () => {
  const all = blocks(".pf-check");
  it("one rule, nowhere overridden", () => assert.equal(all.length, 1, "no media query or later rule restyles .pf-check"));
  const r = all[0] ?? {};
  for (const k of ["height", "width", "min-height", "min-width"])
    it(`${k} ≥ ${MIN_PX} px`, () => assert.ok(px(r[k]) >= MIN_PX, `${k}: ${r[k]}`));
  it("flex: none (never shrinks in its cell)", () => assert.equal(r.flex, "none"));
  it("no other rule narrows a .pf-check descendant's label or blocks pointer events", () => {
    assert.ok(!/\.pf-check[^{]*\{[^}]*pointer-events\s*:\s*none/.test(css));
    assert.ok(!/\.pf-check[^{]*\{[^}]*(max-height|max-width)\s*:/.test(css));
  });
});

describe("PFTT-02: the visible box is unchanged (1.25rem)", () => {
  const r = blocks(".pf-check > input")[0] ?? {};
  it("20 × 20 px", () => {
    assert.equal(px(r.height), 20);
    assert.equal(px(r.width), 20);
  });
});
