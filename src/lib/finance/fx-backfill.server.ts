/**
 * #170 (spec 43, Q-AH2 Diego): backfill Bank of Canada daily rates for the PF currencies into the existing `fx_rates`
 * table (source `BOC`, CAD per 1 unit), from 2020-01-01 to `today`. Idempotent: `ON CONFLICT (quote, rate_date) DO
 * NOTHING`, so a second run inserts 0 rows. No key, no migration. Run only by EL with the runbook
 * `docs/release/2026-10-20-pf-fx-backfill.md`; tests pass a recorded fetch.
 */
import type { Queryable } from "../dashboard/store.server.ts";
import { FX_HISTORY_FROM, PF_BOC_QUOTES } from "./fx-history.ts";

export const VALET_URL = "https://www.bankofcanada.ca/valet/observations";
export const valetSeries = (q: string): string => `FX${q}CAD`;

export type ValetRow = { quote: string; date: string; cadPerUnit: string };

/** Parse a Valet observations JSON (several `FX<CCY>CAD` series) into rows; bad values are skipped. Pure. */
export function parseValet(json: unknown, quotes: readonly string[]): ValetRow[] {
  const obs = (json as { observations?: Array<Record<string, unknown>> })?.observations;
  if (!Array.isArray(obs)) throw new Error("Bank of Canada: unexpected response.");
  const out: ValetRow[] = [];
  for (const o of obs) {
    const date = typeof o.d === "string" ? o.d : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const q of quotes) {
      const v = (o[valetSeries(q)] as { v?: unknown } | undefined)?.v;
      if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && Number(v) > 0) out.push({ quote: q, date, cadPerUnit: v });
    }
  }
  return out;
}

export const valetUrl = (quotes: readonly string[], start: string, end: string): string =>
  `${VALET_URL}/${quotes.map(valetSeries).join(",")}/json?start_date=${start}&end_date=${end}`;

export type BackfillSummary = { fetched: number; inserted: number; quotes: string[]; from: string; to: string };

/** Fetch and insert; `get` returns the response text for a URL (the script passes a real fetch). */
export async function backfillPfFx(
  db: Queryable,
  get: (url: string) => Promise<string>,
  opts: { today: string; from?: string; quotes?: readonly string[] },
): Promise<BackfillSummary> {
  const from = opts.from ?? `${FX_HISTORY_FROM}-01`;
  if (from < `${FX_HISTORY_FROM}-01`) throw new Error(`Backfill starts no earlier than ${FX_HISTORY_FROM}-01.`);
  const quotes = [...(opts.quotes ?? PF_BOC_QUOTES)];
  const rows = parseValet(JSON.parse(await get(valetUrl(quotes, from, opts.today))), quotes).filter(
    (r) => r.date >= from && r.date <= opts.today,
  );
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const done = await db.query(
      `INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source)
       SELECT q, d::date, v::numeric, 'BOC' FROM unnest($1::text[], $2::text[], $3::text[]) AS t(q, d, v)
       ON CONFLICT (quote, rate_date) DO NOTHING RETURNING quote`,
      [part.map((r) => r.quote), part.map((r) => r.date), part.map((r) => r.cadPerUnit)],
    );
    inserted += done.length;
  }
  return { fetched: rows.length, inserted, quotes, from, to: opts.today };
}
