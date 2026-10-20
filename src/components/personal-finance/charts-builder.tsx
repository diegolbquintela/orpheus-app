// #161 (spec 46, Q-AK1..Q-AK15): the Charts report builder. New: /personal-finance/charts/new; edit:
// /personal-finance/charts/<id>/edit. Existing endpoints only: record GET (picker), R3 list (names) + create, R4 get +
// update, R2 /chart (preview), R5 export links. The server is the authority; its refusal texts are shown exactly.
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ReadOnlyLine } from "@/components/access/denied";
import {
  chartQuery,
  createReport,
  exportUrl,
  getReport,
  listReports,
  updateReport,
  type ChartData,
  type ChartQuery,
  type ReportBody,
  type DefaultReportBody,
  type ReportItem,
  type ReportList,
  type Result,
} from "@/lib/finance/charts-api";
import {
  PICK_ONE,
  SERIES_CAP,
  atCap,
  editPath,
  fromRange,
  isPicked,
  labelFor,
  nameProblem,
  pickerSections,
  reportProblem,
  toggle,
  toRange,
  type RangeChoice,
} from "@/lib/finance/builder";
import { householdMonth } from "@/lib/finance/overview";
import type { PfRecord } from "@/lib/finance/record";
import { CHART_TYPES, type ChartType, type Series } from "@/lib/finance/report";
import { CHARTS_PATH } from "@/lib/finance/reports-list";

export type BuilderApi = {
  record: () => Promise<PfRecord | null>;
  list: () => Promise<Result<ReportList>>;
  get: (id: string) => Promise<Result<ReportItem>>;
  chart: (q: ChartQuery) => Promise<Result<ChartData>>;
  create: (b: ReportBody) => Promise<Result<ReportItem>>;
  update: (id: string, b: ReportBody | DefaultReportBody) => Promise<Result<ReportItem>>;
};

