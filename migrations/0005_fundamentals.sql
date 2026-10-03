-- T08 (#16): fundamentals ingest bookkeeping on the shared `instruments` table (spec §5, §7).
-- `fundamentals_checked_at`: when the daily job last resolved the symbol's SEC coverage (and, when
-- covered, fetched companyfacts). NULL = never checked ("coverage check pending"). Refreshed after 7 days.
-- `fundamentals_error`: the last fetch error for the symbol (cleared on success); a failed symbol keeps
-- its previous checked_at so the next run retries it.
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS fundamentals_checked_at TIMESTAMPTZ;
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS fundamentals_error TEXT;
