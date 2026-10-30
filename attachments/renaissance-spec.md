# Renaissance Man dashboard (#267)

Added 2026-10-30. Diego approved the MVP with the database table on 2026-10-30 (via CoS / EL): `rm_entries` migration, owner-only `POST /api/renaissance/checkin` with `RENAISSANCE_INGEST_TOKEN`, one-time seed from the CoS tracker, growth first. Goals come later.

## 1. Scope

- `/renaissance` is a private, owner-only page. It tracks three pillars: Health, Industry and Spiritual (Philosophy & Discipline).
- The MVP ships the header, growth, the three grids, the health charts, the Industry/Spiritual strips and the log. It does not ship Goals (a later ticket).
- There is no new dependency or provider. The charts use recharts, which the repo already has.

## 2. The plan (code constants, `src/lib/renaissance/model.ts` `PLAN`)

- Start: 2026-10-28 (Day 1). Days are counted in America/Toronto.
- Zyn: baseline 16 a day, floor 3.
- Coffee: baseline 7 cups a day, floor 3. `coffee_noon`: hit means no coffee after 12:00 noon; `actual` is the number of cups after noon.
- Steps: at least 8,000 a day counts as a hit; the goal is 10,000.
- Lift: 3 sessions a week (Mon–Sun).

## 3. Endpoint: `POST /api/renaissance/checkin`

The order of checks:

1. `DASHBOARD_ENABLED` not `"true"` → 404.
2. Any method other than POST → 405 with `Allow: POST`.
3. Auth, one of these two:
   - `Authorization: Bearer <RENAISSANCE_INGEST_TOKEN>` (machine use, for CoS / EL). The check uses a length guard plus `timingSafeEqual`. An unset or empty token refuses everything. A bad token → 401 even when an owner session cookie is also sent (when a Bearer header is present, only the token is checked).
   - Otherwise, the signed-in owner's session (`ORPHEUS_OWNER_EMAIL` → `ownerIdOf`). Signed out → 401; no database → 503; any other user → 403.
4. A body that isn't valid JSON, or fails the schema (section 4) → 400 `{ error }`.
5. 200 `{ ok: true, date, upserted }`, where `upserted` is the number of entries written. Responses are `no-store`.

The token and the Authorization header are never logged. If the migration hasn't been applied, the write fails with a 500, and the page shows the not-configured note (section 6).

## 4. Body schema and storage

```json
{
  "date": "2026-10-30",
  "picks": ["Finish chapter 3", "Call the bank"],
  "entries": [
    { "pillar": "health", "item": "zyn", "target": 14, "actual": 12, "hit": true, "note": null },
    { "pillar": "spiritual", "item": "journal", "hit": false }
  ]
}
```

- `date`: a real `yyyy-mm-dd`, years 2000–2099.
- `picks`: optional. At most 10 strings, each 1–200 characters after trimming.
- `entries`: 1–40 entries.
  - `pillar` is one of `health`, `industry`, `spiritual`.
  - `item` is a lowercase slug `^[a-z][a-z0-9_]{0,39}$` and may not repeat within one body.
  - `target` and `actual` are optional finite numbers with absolute value ≤ 1,000,000.
  - `hit` is optional: `true`, `false` or `null`.
  - `note` is optional: text up to 500 characters, or `null`.
- Unknown keys are ignored.

The data is stored in the table `rm_entries`, one row per `(entry_date, item)`, which is the primary key. The columns are `pillar` (CHECK), `target`, `actual`, `hit`, `note`, `picks` JSONB, `created_at` and `updated_at`.

**Idempotency:** each entry is an upsert, `ON CONFLICT (entry_date, item) DO UPDATE`. That day's picks are then synced to every row for that date, so posting the same body again changes nothing, and a later post corrects the earlier one. Nothing is ever deleted.

## 5. Derived values (computed on read, never stored; `src/lib/renaissance/derive.ts`)

- **Caps (zyn, coffee):**
  - Day 1's cap is the baseline, and Day 1 counts as a hit.
  - After a hit day, the cap drops by 1, down to the floor.
  - A day is a hit when `actual ≤ cap`. With no `actual`, the reported `hit` is used.
  - A past day with no report is a miss, so the cap holds. Today with no report is pending.
  - The after-noon coffee flag doesn't change the cap; it is its own item.
