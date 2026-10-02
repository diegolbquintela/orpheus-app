import { useRef, useState, type FormEvent, type UIEvent } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Minus } from "lucide-react";
import { money, quote, shareCount, weightLabel } from "@/lib/dca/format";
import {
  compactMoney,
  HEADLINE_KEY,
  METRIC_ROWS,
  PLAN_ORDER,
  planHeading,
  planName,
  resultSummary,
  type PlanKey,
} from "@/lib/dca/results";
import { runDesk, scaleWeights } from "@/lib/dca/simulate";
import type { ChartPayload, DeskRun, Frequency } from "@/lib/dca/types";

type Row = { id: string; ticker: string; weight: string };

type Ready = {
  names: ChartPayload[];
  weights: number[];
  currency: string;
  run: DeskRun;
  scaled: boolean;
  weightSum: number;
  capital: number;
  contribution: number;
  frequency: Frequency;
};

function nextId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function parseAmount(value: string): number | null {
  const amount = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(amount) ? amount : null;
}

async function loadChart(ticker: string, start: string, end: string): Promise<ChartPayload> {
  const params = new URLSearchParams({ ticker, start, end });
  const response = await fetch(`/api/chart?${params}`);
  const body = (await response.json().catch(() => null)) as (ChartPayload & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || `Price feed refused ${ticker}.`);
  return body as ChartPayload;
}

function describe(ready: Ready): string {
  const parts = [
    `${ready.names.map((name) => name.ticker).join(" · ")} · ${ready.currency} · ${ready.run.sessions} sessions.`,
  ];
  if (ready.scaled) {
    parts.push(`Weights summed to ${ready.weightSum.toFixed(1)} and were scaled to 100.`);
  }
  parts.push(
    "Lump sum deploys the starting capital on the first session every name has a price. DCA adds the contribution as new cash on each weekly or monthly date. Dividends are reinvested in the name that paid them. Splits change the share count.",
  );
  parts.push(
    "CAGR treats invested capital as if it had been in for the whole window. For the contribution plan, money-weighted return is the fairer figure.",
  );
  if (ready.run.missedContributions > 0) {
    const count = ready.run.missedContributions;
    parts.push(`${count} contribution ${count === 1 ? "date had" : "dates had"} no later session.`);
  }
  parts.push("Not a recommendation.");
  return parts.join(" ");
}

