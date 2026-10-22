/**
 * #223 (personal-finance-spec 60, AC PFSS): named saved scenarios on the scenario screen. Pure helpers. A saved
 * scenario lives only inside the `orpheus.finance.scenario.v1` value (`saved`), the PJ7 value extended; nothing here
 * reads or changes any other record value except to build an in-memory record for reopening (never sent).
 */
import { CURRENCY_KEY } from "./currency.ts";
import { EQUITY_KEY } from "./equity.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { INCOME_KEY } from "./income.ts";
import { MONTHS_KEY } from "./months.ts";
import { type MonthKey, OVERVIEW_KEY } from "./overview.ts";
import type { PfRecord } from "./record.ts";
import { NAME_MAX, NO_SCENARIO, SAVED_MAX, type SavedEntry, type Scenario } from "./scenario-key.ts";

export { NAME_MAX, SAVED_MAX, type SavedEntry };
/** #223 CFO Q-SS1 (built): up to 3 saved scenarios side by side with the screen as it is now. */
export const COMPARE_MAX = 3;
/** The page values a saved scenario keeps (the screen's what-ifs); anything else is never kept. */
export const PAGE_VALUE_NAMES = [STORAGE_KEY, INCOME_KEY, EQUITY_KEY, CURRENCY_KEY, OVERVIEW_KEY] as const;

export const SAVE_SCENARIO = "Save scenario";
export const NAME_LABEL = "Scenario name";
export const NAME_BLANK = "Name the scenario.";
export const NAME_LONG = `Use ${NAME_MAX} characters or fewer.`;
export const NAME_TAKEN = "A scenario with this name already exists. Pick another name, or delete the old one first.";
export const LIST_FULL = `You can keep up to ${SAVED_MAX} scenarios. Delete one first.`;
export const SAVE_FAILED = "Not saved. Try again.";
export const DELETE_FAILED = "Not deleted. Try again.";
export const deleteScenarioQuestion = (name: string): string => `Delete the scenario "${name}"? This cannot be undone.`;
export const basisChanged = (basis: string, current: string): string =>
  `Saved from ${basis}. The latest month is now ${current}: the saved values are shown on it; earlier months come from your latest data.`;

const list = (s: Scenario | null): SavedEntry[] => s?.saved ?? [];

/** The first problem with a new name, or null (trimmed; duplicates ignore case; the list must have room). */
export function nameError(name: string, saved: readonly SavedEntry[]): string | null {
  const n = name.trim();
  if (!n) return NAME_BLANK;
  if (n.length > NAME_MAX) return NAME_LONG;
  if (saved.some((e) => e.name.toLowerCase() === n.toLowerCase())) return NAME_TAKEN;
  if (saved.length >= SAVED_MAX) return LIST_FULL;
  return null;
}

/** Only the page value names a saved scenario keeps. */
export function keptValues(record: PfRecord): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PAGE_VALUE_NAMES) if (typeof record[k] === "string") out[k] = record[k];
  return out;
}

/** The stored scenario value with one more saved scenario (the levers untouched), or the name's problem. */
export function addSaved(s: Scenario | null, entry: SavedEntry): Scenario | { error: string } {
  const named = { ...entry, name: entry.name.trim() };
  const err = nameError(named.name, list(s));
  if (err) return { error: err };
  return { ...(s ?? NO_SCENARIO), saved: [...list(s), named] };
}

/** The stored scenario value without the saved scenario `id` (the levers untouched). */
export function removeSaved(s: Scenario | null, id: string): Scenario {
  return { ...(s ?? NO_SCENARIO), saved: list(s).filter((e) => e.id !== id) };
}

/**
 * The in-memory record a reopened scenario shows (never sent): the latest record with the saved page values over it,
 * and the saved lines on the CURRENT month (Q-SS4: the latest month may be later than the saved one); every other
 * month stays as in the latest record.
 */
export function reopenRecord(latest: PfRecord | null, entry: SavedEntry, current: MonthKey): PfRecord {
  let months: Record<string, unknown> = {};
  try {
    const raw = JSON.parse(latest?.[MONTHS_KEY] ?? "{}") as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) months = raw as Record<string, unknown>;
  } catch {
    months = {};
  }
  let lines: unknown = null;
  try {
    lines = JSON.parse(entry.lines);
  } catch {
    lines = null;
  }
  return {
    ...(latest ?? {}),
    ...keptValues(entry.values),
    ...(lines ? { [MONTHS_KEY]: JSON.stringify({ ...months, [current]: lines }) } : {}),
  };
}

/** A new id: time plus a random tail (no dependency). */
export const newId = (): string => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
