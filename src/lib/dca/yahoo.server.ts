import { rawBars, rawDividends } from "./raw.ts";
import type { ChartPayload } from "./types.ts";
import { listingError } from "./venues.ts";

export class ChartError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ChartError";
    this.status = status;
  }
}

export type YahooPayload = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        exchangeName?: string;
        fullExchangeName?: string;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      events?: {
        dividends?: Record<string, { amount?: number; date?: number }>;
        splits?: Record<string, { date?: number; numerator?: number; denominator?: number }>;
      };
    } | null> | null;
    error?: { description?: string } | null;
  };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Feed-symbol shape the calculator accepts (also used by dashboard holdings). */
export const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

function daySeconds(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
}

/** One Yahoo chart request (also used by the dashboard listing check). */
export async function pull(ticker: string, query: string): Promise<YahooPayload> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${query}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ChartError(502, `Price feed refused ${ticker}.`);
  }
  const payload = (await response.json().catch(() => null)) as YahooPayload | null;
  if (!payload || typeof payload !== "object") throw new ChartError(502, `Price feed refused ${ticker}.`);
  return payload;
}

function toChart(ticker: string, payload: YahooPayload): ChartPayload | null {
  const result = payload.chart?.result?.[0];
  if (!result?.timestamp?.length) return null;
  const meta = result.meta ?? {};
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const bars = result.timestamp
    .map((stamp, index) => ({ t: stamp * 1000, px: closes[index] }))
    .filter((bar): bar is { t: number; px: number } => typeof bar.px === "number" && bar.px > 0);
  if (!bars.length) return null;
  const events = result.events ?? {};
  const dividends = Object.values(events.dividends ?? {})
    .filter((item) => typeof item.date === "number" && typeof item.amount === "number" && item.amount > 0)
    .map((item) => ({ t: item.date! * 1000, amt: item.amount! }))
    .sort((a, b) => a.t - b.t);
  const splits = Object.values(events.splits ?? {})
    .filter(
      (item) =>
        typeof item.date === "number" &&
        typeof item.numerator === "number" &&
        typeof item.denominator === "number" &&
        item.denominator > 0,
    )
    .map((item) => ({ t: item.date! * 1000, ratio: item.numerator! / item.denominator! }))
    .sort((a, b) => a.t - b.t);
  const exchange = (meta.fullExchangeName || meta.exchangeName || "").trim();
  return {
    ticker,
    exchange,
    currency: (meta.currency || "").trim(),
    bars: rawBars(bars, splits),
    dividends: rawDividends(dividends, splits),
    splits,
  };
}

export async function loadChart(input: { ticker: string; start: string; end: string }): Promise<ChartPayload> {
  const ticker = input.ticker.trim().toUpperCase();
  const start = input.start.trim();
  const end = input.end.trim();
  if (!ticker || !start || !end) throw new ChartError(400, "Ticker, start, and end are required.");
  if (!TICKER.test(ticker)) throw new ChartError(400, "Ticker looks wrong.");
  if (!DATE.test(start) || !DATE.test(end)) throw new ChartError(400, "Dates must be YYYY-MM-DD.");
  if (end < start) throw new ChartError(400, "End date is before the start date.");

  const period1 = daySeconds(start) - 86400 * 14;
  const period2 = daySeconds(end) + 86400 * 4;
  const dated = await pull(ticker, `period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit`);
  const chart = toChart(ticker, dated);
  const meta = dated.chart?.result?.[0]?.meta;

  if (!chart) {
    const probe = await pull(ticker, "interval=1d&range=5d&events=div%2Csplit");
    const probed = probe.chart?.result?.[0]?.meta;
    if (probed) {
      const blocked = listingError(ticker, probed.exchangeName, probed.fullExchangeName);
      if (blocked) throw new ChartError(400, blocked);
    }
    const why = dated.chart?.error?.description || probe.chart?.error?.description || "no prices";
    throw new ChartError(404, `${ticker}: ${why}`);
  }

  const blocked = listingError(ticker, meta?.exchangeName, meta?.fullExchangeName);
  if (blocked) throw new ChartError(400, blocked);
  if (!chart.currency) throw new ChartError(404, `${ticker} has no currency on the price feed.`);
  return chart;
}
