/**
 * #91 audit log of actions (attachments/audit-log-design.md). Server-only. For operations and debug, not personal
 * data: actor / target are masked codes, `detail` comes from a fixed list, nothing from a request body is stored.
 * Writing is best effort: a failed insert is logged (action code only) and never changes the action's answer.
 */
import { createHash } from "node:crypto";
import type { Grants, Level, Surface } from "./access.ts";
import type { AccountAccess } from "./access.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";

export const AUDIT_ACTIONS = [
  "auth.sign_in",
  "auth.sign_out",
  "account.password",
  "account.email",
  "access.add",
  "access.grants",
  "access.remove",
  "access.reset",
  "access.denied",
  "pf.save",
  "pf.delete",
  "pf.view",
  "dash.holding_add",
  "dash.holding_edit",
  "dash.holding_delete",
  "dash.settings",
  // #93: the owner ran the encryption migration (detail: encrypt / reencrypt).
  "account.encryption",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditOutcome = "ok" | "denied" | "failed";
export type AuditRole = "owner" | "cfo" | "pm" | "cfo+pm" | "person" | "anonymous";

const SALT = "orpheus-audit-v1:";

/** `p-` / `h-` + the first 8 hex of SHA-256(salt + id): stable per id, no email or name, not reversible from the log. */
export function maskCode(prefix: "p" | "h", id: string | number): string {
  return `${prefix}-${createHash("sha256").update(`${SALT}${id}`).digest("hex").slice(0, 8)}`;
}

export function actorCode(access: Pick<AccountAccess, "owner" | "viewerId"> | null): string {
  if (!access) return "anonymous";
  return access.owner ? "owner" : maskCode("p", access.viewerId);
}

export function roleOf(access: Pick<AccountAccess, "owner" | "grants"> | null): AuditRole {
  if (!access) return "anonymous";
  if (access.owner) return "owner";
  const cfo = access.grants.personal_finance !== "none";
  const pm = access.grants.dashboard !== "none";
  return cfo && pm ? "cfo+pm" : cfo ? "cfo" : pm ? "pm" : "person";
}

/** A person as a target: the owner stays `owner`, anyone else their masked code. */
export function personTarget(userId: string, ownerId: string | null): string {
  return ownerId && userId === ownerId ? "owner" : maskCode("p", userId);
}

const SHORT: Record<Level, string> = { none: "none", read: "read", read_write: "read_write" };
/** `pf:<level> dash:<level>`: the only grant detail. */
export function grantsDetail(g: Grants): string {
  return `pf:${SHORT[g.personal_finance]} dash:${SHORT[g.dashboard]}`;
}
export function deniedDetail(surface: Surface, method: string): string {
  return `${surface} ${method.toUpperCase().replace(/[^A-Z]/g, "")}`;
}

export type AuditEvent = {
  actor: string;
  role: AuditRole;
  action: AuditAction;
  target?: string | null;
  outcome?: AuditOutcome;
  detail?: string | null;
};

export async function recordAudit(db: Queryable | null | undefined, e: AuditEvent): Promise<void> {
  if (!db) return;
  try {
    await db.query(
      "INSERT INTO audit_event (actor, role, action, target, outcome, detail) VALUES ($1, $2, $3, $4, $5, $6)",
      [e.actor, e.role, e.action, e.target ?? null, e.outcome ?? "ok", e.detail ?? null],
    );
  } catch {
    console.error(`[audit] could not record ${e.action}`);
  }
}

/** Shorthand for a signed-in person's action. */
export function auditFor(db: Queryable | null | undefined, access: AccountAccess, action: AuditAction, more: Partial<AuditEvent> = {}) {
  return recordAudit(db, { actor: actorCode(access), role: roleOf(access), action, ...more });
}

export type AuditRow = {
  id: number;
  at: string;
  actor: string;
  role: string;
  action: string;
  target: string | null;
  outcome: string;
  detail: string | null;
};

export async function listAudit(db: Queryable, opts: { before?: number | null; limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, Math.trunc(opts.limit ?? 50)));
  const before = opts.before && opts.before > 0 ? opts.before : null;
  const found = await db.query<Record<string, unknown>>(
    `SELECT id, at, actor, role, action, target, outcome, detail FROM audit_event
     ${before ? "WHERE id < $2" : ""} ORDER BY id DESC LIMIT $1`,
    before ? [limit + 1, before] : [limit + 1],
  );
  const rows = found.slice(0, limit).map(
    (x): AuditRow => ({
      id: Number(x.id),
      at: new Date(x.at as string).toISOString(),
      actor: String(x.actor),
      role: String(x.role),
      action: String(x.action),
      target: (x.target as string | null) ?? null,
      outcome: String(x.outcome),
      detail: (x.detail as string | null) ?? null,
    }),
  );
  return { events: rows, more: found.length > limit };
}
