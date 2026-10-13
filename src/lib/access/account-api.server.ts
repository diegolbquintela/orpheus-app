/**
 * `/api/account/*` (#90; attachments/roles-and-account-design.md sections 4–7). Server-only. Every handler answers, in
 * order: 404 JSON while `DASHBOARD_ENABLED` is off (sign-in lives behind it); 405 for another method; 403 for a
 * scripted cross-site / same-site write (Fetch Metadata, ROLE-20); 401 signed out; 503 without a database; then:
 *
 * - `GET /api/account/me`: the person (name, email), owner flag, grants, forced change.
 * - `GET /api/account/who`: "Who has access" (ROLE-19, Q-D14). Current state only; never history (#91).
 * - `POST /api/account/password` `{ currentPassword, newPassword }` (ROLE-05).
 * - `POST /api/account/email` `{ newEmail, currentPassword }` (ROLE-06; the owner: 403, Q-D12).
 * - `/api/account/access` (owner only, ROLE-17): GET people; POST `{ name, email, personal_finance, dashboard }` creates
 *   a person (ROLE-07; the temporary password once, `no-store`); PUT `{ userId, personal_finance, dashboard }` sets
 *   grants; DELETE `?userId=` removes access (Q-D7). `POST /api/account/reset` `{ userId }` (ROLE-18).
 *
 * - `GET /api/account/audit` (#91, owner only): the audit log of actions, masked.
 *
 * Replies are `Cache-Control: no-store`; nothing here logs a password or a temporary password.
 */
import {
  COPY,
  type Grants,
  isLevel,
  MIN_PASSWORD,
  NO_GRANTS,
  normaliseEmail,
  roleLines,
  SURFACES,
} from "./access.ts";
import {
  accessOf,
  type AccountAccess,
  changeEmail,
  changePassword,
  checkPassword,
  createPerson,
  peopleFor,
  removeAccess,
  resetPassword,
  setGrants,
  userByEmail,
  userById,
} from "./access.server.ts";
import {
  badRequest,
  type DashboardApiDeps,
  dashboardJson as json,
  defaultGetDb,
  encryptionUnavailable,
  forbiddenResponse,
  storageUnavailable,
  unauthorizedResponse,
  type DashboardUser,
} from "../dashboard/session.server.ts";
import { dashboardMethodNotAllowedResponse, guardDashboardApi } from "../dashboard/flag.server.ts";
import { auditFor, grantsDetail, listAudit, personTarget } from "./audit.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import { appKeyring, encryptionReadiness } from "../crypto/keys.server.ts";
import { encryptionStatus, migrateColumns } from "../../../scripts/data-migrate.mjs";

/** Fetch Metadata (same rule as `assertSameSiteRequest`): only same-origin or non-browser requests may write. */
export function crossSiteWrite(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return false;
  const site = request.headers.get("sec-fetch-site");
  return Boolean(site) && site !== "same-origin" && site !== "none";
}

type Ok = { viewer: DashboardUser; db: Queryable; access: AccountAccess };

async function gate(request: Request, allow: readonly string[], deps: DashboardApiDeps): Promise<Response | Ok> {
  const env = deps.env ?? process.env;
  const blocked = guardDashboardApi(env);
  if (blocked) return blocked;
  if (!allow.includes(request.method.toUpperCase())) return dashboardMethodNotAllowedResponse(allow);
  if (crossSiteWrite(request)) return forbiddenResponse();
  // #93 (ENC-05): no key, no sensitive read or write (fail closed).
  const enc = encryptionReadiness(env);
  if (!enc.ready) {
    console.error(`[encryption] unavailable: ${enc.reason}`);
    return encryptionUnavailable();
  }
  const viewer = await deps.getUser(request.headers);
  if (!viewer) return unauthorizedResponse();
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return storageUnavailable();
  return { viewer, db, access: await accessOf(db, viewer, env) };
}

async function body(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const b = (await request.json()) as unknown;
    if (!b || typeof b !== "object" || Array.isArray(b)) return badRequest("Body must be a JSON object.");
    return b as Record<string, unknown>;
  } catch {
    return badRequest("Body must be JSON.");
  }
}

export const ME_ALLOW = ["GET", "HEAD"] as const;
export async function handleAccountMeRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, ME_ALLOW, deps);
  if (g instanceof Response) return g;
  const me = await userById(g.db, g.viewer.id);
  return json({
    name: me?.name ?? "",
    email: me?.email ?? g.viewer.email,
    owner: g.access.owner,
    mustChange: g.access.mustChange,
    grants: g.access.grants,
    roles: roleLines(g.access.owner, g.access.grants),
  });
}

