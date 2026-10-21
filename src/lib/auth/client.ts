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

/** Sign out of this app's session, then go to `redirectTo`. Rejects if the server never confirms. */
export async function signOut(redirectTo = "/"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Sign-out failed");
  window.location.href = redirectTo;
}
