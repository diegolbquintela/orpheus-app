-- T10 (#18): the SEC filer's SIC code, for ROIC's bank/insurer rule (spec §8: SIC 6000–6399 → n/m).
-- Idempotent (previews share the main Neon branch): adding a nullable column is safe for older code.
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sic INTEGER;
