/**
 * The daily close job (spec §6, §11, §14 A.3; ticket T05 #13). Server-only.
 *
 * - `runDailyRefresh()`: takes the lock (`refresh_runs.run_date`, one row per UTC day), then for every
 *   held symbol fills **all** missing completed sessions since its last stored close through
 *   `DailyCloseProvider.getCloses()`, refreshes corporate actions weekly, and records the run.
 *   Writes are `ON CONFLICT DO NOTHING`, so a stored close is never fetched or changed again and
 *   running the job twice changes nothing (DASH-09, DASH-14).
 * - `backfillSymbol()`: the new-holding job. Runs after the holding is saved (Vercel `waitUntil()`),
 *   never inside the browser request; until it finishes the holding shows "price pending".
 * - Callers: `GET /api/cron/daily-refresh` (Vercel Cron, `CRON_SECRET`) and the preview-only
 *   `POST /api/dashboard/refresh` button. Both run this same code.
 * - FX (T06 #14): after the closes, `refreshFx()` fills missing BoC / ECB-cross dates when the caller
 *   passes an `FxFetcher` (the cron route and the preview button do). Fundamentals and metric values
 *   belong to later tickets (T08+).
 */
import type { DailyClose, DailyCloseProvider } from "./close-provider.ts";
import { addDays, dateInZone } from "./close-provider.ts";
import { BACKFILL_FROM } from "./yahoo-closes.server.ts";
import { refreshFx, type FxFetcher, type FxSummary } from "./fx.server.ts";
import type { Queryable } from "./store.server.ts";

/** A run that has been "running" longer than this is treated as crashed and can be taken over. */
export const STALE_LOCK_MS = 10 * 60 * 1000;
/** Stop starting new symbols after this long (Hobby functions stop at 300 s); the next run continues. */
export const TIME_BUDGET_MS = 240 * 1000;
/** Corporate actions are re-checked weekly per held symbol (A.3 flow 3). */
export const ACTIONS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type RefreshTrigger = "cron" | "preview" | "backfill";

export type SymbolResult = {
  symbol: string;
  inserted: number;
  actions: number;
  latest: string | null;
  fetched: boolean;
  error?: string;
};

export type RefreshSummary =
  | { status: "locked"; runDate: string }
  | {
      status: "ok" | "partial" | "failed";
      runId: number;
      runDate: string;
      trigger: RefreshTrigger;
      symbols: number;
      inserted: number;
      actions: number;
      errors: { symbol: string; error: string }[];
      deferred: string[];
      latest: Record<string, string | null>;
      fx?: FxSummary;
    };

type Coverage = {
  first_session_date: string | null;
  last_session_date: string | null;
  actions_checked_at: Date | string | null;
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);
const toIsoDate = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

/** Make sure `symbol` has a price_coverage row (a row with no last_session_date = backfill pending). */
export async function ensureCoverage(db: Queryable, symbol: string): Promise<void> {
  await db.query("INSERT INTO price_coverage (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING", [symbol]);
}

async function readCoverage(db: Queryable, symbol: string): Promise<Coverage> {
  await ensureCoverage(db, symbol);
  const rows = await db.query<Coverage>(
    `SELECT first_session_date::text AS first_session_date, last_session_date::text AS last_session_date,
       actions_checked_at FROM price_coverage WHERE symbol = $1`,
    [symbol],
  );
  return rows[0];
}

async function insertCloses(db: Queryable, closes: DailyClose[]): Promise<number> {
  let inserted = 0;
  for (const c of closes) {
    const rows = await db.query(
      `INSERT INTO daily_closes (symbol, session_date, close, currency, source, adj_close_src)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (symbol, session_date) DO NOTHING RETURNING symbol`,
      [c.symbol, c.date, String(c.close), c.currency, c.source, c.adjCloseSrc === undefined ? null : String(c.adjCloseSrc)],
    );
    inserted += rows.length;
  }
  return inserted;
}

/**
 * Fetch and store everything missing for one symbol: completed sessions after its last stored close
 * (from 2000-01-01 on a backfill), the instruments row, and corporate actions when a week old.
 * Never throws for a provider problem: the error lands in price_coverage.last_error and the result.
 */
