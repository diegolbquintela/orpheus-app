import { deniedStatus } from "@/lib/access/denied-status";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeniedPage } from "@/components/access/denied";
import { ScenarioPage } from "@/components/personal-finance/scenario-page";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";

// #215 (personal-finance-spec 55): the scenario screen. Same gate as /personal-finance (Read sees it; saving needs write).
export const Route = createFileRoute("/personal-finance_/scenario")({
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn)
      throw redirect({ to: "/dashboard/sign-in", search: { next: "/personal-finance/scenario" } });
    if (viewer.mustChange) throw redirect({ to: "/account" });
    return { access: { read: viewer.read, write: viewer.write } };
  },
  loader: ({ context }) => context.access,
  head: () => ({
    meta: [
      { title: "Scenario · Personal Finance · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ScenarioRoute,
});

function ScenarioRoute() {
  const access = Route.useLoaderData();
  if (!access.read) return <DeniedPage surface="personal_finance" />;
  return <ScenarioPage />;
}
