# Personal Finance spec (#84 v1.1, #85 v1.2 income, #86 v1.3 equity cover; later #87 foreign currency)

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
| 2026-10-11, ≈ 12:55 ET | **#85 kickoff (Diego via CoS; EL):** v1.2 adds the **income block** on `/personal-finance` (section 12): people with wages, a bonus rating, an average tax typed and their net; the user picks which incomes count and each person's share; an income table (each line, biweekly, monthly, yearly); `% of income` on the expense lines is wired to the counted net income. Same page, dark shared shell, `localStorage` only, manual entry. Simplest readings taken (not defined in the brief; Q5–Q8, accepted by EL ≈ 13:11 ET): **bonus rating** = the bonus as a % of that person's yearly wages; **net** = gross × (1 − average tax %); **share** per person (applies to every counted line of theirs); **biweekly** = yearly ÷ 26; income in its **own key** `orpheus.finance.income.v1` (the v1.1 expenses key unchanged). Not started: #86 (a typed `Equity to cover` stays an override when #86 lands), #87 (still no currency symbol), Plaid, the dashboard (#71). |
| 2026-10-11, ≈ 13:11 ET | **EL answers on #85 (PR #89 at `9839861`; docs-only commit, no code change):** the four simplest readings accepted as built. **Q5** bonus rating = % of the person's yearly wages. **Q6** one average tax % per person, on wages and bonus alike (net = gross × (1 − tax)). **Q7** one Share (%) per person, applied to each counted line (the `Count wages` / `Count bonus` ticks). **Q8** biweekly = yearly ÷ 26. Not started: #86, #87, #71. |
| 2026-10-11, ≈ 13:54 ET | **#86 kickoff (Diego via CoS; EL):** v1.3 computes `Equity to cover` (section 13). Diego's default: the rate is **half of portfolio ROIC**; 4% is just a number the user can type as the withdrawal rate. Household-level inputs, typed (manual entry, no data source). EL's first formula (monthly expense ÷ (ROIC ÷ 2), and ÷ (withdrawal rate ÷ 2)) disagreed with the issue on two material points (monthly vs yearly; halving a typed withdrawal rate): stopped and reported options A–D. Not started: #87 (still no currency symbol), #94, #90, #71 / #95 (dashboard on hold), Plaid. |
| 2026-10-11, ≈ 13:57 ET | **EL picked option A (formula locked):** two household fields, `Withdrawal rate (%)` and `Portfolio ROIC (%)`. **Rate used** = the typed withdrawal rate; if that field is empty, ROIC ÷ 2. **Equity to cover (calculated)** = the line's **yearly** expense ÷ (rate ÷ 100). A typed `4` is used as 4% (a typed withdrawal rate is never halved). Both typed: the withdrawal rate wins. Neither typed, or a rate of 0: the calculated amount shows `—`. **Q3 now implemented:** a typed `Equity to cover` on a line is an override; the calculated amount is the default while the field is empty; values typed in v1.1 / v1.2 carry over as overrides (no migration). Totals sum each line's override or calculated amount. New key `orpheus.finance.equity.v1`; the expenses and income keys unchanged. Example: Rent 1,000 a month, ROIC 8% (rate 4%) → 12,000 ÷ 0.04 = **300,000**. |
| 2026-10-11, ≈ 14:12 ET | **EL answers on #86 (PR #96 at `5d1523e`; small docs + code amend):** **Q9** a badly typed `Equity to cover` override **falls back to the calculated amount** until it is a valid number (never read as 0; the field check still shows). **Q10** with no usable rate, a line without a valid override contributes **`—`** (not 0); a total shows `—` when any of its lines contributes `—` (a group with no lines stays `0`). **Q11** `Withdrawal rate (%)` stays 0–100; `Portfolio ROIC (%)` may exceed 100 (0 or more, no upper cap); a bad or negative rate is still invalid → no rate (`—`). Not started: #97, #87, #94, #90, #71. |

## 2. The brief (verbatim, issue #84)

