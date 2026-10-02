import { getRequest } from "@tanstack/react-start/server";
import { resolveDatabaseUrl } from "../../../scripts/db-env.mjs";
import { auth, authConfigured } from "./server";

/**
 * Server-side session resolution (server-only).
 *
 * Better Auth runs at same-origin `/api/auth/*`, so the session cookie rides along with every
 * request to this app: server functions, SSR loaders and API routes. The user comes only from
 * `auth.api.getSession` on those cookies. Never trust a client-supplied user id.
 */

/** True when a database URL resolves (`DATABASE_URL`, else `orpheus_app_preview_DATABASE_URL`). */
const databaseConfigured = Boolean(resolveDatabaseUrl(process.env));

/** Re-export so callers can branch on it without importing `server.ts`. */
export { authConfigured };

/** Dev fallback user id, used only when auth is off and no database is configured. */
export const DEV_USER_ID = "dev-user";

/**
 * Thrown by `requireUserId` when the caller has no valid session. Carries `status: 401`; the
 * message is a stable contract (`err.message === "Unauthorized"`).
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/** The signed-in user for these request headers, or null (signed out, or auth not configured). */
export async function getSessionUserFromHeaders(headers: Headers): Promise<VerifiedUser | null> {
  if (!authConfigured) return null;
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/** The signed-in user for the current request, or null. Safe in server functions and loaders. */
export async function getSessionUser(): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  return getSessionUserFromHeaders(request.headers);
}

/**
 * The current user id for a server function, or throw. Prefer `authMiddleware` (`./middleware`).
 * - Auth configured: the verified session user id; `UnauthorizedError` when signed out.
 * - Auth not configured + a database URL: throw (fail closed). One shared dev user on a real
 *   database would let every visitor read and write everyone's rows.
 * - Auth not configured + no database: the shared dev user (local template mode only).
 *
 * Dashboard code never takes the dev-user path: it uses `getSessionUserFromHeaders` and answers
 * 401 without a session (`src/lib/dashboard/session.server.ts`).
 */
export async function requireUserId(): Promise<string> {
  if (!authConfigured) {
    if (databaseConfigured) {
      throw new Error(
        "Auth is not configured but a database URL is set; refusing to fall back to the shared " +
          "dev user against a real database.",
      );
    }
    return DEV_USER_ID;
  }
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
