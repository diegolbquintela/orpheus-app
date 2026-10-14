# Personal Finance Overview: Equity coverage and 3-month average (#126)

Business user: the CFO. Spec `attachments/personal-finance-spec.md` section 22; AC PF-79..PF-90. Builds on #86 (rate used), #94 (Overview, Future), #112 (per-month lines, explicit `Save`), #119 (Expenses summary, unchanged) and #90 / ROLE-10a (read-only). No change to the currency model, month control, sign-in, the Expenses summary or the Dashboard. No new storage key and no new env var. Nothing new is saved: both additions are computed from what the page already holds.

## 1. Equity coverage

What the household's starting net assets would pay each month at the rate used, compared with the month's expenses.

- **Inputs:**
  - `Starting net assets` is the Overview field (`overview.start`).
  - `Rate used` is the #86 rate (`rateUsed(rates)`): the typed withdrawal rate, else portfolio ROIC ÷ 2. It is an annual percent.
  - Both are read live from the page's current (unsaved) state, as the rest of the Overview already is. `Save` stays explicit (#112).
- **Math** (pure `equityCoverage()` in `src/lib/finance/overview.ts`):
  - Annual coverage = Starting net assets × (Rate used ÷ 100).
  - Monthly coverage = Annual coverage ÷ 12.
  - Coverage % = Monthly coverage ÷ total monthly expenses.
- **Expenses used for the %** (Q-C2): `This month`'s expenses. When this month has no figure, the 12-month average is used (the existing average-fill rule).
- **Display:** directly under the comparison table and above the fields, `Future` and the chart, in the household (master) currency with full digits (`formatAmount`).
  - First line: `Equity coverage: 43.75 CAD/mo · 0.53% of expenses`.
  - Second line, dim: `525 CAD/yr`.
  - The % has two decimals, as in the brief (Q-C3). It shows `—` when expenses are missing or 0.
  - Test ids: `pf-coverage`, `pf-coverage-monthly`, `pf-coverage-share`, `pf-coverage-yearly`, `pf-coverage-note`.
- **Missing inputs** (Q-C4):
  - Rate used missing (`—` under Expenses): `Equity coverage: —` with the note `Set rate under Expenses`. This is the brief's wording.
  - Rate set but `Starting net assets` empty, 0 or invalid: `Equity coverage: —` with the note `Set starting net assets`.
- **Future** (Q-C5): with `Future` on, the line uses projected numbers.
  - Net assets are the projected net assets at the end of the chosen horizon (the chart's last point).
  - Expenses are the 12-month average (what the projection uses for every future month).
  - The label reads `Equity coverage in 5 years: …`.
  - If the projection has no figure (no average surplus), it shows `—` with no note.
- **Currency** (Q-C1): figures are computed in the household currency; the code goes after the figure (`CAD`). PF never shows a symbol (Q2), and `$` would be ambiguous between CAD and USD.

## 2. 3-month average

- **Columns:** `This month` · `3-month average` · `12-month average` (Q-C6: the existing labels are kept, plus the new one).
  - Rows: `Expenses`, `Income`, `Surplus`.
  - Test id of the new cell: `pf-ov-avg3`. The existing `pf-ov-now` / `pf-ov-avg` are unchanged.
- **Window** (Q-C7): the current month and the 2 before it, the last three of the 12-month window.
- **Fill rule** (Q-C8): an empty month in the window takes the 12-month average, the same rule the 12-month view uses for its chart points.
  - 3-month average = mean of (figure, else the 12-month average) over the 3 months.
  - With no figure in any of the 12 months it is `—`.
  - Surplus = income − expenses of the averages, as for the 12-month column.
- **Chart:** unchanged, still the 12-month series (plus Future).
- **Phone (400 px):** the table keeps three value columns. The column labels wrap within their cell and there is no horizontal scroll.

## 3. Roles

- Read-only grantees see both additions; there is no new control (ROLE-10a unchanged).
- The coverage line is text, not a field.

## 4. Decision log

| # | Decision |
|---|---|
| C1 | Coverage is computed, never stored; no new key; it follows the live page state (as the Overview does). |
| C2 | One pure function `equityCoverage(start, rate, expenses)` used by the view and the tests. |
| C3 | The 3-month average comes from `summarize()` (`average3`), reusing the month figures and the 12-month average fill. |
| C4 | The coverage line sits between the table and the fields, so it is "under the comparison block, above the chart". |
| C5 | QA tools: the expected visible-text lists (site-style regression ST6-02, personal-finance) gain the new strings; cell lists read three value cells. |

## 5. Questions for the CFO (recommendation built)

- **Q-C1 currency display:** `43.75 CAD/mo` (household code after the figure; no symbol). Alternative: `$43.75/mo` as in the brief.
- **Q-C2 expenses for the %:** this month's expenses, falling back to the 12-month average. Alternative: always the 12-month average.
- **Q-C3 percent digits:** two decimals (`0.53%`), as in the brief. Other PF percentages use one decimal.
- **Q-C4 missing start:** a separate note `Set starting net assets`. The brief's `Set rate under Expenses` is kept for a missing rate.
- **Q-C5 Future:** coverage on projected net assets at the horizon end and average expenses, labelled `in N years`.
- **Q-C6 labels:** keep `This month` and `12-month average`, add `3-month average`. The brief's "Current month / 3-month avg" wording would rename existing labels.
- **Q-C7 window:** the current month plus the 2 before it.
- **Q-C8 fill:** empty months in the window take the 12-month average.
- **Q-C9 second line:** show `525 CAD/yr` (the brief says optional).
