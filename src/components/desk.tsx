import { useRef, useState, type FormEvent } from "react";
import { Minus } from "lucide-react";
import { runDesk, scaleWeights } from "@/lib/dca/simulate";
import { CALCULATOR_NOTE, DIVIDENDS_CAPTION } from "@/lib/site/site";
import { CalculatorHero } from "./calculator/hero";
import { DcaChart } from "./calculator/dca-chart";
import { ResultRows } from "./calculator/result-rows";
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

/**
 * The captions under the results (spec Q2, Q12): the dividends rule (DCA-01; it does not fit on the listings
 * line at 360 px), then only the run-specific lines. The fixed "Prices are raw daily closes…" sentence goes.
 */
function captions(ready: Ready): string[] {
  const lines = [DIVIDENDS_CAPTION];
  if (ready.scaled) lines.push(`Weights summed to ${ready.weightSum.toFixed(1)} and were scaled to 100.`);
  if (ready.run.missedContributions > 0) {
    const count = ready.run.missedContributions;
    lines.push(`${count} contribution ${count === 1 ? "date had" : "dates had"} no later session.`);
  }
  return lines;
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
    <div className="calc">
      <CalculatorHero />

      <main className="mx-auto grid w-full max-w-6xl gap-14 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16 lg:pt-14 lg:pb-24">
        <div className="min-w-0">
          <form onSubmit={onSubmit} autoComplete="off" className="flex flex-col gap-12" data-testid="calculator-form">
            <section className="flex flex-col gap-6">
              <SectionHead numeral="02" title="Basket" />
              <fieldset className="flex min-w-0 flex-col gap-6">
                <legend className="sr-only">Basket</legend>
                {rows.map((row, index) => (
                  <div key={row.id} className="calc-row" data-testid="basket-row">
                    <label className="calc-ticker flex min-w-0 flex-col gap-2">
                      <span className={index === 0 ? "calc-label" : "calc-label lg:sr-only"}>Ticker</span>
                      <input
                        value={row.ticker}
                        onChange={(event) => updateRow(row.id, { ticker: event.target.value })}
                        spellCheck={false}
                        autoCapitalize="characters"
                        className="calc-field"
                      />
                    </label>
                    <label className="calc-weight flex min-w-0 flex-col gap-2">
                      <span className={index === 0 ? "calc-label" : "calc-label lg:sr-only"}>Weight</span>
                      <input
                        value={row.weight}
                        onChange={(event) => updateRow(row.id, { weight: event.target.value })}
                        inputMode="decimal"
                        className="calc-field"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      aria-label="Remove name"
                      className="calc-remove flex h-11 items-center justify-center text-dim disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addRow} className="self-start text-sm text-chalk">
                  ↳ Add name
                </button>
              </fieldset>
            </section>

            <section className="flex flex-col gap-6">
              <SectionHead numeral="03" title="Window" />
              <div className="grid min-w-0 gap-8 lg:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="calc-label">Start</span>
                  <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="calc-field" />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="calc-label">End</span>
                  <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="calc-field" />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="calc-label">Starting capital</span>
                  <input
                    value={capital}
                    onChange={(event) => setCapital(event.target.value)}
                    inputMode="decimal"
                    className="calc-field"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="calc-label">Contribution</span>
                  <input
                    value={contribution}
                    onChange={(event) => setContribution(event.target.value)}
                    inputMode="decimal"
                    className="calc-field"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="calc-label">Frequency</span>
                  <select
                    value={frequency}
                    onChange={(event) => setFrequency(event.target.value as "" | Frequency)}
                    className="calc-field"
                  >
                    <option value=""></option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
              </div>
              <button type="submit" disabled={pending} className="calc-button self-start" data-testid="compare">
                {pending ? "Reading prices…" : "Compare plans"}
              </button>
            </section>
          </form>

          <p className="calc-note mt-6" data-testid="listings-note">
            {CALCULATOR_NOTE}
          </p>

          {error ? (
            <p role="alert" className="mt-6 text-sm text-alert">
              {error}
            </p>
          ) : null}
        </div>

        {ready ? (
          <section ref={resultRef} className="flex min-w-0 scroll-mt-16 flex-col gap-8" aria-live="polite" data-testid="result">
            <SectionHead numeral="04" title="Result" />
            <DcaChart run={ready.run} currency={ready.currency} />
            <ResultRows run={ready.run} currency={ready.currency} />
            <div className="flex flex-col gap-1" data-testid="result-captions">
              {captions(ready).map((line) => (
                <p key={line} className="calc-caption">
                  {line}
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function SectionHead({ numeral, title }: { numeral: string; title: string }) {
  return (
    <div>
      <p className="calc-label">{numeral}</p>
      <h2 className="mt-2 text-2xl leading-none font-normal tracking-tight text-chalk">{title}</h2>
    </div>
  );
}
