import { createFileRoute } from "@tanstack/react-router";
import { dashboardUnsupportedMethod, guardDashboardApi } from "@/lib/dashboard/flag.server";

// GET /api/dashboard/status: 404 JSON while DASHBOARD_ENABLED is off,
// { dashboard: "enabled" } when on. Lets QA check the API gate on a preview.
// HEAD is served by GET. Any other method: 404 JSON when off, 405 JSON
// (Allow: GET, HEAD) when on; never the HTML app shell.
export const STATUS_ALLOW = ["GET", "HEAD"] as const;

export const Route = createFileRoute("/api/dashboard/status")({
  server: {
    handlers: {
      GET: async () =>
        guardDashboardApi() ??
        Response.json({ dashboard: "enabled" }, { headers: { "Cache-Control": "no-store" } }),
      ANY: async () => dashboardUnsupportedMethod(STATUS_ALLOW),
    },
  },
});
