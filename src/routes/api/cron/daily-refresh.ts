import { createFileRoute } from "@tanstack/react-router";
import { handleCronRequest } from "@/lib/dashboard/refresh-api.server";

// GET /api/cron/daily-refresh (T05 #13): the Vercel Cron job (vercel.json, 0 23 * * * UTC).
// Flag off: 404 JSON. Other methods: 405 JSON. Without `Authorization: Bearer <CRON_SECRET>`: 401 JSON.
// Logic and tests: src/lib/dashboard/refresh-api.server.ts.
const handle = async ({ request }: { request: Request }) => handleCronRequest(request);

export const Route = createFileRoute("/api/cron/daily-refresh")({
  server: { handlers: { GET: handle, ANY: handle } },
});
