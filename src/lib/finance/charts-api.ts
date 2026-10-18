import type { ChartData } from "./chart.ts";
import type { ChartType, RangeMode, Report, ReportRange, Series } from "./report.ts";
import type { SeriesRange, SeriesResult } from "./series.ts";
import type { ExportFormat } from "./export.ts";

/**
 * #158 (spec section 40; contract `attachments/pf-charts-api-contract.md`, the single source of truth): ONE typed
 * client for the five Personal Finance chart report routes the Charts UI (#160–#162) calls. Types plus a thin client:
 * it sends exactly the requests the routes already accept (no wire change). Every refusal comes back in one shape,
 * `{ ok: false, status, code, error, field? }`, with `code` derived here from status + message (contract section 6).
 * Client-safe: type-only imports from the server modules.
 */
export const PF_API = "/api/personal-finance";
export const CHARTS_ROUTES = {
  series: `${PF_API}/series`,
  chart: `${PF_API}/chart`,
  reports: `${PF_API}/reports`,
  report: (id: string) => `${PF_API}/reports/${encodeURIComponent(id)}`,
  export: (id: string, format: ExportFormat) => `${PF_API}/reports/${encodeURIComponent(id)}/export?format=${format}`,
} as const;

/** Contract section 1: the methods each route serves (its `Allow` header on a 405). */
export const CHARTS_ALLOW = {
  series: ["POST"],
  chart: ["POST"],
  reports: ["GET", "HEAD", "POST"],
  reportItem: ["GET", "HEAD", "PUT", "DELETE"],
  export: ["GET", "HEAD"],
  legacyReport: ["GET", "HEAD", "PUT", "DELETE"],
} as const;

/** Contract section 5: every message the routes send, exact text. */
export const CHARTS_MESSAGES = {
  disabled: "Not found.",
  methodNotAllowed: "Method not allowed.",
  unauthorized: "Unauthorized.",
  forbidden: "Forbidden.",
  mustChange: "Change your password first.",
  storage: "Storage not configured.",
  badJson: "Body must be JSON.",
  notObject: "Body must be a JSON object.",
  invalid: "Invalid value.",
  queryTooLarge: "Query too large.",
  reportTooLarge: "Report too large.",
  noSavedReport: "No saved report.",
  reportNotFound: "Report not found.",
  reportLimit: "Report limit reached.",
  nameTaken: "Name already used.",
  defaultNameFixed: "The default report cannot be renamed.",
  exportUnavailable: "Export unavailable. Try again.",
  /** #179 Q-AF4 (2026-10-17): 400, field `range` (`report.range` on /reports). */
  rangeBeforeFirst: "Range can't start before 2020-01.",
  rangeAfterCurrent: "Range can't end after the current month.",
} as const;

export type ChartsApiErrorCode =
  | "disabled"
  | "method_not_allowed"
  | "unauthorized"
  | "forbidden"
  | "must_change_password"
  | "storage_unavailable"
  | "export_unavailable"
  | "bad_json"
  | "invalid"
  | "default_name_fixed"
  | "range_out_of_bounds"
  | "too_large"
  | "not_found"
  | "name_taken"
  | "limit"
  | "network"
  | "unknown";

/** The one error shape every call returns on refusal (the wire's `{ error, field? }` plus status and a code). */
export type ChartsApiError = { ok: false; status: number; code: ChartsApiErrorCode; error: string; field?: string };
export type Ok<T> = { ok: true; status: number; data: T };
export type Result<T> = Ok<T> | ChartsApiError;

/** Contract section 6 (Q-AE1 / Q-AE7 / Q-AE11: wire variants that mean the same thing map to one code). */
export function errorCode(status: number, error: string): ChartsApiErrorCode {
  const M = CHARTS_MESSAGES;
  if (status === 0) return "network";
  if (status === 401) return "unauthorized";
  if (status === 405) return "method_not_allowed";
  if (status === 403) return error === M.mustChange ? "must_change_password" : "forbidden";
  if (status === 503) return error === M.exportUnavailable ? "export_unavailable" : "storage_unavailable";
  if (status === 413) return "too_large";
  if (status === 409) return error === M.reportLimit ? "limit" : error === M.nameTaken ? "name_taken" : "unknown";
  if (status === 404) return error === M.disabled ? "disabled" : error === M.reportNotFound || error === M.noSavedReport ? "not_found" : "unknown";
  if (status === 400) {
    if (error === M.badJson || error === M.notObject) return "bad_json";
    if (error === M.defaultNameFixed) return "default_name_fixed";
    if (error === M.rangeBeforeFirst || error === M.rangeAfterCurrent) return "range_out_of_bounds";
    return error === M.invalid ? "invalid" : "unknown";
  }
  return "unknown";
}

// ---- request / response types (contract section 3) ----
export type { ChartData, ChartType, RangeMode, Report, ReportRange, Series, SeriesRange, SeriesResult, ExportFormat };

