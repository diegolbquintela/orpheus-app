import { createFileRoute } from "@tanstack/react-router";
import {
  handleDashboardMeRequest,
  sessionFromRequestHeaders,
} from "@/lib/dashboard/session.server";

// GET /api/dashboard/me: the signed-in user's id and email (T03 #11).
// Flag off: 404 JSON. Other methods: 405 JSON (Allow: GET, HEAD). Signed out: 401 JSON.
const handle = async ({ request }: { request: Request }) =>
  handleDashboardMeRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/dashboard/me")({
  server: { handlers: { GET: handle, ANY: handle } },
});
