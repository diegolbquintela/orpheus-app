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
