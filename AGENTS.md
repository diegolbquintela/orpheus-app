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
  (section 14) is decided as D13: $0, Yahoo primary, Neon cache, Alpha Vantage free fallback; its **section 0**
  is the source of truth for the epic #53 redesign, see below) and `README.md` are the source of truth for this
  app.
- Every feature PR updates `README.md`, the relevant spec and this harness **in the same PR**, or says
  in the PR body, for each of the three, why it did not change.
- QA fails a PR that skips this.

## Dashboard redesign: mobile first (epic #53). Read this before any dashboard work

*Harness for tickets 1–6 of epic #53 (#54 harness + specs, #55 holdings list, #56 add holding, #57 metrics
sheet and chips, #58 book, #59 leave-outs and regression). Approved by Diego via the Chief of Staff,
2026-10-04.*

- **Source of truth:** `attachments/dashboard-spec.md` **section 0** (the architect's brief verbatim, the
  page, the leave-out list, what stays unchanged, interpretations, the ticket table, acceptance DR0–DR6 and
  the map of old DASH IDs). It wins over the older dashboard sections of the spec and over the T07 / T14 /
  T15 notes below where they differ; the data math in those notes doesn't change. The brief calls the file
  `docs/dashboard-spec.md`; it stays at `attachments/` (code and docs link there).
- **Order:** harness first (this section), then the specs (spec section 0, `README.md`,
  `qa/CANONICAL-AC-PACK.md`), all in ticket 1's PR; then tickets 2–6, one PR each, in order, each off the
  latest `main` after the previous one merges. Ticket 1 changes no app code.
