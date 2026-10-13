#!/usr/bin/env node
// @ts-check
/**
 * #93 CLI: `node scripts/data-encryption.mjs <status|encrypt|reencrypt|decrypt> [--dry-run] [--confirm-plaintext]`
 * (attachments/encryption-at-rest-design.md sections 5–6). Needs a database URL (scripts/db-env.mjs) and
 * ORPHEUS_ENCRYPTION_KEY (+ ORPHEUS_ENCRYPTION_KEYS_OLD while rotating) in the environment. Prints counts only:
 * never a key, a value or the database URL. `decrypt` writes plaintext back and needs --confirm-plaintext.
 */
import pg from "pg";
import { keyringFromEnv } from "./data-crypto.mjs";
import { encryptionStatus, migrateColumns } from "./data-migrate.mjs";
import { resolveMigrationUrl } from "./db-env.mjs";

const [mode, ...flags] = process.argv.slice(2);
const MODES = ["status", "encrypt", "reencrypt", "decrypt"];
if (!MODES.includes(mode ?? "")) {
  console.error(`usage: node scripts/data-encryption.mjs <${MODES.join("|")}> [--dry-run] [--confirm-plaintext]`);
  process.exit(2);
}
if (mode === "decrypt" && !flags.includes("--confirm-plaintext")) {
  console.error("[encryption] decrypt writes plaintext back; re-run with --confirm-plaintext to proceed.");
  process.exit(2);
}
const keys = keyringFromEnv(process.env);
if (!keys.ok) {
  console.error(`[encryption] refused: ${keys.reason}`);
  process.exit(1);
}
const target = resolveMigrationUrl(process.env);
if (!target) {
  console.error("[encryption] refused: no database URL set");
  process.exit(1);
}
console.log(`[encryption] using ${target.name}; current key ${keys.keyring.current.kid}`);
const pgPool = new pg.Pool({ connectionString: target.url, max: 1 });
const pool = { query: async (/** @type {string} */ t, /** @type {unknown[] | undefined} */ p) => (await pgPool.query(t, p)).rows };
try {
  if (mode === "status") console.log(JSON.stringify(await encryptionStatus(pool, keys.keyring), null, 2));
  else {
    const res = await migrateColumns(pool, keys.keyring, /** @type {"encrypt"|"reencrypt"|"decrypt"} */ (mode), {
      dryRun: flags.includes("--dry-run"),
    });
    console.log(JSON.stringify(res, null, 2));
    console.log(JSON.stringify(await encryptionStatus(pool, keys.keyring), null, 2));
  }
} finally {
  await pgPool.end();
}
