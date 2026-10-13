import { createFileRoute } from "@tanstack/react-router";
import { handleAccountEncryptionRequest } from "@/lib/access/account-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// /api/account/encryption (#93; logic in src/lib/access/account-api.server.ts): owner-only status and migration.
const handle = async ({ request }: { request: Request }) =>
  handleAccountEncryptionRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/account/encryption")({
  server: { handlers: { GET: handle, POST: handle, ANY: handle } },
});