- **Steps:** a hit when `actual ≥ 8000`. If no `actual` is given, the reported `hit` is used.
- **Lift:** only lift days count. A rest day is not a miss.
- **Other items:** the reported `hit`.
- **Day share per pillar:** hits ÷ reported items.
  - The level is `all` (1), `partial`, `none` (0) or `unreported`.
- **Streaks** are counted per pillar and for all pillars together (every pillar's share is 1). Today not yet kept doesn't break a streak.
- **Completion %:**
  - The 7- and 30-day completion is the mean day share.
  - A past unreported day counts as 0. Today is left out while it's unreported.
  - Windows are clipped to the start date.
  - Week-on-week and month-on-month changes are shown in points.
- **The 1% line:**
  - Ideal = 1.01^days.
  - Actual multiplies by 1.01^share for each day, where share is the overall share across all pillars.
- **Other figures:** baseline change (latest count vs baseline, count and %), lifts this week, the 7-day average of steps, and personal bests (the longest streaks and the best step day).

## 6. Page sections (`/renaissance`)

- The page is owner only. Anyone else, signed out, or with the flag off, gets the site's 404. It is `noindex`, and it uses the dark site style. All numbers are computed on the server (`src/lib/renaissance/view.ts`).
- If `rm_entries` is missing, the page reads "Check-ins aren't set up here yet." (no 500).
- Sections:
  - **Header:** lyre, `Day N · <date>`, today's caps, lifts X/3 this week, 7-day average steps, the all-pillars streak, and today's picks.
  - **01 Growth (first):** the 1% line (ideal vs actual), per-pillar 7/30-day % with WoW/MoM, baseline change, and personal bests.
  - **02 Grids:** one grid per pillar, with weeks as columns and Mon–Sun as rows.
    - Each cell is shaded by that day's share; gray means no report.
    - The `title` and aria text give the date, the level, the hits and the picks.
    - Each grid shows its streak.
  - **03 Health:** zyn and coffee vs the cap (a step line, with the floor at 3 and coffee after noon flagged), steps (bars with lines at 8k and 10k), and lifts per week vs 3. All charts have fixed heights, so CLS is 0.
  - **04 Industry / Spiritual strips:** day cells plus a weekly %.
  - **05 Log:** newest first, filtered by pillar (buttons with `aria-pressed`), with the computed hit for each row.
- **Link:** `/account` shows the owner a "Renaissance" link (min 44 px). The site bar stays at five items.
- **Style:** proportional figures (no `tnum`), no gold, controls ≥ 44 px, no external fonts.

## 7. Environment

`RENAISSANCE_INGEST_TOKEN` is a server-only secret: at least 32 random bytes, with a different value on Preview and Production. Set it only through CoS's secure form, never in chat, issues, logs or the repo. Unset, the token path refuses everything, but the owner's session can still post. The page also needs `DASHBOARD_ENABLED=true` and `ORPHEUS_OWNER_EMAIL`, both of which already exist.

## 8. Migration and seed

- **Migration:** `migrations/0014_renaissance.sql` is additive and idempotent (`CREATE TABLE IF NOT EXISTS`), and older code never reads the table. `npm run build` applies it (`db:migrate`). Preview builds therefore apply it to the shared preview database, as every migration does. Production gets it on the next production build.
- **Seed:** `scripts/renaissance-seed.ts <tracker.md>` parses the CoS tracker into one check-in body per day: Daily Log baselines, `PM result` hits and misses, `AM picks`, and Cap Log rows.
  - By default it is a dry run that prints the bodies.
  - `--post <origin>` POSTs them to the endpoint, using the token from the environment (the token is never printed).
  - It never opens a database connection. Because the endpoint upserts, a re-run is a no-op.
  - The owner or EL runs it once, after the migration and the token are in place.
  - The real tracker is not committed (it holds ids, names and paths). The tests use the sanitized `test-fixtures/renaissance/cos-tracker.sample.md`.
