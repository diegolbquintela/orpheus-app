import { useRef, useState, type FormEvent } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Minus } from "lucide-react";
import { money, pct, quote, shareCount, weightLabel } from "@/lib/dca/format";
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
};

const METRICS: { key: string; label: string; lump: (ready: Ready) => string; dca: (ready: Ready) => string }[] = [
  {
    key: "invested",
    label: "Total invested",
    lump: (ready) => money(ready.run.lump.invested, ready.currency),
    dca: (ready) => money(ready.run.dca.invested, ready.currency),
  },
  {
    key: "nlv",
    label: "NLV at end",
    lump: (ready) => money(ready.run.lump.endNlv, ready.currency),
    dca: (ready) => money(ready.run.dca.endNlv, ready.currency),
  },
  {
    key: "total",
    label: "Total return",
    lump: (ready) => pct(ready.run.lump.totalReturn),
    dca: (ready) => pct(ready.run.dca.totalReturn),
  },
  {
    key: "cagr",
    label: "CAGR",
    lump: (ready) => pct(ready.run.lump.cagr),
    dca: (ready) => pct(ready.run.dca.cagr),
  },
  {
    key: "mwr",
    label: "Money-weighted return",
    lump: (ready) => pct(ready.run.lump.mwr),
    dca: (ready) => pct(ready.run.dca.mwr),
  },
  {
    key: "drop",
    label: "Max drop",
    lump: (ready) => `${pct(ready.run.lump.maxDrop)} · ${ready.run.lump.maxDropDate}`,
    dca: (ready) => `${pct(ready.run.dca.maxDrop)} · ${ready.run.dca.maxDropDate}`,
  },
  {
    key: "at",
    label: "NLV at that drop",
    lump: (ready) => money(ready.run.lump.nlvAtDrop, ready.currency),
    dca: (ready) => money(ready.run.dca.nlvAtDrop, ready.currency),
  },
  {
    key: "to",
    label: "Return to the drop",
    lump: (ready) => pct(ready.run.lump.returnToDrop),
    dca: (ready) => pct(ready.run.dca.returnToDrop),
  },
];

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
      setReady({ names, weights: scaled.weights, currency, run, scaled: scaled.scaled, weightSum: scaled.sum });
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-xl border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="kicker text-left text-muted">
                      <th className="py-3 pr-4 font-normal"></th>
                      <th className="px-4 py-3 font-normal">Lump sum</th>
                      <th className="px-4 py-3 font-normal">DCA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((metric) => (
                      <tr key={metric.key} className="border-t border-line">
                        <th className="py-3 pr-4 text-left font-normal text-muted">{metric.label}</th>
                        <td className="px-4 py-3">{metric.lump(ready)}</td>
                        <td className="px-4 py-3">{metric.dca(ready)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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

              <figure>
                <figcaption className="mb-6 flex flex-wrap gap-6 text-sm text-muted">
                  <span className="inline-flex items-center gap-2">
                    <i className="inline-block h-px w-6 bg-ink" aria-hidden="true" />
                    Lump sum NLV
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <i className="inline-block h-px w-6 bg-dca" aria-hidden="true" />
                    DCA NLV
                  </span>
                </figcaption>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ready.run.chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--color-line)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={32}
                      />
                      <YAxis
                        tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                        tickFormatter={(value: number) => money(value, ready.currency)}
                      />
                      <Tooltip
                        formatter={(value, name) => [
                          money(Number(value), ready.currency),
                          name === "lump" ? "Lump sum" : "DCA",
                        ]}
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
                        dataKey="lump"
                        name="lump"
                        stroke="var(--color-ink)"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="dca"
                        name="dca"
                        stroke="var(--color-dca)"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </figure>

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