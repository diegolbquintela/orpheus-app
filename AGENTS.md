# AGENTS.md: harness for bots working in orpheus-app

This is the harness for any bot (SWE, QA, Triage, Engineering Lead, Nightly Audit) working in this repo.
Read it before you touch anything. Plain build conventions only; team process lives in the vault
(`Orpheus/kb/specs/TECH-TEAM.md`, `Orpheus/kb/specs/HARNESS.md`) and is summarized here where it
affects the repo.

## Source-of-truth rule (Diego, 2026-10-02)

**Always the harness, then the specs, then the work.**

- The harness (this `AGENTS.md`), the spec docs (`attachments/dca-app-spec.md` for the calculator;
  `attachments/dashboard-spec.md` for the signed-in dashboard, **approved by Diego 2026-10-02 for
  decisions D1–D7, D10, D11**; D8, D9, D12 and Amendment A (daily-close source) are still pending) and `README.md` are the source of truth for this
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
| `npm run build` | `vite build` (Vercel preset, output in `.vercel/output/`) then `db:migrate` (skips when `DATABASE_URL` is unset) |
| `npm run fixtures:build` | Rebuild `qa/fixtures.json` offline from `qa/snapshots/*.json` through the app's own `loadChart()` and `runDesk()`. Add `-- --refresh` to re-pull Yahoo (network) |
| `npm run fixtures:hand-check` | Independent recomputation from the raw snapshots (shares no code with `src/lib/dca`); rewrites `qa/HAND-CHECK.md`, exits non-zero on mismatch |
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

## Feature flags: feature work lands behind a flag until a release go

*Active since 2026-10-02, when the dashboard spec was approved. The rule does not depend on the pending D8, D9 or D12.*

- New user-facing features merge to `main` **behind a flag** and stay hidden on production until Diego
  gives a release go. Each ticket still gets its own PR, preview and QA pass.
- Mechanism (dashboard): one **server-only** env var, `DASHBOARD_ENABLED`, set to `true` only in the Vercel
  **Preview** environment (an owner adds it when ticket T01, #9, lands; it is not set anywhere yet). Every dashboard route, server function and API route returns 404 unless it is
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
  spec adds more Vercel-only variables as its tickets land (`DASHBOARD_ENABLED`, `DATABASE_URL` from the Neon integration,
  `BETTER_AUTH_URL`, `CRON_SECRET`, an SEC contact for the User-Agent, a sign-up email allow-list if D12 is approved); none
  exist yet. Each is added by an owner when its ticket lands.
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
