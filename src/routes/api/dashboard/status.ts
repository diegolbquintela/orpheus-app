import { createFileRoute } from "@tanstack/react-router";
import { guardDashboardApi } from "@/lib/dashboard/flag.server";

// GET /api/dashboard/status: 404 JSON while DASHBOARD_ENABLED is off,
// { dashboard: "enabled" } when on. Lets QA check the API gate on a preview.
export const Route = createFileRoute("/api/dashboard/status")({
  server: {
    handlers: {
      GET: async () =>
        guardDashboardApi() ??
        Response.json({ dashboard: "enabled" }, { headers: { "Cache-Control": "no-store" } }),
    },
  },
});
