import { createFileRoute } from "@tanstack/react-router";
import { handleAccountMeRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/me (#90; logic and order in src/lib/access/account-api.server.ts).
const handle = async ({ request }: { request: Request }) => handleAccountMeRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/me")({
  server: { handlers: { GET: handle, ANY: handle } },
});
