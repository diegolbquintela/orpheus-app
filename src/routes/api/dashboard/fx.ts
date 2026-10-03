import { createFileRoute } from "@tanstack/react-router";
import { handleFxRequest } from "@/lib/dashboard/fx-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// GET /api/dashboard/fx?date=YYYY-MM-DD (T06 #14): stored FX rates for a date (or the previous stored
// date), CAD per unit. Flag off: 404 JSON. Other methods: 405 JSON. Signed out: 401 JSON.
// Logic and tests: src/lib/dashboard/fx-api.server.ts.
const handle = async ({ request }: { request: Request }) =>
  handleFxRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/dashboard/fx")({
  server: { handlers: { GET: handle, ANY: handle } },
});
