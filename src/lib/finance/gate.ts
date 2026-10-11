import { createServerFn } from "@tanstack/react-start";
import { dashboardEnabledFromEnv } from "../dashboard/flag.server";

/**
 * `/personal-finance` sign-in gate (#102; spec section 16.4). Server-side: the dashboard's Better Auth session
 * check. Sign-in lives behind `DASHBOARD_ENABLED`, so with the flag off (or sign-in not ready) nobody is signed in
 * and the page redirects to sign-in. Returns only whether someone is signed in (no id, no email).
 */
export const getPersonalFinanceViewer = createServerFn({ method: "GET" }).handler(async () => {
  if (!dashboardEnabledFromEnv()) return { signedIn: false };
  const { getRequest } = await import("@tanstack/react-start/server");
  const { dashboardViewer } = await import("../dashboard/session.server");
  const viewer = await dashboardViewer(getRequest().headers);
  return { signedIn: Boolean(viewer.user) };
});
