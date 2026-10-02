import { createFileRoute } from "@tanstack/react-router";
import { handleHoldingsRequest } from "@/lib/dashboard/holdings.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/dashboard/holdings (T04 #12): GET the signed-in user's holdings, POST
// { symbol, shares, avgCost } to add one. Flag off: 404 JSON. Other methods:
// 405 JSON. Signed out: 401 JSON. Logic and tests: src/lib/dashboard/holdings.server.ts.
const handle = async ({ request }: { request: Request }) =>
  handleHoldingsRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/dashboard/holdings")({
  server: { handlers: { GET: handle, POST: handle, ANY: handle } },
});
