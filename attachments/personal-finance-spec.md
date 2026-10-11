# Personal Finance spec (#84 v1.1; later #85 income, #86 equity cover, #87 foreign currency)

Source of truth for the Personal Finance page, with `attachments/site-style-spec.md` for everything the shared dark
shell already rules (bar, footer, tokens, AA, CLS 0, no painting, no instruction text). Harness first, then this
spec, then the work; the spec beats chat. If they disagree, stop and ask EL. Business user: the **CFO** (reviews
later); Engineering Lead owns the tech loop.

## 1. Decision log

| When | Decision |
|---|---|
| 2026-10-11 | **Brief (Diego via CoS, #84):** Personal Finance v1 approved, high priority. Manual entry only, no Plaid, no hires. Dark, the same site style as the calculator / home / sign-in shell. v1.1 = the page, Fixed and Variable expenses, and the lyre mark (shipped with the page). Income (#85), equity-cover math (#86) and a foreign-currency line (#87) are later tickets. The CFO is the business user (issue comment, 15:23 UTC). |
| 2026-10-11, ≈ 11:33 ET | **#84 kickoff (EL):** the lyre replaces the geometric mark on every page (inline SVG; bar stays 45 px with ≥ 44 px tap targets); the page lives in the shared dark shell. Simplest readings without #85 / #86: `% of income` shows `—` until income exists (#85); `Equity to cover` is a manual number per line (not computed) until #86 wires the rate. Storage: this browser's `localStorage` only (the #80 saved-searches pattern), no auth, no server write. Not started: #85, #86, #87, Plaid, live feeds, the dashboard (#71 on hold). |
| 2026-10-11, ≈ 12:05 ET | **EL answers on #84 (PR #88 at `f067c84`; docs-only commit, no code change):** **Q1 (d)** URL only, as built: no fourth bar item (ST1-01 stays three items) and no third home Platforms line (home stays the hero + two lines, ST3-03). **Q2** no currency symbol until #87: amounts stay unitless. **Q3** for #86: a typed `Equity to cover` is an **override** of the calculated amount for that line; the calculated amount is the default while the field is empty (no code change in #84). **Q4** `public/__grok/icon-180.png` stays as is: Grok builder assets are out of scope for #84. |

## 2. The brief (verbatim, issue #84)

> 1. **Lyre mark:** replace the geometric mark with a simple lyre on every page. Same bar, same footer `Orpheus Wisdom`. Prefer shipping with this page/shell work (not a separate PR).
> 2. **Personal Finance page** (dark, shared shell):
>    - **Expenses: Fixed and Variable.** Columns: Name, % of income, % of expenses, Monthly, Yearly, Equity to cover, Account.
>    - Account is a dropdown; user can add a choice.
>    - Totals for Fixed, for Variable, and for both.

## 3. Route and navigation

- Route: `/personal-finance` (`src/routes/personal-finance.tsx`), a dark page in the shared shell (`shellPage` →
  `dark`, `color-scheme: dark`), title `Personal finance · Orpheus Wisdom`, noindex meta + `X-Robots-Tag` like every
  page, the one Analytics script from the root.
- **Navigation: URL only (EL, Q1 (d), decided).** The page is reached by its URL; no bar item is current on it
  (like the 404). No fourth bar item (ST1-01 stays exactly `Orpheus`, `Calculator`, `Dashboard`) and no third home
  Platforms line (home stays the hero + two lines, ST3-03).

## 4. Exact copy (tests and QA compare these strings)

| Where | String |
|---|---|
| Numeral + title (`h1`) | `01`, `Personal finance.` |
| Section | `02`, `Expenses` |
| Groups (`h3`) | `Fixed`, `Variable` |
| Column labels, in order | `Name`, `% of income`, `% of expenses`, `Monthly`, `Yearly`, `Equity to cover`, `Account` |
| Add a line (one per group) | `↳ Add expense` |
| Remove a line (`aria-label`) | `Remove expense` |
| Account choices | `—` (none), then the user's accounts in the order added, then `Add account…` |
| Adding an account | label `New account`, buttons `Add` and `Cancel` |
| Group totals (row label) | `Fixed total`, `Variable total` |
| Both (row label) | `Total` |
| Field check (amounts) | `Enter a number, 0 or more.` |
| Field check (new account) | `Name the account.` |
| Not computed yet | `—` |

No other text on the page (site-style ST6-02: no instruction text, no notes, no empty-state copy).

## 5. Lines, columns and totals

- Two groups, `Fixed` then `Variable`, each a list of lines; a line is one expense. New page: each group has no
  lines, only its `↳ Add expense` and its total row (all `0` / `—`).
- **Name:** text, as typed (≤ 80 characters).
- **Monthly / Yearly:** both are inputs; the user types either. The one typed is stored as typed (`1,000` stays
  `1,000`, like #80); the other shows the conversion (Yearly = Monthly × 12; Monthly = Yearly ÷ 12). Typing in the
  other field makes it the typed one. Amounts read with commas dropped; empty reads as 0; a non-number or a negative
  number shows the field check `Enter a number, 0 or more.` under the field (alert colour, `aria-invalid`) and the
  line counts as 0 in every total and percentage until fixed.
- **% of expenses:** the line's monthly amount ÷ the monthly total of **both** groups × 100, one decimal and `%`
  (e.g. `12.5%`); `—` while that total is 0. A group total's `% of expenses` is the group's share of both; `Total`
  shows `100.0%` (or `—` at 0).
- **% of income:** `—` on every line and total until #85 adds income. Not an input, no number invented.
- **Equity to cover:** until #86 a manual amount per line (typed, stored as typed, the same field check), summed in
  the totals. **For #86 (EL, Q3, decided):** #86 computes the amount from the user's withdrawal rate; that
  calculated amount is the line's default while the field is empty, and a typed value is an **override** of it for
  that line (the values typed in v1.1 carry over as overrides). No code change in #84.
- **Account:** a dropdown per line: `—`, the accounts, `Add account…`. Choosing `Add account…` opens an inline
  `New account` field with `Add` and `Cancel` under that line; `Add` trims the name, refuses an empty one
  (`Name the account.`), reuses an existing account with the same name (case-insensitive) instead of a duplicate,
  appends a new one to the shared list (≤ 40 characters, ≤ 50 accounts) and selects it on that line. The account
  list is shared by both groups. An account is never removed in v1.1.
- **Totals:** per group (`Fixed total`, `Variable total`) and for both (`Total`): Monthly, Yearly (Monthly × 12),
  `% of expenses`, `% of income` (`—`), Equity to cover. Totals are computed, never inputs.
- **Number format:** grouped with commas, up to two decimals, no trailing zeros (`1,200`, `83.33`); no currency
  symbol: amounts stay unitless until #87 (EL, Q2, decided). Percentages with one decimal.
- **Remove:** each line has a remove button (`Remove expense`); no confirmation (manual data, nothing on a server).

## 6. Storage (v1.1)

- This browser's `localStorage` only, one key `orpheus.finance.expenses.v1`:
  `{ fixed: Line[], variable: Line[], accounts: string[] }`, `Line = { id, name, amount, per: "month" | "year",
  equity, account }` (strings as typed). Saved on every change; read once after hydration. A missing, malformed or
  over-large value reads as an empty page (never throws). ≤ 100 lines per group.
- No login, never the account, no cookie, no `sessionStorage` / IndexedDB, no server copy, no network request at
  all from the page (no `/api/*`). Another device or browser sees nothing; clearing the site's data clears it.
- **CLS 0 with a restore:** the server renders the hero (`01`, title) and an empty expenses area that is at least
  the viewport tall (so the footer starts below the fold); the browser fills the area once after reading storage.
  Nothing on screen moves: the strict page CLS of 0 (site-style ST6-06) holds on this page too.

## 7. Layout (mobile first, the site's dark tokens)

- No painting: a plain header band under the bar, `01` (12 px dim) and the `h1` (32 px on a phone, 44 px from
  1024, chalk, weight 400), the content column `max-w-6xl` like the calculator.
- **Phone (below 1024 px):** each line is a block: `Name` full width with the remove button beside it, then a
  two-column grid of labelled cells: `Monthly` | `Yearly`, `% of expenses` | `% of income`, `Account` |
  `Equity to cover` (the wider right cell, so its label stays on one line at 360 px). Labels visible on every line.
  Totals: the row label, then the same labelled cells (no Account).
- **Wide (from 1024 px):** one row per line in the column order of section 4, a column-label row above each group
  (visual; every input keeps its own accessible label), the totals row aligned to the same columns.
- Fields: the calculator's underline style in Personal-Finance-only classes (`.pf-*`; Q10 rule: never `.field` /
  `.kicker`), 44 px tall, 16 px text; computed values 16 px chalk; labels 12 px upper-case dim; the field check
  13 px in the alert colour under its field. Proportional figures (site-style ST6-07). AA everywhere, chalk focus
  ring on every control, no horizontal page scroll at 360.

## 8. Lyre mark (every page)

- A simple lyre drawn in an inline SVG (two curved arms, a crossbar, a base and three strings; `currentColor`
  strokes, no fill) replaces the geometric mark (the old `favicon.svg`: two bars). In the bar it sits left of the
  `Orpheus` wordmark, inside the same link (20 × 20 px, `aria-hidden="true"`, decorative: the link text already
  says Orpheus); the bar stays 45 px, the link a ≥ 44 px tap target (ST6-08). `public/favicon.svg` becomes the same
  lyre in chalk on charcoal. The footer stays exactly `Orpheus Wisdom`. The platform PWA icon
  (`public/__grok/icon-180.png`) is the builder's default, not the geometric mark; untouched (EL, Q4: Grok builder
  assets are out of scope for #84).

## 9. Questions for EL (all answered, 2026-10-11 ≈ 12:05 ET)

- **Q1. Navigation. Decided: (d) URL only, as built.** Not a fourth bar item (ST1-01 stays three items), not a
  third home Platforms line (ST3-03: home stays the hero + two lines).
- **Q2. Currency. Decided:** no currency symbol until #87; amounts stay unitless.
- **Q3. Equity to cover after #86. Decided:** a typed value is an override of the calculated amount for that line;
  the calculated amount is the default when the field is empty. Recorded for #86; no code change in #84.
- **Q4. App icon. Decided:** leave `public/__grok/icon-180.png` alone (as built); Grok builder assets are out of
  scope for #84.

## 10. Acceptance (PF rows; QA at 360 × 780, 400 × 860, 1024 × 800, 1440 × 900)

Tools: `qa/tools/personal-finance.mjs` (PF-01..09 and ST1-05), `qa/tools/site-style-regression.mjs` (PF-10: its own
ST6 checks now include `/personal-finance` and the lyre on every page, then every shipped-page tool, `site.mjs`'s
`$313,000` and `release-smoke`).

| ID | Pass when |
|---|---|
| PF-01 | `/personal-finance` renders in the shared dark shell: charcoal page, chalk type, `color-scheme: dark`, the bar (unchanged, no current item: URL only, Q1 (d)) and footer `Orpheus Wisdom`; title `Personal finance · Orpheus Wisdom`; noindex meta + `X-Robots-Tag`; one Analytics script; no painting; status 200; signed out, no flag. |
| PF-02 | Exact copy (section 4): `01`, `Personal finance.`, `02`, `Expenses`, `Fixed`, `Variable`, the seven column labels in order, `↳ Add expense` per group, the totals rows; no other text (no instruction text). |
| PF-03 | Lines: add and remove lines in each group; Name, Monthly, Yearly and Equity to cover are inputs with visible labels; typing Monthly fills Yearly × 12 and typing Yearly fills Monthly ÷ 12; the typed value stays as typed; a bad amount shows `Enter a number, 0 or more.` under its field and counts as 0. |
| PF-04 | Percentages: `% of expenses` per line and per group = monthly ÷ the monthly total of both groups (one decimal, `—` at 0), `Total` `100.0%`; `% of income` shows `—` everywhere (no income until #85). |
| PF-05 | Totals: `Fixed total`, `Variable total` and `Total` sum Monthly, Yearly and Equity to cover exactly (e.g. Fixed 1,000 + 250 monthly and Variable 1,200 yearly → Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200). |
| PF-06 | Account: a dropdown per line with `—`, the accounts and `Add account…`; adding one (inline `New account`, `Add`) selects it on that line and offers it on every line in both groups; an empty name shows `Name the account.`; a repeat name (any case) reuses the existing account. |
| PF-07 | Storage: everything typed survives a reload (lines, typed amounts as typed, accounts, selections) from `localStorage` key `orpheus.finance.expenses.v1` only; no `/api/*` request, no cookie, no `sessionStorage` / IndexedDB write; a new browser context starts empty; a malformed stored value shows an empty page without an error. |
| PF-08 | Layout: phone (360, 400) lines stacked with labels, no horizontal page scroll; wide (1024, 1440) one row per line in column order with the column labels; every control ≥ 44 px tall; AA for every visible text (axe-core too), a ≥ 3:1 focus mark on every Tab stop; proportional figures (no `tnum`). |
| PF-09 | Strict page CLS 0 on cold loads at every width, every shift counted, both empty and with stored lines restored. |
| PF-10 | Logic and shell untouched elsewhere: the calculator `$313,000`, the dashboard content (ST0-05; no diff under `src/components/dashboard/*`, `src/routes/dashboard.tsx`), sign-in, home, the bar's items (ST1-01) and the site-style regression (`qa/tools/site-style-regression.mjs`) pass. |

## 11. Landed

- **#84, Personal Finance v1.1 + lyre (PR #88, draft; built at `f067c84`, 2026-10-11).** `/personal-finance`
  (`src/routes/personal-finance.tsx`, `src/components/personal-finance/expenses-page.tsx`, `.pf-*` in
  `src/styles.css`), pure helpers in `src/lib/finance/expenses.ts` (amounts, conversion, shares, totals, accounts,
  the one `localStorage` key); the lyre in `src/components/lyre.tsx` (bar) and `public/favicon.svg`. Checks:
  `src/lib/finance/expenses.test.ts`, `expenses-page.dom.test.tsx`, `site.test.ts`, `site.dom.test.tsx`,
  `check-dashboard-built.mjs`, `qa/tools/personal-finance.mjs` (PF-01..09, ST1-05) and
  `qa/tools/site-style-regression.mjs` (PF-10; `/personal-finance` and the lyre on every page). Preview at
  `f067c84`: regression 318/318, every tool green, `$313,000`, strict CLS 0. In QA.
  - **EL answers (2026-10-11, ≈ 12:05 ET; docs-only commit, no code change):** Q1 (d) URL only (no bar item, no home
    line); Q2 unitless until #87; Q3 a typed `Equity to cover` overrides #86's calculated amount for that line
    (calculated is the default when empty), for #86; Q4 `__grok/icon-180.png` untouched, Grok builder assets out of
    scope for #84.
