# AGENTS.md: harness for bots working in orpheus-app

This is the harness for any bot (SWE, QA, Triage, Engineering Lead, Nightly Audit) working in this repo.
Read it before you touch anything. Plain build conventions only; team process lives in the vault
(`Orpheus/kb/specs/TECH-TEAM.md`, `Orpheus/kb/specs/HARNESS.md`) and is summarized here where it
affects the repo.

## Source-of-truth rule (Diego, 2026-10-02)

**Always the harness, then the specs, then the work.**

- The harness (this `AGENTS.md`), the spec docs (`attachments/dca-app-spec.md` for the calculator;
  `attachments/dashboard-spec.md` for the signed-in dashboard, **approved by Diego 2026-10-02 for
  all decisions D1–D13**: D8, D9 and D12 were approved as recommended, and Amendment A
  (section 14) is decided as D13: $0, Yahoo primary, Neon cache, Alpha Vantage free fallback) and `README.md` are the source of truth for this
  app.
- Every feature PR updates `README.md`, the relevant spec and this harness **in the same PR**, or says
  in the PR body, for each of the three, why it did not change.
- QA fails a PR that skips this.

## What the app is

Orpheus DCA vs lump-sum calculator: TanStack Start + Vite + React, deployed on Vercel.
DCA logic lives in `src/lib/dca/*`; the UI is `src/components/desk.tsx`; the price feed is the
server route `src/routes/api/chart.ts` → `src/lib/dca/yahoo.server.ts`. See `README.md` for the six
DCA rules.

## Commands

Node 22 (≥ 22.12, required by `@tanstack/react-start`), npm.

