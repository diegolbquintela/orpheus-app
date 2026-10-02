import { createFileRoute } from "@tanstack/react-router";
import {
  handleDashboardSettingsRequest,
  sessionFromRequestHeaders,
} from "@/lib/dashboard/session.server";

// /api/dashboard/settings: the signed-in user's own settings (T03 #11, for DASH-06).
// Flag off: 404 JSON. GET/PUT only (else 405 JSON). Signed out: 401 JSON.
// Naming another user's id (?userId= or body userId): 403 JSON.
const handle = async ({ request }: { request: Request }) =>
  handleDashboardSettingsRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/dashboard/settings")({
  server: { handlers: { GET: handle, PUT: handle, ANY: handle } },
});
