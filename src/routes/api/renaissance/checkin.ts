import { createFileRoute } from "@tanstack/react-router";
import { handleCheckinRequest } from "@/lib/renaissance/api.server";

// /api/renaissance/checkin (#267, attachments/renaissance-spec.md section 3): POST only (others 405); the owner's
// session or `Authorization: Bearer <RENAISSANCE_INGEST_TOKEN>`. Logic and tests: src/lib/renaissance/api.server.ts.
const handle = async ({ request }: { request: Request }) => handleCheckinRequest(request);

export const Route = createFileRoute("/api/renaissance/checkin")({
  server: { handlers: { POST: handle, ANY: handle } },
});
