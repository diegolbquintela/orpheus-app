/**
 * Typed data access for the dashboard tables in `migrations/0002_dashboard.sql`
 * (attachments/dashboard-spec.md §5). Server-only.
 *
 * - Every per-user function takes `userId` as its first argument. Callers must pass
 *   the id from the verified session (`requireUserId()`), never one sent by the client.
 *   Every per-user query filters on it, so a user can only read or change their own rows.
 * - Shared market-data writers (instruments, closes, FX, fundamentals, metrics, runs) are
 *   for the daily job only. Pages only read.
 * - `NUMERIC` values come back as strings (exact decimals); `DATE` values as `YYYY-MM-DD`.
 * - Functions take any `Queryable` (the app's `getSql()` client or a PGLite adapter in tests).
 */

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export type BaseCurrency = "CAD" | "USD" | "EUR";
export type Region = "US" | "EU" | "CA";
export type FxSource = "BOC" | "ECB_CROSS";
export type MetricStatus = "ok" | "n/m" | "insufficient_history" | "insufficient_data" | "not_covered";
/** Decimal as a string, e.g. "12.5" (NUMERIC keeps exact precision). */
export type Decimal = string;
/** Calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

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
  avgCost: Decimal;
  createdAt: string;
  updatedAt: string;
}

type HoldingRow = {
  id: number | string;
  symbol: string;
  shares: string;
  avg_cost: string;
  created_at: Date | string;
  updated_at: Date | string;
};

const HOLDING_COLUMNS = "id, symbol, shares, avg_cost, created_at, updated_at";
const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));
const toHolding = (r: HoldingRow): Holding => ({
  id: Number(r.id),
  symbol: r.symbol,
  shares: String(r.shares),
  avgCost: String(r.avg_cost),
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

/** Insert a holding. Shares must be > 0 and average cost >= 0 (also enforced by the schema). */
export async function addHolding(
  db: Queryable,
  userId: string,
  input: { symbol: string; shares: Decimal | number; avgCost: Decimal | number },
): Promise<Holding> {
  assertQuantities(input.shares, input.avgCost);
  const rows = await db.query<HoldingRow>(
    `INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, symbol) DO NOTHING
     RETURNING ${HOLDING_COLUMNS}`,
    [userId, input.symbol, String(input.shares), String(input.avgCost)],
  );
  if (!rows[0]) throw new DuplicateHoldingError(input.symbol);
  return toHolding(rows[0]);
}

/** Update shares and average cost of one of the user's holdings; null when it is not theirs. */
export async function updateHolding(
  db: Queryable,
  userId: string,
  id: number,
  input: { shares: Decimal | number; avgCost: Decimal | number },
): Promise<Holding | null> {
  assertQuantities(input.shares, input.avgCost);
  const rows = await db.query<HoldingRow>(
    `UPDATE holdings SET shares = $3, avg_cost = $4, updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING ${HOLDING_COLUMNS}`,
    [id, userId, String(input.shares), String(input.avgCost)],
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

function assertQuantities(shares: Decimal | number, avgCost: Decimal | number) {
  const s = Number(shares);
  const c = Number(avgCost);
  if (!Number.isFinite(s) || s <= 0) throw new RangeError("Shares must be greater than 0.");
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

// ------------------------------------------------------------------ shared: instruments

export interface Instrument {
  symbol: string;
  name: string | null;
  exchange: string | null;
  region: Region;
  currency: string;
  secCik: string | null;
  fundamentalsSource: "sec" | "none";
}

export async function upsertInstrument(db: Queryable, i: Instrument): Promise<void> {
  await db.query(
    `INSERT INTO instruments (symbol, name, exchange, region, currency, sec_cik, fundamentals_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, exchange = EXCLUDED.exchange,
       region = EXCLUDED.region, currency = EXCLUDED.currency, sec_cik = EXCLUDED.sec_cik,
       fundamentals_source = EXCLUDED.fundamentals_source, updated_at = now()`,
    [i.symbol, i.name, i.exchange, i.region, i.currency, i.secCik, i.fundamentalsSource],
  );
}

export async function getInstruments(db: Queryable, symbols: string[]): Promise<Instrument[]> {
  const rows = await db.query<{
    symbol: string;
    name: string | null;
    exchange: string | null;
    region: Region;
    currency: string;
    sec_cik: string | null;
    fundamentals_source: "sec" | "none";
  }>(
    `SELECT symbol, name, exchange, region, currency, sec_cik, fundamentals_source
     FROM instruments WHERE symbol = ANY($1::text[]) ORDER BY symbol`,
    [symbols],
  );
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchange,
    region: r.region,
    currency: r.currency,
    secCik: r.sec_cik,
    fundamentalsSource: r.fundamentals_source,
  }));
}

