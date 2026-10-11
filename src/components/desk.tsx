import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Minus } from "lucide-react";
import { runDesk, scaleWeights } from "@/lib/dca/simulate";
import {
  checkFields,
  checkListings,
  tickerField,
  weightField,
  type FieldErrors,
  type Listing,
} from "@/lib/site/field-checks";
import { browserStorage, readLast, readSaved, saveSearch, type SavedSearch } from "@/lib/site/saved-searches";
import { CALCULATOR_NOTE, DIVIDENDS_CAPTION, METHOD_CAPTION } from "@/lib/site/site";
import { CalculatorHero } from "./calculator/hero";
import { DcaChart } from "./calculator/dca-chart";
import { ResultRows } from "./calculator/result-rows";
import { SavedSearches } from "./calculator/saved-searches";
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

/** A refusal from /api/chart (the venue rule, an unknown ticker): shown under that ticker (ST4-17). */
class FeedRefusal extends Error {}

async function loadChart(ticker: string, start: string, end: string): Promise<ChartPayload> {
  const params = new URLSearchParams({ ticker, start, end });
  const response = await fetch(`/api/chart?${params}`);
  const body = (await response.json().catch(() => null)) as (ChartPayload & { error?: string }) | null;
  if (!response.ok) throw new FeedRefusal(body?.error || `Price feed refused ${ticker}.`);
  return body as ChartPayload;
}

/**
 * The captions under the results (spec Q2, Q12): the dividends rule (DCA-01; it does not fit on the listings
 * line at 360 px), the fixed method sentence word for word (EL, QA round 1, N1: method text, not an
 * instruction), then only the run-specific lines.
 */
