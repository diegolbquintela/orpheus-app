/**
 * Metric computation from stored annual facts (spec §8). T09 (#17): revenue growth 1y and revenue CAGR
 * 3y/5y/10y. Runs only in the background (after the SEC ingest in `refreshFundamentals`, and in the daily
 * run for covered symbols whose rows are missing); pages read `metric_values` only.
 *
 * - FY0 = the company's latest stored fiscal year end (any concept). FY−n = the stored fiscal year end
 *   n years earlier (± 45 days, for 52/53-week years and FYE changes; the closest wins).
 * - `rev_g_1y` = Rev FY0 / Rev FY−1 − 1; `n/m` when either value is ≤ 0 or missing.
 * - `rev_cagr_Ny` = (Rev FY0 / Rev FY−n)^(1/n) − 1; `n/m` when either endpoint is ≤ 0 or Rev FY0 is
 *   missing; `insufficient_history` when Rev FY−n is missing.
 * Values are fractions (0.0187 = 1.87%); negative growth is a real value.
 *
 * T10 (#18) `roic_1y` = NOPAT FY0 / average invested capital (FY0, FY−1), see `roic()`.
 */
import type { MetricStatus, Queryable } from "./store.server.ts";

export type RevenueFact = { fiscalYearEnd: string; value: number };
export type ComputedMetric = { key: string; value: number | null; status: MetricStatus; fiscalYearEnd: string | null };

export const REVENUE_METRIC_KEYS = ["rev_g_1y", "rev_cagr_3y", "rev_cagr_5y", "rev_cagr_10y"] as const;
const SPANS: [string, number][] = [
  ["rev_g_1y", 1],
  ["rev_cagr_3y", 3],
  ["rev_cagr_5y", 5],
  ["rev_cagr_10y", 10],
];
/** How far a fiscal year end may sit from exactly n years before FY0 and still count as FY−n. */
export const FYE_TOLERANCE_DAYS = 45;

const dayMs = 86_400_000;
const parse = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
function yearsBefore(iso: string, n: number): number {
  const [y, m, d] = iso.split("-").map(Number);
  // Same calendar day n years earlier (29 Feb → 28 Feb).
  const last = new Date(Date.UTC(y - n, m, 0)).getUTCDate();
  return Date.UTC(y - n, m - 1, Math.min(d, last));
}

/** The stored fiscal year end n years before `fy0`, if any. */
export function fiscalYearBack(fyEnds: string[], fy0: string, n: number): string | null {
  const target = yearsBefore(fy0, n);
  let best: string | null = null;
  let bestGap = Infinity;
  for (const e of fyEnds) {
    const gap = Math.abs(parse(e) - target);
    if (gap <= FYE_TOLERANCE_DAYS * dayMs && gap < bestGap) [best, bestGap] = [e, gap];
  }
  return best;
}

/** Revenue growth and CAGRs for one company. `fy0` = its latest fiscal year end (any concept). */
export function revenueGrowth(revenue: RevenueFact[], fy0: string | null): ComputedMetric[] {
  const byEnd = new Map(revenue.map((r) => [r.fiscalYearEnd, r.value]));
  const ends = [...byEnd.keys()];
  return SPANS.map(([key, n]) => {
    if (!fy0) return { key, value: null, status: "n/m", fiscalYearEnd: null };
    const now = byEnd.get(fy0);
    const backEnd = fiscalYearBack(ends, fy0, n);
    const base = backEnd ? byEnd.get(backEnd) : undefined;
    if (now === undefined || !(now > 0)) return { key, value: null, status: "n/m", fiscalYearEnd: fy0 };
    if (base === undefined) return { key, value: null, status: n === 1 ? "n/m" : "insufficient_history", fiscalYearEnd: fy0 };
    if (!(base > 0)) return { key, value: null, status: "n/m", fiscalYearEnd: fy0 };
    const value = n === 1 ? now / base - 1 : (now / base) ** (1 / n) - 1;
    return { key, value, status: "ok", fiscalYearEnd: fy0 };
  });
}

// ------------------------------------------------------------------ ROIC (T10)

/** Annual facts by fiscal year end, then concept (numbers). */
export type FactTable = Map<string, Map<string, number>>;

export const ROIC_DEFAULT_TAX = 0.25;
export const ROIC_TAX_CAP = 0.5;
/** SIC 6000–6399: banks, credit, brokers, insurers (spec §8: ROIC not meaningful). */
export const isFinancialSic = (sic: number | null | undefined) => typeof sic === "number" && sic >= 6000 && sic <= 6399;

/** t = income tax / pre-tax income, clamped to 0–50%; 25% when pre-tax income ≤ 0 or either is missing. */
export function roicTaxRate(tax: number | undefined, pretax: number | undefined): { rate: number; fallback: boolean } {
  if (tax === undefined || pretax === undefined || !(pretax > 0)) return { rate: ROIC_DEFAULT_TAX, fallback: true };
  return { rate: Math.min(ROIC_TAX_CAP, Math.max(0, tax / pretax)), fallback: false };
}

/**
 * Invested capital at one balance-sheet date, or null when no equity is reported there:
 * equity (incl. non-controlling interests; the parent's equity when the filer reports no NCI total)
 * + short-term debt (short-term borrowings, else commercial paper + other short-term borrowings)
 * + long-term debt incl. the current portion (the total, else current + noncurrent)
 * − cash and cash equivalents. IFRS filers that only report "current borrowings incl. the current portion
 * of non-current borrowings" use that for the two current parts. Missing debt or cash lines count as 0
 * (a filer without debt doesn't tag it). Leases: operating lease liabilities are never included.
 */
