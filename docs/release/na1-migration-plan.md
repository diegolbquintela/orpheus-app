# NA1 migration plan: per-month entered net assets (#240)

Added 2026-10-23. **Plan only.** No code, no migration file, no schema change, no DB connection and no SQL was run for this document. Every SQL block below is *proposed text* for Diego's review. Ticket #240 is a HARD STOP: nothing here runs until Diego confirms the schema plan via CoS.

Grounding (main at `da114cf`, plus open PR #246 for the CFO API):

- PF storage: one row per user, `personal_finance(user_id TEXT PK → "user"(id) ON DELETE CASCADE, data JSONB NOT NULL, updated_at TIMESTAMPTZ)` (`migrations/0010_personal_finance.sql:4-8`). `data` is a map of storage key → JSON text.
- Months live inside that JSON under `MONTHS_KEY = "orpheus.finance.months.v1"` (`src/lib/finance/months.ts:12`), shape `{ "<yyyy-mm>": { fixed, variable, people } }` (`months.ts:8-11`, type at `months.ts:25-26`).
- `readMonths` rebuilds every month via `asLines`, which keeps **only** `fixed`, `variable`, `people` (`months.ts:64-93`); unknown per-month keys are dropped on read.
- Record save replaces `data` whole, keeping only the report keys (`src/lib/finance/account.server.ts:104-111`); record size cap 1 MB (`src/lib/finance/record.ts:39`, checked at `record.ts:56`).
- Migrator: `build` = `vite build && npm run db:migrate` (`package.json:11`); `scripts/migrate.mjs` applies each pending `migrations/*.sql` in one transaction and records it in `_migrations` (`scripts/migrate.mjs:61-88`). Production skips unless `DASHBOARD_ENABLED=true` (`scripts/db-env.mjs:80-81`). PGLite applies the same files at startup, each file + its `_migrations` row in one transaction (`src/lib/db.ts:139-156`, loop at `db.ts:149`, `pg.transaction` at `db.ts:152`).
- Net assets today (#228, spec §64): the anchor rule comment at `src/lib/finance/series.ts:162-166`; anchor = as-of month, else first data month, else (#239, spec §71) the current month when a start is typed (`src/lib/finance/series.ts:162-178`, `net_assets_from` at `series.ts:215`).
- CFO API (PR #246, spec §67, not on main): `netAssetsByMonth` calls `seriesValues` for `net-assets` (`src/lib/finance/cfo-api.server.ts:119-128`); used by `/months` and `/months/:month` (`cfo-api.server.ts:151-169`); `/series` returns `seriesValues` as is (`cfo-api.server.ts:182-196`); `/overview` returns `netAssetsNow: inputs.start` (`cfo-api.server.ts:180`); future-month note `NET_FUTURE` (`cfo-api.server.ts:116`).
- Deploy findings: DCR-03 (separate prod / preview DBs, backfill target unknown) `docs/release/deploy-config-review.md:31-35`; DCR-05 (every build migrates, previews included) `deploy-config-review.md:55-59`.

## 1. Proposed schema change

Option A, JSON field: add `netAssets?: string` to each month in `orpheus.finance.months.v1`. No migration at all. Costs:
- `asLines` drops it today (`months.ts:64-76`), so every reader and writer must change in one go, and an **old cached client** that loads and saves the record would silently strip every entered value (whole-record replace, `account.server.ts:104-111`).
- Not queryable or auditable on its own; shares the 1 MB cap.

Option B, separate table (**recommended**):

```sql
-- PROPOSED TEXT ONLY: migrations/0014_pf_month_net_assets.sql (not created)
CREATE TABLE IF NOT EXISTS pf_month_net_assets (
  user_id    TEXT        NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  month      TEXT        NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND month >= '2020-01'),
  amount     NUMERIC(18,2) NOT NULL,          -- household currency, as typed
  currency   TEXT        NOT NULL,            -- household currency at entry (ISO 4217)
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month)
);
```

- Nullability: no row = "not entered" (no nullable amount; clearing a value deletes the row). `currency` is stored so a later household-currency change is detectable instead of silently re-labelled.
- Why: survives whole-record saves and old clients, is additive (nothing existing changes shape), cascades with the user like `personal_finance`, idempotent like `0010` (`CREATE TABLE IF NOT EXISTS`, safe on the shared preview DB), and is trivially droppable.
- Recommendation: **Option B**. If Diego wants zero migration risk instead, Option A is viable only with a key bump (`orpheus.finance.months.v2`) so old clients can't strip it.

## 2. Backfill of existing data

- Existing months get **nothing** (no rows = null / not entered). Do not derive values from start + surplus: a derived number would look "entered" and change the #228 rule's meaning; today's computed path stays the fallback.
- So there is no data backfill step; the migration is DDL only. It is idempotent via `IF NOT EXISTS` and the `_migrations` record (`scripts/migrate.mjs:64-75`).
- If Diego later wants a seed (e.g. copy today's Starting net assets into its as-of month), do it as a separate, explicit, re-runnable script using `INSERT ... ON CONFLICT (user_id, month) DO NOTHING`, never in the build.

## 3. Rollback

- Code rollback first: the reader treats a missing table / no rows as "not entered", so reverting the app leaves the table harmless.
- Down migration (proposed text; the migrator has no down step, so this is a manual, reviewed run):

```sql
-- PROPOSED TEXT ONLY, run manually after the export below
DROP TABLE IF EXISTS pf_month_net_assets;
DELETE FROM _migrations WHERE name = '0014_pf_month_net_assets.sql';
```

- Data-safe rollback once users have entered values: copy before drop, same pattern as `docs/release/pf-reports-rollback.md`:

```sql
-- PROPOSED TEXT ONLY
-- name the copy with the run's timestamp so a re-run never collides, e.g. _YYYYMMDD_HHMM (Toronto time)
CREATE TABLE pf_month_net_assets_backup_20261023_1700 AS TABLE pf_month_net_assets;
-- and/or export: \copy pf_month_net_assets TO 'na1-export.csv' CSV HEADER
```

  Restore = `INSERT INTO pf_month_net_assets SELECT * FROM <backup> ON CONFLICT DO NOTHING`. Keep the backup until Diego signs off.

## 4. Preview vs prod DB handling (DCR-03, DCR-05)

- DCR-05: any preview build of the branch migrates the shared preview Neon DB (`package.json:11`); prod migrates on prod deploys when `DASHBOARD_ENABLED=true` (`db-env.mjs:80-81`). Prod and preview use different env vars (DCR-03), so a *preview* build cannot reach prod unless prod's `DATABASE_URL*` is also set for Preview. Keep it that way: prod `DATABASE_URL`/`DATABASE_URL_UNPOOLED` stay Production-only (`deploy-config-review.md:44`).
- Recommendation: (a) Diego confirms in the Neon/Vercel dashboard which project backs prod (DCR-03) before rollout; (b) no box-run migration or backfill against `DATABASE_URL_UNPOOLED` from the box, since its target is unrecorded; (c) optional hardening (separate ticket, Diego's yes): gate `db:migrate` so it runs only when `VERCEL_ENV` is `production` or an explicit `MIGRATE_PREVIEW=true` is set.
- Preview: the Preview DB gets the table on the first preview build of the code PR. The skip rule applies only to `VERCEL_ENV=production` (`scripts/db-env.mjs:80-81`), and `DASHBOARD_ENABLED` is set in Preview too (`deploy-config-review.md:42`), so the feature is live there for QA as soon as it builds.
- Ordered rollout:
  1. Diego approves this plan (schema + Q answers).
  2. Code PR: migration file + reader/writer + tests; local PGLite only.
  3. Preview deploy migrates the preview DB (additive, idempotent); QA on preview.
  4. Diego confirms the prod DB project (DCR-03) and takes a Neon branch/snapshot of prod.
  5. Merge to main → prod deploy runs `0014` once; verify `_migrations` row and an empty table.
     - If `0014` fails on the prod deploy: the migrator applies the file and its `_migrations` row in one transaction and rolls back on error (`scripts/migrate.mjs:71-84`), so it cannot be half-applied; the build exits 1 (`migrate.mjs:96-102`) and Vercel keeps the previous deployment live. Read the logged error code (never the URL), fix the file in a new PR, redeploy. If a manual run was ever used and left a table without its `_migrations` row, `CREATE TABLE IF NOT EXISTS` makes the re-run safe; check the columns match before recording it.
  6. Enable the UI entry (flag or same release) and QA on prod read-only.

## 5. CFO endpoint impact (PR #246)

- New rule (proposed; CFO view via EL 2026-10-23, needs Diego's yes): net assets at month M = the LATEST entered value at or before M, plus the own surpluses of the months after it through M; with no entered value, today's #228 / #239 rule unchanged (as-of → first data month → current month when start-only, `series.ts:162-178`). This replaces #239's start-only fallback once any value is entered (spec §71 Q-SN5).
- `/api/cfo/pf/months` and `/months/:month`: `netAssets` comes from `netAssetsByMonth` (`cfo-api.server.ts:119-128`), so they follow automatically; add the CFO-view fields below (`netAssetsSource`, `netAssetsAnchor`) per month. Future months keep `NET_FUTURE` (`cfo-api.server.ts:116`).
- `/api/cfo/pf/series`: same `seriesValues` (`cfo-api.server.ts:196`); response shape unchanged except the additive parallel arrays `net_assets_source` / `net_assets_anchor` on the net-assets series (shape below). `net_assets_from` keeps its current meaning (the #228 / #239 anchor of the computed chain, `series.ts:215`); no separate entered-months list.
- Schema version: bump `CFO_SCHEMA` from `"cfo-pf.v1"` (`cfo-api.server.ts:43`) to `"cfo-pf.v2"` so the CFO client can tell the new fields exist.
- Notes (`cfo-api.server.ts:115-117`): `NET_BEFORE_ANCHOR` and `NET_NO_ANCHOR` gain "or an entered month" (e.g. "No net assets before the anchor month (the latest entered month, else the as-of month, else the first month with figures; #228, #240)."); `NET_FUTURE` adds "entered values are past and current months only (#240)".
- **CFO view (via EL), 2026-10-23; still needs Diego's yes: new fields.** Additive only; existing fields unchanged.
  - `/api/cfo/pf/months` (each month in `months`) and `/api/cfo/pf/months/:month` (in `data`):
    `netAssetsSource: "entered" | "computed" | null` and `netAssetsAnchor: MonthKey | "start" | null`.
    `"entered"` = this month has its own entered value (anchor = this month). `"computed"` = counted from the latest
    entered month at or before it (anchor = that month) or, with no entered month, from Starting net assets
    (anchor = `"start"`). Both `null` when `netAssets` is `null` (future month, before the anchor, no anchor).
    Example: `{ "netAssets": 105200, "netAssetsNote": null, "netAssetsSource": "computed", "netAssetsAnchor": "2026-07" }`.
  - `/api/cfo/pf/series` (net-assets series only): parallel arrays aligned to `months`:
    `net_assets_source: ("entered" | "computed" | null)[]` and `net_assets_anchor: (MonthKey | "start" | null)[]`.
    Non-net-assets series carry no such arrays; `net_assets_from` keeps its meaning.
- `/overview`: `netAssetsNow` (`cfo-api.server.ts:180`) becomes the latest entered value through the current month, else the start (as now).
- Doc changes: new spec section (§72) with the rule; addenda to spec §64 (#228), §67 (#246 response fields) and §71 (fallback superseded when an entered value exists); `attachments/pf-series-design.md` addendum; AGENTS.md entry.

## 5a. Spec items (BG7, BG8; added 2026-10-23, need Diego's yes)

- **Old-currency entries (FX).** Each row stores the currency at entry. Recommendation: when it differs from today's household currency, convert at the historical month-end rate for that month (the #170 / spec §43 basis), flag `netAssetsNote` "converted from <CUR> at <month> rate", and never rewrite the stored amount. Q-NA1-9 below.
- **Same-month, two tabs.** Today whole-record saves let two tabs overwrite each other (#242). NA1 writes go to their own row, one month per request: last write wins per `(user_id, month)` via `INSERT ... ON CONFLICT (user_id, month) DO UPDATE`, never touching other months or the record. Optional guard: send the `entered_at` the tab read and refuse a stale write (409). Track the general fix in #242.
- **Write API.** `PUT /api/personal-finance/net-assets/:month` `{ amount }` and `DELETE` for the same path; body ≤ 1 KB; `amount` a finite number with 2 decimals.
- **Auth.** The existing PF gate with `need: "write"` (`src/lib/finance/account.server.ts:200`); read-only grants (CFO read) get 403; the CFO API stays read-only.
- **Future-month rejection.** A month after the current household month (or before `FIRST_MONTH`, `months.ts:14`) is refused with 400 on write, matching Q-NA1-3.
- **Audit.** Saving and clearing an entry write an `audit_event` row (`migrations/0012_audit.sql:5-14`): actions `pf.net_assets_set` / `pf.net_assets_clear`, masked actor, no amount (the table forbids amounts in `detail`). A clear is a hard DELETE of the row, so the audit row is its only trace.

## 6. Test and QA plan

- Spec-item tests (§5a): write refused for read-only grants (403) and for future / pre-2020 months (400); a clear writes `pf.net_assets_clear` to `audit_event` with no amount; two tabs saving different months both keep their values; old-currency entry converted with the note.
- Unit (pure): rule table: no entries → byte-identical to today (PFSN-01..07 still pass); one entry; entry + later surpluses; entry after a future month ignored; entered `0` counts; currency mismatch flagged.
- Migration: apply `0014` twice on PGLite (idempotent); FK cascade on user delete; CHECK rejects `2019-12` / `2026-13`; down + restore round-trip.
- **CFO view (via EL), 2026-10-23; still needs Diego's yes: added tests.**
  - Gap between two entered months (e.g. entered 2026-03 and 2026-07): 2026-04..06 = the 2026-03 value + each month's own surplus; 2026-07 = its entered value exactly (the chain resets, no carry from March); 2026-08+ = the 2026-07 value + surpluses.
  - Entered values only for past/current months: a future month is rejected on write and ignored on read.
  - No entered month: values byte-identical to today (Starting net assets fallback, #228 / #239).
  - Currency: the household currency (CAD for Diego) stored and returned as typed, no conversion.
  - Shape: `/months`, `/months/:month` give `netAssetsSource` / `netAssetsAnchor` per month (`entered`+self, `computed`+earlier month, `computed`+`"start"`, both `null` for future / no anchor); `/series` arrays have the same length as `months`, appear only on net-assets series, and agree with `/months` month by month.
- Missing table: with `pf_month_net_assets` absent (code ahead of the migration, or after the down step) every read returns "not entered" and the response equals today's; a write returns an error, not a crash.
- Save path: a whole-record save does not touch the table; an old-client save keeps entered values.
- CFO API: `/months`, `/months/:month`, `/series`, `/overview` fixtures with and without entries; read-only grants can't write.
- QA on preview: enter, edit, clear a month; Overview 'Net assets now' equals `/series` last point equals CFO `/overview`; 390 / 1440 viewports. Prod: read-only smoke after deploy.

## 7. Open questions for Diego

**CFO view (via EL), 2026-10-23; still needs Diego's yes** on every item below, including the ones the CFO answered:
- NA1-3: CFO yes, past and current months only.
- NA1-4: CFO yes. Later months count from the LATEST entered month, adding each later month's own surplus; a later entered value resets the chain.
- NA1-5: CFO yes, Starting net assets stays the fallback.
- NA1-6: CFO yes, the household currency (CAD for Diego), no conversion.
- Endpoints: CFO asks for per-month `source` (`entered` | `computed`) and anchor-month fields on `/months`, `/months/:month` and `/series` (shape in section 5).
- Still open for Diego only: NA1-1, NA1-2, NA1-7, NA1-8, NA1-9.

- **Q-NA1-1 Table or JSON?** Recommend: the separate table (Option B).
- **Q-NA1-2 Backfill?** Recommend: none; existing months stay "not entered".
- **Q-NA1-3 Which months can take a value?** Recommend: past and current months only (`FIRST_MONTH`..current), not future.
- **Q-NA1-4 Months after an entered one?** Recommend: entered value + later months' surpluses until the next entered value.
- **Q-NA1-5 Starting net assets role?** Recommend: keep it as the fallback when nothing is entered (no change to #228 / #239 for those users).
- **Q-NA1-6 Currency?** Recommend: store the household currency with each value and show a note if it later differs; no FX conversion of entered values.
- **Q-NA1-7 Preview migrations (DCR-05)?** Recommend: accept the additive migration on the shared preview DB; gate migrate by `VERCEL_ENV` in a separate ticket.
- **Q-NA1-8 Prod DB target (DCR-03)?** Recommend: Diego confirms the prod Neon project and takes a snapshot before the merge; no box-run SQL.
- **Q-NA1-9 Entries in an old currency after a household-currency change?** Recommend: convert at that month's historical rate with a note, keep the stored amount unchanged (§5a).
- **Q-NA1-10 Two tabs, same month?** Recommend: last write wins per month, with the optional stale-write 409; the general fix stays in #242.
