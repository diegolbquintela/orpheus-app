/**
 * #170 follow-up (2026-10-20): the PF FX backfill CLI, with the database query function injected so it is testable
 * without a database. scripts/pf-fx-backfill.ts wires it to @neondatabase/serverless over HTTPS (port 443), because
 * outbound Postgres (5432) is blocked from the box. Modes:
 *   --dry-run  fetch from BoC only; nothing connects to a database.
 *   --verify   read-only: the runbook's per-currency check (oldest date, newest date, count) as a table.
 *   --confirm  fetch and insert (backfillPfFx: same rows, same ON CONFLICT (quote, rate_date) DO NOTHING).
 * Without a mode it refuses (exit 2). The connection string comes only from the environment (scripts/db-env.mjs
 * names); only the variable's name is ever printed.
 */
import { backfillPfFx, parseValet, valetUrl } from "./fx-backfill.server.ts";
import { FX_HISTORY_FROM, PF_BOC_QUOTES } from "./fx-history.ts";

export type QueryFn = <T>(text: string, params?: unknown[]) => Promise<T[]>;

/** The runbook's verification query (docs/release/2026-10-20-pf-fx-backfill.md), read-only. */
export const VERIFY_SQL = `SELECT quote, min(rate_date)::text AS oldest, max(rate_date)::text AS newest, count(*)::int AS n
FROM fx_rates WHERE source = 'BOC' AND quote = ANY($1::text[])
GROUP BY quote ORDER BY quote`;

export type VerifyRow = { quote: string; oldest: string | null; newest: string | null; n: number };

/** Every PF quote, in order, with its oldest / newest date and row count (0 and — when it has no rows). */
export async function verifyPfFx(query: QueryFn): Promise<VerifyRow[]> {
  const got = await query<{ quote: string; oldest: string; newest: string; n: number | string }>(VERIFY_SQL, [[...PF_BOC_QUOTES]]);
  const by = new Map(got.map((r) => [r.quote, r]));
  return [...PF_BOC_QUOTES].sort().map((q) => {
    const r = by.get(q);
    return r ? { quote: q, oldest: r.oldest, newest: r.newest, n: Number(r.n) } : { quote: q, oldest: null, newest: null, n: 0 };
  });
}

export function verifyTable(rows: VerifyRow[]): string {
  const head = "quote | oldest     | newest     | count";
  return [head, "------|------------|------------|------", ...rows.map((r) => `${r.quote.padEnd(5)} | ${(r.oldest ?? "—").padEnd(10)} | ${(r.newest ?? "—").padEnd(10)} | ${r.n}`)].join("\n");
}

/**
 * #170 QA J1 (2026-10-20): never print the connection string. Replaces every occurrence of the value, any
 * "connection string: …" tail and any postgres(ql)://… substring with [redacted].
 */
export function redact(message: string, secret: string): string {
  let m = message;
  if (secret) m = m.split(secret).join("[redacted]");
  return m
    .replace(/connection string:[^\n]*/gi, "connection string: [redacted]")
    .replace(/postgres(?:ql)?:\/\/[^\s'")]*/gi, "[redacted]");
}

export type CliDeps = {
  env: Record<string, string | undefined>;
  today: string;
  get: (url: string) => Promise<string>;
  /** Resolves the target from the environment: `{ name, url }` or null (scripts/db-env.mjs resolveMigrationUrl). */
  resolve: (env: Record<string, string | undefined>) => { name: string; url: string } | null;
  /** Opens the driver for a connection string and returns its query function. */
  connect: (url: string) => QueryFn;
  log: (s: string) => void;
  error: (s: string) => void;
};

export async function runBackfillCli(argv: readonly string[], d: CliDeps): Promise<number> {
  const args = new Set(argv);
  const tag = "[pf-fx-backfill]";
  if (args.has("--dry-run")) {
    const rows = parseValet(JSON.parse(await d.get(valetUrl(PF_BOC_QUOTES, `${FX_HISTORY_FROM}-01`, d.today))), PF_BOC_QUOTES);
    d.log(`${tag} dry run: ${rows.length} BoC rows for ${PF_BOC_QUOTES.join(",")} from ${FX_HISTORY_FROM}-01 to ${d.today}; nothing written.`);
    return 0;
  }
  const verify = args.has("--verify");
  if (!verify && !args.has("--confirm")) {
    d.error(`${tag} refusing to write without --confirm (use --dry-run to only fetch, --verify to only read).`);
    return 2;
  }
  const target = d.resolve(d.env);
  if (!target) {
    d.error(`${tag} no database URL set.`);
    return 2;
  }
  const fail = (e: unknown) => {
    d.error(`${tag} database error via ${target.name}: ${redact(e instanceof Error ? e.message : String(e), target.url)}`);
    return 1;
  };
  try {
    new URL(target.url);
  } catch {
    return fail(new Error(`${target.name} is not a valid URL.`));
  }
  d.log(`${tag} using ${target.name} (HTTPS, @neondatabase/serverless)`);
  // Client creation, connect and every query stay inside the guard (J1).
  try {
    const query = d.connect(target.url);
    if (verify) {
      d.log(verifyTable(await verifyPfFx(query)));
      return 0;
    }
    const s = await backfillPfFx({ query }, d.get, { today: d.today });
    d.log(`${tag} ${s.quotes.join(",")} ${s.from}..${s.to}: fetched ${s.fetched}, inserted ${s.inserted}.`);
    return 0;
  } catch (e) {
    return fail(e);
  }
}
