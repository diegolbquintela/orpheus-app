-- Epic #53 ticket 4 (#57, spec §0.5 item 4): metric chips. Chips live in user_metric_columns as before; a
-- user who never saved any gets the default chips, and removing every chip must stick. This nullable
-- timestamp tells the two apart: NULL = never saved (defaults), set = saved (an empty list stays empty).
-- Accounts that already saved metric columns keep them as chips (their rows are untouched; EL 2026-10-04).
-- Idempotent (previews share the main Neon branch): ADD COLUMN IF NOT EXISTS; older code never reads it.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS metric_chips_saved_at TIMESTAMPTZ;
