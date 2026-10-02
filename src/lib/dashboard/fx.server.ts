/**
 * FX rates and base currency (spec §10; ticket T06 #14; D8). Server-only.
 *
 * - Source: Bank of Canada Valet, CAD per 1 unit, daily averages ("indicative", published by 16:30 ET on
 *   business days): `FXUSDCAD` and `FXEURCAD` always, `FXSEKCAD` / `FXPLNCAD` when a held listing trades in
 *   SEK / PLN. Stored exactly as Valet returns them (e.g. "1.4188"), source `BOC`.
 * - DKK, HUF, CZK (not published by the BoC): the ECB euro reference rate (X per EUR) crossed with the
 *   stored BoC `FXEURCAD` for the **same date**: CAD per X = FXEURCAD / (X per EUR), source `ECB_CROSS`.
 *   A date missing from either source gets no cross rate (lookups fall back to the previous date).
 * - Fetching runs only in the daily job (cron, preview button) and the new-holding background job.
 *   Inserts are `ON CONFLICT DO NOTHING` and each quote is requested only from the day after its last
 *   stored date, so a stored date is never fetched again.
 * - Lookups (`rateOnOrBefore`) use the rate for the price's session date, else the latest earlier one,
 *   and return the date actually used so the page can show it. USD/EUR bases cross through CAD.
 */
import { addDays } from "./close-provider.ts";
import { isCalendarDate } from "./dates.ts";
import type { BaseCurrency, Queryable } from "./store.server.ts";

/** Currencies the BoC publishes that the dashboard can need (US/EU/CA listings). */
export const BOC_SERIES: Record<string, string> = {
  USD: "FXUSDCAD",
  EUR: "FXEURCAD",
  SEK: "FXSEKCAD",
  PLN: "FXPLNCAD",
};
/** EU listing currencies the BoC doesn't publish: CAD per X = BoC FXEURCAD ÷ ECB X-per-EUR (same date). */
export const ECB_CROSS: readonly string[] = ["DKK", "HUF", "CZK"];
/** Always fetched: the non-CAD bases. */
export const ALWAYS: readonly string[] = ["USD", "EUR"];
/** First fetch window for a quote with nothing stored. */
export const INITIAL_DAYS = 30;

export const BOC_URL = "https://www.bankofcanada.ca/valet/observations";
/** Last 90 days of ECB reference rates (no key). Older dates aren't needed: rates follow the closes. */
export const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

export type BocDay = { date: string; rates: Record<string, string> };
export type EcbDay = { date: string; rates: Record<string, string> };

export interface FxFetcher {
  /** BoC observations for `quotes` (e.g. ["USD","EUR"]) from `start` to `end`, CAD per unit. */
  boc(quotes: string[], start: string, end: string): Promise<BocDay[]>;
  /** ECB reference rates (X per EUR) for `quotes` from `start` to `end`. */
  ecb(quotes: string[], start: string, end: string): Promise<EcbDay[]>;
}

/** Parse a Valet `observations/<series>/json` response into per-date rates keyed by quote. */
export function parseBocValet(json: unknown, quotes: string[]): BocDay[] {
  const obs = (json as { observations?: Array<Record<string, unknown>> })?.observations;
  if (!Array.isArray(obs)) throw new Error("Bank of Canada: unexpected response.");
  const out: BocDay[] = [];
  for (const o of obs) {
    const date = typeof o.d === "string" ? o.d : "";
    if (!isCalendarDate(date)) continue;
    const rates: Record<string, string> = {};
    for (const q of quotes) {
      const v = (o[BOC_SERIES[q]] as { v?: unknown } | undefined)?.v;
      if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && Number(v) > 0) rates[q] = v;
    }
    if (Object.keys(rates).length) out.push({ date, rates });
  }
  return out;
}

