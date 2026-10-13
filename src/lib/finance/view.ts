/**
 * Section toggles (#105; spec `attachments/personal-finance-spec.md` section 18.1, PF-40..41): which of `02` Income,
 * `03` Expenses and `04` Overview are closed. Stored against the account (a sixth record value, like the others), so
 * a refresh or another device shows the same; malformed or missing → every section open.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const VIEW_KEY = "orpheus.finance.view.v1";
export const SECTIONS = ["income", "expenses", "summary", "overview"] as const;
export type SectionKey = (typeof SECTIONS)[number];
export type View = { closed: SectionKey[] };
export const ALL_OPEN: View = { closed: [] };

const isSection = (v: unknown): v is SectionKey =>
  typeof v === "string" && (SECTIONS as readonly string[]).includes(v);

/** A stored value back into the view, or every section open when it isn't one (never throws). */
export function asView(value: unknown): View {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ALL_OPEN;
  const closed = (value as Record<string, unknown>).closed;
  if (!Array.isArray(closed)) return ALL_OPEN;
  return { closed: SECTIONS.filter((s) => closed.some((c) => isSection(c) && c === s)) };
}

export const isOpen = (view: View, section: SectionKey): boolean => !view.closed.includes(section);

/** The view with `section` flipped (closed sections kept in the page's order). */
export function toggleSection(view: View, section: SectionKey): View {
  const closed = isOpen(view, section)
    ? [...view.closed, section]
    : view.closed.filter((s) => s !== section);
  return { closed: SECTIONS.filter((s) => closed.includes(s)) };
}

export function readView(storage: StorageLike | null): View {
  try {
    const text = storage?.getItem(VIEW_KEY);
    return text ? asView(JSON.parse(text)) : ALL_OPEN;
  } catch {
    return ALL_OPEN;
  }
}

export function writeView(storage: StorageLike | null, view: View): void {
  try {
    storage?.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Storage blocked: the page keeps working for this visit.
  }
}
