/**
 * Environment-driven auth settings (pure; no imports, so tests and the server share it).
 * attachments/dashboard-spec.md §3, ticket T03 (#11). Never log a value read here.
 *
 * - Sign-up allow-list (D12, approved): `DASHBOARD_SIGNUP_ALLOWLIST`, a server-only Vercel variable
 *   holding emails separated by commas, semicolons or whitespace. Matching is case-insensitive.
 *   Unset or empty means nobody can sign up (fail closed). Existing users can still sign in.
 * - Origins: production uses `BETTER_AUTH_URL`; previews derive theirs from Vercel's
 *   `VERCEL_URL` / `VERCEL_BRANCH_URL`; local runs use `BETTER_AUTH_URL` or loopback hosts.
 * - Readiness: on Vercel, sign-in needs `BETTER_AUTH_SECRET`, a database URL and an origin.
 *   `VITE_AUTH_ENABLED=false` turns it off everywhere.
 */

type Env = Record<string, string | undefined>;

export const SIGNUP_ALLOWLIST_ENV = "DASHBOARD_SIGNUP_ALLOWLIST";

const value = (env: Env, key: string): string | undefined => {
  const v = env[key]?.trim();
  return v ? v : undefined;
};

/** Lower-cased, trimmed emails from the raw allow-list value. Entries without "@" are dropped. */
export function parseAllowList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

/** Whether `email` may create an account (case-insensitive, surrounding spaces ignored). */
export function isEmailAllowed(email: unknown, allowList: ReadonlySet<string>): boolean {
  return typeof email === "string" && allowList.has(email.trim().toLowerCase());
}

/** The allow-list from the environment. */
export function allowListFromEnv(env: Env = process.env): Set<string> {
  return parseAllowList(env[SIGNUP_ALLOWLIST_ENV]);
}

export type DynamicBaseURL = {
  allowedHosts: string[];
  protocol: "http" | "https" | "auto";
  fallback?: string;
};

export type AuthOrigins = {
  /** undefined: no usable origin (auth is not ready). */
  baseURL: string | DynamicBaseURL | undefined;
  trustedOrigins: string[];
};

/** Local origins (`npm run dev` on 8080, `vite preview` on 8081, any loopback port in tests). */
export const LOCAL_DEV_ORIGINS = [
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:*",
  "http://127.0.0.1:*",
  "http://[::1]:*",
];

const host = (raw: string): string => raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const origin = (raw: string): string => {
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
};

/**
 * Better Auth `baseURL` and `trustedOrigins` for this deployment.
 * - `VERCEL_ENV=production`: `BETTER_AUTH_URL` only (set by an owner at the release go).
 * - `VERCEL_ENV=preview`: exactly this deployment's hosts, `VERCEL_BRANCH_URL` (the branch alias QA
 *   uses) and `VERCEL_URL` (the per-deployment URL), over https. `BETTER_AUTH_URL` is not used here, so
 *   a value set for Preview can't pin every preview to one host.
 * - Anything else (local): `BETTER_AUTH_URL` when set, otherwise loopback hosts.
 */
export function authOrigins(env: Env = process.env): AuthOrigins {
  const explicit = value(env, "BETTER_AUTH_URL");
  const vercelEnv = value(env, "VERCEL_ENV");
  if (vercelEnv === "production") {
    return explicit
      ? { baseURL: origin(explicit), trustedOrigins: [origin(explicit)] }
      : { baseURL: undefined, trustedOrigins: [] };
  }
  if (vercelEnv === "preview") {
    const hosts = [value(env, "VERCEL_BRANCH_URL"), value(env, "VERCEL_URL")]
      .filter((h): h is string => Boolean(h))
      .map(host);
    const unique = [...new Set(hosts)];
    if (unique.length === 0) return { baseURL: undefined, trustedOrigins: [] };
    return {
      baseURL: { allowedHosts: unique, protocol: "https", fallback: `https://${unique[0]}` },
      trustedOrigins: unique.map((h) => `https://${h}`),
    };
  }
  if (explicit) return { baseURL: origin(explicit), trustedOrigins: [origin(explicit), ...LOCAL_DEV_ORIGINS] };
  return {
    baseURL: {
      allowedHosts: ["localhost", "localhost:*", "127.0.0.1", "127.0.0.1:*", "[::1]", "[::1]:*"],
      protocol: "auto",
      fallback: "http://localhost:8080",
    },
    trustedOrigins: [...LOCAL_DEV_ORIGINS],
  };
}

export type AuthReadiness = { ready: true } | { ready: false; reason: string };

/**
 * Whether email/password sign-in can run here. Reasons name variables, never values.
 * `databaseConfigured`: a database URL resolved (scripts/db-env.mjs).
 */
export function authReadiness(env: Env, databaseConfigured: boolean): AuthReadiness {
  if (value(env, "VITE_AUTH_ENABLED") === "false") return { ready: false, reason: "VITE_AUTH_ENABLED=false" };
  if (authOrigins(env).baseURL === undefined)
    return {
      ready: false,
      reason:
        value(env, "VERCEL_ENV") === "production"
          ? "BETTER_AUTH_URL not set"
          : "VERCEL_URL / VERCEL_BRANCH_URL not set",
    };
  // On Vercel, sessions must survive across function instances and data must persist.
  if (value(env, "VERCEL")) {
    if (!value(env, "BETTER_AUTH_SECRET")) return { ready: false, reason: "BETTER_AUTH_SECRET not set" };
    if (!databaseConfigured) return { ready: false, reason: "no database URL set" };
  }
  return { ready: true };
}
