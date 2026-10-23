// #215 (personal-finance-spec 55) / #221 (spec 57, AC PFPJ): the scenario screen. Since #221 it is the Personal Finance
// page itself in scenario mode (Income through Overview, categories removed; prefilled from the saved record), whose
// edits are what-ifs that are never sent, then the projection and totals below. Nothing on this screen is ever written
// (CFO scope cut 2026-10-22): the net-assets field is a local starting value. One GET on open, no PUT, ever.
import { useId, useRef, useState } from "react";
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
import { changeSaved, loadForScenario, type Access, type ChangeResult, type ScenarioLoad } from "@/lib/finance/scenario-client";
import { readScenario } from "@/lib/finance/scenario-key";
import { householdMonth } from "@/lib/finance/overview";
import {
  addSaved,
  basisChanged,
  COMPARE_MAX,
  DELETE_FAILED,
  deleteScenarioQuestion,
  keptValues,
  NAME_LABEL,
  nameError,
  renameError,
  newId,
  removeSaved,
  RENAME,
  renameSaved,
  UPDATE,
  updateSaved,
  updateScenarioQuestion,
  reopenRecord,
  SAVE_FAILED,
  SAVE_SCENARIO,
  type SavedEntry,
} from "@/lib/finance/saved-scenarios";

const money = (v: number | null) => (v === null ? "—" : formatMoney(v));
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const SERIES = [
  { key: "expenses", name: EXPENSES, color: "var(--color-alert)", axis: "flow" },
  { key: "income", name: INCOME, color: "var(--color-green)", axis: "flow" },
  { key: "net", name: NET_ASSETS, color: "var(--color-chalk)", axis: "net" },
] as const;

export function ScenarioPage({
  load = loadForScenario,
  change = changeSaved,
  now,
  chartWidth,
  onSignedOut = () =>
    window.location.assign(`/dashboard/sign-in?next=${encodeURIComponent(SCENARIO_PATH)}`),
}: {
  load?: () => Promise<ScenarioLoad>;
  /** #223: the only write path (Save scenario / Delete); tests pass a spy. */
  change?: typeof changeSaved;
  now?: Date;
  chartWidth?: number;
  onSignedOut?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ record: PfRecord | null; access: Access } | null>(null);
  const [failed, setFailed] = useState(false);
  // #223: the reopened saved scenario (null = the latest month, as #221/#222 shipped). Reopening remounts the page from
  // the record already loaded (no second GET), with the saved values over it in memory only.
  const [opened, setOpened] = useState<SavedEntry | null>(null);
  const latest = useRef<PfRecord | null | undefined>(undefined);
  const openedRef = useRef<SavedEntry | null>(null);
  openedRef.current = opened;
  // The page's store: the loaded record in memory, with NO `save`: no edit, toggle or migration can ever be sent.
  const [loadStore] = useState<LoadStore>(() => async () => {
    if (latest.current !== undefined) {
      const o = openedRef.current;
      const rec = o ? reopenRecord(latest.current, o, householdMonth(now ?? new Date())) : latest.current;
      return new RecordStore({ ...(rec ?? {}) });
    }
    const r = await load();
    if (!r.ok) {
      if (r.status === 401) onSignedOut();
      else setFailed(true);
      throw new Error(`load ${r.status}`);
    }
    latest.current = r.record;
    setLoaded({ record: r.record, access: r.access });
    return new RecordStore({ ...(r.record ?? {}) });
  });
  const savedList = readScenario(loaded?.record ?? null)?.saved ?? [];
  const afterChange = (r: ChangeResult) => {
    if (r.ok && loaded) {
      // Only the scenario value is taken from the reply; the rest of what the screen shows is unchanged.
      latest.current = r.record;
      setLoaded({ record: r.record, access: loaded.access });
    }
    return r;
  };
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
        key={opened?.id ?? "latest"}
        now={now}
        loadStore={loadStore}
        scenario={{
          render: (live) => (
            <ScenarioProjection
              live={live}
              saved={savedInputs(loaded?.record ?? null, live.now)}
              chartWidth={chartWidth}
              initialNet={opened ? formatMoney(opened.inputs.start) : null}
              named={{
                list: savedList,
                write: !!loaded?.access.write,
                opened,
                open: setOpened,
                change: async (c) => afterChange(await change(c)),
              }}
            />
          ),
        }}
      />
    </>
  );
}

