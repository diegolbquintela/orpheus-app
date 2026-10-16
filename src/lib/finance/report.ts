import { ACCOUNT_MAX, CATEGORY_MAX, readExpenses } from "./expenses.ts";
import { MONTHS_STORED, readMonths } from "./months.ts";
import { RecordStore, type PfRecord } from "./record.ts";

/**
 * #153 (spec section 33, PFR-01..PFR-16; design `attachments/pf-chart-report-design.md`): one saved chart report per
 * person (series, date range, chart type). The one validator, shared by the client and `/api/personal-finance/report`
 * (as `field-errors.ts` is for the record). Never clamps or drops: an invalid value is an error with its field path.
 */
export const REPORT_KEY = "orpheus.finance.report.v1";
export const REPORT_MAX_BYTES = 4096;
export const SERIES_MAX = 12;
export const RANGE_MONTHS_MAX = MONTHS_STORED;

export const SERIES_KINDS = ["line", "account", "category", "group", "metric"] as const;
export const GROUP_IDS = ["fixed", "variable", "all"] as const;
export const METRIC_IDS = ["income", "expenses", "surplus", "net-assets"] as const;
export const RANGE_PRESETS = ["3m", "6m", "12m", "24m", "ytd"] as const;
export const CHART_TYPES = ["line", "bar", "stacked-bar"] as const;

export type SeriesKind = (typeof SERIES_KINDS)[number];
export type Series = { kind: SeriesKind; id: string };
export type ReportRange = { preset: (typeof RANGE_PRESETS)[number] } | { from: string; to: string };
export type ChartType = (typeof CHART_TYPES)[number];
export type Report = { series: Series[]; range: ReportRange; chart: ChartType };

export type ReportError = { status: 400 | 413; error: string; field?: string };
export type ReportCheck = { ok: true; report: Report } | ({ ok: false } & ReportError);

export const INVALID_REPORT = "Invalid value.";
export const REPORT_TOO_LARGE = "Report too large.";

const LINE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const onlyKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).every((k) => keys.includes(k));
const name = (v: unknown, max: number): boolean =>
  typeof v === "string" && v.trim() !== "" && v.length <= max;

function idOk(kind: SeriesKind, id: unknown): boolean {
  if (kind === "line") return typeof id === "string" && LINE_ID.test(id);
  if (kind === "account") return name(id, ACCOUNT_MAX);
  if (kind === "category") return name(id, CATEGORY_MAX);
  if (kind === "group") return has(GROUP_IDS, id);
  return has(METRIC_IDS, id);
}

/** Months from `from` to `to` inclusive, or null when either isn't a `YYYY-MM` in 2000–2100. */
function span(from: unknown, to: unknown): number | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  const a = MONTH.exec(from);
  const b = MONTH.exec(to);
  if (!a || !b) return null;
  const ya = Number(a[1]);
  const yb = Number(b[1]);
  if (ya < 2000 || ya > 2100 || yb < 2000 || yb > 2100) return null;
  return (yb - ya) * 12 + (Number(b[2]) - Number(a[2])) + 1;
}

const bad = (field: string): ReportError => ({ status: 400, error: INVALID_REPORT, field });

/** The first problem with a report value (client and API), or null when it can be stored. */
export function reportError(value: unknown): ReportError | null {
  if (!isObject(value) || !onlyKeys(value, ["series", "range", "chart"])) return bad("report");
  const { series, range, chart } = value;
  if (!Array.isArray(series) || series.length < 1 || series.length > SERIES_MAX)
    return bad("series");
  const seen = new Set<string>();
  for (const [i, s] of series.entries()) {
    if (!isObject(s) || !onlyKeys(s, ["kind", "id"])) return bad(`series.${i}`);
    if (!has(SERIES_KINDS, s.kind)) return bad(`series.${i}.kind`);
    if (!idOk(s.kind, s.id)) return bad(`series.${i}.id`);
    const key = JSON.stringify([s.kind, s.id]);
    if (seen.has(key)) return bad("series");
    seen.add(key);
  }
  if (!isObject(range)) return bad("range");
  if ("preset" in range) {
    if (!onlyKeys(range, ["preset"])) return bad("range");
    if (!has(RANGE_PRESETS, range.preset)) return bad("range.preset");
  } else {
    if (!onlyKeys(range, ["from", "to"])) return bad("range");
    const n = span(range.from, range.to);
    if (n === null || n < 1 || n > RANGE_MONTHS_MAX) return bad("range");
  }
  if (!has(CHART_TYPES, chart)) return bad("chart");
  if (new TextEncoder().encode(reportText(value as Report)).length > REPORT_MAX_BYTES)
    return { status: 413, error: REPORT_TOO_LARGE };
  return null;
}

/** The report in a fixed key order (what is stored and returned). Assumes a valid report. */
function canonical(r: Report): Report {
  const range: ReportRange =
    "preset" in r.range ? { preset: r.range.preset } : { from: r.range.from, to: r.range.to };
  return { series: r.series.map((s) => ({ kind: s.kind, id: s.id })), range, chart: r.chart };
}

export const reportText = (r: Report): string => JSON.stringify(canonical(r));

export function checkReport(value: unknown): ReportCheck {
  const e = reportError(value);
  return e ? { ok: false, ...e } : { ok: true, report: canonical(value as Report) };
}

/** Stored text back into a report, or null when missing or no longer valid (never throws). */
export function parseReport(text: string | null | undefined): Report | null {
  if (!text) return null;
  try {
    const c = checkReport(JSON.parse(text));
    return c.ok ? c.report : null;
  } catch {
    return null;
  }
}

/**
 * Q-X4: indexes of `line` / `account` / `category` series not found anywhere in the record (shared lines, accounts,
 * categories, or any stored month's lines). Group and metric series are never missing. The report is not changed.
 */
export function missingSeries(report: Report, record: PfRecord | null): number[] {
  const store = new RecordStore(record ?? {});
  const shared = readExpenses(store);
  const lines = [
    shared.fixed,
    shared.variable,
    ...Object.values(readMonths(store)).flatMap((m) => [m.fixed, m.variable]),
  ].flat();
  const ids = new Set(lines.map((l) => l.id));
  const accounts = new Set([...shared.accounts, ...lines.map((l) => l.account)].filter(Boolean));
  const categories = new Set(
    [...shared.categories, ...lines.map((l) => l.category)].filter(Boolean),
  );
  const out: number[] = [];
  report.series.forEach((s, i) => {
    const found =
      s.kind === "line"
        ? ids.has(s.id)
        : s.kind === "account"
          ? accounts.has(s.id)
          : s.kind === "category"
            ? categories.has(s.id)
            : true;
    if (!found) out.push(i);
  });
  return out;
}
