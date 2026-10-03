/**
 * Holdings API (T04, #12; spec §1, §5; DASH-06/07/08). Server-only.
 *
 * - `/api/dashboard/holdings`: GET lists the signed-in user's holdings; POST adds one.
 * - `/api/dashboard/holdings/:id`: GET one, PUT `{ shares, avgCost }`, DELETE.
 * Same gate as every per-user dashboard route (`gateDashboardRequest`): 404 JSON with the flag off,
 * 405 JSON for other methods, 401 JSON signed out. The user id comes only from the session; a
 * request naming another user's id is 403, and another user's holding id is 404 (it doesn't exist
 * for you). No prices: holdings are ticker, shares and average cost (listing currency) only.
 *
 * A new ticker must be a US, EU or CA listing: `listing.server.ts` asks the `DailyCloseProvider`
 * (`getListing`, T07), which applies the calculator's `listingError()` and its exact messages. The ticker of an existing holding can't be edited
 * (delete and add it again), so the check runs only on POST.
 */
import { waitUntil } from "@vercel/functions";
import { TICKER } from "../dca/yahoo.server.ts";
import { ensureCoverage } from "./daily-refresh.server.ts";
import { providerListingLookup, type ListingLookup } from "./listing.server.ts";
import {
  badRequest,
  dashboardJson as json,
  defaultGetDb,
  forbiddenResponse,
  gateDashboardRequest,
  namesOtherUser,
  storageUnavailable,
  type DashboardApiDeps,
  type DashboardUser,
} from "./session.server.ts";
import {
  addHolding,
  deleteHolding,
  DuplicateHoldingError,
  getHolding,
  listHoldings,
  updateHolding,
  type Queryable,
} from "./store.server.ts";

export const HOLDINGS_ALLOW = ["GET", "HEAD", "POST"] as const;
export const HOLDING_ALLOW = ["GET", "HEAD", "PUT", "DELETE"] as const;
/** Per-user cap, so one account can't grow the table without bound. */
export const MAX_HOLDINGS = 200;

export type HoldingsDeps = DashboardApiDeps & {
  lookupListing?: ListingLookup;
  /** Starts the new-holding price backfill after the response (T05). Default: Vercel `waitUntil()`. */
  scheduleBackfill?: (db: Queryable, symbol: string) => void;
};

/**
 * Default new-holding backfill (T05 #13, spec §11 / A.3 flow 1): runs the daily job's per-symbol fetch
 * in the background via `waitUntil()`, after the response, never inside the browser request. Without
 * a Vercel request context (local dev) the promise just runs on. If it never finishes, the next daily
 * run or the preview button picks the symbol up (its price_coverage row has no last_session_date).
 */
export function scheduleBackfillInBackground(db: Queryable, symbol: string): void {
  const job = (async () => {
    const { backfillSymbol } = await import("./daily-refresh.server.ts");
    const { createYahooCloseProvider } = await import("./yahoo-closes.server.ts");
    const r = await backfillSymbol(db, createYahooCloseProvider(), symbol);
    if (r?.error) console.error(`[backfill] ${symbol}: ${r.error}`);
    // T06: the new listing's currency may need FX dates nothing has fetched yet.
    const { createFxFetcher, refreshFx } = await import("./fx.server.ts");
    const fx = await refreshFx(db, createFxFetcher(), { today: new Date().toISOString().slice(0, 10) });
    if (fx.errors.length) console.error(`[backfill] FX: ${fx.errors.join("; ")}`);
    // T08: SEC coverage and annual facts for the new symbol (skipped without SEC_CONTACT_EMAIL).
    const { refreshFundamentals, secSourceFromEnv } = await import("./fundamentals.server.ts");
    const f = await refreshFundamentals(db, secSourceFromEnv(), { only: [symbol] });
    if (f.errors.length) console.error(`[backfill] fundamentals: ${f.errors.map((e) => e.error).join("; ")}`);
  })().catch(() => console.error(`[backfill] ${symbol} failed`));
  try {
    waitUntil(job);
  } catch {
    // No request context: the job keeps running on its own.
  }
}

type Field = "symbol" | "shares" | "avgCost";
type Invalid = { field: Field; error: string };

// NUMERIC(20, 6): up to 14 digits before the point, 6 after.
const DECIMAL = /^\d{1,14}(\.\d{1,6})?$/;

/** Normalise a ticker the way the calculator does: trimmed, upper case. */
export function normaliseSymbol(raw: unknown): string | Invalid {
  if (typeof raw !== "string" || !raw.trim()) return { field: "symbol", error: "Ticker is required." };
  const symbol = raw.trim().toUpperCase();
  if (!TICKER.test(symbol)) return { field: "symbol", error: "Ticker looks wrong." };
  return symbol;
}

