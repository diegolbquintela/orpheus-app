/**
 * Dashboard database connection and status (server-only). Spec §4, ticket T02 (#10).
 *
 * - The database URL comes from `DATABASE_URL`, else the Vercel Neon integration's
 *   `orpheus_app_preview_DATABASE_URL` (Preview + Development scope, set by an owner).
 *   Precedence lives in `scripts/db-env.mjs`. Never commit or log the value.
 * - Without it, dashboard storage is **unavailable**: `getDashboardDb()` returns null and
 *   the status reads "not configured". There is deliberately no PGLite fallback here, so a
 *   preview without Neon can't look "connected" while writing to a throwaway in-memory DB.
 * - The calculator never imports this module.
 */
import {
  dashboardMethodNotAllowedResponse,
  dashboardNotFoundResponse,
  guardDashboardApi,
} from "./flag.server.ts";
import { DASHBOARD_TABLES, type Queryable } from "./store.server.ts";
import { resolveDatabaseUrl } from "../../../scripts/db-env.mjs";

type Env = Record<string, string | undefined>;

/** The configured database URL, or undefined when unset or blank. */
export function dashboardDatabaseUrl(env: Env = process.env): string | undefined {
  return resolveDatabaseUrl(env)?.url;
}

/** The shared Neon client, or null when storage is not configured. */
export async function getDashboardDb(env: Env = process.env): Promise<Queryable | null> {
  if (!dashboardDatabaseUrl(env)) return null;
  // Loaded only when a database URL is set, so `@/lib/db` takes its Neon (`pg`) path and its
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

/** Methods `/api/dashboard/db` serves (HEAD is answered by GET). */
export const DB_API_ALLOW = ["GET", "HEAD"] as const;

/**
 * `/api/dashboard/db` for any method (same pattern as `/api/dashboard/status`):
 * - flag off: 404 JSON, every method;
 * - production (`VERCEL_ENV=production`): 404 JSON, every method, even with the flag on;
 * - otherwise GET/HEAD: 200 status JSON; any other method: 405 JSON, `Allow: GET, HEAD`.
 */
export async function handleDashboardDbRequest(
  method: string,
  env: Env = process.env,
  getDb: (env: Env) => Promise<Queryable | null> = getDashboardDb,
): Promise<Response> {
  const blocked = guardDashboardApi(env);
  if (blocked) return blocked;
  if (!showDbStatusLine(env)) return dashboardNotFoundResponse();
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "HEAD") return dashboardMethodNotAllowedResponse(DB_API_ALLOW);
  const status = await checkDashboardDb(await getDb(env));
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
