# Personal Finance spec (#84 v1.1, #85 v1.2 income, #86 v1.3 equity cover, #87 v1.4 foreign currency, #94 Overview and Update, #102 account + foreign income, #98 end-to-end, #105 usability, #112 month control)

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
| 2026-10-11, ≈ 20:02 ET | **EL on #98 (PR #104 at `749ac07`; docs-only):** Q32 the preview password for `qa-pf@orpheus.test` provided in env only; **Q33 decided: enough as built** (`?userId` → 403 + second device on the preview; two-account isolation stays local `--with-database`; no second preview QA account); **Q34 decided:** the e2e writes / resets on previews only, never production. Preview signed-in e2e 93/93. |
| 2026-10-11, ≈ 21:04 ET | **#105 kickoff (Diego via CoS; EL): usability** (section 18, PF-40..47). (1) **Section toggles** on `02` Income, `03` Expenses and `04` Overview (the brief's "Charts" = the Overview section, the page's only chart; `05` Update stays open). **Storage choice: the account** (`orpheus.finance.view.v1`, a sixth record value): it survives a refresh *and* another device, keeps PF-36 (nothing PF in browser storage) and loads with the rest, so the page still fills once (CLS 0). (2) **Hide empty income lines** (not counted or 0). (3) **`Update month`** button → panel (Month + Expenses + Income, `Save` / `Cancel`); stored on Save. The optional helper sentence is **left out** (ST6-02 / section 4: no instruction text; Q35). (4) **Expense categories** (per line, inline `Add category…` like accounts), a session-only filter, `By category` subtotals; master totals unchanged. No calculation, sign-in or currency change. Q35–Q39 open at kickoff, simplest readings as built (decided ≈ 21:43 ET, next row). |
| 2026-10-11, ≈ 21:43 ET | **EL on #105 (PR #106 at `7451f48`; docs-only, no code change): Q35–Q39 decided, all as built.** **Q35** omit the Update helper sentence (no-instruction-text wins; the brief said optional). **Q36** "Charts" = the whole `04` Overview; `05` Update and the household currency stay outside the collapse. **Q37** toggle state on the account (correct for #102). **Q38** the category filter is not persisted; subtotals include `No category`; the filter has no `No category` choice. **Q39** Update figures save on `Save` (not every keystroke); the panel always opens on the current month. |
| 2026-10-11, ≈ 19:38 ET | **#98 kickoff (Diego via CoS; EL): full end-to-end test** of the page and its entry points after #84–#87, #97, #94, #102 (section 17, PFE-01..13). A **test** ticket: no product change (defects become follow-ups). One CFO journey typed through the UI (income incl. the foreign person, expenses incl. a foreign line, equity cover, Overview / Update, Future), then save / reload / another device / isolation / `Not saved.`, the style rules and the regression suite. Signed in as the EL-named preview account `qa-pf@orpheus.test` (throwaway; the tool resets its record) with `QA_EMAIL` / `QA_PASSWORD` from env; signed out always. Tool: `qa/tools/personal-finance-e2e.mjs` (extends the `personal-finance.mjs` helpers; runnable against the preview URL). Q32–Q34 decided by EL ≈ 20:02 ET (below). |
| 2026-10-11, ≈ 17:48 ET | **#102 kickoff (Diego via CoS; EL):** extends #87 (section 16). **(1) Rate direction changes for every FX rate on the page:** a rate is now **units of the foreign currency per 1 unit of the household (master) currency** (label e.g. `FX rate (BRL per 1 CAD)`; `3.70` means 3.70 BRL = 1 CAD); **household amount = foreign amount ÷ rate** (was × rate, Q12 superseded). **Migration:** stored v1 expense lines carry the old direction unambiguously (the key itself says v1), so they are **inverted once** (rate → 1 ÷ rate, 6 decimals, trailing zeros dropped; a bad / empty rate kept as typed) into the bumped key `orpheus.finance.expenses.v2`. **(2) Foreign income:** each person (= an income line in this model; the issue's "person or income line") gets a `Foreign` box; ticked, it shows `Currency`, `FX rate (<code> per 1 <household>)` and `Converted (yearly)` (the person's Net ÷ rate); the income table, `Net income`, `% of income` and the Overview use the converted figure. #87's expense-line `Currency` / `FX rate` stay (new direction). **(3) Sign-in required:** `/personal-finance` is for signed-in users only; signed out → 307 to `/dashboard/sign-in?next=/personal-finance` (the existing Better Auth email/password and the dashboard's server session check; no second auth system; #90 untouched). **(4) Account persistence:** the five PF values are stored against the account (`personal_finance` table, `GET` / `PUT` / `DELETE /api/personal-finance`), so another device loads the same data; this browser's old `localStorage` values are imported once into an empty account, then removed. Simplest readings, open for EL: Q24–Q31. |
| 2026-10-12, ≈ 11:22 ET | **#112 kickoff (Diego via CoS; EL):** very high; a month control replaces `05 Update`. Business user: the CFO. Stopped and asked: per-month lines and explicit Save conflict with sections 15 / 18 (totals-only months, autosave). |
| 2026-10-12, ≈ 11:23 ET | **EL picked option A (decisions 1–7, `attachments/pf-month-control-design.md`):** each month owns its lines; explicit Save for every month; empty past month copies the current saved lines with `Copied from [month] — edit and save.`; old totals-only months keep their totals until saved; rollover copies the latest month with lines; equity cover / FX rates follow the lines; month figure = that month's Total + Net income. Supersedes PF-28, PF-43 (Update) and the "every change saves" of PF-31 / PF-36 / PF-41 for everything but the section toggles. |
| 2026-10-12, ≈ 14:20 ET | **#113 kickoff (Diego via CoS; EL):** medium; three usability fixes for the CFO: "Personal Finance" with a capital F (bar, home Platforms, page title); a confirmation `Delete [name]? This cannot be undone.` before anything that removes data; rename an expense category (every line using it follows; master totals unchanged). Section 20, PF-59..PF-66; open questions Q-F1..Q-F8 below (recommendations applied until EL answers). |

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
| Section toggles (#105, section 18) | the `02` / `03` / `04` headings themselves (`Income`, `Expenses`, `Overview`) as buttons; no other text |
| Update (#105) | button `Update month`; panel `Month`, `Expenses`, `Income`, buttons `Save`, `Cancel` |
| Categories (#105) | column `Category`; choices `—`, the user's categories, `Add category…`; adding: `New category`, `Add`, `Cancel`; check `Name the category.`; filter label `Filter by category`, first choice `All`; subtotals `h3` `By category`, rows the category names then `No category` |

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

## 9. Questions for EL (Q1–Q11 answered: Q1–Q4 ≈ 12:05 ET; Q5–Q8 ≈ 13:11 ET; #86 formula option A ≈ 13:57 ET; Q9–Q11 ≈ 14:12 ET; Q12–Q16 ≈ 16:26 ET, #87; Q17–Q23 ≈ 17:14 ET, #94; Q35–Q39 ≈ 21:43 ET, #105)

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
- **Q35. The optional Update helper (#105). Decided (EL ≈ 21:43 ET): omit it.** The no-instruction-text rule
  (ST6-02 / section 4) wins; the brief called the sentence optional. No helper text on the page.
- **Q36. "Charts" (#105). Decided (EL ≈ 21:43 ET): as built.** "Charts" = the whole `04` Overview section (its table,
  fields, Future and the chart), collapsing as one; `05` Update and the household currency stay outside the collapse.
- **Q37. Toggle storage (#105). Decided (EL ≈ 21:43 ET): the account, as built** (`orpheus.finance.view.v1`), correct
  for #102 (nothing PF in browser storage; survives refresh and devices).
- **Q38. Filter and the uncategorised (#105). Decided (EL ≈ 21:43 ET): OK as built.** The category filter is not
  persisted (`All` after a reload); subtotals include `No category`; the filter has no `No category` choice.
- **Q39. Update saves on `Save` (#105). Decided (EL ≈ 21:43 ET): OK as built.** Month figures are stored on `Save`
  (not every keystroke); the panel always opens on the current month.

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
| PF-15 | (#85; #105 PF-42: only counted, non-zero lines) Income table: one row per person per line (Wages, then Bonus) in people order, Biweekly = yearly ÷ 26, Monthly = yearly ÷ 12, Yearly; `Net income` sums them; up to two decimals, no currency symbol (Q2). |
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
| PF-40 | (#105) Section toggles: the `02` `Income`, `03` `Expenses` and `04` `Overview` (the brief's "Charts": the table, `Starting net assets` / `Growth rate (%)`, `Future` and the chart) headings are each a button (`aria-expanded`, `aria-controls`, the heading text unchanged, a chevron `aria-hidden`); a click / Enter / Space collapses the section's body (only the numeral and heading stay) and expands it again; open by default; the household currency, `01` and `05` `Update` are not collapsible; 44 px tap target, chalk focus ring. |
| PF-41 | (#105) Toggle state survives a refresh: stored against the **account** in `orpheus.finance.view.v1` (`{"closed":["income"|"expenses"|"overview"]}`; malformed → all open); a reload and a second signed-in device show the same sections closed; nothing PF in `localStorage`; strict CLS 0 on a cold load with a section restored closed; closing a section changes no figure. |
| PF-42 | (#105) Hide empty income lines: the income table lists a person's `Wages` / `Bonus` line only when it is counted (`Count wages` / `Count bonus` ticked) **and** its yearly amount is not 0; no row reads 0 (a counted foreign line without a valid rate still shows `—`); `Net income` always shows and is unchanged. Amends PF-15. |
| PF-43 | (#105) Clearer Update: `05` `Update` shows one button `Update month` (`aria-expanded`); it opens a panel with `Month` (the last 12 months, newest first, default this month), `Expenses`, `Income` (the stored figures for that month; placeholders as #94), `Save` and `Cancel`. Nothing is stored or recomputed until `Save`; `Save` stores both fields for that month, closes the panel, returns focus to `Update month`, and the `04` averages and chart refresh; `Cancel` / Escape closes without a change; a bad amount shows the field check and `Save` stores nothing. No helper text (Q35 decided: omitted). Amends PF-27 / PF-31 (the figures are stored on `Save`). |
| PF-44 | (#105) Expense categories: a `Category` column after `Account` on every expense line (choices `—`, the user's categories in the order added, `Add category…`); adding: label `New category`, `Add` / `Cancel`, check `Name the category.`, ≤ 40 characters, ≤ 50 categories, an existing name reused in any case; stored in `orpheus.finance.expenses.v2` (`categories` + each line's `category`; older values read as no category). |
| PF-45 | (#105) Filter: `Filter by category` (`All` then the categories) above the groups shows only the lines in that category in both groups; `Fixed total`, `Variable total`, `Total`, every `% of expenses` / `% of income` and `Equity to cover` stay the whole page's; a line added while filtered takes the filter's category; the filter is not stored (a reload shows `All`). |
| PF-46 | (#105) Subtotals: when any line has a category, `By category` (`h3`) after `Total` lists each used category (in the order added), then `No category` for the rest, with `% of expenses`, `Monthly`, `Yearly` in the household currency (`—` as Q14); the rows sum to `Total`; categories and the filter never change the master totals. |
| PF-47 | (#105) Layout and regression at 360 / 400 / 1024 / 1440: `Category` under `Account` on a phone, the last column before remove from 1024 px; the subtotal rows and the Update panel stack on a phone; 44 px controls, AA, axe, no horizontal scroll, strict CLS 0 (empty, restored, restored with a section closed); PF-01..39 and PFE-01..13 hold as amended; the signed-out 307 gate and `safeNext` unchanged. |

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

## 17. End-to-end (#98; PFE-01..13; a test ticket, no product change)

One journey a CFO would type, on the preview, at 360 × 780, 400 × 860, 1024 × 800 and 1440 × 900, with
`qa/tools/personal-finance-e2e.mjs` (signed-out part always; signed-in part with `QA_EMAIL` / `QA_PASSWORD` in env,
the EL-named throwaway preview account `qa-pf@orpheus.test`). Figures below are the expected values (the spec
example of sections 12–16 combined; today fixed at 11 October 2026, household `CAD`).

| AC | Pass when |
|----|-----------|
| PFE-01 | Entry points, signed out: the bar's `Personal finance` item, the home `02` Platforms `Personal finance` line's `Open` and the URL `/personal-finance` each end on the sign-in form at `/dashboard/sign-in?next=/personal-finance` (server: **307** to `/dashboard/sign-in?next=%2Fpersonal-finance`, `X-Robots-Tag` noindex); no Personal Finance copy shown. |
| PFE-02 | Gate, signed out: `next` allowlist (`safeNext`): `?next=https://evil.example`, `//evil.example` and `/calculator` are dropped on load (not in the URL or the page) and a faked successful sign-in (the auth POST answered in the browser, no account) goes to `/dashboard`; `?next=/personal-finance` is kept and goes there. `/api/personal-finance` `GET` / `PUT` / `DELETE` → 401 JSON, `POST` → 405 JSON. |
| PFE-03 | Entry points, signed in (the QA account): the bar item and the home `Open` both open `/personal-finance` (200, `Personal finance` current, title `Personal finance · Orpheus Wisdom`); `/dashboard/sign-in?next=/personal-finance` goes straight to the page; an empty account shows the empty page (PF-02 copy). |
| PFE-04 | Income, typed through the UI (household `CAD`): `Me` 120,000 / bonus 10 / tax 30, bonus not counted → Net 92,400; `Spouse` 80,000 / 5 / 25, share 80 → Net 63,000; the table Me · Wages 84,000, Spouse · Wages 48,000, Spouse · Bonus 2,400. |
| PFE-05 | Foreign income: `Brazilian Dividends` 37,000, `Foreign` ticked, `BRL`, `FX rate (BRL per 1 CAD)` `3.70` → Net 37,000, `Converted (yearly)` **10,000**; table line 384.62 / 833.33 / 10,000; `Net income` **5,553.85 / 12,033.33 / 144,400**. |
| PFE-06 | Expenses with a foreign line: Fixed `Rent` 1,000 a month (account `Chequing`, added inline), `Condo` 2,000 a month `BRL` at `5` (BRL per 1 CAD) → 400; Variable `Gifts` 1,200 a year (account `Visa`). Totals Fixed 1,400 / 16,800, Variable 100 / 1,200, Total 1,500 / 18,000; % of expenses 66.7% / 26.7% / 6.7% (Fixed 93.3%, Variable 6.7%, Total 100.0%); % of income 8.3% / 3.3% / 0.8% (Fixed 11.6%, Variable 0.8%, Total 12.5%). |
| PFE-07 | Equity cover: `Portfolio ROIC (%)` 8 → `Rate used` 4% → Rent 300,000, Condo 120,000 (household amount), Gifts 30,000; totals 420,000 / 30,000 / 450,000. A typed Rent override 250,000 → Fixed 370,000, Total 400,000. |
| PFE-08 | Overview / Update (today fixed at 11 October 2026): this month = the page (Expenses 1,500, Income 12,033.33, Surplus 10,533.33; the average the same); `Update` June 2026 typed 4,000 / 9,000 → 12-month average 2,750 / 10,516.67 / 7,766.67; `Starting net assets` 10,000 → the chart: 12 months, three lines (Expenses, Income, Net assets), net assets at the last month 103,200.00. |
| PFE-09 | Future with a typed growth rate: `Growth rate (%)` 5, `Future` on → 1 year (24 points) 203,677.02; 5 years (72 points) 658,398.96 (± 0.01: x ← x × 1.05^(1/12) + 7,766.67 a month). |
| PFE-10 | Persistence and isolation: after the debounced save a reload shows every figure above unchanged (PFE-04..09); a **second signed-in browser context** on the same account (another device) shows the same figures; `GET /api/personal-finance?userId=<anyone else>` → 403; an aborted save shows `Not saved.` and the next saved change clears it. (Isolation between two real accounts: `npm run check:dashboard-built -- --with-database`, locally; Q33.) |
| PFE-11 | Style on the full page at 360 / 400 / 1024 / 1440: charcoal + chalk, `color-scheme: dark`, the lyre first in the bar, footer exactly `Orpheus Wisdom`, no gold, noindex meta + `X-Robots-Tag`, one Analytics script, no horizontal scroll, AA for every text, and page CLS exactly 0 on a cold load of the full budget. |
| PFE-12 | Regression on the same preview: `qa/tools/site-style-regression.mjs` (every shipped-page tool: site-shell, home, calculator incl. **$313,000** via site.mjs, saved searches, sign-in, personal-finance, release-smoke preview, CLS 0, noindex) passes. |
| PFE-13 | Hygiene: credentials only from env (`QA_EMAIL` / `QA_PASSWORD`; never logged, never created); every signed-in context signs out (session.mjs); the QA account's Personal Finance record is reset (`DELETE /api/personal-finance`) before each viewport and left empty at the end; preview only (it writes to the account). |

Run: `QA_EMAIL=qa-pf@orpheus.test QA_PASSWORD=… AXE_PATH=… node qa/tools/personal-finance-e2e.mjs --base-url <preview> --out <dir>`
(then `qa/tools/site-style-regression.mjs` for PFE-12). A defect found here is filed as a follow-up, not fixed in #98.

Questions for EL (Q32–Q34 answered by EL, 2026-10-11 ≈ 20:02 ET):
- **Q32. Preview credentials. Decided:** EL provided the password of `qa-pf@orpheus.test` for the preview run, in env
  only (`QA_EMAIL` / `QA_PASSWORD`; never in git, the PR or logs). The tool never creates accounts or touches the allow-list.
- **Q33. Two-account isolation. Decided: enough as built.** On the preview: `?userId=` → 403 and a second device on the
  same account; real two-account isolation stays local with `check:dashboard-built --with-database`. No second preview
  QA account.
- **Q34. Where it runs. Decided:** the e2e writes to and resets the QA account's record **on previews only, never
  production** (the tool refuses the production host).

## 18. Usability (#105; PF-40..47; Q35–Q39 decided by EL ≈ 21:43 ET, as built)

Business user: the CFO. No calculation, sign-in or currency-model change; #102's gate and `safeNext` stay.

18.1 **Section toggles.** `02` Income, `03` Expenses and `04` Overview ("Charts") collapse and expand from their
heading (a button inside the `h2`, `aria-expanded` / `aria-controls`, a chevron that turns; text unchanged). Open by
default. Closed sections are stored against the **account** as `orpheus.finance.view.v1` =
`{"closed":[...]}` (names `income`, `expenses`, `overview`): the sixth record value, saved like the others (PUT the
whole record), so a refresh or another device shows the same state and nothing PF goes back into browser storage. The
page still fills once after the record loads (CLS 0).

18.2 **Income table.** Only lines that are counted and whose yearly amount is not 0; `Net income` always.

18.3 **Update month.** `05` shows `Update month`; it opens a panel under it (Month, Expenses, Income, `Save`, `Cancel`).
The fields are a draft: `Save` writes that month's two figures (empty clears it), closes the panel and focuses the
button; `04`'s averages and chart follow. `Cancel` or Escape discard. No helper sentence (Q35 decided: omitted).

18.4 **Categories.** Per expense line, like `Account`: `Category` (`—`, categories, `Add category…`), inline `New
category` with `Add` / `Cancel`; ≤ 40 characters, ≤ 50, case-insensitive reuse; stored in `expenses.v2`
(`categories`, `line.category`). `Filter by category` (`All`, categories) above the groups hides other lines (session
only; a line added while filtered gets the category). `By category` after `Total`: one row per used category then
`No category`, `% of expenses` / `Monthly` / `Yearly` in the household currency. Master totals, percentages and
equity cover always use every line.

18.5 **Layout.** Phone: `Category` under `Account` (its own row), subtotal rows name over Monthly | Yearly | share,
the Update panel stacked. From 1024 px: `Category` is the last column before remove; subtotal rows one line.

| AC | Pass when |
|----|-----------|
| PF-40 | (#105) Section toggles: the `02` `Income`, `03` `Expenses` and `04` `Overview` (the brief's "Charts": the table, `Starting net assets` / `Growth rate (%)`, `Future` and the chart) headings are each a button (`aria-expanded`, `aria-controls`, the heading text unchanged, a chevron `aria-hidden`); a click / Enter / Space collapses the section's body (only the numeral and heading stay) and expands it again; open by default; the household currency, `01` and `05` `Update` are not collapsible; 44 px tap target, chalk focus ring. |
| PF-41 | (#105) Toggle state survives a refresh: stored against the **account** in `orpheus.finance.view.v1` (`{"closed":["income"|"expenses"|"overview"]}`; malformed → all open); a reload and a second signed-in device show the same sections closed; nothing PF in `localStorage`; strict CLS 0 on a cold load with a section restored closed; closing a section changes no figure. |
| PF-42 | (#105) Hide empty income lines: the income table lists a person's `Wages` / `Bonus` line only when it is counted (`Count wages` / `Count bonus` ticked) **and** its yearly amount is not 0; no row reads 0 (a counted foreign line without a valid rate still shows `—`); `Net income` always shows and is unchanged. Amends PF-15. |
| PF-43 | (#105) Clearer Update: `05` `Update` shows one button `Update month` (`aria-expanded`); it opens a panel with `Month` (the last 12 months, newest first, default this month), `Expenses`, `Income` (the stored figures for that month; placeholders as #94), `Save` and `Cancel`. Nothing is stored or recomputed until `Save`; `Save` stores both fields for that month, closes the panel, returns focus to `Update month`, and the `04` averages and chart refresh; `Cancel` / Escape closes without a change; a bad amount shows the field check and `Save` stores nothing. No helper text (Q35 decided: omitted). Amends PF-27 / PF-31 (the figures are stored on `Save`). |
| PF-44 | (#105) Expense categories: a `Category` column after `Account` on every expense line (choices `—`, the user's categories in the order added, `Add category…`); adding: label `New category`, `Add` / `Cancel`, check `Name the category.`, ≤ 40 characters, ≤ 50 categories, an existing name reused in any case; stored in `orpheus.finance.expenses.v2` (`categories` + each line's `category`; older values read as no category). |
| PF-45 | (#105) Filter: `Filter by category` (`All` then the categories) above the groups shows only the lines in that category in both groups; `Fixed total`, `Variable total`, `Total`, every `% of expenses` / `% of income` and `Equity to cover` stay the whole page's; a line added while filtered takes the filter's category; the filter is not stored (a reload shows `All`). |
| PF-46 | (#105) Subtotals: when any line has a category, `By category` (`h3`) after `Total` lists each used category (in the order added), then `No category` for the rest, with `% of expenses`, `Monthly`, `Yearly` in the household currency (`—` as Q14); the rows sum to `Total`; categories and the filter never change the master totals. |
| PF-47 | (#105) Layout and regression at 360 / 400 / 1024 / 1440: `Category` under `Account` on a phone, the last column before remove from 1024 px; the subtotal rows and the Update panel stack on a phone; 44 px controls, AA, axe, no horizontal scroll, strict CLS 0 (empty, restored, restored with a section closed); PF-01..39 and PFE-01..13 hold as amended; the signed-out 307 gate and `safeNext` unchanged. |

## 19. Month control (#112; PF-48..PF-58; EL option A, decisions in `attachments/pf-month-control-design.md`)

Business user: the CFO. Manual only (no Plaid). No calculation, currency-model, sign-in or roles change.

19.1 **Copy (exact).** Under the title: label `Month` and a select showing `<Month> <yyyy>` (e.g. `October 2026`),
options the last 12 months newest first. `Save` (a button) next to it only while something is unsaved. The note
`Copied from <Month> <yyyy> — edit and save.` under the control while a copied month is shown. Switching with unsaved
changes: the browser confirm `Discard unsaved changes?`. A failed save: `Not saved.` (as today). `05` `Update` and
its panel are gone; `04` `Overview` is the last section.

19.2 **Rules.** Section 19 of the design (decisions 1–7). The month figure (section 15.2 Q17 amended): a month saved
with lines → its `Total` Monthly / `Net income` Monthly when above 0; else an old typed total (`overview.v1.months`);
else empty. The averages, net assets and Future are unchanged otherwise, and use saved months only (edits show in
the month's own tables at once, in `04` after Save).

19.3 **Storage.** `orpheus.finance.months.v1` (design section 3); record limit 1 MB; 24 months kept.

19.4 **Layout.** The control and `Save` on one row under the title (wrapping on a phone), the select ≥ 44 px tall and
≤ 16rem, `Save` the 44 px chalk text button; the note 14 px dim. Nothing moves when `Save` appears (its slot is
reserved), strict CLS 0. No gold.

> **Note (2026-10-16, #163):** superseded by PFM-11 (section 34): Month, Year and `Save` stay on one row at every width, including below 400 px (360 px); `Save` no longer wraps on a phone. The `Copy from current month` line under the row is always rendered (hidden by visibility), so a month change moves nothing.

## 20. Capital F, delete confirmations, rename categories (#113; PF-59..PF-66)

Business user: the CFO. No calculation, currency-model, sign-in or Dashboard change.

20.1 **Capital F.** Every visible "Personal finance" becomes **"Personal Finance"**: the bar item, the home `Platforms`
line, the page title (`Personal Finance.`), the document title (`Personal Finance · Orpheus Wisdom`), and (Q-F1) the
role and denied lines (`CFO · Personal Finance · Read`, `You don't have access to Personal Finance.`). The bar keeps
the full words (Q21, ROLE-01) and must stay on one line at 360 / 399 (11 px) and 400 (12 px); if it did not, that
would be raised, not fixed by shrinking (Q-F8).

20.2 **Delete confirmations.** Before an item that removes data goes, the browser's own confirm (Q-F2) asks exactly
`Delete [name]? This cannot be undone.`; Cancel keeps it, OK removes it. Items (Q-F4): an expense line (`[name]` = its
name, or `this expense` when unnamed; Q-F3) and a person (`[name]` = the name, or `Person N` as shown). Read-only
grantees have no remove buttons (disabled, as today); the whole-record DELETE stays owner-only (Q-D13). With the
month control (#112) a removal is part of the unsaved month until `Save`; the wording stays as the brief has it
(Q-F5). No instruction text is added.

20.3 **Rename a category.** With a category chosen in `Filter by category`, a `Rename` button beside it opens a field
`New name` with `Rename` and `Cancel` (Enter / Escape). The new name follows the category rules (≤ 40 characters,
`Name the category.` when empty); a name another category already has (any case) is refused with `That category
exists.` (no merge; Q-F6); a change of case only is allowed. Renaming updates the category list, every line of the
shown month using it, the filter and `By category`; categories are shared across months (#112 decision 1), so on
`Save` every stored month's lines follow (Q-F7). Master totals do not change. Read-only: `Rename` disabled.

20.4 **Open questions (recommendation applied until EL answers).**

| Q | Question | Recommendation |
|---|----------|----------------|
| Q-F1 | Capitalise the role / denied lines too? | Yes: every visible "Personal finance". |
| Q-F2 | Confirmation UI: the browser's confirm or an in-page dialog? | The browser's confirm (as #112's discard question; accessible, no layout shift). |
| Q-F3 | `[name]` of an unnamed item? | `this expense`; a person's shown label (`Person 2`). |
| Q-F4 | Which items? | Expense lines and people (the only removals in Personal Finance today; accounts and categories have no delete). |
| Q-F5 | "This cannot be undone." while a removal is still unsaved (#112)? | Keep the brief's wording exactly. |
| Q-F6 | Rename to a name that exists? | Refuse with `That category exists.`; no merge. |
| Q-F7 | Rename across months? | Yes, every stored month on Save (categories are shared). |
| Q-F8 | The bar with the capital F at 360 px? | Measured on the preview (site-shell ROLE-01); raise if it no longer fits. |


## 21. Expenses summary, account filter, totals by account (#119; PF-67..PF-78)

Business user: the CFO. Design `attachments/pf-expenses-summary-design.md` (decisions S1–S7, Q-S1..Q-S8). No
calculation, currency-model, month-control (#112), sign-in, rename (#113) or Dashboard change.

21.1 **Expenses summary.** A section of its own after `03` `Expenses` (numeral `03`, title `Expenses summary`) with its
own toggle; closing `Expenses` leaves it visible. It holds `By account` and `By category`, each once used.

21.2 **Totals by account.** Each account's subtotal (`% of expenses`, `Monthly`, `Yearly`, household currency, full
digits), then `No account`; same style as `By category`. Subtotals sum to `Total`.

21.3 **Account filter.** `Filter by account` (`All` + accounts) shows only that account's lines; it combines with
`Filter by category`. The Summary keeps every account's and category's total and marks the chosen ones. The master
totals (`Total`, `% of income`, `Equity to cover`) are unchanged and stay in the household currency.

21.4 **Read-only and decisions (EL 07:51 ET).** Read-only grantees can use both filters (view only; totals unchanged);
every write stays locked (add, including a new line under an account filter, `Save`, `Rename`, remove, fields).
ROLE-10 is amended accordingly (ROLE-10a). Q-S1..Q-S6 and Q-S8 accepted by the CFO; Q-S7 changed as stated here.

## 22. Overview: Equity coverage and 3-month average (#126; PF-79..PF-90)

Business user: the CFO. Design `attachments/pf-equity-coverage-design.md` (decisions C1–C5, Q-C1..Q-C9, recommendations built). No change to the currency model, month control (#112), sign-in, the Expenses summary (#119) or the Dashboard. Nothing new is stored.

22.1 **Equity coverage.**
- Annual = `Starting net assets` × (`Rate used` ÷ 100); monthly = annual ÷ 12; % = monthly ÷ this month's expenses (else the 12-month average).
- Shown under the comparison table, above the fields and the chart, in the household currency with full digits: `Equity coverage: 43.75 CAD/mo · 0.53% of expenses`, with a dim `525 CAD/yr` underneath.
- Missing rate: `—` and `Set rate under Expenses`. Missing start: `—` and `Set starting net assets`.
- With `Future` on: projected net assets at the horizon end and the average expenses, labelled `Equity coverage in N years`.

22.2 **3-month average.**
- The comparison table reads `This month` · `3-month average` · `12-month average`.
- The 3-month window is the current month and the 2 before it. Empty months take the 12-month average (the existing fill rule).
- The chart keeps the 12-month series.

22.3 **Copy added** (section 15.1): `3-month average`, `Equity coverage:`, `Equity coverage in <N> years:`, `/mo`, `/yr`, `of expenses`, `Set rate under Expenses`, `Set starting net assets`.


### Change (C7/C2, approved 2026-10-13)

Approved by the CFO (Diego via EL), 2026-10-13. Supersedes the window in 22.2 and the "this month's expenses" basis of the coverage %; the lines above stay as the record of the original reading.

- **C7 window:** the 3-month average (`pf-ov-avg3`) uses the last 3 **complete** months and excludes the current partial month. On 2026-10-13 that is Jul, Aug and Sep; in January it is Oct–Dec of the year before.
- **Rollover:** the window is computed at render time from the current date in the household timezone (America/Toronto), never hardcoded, so it rolls over on the 1st: Oct 31 → Jul–Sep, Nov 1 → Aug–Oct. A UTC instant that is still Oct 31 in Toronto (e.g. 2026-11-01T03:30Z) gives Jul–Sep.
- **C8 kept:** an empty complete month takes the 12-month average.
- **C2 coverage:** the equity coverage % (`pf-coverage`, Future off) is computed against that 3-month average of complete months, not the current month. Future on is unchanged (projected net assets, average expenses).
- **Labels:** the column reads `3-month average (Jul–Sep)` and the coverage line `… of 3-month average (Jul–Sep) expenses`; the months follow the window.
- **AC:** PF-91..PF-95 (`qa/CANONICAL-AC-PACK.md`).

### Change (N1 and basis label, 2026-10-13)

- **N1:** `This month` and the 12-month list use the household month (America/Toronto), the same as the 3-month window: Oct 31 20:00–23:59 ET (already Nov 1 in UTC) still shows October and Jul–Sep, on a UTC server or in a browser west of Toronto.
- **Basis label:** the CFO confirms PF-84. A dim label beside the coverage %: `basis: 3-mo avg (Jul–Sep)` (Future off; the window follows the date) or `basis: projection` (Future on).
- **AC:** PF-96, PF-97.

## 23. Overview: Equity coverage layout, multi-line with notes (#129; PF-98..PF-104)

Brief (#129, HIGH): the coverage line is one long line, hard to read on a phone. Same place (under the averages table, above `Starting net assets`), same numbers (#126 math, C7/C2, PF-84, N1); only the layout and copy change. Supersedes the one-line display of PF-80 / PF-94 / PF-97 (those rows stay as the record).

23.1 **Layout** (three lines, `pf-coverage`):

```
Equity coverage: 41.67 CAD/mo (500 CAD/yr)
* 12.5% yearly, or 0.50% monthly on 3-month average (Jul–Sep) expenses.
** Coverage rate is derived from Rate Used under Expenses section.
```

- Line 1 (`pf-coverage-amounts`, body size): `Equity coverage:` (or `Equity coverage in N years:` with Future on), the monthly amount `<x> <CUR>/mo` and the yearly amount in brackets `(<y> <CUR>/yr)`. Full digits, household currency code.
- Line 2 (`pf-coverage-rate-note`, smaller, dim): `* <Rate used> yearly, or <share> monthly on <basis> expenses.` Rate used as shown under Expenses (`formatRate`: `4%`, `12.5%`); share = monthly coverage ÷ basis expenses, two decimals (Q-C3), `—` when the expenses are missing or 0. Basis: `3-month average (Jul–Sep)` with Future off (window from the date, C7/N1); `12-month average` + ` (projection)` with Future on (PF-84).
- Line 3 (`pf-coverage-source`, smaller, dim): `** Coverage rate is derived from Rate Used under Expenses section.` Always shown.
- Missing rate / start: line 1 `Equity coverage: —`, line 2 the existing note (`Set rate under Expenses` / `Set starting net assets`), line 3 unchanged. Future projected net assets ≤ 0: line 1 `—`, line 3 only.
- Q-L1..Q-L6: `attachments/pf-equity-coverage-design.md` section "Layout (#129)".

### Change (Q-L1 / Q-L4 CFO-confirmed, 2026-10-14)

All six Q-L answers are confirmed by the CFO (Q-L2, Q-L3, Q-L5, Q-L6 as recommended; Q-L1 and Q-L4 changed as below). Line 2 becomes:

- Future off: `* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul–Sep).` (the window follows the date).
- Future on: `* 12.5% yearly, covers X% of projected monthly expenses at horizon end (held at 12-month average).` The share divides by the horizon-end point's expenses (EL, option b); the projection holds expenses at the 12-month average, so the figure is unchanged. Growing expenses are out of scope.
- AC PF-105..PF-107 (supersede the PF-100 / PF-103 wording and the PF-84 expenses term).

## 24. Expenses: Withdrawal rate description (#131; PF-108..PF-114)

Directly above `Withdrawal rate (%)` under `03` `Expenses`, a two-line description in the note style (0.875rem, dim,
sentence text; not a title, heading or label), `pf-withdrawal-desc`:

```
Withdrawal rate used to calculate how much equity can cover expenses.
Rate Used is your Withdrawal Rate, or half of Portfolio ROIC when no Withdrawal Rate is set.
```

- Line 2 differs from the brief (`… the lower of your Withdrawal Rate or half of Portfolio ROIC.`) because Rate used is
  the typed withdrawal rate, else ROIC ÷ 2 (section 13, PF-18; both typed, the withdrawal rate wins). The formula does
  not change in #131 (Q-W1).
- Shown to read-only grantees; the withdrawal input is `aria-describedby` it. An approved exception to PF-02's "no
  other text". Design and Q-W1..Q-W7: `attachments/pf-withdrawal-description-design.md`.


## 25. Overview: month range under the 12-month average (#132; PF-115..PF-120)

Brief (#132, MEDIUM): show the 12-month average's month range the same way the 3-month average shows it (`3-month average (Jul–Sep)`). The 3-month behaviour is unchanged; Equity coverage (#129), the Withdrawal rate description (#131) and the currency model are out of scope.

25.1 **Label.** The column header reads `12-month average (<first>–<last>)`, e.g. `12-month average (Nov–Oct)` on 2026-10-14: the same format as the 3-month label (short month names, en dash, no years). Header test id `pf-ov-avg-head`.

25.2 **Window.** The 12 months the average is computed over today (`lastTwelve(now)`): the current household month (America/Toronto, N1) and the 11 before it, computed at render time, never hardcoded. The figures do not change. It rolls over on the 1st in Toronto: Oct 31 23:59 ET → `Nov–Oct`, Nov 1 00:00 ET → `Dec–Nov`; a UTC instant still Oct 31 in Toronto (2026-11-01T03:30Z) → `Nov–Oct`.

25.3 Q-M1..Q-M4: `attachments/pf-12mo-range-design.md`.

## 26. Overview: the 12-month average uses 12 complete months (#140; PF-121..PF-128)

Brief (#140, HIGH; approved by Diego in the Engineering Lead chat, 2026-10-14; business user CFO): the 12-month average leaves out the partial current month, as the 3-month average does since C7 (#126). Supersedes the 12-month window of section 15 / Q18, PF-116 and the `Nov–Oct` example of section 25 (those lines stay as the record).

26.1 **Window.** The last 12 complete household months (America/Toronto), computed at render time: on 2026-10-14, Oct 2025..Sep 2026, label `12-month average (Oct–Sep)`. Oct 31 23:59 ET → `Oct–Sep`; Nov 1 00:00 ET → `Nov–Oct`; 2026-11-01T03:30Z (still Oct 31 in Toronto) → `Oct–Sep`; any day in January 2027 → `Jan–Dec` (Jan 2026..Dec 2026).

26.2 **Mean.** The mean of the complete months in the window that have a figure (an empty month is left out, as today). Fewer than 12 complete months with data: the mean of those, and the label still names the full window (Q-T1). No complete month with a figure: `—` (Q-T3).

26.3 **Uses of the 12-month average** (all follow the new window): the empty-month fill (C8) for the 3-month average and the 12 chart months; the Future projection (each future month's expenses and income held at it, PF-107); the Future-on coverage (÷ the horizon-end point's expenses, PF-106). When it is `—`, the filled months, Future and the Future-on coverage are `—` / `none` as today.

26.4 **Unchanged:** `This month` (the current household month, its own figure); the chart's 12 months (current + 11 before, `lastTwelve`); the 3-month average and label; Future-off coverage (÷ the 3-month average); Equity coverage layout (#129), Withdrawal rate description (#131), #138.

26.5 Q-T1..Q-T5: `attachments/pf-12mo-complete-design.md`.

## 27. Overview: the 12-month label shows the count with fewer than 12 months (#141 Q-T1, CFO-changed; PF-129..PF-131)
This is a labelling change only: the 12-month calculation in section 26 stays the same. A month "has data" when it has an expenses or an income figure.
- 27.1 All 12 complete months have data: the header keeps the dated label, e.g. `12-month average (Oct–Sep)` on Oct 14, 2026, rolling over on the 1st in Toronto (PF-129).
- 27.2 Fewer than 12 have data: the count replaces the range, e.g. `12-month average (8 of 12 months)`. This follows the CFO's example exactly. No range is shown (PF-130).
- 27.3 None has data: `12-month average (0 of 12 months)`, with the figures `—` per Q-T3 (PF-131).
- 27.4 Other places: the Future-on coverage note says `(held at 12-month average)` and names no range, so it stays as it is. The 3-month label is unchanged. Nothing else shows the 12-month label.
- This supersedes section 26's Q-T1 "label names the full window" and the PF-115 header example when fewer than 12 months have data.
- 27.5 (CFO via EL, PF-132; supersedes 27's "expenses or income") A month has data for the 12-month expense average and the N-of-12 count only if it has expense entries. An income-only month is left out entirely: it is not counted and not averaged as $0. Example: 8 expense months and 1 income-only month give `(8 of 12 months)`, and the expense average divides by 8.
  - The empty-month fill (C8) gives an income-only month's expenses the 12-month expense average, in the chart and in the 3-month average, never $0.
  - The Future projection and Future-on coverage use that expense average; Future-off coverage uses the 3-month average.
  - The income average is a separate mean over months with an income figure, so an income-only month still counts there. Surplus is the income average minus the expense average.
- 27.6 `(0 of 12 months)` is accepted as built (CFO via EL).

## 28. Save is blocked while any field has an error; the API refuses invalid values (#143; PF-133..PF-140)
Found in the #134 triage. Before this change, `-5` in Rent saved, counted as 0, and This month dropped from 2,950 to 750 with no warning; a bad tax value did the same.
- 28.1 Fields checked (Q-S2). These are exactly the fields that show an error:
  - Expenses lines: amount, `Equity to cover`, and the FX rate on a foreign line.
  - Income people: wages, bonus %, tax %, share %, and the FX rate when the person is foreign.
  - `Withdrawal rate (%)` and `Portfolio ROIC (%)`.
  - Overview `Starting net assets` and growth.
  - The add-account / add-category inputs are not included; they have their own Add check.
- 28.2 Valid values (Q-S3): blank or 0 or more for amounts; 0–100 for percents (tax, share, withdrawal); a number above 0 for an FX rate. 0 is allowed. A negative, a non-number, or a percent above 100 is an error.
- 28.3 Block (Q-S1): while any field shows an error, `Save` stays shown but pressing it sends nothing. The month note line reads `Fix the fields marked in red before saving.` and focus moves to the first field in error. Fixing the fields clears the note, and Save works again.
- 28.4 API (Q-S4): `PUT /api/personal-finance` checks the same rules on every month's lines and the shared values. A record holding an invalid value gets `400 { "error": "Invalid value.", "field": "<where>" }`, for example `months.2026-10.fixed.0.amount`. Nothing is stored, and the value is never clamped to 0. A blank FX rate is accepted by the API (Q14: "—"), but the page still blocks it (28.1).
- 28.5 A refused PUT (Q-S5): the page shows `Not saved.` and keeps the edits unsaved (Save still shown).
- 28.6 Records already holding an invalid value (Q-S6): when the month opens, the page shows that field's error and Save is blocked until it is fixed. The API refuses any PUT of that record until then.
- 28.7 (The CFO accepted Q-S1..Q-S6 via EL; condition on Q-S6, PF-141) A refused automatic save on section open/close shows `Not saved.`, which stays until a later save succeeds. The edits on screen are kept, not reverted.
- 28.8 (PF-142; corrects 28.7's basis) A section toggle no longer saves while a field shows an error. The section still opens or closes on screen, and its view is kept and sent with the next successful Save. No PUT is sent. `Not saved.` shows and stays until a save succeeds, and the edits stay. Before this, a toggle sent the stored record with no field check, so it returned 200 and `Not saved.` never showed.

## 29. Overview: the 12-month income and expense averages use the same months (#146; PF-143..PF-149)
Before this change, the 12-month income average used every complete month that had an income figure, while the expense average used only months with expense entries (PF-132). The surplus therefore subtracted averages taken over different months, and income-only months made it look better than it is.
- 29.1 Both 12-month averages are taken over the same months: the complete months in the 12-month window that have expense entries (PF-132). An income-only month counts toward neither average (PF-143).
- 29.2 An expense month with no income figure counts as **0 income** in the 12-month income average (Q-U1), so both averages cover exactly the same months.
- 29.3 The 12-month surplus is the income average minus the expense average, both over those months (PF-144).
- 29.4 The `(N of 12 months)` label counts those months, and the dated label shows only at 12 of 12 (PF-129..PF-132 unchanged; PF-145).
- 29.5 No expense month in the window: the expense, income and surplus averages are all `—` (Q-T3), even if income-only months exist (PF-146).
- 29.6 Where the 12-month income average is used (Q-U2..Q-U5):
  - The table's 12-month income and surplus cells follow it.
  - The Future projection uses it for future income and for the monthly surplus that grows net assets (PF-147).
  - The C8 fill uses it, so a past chart month or a 3-month window month with no income figure takes the new 12-month income average. A month's own typed or saved income is still shown and counted for that month (PF-148).
  - Future-on coverage follows through the projected net assets. Future-off coverage (the 3-month expense average and the start) is unchanged.
  - This month and the 3-month average's own window rule (C7) are unchanged (PF-149).
- 29.7 (Q-U1 refinement) If none of the months used has an income figure, the 12-month income and surplus averages are `—`, not 0. This keeps a page with only expenses typed so far from showing a 0 income average and a negative surplus. As soon as one of those months has income, the others count as 0.

## 30. Rate used = the lower of the Withdrawal Rate and half of Portfolio ROIC (#138; PF-150..PF-157)
This supersedes section 13's formula A ("the typed withdrawal rate wins, else ROIC ÷ 2"), PF-18's rule and #131 Q-W1's line 2, by addition only.
- 30.1 Rate used = min(Withdrawal Rate, Portfolio ROIC ÷ 2) when both are set; when only one is set, that one; when neither, `—`. Example: withdrawal 5 and ROIC 8 → 4% (it was 5%). Withdrawal 3 and ROIC 8 → 3%. Withdrawal 4 and ROIC 8 → 4% (equal) (PF-150, PF-151).
- 30.2 A typed 0 counts as **not set** (Q-R2): withdrawal 0 and ROIC 8 → 4%; both 0 → `—`. A rate of 0 can't cover anything, and before this change 0 already meant "no rate" (`—`) (PF-152).
- 30.3 While either rate field shows an error (a negative ROIC, a withdrawal above 100, a non-number), Rate used is `—` (Q-R3). Before, a bad withdrawal rate gave `—`, but a bad ROIC was ignored when a withdrawal rate was set. Now neither is ignored, and Save is blocked by #143 anyway (PF-153).
- 30.4 Which rate was used (Q-R4): under the value, a small source line, `pf-rate-source` (PF-154):
  - `from Withdrawal Rate`
  - `from half of Portfolio ROIC`
  - `Withdrawal Rate and half of Portfolio ROIC are equal`
  - nothing when Rate used is `—`
- 30.5 The #131 description line 2 now reads `Rate Used is the lower of your Withdrawal Rate or half of Portfolio ROIC.` (the issue's wording, with a period). This supersedes PF-108's line 2 text (PF-155).
- 30.6 Everything that uses Rate used follows with no other change (PF-156):
  - the Expenses `Equity to cover` column and totals;
  - the saved months' figures;
  - the Overview equity coverage (Future off and on).
- 30.7 Read-only shows the same value and source line, with no new control (PF-157).

## 31. Every figure updates live; an unsaved-changes indicator (#144; PF-159..PF-170)
Before this change, the Expenses totals, Equity to cover and Rate used updated while typing, but This month, the 3-month and 12-month averages, the chart and the expense side of the coverage waited for Save (audit: `attachments/pf-live-figures-design.md`).
- 31.1 Every figure on the page is computed from what is on screen, as Save would store it (Q-V1): This month, the 3-month and 12-month averages and surpluses, the `N of 12` label, the chart, the Future projection, the equity coverage, Equity to cover and Rate used. Other months use their saved lines with the on-screen rates, household currency and shared values (PF-159..PF-161).
- 31.2 Nothing is stored until Save (#112 unchanged). `Unsaved changes` (`pf-unsaved`) shows beside Save whenever Save shows (Q-V2) (PF-162).
- 31.3 Only a successful save clears it (PF-163). It stays after a Save blocked by a field error, a section toggle whose save is blocked, or a save the server refuses. Each of those also shows `Not saved.` until a save succeeds (Q-V7) (PF-164..PF-166).
- 31.4 Editing back to the saved values, or discarding on a month switch, leaves nothing unsaved, so the indicator and Save hide (Q-V4) (PF-167).
- 31.5 The browser's leave-page prompt stays while anything is unsaved, including after a blocked or refused save (Q-V5) (PF-168).
- 31.6 Read-only: no indicator and no Save. The figures are the saved record's (Q-V6) (PF-169).
- 31.7 A field in error counts as #143 has it, everywhere live: a bad amount counts 0 and a bad rate makes Rate used and its figures `—` (Q-V3) (PF-170).
- 31.8 (PF-171; QA fix at 400 px) Save and `Unsaved changes` are one group that never wraps (inline-flex, nowrap). The indicator is always rendered: while nothing is unsaved it's hidden with `visibility`, not removed, and a Save-sized placeholder holds the button's place. So showing it never moves anything at any width. Read-only renders no indicator.
- 31.9 (CFO chose option c on Q-V3; PF-172, PF-173) The numbers stay live. While any field shows an error, a dim note `Figures leave out fields marked in red.` shows above the Overview table. It clears when no error remains. Its line is always reserved (hidden with `visibility`), so nothing moves. Read-only shows no note.
- 31.10 (PF-174; QA fix of 31.8 at 400 px, spec 19.4) The Save slot (the button, or a Save-sized placeholder) is its own non-shrinking item right after the select, so from 400 px it stays on the select's row, as on main. Below 400 px it wraps under the select, as 19.4 allows. `Unsaved changes` is a separate non-wrapping item after it, always rendered (hidden with `visibility`), so it takes the same place clean or unsaved. Where it doesn't fit beside Save (400 to about 640 px), it wraps alone onto the row's next line in both states. Nothing moves and nothing overflows. This supersedes 31.8's single nowrap group, by addition.

## 32. One money format: always two decimals (#142; PF-175..PF-182)
Business user: CFO. QA (#133, Finding 1) saw the Overview 3-month Income show `4,296.3` next to 2-decimal figures such as `4,266.67`. The cause is the old rule in section 5, "up to two decimals, no trailing zeros" (`formatAmount`). Every computed PF money figure now uses one shared formatter, `formatMoney`, in `src/lib/finance/money.ts`. **This supersedes the section 5 number-format line for money figures.** Design and Q-W1..Q-W6: [`attachments/pf-money-format-design.md`](pf-money-format-design.md).
- 32.1 (Q-W1) Always exactly two decimals, with comma thousands separators: `4,296.30`, `1,200.00`, `83.33`, `0.00` (PF-175).
- 32.2 (Q-W2) No currency symbol. Amounts stay unitless, as Q2 / Q15 decided. The coverage line keeps its existing ` <code>/mo` and ` <code>/yr` suffix (`41.67 CAD/mo (500.00 CAD/yr)`) (PF-176).
- 32.3 (Q-W3) Negatives use a leading minus, `-1,234.50` (the existing `en-US` pattern). A value that rounds to zero shows `0.00`, never `-0.00` (PF-177).
- 32.4 (Q-W4) Rounding is display only: half away from zero to the cent (`Intl.NumberFormat` default) on the computed value. Sums are still computed from unrounded values, as before (PF-178).
- 32.5 (Q-W5) Scope: every computed money figure (PF-179).
  - Overview: This month, the 3-month and 12-month averages and surpluses, Future figures, and the chart tooltip.
  - Equity coverage: monthly and yearly.
  - Income: the table's figures, each person's Net and Converted (yearly).
  - Expenses: line, group and grand totals (Monthly, Yearly, Equity to cover), the calculated Equity to cover shown as an input placeholder, and the other period's converted figure shown in a Monthly / Yearly field.
- 32.6 (Q-W5) Out of scope, unchanged (PF-180):
  - typed input text, which is shown as typed;
  - percentages (`% of expenses` / `% of income` one decimal; the rates);
  - FX rates;
  - the chart's compact axis ticks.
- 32.7 (Q-W6) `—` (not computed) is unchanged (PF-181).
- 32.8 The 8-expense + 1-income-only fixture (QA #133) shows the 3-month Income as `4,296.30` on the real page (PF-182).

## 33. Saved chart report: data model, backend only (#153; PFR-01..PFR-16)

Design and CFO calls Q-X1..Q-X8: `attachments/pf-chart-report-design.md`.

33.1 One report per person, as JSON text under `orpheus.finance.report.v1` in that person's own `personal_finance` row. No migration.
33.2 Shape: `{ series, range, chart }` and nothing else.
33.3 `series`: 1 to 12 items, each `{ kind, id }`, with no duplicates. Kinds: `line` (line id), `account`, `category` (names up to 40 characters), `group` (`fixed` / `variable` / `all`), `metric` (`income` / `expenses` / `surplus` / `net-assets`).
33.4 `range`: `{ preset }` with `3m` / `6m` / `12m` / `24m` / `ytd`, or `{ from, to }` as `YYYY-MM`, with `from` ≤ `to`, at most 24 months, years 2000–2100.
33.5 `chart`: `line`, `bar` or `stacked-bar`.
33.6 `GET /api/personal-finance/report` → `{ report, missing }`. `missing` lists the indexes of line / account / category series not found in the owner's record (shared or any month). Such a series is kept as saved.
33.7 `PUT { report }` validates with the shared `reportError` (client and API) and replaces the report. A bad value gets 400 `{ error: "Invalid value.", field }`. Above 4 KB gets 413. `DELETE` removes it.
33.8 Gate as for `/api/personal-finance`. A read grant is enough (the report is the person's own). Audit actions: `pf.report_save` / `pf.report_delete`.
33.9 The record API never shows or changes the report, except that the owner's record `DELETE` removes the owner's report.

33.10 (2026-10-20, CFO decision 1 on PR #195, #162 R2; nothing above removed) **Read means read only.** A Personal Finance Read grant gets 403 `Forbidden.` on `PUT` / `DELETE /api/personal-finance/report`, and its stored row is unchanged. This supersedes this section's "a Read grant is enough (a preference)" for writes. GET is unchanged; owner and Write grant are unchanged. Spec 47.10; tests `reports-write.server.test.ts`.

## 34. Month control: any past month, Month + Year (#163; PFM-01..PFM-14)

Design and CFO calls Q-Y1..Q-Y9: `attachments/pf-any-month-design.md`. Supersedes 19.1's "a select of the last 12 months" and 19.3's "24 months kept". Nothing else in section 19 changes.

34.1 Under the title: `Month` (a select, `Jan`..`Dec`) and `Year` (a select, 2020 to the current year, newest first), each label above its select. Then the `Save` slot and `Unsaved changes` (section 31).
34.2 Default: the current household month. Future months can't be chosen: in the current year the later months are disabled, and switching to the current year with a later month opens the current month.
34.3 Choosing a Month or a Year opens that month at once: its own lines, else a copy of the current month's saved lines with `Copied from <Month> <yyyy> — edit and save.` (decisions 3–5, unchanged).
34.4 `Discard unsaved changes?` only when something was typed or changed on the shown month (not for an untouched copy).
34.5 Storage: every month from `2020-01` is kept, with no count limit. The record limit stays 1 MB (413 → `Not saved.`). No migration.
34.6 The averages, This month, the chart and Equity Coverage are unchanged: counted back from the current month.
34.7 Read-only: any month can be opened; no `Save`.
34.8 Layout: Month, Year and Save on one row from 360 px, each ≥ 44 px tall. Strict CLS 0, no horizontal scroll, no gold.

> **Change (2026-10-16, #163, CFO): Q-Y6 rejected.** This supersedes 34.3's "else a copy of the current month's saved lines" for past months. The rest of section 34 stands.

34.9 An empty past month opens blank: no lines, no people, no note, no `Save` (PFM-15).
34.10 `Copy from current month` (a `pf-button` under the row) is shown only to a writer, for a past month with nothing on screen, when the current month has saved lines. It copies those lines (expenses and people) into the month, with the note `Copied from <Month> <yyyy> — edit and save.` and `Save`. Nothing is stored and no request is sent until `Save` (PFM-16, PFM-17).
34.11 Leaving a copied month asks `Discard unsaved changes?`; leaving a blank month doesn't.
34.12 An empty current month is unchanged: a copy of the most recent month with lines (decision 5, PF-56), with no button (PFM-18).
34.13 Read-only: an empty past month is blank, with no button and no `Save` (PFM-19).
34.14 (PFM-11, PF-58; 2026-10-16, EL ruling, QA of a936fab) PFM-11 / PF-58 strict CLS is per month change. (1) A change between two months that both have data must be about 0 (measured 0.0000 at 360/400/1024/1440). (2) A change from a month with data to a blank month (and back) is exempt from strict CLS, because the lines and people really go. But Month, Year, the Save slot and the `Copy from current month` line must not move. Picking a month in another year by Year then Month passes through the same month of the new year; when that month is blank it counts as a data → blank change. This corrects the e7a19fa note above ("a month change has strict CLS 0").

> **Note (2026-10-16, #165, QA nit on #164):** in 34.14, "must be about 0" should read "must be 0". A change between two months that both have data is strict CLS 0. PF-58 checks it (now also by Year only).

## 35. Deleting a category or account keeps past months (#165, CFO option A KEEP)

Design: `attachments/pf-keep-deleted-design.md` (Q-Z1..Q-Z12). AC: PFD-01..PFD-14.

35.1 `Delete category` (beside `Rename`, for the chosen category) and `Delete account` (beside `Filter by account`, for the chosen account), in the `Rename` style. Each asks `Delete <name>? This month and later months lose it; earlier months keep it, marked (deleted).` Disabled for read-only and when `All` is chosen.
35.2 A delete is an unsaved change (Save shows; nothing is sent). On Save it applies to the shown month and every later stored month only. Every earlier month is left exactly as stored (CFO condition 1).
35.3 The name leaves the live list. It is never offered for another line or in a filter (Q-Z3).
35.4 Earlier months keep it on their lines. The line's select shows `<name> (deleted)`, and so do `By category` / `By account` (Q-Z1).
35.5 Chart report: a series on a deleted name keeps its past data (`seriesHistory`), and is not in `missing` while any stored line holds it. GET / PUT return `deleted` (indexes) and `labels` (`<name> (deleted)`) (CFO condition 2, Q-Z8).
35.6 Totals and averages are unchanged. A delete changes only grouping, from its month on (CFO condition 3).
35.7 A copy into a month at or after the delete month drops the name (Q-Z7). Re-adding the name (any case) re-links it (Q-Z4). Renaming to it is refused with `That name was deleted. Add it again to restore it.` (Q-Z6).
35.8 Stored as `deletedCategories` / `deletedAccounts` (`[{ name, from }]`) in the shared expenses value. There is no migration; invalid entries are dropped on read.
35.9 (2026-10-16, Diego's call pending) The Delete UI sits behind one code constant, `PF_DELETE_UI` in `src/lib/finance/flags.ts` (not an environment variable). With `true` (PR #167) everything above applies. With `false` (branch `fix/pf-keep-deleted-protection-only`), there are no `Delete category` / `Delete account` buttons and no confirm text. The KEEP protection stays: deleted names already in a record read back on earlier months, `<name> (deleted)` labels show, and report `deleted` / `labels` work. All tests stay (PFD-15).
35.10 (2026-10-16, Diego's call) **No Delete buttons on #165.** `PF_DELETE_UI = false` on PR #167. The Delete buttons are off, pending a follow-up ticket; #165 ships the KEEP protection only. 35.1 (the buttons and confirm) and the Delete steps of 35.2 / 35.7 are dormant until that ticket. 35.3..35.6, 35.8 and 35.9 apply, and a record that already holds deleted names reads back with `(deleted)`. QA: pf-months skips the PFD Delete flow with a printed reason and runs the PFD-15 protection check. PFD-01 / PFD-13 are covered by DOM tests with `deleteUi` on.

## 36. Historical series endpoint (#154, backend only)

Design and CFO calls Q-AA1..Q-AA9: `attachments/pf-series-design.md`. AC PFS-01..PFS-16. No UI, no migration.

36.1 `POST /api/personal-finance/series` `{ series, range }` returns the owner's monthly series: `range`, `months`, `current`, `partial`, `currency`, and per series `kind`, `id`, `label`, `deleted`, `missing`, `values` (one per month).
36.2 Access is the report API's: signed in with a Personal Finance read grant (owner or CFO with Read); the data is the owner's. Flag off 404, signed out 401, other methods 405, no grant 403. Read-only: nothing stored, nothing audited.
36.3 `series` is the #153 list (same kinds, ids, 1..12, no duplicates), checked by the shared `seriesListError` in `report.ts`. Errors are 400 `{ error: "Invalid value.", field }`; 413 above 4 KB.
36.4 `range` is the #153 shape. Presets `3m` / `6m` / `12m` / `24m` / `ytd` end at the current household month; `all` starts at the first month with data (Q-AA7). A custom `from`/`to` may reach back to 2020-01 and up to the current month, with no 24-month cap (Q-AA1). The saved report keeps its 24-month cap.
36.5 A month with no data is `null`; a month with data where the series has nothing is 0 (Q-AA2). Values are monthly, in the household currency at the record's current rates (Q-AA3).
36.6 Metrics: `income` / `expenses` are the Overview's month figures; `surplus` = income − expenses; `net-assets` = Starting net assets + surplus so far in the range (Q-AA4).
36.7 A deleted category / account keeps its past data, labelled `<name> (deleted)` with `deleted: true`; totals are unchanged (categories add up to `all`, which equals `expenses`) (Q-AA5, #165).
36.8 The current month is included when in range, flagged `partial: true` (Q-AA6). The household month is America/Toronto's, whatever the server timezone.
36.9 (2026-10-17, CFO on PR #169) Q-AA1, Q-AA2, Q-AA5..Q-AA9 accepted. **Q-AA4 changed:** `net-assets` for month M = Starting net assets + every month's surplus from the anchor month through M, independent of the requested range; before the anchor null; a month without a surplus carries the value flat (not null). The response names the anchor `net_assets_from`. **Q-AA10 (open):** the record stores no starting-net-assets date, so the anchor is the first month with any data (design note). This supersedes the range-relative net assets in 36.6; income / expenses / surplus are unchanged.
36.10 (2026-10-17, CFO condition on Q-AA3) Every response carries `fx_basis: "current"`: all months are valued at the record's current FX rates.
36.11 (2026-10-17, CFO on PR #169) **Q-AA10 = (a) accepted, as built**: `net_assets_from` is the first data month; (b) (a stored as-of month) is filed separately by EL. Caveat for `net_assets_from` / `net-assets`: Starting net assets is defined at the Overview window start but anchored here at the first data month, so the absolute level can be off by the surplus between those dates. The month-to-month shape is right; the level isn't trustworthy until an explicit as-of month is stored (follow-up ticket).
36.12 (2026-10-17, #155, QA #169 nit a) The documented series response shape includes `fx_basis` (always `"current"`) and `net_assets_from` (the anchor month, or null with no data): `{ range, months, current, partial, currency, fx_basis, net_assets_from, series }` (design note addendum).

## 37. Multi-series chart data (#155, backend only)

Design and Q-calls Q-AB1..Q-AB8: `attachments/pf-chart-data-design.md`. AC PFC-01..PFC-16. No UI, no migration, no schema change.

37.1 `POST /api/personal-finance/chart` takes `{ series, range, chart }` or `{ saved: true }` and returns several series aligned on one month axis: the #154 series response (section 36, unchanged, incl. `fx_basis: "current"`, `net_assets_from` and the 36.11 caveat) plus `chart`, `source`, `labels`, per series `axis` and `stack`, and `rows` (one per month: `month`, `label`, `partial`, `values`).
37.2 Access is the series / report API's (Personal Finance read grant; the owner's data). Read-only, not audited. 404 `No saved report.` for `{ saved: true }` with none stored.
37.3 `series` / `range` are validated as in #154; `chart` is `line` / `bar` / `stacked-bar` (400 `chart`); anything else in the body is 400 `query`; 413 above 4 KB.
37.4 Values are identical to `/series` for the same series and range; `rows[i].values[j]` = `series[j].values[i]`.
37.5 `axis` is `level` for `net-assets`, else `flow` (Q-AB2). In a `stacked-bar`, `stack` is true only for `line`, `account`, `category`, `fixed`, `variable`; never for `all` or metrics; other chart types stack nothing (Q-AB3).
37.6 `labels` / `rows[].label` are the Overview's short month labels (`Oct 26`); the current month's row is `partial` (Q-AB4).
37.7 `{ saved: true }` charts the caller's own saved report with its range and chart type; `source: "saved"` (Q-AB5).
37.8 Not built (Diego's call): report ranges before 2020-01 / after the current month (Q-AB7) and the Q-AB8 list.
37.9 (2026-10-17, CFO on PR #172) Q-AB1..Q-AB6 and Q-AB8 accepted; Q-AB7 routed to Diego as a LOW ticket (not built). **Condition on Q-AB2:** the response carries a chart-level `mixed_axes` boolean, true when both an `axis: "level"` and an `axis: "flow"` series are present, else false, in request and saved modes, so a UI can warn about or split such charts. It is a top-level field beside `chart`; `chart` stays the chart-type string of 37.1 (least breaking). AC PFC-17.

## 38. Report CRUD (#156, backend only)

Design and Q-calls Q-AC1..Q-AC14: `attachments/pf-report-crud-design.md`. AC PFRC-01..PFRC-18. No UI, no migration, no schema change.

38.1 `GET /api/personal-finance/reports` lists the caller's own reports `{ reports, limit: 20 }`; `POST` `{ name, report }` creates a named report (201). `GET / PUT { name, report } / DELETE /api/personal-finance/reports/:id` read, replace and remove one. Items: `{ id, name, default, report, missing, deleted, labels, created_at, updated_at }`.
38.2 Q-AC1: the #153 single report (`orpheus.finance.report.v1`) is the default report (`id: "default"`, name `Default`), stored where it was; named reports are `orpheus.finance.reports.v1` in the same row. The legacy `/report` GET / PUT / DELETE and `/chart { saved: true }` are unchanged and use the default.
38.3 Names are trimmed, 1..60 characters, no control characters, unique per person in any case; `Default` is reserved (409 `Name already used.`). Ids are `r-` + 8 hex; anything else is 404 `Report not found.`.
38.4 At most 20 named reports per person plus the default (409 `Report limit reached.`); a report is ≤ 4 KB as #153; a body above 4.5 KB is 413.
38.5 The default cannot be renamed (400 `The default report cannot be renamed.`); deleting it is the legacy DELETE; named reports stay.
38.6 Order: the default first, then named reports oldest first. PUT replaces name and report; `created_at` stays.
38.7 Access: a Personal Finance read grant; reports are the caller's own (another person's id is 404); no grant 403. Create / update audit `pf.report_save`, delete `pf.report_delete`.
38.8 `/chart { saved: true, id }` charts that report; unknown id 404 `No saved report.`; malformed 400 `query`.
38.9 The record API never shows reports and a record save keeps them. A stored named report that is no longer valid is skipped on read. Removing the last report from a row that holds nothing else removes the row.
38.10 Not built: the #173 range refusal (Q-AC12, shared validator unchanged), concurrency control (Q-AC13) and the Q-AC14 list.
38.11 (2026-10-17, CFO on PR #174) Q-AC1..Q-AC14 accepted as written (Q-AC12..Q-AC14 stay not built). **Pre-merge condition:** a rollback runbook, `docs/release/pf-reports-rollback.md`: do NOT roll back past #174 without first exporting every user's PF report keys (`orpheus.finance.report.v1`, `orpheus.finance.reports.v1` in `personal_finance.data`) with the documented read-only SELECT, a dated file and a row-count check; the restore is a separate, marked WRITE. The SQL is tested against PGlite only. A snapshot at every deploy was not built (not cheap: build-time access to the shared database plus storage and a secret; estimate in the runbook).

38.12 (2026-10-20, CFO decision 1 on PR #195, #162 R2; nothing above removed) **Read means read only.** A Read grant gets 403 `Forbidden.` on `POST /reports` and on `PUT` / `DELETE /reports/:id` (`default` included), and its stored reports are unchanged. Reports stay per person, but a person needs Write (or to be the owner) to save, replace or delete their own. GET, `/series`, `/chart` and `/export` stay read (CFO decision 2: a Read-grant export is still audited and fails closed, PFCV-17). Spec 47.10.

## 39. Report export stubs: PDF + PNG (#157, backend only)

Design note `attachments/pf-export-design.md` (Q-AD1..Q-AD13). No UI, no email.

- 39.1 `GET` (and `HEAD`) `/api/personal-finance/reports/:id/export?format=pdf|png`; `:id` = `default` or a named
  report id. Other methods 405.
- 39.2 Access as the reports API (section 38): flag off 404, signed out 401, no grant 403, another user's or unknown
  id 404 `Report not found.`; `format` missing or not `pdf` / `png` → 400 `{ error: "Invalid value.", field: "format" }`.
- 39.3 Synchronous; the response is the file: `application/pdf` or `image/png`, `Content-Disposition: attachment;
  filename="orpheus-report-<slug>-<YYYY-MM-DD>.<ext>"`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- 39.4 Values come from the same function as `/chart { saved: true, id }`; the file embeds that JSON exactly (PDF
  Info `/OrpheusData`, PNG `tEXt` `orpheus-data`).
- 39.5 Every export prints the as-of month (and whether it is the partial current month), the generation time, the
  FX basis line; with net assets, `Net assets from` and the 36.11 caveat verbatim; with mixed axes, the mixed line.
- 39.6 Read-only: no write, no audit row. ASCII text (other characters print `?`). No new dependency.
- 39.7 Every response carries `X-Orpheus-Env` (build-time `VERCEL_ENV`); QA tools that sign in refuse production.

### AC PFX

- PFX-01 gate (404 flag off / 401 / 405 / 403). PFX-02 PDF valid with headers. PFX-03 PNG valid (CRCs, IDAT size).
- PFX-05 embedded data deep-equals `/chart { saved: true, id }` (default and named, both formats).
- PFX-06 as-of / generated / FX basis printed. PFX-07 net assets from + 36.11 caveat (and mixed line) only with
  net assets. PFX-08 the PDF table equals `/chart` rows, formatted.
- PFX-09 unknown / malformed / other user's id 404. PFX-10 bad format 400. PFX-11 ASCII. PFX-12 deleted labels.
- PFX-13 Toronto month whatever the process TZ. PFX-14 worst case small and quick. PFX-15 HEAD. PFX-16 read-only.

### 39.8 CFO decisions (2026-10-17)

- Accepted: Q-AD1..Q-AD10 and Q-AD12 as built.
- **Q-AD11 audit: built (PFX-17).**
  - Every successful export `GET` (200) writes one `pf.report_export` row through the existing audit mechanism (`auditFor`, the same actor / role as `pf.report_save`, target empty as for `pf.report_save`).
  - The row's detail is `format:<pdf|png> id:<report id>`. The 0012 detail CHECK allows only letters, `_`, `:`, `+` and spaces, so the id is written with digits as capitals A-J and `-` as `_` (`r-1a2b3c4d` → `r_BaCbDcEd`; `default` stays `default`; `decodeReportId` reverses it). No migration or schema change; the action name fits the existing `^[a-z]+\.[a-z_]+$` check (it is not an enum).
  - `HEAD` is not audited: it sends no file.
  - 4xx (401 / 403 / 404 / 400 / 405) are not audited.
  - A failed audit insert is logged (action code only) and never changes the answer, as for `pf.report_save`.
- **Q-AD4 label: built (PFX-18).** For `bar` and `stacked-bar` reports, the PNG draws `Rendered as lines` as header line 3 and carries it in a `tEXt` `orpheus-note` chunk. The PDF prints the same line in the same place (it shares the header lines, so this cost nothing).
- Q-AD5 ASCII stays. Unicode fonts go to Diego as a follow-up (not built).
- Correction: Q-AD7's filename date was the UTC day in the first build. It is now the Toronto day, as the design note said.

### AC PFX (added 2026-10-17)

- PFX-17: one `pf.report_export` row per successful pdf / png GET, with id, format and actor as above. No row for 4xx or HEAD. A failed audit insert does not change the answer.
- PFX-18: bar / stacked-bar exports carry `Rendered as lines`: PNG pixels and `tEXt`, and the PDF header line. Line reports don't.

### 39.9 CFO decisions, second round (2026-10-17)

- **Q-AD14:** keep the encoded report id. A test pins the lossless round trip: per-character bijection, every hex character in every one of the 8 positions, boundary ids, and 10,000 seeded random ids. Every encoded detail fits the 0012 CHECK.
- **PFX-19, fail closed (this departs from `pf.report_save`'s log-and-continue, 39.8):**
  - The `pf.report_export` row is written BEFORE the file is sent.
  - If the insert fails, the export answers `503` `{ "error": "Export unavailable. Try again." }` as `no-store` JSON, and no file bytes are sent.
  - The failure is logged as `[audit] could not record pf.report_export` (action code only).
  - `HEAD` writes no row, so it still answers `200` with the file's headers (including `Content-Length`) when the audit is down. No file leaves the server.
  - This supersedes the "best effort" line for exports in 39.8 / PFX-17.

### AC PFX (added 2026-10-17, second round)

- PFX-19: with the audit insert failing, GET pdf / png → 503 with the JSON above, not pdf / png, no `Content-Disposition`, no file bytes, the failure logged, and no row. HEAD → 200 with no insert. Once the audit works again, exports resume.

### 39.10 QA corrections (2026-10-17, QA run `qa/run-2026-10-17-pr175.md`)

- **39.7 made true (F2, EL 2026-10-17):** QA found that at 2110718 only 3 of the sign-in tools called `refuseIfProd`. The guard is now extended, with the same helper and method, to every QA tool that signs in. Each one runs it before any request, browser launch, spawn or sign-in. The full set of 19 tools is `audit`, `dashboard-add`, `dashboard-book`, `dashboard-company`, `dashboard-leaveouts`, `dashboard-list`, `dashboard-metrics`, `dashboard-redesign`, `personal-finance`, `personal-finance-e2e`, `pf-chart-api`, `pf-export-api`, `pf-months`, `pf-report-api`, `pf-reports-api`, `pf-series-api`, `roles`, `site-shell` (also its `--compare-url`) and `site-style-regression`. `scripts/qa-prod-guard.test.mjs` enumerates the tools that read a `*_PASSWORD` from env, so a new one is covered automatically. It checks that each tool refuses the prod alias with exit 2 and no traffic, and that the guard comes first in the source.
- **EL rulings (2026-10-17):**
  - (a) One signed-out `HEAD /` before refusing a production deployment URL is acceptable (QA F5).
  - (b) Render, then audit, then send is fine (QA F6; 39.9 is met as built).
  - (c) `qa/tools/audit.mjs` (AUDIT-04) is not run for this ticket.
- **PFX-04 is reserved and unused (F1).** PFX-04 was never defined in the first draft (spec, AC list and tests all skipped it; HEAD, its likely intent, is PFX-15). Spec, AC pack (`qa/CANONICAL-AC-PACK.md`) and tests agree: PFX-01..PFX-03 and PFX-05..PFX-19.
- **Correction to the PNG text (F3):** the PNG used to print in capitals and showed `;` as `?`. The built-in bitmap font now covers printable ASCII (lowercase, digits and punctuation), so the PNG prints the header lines, including the 36.11 caveat, verbatim. Non-ASCII still prints `?` (Q-AD5). The text is wrapped to the image width.

### 39.11 Signed-out prod mode (2026-10-17, QA F7, EL option 1)

- **F7, EL option 1 (2026-10-17): signed-out prod mode.**
  - The production guard (same detection: the static prod hosts, otherwise one `HEAD /`) refuses a production or unconfirmed target **only** when a sign-in or write env var is set: any non-empty sign-in variable the tools read (`QA_*_EMAIL` / `QA_*_PASSWORD` and `ORPHEUS_OWNER_EMAIL`), or `QA_WRITE`. Unrelated `*_PASSWORD` variables don't count. It then exits 2 with `REFUSED …`; a static prod host gets no request at all.
  - With none set, the tool runs signed out against production. It prints exactly `signed-out prod mode (prod: signed-out only)`, and never signs in or writes:
    - tools skip their signed-out write probes on the guard's returned mode, and send GET only;
    - `session.mjs` skips sign-in;
    - as a safety net, `fetch` and every browser context refuse non-GET / HEAD and `/api/auth/` requests.
  - 39.7 now reads: QA tools that sign in refuse production when credentials or `QA_WRITE` are set, and run signed out otherwise.
  - Tests: `scripts/qa-prod-guard.test.mjs` runs every sign-in tool against a faked network with zero real traffic, and asserts no sign-in or write requests.

### 39.12 Signed-out prod mode reaches child processes (2026-10-17, QA F8, EL option 1)

- **Correction to 39.11 (QA F8, EL option 1, 2026-10-17):** 39.11 overclaimed. On a real no-credential prod run of `site-style-regression`, QA saw its child `signin-page.mjs` send 4 POSTs to `/api/auth/sign-in/email` (failed sign-ins with made-up addresses, 401). That child read no credential variable, and child processes did not inherit the fetch / browser backstop. Fixed (tooling only):
  - A parent that resolves signed-out prod mode sets `ORPHEUS_QA_PROD_MODE=signed-out` in its env before spawning anything, so every child inherits it.
  - `qa/tools/prod-guard.mjs` turns the backstop on at import in any process where the marker is set. `refuseIfProd` returns `{ signedOutProd: true }` whenever the marker is set, whatever the target.
  - Every tool `site-style-regression` spawns now calls the guard: site-shell and personal-finance already did; home-page, calculator-page, saved-searches, signin-page and site.mjs now do. `scripts/release-smoke.mjs` (GET only) imports the guard, so the backstop applies to it.
  - `signin-page.mjs` renders and checks the sign-in page but never submits on prod. It prints `INFO … failed sign-in submit SKIPPED (signed-out prod mode)` per viewport.
  - Tests: `scripts/qa-prod-guard.test.mjs` runs site-style-regression and all its children on a faked network. It asserts no POST to `/api/auth/`, no non-GET / HEAD and no submit click, and that the marker is inherited and honoured. `scripts/qa-tools-session.test.mjs` fails any `qa/tools` file that can sign in or write without importing and calling the guard (two observe-only files are exempt, with reasons).
  - 39.11 is accurate with this addition: in signed-out prod mode, no process in the run (parent or child) signs in or writes.

### 39.13 Zero `/api/auth/` requests reach the server in signed-out prod mode (2026-10-17, EL, #158)

- **Note (EL, 2026-10-17), added in #158; it doesn't edit 39.11 or 39.12:** in signed-out prod mode, **zero** `/api/auth/` requests reach the server. SWE confirmed this with a real no-credential prod run of `site-style-regression --smoke-mode on` at be306f7 (an SWE run, not a QA run): 258/258 passed, 0 `/api/auth/` POSTs reached the server, and no node process sent anything other than GET / HEAD.
- personal-finance PF-34 makes **mocked** sign-in attempts: 4 browser `POST /api/auth/sign-in/email`, answered inside the browser by the tool's own `page.route` (`route.fulfill`; no server address). They never leave the browser and **do not count** as requests to the server. PF-34 stays as built.

### 39.14 Unicode text in the exports (2026-10-21, #176; pointer only, nothing above changed)
The issue asks for its ACs to go under spec 39. They are in **section 50** (next spec number) and the AC pack `PFU-01..PFU-16`. Everything in 39.1–39.13 still holds until 50 is built.

## 40. Chart report API contract (#158, backend only)

Contract (single source of truth): `attachments/pf-charts-api-contract.md`. AC PFAPI-01..PFAPI-14. No UI, no new route, no migration, no schema change, **no wire change**.

40.1 The five endpoints the Charts UI (#160–#162) calls are R1 `POST /series`, R2 `POST /chart`, R3 `GET|HEAD|POST /reports`, R4 `GET|HEAD|PUT|DELETE /reports/:id` and R5 `GET|HEAD /reports/:id/export?format=pdf|png`. The legacy `/report` (L1) stays as built, and the UI doesn't use it.
40.2 Typed client `src/lib/finance/charts-api.ts`: shared request and response types, one error shape `{ ok: false, status, code, error, field? }` with a client-derived `code` (contract section 6), and thin calls `listReports`, `getReport`, `createReport`, `updateReport`, `deleteReport`, `chartQuery`, `chartSaved`, `seriesQuery`, `exportUrl`, `exportReport`. They send exactly the requests the routes already accept.
40.3 End-to-end on PGlite through the real handlers (`charts-api.server.test.ts`, TZ=UTC and TZ=America/Los_Angeles): create → chart `{ saved: true, id }` → export pdf and png (audit rows) → update → chart again (new values) → delete → chart, export and GET all 404. The chain runs through the typed client, with a fetch that routes to the handlers.
40.4 Audit (the inconsistencies across the five, plus L1) is listed in 40.6. The only fix built is non-behavioural: the export handler's stale "not audited" comment. The response item type is now shared (`ReportItem`), a type-only change.
40.5 The contract doc is linked from this spec, `README.md` and `AGENTS.md`. A test fails if a route, a method list, a limit or a message in the doc drifts from the code.
40.6 Q-calls (none built, because each would change the wire or add a route). CFO must accept any of them first. The design and recommendations are in contract section 7.
- Q-AE1 `/chart` unknown id says `No saved report.` while R4 and R5 say `Report not found.`
- Q-AE2 A malformed id is 400 `query` on `/chart` but 404 on R4 and R5.
- Q-AE3 The default report has null `created_at` / `updated_at` (#160 shows "last updated").
- Q-AE4 Saved reports cap a custom range at 24 months with no `all` preset, while `/series` and `/chart` allow both (#161 "as far back as data exists"). See Q-AC12.
- Q-AE5 There is no Email export route (#161 Export menu: Email).
- Q-AE6 DELETE shapes differ: L1 `{ report: null, … }`, R4 `{ deleted: id }`.
- Q-AE7 Body-shape errors differ: L1 `Body must be a JSON object.` (no field); R3 / R4 `Invalid value.` `body`; R1 / R2 `Invalid value.` `query`.
- Q-AE8 `POST /reports` 201 has no `Location` header.
- Q-AE9 HEAD on the JSON GET routes builds the body and leaves dropping it to the platform; the export sends none.
- Q-AE10 L1 duplicates `/reports/default`.
- Q-AE11 The 413 text and limits differ: `Query too large.` at 4096 B (R1, R2), `Report too large.` at 4608 B (R3, R4) and 4096 B (L1).
- Q-AE12 405 comes before 401, so a signed-out wrong method shows 405.
- Q-AE13 `X-Orpheus-Env` is set by Vercel routing only, so local dev and tests don't carry it.
- Q-AE14 `limit: 20` counts named reports only; the default is extra.
40.7 (2026-10-17, #158 QA round 1; this changes the 40.5 claim) The drift test now ties the doc to the **server**, not to the client's copy. Contract section 8.1 lists all 17 messages and the routes that send each one. The test drives the real handlers for each of the 61 message × route pairs and asserts the status and the exact `error` text. Section 8.2 lists the caps, which are checked against their server constants and at their boundary (cap allowed, cap + 1 refused). Every byte cap and count in the prose (sections 3 and 4) must match them, including R1 / R2's "no 24-month cap". QA's 4 surviving mutations and 26 more were all killed (see the PR body). `scripts/qa-prod-guard.test.mjs` now covers every `refuseIfProd` caller, `pf-charts-contract` included, against a pinned set of 25.

## 41. Saved reports: the dynamic `all` range and range bounds (#179, folds in #173; added 2026-10-17)

Business user: CFO. Backend only. No migration, no schema change, no new route, no Email (#180). AC PFALL-01..PFALL-14 (`qa/CANONICAL-AC-PACK.md`). Contract additions: `attachments/pf-charts-api-contract.md` section 9.

41.1 **One range validator** (`rangeError` in `src/lib/finance/report.ts`) serves `/series`, `/chart` and every saved-report path: `/reports` POST, `/reports/:id` PUT and legacy `/report` PUT. It has three modes:
- `query` (`/series`, `/chart`): presets `3m 6m 12m 24m ytd all`; a custom range within 2020-01..the current month, with no length cap. Unchanged.
- `save` (every saved-report write): the same presets, `all` included; a custom range within 2020-01..the current month and at most 24 months.
- `stored` (reading what is already stored): the same presets; a custom range is a valid `YYYY-MM` span in 2000..2100 of at most 24 months. This is the pre-#179 rule, so no existing stored report stops reading.
41.2 A saved `all` is stored as `{ "preset": "all" }` and resolved **each time the report runs** (`/chart { saved: true, id }`, the export), with the same rule as `/series`: from the first month with data (lines or typed Overview totals, ≥ 2020-01) to the current household (Toronto) month. It grows as months are added and is never frozen at save time.
41.3 (#173) A save refuses a custom `from` before 2020-01 or a `to` after the current Toronto month. The answer is 400 `{ "error": "Invalid value.", "field": "range" }`, the same wording and limits as `/series` (Q-AF4). Nothing is stored.
41.4 Existing stored reports (the legacy default `orpheus.finance.report.v1` and named `orpheus.finance.reports.v1`) read, list, chart and export exactly as before, including ranges outside the new bounds (charted as nulls, spec 37.8). Re-saving one without fixing its range is refused (41.3).
41.5 The export prints a saved `all` as `Range: All data (<from> to <to>)` with the resolved months. With no data months it prints `Range: All data (no data yet, <current month>)` and charts the current month only, with nulls (Q-AF1, Q-AF2). Other ranges print as before.
41.6 The client (`report-client.ts`, `charts-api.ts`) checks a save with the same validator, using the browser's current Toronto month. The server stays the authority.
41.7 Q-calls Q-AF1..Q-AF9 (CFO): in section 41.8 below, each with a recommendation and marked built or not built.
41.8 Q-calls:
- Q-AF1 How `all` shows in the export: **built** `Range: All data (2020-03 to 2026-10)`. This uses `YYYY-MM`, like every other export line, and stays ASCII. Alternative, not built: `All data (Mar 2020 to Oct 2026)`. Recommendation: as built.
- Q-AF2 An `all` report with no data months: **built**. It resolves to the current month only, with null values, exactly as `/series` `all` does today (Q-AA7). The export prints `All data (no data yet, <month>)`. Recommendation: as built (no error; the report fills in as data arrives).
- Q-AF3 The 24-month cap on explicit saved ranges: **kept (built as is)**. Recommendation: keep it; `all` covers the long view, and a longer explicit cap can be a later call.
- Q-AF4 Message text for out-of-bounds saves: **built** with the series API's wording, 400 `Invalid value.`, field `range` (#173 asked for "the same wording and limits as the series API"). **Not built:** clearer texts `Range can't start before 2020-01.` (field `range.from`) and `Range can't end after the current month.` (field `range.to`). Because the validator is shared, these would change `/series` and `/chart` too, which is a wire change on routes outside this ticket. Recommendation: adopt the clearer texts on all three routes together in one small follow-up, once CFO accepts.
- Q-AF5 Stored out-of-range reports: **built**. They read, chart and export unchanged; a re-save must fix the range. Recommendation: as built (no rewrite, no migration).
- Q-AF6 Where `all` starts: **built**. It starts at the first month with data (lines or typed Overview totals), not at 2020-01, so a chart has no leading empty years. Recommendation: as built (the same rule as `/series`).
- Q-AF7 The current month for a save: **built**. It is the household (Toronto) month at request time on the server; the client uses the same rule for its pre-check. Recommendation: as built.
- Q-AF8 Legacy `/report` PUT: **built**. It shares the validator, so it gains `all` and the bounds too (it was #173's original target). Recommendation: as built.
- Q-AF9 What a list or GET returns for `all`: **built**. The stored `{ "preset": "all" }`, not the resolved months; resolved months come only from `/chart` and the export. Recommendation: as built (the UI shows "All data" and asks `/chart` for months).
41.9 (2026-10-17, correction to 41.3's field) The refusal's `field` follows each route's existing convention: `report.range` on `/reports` POST and `/reports/:id` PUT (body fields carry a `report.` prefix, spec 38 / PFRC-06), and `range` on legacy `/report` PUT. The error text is `Invalid value.` on all three. Contract section 9.
41.10 (2026-10-17, CFO decision) Q-AF1..Q-AF3 and Q-AF5..Q-AF9 are accepted as built. **Q-AF4 is accepted and built.** The shared validator's two bound refusals now say `Range can't start before 2020-01.` (a well-formed custom `from` from 2000-01 to 2019-12) and `Range can't end after the current month.` (`to` after the current Toronto month). This applies in query mode (`/series`, `/chart`, which already refused exactly these two cases with `Invalid value.` before #179; no bound was added) and in save mode (every saved-report write). Status 400 and the fields (`range`; `report.range` on `/reports` and `/reports/:id`) are unchanged. When both apply, `from` is reported, and save mode checks the bounds before the 24-month cap. Everything else keeps `Invalid value.`: a month before 2000 or after 2100, malformed months, `from` after `to`, missing keys, unknown presets, and a range that is only over the cap. Stored reports are never checked against the bounds. Contract section 10; AC PFALL-15 / PFALL-16; QA list `RANGE_BEFORE_FIRST` / `RANGE_AFTER_CURRENT` in `qa/tools/pf-helpers.mjs`.

## 42. Starting net assets 'as of' month (#171; follow-up to #154 Q-AA10; added 2026-10-17)

Business user: CFO. AC pack: PFAO-01..PFAO-18 (`qa/CANONICAL-AC-PACK.md`). Contract: `attachments/pf-charts-api-contract.md` section 11. Tests: `src/lib/finance/as-of.server.test.ts` (PGlite, real handlers, fixed clocks, TZ=UTC and TZ=America/Los_Angeles) and the `expenses-page.dom.test.tsx` PFAO case.

42.1 **Problem.** The record stores no date for Starting net assets. The Overview treats it as the value at the start of its rolling 12-month window; `/series` anchors it at the first month with data (`net_assets_from`, Q-AA10). The shape is right but the level can differ by the surplus between those two months.

42.2 **Data model.** The overview value (`orpheus.finance.overview.v1`, already in the per-user `personal_finance` JSON) gains an optional `asOf: "yyyy-mm"`. It is kept as typed, so the page can show an error, and omitted when empty. **No migration, no schema change, no stored default.** A record without `asOf` is byte-for-byte what it was, and so is everything computed from it.

42.3 **Meaning.** Starting net assets is the value at the **start** of `asOf`. Net assets at the end of month M (M ≥ `asOf`) are the start plus every month's surplus from `asOf` to M. A month without a surplus adds nothing, as in the #154 rule. Before `asOf`, net assets are null.

42.4 **Series, chart and export.** `net_assets_from` is `asOf` when one is set, else the first data month (unchanged). Values follow 42.3, with no new wire field. With `asOf` set, the export prints `Net assets from: <month> (as-of month)` and the note `Starting net assets is the value at the start of its as-of month; each month adds its own surplus.` in place of the 36.11 caveat (Q-AG7).

42.5 **Overview.** With `asOf` set:
- If `asOf` is before the window, the window starts from the start plus each earlier month's own surplus (the 42.3 rule), then works as before: empty months in the window use the average.
- If `asOf` is inside the window, points before it have no net assets (a gap in the line), and from it on the line is as before.
- Coverage and every other figure are unchanged (Q-AG6, Q-AG11).
- Setting `asOf` to the window's first month gives exactly the old Overview.

42.6 **UI.** A text field labelled `As of month`, placeholder `YYYY-MM`, sits between Starting net assets and Growth rate (%) in the same `.pf-rates` grid. That is one row on desktop and stacked at 390 px; it is 44 px high, uses the same dark style, has no gold and has an accessible label. A bad month shows `Enter a month as YYYY-MM, from 2020-01 to this month.` (aria-invalid). It blocks Save like any field in red, and the figures leave it out, falling back to the old anchoring. Clearing the field removes `asOf`.

42.7 **Bounds.** A usable month runs from 2020-01 to the current Toronto month. Both the page and the record API use the #179 shared validator (`rangeError` in save mode, as a one-month range). The record API refuses a bad `asOf` with the existing 400 `Invalid value.` and field `overview.asOf`, and stores nothing. It does not reuse the AF4 "Range can't…" texts, which name a range (Q-AG9).

42.8 **Q-calls for CFO** (each with a recommendation; "built" means built as recommended):
- Q-AG1 `asOf` relative to the first data month: **built**. Before it, the start carries flat until data begins. After it, months before `asOf` are null and their surplus is left out of net assets (income, expenses and surplus series are unchanged). Recommendation: as built.
- Q-AG2 `asOf` outside the chart range: **built**. Before the range, the level carries in. After the range, every net-assets value is null and `net_assets_from` still names `asOf`. Recommendation: as built.
- Q-AG3 Default UI value: **built**. Empty, meaning no as-of month and the old behaviour. No guessed default is stored: never pre-filled with the window start or the first data month. Recommendation: as built.
- Q-AG4 Label text: **built**. `As of month`, placeholder `YYYY-MM`. The alternative was `Starting net assets as of`, which is clearer but too long for a 16rem cell at 390 px. Recommendation: as built.
- Q-AG5 Clearing it: **built**. It reverts to the old behaviour exactly; the key is removed. Recommendation: as built.
- Q-AG6 Overview wording: **built (no new text)**. The field itself says what the start means. **Not built:** a dim line under the chart such as `Net assets from <Month YYYY>`. Recommendation: no extra wording now; revisit with #160.
- Q-AG7 Export: **built**. `Net assets from: <month> (as-of month)` plus a `Note:` line in place of the caveat when `asOf` is set; unchanged otherwise. Recommendation: as built.
- Q-AG8 A wire field telling the UI the anchor is explicit (e.g. `net_assets_as_of`): **not built**, because it would be a wire change. Recommendation: add it when the #160–#162 Charts UI needs it.
- Q-AG9 Bounds and message: **built**. The #179 validator with the existing `Invalid value.` and field `overview.asOf` on the record API. The page error text is new but is an obvious validation text. Recommendation: as built.
- Q-AG10 Should `all` start at `asOf` when it is earlier than the first data month? **Not built**; `all` is unchanged. Recommendation: keep `all` = data months.
- Q-AG11 Should equity coverage use the anchored net assets instead of the typed start? **Not built**; coverage is unchanged. Recommendation: separate ticket if wanted.
- Q-AG12 An `asOf` after the current month (only possible with a skewed clock, since saves refuse it): **built**. It still anchors there, so everything is null until then. Recommendation: as built.

42.9 **(2026-10-17, CFO decision)** Q-AG2..Q-AG8, Q-AG10 and Q-AG12 are accepted as built. Q-AG11 is not built, by decision. Q-AG1 and Q-AG9 are changed and built as follows (42.10, 42.11). The 24-month cap message is in 42.12.

42.10 **(2026-10-17, Q-AG1 changed) Work backwards.** An as-of month A after the first data month F no longer blanks the months before A.
- **Convention, the same as the forward roll:** every value is at the END of its month, and Starting net assets is the value at the START of A, which is the end of A−1. So:
  - net(A−1) = start (A's own surplus is **not** taken off);
  - net(M) = net(M+1) − surplus(M+1) for each earlier M, down to F, and never before F (as without an as-of month);
  - forward from A, as before: net(A) = start + surplus(A).
  - Every month after the first value is therefore the month before plus its own surplus, in both directions. A month without a surplus changes nothing.
- **Where it lives:** inside the one anchor rule (`netAssetsFrom`'s `back` argument). The series passes F. The Overview works backwards over its window points before A, using the same per-point surplus as its forward roll, where empty months use the average. FX is unaffected: every month is already valued at current rates (Q-AA3), forwards and backwards alike. Growth only applies to the Future projection, which still starts from the current month.
- **Consequence for Q-AG2:** a range that ends before A is no longer all null; it shows the backward values. Showing null there would make a month's value depend on the range asked for.
- **Q-AG12 is kept:** an A after the current month (skewed clock only) still blanks everything before it.
- **Unchanged:** an A at or before F; no as-of month; the export text.

42.11 **(2026-10-17, Q-AG9 changed) Record bound messages.** The record API (`PUT /api/personal-finance`) refuses an as-of month before 2020-01 with `Month can't be before 2020-01.` and one after the current Toronto month with `Month can't be after the current month.`. Both are 400 with field `overview.asOf`.
- The mapping is from the #179 validator's two bound refusals; everything else it refuses (malformed, before 2000 or after 2100) stays `Invalid value.`. No awkwardness.
- The page error text `Enter a month as YYYY-MM, from 2020-01 to this month.` is kept. It covers both cases and the malformed one in one hint, in the page's "Enter …" style like `Enter a number, 0 or more.`.

42.12 **(2026-10-17, CFO request) 24-month cap message.** The existing cap on saved-report ranges now says `Range can't be longer than 24 months.`, with the same 400 and field (`report.range` on `/reports` POST and `/reports/:id` PUT, `range` on legacy `/report` PUT). The cap exists only in save mode (and in stored mode, which never reaches the wire), so the message is never sent by `/series` or `/chart`, which have no cap. No cap was added anywhere. The bounds are still checked first.

42.13 **(2026-10-17, QA early findings on 1ca3c3d, QA's)**
- (1) pf-export-api PFX-06/07 now follows the stored `overview.asOf`, read via the record API: none requires the caveat and forbids the as-of note; set requires the note naming that month.
- (2) PFS-20 expects back-filled values before `net_assets_from` (42.10). The anchor month's own value is non-null and equals the start plus that month's surplus, and the month before it, when shown, equals the start.
- (3) Storage now matches 42.2: the record API strips an empty `asOf` (`"asOf": ""`) from the stored overview text and from its reply. That is the stored field only; no other reply shape changes. The figures are the same, since empty means none. Any other overview text is stored byte for byte.

The shared tool logic is `qa/tools/pf-asof-checks.mjs`, which `as-of.server.test.ts` imports and replays through the real handlers.

42.14 **(2026-10-18, docs consistency after QA)** Earlier statements in this section that 42.10–42.13 change, listed so no reader takes them as current: 42.3 "Before `asOf`, net assets are null" now holds only for an `asOf` at or before the first data month, or after the current month (Q-AG12); after the first data month the months back to it are worked backwards (42.10). 42.7 and the Q-AG9 row ("the existing `Invalid value.`"): the two bound refusals now have their own messages (42.11); `Invalid value.` remains for malformed months. The Q-AG1 row ("months before `asOf` are null"): changed by 42.10. The Q-AG2 row ("after the range, every value is null"): changed by 42.10's consequence.

## 43. Historical FX rates for past months (#170; follow-up to #154 Q-AA3; added 2026-10-18; Phase 1: spec and Qs, nothing built)

Business user: CFO. AC PFFX-01..PFFX-16 (`qa/CANONICAL-AC-PACK.md`). Every Q-AH below is **NOT built**. Until the CFO and Diego decide, `fx_basis` stays `"current"` and every response, chart and export is byte-for-byte today's.

43.1 **Problem (the ticket).** `/series`, `/chart` and the export label every month `fx_basis: "current"` (36.10, 36.12; export line `FX basis: current (every month is valued at today's rates, not historical rates)`). Past foreign-currency months are revalued, not historical fact. Goal: store an FX rate per month and return `fx_basis: "historical"` when it is available, falling back to `"current"` with today's behaviour exactly.

43.2 **Facts found (2026-10-18, code at d1308bc).**
- **PF rates are typed, per line.** A foreign expense line carries its own `currency` and a typed `rate` (`Line.rate` in `expenses.ts`; #102 v2 direction: foreign units per 1 household unit, amount ÷ rate; the field comment in `Line` still says the #87 direction). No PF code fetches a market rate. The household currency is one code from `CURRENCIES` (USD CAD EUR GBP BRL MXN CHF JPY AUD CNY; default CAD), its own key `orpheus.finance.currency.v1`.
- **Each month's lines already carry their own typed rate.** `orpheus.finance.months.v1` stores whole lines per month (copied forward when a month is opened, #112), and `seriesValues` / `totalsOf` convert each month with **that month's line rates**, not the shared lines' rates. Probe: shared rate 0.9, Aug line 0.5, Sep line 0.8, USD 1,000/month → `all` = 2,000 and 1,250 (not 1,111.11 twice). So "current" today means "the rate typed on that month's lines when it was last saved", which is neither a market rate nor necessarily today's. Months without lines (typed Update totals) are already in the household currency, so FX does not apply to them.
- **`fx_basis` paths.** `series.ts` (type `fx_basis: "current"`, literal in `seriesValues`), `chart.ts` (passes the series result through, both bodies), `export.ts` (`FX_LINE` in the header of PDF and PNG). Contract section 3 / 5 shape: `fx_basis: "current"`.
- **The daily market-data job already stores daily FX**, for the dashboard: `vercel.json` cron `/api/cron/daily-refresh` at 23:00 UTC (authorised by `CRON_SECRET`; no FX key exists or is needed) → `refreshFx()` in `src/lib/dashboard/fx.server.ts`. Sources: **Bank of Canada Valet** (public, no key; CAD per unit, daily, business days) for USD and EUR always and SEK / PLN when held; **ECB reference rates** (public, no key, last 90 days) crossed with BoC EUR for DKK / HUF / CZK. Stored in table **`fx_rates`** (`quote`, `rate_date`, `cad_per_unit`, `source` ∈ {`BOC`,`ECB_CROSS`}; migration 0002), insert-only, history kept from the first fetch (30 days back on the first run). Lookup `rateOnOrBefore`. It is a shared (not per-user) table, written only by the job.
- **No other FX source or dependency** is in `package.json`. The PF currencies GBP, BRL, MXN, CHF, JPY, AUD, CNY are published by the BoC as daily series (`FX<CCY>CAD`), but are not fetched today.
- **Storage options without a migration:** (a) the per-user `personal_finance.data` JSONB (a new key, e.g. `orpheus.finance.fx.v1` = `{ "<yyyy-mm>": { "<CCY>": "<rate>" } }`, inside the record's 1 MB limit; ~10 currencies × 82 months is a few KB); (b) the existing shared `fx_rates` table: `quote` is free text, so new BoC quotes need no schema change (source `BOC` is allowed). A monthly figure can be derived at read time from the daily rows. Only a **new** table (e.g. a monthly cache) would need a migration; nothing here requires one.

43.3 **Rule for every option (fixed, not a Q).** With no historical rate available for a month and currency, that month is converted exactly as today (its lines' typed rates) and the response says `fx_basis: "current"`. The #171 anchor rule (`netAssetsFrom`, spec 42.10) is unchanged: it only consumes the per-month surplus, whatever FX produced it. No new message, no wire field and no migration until a Q-AH says so.

43.4 **Q-AH (for the CFO and Diego; all NOT built).** "Blocks" names the Phase 2 parts that cannot start without the answer.
- **Q-AH1 Source.** (a) capture at save time (the page writes the month's rates when a month is saved); (b) a historical provider read per request; (c) reuse the daily job's BoC data (`fx_rates`), extended to the PF currencies. Trade-offs: (a) no cost, no secret, but only future saves get a rate and it is whatever the app knows then (today: the typed rate, which months already store — see 43.2); (b) needs a provider; free no-key ones are BoC / ECB, anything else means a key or cost and a runtime dependency on a third party per request; (c) no cost, no secret, no migration, official daily data, history from 2017 available from BoC, but it ties PF to the dashboard job's schedule and the shared table. **Recommendation: (c)**, BoC Valet via the existing job and `fx_rates`. Blocks: all fetching / storage work.
- **Q-AH2 Backfill.** none / from the provider / manual. Trade-offs: none = only months after go-live become historical (most of the history stays `current`); provider = one bounded job run from 2020-01 (BoC is free; ~82 months × 7 new quotes of daily rows), with an audit of the job's size limits; manual = CFO types rates (error-prone, effort). **Recommendation: from the provider (BoC), 2020-01 on, in the daily job, idempotent.** Blocks: the backfill step.
- **Q-AH3 Storage and migration.** JSON in the per-user record vs the shared `fx_rates` table vs a new monthly table. Trade-offs: per-user JSON = no migration, but every user stores the same public data and a record write is needed to update it; `fx_rates` = no migration, one copy, already the job's store; a new table = cleanest monthly model but a migration (out of rules today). **Recommendation: `fx_rates` as is, monthly value derived at read time.** Blocks: storage code.
- **Q-AH4 Conventions.**
  - (a) Month value: month-end (last published rate on or before the month's last day) vs monthly average of business days. Average is closer to how expenses accrue; month-end is simpler and what the BoC lookup already supports. **Recommendation: monthly average** (BoC also publishes official monthly averages, but under other series; deriving from the daily rows keeps one source). For the current, partial month: the average so far.
  - (b) Precision: keep BoC's 4 decimals as stored; convert at full precision; round only for display as today (2 decimals). **Recommendation: as stated.**
  - (c) Mid-month save: a line saved on any day belongs to its month key (the month it is saved under, not the save date). **Recommendation: the month key.**
  - (d) Missing months for a currency: carry forward the last earlier month vs fall back to the typed rate. **Recommendation: fall back to the typed rate (`current`) — no carry-forward**, so a historical value is always that month's own.
  - (e) Base: BoC is CAD per unit; a non-CAD household crosses through CAD (as the dashboard does). **Recommendation: cross through CAD.**
  - (f) Partial availability: `fx_basis` per response vs per point. **Recommendation: per response, `"historical"` only when every converted foreign amount in the response used a historical rate; otherwise `"current"`** (keeps the wire as is; Q-AH5 asks about a per-month field).
  - (g) Which rate wins: a historical market rate replaces the month's typed line rate, or the typed rate is kept as an override. **Recommendation: historical replaces it for `/series`, `/chart` and the export only; the page keeps the typed rate.** (Needs CFO: the typed rate is the user's own fact for that month.)
  Blocks: the conversion code and its tests.
- **Q-AH5 Wire.** Add a field (e.g. per-month `fx_basis_by_month` or a `fx_source` note) vs keep the wire unchanged and only allow the value `"historical"`. Trade-offs: a new field helps the Charts UI explain mixed months but is a contract change (drift tests, client, QA tools); no field keeps every consumer working. **Recommendation: no new field; `fx_basis` may become `"historical"`; the export line gets a historical variant text.** Blocks: contract and export text.
- **Q-AH6 Export text.** The `historical` variant of `FX_LINE`, e.g. `FX basis: historical (each month at its own monthly-average rate, Bank of Canada)`. **Recommendation: that text; unchanged when `current`.** Blocks: export change only.

43.5 **Safe to build before the answers (Phase 2 plumbing, behaviour-neutral).** A pure `fxBasisFor(...)`-style seam that today always returns `"current"` and the typed-rate conversion; regression tests that pin today's numbers and texts (PFFX-01..05); tests that the #171 anchor rule is untouched (PFFX-06). Nothing that fetches, stores or changes any response.

43.6 **(2026-10-20, Diego's decisions; supersede the "NOT built" status of Q-AH1..Q-AH4 and Q-AH6 where they agree)**
- **Q-AH1 Source: DECIDED (Diego)** — Bank of Canada Valet (public, no key), through the existing `fx_rates` table. No new secret.
- **Q-AH2 Backfill: DECIDED (Diego)** — from 2020-01, idempotent. The run against any shared database (preview or Production) is EL's call; the command lives in a dated runbook under `docs/release/`.
- **Q-AH3 Storage: DECIDED (Diego)** — no migration. `fx_rates` holds **daily** BoC rows (`quote`, `rate_date`, `cad_per_unit`, source `BOC`); new PF quotes (GBP BRL MXN CHF JPY AUD CNY) fit as is (`quote` is free text; `BOC` is an allowed source). The monthly average is **derived at read time** from those daily rows, so no monthly row, new column or new source value is needed. If a stored monthly row were ever required, that would need a schema change and comes back as a Q.
- **Q-AH4a/d Convention: DECIDED (Diego)** — a month's rate is the mean of that month's business-day BoC rows (the days BoC published); a month or currency with no rows falls back to the line's typed rate (today's `current`). No carry-forward.
- **Q-AH6 Export: DECIDED (Diego)** — the export FX line changes when historical rates are used; the exact text is Q-AH8.
- **Q-AH5 Wire: DECIDED (Diego)** — `fx_basis` may be `"historical"`; no other wire field is proposed.

43.7 **Remaining open choices (NOT built until answered; recommendation in bold, the build follows it unless overruled).**
- **Q-AH7 The per-response `fx_basis` rule (product choice).** **`"historical"` only when at least one foreign-currency amount was converted in the response's months AND every such conversion used a historical rate; otherwise `"current"`** (including a response with no foreign amounts at all, so a household-only record stays byte-identical to today). Alternative: `"historical"` when any conversion used one (misleading for mixed months). Blocks: the fx_basis literal only.
- **Q-AH8 Export text.** **`FX basis: historical (each month at its Bank of Canada monthly average rate)`** when `fx_basis` is `"historical"`; today's line unchanged otherwise. Blocks: the export header only.
- **Q-AH9 Partial current month.** **The average of the business days published so far** (the same rule as any month). Alternative: always `current` for the partial month. Blocks: nothing else.
- **Q-AH10 Precision.** **Full precision from the stored BoC decimals; cross via CAD for a non-CAD household (rate = CAD per household unit ÷ CAD per line unit, both monthly averages); display rounding unchanged.** Blocks: conversion tests.
- **Q-AH11 Typed rate vs historical.** **Historical replaces the month's typed line rate on `/series`, `/chart` and the export only; the page keeps the typed rate.** Blocks: which surfaces change.
- **Q-AH12 Ingestion scope.** **The existing daily job (`refreshFx`, cron unchanged, no `vercel.json` edit) also fetches the seven PF currencies daily.** This adds ~7 Valet series per run; it does not change the schedule. Blocks: the job change.

43.8 **(2026-10-20, CFO and EL on Q-AH7..Q-AH12; supersedes 43.7 where they differ)**
- **Q-AH8, Q-AH9, Q-AH10: accepted (CFO)** as recommended in 43.7. **Q-AH12: accepted (CFO; confirmed by EL)**: `refreshFx` also fetches the seven PF currencies (GBP BRL MXN CHF JPY AUD CNY); cron and `vercel.json` unchanged. EL runs the backfill from the runbook `docs/release/2026-10-20-pf-fx-backfill.md`.
- **Q-AH7 changed (CFO): three values.** Counting every foreign-currency line or person in the stored months from the first through the response's last month:
  - `"historical"`: at least one conversion, and every one used that month's BoC average;
  - `"current"`: no conversion used a historical rate (including no foreign amount at all, so a household-only record, or one with no stored rows, is byte-identical to today);
  - `"mixed"`: some used a historical rate and some fell back to the typed rate.
  - **Wire (only when `"mixed"`):** a new field `fx_fallback_months`: the sorted, distinct `yyyy-mm` months in which at least one conversion fell back to the typed rate, e.g. `["2020-03","2021-07"]`. It sits right after `fx_basis` and is absent for `"current"` and `"historical"`.
  - **Export (Q-AH8 extended):** `"historical"` prints `FX basis: historical (each month at its Bank of Canada monthly average rate)`; `"mixed"` prints `FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2020-03, 2021-07)` (the months of `fx_fallback_months`, comma-separated); `"current"` prints today's line unchanged.
- **Q-AH11 changed (CFO):** the page keeps the typed rate (it is what Save stores and what the page totals use) and shows a dim note next to each `FX rate` field: `Charts and exports use historical FX`. The page figures are unchanged.

43.9 **(2026-10-20, QA on febf0ec, `qa/runs/run-2026-10-20-pr190.md` F1–F6; EL ruling on Q-AH13)** Worked examples, bounds and the deploy-to-backfill window. Direction everywhere: BoC rows are CAD per 1 unit; a PF line rate is foreign units per 1 household unit (#102), so a CAD household's USD line rate = 1 ÷ avg(CAD/USD) and the amount is divided by it.
- **Monthly average (Q-AH4a; PFFX-19).** USD rows 2024-03-01 `1.3500`, 2024-03-04 `1.3600`, 2024-03-05 `1.3700` (the only March rows) → March average 1.3600 CAD/USD. CAD household: rate = 1 ÷ 1.36 (USD per CAD); a USD 1,000/month line → **CAD 1,360.00**.
- **Non-CAD household (Q-AH10).** Same USD rows; EUR rows 1.4700, 1.4800, 1.4900 → 1.4800 CAD/EUR. EUR household: USD line rate = 1.48 ÷ 1.36 = 1.088235… (USD per EUR); USD 1,000 → **EUR 918.92** (1,000 × 1.36 ÷ 1.48).
- **Partial current month (Q-AH9).** Current month 2026-10 with USD rows 2026-10-01 `1.3800` and 2026-10-02 `1.4000` only → 1.3900; USD 1,000 → **CAD 1,390.00**.
- **Typed-rate fallback (Q-AH4d).** A GBP line typed `0.5` (GBP per CAD) in 2024-03, with no GBP row in March 2024 → GBP 1,000 ÷ 0.5 = **CAD 2,000.00**, as today. With the USD line above in the same response, `fx_basis` is `"mixed"` and `fx_fallback_months` is `["2024-03"]`.
- **Backfill bounds (Q-AH2; PFFX-20).** Source `BOC` rows for USD EUR GBP BRL MXN CHF JPY AUD CNY on every BoC business day from **2020-01-02** (the first 2020 publication) to the last day published on or before the run date; per quote `min(rate_date)` = 2020-01-02. The backfill requests the whole window for every quote, so it **fills USD and EUR before their oldest existing row** (the daily job only requests each quote from the day after its last stored row and so never fills that gap). A second run inserts 0 rows.
- **Q-AH13 Deploy-to-backfill window: DECIDED (EL ruling; stands unless the CFO objects).** Between deploy and the backfill, months without a row fall back to the typed rate. A record reads `"current"` or `"mixed"` and becomes `"historical"` only once every converted month and currency has rows. (A record whose foreign months are all recent enough to have dashboard USD/EUR rows is fully covered, so it can read `"historical"` right after deploy; that is correct under this rule.)
- **#171 (PFFX-21).** The anchor rule holds with and without `overview.asOf` (before and after the first data month). Fixture: a CAD person netting 3,000/month and a USD 1,000/month line in 2024-02, 2024-03 and 2024-04, with USD averages 1.34, 1.36 and 1.30; start 10,000; asOf 2024-04 (after the first data month 2024-02). Surplus 1,660 / 1,640 / 1,700. net(2024-03) = 10,000 (the start, A−1); net(2024-02) = 10,000 − 1,640 = **8,360**; net(2024-04) = 10,000 + 1,700 = **11,700**. The record bound messages (contract 11.2) and the cap message (contract 12.1) are unchanged.
- **Contract and QA tools in Phase 1 (F6).** Contract sections 3 / 5 (`fx_basis: "current"`) and qa/tools (pf-helpers `EXPORT_FX_LINE`, pf-series / pf-chart / pf-export tools) did not change in Phase 1 because nothing was built; they change in Phase 2 with `"historical"` / `"mixed"`, `fx_fallback_months` and the 43.8 export lines.

43.10 **(2026-10-20, CFO on 43.8 and Q-AH13; Q-AH14 proposed by Diego)**
- **Accepted (CFO):** the four 43.8 texts and Q-AH13, with one change to the mixed export line: it names **at most the earliest 5** fallback months, sorted, then ` and N more` when there are more. Example: `FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2020-01, 2020-02, 2020-03, 2020-04, 2020-05 and 12 more)`. Exactly 5 months: no suffix. The wire field `fx_fallback_months` keeps the full list.
- **Q-AH14 (recommended by Diego; not yet confirmed):** `GET /api/dashboard/fx` returns only the quotes it can return today (the dashboard's: USD EUR SEK PLN DKK HUF CZK), so PF rows added by the Q-AH12 job extension or the backfill never change its output. Built in the same commit as the Q-AH12 `refreshFx` extension, so both revert together.

43.11 **(2026-10-20, QA G1–G5 on 66a8561; Phase 2 built on PR #190; backfill NOT run)**
- **G1 `fx_basis` scope (supersedes the scope implied by 43.7, 43.8 and PFFX-23).** `fx_basis` and `fx_fallback_months` cover every month whose conversion feeds any value in the reply: the reply's own months for income, expenses, surplus, lines, groups, accounts and categories; and, when `net-assets` is in the reply, every month from the **first data month** through the range end (or through the `overview.asOf` month when that is later and not in the future), because the running total and the #171 back-fill use those months' surpluses. **`fx_fallback_months` can therefore list months before the range.** Months that feed nothing in the reply do not count.
  - Example (PFFX-23/24). Record: USD 1,000 lines typed `0.7` in 2024-01 and 2024-03; USD row 2024-03-04 `1.3600` only; range 2024-03..2024-03. Series income + expenses → `fx_basis: "historical"`, no `fx_fallback_months`. The same with `net-assets` added → `fx_basis: "mixed"`, `fx_fallback_months: ["2024-01"]`.
- **G2.** `fx_fallback_months` (43.8) supersedes 43.6 Q-AH5's "no other wire field".
- **G3 Export line.** PDF and PNG print the 43.10 mixed line: the earliest 5 fallback months, sorted, then ` and N more`. The line wraps on the page; nothing else is cut. Example (17 months, 2024-01..2025-05): `FX basis: mixed (Bank of Canada monthly averages; typed rate used for 2024-01, 2024-02, 2024-03, 2024-04, 2024-05 and 12 more)`.
- **G4 Page note (replaces the 43.8 text).** `Charts and exports use Bank of Canada rates where available`, always shown beside every foreign FX rate field (expense lines and foreign people), dim (`--color-dim`, 7.2:1 on night, AA). Checkable: exact text; at 390px and desktop it stays inside its line with no horizontal overflow (it wraps); page CLS 0 (PFE-11 covers the full budget, which includes a foreign line).
- **G5 Concrete inputs.** PFFX-23 uses the 43.9 fixtures (USD March 2024 rows; GBP typed 0.5 without rows). PFFX-27 uses the recorded BoC Valet response `src/lib/finance/fixtures/boc-valet-2020-01.json` (all 9 series); existing dashboard rows and `ECB_CROSS` rows are unchanged; no `vercel.json` change. PFFX-28: USD rows only from 2026-09 and USD lines in 2024-03 and 2026-09, range `all` → `"mixed"` with `["2024-03"]`; after the 2024-03 rows exist (the backfill) → `"historical"`.

43.12 **(2026-10-20, Q-AH12 + Q-AH14 built in their own commit, revertible together)** The daily `refreshFx` job (cron and `vercel.json` unchanged) also requests BoC series FXGBPCAD FXBRLCAD FXMXNCAD FXCHFCAD FXJPYCAD FXAUDCAD FXCNYCAD every day and stores them as `BOC` rows; these quotes are not dashboard currencies (holdings in them stay unsupported). `GET /api/dashboard/fx` lists only USD EUR SEK PLN DKK HUF CZK, so its reply is byte-equal with or without PF rows (fx.test.ts; AC PFFX-27, PFFX-29). Reverting this commit restores the job and the route exactly; stored PF rows are harmless and can stay.

**Note to 43.11 (2026-10-20, QA H2):** the 43.11 additions also refine **PFFX-26**: its page note text is replaced by PFFX-11b (G4 text above).

## 44. Equity coverage on the anchored net assets (#184, AG11; follow-up to #171 Q-AG11; added 2026-10-20; Phase 1: spec and Qs, nothing built)

Business user: CFO. Priority MEDIUM (Diego via CoS, 2026-10-18). AC pack: PFEC-01..PFEC-12 (`qa/CANONICAL-AC-PACK.md`). Branch `feat/pf-equity-cover-asof` off main c14cf2b.

44.1 **Problem.** Since #171 (spec 42), net assets on the series, chart, export and Overview chart follow the one anchor rule: Starting net assets is the value at the start of the `asOf` month, rolled forward by each month's surplus and worked backwards to the first data month (42.10). The Overview's **Equity coverage** line (section 22, #126; layout section 23, #129) still uses the typed Starting net assets as "today's net assets" (Future off). With an `asOf` month set, the coverage and the chart disagree.

44.2 **Facts found (code at c14cf2b).**
- `overviewCoverage` (`src/lib/finance/overview.ts`): Future off → `equityCoverage(typedFigure(overview.start), rate, summary.average3.expenses)`: the typed start, whatever `asOf` says. Future on → the status is gated on the typed start, then the figure uses the projection's last point `summary.points.at(-1).net`, which `summarize` already anchors at `asOf` (42.5, 42.10). So **only Future off ignores the anchor today.**
- Coverage is computed on the page only (`overview-block.tsx`, `CoverageLine`, `pf-coverage`). No API route, wire field, export or QA API tool carries it; `personal-finance-e2e.mjs` checks the rendered line.
- **Not the same feature:** `Equity to cover` on expense lines (#86, PR #96, section 13: line yearly amount ÷ rate used) does not use net assets and is out of scope.
- `equityCoverage` statuses: `ok`, `no_rate` (`Set rate under Expenses`), `no_start` (`Set starting net assets`), `none` (amounts `—`, no note).

44.3 **Rule (recommended, Q-AI1; not built).** With a usable `asOf` (the `asOfMonth` rule; an invalid typed month is ignored as in 42.6), Future off uses the **anchored net assets at the start of the current household month**: the Overview point for the previous month (`points` of `summarize`), the same value the chart draws for that month. The 3-month expense basis (C2/C7) is unchanged. Without `asOf`, the coverage is **byte-for-byte as today** (typed start).
- Worked example (CAD, rate used 4%, current month 2026-10, start 10,000): no `asOf` → 10,000 × 4% = 400.00 CAD/yr, 33.33 CAD/mo. `asOf` 2026-08 with surplus Aug 1,000 and Sep 500 → net(end Sep) = 11,500 → 460.00 CAD/yr, 38.33 CAD/mo. `asOf` 2026-10 (the current month) → net(end Sep) = the start (42.10) → 400.00 / 33.33. `asOf` 2025-06 (before the window) → the level carried in from the window start (42.5).

44.4 **Q-calls for CFO** (each with a recommendation; nothing is built in Phase 1):
- **Q-AI1** Which anchored value for Future off: (a) start of the current month = end of the previous month, (b) end of the current month (includes this month's partial or averaged surplus), (c) end of the last complete month (same as (a)). **Recommendation: (a)**: no partial month, matches the complete-month 3-month basis, and equals the typed start when `asOf` is the current month. To build in Phase 2.
- **Q-AI2** Anchored value is null (a surplus in the chain is unknown even after the average fallback): **Recommendation:** status `none` (amounts `—`, no note), not `no_start`, because a start is typed. To build.
- **Q-AI3** Anchored value ≤ 0 while the typed start is > 0 (deficits used it up): **Recommendation:** `none` (no coverage from non-positive net assets; `Set starting net assets` would be wrong). Typed start empty or ≤ 0 stays `no_start` as today. To build.
- **Q-AI4** Future on: the projection is already anchored; the gate still reads the typed start. **Recommendation:** unchanged (the typed start gates, the projected anchored value computes), pinned by a test. Not a change.
- **Q-AI5** `asOf` after the current month (skewed clock only, Q-AG12): **Recommendation:** `none`, as the chart has no net assets then. To build.
- **Q-AI6** New copy (e.g. `based on net assets as of <Mon YYYY>` on the coverage line): **Not built** (UI text change). Recommendation: none now, revisit with Q-AG6 / #160.
- **Q-AI7** Coverage on the wire (a `coverage` metric on `/series`, `/chart` or the export): **Not built** (wire change, outside the ticket). Recommendation: separate ticket if wanted.
- **Q-AI8** `Equity to cover` on expense lines (#86): **Not built / unchanged** (does not use net assets). Recommendation: unchanged.

44.5 **Harness first (Phase 2).** Tests before code: `overview.test.ts` cases for 44.3 and Q-AI1..Q-AI5 (no-`asOf` byte-identity over the existing #126/#129/#140/#146 cases), the `expenses-page.dom.test.tsx` coverage case with `asOf`, and `personal-finance-e2e.mjs` (signed in) asserting the coverage line follows the chart's previous-month value when an as-of month is set. The #158, #179 and #171 drift tests stay green; the #171 as-of tests gain a coverage check. No migration, no new dependency, no wire change.

44.6 **(2026-10-20, CFO decision; built on PR #192)** CFO accepted the 44.3 rule and Q-AI1..Q-AI8 exactly as recommended; Q-AI7 gets no ticket. Built: Q-AI1 (Future off, usable `asOf` → the Overview's previous-month net assets), Q-AI2 (null → `none`), Q-AI3 (anchored ≤ 0 with a typed start > 0 → `none`), Q-AI5 (`asOf` after the current month → `none`); Q-AI4 unchanged and pinned by a test. Not built, by decision: Q-AI6 (no new copy), Q-AI7 (no wire change, no ticket); Q-AI8 unchanged. No-`asOf` records, no rate and no typed start behave exactly as before. Code: `overviewCoverage` (`src/lib/finance/overview.ts`); tests `overview.test.ts` (#184 block); QA `personal-finance-e2e.mjs` PFEC-04.

44.7 **(2026-10-20, QA L2 on 042c47e) Window rule for 44.3 and PFEC-05.** The anchored value comes from the Overview's own roll (`summarize`, 42.5 / 42.10): a month with no data **inside the 12-month window** uses the 12-month average surplus (#140 / #146); a month **before the window** adds only its own surplus, so an empty one adds nothing (the series rule). Checked in the code and pinned in `overview.test.ts` (#184 QA L1 / L2 block). Example: start 10,000, today 2026-10-13, Jun 2025 surplus +200, Aug 2026 +1,000, Sep 2026 +500, `asOf` 2025-06 → 10,200 + 9 empty window months (Nov 2025..Jul 2026) × the 12-month average 750 + 1,500 = **18,450** at the start of Oct 2026; Jul–Oct 2025 (before the window, empty) add nothing.

## 45. Charts: the reports list page (#160, PF charts UI 1/3; #161 builder and #162 viewer follow; added 2026-10-20; Phase 1: spec and Qs, nothing built)

Business user: CFO. UI only, on the existing endpoints (spec 40, contract `attachments/pf-charts-api-contract.md` R3). No new API route, no wire change, no data-model change, no migration, no new dependency, no Dashboard change. AC PFCL-01..PFCL-14 (`qa/CANONICAL-AC-PACK.md`). Q-calls Q-AJ1..Q-AJ12 (45.8), none built yet.

45.1 **Where.** A Charts page for Personal Finance (Q-AJ1, recommended: a new page route `/personal-finance/charts` with the same gate as `/personal-finance`: signed out → 307 to `/dashboard/sign-in?next=/personal-finance/charts`, temporary password → `/account`, no grant → 403 denied page, Read → read-only). A page route is not an API route and carries no data; the page links to it ("Charts") and it links back ("Personal Finance").
45.2 **Data.** One call: `listReports()` (`src/lib/finance/charts-api.ts`, `GET /api/personal-finance/reports`) on mount, `cache: no-store`. The page reads `reports`, `limit` and, per item, `id`, `name`, `default`, `report.series` / `report.range` / `report.chart`, `labels`, `deleted` and `updated_at`. It writes nothing and calls no other route.
45.3 **List.** One row per report, in the order the server returns (the default first if stored, then named reports oldest first; Q-AJ4). Each row shows:
- the name (the default shows as stored, usually `Default`);
- last updated: `updated_at` as a Toronto date `YYYY-MM-DD` (Q-AJ3); the default (null timestamps, Q-AE3) shows no date, written `—` with an accessible label `No date` (Q-AJ2);
- a short series summary (Q-AJ5): the first 3 `labels` joined with `, `, then `+N more` when there are more; a deleted series keeps the label the server sends (`deletedLabel`); plus the chart type and the range (`Line · Last 12 months`, `All data`, `2025-01 to 2025-12`).
45.4 **New report.** A button `New report` in the page header (existing `pf-button` style, no new colour). Its target is the #161 builder, which does not exist yet (Q-AJ6). It is disabled when named reports ≥ `limit` (contract Q-AE14), with the text `Limit of 20 reports reached.` under it (Q-AJ7), and hidden on a Read grant (Q-AJ8).
45.5 **States.** Loading: one line `Loading reports…`, with the list's space reserved (no layout shift). Empty (no reports at all, default included): `No saved reports yet.` and the New report button (Q-AJ9). Error: the shared error's `error` text in the existing PF error style, plus `Try again` that repeats the one GET (Q-AJ10). A 401 (session ended) follows the page's existing sign-in redirect rule.
45.6 **Row action.** Opening a report is #162 (viewer). Until #162, a row's name is plain text, not a link (Q-AJ11). No rename, delete or export on this page (#161 / #162).
45.7 **Style.** The existing dark site style: lyre header, `Orpheus Wisdom` footer, no gold, the existing type scale, the PF section numeral pattern, `pf-button` for buttons. No new colour system and no new icon set (Q-AJ12). Mobile 390 px: rows stack (name, then date, then summary); desktop: one line per row with the date right-aligned. CLS 0.
45.8 Q-calls (CFO), each with a recommendation; **none built** (Phase 1):
- Q-AJ1 Where Charts lives: **rec** a separate page `/personal-finance/charts`, linked both ways (the PF page is already long, and #161/#162 need room). Alternative: a `06 Charts` section at the bottom of `/personal-finance`. Not built.
- Q-AJ2 The default's missing date: **rec** `—` (label `No date`), per contract Q-AE3 (storing a timestamp would change the data model, out of scope). Not built.
- Q-AJ3 Date format: **rec** `YYYY-MM-DD` Toronto date (matches the export and the rest of PF). Alternative: relative (`3 days ago`). Not built.
- Q-AJ4 Order: **rec** the server's order (default first, then oldest first). Newest-first would be client-side only, no wire change; say so if wanted. Not built.
- Q-AJ5 Series summary: **rec** first 3 labels + `+N more`, then chart type and range. Not built.
- Q-AJ6 New report before #161 exists: **rec** render it disabled with `Builder coming next (#161)` as its description, then #161 enables it. Alternative: hide it until #161. Not built.
- Q-AJ7 At the limit: **rec** disabled with `Limit of 20 reports reached.` (the number from `limit`). Not built.
- Q-AJ8 Read grant: **rec** the list shows, New report hidden. Not built.
- Q-AJ9 Empty state text: **rec** `No saved reports yet.` plus the button. Not built.
- Q-AJ10 Error state: **rec** the server's text + `Try again`. Not built.
- Q-AJ11 Row click before #162: **rec** not a link. Not built.
- Q-AJ12 Icons: **rec** none (text buttons, as elsewhere on PF); a `+` glyph would be new. Not built.
Out of scope (each would be a Q for its own ticket): any endpoint or wire change (e.g. a summary field, sorting server-side, a default timestamp), Email export (#180), Dashboard.
45.9 (2026-10-20, CFO decision) Q-AJ1..Q-AJ12 are accepted exactly as recommended and are now **built** on PR #193: Q-AJ1 built (route `/personal-finance/charts`, `src/routes/personal-finance_.charts.tsx`; the `?next=` allowlist gains that exact path, `src/lib/auth/next.ts`), Q-AJ2 built, Q-AJ3 built, Q-AJ4 built, Q-AJ5 built, Q-AJ6 built, Q-AJ7 built, Q-AJ8 built, Q-AJ9 built, Q-AJ10 built, Q-AJ11 built, Q-AJ12 built. Code: `src/components/personal-finance/charts-page.tsx`, `src/lib/finance/reports-list.ts`; the PF page header links to Charts.
45.10 (2026-10-20, QA round 1 on b9a279d and EL rulings; corrections to 45.3–45.5, nothing above removed)
- M1: there is no `deletedLabel` on the wire; the server sends the label already formed as `<name> (deleted)` (`deletedLabel` is the server-side helper in `expenses.ts`). A deleted `Travel` shows `Travel (deleted)`.
- M2: range text: `3m` → `Last 3 months`, `6m` → `Last 6 months`, `12m` → `Last 12 months`, `24m` → `Last 24 months`, `ytd` → `Year to date`, `all` → `All data`; a custom range is stored as `{ "from": "YYYY-MM", "to": "YYYY-MM" }` and shows `<from> to <to>`. Chart names: `line` → `Line`, `bar` → `Bar`, `stacked-bar` → `Stacked bar`.
- M3 (EL: QA's reading wins, it matches Q-AJ6): in #160 New report is **always disabled**. Below the limit (e.g. 19 named) its note is `Builder coming next (#161)` and there is no limit text; at the limit (20 named; the default not counted) the note is `Limit of 20 reports reached.`. CFO's "19 → enabled" check moves to #161 (AC note in the pack; not built here).
- M4: an error shows the shared client's `error` text exactly (`charts-api.ts`): the body's `error` when JSON, else `HTTP <status>` (a platform 500 with no JSON body shows `HTTP 500`). The R3 GET itself sends no 500; its own refusals are 503 `Storage not configured.`, 403 and 405 (401 follows the sign-in redirect). `Try again` sends exactly one more GET and keeps the page mounted (header, focus, URL).
- Limit copy (EL ruling, decided: **the page owns it**): the server's `Report limit reached.` is the 409 reply to a `POST /reports` create, which this page never sends; the list GET carries only `limit`, from which the page derives its own pre-emptive note. So `Limit of 20 reports reached.` (the number from `limit`) is a UI string owned by the page and stays. #161, which does POST, shows the server's `Report limit reached.` on a 409.
45.11 (2026-10-20, QA round 2 on ad9b735: N1–N3; nothing above removed) N1: 45.3's "accessible label `No date`" is built as an `aria-hidden` dash plus screen-reader-only text `No date` (`sr-only`); an `aria-label` on a plain `span` is ignored. N2: the PF page's exact-copy lists in `qa/tools/personal-finance.mjs` (PF-02, reused by PF-07 / PF-25 / PF-31) and `qa/tools/site-style-regression.mjs` now expect `Charts` right after `Personal Finance.`; `personal-finance.mjs` also checks PFCL-01 signed out. N3: the README line's claim about `personal-finance.mjs` is now true. EL (2026-10-20): PFCL-09 (Read grant) is accepted on the DOM test only.
45.12 (2026-10-20, QA round 3 on 71e4829: N4, EL tap-target rule; nothing above removed) The two Charts links (`pf-charts-link` under the PF title, `pf-charts-back` under the Charts title) are `inline-flex`, `align-items: center`, `min-height: 2.75rem` (44 px) at every viewport, matching the site header links; same colour, size and underline, no CLS. Checked by `reports-list.test.ts` (the CSS rule) and `qa/tools/personal-finance-e2e.mjs` (signed in, both links ≥ 44 px tall per viewport). Signed out both pages redirect, so no signed-out path reaches the links.

## 46. Charts: the report builder (#161, PF charts UI 2/3; #162 viewer follows; added 2026-10-20; Phase 1: spec and Qs, nothing built)

Business user: CFO. UI only, on existing endpoints. The builder uses R2 `POST /chart` (live preview, `query` range mode), R3 `POST /reports` (create), R4 `GET|PUT /reports/:id` (load, update), R5 `GET /reports/:id/export?format=pdf|png`, and the record `GET /api/personal-finance` (the picker's lines, accounts and categories). No new API route, no wire change, no data-model change, no migration, no new dependency (charts with the existing `recharts`). AC PFCB-01..PFCB-20 (`qa/CANONICAL-AC-PACK.md`). Q-calls Q-AK1..Q-AK15 (46.9), none built.

46.1 **Where (Q-AK1).** `/personal-finance/charts/new` (create) and `/personal-finance/charts/<id>/edit` (load + Update), same gate as `/personal-finance/charts` (spec 45.1). Signed out, `/new` returns there after sign-in; an edit URL returns to the list (Q-AK1).
46.2 **Carry-overs from #160 (built in #161).** On the list (spec 45.4, 45.10 M3): with 19 named reports New report is **enabled** (CFO Q-AJ7) and opens `/personal-finance/charts/new`; 20 named (default not counted) → disabled + the page-owned `Limit of 20 reports reached.`; the text `Builder coming next (#161)` is removed. In the builder a create answered 409 shows the server text exactly: `Report limit reached.`
46.3 **What the server validates (mirrored client-side, server stays the authority)** — `src/lib/finance/report.ts` `reportError` / `seriesListError` / `rangeError(…, "save")`, `src/lib/finance/reports.ts` `checkBody` / `nameError` / `nameTaken`, `REPORTS_MAX`:
- Body: exactly `{ name, report }` (other keys → 400 `Invalid value.`, field `body`). Over 4608 B → 413 `Report too large.`; the report text over 4096 B → 413 `Report too large.`
- Name: trimmed, 1..60 characters, no control characters (U+0000–U+001F, U+007F) → else 400 `Invalid value.` field `name`. Unique per person in any case, and `Default` (any case) is reserved → 409 `Name already used.` The default report can't be renamed → 400 `The default report cannot be renamed.`
- Series: 1..12 items (`SERIES_MAX`), each exactly `{ kind, id }`, no duplicate `[kind, id]` → else 400 field `report.series` / `report.series.<i>` / `.kind` / `.id`. Kinds: `line` (id `^[A-Za-z0-9_-]{1,64}$`), `account` (non-blank, ≤ 40 chars), `category` (non-blank, ≤ 40), `group` (`fixed`, `variable`, `all`), `metric` (`income`, `expenses`, `surplus`, `net-assets`).
- Range (`save` mode): `{ preset }` with `3m 6m 12m 24m ytd all`, or exactly `{ from, to }` as `YYYY-MM` (years 2000–2100, from ≤ to) → else 400 `Invalid value.` (`report.range` / `report.range.preset`); custom `from` before 2020-01 → `Range can't start before 2020-01.`; `to` after the current Toronto month → `Range can't end after the current month.`; longer than 24 months → `Range can't be longer than 24 months.` (bounds checked before the cap; `from` before `to`).
- Chart: `line`, `bar`, `stacked-bar` → else 400 field `report.chart`.
- Limit: 20 named reports (default extra) → 409 `Report limit reached.`
46.4 **Series picker (Q-AK2, Q-AK3, Q-AK12).** Multi-select in sections Metrics (Income, Expenses, Surplus, Net assets), Groups (Fixed, Variable, All expenses), Accounts, Categories, Expense lines (from the record). At 12 picked the rest disable with the page-owned note `Up to 12 series.`.
46.5 **Range (Q-AK4).** Presets `Last 3 / 6 / 12 / 24 months`, `Year to date`, `All data` ("as far back as data exists", resolved at run time, spec 41.2), and Custom (`From` / `To` months, 2020-01..current Toronto month). The builder applies `save` rules to the preview too, so what previews can be saved; the server messages show under the control.
46.6 **Chart type (Q-AK5)** `Line` (default), `Bar`, `Stacked bar`. **Live preview (Q-AK6):** `POST /chart` with the current picks, debounced 400 ms, latest answer wins; empty picks → `Pick at least one series.` (page-owned), no request.
46.7 **Save / Update (Q-AK7, Q-AK8).** New: a Name field + `Save` → `POST /reports`; 201 → the edit URL, button becomes `Update`. Edit: `PUT /reports/:id`. Every server refusal shows its exact text (field-mapped where `field` is given). **Export (Q-AK9):** a menu with `PDF` and `PNG` (R5 download links), only once saved and with no unsaved changes; Email not built (Q-AE5 / #180).
46.8 **Layout (Q-AK10).** Mobile (< 768 px): the picker collapses (closed by default, a `Series (n)` toggle), chart ≥ 60 vh. Desktop / iPad (≥ 768 px): a left side panel with the controls, chart as the main area. Existing dark style, `pf-button`, no new colours or icons, 44 px targets, CLS 0.
46.9 Q-calls (CFO), each with a recommendation; **none built** (Phase 1):
- Q-AK1 Routes: **rec** `/personal-finance/charts/new` and `/personal-finance/charts/<id>/edit`; list rows stay plain text until #162 (Q-AJ11). Add only the exact `/personal-finance/charts/new` to the `?next=` allowlist (it accepts exact paths only); an edit URL signed out comes back to `/personal-finance/charts`. Not built.
- Q-AK2 Picker source: **rec** the record GET (existing) for lines / accounts / categories; groups and metrics are fixed lists. Not built.
- Q-AK3 Line labels: the server's `labels` are the line **id** for `line` series (spec 38 / `seriesLabels`); **rec** the builder shows the line's name from the record and falls back to the server label. A server label change would be a wire change (not built, out of scope). Not built.
- Q-AK4 Range: **rec** presets + Custom with the `save` rules on preview too (no >24-month custom preview). Not built.
- Q-AK5 Chart default `Line`; **rec** all three types always offered. Not built.
- Q-AK6 Preview: **rec** `POST /chart` debounced 400 ms, latest wins. Not built.
- Q-AK7 Name: **rec** a client pre-check mirroring `nameError` / `nameTaken` that shows the page-owned `Name: 1 to 60 characters, no control characters.` or `Name already used.` before sending; server texts shown exactly on any refusal. Not built.
- Q-AK8 The default report: **rec** editable at `/personal-finance/charts/default/edit`, name field read-only (`Default`). Not built.
- Q-AK9 Export: **rec** PDF and PNG only when saved and clean; **Email not built** (needs a route, provider and secret: Q-AE5 / #180). The issue asks for Email: CFO to confirm it waits for #180. Not built.
- Q-AK10 Layout breakpoints as 46.8. Not built.
- Q-AK11 Unsaved changes: **rec** a browser leave warning when dirty. Not built.
- Q-AK12 12-series cap note `Up to 12 series.` (page-owned). Not built.
- Q-AK13 Read grant: **rec** `/new` and `/edit` show the read-only line and no Save / Update (preview and export still work on edit). Not built.
- Q-AK14 Delete / rename from the builder: **rec** rename via the Name field on Update (server allows it); delete waits for #162. Not built.
- Q-AK15 #160 carry-overs (46.2): **rec** build as listed. Not built.
Out of scope (each a Q for its own ticket): any endpoint / wire change (server line labels, Email route, longer saved ranges), Dashboard.
46.10 (2026-10-20, CFO decision) Q-AK1..Q-AK15 are accepted exactly as recommended and are now **built** on PR #194: Q-AK1 built (`src/routes/personal-finance_.charts_.new.tsx`, `src/routes/personal-finance_.charts_.$id_.edit.tsx`), Q-AK2 built, Q-AK3 built, Q-AK4 built, Q-AK5 built, Q-AK6 built, Q-AK7 built, Q-AK8 built, Q-AK9 built (PDF / PNG only on a saved, clean report; **Email deferred to #180, not built**), Q-AK10 built, Q-AK11 built, Q-AK12 built, Q-AK13 built (a Read grant's export keeps the #157 rule: audited, and 503 `Export unavailable. Try again.` with no file when the audit row can't be written; test in `export.server.test.ts`), Q-AK14 built (rename via Update; no delete), Q-AK15 built (list: below the limit New report is a link to `/personal-finance/charts/new`; 20 named → disabled + `Limit of 20 reports reached.`; the #160 placeholder note is removed; a 409 create shows `Report limit reached.`). Code: `src/components/personal-finance/charts-builder.tsx`, `src/lib/finance/builder.ts`.
46.11 (2026-10-20, QA round 1 on 033392a, O1–O8; QA's run log is not in the repo, so these are SWE-derived from the code; corrections and additions to 46.3, nothing above removed)
- Every save refusal for the range carries field `report.range` on R3 / R4 (spec 41.9): `Invalid value.` (malformed, from > to, missing keys), `Range can't start before 2020-01.`, `Range can't end after the current month.`, `Range can't be longer than 24 months.`; an unknown preset is `Invalid value.` field `report.range.preset`.
- A body that isn't JSON → 400 `Body must be JSON.` (no field); JSON that isn't an object → 400 `Invalid value.` field `body` (`checkBody`). The 4608 B check comes first (413 `Report too large.`).
- R4 with an unknown or malformed id → 404 `Report not found.` (GET and PUT). The builder's edit page shows that text and no controls.
- Default report PUT (`/reports/default`): the body may omit `name` (the builder omits it) or send `Default` in any case; any other name → 400 `The default report cannot be renamed.` field `name`. A default never stored → GET 404 `Report not found.`; its first PUT creates it.
- Named PUT: the name is required and checked like create; a name used by another report (any case) or `Default` → 409 `Name already used.` field `name`; its own name is allowed.
- (2026-10-20, QA P3 + EL ruling, addition) **The picker offers exactly the server's known set** (`missingSeries`, `report.ts`): lines = the shared lines plus every stored month's lines; accounts and categories = the shared lists plus any name on those lines. A **deleted** account or category that is still on an earlier month's line is offered, labelled `<name> (deleted)` (the server accepts it and labels it the same way, #160 / R3). A deleted name with no line left is not offered (the server calls it missing). A month line naming an unknown account or category has it cleared when the record is read, so it is not offered either.
46.12 (2026-10-20, EL ruling on O3, matches Q-AK1) Only the exact `/personal-finance/charts/new` joins the `?next=` allowlist (`NEW_SIGN_IN_NEXT`). Every edit route (`/personal-finance/charts/<id>/edit`, `default` included) passes `next=/personal-finance/charts` (`EDIT_SIGN_IN_NEXT`), so after sign-in it lands on the Charts list, never `/dashboard`. Near-misses of `/new` (trailing slash, other case, a query, a fragment, another host, a leading space, edit paths) → `/dashboard` (`next.test.ts`); `site-shell.mjs` checks the three redirects signed out.
46.13 (2026-10-20, QA round 2 on 74d8bd2: P1–P3 and EL rulings; nothing above removed) P1: the e2e list check freezes the list tab's calls before going to `/new`, so the list still shows exactly one `GET /api/personal-finance/reports`. P2 (PFCB-18): a cold load of `/new` or an edit page has CLS 0 at every viewport. Loading, the load error and the builder render in one reserved area (`.pf-builder-area`, min-height 100vh); the preview keeps `calc(60vh + 3.5rem)` in every state; the figure is ≥ 60vh, the plot 60vh at every width, the legend reserves 2.5rem. Pinned in `builder.test.ts`, with an e2e CLS check (new and default edit). P3: the picker rule is stated in 46.11 (dated addition).
46.14 (2026-10-20, EL hold Q1 / Q3 on ea3f9bc; nothing above removed) The picker's accounts already use the same union as its categories: the shared list plus every name on the shared and month lines (`builder.ts` since ea3f9bc). A name the server keeps on a month line is offered. A deleted one is labelled `<name> (deleted)`. The server's record reader checks month lines against the shared and deleted lists (`asLines` in `months.ts`), so an account that is only on a month line and in neither list (e.g. `Visa`) is cleared on read. `missingSeries` then calls it missing, and the picker doesn't offer it. The account that can be "only on a month line" is a deleted one still on an earlier month (e.g. `Amex (deleted)`), and that one is offered. The parity test now asserts picker set == server known set for accounts and categories; DOM tests render `Travel (deleted)` and the month-line-only `Amex (deleted)`, and check `Visa` is absent.

## 47. Charts: the saved report viewer (#162, PF charts UI 3/3; added 2026-10-20; Phase 1: spec and Qs, nothing built)

47.0 **Scope.** Open a saved report pre-loaded, with the same controls as the #161 builder so the user can change its series or range and update it, plus delete. UI only, on the existing R3 client (`src/lib/finance/charts-api.ts`): `getReport`, `chartSaved` / `chartQuery`, `updateReport`, `deleteReport` (`DELETE /api/personal-finance/reports/:id` → `{ deleted }`, server since #156), `exportUrl`. No wire, endpoint or data-model change. Parked, not in this ticket: POST /chart validation of unknown names; Q2 (drawn chart vs real month data). #93 / PR #117 untouched.
47.1 **Where (Q-AL1).** `/personal-finance/charts/<id>` (view), with the same gate as spec 45.1 / 46.1. Signed out it passes `next=/personal-finance/charts`, like edit URLs (46.12); no new allowlist entry. An unknown or malformed id shows the server's `Report not found.` and a link back to Charts.
47.2 **List rows (Q-AL2).** On the list (spec 45.6, Q-AJ11), a row's name becomes a link to its viewer. Nothing else on the list changes (it still makes exactly one GET).
47.3 **Viewer = builder (Q-AL3).** The viewer loads `getReport(id)` once and renders the #161 builder already filled in: picker, range and chart type as saved, the preview drawn from the saved report, and an `Update` button (`PUT`) that is enabled only when there are unsaved changes. Every server refusal is shown with its exact text, as in 46.7. `/charts/<id>/edit` stays as an alias (Q-AL4).
47.4 **Delete (Q-AL5, Q-AL6, Q-AL7).** Named reports get a `Delete` button (`pf-button`, existing danger style if one exists, otherwise the plain one; no new colour). It asks to confirm in-page (`Delete "<name>"? This cannot be undone.` with `Delete` / `Cancel`). Then it calls `DELETE`: on 200 it goes to `/personal-finance/charts`; on 404 it shows `Report not found.` and a link back; any other refusal shows the server text and the report stays. The default report has no Delete. A Read grant sees no Update and no Delete.
47.5 **Export.** Same as Q-AK9 (PDF / PNG only when saved and clean; Email is #180).
47.6 **States, style, layout.** The loading, error and reserved-area rules are the same as 46.13 (CLS 0 on a cold load), with the same mobile and desktop layout as 46.8. Existing dark style, lyre header, `Orpheus Wisdom` footer, no gold, 44 px targets.
47.7 **Builder follow-up (CFO "AJ7: 19 enabled").** Already closed in #161: `charts-page.dom.test.tsx` "#161 PFCB-02 / PFCB-03 (CFO Q-AJ7, Q-AK15): 19 named → New report enabled …" (with and without the default) and `reports-list.test.ts` PFCL-08. Nothing new is built; PFCV-12 re-runs it.
47.8 Q-calls (CFO), each with a recommendation; **none built** (Phase 1):
- Q-AL1 Route: **rec** `/personal-finance/charts/<id>`, with sign-in returning to the list. Not built.
- Q-AL2 List names link to the viewer: **rec** yes. Not built.
- Q-AL3 The viewer reuses the builder component in its "saved" mode: **rec** yes (no second chart UI). Not built.
- Q-AL4 Keep `/<id>/edit`: **rec** keep it as an alias of the viewer (no redirect, so no old link breaks). Not built.
- Q-AL5 Delete confirm: **rec** an in-page confirm (no browser `confirm()`), with the copy as in 47.4. Not built.
- Q-AL6 After delete: **rec** go to the list. A 404 shows `Report not found.`. Not built.
- Q-AL7 Default report: **rec** no Delete in the UI (today's server `DELETE /reports/default` behaviour is not changed by this ticket; any change is a wire Q). Not built.
- Q-AL8 Delete on a Read grant: **rec** hidden (the server already refuses). Not built.
- Q-AL9 Unsaved changes when leaving: **rec** no prompt in this ticket (polish later). Not built.
- Q-AL10 (out of ticket, not built) An undo / soft-delete for reports would need a data-model change: **rec** no; park it.
47.9 (2026-10-20, CFO decision) Q-AL1..Q-AL10 are accepted as recommended, with two conditions. The answers are now **built** on PR #195:
- Q-AL1 built: route `src/routes/personal-finance_.charts_.$id.tsx`; signed out → `next=/personal-finance/charts`.
- Q-AL2 built: list row names are links to `/personal-finance/charts/<id>`.
- Q-AL3 built: the viewer is the #161 `ChartsBuilder`, opened with the saved report; Update is disabled until there is a change.
- Q-AL4 built: `/<id>/edit` is unchanged.
- Q-AL5 built: in-page confirm `Delete "<name>"? This cannot be undone.` with `Delete` / `Cancel`.
- Q-AL6 built: 200 → `/personal-finance/charts`; any refusal (404 `Report not found.` included) shows the server text exactly, and the report stays.
- **Q-AL7 condition:** the default report has **no Delete** in the UI (hidden). Whether to enable it is Diego's call via CoS in issue #165; the server is unchanged for the default (owner / Write grant may still `DELETE /reports/default`).
- Q-AL8 built: Delete is hidden on a Read grant (and the server now refuses, see 47.10).
- **Q-AL9 condition (supersedes "no prompt"):** the viewer is editable (Q-AL3), so it uses the #161 Q-AK11 leave warning (`beforeunload`) while there are unsaved changes; none after Update or Delete. A Read-grant viewer is truly read-only (every control disabled, no Update or Delete), so it never prompts.
- Q-AL10 parked, not built.
47.10 (2026-10-20, QA R2 on 5db4dcd, Diego's decision folded into #162; corrects 47.4 and Q-AL8, nothing above removed)
- **Before:** a Read grant could `POST /reports`, `PUT` / `DELETE /reports/:id` and `PUT` / `DELETE /report`. Those routes asked for `need: "read"` (`account.server.ts`), while the gate's default (`session.server.ts` `gateDashboardRequest`) would have asked for write on non-GET methods. So 47.4's and Q-AL8's "the server already refuses" was wrong.
- **Now:** those five writes ask for **write** (`reportNeed` in `account.server.ts`: GET / HEAD read, every other method write). A Read grant gets 403 `Forbidden.` (no-store, the access-denied audit row), and its stored row is unchanged. Owner and Write grant work as before. Signed out → 401. GET stays read.
- `/series`, `/chart` (POST queries that store nothing) and `/export` (GET) stay read, so a Read-grant viewer still previews and exports.
- This reverses spec 33 / 38's "a Read CFO saves their own" (PFR-14, PFRC-12). Those server tests now give bob a Write grant. Read-grant refusals are in `reports-write.server.test.ts`; mutating `reportNeed` to always `read` is caught.
- The UI matches: a Read grant gets no Save, Update or Delete.
47.11 (2026-10-20, QA R1, R3–R5 on 5db4dcd; additions only) QA's run log `qa/runs/run-2026-10-20-pr195.md` is not in the repo (checked with `git ls-files`), so the ACs below are made concrete from the code and the EL rulings.
- R1: README and AGENTS.md gain a #162 pointer.
- R4: the Delete style is `pf-button pf-button-danger`, which uses the existing `--color-danger` token for text and border (no new colour); a 44 px minimum height.
- R5 carries #161's rulings over to the viewer:
  - O3 / 46.12: viewer and edit URLs sign in to the list (`EDIT_SIGN_IN_NEXT`); only the exact `/new` is allowlisted.
  - P2 / 46.13: one reserved area, CLS 0.
  - 46.11 / 46.14: deleted names on a line are offered as `<name> (deleted)` (e.g. `Travel (deleted)`). The picker equals the server's known set. A saved series the server lists in `missing[]` is still shown, as missing.
  - Q-AK9 / Q-AK13: export as in #161.
47.12 (2026-10-20, CFO decisions 1–3 on PR #195 at 18117b1; additions only) (1) Read means read only: spec 33.10 and 38.12, AC PFR-14 / PFRC-12 notes. (2) No write check on `/series`, `/chart`, `/export`. A Read-grant export still writes its #157 `pf.report_export` row and answers 503 `Export unavailable. Try again.` with no file if that row can't be written (PFCV-17, `export.server.test.ts`, PGlite, both TZs). (3) `PUT /api/personal-finance/view` (section toggles) still needs only Read; it is parked, out of #162.

## 48. Personal Finance: Delete buttons for categories and accounts (#168, flip `PF_DELETE_UI`; added 2026-10-20; Phase 1: spec and Qs, nothing built)

48.0 **Scope.** #168 turns on the `Delete category` and `Delete account` buttons that #165 built and kept off (spec 35.9 / 35.10; PR #167 at fd00400 QA'd them with the flag on). The protection is unchanged: earlier months keep a deleted name as `<name> (deleted)`, totals and averages don't change, and the report returns `deleted[]`. It applies to **categories and accounts only**. It is not the Charts report Delete (#162 Q-AL7, the default report), which is a separate decision tracked under #165's follow-up. Out of scope: `PUT /api/personal-finance/view` (parked), #93 / PR #117.
48.1 **What `PF_DELETE_UI` is (facts).** A **code constant**, `export const PF_DELETE_UI = false` in `src/lib/finance/flags.ts`, read once as the default of `PersonalFinancePage`'s `deleteUi` prop (`expenses-page.tsx`). It is **not** an environment variable, so no Vercel or env change is needed (none will be made). Flipping it is one line, and it applies to every deployment that builds the commit (preview, then prod after merge).
48.2 **What turns on.** `Delete category` beside `Rename` and `Delete account` beside `Filter by account`. The confirm is CFO-accepted (Q-Z2): `Delete <name>? This month and later months lose it; earlier months keep it, marked (deleted).`. Today it is shown with the browser's `window.confirm` (#165 build). A delete is an unsaved change until Save (35.2), and Save applies it to the shown month and later months (35.2–35.8 as written).
48.3 **Read grant (fact and gap).**
- Server: a Read grant cannot save the record. `PUT /api/personal-finance` needs write (ROLE-10, `roles.mjs`), so a delete never stores.
- UI gap: on a Read grant the Delete buttons are not hidden today. They render inside the read-only `Lock` fieldset (disabled), because `onDelete` depends on `deleteUi` only. #168 must hide them (`deleteUi && !readOnly`, Q-AM3), matching the #162 rule (Delete hidden for Read).
48.4 **Tests to re-run with the UI on.** PFD-01..PFD-15 (DOM tests already pass `deleteUi` both ways). The flag-off case of PFD-15 becomes the guard for the `deleteUi={false}` prop path. In `pf-months.mjs`, the PFD Delete flow (today SKIPPED when the buttons are absent) runs again on the preview.
48.5 Q-calls (CFO), each with a recommendation; **none built** (Phase 1):
- Q-AM1 Flip `PF_DELETE_UI` to `true` (code constant, one commit): **rec** yes. Not built.
- Q-AM2 Is it an env flag? **Answer:** no, a code constant (48.1). **rec** keep it a constant, with no env var and no Vercel change. Making it an env flag would be a separate Q (out of ticket). Not built.
- Q-AM3 Read grant: **rec** hide both Delete buttons and the confirm (`deleteUi && !readOnly`); the server already refuses the save. Not built.
- Q-AM4 Does #168 include the Charts default report Delete (#162 Q-AL7)? **rec** no. #168 is categories and accounts only; the default report Delete stays hidden until Diego decides via CoS (#165 follow-up). Not built.
- Q-AM5 Confirm style: **rec** keep the CFO-accepted text and the browser `window.confirm` as built and QA'd in #167. An in-page confirm like #162 Q-AL5 would be polish, out of ticket. Not built.
- Q-AM6 The CFO re-confirms the Q-Z1..Q-Z12 behaviour with the UI on (issue "CFO re-confirm"): **rec** yes, on the preview after the flip. Not built.
- Q-AM7 Undo of a saved delete: **rec** none (as #165: re-adding the name re-links it, Q-Z4). Not built.
- Q-AM8 Tap targets and style: **rec** the existing `pf-button` style with `--color-danger` like #162's Delete, and ≥ 44 px at 390 px. The #167 build's style is otherwise unchanged. Not built.
48.6 (2026-10-20, CFO decision) Q-AM1..Q-AM8 are accepted as recommended, with two changes. The answers are now **built** on PR #196:
- Q-AM1 built: `PF_DELETE_UI = true` (`src/lib/finance/flags.ts`).
- Q-AM2: a code constant, with no env var and no Vercel change.
- Q-AM3 built: `onDelete={!deleteUi || readOnly ? null : …}` in `expenses-page.tsx`, so a Read grant renders neither button nor any confirm.
- Q-AM4: the Charts default report Delete stays hidden (#162 Q-AL7, unchanged).
- Q-AM5: `window.confirm` with the #167 text, unchanged.
- **Q-AM6 change:** the CFO can't sign in, so QA runs Q-Z1..Q-Z12 on the preview with screenshots for the CFO's sign-off (steps PFDU-Z1..Z12 in the AC pack).
- **Q-AM7 addition:** re-adding a deleted name (any case) clears its `(deleted)` label and does **not** rewrite earlier months. Pinned on PGlite in `src/lib/finance/relink.server.test.ts` (both TZs); keeping the deleted entry on re-add is caught.
- Q-AM8 built (EL ruling T4): both Delete buttons change from `pf-cancel pf-rename` to `pf-button pf-button-danger pf-delete`. That is a transparent fill, with text and a 1 px border in the existing `--color-danger` token (`#ff4136`), min-height 2.75rem (44 px), and `--color-dim` when disabled. No new colour.
48.7 (2026-10-20, QA T1–T3 on b89b42c; corrects 48.3, nothing above removed)
- **T1:** 48.3 said the buttons render "inside the read-only `Lock` fieldset (disabled), because `onDelete` depends on `deleteUi` only". That reason is wrong. The account / category bar (`CategoryFilter` in `expenses-page.tsx`) sits **outside** `Lock` (which wraps only `EquityRates`). Before #168 a Read grant's buttons were disabled by their own `disabled={readOnly || account === ALL}` / `disabled={readOnly || value === ALL || renaming}`, not by the fieldset. #168 hides them (Q-AM3). Design Q-Z10 ("both buttons are disabled, as Rename is") is superseded for Delete: hidden.
- **T3:** the harness (AGENTS.md) gets only the one dated #168 index line (added at b89b42c). No harness rule changes, because #168 adds no route, endpoint, flag mechanism or QA process; it flips an existing constant and reuses existing tools (`pf-months.mjs` already runs the Delete flow when the buttons exist).

## 49. Personal Finance: a stable Overview `This month` while the current month is an unsaved copy (#166, LOW; added 2026-10-20; Phase 1: spec and Qs, nothing built)

49.0 **Problem (facts at 8ee66dd).** When the current month (Toronto) has no stored lines, opening it shows an unsaved auto-copy of the latest month with lines (`openMonth` in `months.ts`, decision 5 / PF-56), with the note `Copied from <Month YYYY> — edit and save.`.
- Overview counts each month "as Save would store it" (#144, `liveLineFigures`), so while the current month is shown its copied lines count, and `This month` reads e.g. `1,000`.
- When another month is shown (or saved), the figures come from the stored months only, where the current month has none. `This month` then reads `—` until the current month is saved.
- Read-only always uses the stored months (`lineFigures`), so it shows `—`.
- Nothing is wrong in storage; only the display flips.
49.1 **Proposed rule (Q-AN1).** Whenever the current month has **no stored lines** and a copy source exists, Overview counts the current month as its copy: the lines `openMonth` would show, minus names deleted on or before the current month (`withoutDeletedFor`, #165 Q-Z7). This applies whichever month is shown, signed in or read-only. Once the current month is saved with lines, its own lines count (unchanged). Nothing is stored by this: it is display only, and a copy is still saved only by the user's Save.
49.2 **Where.** Client only: `lineFigures` / `liveLineFigures` (`src/lib/finance/months.ts`), used by `expenses-page.tsx` for `04` Overview (the `This month` column `pf-ov-now`, the averages `pf-ov-avg3` / `pf-ov-avg`, the chart `pf-chart`, the coverage `pf-coverage`). No endpoint, wire or data change. The server-side `/series` and `/chart` read stored months and are **not** changed (Q-AN4).
49.3 **Harness.** AGENTS.md gets one dated #166 index line only; there is no harness rule change, because #166 adds no route, endpoint, flag or QA process (it changes one client figure rule).
49.4 Q-calls (CFO), each with a recommendation; **none built** (Phase 1):
- Q-AN1 Count the current month's copy whenever it has no stored lines (49.1): **rec** yes (the issue's proposed fix). Not built.
- Q-AN2 The averages and chart too: **rec** yes. The current month's copy figure feeds `This month`, the 3- and 12-month averages, the chart and the coverage alike, so every Overview figure is stable (today they all flip together). Not built.
- Q-AN3 Read-only grant (CFO): **rec** the same rule (the copy is computed from the owner's stored months; nothing is written). Not built.
- Q-AN4 Server `/series` / `/chart` (Charts): **rec** unchanged in #166 (they show stored data). Matching them would be a wire / out-of-ticket Q. Not built.
- Q-AN5 A note that the figure is a copy: **rec** none on Overview (the Expenses section already shows `Copied from … — edit and save.` when the month is shown); no new copy. Not built.
- Q-AN6 Typed Update totals for the current month (`05` Update): **rec** unchanged. A month saved with lines uses its own; else its typed totals win over the copy (as #112 decision 7 orders them: lines, then typed, then none, with the copy taking the "lines" place only while nothing is stored). Not built.
- Q-AN7 No copy source (no month with lines): **rec** unchanged, `—`. Not built.
49.5 (2026-10-20, CFO decision, with EL rulings V2 / V3; corrects 49.1–49.4, nothing above removed) Q-AN1..Q-AN7 are accepted, with one change, and **built** on PR #198:
- Q-AN1 built: `withCurrentCopy` in `months.ts`. `lineFigures` / `liveLineFigures` take the current month and count its copy while it has no stored lines.
- **Q-AN2 CHANGED (CFO):** the copy feeds `This month` (`pf-ov-now`), the Overview chart (`pf-chart`) and the coverage (`pf-coverage`), but **never** the averages. `pf-ov-avg3` / `pf-ov-avg` use complete months only (#126 / #132 / #146), so they are identical with and without the copy.
- Q-AN3 built: the read-only grant uses the same rule.
- Q-AN4: the server is unchanged (`lineFigures` without a current month, as `series.ts` calls it). Overview chart vs `/chart` / export can now differ for the current month; this is **parked** as a possible follow-up.
- Q-AN5: no new note.
- **Q-AN6 (EL V2, CFO-confirmed):** the current month's order is **stored lines > typed `05` Update totals > unsaved copy > `—`**, whichever month is shown. Typed totals beat the copy even while October's copy is on screen: `dropUnsavedCurrent` (months.ts), and the live Overview keeps October's typed totals while its copy is unsaved (`expenses-page.tsx`). A Save of October still stores its lines, which then win (#112 decision 7).
- Q-AN7: no source → `—`.
49.6 (2026-10-20, QA V1–V5 on de7b684; additions only)
- V1: every figure is written as rendered, with two decimals (`1,000.00`).
- **V5, fixture T (replaces PFTM's fixture T):**
  - The shared expenses value is `{ fixed: [], variable: [], accounts: [], categories: [] }`.
  - Months: `2026-08`: fixed `rent` 2,000 / month, `variable: []`, `people: []`; `2026-09`: fixed `rent` 1,000 / month, `variable: []`, `people: []`.
  - **Income fields stored:** none. Each month's `people` is `[]`, and `orpheus.finance.income.v1` is not set, so every Income figure is `—`.
  - No overview value (no typed months, `start` / `growth` empty, Future off). Household CAD; Rate used empty.
- Clock 2026-10-11 (Toronto), current month 2026-10, not stored.
- **Harness:** unchanged (49.3).
49.7 (2026-10-20, QA interim W1 / W2 on b7a5758, EL ruling, CFO-accepted; refines 49.5 Q-AN6, nothing above removed)
- **W1:** the current month's order applies **per field**. For expenses and income separately: stored lines > the typed `05` Update total for that field > the unsaved copy > `—`. Typed income with no typed expenses gives the typed income and the copy's expenses, and the reverse.
- Surplus = resolved income − resolved expenses.
- Built as `typedOverCopy` in `months.ts`, replacing 49.5's `dropUnsavedCurrent`, which dropped both fields whenever either was typed (the bug).
- **W2:** a unit test for `withCurrentCopy` (`months.test.ts`): a copy into an empty current month, stored lines kept, no source, and the #165 Q-Z7 deleted-name drop.

## 50. Report export: Unicode text in PDF and PNG (#176, MEDIUM, CFO; follow-up to #157 / spec 39; added 2026-10-21; Phase 1: spec, ACs and Qs, nothing built)

50.0 **Problem (facts at 3f59104).** `src/lib/finance/export.ts` (#157, PR #175) passes every printed string through `ascii()`, which turns `–` / `—` into `-` and every other character outside U+0020–U+007E into `?`.
- The PDF uses the standard Type1 Helvetica / Helvetica-Bold with WinAnsiEncoding; no font is embedded.
- The PNG draws a hand-made 5x7 bitmap font (`GLYPHS`) covering printable ASCII only. Lowercase `g j p q y` sit on the baseline with no descenders.
- So `Café € — Zürich` prints as `Caf? ? - Z?rich` in both files.
- The data copies (PDF `/OrpheusData`, PNG `tEXt orpheus-data`) are **already lossless**: `dataJson` escapes non-ASCII as `\uXXXX`. Only the printed text is lossy.

50.1 **Goal.** Both files print the following verbatim, using one embedded font:
- Latin-1 (U+00A0–U+00FF) and Latin Extended-A (U+0100–U+017F).
- The currency signs `€ £ ¥ R$`. `£` and `¥` are in Latin-1, `€` is U+20AC, and `R$` is ASCII.
- `–` (U+2013), `—` (U+2014), `…` (U+2026) and `−` (U+2212).

The PNG's lowercase `g j p q y` get descenders.

Everything else is unchanged:
- The values and their order.
- The layout: page size, PNG width, line origins, plot area, legend and table positions.
- The 36.11 caveat verbatim, the `Rendered as lines` label (PFX-18), the fail-closed audit (PFX-19), the data JSON, the filenames and the route.

50.2 **Where.** Server only, in `export.ts` plus a font asset under `src/lib/finance/fonts/`.
- No endpoint, wire, data, flag or UI change.
- `qa/tools/export-parse.mjs` learns to read text drawn with an embedded font (via its ToUnicode map) so QA can check the text.

50.3 **Harness.** AGENTS.md gets one dated #176 index line. There is no harness rule change: no route, flag, QA process or sign-in tool is added.

50.4 **Fixture U (exact inputs).** One saved report, owner `cfo`. Household CAD; clock 2026-10-21T12:00:00Z; no FX.
- **Name:** `Épargne € £ ¥ R$ — pgqyj`.
- **Chart:** `line`. **Range:** `2026-08..2026-10`.
- **Two series (the labels come from the stored names):**
  - Category `Café crème — Zürich, Ñandú, Øresund, Straße` (string **U1** below).
  - Account `Łódź, Kraków, Škoda, Čapek, Œuvre, Ğİş, Ő` (string **U2** below).
- Values: 1,234.56 / 789.00 per month.

The test strings, with code points above U+007E listed:

| Id | String | Above U+007E |
|---|---|---|
| U1 | `Épargne café crème — Zürich, Ñandú, Øresund, Straße` | U+00C9 U+00E9 U+00E8 U+2014 U+00FC U+00D1 U+00FA U+00D8 U+00DF |
| U2 | `Łódź, Kraków, Škoda, Čapek, Œuvre, Ğİş, Ő` | U+0141 U+00F3 U+017A U+0160 U+010C U+0152 U+011E U+0130 U+015F U+0150 |
| U3 | `€ £ ¥ R$` | U+20AC U+00A3 U+00A5 |
| U4 | `pgqyj` | none (descenders) |
| U5 | `Сбережения` (Cyrillic) | U+0421 … U+044F, out of scope (Q-AO3) |
| U6 | `貯金` (CJK) | U+8CAF U+91D1, out of scope |
| U7 | `🏠` (emoji, one code point, two UTF-16 units) | U+1F3E0, out of scope |

50.5 **Fallback.** A code point the embedded font lacks (U5–U7) prints as **one** `?` per code point, never two for a surrogate pair. Today an emoji prints as `??`. The export never fails because of text, and the data JSON keeps the original.

50.6 **Font (for the CFO).** Recommended: **Noto Sans** Regular and Bold (Q-AO1).
- **Licence:** SIL Open Font License 1.1. "Copyright 2022 The Noto Project Authors" is read from the font's name table. OFL allows embedding in PDFs and pictures and redistributing it inside software. It requires shipping the licence text with the font (`OFL.txt`) and not selling the font by itself.
- **Full font files:** Regular 621,572 bytes, Bold 631,484 bytes.
- **Subset:** U+0020–007E, U+00A0–017F, U+2013, U+2014, U+2026, U+20AC, U+2212 and U+20A9, unhinted. Regular 28,004 bytes, Bold 27,936 bytes; Regular gzips to 16,313 bytes. These were measured on 2026-10-21 with `pyftsubset` (fontTools, a Python tool run on the dev box, not an npm dependency).
- **Size increase:** about **56 KB raw** (about 75 KB as base64 in a TS module), in the `/api/personal-finance` function only. The client bundle doesn't change.
- **Exports:**
  - PDFs grow by the embedded subset: about 28–56 KB per file, or less compressed.
  - PNGs stay about the same size, since only the pixels change.

50.7 Q-calls (CFO / EL), each with a recommendation; **none built** (Phase 1):
- **Q-AO1 Font:** **rec** Noto Sans Regular + Bold subset (OFL 1.1, 50.6).
  - Alternatives: DejaVu Sans (Bitstream Vera licence; bigger and less even), or hand-drawing about 190 more bitmap glyphs (no licence, no font file, but a 5x7 grid can't hold stacked accents, so it would need a 7x11 grid and a new layout).
  - Not built. Licence decision.
- **Q-AO2 No new npm dependency:** **rec** yes.
  - The PDF embeds the subset as a Type0 / CIDFontType2 font (Identity-H) with a ToUnicode CMap, using the widths from `hmtx`.
  - The PNG uses a small hand-written TrueType reader and scanline rasterizer (quadratic outlines, nonzero fill, grey anti-aliasing blended FG over BG), of about 250 lines.
  - Rejected: pdf-lib / fontkit / opentype.js / @napi-rs/canvas. These are new dependencies, and canvas is a native binary.
  - Not built.
- **Q-AO3 Coverage:** **rec** exactly 50.1. Noto Sans also has Greek and Cyrillic for about +25 KB more per weight, but that's outside the ticket's minimum. CJK (megabytes) and emoji (a colour font) are no. U5–U7 use the 50.5 fallback. Not built.
- **Q-AO4 Font source:** **rec** commit the two subset `.ttf` files with `OFL.txt` and a `FONTS.md`. `FONTS.md` records the upstream URL and commit, the exact `pyftsubset` command and the SHA-256 of each file. A unit test checks the SHA-256 and that every 50.1 code point is in the `cmap`. Not built.
- **Q-AO5 Where the bytes live:** **rec** a generated base64 TS module (`fonts/noto-sans-subset.ts`), so the Vercel function bundles it without any `vercel.json` `includeFiles` change. That change would be a deploy-config Q. The function grows by about 75 KB. Not built.
- **Q-AO6 PNG text metrics:** **rec** keep `PNG_LAYOUT` (W 1200, M 24, LH 18), with 14 px glyphs (cap height ≈ 10 px, as today's 5x7 × 2). Proportional widths come from `hmtx`, and wrapping measures pixel width against `W − 2M` instead of character count. Line origins (M, M + i·LH) are unchanged, and descenders fit inside LH. Not built.
- **Q-AO7 PDF font for all text:** **rec** use the embedded Noto Sans (F1) and Noto Sans Bold (F2) for every string, so the look is uniform. Alternative: Helvetica with WinAnsi for Latin-1 + `€` (0 bytes added), but that has no Latin Extended-A (`Ł ő Č`), so it fails U2. Not built.
- **Q-AO8 Filename slug:** **rec** unchanged in #176. It is outside the ticket: `Épargne` → `-pargne` today. Transliterating with NFD (`epargne`) would be a separate small Q. Not built.
- **Q-AO9 PDF `/Title`:** **rec** write it as UTF-16BE (`<FEFF…>`) so viewers show `Orpheus report: Épargne € …`. This is metadata only, inside the ticket's "renders Unicode text". Not built.
- **Q-AO10 PFX-18 pixel test:** **rec** its helper changes from "matches the 5x7 dots" to "matches the rasterizer's output for the same string at the same origin". The assertion (the note is drawn on line 3) is unchanged. Not built.

50.8 **ACs:** `qa/CANONICAL-AC-PACK.md` section PFU (PFU-01..PFU-16).

50.9 (2026-10-21, CFO decisions on PR #203 and QA Y1–Y12 on dbf4881; **built** on PR #203; corrects 50.0–50.8, nothing above removed. Where 50.1–50.8 differ, this section wins, and the "Phase 1 / not built" markers above are superseded.)
- **CFO decisions.** These are accepted as recommended and **built**: Q-AO1 (Noto Sans Regular + Bold subsets, OFL 1.1), Q-AO2 (no new dependency: `src/lib/finance/ttf.ts`), Q-AO4 (the subset `.ttf` files, `OFL.txt`, `FONTS.md` and a checksum test), Q-AO5 (a base64 TS module, `vercel.json` untouched), Q-AO6, Q-AO7, Q-AO9 and Q-AO10.
  - **Q-AO3:** accepted for this coverage. No Cyrillic; that may be a later ticket.
  - **Q-AO8 CHANGED (CFO):** filenames stay ASCII. First NFD, then drop combining marks (`\p{M}`), then any other character outside printable ASCII → `-` (`asciiName`). So `Épargne` → `Epargne` and `Ça` → `Ca`; `Ł` and `Ø` have no decomposition, so they become `-`. Then the #157 slug rules apply (lowercase, runs of non-`[a-z0-9]` → `-`, at most 40 characters).
- **Y6 / 50.1 coverage:** U+0020–007E, U+00A0–017F, U+2013, U+2014, U+2026, U+20AC, U+2212 and **U+20A9 (₩)**, in both weights. This is the same set as the subset command in `fonts/FONTS.md`.
- **50.5 text rule (`printable`, used by both formats), in order:**
  1. NFC.
  2. Tab, CR and LF → a space.
  3. Soft hyphen U+00AD → dropped.
  4. Each code point the font maps (≥ U+0020) is kept; every other code point (C0 / C1 controls, U+007F, Cyrillic, CJK, emoji) → exactly one `?`.
  NBSP U+00A0 is kept and drawn as its own (blank) glyph. Report names already refuse controls (`reports.ts` `nameError`), so controls can only come from category, account or line names.
- **50.6 sizes, measured 2026-10-21 on the built subsets.** These are smaller than the Phase 1 estimate because GSUB / GPOS / GDEF are dropped (no shaping is needed) and the fonts are unhinted.
  - `NotoSans-Regular-subset.ttf`: **21,748 bytes**, SHA-256 `049f5754c037199c4e209aed9e654ef31ccb850d628279e5cf761577a5364804`.
  - `NotoSans-Bold-subset.ttf`: **21,696 bytes**, SHA-256 `af10b9d3570e032b0dbe42fa3eeed557e08711a99c780a47a2d00104f9ecf230`.
  - `noto-sans-subset.ts` (base64): 61,820 bytes.
  - **Function size:** `npx vite build` `.vercel/output/functions/__server.func` went from 5,520,409 to **5,591,287 bytes (+70,878, +1.3%)**. The server router chunk went from 210,835 to 281,773 bytes. The client (`.vercel/output/static`) is unchanged at 4,806,363 bytes.
  - Each PDF embeds both subsets (Flate) plus ToUnicode and `/W`.
- **Y1 / Y2, fixture U (replaces 50.4's fixture).** The exact literals live in `src/lib/finance/export-golden/fixture-u.ts`. Report and category names are limited by `NAME_MAX` 60 and `CATEGORY_MAX` / `ACCOUNT_MAX` 40.
  - **U1 = the report name:** `Épargne café crème — Zürich, Ñandú, Øresund, Straße` (51 characters).
  - **U2 = the category:** `Łódź, Kraków, Škoda, Čapek, Œuvre, Ğİş Ő` (40 characters; 50.4's U2 is shortened by one comma to fit).
  - **U3:** `€ £ ¥ R$ ₩`. **U4:** `pgqyj`. The account is `Konto € £ ¥ R$ ₩ pgqyj`.
  - **U5:** `Сбережения`, 10 code points: U+0421 U+0431 U+0435 U+0440 U+0435 U+0436 U+0435 U+043D U+0438 U+044F (Y5).
  - **U6:** `貯金` (U+8CAF U+91D1). **U7:** `🏠` (U+1F3E0).
  - **Stored record (`personal_finance.data`, owner `olga`):**
    - The `orpheus.finance.expenses` shared value is `fixed: [rent 1234.56 / month, category U2, account Chequing]`, `variable: [t 789 / month, category Home, account "Konto € £ ¥ R$ ₩ pgqyj"; s 10 / month, category U5, account Chequing]`, with `accounts: ["Chequing", "Konto € £ ¥ R$ ₩ pgqyj"]` and `categories: [U2, "Home", U5]`.
    - The months `2026-07`, `2026-08` and `2026-09` each hold those same lines, with `people: []`.
    - No overview, no income. Household CAD, no FX.
  - **Clock:** 2026-10-21T12:00:00Z (Toronto month 2026-10, not in the range). The range uses closed months only.
  - **Report:** `POST /reports { name: U1, report: { series: [{ kind: "category", id: U2 }, { kind: "account", id: "Konto € £ ¥ R$ ₩ pgqyj" }], range: { from: "2026-07", to: "2026-09" }, chart: "line" } }`.
  - **Fallback report:** name `貯金 🏠`, series `[{ kind: "category", id: U5 }]`, same range and chart.
  - **Expected `/chart { saved: true, id }` rows:** `2026-07` / `Jul 26`, `2026-08` / `Aug 26` and `2026-09` / `Sep 26`, each `partial: false`, `values: [1234.56, 789]`. `current` is `2026-10` and `partial` is false. The series labels are U2 and `Konto € £ ¥ R$ ₩ pgqyj`, with `missing: false`.
  - The PDF table rows read `1,234.56` and `789.00`.
- **Y8, exact filename for U:** `orpheus-report-epargne-cafe-creme-zurich-nandu-resund-s-2026-10-21.pdf` (`.png` likewise).
- **Y8, access runs (unchanged):**
  - The owner gets 200.
  - qa-cfo-read (a Read grant with no saved reports of its own) gets 404 `Report not found.`, both on `default` and on the owner's report id.
  - No Personal Finance grant gets 403.
- **Y9, PFU-03 width constants:** both subsets have `unitsPerEm` 1000, and `/W` is the `hmtx` advance for every glyph id.
  - **Regular 7 pt:** `1,234.56` = 27.776 pt; `789.00` = 21.896 pt.
  - **Bold 7 pt:** `2` = 4.004 pt; `Month` = 23.114 pt.
  - Column right edges are 182 and 272 pt (M 36 + month 60 + colW 90 · (i + 1) − 4).
- **Y10, PFU-07 baseline:** the glyph baseline is at line origin y + `PNG_TEXT.BASE` (13 px); 14 px per em. Round letters may antialias into the first row under the baseline (y + 13), so "below the baseline" means rows y + 14 and lower.
  - `p g q y j` each light at least one pixel there (alpha ≥ 32), reaching at least 3 rows under the baseline and staying inside LH 18.
  - `a e o x` light none.
- **Y10, PFU-09 / PFU-10 goldens:** `src/lib/finance/export-golden/3f59104.json` was written by `export-golden/capture.ts` running on the **3f59104 code**. It holds, for the #157 ASCII record with a net-assets line report and a 12m bar report: the PDF text strings, page count, MediaBox, PNG width × height and the SHA-256 of `dataJson`. The built code reproduces it exactly.
- **Y3, golden PNG crops for QA's visual sign-off:** in `qa/evidence/176/` (listed in `goldens.json`). The test compares the SHA-256 of each crop's raw RGB bytes; the file SHA-256 is given for the committed PNGs.

  | Crop | ACs | Box (x, y, w, h) | Raw RGB SHA-256 | File SHA-256 |
  |---|---|---|---|---|
  | `u-name.png` | PFU-04 / 05 | 24, 24, 1152, 18 | `25c73eecf8560e8863df09beb4a159b9ffad8560e936604d5f30dc97e931ee67` | `be1ed473443edebaef1ad987ee470e1292b96d2921ace628639cc7400714d934` |
  | `u-legend-category.png` | PFU-04 / 05 | 72, 508, 1104, 18 | `d1157c939725da3f590da0abcf659ff5105b46216ffbf74296296d6ca9072ee9` | `dec70962b76fd1bff2a94e06a0ce4705a1ed00efbe33c9b558b05f9eb4d6ed60` |
  | `u-legend-account.png` | PFU-06 / 07 | 72, 526, 1104, 18 | `9e8c74a351571645c7402f528039316e9eba5c85a5f353766584d205623a6115` | `247fc0b6f399ff75b3a25c298c90fb62ea0ac5abd19584881a2d9cfdc9161c42` |
  | `golden-caveat.png` | PFU-11 | 24, 114, 1152, 18 | `b309fcae21e0bec39049953f956221d3ce51e5c1315e8683a52a9d35d8b3864c` | `56f21fda20866e01bee9b3d13d061a60be016a16096711cc7eea613c49fa116d` |
  | `u-fallback.png` | PFU-08 | 24, 24, 1152, 18 | `0ff94de877c1b8c9395d9949164f121e22e87ae62ad649de9f739ddb5912c73b` | `28901d5a243ef31357168b24041e821018f1f3cc60c90407db756ef48aef6f2c` |

  - After QA signs off, a rendering change must regenerate the crops (`node --experimental-strip-types src/lib/finance/export-golden/crops.ts`) and be signed off again.
- **Y4:** PFU-01 and PFU-08 **supersede PFX-11** (non-ASCII no longer prints `?`).
  - **PFX-14 budget:** under 100 KB, now with both fonts included. Measured on the 12 series × 24 months case: PDF **75,170 bytes** (28,866 at 3f59104), 7 ms; PNG 67,739 bytes (21,402; antialiasing), 114 ms. Both are well inside the PFX-14 limits (100 KB / 600 KB, 2 s).
- **Y8, PFX-01..PFX-19:** unchanged except that **PFX-11** is superseded by PFU-01 / PFU-08. Two other results change only through Q-AO8:
  - PFX-03's example filename for `Spend été` is now `orpheus-report-spend-ete-…`.
  - The #157 F3 checks now compare against the rasterizer (Q-AO10); the F3 "printable ASCII 5x7 font" test is retired along with the 5x7 font.
- **Q-AO6 wrap (as built):** the PNG wraps by the #157 character budget (`floor((W − 2M) / ADV)`) **and** also breaks before a line would overflow `W − 2M` px. This keeps every ASCII export's PNG height identical (PFU-10). The legend indent and axis gutters keep the #157 units (`ADV` 12, `S` 2).
- **Harness:** AGENTS.md gets one dated line (built; fonts licence). README is unchanged: README describes how to run, deploy and test the app, not the export internals, and no command or deploy step changed.

50.10 (2026-10-21, QA Z1 on dd23170; text-only correction of 50.9, nothing above removed, no golden changed.) The **fallback golden crop** `qa/evidence/176/u-fallback.png` (PFU-08, `export-golden/crops.ts`) renders fixture U with the report name **`Сбережения 貯金 🏠`** (U5 + space + U6 + space + U7). Its title line prints `Orpheus - Personal Finance report: ?????????? ?? ?`: 10, 2 and 1 `?`. The name `貯金 🏠` given in 50.9 is only the **PGlite fallback report** (`U_FALLBACK_NAME`, whose title prints `?? ?` and whose category U5 prints `??????????`). It is not the name in the golden crop.

## 53. Personal Finance: History, a read-only table of stored months by year (#214, MEDIUM, CFO; added 2026-10-21; built in the same PR)

(Section number 53: open PRs #205 and #206 hold sections 51 and 52.)

53.0 **Brief, with the 2026-10-21 scope update approved by Diego.** A read-only, spreadsheet-style table of the months stored for the account. The person **picks a year first**; the table then shows **that year's stored months only**, not every month on one screen. There is one column per stored key figure: income lines, expense lines, totals and Equity coverage. The table uses the existing dark site style (lyre, Orpheus Wisdom footer, no gold) and must work at 390 px and 1440 px. CFO is the business user.

53.1 **Facts at be7cc97.**
- Each month's own lines live in `orpheus.finance.months.v1`: `{ "<yyyy-mm>": { fixed, variable, people } }`, from `FIRST_MONTH` (2020-01).
- Older months may instead have typed Overview totals in `orpheus.finance.overview.v1` `months`.
- Accounts, categories, Rate used, the household currency and Starting net assets / As of month are shared values.
- The Charts series (`seriesValues`, #154) already turns these into monthly income, expenses, surplus, group totals and net assets.

53.2 **What is built.**
- **Route:** `/personal-finance/history`, with the same gate as `/personal-finance`:
  - signed out → 307 to `/dashboard/sign-in?next=/personal-finance/history` (added to the `?next` allow-list);
  - a temporary password → `/account`;
  - no Personal Finance grant → the 403 denied page;
  - **Read is enough**, so the CFO with Read sees the table.
- **Entry point:** a `History` link next to `Charts` under the Personal Finance title. The History page links back.
- **Data:** one `GET /api/personal-finance` on mount. It never writes: no PUT, and no import or migration of this browser's old values (it does not use `loadAccountStore`). There is no new endpoint, no new stored value, no migration and no env change.
- **Year first:** a `Year` select listing only the years that have at least one stored month, newest first, with a `Choose a year` placeholder. Until a year is chosen, the page shows `Choose a year to see its stored months.` and no table. With no stored months at all, it shows `No months stored yet.` and no select.
- **Stored month:** a month with saved lines, or a month with a typed Overview expenses or income total. An empty month is not stored. The current month appears only when it is stored; the Overview's unsaved copy (#166) is never shown.
- **The grid** is a semantic `<table>`: a visually hidden caption, one row per stored month of the chosen year (oldest first, `<th scope="row">` month name), and one `<th scope="col">` per column. Columns, in order:
  1. The year's **income lines**: each counted person · Wages / Bonus line, monthly net in the household currency.
  2. The year's **expense lines**: each fixed then variable line, by line id in first-seen order, labelled with its name; monthly in the household currency.
  3. **Income**, **Fixed expenses**, **Variable expenses**, **Expenses**, **Surplus**, **Net assets**.
  4. **Equity coverage (monthly)** and **Equity coverage (% of expenses)**.
- **Cell values:**
  - A line the month doesn't hold shows `—`.
  - A month with typed totals only has no line or group cells (`—`).
  - Money uses the #142 format (two decimals, no symbol). The share has two decimals and `%`.
- **Totals and net assets** are `seriesValues` for the year's stored range, so they match the Charts series.
- **Layout:** the grid scrolls sideways inside its own focusable region (`role="region"`, `tabindex="0"`, labelled by the caption). The page itself never scrolls sideways, at 390 px included. The Month column stays fixed while scrolling.
- **Style:** the dark site palette (`--color-night`, `--color-chalk`, `--color-dim`, `--color-hair`), the site shell's lyre and footer, no gold.

53.3 **Q-items (recommendation; built or not built).**
- **Q-HT1, FX basis.** The table uses the record's rates as typed, like the Personal Finance page and Overview. It does not use the Bank of Canada monthly averages that the Charts series applies on the server (#170).
  - **Rec:** keep the typed rates. Built.
  - Alternative, not built: a read-only server endpoint applying the historical rates. That would be a new API, so it needs a go.
- **Q-HT2, Equity coverage for a past month.** It uses that month's end-of-month net assets × Rate used ÷ 12 (monthly), and that amount ÷ that month's expenses (share).
  - The Overview's figure is different: current net assets against the 3-month average (#126 / #184).
  - **Rec:** this per-month definition. Built. CFO to confirm.
- **Q-HT3, columns.**
  - Line columns are per line id within the chosen year, labelled with the first name seen. A renamed line keeps one column.
  - Accounts and categories are not separate columns, because they are groupings of the same lines.
  - **Rec:** as built.
- **Q-HT4, default year.** No year is preselected, per the scope update ("user picks a year first").
  - **Rec:** keep. Built.
  - Alternative, not built: preselect the newest year.
- **Q-HT5, Year choices.** Only years with a stored month, not every year from 2020.
  - **Rec:** as built (no empty years).
- **Q-HT6, shared values.**
  - Rate used, the household currency and Starting net assets are stored once, not per month. Every past month is therefore valued with today's values, as on the Overview and in Charts.
  - **Rec:** accept. Storing them per month would be a data-model change. Not built; it needs a ticket.
- **Q-HT7, entry point.** A `History` link beside `Charts` on the Personal Finance page, not a new site-menu item.
  - **Rec:** as built.
- **Q-HT8, export or download** of the table.
  - **Rec:** out of scope (read-only view). Not built.

53.4 **Harness.**
- AGENTS.md gets a dated `## Personal Finance: History table (#214)` section, and README a dated line.
- Tests: `src/lib/finance/history.test.ts` (year filter and grid) and `src/components/personal-finance/history-page.dom.test.tsx` (page).
- The signed-out QA check is in `qa/tools/site-shell.mjs`.
- AC `PFHT-01..PFHT-20`.

53.5 **CFO decision (2026-10-21, added the same day).** The CFO accepted Q-HT1..Q-HT8, with two changes that are built in this PR:
- **Q-HT2:** when a month's expenses are zero (or missing), the `Equity coverage (% of expenses)` cell shows `—` and never divides. The monthly coverage amount still shows. AC PFHT-21.
- **Q-HT6:** a visible note sits above the grid: *"Rate used, household currency and starting net assets are today's values, not per-month values. Every month in this table uses them."* (`SHARED_VALUES_NOTE`). It shows only with the grid. AC PFHT-22..PFHT-24.
- **Q-HT1, Q-HT3, Q-HT4, Q-HT5, Q-HT7:** CFO-accepted as built.
- **PARKED:** per-month stored values for Rate used, household currency and starting net assets (Q-HT6 alternative; a data-model change), and CSV / any export of the table (Q-HT8). Neither is built; each needs its own ticket.

## 54. Personal Finance: `PUT /api/personal-finance/view` needs write access (#197, LOW, security; added 2026-10-21; built in the same PR)

54.1 Problem. `PUT /api/personal-finance/view` was gated with `need: "read"`, so anyone with a Read grant could write data (their stored section view). Every other Personal Finance write needs `need: "write"`.

54.2 Rule (built). The handler gates with `gateDashboardRequest(..., { surface: "personal_finance", need: "write" })`, the same helper the record PUT uses.
- Owner: 200, the view is stored in the record (`VIEW_KEY`), as before.
- Read and write (not owner): 200, the view is stored in that person's own `account_state.pf_view`; the owner's record is untouched, as before.
- Read only: 403, nothing stored.
- No Personal Finance grant: 403, nothing stored. Signed out: 401. GET on the route: 405, unchanged.
- `GET /api/personal-finance` is unchanged for every role. A view stored for a Read user before #197 still applies to them.

54.3 Client (built). When `access.write` is false the page sends no PUT for a section toggle; the toggle works for this visit and no "Not saved" appears.

54.4 Note. The issue said the UI never called the route for Read users. It did: #90 Q-D11 stored a Read CFO's toggles through it. This ticket reverses Q-D11 for Read users (Q-VW1).

54.5 Questions.
- Q-VW1 (BUILT, recommend accept): Read users' toggles are per visit only and are no longer stored. Alternative: keep Q-D11 with a narrower view-only grant (needs a ticket).
- Q-VW2 (NOT BUILT, recommend leave): clearing views stored for Read users before #197. They are harmless and theirs only; clearing would be a DB write.
- Q-VW3 (NOT BUILT, recommend leave): `VIEW_API` stays exported in `account-client.ts` although the client no longer calls it; removing it is cleanup.

## 55. Personal Finance: destination analysis / scenario screen (#215, MEDIUM, CFO; added 2026-10-22; built in the same PR)

(Section number 55: §53 is History (#214) and §54 is the view write guard (#197), both on main; open PRs #205 and #206 hold 51 and 52; #117 and #107 add no Personal Finance section.)

55.0 **Brief (the issue comment approved by Diego, 2026-10-21, supersedes the original).**
- A destination-analysis mode opened from the main Personal Finance screen.
- Levers move income up or down, expense categories up or down, Rate used, and other key inputs.
- Every figure is recalculated at once.
- Charts show the projected path for the next 12 months by default; the horizon can switch to 3, 5 or 10 years.
- A totals table on the same screen shows aggregates and net income, in the style of the main page totals.
- It is a what-if layer only. Saved month data is never overwritten unless the person explicitly saves the scenario.
- It uses the existing dark site style (lyre, Orpheus Wisdom footer, no gold) and works at 390 and 1440 px.

55.1 **Route and gate (built).**
- `/personal-finance/scenario` has the same gate as `/personal-finance`:
  - signed out → 307 to `/dashboard/sign-in?next=/personal-finance/scenario` (added to the `?next` allow-list);
  - a temporary password → `/account`;
  - no Personal Finance grant → the 403 denied page.
- Read users see the screen and can move the levers. They get no `Save scenario` button and a note says saving needs Read and write.
- The page is linked as `Scenario` beside `Charts` and `History` on the main page, and links back to it.

55.2 **Baseline: today's figures (built; `baselineOf`, read-only).**
- Lines come from the latest month with lines, up to the current household month.
- **Income:** each counted, non-zero income line (the person's Wages and Bonus, after tax, × share, in the household currency) as a monthly figure.
- **Expenses:** grouped by category across Fixed and Variable, in the household currency. Lines without a category form one `No category` lever.
- **Rate used:** the #138 value.
- **Growth rate:** the Overview's growth, else 0.
- **Net assets now:** the Charts series value at the end of the current month, else Starting net assets as typed, else 0.

55.3 **Projection (built; `project`, pure).**
- The path runs from the month after the current one, for `horizon` months.
- Monthly income = Σ line × (1 + change ÷ 100). Monthly expenses = Σ category × (1 + change ÷ 100). Surplus = income − expenses.
- Net assets: each month, net × (1 + growth ÷ 100)^(1/12) + surplus. This is the Overview's Future rule (PF-84).
- Equity coverage at the horizon end uses the #126 rule: net × Rate used ÷ 12, and as a % of monthly expenses. With no rate, net assets ≤ 0, or zero expenses for the %, it shows `—`.
- **Horizons:** 12 months (the default), 3 years, 5 years and 10 years.

55.4 **Levers (built).**
- A % change per income line and per expense category, each from −100 to 1000.
- Rate used (%), from 0 to 100, replacing today's value.
- Growth rate (% a year), from −100 to 1000.
- Net assets now, replacing today's value.
- A blank lever means today's value.
- An invalid lever counts as blank: the numbers use today's value for it, so it moves nothing. It is shown in red and blocks Save (never clamped). (#208 AL1)
- `Reset levers` clears the levers on the page only.

55.5 **Screen (built).**
1. The header: a what-if note and the basis month.
2. Levers.
3. Projected path: the horizon toggles and a line chart of income, expenses and net assets (the Overview chart style).
4. Totals: Net income, Expenses, Surplus, Net assets, and Equity coverage (monthly and %). The columns are `Today, a month`, `Scenario, a month` and `Over <horizon>`. At 390 px the table scrolls sideways inside its own box.

55.6 **Saving (built; the only write).**
- `Save scenario` is shown only with a write grant. It is enabled only when the levers differ from the saved ones and none is in error.
- It does a fresh `GET /api/personal-finance`, then one `PUT` of that fresh record with **only** `orpheus.finance.scenario.v1` replaced.
- The stored value is the compact levers JSON: `{ income, expenses, rate, growth, start }`.
- The server needs a write grant (Read → 403, no grant → 403, signed out → 401; nothing is written). It refuses an unreadable or out-of-bounds value with 400 `{ field: "scenario" }`.
- A lever move, a horizon change, Reset and opening the page never send a request beyond the one GET.
- On open, a saved scenario fills the levers.

55.7 **Storage, and why no schema change (Q-SC1).** The record is the `personal_finance.data` JSONB object of named JSON strings (#102). The server allows only the names in `RECORD_NAMES`. This PR adds one name, `orpheus.finance.scenario.v1`, to that list. There is no new table, column, migration, environment variable or provider.

55.8 **Questions for the CFO.**
- **Q-SC1 (BUILT, recommend accept):** the scenario is stored in the existing record under a new name, not in a new table. One saved scenario per account record.
- **Q-SC2 (BUILT, recommend accept):** expense levers are per category, with Fixed and Variable together and lines without a category as one lever. Alternative: per line, or per Fixed / Variable group.
- **Q-SC3 (BUILT, recommend accept):** a lever is a flat % change from today's lines, the same every month of the horizon. There is no yearly raise or inflation escalation; growth applies to net assets only. Alternative: a yearly escalation lever for income and expenses (a ticket).
- **Q-SC4 (BUILT, recommend accept):** the horizon is a view choice and is not saved. The path starts next month.
- **Q-SC5 (BUILT, recommend accept):** Save re-reads the record just before writing and replaces only the scenario value, so edits made on the main page since this screen opened are kept. Two saves at the same instant are still last-write-wins, as on the main page.
- **Q-SC6 (BUILT, recommend accept):** `Net income` is the counted after-tax income (the main page's Net income). `Surplus` is shown separately.
- **Q-SC7 (BUILT, recommend accept):** at 390 px the four-column totals table scrolls sideways in its own box, as on History, rather than wrapping numbers.
- **Q-SC8 (BUILT, recommend accept):** the saved scenario is on the owner's record, so a Read-and-write CFO's save is the same scenario the owner sees. Separate per-person scenarios would need per-person storage (a ticket).
- **Q-SC9 (NOT BUILT, recommend a ticket if wanted):** named or multiple scenarios, one-off events (a lump sum, or a new line from month X), and tax % or FX levers.

55.9 **README.** It gets one dated line, like #214, because this is a new page a person can open.

55.10 **CFO answers (added 2026-10-22).**
- Q-SC1, Q-SC2 and Q-SC4 to Q-SC8 are accepted as built.
- Q-SC9 is not built. It becomes a separate ticket only if Diego says yes.
- **Q-SC3 is changed.** Growth applies to net assets only while the balance is positive; this is built in the same PR.

55.11 **Growth on a positive balance only (CFO change on Q-SC3, added 2026-10-22; built).** This replaces the net-assets line of 55.3. The projection still runs month by month.
- **Order:** growth applies to the month's **opening** balance, then that month's surplus or deficit is added.
- If the opening balance is **above 0**: closing = opening × (1 + growth ÷ 100)^(1/12) + surplus.
- If the opening balance is **at or below 0**: that month's growth is 0 %, so closing = opening + surplus. This holds for a negative growth rate as well.
- Growth resumes in the first month whose opening balance is above 0, which is the month after the balance crosses above 0.
- An opening balance of exactly 0 gets no growth. 0 × the growth factor is 0 anyway, so this is the same either way.
- Today's positive-balance projections are unchanged (PFSC-07). Totals and coverage use the same path. AC PFSC-31..33.

## 56. Personal Finance: /series, /chart and the export count the current month's unsaved copy as Overview does (#199, LOW; added 2026-10-22; built in the same PR)

56.1 Problem. Since #166 (spec 49, PR #198) the Overview counts the current month's unsaved copy while that month has no stored lines: the copy of the latest month with lines, minus names deleted on or before the current month, with the typed Update totals per field over it, never in averages. Spec 49 Q-AN4 left the server's `/series` and `/chart` (and so the saved-report export, which is built on `/chart`'s data) on stored months only, "parked as a possible follow-up". So the current month showed "-" in a chart or export while Overview showed a figure.

56.2 Rule (built). `seriesValues` (`src/lib/finance/series.ts`), which `/series`, `/chart` and the PDF/PNG export all use, now takes the current month the way the read-only Overview does, through the existing helpers in `months.ts` (no second copy of the logic):
- Income, expenses, surplus and net assets: `savedOverviewFigures(storage, current)` = `typedOverCopy(lineFigures(storage, current), storage, current, typed Update totals of the current month)`. These are the same two calls the Overview makes (`expenses-page.tsx`, read-only branch), with the typed totals read from the saved record. The page keeps its own call because it also passes on-screen, unsaved typed totals.
- Line, account, category and group series: the stored months with `withCurrentCopy(months, shared, current)`, the same copy `lineFigures` uses.
- Stored current-month lines still win (no copy). Past months are unchanged. Nothing is written. There are no averages on these surfaces.

56.3 Access (unchanged). Read can view `/series`, `/chart` and export their own saved report, as before; no Personal Finance grant → 403; signed out → 401.

56.4 Other users of `seriesValues`. History (#214) lists stored months only, so it is unchanged. The scenario screen (#215) starts from the net assets at the current month; when the current month has no stored lines, that start now includes the copy's surplus, as Overview's net assets do (Q-CC3).

56.5 Tests. `src/lib/finance/current-copy.server.test.ts` (AC PFCC-01..11) checks the same value on `/series`, `/chart` (request and saved), the PDF data and the PNG data, and compares it with the Overview expression. PFU-09 (`export-unicode.server.test.ts`) now expects the golden record's 2026-10 bar cell to be 1,000.00 (its copy of 2026-09), the one intended change (PFCC-12).

56.6 Questions.
- Q-CC1 (BUILT, recommend accept): `/series` changes too, not only `/chart` and the export; the issue names it and both are built on it.
- Q-CC2 (BUILT, recommend accept): line, account, category and group series read the copy's lines. With a typed expenses total but no stored lines, the expenses metric shows the typed total while the "all" group shows the copy's lines (PFCC-07), as Overview's per-field rule. Alternative: blank the per-line series in that case (needs a decision).
- Q-CC3 (BUILT, recommend accept): the scenario screen's starting net assets follow the same rule when the current month is unsaved, so they match Overview. Alternative: keep the scenario on stored months only (a one-line change; say so).
- Q-CC4 (NOT BUILT, recommend leave): the copy is not re-valued at historical FX on its own; it carries its source lines as the #170 FX step left them. The current month has no Bank of Canada monthly average until it ends.
- Q-CC5 (NOT BUILT, recommend leave): a deleted category's series reads 0 in the copied current month (its line stays, without the name), as in any stored month without that category.

## 57. Personal Finance: scenario screen rebuilt on the main page, projection math and Overview Future fix (#221, VERY HIGH, Diego / CFO; added 2026-10-22; built in the same PR)

57.0 **Brief.** Diego's five points on #215's screen (issue #221), the CFO business-user spec (2026-10-22, issue comment), Diego's layout change and the CFO scope cut (2026-10-22, via CoS), and the QA sweep AN1–AN14 (QA's explore run on #221). Where this section differs from section 55, this section wins; section 55 is not edited.

57.1 **Layout (built).** `/personal-finance/scenario` renders the Personal Finance page itself (`PersonalFinancePage`, `scenario` mode), reusing its components directly: household currency, `02` Income, `03` Expenses (equity rates and the Fixed / Variable lines), `03` Expenses summary, `04` Overview and `05` Update, with the same section toggles.
- **Categories removed:** the category filter (with the account filter, which is the same control) and `By category` are not shown. The #215 levers (income %, expenses by category %, Reset, `Save scenario`) are gone.
- **Prefill:** the current month's saved lines, or, while it has none, its unsaved copy of last month (#166 / #199). The header reads `Based on last month (<Month YYYY>).`, `Based on this month's saved figures (<Month YYYY>).`, or `Nothing saved yet: every figure starts at 0.`.
- **No month control and no Save.** Section toggles apply to this visit only.
- Below Overview: `06` Projected path (the net-assets field, the horizons and the chart), then `07` Totals.

57.2 **Sandbox only: nothing is written (built; CFO scope cut and Diego's final scope, 2026-10-22).** Every value, net assets included, is seeded from the latest month. No save path, switch or flag remains. The page's store is the loaded record in memory with **no `save`**, so no edit, toggle or migration is ever sent. The only request is one GET on open. The net-assets field is a local starting value; it is never saved. The earlier net-assets Save / confirm / write-back plan is dropped, so there is no new route and no #199 copy materialising. The stored scenario value (`orpheus.finance.scenario.v1`, #215 Q-SC1), its validation and `saveScenario` are unchanged; the page no longer writes it (Q-PJ7).

57.3 **Projection math (built; CFO).** The shared month step lives in `src/lib/finance/projection.ts`:
- `monthlyRate(annual) = (1 + annual/100)^(1/12) − 1`. It is never annual ÷ 12.
- `stepNet(N, surplus, r_m)`: if N > 0 then N × (1 + r_m); then + surplus. There is no growth on N ≤ 0 (#215 Q-SC3 kept).
- `projectNet` returns month 0 plus `horizon` steps (`horizon + 1` values).

The scenario uses it with:
- **Month 0 (plotted once, labelled `Now`, tooltip `Now (end of <Month YYYY>)`):** the Overview's own net assets at the end of the current month (`summarize`), or the typed net-assets value.
- **Surplus:** the Overview's own income − expenses for the current month (the same figures the Overview draws: lines, the unsaved copy, typed Update totals, else the average). It is one number with no double counting (Q-PJ1).
- **Growth:** the Overview's growth field. Horizons are 12 / 36 / 60 / 120 months.

The CFO's worked checks at 9 %/yr:
- **A:** 10,000 and +500 give **17,143.65**.
- **B:** 0 and −1,460 give exactly **−17,520**, a straight line.
- **C:** −2,000 and +500 give **4,102.37** (exact 4,102.370180097717; the CFO's "≈ 4,104" corrected and confirmed by EL, Q-PJ3). C reaches 0 at month 4, then grows only on a positive opening balance.

57.4 **Chart (built).** The #215 design is kept: income and expenses on the left axis, net assets on the right. Only correctness fixes are made:
- month 0 once;
- axis titles (`A month` / `Net assets`);
- axis widths fitted to the longest tick, so labels are not clipped;
- a zero reference line on the net-assets axis;
- the legend names each series' axis.

57.5 **Totals (built).** The columns are `Today, a month` (the saved record), `Scenario, a month` (live) and `Over <horizon>`.
- **Rows:** Net income, Expenses, Surplus, **Growth earned** (net end − start − total surplus), Net assets, and Equity coverage (monthly and % of expenses).
- **Scenario column:** it is filled for net assets (month 0) and coverage (AN14).
- **Percents:** shown with thousands separators (AN11).

57.6 **Overview Future projection (built; CFO Q-b = yes, 2026-10-22).** `summarize`'s Future points now use the shared `stepNet` with r_m. Growth applies only to a positive balance, so a negative balance with a zero average surplus stays flat, and a negative balance crossing 0 grows only once positive. A positive balance compounds exactly as before. **This changes the Overview's Future projection** for negative balances only.

57.7 **Inputs (built; QA AN6–AN13).**
- **Net-assets field:**
  - **Parser (`parseNetAssets`):** an optional sign (`+`, `-`, U+2212 `−`), then the main page's own `parseAmount`. Thousands commas and spaces work as on the main page; `.5` and `5.` are accepted; `1e3` is refused.
  - **Negative amounts:** accepted in this local field only. The main page's `parseAmount` and the record route's 400 validation are unchanged (negative net assets there stay parked).
  - **Errors:** its own message (`Enter an amount, for example 25,000 or -1,500.50.`).
  - **Enter** commits the value (shown formatted).
- **Growth (AN9):** outside −50..+50 % a year, the scenario shows `Growth must be from -50 to 50 % a year here.` and projects at 0 %. The main page's growth field is unchanged.
- **AN3 (no 1000 cap):** the capped % levers are removed. The page's own fields have no 1000 cap. The stored-scenario bounds stay as they are (57.2).
- **Empty state (AN10):** with no figures, `No figures yet. Add income and expenses on the Personal Finance page; the projection starts from them.`

57.8 **Access (unchanged).** Signed out → sign-in; a temporary password → `/account`; no Personal Finance grant → the 403 denied page. Read users get the same what-if screen with the read-only line; nothing is sent for anyone.

57.9 **QA sweep AN1–AN14 (resolutions).**
- **AN1–AN5, AN14:** covered by the new layout.
  - AN1: prefilled from the saved month or last month's copy.
  - AN2: the main-page sections.
  - AN3: the 1000 cap is gone.
  - AN4: chart fixes (57.4).
  - AN5: net assets is editable (local).
  - AN14: the Scenario column is filled.
- **AN6:** the main page's parser is reused.
- **AN7:** each scenario field has its own message; the main-page fields keep theirs.
- **AN8:** negative amounts in the local net-assets field.
- **AN9:** growth is bounded to −50..+50.
- **AN10:** the empty state.
- **AN11:** separators in percents.
- **AN12:** `+5`, `.5`, `5.` and U+2212 are accepted; `1e3` is refused.
- **AN13:** Enter commits.
- **Parked, not touched:** the main page's Bonus % having no upper warning (`income.ts`).

57.10 **Screen sweep at 390 and 1440, owner and Read (findings).**
- **F1 (fixed):** the net-assets label showed the raw month key (`2026-10`); it now shows `October 2026`.
- **F2 (fixed):** with nothing saved, the basis note claimed "this month's saved figures"; it now says `Nothing saved yet…`.
- **F3 (not fixed, main-page component):** the person checkboxes (count wages / bonus, foreign) are under 44 px tall at 390. It is the same on `/personal-finance`, so it should be a separate ticket.
- **F4 (accepted, Q-PJ6):** the account filter goes with the category filter (one control).
- **F5 (checked):** there is no horizontal overflow, no clipped chart tick and no request after the load at either width or role.

57.11 **Questions.**
- **Q-PJ1 (CFO-decided, built):** the surplus is the latest month (the current month as the Overview counts it, i.e. last month's copy while unsaved), not the 12-month average.
- **Q-PJ2 (CFO-decided, built):** Overview Future uses the shared positive-only step (57.6).
- **Q-PJ3 (EL-confirmed, built):** case C is pinned at 4,102.37 ±0.01 (exact 4,102.370180097717), not ≈ 4,104.
- **Q-PJ4 (built, recommend accept):** the `Growth earned` row is net end − start − surplus over the horizon.
- **Q-PJ5 (built, recommend accept):** growth outside −50..+50 % on this screen projects at 0 % with the error shown, rather than hiding the chart.
- **Q-PJ6 (built, recommend accept):** the account filter is hidden with the category filter. Alternative: split the control (a small main-page change).
- **Q-PJ7 (open, recommend keep until #223):** Diego's final scope (2026-10-22) is sandbox only. The #215 stored-scenario lever save (`saveScenario`, `orpheus.finance.scenario.v1`, its route validation) is the only write code left for this screen. Its code is left as is, but the rebuilt page no longer calls it. Should it be removed under "sandbox only", or kept until named saved scenarios (#223, not built here)? We recommend keeping it until #223.
- **Q-PJ8 (not built, recommend a ticket):** F3, the checkbox tap size on the main page.

57.13 **Monthly / Yearly on flow amounts (built; Diego on #221, 2026-10-22; CFO Q-PJ9).**
- **Which fields:** each flow-amount input on the scenario screen gets a native Monthly / Yearly select, default Monthly. These are the people's wages, which are stored yearly, so the column reads `Wages` on this screen and `Wages (yearly)` on the main page. Off the scenario screen the input renders exactly as before.
- **Calculations:** a Yearly value is divided by 12 before it feeds them.

**Q-PJ9 (CFO, built, recommend accept).** The exact behaviour:
- **(a) Switching** converts only the displayed text, keeping its meaning (Monthly 500 ↔ Yearly 6,000.00). The stored value is untouched, so no total changes on a switch.
- **(b) Typing** in a period stores the exact converted amount, unrounded: Yearly 6,000 feeds 500 a month, and Yearly 1,000 feeds 83.333… a month, never 83.33.
- **(c) Display:** a converted value is shown rounded to cents with thousands separators (6,000.00, 83.33). The amount as typed stays as typed until the next switch.
- **(d) Blank and invalid text:** blank stays blank (it counts as 0, as on the main page). Invalid text (`12a`, `1e3`) stays as typed across a switch and shows the field's own error; it counts as 0 until fixed.
- **(e) Access:** the select is labelled `<field>, <person>: Monthly or Yearly`, works with the keyboard, is 44 px tall, and sits under the amount so both keep the cell's width at 390 and 1440.

**Q-PJ10 (not built, recommend leave).** Net assets (the scenario's starting value and the Overview's Starting net assets) and Equity to cover are balances, not flows, so they get no select.

**Q-PJ11 (not built, recommend leave).** % fields (bonus %, tax, share, growth, withdrawal, ROIC) are rates, so they get no select.

**Q-PJ12 (not built, recommend leave).** Expense lines already have both a Monthly and a Yearly input (the main page's pair; typing either sets the line's period), so no extra select is added. The alternative is one input plus the select, which would be a layout change from the main page.

57.14 **Monthly / Yearly on every income flow line; CFO decisions (dated 2026-10-22, CFO on PR #224).**
- **The ask:** every income flow line and every typed income or expense total on the scenario screen gets the select (57.13 behaviour).
- **Income flow lines on this screen:** the Income section's lines, one per person or other income (e.g. Brazil family income, Solium withdrawals, Partner contribution). The one amount on each line is `Wages`, which is stored yearly.
  - Every line has its own select, default Monthly, labelled `Wages, <line name>: Monthly or Yearly`.
  - Each line keeps its own choice. Yearly is ÷12 per line, a switch on any line leaves the totals unchanged, and displayed conversions are rounded to cents.
  - PFPJ-68 tests three lines; the 390 / 1440 sweep checks four (PFPJ-69).
- **Typed income / expense totals:** the screen has no such input. The typed `05` Update totals are read from the record and used by the Overview (57.3), but they are not editable on this page or the main page. If such an input is added later, it should take the same `PeriodInput`.
- **Unchanged:** balances (net assets, Starting net assets, Equity to cover) and % fields stay without a select. The main page is unchanged.

**CFO decisions, dated 2026-10-22:**
- Q-b (57.6), Q-PJ4, Q-PJ5, Q-PJ6, Q-PJ10, Q-PJ11 and Q-PJ12 are **accepted**.
- **Q-PJ7:** keep the stored-scenario save code (not removed; still not called by the page).
- **Q-PJ8:** don't touch (the main-page checkbox size stays as is).

57.15 **QA AO1–AO6 (added 2026-10-22; EL-confirmed; built in the same PR). Scenario screen only; the main page is unchanged.**
- **AO1:** no Account or Category select on any expense line in scenario mode. The rest of each line stays.
- **AO2:** the x axis has explicit ticks: always `Now` (month 0) first, then evenly spaced, at most 5 (`xTickIndexes`). Checked at 390 and 1440 for 12 / 36 / 60 / 120 months: `Now` is shown, with no overlap and no clipping.
- **AO3:** on scenario amount inputs, a comma is only a thousands separator (`badComma`, `parseScenarioAmount`).
  - `10,5` and `1.234,56` are refused with the field's own error, `Use a dot for decimals and commas only for thousands, for example 1,234.56.`
  - The text stays as typed and counts as blank (0) until fixed.
  - Applies to the line Monthly / Yearly amounts, Equity to cover, wages, Starting net assets, growth, and the scenario net-assets field (`Enter an amount…`).
  - The main page's `parseAmount` is unchanged: it still drops every comma there.
- **AO4:** scenario growth uses a signed parser (`parseGrowth`), so −50 is accepted and used. The bound is −50..+50 % a year (57.7 / AN9; it supersedes §55's −100..1000 for this screen). Out of bounds, or `-` alone, shows `Growth must be from -50 to 50 % a year here.` The main page's growth check is unchanged.
- **AO5:** info only, not touched; it goes to #222.
- **AO6:** the read-only line and the load error sit in `<aside aria-label="Scenario access">`, a landmark for axe `region`. A sweep at 390 / 1440 (Read) found no visible text outside a landmark.
- **Q-PJ13 (not built, recommend a follow-up):** with a negative growth on this screen, the Overview block's own Future line still reads growth with the main rule (negative → 0 %). The projection below uses the signed value. Alternative: the scenario feeds the signed growth to the Overview (a small change to `summarize`'s input).

57.12 **ACs:** `qa/CANONICAL-AC-PACK.md` section PFPJ (PFPJ-01..10, PFPJ-20..22, PFPJ-30..37, PFPJ-40..57, PFPJ-60..78). The #215 ACs PFSC-04..11 and PFSC-17..23 (levers, `Save scenario` UI) are superseded by this section; PFSC-12..16 (the stored value and its route) still hold.

## 58. Personal Finance: scenario screen full validation run (#222, Diego / CFO; added 2026-10-22; fixes built in the same PR)

58.0 **Brief.** Issue #222 and its four comments. Diego's two overriding points (2026-10-22, via CoS):
- **(1) Sandbox:** every "net-assets save path" check becomes a zero-writes check (no PUT / POST / DELETE, one GET).
- **(2) Monthly / Yearly:** the select sits on the income lines (57.14). Also check the AO5 "Net assets now" as-of basis: what it is based on, and how that is labelled.

Not touched: Q-PJ13 / AP2 (negative growth on the Overview Future line), AN8, and the stored scenario.v1 save code (Q-PJ7).

58.1 **e2e (built).** `qa/tools/pf-scenario-e2e.mjs` runs on a preview (it refuses production) at 390 × 844 and 1440 × 900, as owner, CFO Read and no grant, plus signed out. It is read-only; accounts come from env and are never logged. It checks:
- **Layout:** the main page's sections; no category or account filter, month control, Save, or Account / Category select; title and basis.
- **Seeding:** net assets is seeded, with its stated basis.
- **Scenario column:** equals the screen's own Overview `This month`.
- **Chart:** `Now` is the first tick with `horizon + 1` points on every horizon.
- **Monthly / Yearly:** on every income line, default Monthly. A switch shows ×12 and keeps the totals; Yearly 12,000 = Monthly 1,000.
- **CFO cases A / B / C** on the live page at 9 %: the first expense line is set so the month's surplus hits the case.
- **No `Not saved.`** after a field error plus a toggle.
- **Zero writes:** no PUT / POST / PATCH / DELETE and one GET of the record; the record is byte-for-byte unchanged after the edits and after a reload; the reload shows the seed again.
- **Read:** the read-only line is in its landmark.
- **No horizontal overflow.**
- **No grant:** the 403 page and a 403 from the API. **Signed out:** 307 to sign-in with `next`.
- **Main-page regression (owner and Read):** `/personal-finance`, `/charts` and `/history` answer 200 and write nothing; the Overview shows; there is no Monthly / Yearly select there; the reports list answers; the first report exports as PDF and PNG.

An empty record (a fresh preview database) shows the empty state first. The data checks then run on lines typed in the sandbox itself (a Read user may type there; nothing is sent).

58.2 **Math audit (built, passing).** At 9 % a year over 12 months, on the shared step (`projectNet`) and on the screen's `project` (cents):
- **A:** 10,000 and +500 give **17,143.65**.
- **B:** 0 and −1,460 give exactly **−17,520**.
- **C:** −2,000 and +500 give **4,102.37** ±0.01.

These are also run on the live page (58.1).

58.3 **AO5: the basis of "Net assets now" (built).** The seeded value is the Overview's own net assets at the end of the current month (`summarize`, spec 42). It is correct, but the basis was not stated: the hint said only "Starts from the Overview's X". It is now stated under the field (`netBasis`, `pf-scenario-net-basis`):
- **As-of month A:** `Basis: Starting net assets S at the start of <A> (the as-of month), plus each month's surplus to the end of <current month>.`
- **No as-of month:** `Basis: no as-of month is set, so Starting net assets S counts from the start of <first month of the Overview's 12-month window> (the Overview's 12-month window), plus each month's surplus to the end of <current month>; a month without figures counts the 12-month average.`
- **No Overview figure (F2):** `Basis: the Overview has no net-assets figure yet (it needs income and expenses for its months), so this starts at 0.00.` This replaces the old misleading "Starts from the Overview's 0.00".

QA's AO5 numbers (153,245.33 here, 107,704 on `/series`) are the two bases differing when no as-of month is set: `/series` starts at `net_assets_from` and adds nothing for an empty month. See Q-SV2.

58.4 **Findings and fixes.**
- **F1 (fixed):** on the scenario screen, a field error plus a section toggle showed `Not saved.` This is wrong on a sandbox, where nothing is ever saved. The scenario no longer sets it, and the save-status line is hidden there. The main page is unchanged (PF-142).
- **F2 (fixed):** the misleading "Starts from the Overview's 0.00" when the Overview has no figure (58.3).
- **F3 (fixed):** the as-of basis was not stated (AO5, 58.3).
- **F4 (not a defect):** the preview's owner record is empty, so the live seeding values cannot be compared there. Seeding from the latest month, net assets included, is pinned by the DOM tests (PFPJ-07 / PFPJ-30 / PFSV-35).

58.5 **Questions.**
- **Q-SV1 (not built, recommend: EL provides the owner's QA password in the run env):** the owner role of the e2e is SKIPPED here because no owner password is available on the runner. The CFO Read, no-grant and signed-out runs ran. The owner path differs from Read only in access (the same sandbox, no writes), and the DOM tests cover it.
- **Q-SV2 (not built, recommend: the CFO sets an as-of month, or a ticket aligns `/series` and the Overview when none is set):** with no as-of month, the Overview counts Starting net assets from its 12-month window and averages empty months, while `/series` starts at `net_assets_from` and adds nothing for an empty month. The screen now states its basis, so the difference is visible, not hidden.
- **Q-SV3 (not built, recommend leave):** the main page's Overview shows no "Net assets now" figure or basis line of its own (it shows the chart). Stating it there is a main-page change, out of scope here.

58.6 **ACs:** `qa/CANONICAL-AC-PACK.md` section PFSV (PFSV-01..PFSV-40).

## 59. Personal Finance: future months on the main page (open / edit, copy from the previous month, Reset) (#229, HIGH, Diego / CFO; added 2026-10-22; built in the same PR)

Dated note 2026-10-22 (#229): main PF page only. The scenario screen, the PJ7 `scenario.v1` save code, AN8 and #223/#225/#226/#228 are untouched. No new table, migration, env or dependency: a future month is one more key in the existing `orpheus.finance.months.v1` value (the server already stores any month key; `checkRecord` is unchanged).

### 59.1 Opening a future month
- The Month / Year control opens any month from `FIRST_MONTH` (2020-01) up to the **last open month** = current household month + 12 (`FUTURE_MONTHS`, `lastOpenMonth`; October 2026 → October 2027). The Year select runs from the last open month's year down to 2020; Month options after the last open month are disabled; a choice past it opens the last open month (`chosenMonth`). This supersedes #163 Q-Y1/Q-Y2's "no future month".
- Leaving a month with unsaved changes still asks `Discard unsaved changes?` (#163 Q-Y8).

### 59.2 Empty future month: a copy of the latest saved previous month
- A future month with no saved lines opens with an **unsaved** copy of the latest month BEFORE it that has saved lines (`copySourceFor` = `latestWithLines(months, previousMonth(key))`): this may be a past month, the current month (if saved) or an earlier saved future month. The note reads `Copied from <Month YYYY> — edit and save.`, Save shows, nothing is stored until Save (decision 2). Names deleted on or before the month are left out (#165 Q-Z7, `withoutDeletedFor`).
- Nothing saved before it: the month opens blank.
- An empty PAST month still opens blank with `Copy from current month` (#163, unchanged); that button is never shown on a future month.

### 59.3 Saved future month: its own values
- Once saved, a future month opens with its own lines (`copiedFrom` null) and never refreshes from earlier months, whatever later changes they get.

### 59.4 Reset
- A SAVED future month with a saved month before it shows `Reset` (writers only) in the copy line's reserved slot (no layout shift). Click → `Reset this month to <Month YYYY>'s values? This replaces what is saved for this month.` Cancel: nothing changes. OK: the shown month's lines become the copy (deleted names left out) and are **saved at once** through the normal Save path (field check, one PUT; on failure `Not saved.` as Save). Shared values (accounts, categories, rates, household) are saved as Save would.
- Not shown on the current month, a past month, an empty future month or a read-only page. **Q-FM5 (built, recommend keep):** Reset saves immediately rather than leaving an unsaved copy, because the confirmation is already the explicit act; alternative: put the copy on screen as unsaved.

### 59.5 #199 unsaved current-month copy (`savedOverviewFigures`)
- The empty current month's copy (decision 5 / #166 / #199) now also comes only from months BEFORE the current one (`openMonth` uses `copySourceFor`). Before #229 it took the latest month with lines overall, which with saved future months would have been a plan month. So a saved future month never feeds the current month's Overview, /series, /chart or export figures. With no saved future months the result is identical to before.

### 59.6 Charts, history, exports and Overview (CFO Q-items)
- **Q-FM1 (built, recommend accept):** how far ahead: 12 months past the current one.
- **Q-FM2 (built, recommend accept):** charts (/series, /chart) and the saved-report export stay current-month-bounded: presets end at the current month, a custom range can't end after it (existing 400), and `all` never starts after it (a record whose only data is future gives the current month alone). Saved future months are plans and are not plotted. Showing them as a dashed "plan" segment is a later ticket on Diego's yes (not built).
- **Q-FM3 (built, recommend accept):** History lists stored months up to the current month only (`storedMonths(record, through)`); future years do not appear in its Year select. Alternative (not built): a separate "Planned" grid.
- **Q-FM4 (no change needed, recommend accept):** Overview's This month / 3- and 12-month averages / Future projection are built from `lastTwelve` (ending at the current month), so future months never count. Opening a future month shows the same Overview as the current month.
- **Q-FM6 (not built, recommend later ticket):** when a month that was "future" becomes the current or a past month it simply keeps its saved lines (no conversion step); a "planned vs actual" view is out of scope.

### 59.7 Roles
- Read users (CFO grant, #197) can open future months (copy shown read-only, as decision 5) but get no Save and no Reset; the API refuses their PUT (write needed, unchanged). No grant: the page and API give 403 (unchanged).

## 60. Personal Finance: saved scenarios (save, reopen, compare, delete) (#223, HIGH, Diego / CFO; added 2026-10-22; built in the same PR)

Dated note 2026-10-22 (#223): scenario screen only. It replaces the named-scenario part of SC9 (#215); SC9's one-off events and BRL debt stay unfiled and untouched. Not touched: AN8, #225/#226/#228/#231, the main page. No new table, migration, env or dependency.

### 60.1 Storage (sandbox)
- Saved scenarios live in the existing record value `orpheus.finance.scenario.v1` as an optional `saved` list (PJ7 value extended, same key). A levers-only value is stored byte-for-byte as before.
- Each entry has `id`, `name`, `savedAt`, `basis` (the latest month it was seeded from), `inputs` (net assets now, income, expenses, growth, rate, as used by the projection), `values` (the screen's page value texts: expenses, income, rates, household, Overview) and `lines` (the shown month's lines).
- Server check: the whole scenario value must read (`asScenario` → `asSaved`), otherwise 400 `{ field: "scenario" }`, never clamped.
- Writes: only `Save scenario` and `Delete`. Each does a fresh GET, then ONE PUT of that fresh record with ONLY the scenario value replaced. No other record value can change, so saved scenarios never touch the main PF data (proved by tests PFSS-40). Nothing else on the screen sends anything (#221/#222 unchanged).

### 60.2 Save
- Writers only. The `Scenario name` field and the `Save scenario` button. It saves what the screen shows now. If a field (net assets, growth) is in error, it says `Fix the fields in error first.` and sends nothing.

### 60.3 Reopen
- `Open` on a saved scenario rebuilds the screen in memory from the record already loaded, with the saved values over it. No GET, no write. `Back to the latest month` returns to the seeded screen. Edits after reopening are what-ifs as usual (sending nothing) until saved under a new name.

### 60.4 Compare
- A `Compare <name>` checkbox on each saved scenario, up to 3. The Compare table shows `This screen` plus the picked scenarios, at the horizon chosen above: net income, expenses and surplus a month, net assets now, net assets after the horizon, and growth earned. Below it, a chart with one net-assets line per column. Saved scenarios are compared on their saved inputs.

### 60.5 Delete
- Writers only. `Delete the scenario "<name>"? This cannot be undone.` Cancel does nothing. OK removes only that entry (one PUT, scenario value only). Deleting the reopened scenario returns to the latest month.

### 60.6 CFO Q-items
- **Q-SS1 Compare UX (built, recommend accept):** up to 3 saved scenarios beside the screen; the figures as in 60.4; one net-assets chart. Alternative: overlaid income/expenses lines (not built).
- **Q-SS2 Naming (built, recommend accept):** trimmed, 1 to 60 characters, unique ignoring case; a duplicate is refused (`A scenario with this name already exists. Pick another name, or delete the old one first.`). Overwrite-on-save is not built.
- **Q-SS3 Max (built, recommend accept):** 20 saved scenarios (`You can keep up to 20 scenarios. Delete one first.`). The record's 1 MB cap still applies.
- **Q-SS4 Latest month changed (built, recommend accept):** a reopened scenario shows its saved values on the CURRENT latest month, with `Saved from <Month>. The latest month is now <Month>: …`; earlier months come from the latest data. Compare uses the saved inputs as saved. Re-basing a saved scenario onto new data is not built.
- **Q-SS5 Read users (built, recommend accept):** Read (#197) can see the list, Open and Compare (no write involved); no Save and no Delete (hidden, and the server answers 403 to their PUT). No grant: 403 on GET and PUT (unchanged).
- **Q-SS6 Rename / update in place (not built, recommend a later ticket):** for now, save under a new name and delete the old one.
- **Q-SS7 PJ7 `saveScenario` (not built, recommend remove in a later cleanup):** it is kept unchanged and still has no caller. If it were ever called, it would write a levers-only value and drop `saved`.

## 61. Harness checks and follow-ups (#208, LOW, Diego / CFO; added 2026-10-22; built in the same PR)

61.1 **Test list check.** `scripts/test-list.test.mjs` runs in the `scripts/**/*.test.mjs` step of `npm test`. It globs `src/**/*.test.{ts,tsx,mts,mjs}` and fails, naming the files, when a file is neither in the explicit `npm test` list nor a `*.dom.test.tsx` (found by `scripts/run-dom-tests.mjs`). It also fails when a listed `src/` file does not exist. No new dependency.

61.2 **qa/tools check (deferred from #219).** `scripts/qa-tools-harness.test.mjs` fails when a `qa/tools/*.mjs` file is neither a guarded tool (`GUARDED` in `scripts/qa-prod-guard.test.mjs`) nor in its pinned `UNGUARDED` list (shared helpers and tools that never sign in or write). So a new QA tool is classified before it lands. It also runs `node qa/tools/pf-scenario-e2e.mjs --help` under `scripts/fixtures/fake-net.mjs` and expects exit 0, a usage line and zero requests.

61.3 **roles.mjs (AL3).** The scenario save checks (PFSC-15 / -16 / -13 / -03) run while the CFO still has the Read grant they were seeded with, before the Read-and-write flip (ROLE-11). A no-grant check is added: PUT of a scenario value → 403 with nothing stored, and `/personal-finance/scenario` → 403.

61.4 **Read wording for the copy note (AR1).** On a month that has nothing saved, a Read user sees `Showing <Month>'s lines — nothing is saved for this month.` instead of `Copied from <Month> — edit and save.`. Users with write keep the old note.

61.5 **One writer for scenario.v1 (SS7).** The unused PJ7 `saveScenario` is removed. Only `changeSaved` (the #223 save / delete path) calls `withScenario`, and no other src file names the scenario key or builds a value for it.

61.6 **Saved start in cents (AS1).** `addSaved` stores `inputs.start` rounded to cents. The display is unchanged.

61.7 **Spec 55.4 (AL1) and PFCC-10 (AM1)** are reworded only. No behaviour change.

61.8 **Out of scope:** no table, migration, env, dependency or schema change. #225, #226, #228, #231, #233, AN8 and #210 are untouched.

## 62. Personal Finance: person checkboxes meet the 44 px tap target (#225, PJ8, MEDIUM, Diego / CFO; added 2026-10-22; built in the same PR)

(2026-10-22 note: this supersedes Q-PJ8 in 57.14 ("don't touch"), on Diego's yes for #225. The text above is left as written.)

62.1 **Scope.** The person checkboxes are Count wages, Count bonus and Foreign (`pf-person-count-wages`, `pf-person-count-bonus`, `pf-person-foreign`). They appear on the main PF page and on the scenario screen, which uses the same income block. Each must give a tap target of at least 44 × 44 CSS px at 390 and 1440 wide.

62.2 **Target.** The target is the wrapping `label.pf-check`. It is 2.75rem × 2.75rem (44 px at the 16 px root), and a tap anywhere on it toggles the box. The visible box stays 1.25rem (20 px), and its colour and position are unchanged.

62.3 **Measured (2026-10-22, before the change, local real browser).** On both screens, at 390 (touch) and 1440, the label was already 44 × 44 and every probe point on it hit the label or the box (484/484). That held for owner and Read, and with Foreign on and off. QA's F3 (#224) measured the 20 px box itself. #225 pins the 44 px so it can't regress: `.pf-check` gets `flex: none`, `min-width: 2.75rem` and `min-height: 2.75rem`. Nothing visible changes.

62.4 **No behaviour change.** No new dependency, table, migration or env. The saved-scenario Compare checkbox (`pf-saved-compare`, #223) is not a person checkbox and is out of scope (Q-TT1).


## 63. Personal Finance: scenario Overview 'Future' uses the chart's growth, negative included (#226, Q-PJ13 + AP2, MEDIUM, Diego / CFO; added 2026-10-22; built in the same PR)

(2026-10-22 note: this builds Q-PJ13 (57, "not built") and the AP2 finding from QA on #221 / PR #224. The text above is left as written.)

63.1 **Scope.** Only the scenario screen (`/personal-finance/scenario`). The main PF page is unchanged.

63.2 **Future growth.** The Overview block's Future line on the scenario screen uses the same annual growth as the projection chart below it: the signed value from the Growth field, -50..+50 % a year; a refused value counts 0 %, as for the chart. It compounds monthly at r_m = (1 + annual ÷ 100)^(1/12) − 1 with the shared step (`projection.ts`), so a negative growth shrinks a positive balance month by month (10,000 at -10 % with surplus 0 → 9,000 after 12 months). The positive-only Overview clamp (negative → 0 %) no longer applies to this figure on this screen.

63.3 **SC3 kept for both.** Growth applies only to a positive opening balance (#215 Q-SC3 as changed, 55.11), on the chart and on the Overview Future line alike. A negative growth RATE is allowed on both on this screen; a balance at or below 0 never grows or shrinks by growth (Q-FG1).

63.4 **One growth error (AP2).** On the scenario screen, a refused Growth (for example `-`, `-51`, `abc`) shows one error: the screen's `Growth must be from -50 to 50 % a year here.` alert. The field no longer also shows the main page's `Enter a number, 0 or more.`. It is still `aria-invalid`. The main page's growth error is unchanged.

63.5 **No behaviour change elsewhere.** Nothing new is stored or sent. No new dependency, table, migration, env or schema change. The 9 % pinned cases still hold.

## 64. Personal Finance: 'Net assets now' is the same everywhere (#228, Q-SV2 / AO5 + AQ1, MEDIUM, Diego / CFO; added 2026-10-22; built in the same PR)

(2026-10-22 note: on Diego's yes (issue #228), this supersedes the net-assets rule of 15.2 / Q21 ("empty months use the average"), and of spec 42 and 44.3, where they say Starting net assets sits at the start of the Overview's 12-month window when no as-of month is set. It also supersedes the 58.3 basis sentences and Q-SV2 (58, "not built"). The text above is left as written. The flows (expenses, income), the 12-month and 3-month averages and the Future rules are unchanged.)

64.1 **Rule (CFO).** 'Net assets now' is the manually entered net assets, everywhere: the Overview on the main page, the Overview and the seeded "Net assets now" on the scenario screen, and `/series` (and so `/chart` and exports, which read it). The only manually entered net-assets figure the record holds is Starting net assets with its optional as-of month (spec 42), so:
- the value sits at the start of the as-of month;
- with no as-of month, it sits at the start of the first month with figures (the `/series` anchor, Q-AA10);
- with no month with figures either, a typed Starting net assets is the value now (AQ1);
- each month then adds its OWN surplus (income − expenses), and a month without one adds nothing.
The Q-AG1 back-fill before the as-of month is kept, as on `/series`.

64.2 **What changed.** The Overview used to start at its 12-month window, and an empty month in the window added the 12-month average surplus. QA's AO5 numbers (153,245.33 against 107,704) came from those averaged empty months. Now the Overview's net-assets points equal `/series` month for month. `/series` itself is unchanged.

64.3 **Future.** The projection steps from the aligned value at the end of the current month (spec 57 / 63 unchanged). An empty current month adds nothing, as on `/series`.

64.4 **Basis line (scenario screen).** The #222 basis line stays, and its sentences now state this rule:
- With an as-of month: `Basis: Starting net assets X at the start of <Month> (the as-of month), plus each month's own surplus to the end of <Month>; a month without figures adds nothing (the same as /series).`
- With no as-of month: `Basis: no as-of month is set, so Starting net assets X counts from the start of <Month> (the first month with figures), plus …` (the same ending).
- With no figures at all: `Basis: Starting net assets X as entered; no month has figures yet.`
The no-figure sentence `NET_BASIS_NONE` is unchanged.

64.5 **AQ1.** When a Starting net assets is saved (not 0) and no month is saved (no copy either), the scenario banner reads `No months saved yet: income and expenses start at 0; net assets start at your Starting net assets (85,000.00).` It no longer says `Nothing saved yet: every figure starts at 0.`, which stays for a record with nothing typed.

64.6 **Limits.** No dependency, table, migration, env, provider, secret, schema or wire change. Nothing new is stored or sent. See the PR's Q-NA items for the known small differences that remain (unsaved edits on the main page; historical FX).

## 65. Personal Finance: planned vs actual for months (#231, FM6, MEDIUM, Diego / CFO; added 2026-10-22; built in the same PR)

(2026-10-22 note: adds to spec 59 (#229, future months). PR #230's Q-FM6 ("no planned-vs-actual view") is answered here. The text above is left as written.)

65.1 **Storage (Diego, Option A).** A new record name, `orpheus.finance.plans.v1`, in the existing `personal_finance` row. There is no new table, column, migration, env or dependency.
- Shape: `{ "<yyyy-mm>": { "lines": { fixed, variable, people }, "capturedAt": "<ISO time>" } }`.
- The lines have the same shape as a month in `orpheus.finance.months.v1`.
- Totals are derived (spec 19 / decision 7 helpers); nothing derived is stored.

65.2 **Writing the plan (CFO Q1: the plan freezes at the last save before the month starts).**
- Every Save on the page sets the plan of every saved FUTURE month to its saved lines.
- An unchanged month keeps its capture time.
- A current or past month's plan is never written by the page.
- **Backfill:** on first load, a writer's page copies every saved future month that has no plan yet into the plans. It is saved with the page's load-time save. There is no SQL and no server job.
- A future month that is emptied, or not stored, keeps its plan (Q5).
- Months that were future but became current before this shipped have no plan.

65.3 **Server merge (Diego, fix (2)).** Every record write (owner PUT, non-owner write PUT, the view route) merges plans by month. The month is the server's household month, the same convention as the app (spec 16 N1).
- A current or past month always keeps the stored plan; the incoming one is ignored, even when none is stored.
- A future month in the body replaces the stored one.
- A future month left out of the body keeps the stored one.
- A body without plans keeps them all, so a tab opened before a plan was written, or a bundle from before this change, can't drop it.
- A plan is never removed (Q5).
- The owner's DELETE still wipes the whole record, plans included.
- The PUT reply carries the record as stored.

65.4 **The view (CFO Q2..Q4).** In the month view, a current or past month with a plan shows a read-only **Planned vs actual** table:
- **Rows:** Expenses, Income and Surplus totals, then one row per line. Expense lines match by line id; income lines are each person's Wages and Bonus. A line on one side only counts 0 on the other.
- **Columns:** Planned, Actual, Difference (actual − planned), % of plan (difference ÷ planned; `—` when planned is 0), Direction.
- **Direction:** `Over plan` / `Under plan` / `On plan`, followed by `worse than plan`, `better than plan` or `as planned`. Expenses over plan, income under plan and surplus under plan read as worse.
- **Actual** is the month's saved lines.
- **Note:** "Planned = this month's lines as last saved before it started (<capture date>)…".
- **Read users (#197)** see the same table, view only (Q3).
- **Not shown** for a future month or a month without a plan. The scenario sandbox shows no table and writes no plan.

65.5 **Out of scope.** Clearing a plan (Q5). Two tabs overwriting each other's OTHER record values is a separate ticket. No chart, export or `/series` change.

65.6 (2026-10-22 note, #231 PV4, added on QA's Q-PV4): `capturedAt` is still stored as a UTC ISO time. The Planned vs actual note now shows it in Eastern time with an explicit zone (`America/Toronto`), as `yyyy-mm-dd hh:mm ET` (24 h), for example `(2026-09-30 08:00 ET)`. It shows the same on every device and in every server time zone. An unreadable capture time falls back to the month's name. This replaces the "capture date" wording in 65.4, which is left as written.
