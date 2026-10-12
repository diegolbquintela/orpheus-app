import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNext } from "./next.ts";

// #102 QA D1 (open redirect via ?next=): spec section 16.4 / PF-34.
describe("sign-in ?next allowlist (#102 D1)", () => {
  it("keeps the exact relative path /personal-finance", () => {
    assert.equal(safeNext("/personal-finance"), "/personal-finance");
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
