/**
 * `/api/personal-finance` (#102; spec section 16.5): the signed-in account's Personal Finance record. Server-only.
 * Order (the dashboard's per-user pattern): 404 JSON while `DASHBOARD_ENABLED` is off (sign-in lives behind it),
 * 405 JSON for another method, 401 JSON without a session, 403 when `userId` names someone else, 400 / 413 for a bad
 * body, 503 without a database. The user id is the session's, never the client's. #90: the data is the owner's.
 */
import { auditFor, exportDetail, tryAuditFor } from "../access/audit.server.ts";
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
  INVALID_REPORT,
  type Report,
} from "./report.ts";
import { householdMonth } from "./overview.ts";
import {
  checkBody,
  DEFAULT_ID,
  DEFAULT_NAME,
  DEFAULT_NAME_FIXED,
  isNamedId,
  isReportId,
  NAME_TAKEN,
  nameTaken,
  type Named,
  namedText,
  newId,
  parseNamed,
  REPORT_LIMIT,
  REPORT_NOT_FOUND,
  REPORTS_BODY_MAX,
  REPORTS_KEY,
  REPORTS_MAX,
} from "./reports.ts";
import { buildPdf, buildPng, EXPORT_FORMATS, exportFilename, type ExportFormat } from "./export.ts";
import { CHART_MAX_BYTES, chartData, chartQueryError, fromReport, NO_SAVED_REPORT, type ChartQuery } from "./chart.ts";
import { SERIES_MAX_BYTES, seriesQueryError, seriesValues, type SeriesQuery } from "./series.ts";

export const PF_ALLOW = ["GET", "HEAD", "PUT", "DELETE"] as const;

