import { STALE_MESSAGE, type PfRecord } from "./record";

const API = "/api/personal-finance";

export type Version = string | number | null;

export type LoadResult =
  | { ok: true; status?: number; record: PfRecord | null; version?: Version; write?: boolean }
  | { ok: false; status: number };

export type SaveHistoryResult =
  | { ok: true; version?: Version; record?: PfRecord | null }
  | { ok: false; stale: boolean; status?: number; message?: string };

export const loadRecord = async (): Promise<LoadResult> => {
  try {
    const res = await fetch(API, { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, status: res.status };
    const body = (await res.json()) as {
      data?: PfRecord | null;
      version?: Version;
      access?: { owner?: boolean; write?: boolean };
    };
    const version =
      typeof body.version === "string" || typeof body.version === "number" ? body.version : null;
    return {
      ok: true,
      status: res.status,
      record: body.data ?? null,
      version,
      write: body.access?.write !== false,
    };
  } catch {
    return { ok: false, status: 0 };
  }
};

export const loadHistory = loadRecord;

export const saveHistory = async (
  record: PfRecord,
  baseVersion?: Version,
): Promise<SaveHistoryResult> => {
  try {
    const payload: { data: PfRecord; baseVersion?: string | null } = { data: record };
    if (baseVersion !== undefined) {
      payload.baseVersion = baseVersion === null ? null : String(baseVersion);
    }
    const res = await fetch(API, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => "");
    let body: { version?: Version; data?: PfRecord | null; error?: string } = {};
    try {
      body = text ? (JSON.parse(text) as typeof body) : {};
    } catch {
      body = {};
    }
    if (res.ok) {
      return {
        ok: true,
        version: body.version !== undefined ? body.version : baseVersion,
        record: body.data ?? record,
      };
    }
    if (res.status === 409) {
      return {
        ok: false,
        stale: true,
        status: 409,
        message: typeof body.error === "string" && body.error ? body.error : STALE_MESSAGE,
      };
    }
    return { ok: false, stale: false, status: res.status, message: body.error };
  } catch {
    return { ok: false, stale: false, status: 0 };
  }
};
