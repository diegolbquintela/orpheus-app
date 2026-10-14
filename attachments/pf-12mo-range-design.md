# Personal Finance Overview: month range under the 12-month average (#132)

Brief: issue #132 (MEDIUM). Spec section 25, AC PF-115..PF-120. Builds on #126 (C7 window label, `average3Label`) and N1 (`householdMonth`).

## Design

| Item | Design |
|------|--------|
| Label | `average12Label(months)` in `src/lib/finance/overview.ts` → `12-month average (Nov–Oct)`: `AVERAGE` + ` (` + `windowRange(months)` + `)`, the same helper as the 3-month label. |
| Window | `summary.months` (= `lastTwelve(now, HOUSEHOLD_TIME_ZONE)`): the household month and the 11 before it, the months the 12-month average is computed over. No change to the figures. |
| Header | `OverviewTable` takes `label12`; the header span gets `data-testid="pf-ov-avg-head"` (the 3-month one is `pf-ov-avg3-head`). |
| Rollover | Computed at render time from `now` in America/Toronto, so it rolls over on the 1st in Toronto (Oct → `Nov–Oct`, Nov → `Dec–Nov`). |
| Unchanged | 3-month average and its label, Equity coverage text (#129, including `held at 12-month average`), Withdrawal rate description (#131), the #138 Rate used rule, the chart. |
| QA tools | `personal-finance.mjs` empty-page texts, the site-style-regression PF copy list and personal-finance-e2e's header check use a dated `avg12Label()` computed from today in Toronto. |

## Questions for the CFO (via EL; recommendation built)

- **Q-M1 window:** label the 12 months the average already uses: the current month and the 11 before it (`Nov–Oct` on Oct 14). The figures stay as they are. Alternative: switch the 12-month average to 12 complete months (`Oct–Sep`), like C7 for the 3-month; that would change the 12-month figures, the empty-month fill (C8), Future and the Future-on coverage, so it is not built.
- **Q-M2 format:** `12-month average (Nov–Oct)`, short months, en dash, no years, the same as `3-month average (Jul–Sep)`. Alternative: add years (`Nov 2025–Oct 2026`), which the 3-month label does not have.
- **Q-M3 coverage line:** keep the #129 line-2 text `(held at 12-month average)` without a range (the coverage layout is out of scope). Alternative: append the range there too.
- **Q-M4 case:** title case as rendered (`Nov–Oct`), as the 3-month label is; the brief's `JUL-SEP` is read as an example of the range, not a request for capitals.
