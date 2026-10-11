import { createFileRoute } from "@tanstack/react-router";
import { PersonalFinancePage } from "@/components/personal-finance/expenses-page";

// Personal finance (#84 v1.1; attachments/personal-finance-spec.md): expenses in this browser only.
export const Route = createFileRoute("/personal-finance")({
  head: () => ({
    meta: [
      { title: "Personal finance · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PersonalFinancePage,
});
