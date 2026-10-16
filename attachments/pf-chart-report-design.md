# Personal Finance: saved chart report, data model (#153, PF charts 1/6)

Backend only, no UI. Spec: `attachments/personal-finance-spec.md` section 33. AC: `qa/CANONICAL-AC-PACK.md` PFR-01..PFR-16.

## What is stored
One report definition per person, as JSON text under the name `orpheus.finance.report.v1`, in that person's own
`personal_finance` row (the existing account-linked storage, migration 0010):

```json
{ "series": [{ "kind": "line", "id": "q1" }, { "kind": "metric", "id": "net-assets" }],
  "range": { "preset": "12m" },
  "chart": "line" }
```

`range` is either `{ "preset": "3m" | "6m" | "12m" | "24m" | "ytd" }` or `{ "from": "YYYY-MM", "to": "YYYY-MM" }`.

## API
`/api/personal-finance/report`, behind the same gate as `/api/personal-finance`: 404 flag off, 405 another method, 401
signed out, 403 temporary password or no Personal Finance read grant, 503 without a database.
- `GET` → `{ "report": <object> | null, "missing": [<series index>...] }`.
- `PUT { "report": <object> }` → the stored report (canonical: keys in a fixed order). 400 `{ "error": "Invalid value.", "field": "<path>" }` for a bad value; 400 when the body isn't JSON; 413 above 4 KB.
- `DELETE` → `{ "report": null, "missing": [] }`.
Audit actions: `pf.report_save`, `pf.report_delete`.

The one validator, `reportError` / `checkReport` in `src/lib/finance/report.ts`, is shared by the client and the API, like `field-errors.ts`.

## CFO calls (Q-X1..Q-X8), built as recommended
- **Q-X1 Series kinds:** five kinds are allowed.
  - `line`: an expense line by its id (`^[A-Za-z0-9_-]{1,64}$`).
  - `account`: an account name, up to 40 characters.
  - `category`: a category name, up to 40 characters.
  - `group`: `fixed`, `variable` or `all`.
  - `metric`: `income`, `expenses`, `surplus` or `net-assets` (the Overview figures).
  - Lines are referenced by id, not by name, so a rename keeps the series.
- **Q-X2 Date range:** a preset (`3m`, `6m`, `12m`, `24m`, `ytd`, relative to the current month at render), or a custom `from`/`to` in whole months (`YYYY-MM`). Custom ranges need `from` ≤ `to`, at most 24 months (the stored months, `MONTHS_STORED`), and years 2000–2100. No day-level dates: the data is monthly.
- **Q-X3 Chart types:** `line`, `bar`, `stacked-bar`. There is no pie chart, because every series is over time.
- **Q-X4 A series that no longer exists:** the report keeps it as saved and is never silently changed. `GET` lists the indexes of `line` / `account` / `category` series that no longer exist anywhere in the Personal Finance record (shared lines or any stored month) in `missing`. The chart (a later ticket) leaves them out with a note. `PUT` does not check ids against the data, so a report can name a line that comes back later.
- **Q-X5 Size limits:** 1 to 12 series, with no duplicate kind + id. Unknown keys are refused. At most 4 KB of JSON text, otherwise 413.
- **Q-X6 Whose report:** each signed-in person's own report ("one report per user"), kept in their own `personal_finance` row.
  - A Personal Finance read grant is enough to read and save it, as with the section toggles (Q-D11): it is a preference, not the owner's data.
  - `missing` is checked against the owner's record, which is the data the person sees.
- **Q-X7 One report:** `PUT` replaces the whole report, and `DELETE` removes it.
  - The record `PUT` (`/api/personal-finance`) never touches the report. It is kept on every record save, and the record `GET` doesn't show it.
  - The owner's record `DELETE` (wipe everything, Q-D13) removes the owner's report too.
- **Q-X8 No schema change:** no migration. `npm run build` runs `db:migrate` against the preview database, so a new migration would run on a real database at deploy. The existing table already holds one JSONB row per user.