export async function refreshSymbol(
  db: Queryable,
  provider: DailyCloseProvider,
  symbol: string,
  runDate: string,
  nowMs: number,
): Promise<SymbolResult> {
  const cov = await readCoverage(db, symbol);
  const result: SymbolResult = { symbol, inserted: 0, actions: 0, latest: cov.last_session_date, fetched: false };
  try {
    const since = cov.last_session_date ? addDays(cov.last_session_date, 1) : BACKFILL_FROM;
    let closes: DailyClose[] = [];
    if (since <= runDate) {
      result.fetched = true;
      closes = await provider.getCloses([symbol], runDate, { since });
    }
    const listing = result.fetched && provider.getListing ? await provider.getListing(symbol) : null;
    const known = await db.query<{ currency: string }>("SELECT currency FROM instruments WHERE symbol = $1", [symbol]);
    const currency = known[0]?.currency ?? listing?.currency ?? closes[0]?.currency;
    if (listing) {
      if (known[0] && known[0].currency !== listing.currency)
        throw new Error(`${symbol}: the feed's currency changed from ${known[0].currency} to ${listing.currency}; nothing stored.`);
      await db.query(
        `INSERT INTO instruments (symbol, name, exchange, region, currency, mic, provider_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (symbol) DO UPDATE SET name = COALESCE(EXCLUDED.name, instruments.name),
           exchange = EXCLUDED.exchange, region = EXCLUDED.region, mic = COALESCE(EXCLUDED.mic, instruments.mic),
           provider_ids = instruments.provider_ids || EXCLUDED.provider_ids, updated_at = now()`,
        [symbol, listing.name, listing.exchange, listing.region, listing.currency, listing.mic, JSON.stringify(listing.providerIds)],
      );
    }
    // One currency per series, never mixed (A.3).
    const mixed = closes.find((c) => c.currency !== currency);
    if (mixed) throw new Error(`${symbol}: close in ${mixed.currency} doesn't match ${currency}; nothing stored.`);
    result.inserted = await insertCloses(db, closes);
    if (closes.length) {
      const first = closes[0].date;
      const last = closes[closes.length - 1].date;
      await db.query(
        `UPDATE price_coverage SET
           first_session_date = LEAST(COALESCE(first_session_date, $2::date), $2::date),
           last_session_date = GREATEST(COALESCE(last_session_date, $3::date), $3::date)
         WHERE symbol = $1`,
        [symbol, first, last],
      );
      result.latest = result.latest && result.latest > last ? result.latest : last;
    }

    const checked = cov.actions_checked_at ? new Date(cov.actions_checked_at).getTime() : null;
    if (checked === null || nowMs - checked >= ACTIONS_MAX_AGE_MS) {
      const actions = await provider.getCorporateActions(symbol);
      for (const a of actions) {
        const rows = await db.query(
          `INSERT INTO corporate_actions (symbol, ex_date, kind, cash_unadj, split_from, split_to, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (symbol, ex_date, kind) DO NOTHING RETURNING symbol`,
          [a.symbol, a.exDate, a.kind, a.cashUnadjusted ?? null, a.splitFrom ?? null, a.splitTo ?? null, a.source],
        );
        result.actions += rows.length;
      }
      await db.query("UPDATE price_coverage SET actions_checked_at = $2 WHERE symbol = $1", [
        symbol,
        new Date(nowMs).toISOString(),
      ]);
    }
    await db.query("UPDATE price_coverage SET last_error = NULL WHERE symbol = $1 AND last_error IS NOT NULL", [symbol]);
  } catch (err) {
    result.error = message(err);
    await db.query("UPDATE price_coverage SET last_error = $2 WHERE symbol = $1", [symbol, result.error]);
  }
  return result;
}