/** Shares: > 0. Average cost: >= 0. Both plain decimals with at most 6 decimal places. */
export function parseQuantity(raw: unknown, field: "shares" | "avgCost"): string | Invalid {
  const label = field === "shares" ? "Shares" : "Average cost";
  const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!text) return { field, error: `${label} is required.` };
  if (/^-/.test(text) && Number.isFinite(Number(text)))
    return { field, error: field === "shares" ? "Shares must be greater than 0." : "Average cost must be 0 or more." };
  if (!DECIMAL.test(text)) return { field, error: `${label} must be a number with at most 6 decimals.` };
  if (field === "shares" && Number(text) <= 0) return { field, error: "Shares must be greater than 0." };
  return text;
}

const invalid = (v: unknown): v is Invalid => typeof v === "object" && v !== null && "error" in v;
const invalidResponse = (v: Invalid) => json({ error: v.error, field: v.field }, 400);

async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("Body must be a JSON object.");
    return body as Record<string, unknown>;
  } catch {
    return badRequest("Body must be JSON.");
  }
}

async function withDb(deps: HoldingsDeps): Promise<Queryable | null> {
  return (deps.getDb ?? defaultGetDb)(deps.env ?? process.env);
}

function queryNamesOther(request: Request, user: DashboardUser) {
  return namesOtherUser(new URL(request.url).searchParams.get("userId") ?? undefined, user);
}

/** `/api/dashboard/holdings` (GET list, POST add). */
export async function handleHoldingsRequest(request: Request, deps: HoldingsDeps): Promise<Response> {
  const g = await gateDashboardRequest(request, HOLDINGS_ALLOW, deps);
  if ("response" in g) return g.response;
  const { user } = g;
  if (queryNamesOther(request, user)) return forbiddenResponse();

  if (request.method.toUpperCase() !== "POST") {
    const db = await withDb(deps);
    if (!db) return storageUnavailable();
    return json({ holdings: await listHoldings(db, user.id) });
  }

  const body = await readJson(request);
  if (body instanceof Response) return body;
  if (namesOtherUser(body.userId, user)) return forbiddenResponse();
  const symbol = normaliseSymbol(body.symbol);
  if (invalid(symbol)) return invalidResponse(symbol);
  const shares = parseQuantity(body.shares, "shares");
  if (invalid(shares)) return invalidResponse(shares);
  const avgCost = parseQuantity(body.avgCost, "avgCost");
  if (invalid(avgCost)) return invalidResponse(avgCost);

  const db = await withDb(deps);
  if (!db) return storageUnavailable();
  // Cheap checks before the network call.
  const existing = await listHoldings(db, user.id);
  if (existing.some((h) => h.symbol === symbol))
    return json({ error: new DuplicateHoldingError(symbol).message, field: "symbol" }, 409);
  if (existing.length >= MAX_HOLDINGS)
    return json({ error: `You can track up to ${MAX_HOLDINGS} holdings.` }, 400);

  const listing = await (deps.lookupListing ?? providerListingLookup)(symbol);
  if (!listing.ok) return json({ error: listing.error, field: "symbol" }, listing.status);

  try {
    const holding = await addHolding(db, user.id, { symbol, shares, avgCost });
    // T05: record the symbol as pending and fetch its closes in the background ("price pending").
    await ensureCoverage(db, symbol);
    (deps.scheduleBackfill ?? scheduleBackfillInBackground)(db, symbol);
    return json(
      { holding, listing: { exchange: listing.exchange, currency: listing.currency }, price: "pending" },
      201,
    );
  } catch (err) {
    if (err instanceof DuplicateHoldingError) return json({ error: err.message, field: "symbol" }, 409);
    throw err;
  }
}

/** `/api/dashboard/holdings/:id` (GET, PUT shares/avgCost, DELETE). */
export async function handleHoldingRequest(
  request: Request,
  rawId: string,
  deps: HoldingsDeps,
): Promise<Response> {
  const g = await gateDashboardRequest(request, HOLDING_ALLOW, deps);
  if ("response" in g) return g.response;
  const { user } = g;
  if (queryNamesOther(request, user)) return forbiddenResponse();
  const notFound = () => json({ error: "Holding not found." }, 404);
  if (!/^\d{1,15}$/.test(rawId)) return notFound();
  const id = Number(rawId);
  const method = request.method.toUpperCase();

  let update: { shares: string; avgCost: string } | null = null;
  if (method === "PUT") {
    const body = await readJson(request);
    if (body instanceof Response) return body;
    if (namesOtherUser(body.userId, user)) return forbiddenResponse();
    if (body.symbol !== undefined)
      return json({ error: "The ticker can't be changed. Delete the holding and add it again.", field: "symbol" }, 400);
    const shares = parseQuantity(body.shares, "shares");
    if (invalid(shares)) return invalidResponse(shares);
    const avgCost = parseQuantity(body.avgCost, "avgCost");
    if (invalid(avgCost)) return invalidResponse(avgCost);
    update = { shares, avgCost };
  }

  const db = await withDb(deps);
  if (!db) return storageUnavailable();
  if (method === "DELETE") return (await deleteHolding(db, user.id, id)) ? json({ deleted: true }) : notFound();
  if (update) {
    const holding = await updateHolding(db, user.id, id, update);
    return holding ? json({ holding }) : notFound();
  }
  const holding = await getHolding(db, user.id, id);
  return holding ? json({ holding }) : notFound();
}
