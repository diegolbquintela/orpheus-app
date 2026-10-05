/**
 * `/api/dashboard/columns` (T08 #16; since #57 the metric chips): the signed-in user's chips, in order.
 * GET → `{ columns: [...keys], saved, available: [{ key, label }] }`; a user who never saved chips gets the
 * defaults (`saved: false`). PUT `{ columns: [...keys] }` replaces the list (adding a chip is a PUT with it
 * at the end, removing one a PUT without it; `[]` sticks); unknown or repeated keys are 400. Keys: the eight
 * metrics plus `share_of_book`.
 * Same gate as the other per-user routes: 404 flag off, 405 other methods, 401 signed out, 403 when the
 * request names another user's id. Stored in `user_metric_columns` (position = index).
 */
import { CHIPS, DEFAULT_CHIPS, isChipKey } from "./metrics.ts";
import {
  badRequest,
  dashboardJson as json,
  defaultGetDb,
  forbiddenResponse,
  gateDashboardRequest,
  namesOtherUser,
  storageUnavailable,
  type DashboardApiDeps,
} from "./session.server.ts";
import { getMetricChips, setMetricChips } from "./store.server.ts";

export const COLUMNS_ALLOW = ["GET", "HEAD", "PUT"] as const;

export async function handleColumnsRequest(request: Request, deps: DashboardApiDeps): Promise<Response> {
  const g = await gateDashboardRequest(request, COLUMNS_ALLOW, deps);
  if ("response" in g) return g.response;
  const { user } = g;
  if (namesOtherUser(new URL(request.url).searchParams.get("userId") ?? undefined, user)) return forbiddenResponse();
  let next: string[] | null = null;
  if (request.method.toUpperCase() === "PUT") {
    let body: { columns?: unknown; userId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return badRequest("Body must be JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Body must be a JSON object.");
    if (namesOtherUser(body.userId, user)) return forbiddenResponse();
    if (!Array.isArray(body.columns)) return badRequest("columns must be a list of metric keys.");
    const bad = body.columns.find((k) => !isChipKey(k));
    if (bad !== undefined) return badRequest(`Unknown metric column: ${String(bad).slice(0, 40)}.`);
    if (new Set(body.columns).size !== body.columns.length) return badRequest("Each metric column can be added once.");
    next = body.columns as string[];
  }
  const db = await (deps.getDb ?? defaultGetDb)(deps.env ?? process.env);
  if (!db) return storageUnavailable();
  if (next) await setMetricChips(db, user.id, next);
  const { chips, saved } = await getMetricChips(db, user.id, DEFAULT_CHIPS);
  return json({ columns: chips.filter(isChipKey), saved, available: CHIPS });
}