export function investedCapital(f: Map<string, number> | undefined): number | null {
  if (!f) return null;
  const equity = f.get("equity_incl_nci") ?? f.get("equity_parent");
  if (equity === undefined) return null;
  const g = (k: string) => f.get(k) ?? 0;
  const hasShort = f.has("short_term_borrowings") || f.has("commercial_paper") || f.has("other_short_term_borrowings");
  const hasLtdCurrent = f.has("long_term_debt_current");
  let debt: number;
  if (f.has("current_borrowings_total") && !hasShort && !hasLtdCurrent && !f.has("long_term_debt")) {
    debt = g("current_borrowings_total") + g("long_term_debt_noncurrent");
  } else {
    const shortTerm = f.has("short_term_borrowings") ? g("short_term_borrowings") : g("commercial_paper") + g("other_short_term_borrowings");
    const longTerm = f.has("long_term_debt") ? g("long_term_debt") : g("long_term_debt_current") + g("long_term_debt_noncurrent");
    debt = shortTerm + longTerm;
  }
  return equity + debt - g("cash");
}

/**
 * ROIC (1y) = NOPAT FY0 / average invested capital (FY0, FY−1); NOPAT = operating income × (1 − t).
 * `n/m`: SIC 6000–6399 or no operating income at FY0 (banks, insurers), no equity at FY0, or average
 * invested capital ≤ 0. `insufficient_history`: no FY−1 balance sheet (equity) for the average.
 * Negative ROIC (negative operating income) is a real value.
 */
export function roic(facts: FactTable, fy0: string | null, sic: number | null): ComputedMetric & { taxFallback?: boolean } {
  const key = "roic_1y";
  if (!fy0) return { key, value: null, status: "n/m", fiscalYearEnd: null };
  const now = facts.get(fy0);
  const oi = now?.get("operating_income");
  if (isFinancialSic(sic) || oi === undefined) return { key, value: null, status: "n/m", fiscalYearEnd: fy0 };
  const icNow = investedCapital(now);
  if (icNow === null) return { key, value: null, status: "n/m", fiscalYearEnd: fy0 };
  const prevEnd = fiscalYearBack([...facts.keys()], fy0, 1);
  const icPrev = prevEnd ? investedCapital(facts.get(prevEnd)) : null;
  if (icPrev === null) return { key, value: null, status: "insufficient_history", fiscalYearEnd: fy0 };
  const avg = (icNow + icPrev) / 2;
  if (!(avg > 0)) return { key, value: null, status: "n/m", fiscalYearEnd: fy0 };
  const t = roicTaxRate(now?.get("income_tax"), now?.get("pretax_income"));
  return { key, value: (oi * (1 - t.rate)) / avg, status: "ok", fiscalYearEnd: fy0, taxFallback: t.fallback };
}

// ------------------------------------------------------------------ storage

/** Metric keys computed so far (T09, T10); T11–T13 add theirs. */
export const COMPUTED_METRIC_KEYS = [...REVENUE_METRIC_KEYS, "roic_1y"] as const;

/** Recompute every implemented metric for one covered symbol from `fundamentals_annual` and store them. */
export async function computeStoredMetrics(db: Queryable, symbol: string): Promise<ComputedMetric[]> {
  const rows = await db.query<{ fye: string; concept: string; value: string }>(
    `SELECT fiscal_year_end::text AS fye, concept, value::text AS value FROM fundamentals_annual WHERE symbol = $1`,
    [symbol],
  );
  const inst = await db.query<{ sic: number | null }>("SELECT sic FROM instruments WHERE symbol = $1", [symbol]);
  const fy0 = rows.map((r) => r.fye).sort().at(-1) ?? null;
  const revenue = rows.filter((r) => r.concept === "revenue").map((r) => ({ fiscalYearEnd: r.fye, value: Number(r.value) }));
  const table: FactTable = new Map();
  for (const r of rows) {
    if (!table.has(r.fye)) table.set(r.fye, new Map());
    table.get(r.fye)!.set(r.concept, Number(r.value));
  }
  const { taxFallback: _t, ...roicRow } = roic(table, fy0, inst[0]?.sic ?? null);
  void _t;
  const out = [...revenueGrowth(revenue, fy0), roicRow];
  for (const m of out)
    await db.query(
      `INSERT INTO metric_values (symbol, metric_key, value, status, fiscal_year_end, computed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (symbol, metric_key) DO UPDATE SET value = EXCLUDED.value, status = EXCLUDED.status,
         fiscal_year_end = EXCLUDED.fiscal_year_end, computed_at = EXCLUDED.computed_at`,
      [symbol, m.key, m.value === null ? null : m.value.toPrecision(12), m.status, m.fiscalYearEnd],
    );
  return out;
}

/** Covered symbols (SEC facts stored) that lack a row for an implemented metric: e.g. ingested earlier. */
export async function symbolsMissingMetrics(db: Queryable): Promise<string[]> {
  const rows = await db.query<{ symbol: string }>(
    `SELECT i.symbol FROM instruments i
     WHERE i.fundamentals_source = 'sec'
       AND i.symbol IN (SELECT DISTINCT symbol FROM holdings)
       AND (SELECT count(*) FROM metric_values m WHERE m.symbol = i.symbol AND m.metric_key = ANY($1::text[])) < $2
     ORDER BY i.symbol`,
    [COMPUTED_METRIC_KEYS as unknown as string[], COMPUTED_METRIC_KEYS.length],
  );
  return rows.map((r) => r.symbol);
}
