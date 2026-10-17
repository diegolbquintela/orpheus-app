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

## CFO decisions (2026-10-17)

- Accepted AD1..AD10 and AD12 as built.
- **AD11: built, as PFX-17.**
  - `pf.report_export` is written on a successful GET only, with detail `format:<fmt> id:<encoded id>`. The encoding (digits as A-J, `-` as `_`) is needed because the 0012 detail CHECK forbids digits and `-`.
  - No schema change.
  - HEAD is not audited (no file leaves); 4xx are not audited.
  - It is best effort, as for `pf.report_save`.
  - `qa/tools/audit.mjs` AUDIT-04 accepts the new detail.
  - `pf-export-api` checks the rows only when signed in as the owner (the audit API is owner-only); otherwise it skips the check with an INFO line.
- **Q-AD14 (new, not built):** store the report id literally. That needs a migration that widens the detail CHECK. Rec: keep the encoding unless the Activity screen should show ids.
- **AD4: built, as PFX-18.** `Rendered as lines` (`LINES_NOTE`, `pf-helpers` `EXPORT_LINES_NOTE`) appears as header line 3 for bar and stacked-bar reports. In the PNG it is drawn and also in `tEXt orpheus-note`; the PDF gets the same line for free.
- AD5: ASCII stays; Unicode fonts go to Diego as a follow-up.
- AD7 correction: the filename date is now the Toronto day; the first build used the UTC day.

## CFO decisions, second round (2026-10-17)

- **Q-AD14: keep the encoding.** It is pinned by the round-trip test in `export.server.test.ts`: per-character bijection, each hex character at each position, boundary ids, and 10k seeded random ids, all fitting the detail CHECK.
- **Fail closed (PFX-19).** This replaces the best-effort behaviour noted above for exports only, and differs from `pf.report_save`, which logs and continues.
  - `tryAuditFor` (in `audit.server.ts`) does the same insert and logs the same line, but returns whether the row was written.
  - The handler builds the file, writes the row, and sends the file only if the row was written. Otherwise it answers 503 `EXPORT_UNAVAILABLE` (`pf-helpers`), `no-store`.
  - HEAD writes nothing, so it keeps answering 200 with `Content-Length` while the audit is down.
- **Correction:** at ba8e4dd the PFX-17 "failed insert still answers 200" test stubbed the wrong dependency key (`db` instead of `getDb`), so it never simulated a failure. The PFX-19 test injects the failure through `getDb`. A mutation check (log-and-continue put back) makes it fail.

## QA corrections (2026-10-17, QA run `qa/run-2026-10-17-pr175.md`)

- **F2 (EL):** the prod guard is extended to all 19 sign-in QA tools (spec 39.10 lists them). It was mechanical: one import plus one line after `qaConfig` in each, plus the `--compare-url` check in site-shell. The tests enumerate the tools.
- **EL rulings:** (a) one HEAD before refusing a prod deployment URL is OK; (b) render, then audit, then send is OK; (c) AUDIT-04 is not run for this ticket.
- **F1:** PFX-04 is reserved and unused. README now has an entry for the export endpoint, and the AC pack has PFX-01..PFX-19.
- **F3:** the PNG font now has every printable ASCII glyph (exact case), so the 36.11 caveat prints verbatim. Each glyph is pinned by a pixel test.
- F5 / F6: EL ruled as above, so no change. F4 (deep-equal, not byte-equal, for non-ASCII) is unchanged.

## Signed-out prod mode (2026-10-17, QA F7, EL option 1)

- **F7, EL option 1 (2026-10-17): signed-out prod mode.**
  - The production guard (same detection: the static prod hosts, otherwise one `HEAD /`) refuses a production or unconfirmed target **only** when a sign-in or write env var is set: any non-empty sign-in variable the tools read (`QA_*_EMAIL` / `QA_*_PASSWORD` and `ORPHEUS_OWNER_EMAIL`), or `QA_WRITE`. Unrelated `*_PASSWORD` variables don't count. It then exits 2 with `REFUSED …`; a static prod host gets no request at all.
  - With none set, the tool runs signed out against production. It prints exactly `signed-out prod mode (prod: signed-out only)`, and never signs in or writes:
    - tools skip their signed-out write probes on the guard's returned mode, and send GET only;
    - `session.mjs` skips sign-in;
    - as a safety net, `fetch` and every browser context refuse non-GET / HEAD and `/api/auth/` requests.
  - 39.7 now reads: QA tools that sign in refuse production when credentials or `QA_WRITE` are set, and run signed out otherwise.
  - Tests: `scripts/qa-prod-guard.test.mjs` runs every sign-in tool against a faked network with zero real traffic, and asserts no sign-in or write requests.
- This push is tooling only: `src/` is unchanged since 1219d4d. The PNG descenders nit was skipped (EL).
