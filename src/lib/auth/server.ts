/**
 * This app's Better Auth (server-only), mounted at `/api/auth/*` by `src/routes/api/auth/$.ts`.
 * attachments/dashboard-spec.md §3, ticket T03 (#11).
 *
 * - Email/password only (D11). Sign-up is limited to `DASHBOARD_SIGNUP_ALLOWLIST` (D12).
 * - Database: the shared resolver (`scripts/db-env.mjs`): `DATABASE_URL`, else the Neon integration's
 *   `orpheus_app_preview_DATABASE_URL`. Without one (local runs only) it uses the app's embedded
 *   PGLite, which applies the same `migrations/*.sql`, including `0001_auth.sql`.
 * - Origins: `./config.ts` (`BETTER_AUTH_URL` on production; `VERCEL_URL` / `VERCEL_BRANCH_URL` on
 *   previews; loopback locally).
 * - Secret: `BETTER_AUTH_SECRET` (Vercel). Locally, without it, a random per-process secret.
 * - `authConfigured` is false when something required is missing (see `authReadiness`); the auth
 *   route then answers 503 JSON and the dashboard treats everyone as signed out.
 *
 * NEVER import this from client code (it pulls in `pg` and the secret). The client uses
 * `./client`; dashboard server code goes through `./verify.server`.
 */
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "../../../scripts/db-env.mjs";
import { allowListFromEnv, authOrigins, authReadiness } from "./config";
import { emailAndPasswordEnabled } from "./email-password";
import { createOrpheusAuth } from "./instance.server";
import { pgliteDialect } from "./pglite-dialect";

export { SESSION_TOKEN_COOKIE } from "./instance.server";

const databaseUrl = resolveDatabaseUrl(process.env)?.url;

const readiness = authReadiness(process.env, Boolean(databaseUrl));

/** True when email/password sign-in can run on this deployment. */
export const authConfigured = emailAndPasswordEnabled && readiness.ready;

/** Why sign-in is off (variable names only, never values), or null when it is on. */
export const authNotReadyReason: string | null = !emailAndPasswordEnabled
  ? "email/password disabled"
  : readiness.ready
    ? null
    : readiness.reason;

// Local only: the secret must outlive HMR re-evaluation (PGLite sessions live on globalThis too).
const globalAuthRef = globalThis as typeof globalThis & { __orpheusLocalAuthSecret__?: string };
function localAuthSecret(): string {
  globalAuthRef.__orpheusLocalAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__orpheusLocalAuthSecret__;
}

const origins = authOrigins(process.env);

export const auth = createOrpheusAuth({
  database: databaseUrl
    ? new Pool({ connectionString: databaseUrl })
    : // Local only. Loaded on first query, so a deployment where sign-in is off never boots PGLite.
      { dialect: pgliteDialect(async () => (await import("../db")).getPglite()), type: "postgres" },
  secret: process.env.BETTER_AUTH_SECRET?.trim() || localAuthSecret(),
  // Unused when not ready (the route answers 503 first); a loopback value keeps construction valid.
  baseURL: origins.baseURL ?? "http://localhost:8080",
  trustedOrigins: origins.trustedOrigins,
  allowList: allowListFromEnv(process.env),
  // Bridges Better Auth's Set-Cookie into TanStack Start server functions. Must stay last.
  plugins: [tanstackStartCookies()],
});
