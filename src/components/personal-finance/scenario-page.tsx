// #215 (personal-finance-spec 55) / #221 (spec 57, AC PFPJ): the scenario screen. Since #221 it is the Personal Finance
// page itself in scenario mode (Income through Overview, categories removed; prefilled from the saved record), whose
// edits are what-ifs that are never sent, then the projection and totals below. Nothing on this screen is ever written
// (CFO scope cut 2026-10-22): the net-assets field is a local starting value. One GET on open, no PUT, ever.
import { useId, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PersonalFinancePage, type ScenarioLive } from "@/components/personal-finance/expenses-page";
import { ReadOnlyLine } from "@/components/access/denied";
import { equityCoverage, EXPENSES, INCOME, monthName, NET_ASSETS, SURPLUS } from "@/lib/finance/overview";
import { formatMoney } from "@/lib/finance/money";
import { RecordStore, type PfRecord } from "@/lib/finance/record";
import type { LoadStore } from "@/lib/finance/account-client";
import {
  DEFAULT_HORIZON,
  formatPercent,
  GROWTH_ERROR,
  growthOk,
  netBasis,
  parseGrowth,
  xTickIndexes,
  type Horizon,
  HORIZONS,
  horizonLabel,
  type Inputs,
  LOAD_ERROR,
  NET_ASSETS_ERROR,
  NO_DATA,
  overviewNow,
  parseNetAssets,
  pointName,
  type ProjPoint,
  project,
  savedInputs,
  SCENARIO_PATH,
} from "@/lib/finance/scenario";
import { loadForScenario, type Access, type ScenarioLoad } from "@/lib/finance/scenario-client";

const money = (v: number | null) => (v === null ? "—" : formatMoney(v));
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const SERIES = [
  { key: "expenses", name: EXPENSES, color: "var(--color-alert)", axis: "flow" },
  { key: "income", name: INCOME, color: "var(--color-green)", axis: "flow" },
  { key: "net", name: NET_ASSETS, color: "var(--color-chalk)", axis: "net" },
] as const;

export function ScenarioPage({
  load = loadForScenario,
  now,
  chartWidth,
  onSignedOut = () =>
    window.location.assign(`/dashboard/sign-in?next=${encodeURIComponent(SCENARIO_PATH)}`),
}: {
  load?: () => Promise<ScenarioLoad>;
  now?: Date;
  chartWidth?: number;
  onSignedOut?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ record: PfRecord | null; access: Access } | null>(null);
  const [failed, setFailed] = useState(false);
  // The page's store: the loaded record in memory, with NO `save`: no edit, toggle or migration can ever be sent.
  const [loadStore] = useState<LoadStore>(() => async () => {
    const r = await load();
    if (!r.ok) {
      if (r.status === 401) onSignedOut();
      else setFailed(true);
      throw new Error(`load ${r.status}`);
    }
    setLoaded({ record: r.record, access: r.access });
    return new RecordStore({ ...(r.record ?? {}) });
  });
  return (
    <>
      {/* #221 AO6: the load error and the read-only line sit in a labelled landmark (axe `region`). */}
      {failed || (loaded && !loaded.access.write) ? (
        <aside aria-label="Scenario access" data-testid="pf-scenario-access">
          {failed ? (
            <p className="pf-error mx-auto max-w-6xl px-5 pt-6 sm:px-8" role="alert" data-testid="pf-scenario-error">
              {LOAD_ERROR}
            </p>
          ) : null}
          {loaded && !loaded.access.write ? (
            <ReadOnlyLine className="mx-auto max-w-6xl px-5 pt-6 sm:px-8" />
          ) : null}
        </aside>
      ) : null}
      <PersonalFinancePage
        now={now}
        loadStore={loadStore}
        scenario={{
          render: (live) => (
            <ScenarioProjection
              live={live}
              saved={savedInputs(loaded?.record ?? null, live.now)}
              chartWidth={chartWidth}
            />
          ),
        }}
      />
    </>
  );
}

