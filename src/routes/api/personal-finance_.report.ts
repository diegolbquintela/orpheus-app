import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceReportRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/personal-finance/report (#153, personal-finance spec section 33): the signed-in person's own saved chart
// report. GET / PUT { report } / DELETE. Needs a Personal Finance read grant. Flag off: 404 JSON. Other methods: 405
// JSON. Signed out: 401 JSON.
const handle = async ({ request }: { request: Request }) =>
  handlePersonalFinanceReportRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance_/report")({
  server: { handlers: { GET: handle, PUT: handle, DELETE: handle, ANY: handle } },
});
