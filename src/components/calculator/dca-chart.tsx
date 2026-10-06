import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/dca/format";
import { compactMoney } from "@/lib/dca/results";
import type { DeskRun } from "@/lib/dca/types";

/** Pill size (spec §7: 22 px tall, 8 px side padding, 12 px medium type, night on green). */
const PILL_H = 22;
/** Room kept for the pill's foreignObject; the pill itself is only as wide as its text. */
const PILL_BOX_W = 160;

type LabelProps = { x?: number; y?: number; index?: number };

/**
 * The calculator chart (#70, spec §7; ST4-05, -09): ONE series, the DCA portfolio value (DCA NLV per session):
 * a 2 px green line, a soft green fill under it (16% green over charcoal) and the last value in a small green
 * pill (night text, the results' money format), drawn just left of the line's last point so it is never
 * clipped. No second series, no legend, no scale note. Pass `width` / `height` to render without
 * ResponsiveContainer (jsdom tests).
 */
export function DcaChart({
  run,
  currency,
  width,
  height = 224,
}: {
  run: DeskRun;
  currency: string;
  width?: number;
  height?: number;
}) {
  const data = run.chart;
  const lastIndex = data.length - 1;
  const last = lastIndex >= 0 ? data[lastIndex].dca : null;
  const lastLabel = last == null ? "" : money(last, currency);

  const pill = ({ x, y, index }: LabelProps) => {
    if (index !== lastIndex || x == null || y == null || !lastLabel) return null;
    const top = Math.max(0, Math.min(y - PILL_H / 2, height - 30 - PILL_H));
    return (
      <foreignObject x={x - PILL_BOX_W - 4} y={top} width={PILL_BOX_W} height={PILL_H} overflow="visible">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <span className="calc-pill" data-testid="chart-pill">
            {lastLabel}
          </span>
        </div>
      </foreignObject>
    );
  };

  const chart = (
    <AreaChart width={width} height={width ? height : undefined} data={data} margin={{ top: 12, right: 2, left: 0, bottom: 0 }}>
      <CartesianGrid stroke="var(--color-hair)" vertical={false} />
      <XAxis
        dataKey="date"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        minTickGap={40}
        tickFormatter={(value: string) => value.slice(0, 7)}
      />
      <YAxis
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        width={52}
        tickFormatter={(value: number) => compactMoney(value, currency)}
      />
      <Tooltip
        formatter={(value) => [money(Number(value), currency), "DCA"]}
        labelFormatter={(label) => String(label)}
        cursor={{ stroke: "var(--color-rule)" }}
        contentStyle={{
          background: "var(--color-night)",
          color: "var(--color-chalk)",
          border: "1px solid var(--color-rule)",
          borderRadius: 0,
          fontSize: 13,
        }}
        labelStyle={{ color: "var(--color-chalk)" }}
        itemStyle={{ color: "var(--color-chalk)" }}
      />
      <Area
        type="monotone"
        dataKey="dca"
        name="DCA"
        stroke="var(--color-green)"
        strokeWidth={2}
        fill="var(--color-green)"
        fillOpacity={0.16}
        dot={false}
        activeDot={{ r: 3, fill: "var(--color-green)", stroke: "var(--color-night)" }}
        isAnimationActive={false}
        label={pill}
      />
    </AreaChart>
  );

  return (
    <figure className="min-w-0" data-testid="dca-chart">
      <figcaption className="sr-only">DCA portfolio value</figcaption>
      {width ? (
        chart
      ) : (
        <div className="w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
