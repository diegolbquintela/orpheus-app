-- Dashboard schema (attachments/dashboard-spec.md §5, ticket T02 / #10).
--
-- Applied by `scripts/migrate.mjs` during `npm run build` when DATABASE_URL is set (Neon), and by the
-- local PGLite fallback in `npm run dev`. Recorded by name in `_migrations`; never edit after it ships,
-- add a new numbered file instead.
--
-- Per-user tables carry `user_id TEXT NOT NULL` (Better Auth ids are text). Every query is scoped to
-- the verified session user on the server; a client-supplied user id is never trusted.
--
-- Note: the spec's FK `user_settings.user_id -> "user"(id) ON DELETE CASCADE` is added by T03 (#11),
-- which brings the Better Auth `"user"` table into migrations/. It does not exist yet, so this file
-- cannot reference it.

-- ---------------------------------------------------------------- per-user tables

CREATE TABLE IF NOT EXISTS user_settings (
  user_id       TEXT        PRIMARY KEY,
  base_currency TEXT        NOT NULL DEFAULT 'CAD' CHECK (base_currency IN ('CAD', 'USD', 'EUR')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holdings (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    TEXT           NOT NULL,
  symbol     TEXT           NOT NULL,
  shares     NUMERIC(20, 6) NOT NULL CHECK (shares > 0),
  avg_cost   NUMERIC(20, 6) NOT NULL CHECK (avg_cost >= 0),
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT holdings_user_symbol_key UNIQUE (user_id, symbol)
);
CREATE INDEX IF NOT EXISTS holdings_user_id_idx ON holdings (user_id);

CREATE TABLE IF NOT EXISTS user_metric_columns (
  user_id    TEXT    NOT NULL,
  metric_key TEXT    NOT NULL,
  position   INTEGER NOT NULL,
  PRIMARY KEY (user_id, metric_key)
);

-- ---------------------------------------------------------------- shared market data (daily job only)

CREATE TABLE IF NOT EXISTS instruments (
  symbol              TEXT        PRIMARY KEY,
  name                TEXT,
  exchange            TEXT,
  region              TEXT        NOT NULL CHECK (region IN ('US', 'EU', 'CA')),
  currency            TEXT        NOT NULL,
  sec_cik             TEXT,
  fundamentals_source TEXT        NOT NULL DEFAULT 'none' CHECK (fundamentals_source IN ('sec', 'none')),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_closes (
  symbol       TEXT        NOT NULL,
  session_date DATE        NOT NULL,
  close        NUMERIC     NOT NULL,
  currency     TEXT        NOT NULL,
  source       TEXT        NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, session_date)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  quote        TEXT        NOT NULL,
  rate_date    DATE        NOT NULL,
  cad_per_unit NUMERIC     NOT NULL,
  source       TEXT        NOT NULL CHECK (source IN ('BOC', 'ECB_CROSS')),
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (quote, rate_date)
);

CREATE TABLE IF NOT EXISTS fundamentals_annual (
  symbol          TEXT    NOT NULL,
  fiscal_year_end DATE    NOT NULL,
  concept         TEXT    NOT NULL,
  value           NUMERIC NOT NULL,
  unit            TEXT    NOT NULL,
  source_tag      TEXT    NOT NULL,
  accession       TEXT,
  filed           DATE,
  PRIMARY KEY (symbol, fiscal_year_end, concept)
);

CREATE TABLE IF NOT EXISTS metric_values (
  symbol          TEXT        NOT NULL,
  metric_key      TEXT        NOT NULL,
  value           NUMERIC,
  status          TEXT        NOT NULL CHECK (status IN ('ok', 'n/m', 'insufficient_history', 'not_covered')),
  fiscal_year_end DATE,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, metric_key)
);

CREATE TABLE IF NOT EXISTS refresh_runs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_date    DATE        NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT        NOT NULL DEFAULT 'running',
  detail      JSONB,
  CONSTRAINT refresh_runs_run_date_key UNIQUE (run_date)
);
