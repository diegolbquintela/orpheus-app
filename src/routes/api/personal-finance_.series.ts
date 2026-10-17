import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceSeriesRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/personal-finance/series (#154, personal-finance spec section 36): POST { series, range } returns the owner's
// monthly series (read-only). Needs a Personal Finance read grant. Flag off: 404 JSON. Other methods: 405 JSON.
// Signed out: 401 JSON.
const handle = async ({ request }: { request: Request }) =>
  handlePersonalFinanceSeriesRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance_/series")({
  server: { handlers: { POST: handle, ANY: handle } },
});
