/**
 * Builds this app's Better Auth instance: email/password only, sign-up limited to the allow-list
 * (D12, approved). attachments/dashboard-spec.md §3, ticket T03 (#11). Server-only.
 *
 * Kept free of TanStack and `@/` imports so the offline tests (`auth.test.ts`, PGLite) build the
 * same configuration the app runs. `server.ts` adds the database, secret, origins and the TanStack
 * cookie bridge.
 */
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { isEmailAllowed, type DynamicBaseURL } from "./config.ts";

/** Session cookie name (host-only `__Host-` cookie; see `advanced.cookies` below). */
export const SESSION_TOKEN_COOKIE = "__Host-orpheus-auth.session_token";

/** Shown when an email outside the allow-list tries to sign up. Says nothing about the list. */
export const SIGNUP_NOT_ALLOWED_MESSAGE = "Sign-up is limited to invited email addresses.";

export type OrpheusAuthOptions = {
  database: BetterAuthOptions["database"];
  secret: string;
  baseURL: string | DynamicBaseURL;
  trustedOrigins: string[];
  /** Lower-cased emails allowed to create an account (empty: nobody). */
  allowList: ReadonlySet<string>;
  plugins?: BetterAuthPlugin[];
};

const notAllowed = () => new APIError("FORBIDDEN", { message: SIGNUP_NOT_ALLOWED_MESSAGE });

export function createOrpheusAuth(opts: OrpheusAuthOptions) {
  return betterAuth({
    baseURL: opts.baseURL,
    secret: opts.secret,
    database: opts.database,
    // CSRF / origin check for credentialed POSTs (sign-up, sign-in, sign-out).
    trustedOrigins: opts.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      // No email sender is configured (spec §3): no verification mail, no reset mail.
      requireEmailVerification: false,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    // Short signed cache so page loads skip a DB round trip; sign-out clears it.
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    hooks: {
      // Refuse non-allow-listed sign-ups before anything else runs, so the answer is the same
      // whether or not an account with that email exists.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (!isEmailAllowed(email, opts.allowList)) throw notAllowed();
      }),
    },
    databaseHooks: {
      // Defence in depth: no code path may create a user outside the allow-list.
      user: {
        create: {
          before: async (user) => {
            if (!isEmailAllowed(user.email, opts.allowList)) throw notAllowed();
            return { data: user };
          },
        },
      },
    },
    // `__Host-` cookies: Secure, Path=/, no Domain, so no other site can plant or read them.
    // Browsers accept Secure cookies on http://localhost, so local dev still works.
    advanced: {
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
      cookies: {
        session_token: { name: SESSION_TOKEN_COOKIE },
        session_data: { name: "__Host-orpheus-auth.session_data" },
        dont_remember: { name: "__Host-orpheus-auth.dont_remember" },
      },
    },
    plugins: opts.plugins ?? [],
  });
}

export type OrpheusAuth = ReturnType<typeof createOrpheusAuth>;
