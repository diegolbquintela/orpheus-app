import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceReportItemRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/personal-finance/reports/:id (#156, personal-finance spec section 38): GET, PUT { name, report }, DELETE one of
// the signed-in person's saved reports (`default` = the #153 single report). Unknown id: 404 JSON. Flag off: 404 JSON.
// Other methods: 405 JSON. Signed out: 401 JSON.
const handle = async ({ request, params }: { request: Request; params: { id: string } }) =>
  handlePersonalFinanceReportItemRequest(request, params.id, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance_/reports_/$id")({
  server: { handlers: { GET: handle, PUT: handle, DELETE: handle, ANY: handle } },
});
