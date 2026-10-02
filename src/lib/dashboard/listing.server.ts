/**
 * Listing check for a new holding (T04, #12). Server-only.
 *
 * Runs only when a user adds a holding, never on a page load. It asks the price feed which exchange
 * lists the symbol (one Yahoo chart metadata request, the same request the calculator makes) and
 * applies the calculator's own rule, `listingError()` from `src/lib/dca/venues.ts`, so the refusal
 * text is exactly the calculator's (DASH-08), including the BSE message. Nothing is stored here:
 * no prices, no instrument rows (those come with the daily job, T05).
 */
import { listingError } from "../dca/venues.ts";
import { pull, type YahooPayload } from "../dca/yahoo.server.ts";

export type ListingResult =
  | { ok: true; exchange: string; currency: string }
  | { ok: false; status: 400 | 404 | 503; error: string };

export type ListingLookup = (symbol: string) => Promise<ListingResult>;

/** Decide from a chart payload (pure; tests use recorded payload shapes). */
export function listingFromPayload(symbol: string, payload: YahooPayload): ListingResult {
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) {
    const why = payload.chart?.error?.description || "not found on the price feed";
    return { ok: false, status: 404, error: `${symbol}: ${why}` };
  }
  const blocked = listingError(symbol, meta.exchangeName, meta.fullExchangeName);
  if (blocked) return { ok: false, status: 400, error: blocked };
  const currency = (meta.currency || "").trim();
  if (!currency) return { ok: false, status: 404, error: `${symbol} has no currency on the price feed.` };
  return { ok: true, exchange: (meta.fullExchangeName || meta.exchangeName || "").trim(), currency };
}

/** The live check: fails closed (503) when the feed can't be reached. */
export const yahooListingLookup: ListingLookup = async (symbol) => {
  try {
    return listingFromPayload(symbol, await pull(symbol, "interval=1d&range=5d"));
  } catch {
    // Network failure or an unreadable reply (ChartError): refuse rather than skip the rule.
    return { ok: false, status: 503, error: `Couldn't check ${symbol}'s listing right now. Try again in a minute.` };
  }
};
