import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { dashboardEnabledFromEnv } from "@/lib/dashboard/flag.server";
import { dashboardOffRewrite } from "@/lib/dashboard/paths";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

// Server only: while DASHBOARD_ENABLED is off, SSR reads /dashboard… as an
// unmatched path, so the response is the app's ordinary 404 (no dashboard head,
// chunk or copy). The browser never sees the flag; client navigation is still
// gated by ensureDashboardEnabled() in src/routes/dashboard.tsx.
const serverRewrite = createIsomorphicFn()
  .server(() => dashboardOffRewrite(dashboardEnabledFromEnv()))
  .client(() => undefined);

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    rewrite: serverRewrite(),
  });
}