| Command | What it does |
|---|---|
| `npm ci` | Clean install from `package-lock.json` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` (warnings allowed, errors fail) |
| `npm test` | Node test runner: `scripts/**/*.test.mjs`, then the listed `src/**/*.test.ts` files (includes the DCA engine, results helpers and the offline fixture replay) |
| `npm run build` | `vite build` (Vercel preset, output in `.vercel/output/`) then `db:migrate` (skips when no database URL is set; see `scripts/db-env.mjs`) |
| `npm run fixtures:build` | Rebuild `qa/fixtures.json` offline from `qa/snapshots/*.json` through the app's own `loadChart()` and `runDesk()`. Add `-- --refresh` to re-pull Yahoo (network) |
| `npm run fixtures:hand-check` | Independent recomputation from the raw snapshots (shares no code with `src/lib/dca`); rewrites `qa/HAND-CHECK.md`, exits non-zero on mismatch |
| `npm run check:dashboard-built` | After `npm run build`: drives the built server function for each `DASHBOARD_ENABLED` value (no network/browser). Flag-off `/dashboard` 404 must equal any unknown-path 404; every method on `/api/dashboard/*` must answer JSON (404, or 405 with `Allow: GET, HEAD` on `status` and `db` when on); `/api/dashboard/db` reads `not_configured` and is 404 under `VERCEL_ENV=production`. CI runs it after Build |
| `npm run dev` | Local dev server (Vite) on port 8080 |

A new test file is only run if it is added to the `test` script in `package.json`.

## Test gate

- CI is `.github/workflows/ci.yml`: on every pull request and on push to `main` it runs
  `npm ci`, `typecheck`, `lint`, `test`, `build` on Node 22. **CI must be green** before review.
- Run the same five commands locally before pushing.

## Branches and PRs

- Branch off the latest `origin/main`. Open a **draft** PR against `main`.
- **No direct pushes to `main`. No force-pushes to `main`. Only Engineering Lead merges, after QA passes on the preview.**
- Loop: SWE writes the PR → CI green → Engineering Lead reviews → QA passes on the PR's **Vercel
  preview URL** (vercel[bot] comments it on the PR) → Engineering Lead merges → Vercel deploys `main`
  to production (https://orpheus-app-beta.vercel.app) → QA re-checks production.
- The PR body states which of `README.md` / spec / `AGENTS.md` changed and why the others did not.
- Never message Diego. Blockers go to the Engineering Lead; the Chief of Staff relays.

## Ticket handoff rules (Diego, 2026-10-02)

These rules exist so no ticket gets missed.
1. Every handoff that starts work goes out urgent (SendToAgent with priority true), never as a queued note.
2. Whoever receives a ticket confirms within their next turn, either by opening a draft PR or by replying "blocked: X". If there's no draft PR, the ticket hasn't started.
3. When a PR merges, Engineering Lead hands off the next ticket in the same turn.
4. Stall check: the daily orpheus-app loop and any active run look for open tickets with no PR activity for 30 minutes during an active run, or none since the last loop run. Engineering Lead re-pings the owner urgently and reports the stall to Chief of Staff. Reporting a stall to Chief of Staff is an allowed ping for Engineering Lead.
5. The GitHub issues and their labels are the task list of record. Each ticket carries exactly one status label: `todo`, then `in-progress` (draft PR open), then `in-QA` (CI green, sent to QA), then `done` (merged and prod-checked). Whoever moves the ticket moves its label in the same turn. Engineering Lead moves `in-QA` to `done` after the merge and the production check.

## Feature flags: feature work lands behind a flag until a release go

*Active since 2026-10-02, when the dashboard spec was approved.*

- New user-facing features merge to `main` **behind a flag** and stay hidden on production until Diego
  gives a release go. Each ticket still gets its own PR, preview and QA pass.
- Mechanism (dashboard): one **server-only** env var, `DASHBOARD_ENABLED`, set to `true` only in the Vercel
  **Preview** environment (the Engineering Lead added it for Preview on 2026-10-02 for ticket T01, #9; it is not set for Production). Every dashboard route, server function and API route returns 404 unless it is
  exactly `true` (missing = off). Never gate with a `VITE_*` variable (those are inlined into the client
  bundle at build time).
- QA reaches the feature on the PR's Vercel preview URL (e.g. `/dashboard`); on production it must be a 404
  until the release go.
- Release = Diego's go after every ticket is merged with QA PASS and a full flag-on QA run passes (see the
  "Release plan" in the spec). Rollback = flag off for Production + redeploy.
- Bots never set or change env vars in Vercel; the Engineering Lead or Diego does.

## What bots may not touch

- **Engine math** (`src/lib/dca/simulate.ts`, `calendar.ts`, `raw.ts`, and anything else that changes
  computed numbers) without a spec change approved first. Presentation code (`desk.tsx`,
  `src/lib/dca/results.ts`, `format.ts` labels) is fine within the spec.
- **Secrets.** Environment variables live only in Vercel project settings: `VITE_AUTH_ENABLED`,
  `BETTER_AUTH_SECRET`. Never commit their values, never create a `.env` file in the repo, never paste
  values into chat, PR bodies, logs or the vault. (`.grok/app-env.json` holds only the non-secret local
  default `VITE_AUTH_ENABLED: "false"`; a real environment value always wins.) The approved dashboard
  spec adds more Vercel-only variables as its tickets land. Variables that exist now (names only,
  never values):
  - `DASHBOARD_ENABLED`: a plain variable set on **Preview only**, not Production (since 2026-10-02).
  - The Neon integration's `orpheus_app_preview_*` variables, e.g. `orpheus_app_preview_DATABASE_URL` and
    `orpheus_app_preview_DATABASE_URL_UNPOOLED`: set on **Preview and Development**, none in Production.

  - `DASHBOARD_SIGNUP_ALLOWLIST` (T03, #11): the sign-up email allow-list (D12, approved), server-only, for
    **Preview** (Production at the release go). Emails are personal data: never paste the value anywhere.

  Still to come, each added by an owner when its ticket lands: `BETTER_AUTH_URL` (Production only, at the
  release go; previews derive their origin), `CRON_SECRET` on Production at the release go (T05, #13: set on
  Preview 2026-10-02 as a sensitive variable; bots never read, print or ask for it), an SEC contact for the User-Agent, and an Alpha
  Vantage free key for the daily-close fallback (D13). Nobody claims the Alpha Vantage key until the fallback ticket starts
  and Diego OKs it, asked through the Chief of Staff.
- **`.vercel/output/`**: build output, git-ignored. Never commit it.
- **Advice.** No buy, sell or hold recommendation anywhere: UI copy, code comments, docs, fixtures.
  The DCA-06 check in `src/lib/dca/fixtures.test.ts` scans user-facing copy for it.
- **Listings.** US, EU and CA listings only, one currency per basket (`src/lib/dca/venues.ts`). Do not
  widen this without a spec change.

## Reproducing CI and QA checks locally

```bash
export PATH=/path/to/node22/bin:$PATH   # Node >= 22.12
npm ci
npm run typecheck && npm run lint && npm test && npm run build

# QA fixtures (AC pack DCA-01..06): offline, deterministic
npm run fixtures:build          # must leave qa/fixtures.json unchanged unless engine/fixtures changed on purpose
git diff --exit-code qa/fixtures.json
npm run fixtures:hand-check     # must print "hand check: MATCH"
```

- Fixtures: `qa/fixtures.json`, schema and cases in `qa/README.md`, raw data in `qa/snapshots/`,
  independent arithmetic in `qa/HAND-CHECK.md`.
- `npm test` replays every fixture offline (no network) through `loadChart()` and `runDesk()`.
- QA's acceptance pass runs the six DCA rules against the PR preview, then production, using the
  canonical pack `qa/CANONICAL-AC-PACK.md`. Run logs go in `qa/runs/YYYY-MM-DD-<label>.md` with small
  JSON/text evidence beside them; no images in git, scrub cookies/tokens first (policy in `qa/README.md`).

### QA tools against a preview or production URL

The scripts in `qa/tools/` drive the deployed app (they do not start a local server). Pass the URL as
`--base-url` or `QA_BASE_URL`; the default is production, https://orpheus-app-beta.vercel.app. Output
(screenshots, JSON) goes to `--out` / `QA_OUT_DIR`, default a temp dir outside the repo. Never point them
at the frozen Grok copy except as an explicit `--compare-url` for `sidebyside.mjs`.

```bash
npx playwright install chromium                     # once; playwright is already a devDependency
PREVIEW=https://<vercel-bot-preview>.vercel.app
node qa/tools/run.mjs   --base-url "$PREVIEW"       # baseline fixture cases (reads qa/fixtures.json)
node qa/tools/full.mjs  --base-url "$PREVIEW"       # full DCA round, desktop + mobile
node qa/tools/pr3.mjs   --base-url "$PREVIEW"       # results table / charts / mobile cue
node qa/tools/sidebyside.mjs --base-url "$PREVIEW" --compare-url https://orpheus-app-beta.vercel.app
QA_BASE_URL="$PREVIEW" python3 qa/tools/fetch.py --out /tmp/orpheus-fetch   # raw Yahoo/app/stooq data
```

Full list and flags: `qa/tools/README.md`. The `.mjs` tools are linted by `npm run lint` (they are not
in `tsconfig`, so `typecheck` skips them); they are not part of `npm test` or CI because they need a
browser and the network.

### Dashboard flag locally (`DASHBOARD_ENABLED`)

The dashboard is gated by the server-only `DASHBOARD_ENABLED` flag (only the exact string `true` enables;
code in `src/lib/dashboard/flag.server.ts`). Check both states before pushing dashboard work:

```bash
DASHBOARD_ENABLED=true npm run dev               # /dashboard -> 307 to /dashboard/sign-in; /api/dashboard/status -> 200
npm run dev                                      # flag unset -> both 404 (DASH-01, DASH-02)
curl -sI http://localhost:8080/dashboard | head -1
curl -s  http://localhost:8080/api/dashboard/status
```

- Flag off, the server router reads `/dashboard` and anything under it as an unmatched path
  (`rewrite` in `src/router.tsx`, helpers in `src/lib/dashboard/paths.ts`), so the 404 is byte-for-byte
  the app's ordinary 404: title "Orpheus Wisdom", no dashboard chunk, no dashboard copy (spec §2).
- New dashboard pages live under `/dashboard`, call `ensureDashboardEnabled()` (`src/lib/dashboard/gate.ts`)
  in `beforeLoad`, and gate `head()` on loader data (`loaderData?.enabled`) so a client-side 404 shows no
  dashboard title either.
  New `/api/dashboard/*` handlers start with `guardDashboardApi()`, which returns the 404 JSON when off,
  and add `ANY: () => dashboardUnsupportedMethod([...allowed])` so other methods get JSON (404 off, 405
  with `Allow` on) instead of the HTML app shell.
  Unknown `/api/dashboard/*` paths hit the catch-all `src/routes/api/dashboard/$.ts` (404 JSON, any method).
- `src/lib/dashboard/flag.test.ts` and `paths.test.ts` (in `npm test`) cover flag parsing, the API guard
  and 405 helper, the flag-off rewrite, the no-advice scan of dashboard files, and checks that the
  calculator neither links to nor reads the flag. `npm run check:dashboard-built` checks the built server.
- On a PR preview the flag comes from the Vercel Preview environment. Bots never set it; if
  `/dashboard` is a 404 on a preview, the variable isn't set there yet.

### Dashboard storage locally (`DATABASE_URL` / `orpheus_app_preview_DATABASE_URL`)

- Env vars, resolved in `scripts/db-env.mjs` (tests in `scripts/db-env.test.mjs`):
  - App (pooled): **`DATABASE_URL`**, else **`orpheus_app_preview_DATABASE_URL`**. The prefixed names come
    from the Vercel Neon integration (database `neon-almond-lever`), scoped to Preview and Development
    only; Production has none. Neon preview branching is **on** (Engineering Lead decision 2026-10-02), so
    a preview deploy may get its own branch. The dashboard code doesn't depend on that: it reads whatever
    URL is injected, and migrations are idempotent and tracked by name. It works the same against one
    shared preview branch or a fresh branch per deploy.
  - **Branch cap (owner / Engineering Lead action; bots never do this):** Neon Free caps a project at 10
    branches. A preview branch is deleted only when its Vercel deployment is deleted. To prune, delete old
    preview deployments in Vercel, or delete stale preview branches in the Neon console or integration.
  - Migrations (direct): `DATABASE_URL_UNPOOLED` (else `DATABASE_URL`), else
    `orpheus_app_preview_DATABASE_URL_UNPOOLED` (else `orpheus_app_preview_DATABASE_URL`).
  - Neither pooled name set means storage is unavailable ("not configured"). Blank counts as unset.
  - Set by an owner, never by a bot. Never commit, paste or log a value; `migrate.mjs` logs only the name
    and redacts URLs from errors.
- **Migration guard:** `scripts/migrate.mjs` exits 0 without connecting when `VERCEL_ENV=production` and
  `DASHBOARD_ENABLED` isn't exactly `true`. It logs `[migrate] skipped: VERCEL_ENV=production and dashboard
  flag off` (no values). The dashboard schema stays out of the production database until the release go.
  The decision function is `migrationSkipReason()` in `scripts/db-env.mjs`; tests are in
  `scripts/db-env.test.mjs`, including a script-level run.
- Schema: `migrations/0001_auth.sql` (Better Auth, a verbatim copy of `migrations/auth/0001_auth.sql`;
  `scripts/migration-plan.test.mjs` fails if they differ), `0002_dashboard.sql` (spec §5) and
  `0003_user_settings_fk.sql` (the spec's `user_settings.user_id -> "user"(id) ON DELETE CASCADE`, T03).
  Never edit a shipped migration; add the next number (`0004_*.sql`).
- Data access: `src/lib/dashboard/store.server.ts`. Every per-user function takes the `userId` from the
  verified session (`requireUserId()`), never from the client. Connection and status:
  `src/lib/dashboard/db.server.ts`. It has no PGLite fallback, so a deployment without a database URL
  reports "not configured".
- `GET /api/dashboard/db` follows the dashboard API pattern. Flag off: 404 JSON for every method. Flag on:
  GET/HEAD return the status JSON and any other method gets **405 JSON with `Allow: GET, HEAD`**. On
  production (`VERCEL_ENV=production`) it's 404 JSON for every method, and `/dashboard` has no status line.
- Tests: `src/lib/dashboard/store.test.ts` (in `npm test`) applies the migration to in-process PGLite and
  exercises every function plus the `/api/dashboard/db` handler (404/405/200 cases). No network or Neon
  needed, and it runs in CI. `npm run check:dashboard-built` covers the same route on the built server.
- Run migrations against a real Postgres (your own local or throwaway database, never production):

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/db node scripts/migrate.mjs   # "applied 0002_dashboard.sql", then "up to date"
DATABASE_URL=... DASHBOARD_ENABLED=true npm run dev     # /dashboard shows "Database: connected · 11/11 tables"
curl -s http://localhost:8080/api/dashboard/db          # JSON status; 404 when the flag is off or VERCEL_ENV=production
curl -s -X POST -i http://localhost:8080/api/dashboard/db | head -1   # 405, Allow: GET, HEAD (flag on)
```

  No local Postgres? Install `@electric-sql/pglite` and `@electric-sql/pglite-socket` **outside the repo** and
  run its `pglite-server -p 15433` for a throwaway one (that's how T02 was checked end to end).
  Plain `npm run dev` without a database URL also applies `migrations/*.sql` to the template's in-memory
  PGLite (catches SQL errors), but the dashboard status still reads "not configured" by design.

### Dashboard sign-in (Better Auth email/password, T03 #11)

- Code: `src/lib/auth/config.ts` (allow-list, origins, readiness; pure), `instance.server.ts` (the Better
  Auth config: email/password only, allow-list hooks, `__Host-orpheus-auth.*` cookies), `server.ts` (wires
  the database via `scripts/db-env.mjs`, the secret and origins), `verify.server.ts` (session lookup).
  Routes: `/api/auth/*` (`src/routes/api/auth/$.ts`), `/dashboard/sign-in` (`dashboard_.sign-in.tsx`).
  The Grok broker (`genericOAuth`), gate-identity, popup and bearer-token paths are gone.
- Everything is behind `DASHBOARD_ENABLED`: flag off, `/api/auth/*` is 404 JSON for every method and the
  auth module never loads; `/dashboard/sign-in` is the plain 404. The calculator doesn't import auth.
- **Allow-list (D12):** `DASHBOARD_SIGNUP_ALLOWLIST`, emails separated by commas, semicolons or spaces,
  case-insensitive. Unset or empty: nobody can sign up (fail closed). Enforced twice: a `before` hook on
  `/sign-up/email` (runs before the existing-user check) and a `user.create.before` database hook.
- **Readiness:** on Vercel (`VERCEL` set) sign-in needs `BETTER_AUTH_SECRET` and a database URL;
  `VITE_AUTH_ENABLED=false` turns it off anywhere. Not ready: `/api/auth/*` answers 503 JSON, the sign-in
  page says "not configured", the server log names the missing variable (never a value).
- **Origins:** production uses `BETTER_AUTH_URL`. Previews use exactly `VERCEL_BRANCH_URL` and `VERCEL_URL`
  (https) and ignore `BETTER_AUTH_URL`, so one value can't pin all previews to a host. Local: loopback.
- **Dashboard APIs that touch user data** (`/api/dashboard/me`, `/api/dashboard/settings`, and every
  future one) use `src/lib/dashboard/session.server.ts`: flag off 404 JSON, unsupported method 405 JSON,
  no session **401 JSON**, a client-named user id that isn't the session's **403 JSON**. The user id comes
  only from the session. They never fall back to the template's dev user. `/api/dashboard/status` and
  `/db` are diagnostics with no user data and stay public. Off production, `/status` also reports
  `signIn` (`ready` or `not configured (<variable>)`) and `signUpAllowList` (`set`/`empty`), names and
  states only, so QA and the Engineering Lead can see what a preview is missing without the build logs.
- Tests: `src/lib/auth/auth.test.ts` (PGLite, offline): allow-list allowed/denied/case-insensitive/empty,
  untrusted origin, sign-in/sign-out, 401/403/404/405, cross-user isolation, the FK cascade, migration
  order on a database that already had `0002`. `npm run check:dashboard-built` covers the built server
  without a database (redirect, 401s, 503). With a throwaway Postgres (never a shared one):
  `DATABASE_URL=... node scripts/migrate.mjs && node scripts/check-dashboard-built.mjs --with-database`
  runs the signed-in flow too (sign-up denied/allowed, `/dashboard`, isolation, sign-out).
- Test accounts on a preview: use clearly fake addresses on the allow-list. Bots can't delete users
  (no admin endpoint, no bot database access); an owner removes them in the Neon console
  (`DELETE FROM "user" WHERE email = ...` cascades to sessions, accounts, `user_settings` and, since 0004, `holdings`).

### Dashboard holdings (T04 #12)

- Code: `src/lib/dashboard/holdings.server.ts` (handlers, validation), `listing.server.ts` (listing check:
  `listingFromPayload` maps a Yahoo chart payload through `listingError()` from `src/lib/dca/venues.ts`;
  `yahooListingLookup` makes the one request), `store.server.ts` (`listHoldings`/`getHolding`/insert/update/
  delete, all scoped by `user_id`). Routes: `src/routes/api/dashboard/holdings.ts` and
  `holdings_.$id.ts` (flat file on purpose: `flag.test.ts` reads `src/routes/api/dashboard` without
  recursing). UI: `src/components/dashboard/holdings.tsx`, rendered by `src/routes/dashboard.tsx`; the
  loader uses `getDashboardHoldings` in `gate.ts`.
- API: `GET`/`POST /api/dashboard/holdings` (`Allow: GET, HEAD, POST`), `GET`/`PUT`/`DELETE
  /api/dashboard/holdings/<id>` (`Allow: GET, HEAD, PUT, DELETE`). Gate from `session.server.ts` (404 flag
  off, 405, 401, 403 for a client-named other user id). A holding id that isn't the session user's (or
  isn't numeric) answers **404 "Holding not found."**, never 403, so ids don't leak. No database: 503.
- Rules: shares > 0, avg cost ≥ 0, ≤ 6 decimals; duplicate ticker 409 "<SYM> is already in your
  holdings." (checked before any feed call); `PUT` takes `{shares, avgCost}` only and refuses `symbol`;
  cap 200 per user. Ticker check only on `POST`: one Yahoo chart-metadata request; non-US/EU/CA gets
  `listingError()`'s exact text (400), unknown symbol 404, feed down 503. Page loads never call a feed and
  T04 never writes `instruments` (T05's job).
- Tests: `src/lib/dashboard/holdings.test.ts` (PGLite, offline, fake listing lookup): CRUD and reload,
  validation, duplicate, cap, DASH-06 isolation (other user's id 404 on GET/PUT/DELETE, 403 on named
  userId), DASH-08 exact messages incl. BSE. `check:dashboard-built` checks holdings 404/405/401 without
  a database; `--with-database` adds the signed-in CRUD run and **needs network** (it adds `KO` and
  checks `VOD.L`/`TCS.BO` against live Yahoo).
- `holdings.user_id` → `"user"(id)` on delete cascade (migration `0004_daily_close.sql`, T05), so deleting
  a test user removes their holdings too. 0004 first deletes holdings whose user no longer exists.

### Dashboard daily closes (T05 #13)

- Code: `src/lib/dashboard/close-provider.ts` (the `DailyCloseProvider` interface from spec A.4, plus an
  optional `getListing()`), `yahoo-closes.server.ts` (Yahoo implementation: reuses `pull()` and `toChart()`
  from `src/lib/dca/yahoo.server.ts`, so `rawBars()`/`rawDividends()` apply), `daily-refresh.server.ts`
  (the job, the lock, the new-holding backfill, `priceViews()` for the page), `refresh-api.server.ts`
  (cron and preview-button handlers). Routes: `src/routes/api/cron/daily-refresh.ts`,
  `src/routes/api/dashboard/refresh.ts`. Schema: `migrations/0004_daily_close.sql` (A.3 deltas:
  `instruments.mic`/`provider_ids`, `daily_closes.adj_close_src`, `corporate_actions`, `price_coverage`;
  plus the holdings FK). `vercel.json` has the cron (`0 23 * * *` UTC).
- **Nothing else calls a price feed for the dashboard.** Pages read Postgres only (DASH-14). Only the
  cron route, the preview button and the new-holding backfill (`waitUntil()` from `@vercel/functions`)
  call the provider. The T04 listing check on `POST /api/dashboard/holdings` still makes its one
  metadata request; it isn't a price and stores nothing.
- Cron route order: flag off 404 → non-GET 405 (`Allow: GET`) → `Authorization: Bearer <CRON_SECRET>`
  compared in constant time, else **401** (also when `CRON_SECRET` is unset; the log says it's unset,
  never a value) → no database 503 → run summary. On production the flag is off, so the cron call gets
  404 until the release go. `/api/dashboard/status` shows `cronSecret: set|empty` off production.
- Preview button: `POST /api/dashboard/refresh`, 404 unless flag on **and** `VERCEL_ENV=preview`
  (production and local dev never have it), 405, 401 signed out. It calls the job directly, so
  CRON_SECRET never reaches the browser. Its response is counts only (no other users' tickers).
- Job rules: lock = upsert on `refresh_runs.run_date` (UTC date) that only succeeds when no run for that
  date is `running` (a run stuck > 10 min is taken over). Per held symbol: fetch from the day after
  `price_coverage.last_session_date` (from 2000-01-01 on a backfill), insert `ON CONFLICT DO NOTHING`,
  refuse a currency that differs from `instruments`, refresh `corporate_actions` weekly, record errors in
  `price_coverage.last_error` and carry on. Budget: 30 requests/min, 500 per run, 240 s per run; the rest
  waits for the next run. Closes are rounded to 4 decimals (Yahoo float noise).
- Completed sessions only: bars after today (exchange zone) are dropped; today's bar is kept only 30 min
  after `currentTradingPeriod.regular.end`.
- Tests: `src/lib/dashboard/daily-close.test.ts` (PGLite, recorded-shape Yahoo payloads, offline): open
  vs closed market, raw closes across a split, unadjusted dividends, non-US/EU/CA refusal, DASH-09 (latest
  close per symbol, second run changes nothing and makes no request), catch-up of missed sessions, the
  lock, DASH-14 (a revised feed never changes a stored close), per-symbol errors, currency guard, backfill
  once, cron 401/404/405/200, preview button visibility and 404/405/401, the holdings cascade, vercel.json.
  `check:dashboard-built` covers the built routes; `--with-database` also runs the button and the cron
  route against live Yahoo (network needed).

### Dashboard FX and base currency (T06 #14)

- Code: `src/lib/dashboard/fx.server.ts` (Valet / ECB parsers, `createFxFetcher()`, `refreshFx()`,
  `rateOnOrBefore()`, `convert()`, `valueHoldings()`), `fx-api.server.ts` + `src/routes/api/dashboard/fx.ts`
  (`GET /api/dashboard/fx?date=`, `Allow: GET, HEAD`, usual 404/405/401 gate, 400 bad date, 503 no db).
  `gate.ts` adds `baseCurrency` and `valuation` to the page data; `holdings.tsx` has the "Base currency"
  select, the "Value (BASE)" column with an FX line per rate, and the total row.
- Sources: BoC Valet `https://www.bankofcanada.ca/valet/observations/<series>/json?start_date=&end_date=`
  (USD, EUR always; SEK, PLN only when held). ECB: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml`
  (DKK, HUF, CZK only when held). The ECB data API (`data-api.ecb.europa.eu`) answered 502 on 2026-10-02,
  so the eurofxref file is used; it only covers the last 90 days, which is enough because a cross is only
  built for dates the BoC also published and the job runs daily.
- Cross: `cad = FXEURCAD(d) / ECB_X(d)`, stored with `toPrecision(10)`, source `ECB_CROSS`; only for dates
  both sources have (none for a BoC holiday; the lookup falls back to the previous day). BoC values are
  stored verbatim (source `BOC`).
- Fetch rules: `refreshFx()` runs at the end of `runDailyRefresh()` (cron and preview button) and in the
  new-holding backfill. Per currency it asks from the day after the last stored date (first time: 30 days
  back, or the oldest held close − 7 days), inserts `ON CONFLICT DO NOTHING`, never throws (errors make the
  run `partial`; `fxInserted`/`fxErrors` in the summary). Page loads and `/api/dashboard/fx` only read.
- Rate date: `rateOnOrBefore(quote, sessionDate)`; `fallback` = rate date ≠ session date, shown as
  "(previous rate)". Unknown currencies or missing rates → `fx_pending`, left out of the total.
- Tests: `src/lib/dashboard/fx.test.ts` (PGLite, offline) with the recorded responses in `test-fixtures/fx/`
  (BoC Valet 2026-09-21..10-02 verbatim; ECB 90-day file trimmed to the same dates), checked against live
  Valet/ECB on 2026-10-02. DASH-11 (stored = Valet; 2026-09-30 → 2026-09-29 rate; DKK/HUF/CZK cross),
  idempotence, outage, job wiring, DASH-12 (CAD default, USD/EUR re-express every value and the total,
  setting persists per user), `/api/dashboard/fx`. `check:dashboard-built --with-database` also checks the
  select, `/api/dashboard/fx` and the CAD/EUR/USD totals against live BoC.

## Repo leftovers from the Grok template

`.grok/` (skills, references, `app-env.json`), `startup.sh`, `scripts/preview*.mjs`, `screenshots/`
and the Grok helpers in `scripts/` and `server/` come from the Grok App Builder template. Deploying
through Grok has stopped: Vercel is the only deploy path. https://island-pearl-eagle-hill.grok.me stays
published as a frozen old copy until the Chief of Staff confirms its retirement with Diego; never deploy
to it or treat it as production. The old template `AGENTS.md` (sandbox, port-8080 preview proxy, Grok
chat rules) was replaced by this file. The leftover files are not instructions for this repo, but some are still wired
in: `scripts/with-app-env.mjs` reads `.grok/app-env.json` for `dev`/`build`/`preview`, and
`vite.config.ts` loads the Grok PWA and app-env plugins plus `server/` middleware. Remove them only in a
dedicated PR that keeps CI and the Vercel build green.
