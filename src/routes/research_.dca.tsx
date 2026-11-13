import { createFileRoute } from "@tanstack/react-router";
import { Desk } from "@/components/desk";

// The DCA calculator, unchanged, under Research (#333).
export const Route = createFileRoute("/research_/dca")({
  head: () => ({
    meta: [
      { title: "DCA Calculator · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Desk,
});
