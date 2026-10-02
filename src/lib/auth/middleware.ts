import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware for server functions: the standard way to get the caller's verified user id.
 * The session cookie is same-origin and rides along automatically.
 *
 *   export const listThings = createServerFn({ method: "GET" })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => { ... scope every query by context.userId ... });
 *
 * Signed out with auth configured -> throws `UnauthorizedError` (see `verify.server.ts`). Without
 * auth it resolves the shared dev user only when no database is configured, and throws otherwise.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // ONLY import `*.server` modules here, so Vite never ships server code to the browser.
  const { assertSameSiteRequest } = await import("./isolation.server");
  const { requireUserId } = await import("./verify.server");
  // Reject scripted cross-site requests before touching per-user data.
  assertSameSiteRequest();
  const userId = await requireUserId();
  return next({ context: { userId } });
});
