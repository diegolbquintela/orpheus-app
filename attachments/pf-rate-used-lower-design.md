# #138 Rate used = lower of WR and ROIC ÷ 2: design note

`rateUsed(rates)` in `src/lib/finance/equity.ts` now returns `min` of the set inputs, where a set input is typed, valid and above 0. Any field in error → null. `rateSource(rates)` returns `"withdrawal" | "roic" | "equal" | null` for the new source line in `equity-rates.tsx`. Every consumer (`expenses-page.tsx`, `months.ts lineFigures`, the Overview coverage) already calls `rateUsed`, so nothing else changes.

## Q-numbered product calls (CFO via EL): recommendations, built as recommended
- **Q-R1 Both empty:** `—`, as before. No equity-to-cover or coverage figure.
- **Q-R2 A typed 0 withdrawal rate (does 0 win the min?):** no. 0 counts as not set, so ROIC ÷ 2 is used. A 0 rate makes equity to cover infinite and coverage 0, and 0 already meant "no rate" before this change. The other option was that 0 wins and Rate used shows `—`.
- **Q-R3 A negative ROIC, or any rate field in error:** Rate used is `—` until it's fixed. The other input is not used on its own, because the user's intended rate is unknown and the field already shows its error (and #143 blocks Save).
- **Q-R4 Show which rate was used:** yes, a small line under the value: `from Withdrawal Rate`, `from half of Portfolio ROIC`, or `Withdrawal Rate and half of Portfolio ROIC are equal`. Nothing when `—`.
- **Q-R5 Description line 2:** the issue's text, `Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.`
