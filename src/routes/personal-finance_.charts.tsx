import { deniedStatus } from "@/lib/access/denied-status";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeniedPage } from "@/components/access/denied";
import { ChartsPage } from "@/components/personal-finance/charts-page";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";

// #160 (spec 45, Q-AJ1): Personal Finance Charts, the saved reports list. Same gate as /personal-finance.
export const Route = createFileRoute("/personal-finance_/charts")({
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn)
      throw redirect({ to: "/dashboard/sign-in", search: { next: "/personal-finance/charts" } });
    if (viewer.mustChange) throw redirect({ to: "/account" });
    return { access: { read: viewer.read, write: viewer.write } };
  },
  loader: ({ context }) => context.access,
  head: () => ({
    meta: [
      { title: "Charts · Personal Finance · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChartsRoute,
});

function ChartsRoute() {
  const access = Route.useLoaderData();
  if (!access.read) return <DeniedPage surface="personal_finance" />;
  return <ChartsPage readOnly={!access.write} />;
}
