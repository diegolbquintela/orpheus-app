import { createFileRoute } from "@tanstack/react-router";
import { handleColumnsRequest } from "@/lib/dashboard/columns-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/dashboard/columns (T08 #16, DASH-15): the signed-in user's metric columns in display order.
// GET; PUT { columns: [...metric keys] } replaces the list. Flag off: 404 JSON. Other methods: 405 JSON.
// Signed out: 401 JSON. Naming another user's id: 403 JSON. Logic: src/lib/dashboard/columns-api.server.ts.
const handle = async ({ request }: { request: Request }) =>
  handleColumnsRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/dashboard/columns")({
  server: { handlers: { GET: handle, PUT: handle, ANY: handle } },
});