/** The projection under the page: net assets (a local start), horizons, the chart and the totals. Nothing is sent. */
export function ScenarioProjection({
  live,
  saved,
  chartWidth,
}: {
  live: ScenarioLive;
  saved: Inputs;
  chartWidth?: number;
}) {
  const uid = useId();
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);
  /** The typed net assets; null = not typed (follow the Overview's own value). */
  const [netText, setNetText] = useState<string | null>(null);
  const o = overviewNow(live.overview, live.now, live.page, live.lines);
  const ownNet = o.net ?? 0;
  const typedNet = netText === null ? null : parseNetAssets(netText);
  const netBad = netText !== null && typedNet === null;
  // #221 AO4: the scenario's own signed parser (-50 counts; the main page's parseAmount is unchanged).
  const parsedGrowth = parseGrowth(live.overview.growth);
  const growth = parsedGrowth ?? 0;
  const growthBad = parsedGrowth === null || !growthOk(growth);
  const inputs: Inputs = {
    current: live.current,
    start: typedNet ?? ownNet,
    income: o.income,
    expenses: o.expenses,
    growth: growthBad ? 0 : growth,
    rate: live.rate,
  };
  const proj = project(inputs, horizon);
  const today = project(saved, horizon);
  const empty = o.net === null && !o.income && !o.expenses && !saved.income && !saved.expenses;
  const commit = () => {
    // AN13: Enter (or leaving the field) commits: a valid amount is shown formatted; a bad one keeps its error.
    if (netText !== null && typedNet !== null) setNetText(formatMoney(typedNet));
  };
  return (
    <>
      <section aria-labelledby={`${uid}-path`} data-testid="pf-scenario-path" className="flex flex-col gap-6">
        <p className="pf-label">06</p>
        <h2 id={`${uid}-path`} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
          Projected path
        </h2>
        {empty ? (
          <p className="pf-history-note" data-testid="pf-scenario-empty">
            {NO_DATA}
          </p>
        ) : null}
        <div className="pf-cell max-w-xs">
          <label htmlFor={`${uid}-net`} className="pf-label">
            {`Net assets now (end of ${monthName(live.current)})`}
          </label>
          <input
            id={`${uid}-net`}
            className="pf-field"
            inputMode="decimal"
            value={netText ?? formatMoney(ownNet)}
            onChange={(e) => setNetText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            aria-invalid={netBad || undefined}
            aria-describedby={`${uid}-net-hint${netBad ? ` ${uid}-net-error` : ""}`}
            data-testid="pf-scenario-net"
          />
          <span id={`${uid}-net-hint`} className="pf-rate-source">
            <span data-testid="pf-scenario-net-basis">{netBasis(live.overview, live.now, o.net)}</span>
            {" A what-if: never saved. A negative amount is allowed."}
          </span>
          {netBad ? (
            <span id={`${uid}-net-error`} className="pf-error" data-testid="pf-scenario-net-error">
              {NET_ASSETS_ERROR}
            </span>
          ) : null}
        </div>
        {growthBad ? (
          <p className="pf-error" role="alert" data-testid="pf-scenario-growth-error">
            {GROWTH_ERROR}
          </p>
        ) : null}
        <div className="pf-years" role="group" aria-label="Horizon" data-testid="pf-scenario-horizons">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              className="pf-toggle"
              aria-pressed={horizon === h}
              onClick={() => setHorizon(h)}
              data-testid={`pf-horizon-${h}`}
            >
              {horizonLabel(h)}
            </button>
          ))}
        </div>
        <ScenarioChart points={proj.points} width={chartWidth} />
      </section>
      <section aria-labelledby={`${uid}-totals`} data-testid="pf-scenario-totals-section">
        <p className="pf-label">07</p>
        <h2 id={`${uid}-totals`} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
          Totals
        </h2>
        <TotalsTable today={today} proj={proj} horizon={horizon} saved={saved} inputs={inputs} />
      </section>
    </>
  );
}

