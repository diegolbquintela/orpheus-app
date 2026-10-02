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
- On (Vercel **Preview** environment only, set by an owner): `/dashboard` shows the current shell, and
  `GET /api/dashboard/status` returns `{"dashboard":"enabled"}` (other methods: 405 JSON, `Allow: GET, HEAD`).
- The calculator at `/` doesn't read the flag and doesn't link to the dashboard.

```bash
DASHBOARD_ENABLED=true npm run dev     # then open http://localhost:8080/dashboard
```

**Dashboard storage (Neon Postgres).** The dashboard tables (spec §5) are in
[`migrations/0002_dashboard.sql`](migrations/0002_dashboard.sql). Data access lives in
`src/lib/dashboard/store.server.ts` and is server-only.
- Database URL: `DATABASE_URL` when set, otherwise `orpheus_app_preview_DATABASE_URL`, the prefixed name the
  Vercel Neon integration injects. It's scoped to Preview and Development only; Production has none.
  Migrations prefer the direct connection (`DATABASE_URL_UNPOOLED`, else
  `orpheus_app_preview_DATABASE_URL_UNPOOLED`) and fall back to the pooled URL. Neon preview branching is
  on, so a preview deploy can get its own Neon branch. Precedence lives in `scripts/db-env.mjs`.
- `npm run build` applies pending migrations when a database URL is set. It logs which env var name it used
  (never the value), then `applied 0002_dashboard.sql`
  once, then `up to date` on later deploys.
- With neither name set, dashboard storage is unavailable: `/dashboard` shows "Database: not configured".
  The app still builds, and the calculator never touches the database.
- On previews (flag on), `/dashboard` shows a status line, "Database: connected · 9/9 tables" when Neon is
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

- Environment variables live only in the Vercel project settings: `VITE_AUTH_ENABLED` and
  `BETTER_AUTH_SECRET`.
- Never commit their values and never add a `.env` file.
- Never paste secret values into issues, PRs, chat or notes.
- `.vercel/output/` is build output and is git-ignored.
