import { createMiddleware } from "@tanstack/react-start";

/**
 * #90 (ROLE-14): the denied page answers HTTP 403. The router picks a page's status itself (200, the 404 or a
 * redirect) and ignores `setResponseStatus` from a loader, so `markDenied` (viewer.server.ts) records 403 on the
 * request and this route middleware carries it onto the rendered page. The body is unchanged (the same stream, its
 * ownership handed over); only the status changes. Used by /personal-finance and /dashboard.
 */
export const deniedStatus = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const { getResponseStatus, transferResponseBodyOwnership } = await import("@tanstack/react-start/server");
  const page = result.response;
  if (getResponseStatus() !== 403 || page.status !== 200 || !page.body) return result;
  return {
    ...result,
    response: transferResponseBodyOwnership(
      page,
      new Response(page.body, { status: 403, statusText: "Forbidden", headers: page.headers }),
    ),
  };
});
