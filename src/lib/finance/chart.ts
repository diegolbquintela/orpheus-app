import { monthShort, type MonthKey } from "./overview.ts";
import type { PfRecord } from "./record.ts";
import { CHART_TYPES, INVALID_REPORT, type ChartType, type Report, type ReportError } from "./report.ts";
import { HOUSEHOLD_TIME_ZONE } from "./overview.ts";
import { isReportId } from "./reports.ts";
import { seriesQueryError, seriesValues, type SeriesOut, type SeriesQuery, type SeriesResult } from "./series.ts";

/**
 * #155 (spec section 37, PFC-01..PFC-16; design `attachments/pf-chart-data-design.md`): several series in one chart
 * request, aligned on one month axis for a future frontend. Built on the #154 series values (spec 36, unchanged:
 * `fx_basis: "current"`, `net_assets_from` and the 36.11 caveat). Read-only.
 */
export const CHART_MAX_BYTES = 4096;
export const NO_SAVED_REPORT = "No saved report.";

/** Q-AB2: what a series measures. `level` = a balance at month end (net assets); `flow` = an amount in the month. */
export type Axis = "flow" | "level";
export type ChartSeries = SeriesOut & { axis: Axis; stack: boolean };
export type ChartRow = { month: MonthKey; label: string; partial: boolean; values: (number | null)[] };
export type ChartData = Omit<SeriesResult, "series"> & {
  chart: ChartType;
  /**
   * #155 CFO condition on Q-AB2 (2026-10-17, PFC-17): true when the chart has both a `level` and a `flow` series, so a
   * UI can warn or split. Top level (beside `chart`, which stays the chart-type string).
   */
  mixed_axes: boolean;
  source: "request" | "saved";
  labels: string[];
  series: ChartSeries[];
  rows: ChartRow[];
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const bad = (field: string): ReportError => ({ status: 400, error: INVALID_REPORT, field });

export type ChartQuery = { saved: true; id?: string } | (SeriesQuery & { chart: ChartType });

/** The first problem with a chart query (`{ series, range, chart }` or `{ saved: true }`), or null. */
export function chartQueryError(value: unknown, current: MonthKey): ReportError | null {
  if (!isObject(value)) return bad("query");
  // #156 Q-AC10: `{ saved: true }` (the default report, unchanged) or `{ saved: true, id }` (one of the person's reports).
  if ("saved" in value)
    return value.saved === true &&
      Object.keys(value).every((k) => k === "saved" || k === "id") &&
      (!("id" in value) || (typeof value.id === "string" && isReportId(value.id)))
      ? null
      : bad("query");
  if (!Object.keys(value).every((k) => k === "series" || k === "range" || k === "chart")) return bad("query");
  const { chart, ...rest } = value;
  const e = seriesQueryError(rest, current);
  if (e) return e;
  return typeof chart === "string" && (CHART_TYPES as readonly string[]).includes(chart) ? null : bad("chart");
}

/**
 * Q-AB3: in a `stacked-bar`, only parts of a whole stack: `line` / `account` / `category` and the `fixed` /
 * `variable` groups. Totals (`all`) and metrics stay unstacked (stacking them would count money twice). Other chart
 * types stack nothing.
 */
export const stacks = (chart: ChartType, s: { kind: string; id: string }): boolean =>
  chart === "stacked-bar" && (s.kind === "line" || s.kind === "account" || s.kind === "category" || (s.kind === "group" && s.id !== "all"));

/** Aligned chart data for a request or a saved report (its range and chart as saved, Q-AB5). */
export function chartData(
  query: SeriesQuery & { chart: ChartType },
  record: PfRecord | null,
  now: Date,
  source: "request" | "saved" = "request",
  timeZone = HOUSEHOLD_TIME_ZONE,
): ChartData {
  const r = seriesValues({ series: query.series, range: query.range }, record, now, timeZone);
  const series = r.series.map((s): ChartSeries => ({
    ...s,
    axis: s.kind === "metric" && s.id === "net-assets" ? "level" : "flow",
    stack: stacks(query.chart, s),
  }));
  const labels = r.months.map(monthShort);
  const rows = r.months.map((month, i): ChartRow => ({
    month,
    label: labels[i],
    partial: month === r.current,
    values: series.map((s) => s.values[i]),
  }));
  const mixed_axes = series.some((s) => s.axis === "level") && series.some((s) => s.axis === "flow");
  return { ...r, chart: query.chart, mixed_axes, source, labels, series, rows };
}

/** A saved report as a chart query. */
export const fromReport = (report: Report): SeriesQuery & { chart: ChartType } => ({
  series: report.series,
  range: report.range,
  chart: report.chart,
});
