import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AMOUNT_ERROR, NOT_COMPUTED, parseAmount } from "@/lib/finance/expenses";
import { formatMoney } from "@/lib/finance/money";
import { formatRate } from "@/lib/finance/equity";
import {
  average3Label,
  average12CountLabel,
  COVERAGE_SOURCE_NOTE,
  coverageRateNote,
  type Coverage,
  COVERAGE_RATE_NOTE,
  COVERAGE_START_NOTE,
  coverageLabel,
  overviewCoverage,
  CHART_CAPTION,
  EXPENSES,
  FUTURE_LABEL,
  type Figures,
  GROWTH_LABEL,
  INCOME,
  type MonthKey,
  monthName,
  NET_ASSETS,
  type Overview,
  OVERVIEW_TITLE,
  type PageFigures,
  type Point,
  START_LABEL,
  type Summary,
  SURPLUS,
  FIGURES_LEAVE_OUT,
  summarize,
  surplusOf,
  THIS_MONTH,
  YEARS,
  yearsLabel,
} from "@/lib/finance/overview";
import { Lock, SectionHead } from "./pf-cells";

const orDash = (value: number | null): string =>
  value === null ? NOT_COMPUTED : formatMoney(value);
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const SERIES = [
  { key: "expenses", name: EXPENSES, color: "var(--color-alert)", axis: "flow" },
  { key: "income", name: INCOME, color: "var(--color-green)", axis: "flow" },
  { key: "net", name: NET_ASSETS, color: "var(--color-chalk)", axis: "net" },
] as const;

/**
 * `04` Overview and `05` Update (#94; spec section 15, PF-26..32; Q17–Q23 open). Figures in the household currency,
 * unitless. `now` is the browser's date (read after hydration by the page); `page` the page's own monthly figures.
 */
export function OverviewBlock({
  overview,
  update,
  now,
  page,
  lines,
  chartWidth,
  open = true,
  onToggle,
  readOnly = false,
  rate = null,
  currency = "",
  fieldsInError = null,
}: {
  overview: Overview;
  update: (change: (current: Overview) => Overview) => void;
  now: Date;
  page: PageFigures;
  /** #112: each saved month's figures from its lines (decision 7). */
  lines?: Record<MonthKey, Figures>;
  /** Fixed chart width (jsdom tests); the page uses a responsive container. */
  chartWidth?: number;
  /** #105 (PF-40): `04` is open; `onToggle` makes its heading a toggle (the brief's "Charts"). */
  open?: boolean;
  onToggle?: () => void;
  /** #90 (ROLE-10): every field and button disabled (the toggle stays). */
  readOnly?: boolean;
  /** #126: the #86 rate used (a percent, null when none), live from the page. */
  rate?: number | null;
  /** #126: the household (master) currency code. */
  currency?: string;
  /** #144 Q-V3 (c), PF-172: a field shows an error (the figures leave it out); null = read-only (no note). */
  fieldsInError?: boolean | null;
}) {
  const summary = summarize(overview, now, page, lines);
  const coverage = overviewCoverage(overview, summary, rate);
  return (
    <>
      <section
        className="flex flex-col gap-8"
        aria-labelledby="pf-overview"
        data-testid="pf-overview"
      >
        <SectionHead
          numeral="04"
          title={OVERVIEW_TITLE}
          id="pf-overview"
          toggle={
            onToggle
              ? { open, controls: "pf-overview-body", onToggle, testId: "pf-toggle-overview" }
              : undefined
          }
        />
        <div
          id="pf-overview-body"
          className="pf-section-body flex flex-col gap-8"
          data-testid="pf-body-overview"
        >
          {open ? (
            <Lock on={readOnly}>
              {fieldsInError == null ? null : (
                // Always rendered (its line reserved, shown by visibility), so it never moves anything.
                <p className="pf-figures-note" role="status" data-testid="pf-figures-note" data-shown={fieldsInError ? "true" : "false"}>
                  {FIGURES_LEAVE_OUT}
                </p>
              )}
              <OverviewTable thisMonth={summary.thisMonth} average3={summary.average3} average={summary.average} label3={average3Label(summary.window3)} label12={average12CountLabel(summary.window12, summary.window12WithData)} />
              <CoverageLine coverage={coverage} currency={currency} years={overview.future ? overview.years : null} window3={summary.window3} rate={rate} />
              <OverviewFields overview={overview} update={update} />
              <Future overview={overview} update={update} />
              <OverviewChart summary={summary} width={chartWidth} />
            </Lock>
          ) : null}
        </div>
      </section>
    </>
  );
}

