import { useId, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AMOUNT_ERROR, formatAmount, NOT_COMPUTED, parseAmount } from "@/lib/finance/expenses";
import {
  AVERAGE,
  CHART_CAPTION,
  EXPENSES,
  FUTURE_LABEL,
  type Figures,
  GROWTH_LABEL,
  INCOME,
  MONTH_LABEL,
  type MonthKey,
  monthName,
  NET_ASSETS,
  type Overview,
  OVERVIEW_TITLE,
  type PageFigures,
  type Point,
  START_LABEL,
  type Summary,
  setMonth,
  SURPLUS,
  summarize,
  surplusOf,
  THIS_MONTH,
  UPDATE_TITLE,
  UPDATE_MONTH,
  SAVE,
  CANCEL,
  YEARS,
  yearsLabel,
} from "@/lib/finance/overview";
import { Lock, SectionHead } from "./pf-cells";

const orDash = (value: number | null): string =>
  value === null ? NOT_COMPUTED : formatAmount(value);
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
  chartWidth,
  open = true,
  onToggle,
  readOnly = false,
}: {
  overview: Overview;
  update: (change: (current: Overview) => Overview) => void;
  now: Date;
  page: PageFigures;
  /** Fixed chart width (jsdom tests); the page uses a responsive container. */
  chartWidth?: number;
  /** #105 (PF-40): `04` is open; `onToggle` makes its heading a toggle (the brief's "Charts"). */
  open?: boolean;
  onToggle?: () => void;
  /** #90 (ROLE-10): every field and button disabled (the toggle stays). */
  readOnly?: boolean;
}) {
  const summary = summarize(overview, now, page);
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
              <OverviewTable thisMonth={summary.thisMonth} average={summary.average} />
              <OverviewFields overview={overview} update={update} />
              <Future overview={overview} update={update} />
              <OverviewChart summary={summary} width={chartWidth} />
            </Lock>
          ) : null}
        </div>
      </section>
      <section className="flex flex-col gap-8" aria-labelledby="pf-update" data-testid="pf-update">
        <SectionHead numeral="05" title={UPDATE_TITLE} id="pf-update" />
        <Lock on={readOnly}>
          <UpdateMonth overview={overview} update={update} summary={summary} page={page} />
        </Lock>
      </section>
    </>
  );
}

function OverviewTable({ thisMonth, average }: { thisMonth: Figures; average: Figures }) {
  const rows: [string, string, number | null, number | null][] = [
    [EXPENSES, "expenses", thisMonth.expenses, average.expenses],
    [INCOME, "income", thisMonth.income, average.income],
    [SURPLUS, "surplus", surplusOf(thisMonth), surplusOf(average)],
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
        <span role="columnheader" className="pf-label">
          {AVERAGE}
        </span>
      </div>
      {rows.map(([label, key, now, avg]) => (
        <div key={key} className="pf-ov-row" role="row" data-testid={`pf-ov-${key}`}>
          <span role="rowheader" className="pf-ov-name">
            {label}
          </span>
          <span role="cell" className="pf-ov-value" data-testid="pf-ov-now">
            {orDash(now)}
          </span>
          <span role="cell" className="pf-ov-value" data-testid="pf-ov-avg">
            {orDash(avg)}
          </span>
        </div>
      ))}
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

/**
 * #105 (PF-43): `Update month` opens a panel (Month, Expenses, Income, `Save`, `Cancel`). The two fields are a draft
 * until `Save`, which stores that month's figures, closes the panel and returns focus to the button (the `04`
 * averages and chart follow); `Cancel` / Escape discard; a bad amount keeps the panel open and stores nothing.
 */
function UpdateMonth({
  overview,
  update,
  summary,
  page,
}: {
  overview: Overview;
  update: (change: (current: Overview) => Overview) => void;
  summary: Summary;
  page: PageFigures;
}) {
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<{ month: MonthKey; expenses: string; income: string } | null>(
    null,
  );
  const draftFor = (month: MonthKey) => {
    const entry = overview.months[month] ?? { expenses: "", income: "" };
    return { month, expenses: entry.expenses, income: entry.income };
  };
  const close = () => {
    setPanel(null);
    queueMicrotask(() => opener.current?.focus());
  };
  if (!panel)
    return (
      <div className="pf-update" data-testid="pf-update-fields">
        <button
          ref={opener}
          type="button"
          className="pf-button pf-update-open"
          aria-expanded={false}
          aria-controls={`${id}-panel`}
          onClick={() => setPanel(draftFor(summary.current))}
          data-testid="pf-update-open"
        >
          {UPDATE_MONTH}
        </button>
      </div>
    );
  const isCurrent = panel.month === summary.current;
  const hint = (pageValue: number | null, avg: number | null): string => {
    const value = isCurrent ? (pageValue !== null && pageValue > 0 ? pageValue : null) : avg;
    return value === null ? "" : formatAmount(value);
  };
  const bad = parseAmount(panel.expenses) === null || parseAmount(panel.income) === null;
  const save = () => {
    if (bad) return;
    const { month, expenses, income } = panel;
    update((o) => setMonth(o, month, { expenses, income }));
    close();
  };
  return (
    <div className="pf-update" data-testid="pf-update-fields">
      <button
        ref={opener}
        type="button"
        className="pf-button pf-update-open"
        aria-expanded={true}
        aria-controls={`${id}-panel`}
        onClick={close}
        data-testid="pf-update-open"
      >
        {UPDATE_MONTH}
      </button>
      <div
        id={`${id}-panel`}
        className="pf-update-panel"
        role="group"
        aria-label={UPDATE_MONTH}
        data-testid="pf-update-panel"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className="pf-rates">
          <div className="pf-cell">
            <label htmlFor={`${id}-month`} className="pf-label">
              {MONTH_LABEL}
            </label>
            <select
              id={`${id}-month`}
              autoFocus
              className="pf-field"
              value={panel.month}
              onChange={(event) => setPanel(draftFor(event.target.value))}
              data-testid="pf-month"
            >
              {[...summary.months].reverse().map((key) => (
                <option key={key} value={key}>
                  {monthName(key)}
                </option>
              ))}
            </select>
          </div>
          <AmountField
            key={`${panel.month}-e`}
            label={EXPENSES}
            value={panel.expenses}
            onChange={(expenses) => setPanel({ ...panel, expenses })}
            testId="pf-month-expenses"
            placeholder={hint(page.expenses, summary.average.expenses)}
          />
          <AmountField
            key={`${panel.month}-i`}
            label={INCOME}
            value={panel.income}
            onChange={(income) => setPanel({ ...panel, income })}
            testId="pf-month-income"
            placeholder={hint(page.income, summary.average.income)}
          />
        </div>
        <div className="flex gap-4">
          <button type="button" className="pf-button" onClick={save} data-testid="pf-update-save">
            {SAVE}
          </button>
          <button
            type="button"
            className="pf-cancel"
            onClick={close}
            data-testid="pf-update-cancel"
          >
            {CANCEL}
          </button>
        </div>
      </div>
    </div>
  );
}
