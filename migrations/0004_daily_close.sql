-- Daily close cache (attachments/dashboard-spec.md §6, §11, §14 Amendment A.3; ticket T05 / #13).
--
-- Schema delta from A.3 on the §5 tables, plus the holdings -> "user" foreign key:
-- - instruments: `mic` (e.g. XNYS, XTSE, XAMS) and `provider_ids` jsonb ({"yahoo":"SAP.DE"}).
-- - daily_closes: `adj_close_src`, the provider's adjusted close, a cross-check only. `close` stays the
--   raw as-traded value and a row, once written, is never fetched or changed again.
-- - corporate_actions (new): unadjusted dividends and splits, one row per (symbol, ex_date, kind).
-- - price_coverage (new): what is already stored per symbol, so nothing is fetched twice. A row with no
--   `last_session_date` is a backfill still waiting to run.
-- - holdings.user_id -> "user"(id) ON DELETE CASCADE, so deleting a user removes their holdings (same
--   pattern as 0003 for user_settings).
--
-- Applied by scripts/migrate.mjs (same resolver and production guard as every migration: skipped on
-- VERCEL_ENV=production unless DASHBOARD_ENABLED=true) and by the local PGLite fallback. Recorded by name
-- in `_migrations`; every statement is IF NOT EXISTS or guarded, so a re-run is a no-op.

ALTER TABLE instruments ADD COLUMN IF NOT EXISTS mic TEXT;
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS provider_ids JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE daily_closes ADD COLUMN IF NOT EXISTS adj_close_src NUMERIC;

CREATE TABLE IF NOT EXISTS corporate_actions (
  symbol     TEXT        NOT NULL,
  ex_date    DATE        NOT NULL,
  kind       TEXT        NOT NULL CHECK (kind IN ('dividend', 'split')),
  cash_unadj NUMERIC,
  split_from NUMERIC,
  split_to   NUMERIC,
  source     TEXT        NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, ex_date, kind),
  CONSTRAINT corporate_actions_shape CHECK (
    (kind = 'dividend' AND cash_unadj IS NOT NULL AND cash_unadj > 0)
    OR (kind = 'split' AND split_from > 0 AND split_to > 0)
  )
);

CREATE TABLE IF NOT EXISTS price_coverage (
  symbol             TEXT        PRIMARY KEY,
  first_session_date DATE,
  last_session_date  DATE,
  actions_checked_at TIMESTAMPTZ,
  last_error         TEXT
);

-- Rows whose user_id has no "user" row can't satisfy the constraint. Holdings only exist since T04, which
-- needs a signed-in session, so such a row is left over from a deleted test user; it is removed first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'holdings_user_id_fkey' AND conrelid = 'holdings'::regclass
  ) THEN
    DELETE FROM holdings h WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = h.user_id);
    ALTER TABLE holdings
      ADD CONSTRAINT holdings_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE;
  END IF;
END
$$;
