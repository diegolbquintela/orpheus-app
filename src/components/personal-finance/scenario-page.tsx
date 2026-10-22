// #215 (personal-finance-spec 55, AC PFSC): the destination analysis / scenario screen. A what-if layer: levers move,
// every figure is recalculated on the spot in the browser, nothing is sent. The only write is `Save scenario`, shown to
// people with a write grant only (#197 pattern; the server needs write too).
import { useEffect, useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReadOnlyLine } from "@/components/access/denied";
import {
  formatCoverageShare,
  equityCoverage,
  EXPENSES,
  INCOME,
  NET_ASSETS,
  SURPLUS,
} from "@/lib/finance/overview";
import { formatMoney } from "@/lib/finance/money";
import { formatRate } from "@/lib/finance/equity";
import {
  baselineOf,
  type Baseline,
  CHANGE_MAX,
  CHANGE_MIN,
  DEFAULT_HORIZON,
  GROWTH_MAX,
  GROWTH_MIN,
  type Horizon,
  HORIZONS,
  horizonLabel,
  LEVER_ERROR,
  LOAD_ERROR,
  LOADING,
  NO_BASELINE,
  NO_SCENARIO,
  NOT_SAVED,
  parseLever,
  pointName,
  type ProjPoint,
  project,
  RATE_MAX,
  RATE_MIN,
  READ_ONLY_NOTE,
  readScenario,
  RESET,
  SAVE_SCENARIO,
  SAVED,
  SCENARIO_PATH,
  SCENARIO_TITLE,
  type Scenario,
  scenarioText,
  UNSAVED,
  WHAT_IF_NOTE,
} from "@/lib/finance/scenario";
import {
  loadForScenario,
  saveScenario,
  type Access,
  type SaveResult,
  type ScenarioLoad,
} from "@/lib/finance/scenario-client";
import type { PfRecord } from "@/lib/finance/record";

type Texts = {
  income: Record<string, string>;
  expenses: Record<string, string>;
  rate: string;
  growth: string;
  start: string;
};
const EMPTY_TEXTS: Texts = { income: {}, expenses: {}, rate: "", growth: "", start: "" };
const num = (n: number | null | undefined) =>
  n === null || n === undefined || n === 0 ? "" : String(n);
const textsOf = (s: Scenario): Texts => ({
  income: Object.fromEntries(Object.entries(s.income).map(([k, v]) => [k, num(v)])),
  expenses: Object.fromEntries(Object.entries(s.expenses).map(([k, v]) => [k, num(v)])),
  rate: s.rate === null ? "" : String(s.rate),
  growth: s.growth === null ? "" : String(s.growth),
  start: s.start === null ? "" : String(s.start),
});

/** The levers as numbers; a field in error is left out (it moves nothing) and listed in `bad`. */
function leversOf(t: Texts): { scenario: Scenario; bad: Set<string> } {
  const bad = new Set<string>();
  const changes = (m: Record<string, string>, prefix: string) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(m)) {
      if (v.trim() === "") continue;
      const n = parseLever(v, CHANGE_MIN, CHANGE_MAX);
      if (n === null) bad.add(`${prefix}:${k}`);
      else out[k] = n;
    }
    return out;
  };
  const one = (v: string, id: string, lo: number, hi: number) => {
    if (v.trim() === "") return null;
    const n = parseLever(v, lo, hi);
    if (n === null) bad.add(id);
    return n;
  };
  return {
    scenario: {
      income: changes(t.income, "income"),
      expenses: changes(t.expenses, "expenses"),
      rate: one(t.rate, "rate", RATE_MIN, RATE_MAX),
      growth: one(t.growth, "growth", GROWTH_MIN, GROWTH_MAX),
      start: one(t.start, "start", -1e12, 1e12),
    },
    bad,
  };
}

