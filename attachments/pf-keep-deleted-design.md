# #165 Personal Finance: deleting a category or account keeps past months' history (design)

2026-10-16, SWE. Issue #165, which came from SWE's triage during #163 / PR #164. The CFO chose **option A, KEEP**, with three conditions. Spec section 35; AC PFD-01..PFD-14 in `qa/CANONICAL-AC-PACK.md`.

## Problem (main 6315cfa)
Each stored month's lines are read against the shared `accounts` / `categories` lists (`months.ts` `asLines` → `expenses.ts` `asLine`). A name missing from those lists reads as "" on every month, and the next Save writes that back. The app has no delete control today, so this was latent: any delete, or any write of a shorter list, would strip the name from all history. Amounts and totals were never affected; grouping and report series were. The pin is `deleted.test.ts` "PFD-02 (the #165 bug, fails on main 6315cfa)", which fails on main (`actual: ''`, `expected: 'Travel'`).

## The CFO's conditions
1. A delete applies to the month being saved and later months only. Every earlier month stays untouched and is never rewritten.
2. Chart report series that point at a deleted name keep returning their past data, labelled `(deleted)`. They are not in `missing[]` while history still holds lines.
3. Totals and averages don't change. A delete changes only the grouping, from that month on.

## Model
- The shared expenses value (`orpheus.finance.expenses.v2`) gains optional `deletedCategories` / `deletedAccounts`: `[{ name, from }]`, where `from` is the month the delete was saved on. There is no migration; it's a JSON field in the record and is absent when empty.
- `asExpenses` accepts a line's account / category when the name is live **or** deleted. The pickers still offer only the live lists.
- `deleteName(e, kind, name, month)`: the name leaves the live list, gets a deleted entry with `from = month`, and the shown lines lose it. The page keeps a pending `{ kind, name, from }`.
- On Save, `deleteInMonths(months, deletes)` strips the name from every stored month `>= from` (condition 1). A month before `from` is returned as the same object, so its stored JSON is identical. Amounts are untouched (condition 3).
- Copies into a month `>= from` drop the name (`withoutDeletedFor`, Q-Z7).
- `categoryTotals` / `accountTotals` list a deleted name that is still on the month's lines as its own row. The page labels it `<name> (deleted)`.
- Report (condition 2): `missingSeries` is unchanged and still finds the name on earlier lines. `deletedSeries` returns the indexes of series on a deleted name that history still holds. `seriesLabels` returns `<name> (deleted)` for those. `seriesHistory` gives each account / category series' monthly figure per stored month. GET / PUT `/api/personal-finance/report` add `deleted` and `labels`.

## Q-Z calls (recommendation built in; the CFO or EL can override)
- **Q-Z1 Label:** `<name> (deleted)`, on an earlier line's select, in `By category` / `By account`, and in report `labels`.
- **Q-Z2 Confirm:** `Delete <name>? This month and later months lose it; earlier months keep it, marked (deleted).` It does not say "This cannot be undone.", because re-adding the name re-links it (Q-Z4).
- **Q-Z3 Pickable?** No. A deleted name stays only on the earlier lines that already have it, shown in that line's own select. It is never offered for another line or in the filters.
- **Q-Z4 Re-adding the same name** (any case) re-links it. The deleted entry goes, the live name takes the deleted spelling, and earlier history shows it plain again. Later months that lost it are not restored.
- **Q-Z5 Later months that already exist** are stripped too: every stored month from the delete month on, including the current month when a past month is shown (condition 1).
- **Q-Z6 Renaming to a deleted name** is refused: `That name was deleted. Add it again to restore it.`
- **Q-Z7 Copies:** decision 5 and `Copy from current month` drop a name deleted on or before the target month. An earlier target keeps it.
- **Q-Z8 Report:** `deleted` + `labels` on GET / PUT. The past data comes from the record through `seriesHistory`. There is no new data endpoint because no chart UI exists yet (PF charts 2/6+). A deleted name that no stored line holds any more is in `missing` as before.
- **Q-Z9 The current month:** deleting while it is shown means `from` = the current month, so every earlier month keeps the name. Editing and saving an earlier month keeps the deleted names on its lines; they are history.
- **Q-Z10 Read-only:** both buttons are disabled, as `Rename` is.
- **Q-Z11 Option B, BLOCK** (the alternative, not built): refuse the delete while any stored month uses the name, with a text like `Travel is used in 3 months. Move those lines first.`. It needs a `usage(name)` count over `readMonths` plus the shown lines. No deleted entries, labels or report change.
- **Q-Z12 Renames vs deletes in one Save:** renames are applied first (to every month, as since #113), then deletes (from `from` on).
