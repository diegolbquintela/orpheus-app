// #161 (spec 46, Q-AK1..Q-AK15): pure helpers for the Charts report builder. The checks mirror the server's
// validators by calling them (report.ts / reports.ts are shared client + server); the server stays the authority.
import { readExpenses } from "./expenses.ts";
import { readMonths } from "./months.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import { GROUP_IDS, METRIC_IDS, SERIES_MAX, reportError, type ChartType, type Report, type ReportRange, type Series } from "./report.ts";
import { nameError, nameTaken, type Named } from "./reports.ts";

export const NEW_PATH = "/personal-finance/charts/new";
/** #161 Q-AK1 + EL O3 (2026-10-20): the sign-in `next` for each builder route. `/new` is allowlisted exactly; an edit
 * URL (an id pattern, `default` included) is not, so it passes the list path and lands on `/personal-finance/charts`. */
export const NEW_SIGN_IN_NEXT = NEW_PATH;
export const EDIT_SIGN_IN_NEXT = "/personal-finance/charts";
export const editPath = (id: string) => `/personal-finance/charts/${encodeURIComponent(id)}/edit`;
/** Page-owned copy (spec 46.4–46.7). Server refusals are shown with the server's own text. */
export const PICK_ONE = "Pick at least one series.";
export const SERIES_CAP = `Up to ${SERIES_MAX} series.`;
export const NAME_RULE = "Name: 1 to 60 characters, no control characters.";
export const NAME_USED = "Name already used.";

export const METRIC_LABEL: Record<(typeof METRIC_IDS)[number], string> = { income: "Income", expenses: "Expenses", surplus: "Surplus", "net-assets": "Net assets" };
export const GROUP_LABEL: Record<(typeof GROUP_IDS)[number], string> = { fixed: "Fixed", variable: "Variable", all: "All expenses" };

export type Option = { series: Series; label: string };
export type Section = { title: string; options: Option[] };

/** Q-AK2: the picker's sections. Lines, accounts and categories come from the record (shared + every month's lines). */
export function pickerSections(record: PfRecord | null): Section[] {
  const store = new RecordStore(record ?? {});
  const shared = readExpenses(store);
  const lines = new Map<string, string>();
  for (const l of [...Object.values(readMonths(store)).flatMap((m) => [...m.fixed, ...m.variable]), ...shared.fixed, ...shared.variable])
    if (l.id) lines.set(l.id, l.name.trim() || l.id);
  const uniq = (xs: string[]) => [...new Set(xs.filter((x) => x.trim() !== ""))];
  return [
    { title: "Metrics", options: METRIC_IDS.map((id) => ({ series: { kind: "metric", id }, label: METRIC_LABEL[id] })) },
    { title: "Groups", options: GROUP_IDS.map((id) => ({ series: { kind: "group", id }, label: GROUP_LABEL[id] })) },
    { title: "Accounts", options: uniq(shared.accounts).map((id) => ({ series: { kind: "account", id }, label: id })) },
    { title: "Categories", options: uniq(shared.categories).map((id) => ({ series: { kind: "category", id }, label: id })) },
    { title: "Expense lines", options: [...lines].map(([id, label]) => ({ series: { kind: "line", id }, label })) },
  ];
}

export const sameSeries = (a: Series, b: Series) => a.kind === b.kind && a.id === b.id;
export const isPicked = (picked: Series[], s: Series) => picked.some((p) => sameSeries(p, s));
/** Q-AK12: toggling never duplicates and never goes past SERIES_MAX. */
export function toggle(picked: Series[], s: Series): Series[] {
  if (isPicked(picked, s)) return picked.filter((p) => !sameSeries(p, s));
  return picked.length >= SERIES_MAX ? picked : [...picked, { kind: s.kind, id: s.id }];
}
export const atCap = (picked: Series[]) => picked.length >= SERIES_MAX;

/** Q-AK3: a series' label: the record's name for a line (the server's label is the id), else the server label. */
export function labelFor(s: Series, sections: Section[], serverLabel?: string): string {
  if (s.kind === "line") {
    const o = sections.flatMap((x) => x.options).find((x) => sameSeries(x.series, s));
    if (o) return o.label;
  }
  if (s.kind === "metric") return METRIC_LABEL[s.id as keyof typeof METRIC_LABEL] ?? s.id;
  if (s.kind === "group") return GROUP_LABEL[s.id as keyof typeof GROUP_LABEL] ?? s.id;
  return serverLabel ?? s.id;
}

export type RangeChoice = { kind: "preset"; preset: "3m" | "6m" | "12m" | "24m" | "ytd" | "all" } | { kind: "custom"; from: string; to: string };
export const toRange = (c: RangeChoice): ReportRange => (c.kind === "preset" ? { preset: c.preset } : { from: c.from, to: c.to });
export const fromRange = (r: ReportRange): RangeChoice => ("preset" in r ? { kind: "preset", preset: r.preset } : { kind: "custom", from: r.from, to: r.to });

/** Q-AK4: the report check in `save` mode (same function the server runs), so what previews can be saved. */
export function reportProblem(series: Series[], range: RangeChoice, chart: ChartType, current: string): { error: string; field?: string } | null {
  if (series.length === 0) return { error: PICK_ONE, field: "series" };
  const e = reportError({ series, range: toRange(range), chart } satisfies Report, current);
  return e ? { error: e.error, ...(e.field ? { field: e.field } : {}) } : null;
}

/** Q-AK7: the name pre-check (`nameError` / `nameTaken`, as the server). `exceptId` = the report being edited. */
export function nameProblem(name: string, others: Pick<Named, "id" | "name">[], exceptId?: string): string | null {
  if (nameError(name)) return NAME_RULE;
  if (nameTaken(others as Named[], name, exceptId)) return NAME_USED;
  return null;
}
