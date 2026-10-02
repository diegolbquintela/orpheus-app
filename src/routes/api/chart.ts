import { createFileRoute } from "@tanstack/react-router";
import { ChartError, loadChart } from "@/lib/dca/yahoo.server.ts";

export const Route = createFileRoute("/api/chart")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        try {
          const body = await loadChart({
            ticker: url.searchParams.get("ticker") ?? "",
            start: url.searchParams.get("start") ?? "",
            end: url.searchParams.get("end") ?? "",
          });
          return Response.json(body, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          const status = error instanceof ChartError ? error.status : 502;
          const message = error instanceof Error ? error.message : "Price feed failed.";
          return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
