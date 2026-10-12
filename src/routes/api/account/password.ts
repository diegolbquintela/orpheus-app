import { createFileRoute } from "@tanstack/react-router";
import { handleAccountPasswordRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/password (#90; logic and order in src/lib/access/account-api.server.ts).
const handle = async ({ request }: { request: Request }) => handleAccountPasswordRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/password")({
  server: { handlers: { POST: handle, ANY: handle } },
});
