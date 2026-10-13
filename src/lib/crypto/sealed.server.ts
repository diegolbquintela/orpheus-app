/**
 * #93: seal / open helpers for the app's raw SQL on sensitive columns (design section 3). Server-only.
 * Every call reads the keyring (src/lib/crypto/keys.server.ts): a missing key throws EncryptionUnavailableError.
 */
import { lookupCandidates, openValue, sealValue } from "../../../scripts/data-crypto.mjs";
import { appKeyring } from "./keys.server.ts";

export { EncryptionUnavailableError } from "./keys.server.ts";

/** The stored (encrypted) form of `value` for `table.column`; null stays null. */
export function seal<T>(table: string, column: string, value: T): T | string {
  return sealValue(appKeyring(), table, column, value) as T | string;
}

/** The plaintext of a stored value (legacy plaintext passes through; a bad value throws). */
export function open<T = string>(table: string, column: string, value: unknown): T {
  return openValue(appKeyring(), table, column, value) as T;
}

/** Every stored form of `plain` in a lookup column, for `column = ANY($n)`. */
export function candidates(table: string, column: string, plain: string): string[] {
  return lookupCandidates(appKeyring(), table, column, plain);
}