// ------------------------------------------------------------------ shared: daily closes

export interface DailyCloseRow {
  symbol: string;
  sessionDate: IsoDate;
  close: Decimal;
  currency: string;
  source: string;
}

/**
 * Store closes; an existing (symbol, session_date) row is left unchanged, so running the
 * daily job twice changes nothing (DASH-09). Returns how many rows were inserted.
 */
export async function insertDailyCloses(db: Queryable, closes: DailyCloseRow[]): Promise<number> {
  let inserted = 0;
  for (const c of closes) {
    const rows = await db.query(
      `INSERT INTO daily_closes (symbol, session_date, close, currency, source)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (symbol, session_date) DO NOTHING RETURNING symbol`,
      [c.symbol, c.sessionDate, String(c.close), c.currency, c.source],
    );
    inserted += rows.length;
  }
  return inserted;
}

/** The latest stored close per symbol (pages read only this; never a provider). */
export async function latestCloses(db: Queryable, symbols: string[]): Promise<DailyCloseRow[]> {
  const rows = await db.query<{
    symbol: string;
    session_date: string;
    close: string;
    currency: string;
    source: string;
  }>(
    `SELECT DISTINCT ON (symbol) symbol, session_date::text AS session_date, close, currency, source
     FROM daily_closes WHERE symbol = ANY($1::text[]) ORDER BY symbol, session_date DESC`,
    [symbols],
  );
  return rows.map((r) => ({
    symbol: r.symbol,
    sessionDate: r.session_date,
    close: String(r.close),
    currency: r.currency,
    source: r.source,
  }));
}

// ------------------------------------------------------------------ shared: FX

export interface FxRate {
  quote: string;
  rateDate: IsoDate;
  cadPerUnit: Decimal;
  source: FxSource;
}

export async function upsertFxRates(db: Queryable, rates: FxRate[]): Promise<void> {
  for (const r of rates)
    await db.query(
      `INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source) VALUES ($1, $2, $3, $4)
       ON CONFLICT (quote, rate_date) DO UPDATE SET cad_per_unit = EXCLUDED.cad_per_unit,
         source = EXCLUDED.source, fetched_at = now()`,
      [r.quote, r.rateDate, String(r.cadPerUnit), r.source],
    );
}

/** The rate for `quote` on `date`, or the latest one before it (BoC holidays); null if none. */
export async function fxRateOnOrBefore(db: Queryable, quote: string, date: IsoDate): Promise<FxRate | null> {
  const rows = await db.query<{ quote: string; rate_date: string; cad_per_unit: string; source: FxSource }>(
    `SELECT quote, rate_date::text AS rate_date, cad_per_unit, source FROM fx_rates
     WHERE quote = $1 AND rate_date <= $2 ORDER BY rate_date DESC LIMIT 1`,
    [quote, date],
  );
  const r = rows[0];
  return r ? { quote: r.quote, rateDate: r.rate_date, cadPerUnit: String(r.cad_per_unit), source: r.source } : null;
}

// ------------------------------------------------------------------ shared: fundamentals + metrics

export interface FundamentalFact {
  symbol: string;
  fiscalYearEnd: IsoDate;
  concept: string;
  value: Decimal;
  unit: string;
  sourceTag: string;
  accession: string | null;
  filed: IsoDate | null;
}

export async function upsertFundamentals(db: Queryable, facts: FundamentalFact[]): Promise<void> {
  for (const f of facts)
    await db.query(
      `INSERT INTO fundamentals_annual (symbol, fiscal_year_end, concept, value, unit, source_tag, accession, filed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (symbol, fiscal_year_end, concept) DO UPDATE SET value = EXCLUDED.value,
         unit = EXCLUDED.unit, source_tag = EXCLUDED.source_tag, accession = EXCLUDED.accession,
         filed = EXCLUDED.filed`,
      [f.symbol, f.fiscalYearEnd, f.concept, String(f.value), f.unit, f.sourceTag, f.accession, f.filed],
    );
}

