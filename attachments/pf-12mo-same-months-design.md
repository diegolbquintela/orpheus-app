# #146 12-month averages over the same months: design note

`summarize()` in `src/lib/finance/overview.ts`: `used = figures12.filter(f => f.expenses !== null)`. Then
`average = { expenses: mean(used.expenses), income: used.length ? mean(used.map(f => f.income ?? 0)) : null }`.
`window12WithData` is `used.length` (as in PF-132). Everything downstream (the table, the surplus, C8 fills, the Future
projection, Future-on coverage) reads `average`, so it follows without other changes.

## Q-numbered product calls (CFO via EL): recommendations, built as recommended
- **Q-U1 An expense month with no income figure:** counts as **0 income**. This keeps both averages over exactly the same months, and leaving the month out of the income side would bring back the mismatch this ticket fixes. The other option was to treat it as missing.
- **Q-U2 The table and surplus:** the 12-month income cell and the surplus both follow the same-months rule.
- **Q-U3 The Future projection:** future months use the new income average, so the projected surplus matches the table's.
- **Q-U4 The C8 fill (chart past months, the 3-month window):** a month with no income figure is filled with the new 12-month income average. A month's own income is still shown for that month: the rule changes the average, not the month's data. The 3-month window rule (C7) is unchanged.
- **Q-U5 Coverage:** Future-on follows through the projected net assets; Future-off is unchanged (it uses no income average).
- **Q-U6 No expense month but income-only months exist:** all three 12-month averages show `—`, and the label reads `(0 of 12 months)`.
- Q-U1 refinement (built): if none of the used months has an income figure, the income average is `—` (null), not 0. The 0 rule applies once at least one used month has income.
