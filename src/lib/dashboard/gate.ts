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

/**
 * Preview-only database status line for `/dashboard` (DASH-03). 404 while the flag
 * is off; null on production so the line never renders there.
 */
export const getDashboardDbStatusLine = createServerFn({ method: "GET" }).handler(async () => {
  if (!dashboardEnabledFromEnv()) throw notFound();
  const { checkDashboardDb, describeDbStatus, getDashboardDb, showDbStatusLine } = await import(
    "./db.server"
  );
  if (!showDbStatusLine()) return null;
  return describeDbStatus(await checkDashboardDb(await getDashboardDb()));
});

/**
 * Who is looking at `/dashboard` (T03 #11): `{ authReady, user }`. 404 while the flag is off.
 * `user` comes from the Better Auth session cookie on this request, never from the client.
 */
export const getDashboardViewer = createServerFn({ method: "GET" }).handler(async () => {
  if (!dashboardEnabledFromEnv()) throw notFound();
  const { getRequest } = await import("@tanstack/react-start/server");
  const { dashboardViewer } = await import("./session.server");
  return dashboardViewer(getRequest().headers);
});

/**
 * The signed-in user's holdings for `/dashboard` (T04 #12), with each symbol's latest stored close or
 * "price pending" (T05 #13), the user's base currency (T06 #14), and (T07 #15) the valuation: market
 * value, cost (D8: same rate), total return, % of portfolio, totals, the "Prices as of … · FX …" dates
 * and the out-of-date flag. 404 while the flag is off. Signed out: `storage: "signed_out"` (the page
 * redirects first anyway). No database: `"not_configured"`. Reads the database only; never calls a
 * price or FX feed, so a reload can't change a value (DASH-14). `previewRefresh` is true only on
 * Vercel previews (VERCEL_ENV=preview), never on production.
 */
export const getDashboardHoldings = createServerFn({ method: "GET" }).handler(async () => {
  if (!dashboardEnabledFromEnv()) throw notFound();
  const { getRequest } = await import("@tanstack/react-start/server");
  const { sessionFromRequestHeaders } = await import("./session.server");
  const { previewRefreshAvailable } = await import("./refresh-api.server");
  const previewRefresh = previewRefreshAvailable();
  const empty = {
    holdings: [],
    prices: {},
    previewRefresh,
    lastRun: null,
    baseCurrency: "CAD" as const,
    valuation: null,
    freshness: null,
  };
  const user = await sessionFromRequestHeaders(getRequest().headers);
  if (!user) return { ...empty, storage: "signed_out" as const };
  const { getDashboardDb } = await import("./db.server");
  const db = await getDashboardDb();
  if (!db) return { ...empty, storage: "not_configured" as const };
  const { loadDashboardHoldings } = await import("./valuation.server");
  return { ...(await loadDashboardHoldings(db, user.id, { previewRefresh })), previewRefresh, storage: "ok" as const };
});
