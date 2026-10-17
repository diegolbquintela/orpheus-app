import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceChartRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/personal-finance/chart (#155, personal-finance spec section 37): POST { series, range, chart } or { saved: true } returns the owner's aligned
// chart data (read-only). Needs a Personal Finance read grant. Flag off: 404 JSON. Other methods: 405 JSON.
// Signed out: 401 JSON.
const handle = async ({ request }: { request: Request }) =>
  handlePersonalFinanceChartRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance_/chart")({
  server: { handlers: { POST: handle, ANY: handle } },
});
