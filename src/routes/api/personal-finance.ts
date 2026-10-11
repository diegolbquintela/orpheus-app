import { createFileRoute } from "@tanstack/react-router";
import { handlePersonalFinanceRequest } from "@/lib/finance/account.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/personal-finance (#102, personal-finance spec section 16.5): the signed-in account's record. GET / PUT
// { data } / DELETE. Flag off: 404 JSON. Other methods: 405 JSON. Signed out: 401 JSON. userId naming anyone
// else: 403 JSON.
const handle = async ({ request }: { request: Request }) =>
  handlePersonalFinanceRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/personal-finance")({
  server: { handlers: { GET: handle, PUT: handle, DELETE: handle, ANY: handle } },
});
