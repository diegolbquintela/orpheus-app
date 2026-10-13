import { createFileRoute } from "@tanstack/react-router";
import { handleCompanyRequest } from "@/lib/dashboard/company-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/dashboard/company/:symbol (#95): one held company's view (database only). Logic and gate order in
// src/lib/dashboard/company-api.server.ts.
const handle = async ({ request, params }: { request: Request; params: { symbol: string } }) =>
  handleCompanyRequest(request, { getUser: sessionFromRequestHeaders }, params.symbol);

export const Route = createFileRoute("/api/dashboard/company/$symbol")({
  server: { handlers: { GET: handle, ANY: handle } },
});
