# Personal Finance saved reports: rollback runbook (#156 / PR #174)

> **Dated 2026-10-17** (CFO pre-merge condition on PR #174). Additions to this file only.

## Rule

**Do NOT roll back past #174 (Vercel Instant Rollback, a redeploy of an older commit, or a revert) without first
exporting every user's Personal Finance report records with step 1 below.**

Why: from #174 on, each user's `personal_finance` row can hold named reports under the JSON key
`orpheus.finance.reports.v1` (beside the #153 default report `orpheus.finance.report.v1`). Code from before #174 does
not know that key: it reads that user's whole Personal Finance record as empty, and the first Personal Finance save
writes the row without the key, so the named reports are gone. Turning the dashboard flag off
(`DASHBOARD_ENABLED`, `docs/release/dashboard-release.md` §3 step 9) does not roll code back and is safe.

Where the data is (from the code: `migrations/0010_personal_finance.sql`, `src/lib/finance/report.ts` `REPORT_KEY`,
`src/lib/finance/reports.ts` `REPORTS_KEY`):

- table `personal_finance`, one row per user: `user_id TEXT` (primary key, references `"user"(id)`), `data JSONB`,
  `updated_at TIMESTAMPTZ`;
- `data -> 'orpheus.finance.report.v1'`: the default report, a JSON **string** holding the report JSON;
- `data -> 'orpheus.finance.reports.v1'`: the named reports, a JSON **string** holding an array.

Use the database of the environment being rolled back (`DATABASE_URL_UNPOOLED`, else `DATABASE_URL`, as
`scripts/db-env.mjs`). Take it from the Vercel / Neon dashboard into your own shell; never paste it in chat, PRs,
logs or files, and never `echo` it. The commands below read it from `$PF_DB_URL`.

```sh
read -rs PF_DB_URL && export PF_DB_URL   # paste the URL, Enter (nothing is shown)
```

## 1. Back up (READ-ONLY)

The SELECT (it only reads):

<!-- pf-reports-select -->
```sql
SELECT user_id,
       data -> 'orpheus.finance.report.v1'  AS report_v1,
       data -> 'orpheus.finance.reports.v1' AS reports_v1,
       updated_at
FROM personal_finance
WHERE data ? 'orpheus.finance.report.v1' OR data ? 'orpheus.finance.reports.v1'
ORDER BY user_id;
```

Save it to a dated file, one JSON object per line:

```sh
F="pf-reports-backup-$(date -u +%Y%m%dT%H%M%SZ).jsonl"
psql "$PF_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT row_to_json(t) FROM (SELECT user_id, data -> 'orpheus.finance.report.v1' AS report_v1, data -> 'orpheus.finance.reports.v1' AS reports_v1, updated_at FROM personal_finance WHERE data ? 'orpheus.finance.report.v1' OR data ? 'orpheus.finance.reports.v1' ORDER BY user_id) t" > "$F"
echo "$F"
```

Check the row count (the two numbers must be equal):

<!-- pf-reports-count -->
```sql
SELECT count(*) FROM personal_finance
WHERE data ? 'orpheus.finance.report.v1' OR data ? 'orpheus.finance.reports.v1';
```

```sh
psql "$PF_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM personal_finance WHERE data ? 'orpheus.finance.report.v1' OR data ? 'orpheus.finance.reports.v1'"
wc -l < "$F"
```

Keep the file somewhere private (it holds users' report definitions: series names, categories, accounts; no
amounts and no credentials). Only then roll back.

## 2. Restore after rolling forward again (WRITE: changes the database)

> **This is a WRITE.** Run it only after a deployment that includes #174 is live again, on the same database the
> backup came from. It puts each backed-up user's report keys back into their row and leaves every other key of the
> row as it is. A report saved after the backup under the same key is overwritten by the backup.

<!-- pf-reports-restore -->
```sql
BEGIN;
CREATE TEMP TABLE pf_reports_restore (line jsonb) ON COMMIT DROP;
\copy pf_reports_restore (line) FROM 'BACKUP_FILE.jsonl' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')
SELECT count(*) AS lines_loaded FROM pf_reports_restore;
INSERT INTO personal_finance (user_id, data, updated_at)
SELECT line ->> 'user_id',
       jsonb_strip_nulls(jsonb_build_object(
         'orpheus.finance.report.v1',  line -> 'report_v1',
         'orpheus.finance.reports.v1', line -> 'reports_v1')),
       now()
FROM pf_reports_restore r
WHERE EXISTS (SELECT 1 FROM "user" u WHERE u.id = r.line ->> 'user_id')
ON CONFLICT (user_id) DO UPDATE
  SET data = personal_finance.data || EXCLUDED.data, updated_at = now();
COMMIT;
```

Run it (replace `BACKUP_FILE.jsonl` in the SQL with the file name first, or use the `sed` below):

```sh
sed "s/BACKUP_FILE.jsonl/$F/" docs/release/pf-reports-rollback.restore.sql | psql "$PF_DB_URL" -X -v ON_ERROR_STOP=1
```

(`docs/release/pf-reports-rollback.restore.sql` is the same SQL as above.) Then rerun the step 1 count: it should be at
least the backup's line count (users deleted since the backup are skipped). Users can also check
`GET /api/personal-finance/reports`.

## Tested

The three SQL blocks above are run against a local PGlite copy of the schema in
`scripts/pf-reports-rollback.test.mjs` (the `\copy` line is replaced by inserts of the backup lines). They have
never been run against a real or preview database.

## Snapshot at deploy: not built

A Personal Finance snapshot at every deploy is not cheap: it would have to run against the shared database at build
time (like `db:migrate`) and needs somewhere to keep the files. Estimate for EL: a build-time export step plus
private storage (e.g. Vercel Blob or a Neon branch per deploy), its credentials and a retention rule: about 1-2 days
of work and a new secret, so out of scope here.

## Addendum 2026-10-17 (#157, QA's #174 note 3): run the export read-only, then drop the URL

Run the select / count steps with the session forced read-only, so a slip cannot write:

```sh
PGOPTIONS='-c default_transaction_read_only=on' psql "$PF_DB_URL" ...   # the select / count commands above, unchanged
```

and when done, clear the URL from the shell: `unset PF_DB_URL`. (The restore step is a write and is not covered by
this; it still must NEVER be run against any real or preview DB without the owner's go.)