const money = (v: number | null) => (v === null ? "—" : formatMoney(v));
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const SERIES = [
  { key: "expenses", name: EXPENSES, color: "var(--color-alert)", axis: "flow" },
  { key: "income", name: INCOME, color: "var(--color-green)", axis: "flow" },
  { key: "net", name: NET_ASSETS, color: "var(--color-chalk)", axis: "net" },
] as const;

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; record: PfRecord | null; access: Access };

export function ScenarioPage({
  load = loadForScenario,
  save = saveScenario,
  now = () => new Date(),
  chartWidth,
  onSignedOut = () =>
    window.location.assign(`/dashboard/sign-in?next=${encodeURIComponent(SCENARIO_PATH)}`),
}: {
  load?: () => Promise<ScenarioLoad>;
  save?: (s: Scenario) => Promise<SaveResult>;
  now?: () => Date;
  chartWidth?: number;
  onSignedOut?: () => void;
}) {
  const uid = useId();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [texts, setTexts] = useState<Texts>(EMPTY_TEXTS);
  const [savedText, setSavedText] = useState(scenarioText(NO_SCENARIO));
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void load().then((r) => {
      if (!live) return;
      if (!r.ok) {
        if (r.status === 401) onSignedOut();
        else setState({ kind: "error" });
        return;
      }
      const stored = readScenario(r.record) ?? NO_SCENARIO;
      setTexts(textsOf(stored));
      setSavedText(scenarioText(stored));
      setState({ kind: "ready", record: r.record, access: r.access });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const record = state.kind === "ready" ? state.record : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo<Baseline | null>(
    () => (state.kind === "ready" ? baselineOf(record, now()) : null),
    [state.kind, record],
  );
  const { scenario, bad } = useMemo(() => leversOf(texts), [texts]);
  const proj = useMemo(
    () => (base ? project(base, scenario, horizon) : null),
    [base, scenario, horizon],
  );
  const today = useMemo(() => (base ? project(base, NO_SCENARIO, horizon) : null), [base, horizon]);
  const write = state.kind === "ready" && state.access.write;
  const dirty = scenarioText(scenario) !== savedText;

  const set = (patch: Partial<Texts>) => {
    setNote("");
    setTexts((t) => ({ ...t, ...patch }));
  };
  const onSave = async () => {
    if (!write || bad.size || saving) return;
    setSaving(true);
    const r = await save(scenario);
    setSaving(false);
    if (r.ok) {
      setSavedText(scenarioText(scenario));
      setNote(SAVED);
    } else if (r.status === 401) onSignedOut();
    else setNote(NOT_SAVED);
  };

  return (
    <div className="pf">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pt-10 pb-20 sm:px-8 lg:pt-14 lg:pb-24">
        <header className="relative">
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">{SCENARIO_TITLE}</h1>
          <p className="pf-charts-back mt-3">
            <a href="/personal-finance" data-testid="pf-scenario-back">
              Personal Finance
            </a>
          </p>
          <p className="pf-history-note mt-3" data-testid="pf-scenario-whatif">
            {WHAT_IF_NOTE}
          </p>
          {state.kind === "ready" && !write ? (
            <>
              <ReadOnlyLine className="mt-3" />
              <p className="pf-history-note mt-1" data-testid="pf-scenario-readonly">
                {READ_ONLY_NOTE}
              </p>
            </>
          ) : null}
        </header>
        <div
          className="pf-scenario-area"
          aria-busy={state.kind === "loading"}
          data-testid="pf-scenario"
        >
          {state.kind === "loading" ? (
            <p className="pf-history-note" role="status" data-testid="pf-scenario-loading">
              {LOADING}
            </p>
          ) : state.kind === "error" ? (
            <p className="pf-error" role="alert" data-testid="pf-scenario-error">
              {LOAD_ERROR}
            </p>
          ) : !base || !proj || !today ? null : (
            <div className="flex flex-col gap-10">
              {base.month === null ? (
                <p className="pf-history-note" data-testid="pf-scenario-empty">
                  {NO_BASELINE}
                </p>
              ) : (
                <p className="pf-history-note" data-testid="pf-scenario-basis">
                  {`Starting from ${base.month}'s lines, monthly figures in ${base.currency}. The projection starts next month.`}
                </p>
              )}
              <section aria-labelledby={`${uid}-levers`} data-testid="pf-scenario-levers">
                <p className="pf-label">02</p>
                <h2
                  id={`${uid}-levers`}
                  className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk"
                >
                  Levers
                </h2>
                <LeverGroup
                  title="Income (% change)"
                  testId="pf-lever-income"
                  lines={base.income}
                  values={texts.income}
                  bad={bad}
                  prefix="income"
                  onChange={(id, v) => set({ income: { ...texts.income, [id]: v } })}
                />
                <LeverGroup
                  title="Expenses by category (% change)"
                  testId="pf-lever-expenses"
                  lines={base.categories}
                  values={texts.expenses}
                  bad={bad}
                  prefix="expenses"
                  onChange={(id, v) => set({ expenses: { ...texts.expenses, [id]: v } })}
                />
                <div className="pf-scenario-grid mt-6" data-testid="pf-lever-other">
                  <LeverField
                    id={`${uid}-rate`}
                    label="Rate used (%)"
                    hint={`Today ${formatRate(base.rate)}`}
                    value={texts.rate}
                    bad={bad.has("rate")}
                    testId="pf-lever-rate"
                    onChange={(v) => set({ rate: v })}
                  />
                  <LeverField
                    id={`${uid}-growth`}
                    label="Growth rate (% a year)"
                    hint={`Today ${base.growth}%`}
                    value={texts.growth}
                    bad={bad.has("growth")}
                    testId="pf-lever-growth"
                    onChange={(v) => set({ growth: v })}
                  />
                  <LeverField
                    id={`${uid}-start`}
                    label="Net assets now"
                    hint={`Today ${formatMoney(base.start)}`}
                    value={texts.start}
                    bad={bad.has("start")}
                    testId="pf-lever-start"
                    onChange={(v) => set({ start: v })}
                  />
                </div>
                <div className="pf-scenario-actions mt-6">
                  <button
                    type="button"
                    className="pf-toggle"
                    onClick={() => set(EMPTY_TEXTS)}
                    data-testid="pf-scenario-reset"
                  >
                    {RESET}
                  </button>
                  {write ? (
                    <button
                      type="button"
                      className="pf-button"
                      onClick={() => void onSave()}
                      disabled={!dirty || bad.size > 0 || saving}
                      data-testid="pf-scenario-save"
                    >
                      {SAVE_SCENARIO}
                    </button>
                  ) : null}
                  <p className="pf-charts-note" role="status" data-testid="pf-scenario-status">
                    {note || (write && dirty ? UNSAVED : "")}
                  </p>
                </div>
              </section>
              <section aria-labelledby={`${uid}-path`} data-testid="pf-scenario-path">
                <p className="pf-label">03</p>
                <h2
                  id={`${uid}-path`}
                  className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk"
                >
                  Projected path
                </h2>
                <div
                  className="pf-years mt-3"
                  role="group"
                  aria-label="Horizon"
                  data-testid="pf-scenario-horizons"
                >
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
                <p className="pf-label">04</p>
                <h2
                  id={`${uid}-totals`}
                  className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk"
                >
                  Totals
                </h2>
                <TotalsTable base={base} today={today} proj={proj} horizon={horizon} />
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LeverGroup({
  title,
  testId,
  lines,
  values,
  bad,
  prefix,
  onChange,
}: {
  title: string;
  testId: string;
  lines: { id: string; label: string; monthly: number }[];
  values: Record<string, string>;
  bad: Set<string>;
  prefix: string;
  onChange: (id: string, v: string) => void;
}) {
  const uid = useId();
  if (!lines.length) return null;
  return (
    <fieldset className="pf-scenario-fieldset mt-6" data-testid={testId}>
      <legend className="pf-label">{title}</legend>
      <div className="pf-scenario-grid mt-3">
        {lines.map((l, i) => (
          <LeverField
            key={l.id}
            id={`${uid}-${i}`}
            label={l.label}
            hint={`Today ${formatMoney(l.monthly)} a month`}
            value={values[l.id] ?? ""}
            bad={bad.has(`${prefix}:${l.id}`)}
            testId={`${testId}-field`}
            onChange={(v) => onChange(l.id, v)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function LeverField({
  id,
  label,
  hint,
  value,
  bad,
  testId,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  bad: boolean;
  testId: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="pf-cell">
      <label htmlFor={id} className="pf-label">
        {label}
      </label>
      <input
        id={id}
        className="pf-field"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={bad || undefined}
        aria-describedby={`${id}-hint${bad ? ` ${id}-error` : ""}`}
        data-testid={testId}
      />
      <span id={`${id}-hint`} className="pf-rate-source">
        {hint}
      </span>
      {bad ? (
        <span id={`${id}-error`} className="pf-error" data-testid="pf-error">
          {LEVER_ERROR}
        </span>
      ) : null}
    </div>
  );
}

function TotalsTable({
  base,
  today,
  proj,
  horizon,
}: {
  base: Baseline;
  today: ReturnType<typeof project>;
  proj: ReturnType<typeof project>;
  horizon: Horizon;
}) {
  const t = proj.totals;
  const now = equityCoverage(base.start, base.rate, today.totals.monthlyExpenses);
  const rows: { key: string; name: string; today: string; scenario: string; total: string }[] = [
    {
      key: "income",
      name: "Net income",
      today: money(today.totals.monthlyIncome),
      scenario: money(t.monthlyIncome),
      total: money(t.income),
    },
    {
      key: "expenses",
      name: EXPENSES,
      today: money(today.totals.monthlyExpenses),
      scenario: money(t.monthlyExpenses),
      total: money(t.expenses),
    },
    {
      key: "surplus",
      name: SURPLUS,
      today: money(today.totals.monthlySurplus),
      scenario: money(t.monthlySurplus),
      total: money(t.surplus),
    },
    {
      key: "net",
      name: NET_ASSETS,
      today: money(base.start),
      scenario: "—",
      total: money(t.netEnd),
    },
    {
      key: "coverage",
      name: "Equity coverage (monthly)",
      today: now.status === "ok" ? money(now.monthly) : "—",
      scenario: "—",
      total: money(t.coverageMonthly),
    },
    {
      key: "coverage-share",
      name: "Equity coverage (% of expenses)",
      today: now.status === "ok" ? formatCoverageShare(now.share) : "—",
      scenario: "—",
      total: t.coverageShare === null ? "—" : formatCoverageShare(t.coverageShare),
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
      <div
        className="pf-ov-table pf-scenario-table"
        role="table"
        aria-label="Scenario totals"
        data-testid="pf-scenario-totals"
      >
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
          <div
            key={r.key}
            className="pf-ov-row"
            role="row"
            data-testid={`pf-scenario-row-${r.key}`}
          >
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

function ScenarioChart({ points, width }: { points: ProjPoint[]; width?: number }) {
  const last = points[points.length - 1];
  const chart = (h?: number) => (
    <LineChart
      width={width}
      height={h}
      data={points}
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
        tickFormatter={(v: number) => COMPACT.format(v)}
      />
      <YAxis
        yAxisId="net"
        orientation="right"
        tick={{ fill: "var(--color-dim)", fontSize: 12 }}
        tickLine={false}
        axisLine={false}
        width={48}
        tickFormatter={(v: number) => COMPACT.format(v)}
      />
      <Tooltip
        formatter={(value, name) => [money(typeof value === "number" ? value : null), String(name)]}
        labelFormatter={(_l, payload) => {
          const p = payload?.[0]?.payload as ProjPoint | undefined;
          return p ? pointName(p) : "";
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
            {s.name}
          </li>
        ))}
      </ul>
    </figure>
  );
}
