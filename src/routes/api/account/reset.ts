import { createFileRoute } from "@tanstack/react-router";
import { handleAccountResetRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/reset (#90; logic and order in src/lib/access/account-api.server.ts).
const handle = async ({ request }: { request: Request }) => handleAccountResetRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/reset")({
  server: { handlers: { POST: handle, ANY: handle } },
});
