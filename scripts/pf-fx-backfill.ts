#!/usr/bin/env node
/**
 * #170: backfill Bank of Canada daily FX for the PF currencies into `fx_rates`, 2020-01-01 .. today (UTC date).
 * Idempotent (a second run inserts 0). Connects over HTTPS with @neondatabase/serverless (2026-10-20: outbound
 * Postgres 5432 is blocked from the box) to the database named by scripts/db-env.mjs (DATABASE_URL_UNPOOLED /
 * DATABASE_URL, else the preview integration names). Logs names, never values.
 * Run: node --experimental-strip-types scripts/pf-fx-backfill.ts --dry-run | --verify | --confirm
 * Logic and tests: src/lib/finance/fx-backfill-cli.server.ts. Runbook: docs/release/2026-10-20-pf-fx-backfill.md.
 */
import { neon } from "@neondatabase/serverless";
import { resolveMigrationUrl } from "./db-env.mjs";
import { runBackfillCli, runGuarded, type QueryFn } from "../src/lib/finance/fx-backfill-cli.server.ts";

const get = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { "User-Agent": "orpheus-app PF FX backfill" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Bank of Canada HTTP ${res.status}`);
  return res.text();
};
const connect = (url: string): QueryFn => {
  const sql = neon(url);
  return async <T,>(text: string, params?: unknown[]) => (await sql.query(text, params ?? [])) as T[];
};

process.exitCode = await runGuarded(
  () =>
    runBackfillCli(process.argv.slice(2), {
      env: process.env,
      today: new Date().toISOString().slice(0, 10),
      get,
      resolve: resolveMigrationUrl,
      connect,
      log: (s) => console.log(s),
      error: (s) => console.error(s),
    }),
  // Last resort (QA J1/J3): the same redact() as the CLI, with the same target.
  () => resolveMigrationUrl(process.env)?.url ?? "",
  (s) => console.error(s),
);
