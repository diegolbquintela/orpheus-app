import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceViewRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// PUT /api/personal-finance/view (#90 Q-D11): the signed-in person's own Personal Finance section toggles. #197: needs a
// Personal Finance write grant (Read → 403). Flag off: 404 JSON. Other methods: 405 JSON. Signed out: 401 JSON.
const handle = async ({ request }: { request: Request }) =>
  handlePersonalFinanceViewRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance_/view")({
  server: { handlers: { PUT: handle, ANY: handle } },
});
