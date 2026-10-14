# Personal Finance Overview: 12-month average over 12 complete months (#140)

Brief: issue #140 (HIGH; approved by Diego, 2026-10-14). Spec section 26, AC PF-121..PF-128. The Q-M1 alternative of #132.

## Design

| Item | Design |
|------|--------|
| Window | `completeMonths(today, 12, tz)` in `src/lib/finance/overview.ts`: the 12 household months before the current one, oldest first (`completeMonths3` = `completeMonths(today, 3, tz)`). `summarize()` returns it as `window12`. |
| Average | `average` = the mean over `window12` of each month's figure (`monthFigures`; typed / #112 lines), empty months left out. The current month is not in the window, so the page's own current-month figure never enters it. |
| Label | `average12Label(summary.window12)` → `12-month average (Oct–Sep)`. |
| Fill (C8) | Unchanged rule, new value: an empty month (in the 3-month window or among the 12 chart months) takes the new `average`. |
| Future | Each future point's expenses / income = the new `average` (PF-107); Future-on coverage ÷ `points.at(-1).expenses` (PF-106) = the new average. |
| Unchanged | `This month`; `months` / `lastTwelve` (the 12 chart months, current + 11 before) and `current`; the 3-month window; Future-off coverage. |
| Blast radius | The 12-month column, every filled month (3-month average, chart, net assets), Future, Future-on coverage. Figures move whenever the current month or the month 12 back has a figure. |

## Questions for the CFO (via EL; recommendation built)

- **Q-T1 fewer than 12 complete months of data:** the mean of the complete months that have a figure; the label names the full window (`Oct–Sep`), as the 3-month label does. Alternative: label the actual range with data (e.g. `Jun–Sep`), which would make the label move as data is entered.
- **Q-T2 empty months inside the window:** left out of the mean (not counted as 0), as today (Q18). Alternative: count them as 0.
- **Q-T3 no complete month with a figure** (e.g. a first-month user with only the current month typed): the 12-month average is `—`; the fill, Future and Future-on coverage are `—` / not computed, as today when nothing is typed. Alternative: fall back to the current month's figure until a month completes.
- **Q-T4 This month and the chart:** unchanged. `This month` is the current month; the chart keeps the current month + 11 before (it shows the current month's own figure). Alternative: move the chart to the 12 complete months too.
- **Q-T5 the 3-month fill when the 12-month average is empty:** stays empty, so the 3-month average is the mean of its months with a figure, else `—` (follows Q-T3).
