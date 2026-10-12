import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountPage } from "@/components/access/account-page";
import { getAccountPage } from "@/lib/access/gate";
import { COPY } from "@/lib/access/access";

// /account (#90; attachments/roles-and-account-design.md section 2.2): the account menu as a page (Q-D9, no
// dropdown). Behind DASHBOARD_ENABLED like sign-in (404 when off). Signed out → 307 to
// /dashboard/sign-in?next=/account (ROLE-02). A temporary password shows only `You` and `Password` (ROLE-08).
export const Route = createFileRoute("/account")({
  beforeLoad: async () => {
    const data = await getAccountPage();
    if (!data.signedIn) throw redirect({ to: "/dashboard/sign-in", search: { next: "/account" } });
    return { data };
  },
  loader: ({ context }) => context.data,
  head: () => ({
    meta: [{ title: COPY.title }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AccountRoute,
});

function AccountRoute() {
  return <AccountPage data={Route.useLoaderData()} />;
}
