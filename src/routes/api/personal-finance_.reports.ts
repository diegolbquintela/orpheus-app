import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceReportsRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/personal-finance/reports (#156, personal-finance spec section 38): GET lists the signed-in person's saved
// reports; POST { name, report } creates one. Needs a Personal Finance read grant. Flag off: 404 JSON. Other methods:
// 405 JSON. Signed out: 401 JSON.
const handle = async ({ request }: { request: Request }) =>
  handlePersonalFinanceReportsRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance_/reports")({
  server: { handlers: { GET: handle, POST: handle, ANY: handle } },
});
