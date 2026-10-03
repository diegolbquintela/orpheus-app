/**
 * `GET /api/dashboard/fx?date=YYYY-MM-DD` (T06 #14): the stored rates the dashboard would use for that
 * date, each with the date it actually comes from (a BoC holiday shows the previous business day).
 * Same gate as the per-user routes (404 flag off, 405, 401 signed out); reads Postgres only, never a
 * provider. No `date`: today (UTC). A `date` that is not a real calendar date (strict YYYY-MM-DD,
 * year >= 1) is 400 before any database access. Lets QA compare stored values with BoC Valet (DASH-11).
 */
import { isCalendarDate } from "./dates.ts";
import { ratesOnOrBefore } from "./fx.server.ts";
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
  const g = await gateDashboardRequest(request, FX_ALLOW, deps);
  if ("response" in g) return g.response;
  const raw = new URL(request.url).searchParams.get("date");
  const date = raw ?? new Date().toISOString().slice(0, 10);
  // Validate before any database access: an impossible date (2026-02-31, 0000-01-01) would make
  // Postgres throw (500). Runs after the gate, so signed out is still 401 whatever the date.
  if (!isCalendarDate(date)) return badRequest("date must be a real calendar date, YYYY-MM-DD.");
  const db = await (deps.getDb ?? defaultGetDb)(deps.env ?? process.env);
  if (!db) return storageUnavailable();
  const rates = await ratesOnOrBefore(db, date);
  return json({
    date,
    unit: "CAD per 1 unit",
    rates: rates.map((r) => ({ ...r, fallback: r.rateDate < date })),
  });
}