function TotalsTable({
  today,
  proj,
  horizon,
  saved,
  inputs,
}: {
  today: ReturnType<typeof project>;
  proj: ReturnType<typeof project>;
  horizon: Horizon;
  saved: Inputs;
  inputs: Inputs;
}) {
  const t = proj.totals;
  const nowCov = equityCoverage(saved.start, saved.rate, saved.expenses);
  const scCov = equityCoverage(inputs.start, inputs.rate, inputs.expenses);
  const rows: { key: string; name: string; today: string; scenario: string; total: string }[] = [
    { key: "income", name: "Net income", today: money(today.totals.monthlyIncome), scenario: money(t.monthlyIncome), total: money(t.income) },
    { key: "expenses", name: EXPENSES, today: money(today.totals.monthlyExpenses), scenario: money(t.monthlyExpenses), total: money(t.expenses) },
    { key: "surplus", name: SURPLUS, today: money(today.totals.monthlySurplus), scenario: money(t.monthlySurplus), total: money(t.surplus) },
    { key: "growth", name: "Growth earned", today: "—", scenario: "—", total: money(t.growthEarned) },
    { key: "net", name: NET_ASSETS, today: money(saved.start), scenario: money(inputs.start), total: money(t.netEnd) },
    {
      key: "coverage",
      name: "Equity coverage (monthly)",
      today: nowCov.status === "ok" ? money(nowCov.monthly) : "—",
      scenario: scCov.status === "ok" ? money(scCov.monthly) : "—",
      total: money(t.coverageMonthly),
    },
    {
      key: "coverage-share",
      name: "Equity coverage (% of expenses)",
      today: nowCov.status === "ok" ? formatPercent(nowCov.share) : "—",
      scenario: scCov.status === "ok" ? formatPercent(scCov.share) : "—",
      total: formatPercent(t.coverageShare),
    },
  ];
  return (
    <div
      className="pf-scenario-scroll mt-4"
      role="region"
      aria-label="Scenario totals, scrolls sideways on a phone"
      tabIndex={0}
      data-testid="pf-scenario-scroll"
    >
      <div className="pf-ov-table pf-scenario-table" role="table" aria-label="Scenario totals" data-testid="pf-scenario-totals">
        <div className="pf-ov-row pf-ov-head" role="row">
          <span role="columnheader" className="pf-label">
            <span className="sr-only">Figure</span>
          </span>
          <span role="columnheader" className="pf-label">
            Today, a month
          </span>
          <span role="columnheader" className="pf-label">
            Scenario, a month
          </span>
          <span role="columnheader" className="pf-label" data-testid="pf-scenario-total-head">
            {`Over ${horizonLabel(horizon)}`}
          </span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="pf-ov-row" role="row" data-testid={`pf-scenario-row-${r.key}`}>
            <span role="rowheader" className="pf-ov-name">
              {r.name}
            </span>
            <span role="cell" className="pf-ov-value" data-testid="pf-scenario-today">
              {r.today}
            </span>
            <span role="cell" className="pf-ov-value" data-testid="pf-scenario-month">
              {r.scenario}
            </span>
            <span role="cell" className="pf-ov-value" data-testid="pf-scenario-total">
              {r.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Axis width that fits the longest compact tick (no clipping): ~7 px a character plus padding. */
const axisWidth = (values: number[]): number =>
  Math.max(48, ...values.map((v) => COMPACT.format(v).length * 7 + 14));

function ScenarioChart({ points, width }: { points: ProjPoint[]; width?: number }) {
  const last = points[points.length - 1];
  const flowW = axisWidth(points.flatMap((p) => [p.income, p.expenses]));
  const netW = axisWidth(points.map((p) => p.net));
  const chart = (h?: number) => (
    <LineChart
      width={width}
      height={h}
      data={points}
      margin={{ top: 12, right: 8, left: 8, bottom: 0 }}
    >
      <CartesianGrid stroke="var(--color-hair)" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        // #221 AO2: explicit ticks, always `Now` first, at most 5 (fits 390 and 1440 for every horizon).
        ticks={xTickIndexes(points.length).map((i) => points[i].label)}
        interval={0}
      />
      <YAxis
        yAxisId="flow"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        width={flowW}
        tickFormatter={(v: number) => COMPACT.format(v)}
        label={{ value: "A month", angle: -90, position: "insideLeft", fill: "var(--color-dim)", fontSize: 11 }}
      />
      <YAxis
        yAxisId="net"
        orientation="right"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        width={netW}
        tickFormatter={(v: number) => COMPACT.format(v)}
        label={{ value: NET_ASSETS, angle: 90, position: "insideRight", fill: "var(--color-dim)", fontSize: 11 }}
      />
      {/* #221: the zero line, so a negative path reads at a glance. */}
      <ReferenceLine yAxisId="net" y={0} stroke="var(--color-rule)" />
      <Tooltip
        formatter={(value, name) => [money(typeof value === "number" ? value : null), String(name)]}
        labelFormatter={(_l, payload) => {
          const p = payload?.[0]?.payload as ProjPoint | undefined;
          return p ? pointName(p, points.indexOf(p)) : "";
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
        />
      ))}
    </LineChart>
  );
  return (
    <figure
      className="pf-chart mt-4 min-w-0"
      data-testid="pf-scenario-chart"
      data-months={points.length}
      data-net-last={last ? last.net.toFixed(2) : ""}
    >
      <figcaption className="sr-only">
        Projected income, expenses and net assets by month
      </figcaption>
      <div className="pf-chart-plot" aria-hidden="true">
        {width ? (
          chart(240)
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chart()}
          </ResponsiveContainer>
        )}
      </div>
      <ul className="pf-legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="pf-swatch" style={{ background: s.color }} aria-hidden="true" />
            {`${s.name} (${s.axis === "net" ? "right axis" : "left axis, a month"})`}
          </li>
        ))}
      </ul>
    </figure>
  );
}