export async function readRecord(db: Queryable, userId: string): Promise<PfRecord | null> {
  const rows = await db.query<{ data: unknown }>(
    "SELECT data FROM personal_finance WHERE user_id = $1",
    [userId],
  );
  if (!rows[0]) return null;
  const raw = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
  // #153 (Q-X7) / #156 (Q-AC1): the person's saved reports share the row but are not part of the record.
  if (raw && typeof raw === "object" && !Array.isArray(raw) && (REPORT_KEY in raw || REPORTS_KEY in raw)) {
    const { [REPORT_KEY]: _report, [REPORTS_KEY]: _reports, ...rest } = raw as Record<string, unknown>;
    void _report;
    void _reports;
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
       || COALESCE((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(personal_finance.data) AS e
                    WHERE e.key = ANY($3::text[])), '{}'::jsonb),
       updated_at = now()`,
    // #153 / #156: a record save keeps the person's saved reports (default and named).
    [userId, JSON.stringify(record), [REPORT_KEY, REPORTS_KEY]],
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

export const PF_SERIES_ALLOW = ["POST"] as const;

/**
 * `POST /api/personal-finance/series` `{ series, range }` (#154; spec section 36, PFS-01..PFS-16). Read-only: the
 * **owner's** record as monthly series (the report's kinds and ids, Q-AA1..Q-AA9). Same gate as the report API (a
 * Personal Finance read grant). 400 `{ error, field }` for a bad query, 413 above 4 KB. Nothing is stored or audited.
 */
export async function handlePersonalFinanceSeriesRequest(
  request: Request,
  deps: DashboardApiDeps,
  now: () => Date = () => new Date(),
) {
  const g = await gateDashboardRequest(request, PF_SERIES_ALLOW, deps, {
    surface: "personal_finance",
    need: "read",
  });
  if ("response" in g) return g.response;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > SERIES_MAX_BYTES)
    return dashboardJson({ error: "Query too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return badRequest("Body must be JSON.");
  }
  const at = now();
  const e = seriesQueryError(body, householdMonth(at));
  if (e) return dashboardJson(e.field ? { error: e.error, field: e.field } : { error: e.error }, e.status);
  const record = await readRecord(g.db, g.user.id);
  return dashboardJson(seriesValues(body as SeriesQuery, record, at));
}

export const PF_CHART_ALLOW = ["POST"] as const;

/**
 * `POST /api/personal-finance/chart` (#155; spec section 37, PFC-01..PFC-16): several series aligned for one chart.
 * Body `{ series, range, chart }` or `{ saved: true }` (the signed-in person's own saved report, #153). Same gate as
 * the series / report APIs; the data is the owner's record. Read-only, not audited. 404 `No saved report.` when
 * `saved` and none is stored.
 */
export async function handlePersonalFinanceChartRequest(
  request: Request,
  deps: DashboardApiDeps,
  now: () => Date = () => new Date(),
) {
  const g = await gateDashboardRequest(request, PF_CHART_ALLOW, deps, {
    surface: "personal_finance",
    need: "read",
  });
  if ("response" in g) return g.response;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > CHART_MAX_BYTES)
    return dashboardJson({ error: "Query too large." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return badRequest("Body must be JSON.");
  }
  const at = now();
  const e = chartQueryError(body, householdMonth(at));
  if (e) return dashboardJson(e.field ? { error: e.error, field: e.field } : { error: e.error }, e.status);
  const q = body as ChartQuery;
  if ("saved" in q) {
    // #156 Q-AC10: `{ saved: true, id }` charts that report; without `id`, the default (legacy) report as before.
    const id = "id" in q && q.id ? q.id : DEFAULT_ID;
    const report = id === DEFAULT_ID ? parseReport(await readOwnReport(g.db, g.viewer.id)) : (await readOwnNamed(g.db, g.viewer.id)).find((r) => r.id === id)?.report ?? null;
    if (!report) return dashboardJson({ error: NO_SAVED_REPORT }, 404);
    return dashboardJson(chartData(fromReport(report), await readRecord(g.db, g.user.id), at, "saved"));
  }
  return dashboardJson(chartData(q, await readRecord(g.db, g.user.id), at));
}

export const PF_REPORTS_ALLOW = ["GET", "HEAD", "POST"] as const;
export const PF_REPORT_ITEM_ALLOW = ["GET", "HEAD", "PUT", "DELETE"] as const;

/** #156: the person's named reports (their own row; empty when none). */
export async function readOwnNamed(db: Queryable, userId: string): Promise<Named[]> {
  const rows = await db.query<{ reports: string | null }>(
    "SELECT data ->> $2 AS reports FROM personal_finance WHERE user_id = $1",
    [userId, REPORTS_KEY],
  );
  return parseNamed(rows[0]?.reports ?? null);
}

async function writeOwnNamed(db: Queryable, userId: string, list: Named[]): Promise<void> {
  if (list.length) {
    await db.query(
      `INSERT INTO personal_finance (user_id, data, updated_at) VALUES ($1, jsonb_build_object($2::text, $3::text), now())
       ON CONFLICT (user_id) DO UPDATE SET data = personal_finance.data || jsonb_build_object($2::text, $3::text),
         updated_at = now()`,
      [userId, REPORTS_KEY, namedText(list)],
    );
    return;
  }
  await db.query("UPDATE personal_finance SET data = data - $2::text, updated_at = now() WHERE user_id = $1 AND data ? $2", [userId, REPORTS_KEY]);
  await db.query("DELETE FROM personal_finance WHERE user_id = $1 AND data = '{}'::jsonb", [userId]);
}

type Item = {
  id: string;
  name: string;
  default: boolean;
  report: Report;
  missing: number[];
  deleted: number[];
  labels: string[];
  created_at: string | null;
  updated_at: string | null;
};

const itemOf = (id: string, name: string, report: Report, record: PfRecord | null, created: string | null, updated: string | null): Item => ({
  id,
  name,
  default: id === DEFAULT_ID,
  report,
  missing: missingSeries(report, record),
  deleted: deletedSeries(report, record),
  labels: seriesLabels(report, record),
  created_at: created,
  updated_at: updated,
});

async function readBody(request: Request): Promise<{ body: unknown } | { response: Response }> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > REPORTS_BODY_MAX) return { response: dashboardJson({ error: "Report too large." }, 413) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { response: badRequest("Body must be JSON.") };
  }
}

const refuse = (e: { status: number; error: string; field?: string }) =>
  dashboardJson(e.field ? { error: e.error, field: e.field } : { error: e.error }, e.status);

/**
 * `/api/personal-finance/reports` (#156; spec section 38, PFRC-01..PFRC-20). GET lists the person's own reports (the
 * default first, then named reports oldest first, Q-AC7); POST `{ name, report }` creates a named report (201). Same
 * gate as the report API (Personal Finance read grant; reports are the person's own; series resolve against the
 * owner's record).
 */
export async function handlePersonalFinanceReportsRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, PF_REPORTS_ALLOW, deps, { surface: "personal_finance", need: "read" });
  if ("response" in g) return g.response;
  const { db, viewer, user } = g;
  if (request.method.toUpperCase() === "POST") {
    const b = await readBody(request);
    if ("response" in b) return b.response;
    const c = checkBody(b.body, true);
    if (!c.ok) return refuse(c);
    const list = await readOwnNamed(db, viewer.id);
    if (list.length >= REPORTS_MAX) return dashboardJson({ error: REPORT_LIMIT }, 409);
    if (nameTaken(list, c.name!)) return dashboardJson({ error: NAME_TAKEN, field: "name" }, 409);
    const now = new Date().toISOString();
    let id = newId();
    while (list.some((r) => r.id === id)) id = newId();
    const entry: Named = { id, name: c.name!, report: c.report, created_at: now, updated_at: now };
    await writeOwnNamed(db, viewer.id, [...list, entry]);
    await auditFor(db, g.access, "pf.report_save");
    return dashboardJson(itemOf(id, entry.name, entry.report, await readRecord(db, user.id), now, now), 201);
  }
  const record = await readRecord(db, user.id);
  const legacy = parseReport(await readOwnReport(db, viewer.id));
  const named = await readOwnNamed(db, viewer.id);
  const reports: Item[] = [
    ...(legacy ? [itemOf(DEFAULT_ID, DEFAULT_NAME, legacy, record, null, null)] : []),
    ...named.map((r) => itemOf(r.id, r.name, r.report, record, r.created_at, r.updated_at)),
  ];
  return dashboardJson({ reports, limit: REPORTS_MAX });
}

/**
 * `/api/personal-finance/reports/:id` (#156). GET / PUT `{ name, report }` (full replace) / DELETE one of the person's
 * own reports. `default` is the legacy single report (#153 GET / PUT / DELETE on the same stored value; PUT may omit
 * the name and cannot rename it). Unknown id → 404 `Report not found.`.
 */
export async function handlePersonalFinanceReportItemRequest(request: Request, id: string, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, PF_REPORT_ITEM_ALLOW, deps, { surface: "personal_finance", need: "read" });
  if ("response" in g) return g.response;
  const { db, viewer, user } = g;
  if (!isReportId(id)) return dashboardJson({ error: REPORT_NOT_FOUND }, 404);
  const method = request.method.toUpperCase();
  if (id === DEFAULT_ID) {
    if (method === "PUT") {
      const b = await readBody(request);
      if ("response" in b) return b.response;
      const c = checkBody(b.body, false);
      if (!c.ok) return refuse(c);
      if (c.name !== undefined && c.name.toLowerCase() !== DEFAULT_NAME.toLowerCase())
        return dashboardJson({ error: DEFAULT_NAME_FIXED, field: "name" }, 400);
      await writeOwnReport(db, viewer.id, reportText(c.report));
      await auditFor(db, g.access, "pf.report_save");
      return dashboardJson(itemOf(DEFAULT_ID, DEFAULT_NAME, c.report, await readRecord(db, user.id), null, null));
    }
    const legacy = parseReport(await readOwnReport(db, viewer.id));
    if (!legacy) return dashboardJson({ error: REPORT_NOT_FOUND }, 404);
    if (method === "DELETE") {
      await deleteOwnReport(db, viewer.id);
      await auditFor(db, g.access, "pf.report_delete");
      return dashboardJson({ deleted: DEFAULT_ID });
    }
    return dashboardJson(itemOf(DEFAULT_ID, DEFAULT_NAME, legacy, await readRecord(db, user.id), null, null));
  }
  const list = await readOwnNamed(db, viewer.id);
  const at = list.findIndex((r) => r.id === id);
  if (at < 0 || !isNamedId(id)) return dashboardJson({ error: REPORT_NOT_FOUND }, 404);
  if (method === "PUT") {
    const b = await readBody(request);
    if ("response" in b) return b.response;
    const c = checkBody(b.body, true);
    if (!c.ok) return refuse(c);
    if (nameTaken(list, c.name!, id)) return dashboardJson({ error: NAME_TAKEN, field: "name" }, 409);
    const next: Named = { ...list[at], name: c.name!, report: c.report, updated_at: new Date().toISOString() };
    await writeOwnNamed(db, viewer.id, list.map((r, i) => (i === at ? next : r)));
    await auditFor(db, g.access, "pf.report_save");
    return dashboardJson(itemOf(id, next.name, next.report, await readRecord(db, user.id), next.created_at, next.updated_at));
  }
  if (method === "DELETE") {
    await writeOwnNamed(db, viewer.id, list.filter((r) => r.id !== id));
    await auditFor(db, g.access, "pf.report_delete");
    return dashboardJson({ deleted: id });
  }
  const r = list[at];
  return dashboardJson(itemOf(id, r.name, r.report, await readRecord(db, user.id), r.created_at, r.updated_at));
}

/** PFX-19: the export could not be audited, so it was not sent. */
export const EXPORT_UNAVAILABLE = "Export unavailable. Try again.";
export const PF_EXPORT_ALLOW = ["GET", "HEAD"] as const;
export const EXPORT_TYPES: Record<ExportFormat, string> = { pdf: "application/pdf", png: "image/png" };

/**
 * `GET /api/personal-finance/reports/:id/export?format=pdf|png` (#157; spec section 39, PFX-01..PFX-18). One of the
 * caller's own reports (#156: `default` or a named id) as a PDF or PNG, made synchronously (Q-AD3). The numbers are
 * `chartData` for that report, exactly what `/chart { saved: true, id }` returns (Q-AD5). Same gate as the reports
 * API; another person's id or an unknown one 404 `Report not found.`; a bad format 400 `format`. Read-only, not
 * audited (Q-AD11), `no-store`.
 */
export async function handlePersonalFinanceReportExportRequest(
  request: Request,
  id: string,
  deps: DashboardApiDeps,
  now: () => Date = () => new Date(),
) {
  const g = await gateDashboardRequest(request, PF_EXPORT_ALLOW, deps, { surface: "personal_finance", need: "read" });
  if ("response" in g) return g.response;
  const { db, viewer, user } = g;
  const format = new URL(request.url).searchParams.get("format");
  if (!isReportId(id)) return dashboardJson({ error: REPORT_NOT_FOUND }, 404);
  if (!format || !(EXPORT_FORMATS as readonly string[]).includes(format))
    return dashboardJson({ error: INVALID_REPORT, field: "format" }, 400);
  let report: Report | null = null;
  let name = DEFAULT_NAME;
  if (id === DEFAULT_ID) report = parseReport(await readOwnReport(db, viewer.id));
  else {
    const found = (await readOwnNamed(db, viewer.id)).find((r) => r.id === id);
    if (found) {
      report = found.report;
      name = found.name;
    }
  }
  if (!report) return dashboardJson({ error: REPORT_NOT_FOUND }, 404);
  const at = now();
  const data = chartData(fromReport(report), await readRecord(db, user.id), at, "saved");
  const meta = { name, generatedAt: at.toISOString() };
  const f = format as ExportFormat;
  const body = f === "pdf" ? buildPdf(data, meta) : buildPng(data, meta);
  // PFX-17 / PFX-19 (CFO, 2026-10-17): a successful GET is audited BEFORE the file is sent (same actor / role as
  // pf.report_save). Fail closed, unlike pf.report_save's log-and-continue: if the row can't be written, 503
  // EXPORT_UNAVAILABLE (no-store JSON, no file bytes); the failure is logged by tryAuditFor (action code only).
  // HEAD sends no file, so it writes no row and still answers 200 with the headers even when audit is down; 4xx never audit.
  if (request.method.toUpperCase() === "GET" && !(await tryAuditFor(db, g.access, "pf.report_export", { detail: exportDetail(f, id) })))
    return dashboardJson({ error: EXPORT_UNAVAILABLE }, 503);
  return new Response(request.method.toUpperCase() === "HEAD" ? null : new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": EXPORT_TYPES[f],
      "Content-Length": String(body.length),
      "Content-Disposition": `attachment; filename="${exportFilename(name, meta.generatedAt, f)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
