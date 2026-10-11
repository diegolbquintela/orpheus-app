import { CURRENCY_KEY } from "./currency.ts";
import { EQUITY_KEY } from "./equity.ts";
import { LEGACY_EXPENSES_KEY, migrateExpenses, STORAGE_KEY } from "./expenses.ts";
import { INCOME_KEY } from "./income.ts";
import { OVERVIEW_KEY } from "./overview.ts";

/**
 * The Personal Finance record stored against the account (#102; spec section 16.5): the five page values, by
 * name, each the JSON text the page's read / write helpers use. Shared by the page and the API (validation).
 */
export type PfRecord = Record<string, string>;

/** Names the account record may hold (the server refuses others). */
export const RECORD_NAMES = [
  STORAGE_KEY,
  INCOME_KEY,
  EQUITY_KEY,
  CURRENCY_KEY,
  OVERVIEW_KEY,
] as const;
/** This browser's old (#84–#94) `localStorage` keys, imported once into an empty account. */
export const LEGACY_LOCAL_KEYS = [
  LEGACY_EXPENSES_KEY,
  INCOME_KEY,
  EQUITY_KEY,
  CURRENCY_KEY,
  OVERVIEW_KEY,
] as const;
export const RECORD_MAX_BYTES = 256 * 1024;

export type RecordCheck =
  { ok: true; record: PfRecord } | { ok: false; status: 400 | 413; error: string };

/** Whether a client-sent value is a storable record (names allowed, values strings, ≤ 256 KB). */
export function checkRecord(value: unknown): RecordCheck {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, status: 400, error: "data must be an object." };
  const record: PfRecord = {};
  for (const [name, text] of Object.entries(value as Record<string, unknown>)) {
    if (!(RECORD_NAMES as readonly string[]).includes(name))
      return { ok: false, status: 400, error: `Unknown name: ${name.slice(0, 60)}` };
    if (typeof text !== "string")
      return { ok: false, status: 400, error: "Values must be strings." };
    record[name] = text;
  }
  if (new TextEncoder().encode(JSON.stringify(record)).length > RECORD_MAX_BYTES)
    return { ok: false, status: 413, error: "Record too large." };
  return { ok: true, record };
}

type LocalLike = {
  getItem(key: string): string | null;
  removeItem(key: string): void;
};

/** An in-memory store over a record: what the page reads and writes; `onChange` after every write. */
export class RecordStore {
  data: PfRecord;
  private onChange: () => void;
  constructor(data: PfRecord, onChange: () => void = () => {}) {
    this.data = { ...data };
    this.onChange = onChange;
  }
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
  }
  setItem(key: string, value: string): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this.onChange();
  }
  removeItem(key: string): void {
    if (!(key in this.data)) return;
    delete this.data[key];
    this.onChange();
  }
  snapshot(): PfRecord {
    return { ...this.data };
  }
}

export type Prepared = { record: PfRecord; imported: boolean; migrated: boolean };

/**
 * The record the page starts from (Q27, Q28): the account's when it has one; else this browser's old values (then
 * removed from `localStorage`); either way an old-direction expenses v1 becomes v2 (rates inverted once).
 * `imported` / `migrated` say whether the record must be saved back.
 */
export function prepareRecord(server: PfRecord | null, local: LocalLike | null): Prepared {
  let record: PfRecord = server ? { ...server } : {};
  let imported = false;
  if (!server && local) {
    for (const key of LEGACY_LOCAL_KEYS) {
      let text: string | null = null;
      try {
        text = local.getItem(key);
      } catch {
        text = null;
      }
      if (text !== null) record[key] = text;
    }
    imported = Object.keys(record).length > 0;
  }
  const store = new RecordStore(record);
  const migrated = migrateExpenses(store);
  record = store.snapshot();
  // Only the allowed names go to the account.
  for (const name of Object.keys(record))
    if (!(RECORD_NAMES as readonly string[]).includes(name)) delete record[name];
  return { record, imported, migrated };
}

/** After a successful import: the old keys leave this browser. */
export function clearLegacy(local: LocalLike | null): void {
  for (const key of LEGACY_LOCAL_KEYS) {
    try {
      local?.removeItem(key);
    } catch {
      // Blocked storage: nothing to clear.
    }
  }
}
