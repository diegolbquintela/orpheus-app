/**
 * #95 Dashboard company view (attachments/dashboard-company-view-design.md sections 2 and 4): header, price chart with
 * 1Y / 5Y / Max, then Profile, Margins, Returns, Valuation, Growth, Dividends. Renders `companyView()` output only
 * (the API returns the same). Dark shell tokens, shared `.ow-label`; no gold.
 */
import { useState } from "react";
import { pct, RANGES, rangeOf, type CompanyView, type ChartPoint, type RangeKey } from "@/lib/dashboard/company";

const W = 640;
const H = 220;

function Chart({ points }: { points: ChartPoint[] }) {
  if (points.length < 2)
    return (
      <p className="flex h-full items-center justify-center text-sm text-dim" data-testid="company-chart-empty">
        Price pending
      </p>
    );
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * W).toFixed(1)},${(H - ((p[1] - lo) / span) * (H - 8) - 4).toFixed(1)}`)
    .join("");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label={`Closing price from ${points[0][0]} to ${points.at(-1)![0]}`}
      data-testid="company-chart-svg"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function CompanyViewPage({ view }: { view: CompanyView }) {
  const [range, setRange] = useState<RangeKey>("1y");
  const r = rangeOf(view.chart, range);
  return (
    <article data-testid="company-view" data-symbol={view.symbol}>
      <header>
        <p className="ow-label" data-testid="company-meta">
          {[view.symbol, view.exchange, view.currency].filter(Boolean).join(" · ")}
        </p>
        <h1 className="mt-2 text-3xl" data-testid="company-name">
          {view.name}
        </h1>
        <p className="mt-2 text-sm tabular-nums" data-testid="company-last">
          {view.last ? (
            <>
              <span className="text-lg">{view.last.text}</span>{" "}
              <span className="text-dim">close {view.last.date}</span>
            </>
          ) : (
            <span className="text-dim">Price pending</span>
          )}
        </p>
      </header>

      <section className="mt-8" aria-label="Price chart" data-testid="company-chart">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2" role="group" aria-label="Chart range">
            {RANGES.map((x) => (
              <button
                key={x.key}
                type="button"
                className={range === x.key ? "ow-button company-range" : "company-range"}
                aria-pressed={range === x.key}
                data-testid={`company-range-${x.key}`}
                onClick={() => setRange(x.key)}
              >
                {x.label}
              </button>
            ))}
          </div>
          <p className="text-sm tabular-nums text-dim" data-testid="company-change">
            {r.change === null ? "—" : `${r.change >= 0 ? "+" : ""}${pct(r.change)} over ${RANGES.find((x) => x.key === range)!.label}`}
          </p>
        </div>
        <div className="company-chart-box mt-3" data-points={r.points.length}>
          <Chart points={r.points} />
        </div>
      </section>

      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
        {view.sections.map((s) => (
          <section key={s.key} data-testid={`company-section-${s.key}`} aria-labelledby={`company-h-${s.key}`}>
            <div className="flex items-baseline justify-between gap-3 border-b border-hair pb-2">
              <h2 id={`company-h-${s.key}`} className="ow-label">
                {s.title}
              </h2>
              {s.note ? <span className="text-xs text-dim">{s.note}</span> : null}
            </div>
            <dl>
              {s.rows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-baseline justify-between gap-4 border-b border-hair py-2 text-sm"
                  data-testid={`company-row-${row.key}`}
                  data-status={row.status}
                >
                  <dt className="text-dim">{row.label}</dt>
                  <dd className={`tabular-nums ${row.status === "ok" ? "" : "text-dim"}`}>{row.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-10 text-xs text-dim" data-testid="company-source">
        {view.source}
      </p>
    </article>
  );
}
