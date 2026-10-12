import { createFileRoute } from "@tanstack/react-router";
import { handleAccountWhoRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/who (#90; logic and order in src/lib/access/account-api.server.ts).
const handle = async ({ request }: { request: Request }) => handleAccountWhoRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/who")({
  server: { handlers: { GET: handle, ANY: handle } },
});
