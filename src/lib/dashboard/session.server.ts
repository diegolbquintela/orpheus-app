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
import {
  BASE_CURRENCIES,
  getUserSettings,
  setBaseCurrency,
  type BaseCurrency,
  type Queryable,
} from "./store.server.ts";

type Env = Record<string, string | undefined>;

export type DashboardUser = { id: string; email: string | null };
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

export const unauthorizedResponse = () => json({ error: "Unauthorized." }, 401);
export const forbiddenResponse = () => json({ error: "Forbidden." }, 403);
const storageUnavailable = () => json({ error: "Storage not configured." }, 503);
const badRequest = (error: string) => json({ error }, 400);

/** Methods `/api/dashboard/me` serves (HEAD answered by GET). */
export const ME_ALLOW = ["GET", "HEAD"] as const;
/** Methods `/api/dashboard/settings` serves. */
export const SETTINGS_ALLOW = ["GET", "HEAD", "PUT"] as const;

/** Flag, method and session checks shared by every per-user route. */
async function gate(
  request: Request,
  allow: readonly string[],
  deps: DashboardApiDeps,
): Promise<{ response: Response } | { user: DashboardUser }> {
  const env = deps.env ?? process.env;
  const blocked = guardDashboardApi(env);
  if (blocked) return { response: blocked };
  if (!allow.includes(request.method.toUpperCase()))
    return { response: dashboardMethodNotAllowedResponse(allow) };
  const user = await deps.getUser(request.headers);
  if (!user) return { response: unauthorizedResponse() };
  return { user };
}

/** `GET /api/dashboard/me`: the signed-in user's id and email. */
export async function handleDashboardMeRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, ME_ALLOW, deps);
  if ("response" in g) return g.response;
  return json({ user: { id: g.user.id, email: g.user.email } });
}

/** A client-named user id that isn't the session's: true means answer 403. */
function namesOtherUser(claimed: unknown, user: DashboardUser): boolean {
  return claimed !== undefined && claimed !== null && claimed !== user.id;
}

/**
 * `/api/dashboard/settings`: the signed-in user's own settings (`base_currency`, spec §5).
 * - GET: `{ settings: { baseCurrency } }` (CAD until saved).
 * - PUT `{ "baseCurrency": "CAD" | "USD" | "EUR" }`: saves and returns the settings.
 * - `?userId=` / a body `userId` naming anyone else: 403. The session decides whose row it is.
 * The base-currency UI is T06 (#14); this route exists so DASH-06 isolation can be checked now.
 */
export async function handleDashboardSettingsRequest(request: Request, deps: DashboardApiDeps) {
  const g = await gate(request, SETTINGS_ALLOW, deps);
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
  return json({ settings: { baseCurrency: settings.baseCurrency } });
}

async function defaultGetDb(env: Env) {
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
): Promise<Response> {
  if (guardDashboardApi(env)) return dashboardNotFoundResponse();
  const mod = await load();
  if (!mod.authConfigured) {
    console.error(`[auth] sign-in unavailable: ${mod.authNotReadyReason ?? "unknown"}`);
    return json({ error: "Sign-in is not configured on this deployment." }, 503);
  }
  return mod.auth.handler(request);
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
