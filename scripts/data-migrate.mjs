// @ts-check
/**
 * #93 migration of existing rows (attachments/encryption-at-rest-design.md section 6). Server-only; shared by the
 * owner endpoint (`/api/account/encryption`) and the CLI (`scripts/data-encryption.mjs`).
 *
 * - `status`: per sealed column, how many values are under the current key, an old key, or still plaintext.
 * - `encrypt`: every non-null value not under the current key (legacy plaintext or an old key) is sealed with it.
 * - `reencrypt`: only values under an old key (rotation, section 5).
 * - `decrypt`: the reversible path: every sealed value is written back as plaintext (CLI only).
 *
 * Safe: each new value is opened again and compared with the plaintext before it is written, and the UPDATE only
 * applies if the row still holds the value that was read (a row changed meanwhile is skipped, the next run takes
 * it). Idempotent: a second run changes 0 rows. Never logs a value; results are counts only.
 */
import { kidOf, isSealed, openValue, PREFIX, SEALED_COLUMNS, sealValue } from "./data-crypto.mjs";

/** @typedef {import("./data-crypto.mjs").Keyring} Keyring */
/** @typedef {{ query: (text: string, params?: unknown[]) => Promise<any[]> }} Db */

/** Primary key per table. */
const PK = /** @type {Record<string, string>} */ ({
  user: "id",
  session: "id",
  account: "id",
  verification: "id",
  personal_finance: "user_id",
});

/** The SQL text form of a column (`personal_finance.data` is JSONB: the scalar's text, or the object's JSON). */
function expr(/** @type {string} */ table, /** @type {string} */ column) {
  return table === "personal_finance" ? `("${column}" #>> '{}')` : `"${column}"`;
}

/** Every sealed column as [table, column]. */
export function sealedColumns() {
  return Object.entries(SEALED_COLUMNS).flatMap(([t, cols]) => Object.keys(cols).map((c) => /** @type {[string, string]} */ ([t, c])));
}

/**
 * @param {Db} db @param {Keyring} ring
 * @returns {Promise<{ kid: string, oldKids: string[], columns: { table: string, column: string, current: number, old: number, unknown: number, plaintext: number }[], plaintext: number }>}
 */
export async function encryptionStatus(db, ring) {
  const kids = [...ring.all.keys()];
  const columns = [];
  for (const [table, column] of sealedColumns()) {
    const e = expr(table, column);
    const rows = await db.query(
      `SELECT
         count(*) FILTER (WHERE ${e} LIKE $1)::int AS current,
         count(*) FILTER (WHERE ${e} LIKE '${PREFIX}%' AND ${e} NOT LIKE $1 AND split_part(${e}, ':', 3) = ANY($2))::int AS old,
         count(*) FILTER (WHERE ${e} LIKE '${PREFIX}%' AND NOT (split_part(${e}, ':', 3) = ANY($2)))::int AS unknown,
         count(*) FILTER (WHERE ${e} IS NOT NULL AND ${e} NOT LIKE '${PREFIX}%')::int AS plaintext
       FROM "${table}"`,
      [`${PREFIX}${ring.current.kid}:%`, kids],
    );
    const r = rows[0] ?? {};
    columns.push({ table, column, current: Number(r.current ?? 0), old: Number(r.old ?? 0), unknown: Number(r.unknown ?? 0), plaintext: Number(r.plaintext ?? 0) });
  }
  return {
    kid: ring.current.kid,
    oldKids: kids.filter((k) => k !== ring.current.kid),
    columns,
    plaintext: columns.reduce((n, c) => n + c.plaintext, 0),
  };
}

/**
 * @param {Db} db @param {Keyring} ring @param {"encrypt" | "reencrypt" | "decrypt"} mode
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<{ mode: string, dryRun: boolean, changed: number, skipped: number, columns: { table: string, column: string, changed: number, skipped: number }[] }>}
 */
export async function migrateColumns(db, ring, mode, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const columns = [];
  for (const [table, column] of sealedColumns()) {
    const e = expr(table, column);
    const pk = PK[table];
    const rows = await db.query(`SELECT "${pk}" AS pk, ${e} AS v FROM "${table}" WHERE ${e} IS NOT NULL`);
    let changed = 0;
    let skipped = 0;
    for (const { pk: id, v } of rows) {
      const sealed = isSealed(v);
      const todo =
        mode === "decrypt" ? sealed : mode === "reencrypt" ? sealed && kidOf(v) !== ring.current.kid : kidOf(v) !== ring.current.kid;
      if (!todo) continue;
      const plain = /** @type {string} */ (openValue(ring, table, column, v));
      const next = mode === "decrypt" ? plain : /** @type {string} */ (sealValue(ring, table, column, plain));
      // Round-trip check before any write (no data loss).
      const back = openValue(ring, table, column, next);
      const want = SEALED_COLUMNS[table][column].lower ? plain.toLowerCase() : plain;
      if (back !== want) throw new Error(`round-trip check failed for ${table}.${column} (row skipped, nothing written)`);
      if (dryRun) {
        changed += 1;
        continue;
      }
      const set =
        table === "personal_finance"
          ? mode === "decrypt"
            ? `"${column}" = $1::jsonb`
            : `"${column}" = to_jsonb($1::text)`
          : `"${column}" = $1`;
      const done = await db.query(
        `UPDATE "${table}" SET ${set} WHERE "${pk}" = $2 AND ${e} = $3 RETURNING 1 AS ok`,
        [next, id, v],
      );
      if (done.length) changed += 1;
      else skipped += 1;
    }
    columns.push({ table, column, changed, skipped });
  }
  return {
    mode,
    dryRun,
    changed: columns.reduce((n, c) => n + c.changed, 0),
    skipped: columns.reduce((n, c) => n + c.skipped, 0),
    columns,
  };
}
