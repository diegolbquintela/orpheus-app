// #51 (TL-01..05 in qa/CANONICAL-AC-PACK.md): the Grok App Builder tooling stays gone.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GONE = [
  ".grok",
  "startup.sh",
  "scripts/preview.mjs",
  "scripts/preview.test.mjs",
  "scripts/preview-thumbnail.mjs",
  "scripts/with-app-env.mjs",
  "scripts/with-app-env.test.mjs",
  "scripts/app-env-plugin.mjs",
  "scripts/check-auth-invariant.mjs",
  "scripts/check-auth-invariant.test.mjs",
  "scripts/write-atomic.mjs",
  "scripts/write-atomic.test.mjs",
  "scripts/browser-smoke.mjs",
  "scripts/browser-smoke-verdict.mjs",
  "scripts/browser-smoke-verdict.test.mjs",
  "scripts/browser-guard.mjs",
  "screenshots/app-builder-built.png",
  "screenshots/app-builder-built.json",
  "screenshots/app-builder-built-mobile.png",
  "screenshots/app-builder-preview.png",
  "screenshots/app-builder-preview.json",
  "screenshots/app-builder-preview-mobile.png",
];

test("TL-01 template tooling files are gone", () => {
  assert.deepEqual(GONE.filter((p) => existsSync(join(ROOT, p))), []);
});

test("TL-02 package scripts run Vite directly (no with-app-env, no preview.mjs, no check:auth)", () => {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const all = Object.entries(scripts).map(([k, v]) => `${k}: ${v}`).join("\n");
  assert.doesNotMatch(all, /with-app-env|preview\.mjs|check-auth-invariant|check:auth/);
  assert.match(scripts.build, /^vite build && npm run db:migrate$/);
  assert.match(scripts.dev, /^vite dev /);
});

test("TL-03 vite.config.ts loads no app-env plugin", () => {
  assert.doesNotMatch(readFileSync(join(ROOT, "vite.config.ts"), "utf8"), /app-env/);
});

test("TL-05 kept: the auth migrations", () => {
  for (const p of ["migrations/0001_auth.sql", "migrations/auth/0001_auth.sql"]) assert.ok(existsSync(join(ROOT, p)), p);
});
