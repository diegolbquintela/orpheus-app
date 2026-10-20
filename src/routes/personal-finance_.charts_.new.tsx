import { deniedStatus } from "@/lib/access/denied-status";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeniedPage } from "@/components/access/denied";
import { ChartsBuilder } from "@/components/personal-finance/charts-builder";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";
import { NEW_SIGN_IN_NEXT } from "@/lib/finance/builder";

// #161 (spec 46, Q-AK1): a new report. Same gate as /personal-finance/charts; `?next=` keeps this exact path.
export const Route = createFileRoute("/personal-finance_/charts_/new")({
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn) throw redirect({ to: "/dashboard/sign-in", search: { next: NEW_SIGN_IN_NEXT } });
    if (viewer.mustChange) throw redirect({ to: "/account" });
    return { access: { read: viewer.read, write: viewer.write } };
  },
  loader: ({ context }) => context.access,
  head: () => ({ meta: [{ title: "New report · Charts · Orpheus Wisdom" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: NewRoute,
});

function NewRoute() {
  const access = Route.useLoaderData();
  if (!access.read) return <DeniedPage surface="personal_finance" />;
  return <ChartsBuilder readOnly={!access.write} />;
}
