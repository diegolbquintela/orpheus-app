/**
 * #95 Dashboard company view (attachments/dashboard-company-view-design.md sections 2 and 4): header, price chart with
 * 1Y / 5Y / Max, then Profile, Margins, Returns, Valuation, Growth, Dividends. Renders `companyView()` output only
 * (the API returns the same). Dark shell tokens, shared `.ow-label`; no gold.
 * #124: a fund shows `company-fund` (the fund line) in place of the five company sections; Dividends stay.
 */
import { useEffect, useId, useRef, useState } from "react";
import { DERIVED_MARKER, ROIC_INFO_LABEL, ROIC_METHOD, pct, RANGES, rangeOf, type CompanyView, type ChartPoint, type RangeKey } from "@/lib/dashboard/company";

/**
 * #130 (CV-16..CV-21; attachments/roic-tooltip-design.md): the ROIC method tooltip. Hover (the button or the tooltip),
 * keyboard focus and tap open it; Escape, blur, leaving and a tap elsewhere close it; a second tap closes it (Q-T3).
 * The tooltip is always in the DOM (`aria-describedby` resolves), absolutely placed and hidden by visibility, so it
 * never moves anything.
 */
function RoicInfo() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  // A tap / click toggles from the state before its own pointerdown (touch fires focus and hover before the click).
  const before = useRef<boolean | null>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const away = (e: Event) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
    };
  }, [open]);
  return (
    <span
      ref={wrap}
      className="company-info"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="company-info-button"
        aria-label={ROIC_INFO_LABEL}
        aria-describedby={id}
        aria-expanded={open}
        data-testid="company-roic-info"
        onPointerDown={() => {
          before.current = open;
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => {
          setOpen(before.current === null ? (o) => !o : !before.current);
          before.current = null;
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span role="tooltip" id={id} className="company-tip" data-open={open ? "true" : "false"} data-testid="company-roic-tip">
        {ROIC_METHOD}
      </span>
    </span>
  );
}

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
        {view.coverage ? (
          <p className="mt-2 text-sm text-dim" data-testid="company-coverage">
            {view.coverage}
          </p>
        ) : null}
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
        {view.fund ? (
          // #124 (FD-09): a fund: one line in place of the Profile / Margins / Returns / Valuation / Growth sections.
          <section data-testid="company-fund" aria-labelledby="company-h-fund">
            <div className="border-b border-hair pb-2">
              <h2 id="company-h-fund" className="ow-label">
                Fund
              </h2>
            </div>
            <p className="py-2 text-sm text-dim" data-testid="company-fund-line">
              {view.fund}
            </p>
          </section>
        ) : null}
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
                  <dt className="relative text-dim">
                    {row.label}
                    {row.key === "roic" ? <RoicInfo /> : null}
                    {row.derived ? (
                      // #123 (ES-13): a figure from a fallback (E1 / E5), dim small label; the title explains how.
                      <span
                        className="ow-label ml-2"
                        data-testid={`company-derived-${row.key}`}
                        title={row.derived}
                        aria-label={`${DERIVED_MARKER}: ${row.derived}`}
                        role="note"
                      >
                        {DERIVED_MARKER}
                      </span>
                    ) : null}
                  </dt>
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
