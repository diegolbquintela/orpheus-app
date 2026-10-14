-- #123: EU fundamentals from ESEF (filings.xbrl.org). A third fundamentals source and the issuer's LEI.
ALTER TABLE instruments DROP CONSTRAINT IF EXISTS instruments_fundamentals_source_check;
ALTER TABLE instruments ADD CONSTRAINT instruments_fundamentals_source_check
  CHECK (fundamentals_source IN ('sec', 'esef', 'none'));
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS lei TEXT;
