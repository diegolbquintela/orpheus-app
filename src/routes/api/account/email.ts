import { createFileRoute } from "@tanstack/react-router";
import { handleAccountEmailRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/email (#90; logic and order in src/lib/access/account-api.server.ts).
const handle = async ({ request }: { request: Request }) => handleAccountEmailRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/email")({
  server: { handlers: { POST: handle, ANY: handle } },
});
