import { readHousehold } from "./currency.ts";
import { rateUsed, readRates } from "./equity.ts";
import { ACCOUNT_MAX, CATEGORY_MAX, deletedLabel, isDeleted, readExpenses, totalsOf } from "./expenses.ts";
import { FIRST_MONTH, readMonths } from "./months.ts";
import { householdMonth } from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";

/**
 * #153 (spec section 33, PFR-01..PFR-16; design `attachments/pf-chart-report-design.md`): one saved chart report per
 * person (series, date range, chart type). The one validator, shared by the client and `/api/personal-finance/report`
 * (as `field-errors.ts` is for the record). Never clamps or drops: an invalid value is an error with its field path.
 */
export const REPORT_KEY = "orpheus.finance.report.v1";
export const REPORT_MAX_BYTES = 4096;
export const SERIES_MAX = 12;
/** #153 Q-X2: a custom range is at most 24 months (its own limit since #163 removed the 24-month storage window). */
export const RANGE_MONTHS_MAX = 24;

export const SERIES_KINDS = ["line", "account", "category", "group", "metric"] as const;
export const GROUP_IDS = ["fixed", "variable", "all"] as const;
export const METRIC_IDS = ["income", "expenses", "surplus", "net-assets"] as const;
/** #179: `all` (dynamic: resolved when the report runs) is a preset everywhere, saved reports included (Q-AF1..Q-AF9). */
export const RANGE_PRESETS = ["3m", "6m", "12m", "24m", "ytd", "all"] as const;
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
/** #179 Q-AF4 (CFO, 2026-10-17): the save / query range bounds (status 400, field `range` unchanged). */
export const RANGE_BEFORE_FIRST = "Range can't start before 2020-01.";
export const RANGE_AFTER_CURRENT = "Range can't end after the current month.";
/** #171 CFO round (2026-10-17): the existing 24-month cap (save / stored modes only; never query) says why. 400, field unchanged. */
export const RANGE_TOO_LONG = "Range can't be longer than 24 months.";

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

/** #154: the first problem with a `series` list (shared by the report and `/api/personal-finance/series`). */
export function seriesListError(series: unknown): ReportError | null {
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
  return null;
}

/**
 * #179 (spec 41.1): THE range validator, shared by `/series`, `/chart` and every saved-report path. Modes:
 * - `query` (/series, /chart): any preset; custom within FIRST_MONTH (2020-01)..`current`, no length cap.
 * - `save` (every saved-report write): any preset (`all` included); custom within FIRST_MONTH..`current` (#173) and at
 *   most `RANGE_MONTHS_MAX` months.
 * - `stored` (reading what is stored): any preset; custom a valid 2000..2100 span of at most `RANGE_MONTHS_MAX` months
 *   (the pre-#179 rule, so no existing stored report stops reading).
 * Every refusal is 400 with field `range` / `range.preset`: `Invalid value.`, except the two bounds (Q-AF4, built
 * 2026-10-17): `RANGE_BEFORE_FIRST` / `RANGE_AFTER_CURRENT`.
 */
export type RangeMode = "query" | "save" | "stored";
export function rangeError(range: unknown, mode: RangeMode = "stored", current?: string): ReportError | null {
  if (!isObject(range)) return bad("range");
  if ("preset" in range) {
    if (!onlyKeys(range, ["preset"])) return bad("range");
    if (!has(RANGE_PRESETS, range.preset)) return bad("range.preset");
    return null;
  }
  if (!onlyKeys(range, ["from", "to"])) return bad("range");
  const n = span(range.from, range.to);
  if (n === null || n < 1) return bad("range");
  const from = range.from as string;
  const to = range.to as string;
  // #179 Q-AF4 (CFO, 2026-10-17): the two bounds refusals keep 400 + field `range` but say why. `from` is checked first.
  if (mode !== "stored" && from < FIRST_MONTH) return { status: 400, error: RANGE_BEFORE_FIRST, field: "range" };
  if (mode !== "stored" && to > (current ?? householdMonth(new Date()))) return { status: 400, error: RANGE_AFTER_CURRENT, field: "range" };
  if (mode !== "query" && n > RANGE_MONTHS_MAX) return { status: 400, error: RANGE_TOO_LONG, field: "range" };
  return null;
}

/**
 * The first problem with a report value, or null. #179: with `current` (a `YYYY-MM`), the `save` rules (client and API
 * writes; 2020-01..current); without, the lenient `stored` rules (reading what is stored).
 */
export function reportError(value: unknown, current?: string): ReportError | null {
  if (!isObject(value) || !onlyKeys(value, ["series", "range", "chart"])) return bad("report");
  const { series, range, chart } = value;
  const e = seriesListError(series) ?? (current ? rangeError(range, "save", current) : rangeError(range, "stored"));
  if (e) return e;
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

/** `current` given: a write (`save` rules, #179); omitted: reading what is stored (`stored` rules). */
export function checkReport(value: unknown, current?: string): ReportCheck {
  const e = reportError(value, current);
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

/**
 * #165 (PFD-05, PFD-06, CFO condition 2): indexes of `account` / `category` series naming a DELETED name that earlier
 * months' lines still hold. They are not in `missing` (those lines find them); a client labels them `(deleted)`.
 */
export function deletedSeries(report: Report, record: PfRecord | null): number[] {
  const store = new RecordStore(record ?? {});
  const shared = readExpenses(store);
  const missing = new Set(missingSeries(report, record));
  const out: number[] = [];
  report.series.forEach((s, i) => {
    if ((s.kind === "account" || s.kind === "category") && !missing.has(i) && isDeleted(shared, s.kind, s.id)) out.push(i);
  });
  return out;
}

/** #165 Q-Z1 (PFD-06): each series' display name: its id, `<name> (deleted)` for a deleted account / category. */
export function seriesLabels(report: Report, record: PfRecord | null): string[] {
  const del = new Set(deletedSeries(report, record));
  return report.series.map((s, i) => (del.has(i) ? deletedLabel(s.id) : s.id));
}

/**
 * #165 (PFD-05, condition 2): an `account` / `category` series' monthly figure in each stored month that has lines
 * with it (household currency, the record's Rate used), so a deleted name keeps returning its past data. Other kinds:
 * an empty object (their figures come from the Overview).
 */
export function seriesHistory(report: Report, record: PfRecord | null): Record<string, number>[] {
  const store = new RecordStore(record ?? {});
  const months = readMonths(store);
  const rate = rateUsed(readRates(store));
  const household = readHousehold(store).household;
  return report.series.map((s) => {
    const out: Record<string, number> = {};
    if (s.kind !== "account" && s.kind !== "category") return out;
    for (const [k, m] of Object.entries(months).sort(([a], [b]) => (a < b ? -1 : 1))) {
      const lines = [...m.fixed, ...m.variable].filter((l) => l[s.kind as "account" | "category"] === s.id);
      const monthly = lines.length ? totalsOf(lines, rate, household).monthly : null;
      if (monthly !== null) out[k] = monthly;
    }
    return out;
  });
}
