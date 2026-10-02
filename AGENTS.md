# AGENTS.md: harness for bots working in orpheus-app

This is the harness for any bot (SWE, QA, Triage, Engineering Lead, Nightly Audit) working in this repo.
Read it before you touch anything. Plain build conventions only; team process lives in the vault
(`Orpheus/kb/specs/TECH-TEAM.md`, `Orpheus/kb/specs/HARNESS.md`) and is summarized here where it
affects the repo.

## Source-of-truth rule (Diego, 2026-10-02)

**Always the harness, then the specs, then the work.**

- The harness (this `AGENTS.md`), the spec docs (`attachments/dca-app-spec.md` today) and `README.md`
  are the source of truth for this app.
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
- **No direct pushes to `main`. No force-pushes to `main`. Bots do not merge.**
- Loop: SWE writes the PR → CI green → Engineering Lead reviews → QA passes on the PR's **Vercel
  preview URL** (vercel[bot] comments it on the PR) → Engineering Lead merges → Vercel deploys `main`
  to production (https://orpheus-app-beta.vercel.app) → QA re-checks production.
- The PR body states which of `README.md` / spec / `AGENTS.md` changed and why the others did not.
- Never message Diego. Blockers go to the Engineering Lead; the Chief of Staff relays.

## What bots may not touch

- **Engine math** (`src/lib/dca/simulate.ts`, `calendar.ts`, `raw.ts`, and anything else that changes
  computed numbers) without a spec change approved first. Presentation code (`desk.tsx`,
  `src/lib/dca/results.ts`, `format.ts` labels) is fine within the spec.
- **Secrets.** Environment variables live only in Vercel project settings: `VITE_AUTH_ENABLED`,
  `BETTER_AUTH_SECRET`. Never commit their values, never create a `.env` file in the repo, never paste
  values into chat, PR bodies, logs or the vault. (`.grok/app-env.json` holds only the non-secret local
  default `VITE_AUTH_ENABLED: "false"`; a real environment value always wins.)
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
- QA's acceptance pass runs the six DCA rules against the PR preview, then production. QA run logs
  currently live outside the repo on the shared box (see `README.md`).

## Repo leftovers from the Grok template

`.grok/` (skills, references, `app-env.json`), `startup.sh`, `scripts/preview*.mjs`, `screenshots/`
and the Grok helpers in `scripts/` and `server/` come from the Grok App Builder template. Grok hosting
is retired, and the old template `AGENTS.md` (sandbox, port-8080 preview proxy, Grok chat rules) was
replaced by this file. The leftover files are not instructions for this repo, but some are still wired
in: `scripts/with-app-env.mjs` reads `.grok/app-env.json` for `dev`/`build`/`preview`, and
`vite.config.ts` loads the Grok PWA and app-env plugins plus `server/` middleware. Remove them only in a
dedicated PR that keeps CI and the Vercel build green.
