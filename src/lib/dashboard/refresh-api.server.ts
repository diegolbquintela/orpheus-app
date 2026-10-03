/**
 * HTTP entry points for the daily close job (spec §11; ticket T05 #13). Server-only.
 *
 * `GET /api/cron/daily-refresh` (Vercel Cron, `0 23 * * *` UTC in vercel.json), in this order:
 * - 404 JSON while DASHBOARD_ENABLED is off (spec §2: every dashboard API route checks the flag, so on
 *   production the cron call is a no-op until the release go);
 * - 405 JSON for any method but GET;
 * - **401 JSON** unless `Authorization: Bearer <CRON_SECRET>` matches (constant-time compare). No
 *   CRON_SECRET set means every request is refused; the server log says so (never the value);
 * - 503 JSON without a database; otherwise the run summary (or `{"status":"locked"}`).
 *
 * `POST /api/dashboard/refresh`, the preview-only "Run daily refresh" button:
 * - 404 JSON when the flag is off **or** `VERCEL_ENV` isn't `preview` (it doesn't exist on production
 *   or locally); 405 for other methods; 401 signed out; 503 without a database;
 * - runs the same job server-side. It never needs or sees CRON_SECRET. The response carries counts
 *   only, so a user never learns which symbols other users track.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { DailyCloseProvider } from "./close-provider.ts";
import type { FxFetcher } from "./fx.server.ts";
import { runDailyRefresh, type RefreshSummary } from "./daily-refresh.server.ts";
import { dashboardEnabledFromEnv, dashboardMethodNotAllowedResponse, guardDashboardApi } from "./flag.server.ts";
import {
  dashboardJson as json,
  defaultGetDb,
  storageUnavailable,
  unauthorizedResponse,
  type DashboardApiDeps,
} from "./session.server.ts";
import type { Queryable } from "./store.server.ts";

type Env = Record<string, string | undefined>;

export const CRON_ALLOW = ["GET"] as const;
export const PREVIEW_REFRESH_ALLOW = ["POST"] as const;

export type RefreshDeps = {
  env?: Env;
  getDb?: (env: Env) => Promise<Queryable | null>;
  provider?: () => DailyCloseProvider;
  /** FX source (T06); default: live BoC Valet + ECB. */
  fx?: () => FxFetcher;
  now?: () => number;
};

async function defaultProvider(): Promise<DailyCloseProvider> {
  const { createYahooCloseProvider } = await import("./yahoo-closes.server.ts");
  return createYahooCloseProvider();
}

const sha = (s: string) => createHash("sha256").update(s).digest();

/** True only for `Authorization: Bearer <CRON_SECRET>` with a non-empty secret. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return timingSafeEqual(sha(header ?? ""), sha(`Bearer ${secret}`));
}

/** The preview-only refresh button and route exist only on Vercel previews with the flag on. */
export function previewRefreshAvailable(env: Env = process.env): boolean {
  return dashboardEnabledFromEnv(env) && env.VERCEL_ENV === "preview";
}

/** Counts only: safe to show any signed-in user. */
export function publicSummary(s: RefreshSummary) {
  if (s.status === "locked") return { status: s.status, runDate: s.runDate };
  return {
    status: s.status,
    runDate: s.runDate,
    symbols: s.symbols,
    inserted: s.inserted,
    actions: s.actions,
    errors: s.errors.length,
    deferred: s.deferred.length,
    fxInserted: s.fx?.inserted ?? 0,
    fxErrors: s.fx?.errors.length ?? 0,
  };
}

async function run(deps: RefreshDeps, db: Queryable, trigger: "cron" | "preview") {
  const provider = deps.provider ? deps.provider() : await defaultProvider();
  const fx = deps.fx ? deps.fx() : (await import("./fx.server.ts")).createFxFetcher();
  return runDailyRefresh(db, provider, { trigger, now: deps.now, fx });
}

export async function handleCronRequest(request: Request, deps: RefreshDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const blocked = guardDashboardApi(env);
  if (blocked) return blocked;
  if (request.method.toUpperCase() !== "GET") return dashboardMethodNotAllowedResponse(CRON_ALLOW);
  if (!env.CRON_SECRET) console.error("[cron] CRON_SECRET is not set; refusing the request.");
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) return unauthorizedResponse();
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return storageUnavailable();
  const summary = await run(deps, db, "cron");
  console.log(`[cron] daily refresh ${JSON.stringify(publicSummary(summary))}`);
  return json(summary);
}

export async function handlePreviewRefreshRequest(
  request: Request,
  deps: RefreshDeps & Pick<DashboardApiDeps, "getUser">,
): Promise<Response> {
  const env = deps.env ?? process.env;
  const blocked = guardDashboardApi(env);
  if (blocked) return blocked;
  if (!previewRefreshAvailable(env)) return json({ error: "Not found." }, 404);
  if (request.method.toUpperCase() !== "POST") return dashboardMethodNotAllowedResponse(PREVIEW_REFRESH_ALLOW);
  const user = await deps.getUser(request.headers);
  if (!user) return unauthorizedResponse();
  const db = await (deps.getDb ?? defaultGetDb)(env);
  if (!db) return storageUnavailable();
  return json(publicSummary(await run(deps, db, "preview")));
}