/** Take the lock for `runDate`: null when another run for that date is still running. */
export async function acquireRunLock(
  db: Queryable,
  runDate: string,
  trigger: RefreshTrigger,
  staleLockMs = STALE_LOCK_MS,
): Promise<number | null> {
  const rows = await db.query<{ id: number | string }>(
    `INSERT INTO refresh_runs (run_date, detail) VALUES ($1, jsonb_build_object('trigger', $2::text))
     ON CONFLICT (run_date) DO UPDATE
       SET started_at = now(), finished_at = NULL, status = 'running', detail = EXCLUDED.detail
       WHERE refresh_runs.status <> 'running'
          OR refresh_runs.started_at < now() - make_interval(secs => $3::double precision / 1000)
     RETURNING id`,
    [runDate, trigger, staleLockMs],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export type RunOptions = {
  trigger: RefreshTrigger;
  now?: () => number;
  timeBudgetMs?: number;
  staleLockMs?: number;
  /** FX source (T06). Omitted: the run stores closes only. */
  fx?: FxFetcher;
};

/** The daily job. Safe to run any number of times; a concurrent second run gets `locked`. */
export async function runDailyRefresh(
  db: Queryable,
  provider: DailyCloseProvider,
  options: RunOptions,
): Promise<RefreshSummary> {
  const now = options.now ?? (() => Date.now());
  const started = now();
  const runDate = dateInZone(started, "UTC");
  const runId = await acquireRunLock(db, runDate, options.trigger, options.staleLockMs);
  if (runId === null) return { status: "locked", runDate };

  const summary: Extract<RefreshSummary, { runId: number }> = {
    status: "ok",
    runId,
    runDate,
    trigger: options.trigger,
    symbols: 0,
    inserted: 0,
    actions: 0,
    errors: [],
    deferred: [],
    latest: {},
  };
  try {
    // Pending backfills first, then the stalest symbols.
    const held = await db.query<{ symbol: string }>(
      `SELECT h.symbol FROM (SELECT DISTINCT symbol FROM holdings) h
       LEFT JOIN price_coverage c ON c.symbol = h.symbol
       ORDER BY c.last_session_date ASC NULLS FIRST, h.symbol`,
    );
    summary.symbols = held.length;
    for (const { symbol } of held) {
      if (now() - started > (options.timeBudgetMs ?? TIME_BUDGET_MS)) {
        summary.deferred.push(symbol);
        continue;
      }
      const r = await refreshSymbol(db, provider, symbol, runDate, now());
      summary.inserted += r.inserted;
      summary.actions += r.actions;
      summary.latest[symbol] = r.latest;
      if (r.error) summary.errors.push({ symbol, error: r.error });
    }
    if (options.fx) summary.fx = await refreshFx(db, options.fx, { today: runDate });
    const fxFailed = Boolean(summary.fx?.errors.length);
    summary.status =
      summary.symbols > 0 && summary.errors.length === summary.symbols
        ? "failed"
        : summary.errors.length || summary.deferred.length || fxFailed
          ? "partial"
          : "ok";
  } catch (err) {
    summary.status = "failed";
    summary.errors.push({ symbol: "*", error: message(err) });
  } finally {
    const { runId: _id, status, ...detail } = summary;
    void _id;
    await db.query("UPDATE refresh_runs SET finished_at = now(), status = $2, detail = $3::jsonb WHERE id = $1", [
      runId,
      status,
      JSON.stringify(detail),
    ]);
  }
  return summary;
}

/**
 * The new-holding job: fetch a symbol's history once when nothing is stored for it yet. No lock
 * (writes are idempotent); a symbol that already has closes is left to the daily run.
 */
export async function backfillSymbol(
  db: Queryable,
  provider: DailyCloseProvider,
  symbol: string,
  now: () => number = () => Date.now(),
): Promise<SymbolResult | null> {
  const cov = await readCoverage(db, symbol);
  if (cov.last_session_date) return null;
  return refreshSymbol(db, provider, symbol, dateInZone(now(), "UTC"), now());
}

/** What `/dashboard` shows per symbol: the latest stored close, or pending. Reads Postgres only. */
export type PriceView = {
  symbol: string;
  close: string | null;
  currency: string | null;
  sessionDate: string | null;
  pending: boolean;
  lastError: string | null;
  /** Company name from `instruments` (filled by the backfill / daily job); null until then. */
  name: string | null;
};

export async function priceViews(db: Queryable, symbols: string[]): Promise<Record<string, PriceView>> {
  if (!symbols.length) return {};
  const rows = await db.query<{
    symbol: string;
    close: string | null;
    currency: string | null;
    session_date: string | null;
    last_error: string | null;
    name: string | null;
  }>(
    `SELECT s.symbol, d.close, d.currency, d.session_date::text AS session_date, c.last_error, i.name
     FROM unnest($1::text[]) AS s(symbol)
     LEFT JOIN LATERAL (
       SELECT close, currency, session_date FROM daily_closes
       WHERE symbol = s.symbol ORDER BY session_date DESC LIMIT 1
     ) d ON true
     LEFT JOIN price_coverage c ON c.symbol = s.symbol
     LEFT JOIN instruments i ON i.symbol = s.symbol`,
    [symbols],
  );
  const out: Record<string, PriceView> = {};
  for (const r of rows)
    out[r.symbol] = {
      symbol: r.symbol,
      close: r.close === null ? null : String(r.close),
      currency: r.currency,
      sessionDate: toIsoDate(r.session_date),
      pending: r.close === null,
      lastError: r.last_error,
      name: r.name,
    };
  return out;
}

/** The latest finished run (any status), for the preview tools line. */
export async function lastRun(db: Queryable): Promise<{ runDate: string; status: string; finishedAt: string | null } | null> {
  const rows = await db.query<{ run_date: string; status: string; finished_at: Date | string | null }>(
    `SELECT run_date::text AS run_date, status, finished_at FROM refresh_runs ORDER BY started_at DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    runDate: toIsoDate(r.run_date) ?? "",
    status: r.status,
    finishedAt: r.finished_at === null ? null : new Date(r.finished_at).toISOString(),
  };
}