export const WHO_ALLOW = ["GET", "HEAD"] as const;
export async function handleAccountWhoRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, WHO_ALLOW, deps);
  if (g instanceof Response) return g;
  if (g.access.mustChange) return json({ people: [] });
  return json({ people: await peopleFor(g.db, g.access) });
}

export const PASSWORD_ALLOW = ["POST"] as const;
export async function handleAccountPasswordRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, PASSWORD_ALLOW, deps);
  if (g instanceof Response) return g;
  const b = await body(request);
  if (b instanceof Response) return b;
  const current = typeof b.currentPassword === "string" ? b.currentPassword : "";
  const next = typeof b.newPassword === "string" ? b.newPassword : "";
  if (!current) return json({ error: COPY.enterCurrent, field: "currentPassword" }, 400);
  if (next.length < MIN_PASSWORD || next.length > 128) return json({ error: COPY.tooShort, field: "newPassword" }, 400);
  if (!(await checkPassword(g.db, g.viewer.id, current)))
    return json({ error: COPY.wrongPassword, field: "currentPassword" }, 400);
  await changePassword(g.db, g.viewer, next);
  await auditFor(g.db, g.access, "account.password");
  return json({ ok: true });
}

export const EMAIL_ALLOW = ["POST"] as const;
export async function handleAccountEmailRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, EMAIL_ALLOW, deps);
  if (g instanceof Response) return g;
  // Q-D12: the owner is whoever ORPHEUS_OWNER_EMAIL names, so the owner's email can't change here.
  if (g.access.owner) return json({ error: COPY.ownerEmailBlocked }, 403);
  const b = await body(request);
  if (b instanceof Response) return b;
  const email = normaliseEmail(b.newEmail);
  if (!email) return json({ error: COPY.enterEmail, field: "newEmail" }, 400);
  const current = typeof b.currentPassword === "string" ? b.currentPassword : "";
  if (!current) return json({ error: COPY.enterCurrent, field: "currentPassword" }, 400);
  if (!(await checkPassword(g.db, g.viewer.id, current)))
    return json({ error: COPY.wrongPassword, field: "currentPassword" }, 400);
  const existing = await userByEmail(g.db, email);
  // Q-D16: the plain message (only signed-in people reach it).
  if (existing && existing.id !== g.viewer.id) return json({ error: COPY.emailInUse, field: "newEmail" }, 409);
  // The new email must not become the owner's: ownership is set by the deployment only.
  const ownerEmail = normaliseEmail((deps.env ?? process.env).ORPHEUS_OWNER_EMAIL);
  if (ownerEmail && email === ownerEmail) return json({ error: COPY.emailInUse, field: "newEmail" }, 409);
  await changeEmail(g.db, g.viewer, email);
  await auditFor(g.db, g.access, "account.email");
  return json({ ok: true, email });
}

function grantsFrom(b: Record<string, unknown>): Grants | Response {
  const grants: Grants = { ...NO_GRANTS };
  for (const s of SURFACES) {
    const v = b[s] ?? "none";
    if (!isLevel(v)) return badRequest(`${s} must be none, read or read_write.`);
    grants[s] = v;
  }
  return grants;
}

