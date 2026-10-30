import { createFileRoute } from "@tanstack/react-router";
import { RenaissancePage } from "@/components/renaissance/renaissance-page";
import { getRenaissancePage } from "@/lib/renaissance/gate";

// /renaissance (#267, attachments/renaissance-spec.md): the Renaissance Man dashboard, owner only. Anyone else
// (signed out included) gets the site's 404, so the page's existence isn't revealed.
export const Route = createFileRoute("/renaissance")({
  loader: () => getRenaissancePage(),
  head: () => ({
    meta: [{ title: "Renaissance · Orpheus Wisdom" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: RenaissanceRoute,
});

function RenaissanceRoute() {
  return <RenaissancePage data={Route.useLoaderData()} />;
}
