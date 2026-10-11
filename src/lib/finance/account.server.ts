/**
 * `/api/personal-finance` (#102; spec section 16.5): the signed-in account's Personal Finance record. Server-only.
 * Order (the dashboard's per-user pattern): 404 JSON while `DASHBOARD_ENABLED` is off (sign-in lives behind it),
 * 405 JSON for another method, 401 JSON without a session, 403 when `userId` names someone else, 400 / 413 for a bad
 * body, 503 without a database. The user id is the session's, never the client's.
 */
import {
  badRequest,
  type DashboardApiDeps,
  dashboardJson,
  defaultGetDb,
  forbiddenResponse,
  gateDashboardRequest,
  namesOtherUser,
  storageUnavailable,
} from "../dashboard/session.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import { checkRecord, type PfRecord } from "./record.ts";

export const PF_ALLOW = ["GET", "HEAD", "PUT", "DELETE"] as const;

export async function readRecord(db: Queryable, userId: string): Promise<PfRecord | null> {
  const rows = await db.query<{ data: unknown }>(
    "SELECT data FROM personal_finance WHERE user_id = $1",
    [userId],
  );
  if (!rows[0]) return null;
  const raw = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
  const checked = checkRecord(raw);
  return checked.ok ? checked.record : {};
}

export async function writeRecord(db: Queryable, userId: string, record: PfRecord): Promise<void> {
  await db.query(
    `INSERT INTO personal_finance (user_id, data, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [userId, JSON.stringify(record)],
  );
}

export async function deleteRecord(db: Queryable, userId: string): Promise<void> {
  await db.query("DELETE FROM personal_finance WHERE user_id = $1", [userId]);
}

export async function handlePersonalFinanceRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, PF_ALLOW, deps);
  if ("response" in g) return g.response;
  const { user } = g;
  if (namesOtherUser(new URL(request.url).searchParams.get("userId") ?? undefined, user))
    return forbiddenResponse();
  const method = request.method.toUpperCase();
  let record: PfRecord | null = null;
  if (method === "PUT") {
    let body: { data?: unknown; userId?: unknown } | undefined;
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return badRequest("Body must be JSON.");
    }
    if (!body || typeof body !== "object") return badRequest("Body must be a JSON object.");
    if (namesOtherUser(body.userId, user)) return forbiddenResponse();
    const checked = checkRecord(body.data);
    if (!checked.ok) return dashboardJson({ error: checked.error }, checked.status);
    record = checked.record;
  }
  const env = deps.env ?? process.env;
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return storageUnavailable();
  if (method === "PUT" && record) {
    await writeRecord(db, user.id, record);
    return dashboardJson({ data: record });
  }
  if (method === "DELETE") {
    await deleteRecord(db, user.id);
    return dashboardJson({ data: null });
  }
  return dashboardJson({ data: await readRecord(db, user.id) });
}