/** Parse the ECB eurofxref XML (`<Cube time="…"><Cube currency="DKK" rate="7.4754"/>…`). */
export function parseEcbXml(xml: string, quotes: readonly string[]): EcbDay[] {
  if (!/eurofxref/.test(xml)) throw new Error("ECB: unexpected response.");
  const out: EcbDay[] = [];
  const day = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  for (let m = day.exec(xml); m; m = day.exec(xml)) {
    const rates: Record<string, string> = {};
    const rate = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']\s*\/>/g;
    for (let r = rate.exec(m[2]); r; r = rate.exec(m[2]))
      if (quotes.includes(r[1]) && Number(r[2]) > 0) rates[r[1]] = r[2];
    if (Object.keys(rates).length && isCalendarDate(m[1])) out.push({ date: m[1], rates });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "orpheus-app dashboard (daily FX job)", Accept: "application/json, application/xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** The live fetcher (Valet JSON, ECB 90-day XML). Tests pass a fake one with recorded responses. */
export function createFxFetcher(get: (url: string) => Promise<string> = fetchText): FxFetcher {
  return {
    async boc(quotes, start, end) {
      const series = quotes.map((q) => BOC_SERIES[q]).join(",");
      let text: string;
      try {
        text = await get(`${BOC_URL}/${series}/json?start_date=${start}&end_date=${end}`);
      } catch (err) {
        throw new Error(`Bank of Canada request failed (${(err as Error).message}).`);
      }
      return parseBocValet(JSON.parse(text), quotes).filter((d) => d.date >= start && d.date <= end);
    },
    async ecb(quotes, start, end) {
      let text: string;
      try {
        text = await get(ECB_URL);
      } catch (err) {
        throw new Error(`ECB request failed (${(err as Error).message}).`);
      }
      return parseEcbXml(text, quotes).filter((d) => d.date >= start && d.date <= end);
    },
  };
}

export type FxSummary = { inserted: number; quotes: string[]; unsupported: string[]; errors: string[] };

async function lastStored(db: Queryable, quote: string): Promise<string | null> {
  const rows = await db.query<{ d: string | null }>("SELECT max(rate_date)::text AS d FROM fx_rates WHERE quote = $1", [quote]);
  return rows[0]?.d ?? null;
}

async function insertRate(db: Queryable, quote: string, date: string, cadPerUnit: string, source: "BOC" | "ECB_CROSS") {
  const rows = await db.query(
    `INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source) VALUES ($1, $2, $3, $4)
     ON CONFLICT (quote, rate_date) DO NOTHING RETURNING quote`,
    [quote, date, cadPerUnit, source],
  );
  return rows.length;
}

/** Listing currencies of held symbols (from `instruments`, written by the daily close job). */
export async function heldCurrencies(db: Queryable): Promise<string[]> {
  const rows = await db.query<{ currency: string }>(
    `SELECT DISTINCT i.currency FROM instruments i WHERE i.symbol IN (SELECT DISTINCT symbol FROM holdings) ORDER BY 1`,
  );
  return rows.map((r) => r.currency);
}

/**
 * Fill missing FX dates up to `today`: BoC for USD/EUR (+ SEK/PLN when held), then the ECB cross for
 * DKK/HUF/CZK when held. Never throws for a source problem; errors are returned.
 */
export async function refreshFx(db: Queryable, fetcher: FxFetcher, opts: { today: string }): Promise<FxSummary> {
  const held = await heldCurrencies(db);
  const wanted = [...new Set([...ALWAYS, ...held])].filter((c) => c !== "CAD");
  const boc = wanted.filter((c) => BOC_SERIES[c]);
  const cross = wanted.filter((c) => ECB_CROSS.includes(c));
  const summary: FxSummary = {
    inserted: 0,
    quotes: [...boc, ...cross],
    unsupported: wanted.filter((c) => !BOC_SERIES[c] && !ECB_CROSS.includes(c)),
    errors: [],
  };
  // First window: 30 days, or back to a week before the oldest latest close a holding has.
  const oldest = await db.query<{ d: string | null }>(
    `SELECT min(last_session_date)::text AS d FROM price_coverage WHERE symbol IN (SELECT DISTINCT symbol FROM holdings)`,
  );
  let initial = addDays(opts.today, -INITIAL_DAYS);
  if (oldest[0]?.d && addDays(oldest[0].d, -7) < initial) initial = addDays(oldest[0].d, -7);
  const startOf = async (q: string) => {
    const last = await lastStored(db, q);
    return last ? addDays(last, 1) : initial;
  };

  // BoC: one request per distinct start date (normally one for all quotes).
  const byStart = new Map<string, string[]>();
  for (const q of boc) {
    const s = await startOf(q);
    if (s <= opts.today) byStart.set(s, [...(byStart.get(s) ?? []), q]);
  }
  for (const [start, quotes] of byStart) {
    try {
      for (const day of await fetcher.boc(quotes, start, opts.today))
        for (const [q, v] of Object.entries(day.rates)) summary.inserted += await insertRate(db, q, day.date, v, "BOC");
    } catch (err) {
      summary.errors.push((err as Error).message);
    }
  }

  // ECB cross: needs the stored BoC FXEURCAD for the same date.
  const crossStarts = new Map<string, string>();
  for (const q of cross) {
    const s = await startOf(q);
    if (s <= opts.today) crossStarts.set(q, s);
  }
  if (crossStarts.size) {
    const from = [...crossStarts.values()].sort()[0];
    try {
      const ecb = await fetcher.ecb([...crossStarts.keys()], from, opts.today);
      const eur = new Map(
        (
          await db.query<{ d: string; v: string }>(
            `SELECT rate_date::text AS d, cad_per_unit::text AS v FROM fx_rates
             WHERE quote = 'EUR' AND source = 'BOC' AND rate_date BETWEEN $1 AND $2`,
            [from, opts.today],
          )
        ).map((r) => [r.d, r.v]),
      );
      for (const day of ecb) {
        const eurCad = eur.get(day.date);
        if (!eurCad) continue; // BoC holiday or not published yet: no cross for that date
        for (const [q, perEur] of Object.entries(day.rates)) {
          if (day.date < (crossStarts.get(q) ?? "9999")) continue;
          const cad = (Number(eurCad) / Number(perEur)).toPrecision(10);
          summary.inserted += await insertRate(db, q, day.date, cad, "ECB_CROSS");
        }
      }
    } catch (err) {
      summary.errors.push((err as Error).message);
    }
  }
  return summary;
}

// ------------------------------------------------------------------ lookups (pages; Postgres only)

export type RateUsed = { quote: string; cadPerUnit: string; rateDate: string; source: string };

/** CAD per 1 unit of `quote` on `date`, else the latest earlier stored rate; CAD is 1. Null if none. */
export async function rateOnOrBefore(db: Queryable, quote: string, date: string): Promise<RateUsed | null> {
  if (quote === "CAD") return { quote, cadPerUnit: "1", rateDate: date, source: "CAD" };
  const rows = await db.query<{ cad_per_unit: string; rate_date: string; source: string }>(
    `SELECT cad_per_unit::text AS cad_per_unit, rate_date::text AS rate_date, source FROM fx_rates
     WHERE quote = $1 AND rate_date <= $2 ORDER BY rate_date DESC LIMIT 1`,
    [quote, date],
  );
  const r = rows[0];
  return r ? { quote, cadPerUnit: r.cad_per_unit, rateDate: r.rate_date, source: r.source } : null;
}

/** Every stored quote's rate on or before `date` (for `GET /api/dashboard/fx` and the FX note). */
export async function ratesOnOrBefore(db: Queryable, date: string): Promise<RateUsed[]> {
  const rows = await db.query<{ quote: string; cad_per_unit: string; rate_date: string; source: string }>(
    `SELECT DISTINCT ON (quote) quote, cad_per_unit::text AS cad_per_unit, rate_date::text AS rate_date, source
     FROM fx_rates WHERE rate_date <= $1 ORDER BY quote, rate_date DESC`,
    [date],
  );
  return rows.map((r) => ({ quote: r.quote, cadPerUnit: r.cad_per_unit, rateDate: r.rate_date, source: r.source }));
}

/**
 * Convert `amount` in `from` to `base` at the rates for `date` (crossing through CAD):
 * amount × (CAD per `from`) / (CAD per `base`). Null when a rate is missing.
 */
export async function convert(
  db: Queryable,
  amount: number,
  from: string,
  base: BaseCurrency,
  date: string,
): Promise<{ value: number; rates: RateUsed[] } | null> {
  if (from === base) return { value: amount, rates: [] };
  const a = await rateOnOrBefore(db, from, date);
  const b = await rateOnOrBefore(db, base, date);
  if (!a || !b) return null;
  return { value: (amount * Number(a.cadPerUnit)) / Number(b.cadPerUnit), rates: [a, b].filter((r) => r.source !== "CAD") };
}

export type ValuedHolding = {
  symbol: string;
  /** shares × last close, in the base currency; null when price or FX is pending. */
  value: number | null;
  /** Rates used (non-CAD), with their dates; `fallback` when a rate is older than the session date. */
  rates: RateUsed[];
  sessionDate: string | null;
  fallback: boolean;
  status: "ok" | "price_pending" | "fx_pending";
};

export type Valuation = { base: BaseCurrency; rows: ValuedHolding[]; total: number; excluded: string[] };

/**
 * Re-express each holding's position (shares × last stored close) and the total in `base`, using the FX
 * rate for each close's session date (D8: one current rate; the cost basis uses the same rate in T07).
 * Reads Postgres only.
 */
export async function valueHoldings(
  db: Queryable,
  holdings: { symbol: string; shares: string }[],
  prices: Record<string, { close: string | null; currency: string | null; sessionDate: string | null } | undefined>,
  base: BaseCurrency,
): Promise<Valuation> {
  const rows: ValuedHolding[] = [];
  let total = 0;
  const excluded: string[] = [];
  for (const h of holdings) {
    const p = prices[h.symbol];
    if (!p || p.close === null || !p.currency || !p.sessionDate) {
      rows.push({ symbol: h.symbol, value: null, rates: [], sessionDate: null, fallback: false, status: "price_pending" });
      excluded.push(h.symbol);
      continue;
    }
    const c = await convert(db, Number(h.shares) * Number(p.close), p.currency, base, p.sessionDate);
    if (!c) {
      rows.push({ symbol: h.symbol, value: null, rates: [], sessionDate: p.sessionDate, fallback: false, status: "fx_pending" });
      excluded.push(h.symbol);
      continue;
    }
    total += c.value;
    rows.push({
      symbol: h.symbol,
      value: c.value,
      rates: c.rates,
      sessionDate: p.sessionDate,
      fallback: c.rates.some((r) => r.rateDate < (p.sessionDate as string)),
      status: "ok",
    });
  }
  return { base, rows, total, excluded };
}
