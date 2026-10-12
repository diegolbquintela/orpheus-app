import { createFileRoute } from "@tanstack/react-router";
import { handleAccountAccessRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/access (#90; logic and order in src/lib/access/account-api.server.ts).
const handle = async ({ request }: { request: Request }) => handleAccountAccessRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/access")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, DELETE: handle, ANY: handle } },
});
