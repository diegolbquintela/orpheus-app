/**
 * GET /api/cron/yearly-returns (#333). Production cron at 0 22 * * * UTC.
 * Auth is the existing CRON_SECRET (the header Vercel sends). No new secret.
 * Writes only the current year (is_ytd) and the year that just finished.
 * Counts only in the response. Does not call the dashboard daily-refresh job.
 */
import { cronAuthorized } from "../dashboard/refresh-api.server.ts";
import { pull } from "../dca/yahoo.server.ts";
import type { YearlyReturnsDb } from "./load.server.ts";

type ChartPull = (ticker: string, query: string) => Promise<unknown>;
import {
  dateInNewYork,
  pointsFromYahooChart,
  RESEARCH_TICKERS,
  yearlyReturnsFromCloses,
  type YearReturn,
} from "./returns.ts";

type Env = Record<string, string | undefined>;

export type YearlyCronDeps = {
  env?: Env;
  getDb?: (env: Env) => Promise<YearlyReturnsDb | null>;
  pull?: ChartPull;
  now?: () => Date;
};

const json = (body: unknown, status: number, extra?: Record<string, string>) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", ...extra },
  });

function daySeconds(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y!, (m ?? 1) - 1, d) / 1000);
}

const UPSERT = `INSERT INTO yearly_returns (ticker, year, return_pct, is_ytd, partial, source)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (ticker, year) DO UPDATE
SET return_pct = EXCLUDED.return_pct,
    is_ytd = EXCLUDED.is_ytd,
    partial = EXCLUDED.partial,
    source = EXCLUDED.source,
    updated_at = now()`;

async function defaultGetDb(): Promise<YearlyReturnsDb | null> {
  const { getDashboardDb } = await import("../dashboard/db.server.ts");
  return getDashboardDb();
}

export async function handleYearlyReturnsCron(request: Request, deps: YearlyCronDeps = {}): Promise<Response> {
  if (request.method.toUpperCase() !== "GET") {
    return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
  }
  const env = deps.env ?? process.env;
  if (!env.CRON_SECRET) console.error("[yearly-returns] CRON_SECRET is not set; refusing the request.");
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return json({ error: "Unauthorized." }, 401);
  }
  const getDb = deps.getDb ?? defaultGetDb;
  const db = await getDb(env);
  if (!db) return json({ error: "Storage not configured." }, 503);

  const now = deps.now?.() ?? new Date();
  const asOf = dateInNewYork(now);
  const year = Number(asOf.slice(0, 4));
  const fetchFrom = `${year - 2}-12-01`;
  const period1 = daySeconds(fetchFrom);
  const period2 = Math.floor(now.getTime() / 1000) + 86400 * 4;
  const pullChart = deps.pull ?? pull;
  let upserted = 0;
  let finalized = 0;
  let errors = 0;

  for (const ticker of RESEARCH_TICKERS) {
    let rows: YearReturn[];
    try {
      const payload = await pullChart(ticker, `period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit`);
      rows = yearlyReturnsFromCloses(pointsFromYahooChart(payload), { ticker, firstYear: year - 1, asOf });
    } catch {
      errors += 1;
      continue;
    }
    const current = rows.find((row) => row.year === year) ?? null;
    const prior = rows.find((row) => row.year === year - 1) ?? null;
    try {
      if (prior) {
        await db.query(UPSERT, [prior.ticker, prior.year, prior.return_pct, false, prior.partial, prior.source]);
        finalized += 1;
      }
      if (current) {
        await db.query(UPSERT, [current.ticker, current.year, current.return_pct, true, false, current.source]);
        upserted += 1;
      }
    } catch (err) {
      const code = typeof (err as { code?: unknown })?.code === "string" ? (err as { code: string }).code : "";
      console.error(`[yearly-returns] write failed${code ? ` (${code})` : ""}`);
      if (code === "42P01" || code.startsWith("08") || code === "57P01" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
        return json({ error: "Storage not configured." }, 503);
      }
      errors += 1;
    }
  }

  console.log(`[yearly-returns] upserted=${upserted} finalized=${finalized} errors=${errors}`);
  return json({ upserted, finalized, errors }, 200);
}
