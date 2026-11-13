/**
 * Research heatmap read (#333). Server-only. The committed seed is the page when the database
 * is missing, the table has not been created, the connection fails, or the table is empty.
 * A stored row replaces only that ticker and year.
 */
import { getDashboardDb } from "../dashboard/db.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import seedFile from "./yearly-returns.seed.json" with { type: "json" };
import { mergeReturns, normalizeReturn, type YearReturn } from "./returns.ts";

type SeedFile = { rows: YearReturn[] };

const CONNECT = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "57P01",
  "53300",
]);

export function seedRows(): YearReturn[] {
  return (seedFile as SeedFile).rows.map((row) => normalizeReturn(row));
}

function errorCode(err: unknown): string {
  return typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : "";
}

/** True for a missing relation or a connection failure. Anything else still falls back, so the page renders. */
export function isSeedFallbackError(err: unknown): boolean {
  const code = errorCode(err);
  return code === "42P01" || CONNECT.has(code) || code === "";
}

export type YearlyReturnsDb = Pick<Queryable, "query">;

export async function loadYearlyReturns(
  getDb: () => Promise<YearlyReturnsDb | null> = getDashboardDb,
): Promise<YearReturn[]> {
  const seed = seedRows();
  let db: YearlyReturnsDb | null;
  try {
    db = await getDb();
  } catch (err) {
    console.error(`[research] database unavailable${errorCode(err) ? ` (${errorCode(err)})` : ""}`);
    return seed;
  }
  if (!db) return seed;
  try {
    const rows = await db.query<YearReturn>(
      `SELECT ticker, year, return_pct, is_ytd, partial, source FROM yearly_returns`,
    );
    if (!rows.length) return seed;
    return mergeReturns(seed, rows);
  } catch (err) {
    console.error(`[research] yearly returns read failed${errorCode(err) ? ` (${errorCode(err)})` : ""}`);
    return seed;
  }
}
