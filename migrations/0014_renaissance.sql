-- #267 (attachments/renaissance-spec.md section 4; Diego yes 2026-10-30 via CoS): the Renaissance Man daily check-ins.
-- One row per (day, item); POST /api/renaissance/checkin upserts on that key, so a repeated post is a no-op.
-- Owner-only data (the page and the API check ORPHEUS_OWNER_EMAIL); no user_id column, there is one owner.
-- Derived values (caps, streaks, %s) are computed on read and never stored.
-- Idempotent and additive (previews share one database): CREATE TABLE IF NOT EXISTS; older code never reads it.
CREATE TABLE IF NOT EXISTS rm_entries (
  entry_date DATE NOT NULL,
  item TEXT NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('health', 'industry', 'spiritual')),
  target DOUBLE PRECISION,
  actual DOUBLE PRECISION,
  hit BOOLEAN,
  note TEXT,
  picks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_date, item)
);
