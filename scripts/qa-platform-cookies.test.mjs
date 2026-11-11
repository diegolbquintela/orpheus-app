// #331: exact __vdpl allowlist. No browser, no network. The QA tools that call the helper launch
// Chromium at import, so this file pins their call sites by reading the source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isPlatformCookie, nonPlatformCookies, siteCookiesOk } from "../qa/tools/lib/platform-cookies.mjs";

test("CK-01 exact __vdpl is the only platform cookie", () => {
  assert.equal(isPlatformCookie("__vdpl"), true);
  assert.equal(nonPlatformCookies([{ name: "__vdpl" }]).length, 0);
  assert.equal(nonPlatformCookies(["__vdpl"]).length, 0);
  for (const name of ["__vdpl_extra", "x__vdpl", "__v", "__VDPL", "session", "__vdpl "]) {
    assert.equal(isPlatformCookie(name), false, name);
    assert.equal(nonPlatformCookies([{ name }]).length, 1, name);
  }
  const mixed = nonPlatformCookies([{ name: "__vdpl" }, { name: "__Host-orpheus-auth.session_token" }]);
  assert.deepEqual(mixed.map((c) => c.name), ["__Host-orpheus-auth.session_token"]);
});

test("CK-01 PF-07 siteCookiesOk drops exact __vdpl then requires /auth/", () => {
  assert.equal(siteCookiesOk(["__vdpl"]), true);
  assert.equal(siteCookiesOk(["__vdpl", "__Host-orpheus-auth.session_token"]), true);
  assert.equal(siteCookiesOk([{ name: "__vdpl" }, { name: "other" }]), false);
  assert.equal(siteCookiesOk(["other"]), false);
  assert.equal(siteCookiesOk(["__Host-orpheus-auth.session_token"]), true);
  assert.equal(siteCookiesOk([]), true);
  assert.equal(siteCookiesOk(["__vdpl_extra"]), false);
});

test("CK-01 call sites use the shared helper", () => {
  const saved = readFileSync("qa/tools/saved-searches.mjs", "utf8");
  assert.match(saved, /const cookies = nonPlatformCookies\(jar\)/);
  assert.match(saved, /cookies\.length === 0/);
  const pf = readFileSync("qa/tools/personal-finance.mjs", "utf8");
  assert.match(pf, /siteCookiesOk\(cookies\)/);
  assert.doesNotMatch(pf, /cookies\.every\(\(n\) => \/auth\//);
});
