/**
 * Metric column catalog (spec §1, §8; T08 #16). Shared by the server (column API validation) and the
 * page (picker labels). The values themselves are computed by T09–T13 into `metric_values`; T08 only
 * stores the raw annual facts and marks symbols without SEC coverage as `not_covered`.
 */
export const METRICS = [
  { key: "rev_g_1y", label: "Revenue growth 1y" },
  { key: "rev_cagr_3y", label: "Revenue CAGR 3y" },
  { key: "rev_cagr_5y", label: "Revenue CAGR 5y" },
  { key: "rev_cagr_10y", label: "Revenue CAGR 10y" },
  { key: "roic_1y", label: "ROIC (1y)" },
  { key: "eps_1y", label: "EPS (1y)" },
  { key: "ebit_margin_1y", label: "EBIT margin (1y)" },
  { key: "gross_margin_1y", label: "Gross margin (1y)" },
] as const;

export type MetricKey = (typeof METRICS)[number]["key"];
export const METRIC_KEYS: MetricKey[] = METRICS.map((m) => m.key);
export const isMetricKey = (k: unknown): k is MetricKey => typeof k === "string" && (METRIC_KEYS as string[]).includes(k);
export const metricLabel = (k: string) => METRICS.find((m) => m.key === k)?.label ?? k;

/**
 * Chips (epic #53 ticket 4, #57; spec §0.2 "Metrics sheet", §0.5 items 3–4): the eight metrics plus
 * `Share of the book` (the row's weight, not a stored metric). Saved per user in `user_metric_columns`
 * (position = chip order); a user who never saved any gets `DEFAULT_CHIPS`.
 */
export const SHARE_OF_BOOK = "share_of_book" as const;
export const CHIPS = [...METRICS, { key: SHARE_OF_BOOK, label: "Share of the book" }] as const;
export type ChipKey = (typeof CHIPS)[number]["key"];
export const CHIP_KEYS: ChipKey[] = CHIPS.map((c) => c.key);
export const isChipKey = (k: unknown): k is ChipKey => typeof k === "string" && (CHIP_KEYS as string[]).includes(k);
export const chipLabel = (k: string) => CHIPS.find((c) => c.key === k)?.label ?? k;
/** DR4-03: Revenue growth 1y, ROIC (1y), Share of the book, in that order. */
export const DEFAULT_CHIPS: ChipKey[] = ["rev_g_1y", "roic_1y", SHARE_OF_BOOK];

/** Search (#57, DR4-04): chips not kept yet whose label contains every word of the query (case-insensitive). */
export function matchingChips(query: string, kept: readonly string[]) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return CHIPS.filter((c) => !kept.includes(c.key) && words.every((w) => c.label.toLowerCase().includes(w)));
}

/** How a metric is computed, shown as the column header's and the cells' tooltip (spec §8). */
export const METRIC_HELP: Partial<Record<MetricKey, string>> = {
  gross_margin_1y:
    "Gross margin (1y) = gross profit ÷ revenue for the latest fiscal year, as reported to the SEC; when no gross profit is reported, " +
    "(revenue − cost of revenue) ÷ revenue. Not meaningful when revenue is zero or negative or neither is reported (e.g. banks).",
  ebit_margin_1y:
    "EBIT margin (1y) = operating income ÷ revenue for the latest fiscal year, both as reported to the SEC (no adjustments). " +
    "Not meaningful when revenue is zero or negative or no operating income is reported (e.g. banks).",
  eps_1y: "EPS (1y) = diluted earnings per share for the latest fiscal year, as reported to the SEC, in the reporting currency.",
  roic_1y:
    "ROIC (1y) = NOPAT ÷ average invested capital (latest and prior fiscal year). NOPAT = operating income × (1 − tax rate); " +
    "tax rate = income tax ÷ pre-tax income, limited to 0–50%, or 25% when pre-tax income is ≤ 0 or tax is missing. " +
    "Invested capital = equity incl. non-controlling interests + short- and long-term debt − cash. Leases excluded " +
    "(debt that includes finance leases is used only when a filer reports no other debt figure for that year). " +
    "Not meaningful for banks and insurers.",
};

/** Reason text for a `—` cell (spec §8: shown on hover/tap). */
export const STATUS_REASON: Record<string, string> = {
  not_covered: "not covered",
  "n/m": "not meaningful",
  insufficient_history: "insufficient history",
  insufficient_data: "insufficient data",
  pending: "coverage check pending",
  not_computed: "not computed yet",
};
