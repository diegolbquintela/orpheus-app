// Site-wide headers (#50): the policy itself, and every copy of it in config, page head and checks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { REFERRER_POLICY, SITE_HEADERS } from "./headers.ts";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("Referrer-Policy is no-referrer and X-Robots-Tag keeps noindex", () => {
  assert.equal(REFERRER_POLICY, "no-referrer");
  assert.deepEqual(SITE_HEADERS, { "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
});

test("vite.config.ts writes SITE_HEADERS as one catch-all Vercel route that continues", () => {
  const config = read("vite.config.ts");
  assert.match(config, /import \{ SITE_HEADERS \} from "\.\/src\/lib\/site\/headers\.ts"/);
  assert.match(config, /routes: \[\{ src: "\/\(\.\*\)", headers: \{ \.\.\.SITE_HEADERS \}, continue: true \}\]/);
  // Which paths the built rule covers is checked on the build output (scripts/check-dashboard-built.mjs).
  // The Grok PWA plugin and server/ middleware are gone (#50).
  assert.doesNotMatch(config, /grok|serverDir/i);
});

test("__root.tsx sets the matching referrer meta and no Grok head links", () => {
  const root = read("src/routes/__root.tsx");
  assert.match(root, /\{ name: "referrer", content: REFERRER_POLICY \}/);
  assert.match(root, /import \{ REFERRER_POLICY \} from "@\/lib\/site\/headers"/);
  assert.doesNotMatch(root, /__grok|manifest|apple-touch-icon|PreviewHostBridge/);
});

test("the post-build check and the release smoke expect the same policy", () => {
  for (const path of ["scripts/check-dashboard-built.mjs", "scripts/release-smoke.mjs"])
    assert.match(read(path), new RegExp(`const REFERRER_POLICY = "${REFERRER_POLICY}";`), path);
});
