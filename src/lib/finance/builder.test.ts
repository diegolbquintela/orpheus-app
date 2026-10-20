// #161 (spec 46; PFCB-05..09, PFCB-11): the builder's pure helpers mirror the server validators.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { NAME_RULE, NAME_USED, PICK_ONE, atCap, labelFor, nameProblem, pickerSections, reportProblem, toRange, toggle } from "./builder.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { missingSeries } from "./report.ts";
import type { Series } from "./report.ts";

const record = {
  [STORAGE_KEY]: JSON.stringify({
    fixed: [{ id: "l-rent", name: "Rent", amount: "1000", per: "month", equity: "", account: "Amex", category: "Home" }],
    variable: [{ id: "l-food", name: "Food", amount: "300", per: "month", equity: "", account: "", category: "" }],
    accounts: ["Amex"],
    categories: ["Home"],
  }),
};
const CUR = "2026-10";
const G = (id: string): Series => ({ kind: "group", id });

describe("#161 builder helpers", () => {
  it("PFCB-05: sections and the exact { kind, id } the server takes", () => {
    const s = pickerSections(record);
    assert.deepEqual(s.map((x) => x.title), ["Metrics", "Groups", "Accounts", "Categories", "Expense lines"]);
    assert.deepEqual(s[0].options.map((o) => [o.series, o.label]), [[{ kind: "metric", id: "income" }, "Income"], [{ kind: "metric", id: "expenses" }, "Expenses"], [{ kind: "metric", id: "surplus" }, "Surplus"], [{ kind: "metric", id: "net-assets" }, "Net assets"]]);
    assert.deepEqual(s[1].options.map((o) => [o.series.id, o.label]), [["fixed", "Fixed"], ["variable", "Variable"], ["all", "All expenses"]]);
    assert.deepEqual(s[2].options.map((o) => o.series), [{ kind: "account", id: "Amex" }]);
    assert.deepEqual(s[3].options.map((o) => o.series), [{ kind: "category", id: "Home" }]);
    assert.deepEqual(s[4].options.map((o) => [o.series, o.label]), [[{ kind: "line", id: "l-rent" }, "Rent"], [{ kind: "line", id: "l-food" }, "Food"]]);
    assert.deepEqual(pickerSections(null).map((x) => x.options.length), [4, 3, 0, 0, 0]);
  });
  it("Q-AK3: a line shows its record name (the server label is the id)", () => {
    const s = pickerSections(record);
    assert.equal(labelFor({ kind: "line", id: "l-rent" }, s, "l-rent"), "Rent");
    assert.equal(labelFor({ kind: "line", id: "gone" }, s, "gone"), "gone");
    assert.equal(labelFor({ kind: "category", id: "Travel" }, s, "Travel (deleted)"), "Travel (deleted)");
  });
  it("PFCB-06: toggle never duplicates and stops at 12", () => {
    let p: Series[] = [];
    for (let i = 0; i < 14; i++) p = toggle(p, { kind: "line", id: `l${i}` });
    assert.equal(p.length, 12);
    assert.equal(atCap(p), true);
    assert.deepEqual(toggle(p, { kind: "line", id: "l0" }).length, 11);
    assert.deepEqual(toggle([G("all")], G("all")), []);
  });
  it("PFCB-07: presets and the custom shape", () => {
    for (const preset of ["3m", "6m", "12m", "24m", "ytd", "all"] as const) assert.deepEqual(toRange({ kind: "preset", preset }), { preset });
    assert.deepEqual(toRange({ kind: "custom", from: "2025-01", to: "2025-12" }), { from: "2025-01", to: "2025-12" });
  });
  it("PFCB-08: the server's range texts (save mode), the 24-month edge", () => {
    const pr = (from: string, to: string) => reportProblem([G("all")], { kind: "custom", from, to }, "line", CUR);
    assert.deepEqual(pr("2019-12", "2020-03"), { error: "Range can't start before 2020-01.", field: "range" });
    assert.deepEqual(pr("2026-01", "2026-11"), { error: "Range can't end after the current month.", field: "range" });
    assert.deepEqual(pr("2024-01", "2026-01"), { error: "Range can't be longer than 24 months.", field: "range" });
    assert.equal(pr("2024-02", "2026-01"), null);
    assert.deepEqual(pr("2026-03", "2026-01"), { error: "Invalid value.", field: "range" });
    assert.deepEqual(pr("", "2026-01"), { error: "Invalid value.", field: "range" });
    assert.deepEqual(reportProblem([], { kind: "preset", preset: "12m" }, "line", CUR), { error: PICK_ONE, field: "series" });
  });
  it("PFCB-09: chart types", () => {
    for (const c of ["line", "bar", "stacked-bar"] as const) assert.equal(reportProblem([G("all")], { kind: "preset", preset: "all" }, c, CUR), null);
    assert.deepEqual(reportProblem([G("all")], { kind: "preset", preset: "all" }, "pie" as never, CUR), { error: "Invalid value.", field: "chart" });
  });
  it("PFCB-11: names (nameError / nameTaken)", () => {
    const others = [{ id: "r-00000001", name: "Spend" }];
    assert.equal(nameProblem("", others), NAME_RULE);
    assert.equal(nameProblem("   ", others), NAME_RULE);
    assert.equal(nameProblem("x".repeat(61), others), NAME_RULE);
    assert.equal(nameProblem(` ${"x".repeat(60)} `, others), null, "60 after trimming");
    assert.equal(nameProblem("a\u0007b", others), NAME_RULE);
    assert.equal(nameProblem("default", others), NAME_USED);
    assert.equal(nameProblem("SPEND", others), NAME_USED);
    assert.equal(nameProblem("Spend", others, "r-00000001"), null, "its own name on update");
    assert.equal(nameProblem("Travel", others), null);
  });
  it("QA P3 / EL (PFCB-05): exactly the server's known set; month-line names offered; deleted names offered as `<name> (deleted)`", () => {
    const line = (id: string, name: string, category = "", account = "") => ({ id, name, amount: "200", per: "month", equity: "", account, currency: "", rate: "", category });
    const rec = (march: unknown[]) => ({
      [STORAGE_KEY]: JSON.stringify({ fixed: [line("l-rent", "Rent", "Home")], variable: [], accounts: [], categories: ["Home"], deletedCategories: [{ name: "Travel", from: "2026-06" }], deletedAccounts: [{ name: "Amex", from: "2026-06" }] }),
      [MONTHS_KEY]: JSON.stringify({ "2026-03": { fixed: march, variable: [], people: [] } }),
    });
    const kept = rec([line("l-trip", "Trip", "Travel", "Amex"), line("l-gym", "Gym", "Sport", "Visa")]);
    const s = pickerSections(kept);
    assert.deepEqual(s[2].options.map((o) => [o.series, o.label]), [[{ kind: "account", id: "Amex" }, "Amex (deleted)"]]);
    assert.deepEqual(s[3].options.map((o) => [o.series, o.label]), [[{ kind: "category", id: "Home" }, "Home"], [{ kind: "category", id: "Travel" }, "Travel (deleted)"]]);
    // A month line naming an unknown account / category (`Visa`, `Sport`) is cleared when the record is read, so the
    // server calls those series missing and the picker doesn't offer them.
    assert.deepEqual(missingSeries({ series: [{ kind: "account", id: "Visa" }, { kind: "category", id: "Sport" }, { kind: "line", id: "l-gym" }], range: { preset: "12m" }, chart: "line" }, kept), [0, 1]);
    assert.deepEqual(s[4].options.map((o) => [o.series.id, o.label]), [["l-rent", "Rent"], ["l-trip", "Trip"], ["l-gym", "Gym"]]);
    // Parity with the server: every offered series is known (not `missing`) …
    const offered = s.flatMap((x) => x.options.map((o) => o.series));
    assert.deepEqual(missingSeries({ series: offered.slice(0, 12), range: { preset: "12m" }, chart: "line" }, kept), []);
    assert.deepEqual(missingSeries({ series: offered.slice(12), range: { preset: "12m" }, chart: "line" }, kept), []);
    // QA Q3 (2026-10-20): picker set == server known set, for accounts AND categories. Every name anywhere in the raw
    // record is a candidate; the server's known ones are those `missingSeries` doesn't flag.
    for (const kind of ["account", "category"] as const) {
      const candidates = ["Amex", "Visa", "Home", "Travel", "Sport"];
      const known = candidates.filter((id) => missingSeries({ series: [{ kind, id }], range: { preset: "12m" }, chart: "line" }, kept).length === 0);
      const picker = s[kind === "account" ? 2 : 3].options.map((o) => o.series.id);
      assert.deepEqual([...picker].sort(), [...known].sort(), kind);
    }
    // … and a deleted name with no history left is not offered (the server would call it missing).
    const gone = pickerSections(rec([line("l-x", "X")]));
    assert.deepEqual(gone[2].options, []);
    assert.deepEqual(gone[3].options.map((o) => o.series.id), ["Home"]);
    assert.deepEqual(missingSeries({ series: [{ kind: "category", id: "Travel" }], range: { preset: "12m" }, chart: "line" }, rec([line("l-x", "X")])), [0]);
  });
});

