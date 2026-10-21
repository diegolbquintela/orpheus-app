import { auth, authConfigured } from "./server";

/**
 * Server-side session resolution (server-only).
 *
 * Better Auth runs at same-origin `/api/auth/*`, so the session cookie rides along with every
 * request to this app: server functions, SSR loaders and API routes. Every gate calls
 * `getSessionUserFromHeaders` (#186 removed the unused template server-fn path). The user comes only from
 * `auth.api.getSession` on those cookies. Never trust a client-supplied user id.
 */

/** Re-export so callers can branch on it without importing `server.ts`. */
export { authConfigured };

export type VerifiedUser = { id: string; email: string | null; sessionId?: string | null };

/** The signed-in user for these request headers, or null (signed out, or auth not configured). */
export async function getSessionUserFromHeaders(headers: Headers): Promise<VerifiedUser | null> {
  if (!authConfigured) return null;
  // #90: always read the session from the database (never the 5-minute signed cookie cache), so a revoked session
  // (Remove, Reset password, a password or email change elsewhere) stops working on the next request (ROLE-16).
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null, sessionId: session.session?.id ?? null };
}
