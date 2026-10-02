# Orpheus: DCA vs lump-sum calculator

This is the Orpheus web app. Right now it is the DCA vs lump-sum calculator. Over time it is meant to
become the firm's operating front. Only the calculator exists today.

You pick tickers and weights, a date range, a starting capital, a contribution and a frequency (weekly
or monthly). The app compares two cash plans over the same window:

- **Lump sum**: the starting capital goes in on day one.
- **DCA**: the contribution goes in as new cash on each scheduled date.

It shows invested amount, end value, money-weighted return (XIRR), total return, CAGR, max drop and
shares per name, plus one value chart per plan. Prices come from Yahoo's daily chart data through a
same-origin server route.

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
`src/components/desk.tsx`, and the price route is `src/routes/api/chart.ts` → `src/lib/dca/yahoo.server.ts`.

## Run it locally

You need Node 22 (≥ 22.12) and npm.

```bash
npm ci
npm run dev          # http://localhost:8080
```

No database or secrets are needed to run the calculator locally. Sign-in is off by default:
`.grok/app-env.json` sets `VITE_AUTH_ENABLED` to `"false"`, and that value is not a secret.

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
node qa/tools/full.mjs --base-url https://<preview>.vercel.app
python3 qa/tools/fetch.py --base-url https://<preview>.vercel.app --out /tmp/orpheus-fetch
```

## Deploy

The app is hosted on Vercel.

- `main` deploys automatically to production: https://orpheus-app-beta.vercel.app.
- Every pull request gets its own public preview URL, which vercel[bot] posts as a comment on the PR.
- Vercel is the only deploy path. Deploying through Grok has stopped. The old Grok copy at
  https://island-pearl-eagle-hill.grok.me stays published as a frozen old copy until the Chief of Staff
  confirms its retirement with Diego. It is not production and does not get updates.

## Dashboard (hidden, behind a flag)

A signed-in dashboard is being built ticket by ticket (spec: `attachments/dashboard-spec.md`). Until
Diego gives the release go, it stays hidden behind one **server-only** env var, `DASHBOARD_ENABLED`:

- Only the exact value `true` turns it on. Unset or any other value means off.
- Off (production): `/dashboard` and every `/api/dashboard/*` route return a real **404**. The page 404
  is the same as for any unknown URL (no dashboard title or copy); the API answers JSON for every method.
- On (Vercel **Preview** environment only, set by an owner): `/dashboard` needs a session (see "Dashboard
  sign-in" below), and `GET /api/dashboard/status` returns `{"dashboard":"enabled"}` plus, off production,
  sign-in diagnostics (`signIn`, `signUpAllowList`; names and states only). Other methods: 405 JSON,
  `Allow: GET, HEAD`.
- The calculator at `/` doesn't read the flag and doesn't link to the dashboard.

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

**Dashboard holdings (T04).** Signed in, `/dashboard` lists your holdings and lets you add, edit and
delete them. Each row shows the ticker's last stored close and its session date, or "price pending"
(T05, below), and its market value, cost, total return and % of portfolio, with totals, in your base
currency (T06 and T07, below).
- `GET /api/dashboard/holdings` lists yours; `POST` with `{symbol, shares, avgCost}` adds one (201).
  `GET`/`PUT`/`DELETE /api/dashboard/holdings/<id>` reads, edits (`{shares, avgCost}` only) or deletes one.
  Same gate as the other per-user APIs: 404 flag off, 405 wrong method (with `Allow`), 401 signed out,
  403 if the request names another user id. Another user's holding id answers 404 "Holding not found.".
- Validation: shares > 0, average cost ≥ 0 (per share, in the listing's own currency), up to 6 decimals.
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

**Dashboard holdings valuation (T07).** The holdings table shows ticker, name, shares, average cost and
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
- On previews (flag on), `/dashboard` shows a status line, "Database: connected · 11/11 tables" when Neon is
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
