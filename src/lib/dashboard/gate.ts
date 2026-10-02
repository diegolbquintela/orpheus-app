import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { dashboardEnabledFromEnv } from "./flag.server";

/**
 * Route gate for `/dashboard` (and future dashboard pages). Runs on the server
 * (directly during SSR, as an RPC on client navigation) and throws `notFound()`
 * when DASHBOARD_ENABLED is not exactly "true", so the page is a real 404.
 */
export const ensureDashboardEnabled = createServerFn({ method: "GET" }).handler(async () => {
  if (!dashboardEnabledFromEnv()) throw notFound();
  return { enabled: true as const };
});
