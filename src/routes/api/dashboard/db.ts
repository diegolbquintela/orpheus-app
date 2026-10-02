import { createFileRoute } from "@tanstack/react-router";
import { guardDashboardApi } from "@/lib/dashboard/flag.server";

// GET /api/dashboard/db: preview-only storage status for QA (DASH-03).
// 404 JSON while DASHBOARD_ENABLED is off, and on production.
export const Route = createFileRoute("/api/dashboard/db")({
  server: {
    handlers: {
      GET: async () => {
        const blocked = guardDashboardApi();
        if (blocked) return blocked;
        const { checkDashboardDb, getDashboardDb, showDbStatusLine } = await import(
          "@/lib/dashboard/db.server"
        );
        const { dashboardNotFoundResponse } = await import("@/lib/dashboard/flag.server");
        if (!showDbStatusLine()) return dashboardNotFoundResponse();
        const status = await checkDashboardDb(await getDashboardDb());
        return Response.json(status, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
