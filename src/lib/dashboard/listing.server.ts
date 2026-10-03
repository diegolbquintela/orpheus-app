/**
 * Listing check for a new holding (T04 #12; routed through `DailyCloseProvider` in T07 #15). Server-only.
 *
 * Runs only when a user adds a holding, never on a page load. It asks the price provider which exchange
 * lists the symbol (`DailyCloseProvider.getListing(symbol, { fetch: true })`: for Yahoo, one chart
 * metadata request, the same request the calculator makes) and the provider applies the calculator's own
 * rule, `listingError()` from `src/lib/dca/venues.ts`, so the refusal text is exactly the calculator's
 * (DASH-08), including the BSE message. Nothing is stored here: no prices, no instrument rows (the
 * background backfill and the daily job write those). Engineering Lead decision (2026-10-02): the check
 * stays on add, behind the provider interface.
 */
import { ProviderError, type DailyCloseProvider } from "./close-provider.ts";
import { createYahooCloseProvider } from "./yahoo-closes.server.ts";

export type ListingResult =
  | { ok: true; exchange: string; currency: string; name: string | null }
  | { ok: false; status: 400 | 404 | 503; error: string };

export type ListingLookup = (symbol: string) => Promise<ListingResult>;

const unavailable = (symbol: string): ListingResult => ({
  ok: false,
  status: 503,
  error: `Couldn't check ${symbol}'s listing right now. Try again in a minute.`,
});

/**
 * A listing check backed by a provider. Refused listings: 400 with `listingError()`'s text; unknown symbol
 * or no currency: 404; network failure or an unreadable reply: 503 (fails closed rather than skipping the
 * rule). A provider without `getListing` can't check, so it fails closed too.
 */
export function listingLookupFrom(provider: DailyCloseProvider): ListingLookup {
  return async (symbol) => {
    if (!provider.getListing) return unavailable(symbol);
    try {
      const listing = await provider.getListing(symbol, { fetch: true });
      if (!listing) return { ok: false, status: 404, error: `${symbol}: not found on the price feed` };
      return { ok: true, exchange: listing.exchange, currency: listing.currency, name: listing.name };
    } catch (err) {
      if (err instanceof ProviderError && err.kind === "refused") return { ok: false, status: 400, error: err.message };
      if (err instanceof ProviderError && err.kind === "not_found") return { ok: false, status: 404, error: err.message };
      return unavailable(symbol);
    }
  };
}

/** The live check: a fresh Yahoo `DailyCloseProvider` per request (its response cache is per instance). */
export const providerListingLookup: ListingLookup = (symbol) => listingLookupFrom(createYahooCloseProvider())(symbol);
