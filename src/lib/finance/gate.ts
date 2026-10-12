import { createServerFn } from "@tanstack/react-start";
import { dashboardEnabledFromEnv } from "../dashboard/flag.server";

/**
 * `/personal-finance` gate (#102; spec section 16.4; #90 roles). Server-side: the Better Auth session plus (#90) the
 * person's access: `signedIn`, `mustChange` (a temporary password: the page sends them to `/account`), `read` /
 * `write` (the owner, or a CFO grant). No read: the page answers 403 with no data (ROLE-14). Returns no id or email.
 */
export const getPersonalFinanceViewer = createServerFn({ method: "GET" }).handler(async () => {
  const none = { signedIn: false, mustChange: false, read: false, write: false };
  if (!dashboardEnabledFromEnv()) return none;
  const { getRequest } = await import("@tanstack/react-start/server");
  const { pageAccess, markDenied } = await import("../access/viewer.server");
  const a = await pageAccess(getRequest().headers, "personal_finance");
  if (a.signedIn && !a.mustChange && !a.read) await markDenied();
  return { signedIn: a.signedIn, mustChange: a.mustChange, read: a.read, write: a.write };
});