> 1. **Lyre mark:** replace the geometric mark with a simple lyre on every page. Same bar, same footer `Orpheus Wisdom`. Prefer shipping with this page/shell work (not a separate PR).
> 2. **Personal Finance page** (dark, shared shell):
>    - **Expenses: Fixed and Variable.** Columns: Name, % of income, % of expenses, Monthly, Yearly, Equity to cover, Account.
>    - Account is a dropdown; user can add a choice.
>    - Totals for Fixed, for Variable, and for both.

> **#85 (verbatim, v1.2):** **Income:** household wages, bonus rating per person, average tax typed, net. User picks
> which incomes count and the share (example: exclude own bonus, 80% of spouse). **Income table:** each line,
> biweekly, monthly, yearly.

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
| Sections | `02`, `Income` (v1.2, section 12); `03`, `Expenses` (was `02` in v1.1) |
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
| Equity cover fields (v1.3, section 13) | `Withdrawal rate (%)`, `Portfolio ROIC (%)`, `Rate used` |
| Field check (rates) | Withdrawal rate: `Enter a percent from 0 to 100.`; Portfolio ROIC: `Enter a number, 0 or more.` (Q11) |
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
- **% of income (v1.2, #85):** the line's monthly amount ÷ the monthly **counted net income** (section 12) × 100,
  one decimal and `%`; `—` while that income is 0 (no people, nothing counted, or all shares 0). Group totals and
  `Total` the same (a total above `100.0%` shows as is). Not an input. (v1.1 showed `—` everywhere.)
- **Equity to cover (v1.3, #86; section 13):** each line's **calculated** amount = its yearly amount ÷ (rate used ÷
  100); the field is an **override** (Q3, implemented): empty → the calculated amount applies and shows in the field
  as its placeholder (dim; `—` with no rate); a valid typed number → it applies, stored as typed; a bad one shows
  `Enter a number, 0 or more.` and the line **falls back to the calculated amount** until fixed (Q9). With no
  usable rate a line without a valid override contributes `—` (Q10). Values typed in v1.1 / v1.2 carry over as
  overrides. (v1.1 / v1.2: a manual amount only.)
- **Account:** a dropdown per line: `—`, the accounts, `Add account…`. Choosing `Add account…` opens an inline
  `New account` field with `Add` and `Cancel` under that line; `Add` trims the name, refuses an empty one
  (`Name the account.`), reuses an existing account with the same name (case-insensitive) instead of a duplicate,
  appends a new one to the shared list (≤ 40 characters, ≤ 50 accounts) and selects it on that line. The account
  list is shared by both groups. An account is never removed in v1.1.
- **Totals:** per group (`Fixed total`, `Variable total`) and for both (`Total`): Monthly, Yearly (Monthly × 12),
  `% of expenses`, `% of income` (as above), Equity to cover = the sum of each line's valid override or calculated
  amount; `—` when any of its lines contributes `—` (Q10; a group with no lines shows `0`). Totals are computed, never inputs.
- **Number format:** grouped with commas, up to two decimals, no trailing zeros (`1,200`, `83.33`); no currency
  symbol: amounts stay unitless until #87 (EL, Q2, decided). Percentages with one decimal.
- **Remove:** each line has a remove button (`Remove expense`); no confirmation (manual data, nothing on a server).

## 6. Storage (v1.1; v1.2 adds the income key, v1.3 the equity key)

- This browser's `localStorage` only. Expenses in `orpheus.finance.expenses.v1` (unchanged from v1.1), income in
  its own key `orpheus.finance.income.v1` (section 12), the two rates in `orpheus.finance.equity.v1` (section 13);
  nothing else. Expenses:
  `{ fixed: Line[], variable: Line[], accounts: string[] }`, `Line = { id, name, amount, per: "month" | "year",
  equity, account }` (strings as typed). Saved on every change; read once after hydration. A missing, malformed or
  over-large value reads as an empty page (never throws). ≤ 100 lines per group.
- No login, never the account, no cookie, no `sessionStorage` / IndexedDB, no server copy, no network request at
  all from the page (no `/api/*`). Another device or browser sees nothing; clearing the site's data clears it.
- **CLS 0 with a restore:** the server renders the hero (`01`, title) and an empty area that is at least the
  viewport tall (so the footer starts below the fold); the browser fills it (v1.2: Income, then Expenses) once
  after reading the keys (v1.3: three).
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

## 9. Questions for EL (all answered: Q1–Q4 ≈ 12:05 ET; Q5–Q8 ≈ 13:11 ET; #86 formula option A ≈ 13:57 ET; Q9–Q11 ≈ 14:12 ET)

- **Q1. Navigation. Decided: (d) URL only, as built.** Not a fourth bar item (ST1-01 stays three items), not a
  third home Platforms line (ST3-03: home stays the hero + two lines).
- **Q2. Currency. Decided:** no currency symbol until #87; amounts stay unitless.
- **Q3. Equity to cover after #86. Decided:** a typed value is an override of the calculated amount for that line;
  the calculated amount is the default when the field is empty. Recorded for #86; no code change in #84.
  **Implemented in #86** (section 13): v1.1 / v1.2 typed values carry over as overrides.
- **Q4. App icon. Decided:** leave `public/__grok/icon-180.png` alone (as built); Grok builder assets are out of
  scope for #84.
- **Q5. Bonus rating (#85). Decided (as built):** the bonus is a % of that person's yearly wages (bonus = wages ×
  rating ÷ 100).
- **Q6. Net (#85). Decided (as built):** one average tax % per person, applied to wages and bonus alike; net =
  gross × (1 − tax ÷ 100).
- **Q7. Share (#85). Decided (as built):** one `Share (%)` per person, applied to each of their counted lines (the
  `Count wages` / `Count bonus` ticks pick the lines).
- **Q8. Biweekly (#85). Decided (as built):** yearly ÷ 26.
- **Formula (#86). Decided: option A** (EL, ≈ 13:57 ET; section 13).
- **Q9. A bad override (#86). Decided:** a badly typed `Equity to cover` falls back to the calculated amount until
  the override is a valid number (not read as 0); the field check still shows under the field.
- **Q10. No usable rate (#86). Decided:** a line without a valid override contributes `—` (not 0); a total shows `—`
  when any of its lines contributes `—`.
- **Q11. Rate range (#86). Decided:** `Withdrawal rate (%)` 0–100; `Portfolio ROIC (%)` 0 or more with no upper cap
  (field check `Enter a number, 0 or more.`); a bad or negative rate is invalid → no rate (`—`).

## 10. Acceptance (PF rows; QA at 360 × 780, 400 × 860, 1024 × 800, 1440 × 900)

Tools: `qa/tools/personal-finance.mjs` (PF-01..09, PF-11..20 and ST1-05), `qa/tools/site-style-regression.mjs` (PF-10: its own
ST6 checks now include `/personal-finance` and the lyre on every page, then every shipped-page tool, `site.mjs`'s
`$313,000` and `release-smoke`).

| ID | Pass when |
|---|---|
| PF-01 | `/personal-finance` renders in the shared dark shell: charcoal page, chalk type, `color-scheme: dark`, the bar (unchanged, no current item: URL only, Q1 (d)) and footer `Orpheus Wisdom`; title `Personal finance · Orpheus Wisdom`; noindex meta + `X-Robots-Tag`; one Analytics script; no painting; status 200; signed out, no flag. |
| PF-02 | Exact copy (sections 4 and 12): `01`, `Personal finance.`, `02`, `Income` with its copy (section 12), `03`, `Expenses`, (v1.3) `Withdrawal rate (%)`, `Portfolio ROIC (%)`, `Rate used` `—` (section 13), `Fixed`, `Variable`, the seven column labels in order, `↳ Add expense` per group, the totals rows; no other text (no instruction text). |
| PF-03 | Lines: add and remove lines in each group; Name, Monthly, Yearly and Equity to cover are inputs with visible labels; typing Monthly fills Yearly × 12 and typing Yearly fills Monthly ÷ 12; the typed value stays as typed; a bad amount shows `Enter a number, 0 or more.` under its field and counts as 0. |
| PF-04 | Percentages: `% of expenses` per line and per group = monthly ÷ the monthly total of both groups (one decimal, `—` at 0), `Total` `100.0%`; `% of income` per line, group and `Total` = monthly ÷ the monthly counted net income (section 12; one decimal), `—` while that income is 0 (v1.2: e.g. the section 12 example's 11,200 a month: Fixed 1,000 → `8.9%`, 250 → `2.2%`, Fixed total `11.2%`, Variable 100 → `0.9%`, Total `12.1%`). |
| PF-05 | Totals: `Fixed total`, `Variable total` and `Total` sum Monthly, Yearly and Equity to cover exactly (e.g. Fixed 1,000 + 250 monthly and Variable 1,200 yearly → Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200); v1.3: Equity to cover sums each line's valid override or calculated amount, `—` when any line contributes `—` (PF-19). |
| PF-06 | Account: a dropdown per line with `—`, the accounts and `Add account…`; adding one (inline `New account`, `Add`) selects it on that line and offers it on every line in both groups; an empty name shows `Name the account.`; a repeat name (any case) reuses the existing account. |
| PF-07 | Storage: everything typed survives a reload (lines, typed amounts as typed, accounts, selections) from `localStorage` keys `orpheus.finance.expenses.v1`, (v1.2) `orpheus.finance.income.v1` and (v1.3) `orpheus.finance.equity.v1` only; no `/api/*` request, no cookie, no `sessionStorage` / IndexedDB write; a new browser context starts empty; a malformed stored value shows an empty page without an error. |
| PF-08 | Layout: phone (360, 400) lines stacked with labels, no horizontal page scroll; wide (1024, 1440) one row per line in column order with the column labels; every control ≥ 44 px tall; AA for every visible text (axe-core too), a ≥ 3:1 focus mark on every Tab stop; proportional figures (no `tnum`). |
| PF-09 | Strict page CLS 0 on cold loads at every width, every shift counted, both empty and with stored lines (v1.2: and people; v1.3: and rates) restored. |
| PF-10 | Logic and shell untouched elsewhere: the calculator `$313,000`, the dashboard content (ST0-05; no diff under `src/components/dashboard/*`, `src/routes/dashboard.tsx`), sign-in, home (hero + two lines, ST3-03), the bar's three items (ST1-01), the lyre (ST1-05) and the site-style regression (`qa/tools/site-style-regression.mjs`) pass. |
| PF-11 | (#85) Income copy (section 12.1): `02` `Income`, the person column labels in order, `↳ Add person`, `Remove person`, `Income table` with `Income`, `Biweekly`, `Monthly`, `Yearly`, the line labels `<name> · Wages` / `<name> · Bonus` (`Person <n>` while unnamed) and `Net income`; nothing else. A new page: no people, the table only its `Net income` row at `0`. |
| PF-12 | (#85) People: add and remove; Name, Wages (yearly), Bonus rating (%), Average tax (%) and Share (%) are inputs with accessible labels, Count wages / Count bonus checkboxes (on by default; Share `100` by default); typed values stay as typed; a bad Wages or Bonus rating shows `Enter a number, 0 or more.`, a bad Average tax or Share `Enter a percent from 0 to 100.`, and counts as 0. |
| PF-13 | (#85) Net: each person's `Net (yearly)` = (wages + wages × bonus rating) × (1 − average tax) (e.g. 120,000, 10%, 30% → `92,400`; 80,000, 5%, 25% → `63,000`), shown whatever is counted. |
| PF-14 | (#85) Counted and share: each income line counts its net × the person's share when its box is ticked, 0 when not; the section 12 example (own bonus excluded, spouse at 80%) gives the table `84,000` / `0` / `48,000` / `2,400` yearly and `Net income` `134,400` yearly, `11,200` monthly, `5,169.23` biweekly. |
| PF-15 | (#85) Income table: one row per person per line (Wages, then Bonus) in people order, Biweekly = yearly ÷ 26, Monthly = yearly ÷ 12, Yearly; `Net income` sums them; up to two decimals, no currency symbol (Q2). |
| PF-16 | (#85) `% of income` wired: changing a share, a box, a tax or wages updates every expense line's and total's `% of income` at once (PF-04); with no counted income they show `—`; income survives a reload from `orpheus.finance.income.v1` (malformed → no people, no error); layout, AA, 44 px controls (checkbox rows included) and CLS as PF-08 / PF-09. |
| PF-17 | (#86) Equity cover copy and inputs (section 13): under `03` `Expenses`, before `Fixed`: `Withdrawal rate (%)` and `Portfolio ROIC (%)` (inputs, visible labels, empty on a new page) and `Rate used` (computed: `—` on a new page); typed values stay as typed; a bad or out-of-range withdrawal rate shows `Enter a percent from 0 to 100.`, a bad or negative ROIC `Enter a number, 0 or more.` (alert, `aria-invalid`; Q11: ROIC above 100 is valid, e.g. `150` → `Rate used` `75%`); an invalid rate is no rate (`—`). |
| PF-18 | (#86) Formula A: rate used = the typed withdrawal rate, else ROIC ÷ 2; a typed withdrawal rate is used as typed (never halved) and wins when both are typed; calculated `Equity to cover` = the line's yearly amount ÷ (rate ÷ 100); e.g. ROIC `8` → `Rate used` `4%`, Rent 1,000 a month → `300,000`, Phone 250 a month → `75,000`, Gifts 1,200 a year → `30,000`; then withdrawal rate `5` → `5%`, `240,000` / `60,000` / `24,000`; neither typed, or a rate of 0 → `—`. |
| PF-19 | (#86, Q3 implemented) Override: an empty `Equity to cover` shows the calculated amount as the field's placeholder (dim, AA) and uses it; a valid typed value replaces it on that line only (stored as typed); a bad one shows `Enter a number, 0 or more.` and the line falls back to the calculated amount (Q9; e.g. ROIC 8, Rent `abc` → Fixed `375,000`); clearing it brings the calculated amount back; totals sum each line's valid override or calculated amount (e.g. ROIC 8, Rent override `250,000`: Fixed `325,000`, Variable `30,000`, Total `355,000`); with no usable rate a line without a valid override contributes `—` and so does its total and `Total` (Q10; e.g. no rate, Rent `250,000`, Phone and Gifts empty → `—` / `—` / `—`; every line overridden → the sum); a v1.1 / v1.2 stored line with a typed amount restores as an override. |
| PF-20 | (#86) The rates survive a reload from `orpheus.finance.equity.v1` (malformed → both empty, no error); changing either rate updates every line's placeholder and every total at once; layout (phone: the two fields stacked full width, then `Rate used`; wide: one row of three), 44 px controls, AA, focus ring and CLS as PF-08 / PF-09. |

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

- **#85, Personal Finance v1.2 income (PR #89, draft, 2026-10-11).** `src/components/personal-finance/income-block.tsx`
  (people, income table), `pf-cells.tsx` (the shared `Cell` and section head), `src/lib/finance/income.ts` (pure:
  percent reading, net, counted lines, biweekly ÷ 26, the income key); `expenses-page.tsx` reads both keys and passes
  the counted net income a month to the expenses (`% of income`). Checks: `src/lib/finance/income.test.ts`,
  `expenses-page.dom.test.tsx`, `site.test.ts`, `qa/tools/personal-finance.mjs` (PF-11..16 added) and
  `qa/tools/site-style-regression.mjs` (the empty page's copy). Preview at `9839861`: regression 318/318, every tool
  green (`personal-finance.mjs` 169/169), `$313,000`, strict CLS 0. In QA.
  - **EL answers (2026-10-11, ≈ 13:11 ET; docs-only commit, no code change):** Q5–Q8 accepted as built: bonus
    rating = % of yearly wages; one average tax % per person on wages and bonus; one Share (%) per person on each
    counted line; biweekly = yearly ÷ 26.

- **#86, Personal Finance v1.3 equity cover (PR #96, draft, 2026-10-11).** Formula A (section 13). Built on
  `feat/personal-finance-equity-cover` off `23febbf`; checks: `src/lib/finance/equity.test.ts`,
  `expenses.test.ts`, `expenses-page.dom.test.tsx`, `site.test.ts`, `qa/tools/personal-finance.mjs` (PF-17..20) and
  `qa/tools/site-style-regression.mjs` (the empty page's copy). PR #96 (draft); preview at `5d1523e`: regression
  318/318, `personal-finance.mjs` 189/189, `$313,000`, strict CLS 0. In QA.
  - **EL answers (2026-10-11, ≈ 14:12 ET; small docs + code amend):** Q9 a bad override falls back to the
    calculated amount; Q10 no usable rate → a line without a valid override contributes `—`, and so does its total;
    Q11 ROIC may exceed 100 (withdrawal rate stays 0–100).

## 12. Income (v1.2, #85)

### 12.1 Copy (exact)

| Where | String |
|---|---|
| Section | `02`, `Income` (the expenses section becomes `03`, `Expenses`) |
| Person column labels, in order | `Name`, `Wages (yearly)`, `Bonus rating (%)`, `Average tax (%)`, `Net (yearly)`, `Count wages`, `Count bonus`, `Share (%)` |
| Add / remove a person | `↳ Add person`; `Remove person` (`aria-label`) |
| Table (`h3`) and its column labels | `Income table`; `Income`, `Biweekly`, `Monthly`, `Yearly` |
| Table line labels | `<name> · Wages`, `<name> · Bonus` (`<name>` as typed, trimmed; `Person <n>` while empty, n = the person's position) |
| Table total (row label) | `Net income` |
| Field check (Wages, Bonus rating) | `Enter a number, 0 or more.` |
| Field check (Average tax, Share) | `Enter a percent from 0 to 100.` |

No other text (ST6-02). Amounts unitless (Q2), the section 5 number format; the `(%)` fields are typed as plain
numbers (`30`, not `30%` or `0.3`).

### 12.2 Rules (the simplest reading of the brief; Q5–Q8 decided by EL, 2026-10-11 ≈ 13:11 ET)

- **People:** a list (≤ 20); a new person has every field empty except Share `100`, both boxes ticked. Remove has
  no confirmation. Text fields are stored as typed (≤ 80 characters for Name, ≤ 40 for the numbers).
- **Wages (yearly):** the person's gross yearly wages, typed (section 5 amount reading: commas dropped, empty 0).
- **Bonus rating (%):** the person's bonus as a percent of their yearly wages: bonus = wages × rating ÷ 100
  (0 or more; may exceed 100). (Q5, decided)
- **Average tax (%):** one average rate for the person, 0–100, applied to wages and bonus alike. **Net** =
  gross × (1 − tax ÷ 100). (Q6, decided)
- **Net (yearly):** computed per person: (wages + bonus) × (1 − tax ÷ 100), before any choice below.
- **Which incomes count:** two lines per person, Wages and Bonus, each with its own box (`Count wages`,
  `Count bonus`). **Share (%):** one per person, 0–100, applied to each of their counted lines (the brief's example:
  untick own `Count bonus`; spouse Share `80`). (Q7, decided)
- **Counted** amount of a line = its net × share ÷ 100 when its box is ticked, else 0.
- **Income table:** every line of every person in order (Wages, then Bonus), showing its counted amount: Yearly,
  Monthly = Yearly ÷ 12, **Biweekly = Yearly ÷ 26** (26 pay periods a year; not 24, which is semi-monthly) (Q8, decided).
  `Net income` = the sum (Yearly, Monthly, Biweekly). This counted net income is what `% of income` divides by
  (section 5).
- A bad field shows its check under the field (alert colour, `aria-invalid`) and reads as 0 (a bad Share reads as
  0, so that person counts nothing until fixed).
- **Example (QA):** Person 1 `Me`: wages `120,000`, bonus `10`, tax `30`, share `100`, `Count bonus` unticked;
  Person 2 `Spouse`: wages `80,000`, bonus `5`, tax `25`, share `80`. Net (yearly): `92,400`, `63,000`. Table
  (yearly / monthly / biweekly): `Me · Wages` 84,000 / 7,000 / 3,230.77; `Me · Bonus` 0 / 0 / 0; `Spouse · Wages`
  48,000 / 4,000 / 1,846.15; `Spouse · Bonus` 2,400 / 200 / 92.31; `Net income` 134,400 / 11,200 / 5,169.23.

### 12.3 Storage

- `localStorage` key `orpheus.finance.income.v1`: `{ people: Person[] }`, `Person = { id, name, wages, bonus, tax,
  share, countWages, countBonus }` (the numbers as typed strings, the boxes booleans). Saved on every change, read
  once after hydration with the expenses key; missing, malformed or over-large reads as no people (never throws).
  The v1.1 expenses key and its shape are unchanged (no migration).

### 12.4 Layout

- `02` `Income` above `03` `Expenses`, the same `.pf-*` look (underline fields, 12 px dim labels, 44 px controls,
  chalk focus ring, AA, proportional figures). Checkboxes: native, `accent-color` chalk, in a ≥ 44 px tall cell.
- **Phone:** a person is a block: `Name` with the remove button beside it; `Wages (yearly)` | `Bonus rating (%)`;
  `Share (%)` | `Average tax (%)` (the wider right cell, so its label stays on one line at 360 px); `Count wages` |
  `Count bonus`; `Net (yearly)`. A table line: its label, then
  `Biweekly` | `Monthly` | `Yearly` labelled cells. **Wide (from 1024 px):** one row per person in the column order of
  12.1 under a column-label row; the table one row per line under `Income` / `Biweekly` / `Monthly` / `Yearly`.

## 13. Equity cover (v1.3, #86; EL option A, ≈ 13:57 ET)

### 13.1 Copy (exact)

| Where | String |
|---|---|
| Fields (visible labels, every width) | `Withdrawal rate (%)`, `Portfolio ROIC (%)` |
| Computed (visible label) | `Rate used`: the rate as a percent (`4%`, `3.75%`: up to two decimals) or `—` |
| Field check | `Enter a percent from 0 to 100.` |

No heading of its own and no other text (ST6-02): the three cells sit at the top of `03` `Expenses`, before `Fixed`.
Percents are typed as plain numbers (`8`, not `8%` or `0.08`), like section 12.

### 13.2 Formula (locked)

- Two **household-level** inputs, typed (manual entry; no ROIC data source, the dashboard untouched):
  `Withdrawal rate (%)` (0–100, the section 12 percent reading) and `Portfolio ROIC (%)` (0 or more, no upper cap,
  Q11). A bad one (or a negative one) shows its field check and is no rate.
- **Rate used** = the typed withdrawal rate when its field is not empty (used as typed: `4` is 4%, never halved; it
  wins when both are typed); else **ROIC ÷ 2** (Diego's default: half of portfolio ROIC). A rate of 0 (or a bad
  field, or neither typed) means no rate: `Rate used` `—`.
- **Calculated `Equity to cover`** of a line = the line's **yearly** amount ÷ (rate used ÷ 100); `—` with no rate.
- **Override (Q3):** a `Equity to cover` field holding a valid number is the line's amount (as typed); an empty
  (or blank) field, or a bad one (Q9: the field check shows, the line falls back), uses the calculated amount, shown in the field as its placeholder (dim, `--color-dim`,
  7.22:1 on charcoal). Clearing the field brings the calculated amount back. v1.1 / v1.2 typed values are
  overrides as they stand (no migration).
- **Totals** add each line's valid override or calculated amount. With no usable rate a line without a valid
  override contributes `—`, and any total containing such a line shows `—` (Q10); a group with no lines shows `0`.
- **Example (QA):** Rent 1,000 a month (12,000 a year), Phone 250 a month (3,000), Gifts 1,200 a year.
  ROIC `8` → rate 4%: Rent **300,000**, Phone 75,000, Gifts 30,000. Withdrawal rate `5` too → 5% wins: 240,000,
  60,000, 24,000. Withdrawal rate `4` alone → 4% (not 2%): 300,000. Rent override `250,000` with ROIC `8`: Fixed
  325,000, Variable 30,000, Total 355,000. Rent `abc` with ROIC 8 → Rent falls back to 300,000 (Fixed 375,000).
  No rate, Rent `250,000`, Phone and Gifts empty → every total `—`. ROIC `150` → rate 75%.

### 13.3 Storage

- `localStorage` key `orpheus.finance.equity.v1`: `{ withdrawal: string, roic: string }` (as typed, ≤ 40 characters
  each). Saved on every change, read once after hydration with the other two keys; missing, malformed or over-large
  reads as both empty (never throws). The expenses and income keys and their shapes are unchanged.

### 13.4 Layout

- **Phone (below 640 px):** `Withdrawal rate (%)`, `Portfolio ROIC (%)`, `Rate used` stacked, each full width.
  **From 640 px:** one row of three cells (each ≤ 16rem). The `.pf-*` look (underline fields 44 px, 12 px dim
  labels, chalk focus ring, AA, proportional figures); labels visible at every width.
