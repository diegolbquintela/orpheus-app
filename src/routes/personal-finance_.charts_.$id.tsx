import { deniedStatus } from "@/lib/access/denied-status";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeniedPage } from "@/components/access/denied";
import { ChartsBuilder } from "@/components/personal-finance/charts-builder";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";
import { EDIT_SIGN_IN_NEXT } from "@/lib/finance/builder";

// #162 (spec 47, Q-AL1, Q-AL3): the saved report viewer is the #161 builder, opened with the saved report. It is editable
// unless the grant is Read, which is truly read-only (no Update, no Delete, so no leave warning). Signed out it returns
// to the list (Q-AL1); /<id>/edit stays as an alias (Q-AL4).
export const Route = createFileRoute("/personal-finance_/charts_/$id")({
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn) throw redirect({ to: "/dashboard/sign-in", search: { next: EDIT_SIGN_IN_NEXT } });
    if (viewer.mustChange) throw redirect({ to: "/account" });
    return { access: { read: viewer.read, write: viewer.write } };
  },
  loader: ({ context }) => context.access,
  head: () => ({ meta: [{ title: "Report · Charts · Orpheus Wisdom" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ViewRoute,
});

function ViewRoute() {
  const access = Route.useLoaderData();
  const { id } = Route.useParams();
  if (!access.read) return <DeniedPage surface="personal_finance" />;
  return <ChartsBuilder id={id} readOnly={!access.write} />;
}
