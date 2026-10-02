# Orpheus dashboard (signed-in area): spec

Status: **APPROVED** by Diego on **2026-10-02**: all decisions approved as recommended (see
[13. Decisions record](#13-decisions-record-approved-2026-10-02)). One amendment is open:
[Amendment A: daily-close source (pending)](#14-amendment-a-daily-close-source-pending). Nothing is built
yet; work starts with ticket T01 (#9).

Date: 2026-10-02. All provider facts below were checked on the provider's own page on 2026-10-02, and
each one has its link inline. When a provider page does not say something, this document says
"not stated on provider page" and does not guess.

Spec PR: #8. Tickets: see [Tickets](#tickets).

## 1. What we are building

A signed-in area. A user signs in and gets two things: the existing DCA calculator (unchanged), and a new
**Dashboard**.

1. **Holdings table** at the top, like a Fiscal.ai portfolio table. The user adds ticker, share count and
   average cost basis. Market value and total return are computed from the **prior session's close**,
   refreshed **once a day, never intraday**. The table shows the total position and each holding's % of
   portfolio.
2. **Per-company metric columns** the user can add or remove. Initial list: Revenue growth (1y, plus 3y,
   5y and 10y CAGR), ROIC (1y), EPS (1y), EBIT margin (1y), Gross margin (1y).
3. **Portfolio view**: the same metrics aggregated across the portfolio (weighted), plus a pie chart of
   holdings by % of portfolio.
4. **Existing rules still apply**: US/EU/CA listings only, no buy/sell/hold output anywhere, `noindex`,
   and no secrets in the repo, vault, chat or PRs (environment variables live only in Vercel).

How this relates to `attachments/dca-app-spec.md`: that spec says dashboards and holdings are "later" and
lists "a boring price and holdings feed (IBKR or Fiscal.ai) before any dashboard". This spec uses
**manual holdings entry** and a daily close instead of a broker feed. Diego approving this spec settles
that conflict, and Diego approved it on 2026-10-02 (decision D7 in the [Decisions record](#13-decisions-record-approved-2026-10-02)). The DCA calculator spec and its six
rules do not change.

### Not in scope

- Intraday prices, quotes, alerts, order tickets or any link to a broker.
- Any rating, target price, "cheap/expensive" label, ranking called "best", or buy/sell/hold wording.
- Transactions history, lots, dividends received, tax lots or account types (TFSA/RRSP). Not in v1.
- Listings outside US/EU/CA (the same `listingError()` rule as the calculator, in `src/lib/dca/venues.ts`).

## 2. Feature flag and hidden route (how every ticket ships)

Every dashboard ticket merges to `main` behind one flag, so production is never exposed piece by piece.

**Mechanism (simplest that works):** one server-only environment variable, `DASHBOARD_ENABLED`.

- It is set to `true` **only in the Vercel "Preview" environment**. It is not set for Production.
  Vercel lets each variable be scoped to Production, Preview and Development separately, and a Preview
  variable applies to every non-production branch unless a branch-specific value overrides it
  ([Vercel: Environment variables, "Environments" and "Preview environment variables"](https://vercel.com/docs/environment-variables),
  checked 2026-10-02).
- It is read **on the server only** (no `VITE_` prefix). `VITE_*` values are inlined into the client
  bundle at build time, so they are not a gate. The `/dashboard` route checks the flag in its server-side
  `beforeLoad`/loader and every dashboard server function and API route checks it too. When the flag is not
  exactly `true`, they all answer **404** (route) or **404 JSON** (API). No nav link, sign-in button or
  dashboard copy is rendered when the flag is off.
- A changed value only applies to **new** deployments
  ([Vercel: Environment variables](https://vercel.com/docs/environment-variables), checked 2026-10-02),
  so flipping it means redeploying.
- The calculator at `/` does not read the flag and does not change.

**How QA reaches it on a preview:** open the PR's Vercel preview URL (vercel[bot] posts it on the PR), go to
`/dashboard`. Because the flag is on for every Preview deployment, no extra step is needed. On production
(https://orpheus-app-beta.vercel.app/dashboard) QA expects a 404 until the release go.

**Who sets it:** the Engineering Lead (or Diego) adds `DASHBOARD_ENABLED=true` to the Preview environment
once, when ticket T01 (#9) is approved. Bots never set environment variables and never paste values anywhere.

This is an active harness rule in `AGENTS.md` (since spec approval, 2026-10-02): *feature work lands
behind a flag until a release go*.

## 3. Auth provider

### What is in the repo today

The repo already has self-hosted [Better Auth](https://www.better-auth.com/docs/installation) from the Grok
template (`src/lib/auth/*`, `better-auth ~1.6.30` in `package.json`), mounted at `/api/auth/*`, plus
`migrations/auth/0001_auth.sql` (tables `user`, `session`, `account`, `verification`). What I found by
reading the code:

- **Sign-in today federates to the Grok auth broker** (`https://auth.grok.me`, `genericOAuth` plugin) using
  `GROK_AUTH_ISSUER`, `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET`. Those were injected by the Grok
  deployer, which no longer deploys this app. Without them the code falls back to a shared "preview"
  client that only accepts `https://*.grok-sandbox.com` callbacks (`src/lib/auth/preview.ts`), so **Grok
  sign-in cannot work on Vercel** (`*.vercel.app`) as is.
- `VITE_AUTH_ENABLED` is the on/off switch (`"false"` = off, dev user, no DB). With auth on and
  `DATABASE_URL` set, Better Auth uses Postgres through `pg`; without `DATABASE_URL` it uses embedded
  PGLite, which does not persist on serverless.
- `BETTER_AUTH_URL` sets a fixed base URL; without it the base URL is derived only for Grok sandbox hosts
  and localhost. `trustedOrigins` is that one URL plus localhost. So **preview URLs on `*.vercel.app` are
  not trusted** unless this is changed.
- `src/lib/auth/email-password.ts` has `emailAndPasswordEnabled = false`. Flipping it turns on Better
  Auth's built-in email/password, which needs no OAuth client and no callback URL.
- `scripts/migrate.mjs` runs in `npm run build` and applies `migrations/*.sql` to `DATABASE_URL`. It does
  **not** read `migrations/auth/` (non-recursive by design). The auth schema has to be **copied** to
  `migrations/0001_auth.sql` to be applied.
- The template also has a "gate identity" path (`gate-identity.server.ts`) that is on whenever
  `VITE_AUTH_ENABLED !== "false"` and expects Grok-issued headers. It must be checked and turned off for
  Vercel in the auth ticket.
- `src/lib/auth/preview.ts` contains a hard-coded low-privilege Grok preview client secret from the
  template. It is not ours and is useless on Vercel; the auth ticket should remove the Grok broker path and
  that constant.

### What Better Auth needs to run on Vercel

| Need | Exact value | Source |
|---|---|---|
| Database | Postgres, via `DATABASE_URL` (the existing `pg` Pool) | [Better Auth: Installation, "Configure Database"](https://www.better-auth.com/docs/installation), checked 2026-10-02 |
| Schema | Copy `migrations/auth/0001_auth.sql` to `migrations/0001_auth.sql`; `npm run build` applies it on each Vercel deploy | repo (`scripts/migrate.mjs`, `scripts/migration-plan.mjs`) |
| `BETTER_AUTH_SECRET` | At least 32 characters, high entropy (already listed as a Vercel env var) | [Better Auth: Installation, "Set Environment Variables"](https://www.better-auth.com/docs/installation), checked 2026-10-02 |
| `BETTER_AUTH_URL` | Production: `https://orpheus-app-beta.vercel.app`. Previews: derived per request (see below) | same page |
| `VITE_AUTH_ENABLED` | `true` where the dashboard is on (Preview first, Production at release) | repo |
| Trusted origins on previews | Build `baseURL`/`trustedOrigins` from Vercel's `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL` (system variables, available at build and runtime) instead of a fixed URL | [Vercel: System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables), checked 2026-10-02 |
| Callback URLs | **None for email/password.** For Google: `https://<host>/api/auth/callback/google`, registered in Google Cloud Console | [Better Auth: Google](https://www.better-auth.com/docs/authentication/google), checked 2026-10-02 |

Why email/password first: Google OAuth redirect URIs **cannot contain wildcards**
([Google: OAuth 2.0 for web server apps, redirect URI validation rules](https://developers.google.com/identity/protocols/oauth2/web-server), checked 2026-10-02),
and every Vercel preview has a different host. Better Auth has an OAuth Proxy plugin for exactly this,
but it needs a shared `OAUTH_PROXY_SECRET` on production and every preview, and its docs warn that anyone
holding it "can assert provider identities"
([Better Auth: OAuth Proxy](https://www.better-auth.com/docs/plugins/oauth-proxy), checked 2026-10-02).
That is more moving parts than this app needs to start.

Note on email/password: with no email sender configured there is no "forgot password" email and no email
verification. For a small invited user set this is acceptable to start; adding Google later (production
callback only, plus the proxy for previews) is a separate ticket if Diego wants it.

**Cost:** $0. Better Auth is an open-source library already in `package.json`; it runs inside our Vercel
functions and stores users in our Postgres (cost is the database, section 4).

### Alternatives (only for comparison)

| Option | Free tier | Paid | Why not first |
|---|---|---|---|
| Clerk | Hobby: free, 50,000 monthly retained users per app, up to 3 social connections | Pro $25/mo ($20/mo billed annually) | New vendor, new SDK and env vars, and we already have Better Auth wired. [Clerk pricing](https://clerk.com/pricing), checked 2026-10-02 |
| Supabase Auth | Free: 50,000 MAU (Free projects pause after 1 week of inactivity, 2 active projects) | Pro from $25/mo | Would also move the DB to Supabase. [Supabase pricing](https://supabase.com/pricing), checked 2026-10-02 |

**Recommendation:** keep Better Auth, turn on email/password, run it on Neon Postgres (section 4).

## 4. Per-user storage on Vercel

Per-user data is small: a settings row, a few dozen holdings rows and a list of chosen columns per user.
Shared market data (daily closes, FX, fundamentals) is one copy per symbol, not per user. A relational
database fits; Better Auth also needs one.

| Option | Free tier (as stated by provider) | First paid step | Fit |
|---|---|---|---|
| **Neon Postgres via Vercel Marketplace** | Free plan, $0: 100 CU-hours per project, 1 GB storage per project (20 GB account), scale to zero after 5 min, 10 branches per project, 5 GB egress per project. Hitting CU-hours or egress suspends compute until the next period; going over 1 GB blocks writes; no data is deleted. [Neon pricing](https://neon.com/pricing), checked 2026-10-02 | Launch: pay as you go, $0.106/CU-hour, $0.35/GB-month, no monthly minimum (same page) | **Best.** Installs from Vercel, billed through Vercel, injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`, and can create a database branch per Preview deployment ([Neon: Vercel-Managed Integration](https://neon.com/docs/guides/vercel-managed-integration), [Vercel Marketplace: Neon](https://vercel.com/marketplace/neon), checked 2026-10-02). The repo's `pg` code and `db:migrate` already expect exactly `DATABASE_URL`. |
| Upstash Redis | Free: 256 MB data, 10 GB bandwidth, 500K commands per month, 1 database. [Upstash Redis pricing](https://upstash.com/pricing/redis), checked 2026-10-02 | Pay as you go $0.20 per 100K commands; fixed 250 MB at $10/mo | Key-value only; Better Auth would still need SQL. Not needed. |
| Vercel Blob | Hobby includes 1 GB/month storage, first 10,000 simple ops, first 2,000 advanced ops, first 10 GB transfer; over the limit on Hobby, Blob is blocked until 30 days pass. [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), checked 2026-10-02 | Pro usage-based | File storage, not a database. Not a fit. |
| Supabase (Postgres) | Free: 500 MB database, 5 GB egress, paused after 1 week of inactivity, 2 active projects. [Supabase pricing](https://supabase.com/pricing), checked 2026-10-02 | Pro from $25/mo (includes $10 compute credit) | Works, but the inactivity pause is a problem for a once-a-day job, and it is a second vendor outside Vercel billing. |

Preview branching caveat: on Neon Free, branches per project are capped at 10, and "hitting 10 branches
blocks branch creation" ([Neon pricing](https://neon.com/pricing), checked 2026-10-02). Preview branches
are deleted only when the Vercel deployment is removed, which by default can take months
([Neon: Vercel-Managed Integration, "Automatic branch cleanup"](https://neon.com/docs/guides/vercel-managed-integration),
checked 2026-10-02). So either keep preview branching off (previews share one "preview" database,
separate from production) or prune branches regularly. **Recommendation: preview branching off; one
Neon project with a `main` branch for Production and one `preview` branch whose `DATABASE_URL` is scoped
to the Preview environment.**

Usage numbers for this app are not measured yet; the storage ticket adds a note to check Neon's usage page
after a week of previews.

**Recommendation:** Neon Postgres (Free) through the Vercel Marketplace. Cost $0 to start. Owner action:
Diego (or the Engineering Lead with his OK) installs it from the Vercel dashboard. Bots do not sign up.

## 5. Data model

All app tables are snake_case, in new migration files (`migrations/0002_dashboard.sql`, …), as the
template's migration header asks. Per-user tables have `user_id TEXT NOT NULL` (Better Auth ids are text)
and every query is scoped to the verified session user on the server (`requireUserId()` in
`src/lib/auth/verify.server.ts`). A client-supplied user id is never trusted.

Per-user tables:

| Table | Columns | Keys |
|---|---|---|
| `user_settings` | `user_id`, `base_currency` (`CAD` \| `USD` \| `EUR`, default `CAD`), `updated_at` | PK `user_id` → `"user"(id)` on delete cascade |
| `holdings` | `id`, `user_id`, `symbol` (feed symbol, e.g. `RY.TO`, `ASML.AS`, `KO`), `shares` numeric(20,6) > 0, `avg_cost` numeric(20,6) ≥ 0 (in the listing currency), `created_at`, `updated_at` | PK `id`; unique (`user_id`, `symbol`); index `user_id` |
| `user_metric_columns` | `user_id`, `metric_key`, `position` | PK (`user_id`, `metric_key`) |

Shared market-data tables (written only by the daily job):

| Table | Columns | Keys |
|---|---|---|
| `instruments` | `symbol`, `name`, `exchange`, `region` (`US`/`EU`/`CA`), `currency`, `sec_cik` (nullable), `fundamentals_source` (`sec` \| `none`), `updated_at` | PK `symbol` |
| `daily_closes` | `symbol`, `session_date` (exchange-local date), `close` numeric, `currency`, `source`, `fetched_at` | PK (`symbol`, `session_date`) |
| `fx_rates` | `quote` (e.g. `USD`), `rate_date`, `cad_per_unit` numeric, `source` (`BOC` \| `ECB_CROSS`), `fetched_at` | PK (`quote`, `rate_date`) |
| `fundamentals_annual` | `symbol`, `fiscal_year_end`, `concept` (internal key, e.g. `revenue`), `value` numeric, `unit`, `source_tag` (e.g. `us-gaap:Revenues`), `accession`, `filed` | PK (`symbol`, `fiscal_year_end`, `concept`) |
| `metric_values` | `symbol`, `metric_key`, `value` numeric null, `status` (`ok` \| `n/m` \| `insufficient_history` \| `not_covered`), `fiscal_year_end`, `computed_at` | PK (`symbol`, `metric_key`) |
| `refresh_runs` | `id`, `run_date`, `started_at`, `finished_at`, `status`, `detail` jsonb | PK `id`; unique `run_date` for the lock |

Caching: the database **is** the cache. Dashboard pages read only these tables. No page load ever calls
a price, FX or fundamentals provider, so nothing on the page can be intraday.

## 6. Prices: the prior session's close

**Definition.** For a holding, "prior session close" is the official close of the most recent **completed**
regular session on that listing's own exchange, at the time the daily job runs. US, CA and EU listings each
use their own exchange calendar; a holiday on one exchange (for example a US holiday while Toronto is open)
simply means that listing keeps its previous close. The dashboard shows the session date next to the close.
A bar whose exchange-local date is "today" while that exchange is still open is discarded.

**Source.** All price fetching goes through **one provider interface, `DailyCloseProvider`**
([Amendment A](#14-amendment-a-daily-close-source-pending)); nothing else in the dashboard calls a price
feed. The first implementation wraps the Yahoo daily chart call the calculator already uses
(`src/lib/dca/yahoo.server.ts`, raw close). Amendment A may replace it. Honest caveat: this is an unofficial endpoint with no published API terms, rate limits or
SLA (not stated on any provider page I could find), and Yahoo's Terms of Service forbid collecting data
"using any automated means … without our express, prior permission" (section 2.d.ix) and commercial
reuse without permission (section 2.e)
([Yahoo Terms of Service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), checked 2026-10-02).
The calculator already carries this risk; the dashboard adds one call per held symbol per day. The paid
alternative for daily closes is EODHD "EOD Historical All-World" at $19.99/mo (section 7).

## 7. Fundamentals source, and 10-year CAGR coverage

### SEC EDGAR XBRL `companyfacts` (free)

- Free, no key: "These APIs do not require any authentication or API keys"; JSON per company at
  `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`; covers XBRL from 10-K, 10-Q, 20-F, 40-F
  and 6-K, standard taxonomies only (`us-gaap`, `ifrs-full`, `dei`, `srt`); no CORS (server-side only);
  nightly bulk `companyfacts.zip`
  ([SEC: EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), checked 2026-10-02).
- XBRL was "first required by the SEC in 2009" (same page).
- Fair access: "Current max request rate: 10 requests/second", and requests must declare a User-Agent
  such as "Sample Company Name AdminContact@<company>.com"
  ([SEC: Accessing EDGAR Data](https://www.sec.gov/os/accessing-edgar-data), checked 2026-10-02).
  A test request without a User-Agent returned HTTP 403; with one it returned 200 (2026-10-02).
- Ticker → CIK map: `https://www.sec.gov/files/company_tickers_exchange.json` (same page). It lists
  **US tickers only** (e.g. `RY` on NYSE, not `RY.TO`), so a TSX or EU listing has to be matched to the
  issuer's SEC filer record (strip the venue suffix, confirm by company name); no match = not covered.

**Coverage depth, measured on real `companyfacts` files on 2026-10-02** (annual frames for the revenue
concept):

| Issuer | Filer type / taxonomy | Annual revenue frames found | 10y revenue CAGR to FY2025? |
|---|---|---|---|
| Coca-Cola (KO) | 10-K, us-gaap | `SalesRevenueGoodsNet` CY2007–CY2017, then `Revenues` CY2016–CY2025 | Yes, **only by stitching two tags** |
| ASML (ASML / ASML.AS) | 20-F, us-gaap, EUR | `SalesRevenueNet` CY2007–CY2017, then `RevenueFromContractWithCustomerExcludingAssessedTax` CY2016–CY2025 | Yes, by stitching |
| Philips (PHG / PHIA.AS) | 20-F, ifrs-full, EUR | `Revenue` CY2015–CY2025 | Yes, just (needs FY2015) |
| Royal Bank of Canada (RY / RY.TO) | 40-F, ifrs-full, CAD | `Revenue` CY2017–CY2025 | **No** (9 years); 1y/3y/5y yes |
| Shopify (SHOP / SHOP.TO) | us-gaap | `RevenueFromContractWithCustomer…` CY2017–CY2023, `Revenues` CY2022–CY2025 | **No** (data starts CY2017) |

So: US domestic filers usually have 10+ years once tag changes are stitched; foreign filers that file
20-F/40-F with IFRS XBRL often start in 2015–2017; issuers that are **not SEC registrants have nothing**.

### The EU and CA gap (honest)

- **Canada:** most TSX issuers do not file with the SEC, and "SEDAR+ does not accept filings in XBRL
  format" ([SEDAR+ FAQ: Continuous disclosure](https://systems.securities-administrators.ca/onlinehelp/faqs/continuous-disclosure/),
  checked 2026-10-02). There is no free structured source for TSX-only issuers.
- **EU:** ESEF requires Inline XBRL tagging of IFRS consolidated statements in annual reports
  ([ESMA: Electronic Reporting](https://www.esma.europa.eu/issuer-disclosure/electronic-reporting), checked 2026-10-02)
  for financial years beginning on or after 1 January 2020
  ([ESMA ESEF tutorial 3 script](https://www.esma.europa.eu/sites/default/files/library/esma32-60-494_-_esef_tutorial_3_script.pdf), checked 2026-10-02).
  So at most about six annual reports exist in ESEF (FY2020–FY2025): **no 10y CAGR** from ESEF alone.
  There is no single official EU API; XBRL International's filings.xbrl.org collects ESEF filings with
  an API but says "the repository is not complete"
  ([filings.xbrl.org: About](https://filings.xbrl.org/about.html), checked 2026-10-02). Parsing ESEF is
  a bigger job than this feature; not proposed for v1.

### Paid APIs (prices from their own pages)

| Provider | Plan | Price | Coverage / history (as stated) |
|---|---|---|---|
| FMP | Basic | Free, 250 calls/day; financial statements limited to a fixed symbol list ("AAPL, TSLA, AMZN and 84 more") | [FMP pricing](https://site.financialmodelingprep.com/developer/docs/pricing), checked 2026-10-02 |
| FMP | Starter | $19.00/mo billed annually | US coverage, up to 5 years of history, annual fundamentals (same page) |
| FMP | Premium | $49.00/mo billed annually | US, **UK and Canada** coverage, up to 30 years; **no EU** at this tier (same page) |
| FMP | Ultimate | $99.00/mo billed annually | Global coverage, full history (same page). Monthly (non-annual) prices: not stated on the page as fetched. FMP also states that **displaying data requires a separate Data Display and Licensing Agreement** (same page). |
| EODHD | Free | $0, 20 API calls/day, 1 year history, fundamentals **not included** | [EODHD pricing](https://eodhd.com/pricing), checked 2026-10-02 |
| EODHD | EOD Historical All-World | $19.99/mo ($199/yr) | Global end-of-day prices, 30+ years; no fundamentals (same page) |
| EODHD | Fundamentals Data Feed | $59.99/mo ($599.90/yr) | Global fundamentals; **end-of-day prices not included**; fundamentals cost 10 API calls per request; "Fundamentals go back to 1985 … for major US companies and 2000 … for non-US firms" (same page) |
| EODHD | ALL-IN-ONE | $99.99/mo ($999.90/yr) | Prices + fundamentals (same page). Display/redistribution terms: not stated on provider pricing page. |

Cheapest paid setup that covers **EU and CA fundamentals with 10y history plus daily closes**: EODHD
Fundamentals + EOD Historical ($59.99 + $19.99 = $79.98/mo), or ALL-IN-ONE at $99.99/mo; or FMP Ultimate
at $99/mo billed annually (plus a display licence, price not stated). Signing up is Diego's call; this spec
adds nothing paid.

### Recommendation

Start at **$0**: SEC EDGAR `companyfacts` for fundamentals; daily closes through the `DailyCloseProvider`
interface (Yahoo implementation first, source under review in
[Amendment A](#14-amendment-a-daily-close-source-pending)). Every holding
without SEC coverage shows `—` with the reason "not covered" in metric cells, and portfolio metrics show
coverage % (section 9). If Diego's real holdings are mostly EU/TSX-only names, the $0 path will show a
lot of `—`; the decision to buy EODHD is then an informed one. The fundamentals ingest is behind one
small adapter so a paid source can replace it in one ticket.

The daily job refreshes a symbol's `companyfacts` only when it has no data yet or is older than 7 days
(fundamentals change with annual filings, not daily), at no more than 5 requests/second (half the SEC
limit), with a User-Agent naming the app and a contact address that the owner sets in an environment
variable (no address committed to the repo).

## 8. Metric definitions (the app computes every metric itself)

Each data provider computes ratios its own way, and the pricing pages above do not state their formulas,
so the app does not use provider-computed ratios. It stores raw annual values and computes:

All metrics use the company's **last reported fiscal years** (annual periods, 365 ± 30 days, the same
convention as SEC frames: [SEC: EDGAR APIs, "frames"](https://www.sec.gov/search-filings/edgar-application-programming-interfaces),
checked 2026-10-02), in the company's **reporting currency** (ratios are unitless; EPS is shown in
reporting currency with its code). FY0 = latest fiscal year, FY−n = n years earlier. Tags are mapped in a
fixed list per concept (e.g. revenue: `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`,
`SalesRevenueNet`, `SalesRevenueGoodsNet`, `ifrs-full:Revenue`), preferring the most recent filing per year.

| Key | Metric | Formula | Not meaningful (`n/m`) when |
|---|---|---|---|
| `rev_g_1y` | Revenue growth 1y | Rev FY0 / Rev FY−1 − 1 | either value ≤ 0 or missing |
| `rev_cagr_3y`, `_5y`, `_10y` | Revenue CAGR | (Rev FY0 / Rev FY−n)^(1/n) − 1 | either endpoint ≤ 0 (CAGR from a negative or zero base is undefined). FY−n missing → `insufficient_history` |
| `roic_1y` | ROIC (1y) | NOPAT FY0 / average invested capital (FY0, FY−1). NOPAT = operating income × (1 − t), t = income tax expense / pre-tax income, clamped to 0–50%; if pre-tax income ≤ 0 or tax missing, t = 25% (stated in the tooltip). Invested capital = total equity (incl. non-controlling interests) + short-term debt + long-term debt (incl. current portion) − cash and equivalents. Leases excluded. | average invested capital ≤ 0; banks and insurers (SIC 6000–6399 or no operating-income concept), where ROIC is not meaningful |
| `eps_1y` | EPS (1y) | Diluted EPS for FY0, reporting currency | missing |
| `ebit_margin_1y` | EBIT margin (1y) | Operating income FY0 / Rev FY0 (EBIT = reported operating income, no adjustments) | revenue ≤ 0 or operating income missing |
| `gross_margin_1y` | Gross margin (1y) | Gross profit FY0 / Rev FY0; if no gross-profit concept, (Rev − cost of revenue) / Rev | revenue ≤ 0 or neither concept present (e.g. banks) |

Negative values are real values and are shown as negative (negative ROIC, negative margin, negative
growth). `n/m`, `insufficient_history` and `not_covered` cells show `—` with the reason on hover/tap.

## 9. Portfolio aggregates and weighting

- **Weight:** market value in the user's base currency (section 10). For metric *m*, the portfolio value
  is Σ(wᵢ · mᵢ) over holdings with a valid `mᵢ`, where wᵢ = MVᵢ / Σ MV of those same holdings (weights
  renormalised over covered holdings).
- **Coverage %** = Σ MV of holdings with a valid value / Σ MV of all holdings, shown next to every
  portfolio metric (e.g. `12.4% · 78% covered`). 0% coverage shows `—`.
- **Missing / `n/m` / insufficient history / not covered:** excluded from the weighted mean and counted
  against coverage. Never treated as zero.
- **Negative values** (negative ROIC, negative margins, negative growth) are included as they are.
- **CAGR from a negative or zero base** is `n/m` for that company and excluded.
- **EPS:** per-share amounts in different currencies do not add up across companies, so the portfolio row
  shows **weighted 1y EPS growth** (EPS FY0 / EPS FY−1 − 1, `n/m` if either ≤ 0) in the EPS column, labelled
  as such. (Decision D9, approved.)
- Holdings with no price (no close yet) are excluded from weights and from the pie, and listed as
  "price pending".

**Pie chart:** one slice per holding by % of portfolio (base-currency market value), largest first; if
there are more than 10 holdings, the rest are grouped into "Other". Labels show ticker and %. No colour
or label implies good/bad.

## 10. Currency

- **Base currency:** per-user setting, `CAD` (default, Diego is Canadian), `USD` or `EUR`. All totals,
  market values, % of portfolio, weights and the pie use the base currency. Per-share columns (last close,
  average cost) stay in the listing currency, with the code shown.
- **FX source:** Bank of Canada daily exchange rates through the Valet API (free, no key), series such as
  `FXUSDCAD` and `FXEURCAD` ("Daily average exchange rate of the US dollar in Canadian dollars")
  ([Valet API docs](https://www.bankofcanada.ca/valet/docs); series description from
  `https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD/json`, both checked 2026-10-02).
  Rates are "published once each business day by 16:30 ET", are "indicative rates only" from averages of
  quotes, and are quoted as CAD per 1 unit of foreign currency
  ([Bank of Canada: Daily exchange rates](https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/),
  checked 2026-10-02).
- **Currencies the BoC does not publish:** the calculator's EU venues include Copenhagen, Budapest and
  Prague (DKK, HUF, CZK), which are not in the BoC daily list (same page). For those, use the ECB euro
  reference rate (X per EUR) crossed with BoC `FXEURCAD`. ECB rates are "usually updated at around
  16:00 CET every working day, except on TARGET closing days" and are "for information purposes only"
  ([ECB: Euro reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html),
  checked 2026-10-02). SEK and PLN are in the BoC list.
- **Cross rates:** USD or EUR base converts through CAD (e.g. USD→EUR = `FXUSDCAD` / `FXEURCAD`), so one
  source drives every base.
- **Rate date:** the FX rate for the **same date as the price's session date**. If there is no rate that
  day, use the latest earlier rate and show its date. This happens: 2026-09-30 is a Bank of Canada
  holiday with no rates published, while US markets were open
  ([Bank of Canada: Daily exchange rates](https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/), table, checked 2026-10-02).
  The BoC rate is a daily average, not a 16:00 close; the dashboard says so in its note.
- **Cost basis:** average cost is entered in the listing currency. Total return % is computed in the
  listing currency ((close − avg cost) / avg cost). Base-currency amounts (market value, cost, return)
  use the **same** current FX rate for value and cost, so the FX effect since purchase is not captured.
  (Decision D8, approved.)

## 11. Daily refresh

- **Mechanism:** one Vercel Cron Job calling `GET /api/cron/daily-refresh` on the production deployment.
  Vercel calls the production URL with user agent `vercel-cron/1.0`, cron times are **always UTC**
  ([Vercel: Cron Jobs](https://vercel.com/docs/cron-jobs), checked 2026-10-02). The route checks
  `Authorization: Bearer $CRON_SECRET`; Vercel sends that header automatically when a `CRON_SECRET`
  environment variable exists
  ([Vercel: Managing Cron Jobs, "Securing cron jobs"](https://vercel.com/docs/cron-jobs/manage-cron-jobs), checked 2026-10-02).
- **Hobby-plan limits:** cron jobs can run **once per day** at most (more frequent expressions fail the
  deployment), and timing is only per hour: `0 1 * * *` may run any time from 1:00 to 1:59
  ([Vercel: Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), checked 2026-10-02).
  Cron jobs count as function invocations; Hobby function max duration is 300 s, and Hobby is for
  "non-commercial, personal use only" ([Vercel: Hobby plan](https://vercel.com/docs/plans/hobby), checked 2026-10-02).
  The repo does not say which plan the project is on.
- **Schedule:** `0 23 * * *` (23:00–23:59 UTC = 19:00–19:59 ET in summer, 18:00–18:59 ET in winter).
  That is after the US/CA close (16:00 ET), after the BoC publication (16:30 ET), and long after EU closes
  and the ECB publication (16:00 CET), in both daylight and standard time. It also runs on weekends, where
  it finds Friday's data again and changes nothing.
- **Delivery is best effort:** Vercel does not retry a failed cron run, a run can occasionally be missed
  or delivered twice, and the docs ask for idempotent, reconciliation-based jobs with a lock
  ([Vercel: Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), checked 2026-10-02).
  So the job: takes a lock (`refresh_runs.run_date` unique), then for every held symbol fills **all**
  missing sessions since its last stored close via `DailyCloseProvider.getCloses()` (upserts keyed by `(symbol, session_date)`), fills missing
  FX dates, refreshes stale fundamentals, recomputes `metric_values`, and records the run. Running it twice
  gives the same result.
- **Budget:** one `DailyCloseProvider` call per batch of symbols, two FX calls, and SEC calls only for stale symbols, in batches that
  finish well under 300 s; if a batch is not done, the next run continues (reconciliation).
- **New holding added during the day:** the server calls `DailyCloseProvider.getCloses()` for that symbol once, keeps only
  completed sessions, and stores the prior session's close. No intraday bar is ever stored.
- **Previews:** cron only calls production, so preview QA cannot wait for it. When `VERCEL_ENV=preview`
  and the flag is on, the dashboard shows a "Run daily refresh (preview only)" button for signed-in users
  that calls the same job. It does not exist on production.
- **Staleness:** the dashboard header shows "Prices as of <latest session date> close · FX <date>". If the
  last successful run is more than 4 calendar days old, it shows a plain "Prices are out of date" note.

## 12. Acceptance criteria (QA checks these on the PR's Vercel preview)

Global (every ticket): **DASH-00** `/dashboard` and every `/api/dashboard/*` route return 404 on production
until the release go; the calculator at `/` is unchanged (DCA-01..06 still pass); no buy, sell, hold,
"undervalued", "overvalued", rating or target wording anywhere in dashboard copy (extend the DCA-06 scan
to dashboard files); `noindex` still present on `/dashboard`.

| ID | Criterion |
|---|---|
| DASH-01 | Flag off (production): `GET /dashboard` → 404, no dashboard link or sign-in button on `/`. Flag on (preview): `/dashboard` renders. |
| DASH-02 | With no `DASHBOARD_ENABLED` value at all, the app behaves as flag off (fail closed). |
| DASH-03 | Preview: database connection status shows "connected"; tables from `0002_dashboard.sql` exist; `npm run build` logs the migration as applied once and "up to date" on a redeploy. |
| DASH-04 | Signed out: `/dashboard` redirects to sign-in; dashboard API calls return 401. |
| DASH-05 | Sign up with email + password, sign out, sign in again; session survives a page reload. |
| DASH-06 | User A cannot see or change user B's holdings or settings (two accounts on the same preview; direct API calls with A's session and B's ids return 404/403). |
| DASH-07 | Add a holding with ticker, shares and average cost; it persists after reload. Edit and delete work. Shares must be > 0, average cost ≥ 0; duplicate ticker for the same user is refused. |
| DASH-08 | A non US/EU/CA ticker is refused with the calculator's exact message (`X lists on Y. US, EU, and CA listings only.`; BSE message for BSE). |
| DASH-09 | The daily job (through `DailyCloseProvider` only) stores, per held symbol, the latest completed session's close and its session date; running it twice in a row changes nothing; no bar dated "today" is stored while that exchange is open. |
| DASH-10 | The cron route rejects a request without the right `Authorization` header (401). The preview-only refresh button exists on previews and not on production. |
| DASH-11 | FX: the stored `USD` and `EUR` rates for a date equal the BoC Valet values for that date; for a BoC holiday the previous rate is used and its date is shown. DKK/HUF/CZK (if held) use ECB × BoC `FXEURCAD`. |
| DASH-12 | Base currency defaults to CAD; changing it to USD or EUR re-expresses all totals, and the setting persists. |
| DASH-13 | Holdings table shows: ticker, name, shares, average cost (listing ccy), last close + session date (listing ccy), market value (base), cost (base), total return (amount and %), % of portfolio; a total row with total position, total cost, total return. % of portfolio sums to 100.0% (± rounding). |
| DASH-14 | Values recompute only after the daily job: reloading during market hours does not change any price. |
| DASH-15 | Metric column picker: add/remove/reorder columns; choice persists per user. |
| DASH-16 | Revenue growth 1y and 3y/5y/10y CAGR match a hand calculation from the SEC `companyfacts` values for KO (tag stitching) and Philips; RY shows `—` "insufficient history" for 10y; a negative or zero base shows `—` "not meaningful". |
| DASH-17 | ROIC (1y) matches a hand calculation using the section 8 formula for one US filer; a bank (e.g. RY) shows `—` "not meaningful". |
| DASH-18 | EPS (1y) equals the FY0 diluted EPS in `companyfacts`, shown with its reporting currency code. |
| DASH-19 | EBIT margin (1y) = operating income / revenue for FY0, matching `companyfacts`. |
| DASH-20 | Gross margin (1y) matches `companyfacts`; uses revenue − cost of revenue when no gross-profit tag; banks show `—`. |
| DASH-21 | A holding without SEC coverage (e.g. a TSX-only or EU-only issuer) shows `—` "not covered" in every metric cell. |
| DASH-22 | Portfolio row: each metric equals the market-value-weighted mean over covered holdings (hand check with 3 holdings), with coverage % shown; `n/m`/missing are excluded, never counted as 0; negatives are included. |
| DASH-23 | Portfolio EPS column shows weighted 1y EPS growth, labelled as such. |
| DASH-24 | Pie chart: one slice per holding by % of portfolio in base currency, matching the table's % column; > 10 holdings group into "Other"; holdings without a price are excluded and listed as "price pending". |
| DASH-25 | Header shows "Prices as of … close · FX …"; with the last successful run older than 4 days, the out-of-date note appears. |
| DASH-26 | Release check (flag on, full pass): DASH-00..25 all pass in one run on the release candidate, then on production right after the flip. |

## Tickets

Each ticket is one PR, one Vercel preview, one QA pass, merged behind `DASHBOARD_ENABLED`. All carry the
label `dashboard`. The spec was approved on 2026-10-02, so `blocked: spec approval` is removed.

| # | Issue | Ticket | Depends on | ACs |
|---|---|---|---|---|
| T01 | #9 | Feature flag + hidden `/dashboard` route shell | spec approval | DASH-00, 01, 02 |
| T02 | #10 | Per-user storage: Neon Postgres + `0002_dashboard.sql` schema | T01 (+ owner installs Neon) | DASH-03 |
| T03 | #11 | Auth on Vercel: Better Auth email/password, auth schema, preview origins | T01, T02 | DASH-04, 05, 06 |
| T04 | #12 | Holdings table CRUD (no prices yet) | T03 | DASH-07, 08, 06 |
| T05 | #13 | Daily close job (cron, prior-session rule, preview refresh button); all fetching through the `DailyCloseProvider` interface (Amendment A) | T02, T04 | DASH-09, 10, 14 |
| T06 | #14 | FX rates (BoC + ECB cross) and base-currency setting | T02, T05 | DASH-11, 12 |
| T07 | #15 | Holdings valuation: market value, total return, % of portfolio, totals, as-of header; reads stored closes only (written via `DailyCloseProvider`, never a feed directly) | T04, T05, T06 | DASH-13, 14, 25 |
| T08 | #16 | Fundamentals ingest from SEC EDGAR companyfacts (+ metric column picker) | T02, T05, T07 | DASH-15, 21 |
| T09 | #17 | Metric: Revenue growth 1y + 3y/5y/10y CAGR | T08 | DASH-16 |
| T10 | #18 | Metric: ROIC (1y) | T08 | DASH-17 |
| T11 | #19 | Metric: EPS (1y) | T08 | DASH-18 |
| T12 | #20 | Metric: EBIT margin (1y) | T08 | DASH-19 |
| T13 | #21 | Metric: Gross margin (1y) | T08 | DASH-20 |
| T14 | #22 | Portfolio aggregates (weighted, coverage %) | T07, at least one of T09–T13 (each metric gets its portfolio cell as it lands) | DASH-22, 23 |
| T15 | #23 | Holdings pie chart by % of portfolio | T07 | DASH-24 |
| T16 | #24 | Release: full flag-on QA run, then production flip on Diego's go | T01–T15 merged with QA PASS | DASH-26 |

GitHub issues #9–#24 on diegolbquintela/orpheus-app, each labelled `dashboard`, each linking back to this spec PR (#8).

## Release plan

1. **Per ticket:** harness → spec → ticket → PR → CI green → Engineering Lead review → QA PASS on the PR's
   preview → Lead merges. Production stays flag off, so `/dashboard` is a 404 there after every merge
   (DASH-00 is re-checked on production after each merge).
2. **"Cleanly" means:** every ticket T01–T15 is merged with a QA PASS on its preview, there are no open
   QA fails or open bugs labelled `dashboard`, and CI on `main` is green.
3. **Release candidate:** a preview deployment of the current `main` commit (e.g. a `release/dashboard`
   branch pointing at `main`, no other changes), flag on by Preview scope. QA runs the **full** DASH-00..25
   pack plus DCA-01..06 there in one run (DASH-26). Any fail goes back to a ticket; the run restarts after
   the fix is merged.
4. **Go:** only on Diego's explicit go, relayed by the Chief of Staff. Then the Engineering Lead (or Diego)
   sets `DASHBOARD_ENABLED=true` (and the auth/DB variables) for the **Production** environment and
   redeploys `main` (a value change only applies to new deployments,
   [Vercel: Environment variables](https://vercel.com/docs/environment-variables), checked 2026-10-02).
   QA re-runs the pack on production right away.
5. **Rollback:** set `DASHBOARD_ENABLED` to anything other than `true` (or remove it) for Production and
   redeploy; `/dashboard` is a 404 again and the calculator is untouched. User data stays in the database.
   Vercel Instant Rollback to the previous deployment is the faster fallback; note it also reverts cron
   jobs to that deployment's set ([Vercel: Managing Cron Jobs, "Rollbacks with cron jobs"](https://vercel.com/docs/cron-jobs/manage-cron-jobs), checked 2026-10-02).
6. After the release, README, this spec (status → "live") and `AGENTS.md` are updated in the T16 PR.

## 13. Decisions record (approved 2026-10-02)

Diego approved **all decisions as recommended** on 2026-10-02. This record replaces the earlier
"Open questions" and "Decisions for Diego" lists.

| # | Decision | Approved outcome | Cost |
|---|---|---|---|
| D1 | Auth | Better Auth (already in repo), email/password, Grok broker path removed (section 3) | $0 |
| D2 | Storage | Neon Postgres Free via Vercel Marketplace, preview branching off (section 4) | $0 |
| D3 | Data source | SEC EDGAR `companyfacts` for fundamentals; daily close through `DailyCloseProvider` (Yahoo first). **Daily-close source amended: see Amendment A (pending)** | $0 |
| D4 | Weighting | Market-value weighted in base currency, renormalised over covered holdings, coverage % shown, `n/m` excluded (section 9) | — |
| D5 | Currency | CAD default, per-user USD/EUR; BoC daily rates (ECB cross for DKK/HUF/CZK), same date as the price (section 10) | $0 |
| D6 | Refresh | One Vercel Cron at `0 23 * * *` UTC, idempotent catch-up, `CRON_SECRET`; preview-only manual refresh button (section 11) | $0 |
| D7 | Holdings input | Manual holdings entry instead of an IBKR/Fiscal.ai feed first (settles the DCA spec's sequence note) | — |
| D8 | Cost basis | Average cost in listing currency; base-currency amounts use the current FX rate for value and cost (FX effect since purchase not shown) | — |
| D9 | Portfolio EPS | Weighted 1y EPS growth shown in the portfolio EPS column, labelled as such | — |
| D10 | Paid data | Stay on the $0 path; non-SEC EU/TSX names show "not covered"; no paid vendor now | $0 |
| D11 | Sign-in methods | Email/password only at launch; Google later only as its own ticket | $0 |
| D12 | Who may sign up | Allow-list of emails in a Vercel env var (no open sign-up); handled in T03 (#11) | $0 |

## 14. Amendment A: daily-close source (pending)

Status: **pending.** The Engineering Lead is researching alternative daily-close sources (because the
Yahoo chart endpoint is unofficial and its Terms of Service restrict automated collection, section 6).
Findings, each with its provider-page citation and date checked, will be added here in a follow-up spec PR.
Until then the approved design stands, with one firm rule:

**All price fetching sits behind one provider interface,** so the source can change without touching the
dashboard UI, tables, metrics or the cron job:

```ts
interface DailyClose {
  symbol: string;   // feed symbol, e.g. "RY.TO"
  date: string;     // exchange-local session date, YYYY-MM-DD (completed sessions only)
  close: number;    // raw official close, listing currency
  currency: string; // ISO code, e.g. "CAD"
  source: string;   // provider id, e.g. "yahoo"
}

interface DailyCloseProvider {
  /** Closes for completed sessions on or before `date` (the latest one, plus any missing since `since`). */
  getCloses(symbols: string[], date: string, opts?: { since?: string }): Promise<DailyClose[]>;
}
```

- One implementation is active, chosen in one server-side module; the first wraps
  `src/lib/dca/yahoo.server.ts`.
- Only the daily job (T05, #13) and the "new holding" path call it. Everything else (T07 #15 valuation,
  T14 #22 aggregates, T15 #23 pie) reads the stored `daily_closes` rows, whose `source` column records which
  provider wrote them.
- Swapping the source = a new implementation + a spec update under this amendment; no dashboard ticket
  changes.

## Sources (all checked 2026-10-02)

- Vercel: [Environment variables](https://vercel.com/docs/environment-variables) ·
  [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) ·
  [Cron Jobs](https://vercel.com/docs/cron-jobs) · [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) ·
  [Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Hobby plan](https://vercel.com/docs/plans/hobby) ·
  [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) · [Marketplace: Neon](https://vercel.com/marketplace/neon)
- Neon: [Pricing](https://neon.com/pricing) · [Vercel-Managed Integration](https://neon.com/docs/guides/vercel-managed-integration)
- Upstash: [Redis pricing](https://upstash.com/pricing/redis) · Supabase: [Pricing](https://supabase.com/pricing) · Clerk: [Pricing](https://clerk.com/pricing)
- Better Auth: [Installation](https://www.better-auth.com/docs/installation) · [Google](https://www.better-auth.com/docs/authentication/google) ·
  [OAuth Proxy](https://www.better-auth.com/docs/plugins/oauth-proxy) · Google: [OAuth 2.0 for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- SEC: [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) · [Accessing EDGAR Data](https://www.sec.gov/os/accessing-edgar-data)
- Canada: [SEDAR+ FAQ](https://systems.securities-administrators.ca/onlinehelp/faqs/continuous-disclosure/) ·
  [Bank of Canada Valet API](https://www.bankofcanada.ca/valet/docs) · [BoC daily exchange rates](https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/)
- EU: [ESMA Electronic Reporting](https://www.esma.europa.eu/issuer-disclosure/electronic-reporting) ·
  [ESMA ESEF tutorial 3](https://www.esma.europa.eu/sites/default/files/library/esma32-60-494_-_esef_tutorial_3_script.pdf) ·
  [filings.xbrl.org](https://filings.xbrl.org/about.html) · [ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- Data vendors: [FMP pricing](https://site.financialmodelingprep.com/developer/docs/pricing) · [EODHD pricing](https://eodhd.com/pricing) ·
  [Yahoo Terms of Service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)
