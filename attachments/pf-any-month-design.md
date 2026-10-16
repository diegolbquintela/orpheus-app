# Personal Finance: the month control allows any past month (#163)

Business user: the CFO. Spec: `attachments/personal-finance-spec.md` section 34. AC: `qa/CANONICAL-AC-PACK.md` PFM-01..PFM-14.
No change to the currency model, Equity Coverage, the averages' windows, the chart, sign-in or the Dashboard.

## Change
- The `Month` select of the last 12 months (#112) becomes two selects under the title:
  - `Month`: `Jan`..`Dec`.
  - `Year`: 2020 to the current year, newest first.
- `Save` stays in the same row at the top, with the same slot, button and `Unsaved changes` indicator.
- Any past month back to January 2020 can be opened and edited. An empty past month opens as a copy of the current month's saved lines, as today (decisions 3–5 of `attachments/pf-month-control-design.md`), with the same note.

## Storage (the Q the ticket asked to flag)
**Q-Y5:** months were limited by `MONTHS_STORED = 24`. `readMonths` / `writeMonths` kept only the 24 newest months, so saving a month older than the 24 newest would have dropped it silently, at once.
- **Smallest safe change (built):** keep every month from `2020-01` (`FIRST_MONTH`), with no count limit. `readMonths` / `writeMonths` drop only keys before `2020-01`.
- **No migration:** the months live in one JSON text value of the existing `personal_finance` row, and `npm run build` runs `db:migrate` on the preview database.
- **The 1 MB record limit (`RECORD_MAX_BYTES`, 413) is unchanged:**
  - A typical household (20 lines and 3 people a month) is about 4.5 KB a month, so 2020-01..2026-12 (84 months) is about 376 KB. 1 MB holds about 230 such months.
  - A save over 1 MB is refused (413) and the page shows `Not saved.`, as today.
  - Recommendation: keep 1 MB and revisit if a household nears it.
- The #153 report's custom range stays at most 24 months (`RANGE_MONTHS_MAX` is now its own 24, not `MONTHS_STORED`).

## CFO calls (Q-Y1..Q-Y9), built as recommended
- **Q-Y1 Future months:** not selectable; the current household month (America/Toronto) is the latest.
  - In the current year, the months after the current month are disabled in `Month`.
  - Switching `Year` to the current year while a later month is chosen opens the current month.
- **Q-Y2 Years:** `2020` to the current year, newest first. The current year allows `Jan` up to the current month. The list grows by itself each January.
- **Q-Y3 Default:** the current month, as today.
- **Q-Y4 Averages:** unchanged.
  - `This month`, the 3-month and 12-month averages and the chart (last 12 months) are all counted back from the current month.
  - A month older than those windows is stored and shown when chosen, and never changes them.
  - Editing a month inside a window (for example last May) updates the averages as today (#144 live figures).
- **Q-Y5 Storage:** see above.
- **Q-Y6 An empty past month:** copies the current month's saved lines (else the most recent month with lines). The note reads `Copied from <Month> <yyyy> — edit and save.` and nothing is stored until `Save`, as today.
- **Q-Y7 Copy:** labels `Month` and `Year`. Month options use the short names `Jan`..`Dec`, as written in the ticket. The note and the rest of the page keep full month names.
- **Q-Y8 Switching:** each select opens its month at once. `Discard unsaved changes?` is asked only when something was typed or changed. An untouched copy has nothing to lose, so moving on from it doesn't ask, and choosing Year then Month never asks twice. Leaving the page still asks while `Save` is shown.
- **Q-Y9 Read-only (a CFO with Read):** can open any month too, with no `Save` (Q-M1 unchanged).

## Layout
Each label sits above its select. Month (6.5rem), Year (6rem) and the Save slot (5.5rem) fit one row from 360 px. The selects and Save are aligned at the bottom, each ≥ 44 px tall. `Unsaved changes` may wrap alone (PF-174). Nothing moves when `Save` appears (strict CLS 0). Existing site style, no gold.