/** The projection under the page: net assets (a local start), horizons, the chart and the totals. Nothing is sent. */
export type Named = {
  list: SavedEntry[];
  write: boolean;
  opened: SavedEntry | null;
  open: (e: SavedEntry | null) => void;
  change: (c: Parameters<typeof changeSaved>[0]) => Promise<ChangeResult>;
};

export function ScenarioProjection({
  live,
  saved,
  chartWidth,
  initialNet = null,
  named,
}: {
  live: ScenarioLive;
  saved: Inputs;
  chartWidth?: number;
  initialNet?: string | null;
  named?: Named;
}) {
  const uid = useId();
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);
  /** The typed net assets; null = not typed (follow the Overview's own value). */
  const [netText, setNetText] = useState<string | null>(initialNet);
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
            <span data-testid="pf-scenario-net-basis">{netBasis(live.overview, live.now, o.net, undefined, live.page, live.lines)}</span>
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
      {named ? <SavedScenarios named={named} live={live} inputs={inputs} horizon={horizon} blocked={netBad || growthBad} /> : null}
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

/**
 * #223 (spec 60, AC PFSS): named scenarios. Save (writers) keeps what the screen shows under a name; Open reopens one
 * (anyone who can see the screen); Delete (writers) asks first; Compare puts up to `COMPARE_MAX` saved scenarios beside
 * the screen as it is now. Only Save and Delete send anything, and only the scenario value changes.
 * #233 (spec 66): Rename and Update (after a confirm) also write, the same way; nothing else does.
 */
