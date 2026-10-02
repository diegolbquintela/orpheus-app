import { createFileRoute } from "@tanstack/react-router";
import { ensureDashboardEnabled } from "@/lib/dashboard/gate";

// Hidden route: 404 unless DASHBOARD_ENABLED is exactly "true" on the server.
// Nothing on the calculator links here.
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    await ensureDashboardEnabled();
  },
  head: () => ({
    meta: [{ title: "Dashboard · Orpheus Wisdom" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: DashboardShell,
});

function DashboardShell() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink text-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <span className="text-sm">Orpheus Wisdom</span>
          <span className="kicker text-card/60">Dashboard</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
        <h1 className="text-3xl">Dashboard</h1>
        <p className="mt-4 max-w-xl text-sm" data-testid="dashboard-placeholder">
          Preview shell. Nothing to show yet.
        </p>
      </main>
    </div>
  );
}
