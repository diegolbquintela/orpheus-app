# #142 PF money format: always two decimals (design note)

Business user: **CFO**. Priority LOW. Found by QA in #133 (Finding 1): the Overview 3-month Income showed `4,296.3` next to 2-decimal figures.

## Cause (checked in code at main a8dca1b)
`formatAmount()` in `src/lib/finance/expenses.ts` uses `Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })`, which gives up to two decimals and drops trailing zeros (spec section 5, EL Q2). So a figure that happens to end in a zero cent loses it: `4,296.30` → `4,296.3`, and `500.00` → `500`. Every PF money figure goes through it, so the inconsistency can appear anywhere, not only in the 3-month Income.

## Fix
- A shared `formatMoney(value)` in `src/lib/finance/money.ts`: `Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, with `-0.00` mapped to `0.00`.
- Every computed money figure in the PF components (Overview, coverage, Income, Expenses) uses it.
- `formatAmount` stays only where the value isn't money: `formatRate` (`12.5%`).

## Q-numbered product calls (CFO, via EL): recommendations, built as recommended
- **Q-W1 Decimals:** always exactly two, with comma thousands separators (`4,296.30`, `1,200.00`, `0.00`). This matches what QA expected and the 2-decimal figures already on the page.
- **Q-W2 Currency symbol:** none, as today (Q2 / Q15: amounts are unitless and the household currency is named once). The coverage line keeps its existing code suffix (`CAD/mo`).
- **Q-W3 Negatives and zero:** a leading minus, `-1,234.50` (the existing pattern; no parentheses, no colour change). Zero shows `0.00`, and a negative value that rounds to zero shows `0.00`, not `-0.00`.
- **Q-W4 Rounding:** display only, half away from zero to the cent (the `Intl` default). Totals are still summed from unrounded values, so a displayed total can differ by a cent from the sum of the displayed lines, as today.
- **Q-W5 Scope:** every computed money figure on `/personal-finance`, including the chart tooltip, the calculated Equity to cover placeholder and the converted Monthly / Yearly field. Unchanged: typed input text, percentages, rates, FX rates and the chart's compact axis ticks (`4.3K`).
- **Q-W6 Not computed:** `—`, unchanged.
