# PF report export stubs: PDF + PNG (#157, backend only)

Spec section 39; AC PFX-01..PFX-16; tests `src/lib/finance/export.server.test.ts` (PGlite, real path); QA tool
`qa/tools/pf-export-api.mjs`; prod guard `qa/tools/prod-guard.mjs` + `scripts/qa-prod-guard.test.mjs`.

## What it is

`GET /api/personal-finance/reports/:id/export?format=pdf|png` (also `HEAD`). `:id` is `default` or a named report id
(#156). Same gate as the reports API: flag off 404, signed out 401, no Personal Finance grant 403, another user's or
an unknown id 404 `Report not found.`, missing / unknown `format` 400 `{ error: "Invalid value.", field: "format" }`.
Answered synchronously with the file (`Content-Disposition: attachment`, `Cache-Control: no-store`, `nosniff`).

Values: the handler calls the same `chartData(fromReport(report), readRecord(owner), now, "saved")` that `/chart
{ saved: true, id }` calls, so the numbers cannot drift. Each file embeds that JSON exactly (PDF Info `/OrpheusData`
as hex; PNG `tEXt` `orpheus-data`), and the tests deep-equal it to the `/chart` response.

Printed on every export: report name, chart type, range, currency; `As of: <current month> (current month included,
partial | not in range) - Generated: <ISO time, UTC>`; `FX basis: current (...)`; with net assets `Net assets from:
<month>` and the spec 36.11 caveat verbatim; with mixed axes the mixed-axes line. The PDF adds a legend and a table
(months x series, `formatMoney`, `-` for no value, `*` on the partial month), paginated. The PNG is a stub chart.

Generation is hand-written in `src/lib/finance/export.ts` (PDF 1.4 with the built-in Helvetica; PNG via
`node:zlib`); **no new dependency**, no headless browser, no secret, no paid service, no `vercel.json` / function
size or duration change.

## Q-calls (built / not built)

- **Q-AD1 route shape** (built): nested under the report, `GET /reports/:id/export`. Rec: keep. Read-only, so GET.
- **Q-AD2 format param** (built): `?format=pdf|png`, required, lower case; no `Accept` negotiation. Rec: keep.
- **Q-AD3 sync vs async** (built: sync). 12 series x 24 months: PDF ~20-40 KB, PNG ~50-100 KB, well under 1 s in the
  tests (PFX-14 bounds). Async (job id + polling) needs storage and a queue or cron, i.e. new infra: **not built**;
  rec: only if exports grow (more pages, images) or move to email.
- **Q-AD4 content and layout** (built, stub): PDF header + legend + table; PNG header + line plot (every chart type
  is drawn as lines; flow on the left scale, level on the right when mixed). Bars / stacks / donut in the PNG: **not
  built**, rec: a later UI ticket decides the look.
- **Q-AD5 characters** (built): ASCII only (the standard PDF fonts and the PNG's built-in 5x7 font); other characters
  print as `?`. Embedded fonts for full Unicode: **not built** (a font file is a heavy asset); rec: if names need it.
- **Q-AD6 size limits** (built): bounded by the existing caps (20 reports, the series and range limits of #155/#156);
  no extra limit. Rec: keep; PFX-14 checks the worst case stays small.
- **Q-AD7 filename** (built): `orpheus-report-<name slug>-<YYYY-MM-DD>.<pdf|png>` (date = generation day, Toronto).
- **Q-AD8 cache headers** (built): `no-store` (private money data; generated per request). Rec: keep.
- **Q-AD9 dependencies** (built: none). Rec: keep zero; a PDF library is only worth it with real layout needs.
- **Q-AD10 caveat** (built): the 36.11 text verbatim whenever net assets is in the report, plus `Net assets from`.
- **Q-AD11 audit** (built: no audit row, like the other reads). Rec: Diego's call if exports should be logged as
  "data left the app"; not built.
- **Q-AD12 environment header** (built): every response carries `X-Orpheus-Env` (Vercel's `VERCEL_ENV` at build
  time, `local` off Vercel) so QA tools can tell a production deployment from a preview without secrets. Rec: keep.
- **Q-AD13 email / UI / scheduled exports**: out of scope, **not built**.

## Prod guard (QA's #174 note 1)

`pf-report-api`, `pf-reports-api` and `pf-export-api` call `refuseIfProd(base)` before any request or sign-in:
1. static: the prod alias `https://orpheus-app-beta.vercel.app` and the production-branch aliases refuse with no
   request; `localhost` passes;
2. otherwise one `HEAD /` (no cookies, redirects not followed) reads `X-Orpheus-Env`: `production` refuses, a
   missing header refuses (cannot confirm a preview: a deployment from before #157 or not Orpheus), `preview` passes.
A production deployment's own unique URL looks like a preview by name; step 2 catches it. Exit code 2, `REFUSED ...`.
