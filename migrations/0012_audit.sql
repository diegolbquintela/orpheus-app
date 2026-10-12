-- #91 (attachments/audit-log-design.md section 2): the audit log of actions, for operations and debug. Not personal
-- data: actor / target are masked codes (`owner`, `p-xxxxxxxx`, `h-xxxxxxxx`, `anonymous`), `detail` is a short code
-- from a fixed list. No email, name, amount, ticker, IP or user agent. No foreign keys (a removed person's history
-- stays). Append-only: UPDATE and DELETE are refused. Idempotent (previews share one database).
CREATE TABLE IF NOT EXISTS audit_event (
  id       BIGSERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor    TEXT NOT NULL CHECK (actor ~ '^(owner|anonymous|p-[0-9a-f]{8})$'),
  role     TEXT NOT NULL CHECK (role IN ('owner', 'cfo', 'pm', 'cfo+pm', 'person', 'anonymous')),
  action   TEXT NOT NULL CHECK (action ~ '^[a-z]+\.[a-z_]+$'),
  target   TEXT CHECK (target IS NULL OR target ~ '^(owner|[ph]-[0-9a-f]{8})$'),
  outcome  TEXT NOT NULL CHECK (outcome IN ('ok', 'denied', 'failed')),
  detail   TEXT CHECK (detail IS NULL OR detail ~ '^[a-z_:+ A-Z]{1,40}$')
);

CREATE OR REPLACE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_event_no_change ON audit_event;
CREATE TRIGGER audit_event_no_change BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();
