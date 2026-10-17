/**
 * `/api/personal-finance` (#102; spec section 16.5): the signed-in account's Personal Finance record. Server-only.
 * Order (the dashboard's per-user pattern): 404 JSON while `DASHBOARD_ENABLED` is off (sign-in lives behind it),
 * 405 JSON for another method, 401 JSON without a session, 403 when `userId` names someone else, 400 / 413 for a bad
 * body, 503 without a database. The user id is the session's, never the client's. #90: the data is the owner's.
 */
import { auditFor } from "../access/audit.server.ts";
import {
  badRequest,
  type DashboardApiDeps,
  dashboardJson,
  forbiddenResponse,
  gateDashboardRequest,
  type GateOk,
  namesOtherUser,
} from "../dashboard/session.server.ts";
import { readOwnView, writeOwnView } from "../access/access.server.ts";
import { VIEW_KEY } from "./view.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import { checkRecord, type PfRecord } from "./record.ts";
import { INVALID_VALUE, recordFieldError } from "./field-errors.ts";
import {
  checkReport,
  missingSeries,
  deletedSeries,
  seriesLabels,
  parseReport,
  REPORT_KEY,
  REPORT_MAX_BYTES,
  reportText,
} from "./report.ts";

export const PF_ALLOW = ["GET", "HEAD", "PUT", "DELETE"] as const;

export async function readRecord(db: Queryable, userId: string): Promise<PfRecord | null> {
  const rows = await db.query<{ data: unknown }>(
    "SELECT data FROM personal_finance WHERE user_id = $1",
    [userId],
  );
  if (!rows[0]) return null;
  const raw = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
  // #153 (Q-X7): the person's saved chart report shares the row but is not part of the record.
  if (raw && typeof raw === "object" && !Array.isArray(raw) && REPORT_KEY in raw) {
    const { [REPORT_KEY]: _report, ...rest } = raw as Record<string, unknown>;
    void _report;
    if (Object.keys(rest).length === 0) return null;
    const checkedRest = checkRecord(rest);
    return checkedRest.ok ? checkedRest.record : {};
  }
  const checked = checkRecord(raw);
  return checked.ok ? checked.record : {};
}

export async function writeRecord(db: Queryable, userId: string, record: PfRecord): Promise<void> {
  await db.query(
    `INSERT INTO personal_finance (user_id, data, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data
       || CASE WHEN personal_finance.data ? $3 THEN jsonb_build_object($3::text, personal_finance.data -> $3) ELSE '{}'::jsonb END,
       updated_at = now()`,
    [userId, JSON.stringify(record), REPORT_KEY],
  );
}

export async function deleteRecord(db: Queryable, userId: string): Promise<void> {
  await db.query("DELETE FROM personal_finance WHERE user_id = $1", [userId]);
}

/** #90 Q-D11: a non-owner's record shows their own section toggles, never the owner's. */
async function forViewer(db: Queryable, record: PfRecord | null, g: GateOk): Promise<PfRecord | null> {
  if (g.access.owner) return record;
  const own = await readOwnView(db, g.viewer.id);
  const out: PfRecord = { ...(record ?? {}) };
  delete out[VIEW_KEY];
  if (own !== null) out[VIEW_KEY] = own;
  return record === null && own === null ? null : out;
}

/**
 * `/api/personal-finance`. #90: the record is the **owner's** (Q-D1). GET needs a Personal Finance read grant, PUT
 * Read and write, DELETE (wipe the whole record) the owner only (Q-D13). The reply carries `access` so the page knows
 * whether it may write. A non-owner's section toggles are kept apart (Q-D11; `/api/personal-finance/view`).
 */
export async function handlePersonalFinanceRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, PF_ALLOW, deps, { surface: "personal_finance" });
  if ("response" in g) return g.response;
  const { user, db } = g;
  if (namesOtherUser(new URL(request.url).searchParams.get("userId") ?? undefined, user, g.viewer))
    return forbiddenResponse();
  const method = request.method.toUpperCase();
  if (method === "DELETE" && !g.access.owner) return forbiddenResponse();
  const access = { owner: g.access.owner, write: g.surface.write };
  let record: PfRecord | null = null;
  if (method === "PUT") {
    let body: { data?: unknown; userId?: unknown } | undefined;
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return badRequest("Body must be JSON.");
    }
    if (!body || typeof body !== "object") return badRequest("Body must be a JSON object.");
    if (namesOtherUser(body.userId, user, g.viewer)) return forbiddenResponse();
    const checked = checkRecord(body.data);
    if (!checked.ok) return dashboardJson({ error: checked.error }, checked.status);
    record = checked.record;
    // #143 (PF-137, Q-S4): an invalid value is refused, never clamped; nothing is stored.
    const field = recordFieldError(record);
    if (field) return dashboardJson({ error: INVALID_VALUE, field }, 400);
  }
  if (method === "PUT" && record) {
    if (!g.access.owner) {
      // The person's toggles stay theirs; the owner's stay in the record.
      if (VIEW_KEY in record) await writeOwnView(db, g.viewer.id, record[VIEW_KEY]);
      const current = await readRecord(db, user.id);
      const next: PfRecord = { ...record };
      delete next[VIEW_KEY];
      if (current && VIEW_KEY in current) next[VIEW_KEY] = current[VIEW_KEY];
      await writeRecord(db, user.id, next);
      await auditFor(db, g.access, "pf.save");
      return dashboardJson({ data: await forViewer(db, next, g), access });
    }
    await writeRecord(db, user.id, record);
    await auditFor(db, g.access, "pf.save");
    return dashboardJson({ data: record, access });
  }
  if (method === "DELETE") {
    await deleteRecord(db, user.id);
    await auditFor(db, g.access, "pf.delete");
    return dashboardJson({ data: null, access });
  }
  return dashboardJson({ data: await forViewer(db, await readRecord(db, user.id), g), access });
}

