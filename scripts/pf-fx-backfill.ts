#!/usr/bin/env node
/**
 * #170: backfill Bank of Canada daily FX for the PF currencies into `fx_rates`, 2020-01-01 .. today (UTC date).
 * Idempotent (a second run inserts 0). Writes to the database named by scripts/db-env.mjs (DATABASE_URL_UNPOOLED /
 * DATABASE_URL, else the preview integration names). Refuses to write without `--confirm`. Logs names, never values.
 * Run: node --experimental-strip-types scripts/pf-fx-backfill.ts [--dry-run | --confirm]
 * Runbook: docs/release/2026-10-20-pf-fx-backfill.md (EL runs it; SWE never has).
 */
import pg from "pg";
import { resolveMigrationUrl } from "./db-env.mjs";
import { backfillPfFx, parseValet, valetUrl } from "../src/lib/finance/fx-backfill.server.ts";
import { FX_HISTORY_FROM, PF_BOC_QUOTES } from "../src/lib/finance/fx-history.ts";

const args = new Set(process.argv.slice(2));
const today = new Date().toISOString().slice(0, 10);
const get = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { "User-Agent": "orpheus-app PF FX backfill" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Bank of Canada HTTP ${res.status}`);
  return res.text();
};

if (args.has("--dry-run")) {
  const rows = parseValet(JSON.parse(await get(valetUrl(PF_BOC_QUOTES, `${FX_HISTORY_FROM}-01`, today))), PF_BOC_QUOTES);
  console.log(`[pf-fx-backfill] dry run: ${rows.length} BoC rows for ${PF_BOC_QUOTES.join(",")} from ${FX_HISTORY_FROM}-01 to ${today}; nothing written.`);
  process.exit(0);
}
if (!args.has("--confirm")) {
  console.error("[pf-fx-backfill] refusing to write without --confirm (use --dry-run to only fetch).");
  process.exit(2);
}
const target = resolveMigrationUrl(process.env);
if (!target) {
  console.error("[pf-fx-backfill] no database URL set.");
  process.exit(2);
}
console.log(`[pf-fx-backfill] using ${target.name}`);
const client = new pg.Client({ connectionString: target.url });
await client.connect();
try {
  const db = { query: async <T,>(text: string, params?: unknown[]) => (await client.query(text, params)).rows as T[] };
  const s = await backfillPfFx(db, get, { today });
  console.log(`[pf-fx-backfill] ${s.quotes.join(",")} ${s.from}..${s.to}: fetched ${s.fetched}, inserted ${s.inserted}.`);
} finally {
  await client.end();
}
