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

/** How a metric is computed, shown as the column header's and the cells' tooltip (spec §8). */
export const METRIC_HELP: Partial<Record<MetricKey, string>> = {
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
