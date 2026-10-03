-- T10 QA (#37, F2): parser version per instrument, and the "insufficient_data" metric status.
-- Idempotent (previews share the main Neon branch; safe for older code, which never writes the new status).
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS fundamentals_parser_version INTEGER;
ALTER TABLE metric_values DROP CONSTRAINT IF EXISTS metric_values_status_check;
ALTER TABLE metric_values ADD CONSTRAINT metric_values_status_check
  CHECK (status IN ('ok', 'n/m', 'insufficient_history', 'insufficient_data', 'not_covered'));
