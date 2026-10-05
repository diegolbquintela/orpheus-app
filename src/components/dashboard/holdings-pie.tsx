import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PIE_COLOURS, piePct, pieSlices } from "@/lib/dashboard/pie";

/**
 * The book's donut on /dashboard (epic #53 ticket 5, #58; spec §0.2 "Book", DR5-02; was the T15 pie, #23):
 * the same slices as before (`pieSlices()`: each valued holding's share of the book in the base currency, so
 * it matches the rows' share), largest first, ties by ticker, the 10 largest + "Other" past ten names, drawn
 * as a ring. Neutral greys; labels are ticker + % from the rows' formatter. The legend list is the text
 * alternative (and what server rendering shows before the chart mounts). Holdings without a price or FX rate
 * get no slice and are counted by the excluded line under the total (the pending lists went, §0.5 item 10).
 * With no valued holding there is no donut.
 */
type Row = { symbol: string; value: number | null; status: string };

export function HoldingsPie({ rows, base }: { rows: Row[]; base: string }) {
  const { slices } = pieSlices(rows);
  if (slices.length === 0) return null;
  const summary = slices.map((s) => `${s.label} ${piePct(s.pct)}`).join(", ");
  return (
    <figure className="mt-10" data-testid="holdings-pie" data-shape="donut" data-slices={slices.length}>
      <figcaption className="kicker mb-3 text-muted">Share of the book ({base})</figcaption>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="h-56 w-full max-w-xs self-center" role="img" aria-label={`Donut chart of share of the book: ${summary}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="label" startAngle={90} endAngle={-270} innerRadius="58%" outerRadius="90%" isAnimationActive={false} stroke="#ffffff">
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
    </figure>
  );
}
