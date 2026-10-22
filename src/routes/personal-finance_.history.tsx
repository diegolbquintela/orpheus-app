import { deniedStatus } from "@/lib/access/denied-status";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeniedPage } from "@/components/access/denied";
import { HistoryPage } from "@/components/personal-finance/history-page";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";

// #214 (personal-finance-spec 53): the read-only History table. Same gate as /personal-finance (Read is enough).
export const Route = createFileRoute("/personal-finance_/history")({
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn)
      throw redirect({ to: "/dashboard/sign-in", search: { next: "/personal-finance/history" } });
    if (viewer.mustChange) throw redirect({ to: "/account" });
    return { access: { read: viewer.read, write: viewer.write } };
  },
  loader: ({ context }) => context.access,
  head: () => ({
    meta: [
      { title: "History · Personal Finance · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HistoryRoute,
});

function HistoryRoute() {
  const access = Route.useLoaderData();
  if (!access.read) return <DeniedPage surface="personal_finance" />;
  return <HistoryPage />;
}
