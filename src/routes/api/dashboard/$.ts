import { createFileRoute } from "@tanstack/react-router";
import { dashboardNotFoundResponse } from "@/lib/dashboard/flag.server";

// Catch-all for /api/dashboard/*: 404 JSON for any path without its own route and
// for every method (ANY; HEAD falls back to GET), whether the flag is on or off.
// Real dashboard API routes are added as their own files, start with
// guardDashboardApi() and add an ANY handler (dashboardUnsupportedMethod).
const notFound = async () => dashboardNotFoundResponse();

export const Route = createFileRoute("/api/dashboard/$")({
  server: {
    handlers: { GET: notFound, ANY: notFound },
  },
});
