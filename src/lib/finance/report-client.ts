import { type Report, type ReportError, reportError } from "./report.ts";

/**
 * #153 (spec section 33): the client side of `/api/personal-finance/report`. No UI uses it yet (PF charts 2/6+).
 * A save is checked with the same `reportError` as the API (PFR-15) before anything is sent.
 */
export const REPORT_API = "/api/personal-finance/report";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
export type Loaded = { report: Report | null; missing: number[] };
export type Saved =
  ({ ok: true } & Loaded) | { ok: false; status: number; error: string; field?: string };

export async function loadReport(f: Fetch = fetch): Promise<Loaded> {
  const r = await f(REPORT_API, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`load ${r.status}`);
  return (await r.json()) as Loaded;
}

export async function saveReport(report: Report, f: Fetch = fetch): Promise<Saved> {
  const local: ReportError | null = reportError(report);
  if (local) return { ok: false, status: local.status, error: local.error, field: local.field };
  const r = await f(REPORT_API, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ report }),
  });
  const body = (await r.json().catch(() => ({}))) as Partial<Loaded> & {
    error?: string;
    field?: string;
  };
  if (!r.ok)
    return { ok: false, status: r.status, error: body.error ?? "Not saved.", field: body.field };
  return { ok: true, report: body.report ?? null, missing: body.missing ?? [] };
}

export async function deleteReport(f: Fetch = fetch): Promise<boolean> {
  const r = await f(REPORT_API, { method: "DELETE" });
  await r.text().catch(() => "");
  return r.ok;
}