export const ACCESS_ALLOW = ["GET", "HEAD", "POST", "PUT", "DELETE"] as const;
export async function handleAccountAccessRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, ACCESS_ALLOW, deps);
  if (g instanceof Response) return g;
  // ROLE-17: the owner only (and never with a temporary password in place).
  if (!g.access.owner || !g.access.ownerId || g.access.mustChange) return forbiddenResponse();
  const ownerId = g.access.ownerId;
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return json({ people: await peopleFor(g.db, g.access) });
  if (method === "DELETE") {
    const userId = new URL(request.url).searchParams.get("userId") ?? "";
    if (!userId || userId === ownerId) return forbiddenResponse();
    if (!(await userById(g.db, userId))) return json({ error: "No such person." }, 404);
    await removeAccess(g.db, userId);
    await auditFor(g.db, g.access, "access.remove", { target: personTarget(userId, ownerId) });
    return json({ ok: true });
  }
  const b = await body(request);
  if (b instanceof Response) return b;
  const grants = grantsFrom(b);
  if (grants instanceof Response) return grants;
  if (method === "PUT") {
    const userId = typeof b.userId === "string" ? b.userId : "";
    if (!userId || userId === ownerId) return forbiddenResponse();
    if (!(await userById(g.db, userId))) return json({ error: "No such person." }, 404);
    await setGrants(g.db, ownerId, userId, grants);
    await auditFor(g.db, g.access, "access.grants", { target: personTarget(userId, ownerId), detail: grantsDetail(grants) });
    return json({ ok: true, people: await peopleFor(g.db, g.access) });
  }
  // POST: create a person (or grant an existing account).
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!name) return json({ error: COPY.enterName, field: "name" }, 400);
  const email = normaliseEmail(b.email);
  if (!email) return json({ error: COPY.enterEmail, field: "email" }, 400);
  const existing = await userByEmail(g.db, email);
  if (existing?.id === ownerId) return forbiddenResponse();
  const result = await createPerson(g.db, ownerId, { name, email, grants });
  const added = await userByEmail(g.db, email);
  await auditFor(g.db, g.access, "access.add", {
    target: added ? personTarget(added.id, ownerId) : null,
    detail: grantsDetail(grants),
  });
  return json(
    {
      ok: true,
      created: result.created,
      email,
      temporaryPassword: result.temporaryPassword,
      people: await peopleFor(g.db, g.access),
    },
    result.created ? 201 : 200,
  );
}

export const RESET_ALLOW = ["POST"] as const;
export async function handleAccountResetRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, RESET_ALLOW, deps);
  if (g instanceof Response) return g;
  if (!g.access.owner || !g.access.ownerId || g.access.mustChange) return forbiddenResponse();
  const b = await body(request);
  if (b instanceof Response) return b;
  const userId = typeof b.userId === "string" ? b.userId : "";
  if (!userId || userId === g.access.ownerId) return forbiddenResponse();
  const person = await userById(g.db, userId);
  if (!person) return json({ error: "No such person." }, 404);
  const temporary = await resetPassword(g.db, g.access.ownerId, userId);
  await auditFor(g.db, g.access, "access.reset", { target: personTarget(userId, g.access.ownerId) });
  return json({ ok: true, email: person.email, temporaryPassword: temporary });
}

export const AUDIT_ALLOW = ["GET", "HEAD"] as const;
/**
 * `GET /api/account/audit?before=<id>&limit=<1..100>` (#91, AUDIT-07): the audit log, newest first, owner only (and
 * never with a temporary password in place). Masked codes only (attachments/audit-log-design.md section 4).
 */
export async function handleAccountAuditRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, AUDIT_ALLOW, deps);
  if (g instanceof Response) return g;
  if (!g.access.owner || g.access.mustChange) return forbiddenResponse();
  const q = new URL(request.url).searchParams;
  const before = Number(q.get("before") ?? "");
  const limit = Number(q.get("limit") ?? "50");
  return json(
    await listAudit(g.db, {
      before: Number.isInteger(before) ? before : null,
      limit: Number.isFinite(limit) ? limit : 50,
    }),
  );
}

export const ENCRYPTION_ALLOW = ["GET", "HEAD", "POST"] as const;
/**
 * `/api/account/encryption` (#93; attachments/encryption-at-rest-design.md section 6), owner only, `no-store`.
 * GET: per-column counts (current key / old key / unknown key / plaintext) and the key ids; never a value or a key.
 * POST `{ "action": "encrypt" | "reencrypt", "dryRun"?: boolean }`: runs the migration and answers the counts.
 * There is no decrypt over the web (CLI only). 503 `encryption_unavailable` without a valid key.
 */
export async function handleAccountEncryptionRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, ENCRYPTION_ALLOW, deps);
  if (g instanceof Response) return g;
  if (!g.access.owner || g.access.mustChange) return forbiddenResponse();
  const ring = appKeyring(deps.env ?? process.env);
  if (request.method.toUpperCase() !== "POST") return json(await encryptionStatus(g.db, ring));
  const b = await body(request);
  if (b instanceof Response) return b;
  if (b.action !== "encrypt" && b.action !== "reencrypt") return badRequest("action must be encrypt or reencrypt.");
  const result = await migrateColumns(g.db, ring, b.action, { dryRun: b.dryRun === true });
  if (!result.dryRun) await auditFor(g.db, g.access, "account.encryption", { detail: b.action });
  return json({ result, status: await encryptionStatus(g.db, ring) });
}
