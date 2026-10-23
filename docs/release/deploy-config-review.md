# Deploy-config review (#210), 2026-10-23

Review only. Nothing was changed: no env vars, redeploys, cron triggers, DB reads/writes or code fixes. No secret or database URL value appears here; databases are named by Vercel/Neon integration name only.

## Scope (from #210)
1. Vercel cron `/api/cron/daily-refresh` (`0 23 * * *` UTC): is it invoked? (`refresh_runs` has no cron rows; `fx_rates` stops at 2026-10-19.)
2. `CRON_SECRET`: is it present in Production? (presence only)
3. Which database Production uses, compared with previews and the box backfill DB.
4. All env vars per environment, including the unused `VITE_STUN_URLS` (#185).
5. Vercel connector access to team `diegolbquintelas-projects` (403 for logs/crons).

## Method
- Repo at `42882da`: `vercel.json`, `package.json` scripts, `migrations/`, cron route, grep for `process.env` / `import.meta.env`, `docs/release/`, `/workspace/swe/186-progress.md`.
- `gh api repos/diegolbquintela/orpheus-app/deployments?environment=Production`.
- Vercel MCP, read-only: `list_teams`, `filter_project_envs` (decrypt=false; only key/type/target/updatedAt kept), `get_project`. Both connector namespaces tried.

## Findings

### DCR-01: no evidence the cron has ever run in Production (MEDIUM)
- Evidence: `vercel.json:4` declares the cron. The handler (`src/routes/api/cron/daily-refresh.ts:4-10`) accepts GET and needs `Authorization: Bearer <CRON_SECRET>`. Per `186-progress.md`, `refresh_runs` has 5 rows, all `trigger=preview`, newest 2026-10-15; there are no cron rows. A signed-out probe of Prod returns 401 (the route is alive). Vercel cron invocation logs can't be read through the connector (`get_project` returns no cron data; logs/crons are covered by DCR-06), so the cause can't be confirmed yet. It could be a request rejected before the DB (401/404/503) or the cron never firing.
- Recommended fix: Diego checks Vercel dashboard → orpheus-app → Settings → Cron Jobs and the function logs at 23:00 UTC to see whether the job is enabled and what status it returns.
- Owner: Diego (dashboard access), then SWE to triage.
- Status: needs Diego's yes.

### DCR-02: CRON_SECRET is present in Production (INFO)
- Evidence: `filter_project_envs` (observed by SWE at ~13:41 ET 2026-10-23, not re-verified (QA got 403 at 13:45 ET)): `CRON_SECRET` is type sensitive in **Production** (updated 2026-10-04 06:48 EDT) and **Preview** (updated 2026-10-02 19:10 EDT). It isn't set in Development. The value was not read.
- Recommended fix: none for presence. If DCR-01 shows 401s, re-save the Production value and redeploy (on Diego's yes).
- Owner: Diego.
- Status: needs Diego's yes.

### DCR-03: Production DB is separate from the preview DB; the backfill target is unconfirmed (MEDIUM)
- Evidence: Production has its own `DATABASE_URL` and `DATABASE_URL_UNPOOLED` (sensitive, Production only, updated 2026-10-04). Preview and Development use the Neon integration vars `orpheus_app_preview_*` (`DATABASE_URL`, `PGHOST`, `NEON_PROJECT_ID`, …; integration "orpheus_app_preview"). The resolver order is in `src/lib/db.ts:7` and `src/lib/dashboard/db.server.ts:4`. Sensitive values can't be read, so the Production host/Neon project can't be named from metadata. The box backfill/Q-2 query used a `DATABASE_URL_UNPOOLED` from the box env (`186-progress.md:9`), and whether it points at the Production or the preview Neon project is not recorded.
- Recommended fix: Diego confirms in the Neon/Vercel dashboard which Neon project and host back Production, then records the project names (not URLs) in `docs/release/dashboard-release.md`. Diego also confirms which project the box `DATABASE_URL_UNPOOLED` targets. This matters for #170 AC27 (`fx_rates` gap).
- Owner: Diego.
- Status: needs Diego's yes.

### DCR-04: env var inventory; VITE_STUN_URLS already absent (LOW)
- Evidence (key: environments):
  - BETTER_AUTH_SECRET: Prod, Preview
  - BETTER_AUTH_URL: Prod only
  - CRON_SECRET: Prod, Preview
  - DASHBOARD_ENABLED: Prod, Preview
  - DASHBOARD_SIGNUP_ALLOWLIST: Prod, Preview
  - DATABASE_URL, DATABASE_URL_UNPOOLED: Prod only
  - ORPHEUS_OWNER_EMAIL: Prod, Preview
  - SEC_CONTACT_EMAIL: Prod, Preview
  - VITE_AUTH_ENABLED: Prod, Preview, Dev
  - orpheus_app_preview_* (18 Neon integration vars): Preview, Dev
  - `VITE_STUN_URLS`: **absent in all environments**. Its only repo mention is historical (`qa/CANONICAL-AC-PACK.md:1531`).
- Gaps: Development has no `BETTER_AUTH_SECRET`, `CRON_SECRET` or `DASHBOARD_ENABLED`, which is fine for local runs on PGLite. Code-read vars not in Vercel: `TSS_SERVER_FN_BASE` (`src/lib/access/viewer.server.ts:59`), probably optional. Neon integration vars that are unused (`POSTGRES_PRISMA_URL`, `*_NO_SSL`, `VITE_NEON_AUTH_URL`, `NEON_AUTH_BASE_URL`) are present in Preview/Dev; `VITE_`-prefixed ones could be bundled into client code if referenced (they aren't today).
- Recommended fix: nothing to remove for STUN. Optionally prune unused integration vars.
- Owner: Diego.
- Status: needs Diego's yes.

### DCR-05: every Vercel build runs migrations (MEDIUM)
- Evidence: `package.json:11` `"build": "vite build && npm run db:migrate"`. Every Production deploy migrates the Production DB, and every preview deploy migrates the preview Neon DB, including from unmerged branches. `vercel.json:3` installs with `--omit=dev`. Project Node is 24.x (`get_project`; observed by SWE at ~13:41 ET 2026-10-23, not re-verified (QA got 403 at 13:45 ET)), while CI/box uses 22.
- Recommended fix: decide whether preview builds should migrate the shared preview DB, or gate migrate on `VERCEL_ENV`. Align the Node version: proposal only, pin Node via `package.json` `engines` (e.g. `"node": "22.x"`) and/or a `.nvmrc`, and match the Vercel project setting. Neither file is added in this PR.
- Owner: SWE (proposal), Diego (decision).
- Status: needs Diego's yes.

### DCR-06: Vercel connector 403 on the team scope (MEDIUM, 403 hit)
- Evidence: `user-Vercel` `filter_project_envs` with `slug=diegolbquintelas-projects` failed with: `Vercel API request failed (403: forbidden). Not authorized: Trying to access resource under scope "diegolbquintelas-projects". You must re-authenticate to this scope or use a token with access to this scope.` (operation `GET /v10/projects/{idOrName}/env`). `list_teams` returned 0 teams. The team-bound namespace `user-Vercel--diegolbquintelas-projects` returned data for `filter_project_envs` and `get_project` (observed by SWE at ~13:41 ET 2026-10-23, not re-verified (QA got 403 at 13:45 ET)). QA got a 403 from that same namespace at 13:45 ET, so team access is unreliable. Cron and runtime logs are still unavailable (#210). No workaround was attempted.
- Recommended fix: Diego approves team access for the `user-Vercel` connection (the connector's `authorize_team_access` flow), then confirm both namespaces work.
- Owner: Diego.
- Status: needs Diego's yes.

## Summary
| ID | Severity | Finding | Owner | Status |
|---|---|---|---|---|
| DCR-01 | MEDIUM | No cron-triggered run ever recorded; invocation unverifiable | Diego → SWE | needs Diego's yes |
| DCR-02 | INFO | CRON_SECRET present in Production + Preview | Diego | needs Diego's yes |
| DCR-03 | MEDIUM | Prod DB separate from preview Neon; prod host and box backfill target unconfirmed | Diego | needs Diego's yes |
| DCR-04 | LOW | Env inventory; VITE_STUN_URLS already absent; unused integration vars | Diego | needs Diego's yes |
| DCR-05 | MEDIUM | `build` runs db:migrate on every deploy incl. previews; Node 24 vs 22 (observed ~13:41 ET, not re-verified) | SWE / Diego | needs Diego's yes |
| DCR-06 | MEDIUM | Connector 403 on team scope (user-Vercel); team-bound namespace also 403 for QA at 13:45 ET | Diego | needs Diego's yes |
