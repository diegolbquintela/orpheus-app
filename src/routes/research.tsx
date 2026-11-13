import { createFileRoute } from "@tanstack/react-router";
import { Heatmap } from "@/components/research/heatmap";
import { getResearchHeatmap } from "@/lib/research/gate";

// /research (#333): the yearly-returns heatmap. Public. The loader reads the database when the
// table is there and otherwise the committed seed. No dashboard flag gate.
export const Route = createFileRoute("/research")({
  loader: () => getResearchHeatmap(),
  head: () => ({
    meta: [
      { title: "Research · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  return <Heatmap rows={Route.useLoaderData()} />;
}
