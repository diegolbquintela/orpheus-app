import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ADVICE_PATTERN } from "../../../scripts/build-fixtures.ts";
import {
  DASHBOARD_FLAG,
  dashboardEnabledFromEnv,
  guardDashboardApi,
  isDashboardEnabled,
} from "./flag.server.ts";

describe("DASHBOARD_ENABLED flag", () => {
  it("is server-only: the name has no VITE_ prefix", () => {
    assert.equal(DASHBOARD_FLAG, "DASHBOARD_ENABLED");
  });

  it("only the exact string 'true' enables", () => {
    assert.equal(isDashboardEnabled("true"), true);
    for (const value of ["false", "TRUE", "True", " true", "true ", "1", "yes", "on", "", "null"])
      assert.equal(isDashboardEnabled(value), false, JSON.stringify(value));
  });

  it("DASH-02: missing value fails closed", () => {
    assert.equal(isDashboardEnabled(undefined), false);
    assert.equal(isDashboardEnabled(null), false);
    assert.equal(dashboardEnabledFromEnv({}), false);
    assert.equal(dashboardEnabledFromEnv({ DASHBOARD_ENABLED: "true" }), true);
  });

  it("API guard: 404 JSON when off, passes through when on", async () => {
    for (const env of [{}, { DASHBOARD_ENABLED: "false" }, { DASHBOARD_ENABLED: "1" }]) {
      const res = guardDashboardApi(env);
      assert.ok(res, JSON.stringify(env));
      assert.equal(res.status, 404);
      assert.match(res.headers.get("content-type") ?? "", /application\/json/);
      assert.deepEqual(await res.json(), { error: "Not found." });
    }
    assert.equal(guardDashboardApi({ DASHBOARD_ENABLED: "true" }), null);
  });
});

const DASHBOARD_FILES = [
  "src/routes/dashboard.tsx",
  "src/routes/dashboard_.sign-in.tsx",
  ...readdirSync("src/components/dashboard").map((f) => join("src/components/dashboard", f)),
  ...readdirSync("src/routes/api/dashboard").map((f) => join("src/routes/api/dashboard", f)),
  ...readdirSync("src/lib/dashboard")
    .filter((f) => !f.endsWith(".test.ts"))
    .map((f) => join("src/lib/dashboard", f)),
];

describe("dashboard copy and isolation", () => {
  it("DASH-00: no buy/sell/hold, valuation, rating or target wording in dashboard files", () => {
    const re = new RegExp(
      `${ADVICE_PATTERN}|\\b(undervalued|overvalued|rating|ratings|price target|target price)\\b`,
      "i",
    );
    for (const file of DASHBOARD_FILES)
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => assert.doesNotMatch(line, re, `${file}:${i + 1}`));
  });

  it("DASH-01: the calculator does not link to or read the dashboard flag", () => {
    for (const file of ["src/components/desk.tsx", "src/routes/index.tsx", "src/routes/__root.tsx"]) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\/dashboard|DASHBOARD_ENABLED|lib\/dashboard/, file);
    }
  });

  it("the flag is never exposed with a VITE_ prefix", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const file of [...walk("src"), "vite.config.ts"].filter((f) => !f.endsWith("flag.test.ts")))
      assert.doesNotMatch(readFileSync(file, "utf8"), /VITE_DASHBOARD/, file);
  });

  it("the dashboard page keeps noindex", () => {
    assert.match(readFileSync("src/routes/dashboard.tsx", "utf8"), /noindex, nofollow/);
  });
});
