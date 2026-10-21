// #214 (personal-finance-spec 53): the History page's one read of the record.
import { API } from "./account-client";
import type { PfRecord } from "./record";

export type LoadResult = { ok: true; record: PfRecord | null } | { ok: false; status: number };

/** GET only: the record as stored (no import of this browser's old values, no migration write). */
export const loadRecord = async (): Promise<LoadResult> => {
  try {
    const res = await fetch(API, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    const body = (await res.json()) as { data?: PfRecord | null };
    return { ok: true, record: body.data ?? null };
  } catch {
    return { ok: false, status: 0 };
  }
};
