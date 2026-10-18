import { checkReport, INVALID_REPORT, REPORT_MAX_BYTES, type Report, type ReportError } from "./report.ts";

/**
 * #156 (spec section 38, PFRC-01..PFRC-20; design `attachments/pf-report-crud-design.md`): many saved reports per
 * person. Q-AC1: the legacy single report (`orpheus.finance.report.v1`, #153) IS the default report (`id: "default"`,
 * name `Default`), stored exactly where it was; other ("named") reports live beside it in the person's own row under
 * `orpheus.finance.reports.v1` (a JSON text array). Nothing already stored moves or is lost; no migration.
 */
export const REPORTS_KEY = "orpheus.finance.reports.v1";
export const DEFAULT_ID = "default";
export const DEFAULT_NAME = "Default";
/** Q-AC4: at most 20 named reports per person (the default report is extra). */
export const REPORTS_MAX = 20;
export const NAME_MAX = 60;
/** One create / update body: a report (≤ 4 KB) plus its name. */
export const REPORTS_BODY_MAX = REPORT_MAX_BYTES + 512;

export const REPORT_NOT_FOUND = "Report not found.";
export const REPORT_LIMIT = "Report limit reached.";
export const NAME_TAKEN = "Name already used.";
export const DEFAULT_NAME_FIXED = "The default report cannot be renamed.";

export type Named = { id: string; name: string; report: Report; created_at: string; updated_at: string };

const NAMED_ID = /^r-[0-9a-f]{8}$/;
export const isNamedId = (id: string): boolean => NAMED_ID.test(id);
export const isReportId = (id: string): boolean => id === DEFAULT_ID || isNamedId(id);

/** Stored text → the named reports (invalid entries dropped, never throws). */
export function parseNamed(text: string | null | undefined): Named[] {
  if (!text) return [];
  try {
    const raw = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    const out: Named[] = [];
    for (const e of raw) {
      if (!e || typeof e !== "object" || !isNamedId(e.id) || nameError(e.name) || out.some((o) => o.id === e.id)) continue;
      const c = checkReport(e.report);
      if (!c.ok) continue;
      out.push({ id: e.id, name: e.name, report: c.report, created_at: String(e.created_at ?? ""), updated_at: String(e.updated_at ?? "") });
    }
    return out;
  } catch {
    return [];
  }
}

export const namedText = (list: Named[]): string => JSON.stringify(list);

/** Q-AC3: a name is 1..60 characters after trimming, no control characters. */
export function nameError(name: unknown): boolean {
  if (typeof name !== "string") return true;
  const t = name.trim();
  // eslint-disable-next-line no-control-regex
  return t.length < 1 || t.length > NAME_MAX || /[\u0000-\u001f\u007f]/.test(t);
}

/** Q-AC3: names are unique per person, any case; `Default` is the default report's. */
export const nameTaken = (list: Named[], name: string, exceptId?: string): boolean => {
  const k = name.trim().toLowerCase();
  return k === DEFAULT_NAME.toLowerCase() || list.some((r) => r.id !== exceptId && r.name.toLowerCase() === k);
};

export const newId = (): string => {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return `r-${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
};

export type BodyCheck = { ok: true; name?: string; report: Report } | ({ ok: false } & ReportError);
const bad = (field: string): BodyCheck => ({ ok: false, status: 400, error: INVALID_REPORT, field });

/** A create / update body `{ name, report }` (name optional for the default report). Report: the #153 validator. */
/** #179: `current` (the household month) applies the `save` range rules (2020-01..current, `all` allowed). */
export function checkBody(value: unknown, needName: boolean, current?: string): BodyCheck {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad("body");
  const v = value as Record<string, unknown>;
  if (!Object.keys(v).every((k) => k === "name" || k === "report")) return bad("body");
  if ((needName || "name" in v) && nameError(v.name)) return bad("name");
  const c = checkReport(v.report, current);
  if (!c.ok) return c.field ? { ok: false, status: c.status, error: c.error, field: `report.${c.field}`.replace("report.report", "report") } : { ok: false, status: c.status, error: c.error };
  return { ok: true, name: typeof v.name === "string" ? v.name.trim() : undefined, report: c.report };
}
