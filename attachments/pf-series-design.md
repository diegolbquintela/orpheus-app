# Personal Finance historical series endpoint (#154, PF charts 2/6)

Backend only, no UI. Business user: CFO. Spec section 36; AC PFS-01..PFS-16. Builds on #153 (saved chart report,
`report.ts`) and #165 (deleted names keep their history).

## Request

`POST /api/personal-finance/series`, JSON body (at most 4 KB):

```json
{
  "series": [{ "kind": "category", "id": "Travel" }, { "kind": "metric", "id": "expenses" }],
  "range": { "preset": "all" }
}
```

`series` is the #153 list exactly (1..12 items, kinds `line` / `account` / `category` / `group` / `metric`, the same
ids, no duplicates), checked by the same code (`seriesListError` in `report.ts`). `range` is the #153 shape
(`{ preset }` or `{ from, to }`, checked by `rangeError` in `report.ts`) with this endpoint's own limits (Q-AA1, Q-AA7).

## Response

```json
{
  "range": { "from": "2020-01", "to": "2026-10" },
  "months": ["2020-01", "…", "2026-10"],
  "current": "2026-10",
  "partial": true,
  "currency": "CAD",
  "series": [
    { "kind": "category", "id": "Travel", "label": "Travel (deleted)", "deleted": true, "missing": false, "values": [100, null, "…"] }
  ]
}
```

`values[i]` belongs to `months[i]`. Errors: 400 `{ "error": "Invalid value.", "field" }`, 413 above 4 KB, plus the
dashboard gate's 404 (flag off) / 401 / 403 / 405 / 503.

## Access

The same gate as `/api/personal-finance/report`: signed in, Personal Finance **read** grant (owner or a CFO with Read).
The data is always the **owner's** record (#90). Read-only: nothing is stored and nothing is audited (the report GET is
not audited either). No migration.

## CFO calls (Q-AA, recommendations built in)

- **Q-AA1 Max range.** A custom range may go back to **2020-01** (`FIRST_MONTH`, the first month the page can open,
  #163) and forward to the **current household month**. There is no 24-month cap here (the issue asks for "as far back as
  data exists"); the saved report (#153) keeps its 24-month cap unchanged. Future months are refused (`range`).
  Recommended over keeping 24 months, which would cut the history the endpoint exists for.
- **Q-AA2 Months with no data.** `null`, never 0. A month "has data" when it is stored with lines (or, for the
  `income` / `expenses` metrics, has old typed Overview totals). In a month with data, a line / account / category /
  group with nothing in it is **0** (it spent nothing). So a chart can show gaps for no data and a real zero for none spent.
- **Q-AA3 Currency and FX.** Every value is a monthly figure in the **household currency**, converted with the
  record's current FX rates (each line's own rate, else the `Rate used`), the same as every other PF total. There is no
  historical FX: a past month is not re-valued at that month's rate (the record does not store one). `currency` names it.
- **Q-AA4 What each metric means per month.** `expenses` and `income` are exactly the Overview's month figures (lines
  first, else typed totals; 0 or less reads as null). `surplus` = income − expenses (null if either is null).
  `net-assets` = `Starting net assets` (empty = 0) plus each month's surplus so far within the range; null until the
  first month with a surplus; a month without one leaves it unchanged. No averages are filled in (unlike the Overview
  projection): history shows only what happened. Groups: `fixed` / `variable` / `all` = that group's monthly total
  (`all` = the month's grand total, so it equals `expenses` when above 0). `line` = that line id's monthly amount;
  `account` / `category` = the total of that month's lines with that name.
- **Q-AA5 Deleted names (#165).** A deleted category / account returns its past months under `<name> (deleted)` with
  `deleted: true`; later months (where it was removed) read 0 or null. Totals are unchanged: categories still add up to
  `all`. A name no stored line holds is `missing: true` with all-null values (as the report's `missing`).
- **Q-AA6 The current partial month.** Included when in range and flagged with `partial: true` (and `current`); its
  value is what is saved so far. Presets end at the current household month (America/Toronto, as the Overview).
- **Q-AA7 Presets.** The #153 presets (`3m`, `6m`, `12m`, `24m`, `ytd`, each ending at the current month) plus
  **`all`**: from the first month with any data (not before 2020-01) to now; no data at all → just the current month.
  `all` is this endpoint only; the saved report still refuses it.
- **Q-AA8 Batch vs single.** Batch: 1..12 series in one call (the report's `SERIES_MAX`), all over one shared `months`
  axis. A single series is a list of one. One call gives a whole chart.
- **Q-AA9 Size limits.** Body at most 4 KB; at most 12 series × the months from 2020-01 to now (82 in October 2026, about
  1,000 numbers). No paging is needed at that size.
