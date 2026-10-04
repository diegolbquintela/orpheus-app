import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PIE_COLOURS, piePct, pieSlices } from "@/lib/dashboard/pie";

/**
 * Holdings pie chart on /dashboard (T15 #23, spec §9, DASH-24): one slice per holding by % of portfolio
 * (base-currency market value from the T07 valuation, so it matches the table's % column), largest first,
 * more than 10 holdings → "Other". Neutral greys; labels are ticker + %. The legend list is the accessible
 * text version (and what server rendering shows before the chart mounts). Holdings without a price or FX
 * rate get no slice and are listed under it.
 */
type Row = { symbol: string; value: number | null; status: string };

export function HoldingsPie({ rows, base }: { rows: Row[]; base: string }) {
  const { slices, pricePending, fxPending } = pieSlices(rows);
  const summary = slices.map((s) => `${s.label} ${piePct(s.pct)}`).join(", ");
  return (
    <figure className="mt-10" data-testid="holdings-pie" data-slices={slices.length}>
      <figcaption className="kicker mb-3 text-muted">% of portfolio ({base})</figcaption>
      {slices.length === 0 ? (
        <p className="text-sm text-muted" data-testid="holdings-pie-empty">
          No holdings with a price yet.
        </p>
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="h-56 w-full max-w-xs self-center" role="img" aria-label={`Pie chart of % of portfolio: ${summary}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" startAngle={90} endAngle={-270} innerRadius={0} outerRadius="90%" isAnimationActive={false} stroke="#ffffff">
                  {slices.map((s, i) => (
                    <Cell key={s.label} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(_v, _n, item) => piePct((item?.payload as { pct: number }).pct)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm tabular-nums sm:grid-cols-1" data-testid="holdings-pie-legend">
            {slices.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2" data-testid="pie-slice" data-label={s.label} title={s.symbols.length > 1 ? s.symbols.join(", ") : undefined}>
                <i className="inline-block h-3 w-3 shrink-0" style={{ background: PIE_COLOURS[i % PIE_COLOURS.length] }} aria-hidden="true" />
                <span>{s.label}</span>
                <span className="text-muted" data-testid="pie-slice-pct">{piePct(s.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pricePending.length ? (
        <p className="mt-3 text-xs text-muted" data-testid="pie-price-pending">
          price pending: {pricePending.join(", ")}
        </p>
      ) : null}
      {fxPending.length ? (
        <p className="mt-1 text-xs text-muted" data-testid="pie-fx-pending">
          FX pending: {fxPending.join(", ")}
        </p>
      ) : null}
    </figure>
  );
}
