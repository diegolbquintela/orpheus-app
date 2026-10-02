import { createFileRoute } from "@tanstack/react-router";
import { dashboardNotFoundResponse } from "@/lib/dashboard/flag.server";

// Catch-all for /api/dashboard/*: 404 JSON for any path without its own route,
// whether the flag is on or off. Real dashboard API routes are added as their own
// files and start with guardDashboardApi().
const notFound = async () => dashboardNotFoundResponse();

export const Route = createFileRoute("/api/dashboard/$")({
  server: {
    handlers: { GET: notFound, POST: notFound, PUT: notFound, PATCH: notFound, DELETE: notFound },
  },
});
