-- #333 Research heatmap. One row per ticker and calendar year. Idempotent.
-- return_pct is a percent (13.4 means +13.4%). is_ytd marks the current year.
-- partial marks an inception year that is not a full calendar year.
-- The page renders the committed seed when this table is missing or empty.
CREATE TABLE IF NOT EXISTS yearly_returns (
  ticker      TEXT        NOT NULL,
  year        INTEGER     NOT NULL,
  return_pct  NUMERIC     NOT NULL,
  is_ytd      BOOLEAN     NOT NULL DEFAULT false,
  partial     BOOLEAN     NOT NULL DEFAULT false,
  source      TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, year)
);
