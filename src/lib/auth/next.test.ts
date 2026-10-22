import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNext } from "./next.ts";
import { EDIT_SIGN_IN_NEXT, NEW_SIGN_IN_NEXT } from "../finance/builder.ts";

// #102 QA D1 (open redirect via ?next=): spec section 16.4 / PF-34.
describe("sign-in ?next allowlist (#102 D1)", () => {
  it("keeps the exact relative path /personal-finance", () => {
    assert.equal(safeNext("/personal-finance"), "/personal-finance");
  });
  it("#214 PFHT-02: keeps the exact path /personal-finance/history; near-misses → /dashboard", () => {
    assert.equal(safeNext("/personal-finance/history"), "/personal-finance/history");
    for (const v of ["/personal-finance/history/", "/personal-finance/History", "/personal-finance/history?year=2025", "/personal-finance/history#a", "//personal-finance/history", "https://evil.example/personal-finance/history"])
      assert.equal(safeNext(v), "/dashboard");
  });
  it("#215 PFSC-02: keeps the exact path /personal-finance/scenario; near-misses → /dashboard", () => {
    assert.equal(safeNext("/personal-finance/scenario"), "/personal-finance/scenario");
    for (const v of ["/personal-finance/scenario/", "/personal-finance/Scenario", "/personal-finance/scenario?h=12", "//personal-finance/scenario", "https://evil.example/personal-finance/scenario"])
      assert.equal(safeNext(v), "/dashboard");
  });
  it("#160 PFCL-01: keeps the exact path /personal-finance/charts; near-misses → /dashboard", () => {
    assert.equal(safeNext("/personal-finance/charts"), "/personal-finance/charts");
    for (const v of ["/personal-finance/charts/", "/personal-finance/Charts", "/personal-finance/charts?x=1", "//personal-finance/charts", "https://evil.example/personal-finance/charts", "/personal-finance/charts#a"])
      assert.equal(safeNext(v), "/dashboard", v);
  });
  it("#161 PFCB-01: keeps the exact path /personal-finance/charts/new; near-misses (and edit paths) → /dashboard", () => {
    assert.equal(safeNext("/personal-finance/charts/new"), "/personal-finance/charts/new");
    for (const v of ["/personal-finance/charts/new/", "/personal-finance/charts/New", "/personal-finance/charts/new?x=1", "/personal-finance/charts/new#a", "//personal-finance/charts/new", "https://evil.example/personal-finance/charts/new", "/personal-finance/charts/r-0000abcd/edit", "/personal-finance/charts/default/edit", "/personal-finance/charts/new/edit", " /personal-finance/charts/new"])
      assert.equal(safeNext(v), "/dashboard", v);
  });
  it("#161 EL O3: the builder routes' sign-in next: /new kept; every edit route (default included) lands on the list", () => {
    assert.equal(safeNext(NEW_SIGN_IN_NEXT), "/personal-finance/charts/new");
    assert.equal(EDIT_SIGN_IN_NEXT, "/personal-finance/charts");
    assert.equal(safeNext(EDIT_SIGN_IN_NEXT), "/personal-finance/charts", "not /dashboard");
  });
  it("#90 ROLE-02: keeps the exact relative path /account; near-misses → /dashboard", () => {
    assert.equal(safeNext("/account"), "/account");
    for (const v of ["/account/", "/Account", "/account?x=1", "//account", "https://evil.example/account"])
      assert.equal(safeNext(v), "/dashboard", v);
  });
  it("an external https URL → /dashboard", () => {
    assert.equal(safeNext("https://evil.example"), "/dashboard");
    assert.equal(safeNext("https://evil.example/personal-finance"), "/dashboard");
    assert.equal(safeNext("http://evil.example"), "/dashboard");
    assert.equal(safeNext("javascript:alert(1)"), "/dashboard");
  });
  it("a protocol-relative //evil.example (and backslash variants) → /dashboard", () => {
    assert.equal(safeNext("//evil.example"), "/dashboard");
    assert.equal(safeNext("//evil.example/personal-finance"), "/dashboard");
    assert.equal(safeNext("/\\evil.example"), "/dashboard");
    assert.equal(safeNext("\\\\evil.example"), "/dashboard");
  });
  it("any other path, near-miss or extra → /dashboard", () => {
    for (const v of [
      "/calculator",
      "/dashboard/holdings",
      "/",
      "/personal-finance/",
      "/personal-finance?x=1",
      "/personal-finance#a",
      "/Personal-Finance",
      " /personal-finance",
      "personal-finance",
      "%2Fpersonal-finance",
    ])
      assert.equal(safeNext(v), "/dashboard", v);
  });
  it("missing or not a string → /dashboard", () => {
    for (const v of [undefined, null, "", 1, ["/personal-finance"], { next: "/personal-finance" }])
      assert.equal(safeNext(v), "/dashboard");
  });
});