function SavedScenarios({
  named,
  live,
  inputs,
  horizon,
  blocked,
}: {
  named: Named;
  live: ScenarioLive;
  inputs: Inputs;
  horizon: Horizon;
  blocked: boolean;
}) {
  const uid = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const { list, write, opened } = named;
  // #233 (spec 66, AC PFSR): the scenario being renamed (inline field) and its draft name; local only, nothing sent.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameErr, setRenameErr] = useState<string | null>(null);

  const snapshot = (): Omit<SavedEntry, "id" | "name"> => {
    const v = live.values();
    return {
      savedAt: new Date().toISOString(),
      basis: live.current,
      inputs: { start: inputs.start, income: inputs.income, expenses: inputs.expenses, growth: inputs.growth, rate: inputs.rate },
      values: keptValues(v.record),
      lines: JSON.stringify(v.lines),
    };
  };
  const reopenIf = (id: string, r: ChangeResult) => {
    if (!r.ok || opened?.id !== id) return;
    const e = (readScenario(r.record)?.saved ?? []).find((x) => x.id === id);
    if (e) named.open(e);
  };

  async function rename(e: SavedEntry) {
    const err = renameError(draft, list, e.id);
    if (err) {
      setRenameErr(err);
      return;
    }
    setRenameErr(null);
    setBusy(true);
    const r = await named.change((s) => renameSaved(s, e.id, draft));
    setBusy(false);
    if (r.ok) {
      setRenaming(null);
      setStatus(`Renamed "${e.name}" to "${draft.trim()}".`);
      reopenIf(e.id, r);
    } else setRenameErr("error" in r ? r.error : SAVE_FAILED);
  }

  async function update(e: SavedEntry) {
    if (blocked) {
      setStatus("Fix the fields in error first.");
      return;
    }
    if (!window.confirm(updateScenarioQuestion(e.name))) return;
    setBusy(true);
    const next = snapshot();
    const r = await named.change((s) => updateSaved(s, e.id, next));
    setBusy(false);
    if (r.ok) {
      setStatus(`Updated "${e.name}".`);
      reopenIf(e.id, r);
    } else setStatus("error" in r ? r.error : SAVE_FAILED);
  }

  async function save() {
    const err = blocked ? "Fix the fields in error first." : nameError(name, list);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(true);
    const v = live.values();
    const entry: SavedEntry = {
      id: newId(),
      name: name.trim(),
      savedAt: new Date().toISOString(),
      basis: live.current,
      inputs: { start: inputs.start, income: inputs.income, expenses: inputs.expenses, growth: inputs.growth, rate: inputs.rate },
      values: keptValues(v.record),
      lines: JSON.stringify(v.lines),
    };
    const r = await named.change((s) => addSaved(s, entry));
    setBusy(false);
    if (r.ok) {
      setName("");
      setStatus(`Saved "${entry.name}".`);
    } else setError("error" in r ? r.error : SAVE_FAILED);
  }

  async function remove(e: SavedEntry) {
    if (!window.confirm(deleteScenarioQuestion(e.name))) return;
    setBusy(true);
    const r = await named.change((s) => removeSaved(s, e.id));
    setBusy(false);
    if (r.ok) {
      setPicked((p) => p.filter((id) => id !== e.id));
      setStatus(`Deleted "${e.name}".`);
      if (opened?.id === e.id) named.open(null);
    } else setStatus("error" in r ? r.error : DELETE_FAILED);
  }

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= COMPARE_MAX ? p : [...p, id]));
  const compared = list.filter((e) => picked.includes(e.id));

  return (
    <>
      <section aria-labelledby={`${uid}-saved`} data-testid="pf-saved-section">
        <p className="pf-label">08</p>
        <h2 id={`${uid}-saved`} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
          Saved scenarios
        </h2>
        <p className="pf-history-note">
          Saved scenarios never change your Personal Finance data. {opened ? `Showing "${opened.name}".` : "Showing your latest month."}
        </p>
        {opened && opened.basis !== live.current ? (
          <p className="pf-history-note" data-testid="pf-saved-basis">
            {basisChanged(monthName(opened.basis), monthName(live.current))}
          </p>
        ) : null}
        {opened ? (
          <button type="button" className="pf-button mt-2" onClick={() => named.open(null)} data-testid="pf-saved-latest">
            Back to the latest month
          </button>
        ) : null}
        {write ? (
          <div className="pf-cell mt-4 max-w-md">
            <label htmlFor={`${uid}-name`} className="pf-label">
              {NAME_LABEL}
            </label>
            <input
              id={`${uid}-name`}
              className="pf-field"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${uid}-name-error` : undefined}
              data-testid="pf-saved-name"
            />
            {error ? (
              <span id={`${uid}-name-error`} className="pf-error" data-testid="pf-saved-error">
                {error}
              </span>
            ) : null}
            <button type="button" className="pf-button mt-2" onClick={() => void save()} disabled={busy} data-testid="pf-saved-save">
              {SAVE_SCENARIO}
            </button>
          </div>
        ) : null}
        <p className="sr-only" role="status" data-testid="pf-saved-status">
          {status}
        </p>
        {list.length ? (
          <ul className="mt-4 flex flex-col gap-2" data-testid="pf-saved-list">
            {list.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3" data-testid="pf-saved-item">
                <span className="text-chalk" data-testid="pf-saved-item-name">
                  {e.name}
                </span>
                <span className="pf-rate-source">{`from ${monthName(e.basis)}`}</span>
                <button type="button" className="pf-button" onClick={() => named.open(e)} aria-label={`Open ${e.name}`} data-testid="pf-saved-open">
                  Open
                </button>
                <label className="pf-rate-source pf-saved-compare-label flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={picked.includes(e.id)}
                    disabled={!picked.includes(e.id) && picked.length >= COMPARE_MAX}
                    onChange={() => togglePick(e.id)}
                    data-testid="pf-saved-compare"
                  />
                  {`Compare ${e.name}`}
                </label>
                {write && renaming !== e.id ? (
                  <button
                    type="button"
                    className="pf-button"
                    onClick={() => {
                      setRenaming(e.id);
                      setDraft(e.name);
                      setRenameErr(null);
                    }}
                    disabled={busy}
                    aria-label={`${RENAME} ${e.name}`}
                    data-testid="pf-saved-rename"
                  >
                    {RENAME}
                  </button>
                ) : null}
                {write && renaming === e.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <input
                      className="pf-field"
                      value={draft}
                      maxLength={80}
                      aria-label={`New name for ${e.name}`}
                      onChange={(ev) => setDraft(ev.target.value)}
                      aria-invalid={renameErr ? true : undefined}
                      aria-describedby={renameErr ? `${uid}-rename-error` : undefined}
                      data-testid="pf-saved-rename-name"
                    />
                    <button type="button" className="pf-button" onClick={() => void rename(e)} disabled={busy} data-testid="pf-saved-rename-save">
                      Save name
                    </button>
                    <button type="button" className="pf-button" onClick={() => setRenaming(null)} data-testid="pf-saved-rename-cancel">
                      Cancel
                    </button>
                    {renameErr ? (
                      <span id={`${uid}-rename-error`} className="pf-error" data-testid="pf-saved-rename-error">
                        {renameErr}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {write ? (
                  <button type="button" className="pf-button" onClick={() => void update(e)} disabled={busy} aria-label={`${UPDATE} ${e.name}`} data-testid="pf-saved-update">
                    {UPDATE}
                  </button>
                ) : null}
                {write ? (
                  <button type="button" className="pf-button" onClick={() => void remove(e)} disabled={busy} aria-label={`Delete ${e.name}`} data-testid="pf-saved-delete">
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pf-history-note mt-4" data-testid="pf-saved-none">
            No saved scenarios yet.
          </p>
        )}
      </section>
      {compared.length ? <CompareTable live={inputs} entries={compared} horizon={horizon} /> : null}
    </>
  );
}

/** #223 Q-SS1: the screen now and up to 3 saved scenarios side by side, at the chosen horizon, plus a net-assets chart. */
function CompareTable({ live, entries, horizon }: { live: Inputs; entries: SavedEntry[]; horizon: Horizon }) {
  const uid = useId();
  const cols = [
    { id: "now", name: "This screen", proj: project(live, horizon) },
    ...entries.map((e) => ({ id: e.id, name: e.name, proj: project({ ...e.inputs, current: live.current }, horizon) })),
  ];
  const rows: { key: string; name: string; cell: (p: ReturnType<typeof project>) => string }[] = [
    { key: "income", name: "Net income, a month", cell: (p) => money(p.totals.monthlyIncome) },
    { key: "expenses", name: "Expenses, a month", cell: (p) => money(p.totals.monthlyExpenses) },
    { key: "surplus", name: "Surplus, a month", cell: (p) => money(p.totals.monthlySurplus) },
    { key: "start", name: "Net assets now", cell: (p) => money(p.points[0]?.net ?? null) },
    { key: "end", name: `Net assets after ${horizonLabel(horizon)}`, cell: (p) => money(p.totals.netEnd) },
    { key: "growth-earned", name: `Growth earned over ${horizonLabel(horizon)}`, cell: (p) => money(p.totals.growthEarned) },
  ];
  const data = cols[0].proj.points.map((pt, i) => ({
    label: pt.label,
    ...Object.fromEntries(cols.map((c) => [c.id, c.proj.points[i]?.net ?? null])),
  }));
  const colors = ["var(--color-chalk)", "var(--color-green)", "var(--color-alert)", "var(--color-dim)"];
  return (
    <section aria-labelledby={`${uid}-cmp`} data-testid="pf-compare-section">
      <p className="pf-label">09</p>
      <h2 id={`${uid}-cmp`} className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">
        Compare
      </h2>
      <div className="pf-scenario-scroll mt-4" role="region" aria-label="Compare, scrolls sideways on a phone" tabIndex={0}>
        <div className="pf-ov-table pf-scenario-table" role="table" aria-label="Compare scenarios" data-testid="pf-compare-table">
          <div className="pf-ov-row pf-ov-head" role="row">
            <span role="columnheader" className="pf-label">
              <span className="sr-only">Figure</span>
            </span>
            {cols.map((c) => (
              <span key={c.id} role="columnheader" className="pf-label" data-testid="pf-compare-head">
                {c.name}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.key} className="pf-ov-row" role="row" data-testid={`pf-compare-row-${r.key}`}>
              <span role="rowheader" className="pf-ov-name">
                {r.name}
              </span>
              {cols.map((c) => (
                <span key={c.id} role="cell" className="pf-ov-value" data-testid="pf-compare-cell">
                  {r.cell(c.proj)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <figure className="pf-chart mt-4 min-w-0" data-testid="pf-compare-chart" data-lines={cols.length}>
        <figcaption className="sr-only">Projected net assets by month, for each compared scenario</figcaption>
        <div className="pf-chart-plot" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-hair)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--color-dim)", fontSize: 12 }} tickLine={false} axisLine={false} ticks={xTickIndexes(data.length).map((i) => data[i].label)} interval={0} />
              <YAxis tick={{ fill: "var(--color-dim)", fontSize: 12 }} tickLine={false} axisLine={false} width={axisWidth(data.flatMap((d) => cols.map((c) => (d as unknown as Record<string, number>)[c.id] ?? 0)))} tickFormatter={(v: number) => COMPACT.format(v)} />
              <ReferenceLine y={0} stroke="var(--color-rule)" />
              {cols.map((c, i) => (
                <Line key={c.id} type="linear" dataKey={c.id} name={c.name} stroke={colors[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="pf-legend">
          {cols.map((c, i) => (
            <li key={c.id}>
              <span className="pf-swatch" style={{ background: colors[i] }} aria-hidden="true" />
              {`${c.name} (net assets)`}
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