function captions(ready: Ready): string[] {
  const lines = [DIVIDENDS_CAPTION, METHOD_CAPTION];
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [ready, setReady] = useState<Ready | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const uid = useId();
  const [saved, setSaved] = useState<SavedSearch[]>([]);

  /** Fills every field from a saved search (#80): Load, and the last search on a refresh. Nothing is calculated. */
  function applySearch(search: SavedSearch) {
    setRows(search.rows.map((row, index) => ({ id: index === 0 ? "first" : nextId(), ...row })));
    setStart(search.start);
    setEnd(search.end);
    setCapital(search.capital);
    setContribution(search.contribution);
    setFrequency(search.frequency);
    setErrors({});
    setError("");
    setReady(null);
  }

  // #80 (ST4-22): after hydration (the server can't read localStorage), the list and the last search come back.
  useEffect(() => {
    const storage = browserStorage();
    setSaved(readSaved(storage));
    const last = readLast(storage);
    if (last) applySearch(last);
  }, []);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { id: nextId(), ticker: "", weight: "" }]);
  }

  function removeRow(id: string) {
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== id)));
    // Row marks are keyed by position; a removed row shifts them, so they go (the values stay).
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => !/^(ticker|weight)-/.test(field))),
    );
  }

  /** Editing a field clears its own message (#78); the other marks and every value stay. */
  function clearError(field: string) {
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    // #78 field checks (spec ST4-17): every bad field at once, before any price request; nothing is cleared.
    const checked = checkFields({ rows, start, end, capital, contribution, frequency });
    if (!checked.ok) {
      setErrors(checked.errors);
      setReady(null);
      return;
    }
    setErrors({});
    const { basket, capital: capitalAmount, contribution: contributionAmount } = checked;
    const runFrequency: Frequency = checked.frequency;

    setPending(true);
    try {
      const settled = await Promise.allSettled(basket.map((name) => loadChart(name.ticker, start, end)));
      const offline = settled.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected" && !(result.reason instanceof FeedRefusal),
      );
      if (offline) throw offline.reason;
      // After the prices are read, before calculating (EL decision 1): venue and currency under the ticker.
      const listings: Listing[] = settled.map((result, at) =>
        result.status === "fulfilled"
          ? { index: basket[at].index, ticker: basket[at].ticker, ok: true, currency: result.value.currency }
          : {
              index: basket[at].index,
              ticker: basket[at].ticker,
              ok: false,
              message: (result.reason as Error).message,
            },
      );
      const listingErrors = checkListings(listings);
      if (Object.keys(listingErrors).length) {
        setErrors(listingErrors);
        setReady(null);
        return;
      }
      const names = settled.map((result) => (result as PromiseFulfilledResult<ChartPayload>).value);
      const currency = names[0].currency;
      const scaled = scaleWeights(basket.map((name) => name.weight));
      const run = runDesk({
        names,
        weights: scaled.weights,
        capital: capitalAmount,
        contribution: contributionAmount,
        frequency: runFrequency,
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
        frequency: runFrequency,
      });
      // #80 (ST4-21): a successful calculation is the save (no save button); the fields stay as typed.
      setSaved(
        saveSearch(browserStorage(), {
          // As typed (EL, #81 D1 follow-up): Load and a refresh refill the user's own formatting.
          rows: basket.map((name) => ({ ticker: rows[name.index].ticker, weight: rows[name.index].weight })),
          start,
          end,
          capital,
          contribution,
          frequency: runFrequency,
          currency,
        }),
      );
      queueMicrotask(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (caught) {
      setReady(null);
      setError(caught instanceof Error ? caught.message : "The comparison failed.");
    } finally {
      setPending(false);
    }
  }

  const describe = (field: string) =>
    errors[field] ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${field}` } : {};
  const fieldError = (field: string) =>
    errors[field] ? (
      <span id={`${uid}-${field}`} className="calc-error" data-testid="field-error" data-field={field}>
        {errors[field]}
      </span>
    ) : null;

  return (
    <div className="calc">
      <CalculatorHero />

      {/* #78 (EL decision 3): one column at every width; wide, the window fields in one row and the results below
          the form at full width. */}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 pt-10 pb-20 sm:px-8 lg:gap-16 lg:pt-14 lg:pb-24">
        <div className="min-w-0">
          <form
            onSubmit={onSubmit}
            autoComplete="off"
            noValidate
            className="flex flex-col gap-12"
            data-testid="calculator-form"
          >
            <SavedSearches list={saved} onLoad={applySearch} />

            <section className="flex flex-col gap-6 lg:max-w-[26rem]">
              <SectionHead numeral="02" title="Basket" />
              <fieldset className="flex min-w-0 flex-col gap-6">
                <legend className="sr-only">Basket</legend>
                {rows.map((row, index) => (
                  <div key={row.id} className="calc-row" data-testid="basket-row">
                    <label className="calc-ticker flex min-w-0 flex-col gap-2">
                      <span className={index === 0 ? "calc-label" : "calc-label lg:sr-only"}>Ticker</span>
                      <input
                        value={row.ticker}
                        onChange={(event) => {
                          updateRow(row.id, { ticker: event.target.value });
                          clearError(tickerField(index));
                        }}
                        spellCheck={false}
                        autoCapitalize="characters"
                        className="calc-field"
                        data-testid="ticker-input"
                        {...describe(tickerField(index))}
                      />
                    </label>
                    {fieldError(tickerField(index))}
                    <label className="calc-weight flex min-w-0 flex-col gap-2">
                      <span className={index === 0 ? "calc-label" : "calc-label lg:sr-only"}>Weight</span>
                      <input
                        value={row.weight}
                        onChange={(event) => {
                          updateRow(row.id, { weight: event.target.value });
                          clearError(weightField(index));
                        }}
                        inputMode="decimal"
                        className="calc-field"
                        data-testid="weight-input"
                        {...describe(weightField(index))}
                      />
                    </label>
                    {fieldError(weightField(index))}
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
              <div className="grid min-w-0 gap-8 lg:grid-cols-5 lg:gap-x-6" data-testid="window-row">
                <WindowField label="Start" error={fieldError("start")}>
                  <input
                    type="date"
                    value={start}
                    onChange={(event) => {
                      setStart(event.target.value);
                      clearError("start");
                    }}
                    className="calc-field"
                    data-field="start"
                    {...describe("start")}
                  />
                </WindowField>
                <WindowField label="End" error={fieldError("end")}>
                  <input
                    type="date"
                    value={end}
                    onChange={(event) => {
                      setEnd(event.target.value);
                      clearError("end");
                    }}
                    className="calc-field"
                    data-field="end"
                    {...describe("end")}
                  />
                </WindowField>
                <WindowField label="Starting capital" error={fieldError("capital")}>
                  <input
                    value={capital}
                    onChange={(event) => {
                      setCapital(event.target.value);
                      clearError("capital");
                    }}
                    inputMode="decimal"
                    className="calc-field"
                    data-field="capital"
                    {...describe("capital")}
                  />
                </WindowField>
                <WindowField label="Contribution" error={fieldError("contribution")}>
                  <input
                    value={contribution}
                    onChange={(event) => {
                      setContribution(event.target.value);
                      clearError("contribution");
                    }}
                    inputMode="decimal"
                    className="calc-field"
                    data-field="contribution"
                    {...describe("contribution")}
                  />
                </WindowField>
                <WindowField label="Frequency" error={fieldError("frequency")}>
                  <select
                    value={frequency}
                    onChange={(event) => {
                      setFrequency(event.target.value as "" | Frequency);
                      clearError("frequency");
                    }}
                    className="calc-field"
                    data-field="frequency"
                    {...describe("frequency")}
                  >
                    <option value=""></option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </WindowField>
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

/** A window field: its label and control, then its field check (#78) directly under it. */
function WindowField({ label, error, children }: { label: string; error: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <label className="flex min-w-0 flex-col gap-2">
        <span className="calc-label">{label}</span>
        {children}
      </label>
      {error}
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
