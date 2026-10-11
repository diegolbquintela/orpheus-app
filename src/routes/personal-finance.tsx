import { createFileRoute, redirect } from "@tanstack/react-router";
import { PersonalFinancePage } from "@/components/personal-finance/expenses-page";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";

// Personal finance (#84 v1.1 … #102; attachments/personal-finance-spec.md). #102: signed-in users only; signed
// out → 307 to /dashboard/sign-in?next=/personal-finance. The figures live against the account
// (/api/personal-finance).
export const Route = createFileRoute("/personal-finance")({
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn)
      throw redirect({ to: "/dashboard/sign-in", search: { next: "/personal-finance" } });
  },
  head: () => ({
    meta: [
      { title: "Personal finance · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <PersonalFinancePage />,
});