// #161 QA P2 / EL (2026-10-20, PFCB-18): the reserved sizes behind CLS 0 on a cold load.
describe("#161 P2 reserved builder layout", () => {
  const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel: string, inMedia = false) => {
    const flat = inMedia ? css : css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    return [...flat.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter(([, s]) => s.split(",").some((x) => x.trim() === sel)).map(([, , b]) => b);
  };
  it("area min-height 100vh; preview min-height 60vh + legend; figure ≥ 60vh; plot 60vh; legend reserved", () => {
    assert.match(rule(".pf-builder-area").join(), /min-height:\s*100vh/);
    assert.match(rule(".pf-builder-main").join(), /min-height:\s*calc\(60vh \+ 3\.5rem\)/);
    assert.match(rule(".pf-builder-figure").join(), /min-height:\s*60vh/);
    assert.match(rule(".pf-builder-plot").join(), /height:\s*60vh/);
    assert.match(rule(".pf-builder-legend").join(), /min-height:\s*2\.5rem/);
  });
  it("no breakpoint lowers them", () => {
    const media = [...css.matchAll(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)].map((m) => m[1]).join("\n");
    for (const sel of [".pf-builder-area", ".pf-builder-main", ".pf-builder-figure", ".pf-builder-plot", ".pf-builder-legend"])
      assert.ok(![...media.matchAll(/([^{}]*)\{([^{}]*)\}/g)].some(([, s, b]) => s.split(",").some((x) => x.trim() === sel) && /height/.test(b)), sel);
  });
});