async function fetchRecord(): Promise<PfRecord | null> {
  const r = await fetch("/api/personal-finance", { headers: { accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return ((await r.json()) as { data?: PfRecord | null }).data ?? null;
}
const liveApi: BuilderApi = {
  record: fetchRecord,
  list: () => listReports(),
  get: (id) => getReport(id),
  chart: (q) => chartQuery(q),
  create: (b) => createReport(b),
  update: (id, b) => updateReport(id, b),
};

const PRESETS = [
  ["3m", "Last 3 months"],
  ["6m", "Last 6 months"],
  ["12m", "Last 12 months"],
  ["24m", "Last 24 months"],
  ["ytd", "Year to date"],
  ["all", "All data"],
] as const;
const CHART_NAME: Record<ChartType, string> = { line: "Line", bar: "Bar", "stacked-bar": "Stacked bar" };
// Existing tokens only (no new colour system): solid, then dashed.
const STROKES = ["var(--color-chalk)", "var(--color-green)", "var(--color-dim)", "var(--color-rule)"];

type Errors = { name?: string; series?: string; range?: string; chart?: string; general?: string };
/** A server `field` → the control it belongs to (spec 46.3 field paths). */
function fieldOf(field?: string): keyof Errors {
  if (!field) return "general";
  const f = field.replace(/^report\./, "");
  if (f === "name") return "name";
  if (f.startsWith("series")) return "series";
  if (f.startsWith("range")) return "range";
  if (f === "chart") return "chart";
  return "general";
}

export function ChartsBuilder({
  id,
  readOnly = false,
  now = new Date(),
  api = liveApi,
  debounceMs = 400,
  replaceUrl = (path: string) => window.history.replaceState(window.history.state, "", path),
}: {
  /** Edit mode: the report id (`default` or `r-…`); omitted: a new report. */
  id?: string;
  readOnly?: boolean;
  now?: Date;
  api?: BuilderApi;
  debounceMs?: number;
  replaceUrl?: (path: string) => void;
}) {
  const current = householdMonth(now);
  const [load, setLoad] = useState<{ kind: "loading" } | { kind: "error"; error: string } | { kind: "ready" }>({ kind: "loading" });
  const [record, setRecord] = useState<PfRecord | null>(null);
  const [others, setOthers] = useState<{ id: string; name: string }[]>([]);
  const [savedId, setSavedId] = useState<string | undefined>(id);
  const [isDefault, setIsDefault] = useState(id === "default");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Series[]>([]);
  const [range, setRange] = useState<RangeChoice>({ kind: "preset", preset: "12m" });
  const [chart, setChart] = useState<ChartType>("line");
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [preview, setPreview] = useState<{ kind: "idle" | "loading" } | { kind: "error"; error: string } | { kind: "ready"; data: ChartData }>({ kind: "idle" });
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [rec, list, item] = await Promise.all([api.record(), api.list(), id ? api.get(id) : Promise.resolve(null)]);
        if (!live) return;
        if (item && !item.ok) return setLoad({ kind: "error", error: item.error });
        setRecord(rec);
        if (list.ok) setOthers(list.data.reports.filter((r) => !r.default).map((r) => ({ id: r.id, name: r.name })));
        if (item?.ok) {
          setName(item.data.name);
          setIsDefault(item.data.default);
          setPicked(item.data.report.series);
          setRange(fromRange(item.data.report.range));
          setChart(item.data.report.chart);
        }
        setLoad({ kind: "ready" });
      } catch (e) {
        if (live) setLoad({ kind: "error", error: String((e as Error)?.message ?? e) });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections = useMemo(() => pickerSections(record), [record]);
  const problem = reportProblem(picked, range, chart, current);

  // Q-AK6: the live preview, debounced; the latest answer wins. Nothing is sent while the report is invalid.
  useEffect(() => {
    if (load.kind !== "ready") return;
    const mine = ++seq.current;
    if (problem) {
      setPreview({ kind: "idle" });
      return;
    }
    const t = setTimeout(async () => {
      setPreview({ kind: "loading" });
      const r = await api.chart({ series: picked, range: toRange(range), chart });
      if (mine !== seq.current) return;
      setPreview(r.ok ? { kind: "ready", data: r.data } : { kind: "error", error: r.error });
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.kind, JSON.stringify(picked), JSON.stringify(range), chart]);

  // Q-AK11: warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
    setErrors({});
  };
  const setPickedD = change(setPicked);
  const setRangeD = change(setRange);
  const setChartD = change(setChart);
  const setNameD = change(setName);

  async function save() {
    const pre: Errors = {};
    if (!isDefault) {
      const n = nameProblem(name, others, savedId);
      if (n) pre.name = n;
    }
    if (problem) pre[fieldOf(problem.field)] = problem.error;
    if (Object.keys(pre).length) return setErrors(pre);
    setSaving(true);
    const report = { series: picked, range: toRange(range), chart };
    const r = savedId ? await api.update(savedId, isDefault ? { report } : { name: name.trim(), report }) : await api.create({ name: name.trim(), report });
    setSaving(false);
    if (!r.ok) return setErrors({ [fieldOf(r.field)]: r.error });
    setErrors({});
    setDirty(false);
    if (!savedId) {
      setSavedId(r.data.id);
      setOthers((o) => [...o, { id: r.data.id, name: r.data.name }]);
      replaceUrl(editPath(r.data.id));
    }
  }

  if (load.kind === "loading")
    return (
      <Shell readOnly={readOnly}>
        <p className="pf-charts-note" role="status" data-testid="pf-builder-loading">
          Loading…
        </p>
      </Shell>
    );
  if (load.kind === "error")
    return (
      <Shell readOnly={readOnly}>
        <p className="pf-error" role="alert" data-testid="pf-builder-load-error">
          {load.error}
        </p>
      </Shell>
    );

  const exportable = !!savedId && !dirty; // Q-AK9: saved and clean.
  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p className="pf-error" role="alert" data-testid={`pf-builder-error-${k}`}>
        {errors[k]}
      </p>
    ) : null;

  return (
    <Shell readOnly={readOnly}>
      <div className="pf-builder" data-testid="pf-builder">
        <aside className="pf-builder-panel" aria-label="Report controls">
          <label className="pf-builder-field">
            <span className="pf-label">Name</span>
            <input
              className="pf-builder-input"
              value={isDefault ? "Default" : name}
              readOnly={readOnly || isDefault}
              maxLength={200}
              onChange={(e) => setNameD(e.target.value)}
              aria-invalid={!!errors.name}
              data-testid="pf-builder-name"
            />
          </label>
          {err("name")}
          <button
            type="button"
            className="pf-builder-toggle"
            aria-expanded={panelOpen}
            aria-controls="pf-builder-series"
            onClick={() => setPanelOpen((o) => !o)}
            data-testid="pf-builder-series-toggle"
          >
            Series ({picked.length})
          </button>
          <fieldset id="pf-builder-series" className="pf-builder-series" data-open={panelOpen} data-testid="pf-builder-series">
            <legend className="pf-label">Series</legend>
            {sections.map((sec) =>
              sec.options.length === 0 ? null : (
                <div key={sec.title} className="pf-builder-section">
                  <p className="pf-builder-section-title">{sec.title}</p>
                  {sec.options.map((o) => {
                    const on = isPicked(picked, o.series);
                    return (
                      <label key={`${o.series.kind}:${o.series.id}`} className="pf-builder-option">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={readOnly || (!on && atCap(picked))}
                          onChange={() => setPickedD(toggle(picked, o.series))}
                          data-testid="pf-builder-pick"
                          data-kind={o.series.kind}
                          data-id={o.series.id}
                        />
                        <span>{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              ),
            )}
            <p className="pf-charts-note" data-testid="pf-builder-cap">
              {atCap(picked) ? SERIES_CAP : ""}
            </p>
            {err("series")}
          </fieldset>
          <label className="pf-builder-field">
            <span className="pf-label">Range</span>
            <select
              className="pf-builder-input"
              value={range.kind === "preset" ? range.preset : "custom"}
              disabled={readOnly}
              onChange={(e) =>
                setRangeD(
                  e.target.value === "custom"
                    ? { kind: "custom", from: range.kind === "custom" ? range.from : current, to: range.kind === "custom" ? range.to : current }
                    : { kind: "preset", preset: e.target.value as (typeof PRESETS)[number][0] },
                )
              }
              data-testid="pf-builder-range"
            >
              {PRESETS.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          {range.kind === "custom" ? (
            <div className="pf-builder-custom">
              <label className="pf-builder-field">
                <span className="pf-label">From</span>
                <input type="month" className="pf-builder-input" value={range.from} min="2020-01" max={current} disabled={readOnly} onChange={(e) => setRangeD({ ...range, from: e.target.value })} data-testid="pf-builder-from" />
              </label>
              <label className="pf-builder-field">
                <span className="pf-label">To</span>
                <input type="month" className="pf-builder-input" value={range.to} min="2020-01" max={current} disabled={readOnly} onChange={(e) => setRangeD({ ...range, to: e.target.value })} data-testid="pf-builder-to" />
              </label>
            </div>
          ) : null}
          {err("range")}
          <label className="pf-builder-field">
            <span className="pf-label">Chart</span>
            <select className="pf-builder-input" value={chart} disabled={readOnly} onChange={(e) => setChartD(e.target.value as ChartType)} data-testid="pf-builder-chart">
              {CHART_TYPES.map((c) => (
                <option key={c} value={c}>
                  {CHART_NAME[c]}
                </option>
              ))}
            </select>
          </label>
          {err("chart")}
          {readOnly ? null : (
            <button type="button" className="pf-button" disabled={saving} onClick={() => void save()} data-testid="pf-builder-save">
              {savedId ? "Update" : "Save"}
            </button>
          )}
          {err("general")}
          {exportable ? (
            <details className="pf-builder-export" data-testid="pf-builder-export">
              <summary className="pf-builder-toggle">Export</summary>
              <a className="pf-builder-link" href={exportUrl(savedId!, "pdf")} download data-testid="pf-builder-export-pdf">
                PDF
              </a>
              <a className="pf-builder-link" href={exportUrl(savedId!, "png")} download data-testid="pf-builder-export-png">
                PNG
              </a>
            </details>
          ) : null}
        </aside>
        <section className="pf-builder-main" aria-label="Chart preview" data-testid="pf-builder-preview">
          {problem ? (
            <p className="pf-charts-note" data-testid="pf-builder-problem">
              {problem.error === PICK_ONE ? PICK_ONE : problem.error}
            </p>
          ) : preview.kind === "error" ? (
            <p className="pf-error" role="alert" data-testid="pf-builder-preview-error">
              {preview.error}
            </p>
          ) : preview.kind === "ready" ? (
            <Preview data={preview.data} labels={preview.data.series.map((s, i) => labelFor(s, sections, preview.data.labels[i]))} />
          ) : (
            <p className="pf-charts-note" role="status" data-testid="pf-builder-preview-loading">
              Loading chart…
            </p>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ readOnly, children }: { readOnly: boolean; children: React.ReactNode }) {
  return (
    <div className="pf">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pt-10 pb-20 sm:px-8 lg:pt-14 lg:pb-24">
        <header className="relative">
          <p className="pf-label">01</p>
          <h1 className="pf-title mt-2">Report.</h1>
          <p className="pf-charts-back mt-3">
            <a href={CHARTS_PATH} data-testid="pf-builder-back">
              Charts
            </a>
          </p>
          {readOnly ? <ReadOnlyLine className="mt-3" /> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

function Preview({ data, labels }: { data: ChartData; labels: string[] }) {
  const rows = data.rows.map((r) => Object.fromEntries([["label", r.label], ...r.values.map((v, i) => [`s${i}`, v])]));
  const level = data.series.some((s) => s.axis === "level");
  const flow = data.series.some((s) => s.axis === "flow");
  const common = (
    <>
      <CartesianGrid stroke="var(--color-hair)" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: "var(--color-dim)", fontSize: 12 }} stroke="var(--color-hair)" />
      {flow ? <YAxis yAxisId="flow" tick={{ fill: "var(--color-dim)", fontSize: 12 }} stroke="var(--color-hair)" /> : null}
      {level ? <YAxis yAxisId="level" orientation={flow ? "right" : "left"} tick={{ fill: "var(--color-dim)", fontSize: 12 }} stroke="var(--color-hair)" /> : null}
      <Tooltip contentStyle={{ background: "var(--color-night)", border: "1px solid var(--color-hair)", color: "var(--color-chalk)" }} />
    </>
  );
  const stroke = (i: number) => STROKES[i % STROKES.length];
  const dash = (i: number) => (i >= STROKES.length ? "6 4" : undefined);
  return (
    <figure className="pf-builder-figure" data-testid="pf-builder-figure" data-chart={data.chart} data-series={data.series.length} data-months={data.rows.length}>
      <figcaption className="sr-only">{`${labels.join(", ")}, ${data.rows.length} months`}</figcaption>
      <div className="pf-builder-plot" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          {data.chart === "line" ? (
            <LineChart data={rows}>
              {common}
              {data.series.map((s, i) => (
                <Line key={i} dataKey={`s${i}`} name={labels[i]} yAxisId={s.axis} stroke={stroke(i)} strokeDasharray={dash(i)} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={rows}>
              {common}
              {data.series.map((s, i) => (
                <Bar key={i} dataKey={`s${i}`} name={labels[i]} yAxisId={s.axis} fill={stroke(i)} stackId={s.stack ? "stack" : undefined} isAnimationActive={false} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <ul className="pf-builder-legend" data-testid="pf-builder-legend">
        {labels.map((l, i) => (
          <li key={i}>
            <span className="pf-builder-swatch" style={{ background: stroke(i) }} aria-hidden="true" />
            {l}
          </li>
        ))}
      </ul>
    </figure>
  );
}

