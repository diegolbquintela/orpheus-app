// @ts-check
/**
 * Which env var holds the database URL (server and build only; never log values).
 *
 * The Vercel Neon integration on this project injects prefixed names
 * (`orpheus_app_preview_DATABASE_URL`, `..._UNPOOLED`, …) for Preview and Development.
 * The plain `DATABASE_URL` / `DATABASE_URL_UNPOOLED` win when set (local runs, a future
 * unprefixed integration). Blank values count as unset.
 *
 * - App queries use the pooled URL: `DATABASE_URL`, else `orpheus_app_preview_DATABASE_URL`.
 * - Migrations use a direct (unpooled) connection from the same pair when there is one:
 *   `DATABASE_URL_UNPOOLED` (else `DATABASE_URL`), else
 *   `orpheus_app_preview_DATABASE_URL_UNPOOLED` (else `orpheus_app_preview_DATABASE_URL`).
 */

export const DB_ENV_PREFIX = "orpheus_app_preview_";

/** Pooled/unpooled pairs, highest precedence first. */
export const DB_ENV_PAIRS = /** @type {const} */ ([
  { pooled: "DATABASE_URL", unpooled: "DATABASE_URL_UNPOOLED" },
  { pooled: `${DB_ENV_PREFIX}DATABASE_URL`, unpooled: `${DB_ENV_PREFIX}DATABASE_URL_UNPOOLED` },
]);

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
function read(env, name) {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Pooled URL for app queries, plus the env var name it came from (for logs).
 * @param {Record<string, string | undefined>} env
 * @returns {{ url: string, name: string } | null}
 */
export function resolveDatabaseUrl(env) {
  for (const { pooled } of DB_ENV_PAIRS) {
    const url = read(env, pooled);
    if (url) return { url, name: pooled };
  }
  return null;
}

/**
 * URL for migrations: the direct connection of the first configured pair, else its pooled URL.
 * @param {Record<string, string | undefined>} env
 * @returns {{ url: string, name: string } | null}
 */
export function resolveMigrationUrl(env) {
  for (const { pooled, unpooled } of DB_ENV_PAIRS) {
    const direct = read(env, unpooled);
    if (direct) return { url: direct, name: unpooled };
    const url = read(env, pooled);
    if (url) return { url, name: pooled };
  }
  return null;
}

/**
 * Remove connection strings from a message before logging it.
 * @param {string} text
 */
export function redactUrls(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]");
}
