import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { HoldingsSection, PreviewRefresh } from "@/components/dashboard/holdings";
import {
  ensureDashboardEnabled,
  getDashboardDbStatusLine,
  getDashboardHoldings,
  getDashboardViewer,
} from "@/lib/dashboard/gate";

// Hidden route: 404 unless DASHBOARD_ENABLED is exactly "true" on the server.
// The site menu links here on every page (#46); flag off, that link lands on the plain 404. Needs a session (T03 #11, DASH-04):
// signed out, it redirects to /dashboard/sign-in.
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    await ensureDashboardEnabled();
    const viewer = await getDashboardViewer();
    if (!viewer.user) throw redirect({ to: "/dashboard/sign-in" });
    return { user: viewer.user };
  },
  // Only reached when the gate passed, so loaderData doubles as "flag on".
  // dbStatus: preview-only storage status line (null on production), DASH-03.
  loader: async ({ context }) => {
    const [dbStatus, holdings] = await Promise.all([getDashboardDbStatusLine(), getDashboardHoldings()]);
    return { enabled: true as const, email: context.user.email, dbStatus, ...holdings };
  },
  // No dashboard title unless the gate passed (spec §2: no dashboard copy when off).
  head: ({ loaderData }) =>
    loaderData?.enabled
      ? {
          meta: [
            { title: "Dashboard · Orpheus Wisdom" },
            { name: "robots", content: "noindex, nofollow" },
          ],
        }
      : {},
  component: DashboardShell,
});

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex items-center gap-3">
      {failed ? <span className="text-xs text-muted">Sign-out failed. Try again.</span> : null}
      <button
        type="button"
        disabled={busy}
        data-testid="dashboard-sign-out"
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const { signOut } = await import("@/lib/auth/client");
            await signOut("/dashboard/sign-in");
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
        className="text-sm underline-offset-4 hover:underline disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </span>
  );
}

function DashboardShell() {
  const { dbStatus, email, holdings, prices, previewRefresh, lastRun, storage, baseCurrency, valuation, freshness, metricColumns, metrics, portfolio } =
    Route.useLoaderData();
  const router = useRouter();
  return (
    <div className="bg-paper">
      <main className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-3xl">Dashboard</h1>
          <SignOutButton />
        </div>
        <p className="mt-2 text-sm text-muted" data-testid="dashboard-user">
          Signed in as {email ?? "your account"}
        </p>
        <HoldingsSection
          holdings={holdings}
          prices={prices}
          baseCurrency={baseCurrency}
          valuation={valuation}
          freshness={freshness}
          metricColumns={metricColumns}
          metrics={metrics}
          portfolio={portfolio}
          storage={storage}
          onChanged={() => router.invalidate()}
        />
        {previewRefresh && storage === "ok" ? (
          <PreviewRefresh lastRun={lastRun} onChanged={() => router.invalidate()} />
        ) : null}
        {dbStatus ? (
          <p className="mt-8 text-xs text-muted" data-testid="dashboard-db-status">
            {dbStatus}
          </p>
        ) : null}
      </main>
    </div>
  );
}
