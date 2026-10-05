import { formatEps, formatPortfolioCell } from "@/lib/dashboard/format";
import { METRIC_HELP, STATUS_REASON, type MetricKey } from "@/lib/dashboard/metrics";

const help = (key: string) => METRIC_HELP[key as MetricKey];

/**
 * Metric cells on /dashboard (T08 #16; the chips and the sheet are `metrics-sheet.tsx` since #57). Values
 * come from `metric_values` (computed by T09–T13). A missing figure (not covered, n/m, insufficient history
 * or data, coverage check pending, not computed yet) is `—` alone (spec §0.2, DR4-07): the reason is in the
 * tooltip and the accessible name only, never visible text. Cells never rate or rank.
 */

export type MetricCellView = { value: string | null; status: string; fiscalYearEnd: string | null; currency?: string | null };
export type MetricViewData = { coverage: "covered" | "not_covered" | "pending"; metrics: Record<string, MetricCellView> };

const PERCENT = (v: number) => `${(v * 100).toFixed(1)}%`;

/** One metric cell: a stored value, or "—" with the reason (spec §8). */
export function MetricCell({ metricKey, view }: { metricKey: string; view: MetricViewData | undefined }) {
  const cell = view?.metrics[metricKey];
  const status =
    view?.coverage === "not_covered"
      ? "not_covered"
      : cell
        ? cell.status
        : view?.coverage === "covered"
          ? "not_computed"
          : "pending";
  if (status === "ok" && cell?.value != null) {
    const v = Number(cell.value);
    return (
      <span data-testid="metric-cell" data-key={metricKey} data-status="ok" title={[cell.fiscalYearEnd ? `FY ending ${cell.fiscalYearEnd}` : "", help(metricKey) ?? ""].filter(Boolean).join(". ") || undefined}>
        {metricKey === "eps_1y" ? formatEps(v, cell.currency) : PERCENT(v)}
      </span>
    );
  }
  const reason = STATUS_REASON[status] ?? status;
  return (
    <span className="text-muted" data-testid="metric-cell" data-key={metricKey} data-status={status} title={[reason, help(metricKey) ?? ""].filter(Boolean).join(". ")}>
      —<span className="sr-only"> {reason}</span>
    </span>
  );
}

export type PortfolioCellView = { value: number | null; coverage: number | null; source: string; included: string[] };

const PORTFOLIO_HELP =
  "Book: market-value-weighted mean (base currency) over holdings with a figure; weights renormalised over those " +
  "holdings. Coverage = their share of the book's market value. Not meaningful, insufficient history or data, " +
  "and not covered holdings are left out (never counted as zero).";

/** Portfolio row cell (T14, spec §9; DASH-22/23). */
/**
 * The Book figure "19.1% · 84% covered" wraps only between the figure and its coverage (#58), never inside
 * either part; the text content stays exactly the formatted string.
 */
function bookFigure(text: string) {
  const i = text.indexOf(" · ");
  if (i < 0) return text;
  return (
    <>
      <span className="whitespace-nowrap">{text.slice(0, i)} ·</span> <span className="whitespace-nowrap">{text.slice(i + 3)}</span>
    </>
  );
}

export function PortfolioMetricCell({ metricKey, cell }: { metricKey: string; cell: PortfolioCellView | undefined }) {
  const { label, text } = formatPortfolioCell(metricKey, cell);
  const title = [
    metricKey === "eps_1y"
      ? "Weighted 1-year EPS growth (EPS FY0 ÷ EPS FY−1 − 1; not meaningful if either is ≤ 0). EPS amounts in different currencies don't add up, so the portfolio row shows growth"
      : null,
    PORTFOLIO_HELP,
    cell?.included.length ? `Included: ${cell.included.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <span
      className={cell?.value == null ? "text-muted" : undefined}
      data-testid="portfolio-metric"
      data-key={metricKey}
      data-source={cell?.source ?? ""}
      data-coverage={cell?.coverage ?? ""}
      title={title}
    >
      <span data-testid="portfolio-metric-value">{bookFigure(text)}</span>
      {label ? (
        <span className="block text-xs font-normal text-muted" data-testid="portfolio-metric-label">
          {label}
        </span>
      ) : null}
    </span>
  );
}
