# Personal Finance Expenses: Withdrawal rate description (#131)

Business user: the CFO (decisions routed through the Engineering Lead). Spec `attachments/personal-finance-spec.md`
section 24; AC PF-108..PF-114. Copy and style only: the `Rate used` formula (section 13, PF-18), the Equity coverage
layout (#129) and the currency model do not change. No env var, no migration, no storage change.

## 1. Brief (#131)

A short description directly above the `Withdrawal rate (%)` field under `03` `Expenses`, in description style
(smaller font, not a title or heading). Brief text:

```
Withdrawal rate used to calculate how much equity can cover expenses.
Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.
```

## 2. Finding: line 2 does not match the locked formula

`rateUsed()` (`src/lib/finance/equity.ts`; spec section 13 / PF-18, EL option A, 2026-10-11) is: the typed withdrawal
rate; if that field is empty, Portfolio ROIC ÷ 2; **both typed, the withdrawal rate wins**. It is not "the lower of".
Example: withdrawal 5, ROIC 8 → Rate used **5%** (the lower of 5 and 4 would be 4%). Changing the calculation is out of
scope (#131). So the brief's line 2 would misstate the figure next to it (Q-W1).

## 3. Build

- `EquityRates` (`src/components/personal-finance/equity-rates.tsx`) renders a description block
  `pf-withdrawal-desc` (`<div>` with two `<p>`, one per line) immediately before the `pf-rates` row, inside the same
  `Lock`. On a phone the fields stack and `Withdrawal rate (%)` is first, so the block sits directly above it; from
  640 px the block sits above the row, starting at the Withdrawal rate column (left edge).
- Style `.pf-desc`: the #129 note style (`.pf-coverage-sub`: 0.875rem, `--color-dim`), sentence text, no uppercase,
  no letter spacing, not `.pf-label` / `.ow-label`, no heading element or role. Margin 0 between the two lines.
- The withdrawal input's `aria-describedby` names the description (and the error id too when the field is bad).
- Copy constants `WITHDRAWAL_DESC_LINES` in `src/lib/finance/equity.ts`.

## 4. Questions (Q-numbered; recommendation first; each built as recommended)

| Q | Question | Recommendation (built) | Needs Diego's go? |
|---|---|---|---|
| Q-W1 (CFO) | Line 2 says "the lower of", but Rate used is the withdrawal rate when typed, else ROIC ÷ 2 (withdrawal wins). Which wins? | Keep the formula (out of scope) and make line 2 true: `Rate Used is your Withdrawal Rate, or half of Portfolio ROIC when no Withdrawal Rate is set.` Line 1 verbatim. If the CFO wants "the lower of" as policy, that is a formula change: its own ticket (PF-18 change), then the brief's line 2 verbatim. | No (copy); Yes if the formula changes |
| Q-W2 (CFO) | Where exactly? | One block right before the rates row: directly above `Withdrawal rate (%)` on a phone (stacked first) and above its column on desktop. Not inside the field's cell, so the three fields stay aligned. | No |
| Q-W3 (CFO) | Style? | The #129 note style: 0.875rem, dim, sentence case, two `<p>` lines; no heading, no label style, no gold. | No |
| Q-W4 | Accessibility? | The withdrawal input is `aria-describedby` the description (plus the error when shown). | No |
| Q-W5 | Read-only grantees? | Shown to them too (it is copy; inside the same `Lock`, the fields stay disabled). | No |
| Q-W6 | Casing: the brief says `Withdrawal Rate`, `Rate Used`, `Portfolio ROIC`; the labels are `Withdrawal rate (%)`, `Rate used`. | Keep the brief's capitals: they name the fields. | No |
| Q-W7 | PF-02 says "no other text (no instruction text)". | The two lines are an approved exception to PF-02 (descriptive, not instruction); the QA copy list adds them. | No |

## 5. Decision log

| # | Decision | Why |
|---|---|---|
| W1 | Line 2 reworded to match the formula | A description must not misstate the number beside it; the formula is out of scope. |
| W2 | Block outside the rates grid | Keeps the 3-column row and PF-20 layout unchanged. |
