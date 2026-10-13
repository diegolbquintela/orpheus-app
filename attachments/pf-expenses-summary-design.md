# Personal Finance: Expenses summary, account filter, totals by account (#119)

Business user: the CFO. Spec `attachments/personal-finance-spec.md` section 21; AC PF-67..PF-78. Builds on #105
(categories, `By category`, `Filter by category`), #112 (per-month lines, explicit `Save`) and #113 (rename
categories). No calculation, currency-model, month-control, sign-in or Dashboard change. No new env var.

## 1. Layout

- `03` `Expenses` keeps its toggle and body: the rates, the filters, `Fixed`, `Variable`, `Fixed total`,
  `Variable total` and `Total` (the master household totals, unchanged, household currency).
- New section right after it: numeral `03` (it belongs to Expenses; `04` Overview, `05` Update and `06` Activity keep
  their numerals, Q-S1), title `Expenses summary`, its own toggle (`pf-toggle-summary`, `aria-expanded`,
  `aria-controls="pf-summary-body"`). Closing `Expenses` does not hide it; it toggles on its own.
- The toggle state is a view preference stored with the other section toggles (`orpheus.finance.view.v1`, new key
  `summary` in `SECTIONS`); saved at once like the others (#90 Q-D11), not part of the month's `Save` (Q-S2).
- Body: `By account` (new), then `By category` (moved from the Expenses body). Each appears once a line of the shown
  month uses an account / a category (the #105 rule); with neither, the body is empty (Q-S5).

## 2. Totals by account

- `accountTotals(expenses, rate, household)` in `src/lib/finance/expenses.ts` (pure): each account with a line, in
  the order added, then `No account` (name "") for the rest; empty when no line has an account. Same `Totals` as
  `categoryTotals`; they sum to the grand totals; a foreign line without a valid rate makes that account's figures
  `—` (Q14).
- Same row style as `By category`: `Account`, `% of expenses`, `Monthly`, `Yearly` (full digits, `formatAmount`).
  Test ids `pf-accounts`, `pf-acct-row[data-account]`, `pf-acct-name|share|monthly|yearly`.

## 3. Account filter

- `Filter by account` (`pf-acct-filter`): `All`, then the accounts; shown once there is an account; beside
  `Filter by category` in the same filter row; this visit only, like the category filter (Q-S2).
- Both filters combine (a line shows when it matches both; Q-S3). Group totals, `Total`, `% of expenses` and the
  Summary always use every line of the month (as #105).
- `↳ Add expense` while an account is chosen starts the line on it (as the category filter does; Q-S4).
- The Summary keeps every account's and every category's total; the chosen account's row (and the chosen category's
  row) is marked: `data-selected="true"`, `aria-current="true"`, class `pf-sum-selected` (chalk rule on the left,
  chalk name; no gold; Q-S6).

## 4. Roles, month, rename

- Read-only grantees see the Summary and can toggle it and use both filters (view only, nothing saved; Q-S7). Inputs
  stay locked as today.
- Per-month lines (#112): the Summary shows the month shown; switching months keeps the filters when the account /
  category still exists, else `All`.
- A category rename (#113) moves the category row and keeps the filter on it.

## 5. Decision log

| # | Decision | Why |
|---|----------|-----|
| S1 | Summary is a sibling section after `03` Expenses, numeral `03` | Separate toggle as the brief asks; no renumbering of 04–06 (audit AUDIT-08 checks `06`). |
| S2 | Toggle stored like the other toggles; filters per visit | Same patterns as #105. |
| S3 | Filters combine with AND | The only reading where both choices are visible at once. |
| S4 | New line under an account filter takes that account | Mirrors the category filter. |
| S5 | No placeholder text in an empty Summary | No instruction paragraphs (DR6 spirit); the #105 rule. |
| S6 | Mark the selected rows, keep all rows | The brief: highlight and still list the others. |
| S7 | Read-only can filter and toggle | View preferences, nothing saved to the record. |

## 6. Questions (CFO; recommendation built until answered)

| Q | Question | Recommendation |
|---|----------|----------------|
| Q-S1 (CFO) | Summary numeral? | `03` (part of Expenses), 04–06 unchanged. |
| Q-S2 (CFO) | Remember the Summary toggle / the filters? | Toggle yes (like other sections); filters no (per visit, like #105). |
| Q-S3 (CFO) | Account + category filter together? | Combine (AND). |
| Q-S4 (CFO) | New line while an account is chosen? | Starts on that account. |
| Q-S5 (CFO) | Summary with no account and no category? | Empty body, no placeholder text. |
| Q-S6 (CFO) | How is the selected account shown? | Chalk left rule + `aria-current`; all accounts still listed; same for a chosen category. |
| Q-S7 (CFO) | Read-only roles? | May toggle and filter; nothing saved. |
| Q-S8 (CFO) | Lines with no account? | A `No account` row (as `No category`). |

## 7. Amendment while building (supersedes the Q-S7 reading above)

ROLE-10 (roles.mjs, accepted) requires every Personal Finance control but the section toggles and the month select to
be disabled for a read-only grantee. So, as built: read-only grantees toggle `Expenses summary` and see every total,
but both filters stay locked like the category filter today. Q-S7 (CFO) recommendation becomes **toggle only;
filters locked (ROLE-10 unchanged)**; PF-77 is read that way. Opening the filters to read-only would be a ROLE-10
change for EL to decide.

## 8. S7 changed and CFO acceptance (EL 07:51 ET, Diego approved; supersedes section 7 and the S7 / Q-S7 rows)

- **S7 (new):** read-only grantees CAN use both filters (`Filter by account`, `Filter by category`). Filtering is
  view-only: nothing is written to the record, and totals do not change. The filters sit outside the read-only lock;
  everything that writes stays locked: `↳ Add expense` (including the S4 path, where a new line takes the filtered
  account), `Save`, `Rename`, remove, every field and select on a line, the rates and the household currency.
  `Rename` is disabled for read-only even with a category chosen.
- **ROLE-10 amended** (AC pack, ROLE-10a): the enabled controls for read-only are the section toggles, the month
  select and the two filters.
- **Accepted by the CFO:** S1 (numeral `03`), S2 (toggle remembered, filters per visit), S3 (AND), S4 (new line takes
  the filtered account, writers only), S5 (no placeholder), S6 (mark the chosen row, keep all), S8 (`No account`).
  Q-S1..Q-S6 and Q-S8 are closed as recommended; Q-S7 is closed as above.

| # | Decision | Why |
|---|----------|-----|
| S7' | Read-only can filter; every write locked | Filtering is a view; EL / Diego 07:51 ET. |
