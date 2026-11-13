import { createFileRoute } from "@tanstack/react-router";
import { handleYearlyReturnsCron } from "@/lib/research/cron.server";

// GET /api/cron/yearly-returns (#333). Vercel Cron, 0 22 * * * UTC. Bearer CRON_SECRET.
// Does not touch /api/cron/daily-refresh.
const handle = ({ request }: { request: Request }) => handleYearlyReturnsCron(request);

export const Route = createFileRoute("/api/cron/yearly-returns")({
  server: { handlers: { GET: handle, ANY: handle } },
});
