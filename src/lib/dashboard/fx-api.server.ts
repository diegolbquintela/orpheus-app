/**
 * `GET /api/dashboard/fx?date=YYYY-MM-DD` (T06 #14): the stored rates the dashboard would use for that
 * date, each with the date it actually comes from (a BoC holiday shows the previous business day).
 * Same gate as the per-user routes (404 flag off, 405, 401 signed out); reads Postgres only, never a
 * provider. No `date`: today (UTC). A `date` that is not a real calendar date (strict YYYY-MM-DD,
 * year >= 1) is 400 before any database access. Lets QA compare stored values with BoC Valet (DASH-11).
 */
import { isCalendarDate } from "./dates.ts";
import { DASHBOARD_FX_QUOTES, ratesOnOrBefore } from "./fx.server.ts";
import {
  badRequest,
  dashboardJson as json,
  defaultGetDb,
  gateDashboardRequest,
  storageUnavailable,
  type DashboardApiDeps,
} from "./session.server.ts";

export const FX_ALLOW = ["GET", "HEAD"] as const;

export async function handleFxRequest(request: Request, deps: DashboardApiDeps): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("date");
  const date = raw ?? new Date().toISOString().slice(0, 10);
  // Validate before any database access: an impossible date (2026-02-31, 0000-01-01) would make
  // Postgres throw (500). Runs after the session check, so signed out is still 401 whatever the date.
  const g = await gateDashboardRequest(request, FX_ALLOW, deps, {
    precheck: () => (isCalendarDate(date) ? null : badRequest("date must be a real calendar date, YYYY-MM-DD.")),
  });
  if ("response" in g) return g.response;
  const db = await (deps.getDb ?? defaultGetDb)(deps.env ?? process.env);
  if (!db) return storageUnavailable();
  // #170 Q-AH14: only the dashboard quotes, so PF rows (Q-AH12 job, backfill) never change this output.
  const rates = (await ratesOnOrBefore(db, date)).filter((r) => DASHBOARD_FX_QUOTES.includes(r.quote));
  return json({
    date,
    unit: "CAD per 1 unit",
    rates: rates.map((r) => ({ ...r, fallback: r.rateDate < date })),
  });
}
