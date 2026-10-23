/**
 * #245 (personal-finance spec section 67, AC PFCFO): the CFO's read-only Personal Finance API, `GET /api/cfo/pf/*`.
 * A machine key, not a session: `Authorization: Bearer <CFO_PF_API_KEY>`. Order:
 * - 404 JSON while `DASHBOARD_ENABLED` is off (like every PF API);
 * - 405 JSON (`Allow: GET, HEAD`) for any other method, before the key is looked at;
 * - 401 JSON unless the header matches `CFO_PF_API_KEY` (sha256 + `timingSafeEqual`; unset / empty = every request
 *   refused, so revoking = unset or rotate the env var and redeploy). The key and the header are never logged;
 * - 400 JSON when the query names `userId` (the data is always the household owner's, Q4);
 * - 503 JSON without a database; 404 JSON `No household.` when `ORPHEUS_OWNER_EMAIL` names no account;
 * - 200 `{ data, household, currentMonth, generatedAt }`.
 * Read-only: only SELECTs (`personal_finance`, `fx_rates`, `"user"`); nothing is written or audited (Q5).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { ownerIdOf } from "../access/access.server.ts";
import { dashboardMethodNotAllowedResponse, guardDashboardApi } from "../dashboard/flag.server.ts";
import { badRequest, dashboardJson, defaultGetDb, storageUnavailable, unauthorizedResponse } from "../dashboard/session.server.ts";
import type { Queryable } from "../dashboard/store.server.ts";
import { readOwnNamed, readRecord } from "./account.server.ts";
import { readHousehold } from "./currency.ts";
import { readRates } from "./equity.ts";
import { readExpenses } from "./expenses.ts";
import { readMonthlyFx } from "./fx-history.server.ts";
import { readIncome } from "./income.ts";
import { copySourceFor, lastOpenMonth, readMonths, savedOverviewFigures } from "./months.ts";
import { householdMonth, nextMonth, readOverview, summarize } from "./overview.ts";
import { planFor } from "./plans.ts";
import { readPlans } from "./plans-read.ts";
import { RecordStore, type PfRecord } from "./record.ts";
import { readScenario } from "./scenario-key.ts";
import { netBasis, savedInputs } from "./scenario.ts";
import { SERIES_MAX_BYTES, seriesQueryError, seriesValues, type SeriesQuery } from "./series.ts";
import { readView } from "./view.ts";

type Env = Record<string, string | undefined>;

export const CFO_KEY_ENV = "CFO_PF_API_KEY";
export const CFO_ALLOW = ["GET", "HEAD"] as const;
export const CFO_SCHEMA = "cfo-pf.v1";
export const CFO_ENDPOINTS = [
  "/api/cfo/pf",
  "/api/cfo/pf/months",
  "/api/cfo/pf/months/:month",
  "/api/cfo/pf/lines",
  "/api/cfo/pf/overview",
  "/api/cfo/pf/series",
  "/api/cfo/pf/scenario",
  "/api/cfo/pf/scenarios",
  "/api/cfo/pf/scenarios/:id",
  "/api/cfo/pf/plans",
  "/api/cfo/pf/future",
  "/api/cfo/pf/settings",
  "/api/cfo/pf/fx",
  "/api/cfo/pf/reports",
] as const;

export type CfoDeps = { env?: Env; getDb?: (env: Env) => Promise<Queryable | null>; now?: () => Date };

const sha = (s: string) => createHash("sha256").update(s).digest();

/** True only for `Bearer <key>` with a non-empty key; constant-time over sha256 digests (no length leak). */
export function cfoAuthorized(header: string | null, key: string | undefined): boolean {
  if (!key) return false;
  return timingSafeEqual(sha(header ?? ""), sha(`Bearer ${key}`));
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const notFound = (error = "Not found.") => dashboardJson({ error }, 404);

function monthParam(u: URL, name: string): string | null | { error: string } {
  const v = u.searchParams.get(name);
  if (v === null || v === "") return null;
  return MONTH.test(v) ? v : { error: `${name} must be yyyy-mm.` };
}

/** The body for one path (`rest` = the part after `/api/cfo/pf`, no leading slash). Null = unknown path. */
async function dataFor(rest: string, u: URL, db: Queryable, record: PfRecord | null, ownerId: string, at: Date): Promise<{ data: unknown } | { response: Response } | null> {
  const s = new RecordStore(record ?? {});
  const current = householdMonth(at);
  const parts = rest.split("/").filter(Boolean).map(decodeURIComponent);
  const [head, arg, extra] = parts;
  if (extra !== undefined) return null;
  switch (head ?? "") {
    case "":
      return arg === undefined ? { data: { schema: CFO_SCHEMA, endpoints: CFO_ENDPOINTS } } : null;
    case "months": {
      const months = readMonths(s);
      if (arg !== undefined) {
        if (!MONTH.test(arg)) return { response: badRequest("month must be yyyy-mm.") };
        return { data: { month: arg, stored: arg in months, lines: months[arg] ?? null } };
      }
      const from = monthParam(u, "from");
      const to = monthParam(u, "to");
      for (const p of [from, to]) if (p && typeof p === "object") return { response: badRequest(p.error) };
      const keep = Object.keys(months)
        .filter((k) => (!from || k >= (from as string)) && (!to || k <= (to as string)))
        .sort();
      return { data: { months: Object.fromEntries(keep.map((k) => [k, months[k]])) } };
    }
    case "lines":
      return arg === undefined ? { data: { expenses: readExpenses(s), income: readIncome(s) } } : null;
    case "overview": {
      if (arg !== undefined) return null;
      const overview = readOverview(s);
      const lines = savedOverviewFigures(s, current);
      const page = { expenses: null, income: null };
      const summary = summarize(overview, at, page, lines);
      const inputs = savedInputs(record, at);
      return { data: { overview, summary, netAssetsNow: inputs.start, basis: netBasis(overview, at, inputs.start, undefined, page, lines) } };
    }
    case "series": {
      if (arg !== undefined) return null;
      const q = u.searchParams.get("q");
      if (!q) return { response: dashboardJson({ error: "q is required.", field: "q" }, 400) };
      if (new TextEncoder().encode(q).length > SERIES_MAX_BYTES) return { response: dashboardJson({ error: "Query too large." }, 413) };
      let body: unknown;
      try {
        body = JSON.parse(q);
      } catch {
        return { response: dashboardJson({ error: "q must be JSON.", field: "q" }, 400) };
      }
      const e = seriesQueryError(body, current);
      if (e) return { response: dashboardJson(e.field ? { error: e.error, field: e.field } : { error: e.error }, e.status) };
      const fx = await readMonthlyFx(db, record, current);
      return { data: seriesValues(body as SeriesQuery, record, at, undefined, fx) };
    }
    case "scenario":
      return arg === undefined ? { data: { scenario: readScenario(record), today: savedInputs(record, at) } } : null;
    case "scenarios": {
      const saved = readScenario(record)?.saved ?? [];
      if (arg === undefined) return { data: { scenarios: saved } };
      const one = saved.find((x) => x.id === arg);
      return one ? { data: { scenario: one } } : { response: notFound() };
    }
    case "plans": {
      if (arg !== undefined) return null;
      const m = monthParam(u, "month");
      if (m && typeof m === "object") return { response: badRequest(m.error) };
      const plans = readPlans(s);
      const keys = (m ? [m] : Object.keys(plans).sort()) as string[];
      return { data: { plans: Object.fromEntries(keys.filter((k) => plans[k]).map((k) => [k, { plan: plans[k], comparison: planFor(s, k, current)?.comparison ?? null }])) } };
    }
    case "future": {
      if (arg !== undefined) return null;
      const months = readMonths(s);
      const last = lastOpenMonth(current);
      const out: { month: string; stored: boolean; lines: unknown; copySource: string | null }[] = [];
      for (let k = nextMonth(current); k <= last; k = nextMonth(k))
        out.push({ month: k, stored: k in months, lines: months[k] ?? null, copySource: k in months ? null : copySourceFor(months, k) });
      return { data: { lastOpenMonth: last, months: out } };
    }
    case "settings":
      return arg === undefined ? { data: { currency: readHousehold(s), view: readView(s), equity: readRates(s) } } : null;
    case "fx": {
      if (arg !== undefined) return null;
      const t = monthParam(u, "through");
      if (t && typeof t === "object") return { response: badRequest(t.error) };
      return { data: { through: t ?? current, rates: (await readMonthlyFx(db, record, (t as string | null) ?? current)) ?? null } };
    }
    case "reports":
      return arg === undefined ? { data: { reports: await readOwnNamed(db, ownerId) } } : null;
    default:
      return null;
  }
}

export async function handleCfoPfRequest(request: Request, deps: CfoDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const blocked = guardDashboardApi(env);
  if (blocked) return blocked;
  if (!(CFO_ALLOW as readonly string[]).includes(request.method.toUpperCase())) return dashboardMethodNotAllowedResponse(CFO_ALLOW);
  if (!env[CFO_KEY_ENV]) console.error(`[cfo-pf] ${CFO_KEY_ENV} is not set; refusing the request.`);
  if (!cfoAuthorized(request.headers.get("authorization"), env[CFO_KEY_ENV])) return unauthorizedResponse();
  const u = new URL(request.url);
  if (u.searchParams.has("userId")) return badRequest("userId is not accepted: this API reads the household owner's data only.");
  const rest = u.pathname.replace(/^\/api\/cfo\/pf\/?/, "");
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return storageUnavailable();
  const ownerId = await ownerIdOf(db, env);
  if (!ownerId) return notFound("No household.");
  const at = (deps.now ?? (() => new Date()))();
  const record = await readRecord(db, ownerId);
  const r = await dataFor(rest, u, db, record, ownerId, at);
  if (!r) return notFound();
  if ("response" in r) return r.response;
  return dashboardJson({ data: r.data, household: readHousehold(new RecordStore(record ?? {})).household, currentMonth: householdMonth(at), generatedAt: at.toISOString() });
}
