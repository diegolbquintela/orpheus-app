/**
 * Calculator saved searches (#80, spec §7b; ST4-19..24). Pure helpers over a Storage-like object: this browser's
 * `localStorage` only, two keys, no login and never the account. A missing or broken storage (private mode, a
 * malformed value) just reads as "nothing saved".
 */
import { money } from "../dca/format.ts";

export const LAST_KEY = "orpheus.calculator.last.v1";
export const SAVED_KEY = "orpheus.calculator.saved.v1";
export const SAVED_MAX = 5;
export const SAVED_EMPTY = "No saved searches yet.";

export type SavedSearch = {
  rows: { ticker: string; weight: string }[];
  start: string;
  end: string;
  capital: string;
  contribution: string;
  frequency: "weekly" | "monthly";
  /** The basket's currency from the price feed, for the line's money format. */
  currency: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const isText = (v: unknown): v is string => typeof v === "string" && v.length <= 200;

/** A stored value back into a search, or null when it isn't one (never throws). */
export function asSearch(value: unknown): SavedSearch | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.rows) || !v.rows.length || v.rows.length > 20) return null;
  const rows = v.rows.map((r) =>
    r &&
    typeof r === "object" &&
    isText((r as Record<string, unknown>).ticker) &&
    isText((r as Record<string, unknown>).weight)
      ? { ticker: (r as { ticker: string }).ticker, weight: (r as { weight: string }).weight }
      : null,
  );
  if (rows.some((r) => !r || !r.ticker)) return null;
  if (![v.start, v.end, v.capital, v.contribution, v.currency].every(isText)) return null;
  if (v.frequency !== "weekly" && v.frequency !== "monthly") return null;
  return {
    rows: rows as SavedSearch["rows"],
    start: v.start as string,
    end: v.end as string,
    capital: v.capital as string,
    contribution: v.contribution as string,
    frequency: v.frequency,
    currency: v.currency as string,
  };
}

function readJson(storage: StorageLike | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function readLast(storage: StorageLike | null): SavedSearch | null {
  return asSearch(readJson(storage, LAST_KEY));
}

export function readSaved(storage: StorageLike | null): SavedSearch[] {
  const list = readJson(storage, SAVED_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .map(asSearch)
    .filter((s): s is SavedSearch => s !== null)
    .slice(0, SAVED_MAX);
}

/** A typed amount in one form: commas and spaces dropped, as a plain number (`1,000` and `1000.0` → `1000`). */
export function canonicalAmount(text: string): string {
  const trimmed = text.replace(/,/g, "").trim();
  const value = Number(trimmed);
  return trimmed && Number.isFinite(value) ? String(value) : trimmed;
}

/**
 * The standard form of a search, for matching only (QA D1 on #81; EL: match on the standard form, store what was
 * typed): tickers trimmed and upper-cased, weights and amounts canonical. Never stored.
 */
export function normalizeSearch(search: SavedSearch): SavedSearch {
  return {
    ...search,
    rows: search.rows.map((r) => ({
      ticker: r.ticker.trim().toUpperCase(),
      weight: canonicalAmount(r.weight),
    })),
    capital: canonicalAmount(search.capital),
    contribution: canonicalAmount(search.contribution),
  };
}

/** Same search: same basket (order, tickers, weights), dates, amounts and frequency, after normalizing (D1). */
export function sameSearch(a: SavedSearch, b: SavedSearch): boolean {
  const key = (s: SavedSearch) => {
    const n = normalizeSearch(s);
    return JSON.stringify([n.rows, n.start, n.end, n.capital, n.contribution, n.frequency]);
  };
  return key(a) === key(b);
}

/** The list after a successful calculation: newest first, a repeat moves to the top, the oldest beyond 5 drops. */
export function addSearch(list: SavedSearch[], search: SavedSearch): SavedSearch[] {
  return [search, ...list.filter((s) => !sameSearch(s, search))].slice(0, SAVED_MAX);
}

/** Saves a successful search as the last one and at the top of the list; returns the new list. */
export function saveSearch(storage: StorageLike | null, search: SavedSearch): SavedSearch[] {
  // Stored as typed (EL, D1 follow-up): Load and a refresh refill exactly this; a repeat replaces the older line.
  const list = addSearch(readSaved(storage), search);
  try {
    storage?.setItem(LAST_KEY, JSON.stringify(search));
    storage?.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the search still ran; nothing is kept.
  }
  return list;
}

const amount = (text: string) => Number(text.replace(/,/g, "").trim());

/** `PLTR, TQQQ · 2020-10-02 – 2026-10-01 · DCA $1,000` (spec §4 / §7b). */
export function searchLine(search: SavedSearch): string {
  const contribution = amount(search.contribution);
  const dca = Number.isFinite(contribution)
    ? money(contribution, search.currency)
    : search.contribution;
  return `${search.rows.map((r) => r.ticker.trim().toUpperCase()).join(", ")} · ${search.start} – ${search.end} · DCA ${dca}`;
}

/** This browser's localStorage, or null where it can't be used (server render, blocked storage). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
