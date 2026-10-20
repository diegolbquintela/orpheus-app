/**
 * #170 (spec section 43, PFFX-*): historical FX for past months. Pure; no network, no database.
 *
 * - Source (Q-AH1, Diego): Bank of Canada daily rows, CAD per 1 unit, as stored in `fx_rates` (source `BOC`).
 * - A month's rate (Q-AH4a, Diego) is the mean of that month's stored business-day rows; the partial current month
 *   uses the days published so far (Q-AH9).
 * - A line or person in a foreign currency in month M uses M's historical rate when both currencies have one
 *   (crossing through CAD for a non-CAD household, Q-AH10); otherwise its typed rate, as today (Q-AH4d, Diego).
 * - `fx_basis` (Q-AH7, CFO change, spec 43.8), over the stored months up to the response's last month: `"historical"`
 *   when every foreign conversion used a historical rate, `"current"` when none did, `"mixed"` otherwise (with the
 *   months that fell back, `fx_fallback_months`).
 * - With no usable historical rate the record object is returned untouched, so every response is byte-identical.
 */
import { CURRENCIES, readHousehold, type CurrencyCode } from "./currency.ts";
import { MONTHS_KEY } from "./months.ts";
import { type MonthKey } from "./overview.ts";
import { RecordStore, type PfRecord } from "./record.ts";

/** The PF currencies the BoC publishes (every non-CAD code in `CURRENCIES`). */
export const PF_BOC_QUOTES: readonly string[] = CURRENCIES.filter((c) => c !== "CAD");
/** The earliest month backfilled (Q-AH2, Diego). */
export const FX_HISTORY_FROM = "2020-01";

export type DailyRate = { quote: string; date: string; cadPerUnit: string };
/** month → quote → mean CAD per unit. */
export type MonthlyFx = Record<MonthKey, Record<string, number>>;
export type FxBasis = "current" | "historical" | "mixed";
export type FxResult = { record: PfRecord | null; basis: FxBasis; fallbackMonths: MonthKey[] };

/** Q-AH4a: the mean of each month's daily rows per quote (rows that are not a positive number are skipped). */
export function monthlyAverages(rows: readonly DailyRate[]): MonthlyFx {
  const acc: Record<string, Record<string, { sum: number; n: number }>> = {};
  for (const r of rows) {
    const v = Number(r.cadPerUnit);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !(v > 0) || !Number.isFinite(v)) continue;
    const m = r.date.slice(0, 7);
    const q = ((acc[m] ??= {})[r.quote] ??= { sum: 0, n: 0 });
    q.sum += v;
    q.n += 1;
  }
  const out: MonthlyFx = {};
  for (const [m, qs] of Object.entries(acc)) {
    out[m] = {};
    for (const [q, { sum, n }] of Object.entries(qs)) out[m][q] = sum / n;
  }
  return out;
}

/** CAD per unit for `quote` in `month` (CAD is 1), or null. */
const cadPer = (fx: MonthlyFx, month: MonthKey, quote: string): number | null =>
  quote === "CAD" ? 1 : (fx[month]?.[quote] ?? null);

/**
 * The PF rate (#102 direction: units of `foreign` per 1 unit of `household`) for `month`, crossing through CAD:
 * (CAD per household unit) ÷ (CAD per foreign unit). Null when either side has no rate that month.
 */
export function historicalRate(fx: MonthlyFx, month: MonthKey, foreign: string, household: string): number | null {
  const h = cadPer(fx, month, household);
  const f = cadPer(fx, month, foreign);
  return h === null || f === null ? null : h / f;
}

/** A rate as typed text the PF parser accepts (no exponent; 20 decimals, so the number reads back exactly; trailing zeros dropped). */
export const rateText = (n: number): string => n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The record with each stored month's foreign lines and people re-rated at that month's historical rate (months up
 * to `through`), and the response's `fx_basis` (Q-AH7). Untouched (same object) when nothing used a historical rate.
 */
export function applyHistoricalFx(
  record: PfRecord | null,
  fx: MonthlyFx | undefined,
  through: MonthKey,
  // #170 QA G1 (spec 43.11): the months whose conversion feeds a value in the reply; only they count toward
  // fx_basis / fx_fallback_months. Default: every month up to `through`.
  inScope: (k: MonthKey) => boolean = () => true,
): FxResult {
  const none: FxResult = { record, basis: "current", fallbackMonths: [] };
  if (!record || !fx) return none;
  let raw: unknown;
  try {
    raw = JSON.parse(record[MONTHS_KEY] ?? "null");
  } catch {
    return none;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return none;
  const household: CurrencyCode = readHousehold(new RecordStore(record)).household;
  let foreign = 0;
  let used = 0;
  const fallback = new Set<MonthKey>();
  const months: Raw = {};
  for (const [k, m] of Object.entries(raw as Raw)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k) || k > through || !m || typeof m !== "object") {
      months[k] = m;
      continue;
    }
    const mm = m as Raw;
    const relate = (item: unknown, currency: string): unknown => {
      if (!item || typeof item !== "object") return item;
      const counted = inScope(k);
      if (counted) foreign += 1;
      const r = historicalRate(fx, k, currency, household);
      if (r === null) {
        if (counted) fallback.add(k);
        return item;
      }
      if (counted) used += 1;
      return { ...(item as Raw), rate: rateText(r) };
    };
    const lines = (list: unknown) =>
      Array.isArray(list)
        ? list.map((l) => {
            const c = str((l as Raw)?.currency);
            return c !== "" && c !== household ? relate(l, c) : l;
          })
        : list;
    const people = Array.isArray(mm.people)
      ? mm.people.map((p) => {
          const pp = (p ?? {}) as Raw;
          // personCurrency: as stored, else the first code that isn't the household's.
          const c = (CURRENCIES as readonly string[]).includes(str(pp.currency)) ? str(pp.currency) : (CURRENCIES.find((x) => x !== household) as string);
          return pp.foreign === true && c !== household ? relate(p, c) : p;
        })
      : mm.people;
    months[k] = { ...mm, fixed: lines(mm.fixed), variable: lines(mm.variable), ...(mm.people !== undefined ? { people } : {}) };
  }
  // Nothing in scope used a historical rate: every value in the reply is the typed-rate value, so the original record.
  if (!used) return none;
  const basis: FxBasis = used === foreign ? "historical" : "mixed";
  return { record: { ...record, [MONTHS_KEY]: JSON.stringify(months) }, basis, fallbackMonths: basis === "mixed" ? [...fallback].sort() : [] };
}
