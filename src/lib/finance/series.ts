import { readHousehold } from "./currency.ts";
import { rateUsed, readRates } from "./equity.ts";
import { deletedLabel, grandTotals, isDeleted, readExpenses, totalsOf, type Line } from "./expenses.ts";
import { FIRST_MONTH, hasLines, lineFigures, readMonths } from "./months.ts";
import {
  HOUSEHOLD_TIME_ZONE,
  householdMonth,
  monthFigures,
  type MonthKey,
  nextMonth,
  orZero,
  previousMonth,
  readOverview,
  surplusOf,
} from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import {
  INVALID_REPORT,
  missingSeries,
  RANGE_PRESETS,
  rangeError,
  type ReportError,
  type Series,
  seriesListError,
} from "./report.ts";

/**
 * #154 (spec section 36, PFS-01..PFS-16; design `attachments/pf-series-design.md`): the historical series behind
 * `POST /api/personal-finance/series`. Same series kinds and ids as the #153 report (one validator, `report.ts`),
 * same range shape plus the `all` preset (Q-AA7); a custom range may reach back to `FIRST_MONTH` (2020-01, Q-AA1).
 * Read-only: nothing is stored.
 */
/** #179: the same presets as saved reports (`all` moved into RANGE_PRESETS). */
export const SERIES_PRESETS = RANGE_PRESETS;
export const SERIES_MAX_BYTES = 4096;

