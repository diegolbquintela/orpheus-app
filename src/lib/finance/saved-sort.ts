/**
 * #278 (attachments/personal-finance-spec.md §83, AC PFSO): the Saved scenarios table's column sort. Client
 * side and in memory only: nothing is stored, sent or recalculated; the saved list itself is never reordered.
 *
 * A header click cycles: default → ascending → descending → default. Clicking another column starts it ascending.
 * Default order = the stored order (oldest saved first, each Save appends). Ties (equal names ignoring case and
 * accents, or the same From month) keep the default order: the sort is stable on the stored index.
 */
import type { SavedEntry } from "./scenario-key.ts";

export const SORT_COLUMNS = ["name", "from"] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDir = "ascending" | "descending";
export type SavedSort = { column: SortColumn; dir: SortDir } | null;

export const DEFAULT_SORT: SavedSort = null;

/** The next sort after a click on `column`. */
export function nextSort(current: SavedSort, column: SortColumn): SavedSort {
  if (!current || current.column !== column) return { column, dir: "ascending" };
  return current.dir === "ascending" ? { column, dir: "descending" } : null;
}

const NAME_ORDER = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const compare: Record<SortColumn, (a: SavedEntry, b: SavedEntry) => number> = {
  name: (a, b) => NAME_ORDER.compare(a.name, b.name),
  // `basis` is `yyyy-mm`, so text order is month order.
  from: (a, b) => (a.basis < b.basis ? -1 : a.basis > b.basis ? 1 : 0),
};

/** A new array in the shown order; `list` is not touched. Descending reverses the column order, never the tiebreak. */
export function sortSaved(list: readonly SavedEntry[], sort: SavedSort): SavedEntry[] {
  const rows = list.map((e, i) => ({ e, i }));
  if (sort) {
    const sign = sort.dir === "ascending" ? 1 : -1;
    const by = compare[sort.column];
    rows.sort((a, b) => sign * by(a.e, b.e) || a.i - b.i);
  }
  return rows.map((r) => r.e);
}

/** `aria-sort` for a sortable header: the sorted column says its direction, the others "none". */
export const ariaSort = (sort: SavedSort, column: SortColumn): "ascending" | "descending" | "none" =>
  sort?.column === column ? sort.dir : "none";

/** The header button's accessible name, e.g. "Scenario name, sorted ascending. Sort descending". */
export function sortLabel(title: string, sort: SavedSort, column: SortColumn): string {
  const now = ariaSort(sort, column);
  const next = nextSort(sort, column);
  const then = next ? `Sort ${next.dir}` : "Back to saved order";
  return now === "none" ? `${title}. ${then}` : `${title}, sorted ${now}. ${then}`;
}
