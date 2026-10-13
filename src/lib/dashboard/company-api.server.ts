/**
 * `GET /api/dashboard/company/<SYMBOL>` (#95; attachments/dashboard-company-view-design.md section 1). Same gate
 * order as the other per-user Dashboard APIs (404 flag off, 405, 401, 503, 403 without a Dashboard read grant), then
 * 400 for a malformed symbol and 404 `not_held` for a symbol not in the owner's holdings. Database only.
 */
import { badRequest, type DashboardApiDeps, dashboardJson, gateDashboardRequest } from "./session.server.ts";
import { loadCompany, normalizeSymbol } from "./company.server.ts";

export const COMPANY_ALLOW = ["GET", "HEAD"] as const;

export const todayUtc = () => new Date().toISOString().slice(0, 10);

export async function handleCompanyRequest(request: Request, deps: DashboardApiDeps, rawSymbol: string) {
  const g = await gateDashboardRequest(request, COMPANY_ALLOW, deps, { surface: "dashboard", need: "read" });
  if ("response" in g) return g.response;
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) return badRequest("Not a ticker.");
  const r = await loadCompany(g.db, g.user.id, symbol, todayUtc());
  if (r.status === "not_held") return dashboardJson({ error: "not_held" }, 404);
  const res = dashboardJson({ company: r.view });
  res.headers.set("cache-control", "private, max-age=60");
  return res;
}
