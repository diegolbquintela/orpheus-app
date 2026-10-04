# Dashboard release prep (#24, T16)

> **Status note, 2026-10-04:** production now serves the dashboard. Issue #46 says "Prod has the dashboard ON",
> and a read-only `node scripts/release-smoke.mjs https://orpheus-app-beta.vercel.app on` on 2026-10-04 passed
> (`/dashboard` 307 → `/dashboard/sign-in`, `/api/dashboard/status` → `{"dashboard":"enabled"}`, `/api/dashboard/db`
> 404, per-user APIs and cron 401). When the flip happened, who ran which runbook steps and which database option
> was used are **not recorded in this repo**; the prep text below is kept as written. EL's #45 decisions are in §5.
> Since #46 the calculator is at `/calculator` and `/` is the home page; `release-smoke.mjs` checks both.

Status: **prep only.** Nothing here has been run against production except read-only GETs
(`scripts/release-smoke.mjs … off`). Production keeps `/dashboard` as a 404 until Diego's explicit go
(spec "Release plan", step 4). Environment variables are set by an owner (the Engineering Lead or Diego),
never by a bot; this file names variables and formats only, never values.

Verified against the code at the commit of this PR (`scripts/db-env.mjs`, `scripts/migrate.mjs`,
`src/lib/auth/*`, `src/lib/dashboard/*`, `vercel.json`). Anything not checkable from the repo is marked
**unverified**.

