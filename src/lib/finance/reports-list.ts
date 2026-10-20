// #160 (spec 45, Q-AJ1..Q-AJ12): pure helpers for the Charts reports list page. No wire change.
import type { ReportItem, ReportList } from "./charts-api.ts";
import type { ChartType, ReportRange } from "./report.ts";

export const CHARTS_PATH = "/personal-finance/charts";
export const NO_REPORTS = "No saved reports yet.";
export const LOADING_REPORTS = "Loading reports…";
export const NO_DATE = "No date";
export const BUILDER_NEXT = "Builder coming next (#161)";
export const limitText = (limit: number) => `Limit of ${limit} reports reached.`;

/** Q-AJ7 / contract Q-AE14: the limit counts named reports only; the default is extra. */
export const namedCount = (reports: readonly ReportItem[]) => reports.filter((r) => !r.default).length;
export const atLimit = (list: ReportList) => namedCount(list.reports) >= list.limit;

/** Q-AJ3: the Toronto calendar date `YYYY-MM-DD`; null (the default, Q-AE3) or unparsable → null (shown as `—`). */
export function torontoDate(iso: string | null): string | null {
  if (iso === null) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

const PRESET: Record<string, string> = {
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
  "24m": "Last 24 months",
  ytd: "Year to date",
  all: "All data",
};
export const rangeText = (r: ReportRange) => ("preset" in r ? (PRESET[r.preset] ?? r.preset) : `${r.from} to ${r.to}`);
const CHART: Record<ChartType, string> = { line: "Line", bar: "Bar", "stacked-bar": "Stacked bar" };
export const chartText = (c: ChartType) => CHART[c] ?? c;

/** Q-AJ5: the first 3 labels, `+N more`, then chart type and range. */
export function seriesSummary(item: Pick<ReportItem, "labels" | "report">): string {
  const shown = item.labels.slice(0, 3);
  const more = item.labels.length - shown.length;
  const names = [...shown, ...(more > 0 ? [`+${more} more`] : [])].join(", ");
  return [names, chartText(item.report.chart), rangeText(item.report.range)].filter(Boolean).join(" · ");
}
