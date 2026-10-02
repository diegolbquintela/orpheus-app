import { createFileRoute } from "@tanstack/react-router";
import { handleDashboardDbRequest } from "@/lib/dashboard/db.server";

// GET /api/dashboard/db: preview-only storage status for QA (DASH-03).
// Flag off, or production: 404 JSON for every method. Otherwise GET (and HEAD)
// answer the status JSON; any other method is 405 JSON with Allow: GET, HEAD.
// Logic and tests: src/lib/dashboard/db.server.ts, store.test.ts.
export const Route = createFileRoute("/api/dashboard/db")({
  server: {
    handlers: {
      GET: async ({ request }) => handleDashboardDbRequest(request.method),
      ANY: async ({ request }) => handleDashboardDbRequest(request.method),
    },
  },
});