export async function listFundamentals(db: Queryable, symbol: string): Promise<FundamentalFact[]> {
  const rows = await db.query<{
    symbol: string;
    fiscal_year_end: string;
    concept: string;
    value: string;
    unit: string;
    source_tag: string;
    accession: string | null;
    filed: string | null;
  }>(
    `SELECT symbol, fiscal_year_end::text AS fiscal_year_end, concept, value, unit, source_tag, accession,
       filed::text AS filed
     FROM fundamentals_annual WHERE symbol = $1 ORDER BY fiscal_year_end, concept`,
    [symbol],
  );
  return rows.map((r) => ({
    symbol: r.symbol,
    fiscalYearEnd: r.fiscal_year_end,
    concept: r.concept,
    value: String(r.value),
    unit: r.unit,
    sourceTag: r.source_tag,
    accession: r.accession,
    filed: r.filed,
  }));
}

export interface MetricValue {
  symbol: string;
  metricKey: string;
  value: Decimal | null;
  status: MetricStatus;
  fiscalYearEnd: IsoDate | null;
}

export async function upsertMetricValues(db: Queryable, values: MetricValue[]): Promise<void> {
  for (const m of values) {
    if (m.status === "ok" && m.value === null) throw new Error(`${m.symbol} ${m.metricKey}: status ok needs a value`);
    await db.query(
      `INSERT INTO metric_values (symbol, metric_key, value, status, fiscal_year_end) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (symbol, metric_key) DO UPDATE SET value = EXCLUDED.value, status = EXCLUDED.status,
         fiscal_year_end = EXCLUDED.fiscal_year_end, computed_at = now()`,
      [m.symbol, m.metricKey, m.value === null ? null : String(m.value), m.status, m.fiscalYearEnd],
    );
  }
}

export async function listMetricValues(db: Queryable, symbols: string[]): Promise<MetricValue[]> {
  const rows = await db.query<{
    symbol: string;
    metric_key: string;
    value: string | null;
    status: MetricStatus;
    fiscal_year_end: string | null;
  }>(
    `SELECT symbol, metric_key, value, status, fiscal_year_end::text AS fiscal_year_end
     FROM metric_values WHERE symbol = ANY($1::text[]) ORDER BY symbol, metric_key`,
    [symbols],
  );
  return rows.map((r) => ({
    symbol: r.symbol,
    metricKey: r.metric_key,
    value: r.value === null ? null : String(r.value),
    status: r.status,
    fiscalYearEnd: r.fiscal_year_end,
  }));
}

// ------------------------------------------------------------------ shared: refresh runs (job lock)

/**
 * Claim the run for `runDate`. Returns the run id, or null when a run for that date
 * already exists (the unique `run_date` is the lock, so two concurrent jobs can't both run).
 */
export async function claimRefreshRun(db: Queryable, runDate: IsoDate): Promise<number | null> {
  const rows = await db.query<{ id: number | string }>(
    `INSERT INTO refresh_runs (run_date) VALUES ($1) ON CONFLICT (run_date) DO NOTHING RETURNING id`,
    [runDate],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function finishRefreshRun(
  db: Queryable,
  id: number,
  status: "ok" | "partial" | "failed",
  detail: unknown,
): Promise<void> {
  await db.query(
    "UPDATE refresh_runs SET finished_at = now(), status = $2, detail = $3::jsonb WHERE id = $1",
    [id, status, JSON.stringify(detail ?? null)],
  );
}

export interface RefreshRun {
  id: number;
  runDate: IsoDate;
  status: string;
  startedAt: string;
  finishedAt: string | null;
}

/** The most recent run with status `ok` (drives the "Prices as of" header and stale note). */
export async function lastSuccessfulRun(db: Queryable): Promise<RefreshRun | null> {
  const rows = await db.query<{
    id: number | string;
    run_date: string;
    status: string;
    started_at: Date | string;
    finished_at: Date | string | null;
  }>(
    `SELECT id, run_date::text AS run_date, status, started_at, finished_at FROM refresh_runs
     WHERE status = 'ok' ORDER BY run_date DESC LIMIT 1`,
  );
  const r = rows[0];
  return r
    ? {
        id: Number(r.id),
        runDate: r.run_date,
        status: r.status,
        startedAt: iso(r.started_at),
        finishedAt: r.finished_at === null ? null : iso(r.finished_at),
      }
    : null;
}
