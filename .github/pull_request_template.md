## What and why

## Checklist
- [ ] `README.md`, the relevant spec and `AGENTS.md` updated in this PR, or the body says why not for each.
- [ ] Docs are additions only (dated notes; existing spec / AC text not reworded).
- [ ] New `src/**/*.test.ts` files are in the explicit `npm test` list.
- [ ] Gates under TZ=UTC and TZ=America/Los_Angeles with `DATABASE_URL*` unset: `npm ci`, `tsc`, `eslint`, `npm test`, `npx vite build`, `check:dashboard-built`. Never `npm run build`.
- [ ] No schema change, migration, new table, dependency or provider (else hard stop: EL, then Diego via CoS).
- [ ] No secret, key or DB URL in the diff, logs or PR text.
- [ ] Every new PF feature ships with its endpoint documented and CFO notified (#245): `/api/cfo/pf/*` endpoint added/updated (or why none), listed in spec §67, `AGENTS.md` and `README.md`; CFO notified.
