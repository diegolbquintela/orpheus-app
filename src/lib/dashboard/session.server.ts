/**
 * Dashboard sessions and per-user API handlers (server-only). Spec §3/§5, ticket T03 (#11).
 *
 * - Every per-user dashboard API answers, in this order: 404 JSON when DASHBOARD_ENABLED is off;
 *   405 JSON for a method it does not serve; **401 JSON** without a valid session; then the
 *   signed-in user's own data only. The user id comes from the session cookie, never the client.
 *   A request naming another user's id gets **403 JSON**.
 * - The dashboard never uses the template's shared dev user: no session means 401.
 * - Handlers take their dependencies (env, session lookup, database) as arguments so the offline
 *   tests (`src/lib/auth/auth.test.ts`) run them against a real Better Auth instance on PGLite.
 */
import {
  dashboardMethodNotAllowedResponse,
  dashboardNotFoundResponse,
  guardDashboardApi,
} from "./flag.server.ts";
import { allowListFromEnv, authReadiness } from "../auth/config.ts";
import { resolveDatabaseUrl } from "../../../scripts/db-env.mjs";
import { encryptionReadiness } from "../crypto/keys.server.ts";
import { accessOf, surfaceAccess, type AccountAccess, type SurfaceAccess } from "../access/access.server.ts";
import type { Surface } from "../access/access.ts";
import {
  BASE_CURRENCIES,
  getUserSettings,
  setBaseCurrency,
  type BaseCurrency,
  type Queryable,
} from "./store.server.ts";

type Env = Record<string, string | undefined>;

export type DashboardUser = { id: string; email: string | null; sessionId?: string | null };
export type SessionLookup = (headers: Headers) => Promise<DashboardUser | null>;

export type DashboardApiDeps = {
  env?: Env;
  getUser: SessionLookup;
  getDb?: (env: Env) => Promise<Queryable | null>;
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", ...headers },
  });

export const dashboardJson = json;
export const unauthorizedResponse = () => json({ error: "Unauthorized." }, 401);
export const forbiddenResponse = () => json({ error: "Forbidden." }, 403);
export const storageUnavailable = () => json({ error: "Storage not configured." }, 503);
/** #93: the encryption key is missing or malformed here (design section 7). */
export const encryptionUnavailable = () => json({ error: "encryption_unavailable" }, 503);
export const badRequest = (error: string) => json({ error }, 400);

/** Methods `/api/dashboard/me` serves (HEAD answered by GET). */
export const ME_ALLOW = ["GET", "HEAD"] as const;
/** Methods `/api/dashboard/settings` serves. */
export const SETTINGS_ALLOW = ["GET", "HEAD", "PUT"] as const;

/** #90: the reply while a temporary password is still in place (ROLE-08). */
export const mustChangeResponse = () => json({ error: "Change your password first." }, 403);

export type GateOptions = {
  /** Which surface's grant applies (default the Dashboard). */
  surface?: Surface;
  /** `read` / `write` (default: GET / HEAD read, anything else write); `signed_in`: any signed-in person. */
  need?: "read" | "write" | "signed_in";
  /** Checks that need no database (e.g. a malformed query): answered after 401, before any database access. */
  precheck?: () => Response | null;
};

export type GateOk = {
  /** Whose data the request reads and writes: the owner (#90 Q-D1). */
  user: DashboardUser;
  /** Who is asking (the session's user). */
  viewer: DashboardUser;
  access: AccountAccess;
  surface: SurfaceAccess;
  db: Queryable;
};

/**
 * Flag, method, session and (#90) access checks shared by every per-user route, in that order: 404 flag off; 405;
 * 401 signed out; 503 no database; 403 while a temporary password is in place, without a read grant on the
 * surface, or without a write grant for a writing method. `user` is then the owner (the data), `viewer` the person.
 */
