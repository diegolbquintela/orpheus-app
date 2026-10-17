# Personal Finance report CRUD (#156, PF charts 4/6)

Backend only, no UI. Business user: CFO. Spec section 38; AC PFRC-01..PFRC-18. Builds on #153 (the single saved
report), #154 (series) and #155 (chart, `{ saved: true }`). No schema change, no migration.

## Storage (Q-AC1)

Each person's reports live in **their own** `personal_finance` row (as #153), beside the record:

- `orpheus.finance.report.v1` (unchanged, #153): the **default report**, `id: "default"`, name `Default`. The legacy
  `GET / PUT / DELETE /api/personal-finance/report` and `/chart { saved: true }` keep reading and writing exactly this.
- `orpheus.finance.reports.v1` (new): a JSON text array of **named reports**
  `[{ id, name, report, created_at, updated_at }]`.

Nothing already stored moves, changes or is lost: an existing single report simply shows up as the default report.
The record API never shows either key and a record save keeps both (`readRecord` / `writeRecord`).

## Routes (Q-AC2)

| Method | Path | Body | Reply |
|---|---|---|---|
| GET | `/api/personal-finance/reports` | | `{ reports: [item…], limit: 20 }` |
| POST | `/api/personal-finance/reports` | `{ name, report }` | 201 item |
| GET | `/api/personal-finance/reports/:id` | | item |
| PUT | `/api/personal-finance/reports/:id` | `{ name, report }` (default: `{ report }`) | item |
| DELETE | `/api/personal-finance/reports/:id` | | `{ deleted: id }` |

Item: `{ id, name, default, report, missing, deleted, labels, created_at, updated_at }` (`missing` / `deleted` /
`labels` as #153 / #165, against the owner's record; the default report has null timestamps: none were ever stored).

Errors: 400 `{ error: "Invalid value.", field }` (`name`, `report`, `report.<path>`, `body`); 409
`{ error: "Name already used.", field: "name" }`; 409 `{ error: "Report limit reached." }`; 404
`{ error: "Report not found." }`; 400 `{ error: "The default report cannot be renamed.", field: "name" }`; 413 above
4.5 KB; plus the gate's 404 / 401 / 403 / 405 / 503.

`/api/personal-finance/chart` also takes `{ saved: true, id }` (Q-AC10); `{ saved: true }` alone is unchanged.

## Q-calls (recommendations; BUILT unless marked NOT BUILT)

- **Q-AC1 Model (BUILT).** Many reports per person, backward compatible: the legacy single report IS the default
  report (same stored value); named reports are a new key beside it. Recommended over moving the legacy report into a
  list (a migration in disguise, and the legacy API would need translating).
- **Q-AC2 Routes and ids (BUILT).** `/reports` and `/reports/:id`. Ids are server-made `r-` + 8 hex characters;
  `default` is reserved for the default report. Anything else is 404.
- **Q-AC3 Names (BUILT).** Required for named reports; trimmed; 1..60 characters; no control characters; unique per
  person in any case; `Default` is reserved (409).
- **Q-AC4 Limit (BUILT).** At most **20 named reports** per person plus the default (each report ≤ 4 KB as #153, so a
  person's reports stay under about 100 KB in their row). The 21st create is 409 `Report limit reached.`.
- **Q-AC5 Legacy and default (BUILT).** Legacy `GET / PUT / DELETE /report`, `PUT /reports/default` and `/chart
  { saved: true }` all use the default report. The default keeps the fixed name `Default` (PUT may omit the name or send
  `Default`; another name is refused).
- **Q-AC6 Deleting the default (BUILT).** Allowed; it is the legacy DELETE. Named reports stay; none is promoted.
  `{ saved: true }` then answers 404 `No saved report.` as before.
- **Q-AC7 Order (BUILT).** The default first, then named reports oldest first (creation order; stable).
- **Q-AC8 Access (BUILT).** As series / report / chart: signed in with a Personal Finance read grant (a preference,
  like #153; a Read-only CFO can keep reports). Reports are the caller's own; another person's id is 404. 403 for no
  Personal Finance grant. Series resolve against the owner's record.
- **Q-AC9 Update (BUILT).** PUT replaces name and report together (no partial PATCH). `created_at` stays, `updated_at`
  moves.
- **Q-AC10 Chart by id (BUILT).** `/chart { saved: true, id }` charts that report (`default` or a named id); unknown or
  another person's id → 404 `No saved report.`; a malformed id → 400 `query`.
- **Q-AC11 Audit (BUILT).** Create / update audit `pf.report_save`, delete `pf.report_delete` (the #153 actions; no new
  audit action). Reads are not audited.
- **Q-AC12 Validation (NOT BUILT: #173).** Report bodies use the shared #153 validator unchanged (`checkReport`, i.e.
  `seriesListError` / `rangeError` in `report.ts`), so custom ranges in 2000–2100 (≤ 24 months) are still accepted, as
  the legacy PUT. The #173 refusal (before 2020-01 / after the current month) is a separate LOW ticket; when it lands it
  applies here automatically through the shared validator. Recommendation: keep one validator for both.
- **Q-AC13 Concurrency (NOT BUILT).** Named reports are one JSON value: two writes at the same moment are last-write-
  wins (one could be lost). Acceptable for one person's own reports; an `If-Match` / version check can come later.
- **Q-AC14 Out of scope (NOT BUILT, Diego's call).** Making a named report the default, copy / duplicate, sharing
  reports between people, renaming the default, sort options, paging, and any UI.

## Compatibility risk

Rolling back past this change after someone has a named report is **unsafe**: the older `readRecord` does not strip
`orpheus.finance.reports.v1`, so the record would read as invalid (`{}`), and an older record save would drop the key.
Rollback is only safe while no named report exists, or after removing that key.
