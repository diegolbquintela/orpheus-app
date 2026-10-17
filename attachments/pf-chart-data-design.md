# Personal Finance multi-series chart data (#155, PF charts 3/6)

Backend only, no UI. Business user: CFO. Spec section 37; AC PFC-01..PFC-16. Built on the #154 series API (spec 36),
unchanged: `fx_basis: "current"` on every response, and `net_assets_from` / anchor semantics including the 36.11 caveat.

## Request

`POST /api/personal-finance/chart`, JSON body (at most 4 KB), one of:

```json
{ "series": [{ "kind": "category", "id": "Home" }, { "kind": "group", "id": "all" }], "range": { "preset": "12m" }, "chart": "stacked-bar" }
```

```json
{ "saved": true }
```

`series` and `range` are exactly the #154 series query (same validator, same limits: 1..12 series, presets incl. `all`,
custom back to 2020-01 up to the current month). `chart` is a #153 chart type (`line`, `bar`, `stacked-bar`).
`{ "saved": true }` charts the signed-in person's own saved report (#153) as saved.

## Response

Everything the #154 series response has (`range`, `months`, `current`, `partial`, `currency`, `fx_basis`,
`net_assets_from`, `series[]` with `kind`, `id`, `label`, `deleted`, `missing`, `values`), plus:

```json
{
  "chart": "stacked-bar",
  "source": "request",
  "labels": ["Nov 25", "…", "Oct 26"],
  "series": [{ "kind": "category", "id": "Home", "…": "…", "axis": "flow", "stack": true }],
  "rows": [{ "month": "2025-11", "label": "Nov 25", "partial": false, "values": [1000, 1200] }]
}
```

`rows[i].values[j]` = `series[j].values[i]` (the same numbers, by month). Values are identical to `/series` for the
same series and range. Errors: 400 `{ "error": "Invalid value.", "field" }` (fields as #154 plus `chart`, `query`),
413 above 4 KB, 404 `{ "error": "No saved report." }` for `{ saved: true }` with none, and the gate's 404 / 401 / 403 /
405 / 503.

## Access

The report / series gate: signed in, Personal Finance read grant; the data is the owner's record. `{ saved: true }`
uses the caller's own saved report (a CFO's report is the CFO's). Read-only, not audited. No migration, no schema change.

## Q-calls (recommendations built in unless marked NOT BUILT)

- **Q-AB1 One new endpoint.** `POST /api/personal-finance/chart`; `/series` (#154) is unchanged. Recommended: a chart
  needs the chart type and plotting hints that a plain series list does not.
- **Q-AB2 Axis hint.** Each series has `axis`: `level` for `net-assets` (a balance at month end), `flow` for everything
  else (amounts in the month). A frontend can put levels on a second axis. No scaling is done here.
- **Q-AB3 Stacking.** In a `stacked-bar`, `stack: true` only for parts of a whole: `line`, `account`, `category`,
  `fixed`, `variable`. `all` and every metric stay `stack: false` (stacking them would count money twice). `line` and
  `bar` stack nothing. Mixed requests are allowed, not refused.
- **Q-AB4 Shape.** Both forms: columns (`series[].values`, as #154) and rows (`rows[]`, one per month with its `label`
  and `partial`), plus `labels`. Labels are short `Mon YY` (`Oct 26`, en-US, the Overview's `monthShort`). The size is
  small (at most 12 × 82 numbers twice).
- **Q-AB5 Saved report.** `{ saved: true }` charts the caller's own saved report: its series, range (the report's own
  rules, 24-month custom cap) and chart type; `source: "saved"`. None saved → 404 `No saved report.`.
- **Q-AB6 Limits.** As #154: 1..12 series, 4 KB body; one shared month axis.
- **Q-AB7 (QA #169 nit c) Report ranges before 2020-01. NOT BUILT, Diego's call.** `/api/personal-finance/report`
  accepts a custom range in 2000–2100 (at most 24 months), so a saved report can name months before 2020-01 or in the
  future; the series / chart APIs refuse those in a request. A saved report charted with `{ saved: true }` returns
  null for such months (no data can exist there). Recommendation: a separate ticket makes the report PUT refuse
  `from` before 2020-01 and `to` after the current month (matching `/series`), while a report already stored with such
  a range keeps reading back (not silently dropped). Not built here because it changes the report API's behaviour.
- **Q-AB8 Out of scope, NOT BUILT.** Second-axis scaling, derived series (shares, differences, running totals other than
  net assets), per-series ranges, currency choice, downsampling, and any UI. Separate tickets if wanted.
