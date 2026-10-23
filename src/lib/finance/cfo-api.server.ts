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
import { HORIZONS, horizonLabel, netBasis, project, savedInputs, type Inputs } from "./scenario.ts";
import { historicalRate, rateText, type MonthlyFx } from "./fx-history.ts";
import { parseRate } from "./expenses.ts";
import { incomeLines, isForeignPerson, monthly, personCurrency, personLabel, type Person } from "./income.ts";
import { FIRST_MONTH } from "./months.ts";
import type { CurrencyCode } from "./currency.ts";
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


/**
 * #245 (spec 67.5, PFCFO-09/10): the scenario screen's projection for every horizon, through the page's own
 * `project` (scenario-page.tsx: `project(inputs, horizon)`; saved entries `project({ ...e.inputs, current }, horizon)`).
 */
export function projections(inp: Inputs) {
  return HORIZONS.map((h) => {
    const p = project(inp, h);
    return { horizon: h, label: horizonLabel(h), surplus: p.totals.surplus, growth: p.totals.growthEarned, netAssets: p.totals.netEnd, totals: p.totals, points: p.points };
  });
}

type FxMark = "household" | "historical" | "typed" | "missing";
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * #245 (spec 67.6, PFCFO-12/13): one month's income by person and by currency (monthly, counted net as the page
 * counts it: `incomeLines`), each converted to the household currency with that month's stored BoC average
 * (`historicalRate`), else the rate as typed; no valid rate = `fx: "missing"` and converted null (never guessed).
 */
export function incomeBreakdown(people: readonly Person[], month: string, household: CurrencyCode, fx: MonthlyFx | undefined) {
  const persons = people.map((p, i) => {
    const foreign = isForeignPerson(p, household);
    const currency = foreign ? personCurrency(p, household) : household;
    const own = incomeLines([{ ...p, foreign: false }], household).reduce((a, l) => a + (l.yearly ?? 0), 0);
    const hist = foreign && fx ? historicalRate(fx, month, currency, household) : null;
    const conv = incomeLines([hist !== null ? { ...p, rate: rateText(hist) } : p], household);
    const missing = conv.some((l) => l.yearly === null);
    const mark: FxMark = !foreign ? "household" : hist !== null ? "historical" : missing ? "missing" : "typed";
    const yearly = missing ? null : conv.reduce((a, l) => a + (l.yearly as number), 0);
    return { id: p.id, name: personLabel(p, i), currency, monthly: r2(monthly(own)), fx: mark, rate: !foreign ? 1 : (hist ?? parseRate(p.rate)), monthlyHousehold: yearly === null ? null : r2(monthly(yearly)) };
  });
  const byCurrency: Record<string, { monthly: number; monthlyHousehold: number | null; fxMissing: boolean }> = {};
  for (const x of persons) {
    const c = (byCurrency[x.currency] ??= { monthly: 0, monthlyHousehold: 0, fxMissing: false });
    c.monthly = r2(c.monthly + x.monthly);
    if (x.monthlyHousehold === null) c.fxMissing = true;
    c.monthlyHousehold = c.fxMissing || c.monthlyHousehold === null ? null : r2(c.monthlyHousehold + (x.monthlyHousehold as number));
  }
  const fxMissing = persons.some((x) => x.monthlyHousehold === null);
  const total = fxMissing ? null : r2(persons.reduce((a, x) => a + (x.monthlyHousehold as number), 0));
  return { household, byPerson: persons, byCurrency, totalHousehold: total, fxMissing };
}

export const NET_BEFORE_ANCHOR = "No net assets before the anchor month (the as-of month, else the first month with figures; #228).";
export const NET_FUTURE = "Future month: net assets are only counted through the current month (#228, the same as /series).";
export const NET_NO_ANCHOR = "No net assets: no as-of month and no month with figures yet (#228).";

/** #245 (spec 67.6, PFCFO-11): net assets per month through `/series`' own #228 rule (`seriesValues` net-assets). */
function netAssetsByMonth(record: PfRecord | null, at: Date, fx: MonthlyFx | undefined, current: string) {
  const r = seriesValues({ series: [{ kind: "metric", id: "net-assets" }], range: { from: FIRST_MONTH, to: current } } as SeriesQuery, record, at, undefined, fx);
  const vals = r.series[0].values;
  const map = new Map<string, number | null>(r.months.map((k, i) => [k, vals[i]]));
  const anyNet = vals.some((v) => v !== null);
  return (k: string) => {
    if (k > current) return { netAssets: null, netAssetsNote: NET_FUTURE };
    const v = map.get(k) ?? null;
    return v === null ? { netAssets: null, netAssetsNote: anyNet ? NET_BEFORE_ANCHOR : NET_NO_ANCHOR } : { netAssets: v, netAssetsNote: null };
  };
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
      const household = readHousehold(s).household;
      const fx = await readMonthlyFx(db, record, current);
      const net = netAssetsByMonth(record, at, fx, current);
      const monthExtras = async (k: string) => ({ ...net(k), income: incomeBreakdown(months[k]?.people ?? [], k, household, fx) });
      if (arg !== undefined) {
        if (!MONTH.test(arg)) return { response: badRequest("month must be yyyy-mm.") };
        return { data: { month: arg, stored: arg in months, lines: months[arg] ?? null, ...(await monthExtras(arg)) } };
      }
      const from = monthParam(u, "from");
      const to = monthParam(u, "to");
      for (const p of [from, to]) if (p && typeof p === "object") return { response: badRequest(p.error) };
      const keep = Object.keys(months)
        .filter((k) => (!from || k >= (from as string)) && (!to || k <= (to as string)))
        .sort();
      const out: Record<string, unknown> = {};
      for (const k of keep) out[k] = { ...months[k], ...(await monthExtras(k)) };
      return { data: { months: out } };
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
      if (arg !== undefined) return null;
      {
        const today = savedInputs(record, at);
        return { data: { scenario: readScenario(record), today, projection: projections(today) } };
      }
    case "scenarios": {
      const saved = readScenario(record)?.saved ?? [];
      if (arg === undefined) return { data: { scenarios: saved } };
      const one = saved.find((x) => x.id === arg);
      return one ? { data: { scenario: one, projection: projections({ ...one.inputs, current }) } } : { response: notFound() };
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
