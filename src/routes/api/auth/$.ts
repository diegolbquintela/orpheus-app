import { createFileRoute } from "@tanstack/react-router";
import { handleAuthRequest } from "@/lib/dashboard/session.server";

// Better Auth at /api/auth/* (email/password, T03 #11), behind DASHBOARD_ENABLED.
// Flag off (production today): 404 JSON for every path and method, and the auth module
// is never loaded. Sign-in not configured on this deployment: 503 JSON.
const handle = async ({ request }: { request: Request }) => handleAuthRequest(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: { GET: handle, POST: handle, ANY: handle },
  },
});
