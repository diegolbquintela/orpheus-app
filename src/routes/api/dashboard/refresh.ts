import { createFileRoute } from "@tanstack/react-router";
import { handlePreviewRefreshRequest } from "@/lib/dashboard/refresh-api.server";
import { sessionFromRequestHeaders } from "@/lib/dashboard/session.server";

// POST /api/dashboard/refresh (T05 #13): the preview-only "Run daily refresh" button. Runs the daily
// job server-side (no CRON_SECRET involved). 404 JSON unless the flag is on and VERCEL_ENV=preview;
// 405 for other methods; 401 signed out. Logic and tests: src/lib/dashboard/refresh-api.server.ts.
const handle = async ({ request }: { request: Request }) =>
  handlePreviewRefreshRequest(request, { getUser: sessionFromRequestHeaders });

export const Route = createFileRoute("/api/dashboard/refresh")({
  server: { handlers: { POST: handle, ANY: handle } },
});
