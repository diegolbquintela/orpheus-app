-- WRITE. #156 / PR #174 restore of PF report keys (docs/release/pf-reports-rollback.md step 2). Same SQL as the doc.
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
