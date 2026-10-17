# Orpheus Wisdom: home, DCA calculator and dashboard

This is the Orpheus web app (Orpheus Wisdom). Over time it is meant to become the firm's operating front.
It is one site with three routes (#46):

| Route | What |
|---|---|
| `/` | Home (#69): the Jordaens hero with "Investment driven by research.", then **Platforms**: **Calculator** ("Dollar-cost average calculator.") and **Dashboard** ("The portfolio as a business: fundamentals for each name, and the whole."), each with an `Open` link. It does no calculating |
| `/calculator` | The DCA vs lump-sum calculator (below). It lived at `/` until #46; `/` with a query string redirects here with the same query |
| `/dashboard` | The signed-in dashboard, behind the `DASHBOARD_ENABLED` flag (see "Dashboard" below) |

Every page has the same menu, a thin bar that stays at the top: "Orpheus" (home) on the left, "Calculator" and
"Dashboard" on the right, the current page marked (`aria-current="page"` plus an underline), no dropdowns. The
Dashboard item shows even when the flag is off. The footer reads "Orpheus Wisdom" and nothing else. Every page is
`noindex` (meta tag plus the `X-Robots-Tag` header).

**Analytics.** Vercel Web Analytics (`@vercel/analytics`, mounted once in `src/routes/__root.tsx`) collects
anonymous page views only: the page path with query strings stripped, no cookies, no custom events, no
emails, tickers or holdings. Why: to see which tools get used. There are no other trackers. The calculator's saved
searches (#80) stay in this browser's `localStorage` and are never sent anywhere. Code: `src/lib/site/site.ts`, `src/components/site-menu.tsx`,
`site-footer.tsx`, `home.tsx`, `src/routes/__root.tsx`.

**The calculator.** You pick tickers and weights, a date range, a starting capital, a contribution and a frequency (weekly
or monthly). The app compares two cash plans over the same window:

- **Lump sum**: the starting capital goes in on day one.
- **DCA**: the contribution goes in as new cash on each scheduled date.

It shows, for each plan, four lines (Final value, Total invested, Return (%), CAGR (%); #78), plus one chart of
the DCA portfolio value (#70).
Prices come from Yahoo's daily chart data through a same-origin server route.

- Production: https://orpheus-app-beta.vercel.app
- Spec: [`attachments/dca-app-spec.md`](attachments/dca-app-spec.md)
- Harness for bots: [`AGENTS.md`](AGENTS.md)

## The six DCA rules

These are the rules the app implements and QA checks (acceptance criteria DCA-01 to DCA-06):

1. **Dividends reinvested.** Each dividend buys more of the name that paid it, at that day's close.
2. **DCA = contribution added on each date, contributions only.** On each weekly or monthly date the
   contribution goes in as new cash. The DCA plan does not use the starting capital.
3. **Lump sum deploys the starting capital on day one**: on the first session where every name has a price.
4. **Basket of several tickers with weights.** Weights that don't sum to 100 are scaled, and the result
   says so.
5. **US/EU/CA listings only, one currency per basket.** Other venues are refused with
   `X lists on Y. US, EU, and CA listings only.` (BSE gets its own message:
   `… BSE and other non US/EU/CA venues are not supported.`) Mixed currencies are refused. There is no
   FX conversion.
6. **No buy/sell advice.** The app never outputs a buy, sell or hold recommendation.

The engine is in `src/lib/dca/` (`simulate.ts`, `calendar.ts`, `raw.ts`). The UI is
`src/components/desk.tsx` (route `src/routes/calculator.tsx`), and the price route is `src/routes/api/chart.ts` → `src/lib/dca/yahoo.server.ts`.

## Run it locally

You need Node 22 (≥ 22.12) and npm.

```bash
npm ci
npm run dev          # http://localhost:8080 (home), http://localhost:8080/calculator
```

No database or secrets are needed to run the calculator locally. Sign-in needs `BETTER_AUTH_SECRET` and a database;
without them it answers "unavailable". `VITE_AUTH_ENABLED` comes from the environment only (Vercel sets it per
environment; since #51 there is no `.grok/app-env.json`); export `VITE_AUTH_ENABLED=false` to turn auth off locally.

## Tests and checks

```bash
npm run typecheck
npm run lint
npm test             # unit tests + offline replay of the QA fixtures (no network)
npm run build
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, typecheck, lint, test and build on every pull request
and on every push to `main`.

**QA fixtures**
- [`qa/fixtures.json`](qa/fixtures.json) holds the cases for DCA-01..06, built from real Yahoo data.
  Its schema and cases are documented in [`qa/README.md`](qa/README.md).
- `qa/snapshots/` holds the raw price, dividend and split data. `qa/HAND-CHECK.md` holds an
  independent recomputation.

```bash
npm run fixtures:build        # rebuild qa/fixtures.json offline from qa/snapshots
npm run fixtures:hand-check   # independent arithmetic check, prints "hand check: MATCH"
```

**QA run logs and AC pack.** QA's pass/fail run logs live in [`qa/runs/`](qa/runs/) as
`YYYY-MM-DD-<label>.md`, with small JSON/text evidence in a folder of the same name. Screenshots and large
raw dumps are not committed. The canonical acceptance-criteria pack is
[`qa/CANONICAL-AC-PACK.md`](qa/CANONICAL-AC-PACK.md). Policy: [`qa/README.md`](qa/README.md).

**QA tools.** [`qa/tools/`](qa/tools/README.md) holds QA's Playwright scripts and a Python price fetcher.
Each takes the app URL as `--base-url` or `QA_BASE_URL` (default: production), so they run against a PR
preview or production:

```bash
npx playwright install chromium                 # once
node qa/tools/full.mjs --base-url https://<preview>.vercel.app   # opens /calculator (--calculator-path / for older deploys)
node qa/tools/site.mjs --base-url https://<preview>.vercel.app   # menu, home Platforms links, footer, $313,000 and VOD.L at /calculator
python3 qa/tools/fetch.py --base-url https://<preview>.vercel.app --out /tmp/orpheus-fetch
```

## Deploy

The app is hosted on Vercel.

- `main` deploys automatically to production: https://orpheus-app-beta.vercel.app.
- Every pull request gets its own public preview URL, which vercel[bot] posts as a comment on the PR.
- Vercel is the only deploy path. Deploying through Grok has stopped. The old Grok copy at
  https://island-pearl-eagle-hill.grok.me stays published as a frozen old copy until the Chief of Staff
  confirms its retirement with Diego. It is not production and does not get updates.

## Site style: dark, mobile first (epic #66, tickets #67–#73)

Re-scoped 2026-10-05 21:26 ET (Diego via CoS and EL): **dark mode wins.** A white style was proposed the same
evening and dropped; nothing white gets merged. The #53 dark style stands and is extended: a charcoal shell on
every page (#68), the calculator with a Botticelli hero, underline fields, one green chart line and
label-value results, phone layout included (#70), home with the Jordaens hero (#69), sign-in (#73) and the
regression pass on the shipped pages (#72). The dashboard's content is on
hold (#71); on `/dashboard` only the shared bar and footer change. Spec and ST rows:
[`attachments/site-style-spec.md`](attachments/site-style-spec.md); QA: [`qa/CANONICAL-AC-PACK.md`](qa/CANONICAL-AC-PACK.md).

**Landed: the dark shell (#68).** Every page now has the charcoal bar (Orpheus on the left, Calculator and
Dashboard on the right, the current page off-white and underlined) and a charcoal footer reading "Orpheus
Wisdom". Home, the calculator, sign-in and the 404 sit on a charcoal page with off-white type; their content is
otherwise unchanged until its own ticket (the calculator, sign-in and home cards keep their white panels for
now). On `/dashboard` only the bar and footer changed. QA: `qa/tools/site-shell.mjs` at 360, 400, 1024 and
1440 px.

**Landed: the calculator page (#70).** `/calculator` has no white panel left: a Botticelli band (*The Birth of
Venus*, public domain; source and licence in [`public/hero/calculator-SOURCE.md`](public/hero/calculator-SOURCE.md))
with `01` and "Dollar-cost average calculator." lower left on a soft wash; underline-only fields with their own
class; the listings note as one line under the form; one chart with one series (the DCA portfolio value: green
line, soft green fill, the last value in a green pill); the results as label-value rows (each metric's label as a
caption, then `Lump sum` and `DCA`, two columns while each is at least 150 px wide; a date in a value, as in
`Max drop`, on its own muted line); captions `Dividends reinvested.`, the method sentence ("Prices are raw daily
closes. …") and the run-specific lines. Dark pages set `color-scheme: dark` on `<html>`, and selects carry the
dark colours, so native lists and date pickers open dark. The hero text has a fixed-size box and the web font a
size-adjusted local fallback, so nothing in the hero moves when the font loads (self-hosted fonts are planned
in #72). Phone rules below 1024 px (fields stack, short band), the wide layout
(form left, results right) from 1024 px. The calculator logic is unchanged ($313,000). QA:
`qa/tools/calculator-page.mjs` at 360, 400, 1024 and 1440 px.

**Landed: home (#69).** `/` has no white panel left: a Jordaens band (*Triumph of Frederick Henry, Prince of
Orange*, 1652, public domain; source and licence in [`public/hero/home-SOURCE.md`](public/hero/home-SOURCE.md))
with `01` and "Investment driven by research." lower left on a soft wash, left of the prince and his horses at
every width; then `02` Platforms with three lines (since #97), Calculator, Dashboard and Personal finance, each
with an `Open` link. The #46 line
and the two cards are gone. Phone rules below 1024 px (a 3:2 crop of the painting), the wide crop from 1024 px.
`/?query` still redirects to `/calculator?query`. QA: `qa/tools/home-page.mjs` at 360, 400, 1024 and 1440 px.

**Landed: sign-in (#73).** `/dashboard/sign-in` has no white panel left: the heading, `Email` and `Password`
as underline-only fields, a chalk `Sign in` button and a `Create an account` link (it switches to create-account
mode in place, with a `Sign in` link back), on the charcoal page with its own classes (`.signin*`; the dashboard's
`.field` and `.kicker` are unchanged). The invite-only note is gone; errors show in `#ff8f87`; autofilled fields
stay dark. The sign-in logic is unchanged. QA: `qa/tools/signin-page.mjs` at 360, 400, 1024 and 1440 px.

**Landed: calculator polish (#78).** The results are two columns, Lump sum and DCA, with exactly four lines each:
Final value, Total invested, Return (%) and CAGR (%) (display only; the calculation is unchanged). The form
checks each field before reading prices and shows the message under the bad field without clearing anything:
amounts must be above 0, the start must be before the end; a ticker on another venue or in another currency is
marked under that ticker after the prices are read. Wide screens put Start, End, Starting capital, Contribution
and Frequency in one row with the results below. QA: `qa/tools/calculator-page.mjs` at 360, 400, 1024 and 1440 px.

**Landed: saved searches (#80).** A `Saved searches` button at the top of the calculator form (closed by default)
lists the last 5 searches you calculated, newest first (`PLTR, TQQQ · 2020-10-02 – 2026-10-01 · DCA $1,000`),
each with `Load` to fill the form. Every successful calculation is saved; there's no save button. A refresh fills
the last search again. No login: everything stays in this browser's `localStorage`
(`orpheus.calculator.last.v1`, `orpheus.calculator.saved.v1`), so another device sees nothing and clearing the
browser's site data clears it. QA: `qa/tools/saved-searches.mjs` at 360, 400, 1024 and 1440 px.

**Lyre mark (#84).** The bar's `Orpheus` link starts with a small lyre (an inline SVG, decorative), and
`/favicon.svg` is the same lyre; it replaces the old two-bar mark. The bar, its items and the footer are unchanged.

## Personal finance (#84 v1.1)

`/personal-finance` is a dark page in the same shell (spec: `attachments/personal-finance-spec.md`, PF-01..10;
business user: the CFO). Two groups of expenses, **Fixed** and **Variable**, with the columns Name, % of income,
% of expenses, Monthly, Yearly, Currency, FX rate (#87), Equity to cover and Account. Type Monthly or Yearly and the other converts (× 12 or
÷ 12); what you typed stays as typed. `% of expenses` is each line's (and group's) share of the monthly total of
both groups. `% of income` shows `—` until income exists (#85). `Equity to cover` is a number you type until #86
computes it. Account is a dropdown with `Add account…` (one shared list for both groups). Totals per group and for
both. Manual entry only. Before #102 everything stayed in this browser's `localStorage` (`orpheus.finance.expenses.v1`), with
no login; since #102 it is stored in your account (below). Amounts carry no currency symbol (kept by #87: the household currency is named once, by its field). The page is
first-class since #97: the bar's fourth item `Personal finance` (current here) and the third home line; the URL
still works. QA:
`qa/tools/personal-finance.mjs` at 360, 400, 1024 and 1440 px.

**Income (#85 v1.2).** Above the expenses, `02 Income` lists the household's people: Wages (yearly), Bonus rating
(% of wages), Average tax (%) and their Net (yearly) = (wages + bonus) × (1 − tax). Tick which incomes count
(`Count wages`, `Count bonus`) and each person's `Share (%)` (e.g. untick your own bonus, put your spouse at 80).
The `Income table` shows each counted line and the `Net income` biweekly (yearly ÷ 26), monthly and yearly, and
every expense line's `% of income` now divides its monthly amount by that net income a month (`—` while it is 0).
Stored in this browser only, in its own key `orpheus.finance.income.v1`. Landed in PR #89; EL accepted these readings
(bonus rating as a % of wages, one average tax and one share per person, biweekly = yearly ÷ 26).

**Equity cover (#86 v1.3).** At the top of `03 Expenses`, type a `Withdrawal rate (%)` and/or your `Portfolio ROIC
(%)`. The rate used is the withdrawal rate as typed (4 means 4%), or half the ROIC when no withdrawal rate is typed
(`Rate used` shows it). Each line's `Equity to cover` is then its yearly amount ÷ that rate: Rent 1,000 a month with
ROIC 8% → 12,000 ÷ 4% = 300,000. The calculated amount shows dimmed in the field; type a number to override it for
that line, clear it to go back (a badly typed one falls back to the calculated amount until it's a number).
Totals add each line's override or calculated amount; with no rate, a line without an override shows `—` and so does
its total. ROIC may be above 100%; the withdrawal rate is 0–100%. Stored in this browser only,
in `orpheus.finance.equity.v1`.

**Foreign currency (#87 v1.4).** Pick the `Household currency` at the top of the page (default CAD; income, totals,
percentages and equity cover are in it). An expense line can be in another `Currency` (e.g. BRL); type its `FX rate`
as household units per 1 unit of that currency (1 BRL = 0.2 CAD → `0.2`). The line's Monthly / Yearly stay in its
own currency as typed; everything computed from them uses the converted amount (Condo 2,000 BRL a month at 0.2 →
400 CAD in the totals; equity cover on 4,800 a year). A foreign line without a valid rate shows `Enter a number above
0.` and shows `—` in place of every converted figure and in any total that contains it (its own Monthly / Yearly
still show what you typed). No live rates: typed only. The household currency is stored in `orpheus.finance.currency.v1`;
each line's currency and rate in the expenses key (older lines read as household lines). Draft PR #100; EL decided Q12–Q16
(multiply by the rate, default CAD, `—` without a rate, no symbols, one rate per line).

**Sign-in, the account and foreign income (#102).** `/personal-finance` is now for signed-in users only: signed out,
it sends you to `/dashboard/sign-in?next=/personal-finance` and back after signing in (the same email/password sign-in
as the dashboard, invite-only sign-up; it needs `DASHBOARD_ENABLED=true`). Everything you type is saved to your
account (`personal_finance` table, `/api/personal-finance`) about half a second after you stop typing, so the same
account on another device shows the same figures; if a save fails, `Not saved.` shows under the title until the next
change saves. On your first signed-in visit, values this browser kept under the old keys are moved into the account.
**FX rates now read the other way round:** units of the foreign currency per 1 unit of the household currency
(`FX rate (BRL per 1 CAD)`: 1 CAD = 5 BRL → `5`; Condo 2,000 BRL ÷ 5 = 400 CAD). Rates saved the old way (`0.2`) are
converted once (→ `5`). Each person has a `Foreign` box: tick it, pick the `Currency`, type the `FX rate` and the
person's `Converted (yearly)` (their Net ÷ rate) is what the income table, `Net income`, `% of income` and the
Overview use (Brazilian Dividends 37,000 BRL at 3.70 → 10,000 CAD). No live rates. Q24–Q31 open for EL (spec section 9).

**Toggles, a cleaner income table, Update month and categories (#105).** Click the `Income`, `Expenses` or
`Overview` heading to fold that section away (and again to open it); which ones are closed is saved to your account,
so a refresh or another device shows the same. The income table now lists only incomes that are counted and not 0.
Under `05 Update`, press `Update month`, pick the month, type Expenses and Income and press `Save` (the 12-month
average and the chart update and the panel closes; `Cancel` or Escape leaves everything as it was). Each expense line
can have a `Category` (pick one or `Add category…`); `Filter by category` shows one category's lines, and `By category`
under `Total` gives each category's monthly / yearly subtotal. The filter and categories never change the totals.

**Overview and Update (#94).** Under `04 Overview`: this month against the 12-month average (Expenses, Income,
Surplus), a chart of the three lines Expenses, Income and Net assets, a typed `Starting net assets` and `Growth rate (%)`,
and a `Future` toggle (1, 5, 10 or 15 years) where net assets keep compounding at that rate with the average surplus
invested each month while expenses and income stay on the 12-month average. Under `05 Update`: pick one of the last 12
months (this one included) and type that month's Expenses and Income (e.g. June 2026 in October 2026); the average
updates at once. This month uses the page's own monthly totals until you type it; months you leave empty use the
average. Stored in `orpheus.finance.overview.v1`. Draft PR #101; EL accepted Q17–Q23 as built (net assets may go negative over time when expenses exceed income; the starting net assets field stays 0 or more).

**Landed: Personal Finance v1.1 and the lyre (#84, PR #88).** EL decisions: URL only; unitless amounts until #87;
after #86 a typed `Equity to cover` overrides the calculated amount for its line (the calculated amount is the
default when the field is empty); the builder's app icon (`__grok/icon-180.png`) is out of scope (since #50 replaced by the Orpheus icons).

**Landed: home + top bar for Personal Finance (#97).** The bar reads Orpheus | Calculator, Dashboard, Personal
finance (text only, the current item underlined; 12 px text below 640 px so all four fit at 360 px (#90: five items with `Account`, 11 px through 399 px); the word Orpheus kept, no sideways scroll; Q21, decided by EL). Home
`02` Platforms has three full-width lines: Calculator, Dashboard ("The portfolio as a business.", Q22, decided by EL) and Personal
finance ("Income, expenses, and the cover."). The finance page itself is unchanged.

## Dashboard (released, behind a flag)

A signed-in dashboard, built ticket by ticket (spec: `attachments/dashboard-spec.md`), gated by one
**server-only** env var, `DASHBOARD_ENABLED`. As of 2026-10-04 production serves it (issue #46; read-only smoke
check the same day).

### Redesign: mobile first (epic #53, tickets #54–#59)

The dashboard is being redesigned phone first (about 400 px), then wide screen. The target, the source of
truth for tickets 2–6, is **section 0 of [`attachments/dashboard-spec.md`](attachments/dashboard-spec.md)**;
QA's acceptance IDs are DR0–DR6 there and in [`qa/CANONICAL-AC-PACK.md`](qa/CANONICAL-AC-PACK.md).

**Landed so far: ticket 2 (#55).** `/dashboard` is now the holdings list: each row shows name, shares, value
in your base currency and share of the book; tap a row for average cost, last close, cost, return, the FX
rate, Edit and Delete. With no holdings it says `Add a holding`. The explanatory paragraph is gone. Under the
list: one total (value only), the pie, and at first the metric columns with their portfolio row (they became
chips in ticket 4). The other T04–T15 paragraphs below still describe the data; their table layout is gone.

**Ticket 3 (#56).** Adding a holding takes a ticker and shares; average cost is optional. The add form is one
compact row (Ticker, Shares, Avg cost marked optional, Add). A blank cost saves as "no cost" (stored as
`NULL`, not 0): the holding's average cost, cost and return stay blank until you enter a cost with Edit,
and Edit can clear it again. Its value and share of the book count as usual. The listing check is unchanged
(US, EU and Canada only). Schema: `migrations/0008_holdings_avg_cost_nullable.sql`.

**Ticket 4 (#57).** The metric columns are now chips on a metrics sheet. On a phone a `Holdings` | `Metrics`
switch shows one sheet at a time; from 1024 px the metrics sit to the right of the list. Type in `Add a
metric` to find a metric and add it as a chip; each chip's `×` removes it. New users start with Revenue
growth 1y, ROIC (1y) and Share of the book; accounts that had saved columns keep them; removing every chip
sticks. A missing figure shows `—`. Schema: `migrations/0009_metric_chips_saved.sql`. API: editing a holding
without an `avgCost` field keeps its cost; send `null` to clear it.

**Ticket 5 (#58).** The book: one total under the list (total value only), a donut of the same shares of
the book (largest first; past ten names the rest is one `Other` slice) replacing the pie, and a `Book` row
at the foot of the metrics sheet with each kept chip's figure weighted by market value over the holdings
that have one (a `—` is left out, not counted as zero), shown as e.g. `27.6% · 71% covered`; `—` when no
holding has a figure; Share of the book reads 100.0%. Also: a non-number average cost gets the number
message, and the phone's `Avg cost` label is part of the field's accessible name.

**Ticket 6 (#59).** The leave-outs are checked and kept out by tests: no Connect broker, no K/M/B, no
ownership toggle, no download or export, no instructions. Shares, average cost and last close now show
thousands separators too (`17,500`, `1,234.5 EUR`), with their decimals unchanged. QA runs the whole redesign
and site regression in one go with `qa/tools/dashboard-redesign.mjs` at 400, 1024 and 1440 px.

- **The holdings list is the page.** Each row: name, shares, value in base currency, share of the book. Tap
  a row for the rest (cost, last close, return, FX, edit, delete). No helper paragraphs. With no holdings
  the page says one line: `Add a holding`.
- **Add:** ticker and shares; average cost is optional and a blank cost saves. Cost and return stay blank
  until a cost is entered. Listing check unchanged: US, EU and Canada only.
- **Metrics:** a second sheet on a phone (`Holdings` | `Metrics`), on the right on wide screens. A search
  field adds a chip; each chip removes itself; rows show only the kept chips. Default chips: Revenue growth
  1y, ROIC (1y), Share of the book. A missing figure is `—`, not a sentence.
- **Book:** one total under the list; a donut of the same weights, largest first, `Other` past ten names;
  weighted figures for the kept chips, with dashes left out, not counted as zero.
- **Left out:** Connect broker, K/M/B amounts, an ownership toggle, download, instructions under the table.
- **Unchanged:** the dark style (epic #66 keeps and extends it), the dashboard stays released (`DASHBOARD_ENABLED` and env vars untouched),
  the signed-out behaviour, the calculator ($313,000 regression), noindex, the analytics (and referrer)
  rules, no buy/sell wording. The data math (closes, FX, SEC metrics, weighting) doesn't change.

### Current dashboard: flag, sign-in and data (gate unchanged)


- Only the exact value `true` turns it on. Unset or any other value means off.
- Off: `/dashboard` and every `/api/dashboard/*` route return a real **404**. The page 404
  is the same as for any unknown URL (no dashboard title or copy apart from the site menu's Dashboard item,
  which every page has); the API answers JSON for every method.
- On (Vercel **Preview** environment only, set by an owner): `/dashboard` needs a session (see "Dashboard
  sign-in" below), and `GET /api/dashboard/status` returns `{"dashboard":"enabled"}` plus, off production,
  sign-in diagnostics (`signIn`, `signUpAllowList`; names and states only). Other methods: 405 JSON,
  `Allow: GET, HEAD`.
- The calculator at `/calculator` doesn't read the flag or link to the dashboard. The site menu and the home Platforms line
  link to `/dashboard` whatever the flag says (#46); they never read it.

```bash
# Local sign-in uses the in-memory PGLite database and a per-process secret. Use a test address.
DASHBOARD_ENABLED=true VITE_AUTH_ENABLED=true DASHBOARD_SIGNUP_ALLOWLIST=you@example.com npm run dev
# then open http://localhost:8080/dashboard -> redirected to /dashboard/sign-in
```

**Dashboard sign-in (T03).** Better Auth email/password at `/api/auth/*`, only while the flag is on
(404 JSON otherwise, so production is unaffected).
- Sign-up is invite-only (D12): only emails listed in the server-only Vercel variable
  `DASHBOARD_SIGNUP_ALLOWLIST` (comma- or space-separated, case-insensitive) can create an account. Unset
  or empty means nobody can sign up. Others get "Sign-up is limited to invited email addresses." (403).
- Signed out, `/dashboard` redirects to `/dashboard/sign-in`; per-user APIs (`/api/dashboard/me`,
  `/api/dashboard/settings`) answer 401 JSON. A request naming another user's id gets 403. The diagnostic
  routes `/api/dashboard/status` and `/api/dashboard/db` stay public (no user data).
- Sign-in needs, on Vercel: `BETTER_AUTH_SECRET`, a database URL, and `VITE_AUTH_ENABLED` not `"false"`.
  Previews derive their origin from `VERCEL_URL` / `VERCEL_BRANCH_URL`; production uses `BETTER_AUTH_URL`
  (set at the release go). Missing pieces make `/api/auth/*` answer 503 JSON ("not configured").
- No email sender: no email verification and no password-reset email yet (spec §3).

**Roles and account (#90; `attachments/roles-and-account-design.md`, ROLE-01..22).** One **owner**: the account whose
email equals the server-only variable `ORPHEUS_OWNER_EMAIL` (case-insensitive). Personal Finance and the Dashboard
always show the owner's data; anyone else sees it only through a grant the owner gives on `/account`: **CFO** →
Personal Finance, **Portfolio Manager** → Dashboard, each `Read` or `Read and write` (one person may hold both).
- **Fail closed:** with `ORPHEUS_OWNER_EMAIL` unset nobody (the owner included) can open Personal Finance or the
  Dashboard: 403. Set it on Preview (and on Production at the release go) before anyone needs access.
  `/api/dashboard/status` (previews only) shows `ownerEmail: "set" | "empty"`, never the value.
- **Accounts:** the public `Create account` is gone; `DASHBOARD_SIGNUP_ALLOWLIST` is only for the owner's own
  account (bootstrap: `POST /api/auth/sign-up/email`). Everyone else is created by the owner on `/account`
  (`Add person`): a one-time temporary password, shown once, and a forced change at first sign-in. `Remove` revokes
  access and sessions; accounts are never deleted. `Reset password` issues a new temporary password.
- **Pages:** `/account` (behind the flag like sign-in; signed out → `/dashboard/sign-in?next=/account`): `01 You`,
  `02 Password`, `03 Email` (blocked for the owner), `04 Who has access`, owner-only `05 Grant access`. Without a
  read grant `/personal-finance` and `/dashboard` answer **403** with the dark shell and one line; `Read` shows the
  page locked (`Read only`); the section toggles are stored per person. `DELETE /api/personal-finance` is
  owner-only.
- **APIs:** `GET /api/account/me`, `GET /api/account/who`, `POST /api/account/password`, `POST /api/account/email`,
  `/api/account/access` (owner only: `GET`, `POST` add person, `PUT` grants, `DELETE ?userId=` remove),
  `POST /api/account/reset` (owner only), `PUT /api/personal-finance/view` (own toggles). Writes refuse cross-site
  and same-site requests (Fetch Metadata, 403). Sessions are read without the cookie cache, so a grant change or a
  removal applies on the next request.
- **Tables:** `access_grant` and `account_state` (`migrations/0011_access.sql`).
- **QA:** `qa/tools/roles.mjs` (owner / CFO `Read` / Portfolio Manager `Read and write` / no grant). Locally:
  `--bootstrap` on a throwaway database; on a preview the four accounts come from env (`QA_OWNER_*`, `QA_CFO_*`,
  `QA_PM_*`, `QA_NONE_*`), never logged.

**Dashboard holdings (T04).** Signed in, `/dashboard` lists your holdings and lets you add, edit and
delete them. Each row shows the ticker's last stored close and its session date, or "price pending"
(T05, below), and its market value, cost, total return and % of portfolio, with totals, in your base
currency (T06 and T07, below).
- `GET /api/dashboard/holdings` lists yours; `POST` with `{symbol, shares, avgCost}` adds one (201).
  `GET`/`PUT`/`DELETE /api/dashboard/holdings/<id>` reads, edits (`{shares, avgCost}` only) or deletes one.
  Same gate as the other per-user APIs: 404 flag off, 405 wrong method (with `Allow`), 401 signed out,
  403 if the request names another user id. Another user's holding id answers 404 "Holding not found.".
- Validation: shares > 0, average cost ≥ 0 (per share, in the listing's own currency) or blank for no cost (#56), up to 6 decimals.
  One row per ticker per user: a second `KO` gets 409 "KO is already in your holdings.". The ticker can't
  be edited (delete and add again). At most 200 holdings per user.
- Listing check on add only: the server makes one Yahoo chart-metadata request for the ticker and refuses
  anything outside US/EU/CA with the calculator's exact `listingError()` messages (e.g. "VOD.L lists on LSE. US, EU,
  and CA listings only." and "TCS.BO lists on BSE. BSE and other non US/EU/CA venues are not supported."). Page
  loads never call a feed; nothing is written to the shared `instruments` table.
- Deleting a user deletes their holdings (`holdings.user_id` → `"user"(id)` on delete cascade, migration 0004).

**Dashboard daily closes (T05).** One job stores each held ticker's closes in Neon, once per ticker and
session date, and never fetches or changes a stored close again (spec §6, §11, §14 Amendment A, D13).
- Source: Yahoo, behind the `DailyCloseProvider` interface (`src/lib/dashboard/close-provider.ts`); it
  reuses the calculator's chart code, so closes and dividends are raw (`rawBars()` / `rawDividends()`).
  Splits and dividends go to `corporate_actions`; `price_coverage` records what is stored. The Alpha
  Vantage fallback is a later ticket.
- Completed sessions only: a bar dated today in the exchange's own time zone is stored only once that
  session ended at least 30 minutes ago; a run during market hours stops at the prior session.
- `GET /api/cron/daily-refresh`: Vercel Cron, `0 23 * * *` UTC (`vercel.json`). It needs
  `Authorization: Bearer <CRON_SECRET>` (401 otherwise, also when `CRON_SECRET` isn't set; Vercel sends
  the header itself). Like every dashboard API it is 404 while `DASHBOARD_ENABLED` is off, so on
  production it does nothing until the release go.
- Lock: one `refresh_runs` row per UTC date. A run already in progress makes a second one answer
  `locked`; a finished day can run again and changes nothing (catch-up fills every missing session).
- A new holding's history is fetched once in a background job after the save (Vercel `waitUntil()`),
  never inside the browser request. Until then the row says "price pending".
- Previews only (`VERCEL_ENV=preview`, flag on): a "Run daily refresh (preview only)" button on
  `/dashboard` runs the same job server-side through `POST /api/dashboard/refresh` (signed in; counts
  only in the response). It never needs `CRON_SECRET`; the route is 404 on production and locally.

**Dashboard FX and base currency (T06).** Values and totals are shown in your base currency: CAD
(default), USD or EUR, chosen with the "Base currency" select on `/dashboard` (saved through
`PUT /api/dashboard/settings`, per user). Last close and average cost stay in the listing's currency.
- Rates: Bank of Canada Valet daily averages, CAD per 1 unit (`FXUSDCAD`, `FXEURCAD` always; `FXSEKCAD`,
  `FXPLNCAD` when someone holds a SEK or PLN listing). DKK, HUF and CZK: CAD per unit = BoC `FXEURCAD`
  (CAD per EUR) ÷ ECB euro reference rate (units per EUR), for the same date. USD and EUR bases cross through CAD.
- Each position uses the rate for its close's session date; if there's none that day (e.g. 2026-09-30, a
  BoC holiday), the previous rate is used and its date is shown ("previous rate"). A position with no
  close or no rate yet is left out of the total and listed under it.
- Rates are stored in `fx_rates` once per currency and date and never fetched again. Only the daily job
  (cron, the preview button, the new-holding backfill) fetches them; page loads never do.
- `GET /api/dashboard/fx?date=YYYY-MM-DD` (signed in; default today, UTC) returns the stored rates that
  apply on that date, each with the date it comes from. Same gate as the other per-user APIs. A `date` that
  isn't a real calendar date (e.g. 2026-02-31) is 400.
- Per D8, cost (T07) will use the same current rate as value, so the FX effect since purchase isn't shown.

**Dashboard holdings valuation (T07; layout replaced by #53).** The holdings table shows ticker, name, shares, average cost and
last close (listing currency, with the session date), market value and cost (base currency), total return
(amount in base, % in the listing currency) and % of portfolio, plus a total row (total position, total
cost, total return, 100.0%).
- Cost uses the same current FX rate as the price (decision D8), so currency moves since purchase aren't
  included. Holdings without a price or rate yet are left out of the totals and the %, and listed.
- Above the table: "Prices as of <date> close · FX <date>". If the last successful daily run is more than
  4 days old (or none has finished yet), it adds "Prices are out of date.".
- All of it is read from stored closes and rates; reloading never changes a value (DASH-14).
- The add-holding listing check (US/EU/CA only) now runs through the `DailyCloseProvider` interface
  (`getListing`), still one metadata request on add.

**Dashboard fundamentals and metric columns (T08).** Annual figures (revenue, margins, operating income,
EPS, debt, equity, cash…) come from SEC EDGAR XBRL `companyfacts`, fetched only by the daily job (and the
preview button / new-holding backfill) and stored in `fundamentals_annual`; pages read stored data only.
- Set `SEC_CONTACT_EMAIL` (owner's contact address) in the Vercel env: the SEC requires a User-Agent with a
  contact. Without it no SEC request is made and the dashboard shows "coverage check pending".
- Coverage: US tickers directly; Canadian/European listings only when the same company files with the SEC
  under the same ticker (e.g. RY.TO, ASML.AS, SHOP.TO). Others show "— not covered" in every metric cell.
- Metrics are chips on the metrics sheet (#57): each user adds them by search and removes them with ×, saved per user (no reorder; it was a reorderable column picker before #57). The values are
  computed in later tickets (T09–T13); until then covered rows show "— not computed yet".

**Dashboard revenue growth (T09).** The "Revenue growth 1y" and "Revenue CAGR 3y / 5y / 10y" columns are
computed by the background job from the stored SEC revenue (latest fiscal year vs 1/3/5/10 years earlier, in
the reporting currency). A zero or negative base shows "— not meaningful"; too few stored years for a CAGR
shows "— insufficient history". Negative growth is shown as a negative percentage.

**Dashboard ROIC (T10).** The "ROIC (1y)" column = after-tax operating income ÷ average invested capital
(latest and prior fiscal year), computed in the background from the stored SEC figures; the column header
and cells explain the formula on hover. Banks and insurers (SEC industry code 6000–6399, or no operating
income) show "— not meaningful", as does a zero or negative average invested capital. Negative ROIC is shown
as negative. If a debt or cash figure the company normally reports is missing for one of the two years, the
cell shows "— insufficient data" rather than a number; figures stored by an older version of the importer are
fetched again automatically on the next daily run. A metric cell shows `—` with one of these reasons:
"not covered", "not meaningful", "insufficient history", "insufficient data" (an input can't be confirmed, so no
value is computed from partial inputs), "coverage check pending" or "not computed yet".

**Dashboard EPS (T11).** The "EPS (1y)" column shows the latest fiscal year's diluted earnings per share
exactly as reported to the SEC, with its reporting currency code (e.g. "3.04 USD", "0.93 EUR"). A company
without a diluted EPS figure for that year shows "— not meaningful". The portfolio row's EPS cell shows the
weighted 1-year EPS growth instead (decision D9, T14).

**Dashboard EBIT margin (T12).** The "EBIT margin (1y)" column = operating income ÷ revenue for the latest
fiscal year, both as reported to the SEC (no adjustments), e.g. KO 28.7%. Negative margins are shown as
negative; zero or negative revenue, or no reported operating income (e.g. banks), shows "— not meaningful".

**Dashboard gross margin (T13).** The "Gross margin (1y)" column = gross profit ÷ revenue for the latest fiscal
year as reported to the SEC (e.g. KO 61.6%); when a company reports no gross profit for that year,
(revenue − cost of revenue) ÷ revenue. Zero or negative revenue, or neither figure reported (e.g. banks),
shows "— not meaningful".

**Dashboard portfolio row (T14; moves to the metrics sheet's Book row in #53).** The total row under the holdings shows a portfolio value in every metric
column: the market-value-weighted mean (base currency) over the holdings that have a value for that metric,
with the share of the portfolio's market value it covers, e.g. `27.6% · 71% covered`. Holdings showing "—"
(not meaningful, insufficient history or data, not covered) are left out and never counted as zero;
negative values are included. The EPS column's portfolio cell is the weighted 1-year EPS growth (EPS FY0 ÷
EPS FY−1 − 1; not meaningful if either is ≤ 0), with a visible "EPS growth 1y (weighted)" sub-label under the
value so it isn't read as an EPS amount, because EPS in different currencies can't be
added (D9). Holdings waiting for a price or FX rate carry no weight and are outside the coverage figure;
the total row then says so ("1 holding without a price excluded" / "N holdings without a price excluded",
"… or FX rate" when one is waiting for a rate). Coverage is a whole percent that never shows 0% or 100%
unless exact. A company without a prior-year EPS shows insufficient history for EPS growth. Computed when
the page loads, from stored values only.

**Dashboard pie chart (T15; becomes a donut in #53).** Below the holdings table, a pie chart shows each holding's % of portfolio
(market value in your base currency, the same figures as the table's "% of portfolio" column), largest
first; with more than 10 holdings the 10 largest keep their slice and the rest are grouped into "Other".
Slices are neutral greys labelled ticker + %, with a text list next to the chart (stacked under it on
small screens). Holdings without a price or FX rate get no slice (since #58 they are only counted in the
excluded line under the total, and with no priced holding there is no chart). Since #58 it is a donut.

**Dashboard release prep (#24).** The release checklist (every DASH and DCA check), the exact Production
environment variables, the database choice and migration steps, the ordered runbook with rollback, and the
test-account steps are in [`docs/release/dashboard-release.md`](docs/release/dashboard-release.md).
`node scripts/release-smoke.mjs <url> off|on|preview` is a read-only (GET-only) smoke check for it. The
table's and the pie's % labels come from one formatter (`formatPortfolioPct`); rounded one by one,
they may not sum to exactly 100.0. Click-level component tests (`*.dom.test.tsx`, jsdom, e.g. the holdings delete
guard) run in `npm test` through `scripts/run-dom-tests.mjs`.

**Dashboard storage (Neon Postgres).** The dashboard tables (spec §5) are in
[`migrations/0002_dashboard.sql`](migrations/0002_dashboard.sql); the Better Auth tables in
[`migrations/0001_auth.sql`](migrations/0001_auth.sql) (a verbatim copy of `migrations/auth/0001_auth.sql`), and
[`migrations/0003_user_settings_fk.sql`](migrations/0003_user_settings_fk.sql) links `user_settings` to
`"user"` (on delete cascade). Data access lives in
`src/lib/dashboard/store.server.ts` and is server-only.
- Database URL: `DATABASE_URL` when set, otherwise `orpheus_app_preview_DATABASE_URL`, the prefixed name the
  Vercel Neon integration injects. It's scoped to Preview and Development only; Production has none.
  Migrations prefer the direct connection (`DATABASE_URL_UNPOOLED`, else
  `orpheus_app_preview_DATABASE_URL_UNPOOLED`) and fall back to the pooled URL. Neon preview branching is
  on, so a preview deploy can get its own Neon branch. Precedence lives in `scripts/db-env.mjs`.
- `npm run build` applies pending migrations when a database URL is set. It logs which env var name it used
  (never the value), then `applied <file>` once per new migration, then `up to date` on later deploys.
  On production builds (`VERCEL_ENV=production`) it skips unless `DASHBOARD_ENABLED=true` there too.
- With neither name set, dashboard storage is unavailable: `/dashboard` shows "Database: not configured".
  The app still builds, and the calculator never touches the database.
- On previews (flag on), `/dashboard` shows a status line, "Database: connected · 13/13 tables" when Neon is
  wired up. `GET /api/dashboard/db` returns the same status as JSON; other methods get 405 JSON with
  `Allow: GET, HEAD`. Both are hidden on production (the API is 404 there).
- After a week of previews, check Neon's usage page against the Free plan limits (spec §4).

## Team loop

1. SWE branches off `main` and opens a **draft** PR. Nobody pushes directly to `main`.
2. CI must be green. The Engineering Lead reviews.
3. QA runs the six rules on the PR's **Vercel preview** and says pass or fail.
4. Only Engineering Lead merges, after QA passes on the preview. Vercel then deploys `main` to
   production.
5. QA re-checks production.

**Source-of-truth rule (Diego):** always the harness, then the specs, then the work. `AGENTS.md`, the
spec docs and this README are the source of truth. Every feature PR updates the README, the relevant
spec and `AGENTS.md` in the same PR, or says in the PR body why none of them changed. QA fails PRs that
skip this.

## No secrets in the repo

- Environment variables live only in the Vercel project settings (`VITE_AUTH_ENABLED`,
  `BETTER_AUTH_SECRET`, `DASHBOARD_ENABLED`, `DASHBOARD_SIGNUP_ALLOWLIST`, the Neon variables, later
  `BETTER_AUTH_URL` for production). Owners set them; bots never do.
- Never commit their values and never add a `.env` file.
- Never paste secret values into issues, PRs, chat or notes.
- `.vercel/output/` is build output and is git-ignored.

**Template leftovers removed (#50).** The Grok app-builder template no longer ships: no
`grok.com/grok-app-builder/extensions.js` (and so no `grok_device_id` / `__cf_bm` cookies on `.grok.com`), no
`/__grok/*` manifest, icon or `?install=1` install page, no preview postMessage bridge. In their place a static
`public/manifest.webmanifest` (`Orpheus Wisdom`, charcoal `#1e2124`) with `public/icons/icon-180.png`,
`icon-512.png` and `apple-touch-icon.png`, rendered from `public/favicon.svg` by `node scripts/make-icons.mjs`.
Installing is the browser's own (Share → Add to Home Screen). noindex meta + `X-Robots-Tag` unchanged. QA:
`node qa/tools/no-grok.mjs --base-url <preview>` (NG-01..09).

**Remaining Grok tooling removed (#51).** `.grok/`, `startup.sh`, the template's preview / app-env / auth-invariant /
write-atomic / browser-smoke scripts and `screenshots/app-builder-*` are gone; `npm run dev` / `build` / `preview` run
Vite directly. Vercel sets `VITE_AUTH_ENABLED` itself, so deployed builds are unchanged. Test:
`scripts/no-grok-tooling.test.mjs` (TL-01..06).

**Audit log of actions (#91).** An append-only, masked log of who did what, when, for operations and debug
(`migrations/0012_audit.sql`, `src/lib/access/audit.server.ts`; design `attachments/audit-log-design.md`). People
show as `owner` or `p-xxxxxxxx` (a hash of the account id), holdings as `h-xxxxxxxx`; no email, name, amount or
ticker is stored. The owner reads it in `/account` section `06 Activity` and at `GET /api/account/audit`. QA:
`node qa/tools/audit.mjs --base-url <preview>` with the #90 QA accounts in env (AUDIT-01..12).

**Personal Finance month control (#112).** A `Month` control at the top (the last 12 months) replaces `05 Update`:
each month keeps its own income and expense lines (`orpheus.finance.months.v1`), an empty past month starts as a
copy of the current month's saved lines (`Copied from … — edit and save.`), and `Save` (shown only when something is
unsaved) writes the month; there is no autosave. Design `attachments/pf-month-control-design.md`, spec section 19,
AC PF-48..PF-58, QA `qa/tools/pf-months.mjs`.

**Personal Finance usability (#113).** "Personal Finance" with a capital F everywhere; removing an expense line or a
person asks `Delete [name]? This cannot be undone.`; a chosen category can be renamed (every line and month follows).
Spec section 20, AC PF-59..PF-66.


**Shared page parts (#92).** Fonts live in `src/styles/fonts.css`, the shared label and button in
`src/styles/parts.css` (both imported by `src/styles.css`); the bar and footer wrap every page from `__root.tsx`.
Change a shared part there and every page follows. Site-style-spec section 16, AC SP-01..SP-07.

**QA font wait (#135).** The site keeps `font-display: optional`, so a slow first load can render in the fallback font. Before font-dependent checks, `site-shell.mjs` and `site-style-regression.mjs` call `qa/tools/fonts.mjs` `fontsSettled()`. It waits for `document.fonts.ready`, then reloads (up to 3 loads, 1 s settle) until Schibsted Grotesk is actually rendered. The checks themselves are unchanged. Site-style-spec §17, FW-01..FW-05.

**Dashboard company view (#95).** Open a holding, then `Open company view`: `/dashboard/company/<SYMBOL>` shows
Profile, Margins, Returns, Valuation, Growth, Dividends and a price chart from SEC filings and the stored daily closes.
Design `attachments/dashboard-company-view-design.md`, AC CV-01..CV-15.

**Personal Finance expenses summary (#119).** `Expenses summary` (its own toggle) shows totals `By account` and
`By category`; `Filter by account` narrows the expense lines. Design `attachments/pf-expenses-summary-design.md`, AC PF-67..PF-78.

**Personal Finance Overview: Equity coverage and 3-month average (#126).** Under the Overview table, `Equity coverage`
= starting net assets × rate used, per month and as a % of expenses (household currency; projected under `Future`); the
table adds a `3-month average` beside the 12-month one. Design `attachments/pf-equity-coverage-design.md`, AC PF-79..PF-90.

**Company view without SEC filings (#121).** EU / Canadian holdings (e.g. RMS.PA, VDY.TO) show `Not covered: no SEC
filings` with price, chart and dividends. Source comparison: `attachments/dashboard-non-sec-coverage-design.md`.

**EU fundamentals from ESEF (#123).** EU holdings without SEC filings (RMS.PA first) get annual figures from the free
ESEF filings at filings.xbrl.org, shown in the source currency. Design `attachments/dashboard-esef-fundamentals-design.md`.

**Funds / ETFs (#124).** A holding that OpenFIGI (free, keyless) types as a fund, e.g. VDY.TO (`ETP`), shows `Fund:
company figures do not apply` in place of the company sections; price, chart and dividends stay. The daily job and the
new-holding backfill classify; pages never call OpenFIGI. Design `attachments/etf-detection-design.md`.

**Change (C7/C2, approved 2026-10-13).** The Overview's 3-month average uses the last 3 complete months (e.g. `3-month average (Jul–Sep)` on Oct 13), computed from today in the household timezone, and the equity coverage % is against it. See `attachments/pf-equity-coverage-design.md`, PF-91..PF-95.

**Equity coverage layout (#129).** The Overview's coverage reads on three lines: `Equity coverage: 41.67 CAD/mo (500 CAD/yr)`, then in a smaller font the rate note (`* 12.5% yearly, or 0.50% monthly on 3-month average (Jul–Sep) expenses.`) and the source note (`** Coverage rate is derived from Rate Used under Expenses section.`). Spec section 23, PF-98..PF-104.
Since the CFO's answers (2026-10-14) line 2 reads `* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul–Sep).`, or with Future on `… covers X% of projected monthly expenses at horizon end (held at 12-month average).` (PF-105..PF-107).

**Withdrawal rate description (#131).** Directly above `Withdrawal rate (%)` under Expenses, a two-line
note-style description (`pf-withdrawal-desc`) explains Rate used; not a title. Design
`attachments/pf-withdrawal-description-design.md`.

**12-month average month range (#132).** The Overview's 12-month column names its months the same way as the 3-month one, e.g. `12-month average (Nov–Oct)` on Oct 14, rolling over on the 1st in Toronto. Spec section 25, PF-115..PF-120.

**12-month average uses complete months (#140).** The 12-month average now covers the last 12 complete Toronto months, leaving out the current partial month, the same rule as the 3-month average: on Oct 14, 2026 it reads `12-month average (Oct–Sep)`. The empty-month fill, the Future projection and Future-on coverage follow it; fewer than 12 months average what exists; with no complete month it shows `—`. Spec section 26, PF-121..PF-128 (supersede PF-115's example, PF-116 and the PF-107 value).

**12-month label count (#141).** If fewer than 12 complete months have data, the header reads `12-month average (8 of 12 months)` (the CFO's format) instead of the range. With 0 it reads `(0 of 12 months)` and the figures are `—`. Labelling only. Spec section 27, PF-129..PF-131.

**12-month count: expense months only (#141, PF-132).** For the 12-month expense average and its `(N of 12 months)` count, a month has data only if it has expense entries. An income-only month is neither counted nor averaged as $0; the income average keeps its own months.

**Save blocked by field errors (#143).** While any Personal Finance field shows an error (for example `-5` in Rent, or tax above 100), pressing Save sends nothing: it shows `Fix the fields marked in red before saving.` and moves focus to the field. `PUT /api/personal-finance` refuses such a record with 400 `{ "error": "Invalid value.", "field": "<path>" }` and never clamps the value to 0. Spec section 28, PF-133..PF-140.

**12-month averages over the same months (#146).** The 12-month income and expense averages, and so the surplus, both use the complete months that have expense entries. An income-only month counts toward neither. An expense month with no income counts as 0 income, unless none of them has income, in which case the income average shows `—`. Spec section 29, PF-143..PF-149.

**Rate used = the lower of the two (#138).** Rate used is now min(Withdrawal rate, Portfolio ROIC ÷ 2) when both are set, and the one that is set otherwise. A typed 0 counts as not set, and any rate field in error gives `—`. A line under the value says which was used. Spec section 30, PF-150..PF-157.

**Every figure is live; Unsaved changes (#144).** Personal Finance figures (This month, the 3-month and 12-month averages, the chart, the projection and the coverage) now update while you type, the same as the Expenses totals already did. They show what Save would store. Nothing is stored until Save. `Unsaved changes` shows beside Save until a save succeeds, and it stays after a blocked or refused save, along with `Not saved.`. Spec section 31, PF-159..PF-170.

**Layout and the figures note (#144).** Save and `Unsaved changes` are one group that never wraps, and the indicator's space is always reserved, so nothing moves (PF-171). While any field is in error, `Figures leave out fields marked in red.` shows above the Overview figures (the CFO chose option c on Q-V3; PF-172, PF-173).

**Month row at 400 px (#144, PF-174).** Save stays on the month select's row from 400 px, as on main. The reserved `Unsaved changes` may wrap alone onto the next line, in both states, so nothing moves.

**One money format (#142).** Every Personal Finance money figure shows exactly two decimals with comma separators (`4,296.30`, `1,200.00`, `0.00`) through one shared formatter, `formatMoney` in `src/lib/finance/money.ts`. There's still no currency symbol, negatives read `-1,234.50`, and percentages and typed fields are unchanged. Spec section 32, PF-175..PF-182.

**ROIC method tooltip (#130).** On the company view, an `i` beside ROIC shows how it's calculated: operating income after tax ÷ average invested capital (equity + debt − cash). Cash is excluded, which is why a net-cash company such as RMS.PA shows a high ROIC. It opens on hover, focus or tap and closes on Escape. This is a disclosure only. Dashboard-spec §19, CV-16..CV-21.

**ROIC tooltip short wording (#130, Q-T1).** PM chose: `Operating income after tax ÷ average (equity + debt − cash). Cash excluded.` (CV-22, dashboard-spec §19.1). Q-T2..Q-T4 accepted as built.

**Saved chart report (#153, backend only).** `/api/personal-finance/report` (GET / PUT / DELETE) stores each signed-in person's one chart report definition (series, date range, chart type) in their own `personal_finance` row under `orpheus.finance.report.v1`. There is no migration. Validation is shared with the client (`src/lib/finance/report.ts`). See personal-finance-spec section 33 and `attachments/pf-chart-report-design.md`. QA API checks: `qa/tools/pf-report-api.mjs`.

**Any past month (#163).** The Personal Finance month control is now two selects, `Month` (Jan–Dec) and `Year` (2020 to the current year). Any past month back to January 2020 can be opened and edited. An empty one copies the current month's saved lines, as before. Storage keeps every month from 2020-01 (the 24-month limit is gone); the 1 MB record limit stays and there is no migration. See personal-finance-spec section 34 and `attachments/pf-any-month-design.md`.

**#163 addendum (2026-10-16, CFO rejected Q-Y6).** An empty past month now opens blank. A `Copy from current month` button copies the current month's lines into it, and nothing is stored until Save, so figures saved by accident can't pollute the averages. An empty current month still copies the most recent month with lines (PF-56). AC PFM-15..PFM-19.

**Deleting keeps history (#165).** `Delete category` / `Delete account` remove a name from the shown month and later months on Save. Earlier months keep it, shown as `<name> (deleted)`. Chart report series on it keep their past data (`deleted` / `labels` on the report API). Totals and averages don't change. Design: `attachments/pf-keep-deleted-design.md`; spec section 35; AC PFD-01..PFD-14.
