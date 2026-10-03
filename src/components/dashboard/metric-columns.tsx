import { useState } from "react";
import { METRIC_HELP, METRICS, STATUS_REASON, metricLabel, type MetricKey } from "@/lib/dashboard/metrics";

const help = (key: string) => METRIC_HELP[key as MetricKey];

/**
 * Metric columns on /dashboard (T08 #16): the per-user column picker (DASH-15: add, remove, reorder;
 * saved with PUT /api/dashboard/columns) and the metric cells. Values come from `metric_values`
 * (computed by T09–T13; revenue growth/CAGR since T09); a metric not computed yet reads "— not computed yet". A holding
 * without SEC coverage reads "— not covered" in every metric cell (DASH-21). Cells never rate or rank.
 */

export type MetricCellView = { value: string | null; status: string; fiscalYearEnd: string | null };
export type MetricViewData = { coverage: "covered" | "not_covered" | "pending"; metrics: Record<string, MetricCellView> };

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

export function MetricColumnsPicker({ columns, onChanged }: { columns: string[]; onChanged: () => Promise<void> | void }) {
  const available = METRICS.filter((m) => !columns.includes(m.key));
  const [toAdd, setToAdd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: string[]) {
    setBusy(true);
    setError(null);
    const err = await save(next);
    setBusy(false);
    if (err) return setError(err);
    await onChanged();
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...columns];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return apply(next);
  };

  return (
    <div className="mt-6 text-sm" data-testid="metric-picker">
      <span className="kicker text-muted">Metric columns</span>
      {columns.length ? (
        <ol className="mt-2 flex flex-wrap gap-2">
          {columns.map((key, i) => (
            <li key={key} className="flex items-center gap-1 border border-line px-2 py-1" data-testid="metric-column" data-key={key}>
              <span>{metricLabel(key)}</span>
              <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${metricLabel(key)} left`} className="px-1 disabled:opacity-30">
                ←
              </button>
              <button type="button" disabled={busy || i === columns.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${metricLabel(key)} right`} className="px-1 disabled:opacity-30">
                →
              </button>
              <button type="button" disabled={busy} onClick={() => apply(columns.filter((k) => k !== key))} aria-label={`Remove ${metricLabel(key)}`} className="px-1 disabled:opacity-30">
                ×
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-muted" data-testid="metric-columns-empty">
          No metric columns yet.
        </p>
      )}
      {available.length ? (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <select value={toAdd} onChange={(e) => setToAdd(e.target.value)} disabled={busy} className="field h-10 text-base" data-testid="metric-add-select" aria-label="Metric column to add">
            <option value="">Add a column…</option>
            {available.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !toAdd}
            onClick={async () => {
              await apply([...columns, toAdd]);
              setToAdd("");
            }}
            className="inline-flex h-10 items-center border border-ink px-4 disabled:opacity-50"
            data-testid="metric-add"
          >
            Add column
          </button>
        </span>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

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
        {metricKey === "eps_1y" ? v.toFixed(2) : PERCENT(v)}
      </span>
    );
  }
  const reason = STATUS_REASON[status] ?? status;
  return (
    <span className="text-muted" data-testid="metric-cell" data-key={metricKey} data-status={status} title={[reason, help(metricKey) ?? ""].filter(Boolean).join(". ")}>
      —<span className="ml-1 text-xs">{reason}</span>
    </span>
  );
}
