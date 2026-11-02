// #278 CA (QA 2026-11-02): e2e output masks email addresses in log lines and JSON artifacts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { maskDeep, maskEmails, maskedJson } from "../qa/tools/redact.mjs";

const MOD = new URL("../qa/tools/redact.mjs", import.meta.url).href;

test("REDACT-01 email-shaped strings become <email>; other text is kept", () => {
  assert.equal(maskEmails("SKIPPED: set QA_EMAIL (e.g. qa-pf@orpheus.test) and a.b+c@sub.example.co.uk"), "SKIPPED: set QA_EMAIL (e.g. <email>) and <email>");
  assert.equal(maskEmails("PASS no email @ here, 12@3, a@b"), "PASS no email @ here, 12@3, a@b");
  assert.equal(maskEmails("x"), "x");
});

test("REDACT-02 a JSON artifact has no email in values, keys or nested details", () => {
  const R = { checks: [{ name: "fill fake@example.com", detail: { user: { email: "QA.User@Orpheus.test" }, list: ["x", "y@z.io"] } }], ["k@d.io"]: 1 };
  const out = maskedJson(R);
  assert.doesNotMatch(out, /@[A-Za-z0-9-]+\.[A-Za-z]/);
  assert.equal(JSON.parse(out).checks[0].detail.user.email, "<email>");
  assert.deepEqual(maskDeep([1, null, true]), [1, null, true]);
});

test("REDACT-03 installConsoleMask masks a real process's console output and its artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "redact-"));
  const f = join(dir, "s.mjs");
  writeFileSync(f, `import { installConsoleMask, maskedJson } from ${JSON.stringify(MOD)};
installConsoleMask();
console.log("FAIL sign-in as qa-pf@orpheus.test", { e: "x@y.com" });
console.error("err owner@orpheus.test");
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(join(dir, "a.json"))}, maskedJson({ detail: "z@w.org" }));`);
  const r = spawnSync(process.execPath, [f], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const all = r.stdout + r.stderr + readFileSync(join(dir, "a.json"), "utf8");
  assert.doesNotMatch(all, /@[A-Za-z0-9-]+\.[A-Za-z]/);
  assert.match(r.stdout, /FAIL sign-in as <email>/);
  assert.match(r.stderr, /err <email>/);
});

test("REDACT-04 personal-finance-e2e installs the mask before any output and writes its JSON masked", () => {
  const src = readFileSync(new URL("../qa/tools/personal-finance-e2e.mjs", import.meta.url), "utf8");
  const install = src.indexOf("installConsoleMask();");
  assert.ok(install > 0 && install < src.indexOf("qaConfig(import.meta.url)"), "mask installed before the first log (qaConfig logs the base URL)");
  assert.match(src, /writeFileSync\(join\(CFG\.out, "personal-finance-e2e\.json"\), maskedJson\(R\)\)/);
  assert.doesNotMatch(src, /JSON\.stringify\(R, null, 2\)/);
});
