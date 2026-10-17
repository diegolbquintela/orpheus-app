import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceReportExportRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/personal-finance/reports/:id/export?format=pdf|png (#157, personal-finance spec section 39): one of the
// signed-in person's saved reports as a PDF or PNG (read-only, made on request). Unknown id: 404 JSON. Bad format:
// 400 JSON. Flag off: 404 JSON. Other methods: 405 JSON. Signed out: 401 JSON.
const handle = async ({ request, params }: { request: Request; params: { id: string } }) =>
  handlePersonalFinanceReportExportRequest(request, params.id, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance_/reports_/$id_/export")({
  server: { handlers: { GET: handle, ANY: handle } },
});
