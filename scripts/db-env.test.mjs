import assert from "node:assert/strict";
import test from "node:test";
import { redactUrls, resolveDatabaseUrl, resolveMigrationUrl } from "./db-env.mjs";

const P = "orpheus_app_preview_";
const A = "postgresql://a-pooled";
const AU = "postgresql://a-direct";
const B = "postgresql://b-pooled";
const BU = "postgresql://b-direct";

test("nothing set (or blank): not configured", () => {
  assert.equal(resolveDatabaseUrl({}), null);
  assert.equal(resolveMigrationUrl({}), null);
  const blank = { DATABASE_URL: " ", [`${P}DATABASE_URL`]: "", DATABASE_URL_UNPOOLED: "  " };
  assert.equal(resolveDatabaseUrl(blank), null);
  assert.equal(resolveMigrationUrl(blank), null);
});

test("app: DATABASE_URL wins, else the prefixed integration var", () => {
  assert.deepEqual(resolveDatabaseUrl({ DATABASE_URL: A, [`${P}DATABASE_URL`]: B }), { url: A, name: "DATABASE_URL" });
  assert.deepEqual(resolveDatabaseUrl({ [`${P}DATABASE_URL`]: B }), { url: B, name: `${P}DATABASE_URL` });
  // The app never uses an unpooled URL.
  assert.equal(resolveDatabaseUrl({ DATABASE_URL_UNPOOLED: AU }), null);
});

test("migrations: direct connection of the first configured pair, else its pooled URL", () => {
  const all = { DATABASE_URL: A, DATABASE_URL_UNPOOLED: AU, [`${P}DATABASE_URL`]: B, [`${P}DATABASE_URL_UNPOOLED`]: BU };
  assert.deepEqual(resolveMigrationUrl(all), { url: AU, name: "DATABASE_URL_UNPOOLED" });
  assert.deepEqual(resolveMigrationUrl({ DATABASE_URL: A, [`${P}DATABASE_URL_UNPOOLED`]: BU }), { url: A, name: "DATABASE_URL" });
  assert.deepEqual(resolveMigrationUrl({ [`${P}DATABASE_URL`]: B, [`${P}DATABASE_URL_UNPOOLED`]: BU }), {
    url: BU,
    name: `${P}DATABASE_URL_UNPOOLED`,
  });
  assert.deepEqual(resolveMigrationUrl({ [`${P}DATABASE_URL`]: B }), { url: B, name: `${P}DATABASE_URL` });
});

test("redactUrls strips connection strings", () => {
  assert.equal(redactUrls("connect failed for postgresql://u:p@h/db?x=1 now"), "connect failed for [redacted-url] now");
  assert.equal(redactUrls("postgres://u:p@h/db"), "[redacted-url]");
});

test("migration guard: skip without a URL, and on production unless the flag is exactly 'true'", async () => {
  const { migrationSkipReason } = await import("./db-env.mjs");
  const url = { [`${P}DATABASE_URL`]: B };
  assert.equal(migrationSkipReason({}), "no database URL set");
  assert.equal(migrationSkipReason({ ...url }), null); // local / CI with a URL
  assert.equal(migrationSkipReason({ ...url, VERCEL_ENV: "preview" }), null);
  assert.equal(migrationSkipReason({ ...url, VERCEL_ENV: "development" }), null);
  for (const flag of [undefined, "", "false", "TRUE", " true", "1"])
    assert.equal(
      migrationSkipReason({ ...url, VERCEL_ENV: "production", DASHBOARD_ENABLED: flag }),
      "VERCEL_ENV=production and dashboard flag off",
      String(flag),
    );
  assert.equal(migrationSkipReason({ ...url, VERCEL_ENV: "production", DASHBOARD_ENABLED: "true" }), null);
  assert.equal(migrationSkipReason({ VERCEL_ENV: "production", DASHBOARD_ENABLED: "true" }), "no database URL set");
});

test("migrate.mjs exits 0 with a value-free skip log on production with the flag off", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const script = fileURLToPath(new URL("./migrate.mjs", import.meta.url));
  // Unreachable on purpose: the guard must stop before any connection attempt.
  const secretish = "postgresql://user:sup3rsecret@127.0.0.1:1/db";
  const base = { PATH: process.env.PATH, HOME: process.env.HOME, [`${P}DATABASE_URL`]: secretish };
  const run = (extra) => spawnSync(process.execPath, [script], { env: { ...base, ...extra }, encoding: "utf8", timeout: 20000 });

  const skipped = run({ VERCEL_ENV: "production" });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /\[migrate\] skipped: VERCEL_ENV=production and dashboard flag off/);
  assert.doesNotMatch(skipped.stdout + skipped.stderr, /sup3rsecret|127\.0\.0\.1/);

  // Flag on in production: the guard lets it through (it then fails to connect, without printing the URL).
  const attempted = run({ VERCEL_ENV: "production", DASHBOARD_ENABLED: "true" });
  assert.notEqual(attempted.status, 0);
  assert.match(attempted.stdout, /\[migrate\] using orpheus_app_preview_DATABASE_URL/);
  assert.doesNotMatch(attempted.stdout + attempted.stderr, /sup3rsecret/);
});
