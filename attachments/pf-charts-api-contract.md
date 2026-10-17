# Personal Finance chart report API: contract (#158, spec section 40)

This file is the **single source of truth** for the five endpoints the Charts UI (#160–#162) calls, plus the legacy
`/report`. Added 2026-10-17 for #158. It describes the wire **as built at f08a0c8**; #158 changes no wire behaviour.
Anything that would change it is a Q-call (Q-AE1..Q-AE14, spec 40.6) and is not built until CFO accepts it.

- Typed client and shared types: `src/lib/finance/charts-api.ts`.
- End-to-end test on PGlite through the real handlers: `src/lib/finance/charts-api.server.test.ts`. It also checks
  that every message string and route in this file matches the code.
- Live check (signed out, read-only, calls the prod guard): `qa/tools/pf-charts-contract.mjs`.
- AC pack: PFAPI-01..PFAPI-14 in `qa/CANONICAL-AC-PACK.md`.

## 1. Routes

| # | Route | Methods (Allow) | Spec | Use from the UI |
|---|---|---|---|---|
| R1 | `/api/personal-finance/series` | `POST` | 36 | raw monthly series (optional; `/chart` covers the builder) |
| R2 | `/api/personal-finance/chart` | `POST` | 37, 38.8 | live preview `{ series, range, chart }`; saved view `{ saved: true, id }` |
| R3 | `/api/personal-finance/reports` | `GET, HEAD, POST` | 38 | list (#160); create (#161 Save) |
| R4 | `/api/personal-finance/reports/:id` | `GET, HEAD, PUT, DELETE` | 38 | load (#162); update (Update); delete |
| R5 | `/api/personal-finance/reports/:id/export?format=pdf\|png` | `GET, HEAD` | 39 | Export menu: PDF, PNG |
| L1 | `/api/personal-finance/report` (legacy, #153) | `GET, HEAD, PUT, DELETE` | 33 | **do not use**: the same value as `/reports/default` |

`:id` is `default` (the #153 report) or `r-` + 8 lowercase hex digits.

## 2. Shared behaviour (every route)

**Gate order** (`gateDashboardRequest`), which is the same for all six routes:

1. `DASHBOARD_ENABLED` off → **404** `{ "error": "Not found." }`.
2. Method not in Allow → **405** `{ "error": "Method not allowed." }` with an `Allow` header (the list above). This
   happens **before** the session check, so a signed-out `GET /series` is 405, not 401.
3. No session → **401** `{ "error": "Unauthorized." }`.
4. No database → **503** `{ "error": "Storage not configured." }`.
5. Temporary password still set → **403** `{ "error": "Change your password first." }`.
6. No Personal Finance **read** grant → **403** `{ "error": "Forbidden." }` (audited as `access.denied`). A read grant is
   enough for every method here, writes included: reports are the caller's own.

**Data.** Reports belong to the **caller** (their own `personal_finance` row). Series and values come from the
**owner's** record. Another person's report id is a 404, never a 403.

**Error shape.** Every error is JSON `{ "error": string, "field"?: string }`. There is no code on the wire. The client
derives one (`ChartsApiErrorCode`, section 6) from the status and the message. `field` is a path into the body:
`query`, `body`, `name`, `series`, `series.<i>`, `series.<i>.kind`, `series.<i>.id`, `range`, `range.preset`,
`chart`, `report`, `report.<path>`, `format`.

**Headers on every JSON response:** `Content-Type: application/json`, `Cache-Control: no-store`,
`X-Robots-Tag: noindex, nofollow`. On Vercel builds, every response also carries
`X-Orpheus-Env: production|preview|development` (`vite.config.ts` routes; the build-time `VERCEL_ENV`). It is set by
the platform routing layer, not by the handlers, so local dev and the PGlite tests don't see it.

**HEAD** is served wherever GET is: the same status and headers. The handler builds the JSON body and the platform
drops it. The export sends `null`. The POST-only R1 and R2 answer 405 to GET and HEAD.

**Body parsing (POST / PUT):** the body is read as text. Over the route's limit → **413**. Not JSON → **400**
`Body must be JSON.`. Then the route validator runs. The first problem wins, and nothing is stored on any error.

## 3. Per route

### R1 `POST /series` (spec 36)
- Request `{ series: Series[1..12], range }`, where `Series = { kind: "line"|"account"|"category"|"group"|"metric", id }`
  and `range = { preset: "3m"|"6m"|"12m"|"24m"|"ytd"|"all" } | { from: "YYYY-MM", to: "YYYY-MM" }`. A custom range
  runs from 2020-01 to the current household month, with **no 24-month cap**. Other keys are refused.
- 200 `SeriesResult`: `{ range: {from,to}, months, current, partial, currency, fx_basis: "current", net_assets_from: string|null, series: [{ kind, id, label, deleted, missing, values }] }`.
- Errors: 413 `Query too large.` (> 4096 bytes); 400 `Body must be JSON.`; 400 `Invalid value.` with field `query`,
  `series…` or `range…`.
- Read-only. Not audited.

### R2 `POST /chart` (spec 37, 38.8)
- Request: either `{ series, range, chart: "line"|"bar"|"stacked-bar" }` (range as R1) or `{ saved: true, id? }`. Without
  `id`, it charts the default report.
- 200 `ChartData`: everything in R1 plus `{ chart, mixed_axes, source: "request"|"saved", labels, series[].axis, series[].stack, rows: [{ month, label, partial, values }] }`.
- Errors: 413 `Query too large.` (> 4096); 400 `Body must be JSON.`; 400 `Invalid value.` with field `query`
  (also a **malformed id**), `series…`, `range…` or `chart`; **404 `No saved report.`** when the id is unknown or
  not stored (Q-AE1).
- Read-only. Not audited.

### R3 `/reports` (spec 38)
- `GET` / `HEAD` → 200 `{ reports: ReportItem[], limit: 20 }`. The default comes first (if stored), then named
  reports oldest first. `limit` counts **named** reports only; the default is extra.
- `ReportItem = { id, name, default, report: { series, range, chart }, missing: number[], deleted: number[], labels: string[], created_at: string|null, updated_at: string|null }`.
  The default always has null timestamps (Q-AE3).
- `POST { name, report }` → **201** `ReportItem`, with no `Location` header (Q-AE8). The name is trimmed, 1..60 chars,
  with no control chars and unique in any case; `Default` is reserved. The report uses the #153 validator: 1..12
  series; a preset of `3m|6m|12m|24m|ytd` (**no `all`**) or a custom range of **at most 24 months** (Q-AE4); and a
  chart type.
- Errors: 413 `Report too large.` (body > 4608 bytes, or a canonical report > 4096); 400 `Body must be JSON.`;
  400 `Invalid value.` with field `body`, `name`, `report`, `report.series…`, `report.range…` or `report.chart`; 409
  `Report limit reached.` (20 named); 409 `Name already used.` with field `name`.
- POST audits `pf.report_save`.

### R4 `/reports/:id` (spec 38)
- An id that is malformed or unknown (including another person's) → **404 `Report not found.`**, checked before the body.
- `GET` / `HEAD` → 200 `ReportItem`.
- `PUT { name, report }` replaces both → 200 `ReportItem`. `created_at` is kept and `updated_at` is set to now. For
  `default`, the name is optional; any name other than `Default` (in any case) → 400
  `The default report cannot be renamed.` (field `name`). `PUT /reports/default` creates the default if it is absent.
- `DELETE` → 200 `{ deleted: id }` (Q-AE6). Deleting a `default` that is absent → 404.
- Errors are as R3, plus 409 `Name already used.` on a rename.
- PUT audits `pf.report_save`; DELETE audits `pf.report_delete`.

### R5 `/reports/:id/export?format=pdf|png` (spec 39)
- Checks run in order: a malformed id → 404 `Report not found.`; a missing or unknown `format` → 400 `Invalid value.`
  with field `format`; an unknown or another person's id → 404 `Report not found.`.
- 200: the binary file. Headers: `Content-Type: application/pdf|image/png`, `Content-Length`,
  `Content-Disposition: attachment; filename="orpheus-report-<slug>-<YYYY-MM-DD>.<ext>"`, `Cache-Control: no-store`,
  `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`. The numbers are exactly R2 `{ saved: true, id }`.
- A GET writes one `pf.report_export` row (`format:<f> id:<encoded>`) **before** sending. If that write fails → 503
  `Export unavailable. Try again.` (no-store JSON, no bytes). HEAD writes no row, and a 4xx writes none either.

### L1 `/report` (legacy, spec 33)
- `GET` → `{ report|null, missing, deleted, labels }`. `PUT { report }` → the same shape. `DELETE` →
  `{ report: null, missing: [], deleted: [], labels: [] }`.
- Errors: 413 `Report too large.` (> 4096); 400 `Body must be JSON.`; 400 `Body must be a JSON object.` (no field;
  Q-AE7); 400 `Invalid value.` with a field.
- It reads and writes the same stored value as `/reports/default`. The Charts UI must use R3/R4 instead (Q-AE10).

## 4. Limits

| Limit | Value | Where |
|---|---|---|
| series per query / report | 1..12, no duplicates | R1, R2, R3, R4, L1 |
| custom range | 2020-01..current month (R1, R2); ≤ 24 months, 2000..2100 (saved reports) | Q-AE4 |
| presets | `3m 6m 12m 24m ytd all` (R1, R2); no `all` in saved reports | Q-AE4 |
| named reports | 20 per person, plus the default | R3 |
| name | 1..60 chars trimmed, no control chars, unique in any case, `Default` reserved | R3, R4 |
| body | 4096 B (R1, R2, L1); 4608 B (R3, R4); canonical report ≤ 4096 B | |

## 5. Messages (exact text)

`Not found.` · `Method not allowed.` · `Unauthorized.` · `Forbidden.` · `Change your password first.` ·
`Storage not configured.` · `Body must be JSON.` · `Body must be a JSON object.` · `Invalid value.` ·
`Query too large.` · `Report too large.` · `No saved report.` · `Report not found.` · `Report limit reached.` ·
`Name already used.` · `The default report cannot be renamed.` · `Export unavailable. Try again.`

## 6. Client error codes (`ChartsApiErrorCode`, derived client-side, not on the wire)

| Code | Status | Message |
|---|---|---|
| `disabled` | 404 | `Not found.` |
| `method_not_allowed` | 405 | `Method not allowed.` |
| `unauthorized` | 401 | `Unauthorized.` |
| `forbidden` | 403 | `Forbidden.` |
| `must_change_password` | 403 | `Change your password first.` |
| `storage_unavailable` | 503 | `Storage not configured.` |
| `export_unavailable` | 503 | `Export unavailable. Try again.` |
| `bad_json` | 400 | `Body must be JSON.` / `Body must be a JSON object.` |
| `invalid` | 400 | `Invalid value.` (see `field`) |
| `default_name_fixed` | 400 | `The default report cannot be renamed.` |
| `too_large` | 413 | `Query too large.` / `Report too large.` |
| `not_found` | 404 | `Report not found.` / `No saved report.` (Q-AE1: the same meaning) |
| `name_taken` | 409 | `Name already used.` |
| `limit` | 409 | `Report limit reached.` |
| `network` | 0 | the fetch threw, or the reply was not JSON |
| `unknown` | any | anything else |

## 7. Audit: Q-calls with recommendations (not built; CFO first)

The five routes plus L1 were compared on error shape, field names, status codes, 404 vs 400 for bad ids,
Cache-Control, 405s, HEAD and limits. Every row below is a **wire** difference, or a missing route, so none is
built. The client (section 6) already hides Q-AE1, Q-AE2, Q-AE7 and Q-AE11 from the UI.

| Q | Finding | Recommendation |
|---|---|---|
| Q-AE1 | `/chart { saved: true, id }` with an unknown id → 404 `No saved report.`; R4 and R5 → 404 `Report not found.` | **Keep the wire** (spec 38.8 pins it; QA tools match on it). The client maps both to `not_found`. Optional later: make `/chart` say `Report not found.` |
| Q-AE2 | A malformed id → 400 `Invalid value.` `query` on `/chart`; 404 on R4 and R5 | **Keep.** On `/chart`, the id is part of a validated query body; on R4 and R5, it is a path segment. The UI only sends ids it got from R3. |
| Q-AE3 | The default report has `created_at` / `updated_at` = null; #160 lists "last updated" | **Accept as is**: the UI shows no date for Default. Storing a timestamp beside the legacy key would change the stored value (a data-model change); the row's `updated_at` is wrong because every record save bumps it. |
| Q-AE4 | Saved reports: custom range ≤ 24 months and no `all` preset; `/series` and `/chart` allow `all` and back to 2020-01. #161 wants "as far back as data exists", and a preview the UI can't save. | **Decide before #161.** Recommended: allow the `all` preset in saved reports (one shared validator change, with tests; a stored value stays valid). Keep the 24-month cap for custom ranges or lift it to "2020-01..current". This links to Q-AC12. Until then, #161 offers only savable ranges. |
| Q-AE5 | No Email export route; #161's Export menu lists Email | **Separate ticket.** Sending email needs a provider, a secret and an audit decision. The UI hides Email, or downloads and lets the user attach the file. No route now. |
| Q-AE6 | DELETE: L1 → `{ report: null, missing: [], deleted: [], labels: [] }`; R4 → `{ deleted: id }` | **Keep** (L1 is legacy). The UI uses R4. |
| Q-AE7 | Body not an object: L1 `Body must be a JSON object.` (no field); R3 / R4 `Invalid value.` `body`; R1 / R2 `Invalid value.` `query` | **Keep.** The client maps all three to `bad_json` / `invalid`. |
| Q-AE8 | `POST /reports` 201 has no `Location` | **Keep.** The body carries `id`. |
| Q-AE9 | HEAD on the JSON routes: the handler builds the body and the platform drops it; R5 sends `null` | **Keep.** It is correct on the wire; the cost is negligible. |
| Q-AE10 | L1 `/report` duplicates `/reports/default` | **Keep it, documented as legacy.** No UI uses it. Remove it only in a later ticket, with a QA-tool sweep. |
| Q-AE11 | 413: `Query too large.` at 4096 B (R1, R2); `Report too large.` at 4608 B body / 4096 B report (R3, R4); 4096 B (L1) | **Keep.** The limits match what each body carries. The client maps both to `too_large`. |
| Q-AE12 | 405 comes before 401 (gate order), so a signed-out wrong method sees 405 | **Keep.** It is the house pattern for every dashboard API (spec section 3). |
| Q-AE13 | `X-Orpheus-Env` comes from the Vercel routing layer only, so it is missing in local dev and tests | **Keep.** Documented. The live QA tool checks it on previews. |
| Q-AE14 | `limit: 20` counts named reports only; the list can hold 21 with the default | **Keep.** Documented. The UI disables "New report" when `reports.filter(r => !r.default).length >= limit`. |

**Built here (non-behavioural):** the shared `ReportItem` type (a type-only change in `account.server.ts`) and a fix to
the export handler's stale docblock ("not audited (Q-AD11)"; it has audited since PFX-17).

## 8. Machine-checked tables (added 2026-10-17, #158 QA round 1 F2)

**Note (2026-10-17):** QA round 1 F2 found that the PFAPI-09 drift test checked only 8 of the 17 messages against server
code, and checked none of the numeric caps in the prose. From this date, `charts-api.server.test.ts` parses the two
tables below and **drives the real handlers** for every row and every route listed. The status and the `error` text
on the wire must equal the row. It also ties every byte cap and count written anywhere in sections 3, 4 and 8 to the
server constants, with a boundary request on each side (cap → not 413, cap + 1 → 413). Sections 1–7 stay as written;
where they and this section disagree, this section and the test win.

### 8.1 Messages × routes (every message in section 5, exact text)

| Message | Status | Routes |
|---|---|---|
| `Not found.` | 404 | R1 R2 R3 R4 R5 L1 |
| `Method not allowed.` | 405 | R1 R2 R3 R4 R5 L1 |
| `Unauthorized.` | 401 | R1 R2 R3 R4 R5 L1 |
| `Forbidden.` | 403 | R1 R2 R3 R4 R5 L1 |
| `Change your password first.` | 403 | R1 R2 R3 R4 R5 L1 |
| `Storage not configured.` | 503 | R1 R2 R3 R4 R5 L1 |
| `Body must be JSON.` | 400 | R1 R2 R3 R4 L1 |
| `Body must be a JSON object.` | 400 | L1 |
| `Invalid value.` | 400 | R1 R2 R3 R4 R5 L1 |
| `Query too large.` | 413 | R1 R2 |
| `Report too large.` | 413 | R3 R4 L1 |
| `No saved report.` | 404 | R2 |
| `Report not found.` | 404 | R4 R5 |
| `Report limit reached.` | 409 | R3 |
| `Name already used.` | 409 | R3 R4 |
| `The default report cannot be renamed.` | 400 | R4 |
| `Export unavailable. Try again.` | 503 | R5 |

### 8.2 Caps (byte limits and counts; each value is checked against its server constant and at its boundary)

| Cap | Value | Routes | Server constant |
|---|---|---|---|
| body-bytes | 4096 | R1 | `SERIES_MAX_BYTES` |
| body-bytes | 4096 | R2 | `CHART_MAX_BYTES` |
| body-bytes | 4608 | R3 R4 | `REPORTS_BODY_MAX` |
| body-bytes | 4096 | L1 | `REPORT_MAX_BYTES` |
| series-max | 12 | R1 R2 R3 | `SERIES_MAX` |
| saved-custom-range-months | 24 | R3 | `RANGE_MONTHS_MAX` |
| query-custom-range-months | none | R1 R2 | (no cap: 2020-01..current month) |
| named-reports | 20 | R3 | `REPORTS_MAX` |
| name-chars | 60 | R3 | `NAME_MAX` |
