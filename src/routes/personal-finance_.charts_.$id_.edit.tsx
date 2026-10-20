import { deniedStatus } from "@/lib/access/denied-status";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeniedPage } from "@/components/access/denied";
import { ChartsBuilder } from "@/components/personal-finance/charts-builder";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";
import { EDIT_SIGN_IN_NEXT } from "@/lib/finance/builder";

// #161 (spec 46, Q-AK1): edit one saved report (`default` or `r-…`). Signed out returns to the list (an id path is not
// an exact allowlisted path).
export const Route = createFileRoute("/personal-finance_/charts_/$id_/edit")({
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn) throw redirect({ to: "/dashboard/sign-in", search: { next: EDIT_SIGN_IN_NEXT } });
    if (viewer.mustChange) throw redirect({ to: "/account" });
    return { access: { read: viewer.read, write: viewer.write } };
  },
  loader: ({ context }) => context.access,
  head: () => ({ meta: [{ title: "Edit report · Charts · Orpheus Wisdom" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: EditRoute,
});

function EditRoute() {
  const access = Route.useLoaderData();
  const { id } = Route.useParams();
  if (!access.read) return <DeniedPage surface="personal_finance" />;
  return <ChartsBuilder id={id} readOnly={!access.write} />;
}
