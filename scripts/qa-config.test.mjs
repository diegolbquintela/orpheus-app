// BY (#277 harness): --base-url wins over QA_BASE_URL (QA's logins file may export it), which wins over the default.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_BASE_URL, qaConfig } from "../qa/tools/config.mjs";

const URL_ = new URL("../qa/tools/pf-months.mjs", import.meta.url).href;
const out = mkdtempSync(join(tmpdir(), "qa-config-"));
const env = { QA_BASE_URL: "https://env-host.example", QA_OUT_DIR: out };

test("QAC-01 --base-url (both forms) beats QA_BASE_URL", () => {
  for (const argv of [["--base-url", "https://flag-host.example/"], ["--base-url=https://flag-host.example"]]) {
    const c = qaConfig(URL_, argv, env);
    assert.equal(c.baseUrl, "https://flag-host.example");
    assert.equal(c.baseFrom, "--base-url");
  }
});

test("QAC-02 QA_BASE_URL is used without the flag; the default without either", () => {
  assert.deepEqual([qaConfig(URL_, [], env).baseUrl, qaConfig(URL_, [], env).baseFrom], ["https://env-host.example", "QA_BASE_URL"]);
  // #320: the default is the local server (started by lib/base-url.mjs; a fake starter here, no build).
  const start = () => ({ url: DEFAULT_BASE_URL });
  assert.deepEqual([qaConfig(URL_, [], { QA_OUT_DIR: out }, { start }).baseUrl, qaConfig(URL_, [], { QA_OUT_DIR: out }, { start }).baseFrom], [DEFAULT_BASE_URL, "default"]);
});
