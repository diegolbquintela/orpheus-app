/**
 * Leftovers of the Grok template's shared LIVE-PREVIEW OAuth client (server-only).
 *
 * The Grok sandbox served previews on `https://*.grok-sandbox.com` and this file
 * used to bake in a shared preview client secret so those previews could sign in.
 * Grok hosting no longer deploys this app (Vercel does), so that fallback secret
 * was removed: no client secret lives in the repo. Federated sign-in is only
 * active when the deployer injects a per-app client secret (see `server.ts`);
 * otherwise auth stays off, as it is on Vercel today.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
