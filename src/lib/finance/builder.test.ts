// #161 (spec 46; PFCB-05..09, PFCB-11): the builder's pure helpers mirror the server validators.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NAME_RULE, NAME_USED, PICK_ONE, atCap, labelFor, nameProblem, pickerSections, reportProblem, toRange, toggle } from "./builder.ts";
import { STORAGE_KEY } from "./expenses.ts";
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
});
