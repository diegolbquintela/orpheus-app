import { createFileRoute } from "@tanstack/react-router";
import { handleHoldingRequest } from "@/lib/dashboard/holdings.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/dashboard/holdings/:id (T04 #12): GET, PUT { shares, avgCost }, DELETE one
// of the signed-in user's holdings. Another user's id is 404. Flag off: 404 JSON.
// Other methods: 405 JSON. Signed out: 401 JSON.
const handle = async ({ request, params }: { request: Request; params: { id: string } }) =>
  handleHoldingRequest(request, params.id, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/dashboard/holdings_/$id")({
  server: { handlers: { GET: handle, PUT: handle, DELETE: handle, ANY: handle } },
});
