/**
 * Typed data access for the dashboard tables in `migrations/0002_dashboard.sql`
 * (attachments/dashboard-spec.md §5). Server-only.
 *
 * - Every per-user function takes `userId` as its first argument. Callers must pass
 *   the id from the verified session (`getSessionUserFromHeaders`), never one sent by the client.
 *   Every per-user query filters on it, so a user can only read or change their own rows.
 * - Per-user data only. Shared market data (instruments, closes, FX, fundamentals, metrics, refresh runs)
 *   is written by the daily job with its own SQL (`daily-refresh.server.ts`, `fx.server.ts`, `fundamentals.server.ts`)
 *   and read by the page modules; #187 removed the superseded typed helpers that used to live here.
 * - `NUMERIC` values come back as strings (exact decimals); `DATE` values as `YYYY-MM-DD`.
 * - Functions take any `Queryable` (the app's `getSql()` client or a PGLite adapter in tests).
 */

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export type BaseCurrency = "CAD" | "USD" | "EUR";
export type MetricStatus = "ok" | "n/m" | "insufficient_history" | "insufficient_data" | "not_covered";
/** Decimal as a string, e.g. "12.5" (NUMERIC keeps exact precision). */
export type Decimal = string;

export const BASE_CURRENCIES: readonly BaseCurrency[] = ["CAD", "USD", "EUR"];
export const DEFAULT_BASE_CURRENCY: BaseCurrency = "CAD";

/** Every table `0002_dashboard.sql` and `0004_daily_close.sql` create (used by the DB status check). */
export const DASHBOARD_TABLES = [
  "user_settings",
  "holdings",
  "user_metric_columns",
  "instruments",
  "daily_closes",
  "fx_rates",
  "fundamentals_annual",
  "metric_values",
  "refresh_runs",
  "corporate_actions",
  "price_coverage",
  // #90: who may see what (migrations/0011_access.sql).
  "access_grant",
  "account_state",
  // #91: the audit log of actions (migrations/0012_audit.sql).
  "audit_event",
] as const;

// ------------------------------------------------------------------ per-user: settings

export interface UserSettings {
  userId: string;
  baseCurrency: BaseCurrency;
}

/** The user's settings; defaults (CAD) when they have never saved any. */
export async function getUserSettings(db: Queryable, userId: string): Promise<UserSettings> {
  const rows = await db.query<{ base_currency: BaseCurrency }>(
    "SELECT base_currency FROM user_settings WHERE user_id = $1",
    [userId],
  );
  return { userId, baseCurrency: rows[0]?.base_currency ?? DEFAULT_BASE_CURRENCY };
}

export async function setBaseCurrency(
  db: Queryable,
  userId: string,
  baseCurrency: BaseCurrency,
): Promise<UserSettings> {
  if (!BASE_CURRENCIES.includes(baseCurrency)) throw new Error(`Unsupported base currency: ${baseCurrency}`);
  await db.query(
    `INSERT INTO user_settings (user_id, base_currency) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET base_currency = EXCLUDED.base_currency, updated_at = now()`,
    [userId, baseCurrency],
  );
  return { userId, baseCurrency };
}

// ------------------------------------------------------------------ per-user: holdings

export interface Holding {
  id: number;
  symbol: string;
  shares: Decimal;
  /** Per share in the listing currency; null = no cost entered (#56, migration 0008). */
  avgCost: Decimal | null;
  createdAt: string;
  updatedAt: string;
}

