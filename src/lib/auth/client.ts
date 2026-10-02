import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client (browser-side). Talks to this app's own Better Auth at same-origin
 * `/api/auth/*`; the session is a host-only `__Host-` cookie. Email/password only (D11).
 *
 *   await authClient.signUp.email({ email, password, name });
 *   await authClient.signIn.email({ email, password });
 *   await signOut("/dashboard/sign-in");
 */
export const authClient = createAuthClient();

/**
 * True when the template's signed-in UI (`gates.tsx`, `use-current-user.ts`) should use real
 * sessions: whenever `VITE_AUTH_ENABLED` is not `"false"` at build time. `.grok/app-env.json`
 * sets `"false"` for local runs; a Vercel value wins. The dashboard does not read this: its
 * server gate decides (`src/lib/dashboard/session.server.ts`).
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

/** Sign out of this app's session, then go to `redirectTo`. Rejects if the server never confirms. */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.href = redirectTo;
}
