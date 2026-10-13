// @ts-check
/**
 * #93 encryption at rest (attachments/encryption-at-rest-design.md sections 2–5). Server-only; shared by the app
 * (`src/lib/crypto`) and the migration CLI (`scripts/data-encryption.mjs`).
 *
 * Envelope `enc:v1:<kid>:<base64url(iv ‖ ciphertext ‖ tag)>`, AES-256-GCM, AAD = the column context `table.column`.
 * Deterministic columns (looked up by equality) derive the IV from HMAC(macKey, context ‖ 0 ‖ plaintext).
 * Keys only from env: ORPHEUS_ENCRYPTION_KEY (`<kid>:<base64 of 32 bytes>`) and the optional, comma-separated
 * ORPHEUS_ENCRYPTION_KEYS_OLD (decrypt / look up only). Never log a key or a plaintext; errors name context + kid.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

export const KEY_ENV = "ORPHEUS_ENCRYPTION_KEY";
export const OLD_KEYS_ENV = "ORPHEUS_ENCRYPTION_KEYS_OLD";
export const PREFIX = "enc:v1:";
const KID_RE = /^[a-z0-9]{1,8}$/;

/**
 * Sensitive columns (design section 3). `det`: deterministic (equality lookups); `lower`: lower-cased before
 * sealing. Tables are Better Auth's (camelCase, quoted) plus `personal_finance`.
 * @type {Readonly<Record<string, Readonly<Record<string, { det?: boolean, lower?: boolean }>>>>}
 */
export const SEALED_COLUMNS = Object.freeze({
  user: { email: { det: true, lower: true }, name: {}, image: {} },
  session: { token: { det: true }, ipAddress: {}, userAgent: {} },
  account: { password: {}, accessToken: {}, refreshToken: {}, idToken: {} },
  verification: { identifier: { det: true }, value: {} },
  personal_finance: { data: {} },
});

/** @param {string} table @param {string} column */
export function columnSpec(table, column) {
  return SEALED_COLUMNS[table]?.[column];
}

export class EncryptionUnavailableError extends Error {
  /** @param {string} reason variable names only */
  constructor(reason) {
    super(`encryption unavailable: ${reason}`);
    this.name = "EncryptionUnavailableError";
    this.reason = reason;
  }
}

export class DecryptError extends Error {
  /** @param {string} context @param {string} why */
  constructor(context, why) {
    super(`cannot decrypt ${context}: ${why}`);
    this.name = "DecryptError";
  }
}

/** @typedef {{ kid: string, encKey: Buffer, macKey: Buffer }} Key */
/** @typedef {{ current: Key, all: Map<string, Key> }} Keyring */

/** @param {string} kid @param {Buffer} master @returns {Key} */
function deriveKey(kid, master) {
  const salt = Buffer.from(`orpheus:${kid}`);
  return {
    kid,
    encKey: Buffer.from(hkdfSync("sha256", master, salt, "orpheus-enc-v1", 32)),
    macKey: Buffer.from(hkdfSync("sha256", master, salt, "orpheus-siv-v1", 32)),
  };
}

/**
 * Parse one `<kid>:<base64>` entry. Throws EncryptionUnavailableError naming the variable (never the value).
 * @param {string} entry @param {string} name
 */
function parseEntry(entry, name) {
  const i = entry.indexOf(":");
  const kid = i > 0 ? entry.slice(0, i).trim() : "";
  const b64 = i > 0 ? entry.slice(i + 1).trim() : "";
  const master = /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? Buffer.from(b64, "base64") : Buffer.alloc(0);
  if (!KID_RE.test(kid) || master.length !== 32) throw new EncryptionUnavailableError(`${name} malformed`);
  return deriveKey(kid, master);
}

/**
 * The keyring from env, or a reason it is unavailable.
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, keyring: Keyring } | { ok: false, reason: string }}
 */
