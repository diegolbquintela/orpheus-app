# Personal Finance spec (#84 v1.1, #85 v1.2 income, #86 v1.3 equity cover, #87 v1.4 foreign currency, #94 Overview and Update, #102 account + foreign income)

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
| 2026-10-11, ≈ 15:15 ET | **#97 (Diego via CoS; EL; site-style spec):** **Q1 (d) superseded for navigation:** `Personal finance` is a first-class bar item on every page (the fourth item, right of `Dashboard`; current on `/personal-finance`) and the third home Platforms line (`Income, expenses, and the cover.` · `Open`). The URL still works. This page's content, storage and layout are unchanged by #97 (#87 / #94 later). |
| 2026-10-11, ≈ 16:03 ET | **#87 kickoff (Diego via CoS; EL):** v1.4 adds a **foreign-currency line** (section 14): a line can take a **typed exchange rate** (BRL example) and converts into the **household currency** for the totals, `% of expenses`, `% of income` and `Equity to cover`. Manual entry only (no live FX feed, no Plaid). The issue is thin; simplest readings taken, as built, open for EL (Q12–Q16): one household-level `Household currency` (a fixed list of ten ISO codes, default `USD`), set once above `02` `Income`; each expense line has a `Currency` (default: the household currency) and, when foreign, a typed `FX rate` = **household-currency units per 1 unit of the line's currency** (household = line amount × rate; `1 BRL = 0.2 USD` → type `0.2`); a foreign line with an empty, bad or 0 rate shows `Enter a number above 0.` and counts as 0 (like a bad amount); `Monthly` / `Yearly` stay in the line's own currency as typed, every figure built from them (totals, both percentages, `Equity to cover`) is in the household currency; an `Equity to cover` override is typed in the household currency; income is in the household currency (unchanged). Amounts stay unitless (Q2 kept: the household currency is named once, by its field). Storage: the expenses key `orpheus.finance.expenses.v1` keeps its name, each line gains optional `currency` / `rate` strings (an old line reads as a household line; nothing rewritten until the next edit); the household currency in a new key `orpheus.finance.currency.v1`. Income and equity formulas unchanged (they consume converted amounts). Not started: #94, #98, #90, #71, Plaid. |
| 2026-10-11, ≈ 16:26 ET | **EL answers on #87 (PR #100 at `1d6d1a4`; docs + code amend):** **Q12** decided as built: household amount = line amount × `FX rate` (rate = household units per 1 unit of the line's currency). **Q13** decided (Diego): the default household currency is **`CAD`** (was `USD`); the ten-code list stays; a missing, malformed or unknown `orpheus.finance.currency.v1` reads as `CAD`. **Q14** decided: the field check `Enter a number above 0.` stays; a foreign line without a valid rate contributes **`—`** (not 0) to every household-converted figure: its `% of expenses` / `% of income` / calculated `Equity to cover`, and any group / `Total` Monthly, Yearly and Equity to cover containing it (then every `% of expenses` divides by a `—` total and shows `—`; the Q10 pattern); a valid `Equity to cover` override on that line still counts; the line's own `Monthly` / `Yearly` still show the typed amount. **Q15** decided as built: no currency symbol on amounts, no converted-amount column, the household field names the currency once. **Q16** decided as built: one rate per line. Not started: #94, #98, #90, #71. |
| 2026-10-11, ≈ 16:55 ET | **#94 kickoff (Diego via CoS; EL):** **Overview and Update** on `/personal-finance` (section 15), after `03` Expenses: `04` `Overview` (this month against the **12-month average**; a chart with three lines, Expenses, Income and Net assets; a `Future` toggle with **1, 5, 10, 15 years**; a typed `Growth rate (%)`: net assets compound at it as if the surplus were invested; future expenses and income stay on the 12-month average; **empty months use the average**) and `05` `Update` (a `Month` dropdown of the last 12 months **including the current one**; type a past month's expenses and income, e.g. June 2026 in October 2026; the month updates the average). Manual entry, this browser only, new key `orpheus.finance.overview.v1`; the other four keys unchanged; household currency, unitless (Q2 / Q15). The brief is thin; simplest readings taken, as built, open for EL (Q17–Q23): a month's figure = its typed value, else (current month only) the page's monthly figures (`Total` monthly from `03`, `Net income` monthly from `02`) when above 0; the 12-month average = the mean of the months that have a figure; net assets = a typed `Starting net assets` (empty 0) at the start of the 12-month window, plus each month's surplus (income − expenses; no growth on past months); under Future each month compounds at (1 + growth)^(1/12) and adds the average surplus. Chart: the repo's `recharts` (already used by the calculator), two y axes (monthly flows left, net assets right). Not started: #98, #90, #71 (dashboard on hold), Plaid. |
| 2026-10-11, ≈ 17:14 ET | **EL on #94 (PR #101 at `0ec697d`; docs-only commit, no code change):** Q17–Q23 accepted as built (section 9): typed Update figure wins, else the current month takes the page's monthly totals when > 0, past months empty → the average (Q17); average = mean of only the months with a figure (Q18); net assets = typed `Starting net assets` (empty 0), no growth on past months (Q19); Future compounds monthly on the whole balance at (1 + rate/100)^(1/12) plus the average surplus (Q20); future Expenses / Income stay on the averages, no future-expenses field (Q21); dual axis, Expenses alert red, Income green, Net assets off-white, no gold (Q22); Overview stays `04` after Expenses (Q23). Q19 wording settled at ≈ 17:16 ET (next row). |
| 2026-10-11, ≈ 17:16 ET | **EL on #94 Q19 (PR #101 at `ad8970d`; docs-only, no code change): option A.** Net assets may go negative over time when expenses exceed income; the `Starting net assets` field stays 0 or more (as built). The earlier "negatives allowed" note is resolved; nothing pending on Q17–Q23. |
| 2026-10-11, ≈ 18:42 ET | **#102 QA D1 (BLOCKING, Phase 1 FAIL): open redirect via `?next=`.** `https://evil.example`, `//evil.example` and `/calculator` reached the page and, after sign-in, the browser (the router keeps unvalidated search params, so the route's own check was bypassed). Fixed: `safeNext` allowlist (exactly `/personal-finance`, else `/dashboard`) on load and post-auth; section 16.4 and PF-34 made exact; tests: `next.test.ts`, check-dashboard-built, personal-finance.mjs (faked sign-in). |
| 2026-10-11, ≈ 17:48 ET | **#102 kickoff (Diego via CoS; EL):** extends #87 (section 16). **(1) Rate direction changes for every FX rate on the page:** a rate is now **units of the foreign currency per 1 unit of the household (master) currency** (label e.g. `FX rate (BRL per 1 CAD)`; `3.70` means 3.70 BRL = 1 CAD); **household amount = foreign amount ÷ rate** (was × rate, Q12 superseded). **Migration:** stored v1 expense lines carry the old direction unambiguously (the key itself says v1), so they are **inverted once** (rate → 1 ÷ rate, 6 decimals, trailing zeros dropped; a bad / empty rate kept as typed) into the bumped key `orpheus.finance.expenses.v2`. **(2) Foreign income:** each person (= an income line in this model; the issue's "person or income line") gets a `Foreign` box; ticked, it shows `Currency`, `FX rate (<code> per 1 <household>)` and `Converted (yearly)` (the person's Net ÷ rate); the income table, `Net income`, `% of income` and the Overview use the converted figure. #87's expense-line `Currency` / `FX rate` stay (new direction). **(3) Sign-in required:** `/personal-finance` is for signed-in users only; signed out → 307 to `/dashboard/sign-in?next=/personal-finance` (the existing Better Auth email/password and the dashboard's server session check; no second auth system; #90 untouched). **(4) Account persistence:** the five PF values are stored against the account (`personal_finance` table, `GET` / `PUT` / `DELETE /api/personal-finance`), so another device loads the same data; this browser's old `localStorage` values are imported once into an empty account, then removed. Simplest readings, open for EL: Q24–Q31. |

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
- **Navigation (#97; supersedes Q1 (d), URL only):** `Personal finance` is the bar's fourth item (right, after
  `Dashboard`; ST1-01) and is current (chalk, underlined, `aria-current="page"`) on this page; home's third
  Platforms line (`Personal finance` · `Income, expenses, and the cover.` · `Open`, ST3-03). The URL still works.
