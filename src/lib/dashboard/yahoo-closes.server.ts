/**
 * Yahoo implementation of `DailyCloseProvider` (spec §6, §14 A.4/A.5, D13; ticket T05 #13). Server-only.
 *
 * - Reuses the calculator's Yahoo chart code: `pull()` for the request and `toChart()`, which runs
 *   `rawBars()` / `rawDividends()` from `src/lib/dca/raw.ts`, so closes and dividends are RAW (Yahoo's
 *   split adjustment is undone). Yahoo's adjusted close isn't read, so `adjCloseSrc` stays empty.
 * - One request per symbol returns closes and dividend/split events together; the response is kept for
 *   the rest of the run, so a backfill's `getCorporateActions()` and `getListing()` cost no extra call.
 * - Completed sessions only (R1): a bar dated after today in the exchange's own time zone is dropped,
 *   and a bar dated today is kept only when that exchange's regular session ended at least
 *   `SETTLE_MS` ago (Yahoo's `currentTradingPeriod.regular.end`). Without a time zone, today's bar is
 *   always dropped.
 * - US/EU/CA only: anything else is refused with the calculator's `listingError()` text.
 * - Closes are rounded to 4 decimals (Yahoo's values carry float noise); dividends to 6.
 * - Budget (Yahoo publishes none, so it is self-imposed): at most `perMinute` requests a minute
 *   (requests are spaced out, one at a time) and `perDay` requests per provider instance (one run).
 */
import { listingError, listingRegion } from "../dca/venues.ts";
import { pull, toChart, type YahooPayload } from "../dca/yahoo.server.ts";
import {
  dateInZone,
  ProviderError,
  type CorporateAction,
  type DailyClose,
  type DailyCloseProvider,
  type ListingInfo,
} from "./close-provider.ts";

/** Earliest date a backfill asks for (A.3: full history from 2000-01-01). */
export const BACKFILL_FROM = "2000-01-01";
/** How long after the regular session's end today's bar counts as the official close. */
export const SETTLE_MS = 30 * 60 * 1000;

/** Yahoo exchange codes (as `listingError()` sees them) to ISO 10383 MICs; unknown ones stay null. */
const MIC: Record<string, string> = {
  NMS: "XNAS", NGM: "XNAS", NCM: "XNAS", NasdaqGS: "XNAS", NasdaqGM: "XNAS", NasdaqCM: "XNAS",
  NYQ: "XNYS", NYSE: "XNYS", ASE: "XASE", AMEX: "XASE", NYSEAmerican: "XASE",
  PCX: "ARCX", NYSEArca: "ARCX", BTS: "BATS", BATS: "BATS",
  TOR: "XTSE", Toronto: "XTSE", TSX: "XTSE", VAN: "XTSX", TSXV: "XTSX", "TSX Venture": "XTSX",
  NEO: "NEOE", "NEO Exchange": "NEOE", CNQ: "XCNQ", CSE: "XCNQ",
  PAR: "XPAR", EPA: "XPAR", Paris: "XPAR", AMS: "XAMS", Amsterdam: "XAMS",
  GER: "XETR", ETR: "XETR", XETRA: "XETR", FRA: "XFRA", Frankfurt: "XFRA",
  MIL: "XMIL", BIT: "XMIL", Milan: "XMIL", MCE: "XMAD", BME: "XMAD", MAD: "XMAD", Madrid: "XMAD",
  BRU: "XBRU", Brussels: "XBRU", STO: "XSTO", Stockholm: "XSTO", HEL: "XHEL", Helsinki: "XHEL",
  CPH: "XCSE", Copenhagen: "XCSE", VIE: "XWBO", Vienna: "XWBO", LIS: "XLIS", Lisbon: "XLIS",
  WSE: "XWAR", Warsaw: "XWAR", BUD: "XBUD", Budapest: "XBUD", DUB: "XDUB", Dublin: "XDUB",
  PRA: "XPRA", Prague: "XPRA", ATH: "XATH", Athens: "XATH", TAL: "XTAL", Tallinn: "XTAL",
};

type Meta = NonNullable<NonNullable<NonNullable<NonNullable<YahooPayload["chart"]>["result"]>[number]>["meta"]>;

export type YahooProviderOptions = {
  /** One chart request (default: the calculator's `pull`). Tests pass recorded payloads. */
  fetchChart?: (symbol: string, query: string) => Promise<YahooPayload>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  budget?: { perMinute: number; perDay: number };
};

/** Yahoo sends float32-like values (61.22999954); prices are kept to 4 decimals. */
export const roundPrice = (px: number) => Math.round(px * 1e4) / 1e4;

const daySeconds = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 1000);
};

type Fetched = { since: string; date: string; payload: YahooPayload };

