# PF historical FX backfill runbook (#170, added 2026-10-20)

**Status: NOT run.** SWE has not run the backfill or any ingestion against the preview or Production database. EL runs it and records the run below (spec 43.9 / 43.11, AC PFFX-20a, PFFX-22a).

## What it does

Fetches Bank of Canada Valet daily rates (public, no key) for USD EUR GBP BRL MXN CHF JPY AUD CNY from 2020-01-01 to the run date and inserts them into the existing `fx_rates` table with `source = 'BOC'`, `ON CONFLICT (quote, rate_date) DO NOTHING`. No migration, no new secret, no cron or `vercel.json` change. Existing dashboard rows and `ECB_CROSS` rows are never changed. A second run inserts 0 rows.

## Command

From the repo root, with the target database URL in `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`) in the environment (never pasted into logs or git; the script logs only the variable name):

```sh
# 1. fetch only, nothing written: prints the row count
node --experimental-strip-types scripts/pf-fx-backfill.ts --dry-run
# 2. write
node --experimental-strip-types scripts/pf-fx-backfill.ts --confirm
```

Node 22+ is required (`--experimental-strip-types`).

## Expected counts

- Dry run on 2026-10-20 (SWE, public Valet only, no DB): **15,246 rows = 1,694 business days × 9 quotes**, 2020-01-02..2026-10-20. A later run date adds about 21 rows per quote per month.
- First `--confirm`: inserted = 15,246 (or that day's dry-run count) minus the USD/EUR rows the daily dashboard job already stored. Second `--confirm`: **inserted 0**.

## Checks (read-only SQL, before and after)

```sql
SELECT quote, min(rate_date) AS oldest, max(rate_date) AS newest, count(*) AS n
FROM fx_rates WHERE source = 'BOC' AND quote IN ('USD','EUR','GBP','BRL','MXN','CHF','JPY','AUD','CNY')
GROUP BY quote ORDER BY quote;
SELECT source, count(*) FROM fx_rates GROUP BY source ORDER BY source;  -- ECB_CROSS unchanged
```

After the run: every one of the 9 quotes has `oldest = 2020-01-02` and `n` equal to the dry run's per-quote count (1,694 on 2026-10-20; USD and EUR may be higher only by rows dated after the dry run). Before the run (and right after the PR's deploy), these values are unchanged by the deploy.

## Notes

- From the deploy on, the daily `refreshFx` job (cron unchanged) also fetches the 7 PF quotes GBP BRL MXN CHF JPY AUD CNY (Q-AH12). `GET /api/dashboard/fx` stays filtered to USD EUR SEK PLN DKK HUF CZK (Q-AH14), so neither the job nor the backfill changes its output.
- Until the backfill runs, months without rows fall back to the typed rate (Q-AH13): records read `"current"` or `"mixed"`.
- Rollback: the rows are additive. To remove only the backfilled PF quotes: `DELETE FROM fx_rates WHERE source='BOC' AND quote IN ('GBP','BRL','MXN','CHF','JPY','AUD','CNY');` (USD/EUR are shared with the dashboard; leave them).

## Run record (EL)

| Date | Target | Dry-run rows | Inserted | Second run | Checks |
|---|---|---|---|---|---|
| | | | | | |

## Addition (2026-10-20, later): HTTPS driver and `--verify`

EL's first `--confirm` from the box failed with `ETIMEDOUT 198.18.0.1:5432`: outbound Postgres (5432) is blocked there. The script now connects with **`@neondatabase/serverless` 1.2.0** (devDependency, pinned, no transitive dependencies) over **HTTPS (443)** instead of `pg` over 5432. The rows and the insert are unchanged: the same batched `INSERT … SELECT FROM unnest(…) ON CONFLICT (quote, rate_date) DO NOTHING RETURNING quote` with the same parameters (tested). The connection string still comes only from the environment (`DATABASE_URL_UNPOOLED`, else `DATABASE_URL`, else the preview integration names); only the variable's name is printed. Logic and tests: `src/lib/finance/fx-backfill-cli.server.ts` (+ `.test.ts`).

Commands (repo root, Node 22+):

```sh
# 1. fetch only; no database connection at all
node --experimental-strip-types scripts/pf-fx-backfill.ts --dry-run
# expected: [pf-fx-backfill] dry run: 15246 BoC rows for USD,EUR,GBP,BRL,MXN,CHF,JPY,AUD,CNY from 2020-01-01 to 2026-10-20; nothing written.

# 2. read-only check before the run (SELECT only): per currency oldest / newest / count
node --experimental-strip-types scripts/pf-fx-backfill.ts --verify

# 3. write (idempotent)
node --experimental-strip-types scripts/pf-fx-backfill.ts --confirm
# expected: [pf-fx-backfill] using DATABASE_URL_UNPOOLED (HTTPS, @neondatabase/serverless)
#           [pf-fx-backfill] USD,EUR,GBP,BRL,MXN,CHF,JPY,AUD,CNY 2020-01-01..<today>: fetched 15246, inserted <N>.
# a second --confirm: … fetched <same>, inserted 0.

# 4. read-only check after the run
node --experimental-strip-types scripts/pf-fx-backfill.ts --verify
```

`--verify` output after a successful run on 2026-10-20 (USD/EUR `count` can be higher only by rows the daily job stored after the dry run; `newest` is the last BoC business day on or before the run date):

```
[pf-fx-backfill] using DATABASE_URL_UNPOOLED (HTTPS, @neondatabase/serverless)
quote | oldest     | newest     | count
------|------------|------------|------
AUD   | 2020-01-02 | <last BoC day> | 1694
BRL   | 2020-01-02 | <last BoC day> | 1694
…     (CHF CNY EUR GBP JPY MXN USD the same shape)
```

A currency with no rows prints `—` for both dates and `0`. With no mode flag the script refuses (exit 2) and never connects; `--confirm` / `--verify` with no database URL in the environment exit 2. **SWE has not run `--confirm` or `--verify` against any database**; only the BoC-only `--dry-run` above.

**Addition (2026-10-20, QA J1):** a database error (bad URL, driver or query failure) prints `[pf-fx-backfill] database error via <variable name>: <message>` with the URL value, any `connection string: …` tail and any `postgres(ql)://…` text replaced by `[redacted]`, and exits 1. A value that is not a valid URL is refused before the driver is created.