Contents: [1. QA checklist](#1-flag-on-qa-checklist-dash-26) · [2. Production env](#2-production-environment-variables) ·
[3. Runbook](#3-release-runbook-ordered) · [4. Test account](#4-test-account-for-diego) ·
[5. Open decisions](#5-open-decisions)

---

## 1. Flag-on QA checklist (DASH-26)

Run in **one pass**, first on the release-candidate preview of `main` (flag on by Preview scope), then on
production right after the flip. Any FAIL goes back to its ticket and the whole run restarts after the fix
merges (spec "Release plan", step 3). Use two allow-listed test accounts (A and B) where noted.

Quick automated part (read-only, GET only, no credentials):
`node scripts/release-smoke.mjs <url> preview` on the release candidate, `… on` on production after the
flip, `… off` on production before the flip and after a rollback.

### Global: DASH-00 (every ticket, and after the release)

| Check | Expected |
|---|---|
| Before the flip: production `/dashboard`, `/dashboard/sign-in` and every `/api/dashboard/*`, `/api/auth/*`, `/api/cron/daily-refresh` | 404 (page: the generic 404, no dashboard copy; API: 404 JSON) for every method |
| Calculator at `/calculator` (moved from `/` in #46) | Unchanged; DCA-01..06 pass (table below). The site menu's Dashboard item and the home card link to `/dashboard` on every page, flag on or off (#46); flag off they land on the generic 404 |
| Wording scan over dashboard copy (page, tooltips, labels, errors) | No buy, sell, hold, "undervalued", "overvalued", rating, score or target wording |
| `noindex` | `<meta name="robots" content="noindex, nofollow">` and `X-Robots-Tag: noindex, nofollow` on `/`, `/calculator`, `/dashboard`, `/dashboard/sign-in` |
| Referrers and trackers (#50) | `Referrer-Policy: no-referrer` on every response (pages, `/api/*`, static files) and `<meta name="referrer" content="no-referrer">` on pages; no request to grok.com and no `.grok.com` cookie (`release-smoke.mjs`, `qa/tools/privacy.mjs`) |
| Rollback behaviour (rehearse on a preview before the flip; see §3 step 9) | Flag not exactly `true` + redeploy → `/dashboard` 404 again, API 404 JSON, calculator untouched, data kept |

### DCA calculator regression (canonical pack, `qa/CANONICAL-AC-PACK.md`)

| ID | Rule | Expected |
|---|---|---|
| DCA-01 | Dividends reinvested | The result reflects reinvested dividends (stated, or visible in the output) |
| DCA-02 | DCA = extra cash on each date | Each scheduled date adds the contribution on top of prior holdings |
| DCA-03 | Lump sum on day one | Starting capital is fully deployed on the start date |
| DCA-04 | Multi-ticker weighted basket | Several tickers with weights; the weights are applied |
| DCA-05 | US/EU/CA listings only | Others refused (e.g. VOD.L: HTTP 400 with the app's message) |
| DCA-06 | No buy/sell advice | No buy, sell, hold or recommendation output, however worded (there is no disclaimer line; that is intended, not a fail) |

Offline fixtures for these: `qa/fixtures.json` (see `qa/README.md`).

### T01 (#9): flag and hidden route

| ID | Expected |
|---|---|
| DASH-01 | Flag off: `GET /dashboard` → 404, no sign-in button or dashboard copy on any page except the site menu's Dashboard item and the home card (#46). Flag on: `/dashboard` renders (after sign-in) |
| DASH-02 | No `DASHBOARD_ENABLED` value at all (or anything but exactly `true`, e.g. `TRUE`, ` true`) behaves as flag off |

### T02 (#10): storage

| ID | Expected |
|---|---|
| DASH-03 | Preview: `GET /api/dashboard/db` → `{"state":"connected","tables":11,"expectedTables":11,"missingTables":[],"migrationApplied":true}`; the signed-in page shows "Database: connected · 11/11 tables" (previews only). The build log shows `[migrate]` applying pending files once and "up to date" on a redeploy. Production: `/api/dashboard/db` stays 404 (see §5 N3); the DB check there is the signed-in page working (holdings persist across reloads) and the build log's `[migrate]` lines |

### T03 (#11): sign-in

| ID | Expected |
|---|---|
| DASH-04 | Signed out: `/dashboard` → redirect (307) to `/dashboard/sign-in`; `/api/dashboard/{me,settings,holdings,holdings/<id>,fx,columns}` → 401 JSON |
| DASH-05 | Sign up (allow-listed email, password ≥ 8 chars) → signed in; sign out; sign in again; the session survives a reload. A non-allow-listed email gets 403 "Sign-up is limited to invited email addresses." |
| DASH-06 | With A's session, B's holding id / settings → 404/403; A never sees B's rows |

### T04 (#12): holdings CRUD

| ID | Expected |
|---|---|
| DASH-07 | Add ticker + shares + average cost; persists after reload; edit and delete work; shares > 0, average cost ≥ 0; duplicate ticker for the same user refused (409). Delete: one click sends exactly one DELETE (200) and the console shows no 404 (#38); the row shows "Deleted" until the page refreshes (automated: `holdings.dom.test.tsx`) |
| DASH-08 | Non US/EU/CA ticker refused with the calculator's exact message (`X lists on Y. US, EU, and CA listings only.`; BSE message for BSE, e.g. TCS.BO; VOD.L refused) |
| DASH-06 | (again) A cannot change B's holdings |

### T05 (#13): daily close job

| ID | Expected |
|---|---|
| DASH-09 | The job stores, per held symbol, the latest completed session's close and its session date; a second run in a row inserts nothing; no bar dated today while that exchange is open. Preview: "Run daily refresh (preview only)" button; production: Vercel Cron |
| DASH-10 | `GET /api/cron/daily-refresh` without the right `Authorization: Bearer` → 401 JSON. The preview refresh button exists on previews, not on production (`/api/dashboard/refresh` 404 there) |
| DASH-14 | Reloading during market hours never changes a price; values change only after the daily job |

### T06 (#14): FX and base currency

| ID | Expected |
|---|---|
| DASH-11 | Stored USD/EUR rates for a date equal the Bank of Canada Valet values; on a BoC holiday the previous rate is used and its date shown. DKK/HUF/CZK (if held): BoC FXEURCAD ÷ ECB X-per-EUR |
| DASH-12 | Base currency defaults to CAD; switching to USD/EUR re-expresses all totals; the setting persists |

### T07 (#15): valuation

| ID | Expected |
|---|---|
| DASH-13 | Columns: ticker, name, shares, average cost (listing ccy), last close + session date, market value (base), cost (base, D8: same rate as the price), total return (amount and %), % of portfolio; total row. % of portfolio sums to 100.0% (± rounding: the one-decimal labels may not sum to exactly 100.0) |
| DASH-14 | (as above) |
| DASH-25 | Header "Prices as of … close · FX …"; with the last successful run older than 4 days, "Prices are out of date" |

### T08 (#16): fundamentals and column picker

| ID | Expected |
|---|---|
| DASH-15 | Metric column picker: add, remove, reorder; persists per user (A's choice doesn't change B's) |
| DASH-21 | A holding without SEC coverage (e.g. PHIA.AS, a TSX-only or EU-only issuer) shows "— not covered" in every metric cell |

### T09–T13 (#17–#21): metrics (hand checks from SEC `companyfacts`)

| ID | Expected |
|---|---|
| DASH-16 | Revenue growth 1y and 3y/5y/10y CAGR: KO 1.9% / 3.7% / 7.7% / 0.8% (tag stitching), Philips (PHG; PHIA.AS is not covered); RY 10y "— insufficient history"; negative/zero base "— not meaningful" |
| DASH-17 | ROIC (1y): KO 17.4%; a bank (RY) "— not meaningful" |
| DASH-18 | EPS (1y) = FY0 diluted EPS with currency: KO 3.04 USD, Philips (PHG) 0.93 EUR, RY 14.07 CAD, ASML 24.71 EUR (unrounded, as reported) |
| DASH-19 | EBIT margin (1y): KO 28.7%; negative margins shown negative; revenue ≤ 0 "— not meaningful" |
| DASH-20 | Gross margin (1y): KO 61.6%; revenue − cost of revenue used when no gross-profit figure for FY0; banks "—" |

### T14 (#22): portfolio row

| ID | Expected |
|---|---|
| DASH-22 | Each metric's portfolio cell = market-value-weighted mean over holdings with a value, with "· N% covered"; n/m, insufficient history/data and not covered excluded (never 0); negatives included; holdings without a price/FX rate outside weights and coverage, flagged in the total row ("1 holding without a price excluded" / "N holdings …", "… or FX rate" when FX pending); coverage whole %, never 0%/100% unless exact |
| DASH-23 | EPS column's portfolio cell: weighted 1y EPS growth with the visible sub-label "EPS growth 1y (weighted)" |

### T15 (#23): pie

| ID | Expected |
|---|---|
| DASH-24 | One slice per holding by % of portfolio in base currency; each label identical to the table's % (shared formatter; the labels may not sum to exactly 100.0); > 10 holdings → 10 largest + "Other"; holdings without a price get no slice and are listed as "price pending" (FX: "FX pending"); no priced holding: "No holdings with a price yet."; zero holdings: "No holdings yet." and no pie; neutral greys, ticker + % labels |

### T16 (#24): release

| ID | Expected |
|---|---|
| DASH-26 | DASH-00..25 + DCA-01..06 all pass in one run on the release candidate, then on production right after the flip |
| Rollback rehearsal | On a preview: flag off + redeploy → 404 (before the production flip) |

---

## 2. Production environment variables

Today (per `AGENTS.md`): Production has **no** `DASHBOARD_ENABLED` and **no** Neon variables. Preview has
`DASHBOARD_ENABLED=true`, the auth variables, `CRON_SECRET`, `SEC_CONTACT_EMAIL`,
`DASHBOARD_SIGNUP_ALLOWLIST` and the Neon integration's `orpheus_app_preview_*` variables (Preview and
Development scope). Who sets every row below: **the Engineering Lead (EL)**, in Vercel → Project →
Settings → Environment Variables, scope **Production** only. A changed value only applies to new
deployments, so each change needs a redeploy.

| Name | Purpose (code that reads it) | Example format (not a real value) | Required for prod |
|---|---|---|---|
| `DASHBOARD_ENABLED` | The flag. Only the exact string `true` turns the dashboard on (`src/lib/dashboard/flag.server.ts`). Also gates production migrations at build (`scripts/db-env.mjs` `migrationSkipReason`) | `true` | **Yes**, set last (runbook step 6) |
| `DATABASE_URL` | Pooled Postgres URL for app queries and Better Auth (`scripts/db-env.mjs` `resolveDatabaseUrl`; wins over the prefixed names) | `postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<db>?sslmode=require` | **Yes** |
| `DATABASE_URL_UNPOOLED` | Direct (non-pooler) URL used by migrations (`resolveMigrationUrl`; falls back to `DATABASE_URL`) | `postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require` | Recommended (migrations prefer a direct connection) |
| `BETTER_AUTH_SECRET` | Session signing (`src/lib/auth/server.ts`); without it, on Vercel, `/api/auth/*` answers 503 | random, ≥ 32 characters, e.g. from `openssl rand -base64 32`; **a new value, not the Preview one** | **Yes** |
| `BETTER_AUTH_URL` | Production origin; on `VERCEL_ENV=production` it is the only base URL and trusted origin (`src/lib/auth/config.ts` `authOrigins`); unset → sign-in "not configured (BETTER_AUTH_URL not set)" | `https://orpheus-app-beta.vercel.app` (no trailing slash; if a custom domain is added later, that domain) | **Yes** |
| `VITE_AUTH_ENABLED` | Auth on/off; read at **build** time by the client (`src/lib/auth/client.ts`) and at runtime by the server (`authReadiness`). The repo's `.grok/app-env.json` sets `"false"` for local runs and a real env value wins, so a build without it may bake in `false` | `true` | **Yes (set to `true` before the deploy)**. Whether Preview has it set explicitly is **unverified** from the repo; EL should mirror Preview's value |
| `DASHBOARD_SIGNUP_ALLOWLIST` | Invite list for sign-up (`src/lib/auth/config.ts`); unset/empty = nobody can sign up; existing users can still sign in | `diego@example.com, other@example.com` (commas, semicolons or spaces; case-insensitive) | **Yes** (at least Diego's address) |
| `CRON_SECRET` | Vercel sends it as `Authorization: Bearer <value>` to the cron route; the route refuses everything without it (`src/lib/dashboard/refresh-api.server.ts`) | random, ≥ 16 characters, no spaces/newlines; **a new value, not the Preview one** | **Yes** (else the daily job never runs: every cron call is 401) |
| `SEC_CONTACT_EMAIL` | SEC EDGAR User-Agent contact (`fundamentals.server.ts`); without it no SEC request is made and every metric reads "coverage check pending" | `name@example.com` (an address the SEC may contact) | **Yes** for metrics (the dashboard works without it, minus metrics) |

Not needed in Production: `orpheus_app_preview_*` (the Preview integration's names; `DATABASE_URL` wins if
both exist), `VERCEL*` (system variables Vercel sets itself).

### Production database: options

| Option | What | For | Against |
|---|---|---|---|
| **A. Dedicated Neon production branch (recommended)** | In the same Neon project, create a branch `production` as **schema-only** from `main` (Neon Console → Branches → New branch → "Schema only"; [Neon docs](https://neon.com/docs/guides/branching-schema-only), checked 2026-10-03), or an empty branch/database; copy its pooled and direct connection strings into `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (Production scope). Migrations create anything missing (all idempotent) | Production data never mixes with QA test accounts, test holdings or preview refresh runs; a preview build of an unmerged branch can never migrate the production schema (previews migrate the branch they use at build time); a rollback of a preview experiment can't touch real data | One more branch (Neon Free: 10 branches per project); connection strings are copied by hand (not managed by the integration); schema-only branches are a newer Neon feature (if not available on the plan: **unverified**, use a branch then drop data, or a separate database) |
| B. The `main` branch previews share | Add Production scope to the existing integration variables (`orpheus_app_preview_*`) | Zero setup; data already there | Production would share users, holdings and market-data runs with every preview and QA; any preview build migrates the production schema before review; QA test accounts live in production; the `orpheus_app_preview_` names read as preview-only |

**Recommendation: A.** The point of the flag is that production is never touched by preview work; B breaks
that for the data. Market data (closes, FX, fundamentals) refills itself in production from the daily job
and the add-holding backfill.

### Migrations against production

- All files in `migrations/` are idempotent (`IF NOT EXISTS`, guarded `DO $$` blocks, `DROP … IF EXISTS`
  then `ADD`) and recorded in `_migrations`; each file runs in one transaction. Current set: `0001_auth.sql`
  … `0007_fundamentals_parser_version.sql` (11 tables, as `/api/dashboard/db` reports).
- The production **build** runs `npm run db:migrate` but skips it while `DASHBOARD_ENABLED` is not `true`
  (log: `[migrate] skipped: VERCEL_ENV=production and dashboard flag off`). With the flag on, the build
  migrates before the deployment goes live; a failed migration fails the build, so the deployment isn't
  promoted.
- To migrate **before** the flip (recommended, so the flip deploy only says "up to date"), EL runs, from a
  checkout of the release commit on a trusted machine (not a bot box), without putting the URL in shell
  history:
  ```bash
  read -rs DATABASE_URL_UNPOOLED && export DATABASE_URL_UNPOOLED   # paste the production direct URL
  npm ci && npm run db:migrate                                     # logs "[migrate] using DATABASE_URL_UNPOOLED", applies 0001…0007
  npm run db:migrate                                               # second run: nothing pending
  unset DATABASE_URL_UNPOOLED
  ```
  (`VERCEL_ENV` is unset locally, so the production skip rule doesn't apply.)

### Cron

`vercel.json`: `{ "path": "/api/cron/daily-refresh", "schedule": "0 23 * * *" }`: daily at 23:00 UTC
(19:00 Toronto in summer, 18:00 in winter). Vercel runs crons on **production deployments only** and sends
`CRON_SECRET` as the Bearer header ([Vercel: Cron Jobs](https://vercel.com/docs/cron-jobs) and "Securing cron
jobs", checked 2026-10-03). With the flag off the route is 404, so the cron is a no-op today. Instant
Rollback also reverts the cron set to that deployment's.

---

## 3. Release runbook (ordered)

Preconditions: T01–T15 merged with QA PASS, #38/#44 merged, no open `dashboard` bugs, CI green on `main`,
release candidate (preview of `main`) passed §1 in one run, rollback rehearsed on a preview, **Diego's
explicit go** relayed by the Chief of Staff.

1. **Baseline (read-only).** `node scripts/release-smoke.mjs https://orpheus-app-beta.vercel.app off` → OK.
   Note the current production deployment (Vercel → Deployments) for Instant Rollback.
2. **Database (EL).** Create the Neon production branch (§2 option A); note its pooled and direct URLs.
3. **Env, flag still off (EL).** Production scope: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
   `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `VITE_AUTH_ENABLED=true`, `DASHBOARD_SIGNUP_ALLOWLIST`,
   `CRON_SECRET`, `SEC_CONTACT_EMAIL`. Do **not** set `DASHBOARD_ENABLED` yet.
4. **Migrate (EL).** Run the migration commands in §2 against the production branch; second run: nothing
   pending.
5. **Deploy with the flag off.** Redeploy `main` to Production. Build log: `[migrate] skipped: VERCEL_ENV=production
   and dashboard flag off`. Smoke: `release-smoke.mjs … off` → OK (nothing visible yet, calculator unchanged).
6. **Flip (EL).** Set `DASHBOARD_ENABLED=true` (Production), redeploy `main`. Build log: `[migrate]` with
   nothing pending ("up to date").
7. **Smoke.** `node scripts/release-smoke.mjs https://orpheus-app-beta.vercel.app on` → OK
   (`/dashboard` 307 → sign-in, status `{"dashboard":"enabled"}`, `/api/dashboard/db` 404, per-user APIs 401,
   cron 401 without its header).
8. **QA run on production.** Diego (or QA with an allow-listed address) creates an account (§4) and QA runs §1
   in one pass. The first daily job runs at the next 23:00 UTC; until then, holdings show "price pending"
   unless the add-holding backfill has finished (it runs in the background right after adding). Check the
   next day: Vercel → Cron Jobs shows a 200 run; the header "Prices as of …" updates.
9. **Rollback (any FAIL that can't wait for a fix).** Set `DASHBOARD_ENABLED` to anything but `true` (or remove
   it) for Production and redeploy → `/dashboard` 404, API 404 JSON, calculator untouched; data stays in the
   database. Verify with `release-smoke.mjs … off`. Faster fallback: Vercel Instant Rollback to the deployment
   noted in step 1 (also reverts the cron set). Rehearse this on a preview before step 6 (Preview-scoped
   branch override or a preview deployment with the flag off).
10. **After the release:** README, spec status → "live" and AGENTS.md updated in the T16 PR (not in this
    prep PR).

---

## 4. Test account for Diego

How it works in the code (`src/lib/auth/config.ts`, `instance.server.ts`, `src/routes/dashboard_.sign-in.tsx`):
sign-up is email + password only, limited to `DASHBOARD_SIGNUP_ALLOWLIST` (checked before anything else, and
again when the user row is created); passwords need ≥ 8 characters; no email verification and no password
reset email exist (no email sender). Existing accounts can always sign in, even if later removed from the
list. Production accounts live only in the production database (option A), separate from preview accounts.

**Getting an account on production** (after runbook step 6):
1. EL adds Diego's address to `DASHBOARD_SIGNUP_ALLOWLIST` (Production) in step 3, so no extra redeploy is
   needed. (If added later: redeploy after the change.)
2. Diego opens https://orpheus-app-beta.vercel.app/dashboard → redirected to `/dashboard/sign-in`.
3. "New here? Create an account" → his invited email, a password of 8+ characters → "Create account". He is
   signed in (`autoSignIn`) and lands on the empty dashboard ("No holdings yet.").
4. Keep the password in a password manager: there is no reset by email. If lost, the account has to be
   removed (below) and created again.

**Removing a test account** (EL, Neon Console → production branch → SQL Editor):
```sql
-- 1. user_metric_columns has no foreign key to "user", so delete its rows first.
DELETE FROM user_metric_columns WHERE user_id IN (SELECT id FROM "user" WHERE lower(email) = lower('test@example.com'));
-- 2. Deleting the user cascades to session, account, user_settings and holdings (ON DELETE CASCADE).
DELETE FROM "user" WHERE lower(email) = lower('test@example.com');
```
Then remove the address from `DASHBOARD_SIGNUP_ALLOWLIST` and redeploy, so it can't sign up again. Shared
market data (instruments, closes, FX, fundamentals) stays; it isn't per user. That Better Auth stores emails
lower-cased is **unverified** here, hence `lower()` on both sides.

---

## 5. Open decisions

- **N3: should `/api/dashboard/status` and `/api/dashboard/db` stay public once production has the flag on?**
  What the code does today (verified): on production `/api/dashboard/status` returns only
  `{"dashboard":"enabled"}` (the sign-in/cron/SEC diagnostics are hidden when `VERCEL_ENV=production`), and
  `/api/dashboard/db` is **404 for every method on production even with the flag on** (`db.server.ts`).
  **Recommendation: keep it that way** (no code change). It is stricter than EL's lean (`/db` behind
  `CRON_SECRET` or a session): nothing about the database is reachable on production at all, and no one needs to
  use the cron secret by hand. Production DB health is visible from the signed-in page working, the build
  log's `[migrate]` lines and Vercel's cron run status. Previews are unchanged: QA keeps calling
  `GET /api/dashboard/db` signed out (DASH-03), and `release-smoke.mjs … preview` checks it. If EL still wants a
  production `/db`, the small change is: on production, serve it only to a signed-in session (not `CRON_SECRET`,
  so the secret never leaves Vercel); about 10 lines plus tests.
- Option A vs B for the production database (§2): recommendation A; EL/Diego decide.
- `VITE_AUTH_ENABLED` in Production: set to `true` (recommended), matching Preview (Preview's explicit value is
  unverified from the repo).
- New `BETTER_AUTH_SECRET` and `CRON_SECRET` for Production (recommended) rather than reusing Preview's.

### Decided by the Engineering Lead (#45)

These settle the open items above. Recorded here as decided; this file doesn't say whether or when each was
carried out on production (see the status note at the top).

1. **Database: a dedicated Neon production branch**, not the shared `main` branch the previews use (option A).
   If schema-only branching isn't available on the Free plan, create an empty branch instead and run
   `npm run db:migrate` against it (§2 "Migrations against production").
2. **`/api/dashboard/db` and `/api/dashboard/status` stay as coded** (N3): `/db` is 404 for every method on
   production; `/status` is public and returns only `{"dashboard":"enabled"}` there.
3. **`VITE_AUTH_ENABLED=true` on Production at the flip.**
4. **Fresh production secrets** (`BETTER_AUTH_SECRET`, `CRON_SECRET`): generated and set by the EL through the
   Vercel connector at the flip, never pasted in chat, PRs, logs or the vault, and not reused from Preview.
5. **Nothing flips without Diego's explicit go.**