- **Rules (#53):** no hires. Don't change the visual style (same dark desk: colours, fonts, tokens). Don't
  hide the dashboard: it stays released, and nobody touches `DASHBOARD_ENABLED`, the flag code or any env
  var. Small tickets; a draft PR is the proof of start; QA on the preview before merge, then on production.
- **Phone first:** build and check at about 400 px first (QA: 400 × 860), then wide screen (1024 px and up;
  QA: 1440 × 900). Below 1024 px one column with a `Holdings` | `Metrics` switch; at 1024 px and up the
  metrics sheet sits on the right.
- **Leave out (never add, and ticket 6 removes what's left):** Connect broker, K/M/B abbreviated amounts,
  an ownership toggle, download / export, instructions under (or above) the table. No helper paragraphs.
- **Keep:** the signed-out matrix (`release-smoke.mjs`, `check:dashboard-built`), the calculator and its
  $313,000 regression, noindex, the analytics rules (and the referrer rule on `main` when #50 lands), no
  buy / sell / hold / rating / target wording and no disclaimer, stored data only on page loads (DASH-14),
  writes through `fetch()` only (never a plain HTML form post). A schema change (ticket 3's optional cost)
  is a new numbered migration, never an edit to a shipped one.
- **Missing figures** are `—` alone (reason only in the tooltip / accessible name). **Blank cost and
  return** are empty, not a dash.
- **Every ticket 2–6 PR body** lists the DR IDs it implements, the old DASH IDs it supersedes (spec 0.8),
  any new interpretation (added to spec 0.5 in the same PR), and the preview alias for its final SHA.
- **Tests:** jsdom has no layout, so widths are QA's job on the preview; component tests
  (`*.dom.test.tsx`) cover what the DOM can show: the four row fields, tap-to-detail, the one-line empty
  state, no helper paragraph, chips add / remove / defaults, `—` cells, the one total, the leave-outs
  absent. New test files go into the `test` script in `package.json`.
- **EL decisions (2026-10-04):** one total, value only (no total cost / return on the page); accounts with
  saved columns keep them as chips, defaults only for users with nothing saved; the 1024 px breakpoint and the
  empty-state text `Add a holding`; the ticket 3 / 4 migrations are fine if nullable and idempotent and run
  through `check:dashboard-built --with-database`.
- **Landed:** ticket 2 (#55), see "Dashboard holdings list (#55)" below and spec 0.9. Ticket 3 (#56, PR #62):
  "Dashboard add holding / optional cost (#56)" below. Ticket 4 (#57, PR #63, stacked on #62): "Dashboard
  metrics sheet and chips (#57)" below. Ticket 5 (#58, PR #64, stacked on #63): "Dashboard book (#58)" below.
- **Paused / not this epic:** don't touch `chore/remove-grok-leftovers` / PR #52 or issues #50 / #51
  unless handed them.

## What the app is

Orpheus Wisdom: TanStack Start + Vite + React, deployed on Vercel. One site, three routes (#46):

- `/`: home. One line plus exactly two cards (Calculator, Dashboard). It does no calculating.
- `/calculator`: the DCA vs lump-sum calculator (moved here from `/` in #46, behaviour unchanged).
  DCA logic lives in `src/lib/dca/*`; the UI is `src/components/desk.tsx`; the price feed is the
  server route `src/routes/api/chart.ts` → `src/lib/dca/yahoo.server.ts`. See `README.md` for the six
  DCA rules.
- `/dashboard`: the signed-in dashboard, gated by `DASHBOARD_ENABLED` (sections below).

Every page has the site menu and the footer; see "Site shell" below.

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

> **Status 2026-10-04:** production serves the dashboard (issue #46: "Prod has the dashboard ON"; a read-only
> `release-smoke.mjs … on` against production on 2026-10-04 passed: `/dashboard` 307 → sign-in, status
> `{"dashboard":"enabled"}`). The Preview-only wording below is the pre-release history; when and how the flip
> was done isn't recorded in this repo. Bots still never set or change env vars.

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
- **Trackers.** Only Vercel Web Analytics (anonymous page views, cookieless; see its section). No other
  analytics, pixels or session recording, and no custom events.
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
node qa/tools/site.mjs  --base-url "$PREVIEW"       # site shell (#46) + $313,000 and VOD.L at /calculator
node qa/tools/sidebyside.mjs --base-url "$PREVIEW" --compare-url https://orpheus-app-beta.vercel.app --compare-path /calculator
QA_BASE_URL="$PREVIEW" python3 qa/tools/fetch.py --out /tmp/orpheus-fetch   # raw Yahoo/app/stooq data
```

Since #46 the calculator scripts open `--calculator-path` (default `/calculator`; pass `/` for a deployment
from before the redesign; `sidebyside.mjs` takes `--compare-path` for the second host, default `/`). Full list and flags: `qa/tools/README.md`. The `.mjs` tools are linted by `npm run lint` (they are not
in `tsconfig`, so `typecheck` skips them); they are not part of `npm test` or CI because they need a
browser and the network.

### Site shell: menu, home, footer (#46)

- Code: `src/lib/site/site.ts` (pure: `MENU_ITEMS`, `HOME_LINE`, `HOME_CARDS`, `FOOTER_LINE`,
  `currentSection()`, `homeRedirectHref()`), `src/components/site-menu.tsx`, `site-footer.tsx`, `home.tsx`,
  wired in `src/routes/__root.tsx` around the `<Outlet />`, so every page (calculator, home, `/dashboard`,
  `/dashboard/sign-in`, the 404) gets them. Routes: `src/routes/index.tsx` (home) and `calculator.tsx`.
- **Menu:** a thin ink bar, `position: sticky; top: 0`. "Orpheus" on the left → `/`; "Calculator" and
  "Dashboard" on the right. No dropdowns. The current page gets `aria-current="page"` and a visual state
  (full-strength text plus underline, styled from the attribute). `/dashboard/sign-in` counts as Dashboard; a
  404 has no current item. Plain links (full page loads), so `/dashboard` always goes through its server gate.
- **The Dashboard item and the home card show even when `DASHBOARD_ENABLED` is off** (Diego, #46). The shell
  never reads the flag or imports dashboard code (`flag.test.ts`); flag off, the link lands on the plain 404.
  This replaces the old rule "no nav link when the flag is off" (spec §2, DASH-01 updated).
- **Home `/`:** `HOME_LINE` plus exactly two cards with the #46 texts verbatim ("compare a lump sum with
  contributions" → `/calculator`; "holdings, value, stored figures" → `/dashboard`). No fetches, no calculator
  code in the route (`site.test.ts` checks the imports).
- **`/?query` → `/calculator?query`** (307, from the home route's `beforeLoad`). The calculator reads no URL
  parameters today, so this only keeps old links with a query string landing on the calculator. Plain `/` is home.
- **Footer:** exactly "Orpheus Wisdom", nothing else (#46 brief update, 2026-10-04). No listings line, no
  disclaimer. The calculator keeps its own note "US, EU and CA listings, one currency per basket." under the
  basket, as before.
- noindex: the root `head()` sets `robots: noindex, nofollow` for every page, each page route repeats it, and
  `vite.config.ts` adds `X-Robots-Tag: noindex, nofollow` to every response.
- Tests: `src/lib/site/site.test.ts` (menu items, current page per route, the two cards, footer text,
  redirect, home imports, noindex in every route file), `src/components/site.dom.test.tsx` (jsdom:
  `aria-current` per route, Dashboard always shown, no dropdowns, sticky, exactly two cards and no fetch,
  footer text), `check-dashboard-built.mjs` (built server, flag off and on: home, calculator, redirect, menu
  current item, footer, the flag-off 404 has no dashboard copy outside the menu), `release-smoke.mjs` (every
  mode) and `qa/tools/site.mjs` (browser: menu fixed on scroll, cards, footer, $313,000 and VOD.L at
  `/calculator`).

### Vercel Web Analytics (#48)

- **What's collected:** anonymous page views only, **no cookies**, no custom events. Per Vercel's
  [privacy page](https://vercel.com/docs/analytics/privacy-policy) (checked 2026-10-04) a page view stores the
  URL path, referrer, coarse geolocation, OS, browser and device type; visitors are counted by a hash of the
  request that is discarded after 24 hours. **Why:** to see which tools get used (home, calculator, dashboard).
  Diego enabled Web Analytics on the Vercel project; there's no env var for it.
- Code: `<Analytics beforeSend={analyticsBeforeSend} />` from `@vercel/analytics/react` (the package has no
  TanStack Start entry; the React one works in any React app), rendered **once** in `src/routes/__root.tsx`, so it
  covers every page. On a deployment it loads Vercel's script from the same origin (`/_vercel/insights/script.js`
  by default; package v2 may use a build-seeded path, "Resilient Intake") and renders nothing on the server. `src/lib/site/analytics.ts` `analyticsBeforeSend` strips the query string and hash
  from every page-view URL (page paths carry no personal data, but `/?query` keeps its query on the way to
  `/calculator`) and drops any custom event.
- Rules: never call `track()` or use `@vercel/analytics/server`; never send emails, tickers, holdings or ids;
  no other trackers or analytics packages. `src/lib/site/analytics.test.ts` (in `npm test`) checks the single
  mount, no `track()` in `src`, no other tracker dependency, and the URL stripping.

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
  the app's ordinary 404: title "Orpheus Wisdom", no dashboard chunk, no dashboard copy (spec §2). The only
  "Dashboard" on it is the site menu's item, which every page has (#46).
- New dashboard pages live under `/dashboard`, call `ensureDashboardEnabled()` (`src/lib/dashboard/gate.ts`)
  in `beforeLoad`, and gate `head()` on loader data (`loaderData?.enabled`) so a client-side 404 shows no
  dashboard title either.
  New `/api/dashboard/*` handlers start with `guardDashboardApi()`, which returns the 404 JSON when off,
  and add `ANY: () => dashboardUnsupportedMethod([...allowed])` so other methods get JSON (404 off, 405
  with `Allow` on) instead of the HTML app shell.
  Unknown `/api/dashboard/*` paths hit the catch-all `src/routes/api/dashboard/$.ts` (404 JSON, any method).
- `src/lib/dashboard/flag.test.ts` and `paths.test.ts` (in `npm test`) cover flag parsing, the API guard
  and 405 helper, the flag-off rewrite, the no-advice scan of dashboard files, and checks that the
  calculator neither links to nor reads the flag (the site shell links to `/dashboard` but never reads it, #46). `npm run check:dashboard-built` checks the built server.
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

- Code: `src/lib/dashboard/holdings.server.ts` (handlers, validation), `listing.server.ts` (listing check;
  since T07 it goes through `DailyCloseProvider.getListing(symbol, { fetch: true })`, see the T07 section), `store.server.ts` (`listHoldings`/`getHolding`/insert/update/
  delete, all scoped by `user_id`). Routes: `src/routes/api/dashboard/holdings.ts` and
  `holdings_.$id.ts` (flat file on purpose: `flag.test.ts` reads `src/routes/api/dashboard` without
  recursing). UI: `src/components/dashboard/holdings.tsx`, rendered by `src/routes/dashboard.tsx`; the
  loader uses `getDashboardHoldings` in `gate.ts`.
- API: `GET`/`POST /api/dashboard/holdings` (`Allow: GET, HEAD, POST`), `GET`/`PUT`/`DELETE
  /api/dashboard/holdings/<id>` (`Allow: GET, HEAD, PUT, DELETE`). Gate from `session.server.ts` (404 flag
  off, 405, 401, 403 for a client-named other user id). A holding id that isn't the session user's (or
  isn't numeric) answers **404 "Holding not found."**, never 403, so ids don't leak. No database: 503.
- Rules: shares > 0, avg cost ≥ 0 or blank (no cost, stored `NULL` since #56), ≤ 6 decimals. **`PUT`
  (edit, EL change in #57):** an omitted `avgCost` leaves the stored cost unchanged, only an explicit `null`
  clears it, a number sets it, a blank string is a 400; the UI always sends an explicit value; duplicate ticker 409 "<SYM> is already in your
  holdings." (checked before any feed call); `PUT` takes `{shares, avgCost}` only and refuses `symbol`;
  cap 200 per user. Ticker check only on `POST`: one Yahoo chart-metadata request; non-US/EU/CA gets
  `listingError()`'s exact text (400), unknown symbol 404, feed down 503. Page loads never call a feed and
  T04 never writes `instruments` (T05's job).
- Tests: `src/lib/dashboard/holdings.test.ts` (PGLite, offline; the real listing check through the
  Yahoo provider with recorded chart metadata): CRUD and reload,
  validation, duplicate, cap, DASH-06 isolation (other user's id 404 on GET/PUT/DELETE, 403 on named
  userId), DASH-08 exact messages incl. BSE. `check:dashboard-built` checks holdings 404/405/401 without
  a database; `--with-database` adds the signed-in CRUD run and **needs network** (it adds `KO` and
  checks `VOD.L`/`TCS.BO` against live Yahoo).
- `holdings.user_id` → `"user"(id)` on delete cascade (migration `0004_daily_close.sql`, T05), so deleting
  a test user removes their holdings too. 0004 first deletes holdings whose user no longer exists.

### Dashboard holdings list (#55, epic #53 ticket 2)

- `src/components/dashboard/holdings.tsx`: `Row` is an `<li>` with a toggle button (four fields: `holding-name`,
  `holding-shares`, `holding-value`, `holding-weight`) and a detail panel (`holding-detail`, `hidden` while
  closed but always rendered, so SSR HTML and `check-dashboard-built` still see `holding-avg-cost`,
  `holding-close`, `holding-cost`, `holding-return(-pct)`, `holding-fx`, `holding-detail-value`,
  `holding-detail-weight`). Edit / Delete live in the panel; `remove()` and its #38 guard are unchanged (the
  source checks in `metric-compute.test.ts` still pin them).
- Under the list: one total (`holdings-total`, value only, `—` when nothing is valued) with the excluded-count
  line and the T15 pie (ticket 5 makes it a donut). The interim `MetricsTable` from #55 was replaced by the
  metrics sheet in ticket 4 (#57).
- No helper paragraph; empty state `Add a holding`. Tests: `holdings-list.dom.test.tsx`,
  `holdings.dom.test.tsx`; browser check `qa/tools/dashboard-list.mjs` (needs `QA_EMAIL` / `QA_PASSWORD`;
  skips the row checks with zero holdings and signs out at the end, QA N3).
- QA N1: each row number carries a visually hidden label (`holding-value-label` " value ", the shares
  span `sm:sr-only` " shares", `holding-weight-label` " share of book "), because the header row is
  `aria-hidden`. Keep the labels outside the `holding-*` testid spans so their text stays the bare figure.

### Dashboard add holding / optional cost (#56, epic #53 ticket 3)

- Add form: one compact row at every width (`holding-form-symbol`, `-shares`, `-cost`; cost placeholder
  `optional`; visible label `Avg cost` below 1024 px). No other placeholders or help text (DR3-01). QA N3
  (#58): no `aria-label` on the cost input; the `<label>` names it, so the name contains what is shown:
  `Avg cost (optional)` below 1024 px (the suffix is `sr-only`), `Average cost (optional)` from 1024 px.
- QA N2 (#58): `parseQuantity()` answers a wrong-type value (`true`, `{}`, `[]`, NaN / Infinity) with
  "<Label> must be a number with at most 6 decimals." (was "is required"), so `avgCost` gets the number
  message on `POST` and `PUT`.
- **No cost is `NULL`, never 0.** `migrations/0008_holdings_avg_cost_nullable.sql` (idempotent `DROP NOT
  NULL`, CHECK kept, no data converted). `parseOptionalCost()` maps missing / `null` / blank to `null` on
  `POST`. On `PUT` (since #57) `parseEditCost()`: omitted → keep the stored cost, `null` → clear, number →
  set, blank → 400. The client sends `costForRequest(input)` (in `format.ts`; blank → `null`), so Edit can
  still clear it. `Holding.avgCost` and `HoldingView.avgCost` are `string | null`.
- `valueHoldings()`: no cost → `cost` / `returnAmount` / `returnPct` `null`; value, weight, total and pie as
  usual; `totalCost` / `totalReturn` over costed holdings only, `null` when none (never shown: one total,
  value only). A cost of 0 is a real cost (return % `n/m`).
- Detail: blank avg cost, cost and return render `<span data-blank="true">` (empty, not `—`/`0`/`n/m`).
- Edit → Save has a ref guard (QA N6): one `PUT` per click burst, released on error or after the refetch.
- Tests: `holdings-add.dom.test.tsx`, `holdings.test.ts`, `store.test.ts`, `valuation.test.ts`,
  `auth.test.ts` (migration list), `check-dashboard-built.mjs --with-database`; browser
  `qa/tools/dashboard-add.mjs` (adds `QA_ADD_SYMBOL`, default MSFT, with a blank cost, fills and clears it;
  refuses a symbol held with a cost; never Delete).

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
  `rateOnOrBefore()`, `convert()`, `fxFactor()`; `valueHoldings()` moved to `valuation.server.ts` in T07),
  `fx-api.server.ts` + `src/routes/api/dashboard/fx.ts`
  (`GET /api/dashboard/fx?date=`, `Allow: GET, HEAD`, usual 404/405/401 gate, 400 bad date, 503 no db).
  `date` must be a real calendar date (`isCalendarDate()` in `src/lib/dashboard/dates.ts`: strict
  `YYYY-MM-DD`, year >= 1, round-trips through a UTC `Date`), checked after the gate and before any
  database access, so 2026-02-31 or 0000-01-01 is 400, not a Postgres error (500). The Valet/ECB parsers
  drop provider rows with impossible dates the same way. Tests: `dates.test.ts`, `fx.test.ts`.
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

### Dashboard holdings valuation (T07 #15)

*Epic #53: the math below stays; the presentation (nine columns, total row) was replaced in #55 by the
four-field row, the tap detail and one total (value only); average cost becomes optional in ticket 3.*

- Code: `src/lib/dashboard/valuation.server.ts`: `valueHoldings()` (moved here from `fx.server.ts`; uses
  `fxFactor()` from `fx.server.ts`), `freshness()` and `loadDashboardHoldings()`, which the `/dashboard`
  loader (`gate.ts` `getDashboardHoldings`) calls. `priceViews()` now also returns `instruments.name`.
  UI: `holdings.tsx` (`AsOf`, the new columns and the total row).
- Formulas, with f = base units per listing-currency unit at the rate for the close's session date (else
  the latest earlier rate): market value = shares × close × f; cost = shares × avg cost × f (**D8**: the same
  rate); total return = value − cost; return % = (close − avg) / avg in the listing currency (`n/m` when
  avg is 0); % of portfolio = value / Σ value. Price- or FX-pending rows are left out of the totals and the
  %, and listed under the total row. Total return % = Σ return / Σ cost.
- Header: "Prices as of <latest session date of the valued rows> close · FX <latest rate date used>"
  ("FX not needed (all in BASE)" when no rate was used). Out-of-date note (DASH-25) when the latest
  `refresh_runs` row with status `ok` or `partial` is more than 4 calendar days (UTC) before today, or there
  is none ("No daily refresh has completed yet."; that's what a fresh preview shows until the button runs,
  since the new-holding backfill doesn't write `refresh_runs`).
- EL confirmed both choices (2026-10-02, recorded in spec §11): (a) a daily run that finishes with some
  per-ticker errors (`partial`) still counts as successful for the out-of-date note, because each row shows
  its own close date; (b) the note shows when no run has ever finished.
- Stored data only (DASH-14): nothing in `valuation.server.ts` takes a provider or a fetcher; a test
  checks the source for feed calls.
- Listing check (EL decision 2026-10-02): it stays on add, but `listing.server.ts` now calls
  `DailyCloseProvider.getListing(symbol, { fetch: true })` (`listingLookupFrom(provider)`;
  `providerListingLookup` = a fresh Yahoo provider per request). Without `fetch` (the daily job) the
  provider only reads its cached response. `ProviderError.kind` (`refused` / `not_found` /
  `unavailable`) maps to 400 / 404 / 503. Nothing in `holdings.server.ts` or `listing.server.ts`
  imports the Yahoo `pull()` directly.
- Tests: `src/lib/dashboard/valuation.test.ts` (PGLite, offline): the DASH-13 hand check (KO USD, ASML.AS
  EUR, RY.TO CAD, CAD base: 4,141.21 / 3,778.18 / +363.03, weights 24.1 / 54.2 / 21.7 = 100.0), D8, USD/EUR
  bases, pending rows, avg cost 0, DASH-14 (reloads identical, values change only after `runDailyRefresh`),
  DASH-25 (as-of dates incl. the 2026-09-30 BoC holiday, the 4/5-day boundary, partial/running/failed).
  `check:dashboard-built --with-database` checks the rendered columns and values.

### Dashboard metrics sheet and chips (#57, epic #53 ticket 4)

- `src/components/dashboard/metrics-sheet.tsx` (`MetricsSheet`, `data-testid="metrics"`) replaces the #55
  picker and table. Testids: `metric-search` (label `Add a metric`), `metric-options` / `metric-option`
  (only while the query is non-empty; Enter adds the first match), `metric-chips` / `metric-chip` /
  `metric-chip-remove` (`aria-label="Remove <label>"`), `metric-th` / `metric-row` / `metric-cell`, the
  interim `Portfolio` foot (`portfolio-metric-*`, ticket 5 makes it the `Book` row). One `PUT` per click burst.
- `holdings.tsx` `HoldingsSection`: with holdings, below 1024 px a `Holdings` | `Metrics` switch
  (`sheet-switch`, `sheet-switch-holdings` / `-metrics`, `aria-pressed`, `lg:hidden`); the hidden sheet is
  `hidden lg:block`. From `lg` a grid `minmax(0,3fr) minmax(0,2fr)` (`holdings-sheet` left, `metrics` right).
  No holdings: no switch, no sheet.
- Catalog (`metrics.ts`): `CHIPS` = the 8 metric keys + `share_of_book` (the row weight); `DEFAULT_CHIPS`
  `rev_g_1y`, `roic_1y`, `share_of_book`; `matchingChips()` (every query word in the label, kept chips out).
- Storage: `user_metric_columns` (now chip keys) + `user_settings.metric_chips_saved_at` from
  `migrations/0009_metric_chips_saved.sql` (nullable, `ADD COLUMN IF NOT EXISTS`). `getMetricChips()`:
  rows or a timestamp = saved (an empty list sticks; accounts with old saved columns keep them, EL); else the
  defaults. `GET /api/dashboard/columns` → `{columns, saved, available}`; `PUT {columns}` takes chip keys.
- Missing figure: `—` alone, reason in `title` + a visually hidden span (DR4-07; supersedes DASH-21's text).
- Tests: `metrics-sheet.dom.test.tsx`, `fundamentals.test.ts` (chips API), `store.test.ts`,
  `check-dashboard-built.mjs --with-database`; browser `qa/tools/dashboard-metrics.mjs` (both widths; adds and
  removes Gross margin on the phone pass unless it is already kept; signs out; never Delete).

### Dashboard fundamentals and metric columns (T08 #16)

*Epic #53: the eight metric columns become searchable chips on the metrics sheet (ticket 4; defaults Revenue
growth 1y, ROIC (1y), Share of the book; no reorder), and a missing figure shows `—` alone.*

- Code: `src/lib/dashboard/fundamentals.server.ts` (the one `FundamentalsSource` adapter:
  `createSecFundamentalsSource()`, `annualFactsFromCompanyFacts()`, the `CONCEPTS` tag map, name matching,
  `refreshFundamentals()` (the job), `metricViews()` (page read)); `metrics.ts` (the 8 metric keys and
  labels, status reasons); `columns-api.server.ts` + `src/routes/api/dashboard/columns.ts`
  (`GET`/`HEAD`/`PUT`); UI `src/components/dashboard/metric-columns.tsx` (`MetricCell`; the picker went in #57, see `metrics-sheet.tsx`), wired
  in `holdings.tsx`. Migration `0005_fundamentals.sql` adds `instruments.fundamentals_checked_at` and
  `fundamentals_error` (still 11 tables).
- SEC rules: User-Agent `OrpheusWisdom/1.0 (orpheus-app dashboard; <SEC_CONTACT_EMAIL>)`. The address is an
  env var the owner sets on Vercel; never commit one. Without it no SEC request is made and the run says
  `fundamentalsSkipped: true`. ≥200 ms between requests (≤5/s; SEC allows 10/s), ticker map once per run,
  companyfacts only when unchecked or ≥7 days old, ≤25 symbols and ≤60 s per run (whole run capped at
  270 s). Fetches happen only in the daily job / preview button and the new-holding backfill; pages and
  `/api/dashboard/columns` read Postgres only.
- Coverage: US symbol = SEC ticker. CA/EU: strip the venue suffix (`RY.TO` → `RY`) and require the same
  company name (tokens after dropping case, punctuation and legal suffixes; a prefix match needs ≥2
  tokens). No match, or a companyfacts 404 → `fundamentals_source='none'` + `not_covered` rows in
  `metric_values` for every key (DASH-21: "— not covered"). Errors (5xx, network) → `fundamentals_error`,
  retried next run, run `partial`.
- Stitching: per concept a ranked tag list; per fiscal year the most recently filed annual fact wins
  (10-K/20-F/40-F, fp FY, 335–395-day durations; instants only at fiscal year ends), one unit per concept.
- Metric values themselves come in T09–T13; until then a covered cell reads "— not computed yet".

### Dashboard revenue growth (T09 #17)

- Code: `src/lib/dashboard/metric-compute.server.ts`: `revenueGrowth()` (pure), `fiscalYearBack()`,
  `computeRevenueMetrics(db, symbol)` (reads `fundamentals_annual`, upserts `metric_values` for
  `rev_g_1y`, `rev_cagr_3y/5y/10y`) and `symbolsMissingRevenueMetrics()`. Called from `refreshFundamentals()`
  right after a covered symbol's facts are stored, and at the start of every `refreshFundamentals()` call for
  covered held symbols with missing rows (Postgres only, also when no SEC contact is set). Summary field
  `computed`. Pages still read `metric_values` only. T10–T13 add their metrics to the same module.
- Rules (spec §8): FY0 = latest stored fiscal year end (any concept); FY−n = stored year end n years back
  ± 45 days (closest). 1y: `n/m` when either value ≤ 0 or missing. CAGR: `n/m` when an endpoint ≤ 0 or FY0
  revenue missing; `insufficient_history` when FY−n missing. Values are fractions (`toPrecision(12)`),
  shown as % with 1 decimal. The portfolio cell for these metrics is T14 (spec §9).
- Tests: `src/lib/dashboard/metric-compute.test.ts` (SEC fixtures → ingest → metrics): KO hand check
  (1.9 / 3.7 / 7.7 / 0.8 %, 10y base from `SalesRevenueGoodsNet`), Philips (PHG), RY 10y insufficient history,
  zero/negative base, fiscal-year alignment, catch-up without SEC calls.

### Dashboard ROIC (T10 #18)

- Code: `metric-compute.server.ts` `roic()`, `roicTaxRate()`, `investedCapital()`, `isFinancialSic()`;
  `computeStoredMetrics()` (renamed from `computeRevenueMetrics`) now writes the 4 revenue rows + `roic_1y`;
  `symbolsMissingMetrics()` / `COMPUTED_METRIC_KEYS` drive the catch-up. Tooltip text: `METRIC_HELP` in
  `metrics.ts` (column header `title` and cell `title`).
- Data: migration `0006_instrument_sic.sql` (`ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sic INTEGER`,
  idempotent; previews share the main Neon branch). The SEC source gained `sic(id)` = one
  `https://data.sec.gov/submissions/CIK##########.json` request per covered symbol per 7-day refresh (same
  UA and ≥200 ms spacing; failure keeps the stored code). `CONCEPTS` gained fallback debt tags
  `LongTermDebtAndCapitalLeaseObligations{,Current,IncludingCurrentMaturities}` (KO tags only these since
  FY2024; they include finance leases). Named deviation (EL 2026-10-03): debt tags that include finance
  leases are a fallback only, used per fiscal year only when no lease-excluded tag exists (tag order enforces it).
- Rules: NOPAT = operating income FY0 × (1 − t); t = tax / pre-tax clamped 0–50%, 25% if pre-tax ≤ 0 or
  either missing. Invested capital = equity incl. NCI (else parent equity) + short-term borrowings (else
  CP + other short-term) + LTD total (else current + noncurrent; IFRS current-borrowings total when it's
  the only current line) − cash; missing debt/cash = 0. Average of FY0 and FY−1 (FY−1 = ±45 days).
  `n/m`: SIC 6000–6399, no FY0 operating income, no FY0 equity, average ≤ 0. `insufficient_history`: no FY−1
  equity. Symbols ingested before T10 have no SIC until their next 7-day SEC refresh (the operating-income
  rule still applies).
- QA fixes (#37 run 2026-10-03): **F2** `FUNDAMENTALS_PARSER_VERSION` (2) stored per instrument
  (`fundamentals_parser_version`, migration `0007`, idempotent; it also widens the `metric_values.status`
  CHECK with `insufficient_data`). Covered symbols with an older version are refetched regardless of the
  7-day window, their `fundamentals_annual` rows are replaced (not merged), and until then metrics that need
  the newer parser (`METRIC_MIN_PARSER`: `roic_1y` → 2) are stored as `insufficient_data` ("— insufficient
  data"). Invested capital: a line group (short-term debt / long-term debt / cash) never reported by the
  company in any stored year = 0; reported in other years but missing at FY0 or FY−1 → `insufficient_data`
  (this replaces the old "missing debt or cash lines = 0"). **F1** debt concepts are `rankFirst`: tag order
  beats filing date, so lease-inclusive tags are used for a year only when no lease-excluded tag exists
  (KO FY2023 → `LongTermDebt*` filed 2024-02-20). Holdings rows: one DELETE per row (ref guard), 404 = done
  (remaining DELETE 404s: issue #38). EL 2026-10-03 accepted `insufficient_data` as a cell state (spec §8
  table + dash reasons) and 0007's CHECK widening as is.
- Atomic refetch: `replaceFundamentals(db, symbol, facts)` replaces a symbol's `fundamentals_annual` rows in
  ONE SQL statement (CTE: upsert the new set + delete rows not in it). The app's Neon client is a `pg` Pool
  where each `query()` may use a different connection, so BEGIN/COMMIT across calls isn't safe; a single
  statement is atomic everywhere. A failing value leaves the old rows untouched (tested).
- Tests: `metric-compute.test.ts` DASH-17 block: KO hand check (17.4%), Philips (PHG) IFRS path, RY n/m (SIC
  6029), negative ROIC, SIC range, avg ≤ 0, insufficient history, tax clamp/fallback, invested-capital
  fallbacks, tooltip. Fixtures: KO companyfacts gained the 3 lease-inclusive debt tags (verbatim from a
  2026-10-03 live download); `submissions-CIK{KO,RY}-2026-10-03-subset.json` (cik, name, sic only).
  D9 (portfolio EPS) is T14.
- Tests: `src/lib/dashboard/fundamentals.test.ts` with `test-fixtures/sec/` (live 2026-10-02, trimmed to
  the mapped tags, facts verbatim; values checked against live EDGAR companyconcept once).

### Dashboard EPS (T11 #19)

- Code: `metric-compute.server.ts` `eps()` + `epsCurrency()`; `computeStoredMetrics()` writes `eps_1y`
  (`COMPUTED_METRIC_KEYS` now 6, so the catch-up fills it for companies stored earlier; no new tags, no
  parser bump, no migration). `metricViews()` adds `currency` (from the stored FY0 `eps_diluted` unit,
  "USD/shares" → "USD"). Display: `formatEps()` in `format.ts` (as reported, ≥ 2 decimals, + code);
  tooltip in `METRIC_HELP`.
- Rules: diluted EPS for FY0 (the latest stored fiscal year end, any concept), as reported; basic EPS is
  never substituted; no FY0 diluted EPS → `n/m`; a unit that isn't `<CUR>/shares` → `insufficient_data`.
  Splits: FY0's value is the most recent filing's (a 10-K/A restatement wins); only FY0 is used, so no
  cross-year adjustment. IFRS: `ifrs-full:DilutedEarningsLossPerShare`. The portfolio EPS cell (D9,
  weighted 1y EPS growth) is T14.
- Tests: `metric-compute.test.ts` DASH-18 block: KO 3.04 USD hand check, Philips (PHG) 0.93 EUR (IFRS; PHIA.AS is not covered),
  RY 14.07 CAD, ASML 24.71 EUR, missing → n/m, basic-only filer, negative EPS, odd unit, 10-K/A
  restatement, display without rounding.
- #38 (second DELETE on one click) is not folded in: the cause isn't obvious from the client code (the
  per-row guard already blocks double clicks); left for its own ticket.

### Dashboard EBIT margin (T12 #20)

- Code: `metric-compute.server.ts` `ebitMargin()`; `computeStoredMetrics()` writes `ebit_margin_1y`
  (`COMPUTED_METRIC_KEYS` now 7; the catch-up fills companies stored earlier). Revenue and operating income
  tags are unchanged since T08: no new tags, no parser bump, no migration. Tooltip in `METRIC_HELP`.
- Rules (spec §8): FY0 operating income / FY0 revenue, both as stored (no adjustments). `n/m`: FY0 revenue
  ≤ 0 or missing, or no FY0 operating income (banks such as RY). `insufficient_data`: the two facts are in
  different units. Negative margins are values. No SIC rule (the spec has none for this metric).
- Tests: `metric-compute.test.ts` DASH-19 block: KO 13,762 / 47,941 = 28.7%, Philips (PHG) 8.0% (IFRS),
  ASML, RY n/m, negative margin, revenue ≤ 0 / missing, unit mismatch, tooltip.

### Dashboard gross margin (T13 #21)

- Code: `metric-compute.server.ts` `grossMargin()`; `computeStoredMetrics()` writes `gross_margin_1y`
  (`COMPUTED_METRIC_KEYS` now 8; the catch-up fills companies stored earlier). `gross_profit` and
  `cost_of_revenue` tags exist since T08: no new tags, no parser bump, no migration. Tooltip in `METRIC_HELP`.
- Rules (spec §8): FY0 gross profit / FY0 revenue; if there is no FY0 gross-profit fact, (FY0 revenue − FY0
  cost of revenue) / FY0 revenue (decided per FY0, so all inputs are from the same year). `n/m`: FY0 revenue
  ≤ 0 or missing, or neither concept for FY0 (banks such as RY). `insufficient_data`: facts in different
  units. Negative margins are values.
- Tests: `metric-compute.test.ts` DASH-20 block: KO 29,544 / 47,941 = 61.6%, the fallback (KO with
  GrossProfit removed → same 61.6% from `CostOfGoodsAndServicesSold`), Philips (PHG) 45.2%, ASML, RY n/m,
  revenue ≤ 0 / missing, negative, unit mismatch, tooltip.

### Dashboard portfolio aggregates (T14 #22)

*Epic #53: the math below stays; the figures move to the metrics sheet's `Book` row (ticket 5), 0% coverage
shows `—`.*

- Code: `src/lib/dashboard/portfolio.ts` `portfolioMetrics()` (pure; called by `loadDashboardHoldings()`
  → `portfolio`, computed at read time from the stored valuation and `metric_values`; no new table, no
  migration). UI: `PortfolioMetricCell` in `metric-columns.tsx`, rendered in the holdings `<tfoot>` total
  row; text from `format.ts` `formatPortfolioCell()` / `formatCoverage()`.
- Rules (spec §9): value = Σ MVᵢ·mᵢ / Σ MVᵢ over valued holdings whose company is covered and whose stored
  status is `ok`; coverage = that Σ MV / Σ MV of all valued holdings. Everything else (n/m, insufficient
  history/data, not covered, pending, not computed) is excluded and counts against coverage; negatives are
  included. Price/FX-pending holdings are outside both sums. 0% coverage → `—` alone (since #58; was
  `— · 0% covered`); nothing valued → `—`.
  Coverage is a whole percent, never rounded to 100% (or 0%) unless exact.
- D9: new stored per-company metric `eps_g_1y` (`epsGrowth()` in `metric-compute.server.ts`; not a picker
  column) = diluted EPS FY0 / FY−1 − 1; n/m if FY0 EPS missing or either ≤ 0; insufficient history if no
  FY−1 (±45-day match); insufficient data if units differ. The EPS column's portfolio cell uses it, labelled
  "EPS growth 1y (weighted)". `COMPUTED_METRIC_KEYS` now 9 (catch-up fills stored companies; no parser bump).
- Tests: `metric-compute.test.ts` DASH-22/23 block: hand-checked CAD portfolio KO + ASML.AS + RY.TO + PHG +
  MC.PA (not covered) from the fixtures (EBIT margin 3 of 5, 71% covered; D9 KO/ASML/RY growth, PHG n/m),
  every metric vs Σ formula, negatives (PHG revenue growth), pending price, 0% coverage, epsGrowth rules.

- EL approved (#42 / #43): whole-% coverage that never rounds to 0% or 100% unless exact; price/FX-pending
  holdings outside both the weights and coverage; no FY−1 diluted EPS → `insufficient_history`.

### Dashboard pie chart (T15 #23) and the excluded-holdings flag

*Epic #53: `pieSlices()` stays; since ticket 5 (#58) the pie is a donut under the one total, the pending
lists and the empty sentence are gone (see "Dashboard book (#58)"). The excluded-holdings line stays.*

- Code: `src/lib/dashboard/pie.ts` `pieSlices()` (pure, from `valuation.rows`: value / total × 100, the same
  numbers as the table's % column, labelled with the same `toFixed(1)`), `PIE_MAX_SLICES = 10` (10 largest +
  "Other"), ties by ticker, neutral greys `PIE_COLOURS`; `excludedNote()`. UI:
  `src/components/dashboard/holdings-pie.tsx` (recharts `PieChart`, the library the DCA chart already
  uses; no new dependency) rendered under the table; the legend list doubles as the accessible text and
  the server-rendered content (the chart itself mounts client-side). Empty state "No holdings with a price
  yet."; "price pending: …" / "FX pending: …" lists under the chart.
- Total row (EL, #43): `holdings-total-excluded-count` under "Total": "1 holding without a price excluded" /
  "N holdings without a price excluded" ("… or FX rate" when one is FX pending); absent when N = 0.
- Tests: `valuation.test.ts` DASH-24 block (KO + ASML.AS + RY.TO in CAD: slice = row weight, same label,
  sum 100.0; price pending; > 10 → Other; ties; empty / FX pending; greys) and the excluded-flag block;
  `check-dashboard-built.mjs --with-database` checks the empty/price-pending pie, the "1 holding without a
  price excluded" flag before the first close, and KO 100.0% afterwards.

### Dashboard book (#58, epic #53 ticket 5)

- One total (`holdings-total`, value only, `—` when nothing is valued) + excluded line, unchanged from #55.
- Donut: `holdings-pie.tsx` renders `pieSlices()` with `innerRadius="58%"` (`data-shape="donut"`, caption
  `Share of the book (<base>)`, `aria-label` "Donut chart of share of the book: …"); 10 largest + `Other`,
  largest first, ties by ticker; returns `null` with no valued holding (no sentence). No pending lists.
- Book row: the metrics sheet's `<tfoot>` row (`book-row`, label `Book`). Per chip `PortfolioMetricCell`
  with `portfolio[key]` from `portfolioMetrics()` (math unchanged: dashes excluded, weights renormalised);
  `formatPortfolioCell()` gives `x.x% · N% covered` or `—` alone (0% coverage too); `bookFigure()` wraps only
  between figure and coverage. Share chip: sum of the valued weights (100.0%), no suffix.
- QA tools that sign in (`dashboard-list`, `-add`, `-metrics`, `-book`) go through `qa/tools/session.mjs`
  `eachViewport()`: sign-in, checks, and sign-out in a `finally` (QA N4); a thrown error is a FAIL. Don't
  add a tool that signs in or out by itself (`scripts/qa-tools-session.test.mjs` enforces it).
- Tests: `book.test.ts`, `book.dom.test.tsx`, `check-dashboard-built.mjs --with-database` (book section);
  browser `qa/tools/dashboard-book.mjs` (read-only; re-derives the % chips' book figures from the visible
  cells and weights).
- Release doc: migration 0008 is forward-only; null costs must be cleared before any production rollback
  past #56 (`docs/release/dashboard-release.md`, "Migrations against production").

### Holding delete: one DELETE per click (#38, PR #44)

- Root cause: after a successful DELETE the row released its guard and re-enabled Edit/Delete while the page
  loader's refetch (`router.invalidate()`) was still running (seconds on Vercel), so the deleted row stayed
  on screen and clickable; every further click sent DELETE for an id that no longer exists → 404 (the
  server is right). The route's `ANY` handler is not involved: each request runs one handler (checked
  against the built server).
- Fix (`holdings.tsx` `Row.remove()`): the guard is released only on an error; on success the row shows
  "Deleted" (dimmed, `aria-busy`) with no buttons until the refetch removes it. Test: `metric-compute.test.ts`
  "QA: holdings delete fires once (#37, #38)".
- QA N3 in the same PR: the EPS column's portfolio cell shows "EPS growth 1y (weighted)" as a visible
  sub-label under the value (`PortfolioMetricCell`); `check-dashboard-built --with-database` checks it.

### Dashboard release prep (#24, prep only)

- `docs/release/dashboard-release.md`: DASH-00..26 + DCA-01..06 checklist by ticket, Production env list
  (names, purpose, format, who sets, required; never values), DB options (recommended: dedicated Neon
  production branch, `DATABASE_URL` / `DATABASE_URL_UNPOOLED`), migration commands, cron, ordered runbook with
  rollback, Diego's test-account steps and removal SQL, open decisions (N3: keep `/api/dashboard/db` 404 on
  production as coded; `/status` public with only `{"dashboard":"enabled"}` there).
- `scripts/release-smoke.mjs <url> off|on|preview`: GET-only, no credentials; test `scripts/release-smoke.test.mjs`.
  Since #46 every mode also checks the site shell (menu, home cards, footer, `/calculator`, the `/?query`
  redirect, noindex meta + `X-Robots-Tag`) and `GET /api/chart?ticker=VOD.L…` → 400 with the exact message.
- #45 release decisions (EL) are recorded in `docs/release/dashboard-release.md` §5.
- N1: `format.ts` `formatPortfolioPct()` is the one "% of portfolio" formatter (table `weightPct` and pie
  `piePct` are that function); test in `valuation.test.ts`. N2: rounded labels may not sum to exactly 100.0.
- Bots never flip production or touch Vercel env; production gets read-only GETs only.
- QA N1 (#45): click-level component tests `src/**/*.dom.test.tsx` run in jsdom via `scripts/run-dom-tests.mjs`
  (rolldown bundles the TSX into `node_modules/.cache/dom-tests`, then `node --test`); part of `npm test`, so
  CI runs them. Setup: `src/test/dom-setup.ts`. First test: `holdings.dom.test.tsx` (delete guard: a 200
  DELETE then more clicks → one request and "Deleted"; a 500 re-enables the buttons; cancel sends nothing).
  devDependencies: `jsdom`, `@types/jsdom`, `rolldown` (pinned to the version Vite already installs).

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
