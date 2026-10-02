/**
 * Dashboard database connection and status (server-only). Spec §4, ticket T02 (#10).
 *
 * - The database URL comes only from `DATABASE_URL` (Neon via the Vercel Marketplace
 *   integration, set by an owner for the Preview environment). Never commit its value.
 * - Without it, dashboard storage is **unavailable**: `getDashboardDb()` returns null and
 *   the status reads "not configured". There is deliberately no PGLite fallback here, so a
 *   preview without Neon can't look "connected" while writing to a throwaway in-memory DB.
 * - The calculator never imports this module.
 */
import { DASHBOARD_TABLES, type Queryable } from "./store.server.ts";

type Env = Record<string, string | undefined>;

/** The configured database URL, or undefined when unset or blank. */
export function dashboardDatabaseUrl(env: Env = process.env): string | undefined {
  const value = env.DATABASE_URL?.trim();
  return value ? value : undefined;
}

/** The shared Neon client, or null when storage is not configured. */
export async function getDashboardDb(env: Env = process.env): Promise<Queryable | null> {
  if (!dashboardDatabaseUrl(env)) return null;
  // Loaded only when DATABASE_URL is set, so `@/lib/db` takes its Neon (`pg`) path and its
  // PGLite fallback never boots on a deployment without a database.
  const { getSql } = await import("@/lib/db");
  return getSql();
}

export type DashboardDbStatus =
  | { state: "not_configured" }
  | {
      state: "connected";
      tables: number;
      expectedTables: number;
      missingTables: string[];
      migrationApplied: boolean;
    }
  | { state: "error" };

/** Check the connection and that every §5 table exists. Never includes the URL or driver errors. */
export async function checkDashboardDb(db: Queryable | null): Promise<DashboardDbStatus> {
  if (!db) return { state: "not_configured" };
  try {
    const rows = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [[...DASHBOARD_TABLES]],
    );
    const present = new Set(rows.map((r) => r.table_name));
    const applied = await db.query<{ name: string }>(
      `SELECT name FROM _migrations WHERE name = '0002_dashboard.sql'`,
    );
    return {
      state: "connected",
      tables: present.size,
      expectedTables: DASHBOARD_TABLES.length,
      missingTables: DASHBOARD_TABLES.filter((t) => !present.has(t)),
      migrationApplied: applied.length > 0,
    };
  } catch (err) {
    // Log only the Postgres error code; messages can carry host names.
    const code = (err as { code?: unknown })?.code;
    console.error(`[dashboard-db] status check failed${typeof code === "string" ? ` (code ${code})` : ""}`);
    return { state: "error" };
  }
}

/** One-line, user-visible text for the preview status line (DASH-03 reads "connected"). */
export function describeDbStatus(status: DashboardDbStatus): string {
  switch (status.state) {
    case "not_configured":
      return "Database: not configured";
    case "error":
      return "Database: error (see server logs)";
    case "connected":
      return status.missingTables.length === 0 && status.migrationApplied
        ? `Database: connected · ${status.tables}/${status.expectedTables} tables`
        : `Database: connected · ${status.tables}/${status.expectedTables} tables, schema incomplete`;
  }
}

/** The status line shows on previews and local dev only, never on production. */
export function showDbStatusLine(env: Env = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}
