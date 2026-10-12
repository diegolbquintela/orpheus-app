-- #90 (attachments/roles-and-account-design.md section 3): access grants and account flags.
-- One owner (the account whose email equals the server-only ORPHEUS_OWNER_EMAIL; never stored here). Anyone else
-- sees the owner's Personal Finance / Dashboard data only through a row in access_grant: surface
-- 'personal_finance' (role CFO) or 'dashboard' (role Portfolio Manager), Read (can_read) or Read and write (both).
-- No write without read (Q-D2). Absent row = no access. Idempotent (previews share one database).
CREATE TABLE IF NOT EXISTS access_grant (
  user_id     TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  surface     TEXT NOT NULL CHECK (surface IN ('personal_finance', 'dashboard')),
  can_read    BOOLEAN NOT NULL,
  can_write   BOOLEAN NOT NULL,
  granted_by  TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, surface),
  CHECK (can_read)
);

-- Flags kept outside Better Auth's generated tables (0001 is never edited): the forced password change after a
-- temporary password (Q-D5), who created the account, and (Q-D11) the person's own Personal Finance section
-- toggles when they are not the owner (the owner's stay in the record).
CREATE TABLE IF NOT EXISTS account_state (
  user_id               TEXT PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  must_change_password  BOOLEAN NOT NULL DEFAULT false,
  created_by            TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  pf_view               TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
