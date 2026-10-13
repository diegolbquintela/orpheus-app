import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { deniedStatus } from "@/lib/access/denied-status";
import { DeniedPage } from "@/components/access/denied";
import { CompanyViewPage } from "@/components/dashboard/company-view";
import { ensureDashboardEnabled, getDashboardAccess, getDashboardCompany, getDashboardViewer } from "@/lib/dashboard/gate";

// #95 Dashboard company view (attachments/dashboard-company-view-design.md): the same gate as /dashboard (404 flag
// off, signed out → sign-in, temporary password → /account, no grant → 403 page). Database only.
export const Route = createFileRoute("/dashboard_/company/$symbol")({
  server: { middleware: [deniedStatus] },
  beforeLoad: async () => {
    await ensureDashboardEnabled();
    const viewer = await getDashboardViewer();
    if (!viewer.user) throw redirect({ to: "/dashboard/sign-in" });
    const access = await getDashboardAccess();
    if (access.mustChange) throw redirect({ to: "/account" });
    return { access };
  },
  loader: async ({ context, params }) => {
    if (!context.access.read) return { enabled: true as const, denied: true as const, company: null };
    const company = await getDashboardCompany({ data: { symbol: params.symbol } });
    return { enabled: true as const, denied: false as const, company };
  },
  head: ({ loaderData }) =>
    loaderData?.enabled
      ? {
          meta: [
            {
              title:
                loaderData.company?.status === "ok"
                  ? `${loaderData.company.view.name} · Dashboard · Orpheus Wisdom`
                  : "Dashboard · Orpheus Wisdom",
            },
            { name: "robots", content: "noindex, nofollow" },
          ],
        }
      : {},
  component: CompanyRoute,
});

function CompanyRoute() {
  const data = Route.useLoaderData();
  if (data.denied) return <DeniedPage surface="dashboard" />;
  const c = data.company;
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="text-sm">
        <Link to="/dashboard" className="text-dim underline-offset-4 hover:underline" data-testid="company-back">
          ← Dashboard
        </Link>
      </p>
      <div className="mt-6">
        {c?.status === "ok" ? (
          <CompanyViewPage view={c.view} />
        ) : (
          <p className="text-lg" data-testid="company-not-held">
            {c?.status === "not_configured" ? "Storage not configured." : "Not in your holdings."}
          </p>
        )}
      </div>
    </main>
  );
}
