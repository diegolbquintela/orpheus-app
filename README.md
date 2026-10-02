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

**QA run logs.** QA's pass/fail run logs and screenshot evidence are **not in this repo yet**. Today
they live on the team's shared machine at `/workspace/orpheus-app/qa/`: `run-YYYY-MM-DD-*.md` plus
`evidence/<run>/`. QA's working copy of the fixtures and the acceptance-criteria pack
(`CANONICAL-AC-PACK.md`) live there too.

## Deploy

The app is hosted on Vercel.

- `main` deploys automatically to production: https://orpheus-app-beta.vercel.app.
- Every pull request gets its own public preview URL, which vercel[bot] posts as a comment on the PR.
- Nothing deploys from anywhere else. The earlier Grok hosting is retired.

## Team loop

1. SWE branches off `main` and opens a **draft** PR. Nobody pushes directly to `main`.
2. CI must be green. The Engineering Lead reviews.
3. QA runs the six rules on the PR's **Vercel preview** and says pass or fail.
4. The Engineering Lead merges. Vercel deploys `main` to production.
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
