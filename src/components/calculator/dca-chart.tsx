import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/dca/format";
import { compactMoney } from "@/lib/dca/results";
import type { DeskRun } from "@/lib/dca/types";
import { ASSET_NOTE, assetStroke, tipRows, type TipRow } from "@/lib/site/asset-lines";

/** Pill size (spec §7: 22 px tall, 8 px side padding, 12 px medium type, night on green). */
const PILL_H = 22;
/** Room kept for the pill's foreignObject; the pill itself is only as wide as its text. */
const PILL_BOX_W = 160;

type LabelProps = { x?: number; y?: number; index?: number };

function Swatch({ stroke, width, dash }: { stroke: string; width: number; dash?: string }) {
  return (
    <svg width="16" height="8" aria-hidden="true" data-testid="chart-swatch">
      <line x1="0" y1="4" x2="16" y2="4" stroke={stroke} strokeWidth={width} strokeDasharray={dash} />
    </svg>
  );
}

export function ChartTip({
  active,
  label,
  rows,
  currency,
}: {
  active?: boolean;
  label?: unknown;
  rows: TipRow[];
  currency: string;
}) {
  if (!active || !rows.length) return null;
  return (
    <div className="chart-tip" data-testid="chart-tip" style={TIP_STYLE}>
      <div>{String(label ?? "")}</div>
      {rows.map((row, index) => (
        <div key={`${index}-${row.name}`} data-testid="chart-tip-row">
          <Swatch stroke={row.stroke} width={row.name === "Portfolio" ? 2 : 1} /> {row.name}{" "}
          {row.value == null ? "—" : money(row.value, currency)}
        </div>
      ))}
    </div>
  );
}

const TIP_STYLE = {
  maxHeight: "9rem",
  overflowY: "auto" as const,
  background: "var(--color-night)",
  color: "var(--color-chalk)",
  border: "1px solid var(--color-rule)",
  borderRadius: 0,
  fontSize: 13,
  padding: "6px 8px",
};

/**
 * The calculator chart (#70, spec §7; ST4-05, ST4-25). The portfolio is the DCA value: a 2 px green line,
 * a 16% green fill and the last value in one green pill. Each extra asset is a 1 px line of that asset's
 * share (`assetChart`). A one-name basket draws the portfolio only. Lines do not connect across gaps.
 */
export function DcaChart({
  run,
  currency,
  tickers,
  width,
  height = 224,
}: {
  run: DeskRun;
  currency: string;
  tickers: readonly string[];
  width?: number;
  height?: number;
}) {
  const multi = tickers.length > 1;
  const data = run.chart.map((point, session) => {
    const row: Record<string, string | number | null> = { date: point.date, dca: point.dca };
    if (multi) {
      tickers.forEach((_, index) => {
        const value = run.assetChart[session]?.[index];
        row[`a${index}`] = typeof value === "number" ? value : null;
      });
    }
    return row;
  });
  const lastIndex = data.length - 1;
  const last = lastIndex >= 0 ? data[lastIndex].dca : null;
  const lastLabel = typeof last === "number" ? money(last, currency) : "";

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
    <ComposedChart width={width} height={width ? height : undefined} data={data} margin={{ top: 12, right: 2, left: 0, bottom: 0 }}>
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
        content={(props) => {
          const row = (props.payload?.[0]?.payload ?? null) as Record<string, string | number | null> | null;
          const dca = typeof row?.dca === "number" ? row.dca : Number.NaN;
          const slices = tickers.map((_, index) => (typeof row?.[`a${index}`] === "number" ? (row[`a${index}`] as number) : null));
          return (
            <ChartTip
              active={Boolean(props.active) && Number.isFinite(dca)}
              label={props.label}
              rows={Number.isFinite(dca) ? tipRows(tickers, dca, slices) : []}
              currency={currency}
            />
          );
        }}
        cursor={{ stroke: "var(--color-rule)" }}
        wrapperStyle={{ pointerEvents: "auto" }}
      />
      {multi
        ? tickers.map((ticker, index) => {
            const { stroke, dash } = assetStroke(index);
            return (
              <Line
                key={ticker}
                type="monotone"
                dataKey={`a${index}`}
                name={ticker}
                stroke={stroke}
                strokeWidth={1}
                strokeDasharray={dash}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={{ r: 3, fill: stroke, stroke: "var(--color-night)" }}
              />
            );
          })
        : null}
      <Area
        type="monotone"
        dataKey="dca"
        name="Portfolio"
        stroke="var(--color-green)"
        strokeWidth={2}
        fill="var(--color-green)"
        fillOpacity={0.16}
        dot={false}
        activeDot={{ r: 3, fill: "var(--color-green)", stroke: "var(--color-night)" }}
        isAnimationActive={false}
        label={pill}
      />
    </ComposedChart>
  );

  const legend = multi ? ["Portfolio", ...tickers] : [`Portfolio · ${tickers[0] ?? ""}`];

  return (
    <figure className="flex min-w-0 flex-col" data-testid="dca-chart" data-assets={multi ? tickers.length : 0}>
      <figcaption className="sr-only">{multi ? "DCA portfolio value and each asset's share" : "DCA portfolio value"}</figcaption>
      {width ? (
        chart
      ) : (
        <div className="w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
      <ul className="calc-legend" data-testid="chart-legend">
        {legend.map((name, index) => {
          const asset = multi && index > 0 ? assetStroke(index - 1) : undefined;
          return (
            <li key={name} data-testid="chart-legend-item" data-series={index === 0 ? "portfolio" : tickers[index - 1]}>
              <Swatch stroke={asset?.stroke ?? "var(--color-green)"} width={asset ? 1 : 2} dash={asset?.dash} />
              <span>{name}</span>
            </li>
          );
        })}
      </ul>
      <p className="rs-note" data-testid="chart-asset-note">
        {ASSET_NOTE}
      </p>
    </figure>
  );
}