export const PF_VIEW_ALLOW = ["PUT"] as const;

/**
 * `PUT /api/personal-finance/view` `{ "view": "<the view JSON text>" }` (#90 Q-D11): a person's own section toggles.
 * Needs a Personal Finance **read** grant (a Read-only CFO can still open / close sections). The owner's toggles live
 * in the record, so for the owner this writes the record's view value.
 */
export async function handlePersonalFinanceViewRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, PF_VIEW_ALLOW, deps, { surface: "personal_finance", need: "read" });
  if ("response" in g) return g.response;
  let body: { view?: unknown } | undefined;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest("Body must be JSON.");
  }
  const view = body?.view;
  if (typeof view !== "string" || view.length > 1024) return badRequest("view must be a short string.");
  if (g.access.owner) {
    const current = (await readRecord(g.db, g.user.id)) ?? {};
    await writeRecord(g.db, g.user.id, { ...current, [VIEW_KEY]: view });
  } else await writeOwnView(g.db, g.viewer.id, view);
  await auditFor(g.db, g.access, "pf.view");
  return dashboardJson({ view });
}

export const PF_REPORT_ALLOW = ["GET", "HEAD", "PUT", "DELETE"] as const;

/** #153: the person's own saved chart report text, from their own `personal_finance` row (null when none). */
export async function readOwnReport(db: Queryable, userId: string): Promise<string | null> {
  const rows = await db.query<{ report: string | null }>(
    "SELECT data ->> $2 AS report FROM personal_finance WHERE user_id = $1",
    [userId, REPORT_KEY],
  );
  return rows[0]?.report ?? null;
}

export async function writeOwnReport(db: Queryable, userId: string, text: string): Promise<void> {
  await db.query(
    `INSERT INTO personal_finance (user_id, data, updated_at) VALUES ($1, jsonb_build_object($2::text, $3::text), now())
     ON CONFLICT (user_id) DO UPDATE SET data = personal_finance.data || jsonb_build_object($2::text, $3::text),
       updated_at = now()`,
    [userId, REPORT_KEY, text],
  );
}

export async function deleteOwnReport(db: Queryable, userId: string): Promise<void> {
  await db.query(
    "UPDATE personal_finance SET data = data - $2::text, updated_at = now() WHERE user_id = $1 AND data ? $2",
    [userId, REPORT_KEY],
  );
  // A row that only held the report goes, so the record still reads as "none yet" (null).
  await db.query("DELETE FROM personal_finance WHERE user_id = $1 AND data = '{}'::jsonb", [
    userId,
  ]);
}

/**
 * `/api/personal-finance/report` (#153; spec section 33, PFR-01..PFR-16). The signed-in person's **own** saved chart
 * report (Q-X6), in their own `personal_finance` row. A Personal Finance read grant is enough (a preference, like the
 * section toggles). GET `{ report, missing }` (`missing`: series not in the owner's record, Q-X4); PUT `{ report }`
 * replaces it (shared `checkReport`: 400 `{ error, field }`, 413 above 4 KB); DELETE removes it.
 */
export async function handlePersonalFinanceReportRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, PF_REPORT_ALLOW, deps, {
    surface: "personal_finance",
    need: "read",
  });
  if ("response" in g) return g.response;
  const { db, viewer, user } = g;
  const method = request.method.toUpperCase();
  if (method === "PUT") {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > REPORT_MAX_BYTES)
      return dashboardJson({ error: "Report too large." }, 413);
    let body: { report?: unknown } | undefined;
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return badRequest("Body must be JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return badRequest("Body must be a JSON object.");
    const checked = checkReport(body.report);
    if (!checked.ok)
      return dashboardJson(
        checked.field ? { error: checked.error, field: checked.field } : { error: checked.error },
        checked.status,
      );
    await writeOwnReport(db, viewer.id, reportText(checked.report));
    await auditFor(db, g.access, "pf.report_save");
    const record = await readRecord(db, user.id);
    return dashboardJson({
      report: checked.report,
      missing: missingSeries(checked.report, record),
      deleted: deletedSeries(checked.report, record),
      labels: seriesLabels(checked.report, record),
    });
  }
  if (method === "DELETE") {
    await deleteOwnReport(db, viewer.id);
    await auditFor(db, g.access, "pf.report_delete");
    return dashboardJson({ report: null, missing: [], deleted: [], labels: [] });
  }
  const report = parseReport(await readOwnReport(db, viewer.id));
  const record = report ? await readRecord(db, user.id) : null;
  // #165 (PFD-05, PFD-06): `deleted` = series naming a deleted account / category still in history; `labels` their names.
  return dashboardJson({
    report,
    missing: report ? missingSeries(report, record) : [],
    deleted: report ? deletedSeries(report, record) : [],
    labels: report ? seriesLabels(report, record) : [],
  });
}
