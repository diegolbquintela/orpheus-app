import { createFileRoute } from "@tanstack/react-router";
import { Desk } from "@/components/desk";

// The DCA vs lump-sum calculator (#46: moved here from /, behaviour unchanged).
export const Route = createFileRoute("/calculator")({
  head: () => ({
    meta: [
      { title: "Calculator · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Desk,
});
