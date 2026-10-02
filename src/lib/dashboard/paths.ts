/**
 * Path helpers for the dashboard flag gate. No server imports: router.tsx and
 * tests use these on both sides.
 */

/** Page paths the dashboard owns: `/dashboard` and anything under it. */
export function isDashboardPagePath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

/**
 * A path no route matches. While the flag is off the server router reads
 * `/dashboard…` as this path, so it renders the app's ordinary 404, the same
 * page as any other unknown URL: no dashboard match, head, chunk or copy.
 */
export const DASHBOARD_OFF_PATH = "/__not-found";

/**
 * Router `rewrite` pair for the server (one per router, i.e. per request).
 * `input` maps dashboard page paths to DASHBOARD_OFF_PATH while the flag is off
 * and leaves every other URL alone. `output` maps that path back to the URL the
 * browser asked for, so the router keeps the public URL (no redirect to
 * DASHBOARD_OFF_PATH) and the response is a plain 404 at `/dashboard…`.
 */
export function dashboardOffRewrite(enabled: boolean) {
  let original: string | undefined;
  return {
    input: ({ url }: { url: URL }): URL | undefined => {
      if (enabled || !isDashboardPagePath(url.pathname)) return undefined;
      // Remember the path without its trailing slash; keep the slash on the
      // rewritten path so trailing-slash handling matches any unknown URL.
      original = url.pathname.replace(/\/+$/, "");
      const next = new URL(url.href);
      next.pathname = url.pathname.endsWith("/") ? `${DASHBOARD_OFF_PATH}/` : DASHBOARD_OFF_PATH;
      return next;
    },
    output: ({ url }: { url: URL }): URL | undefined => {
      if (original === undefined) return undefined;
      if (url.pathname !== DASHBOARD_OFF_PATH && url.pathname !== `${DASHBOARD_OFF_PATH}/`)
        return undefined;
      const next = new URL(url.href);
      next.pathname = url.pathname.endsWith("/") ? `${original}/` : original;
      return next;
    },
  };
}
