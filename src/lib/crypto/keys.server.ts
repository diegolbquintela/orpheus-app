/**
 * #93: the app's encryption keyring (design section 4). Server-only. Keys only from env
 * (`ORPHEUS_ENCRYPTION_KEY`, optional `ORPHEUS_ENCRYPTION_KEYS_OLD`). A local run with no database URL and not on
 * Vercel (embedded, in-memory PGLite) gets a random per-process key, like `BETTER_AUTH_SECRET`; anywhere else a
 * missing or malformed key throws `EncryptionUnavailableError` (fail closed, no plaintext fallback).
 */
import { resolveDatabaseUrl } from "../../../scripts/db-env.mjs";
import {
  EncryptionUnavailableError,
  KEY_ENV,
  keyringFromEnv,
  OLD_KEYS_ENV,
  randomKeyring,
  type Keyring,
} from "../../../scripts/data-crypto.mjs";

export { EncryptionUnavailableError, type Keyring };

type Env = Record<string, string | undefined>;

const g = globalThis as typeof globalThis & {
  __orpheusLocalKeyring__?: Keyring;
  __orpheusKeyringCache__?: { sig: string; ring: Keyring };
};

/** Whether this process may fall back to a random key: no database URL and not on Vercel. */
export function localOnly(env: Env): boolean {
  return !resolveDatabaseUrl(env) && !env.VERCEL?.trim();
}

/** The keyring for `env` (default: process.env). Throws EncryptionUnavailableError (reason names variables only). */
export function appKeyring(env: Env = process.env): Keyring {
  const sig = `${env[KEY_ENV] ?? ""}\n${env[OLD_KEYS_ENV] ?? ""}`;
  const cached = g.__orpheusKeyringCache__;
  if (cached && cached.sig === sig) return cached.ring;
  const r = keyringFromEnv(env);
  if (r.ok) {
    g.__orpheusKeyringCache__ = { sig, ring: r.keyring };
    return r.keyring;
  }
  if (!env[KEY_ENV]?.trim() && localOnly(env)) return (g.__orpheusLocalKeyring__ ??= randomKeyring());
  throw new EncryptionUnavailableError(r.reason);
}

/** Readiness for status lines: the current kid, or why encryption is unavailable. Never a key. */
export function encryptionReadiness(env: Env = process.env): { ready: true; kid: string; oldKids: string[] } | { ready: false; reason: string } {
  try {
    const ring = appKeyring(env);
    return { ready: true, kid: ring.current.kid, oldKids: [...ring.all.keys()].filter((k) => k !== ring.current.kid) };
  } catch (e) {
    return { ready: false, reason: e instanceof EncryptionUnavailableError ? e.reason : `${KEY_ENV} malformed` };
  }
}
