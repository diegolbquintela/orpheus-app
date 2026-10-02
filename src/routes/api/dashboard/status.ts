import { createFileRoute } from "@tanstack/react-router";
import { showDbStatusLine } from "@/lib/dashboard/db.server";
import { dashboardUnsupportedMethod, guardDashboardApi } from "@/lib/dashboard/flag.server";
import { dashboardAuthDiagnostics } from "@/lib/dashboard/session.server";

// GET /api/dashboard/status: 404 JSON while DASHBOARD_ENABLED is off,
// { dashboard: "enabled" } when on. Lets QA check the API gate on a preview.
// Off production it adds sign-in diagnostics (T03): { signIn: "ready" | "not configured (<variable>)",
// signUpAllowList: "set" | "empty" }, and (T05) cronSecret: "set" | "empty". Names and states only,
// never values.
// HEAD is served by GET. Any other method: 404 JSON when off, 405 JSON
// (Allow: GET, HEAD) when on; never the HTML app shell.
export const STATUS_ALLOW = ["GET", "HEAD"] as const;

export const Route = createFileRoute("/api/dashboard/status")({
  server: {
    handlers: {
      GET: async () =>
        guardDashboardApi() ??
        Response.json(
          {
            dashboard: "enabled",
            ...(showDbStatusLine()
              ? { ...dashboardAuthDiagnostics(), cronSecret: process.env.CRON_SECRET ? "set" : "empty" }
              : {}),
          },
          { headers: { "Cache-Control": "no-store" } },
        ),
      ANY: async () => dashboardUnsupportedMethod(STATUS_ALLOW),
    },
  },
});
