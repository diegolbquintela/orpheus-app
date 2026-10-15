# #144 Live figures and an unsaved-changes indicator: design note

## Audit at main 19b3a6a: how each PF figure behaves today
A figure is **live** if it changes while you type. It is **on save** if it changes only after Save (or a reload). Source is `src/components/personal-finance/expenses-page.tsx` and `overview-block.tsx`.

| Figure | Today | Why |
|---|---|---|
| Expenses line `Equity to cover`, group totals (Fixed / Variable / Total) | live | computed from the on-screen `expenses`, `rates` and `household` state |
| Expenses summary (`ExpensesSummary`) | live | the same on-screen state |
| Rate used and its source line | live | `rateUsed(rates)` on the on-screen rates |
| Overview `This month` (expenses, income, surplus) | **on save** | `summarize(…, lines)`, where `lines = lineFigures(storage())` is memoised on `[saved, month]`, so it reads the saved store |
| Overview 3-month average and 12-month average (and their surpluses, the `N of 12` label) | **on save** | the same saved `lines`. They also use the **saved** Rate used and household currency inside `lineFigures` |
| Chart (past and current points, net assets line) | **on save** for income and expenses; live for Starting net assets | points come from the saved `lines`; the net line starts from the on-screen `overview.start` |
| Future projection (points, horizon net assets) | mixed | saved averages, but the on-screen start, growth, Future on/off and years |
| Overview equity coverage | mixed | on-screen Rate used and start, but saved 3-month and 12-month expense averages |
| Starting net assets, growth, Future, years, rates, household | inputs: live on screen, stored only on Save | nothing autosaves (#112). Only the browser's leave-page prompt warns |

So editing Rent changes the Expenses totals and Equity to cover at once, but This month, the averages, the chart and part of the coverage wait for Save. That is the inconsistency in #144 (and #134 triage item 2).

## Design (Q-V1: live)
`liveLineFigures(store, shown)` (in `months.ts`) gives each month's figures as **Save would store them**:
- the saved months, with the shown month's lines replaced by the on-screen lines;
- the on-screen shared values (categories, accounts, FX) and the on-screen Rate used and household currency, applied to every month, because Save writes them for every month;
- the shown month's old typed totals (`overview.months[month]`) dropped, as Save drops them.

The page passes those figures to the Overview instead of the saved ones, so every figure in the table above is live. Nothing is stored until Save, so the indicator says so.

The unsaved indicator `Unsaved changes` (`pf-unsaved`) sits beside Save. It shows exactly while Save shows (`dirty`: the page differs from the last successful save, or the month's lines were copied). `dirty` only resets when `save()` gets a 2xx (the baseline moves then), so:
- a blocked Save (any field in error, #143),
- a blocked section toggle (#143 PF-142),
- and a server refusal (non-2xx or network failure)

all keep it. Each of those also shows `Not saved.`, which stays until a save succeeds.

## Q-numbered product calls (CFO via EL): recommendations, built as recommended
- **Q-V1 Live or on save:** **live, everywhere.** Most figures are already live: the Expenses totals, Equity to cover, Rate used and half the coverage inputs. Making them all wait for Save would put stale numbers right beside the field you just typed, and a rate change would no longer move Equity to cover until Save. Live also lets you try a value and see its effect before you commit it. The risk with live is thinking it's stored when it isn't; the indicator, `Not saved.` and the leave-page prompt cover that. The other option (everything on save) would make the page feel broken while typing and would need a second "preview" concept to try values.
- **Q-V2 Indicator wording and placement:** `Unsaved changes`, in dim text right beside `Save` in the month row. It's announced politely (`role="status"`). It uses no colour beyond dim (no gold, AA contrast). It shows whenever Save shows.
- **Q-V3 Invalid fields while live:** keep #143's per-field behaviour. A bad amount (e.g. `-5`) counts as 0 in every live figure while its error shows. A bad rate makes Rate used `—`, and the figures that need it show `—`. Save stays blocked, so a bad value is never stored. The other option, showing `—` for every figure on any error, would blank the whole Overview on one stray keystroke.
- **Q-V4 Editing back to the saved values, or discarding:** the indicator clears, because nothing is unsaved (Save hides too, as in #112). Switching month with unsaved changes still asks first (`DISCARD_CONFIRM`); discarding clears it. Otherwise only a successful save clears it.
- **Q-V5 Leave-page warning:** keep the browser's own prompt while anything is unsaved, including after a blocked or refused save. No custom dialog.
- **Q-V6 Read-only:** no indicator and no Save. The page can't be edited, so the figures are the saved record's, as today.
- **Q-V7 `Not saved.` on a blocked Save press:** show it (as a refused save and a blocked toggle already do), as well as the existing `Fix the fields marked in red before saving.` note. It stays until a save succeeds. This makes all three non-saves look the same, as the ticket asks.
