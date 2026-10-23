import { createFileRoute } from "@tanstack/react-router";
import { handleCfoPfRequest } from "@/lib/finance/cfo-api.server";

// /api/cfo/pf (#245, personal-finance spec section 67, AC PFCFO): the CFO's read-only Personal Finance API.
// GET / HEAD only (others 405); `Authorization: Bearer <CFO_PF_API_KEY>` or 401. Logic and tests:
// src/lib/finance/cfo-api.server.ts.
const handle = async ({ request }: { request: Request }) => handleCfoPfRequest(request);

export const Route = createFileRoute("/api/cfo/pf")({
  server: { handlers: { GET: handle, ANY: handle } },
});
