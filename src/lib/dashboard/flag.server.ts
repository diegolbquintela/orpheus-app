/**
 * DASHBOARD_ENABLED: the server-only flag every dashboard ticket ships behind
 * (attachments/dashboard-spec.md §2).
 *
 * - Read on the server only. Never prefix it with VITE_ (that would inline it
 *   into the client bundle, which is not a gate).
 * - Only the exact string "true" turns the dashboard on. Anything else, including
 *   no value at all, " true" or "TRUE", is off (fail closed).
 * - When off, `/dashboard` and every `/api/dashboard/*` route answer 404.
 *
 * Every future dashboard route, server function and API route reuses these helpers.
 */

export const DASHBOARD_FLAG = "DASHBOARD_ENABLED";

type Env = Record<string, string | undefined>;

/** Parse a raw flag value: only the exact string "true" enables. */
export function isDashboardEnabled(value: string | null | undefined): boolean {
  return value === "true";
}

/** Read the flag from the server environment (default: process.env). */
export function dashboardEnabledFromEnv(env: Env = process.env): boolean {
  return isDashboardEnabled(env[DASHBOARD_FLAG]);
}

/** The 404 JSON every dashboard API route returns while the flag is off. */
export function dashboardNotFoundResponse(): Response {
  return Response.json(
    { error: "Not found." },
    { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}

/** The 405 JSON a dashboard API route returns for a method it does not serve (flag on). */
export function dashboardMethodNotAllowedResponse(allow: readonly string[]): Response {
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: {
        Allow: allow.join(", "),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

/**
 * `ANY` handler for a dashboard API route: answers every method the route does not
 * serve with JSON, never the HTML app shell. Flag off: the same 404 as everything
 * else (the route does not exist). Flag on: 405 with an `Allow` header.
 */
export function dashboardUnsupportedMethod(
  allow: readonly string[],
  env: Env = process.env,
): Response {
  return guardDashboardApi(env) ?? dashboardMethodNotAllowedResponse(allow);
}

/**
 * Guard for dashboard API handlers: returns the 404 response when the flag is off,
 * or null when the handler may continue.
 */
export function guardDashboardApi(env: Env = process.env): Response | null {
  return dashboardEnabledFromEnv(env) ? null : dashboardNotFoundResponse();
}