- **Sign-in required (#102, section 16.4):** signed out (or where sign-in can't run), `GET /personal-finance` answers
  **307** to `/dashboard/sign-in?next=/personal-finance`; after signing in the sign-in page returns there. The bar
  item and home line stay (they lead to sign-in when signed out).

## 4. Exact copy (tests and QA compare these strings)

| Where | String |
|---|---|
| Numeral + title (`h1`) | `01`, `Personal finance.` |
| Sections | `02`, `Income` (v1.2, section 12); `03`, `Expenses` (was `02` in v1.1); `04`, `Overview` and `05`, `Update` (#94, section 15) |
| Groups (`h3`) | `Fixed`, `Variable` |
| Column labels, in order | `Name`, `% of income`, `% of expenses`, `Monthly`, `Yearly`, `Currency`, `FX rate`, `Equity to cover`, `Account` (v1.4 adds `Currency` and `FX rate`, section 14) |
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
| Household currency (v1.4, section 14) | label `Household currency`; choices the codes `USD`, `CAD`, `EUR`, `GBP`, `BRL`, `MXN`, `CHF`, `JPY`, `AUD`, `CNY`; default `CAD` (Q13) |
| Line currency (v1.4) | `Currency`: the household code first, then the other nine codes in the same order |
| Field check (FX rate, v1.4) | `Enter a number above 0.` |
| Not computed yet | `—` (also the `FX rate` cell of a line in the household currency) |
| Foreign income (#102, section 16) | `Foreign` (a box per person); ticked: `Currency`, `FX rate (<code> per 1 <household>)`, `Converted (yearly)` |
| Expense-line FX rate's accessible name (#102) | `FX rate (<code> per 1 <household>)` (the visible column label stays `FX rate`) |
| Save failure (#102, only when a save fails) | `Not saved.` |

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
- **Currency / FX rate (v1.4, #87; section 14):** `Monthly` / `Yearly` are typed in the line's `Currency`; every
  figure below uses the line's amount **in the household currency** (÷ its `FX rate` on a foreign line since #102,
  × 1 on a household line). A foreign line with no valid rate contributes `—` to each of them, and to any total containing it,
  until fixed (Q14, decided).
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
  symbol: amounts stay unitless (EL, Q2, decided; kept in v1.4, Q15: the household currency is named once by its
  field, a line's own currency by its `Currency` cell). Percentages with one decimal.
- **Remove:** each line has a remove button (`Remove expense`); no confirmation (manual data).

## 6. Storage (v1.1; v1.2 adds the income key, v1.3 the equity key, v1.4 the currency key, #94 the overview key; #102: the account)

**Since #102 (section 16.5) the five values below live against the signed-in account, not in `localStorage`;** the
key names are the value names inside the account's record, and `orpheus.finance.expenses.v1` becomes
`orpheus.finance.expenses.v2` (rates in the new direction). The paragraphs below describe the values' shapes
(v1.1–#94 history); where they say `localStorage`, read "the account" from #102 on.


- This browser's `localStorage` only. Expenses in `orpheus.finance.expenses.v1` (unchanged from v1.1), income in
  its own key `orpheus.finance.income.v1` (section 12), the two rates in `orpheus.finance.equity.v1` (section 13),
  the household currency in `orpheus.finance.currency.v1` (section 14), the Overview / Update entries in
  `orpheus.finance.overview.v1` (section 15); nothing else. Expenses:
  `{ fixed: Line[], variable: Line[], accounts: string[] }`, `Line = { id, name, amount, per: "month" | "year",
  equity, account, currency?, rate? }` (strings as typed; v1.4 adds the optional `currency` and `rate`, section 14.3). Saved on every change; read once after hydration. A missing, malformed or
  over-large value reads as an empty page (never throws). ≤ 100 lines per group.
- (v1.1–#94, superseded by #102:) no login, never the account, no cookie, no `sessionStorage` / IndexedDB, no server
  copy, no network request at all from the page (no `/api/*`). Since #102: the page's only requests are the session
  and `/api/personal-finance` (section 16.5); another device signed in to the same account sees the same data.
- **CLS 0 with a restore:** the server renders the hero (`01`, title) and an empty area that is at least the
  viewport tall (so the footer starts below the fold); the browser fills it (v1.2: Income, then Expenses) once
  after reading the keys (v1.3: three).
  Nothing on screen moves: the strict page CLS of 0 (site-style ST6-06) holds on this page too.

## 7. Layout (mobile first, the site's dark tokens)

- No painting: a plain header band under the bar, `01` (12 px dim) and the `h1` (32 px on a phone, 44 px from
  1024, chalk, weight 400), the content column `max-w-6xl` like the calculator.
- **Phone (below 1024 px):** each line is a block: `Name` full width with the remove button beside it, then a
  two-column grid of labelled cells: `Monthly` | `Yearly`, (v1.4) `Currency` | `FX rate`, `% of expenses` |
  `% of income`, `Account` |
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

## 9. Questions for EL (Q1–Q11 answered: Q1–Q4 ≈ 12:05 ET; Q5–Q8 ≈ 13:11 ET; #86 formula option A ≈ 13:57 ET; Q9–Q11 ≈ 14:12 ET; Q12–Q16 ≈ 16:26 ET, #87; Q17–Q23 ≈ 17:14 ET, #94)

- **Q1. Navigation. Decided: (d) URL only, as built. Superseded by #97 (2026-10-11): a bar item and a home line.** Not a fourth bar item (ST1-01 stays three items), not a
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
- **Q12. Rate direction (#87). Decided (as built):** `FX rate` = household-currency units per **1** unit of the
  line's currency; household amount = line amount × rate (household `CAD`, a `BRL` line, `1 BRL = 0.2 CAD` → `0.2`).
- **Q13. Household currency (#87). Decided (Diego):** default **`CAD`** (built as `USD`, changed); the ten-code list
  stays (`USD`, `CAD`, `EUR`, `GBP`, `BRL`, `MXN`, `CHF`, `JPY`, `AUD`, `CNY`); a missing, malformed or unknown stored
  value reads as `CAD`.
- **Q14. A foreign line without a valid rate (#87). Decided:** the field check `Enter a number above 0.` stays; the
  line contributes **`—`** (not 0) to every household-converted figure (its `% of expenses`, `% of income` and
  calculated `Equity to cover`) and to any total containing it (Monthly, Yearly, Equity to cover; the Q10 pattern);
  the line's own `Monthly` / `Yearly` still show the typed amount (built as 0, changed).
- **Q15. Symbols and what the line shows (#87). Decided (as built):** no currency symbol on amounts (Q2 kept), no
  converted-amount column; the household field names the currency once; a line's `Monthly` / `Yearly` in its own
  currency; totals, both percentages and `Equity to cover` (calculated and a typed override) in the household one.
- **Q16. One rate per line (#87). Decided (as built):** each foreign line carries its own typed rate.
- **Q17. A month's figure (#94). Decided (EL ≈ 17:14 ET, as built):** a month's Expenses / Income = the value typed
  in `05` `Update` (typed wins); else, for the **current month only**, the page's own monthly figure (`Total` Monthly of
  `03`, `Net income` Monthly of `02`) when it is above 0; else the month is **empty** and filled with the average.
- **Q18. The 12-month average (#94). Decided (as built):** the mean of only the months (of the 12) that have a
  figure, not always ÷ 12; `—` when none has. Empty months use it (chart and Future), so they don't move it.
- **Q19. Net assets (#94). Decided (as built):** a typed `Starting net assets` (empty = 0) is the value at the start
  of the oldest month; each month adds its surplus (income − expenses); no growth on past months. Net assets may go
  below 0 over time when expenses exceed income (negative surpluses); the typed `Starting net assets` field stays 0 or
  more (a negative shows `Enter a number, 0 or more.` and counts as 0). EL option A, ≈ 17:16 ET.
- **Q20. Future (#94). Decided (as built):** the `Future` toggle (off on a new page) adds 1, 5, 10 or 15 years
  (default 1) of months after the current one; net assets compound monthly on the **whole balance**: each month =
  previous × (1 + growth ÷ 100)^(1/12) + the average surplus.
- **Q21. "Expenses stay on the 12-month figure unless changed" (#94). Decided (as built):** future Expenses and
  Income stay on the 12-month averages (they change only when a month or the page changes); no separate
  future-expenses field.
- **Q22. Chart (#94). Decided (as built):** `recharts`; dual axis (monthly Expenses / Income left, Net assets right);
  Expenses `alert` red, Income `green`, Net assets `chalk` (off-white); a visible legend; the plot `aria-hidden`; no gold.
- **Q23. Placement (#94). Decided (as built):** `04` `Overview` and `05` `Update` stay after `03` `Expenses`.

- **Q24. Where `Foreign` lives (#102). Open; default as built:** on each **person** (the income line in this
  model: a person's Wages and Bonus lines share the person's currency); expense lines keep #87's `Currency` select
  (no box). Or a box on expense lines too, or per table line (Wages vs Bonus)?
- **Q25. The foreign person's currency (#102). Open; default as built:** ticking `Foreign` shows a `Currency` select
  (the nine non-household codes; default the first, `USD` under `CAD`) besides the brief's two fields, because the
  rate label names the code. Or a fixed currency?
- **Q26. `Converted` (#102). Open; default as built:** `Converted (yearly)` = the person's `Net (yearly)` ÷ rate
  (household currency), a computed value; Wages / Bonus / Net stay in the person's currency as typed. The income
  table, `Net income`, `% of income` and the Overview use converted figures; no valid rate → `—` there (the Q14
  pattern).
- **Q27. Migration (#102). Open; default as built:** stored v1 expense rates are inverted once (1 ÷ rate, 6
  decimals) into `expenses.v2`; bad / empty rates kept as typed. Or clear foreign rates instead?
- **Q28. Old browser data (#102). Open; default as built:** on the first signed-in visit, if the account has no
  Personal Finance record and this browser holds the old `localStorage` values, they are imported into the account
  (rates migrated) and removed from the browser; if the account already has a record, the browser's old values are
  ignored and left untouched. Or never import?
- **Q29. Saving (#102). Open; default as built:** every change saves the whole record (debounced 400 ms, flushed on
  leaving the page); last write wins across devices (no merge); a failed save shows `Not saved.` (alert) under the
  title and retries on the next change. The page reads the account once per load (no live sync between open tabs).
- **Q30. Sign-in path (#102). Open; default as built:** the existing Better Auth email/password and sign-in page
  (`/dashboard/sign-in`, now with `?next=/personal-finance`), sign-up still limited to `DASHBOARD_SIGNUP_ALLOWLIST`,
  the API behind the same `DASHBOARD_ENABLED` server flag as `/api/auth/*` (on in production and previews today).
  No sign-out control on this page (#90's account menu). Or a Personal-Finance-only flag?
- **Q31. Household currency label (#102). Open; default as built:** the brief's "master currency" is the existing
  `Household currency` field (label unchanged). Or relabel `Master currency`?

## 10. Acceptance (PF rows; QA at 360 × 780, 400 × 860, 1024 × 800, 1440 × 900)

Tools: `qa/tools/personal-finance.mjs` (PF-01..09, PF-11..32 and ST1-05), `qa/tools/site-style-regression.mjs` (PF-10: its own
ST6 checks now include `/personal-finance` and the lyre on every page, then every shipped-page tool, `site.mjs`'s
`$313,000` and `release-smoke`).

| ID | Pass when |
|---|---|
| PF-01 | (#102: signed in; signed out → PF-33) `/personal-finance` renders in the shared dark shell: charcoal page, chalk type, `color-scheme: dark`, the bar (#97: four items, `Personal finance` current; ST1-01 / ST1-02) and footer `Orpheus Wisdom`; title `Personal finance · Orpheus Wisdom`; noindex meta + `X-Robots-Tag`; one Analytics script; no painting; status 200; signed out, no flag. |
| PF-02 | Exact copy (sections 4 and 12): `01`, `Personal finance.`, `02`, `Income` with its copy (section 12), `03`, `Expenses`, (#94) `04` `Overview` and `05` `Update` with their copy (section 15), (v1.3) `Withdrawal rate (%)`, `Portfolio ROIC (%)`, `Rate used` `—` (section 13), (v1.4) `Household currency` `CAD` (Q13), `Fixed`, `Variable`, the nine column labels in order (v1.4: `Currency`, `FX rate` after `Yearly`), `↳ Add expense` per group, the totals rows; no other text (no instruction text). |
| PF-03 | Lines: add and remove lines in each group; Name, Monthly, Yearly and Equity to cover are inputs with visible labels; typing Monthly fills Yearly × 12 and typing Yearly fills Monthly ÷ 12; the typed value stays as typed; a bad amount shows `Enter a number, 0 or more.` under its field and counts as 0. |
| PF-04 | Percentages: `% of expenses` per line and per group = monthly ÷ the monthly total of both groups (one decimal, `—` at 0), `Total` `100.0%`; `% of income` per line, group and `Total` = monthly ÷ the monthly counted net income (section 12; one decimal), `—` while that income is 0 (v1.2: e.g. the section 12 example's 11,200 a month: Fixed 1,000 → `8.9%`, 250 → `2.2%`, Fixed total `11.2%`, Variable 100 → `0.9%`, Total `12.1%`). |
| PF-05 | Totals: `Fixed total`, `Variable total` and `Total` sum Monthly, Yearly and Equity to cover exactly (e.g. Fixed 1,000 + 250 monthly and Variable 1,200 yearly → Fixed 1,250 / 15,000, Variable 100 / 1,200, Total 1,350 / 16,200); v1.3: Equity to cover sums each line's valid override or calculated amount, `—` when any line contributes `—` (PF-19). |
| PF-06 | Account: a dropdown per line with `—`, the accounts and `Add account…`; adding one (inline `New account`, `Add`) selects it on that line and offers it on every line in both groups; an empty name shows `Name the account.`; a repeat name (any case) reuses the existing account. |
| PF-07 | (#102: from the account, PF-36) Storage: everything typed survives a reload (lines, typed amounts as typed, accounts, selections) from `localStorage` keys `orpheus.finance.expenses.v1`, (v1.2) `orpheus.finance.income.v1` and (v1.3) `orpheus.finance.equity.v1`, (v1.4) `orpheus.finance.currency.v1` and (#94) `orpheus.finance.overview.v1` only; no `/api/*` request, no cookie, no `sessionStorage` / IndexedDB write; a new browser context starts empty; a malformed stored value shows an empty page without an error. |
| PF-08 | Layout: phone (360, 400) lines stacked with labels, no horizontal page scroll; wide (1024, 1440) one row per line in column order with the column labels; every control ≥ 44 px tall; AA for every visible text (axe-core too), a ≥ 3:1 focus mark on every Tab stop; proportional figures (no `tnum`). |
| PF-09 | Strict page CLS 0 on cold loads at every width, every shift counted, both empty and with stored lines (v1.2: and people; v1.3: and rates) restored. |
| PF-10 | Logic and shell untouched elsewhere: the calculator `$313,000`, the dashboard content (ST0-05; no diff under `src/components/dashboard/*`, `src/routes/dashboard.tsx`), sign-in, home (hero + three lines since #97, ST3-03), the bar's four items since #97 (ST1-01), the lyre (ST1-05) and the site-style regression (`qa/tools/site-style-regression.mjs`) pass. |
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
| PF-21 | (#87) Currency copy and inputs (section 14.1): `Household currency` (a select, visible label, `CAD` on a new page (Q13), the ten codes in order) above `02` `Income`; each line's `Currency` (the household code first, then the other nine) and `FX rate`: `—` on a household line, an input with its visible label on a foreign line; column labels `Currency`, `FX rate` after `Yearly` (wide); no other text. |
| PF-22 | (#87) Conversion (Q12): a foreign line's household amount = its amount × `FX rate`; household `CAD`, Rent 1,000 / Phone 250 a month and `Condo` 2,000 a month in `BRL` at `0.2` (Fixed), Gifts 1,200 a year (Variable): the Condo fields stay `2,000` / `24,000` (its own currency) while Fixed total `1,650` / `19,800`, Variable `100` / `1,200`, Total `1,750` / `21,000`; Condo `% of expenses` `22.9%`; with the section 12 example's income (11,200 a month) Condo `% of income` `3.6%`, Fixed total `14.7%`, Total `15.6%`. |
| PF-23 | (#87) Equity cover on a foreign line uses the household yearly amount: ROIC `8` (rate 4%) → Condo placeholder `120,000` (4,800 ÷ 0.04), Fixed total `495,000`, Variable `30,000`, Total `525,000`; a typed override is in the household currency as typed (Condo `100,000` → Fixed `475,000`); the formulas of sections 12 and 13 are unchanged. |
| PF-24 | (#87, Q14 decided) A foreign line with an empty, bad (`abc`, `-1`) or `0` rate shows `Enter a number above 0.` under `FX rate` (alert, `aria-invalid`) and contributes `—` (not 0) until fixed: its `% of expenses`, `% of income` and calculated `Equity to cover` (placeholder) show `—`, and so do its group's and `Total`'s Monthly, Yearly, `% of income` and Equity to cover, and every `% of expenses` (the whole is `—`); its own `Monthly` / `Yearly` still show the typed amount (e.g. Condo 2,000 BRL, no rate, ROIC 8: Fixed and Total all `—`, Variable `100` / `1,200` / `30,000`, Rent `% of income` `8.9%`); a valid override on it still counts; switching the line back to the household currency (or making the household currency the line's) drops the rate from the sums (× 1) and keeps it stored. |
| PF-25 | (#87) Storage: the household currency survives a reload from `orpheus.finance.currency.v1` (malformed or unknown code → `CAD`, Q13; no error); each line's `currency` / `rate` from `orpheus.finance.expenses.v1`; a v1.1–v1.3 stored line (no `currency` / `rate`) restores as a household line with its figures unchanged; layout (phone: `Currency` \| `FX rate` under `Monthly` \| `Yearly`; wide: one row, nine columns + remove, no horizontal scroll at 1024), 44 px controls, AA, focus ring and CLS as PF-08 / PF-09 (with a stored foreign line and household currency restored). |
| PF-26 | (#94) Overview / Update copy (section 15.1): `04` `Overview` with the table (`This month`, `12-month average`; `Expenses`, `Income`, `Surplus`; `—` on a new page), `Starting net assets`, `Growth rate (%)`, the `Future` toggle (off; `1 year`, `5 years`, `10 years`, `15 years` only while on), the chart's legend `Expenses`, `Income`, `Net assets`; `05` `Update` with `Month` (12 choices, the current month first, e.g. `October 2026` … `November 2025`), `Expenses`, `Income`; nothing else visible. |
| PF-27 | (#94, Q17 / Q18) This month and the average: with nothing typed and an empty page every figure is `—`; the current month takes the page's `Total` Monthly and `Net income` Monthly when above 0; typing a past month (`June 2026`: Expenses `4,000`, Income `9,000`) updates the 12-month average at once (the mean of the months with a figure: e.g. page 1,750 / 11,200 this month + June → average `2,875` / `10,100`, surplus `9,450` this month, `7,225` average); a typed current month replaces the page figure; clearing a month's fields empties it. |
| PF-28 | (#94) Update: `Month` lists exactly the last 12 months, newest first, current included; choosing a month shows its typed values (empty fields: placeholder = the page figure for the current month, the average for a past one; dim, AA); a bad value shows `Enter a number, 0 or more.` and is not used. |
| PF-29 | (#94) Chart: three lines (Expenses, Income, Net assets) over the 12 months (oldest → current); an empty month plots the average; net assets start at `Starting net assets` and add each month's surplus (Q19; the 15.2 example: start `10,000` → **96,700** at the current month); the plot `aria-hidden`, the legend visible; the figure carries `data-months` (points plotted) and `data-net-last` (the last net assets, 2 decimals) for QA. |
| PF-30 | (#94, Q20 / Q21) Future: the toggle (`aria-pressed`) shows `1 year` … `15 years` (default `1 year`); on, the chart runs 12 × years months past the current one with Expenses and Income flat at the 12-month average and net assets compounding monthly at (1 + `Growth rate (%)` ÷ 100)^(1/12) plus the average surplus (the 15.2 example: growth `5`: 1 year → 24 points, net assets **190,204.37**; 5 years → 72 points, **613,370.68**); off, the chart ends at the current month. A bad growth rate shows `Enter a number, 0 or more.` and counts as 0. |
| PF-31 | (#94) Storage: everything typed in `04` / `05` (starting net assets, growth, Future on / years, each month's expenses / income as typed) survives a reload from `orpheus.finance.overview.v1` only (malformed → all empty, Future off, no error; months outside the last 12 are kept but unused); the other four keys unchanged. |
| PF-32 | (#94) Layout and the shell: phone (360, 400): the table three columns, the fields and the Update fields stacked full width, the year choices wrap, the chart full width (240 px tall); from 640 px the fields in one row (≤ 16rem each); from 1024 px the chart 320 px tall; every control ≥ 44 px, chalk focus ring, AA (axe), no horizontal scroll, strict CLS 0 (empty and restored with months typed and Future on); no gold. |
| PF-33 | (#102) Signed out: `GET /personal-finance` → **307** to `/dashboard/sign-in?next=/personal-finance` (noindex), no Personal Finance data or copy in the response; the browser lands on the sign-in page (dark shell; the bar marks `Dashboard` current, as on every sign-in page); `GET` / `PUT` / `DELETE /api/personal-finance` → **401** JSON; a bad method → 405 JSON; with `DASHBOARD_ENABLED` off → 404 JSON (like `/api/auth/*`). |
| PF-34 | (#102; QA D1) Signing in from `?next=/personal-finance` returns to `/personal-finance`. `next` is an allowlist of exactly one value, the relative same-origin path `/personal-finance` (exact: no query, fragment, trailing slash or case change); every other value (an external URL such as `https://evil.example`, protocol-relative `//evil.example`, any other path such as `/calculator`, empty or missing) is dropped on load (it never appears in the URL, the page or a redirect) and the visitor goes to `/dashboard`, both on load and after sign-in / sign-up; signed in, `/dashboard/sign-in?next=/personal-finance` redirects straight there; the page renders as PF-01..32 with the bar's `Personal finance` current. |
| PF-35 | (#102) Rate direction: every FX rate = foreign units per 1 household unit; household amount = amount ÷ rate. #87 example with rate `5` (5 BRL per 1 CAD): Condo 2,000 BRL → 400 (Fixed 1,650 / 19,800, Total 1,750 / 21,000); the expense FX field's accessible name `FX rate (BRL per 1 CAD)`; no valid rate → `Enter a number above 0.` and `—` (Q14 unchanged). |
| PF-36 | (#102) Account persistence: every change (lines, people, rates, months, Foreign boxes, household currency) is saved to `/api/personal-finance` (`PUT`, the whole record) and a reload restores it from the account; nothing PF stays in `localStorage`; a **second browser context signed in to the same account** (another device) loads the same figures; another account sees its own (empty) record; `?userId=` naming anyone else → 403. A failed save shows `Not saved.` |
| PF-37 | (#102) Foreign income: a person's `Foreign` box (off by default); ticked: `Currency` (nine codes, not the household's), `FX rate (BRL per 1 CAD)`, `Converted (yearly)`. Example: `Brazilian Dividends`, Wages 37,000, tax 0, `Foreign` BRL `3.70` → Net 37,000, Converted **10,000**; with the section 12 people the table's lines and `Net income` use 10,000 for it; % of income and the Overview's income follow; no valid rate → the check, Converted `—`, `Net income` `—`, `% of income` `—`. Unticking keeps the typed currency and rate stored. |
| PF-38 | (#102) Migration: an old browser record (localStorage v1 keys; Condo BRL at the old `0.2`) is imported into an empty account on the first signed-in visit with the rate inverted to `5` (Condo still 400), saved as `orpheus.finance.expenses.v2`, and the old keys are removed from the browser; an account that already has a record ignores the browser's values. |
| PF-39 | (#102) Layout and the shell with a foreign person: phone the `Foreign` box on its own row under `Count wages` | `Count bonus`, the three foreign cells stacked under it (one row from 640 px), `Net (yearly)` last; wide the box as the last person column and the three cells in a row under the person; 44 px controls, chalk focus ring, AA, axe, no horizontal scroll, strict CLS 0 signed in (empty and restored from the account), no gold. |

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

- **#87, Personal Finance v1.4 foreign currency (PR #100, draft, 2026-10-11).** Section 14. Built on
  `feat/personal-finance-fx` off `b6de355`: `src/lib/finance/currency.ts` (codes, household key), `expenses.ts`
  (`currency` / `rate` on a line, `parseRate`, `factorOf`, `householdMonthlyOf` / `householdYearlyOf`; totals and the
  calculated equity on the household amount), `expenses-page.tsx` (`Household currency`, the line's `Currency` /
  `FX rate`), `.pf-currency` / `.pf-fx` / `.pf-household` in `src/styles.css`. Checks: `currency.test.ts`,
  `expenses.test.ts`, `expenses-page.dom.test.tsx`, `qa/tools/personal-finance.mjs` (PF-21..25) and
  `qa/tools/site-style-regression.mjs` (the empty page's copy). In QA.
  - **EL answers (2026-10-11, ≈ 16:26 ET; docs + code amend):** Q12 multiply, as built; Q13 default `CAD` (code
    changed from `USD`); Q14 no valid rate → `—` in every household figure and total containing it (code changed from
    0; the field check stays); Q15 no symbol, no converted column, as built; Q16 one rate per line, as built.

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

## 14. Foreign currency (v1.4, #87; Q12–Q16 decided by EL ≈ 16:26 ET)

### 14.1 Copy (exact)

| Where | String |
|---|---|
| Household field (visible label, a select) | `Household currency`; choices `USD`, `CAD`, `EUR`, `GBP`, `BRL`, `MXN`, `CHF`, `JPY`, `AUD`, `CNY` |
| Line columns (after `Yearly`) | `Currency` (a select: the household code first, then the other nine in the order above), `FX rate` |
| `FX rate` on a household line | `—` (not an input) |
| Field check (`FX rate`) | `Enter a number above 0.` |

No other text (ST6-02): no currency names, no rate hint, no symbol on amounts (Q2 kept, Q15).

### 14.2 Rules

- **Household currency:** one household-level select, default `CAD` (Q13, decided). Income (section 12), every total, both
  percentages and `Equity to cover` are in it. Changing it relabels; it converts nothing (amounts are numbers).
- **Line currency:** each expense line has a `Currency`, default the household currency (stored `""`). A line whose
  currency is the household currency (stored `""`, or the same code) is a **household line**: factor 1, `FX rate`
  shows `—`.
- **Superseded by #102 (section 16.2):** rates are now foreign units per 1 household unit and the household amount
  = amount ÷ rate (`Condo` at `5`); the #87 text below is the history.
- **FX rate (Q12):** on a **foreign line**, a typed number = household-currency units per **1** unit of the line's
  currency, stored as typed (section 5 reading: commas dropped; up to 40 characters). **Household amount = line amount
  × rate.** Example: household `CAD`, `Condo` 2,000 a month in `BRL`, rate `0.2` → 400 a month, 4,800 a year.
- **No valid rate (Q14, decided):** empty, not a number, negative or `0` → `Enter a number above 0.` under the field
  (alert, `aria-invalid`), and the line contributes **`—`** until fixed: its `% of expenses`, `% of income` and
  calculated `Equity to cover` show `—`, and any group / `Total` Monthly, Yearly, `% of income` and Equity to cover
  containing it shows `—` (so every `% of expenses` shows `—`: its whole is `—`; the Q10 pattern). A valid
  `Equity to cover` override on that line still counts (household currency). Its own `Monthly` / `Yearly` fields
  still show the typed amount.
- **What uses the household amount:** `% of expenses`, `% of income`, group and `Total` Monthly / Yearly, the
  calculated `Equity to cover` (yearly household amount ÷ (rate used ÷ 100); section 13 unchanged) and every total of
  it. The line's own `Monthly` / `Yearly` fields stay in its currency (typed as typed, the other one converted × 12 or
  ÷ 12 as in section 5). A typed `Equity to cover` override is in the household currency, as typed (Q15).
- **One rate per line (Q16):** two lines in the same foreign currency each carry their own rate.
- **Example (QA, PF-22 / PF-23):** household `CAD`; Fixed: Rent 1,000 a month, Phone 250 a month, `Condo` 2,000 a
  month `BRL` at `0.2`; Variable: Gifts 1,200 a year. Totals Fixed 1,650 / 19,800, Variable 100 / 1,200, Total
  1,750 / 21,000; Condo `% of expenses` 22.9%. With income 11,200 a month: Condo 3.6%, Fixed total 14.7%, Total 15.6%.
  ROIC `8`: Condo 120,000, Fixed 495,000, Variable 30,000, Total 525,000; Condo override `100,000` → Fixed 475,000.

### 14.3 Storage

- `orpheus.finance.currency.v1`: `{ household: "CAD" }` (one of the ten codes). Missing, malformed or another value
  reads as `CAD` (never throws; Q13). Saved on change, read once after hydration with the other three keys.
- `orpheus.finance.expenses.v1` keeps its name and shape; each `Line` gains optional `currency` (`""` or one of the
  ten codes) and `rate` (as typed, ≤ 40 characters). A stored line without them (v1.1–v1.3) reads as a household
  line, `rate` `""`; an unknown code reads as `""`. Forward-only and idempotent: nothing is rewritten until the next
  edit saves the page as usual. The income and equity keys are unchanged.

### 14.4 Layout

- `Household currency`: one cell (≤ 16rem, the `.pf-*` underline select, 44 px, visible 12 px label) at the top of
  the content area, above `02` `Income`.
- **Phone (below 1024 px):** a line adds the row `Currency` | `FX rate` under `Monthly` | `Yearly`. **Wide (from
  1024 px):** one row, `Currency` and `FX rate` after `Yearly` (nine columns + remove); the totals rows leave those
  two columns empty. No horizontal page scroll at 360 or 1024; AA, 44 px controls, chalk focus ring, CLS 0.

## 15. Overview and Update (#94; Q17–Q23 decided by EL ≈ 17:14 ET, as built)

### 15.1 Copy (exact)

| Where | String |
|---|---|
| Sections | `04`, `Overview`; `05`, `Update` (after `03` `Expenses`, Q23 decided) |
| Overview table: column labels | `This month`, `12-month average` |
| Overview table: row labels | `Expenses`, `Income`, `Surplus` |
| Overview fields | `Starting net assets`, `Growth rate (%)` |
| Future toggle (a button, `aria-pressed`) | `Future` |
| Year choices (while Future is on; buttons, `aria-pressed`) | `1 year`, `5 years`, `10 years`, `15 years` |
| Chart legend | `Expenses`, `Income`, `Net assets` |
| Update fields | `Month` (a select; options `<Month> <yyyy>` in English, e.g. `October 2026`), `Expenses`, `Income` |
| Field check | `Enter a number, 0 or more.` |
| No figure | `—` |

No other visible text (ST6-02). The chart's plot (axes, ticks, lines) is `aria-hidden`; its `figcaption` (screen
readers only) reads `Expenses, income and net assets by month`. Amounts in the household currency, unitless (Q2,
Q15), the section 5 number format.

### 15.2 Rules (Q17–Q23 decided by EL as built)

- **The 12 months:** the current month (the browser's local date) and the 11 before it, oldest → current.
- **A month's figure (Q17):** Expenses / Income = the value typed for that month in `05` `Update` (a valid number,
  section 5 reading; a bad one shows the check and is not used); else, for the current month only, the page's
  `Total` Monthly (`03`) / `Net income` Monthly (`02`) when that is a number above 0 (`—` from Q14 or 0 → no figure);
  else no figure (an **empty month**, filled with the average).
- **12-month average (Q18):** for Expenses and for Income separately, the mean of the 12 months that have a figure;
  `—` when none has. **Empty months use the average** (in the chart and the net assets), so they don't move it.
  Typing a month updates it at once.
- **Overview table:** `This month` = the current month's figures; `12-month average` = the averages; `Surplus` =
  Income − Expenses (`—` when either is `—`; may be negative, shown with a minus).
- **Net assets (Q19):** `Starting net assets` (typed, empty 0, 0 or more) at the start of the oldest month; at the
  end of each month: previous + that month's income − expenses (empty months at the average; `—` from the first month
  where either average is `—`). No growth on past months. Net assets may go negative over time when expenses exceed
  income; the start field stays 0 or more (Q19, EL option A).
- **Future (Q20, Q21):** the `Future` toggle (off on a new page); while on, the year choice (`1 year` by default)
  adds 12 × years months after the current one: Expenses and Income flat at the 12-month averages ("expenses stay on
  the 12-month figure unless changed": they change when a month or the page changes); net assets each month =
  previous × (1 + g ÷ 100)^(1/12) + (average income − average expenses), g = `Growth rate (%)` (empty 0; 0 or more,
  no cap; a bad one shows the check and counts as 0). Off: the chart ends at the current month.
- **Example (QA, PF-27 / PF-29 / PF-30; current month October 2026):** the section 14.2 page (Total 1,750 a month)
  with the section 12 income (Net income 11,200 a month); June 2026 typed `4,000` / `9,000`. This month 1,750 /
  11,200 / surplus 9,450; average (1,750 + 4,000) ÷ 2 = **2,875**, (11,200 + 9,000) ÷ 2 = **10,100**, surplus
  **7,225**. Net assets from `10,000`: ten months at the average surplus 7,225 (Nov 2025 … May, Jul … Sep 2026, i.e.
  the ten empty months), June at 5,000, October at 9,450 → 10,000 + 10 × 7,225 + 5,000 + 9,450 = **96,700**. Future 1
  year, growth `5`: 12 months of × 1.05^(1/12) + 7,225 from 96,700 → **190,204.37**; 5 years → **613,370.68**.

### 15.3 Storage

- `orpheus.finance.overview.v1`: `{ start: string, growth: string, future: boolean, years: 1 | 5 | 10 | 15,
  months: { "<yyyy-mm>": { expenses: string, income: string } } }` (strings as typed, ≤ 40 characters; ≤ 60 months
  kept, newest first). Saved on every change, read once after hydration with the other four keys; missing,
  malformed or over-large reads as all empty, Future off, 1 year (never throws). A month with both fields empty is
  dropped. The other four keys are unchanged.

### 15.4 Layout

- Same `.pf-*` look (12 px dim labels, underline fields 44 px, chalk focus ring, AA, proportional figures).
- **Overview table:** three columns (label, `This month`, `12-month average`) at every width; values 16 px chalk.
- **Fields** (`Starting net assets`, `Growth rate (%)`; Update's `Month`, `Expenses`, `Income`): stacked full width
  below 640 px, one row from 640 px (each ≤ 16rem), like section 13.4.
- **Future:** the toggle and the year choices as 44 px text buttons (chalk; the pressed one underlined); they wrap
  on a phone.
- **Chart:** full width, 240 px tall below 1024 px, 320 px from 1024 px; lines 2 px: Expenses `alert` (#ff8f87),
  Income `green`, Net assets `chalk`; ticks 12 px dim; grid `hair`; legend under it (a 12 px swatch + 14 px chalk
  name each). No gold. The chart sits in a fixed-height box, so nothing moves when it draws (CLS 0).

## 16. Foreign income, rate direction, sign-in and the account (#102; Q24–Q31 open, simplest readings as built)

### 16.1 Copy (exact)

| Where | String |
|---|---|
| Person box (after `Share (%)`; the wide column label too) | `Foreign` |
| Ticked: the foreign cells (visible labels) | `Currency` (a select: the nine codes other than the household's, in section 14 order), `FX rate (<code> per 1 <household>)` (e.g. `FX rate (BRL per 1 CAD)`), `Converted (yearly)` |
| Field check (a person's FX rate) | `Enter a number above 0.` |
| Expense line's FX rate field, accessible name | `FX rate (<code> per 1 <household>)` (visible column / cell label stays `FX rate`) |
| Save failure (under the title, only then) | `Not saved.` |

No other text (ST6-02). Amounts unitless (Q2 / Q15).

### 16.2 Rate direction (supersedes Q12)

- Every FX rate on the page (expense lines and people) = **units of the foreign currency per 1 unit of the household
  currency**; a valid rate is a number above 0 (section 5 reading). **Household amount = foreign amount ÷ rate.**
- Expense example (QA): household `CAD`, `Condo` 2,000 a month `BRL`, rate `5` → 400 a month (the section 14.2
  figures otherwise unchanged: Fixed 1,650 / 19,800, Total 1,750 / 21,000, Condo 22.9%, equity 120,000 at ROIC 8).
- Q14 holds: no valid rate → the check and `—` in every converted figure / total containing it.

### 16.3 Foreign income (Q24–Q26)

- Each person has a `Foreign` box (off for a new person and for every stored person). Ticked: `Currency` (default
  the first code that is not the household's, e.g. `USD` under `CAD`), `FX rate (<code> per 1 <household>)` and the
  computed `Converted (yearly)` = `Net (yearly)` ÷ rate (`—` without a valid rate).
- A foreign person's `Wages (yearly)`, `Net (yearly)` (and the bonus) are in their currency as typed. The income
  table's `<name> · Wages` / `<name> · Bonus` lines, `Net income`, every `% of income` and the Overview's page
  income use the **converted** amounts (÷ rate); without a valid rate they and any total containing them show `—`.
- A person whose `Currency` equals the household currency (after a household change) counts × 1, `FX rate` shown
  as `—`. Unticking `Foreign` keeps the typed currency and rate stored (like #87 lines), counted × 1.
- Example (QA, PF-37): household `CAD`; `Brazilian Dividends`, Wages `37,000`, Bonus rating empty, tax empty, Share
  100, both counted, `Foreign`, `BRL`, `3.70` → Net 37,000, Converted **10,000**; its table line Wages 10,000 a year
  (833.33 a month, 384.62 biweekly); alone, `Net income` 10,000 / 833.33.

### 16.4 Sign-in (Q30)

- `/personal-finance` route: a server check of the Better Auth session (the dashboard's `dashboardViewer`, behind
  `DASHBOARD_ENABLED` like `/api/auth/*`). Signed out, or sign-in not ready → **307** to
  `/dashboard/sign-in?next=/personal-finance`. The sign-in page accepts only `next=/personal-finance` (else
  `/dashboard` as before): signed in it redirects there, and after a successful sign-in / sign-up it goes there.
- **`next` allowlist (QA D1, open redirect fixed):** exactly one allowed value, the relative same-origin path
  `/personal-finance` (exact string). Anything else (`https://…`, `//host`, a backslash form, any other path such as
  `/calculator`, a query / fragment / trailing slash, empty, missing) → `/dashboard`. Applied on load (search
  validation, the signed-in redirect, the loader; the router's canonical redirect drops a rejected value from the URL)
  and again right before the post-auth navigation (`safeNext`, `src/lib/auth/next.ts`).
- Sign-up stays limited to `DASHBOARD_SIGNUP_ALLOWLIST` (fail closed). No roles, no account menu (#90).

### 16.5 The account (Q28, Q29)

- Table `personal_finance` (`migrations/0010_personal_finance.sql`): `user_id` (primary key, references the auth
  `user`, deleted with it), `data` jsonb, `updated_at`. One record per account.
- `GET /api/personal-finance` → `{ data: { "<name>": "<json text>" } | null }`; `PUT` `{ data }` saves the whole
  record; `DELETE` removes it (QA reset; no UI). Names allowed: `orpheus.finance.expenses.v2`,
  `orpheus.finance.income.v1`, `orpheus.finance.equity.v1`, `orpheus.finance.currency.v1`,
  `orpheus.finance.overview.v1`; values strings, the record ≤ 256 KB (else 400 / 413). Order: 404 (flag off), 405,
  401 (no session), 403 (`userId` naming someone else), 400 / 413, 503 (no database); `Cache-Control: no-store`,
  noindex. The user id is the session's, never the client's.
- The page reads the record once after hydration (the strict CLS 0 rule of section 6 holds: the area fills once),
  then saves the whole record 400 ms after the last change (and on leaving the page). Last write wins. A failed
  save shows `Not saved.`; the next change retries.
- **Migration / import (Q27, Q28):** a record holding `orpheus.finance.expenses.v1` (only an import can) is
  converted once: each line's valid `rate` → 1 ÷ rate (6 decimals, trailing zeros dropped: `0.2` → `5`, `0.27` →
  `3.703704`), bad / empty rates kept, saved as `expenses.v2`, v1 dropped. First signed-in visit with **no** record:
  this browser's old `localStorage` values (any of the five #84–#94 keys) are imported (then converted), saved to
  the account and removed from `localStorage`. With a record: `localStorage` is ignored and left as is.

### 16.6 Layout

- Phone: the `Foreign` box (labelled cell) on its own row under `Count wages` | `Count bonus`; ticked, `Currency`,
  `FX rate (…)` and `Converted (yearly)` stack full width under it (one row, each ≤ 16rem, from 640 px), then
  `Net (yearly)`. Wide (from 1024 px): `Foreign` is the last person
  column (column label `Foreign`); ticked, the three cells sit in one row under the person (each ≤ 16rem). 44 px
  controls, chalk focus ring, AA, no horizontal scroll at 360 / 1024, CLS 0. `Not saved.`: 13 px alert under the
  title, reserved only when shown (an error after a user action, not on load).
