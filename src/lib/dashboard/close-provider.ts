/**
 * `DailyCloseProvider`: the only way the dashboard fetches prices (spec §6, §14 Amendment A.4).
 * T05 (#13) ships the Yahoo implementation (`yahoo-closes.server.ts`). The Alpha Vantage fallback is
 * a separate ticket and plugs in behind this same interface. Only background jobs call a provider
 * (the daily job, the new-holding backfill and the preview refresh button); pages read Postgres only.
 */

export interface DailyClose {
  /** App symbol, e.g. "RY.TO"; providers map it via instruments.provider_ids. */
  symbol: string;
  /** Exchange-local session date, YYYY-MM-DD (completed sessions only). */
  date: string;
  /** RAW official close in the listing currency (series of record). */
  close: number;
  /** ISO code; must match the instruments row. */
  currency: string;
  /** Provider id: "yahoo" or "alphavantage". */
  source: string;
  /** Provider-adjusted close, stored only as a cross-check. */
  adjCloseSrc?: number;
}

export interface CorporateAction {
  symbol: string;
  /** YYYY-MM-DD, exchange-local. */
  exDate: string;
  kind: "dividend" | "split";
  /** Dividend per share as declared (not split-adjusted). */
  cashUnadjusted?: number;
  /** e.g. 1 -> 4 for a 4-for-1 split. */
  splitFrom?: number;
  splitTo?: number;
  source: string;
}

/** Listing facts a provider learned while fetching (T05 addition, used to fill `instruments`). */
export interface ListingInfo {
  symbol: string;
  name: string | null;
  exchange: string;
  region: "US" | "EU" | "CA";
  mic: string | null;
  currency: string;
  providerIds: Record<string, string>;
}

export interface DailyCloseProvider {
  /** "yahoo" (primary) | "alphavantage" (fallback). */
  id: string;
  /** Exchange coverage. */
  supports(symbol: string): boolean;
  budget: { perMinute: number; perDay: number };
  /** Raw closes for completed sessions on or before `date` (the latest one, plus any missing since `since`). */
  getCloses(symbols: string[], date: string, opts?: { since?: string }): Promise<DailyClose[]>;
  /** Unadjusted dividends and splits, full history or since `since`. */
  getCorporateActions(symbol: string, opts?: { since?: string }): Promise<CorporateAction[]>;
  /**
   * Listing facts for a symbol (exchange, region, MIC, currency) from the provider's last response for
   * it, without another request; null when unknown. Optional: a provider that can't tell returns null.
   */
  getListing?(symbol: string): Promise<ListingInfo | null>;
}

/** Thrown by a provider for one symbol (the job records it in price_coverage.last_error). */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Calendar date of `ms` in `timeZone`, YYYY-MM-DD. */
export function dateInZone(ms: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** YYYY-MM-DD plus `days` (UTC calendar arithmetic). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