export async function gateDashboardRequest(
  request: Request,
  allow: readonly string[],
  deps: DashboardApiDeps,
  opts: GateOptions = {},
): Promise<{ response: Response } | GateOk> {
  const env = deps.env ?? process.env;
  const blocked = guardDashboardApi(env);
  if (blocked) return { response: blocked };
  const method = request.method.toUpperCase();
  if (!allow.includes(method)) return { response: dashboardMethodNotAllowedResponse(allow) };
  // #93 (ENC-05): no key, no sensitive read or write (fail closed; the reason names variables only, in the log).
  const enc = encryptionReadiness(env);
  if (!enc.ready) {
    console.error(`[encryption] unavailable: ${enc.reason}`);
    return { response: encryptionUnavailable() };
  }
  const viewer = await deps.getUser(request.headers);
  if (!viewer) return { response: unauthorizedResponse() };
  const early = opts.precheck?.();
  if (early) return { response: early };
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return { response: storageUnavailable() };
  const access = await accessOf(db, viewer, env);
  const surface = surfaceAccess(access, opts.surface ?? "dashboard");
  const need = opts.need ?? (method === "GET" || method === "HEAD" ? "read" : "write");
  if (need !== "signed_in") {
    if (access.mustChange) return { response: mustChangeResponse() };
    if (!surface.read || (need === "write" && !surface.write) || !surface.dataUserId) {
      // #91 AUDIT-06: a grant refusal is worth seeing in the audit log (masked; the surface and method only).
      const { auditFor, deniedDetail } = await import("../access/audit.server.ts");
      const s = opts.surface ?? "dashboard";
      await auditFor(db, access, "access.denied", { outcome: "denied", detail: deniedDetail(s, method) });
      return { response: forbiddenResponse() };
    }
  }
  const user = { id: surface.dataUserId ?? viewer.id, email: access.owner ? viewer.email : null };
  return { user, viewer, access, surface, db };
}

/** `GET /api/dashboard/me`: the signed-in person's id and email, and (#90) their access. Any signed-in person. */
export async function handleDashboardMeRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, ME_ALLOW, deps, { need: "signed_in" });
  if ("response" in g) return g.response;
  return json({
    user: { id: g.viewer.id, email: g.viewer.email },
    access: { owner: g.access.owner, mustChange: g.access.mustChange, ...g.access.grants },
  });
}

/** A client-named user id that isn't the session's: true means answer 403. */
export function namesOtherUser(claimed: unknown, user: DashboardUser, viewer?: DashboardUser): boolean {
  // #90: naming yourself or the owner whose data you see is fine; anyone else is 403 (no widening).
  return claimed !== undefined && claimed !== null && claimed !== user.id && claimed !== viewer?.id;
}

/**
 * `/api/dashboard/settings`: the signed-in user's own settings (`base_currency`, spec §5).
 * - GET: `{ settings: { baseCurrency } }` (CAD until saved).
 * - PUT `{ "baseCurrency": "CAD" | "USD" | "EUR" }`: saves and returns the settings.
 * - `?userId=` / a body `userId` naming anyone else: 403. The session decides whose row it is.
 * The base-currency UI is T06 (#14); this route exists so DASH-06 isolation can be checked now.
 */
export async function handleDashboardSettingsRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gateDashboardRequest(request, SETTINGS_ALLOW, deps);
  if ("response" in g) return g.response;
  const { user } = g;
  if (namesOtherUser(new URL(request.url).searchParams.get("userId") ?? undefined, user))
    return forbiddenResponse();
  let body: { baseCurrency?: unknown; userId?: unknown } | undefined;
  if (request.method.toUpperCase() === "PUT") {
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return badRequest("Body must be JSON.");
    }
    if (!body || typeof body !== "object") return badRequest("Body must be a JSON object.");
    if (namesOtherUser(body.userId, user)) return forbiddenResponse();
    if (!BASE_CURRENCIES.includes(body.baseCurrency as BaseCurrency))
      return badRequest("baseCurrency must be CAD, USD or EUR.");
  }
  const env = deps.env ?? process.env;
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return storageUnavailable();
  const settings = body
    ? await setBaseCurrency(db, user.id, body.baseCurrency as BaseCurrency)
    : await getUserSettings(db, user.id);
  if (body) {
    const { auditFor } = await import("../access/audit.server.ts");
    await auditFor(g.db, g.access, "dash.settings");
  }
  return json({ settings: { baseCurrency: settings.baseCurrency } });
}

