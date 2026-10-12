import { createFileRoute } from "@tanstack/react-router";
import { handleAccountAuditRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/audit (#91; logic in src/lib/access/account-api.server.ts): the owner's audit log, masked.
const handle = async ({ request }: { request: Request }) => handleAccountAuditRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/audit")({
  server: { handlers: { GET: handle, ANY: handle } },
});