type HoldingRow = {
  id: number | string;
  symbol: string;
  shares: string;
  avg_cost: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const HOLDING_COLUMNS = "id, symbol, shares, avg_cost, created_at, updated_at";
const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));
const toHolding = (r: HoldingRow): Holding => ({
  id: Number(r.id),
  symbol: r.symbol,
  shares: String(r.shares),
  avgCost: r.avg_cost === null || r.avg_cost === undefined ? null : String(r.avg_cost),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function listHoldings(db: Queryable, userId: string): Promise<Holding[]> {
  const rows = await db.query<HoldingRow>(
    `SELECT ${HOLDING_COLUMNS} FROM holdings WHERE user_id = $1 ORDER BY symbol`,
    [userId],
  );
  return rows.map(toHolding);
}

/** One of the user's holdings by id; null when it doesn't exist or isn't theirs. */
export async function getHolding(db: Queryable, userId: string, id: number): Promise<Holding | null> {
  const rows = await db.query<HoldingRow>(
    `SELECT ${HOLDING_COLUMNS} FROM holdings WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ? toHolding(rows[0]) : null;
}

/** Thrown when the user already holds this symbol (unique per user). */
export class DuplicateHoldingError extends Error {
  constructor(symbol: string) {
    super(`${symbol} is already in your holdings.`);
    this.name = "DuplicateHoldingError";
  }
}

/**
 * Insert a holding. Shares must be > 0 and average cost >= 0 or null (no cost, #56); also enforced by the
 * schema.
 */
export async function addHolding(
  db: Queryable,
  userId: string,
  input: { symbol: string; shares: Decimal | number; avgCost: Decimal | number | null },
): Promise<Holding> {
  assertQuantities(input.shares, input.avgCost);
  const rows = await db.query<HoldingRow>(
    `INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, symbol) DO NOTHING
     RETURNING ${HOLDING_COLUMNS}`,
    [userId, input.symbol, String(input.shares), costParam(input.avgCost)],
  );
  if (!rows[0]) throw new DuplicateHoldingError(input.symbol);
  return toHolding(rows[0]);
}

/**
 * Update shares and average cost of one of the user's holdings; null when it is not theirs. `avgCost`
 * undefined (omitted) keeps the stored cost; null clears it (EL, #57); a value sets it.
 */
export async function updateHolding(
  db: Queryable,
  userId: string,
  id: number,
  input: { shares: Decimal | number; avgCost?: Decimal | number | null },
): Promise<Holding | null> {
  const keep = input.avgCost === undefined;
  assertQuantities(input.shares, keep ? null : (input.avgCost as Decimal | number | null));
  const rows = await db.query<HoldingRow>(
    `UPDATE holdings SET shares = $3, avg_cost = CASE WHEN $5::boolean THEN avg_cost ELSE $4::numeric END, updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${HOLDING_COLUMNS}`,
    [id, userId, String(input.shares), keep ? null : costParam(input.avgCost as Decimal | number | null), keep],
  );
  return rows[0] ? toHolding(rows[0]) : null;
}

/** Delete one of the user's holdings; false when it is not theirs. */
export async function deleteHolding(db: Queryable, userId: string, id: number): Promise<boolean> {
  const rows = await db.query("DELETE FROM holdings WHERE id = $1 AND user_id = $2 RETURNING id", [
    id,
    userId,
  ]);
  return rows.length > 0;
}

const costParam = (avgCost: Decimal | number | null) => (avgCost === null ? null : String(avgCost));

function assertQuantities(shares: Decimal | number, avgCost: Decimal | number | null) {
  const s = Number(shares);
  if (!Number.isFinite(s) || s <= 0) throw new RangeError("Shares must be greater than 0.");
  if (avgCost === null) return;
  const c = Number(avgCost);
  if (!Number.isFinite(c) || c < 0) throw new RangeError("Average cost must be 0 or more.");
}

// ------------------------------------------------------------------ per-user: metric columns

/** The user's chosen metric columns, in display order. */
export async function listMetricColumns(db: Queryable, userId: string): Promise<string[]> {
  const rows = await db.query<{ metric_key: string }>(
    "SELECT metric_key FROM user_metric_columns WHERE user_id = $1 ORDER BY position, metric_key",
    [userId],
  );
  return rows.map((r) => r.metric_key);
}

/** Replace the user's metric columns with `keys`, in that order (one statement, atomic). */
export async function setMetricColumns(db: Queryable, userId: string, keys: string[]): Promise<string[]> {
  const unique = [...new Set(keys)];
  await db.query(
    `WITH dropped AS (
       DELETE FROM user_metric_columns WHERE user_id = $1 AND NOT (metric_key = ANY($2::text[]))
     )
     INSERT INTO user_metric_columns (user_id, metric_key, position)
     SELECT $1, k.key, k.pos::int - 1 FROM unnest($2::text[]) WITH ORDINALITY AS k(key, pos)
     ON CONFLICT (user_id, metric_key) DO UPDATE SET position = EXCLUDED.position`,
    [userId, unique],
  );
  return unique;
}

/**
 * Metric chips (#57): the saved list (`user_metric_columns`), or `defaults` when the user never saved one.
 * "Never saved" = no rows and `user_settings.metric_chips_saved_at` NULL (migration 0009); an account with
 * rows from before #57 keeps them, and a saved empty list stays empty.
 */
export async function getMetricChips(db: Queryable, userId: string, defaults: readonly string[]): Promise<{ chips: string[]; saved: boolean }> {
  const rows = await listMetricColumns(db, userId);
  if (rows.length) return { chips: rows, saved: true };
  const s = await db.query<{ saved: boolean }>(
    "SELECT metric_chips_saved_at IS NOT NULL AS saved FROM user_settings WHERE user_id = $1",
    [userId],
  );
  return s[0]?.saved ? { chips: [], saved: true } : { chips: [...defaults], saved: false };
}

/** Save the user's chips in order and mark them as saved, so an empty list sticks (#57). */
export async function setMetricChips(db: Queryable, userId: string, keys: string[]): Promise<string[]> {
  const saved = await setMetricColumns(db, userId, keys);
  await db.query(
    `INSERT INTO user_settings (user_id, metric_chips_saved_at) VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET metric_chips_saved_at = now()`,
    [userId],
  );
  return saved;
}
