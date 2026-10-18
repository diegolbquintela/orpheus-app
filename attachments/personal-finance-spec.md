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