/**
 * #171 (spec 42; contract section 11, added 2026-10-17): `SeriesResult.net_assets_from` / `ChartData.net_assets_from`
 * is the record's as-of month for Starting net assets when one is set (`asOf` in the overview value), else the first
 * month with data, as before. No new wire field and no new message on these routes; the record API refuses a bad
 * `asOf` with the existing 400 `Invalid value.`, field `overview.asOf`.
 */
export { AS_OF_FIRST } from "./overview.ts";
export const AS_OF_RECORD_FIELD = "overview.asOf";
/** #179 (spec 41): every preset, saved reports included. `all` is stored as `{ preset: "all" }` and resolved when the
 * report runs (`/chart { saved: true, id }`, export), from the first data month to the current Toronto month. */
export type RangePreset = "3m" | "6m" | "12m" | "24m" | "ytd" | "all";
/** #179 / #173: a save's custom range must sit in FIRST_SAVED_MONTH..the current household month (at most 24 months). */
export const FIRST_SAVED_MONTH = "2020-01";
export type SeriesQuery = { series: Series[]; range: SeriesRange };
export type ChartQuery = SeriesQuery & { chart: ChartType };
export type SavedChartQuery = { saved: true; id?: string };
/** One saved report as R3 / R4 return it (`default`: the #153 report; null timestamps, Q-AE3). */
export type ReportItem = {
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
/** `limit` counts named reports only; the default is extra (Q-AE14). */
export type ReportList = { reports: ReportItem[]; limit: number };
export type ReportBody = { name: string; report: Report };
export type DefaultReportBody = { name?: string; report: Report };
export type Deleted = { deleted: string };
export type ExportFile = { bytes: Uint8Array; contentType: string; filename: string | null };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const JSON_HEADERS = { "content-type": "application/json", accept: "application/json" };

async function call<T>(f: Fetch, path: string, init: RequestInit): Promise<Result<T>> {
  let r: Response;
  try {
    r = await f(path, { cache: "no-store", ...init });
  } catch (e) {
    return { ok: false, status: 0, code: "network", error: String((e as Error)?.message ?? e) };
  }
  const body = (await r.json().catch(() => undefined)) as (T & { error?: unknown; field?: unknown }) | undefined;
  if (r.ok && body !== undefined) return { ok: true, status: r.status, data: body as T };
  const error = typeof body?.error === "string" ? body.error : `HTTP ${r.status}`;
  const out: ChartsApiError = { ok: false, status: r.status, code: body === undefined && r.ok ? "network" : errorCode(r.status, error), error };
  if (typeof body?.field === "string") out.field = body.field;
  return out;
}
const send = (method: string, body: unknown): RequestInit => ({ method, headers: JSON_HEADERS, body: JSON.stringify(body) });
const get: RequestInit = { method: "GET", headers: { accept: "application/json" } };

// ---- the thin client (one function per route + method) ----
export const listReports = (f: Fetch = fetch) => call<ReportList>(f, CHARTS_ROUTES.reports, get);
export const getReport = (id: string, f: Fetch = fetch) => call<ReportItem>(f, CHARTS_ROUTES.report(id), get);
export const createReport = (body: ReportBody, f: Fetch = fetch) => call<ReportItem>(f, CHARTS_ROUTES.reports, send("POST", body));
export const updateReport = (id: string, body: ReportBody | DefaultReportBody, f: Fetch = fetch) =>
  call<ReportItem>(f, CHARTS_ROUTES.report(id), send("PUT", body));
export const deleteReport = (id: string, f: Fetch = fetch) => call<Deleted>(f, CHARTS_ROUTES.report(id), { method: "DELETE", headers: { accept: "application/json" } });
export const seriesQuery = (q: SeriesQuery, f: Fetch = fetch) => call<SeriesResult>(f, CHARTS_ROUTES.series, send("POST", q));
export const chartQuery = (q: ChartQuery, f: Fetch = fetch) => call<ChartData>(f, CHARTS_ROUTES.chart, send("POST", q));
export const chartSaved = (id?: string, f: Fetch = fetch) =>
  call<ChartData>(f, CHARTS_ROUTES.chart, send("POST", id === undefined ? { saved: true } : { saved: true, id }));
/** For a plain download link (`<a href download>`); the browser sends the session cookie. */
export const exportUrl = (id: string, format: ExportFormat) => CHARTS_ROUTES.export(id, format);

/** R5 as bytes (errors are JSON in the shared shape). */
export async function exportReport(id: string, format: ExportFormat, f: Fetch = fetch): Promise<Result<ExportFile>> {
  let r: Response;
  try {
    r = await f(CHARTS_ROUTES.export(id, format), { method: "GET", cache: "no-store" });
  } catch (e) {
    return { ok: false, status: 0, code: "network", error: String((e as Error)?.message ?? e) };
  }
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: unknown; field?: unknown };
    const error = typeof body.error === "string" ? body.error : `HTTP ${r.status}`;
    const out: ChartsApiError = { ok: false, status: r.status, code: errorCode(r.status, error), error };
    if (typeof body.field === "string") out.field = body.field;
    return out;
  }
  const filename = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? null;
  return { ok: true, status: r.status, data: { bytes: new Uint8Array(await r.arrayBuffer()), contentType: r.headers.get("content-type") ?? "", filename } };
}
