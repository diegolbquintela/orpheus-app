-- Epic #53 ticket 3 (#56, spec §0.2 "Add", §0.5 item 7): average cost becomes optional. A blank cost is
-- stored as NULL ("no cost"), distinct from 0, which stays a real cost. The CHECK (avg_cost >= 0) from
-- 0002 stays: it is NULL-safe and still guards every given value. Existing rows are not touched (a stored
-- 0 stays 0; nothing is converted to NULL).
-- Idempotent (previews share the main Neon branch): DROP NOT NULL on a column that is already nullable is a
-- no-op in Postgres, so re-running this file, or running it after another preview did, changes nothing.
ALTER TABLE holdings ALTER COLUMN avg_cost DROP NOT NULL;
