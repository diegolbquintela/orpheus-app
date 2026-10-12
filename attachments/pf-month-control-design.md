# Personal Finance: month control replaces Update (#112)

Status: DECIDED (EL picked option A, 2026-10-12 ≈ 11:23 ET; decisions 1–7 below locked). Business user: the CFO.
Spec: `attachments/personal-finance-spec.md` section 19; AC PF-48..PF-58 in `qa/CANONICAL-AC-PACK.md`.

## 1. Brief (Diego via CoS, #112)

A month control at the top of Personal Finance, the current month by default (e.g. `October 2026`); tap it for the
last 12 months. A prior month with data shows it; an empty one copies the current month's lines as a starting point.
`Save` at the top whenever the shown month has unsaved changes, hidden when nothing changed; Save writes that month,
then the averages and Overview update and the control stays on that month. A copied month shows
`Copied from [month] — edit and save.` The separate Update section is removed. Manual only (no Plaid); dark shell,
lyre, footer `Orpheus Wisdom`, no gold.

## 2. Decisions (EL, option A; locked)

1. **Each month owns its own lines:** the expense lines (Fixed, Variable: name, amount, per, currency, FX rate,
   equity to cover, account, category) and the income people. **Shared across months:** household currency,
   accounts, categories, the equity-cover rates (`Withdrawal rate` / `Portfolio ROIC`), `Starting net assets`,
   `Growth rate (%)`, Future (on / years), section toggles.
2. **Explicit Save for every month, the current one included.** Autosave is gone. `Save` sits at the top, shown only
   while the shown month (or a shared value) has unsaved changes. Switching month with unsaved changes asks
   `Discard unsaved changes?`; leaving the page asks the browser's own leave-page question. Section toggles are a view
   preference and still save at once (a Read-only grantee keeps them, #90 Q-D11).
3. **An empty past month** shows a copy of the current month's **saved** lines and `Copied from <current month> —
   edit and save.` Nothing is stored until Save (a copy counts as unsaved, so `Save` shows).
4. **Existing data:** on first load the record's lines (`expenses.v2` / `income.v1`) become the **current month's**
   lines. Months typed in the old `05 Update` (totals only, `overview.v1.months`) keep their two totals as that
   month's figures until the month is opened and saved; opened, such a month shows the copied current lines and the
   note (the old totals are not lines); saving it replaces the totals with its lines.
5. **Rollover (1 November):** a new, empty current month copies the most recent month that has lines, with the same
   note naming that month.
6. **Equity cover and FX rates follow the month's lines** (they sit on each line).
7. **A month's figure** for the averages and Overview = that month's saved `Total` (Monthly) and `Net income`
   (Monthly), by the unchanged formulas (and the old rule: a figure above 0, else no figure). After Save the
   averages / Overview update and the control stays on that month. `05 Update` is gone.

## 3. Storage

- New record value `orpheus.finance.months.v1`: `{ "<yyyy-mm>": { "fixed": Line[], "variable": Line[], "people":
  Person[] } }`, the 24 newest months kept. The record limit rises from 256 KB to 1 MB (12–24 months of lines).
- `expenses.v2` keeps the shared `accounts` and `categories`; its `fixed` / `variable` and `income.v1` mirror the
  lines of the month saved last (for older tools; the page reads the months value once it exists).
- `overview.v1` keeps `start`, `growth`, `future`, `years`; its `months` (old Update totals) are read only as the
  fallback of decision 4 and a month's entry is dropped when that month is saved with lines.
- A Read-only grantee sees every month as saved (no copy, no Save); an empty month shows no lines.

## 4. Open questions

None blocking. Q-M1 (for EL later): whether Read-only grantees should see the copy preview of an empty month.
