import { deniedStatus } from "@/lib/access/denied-status";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeniedPage } from "@/components/access/denied";
import { PersonalFinancePage } from "@/components/personal-finance/expenses-page";
import { getPersonalFinanceViewer } from "@/lib/finance/gate";

// Personal Finance (#84 v1.1 … #102; attachments/personal-finance-spec.md). #102: signed-in users only; signed
// out → 307 to /dashboard/sign-in?next=/personal-finance. The figures live against the account
// (/api/personal-finance). #90 (attachments/roles-and-account-design.md): the figures are the owner's; a temporary
// password → 307 to /account (ROLE-08); no Personal Finance grant → 403 page with no data (ROLE-14); Read → the
// page read-only (ROLE-10).
export const Route = createFileRoute("/personal-finance")({
  // #90 (ROLE-14): the denied page answers 403.
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    const viewer = await getPersonalFinanceViewer();
    if (!viewer.signedIn)
      throw redirect({ to: "/dashboard/sign-in", search: { next: "/personal-finance" } });
    if (viewer.mustChange) throw redirect({ to: "/account" });
    return { access: { read: viewer.read, write: viewer.write } };
  },
  loader: ({ context }) => context.access,
  head: () => ({
    meta: [
      { title: "Personal Finance · Orpheus Wisdom" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PersonalFinanceRoute,
});

function PersonalFinanceRoute() {
  const access = Route.useLoaderData();
  if (!access.read) return <DeniedPage surface="personal_finance" />;
  return <PersonalFinancePage readOnly={!access.write} />;
}
