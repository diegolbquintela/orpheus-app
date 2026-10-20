/**
 * #170 (spec 43): read the stored Bank of Canada daily rows a record needs (shared `fx_rates`, source `BOC`, written
 * only by the daily job / the backfill script) and average them per month. Server-only, read-only. No row → undefined,
 * so the caller behaves exactly as before.
 */
import type { Queryable } from "../dashboard/store.server.ts";
import { CURRENCIES, readHousehold } from "./currency.ts";
import { FX_HISTORY_FROM, monthlyAverages, type MonthlyFx } from "./fx-history.ts";
import { MONTHS_KEY } from "./months.ts";
import { type MonthKey } from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";

/** The non-CAD codes a record's stored months convert between (foreign lines / people, plus a non-CAD household). */
export function quotesNeeded(record: PfRecord | null): string[] {
  if (!record) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(record[MONTHS_KEY] ?? "null");
  } catch {
    return [];
  }
  if (!raw || typeof raw !== "object") return [];
  const household = readHousehold(new RecordStore(record)).household;
  const out = new Set<string>();
  const known = CURRENCIES as readonly string[];
  for (const m of Object.values(raw as Record<string, Record<string, unknown>>)) {
    for (const list of [m?.fixed, m?.variable])
      if (Array.isArray(list))
        for (const l of list) {
          const c = (l as { currency?: unknown })?.currency;
          if (typeof c === "string" && c !== "" && c !== household && known.includes(c)) out.add(c);
        }
    if (Array.isArray(m?.people))
      for (const p of m.people as { foreign?: unknown; currency?: unknown }[]) {
        if (p?.foreign !== true) continue;
        const c = typeof p.currency === "string" && known.includes(p.currency) ? p.currency : known.find((x) => x !== household)!;
        if (c !== household) out.add(c);
      }
  }
  if (!out.size) return [];
  if (household !== "CAD") out.add(household);
  out.delete("CAD");
  return [...out].sort();
}

const lastDay = (m: MonthKey): string => {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** Monthly averages for the record's quotes, 2020-01 .. `through`; undefined when nothing is needed or stored. */
export async function readMonthlyFx(db: Queryable, record: PfRecord | null, through: MonthKey): Promise<MonthlyFx | undefined> {
  const quotes = quotesNeeded(record);
  if (!quotes.length) return undefined;
  const rows = await db.query<{ quote: string; d: string; v: string }>(
    `SELECT quote, rate_date::text AS d, cad_per_unit::text AS v FROM fx_rates
     WHERE source = 'BOC' AND quote = ANY($1) AND rate_date BETWEEN $2 AND $3`,
    [quotes, `${FX_HISTORY_FROM}-01`, lastDay(through)],
  );
  if (!rows.length) return undefined;
  return monthlyAverages(rows.map((r) => ({ quote: r.quote, date: r.d, cadPerUnit: r.v })));
}
