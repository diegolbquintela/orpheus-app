-- user_settings.user_id -> "user"(id) ON DELETE CASCADE (attachments/dashboard-spec.md §5, ticket T03 / #11).
--
-- Needs the Better Auth "user" table from 0001_auth.sql. File names sort 0001 < 0002 < 0003, so a fresh
-- database applies them in that order; a database that already had 0002 (the shared preview database
-- before T03) gets 0001 and then 0003. Applied by scripts/migrate.mjs (same resolver and production
-- guard as every migration: skipped on VERCEL_ENV=production unless DASHBOARD_ENABLED=true) and by the
-- local PGLite fallback. Recorded by name in `_migrations`; the DO block also makes a re-run a no-op.
--
-- Rows whose user_id has no "user" row can't satisfy the constraint. No real user could have created
-- one before T03 (there was no sign-in), so any such row is test data and is removed first.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_user_id_fkey' AND conrelid = 'user_settings'::regclass
  ) THEN
    DELETE FROM user_settings s WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = s.user_id);
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE;
  END IF;
END
$$;
