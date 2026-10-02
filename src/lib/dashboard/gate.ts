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
 * "price pending" (T05 #13), and (T06 #14) the user's base currency plus each position and the total
 * re-expressed in it at the FX rate for the close's session date. 404 while the flag is off. Signed
 * out: `storage: "signed_out"` (the page redirects first anyway). No database: `"not_configured"`.
 * Reads the database only; never calls a price or FX feed, so a reload can't change a value (DASH-14).
 * `previewRefresh` is true only on Vercel previews (VERCEL_ENV=preview), never on production.
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
  };
  const user = await sessionFromRequestHeaders(getRequest().headers);
  if (!user) return { ...empty, storage: "signed_out" as const };
  const { getDashboardDb } = await import("./db.server");
  const db = await getDashboardDb();
  if (!db) return { ...empty, storage: "not_configured" as const };
  const { getUserSettings, listHoldings } = await import("./store.server");
  const { lastRun, priceViews } = await import("./daily-refresh.server");
  const { valueHoldings } = await import("./fx.server");
  const holdings = await listHoldings(db, user.id);
  const prices = await priceViews(db, holdings.map((h) => h.symbol));
  const { baseCurrency } = await getUserSettings(db, user.id);
  return {
    holdings,
    prices,
    previewRefresh,
    lastRun: previewRefresh ? await lastRun(db) : null,
    baseCurrency,
    valuation: await valueHoldings(db, holdings, prices, baseCurrency),
    storage: "ok" as const,
  };
});
