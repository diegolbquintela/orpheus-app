# Keyboard focus spec (#274, HIGH a11y; added 2026-11-01)

Reported by Diego (Safari on Mac): on the DCA calculator (`/calculator`), Tab doesn't move between the fields.
AC pack: `qa/CANONICAL-AC-PACK.md` section **KBF** (KBF-01..KBF-08).

## 1. Root cause (measured, not guessed)
- No app code swallows Tab. Repo-wide grep of `src` (keydown / `onKeyDown`, `preventDefault`, `tabIndex`, `autoFocus`,
  `.focus()`, `addEventListener`, `inert`): the only key handlers are Enter / Escape (new-name input in
  `expenses-page.tsx`), Enter (scenario net-assets and saved-name inputs) and arrows / Home / End / Enter
  (`metrics-sheet.tsx`). None touch Tab. No focus trap, no positive tabindex, no refocus effect on the calculator.
- Headless walks (Chromium and Firefox, 360 and 1440 px, local and signed-out prod): every Tab keydown had
  `defaultPrevented === false`, and the order followed the page.
- **The cause:** Start and End were native `<input type="date">`. Chrome and Firefox give each one 3 to 4 Tab stops
  (month, day, year, then the calendar button), and the focus ring stays on the same field, so from the keyboard
  "Tab doesn't move to the next field". Safari on Mac also steps through the date segments, and by default (with
  "Press Tab to highlight each item" off) it stops only on text fields and skips buttons and links.
- **Fix (Diego's pick, option 1):** Start and End are plain `<input type="text">` fields with a `YYYY-MM-DD`
  placeholder, `pattern`, `maxLength=10` and no spellcheck. That's one Tab stop each, the same in every browser.
  - The default text keyboard is used, not `inputmode=numeric`, because the iOS numeric pad has no `-`.
  - **Validation parity:** `isoDate()` in `src/lib/site/field-checks.ts` keeps only a real calendar date in
    `YYYY-MM-DD` form (trimmed). Anything else reads as blank, exactly as a native date input reported `""`. The
    messages are unchanged ("Add a start date.", "Add an end date.", "End must be after the start."), and the
    value stays as typed.
  - The placeholder is dim (`--color-dim`, 7.2:1 on charcoal). The field's underline, size and focus ring are
    unchanged. There's no calendar button any more: this is the one visible change, and Diego approved it.

## 2. Basket row on phones (layout-only)
- DOM order is ticker, weight, remove. On a phone the remove button is drawn beside the ticker, above the weight.
  `.calc-row { reading-flow: grid-rows; }` makes Tab follow the grid rows: ticker, remove, weight. It doesn't move
  the DOM or change any pixels.
- At 64rem and up the grid is `"ticker weight remove"`, so the grid-rows order equals DOM order and desktop is
  unchanged.
- Browsers without `reading-flow` (Firefox, Safari today) keep DOM order, the same as before. The button is
  disabled (skipped) while there's only one row.

## 3. Forms and menus checked
| Surface | How | Result |
|---|---|---|
| Site bar (Orpheus, Calculator, Dashboard, Personal Finance, Account), 360 / 1440 | headless walk, signed out | PASS: in order, Tab never prevented |
| `/calculator` (saved searches, basket, window, Compare) | headless walk + DOM tests | PASS after the fix (Start / End one stop each) |
| `/dashboard/sign-in` (login) | headless walk | PASS |
| `/account`, `/dashboard`, `/personal-finance` signed out (sign-in form) | headless walk | PASS |
| `/renaissance` signed out (not found; site bar only) | headless walk | PASS |
| Personal Finance signed in: all tabs, scenarios table and Compare, History editable table | **QA-owned on the preview** | code review: no Tab handling |
| `/account` signed in, the owner-only Renaissance Man link, dialogs | **QA-owned on the preview** | code review: no Tab handling |

## 4. Kept on purpose
Enter-to-submit / Escape-to-cancel (PF new-name input), Enter-to-commit (scenario fields), and the metrics-sheet
arrow keys are untouched. The copy button's `tabIndex=-1` while hidden (PF) is intended.

## 5. Out of scope / no change
No table, migration, env var, dependency or storage key. Saved searches already store `YYYY-MM-DD`, so loading
one fills the text fields unchanged.