export function keyringFromEnv(env) {
  const raw = env[KEY_ENV]?.trim();
  if (!raw) return { ok: false, reason: `${KEY_ENV} not set` };
  try {
    const current = parseEntry(raw, KEY_ENV);
    /** @type {Map<string, Key>} */
    const all = new Map([[current.kid, current]]);
    for (const entry of (env[OLD_KEYS_ENV] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const k = parseEntry(entry, OLD_KEYS_ENV);
      if (!all.has(k.kid)) all.set(k.kid, k);
    }
    return { ok: true, keyring: { current, all } };
  } catch (e) {
    return { ok: false, reason: e instanceof EncryptionUnavailableError ? e.reason : `${KEY_ENV} malformed` };
  }
}

/** A random keyring (local PGLite runs and tests only). @param {string} [kid] */
export function randomKeyring(kid = "local") {
  const current = deriveKey(kid, randomBytes(32));
  return { current, all: new Map([[kid, current]]) };
}

/** @param {unknown} v */
export function isSealed(v) {
  return typeof v === "string" && v.startsWith(PREFIX);
}

/** The kid of a sealed value, else null. @param {unknown} v */
export function kidOf(v) {
  if (!isSealed(v)) return null;
  const rest = /** @type {string} */ (v).slice(PREFIX.length);
  return rest.slice(0, rest.indexOf(":")) || null;
}

/** @param {string} table @param {string} column @param {string} plain */
function normalize(table, column, plain) {
  return columnSpec(table, column)?.lower ? plain.toLowerCase() : plain;
}

/**
 * @param {Key} key @param {string} context @param {string} plain @param {boolean} det
 */
function sealWith(key, context, plain, det) {
  const iv = det
    ? createHmac("sha256", key.macKey).update(context).update("\0").update(plain).digest().subarray(0, 12)
    : randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.encKey, iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${key.kid}:${Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64url")}`;
}

/**
 * Seal a value for `table.column` with the current key. null / undefined pass through; a value already sealed
 * under the current key is kept (idempotent); anything else is sealed. Non-sensitive columns are returned as is.
 * @param {Keyring} ring @param {string} table @param {string} column @param {unknown} value
 */
export function sealValue(ring, table, column, value) {
  const spec = columnSpec(table, column);
  if (!spec || value === null || value === undefined) return value;
  if (isSealed(value)) {
    if (kidOf(value) === ring.current.kid) return value;
    value = openValue(ring, table, column, value);
  }
  if (typeof value !== "string") throw new TypeError(`${table}.${column}: only strings are sealed`);
  return sealWith(ring.current, `${table}.${column}`, normalize(table, column, value), Boolean(spec.det));
}

/**
 * Open a sealed value. Legacy plaintext (no prefix) and null pass through unchanged (design D5). Throws
 * DecryptError for an unknown kid, a value from another column or a tampered value (fail closed).
 * @param {Keyring} ring @param {string} table @param {string} column @param {unknown} value
 * @returns {any}
 */
export function openValue(ring, table, column, value) {
  if (!isSealed(value)) return value;
  const context = `${table}.${column}`;
  const kid = /** @type {string} */ (kidOf(value));
  const key = ring.all.get(kid);
  if (!key) throw new DecryptError(context, `key ${kid} not configured`);
  const blob = Buffer.from(/** @type {string} */ (value).slice(PREFIX.length + kid.length + 1), "base64url");
  if (blob.length < 28) throw new DecryptError(context, "truncated");
  try {
    const d = createDecipheriv("aes-256-gcm", key.encKey, blob.subarray(0, 12));
    d.setAAD(Buffer.from(context));
    d.setAuthTag(blob.subarray(blob.length - 16));
    return Buffer.concat([d.update(blob.subarray(12, blob.length - 16)), d.final()]).toString("utf8");
  } catch {
    throw new DecryptError(context, "authentication failed");
  }
}

/**
 * Every stored form a deterministic column may hold for `plain`: one per configured key, plus the legacy
 * plaintext. Use with `col = ANY($n)` (raw SQL) or `col in (...)` (the Kysely plugin).
 * @param {Keyring} ring @param {string} table @param {string} column @param {string} plain
 */
export function lookupCandidates(ring, table, column, plain) {
  const spec = columnSpec(table, column);
  if (!spec?.det) throw new Error(`${table}.${column} is not a lookup column`);
  const norm = normalize(table, column, plain);
  const out = [...ring.all.values()].map((k) => sealWith(k, `${table}.${column}`, norm, true));
  out.push(norm);
  if (norm !== plain) out.push(plain);
  return out;
}