export function Desk() {
  const [rows, setRows] = useState<Row[]>([{ id: "first", ticker: "", weight: "" }]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capital, setCapital] = useState("");
  const [contribution, setContribution] = useState("");
  const [frequency, setFrequency] = useState<"" | Frequency>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const note = ready ? describe(ready) : "";

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { id: nextId(), ticker: "", weight: "" }]);
  }

  function removeRow(id: string) {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== id)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const filled = rows
      .map((row) => ({ ticker: row.ticker.trim().toUpperCase(), weight: row.weight.trim() }))
      .filter((row) => row.ticker || row.weight);
    if (!filled.length) {
      setError("Add a ticker.");
      return;
    }
    if (filled.some((row) => !row.ticker || !row.weight)) {
      setError("Each name needs a ticker and a weight.");
      return;
    }
    const tickers = filled.map((row) => row.ticker);
    if (new Set(tickers).size !== tickers.length) {
      setError("Each ticker once.");
      return;
    }
    if (!start || !end) {
      setError("Start and end are required.");
      return;
    }
    if (end < start) {
      setError("End date is before the start date.");
      return;
    }
    if (!frequency) {
      setError("Choose a frequency.");
      return;
    }
    const capitalAmount = parseAmount(capital);
    const contributionAmount = parseAmount(contribution);
    if (capitalAmount == null || contributionAmount == null || !(capitalAmount > 0) || !(contributionAmount > 0)) {
      setError("Capital and contribution must be above zero.");
      return;
    }
    const rawWeights = filled.map((row) => parseAmount(row.weight));
    if (rawWeights.some((weight) => weight == null || !(weight > 0))) {
      setError("Weights must be above zero.");
      return;
    }

    setPending(true);
    try {
      const names = await Promise.all(tickers.map((ticker) => loadChart(ticker, start, end)));
      const currency = names[0]?.currency ?? "";
      if (!currency || names.some((name) => name.currency !== currency)) {
        throw new Error(
          `Mixed currencies (${names.map((name) => `${name.ticker} ${name.currency || "?"}`).join(", ")}). One currency per basket. No conversion in this version.`,
        );
      }
      const scaled = scaleWeights(rawWeights as number[]);
      const run = runDesk({
        names,
        weights: scaled.weights,
        capital: capitalAmount,
        contribution: contributionAmount,
        frequency,
        start,
        end,
      });
      setReady({
        names,
        weights: scaled.weights,
        currency,
        run,
        scaled: scaled.scaled,
        weightSum: scaled.sum,
        capital: capitalAmount,
        contribution: contributionAmount,
        frequency,
      });
      queueMicrotask(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (caught) {
      setReady(null);
      setError(caught instanceof Error ? caught.message : "The comparison failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink text-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <span className="text-sm">Orpheus Wisdom</span>
          <span className="kicker text-card/60">Desk</span>
        </div>
        <div className="mast-grid mx-auto w-full max-w-6xl px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
          <p className="kicker text-card/50">01</p>
          <div className="max-w-3xl">
            <h1 className="text-balance text-5xl leading-none font-normal tracking-tight sm:text-7xl">
              DCA vs lump sum
            </h1>
            <p className="mt-8 max-w-xl text-pretty text-card/75">
              Same window, two cash plans, one name or a weighted basket. Lump sum deploys the starting capital
              on the first session every name has a price, split by weight. DCA does not use that capital. On
              each weekly or monthly date it adds the contribution as new cash, split by weight. Dividends are
              reinvested in the name that paid them. Splits change the share count. Prices are raw daily closes.
            </p>
            <p className="mt-6 text-sm text-card/55">
              Not a recommendation. US, EU, and CA listings only. One currency.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <form onSubmit={onSubmit} autoComplete="off">
          <section className="section">
            <div>
              <p className="kicker text-muted">02</p>
              <h2 className="mt-3 text-3xl leading-none font-normal tracking-tight">Basket</h2>
            </div>
            <fieldset className="flex min-w-0 flex-col gap-6">
              <legend className="sr-only">Basket</legend>
              {rows.map((row, index) => (
                <div key={row.id} className="basket-row">
                  <label className="flex flex-col gap-2">
                    <span className={index === 0 ? "kicker text-muted" : "sr-only"}>Ticker</span>
                    <input
                      value={row.ticker}
                      onChange={(event) => updateRow(row.id, { ticker: event.target.value })}
                      spellCheck={false}
                      autoCapitalize="characters"
                      className="field text-base"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className={index === 0 ? "kicker text-muted" : "sr-only"}>Weight</span>
                    <input
                      value={row.weight}
                      onChange={(event) => updateRow(row.id, { weight: event.target.value })}
                      inputMode="decimal"
                      className="field text-base tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    aria-label="Remove name"
                    className="mb-2 text-muted disabled:opacity-30"
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addRow} className="self-start text-sm">
                ↳ Add name
              </button>
            </fieldset>
          </section>

          <section className="section">
            <div>
              <p className="kicker text-muted">03</p>
              <h2 className="mt-3 text-3xl leading-none font-normal tracking-tight">Window</h2>
            </div>
            <div className="grid min-w-0 gap-8 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="kicker text-muted">Start</span>
                <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="field text-base" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="kicker text-muted">End</span>
                <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="field text-base" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="kicker text-muted">Starting capital</span>
                <input
                  value={capital}
                  onChange={(event) => setCapital(event.target.value)}
                  inputMode="decimal"
                  className="field text-base tabular-nums"
                />
                <span className="text-xs text-muted">Used only by the lump-sum plan.</span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="kicker text-muted">Contribution</span>
                <input
                  value={contribution}
                  onChange={(event) => setContribution(event.target.value)}
                  inputMode="decimal"
                  className="field text-base tabular-nums"
                />
                <span className="text-xs text-muted">New cash on each DCA date.</span>
              </label>
              <label className="flex flex-col gap-2 sm:col-span-2 sm:max-w-xs">
                <span className="kicker text-muted">Frequency</span>
                <select
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value as "" | Frequency)}
                  className="field text-base"
                >
                  <option value=""></option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-12 items-center justify-center self-start bg-ink px-6 text-sm text-card disabled:opacity-50 sm:col-span-2"
              >
                {pending ? "Reading prices…" : "Compare plans"}
              </button>
            </div>
          </section>
        </form>

        {error ? (
          <p role="alert" className="pb-10 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {ready ? (
          <section ref={resultRef} className="section" aria-live="polite">
            <div>
              <p className="kicker text-muted">04</p>
              <h2 className="mt-3 text-3xl leading-none font-normal tracking-tight">Result</h2>
            </div>
            <div className="flex min-w-0 flex-col gap-12">
              <ResultsTable ready={ready} />

              <div className="overflow-x-auto">
                <table className="w-full min-w-xl border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="kicker text-left text-muted">
                      <th className="py-3 pr-4 font-normal">Name</th>
                      <th className="px-4 py-3 font-normal">Weight</th>
                      <th className="px-4 py-3 font-normal">Last</th>
                      <th className="px-4 py-3 font-normal">Lump sum shares</th>
                      <th className="px-4 py-3 font-normal">DCA shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ready.names.map((name, index) => (
                      <tr key={name.ticker} className="border-t border-line">
                        <th className="py-3 pr-4 text-left font-medium">{name.ticker}</th>
                        <td className="px-4 py-3">{weightLabel(ready.weights[index] ?? 0)}</td>
                        <td className="px-4 py-3">{quote(ready.run.lastPrices[index] ?? null)}</td>
                        <td className="px-4 py-3">{shareCount(ready.run.shares.lump[index] ?? 0)}</td>
                        <td className="px-4 py-3">{shareCount(ready.run.shares.dca[index] ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-10">
                {(["dca", "lump"] as PlanKey[]).map((plan) => (
                  <PlanChart key={plan} ready={ready} plan={plan} />
                ))}
                <p className="text-xs text-muted">
                  Each plan has its own scale, so the two charts are not drawn to the same height.
                </p>
              </div>

              <p className="max-w-xl text-pretty text-sm text-muted">{note}</p>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="bg-ink text-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 sm:px-8">
          <span className="text-sm">Orpheus Wisdom</span>
          <span className="kicker text-card/60">Not a recommendation</span>
        </div>
      </footer>
    </div>
  );
}
/**
 * Plan comparison table. On narrow screens it scrolls sideways (lump sum first,
 * DCA behind the swipe), with a pinned row-label column, a right-edge fade, a
 * "Swipe for DCA" hint and column dots that follow the scroll position.
 */
function ResultsTable({ ready }: { ready: Ready }) {
  const [active, setActive] = useState(0);
  const [atEnd, setAtEnd] = useState(false);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    setActive(el.scrollLeft >= max / 2 ? 1 : 0);
    setAtEnd(el.scrollLeft >= max - 4);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-sm tabular-nums" data-testid="result-summary">
        {resultSummary(ready.run, ready.currency)}
      </p>
      <div className="relative">
        <div className="overflow-x-auto" onScroll={onScroll} data-testid="results-scroll">
          <table className="w-full min-w-xl border-collapse text-sm tabular-nums">
            <thead>
              <tr className="kicker text-left text-muted">
                <th className="sticky left-0 z-10 w-36 bg-paper py-3 pr-4 font-normal sm:w-auto"></th>
                {PLAN_ORDER.map((plan) => (
                  <th key={plan} className={`px-4 py-3 font-normal ${plan === "dca" ? "text-dca" : ""}`}>
                    {planHeading(plan, ready)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map((metric) => (
                <tr key={metric.key} className="border-t border-line">
                  <th className="sticky left-0 z-10 w-36 bg-paper py-3 pr-4 text-left font-normal text-muted sm:w-auto">
                    {metric.label}
                  </th>
                  {PLAN_ORDER.map((plan) => (
                    <td
                      key={plan}
                      className={`px-4 py-3 ${metric.key === HEADLINE_KEY && plan === "dca" ? "font-medium" : ""}`}
                    >
                      {metric.value(ready.run[plan], ready.currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {atEnd ? null : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-paper to-transparent sm:hidden"
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted sm:hidden">
        <span className="flex items-center gap-2" aria-hidden="true">
          {PLAN_ORDER.map((plan, index) => (
            <i
              key={plan}
              title={planName(plan)}
              className={`inline-block size-2 rounded-full ${index === active ? (plan === "dca" ? "bg-dca" : "bg-ink") : "bg-line"}`}
            />
          ))}
          <span>{planName(PLAN_ORDER[active])}</span>
        </span>
        {atEnd ? null : <span>Swipe for DCA →</span>}
      </div>
    </div>
  );
}

/** One small chart per plan with its own y-axis, so the smaller plan stays readable. */
function PlanChart({ ready, plan }: { ready: Ready; plan: PlanKey }) {
  const color = plan === "dca" ? "var(--color-dca)" : "var(--color-ink)";
  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 flex items-center gap-2 text-sm text-muted">
        <i className={`inline-block h-px w-6 ${plan === "dca" ? "bg-dca" : "bg-ink"}`} aria-hidden="true" />
        {planName(plan)} NLV
      </figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={ready.run.chart} margin={{ top: 8, right: 20, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(value: string) => value.slice(0, 7)}
            />
            <YAxis
              tick={{ fill: "var(--color-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={60}
              tickFormatter={(value: number) => compactMoney(value, ready.currency)}
            />
            <Tooltip
              formatter={(value) => [money(Number(value), ready.currency), planName(plan)]}
              labelFormatter={(label) => String(label)}
              contentStyle={{
                background: "var(--color-ink)",
                color: "var(--color-card)",
                border: "0",
                borderRadius: 0,
                fontSize: 13,
              }}
              labelStyle={{ color: "var(--color-card)" }}
              itemStyle={{ color: "var(--color-card)" }}
            />
            <Line
              type="monotone"
              dataKey={plan}
              name={plan}
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