export async function defaultGetDb(env: Env) {
  const { getDashboardDb } = await import("./db.server.ts");
  return getDashboardDb(env);
}

/** Session lookup used by the routes: Better Auth on the request cookies. */
export const sessionFromRequestHeaders: SessionLookup = async (headers) => {
  const { getSessionUserFromHeaders } = await import("@/lib/auth/verify.server");
  return getSessionUserFromHeaders(headers);
};

export type AuthModule = {
  authConfigured: boolean;
  authNotReadyReason: string | null;
  auth: { handler: (request: Request) => Promise<Response> };
};

/**
 * `/api/auth/*` (Better Auth), behind the dashboard flag:
 * - flag off: 404 JSON for every path and method (production today);
 * - sign-in not configured here: 503 JSON, and the reason (variable names only) in the server log;
 * - otherwise Better Auth answers.
 */
export async function handleAuthRequest(
  request: Request,
  env: Env = process.env,
  load: () => Promise<AuthModule> = () => import("@/lib/auth/server"),
  getDb: (env: Env) => Promise<Queryable | null> = defaultGetDb,
  getUser: SessionLookup = sessionFromRequestHeaders,
): Promise<Response> {
  if (guardDashboardApi(env)) return dashboardNotFoundResponse();
  const mod = await load();
  if (!mod.authConfigured) {
    console.error(`[auth] sign-in unavailable: ${mod.authNotReadyReason ?? "unknown"}`);
    return json({ error: "Sign-in is not configured on this deployment." }, 503);
  }
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  const signIn = method === "POST" && path.endsWith("/sign-in/email");
  const signOut = method === "POST" && path.endsWith("/sign-out");
  if (!signIn && !signOut) return mod.auth.handler(request);
  // #91: sign-in / sign-out in the audit log (masked; the typed email is never stored).
  const before = signOut ? await getUser(request.headers).catch(() => null) : null;
  const response = await mod.auth.handler(request);
  try {
    await auditAuth(response, env, signIn, before, getDb);
  } catch {
    console.error("[audit] could not record an auth event");
  }
  return response;
}

async function auditAuth(
  response: Response,
  env: Env,
  signIn: boolean,
  before: DashboardUser | null,
  getDb: (env: Env) => Promise<Queryable | null>,
) {
  const { recordAudit, auditFor } = await import("../access/audit.server.ts");
  const db = await getDb(env);
  if (!db) return;
  if (!signIn) {
    if (before && response.ok) await auditFor(db, await accessOf(db, before, env), "auth.sign_out");
    return;
  }
  if (response.status === 429 || response.status >= 500) return;
  if (!response.ok) {
    await recordAudit(db, { actor: "anonymous", role: "anonymous", action: "auth.sign_in", outcome: "failed" });
    return;
  }
  const body = (await response.clone().json().catch(() => null)) as { user?: { id?: string; email?: string } } | null;
  const id = body?.user?.id;
  if (!id) return;
  await auditFor(db, await accessOf(db, { id, email: body?.user?.email ?? null }, env), "auth.sign_in");
}

/** What `/dashboard` pages need to know about the visitor. */
export type DashboardViewer = { authReady: boolean; user: DashboardUser | null };

export async function dashboardViewer(headers: Headers): Promise<DashboardViewer> {
  const { authConfigured } = await import("@/lib/auth/server");
  if (!authConfigured) return { authReady: false, user: null };
  return { authReady: true, user: await sessionFromRequestHeaders(headers) };
}

/**
 * Preview-only sign-in diagnostics for `GET /api/dashboard/status` (never on production): whether
 * sign-in can run and, if not, which variable is missing; whether the allow-list has any entry.
 * Names and states only, never values (the allow-list's emails are not shown or counted).
 */
export function dashboardAuthDiagnostics(env: Env = process.env): {
  signIn: string;
  signUpAllowList: "set" | "empty";
} {
  const readiness = authReadiness(env, Boolean(resolveDatabaseUrl(env)));
  return {
    signIn: readiness.ready ? "ready" : `not configured (${readiness.reason})`,
    signUpAllowList: allowListFromEnv(env).size > 0 ? "set" : "empty",
  };
}