export type SeriesRange = { preset: (typeof SERIES_PRESETS)[number] } | { from: string; to: string };
export type SeriesQuery = { series: Series[]; range: SeriesRange };
export type SeriesOut = {
  kind: Series["kind"];
  id: string;
  /** #165 Q-Z1: `<name> (deleted)` for a deleted account / category, else the id. */
  label: string;
  deleted: boolean;
  /** Q-X4: a line / account / category not found anywhere in the record (its values are all null). */
  missing: boolean;
  /** One per `months` entry: household-currency monthly figure, or null when the month has no data (Q-AA2). */
  values: (number | null)[];
};
export type SeriesResult = {
  range: { from: MonthKey; to: MonthKey };
  months: MonthKey[];
  /** The current household month (Q-AA6): included when in range, flagged by `partial`. */
  current: MonthKey;
  partial: boolean;
  currency: string;
  /** Q-AA3 (CFO condition): every month is valued at the record's CURRENT FX rates, never that month's own. */
  fx_basis: "current";
  /** Q-AA10: the month net assets are anchored at (Starting net assets at its start), or null with no data. */
  net_assets_from: MonthKey | null;
  series: SeriesOut[];
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const bad = (field: string): ReportError => ({ status: 400, error: INVALID_REPORT, field });

/** The first problem with a series query, or null. `current` bounds a custom range (2020-01 … current month). */
export function seriesQueryError(value: unknown, current: MonthKey): ReportError | null {
  if (!isObject(value) || !Object.keys(value).every((k) => k === "series" || k === "range")) return bad("query");
  return (
    seriesListError(value.series) ??
    rangeError(value.range, "query", current)
  );
}

/** The first month with any data (lines or typed Overview totals), or null. */
export function firstDataMonth(record: PfRecord | null): MonthKey | null {
  const store = new RecordStore(record ?? {});
  const months = readMonths(store);
  const overview = readOverview(store);
  const keys = [
    ...Object.keys(months).filter((k) => hasLines(months[k])),
    ...Object.keys(overview.months).filter((k) => {
      const f = monthFigures(overview, k, "", { expenses: null, income: null }, {});
      return f.expenses !== null || f.income !== null;
    }),
  ].filter((k) => k >= FIRST_MONTH);
  return keys.length ? keys.sort()[0] : null;
}

/** The months a range covers, oldest first (presets end at the current household month). */
export function rangeMonths(range: SeriesRange, current: MonthKey, record: PfRecord | null): MonthKey[] {
  let from: MonthKey;
  let to: MonthKey = current;
  if ("preset" in range) {
    if (range.preset === "all") from = firstDataMonth(record) ?? current;
    else if (range.preset === "ytd") from = `${current.slice(0, 4)}-01`;
    else {
      from = current;
      for (let i = 1; i < Number(range.preset.replace("m", "")); i++) from = previousMonth(from);
    }
  } else {
    from = range.from;
    to = range.to;
  }
  if (from > to) from = to;
  const out: MonthKey[] = [from];
  while (out[out.length - 1] < to) out.push(nextMonth(out[out.length - 1]));
  return out;
}

/** Every series' values over the range (Q-AA2..Q-AA5). Deleted names keep their history (#165). */
export function seriesValues(query: SeriesQuery, record: PfRecord | null, now: Date, timeZone = HOUSEHOLD_TIME_ZONE): SeriesResult {
  const store = new RecordStore(record ?? {});
  const current = householdMonth(now, timeZone);
  const months = rangeMonths(query.range, current, record);
  const stored = readMonths(store);
  const shared = readExpenses(store);
  const rate = rateUsed(readRates(store));
  const household = readHousehold(store).household;
  const overview = readOverview(store);
  const lines = lineFigures(store);
  const none = { expenses: null, income: null };
  const figures = months.map((k) => monthFigures(overview, k, current, none, lines));
  const missing = new Set(missingSeries({ series: query.series, range: { preset: "12m" }, chart: "line" }, record));
  const monthlyOf = (k: MonthKey, pick: (l: Line) => boolean): number | null => {
    const m = stored[k];
    if (!hasLines(m)) return null;
    return totalsOf([...m.fixed, ...m.variable].filter(pick), rate, household).monthly;
  };
  // Q-AA4 (CFO change 2026-10-17) + Q-AA10: net assets are anchored at the first month with data (the record stores
  // no starting-net-assets date): Starting net assets at the start of that month, plus every month's surplus from
  // there through M, whatever range is asked. Before the anchor: null. A month without a surplus adds nothing
  // (carried flat, never null). Income / expenses / surplus are unchanged.
  const anchor = firstDataMonth(record);
  const netByMonth = new Map<MonthKey, number>();
  if (anchor && anchor <= months[months.length - 1]) {
    let net = orZero(overview.start);
    for (let k = anchor; ; k = nextMonth(k)) {
      net += surplusOf(monthFigures(overview, k, current, none, lines)) ?? 0;
      netByMonth.set(k, net);
      if (k >= months[months.length - 1]) break;
    }
  }
  const netAssets = months.map((k) => netByMonth.get(k) ?? null);
  const series = query.series.map((s, i): SeriesOut => {
    const del = (s.kind === "account" || s.kind === "category") && !missing.has(i) && isDeleted(shared, s.kind, s.id);
    const values = months.map((k, j): number | null => {
      if (missing.has(i)) return null;
      switch (s.kind) {
        case "line":
          return monthlyOf(k, (l) => l.id === s.id);
        case "account":
          return monthlyOf(k, (l) => l.account === s.id);
        case "category":
          return monthlyOf(k, (l) => l.category === s.id);
        case "group": {
          const m = stored[k];
          if (!hasLines(m)) return null;
          if (s.id === "all") return grandTotals({ ...shared, fixed: m.fixed, variable: m.variable }, rate, household).monthly;
          return totalsOf(s.id === "fixed" ? m.fixed : m.variable, rate, household).monthly;
        }
        default:
          if (s.id === "income") return figures[j].income;
          if (s.id === "expenses") return figures[j].expenses;
          if (s.id === "surplus") return surplusOf(figures[j]);
          return netAssets[j];
      }
    });
    return { kind: s.kind, id: s.id, label: del ? deletedLabel(s.id) : s.id, deleted: del, missing: missing.has(i), values };
  });
  return {
    range: { from: months[0], to: months[months.length - 1] },
    months,
    current,
    partial: months.includes(current),
    currency: household,
    fx_basis: "current",
    net_assets_from: anchor,
    series,
  };
}