export function createYahooCloseProvider(options: YahooProviderOptions = {}): DailyCloseProvider {
  const fetchChart = options.fetchChart ?? pull;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const budget = options.budget ?? { perMinute: 30, perDay: 500 };
  const fetched = new Map<string, Fetched>();
  let calls = 0;
  let lastCallAt = 0;

  async function request(symbol: string, since: string, date: string): Promise<YahooPayload> {
    const prior = fetched.get(symbol);
    if (prior && prior.since <= since && prior.date >= date) return prior.payload;
    if (calls >= budget.perDay) throw new ProviderError(`Request budget for this run reached (${budget.perDay}).`);
    const gap = Math.ceil(60_000 / Math.max(1, budget.perMinute));
    const wait = lastCallAt + gap - now();
    if (calls > 0 && wait > 0) await sleep(wait);
    calls += 1;
    lastCallAt = now();
    // A few days of margin each side; bars are filtered by exchange-local date afterwards.
    const period1 = daySeconds(since) - 86400 * 3;
    const period2 = daySeconds(date) + 86400 * 2;
    let payload: YahooPayload;
    try {
      payload = await fetchChart(symbol, `period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit`);
    } catch {
      throw new ProviderError(`Price feed refused ${symbol}.`);
    }
    fetched.set(symbol, { since, date, payload });
    return payload;
  }

  function metaOf(symbol: string, payload: YahooPayload): Meta {
    const result = payload.chart?.result?.[0];
    if (!result?.meta) throw new ProviderError(`${symbol}: ${payload.chart?.error?.description || "not found on the price feed"}`);
    const meta = result.meta;
    const blocked = listingError(symbol, meta.exchangeName, meta.fullExchangeName);
    if (blocked) throw new ProviderError(blocked);
    if (!(meta.currency ?? "").trim()) throw new ProviderError(`${symbol} has no currency on the price feed.`);
    return meta;
  }

  /** Is a bar dated `day` (exchange-local) a completed session right now? */
  function completed(day: string, meta: Meta): boolean {
    const tz = meta.exchangeTimezoneName;
    const t = now();
    if (!tz) return day < dateInZone(t, "UTC");
    const today = dateInZone(t, tz);
    if (day < today) return true;
    if (day > today) return false;
    const end = meta.currentTradingPeriod?.regular?.end;
    return typeof end === "number" && dateInZone(end * 1000, tz) === today && t >= end * 1000 + SETTLE_MS;
  }

  const zone = (meta: Meta) => meta.exchangeTimezoneName || "UTC";

  return {
    id: "yahoo",
    budget,
    supports: (symbol) => /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol),

    async getCloses(symbols, date, opts = {}) {
      const since = opts.since ?? BACKFILL_FROM;
      const out: DailyClose[] = [];
      for (const symbol of symbols) {
        const payload = await request(symbol, since, date);
        const meta = metaOf(symbol, payload);
        const chart = toChart(symbol, payload);
        if (!chart) continue; // no sessions in the window (weekend, holiday, nothing new yet)
        const currency = (meta.currency ?? "").trim();
        const byDate = new Map<string, DailyClose>();
        for (const bar of chart.bars) {
          const day = dateInZone(bar.t, zone(meta));
          if (day < since || day > date || !completed(day, meta)) continue;
          byDate.set(day, { symbol, date: day, close: roundPrice(bar.px), currency, source: "yahoo" });
        }
        out.push(...[...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));
      }
      return out;
    },

    async getCorporateActions(symbol, opts = {}) {
      const since = opts.since ?? BACKFILL_FROM;
      const payload = await request(symbol, since, dateInZone(now(), "UTC"));
      const meta = metaOf(symbol, payload);
      const tz = zone(meta);
      const chart = toChart(symbol, payload);
      const actions: CorporateAction[] = [];
      for (const d of chart?.dividends ?? []) {
        const exDate = dateInZone(d.t, tz);
        if (exDate >= since) actions.push({ symbol, exDate, kind: "dividend", cashUnadjusted: Math.round(d.amt * 1e6) / 1e6, source: "yahoo" });
      }
      const splits = payload.chart?.result?.[0]?.events?.splits ?? {};
      for (const s of Object.values(splits)) {
        if (typeof s.date !== "number" || !(Number(s.numerator) > 0) || !(Number(s.denominator) > 0)) continue;
        const exDate = dateInZone(s.date * 1000, tz);
        if (exDate >= since)
          actions.push({ symbol, exDate, kind: "split", splitFrom: s.denominator, splitTo: s.numerator, source: "yahoo" });
      }
      return actions.sort((a, b) => a.exDate.localeCompare(b.exDate) || a.kind.localeCompare(b.kind));
    },

    async getListing(symbol): Promise<ListingInfo | null> {
      const prior = fetched.get(symbol);
      if (!prior) return null;
      const meta = metaOf(symbol, prior.payload);
      const region = listingRegion(meta.exchangeName, meta.fullExchangeName);
      if (!region) return null;
      const code = (meta.exchangeName ?? "").trim();
      const full = (meta.fullExchangeName ?? "").trim();
      return {
        symbol,
        name: (meta.longName || meta.shortName || "").trim() || null,
        exchange: full || code,
        region,
        mic: MIC[code] ?? MIC[full] ?? null,
        currency: (meta.currency ?? "").trim(),
        providerIds: { yahoo: symbol },
      };
    },
  };
}