function OverviewTable({
  thisMonth,
  average3,
  average,
  label3,
  label12,
}: {
  thisMonth: Figures;
  average3: Figures;
  average: Figures;
  label3: string;
  /** #132: `12-month average (Nov–Oct)`. */
  label12: string;
}) {
  const rows: [string, string, number | null, number | null, number | null][] = [
    [EXPENSES, "expenses", thisMonth.expenses, average3.expenses, average.expenses],
    [INCOME, "income", thisMonth.income, average3.income, average.income],
    [SURPLUS, "surplus", surplusOf(thisMonth), surplusOf(average3), surplusOf(average)],
  ];
  return (
    <div className="pf-ov-table" role="table" aria-label={OVERVIEW_TITLE} data-testid="pf-ov-table">
      <div className="pf-ov-row pf-ov-head" role="row">
        <span role="columnheader" className="pf-label">
          <span className="sr-only">{OVERVIEW_TITLE}</span>
        </span>
        <span role="columnheader" className="pf-label">
          {THIS_MONTH}
        </span>
        <span role="columnheader" className="pf-label" data-testid="pf-ov-avg3-head">
          {label3}
        </span>
        <span role="columnheader" className="pf-label" data-testid="pf-ov-avg-head">
          {label12}
        </span>
      </div>
      {rows.map(([label, key, now, avg3, avg]) => (
        <div key={key} className="pf-ov-row" role="row" data-testid={`pf-ov-${key}`}>
          <span role="rowheader" className="pf-ov-name">
            {label}
          </span>
          <span role="cell" className="pf-ov-value" data-testid="pf-ov-now">
            {orDash(now)}
          </span>
          <span role="cell" className="pf-ov-value" data-testid="pf-ov-avg3">
            {orDash(avg3)}
          </span>
          <span role="cell" className="pf-ov-value" data-testid="pf-ov-avg">
            {orDash(avg)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * #129 (PF-98..PF-103; was the #126 one-liner): three lines under the table:
 *   `Equity coverage: 41.67 CAD/mo (500 CAD/yr)`
 *   `* 12.5% yearly, covers 0.50% of monthly expenses (3-month average, Jul–Sep).` (smaller, dim; PF-105)
 *     Future on: `* 12.5% yearly, covers X% of projected monthly expenses at horizon end (held at 12-month average).`
 *     (PF-106: ÷ the horizon-end point's expenses)
 *   `** Coverage rate is derived from Rate Used under Expenses section.` (smaller, dim)
 * `—` and the short note when the rate or the starting net assets are missing. Math unchanged (#126, C7/C2, PF-84).
 */
function CoverageLine({
  coverage,
  currency,
  years,
  window3,
  rate,
}: {
  coverage: Coverage;
  currency: string;
  years: (typeof YEARS)[number] | null;
  /** C7: the 3 complete months behind the Future-off basis. */
  window3: MonthKey[];
  /** The #86 Rate used (a percent), as shown under Expenses. */
  rate: number | null;
}) {
  const unit = currency ? ` ${currency}` : "";
  const note = coverage.status === "no_rate" ? COVERAGE_RATE_NOTE : coverage.status === "no_start" ? COVERAGE_START_NOTE : null;
  return (
    <div className="pf-coverage" data-testid="pf-coverage" data-status={coverage.status}>
      <p data-testid="pf-coverage-amounts">
        {coverageLabel(years)}{" "}
        {coverage.status === "ok" ? (
          <>
            <span data-testid="pf-coverage-monthly">{`${formatMoney(coverage.monthly)}${unit}/mo`}</span>{" "}
            <span data-testid="pf-coverage-yearly">{`(${formatMoney(coverage.yearly)}${unit}/yr)`}</span>
          </>
        ) : (
          <span data-testid="pf-coverage-monthly">{NOT_COMPUTED}</span>
        )}
      </p>
      {coverage.status === "ok" ? (
        <p className="pf-coverage-sub" data-testid="pf-coverage-rate-note">
          {coverageRateNote(formatRate(rate), coverage.share, years !== null, window3)}
        </p>
      ) : note ? (
        <p className="pf-coverage-sub" data-testid="pf-coverage-note">
          {note}
        </p>
      ) : null}
      <p className="pf-coverage-sub" data-testid="pf-coverage-source">
        {COVERAGE_SOURCE_NOTE}
      </p>
    </div>
  );
}

/** A labelled amount field with the section 5 check (0 or more). */
function AmountField({
  label,
  value,
  onChange,
  testId,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  placeholder?: string;
}) {
  const id = useId();
  const bad = parseAmount(value) === null;
  return (
    <div className="pf-cell">
      <label htmlFor={id} className="pf-label">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        className="pf-field"
        data-testid={testId}
        placeholder={placeholder}
        {...(bad ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {})}
      />
      {bad ? (
        <span id={`${id}-error`} className="pf-error" data-testid="pf-error" data-field={testId}>
          {AMOUNT_ERROR}
        </span>
      ) : null}
    </div>
  );
}

function OverviewFields({
  overview,
  update,
}: {
  overview: Overview;
  update: (change: (current: Overview) => Overview) => void;
}) {
  return (
    <div className="pf-rates" data-testid="pf-ov-fields">
      <AmountField
        label={START_LABEL}
        value={overview.start}
        onChange={(start) => update((o) => ({ ...o, start }))}
        testId="pf-start"
      />
      <AmountField
        label={GROWTH_LABEL}
        value={overview.growth}
        onChange={(growth) => update((o) => ({ ...o, growth }))}
        testId="pf-growth"
      />
    </div>
  );
}

function Future({
  overview,
  update,
}: {
  overview: Overview;
  update: (change: (current: Overview) => Overview) => void;
}) {
  return (
    <div className="pf-future" data-testid="pf-future">
      <button
        type="button"
        className="pf-toggle"
        aria-pressed={overview.future}
        onClick={() => update((o) => ({ ...o, future: !o.future }))}
        data-testid="pf-future-toggle"
      >
        {FUTURE_LABEL}
      </button>
      {overview.future ? (
        <div className="pf-years" role="group" aria-label={FUTURE_LABEL} data-testid="pf-years">
          {YEARS.map((years) => (
            <button
              key={years}
              type="button"
              className="pf-toggle"
              aria-pressed={overview.years === years}
              onClick={() => update((o) => ({ ...o, years }))}
              data-testid="pf-year"
              data-years={years}
            >
              {yearsLabel(years)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OverviewChart({ summary, width }: { summary: Summary; width?: number }) {
  const data = summary.points;
  const last = data[data.length - 1];
  const tooltipValue = (value: unknown) => orDash(typeof value === "number" ? value : null);
  const chart = (h?: number) => (
    <LineChart
      width={width}
      height={h}
      data={data}
      margin={{ top: 12, right: 4, left: 0, bottom: 0 }}
    >
      <CartesianGrid stroke="var(--color-hair)" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        minTickGap={32}
      />
      <YAxis
        yAxisId="flow"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        width={44}
        tickFormatter={(value: number) => COMPACT.format(value)}
      />
      <YAxis
        yAxisId="net"
        orientation="right"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        width={48}
        tickFormatter={(value: number) => COMPACT.format(value)}
      />
      <Tooltip
        formatter={(value, name) => [tooltipValue(value), String(name)]}
        labelFormatter={(_label, payload) => {
          const point = payload?.[0]?.payload as Point | undefined;
          return point ? monthName(point.key) : "";
        }}
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
      {SERIES.map((s) => (
        <Line
          key={s.key}
          yAxisId={s.axis}
          type="linear"
          dataKey={s.key}
          name={s.name}
          stroke={s.color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: s.color, stroke: "var(--color-night)" }}
          isAnimationActive={false}
          connectNulls={false}
        />
      ))}
    </LineChart>
  );
  return (
    <figure
      className="pf-chart min-w-0"
      data-testid="pf-chart"
      data-months={data.length}
      data-net-last={last?.net == null ? "" : last.net.toFixed(2)}
    >
      <figcaption className="sr-only">{CHART_CAPTION}</figcaption>
      <div className="pf-chart-plot" aria-hidden="true">
        {width ? (
          chart(240)
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chart()}
          </ResponsiveContainer>
        )}
      </div>
      <ul className="pf-legend" data-testid="pf-legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="pf-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}
