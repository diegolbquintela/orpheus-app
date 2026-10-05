import { useRef, useState, type KeyboardEvent } from "react";
import { formatPortfolioPct } from "@/lib/dashboard/format";
import { METRIC_HELP, SHARE_OF_BOOK, chipLabel, matchingChips, type MetricKey } from "@/lib/dashboard/metrics";
import { MetricCell, PortfolioMetricCell, type MetricViewData, type PortfolioCellView } from "./metric-columns";

/**
 * The metrics sheet (epic #53 ticket 4, #57; spec §0.2 "Metrics sheet", DR4). A search field offers the
 * chips whose label matches and that aren't kept yet; choosing one adds it at the end. Each chip removes
 * itself with its own `×` ("Remove <label>"). One row per holding (list order): the name, then a figure for
 * each kept chip only, in chip order; a missing figure is `—` alone. The foot is the `Book` row (ticket 5,
 * #58; spec §0.2 "Book", §9): per kept chip the market-value-weighted figure over the holdings that have one
 * (dashes left out, weights renormalised; `· N% covered`), `—` when none has one; the share chip's figure is
 * the sum of the valued weights (100.0%). Chips are saved per user with
 * PUT /api/dashboard/columns; reorder is gone (spec §0.5 item 3).
 */

type HoldingLite = { id: number; symbol: string };
type RowLite = { symbol: string; value: number | null; weight: number | null; status: string };

async function save(columns: string[]): Promise<string | null> {
  try {
    const res = await fetch("/api/dashboard/columns", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ columns }),
    });
    if (res.ok) return null;
    if (res.status === 401) return "Your session has ended. Sign in again.";
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? `Something went wrong (${res.status}). Try again.`;
  } catch {
    return "Network error. Try again.";
  }
}

/** The `Share of the book` chip's figure for one holding: its weight, or `—` while price / FX is pending. */
function ShareCell({ row }: { row: RowLite | undefined }) {
  if (row && row.value !== null && row.weight !== null)
    return (
      <span data-testid="metric-cell" data-key={SHARE_OF_BOOK} data-status="ok">
        {formatPortfolioPct(row.weight)}
      </span>
    );
  const reason = row?.status === "fx_pending" ? "FX pending" : "price pending";
  return (
    <span className="text-muted" data-testid="metric-cell" data-key={SHARE_OF_BOOK} data-status="pending" title={reason}>
      —<span className="sr-only"> {reason}</span>
    </span>
  );
}

/** Foot cell for `Share of the book`: the sum of the valued weights (100.0%), `—` when nothing is valued. */
function ShareBookCell({ rows }: { rows: RowLite[] }) {
  const valued = rows.filter((r) => r.value !== null && r.weight !== null);
  return (
    <span className={valued.length ? undefined : "text-muted"} data-testid="portfolio-metric" data-key={SHARE_OF_BOOK}>
      <span data-testid="portfolio-metric-value">{valued.length ? formatPortfolioPct(valued.reduce((s, r) => s + (r.weight as number), 0)) : "—"}</span>
    </span>
  );
}

export function MetricsSheet({
  holdings,
  names,
  rows,
  chips,
  metrics,
  portfolio,
  onChanged,
}: {
  holdings: HoldingLite[];
  /** Display name per symbol (stored company name, else the ticker). */
  names: Record<string, string>;
  rows: RowLite[];
  chips: string[];
  metrics: Record<string, MetricViewData>;
  portfolio: Record<string, PortfolioCellView>;
  onChanged: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One PUT at a time (same guard as the Save / Delete buttons): a second click before React re-renders is ignored.
  const saving = useRef(false);
  const matches = matchingChips(query, chips);

  async function apply(next: string[]) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    const err = await save(next);
    setBusy(false);
    if (err) {
      saving.current = false;
      return setError(err);
    }
    try {
      await onChanged();
    } finally {
      saving.current = false;
    }
  }
  const add = async (key: string) => {
    setQuery("");
    await apply([...chips, key]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches[0]) void add(matches[0].key);
    } else if (e.key === "Escape") setQuery("");
  };

  return (
    <div className="text-sm" data-testid="metrics-sheet">
      <label className="block">
        <span className="kicker text-muted">Add a metric</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-controls="metric-options"
          className="field mt-1 text-base"
          data-testid="metric-search"
        />
      </label>
      {matches.length ? (
        <ul id="metric-options" className="mt-1 border border-line" data-testid="metric-options">
          {matches.map((m) => (
            <li key={m.key}>
              <button
                type="button"
                disabled={busy}
                onClick={() => add(m.key)}
                className="block w-full px-3 py-2 text-left hover:bg-line disabled:opacity-50"
                data-testid="metric-option"
                data-key={m.key}
              >
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {chips.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="metric-chips">
          {chips.map((key) => (
            <li key={key} className="flex items-center gap-1 border border-line py-1 pl-2" data-testid="metric-chip" data-key={key}>
              <span>{chipLabel(key)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => apply(chips.filter((k) => k !== key))}
                aria-label={`Remove ${chipLabel(key)}`}
                className="px-2 disabled:opacity-30"
                data-testid="metric-chip-remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {/* `relative` (QA D1): the scroll box must be the containing block of the absolutely positioned sr-only
          reason text in "—" cells, or that text escapes the box and the whole page scrolls sideways. */}
      <div className="relative mt-4 overflow-x-auto" data-testid="metric-scroll">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="kicker pb-2 pr-3 font-normal text-muted">Name</th>
              {chips.map((key) => (
                <th key={key} className="kicker pb-2 pl-3 text-right align-bottom font-normal text-muted" data-testid="metric-th" data-key={key} title={METRIC_HELP[key as MetricKey]}>
                  {chipLabel(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.id} className="border-t border-line align-top" data-testid="metric-row" data-symbol={h.symbol}>
                <td className="min-w-[6rem] py-3 pr-3 font-medium">{names[h.symbol] ?? h.symbol}</td>
                {chips.map((key) => (
                  <td key={key} className="py-3 pl-3 text-right whitespace-nowrap">
                    {key === SHARE_OF_BOOK ? <ShareCell row={rows.find((r) => r.symbol === h.symbol)} /> : <MetricCell metricKey={key} view={metrics[h.symbol]} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {chips.length ? (
            <tfoot>
              <tr className="border-t-2 border-ink" data-testid="book-row">
                <td className="py-3 pr-3 font-medium">Book</td>
                {chips.map((key) => (
                  <td key={key} className="py-3 pl-3 text-right align-top font-medium">
                    {key === SHARE_OF_BOOK ? <ShareBookCell rows={rows} /> : <PortfolioMetricCell metricKey={key} cell={portfolio[key]} />}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
