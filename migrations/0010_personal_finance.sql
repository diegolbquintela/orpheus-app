-- #102 (attachments/personal-finance-spec.md section 16.5): the Personal Finance record stored against the
-- account. One row per user: the page's five values by name (JSON text), replaced whole on every save.
-- Idempotent (previews share one database): CREATE TABLE IF NOT EXISTS. Deleted with the user.
CREATE TABLE IF NOT EXISTS personal_finance (
  user_id TEXT PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
