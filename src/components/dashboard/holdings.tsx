import { useRef, useState, type FormEvent } from "react";
import { trimDecimal } from "@/lib/dashboard/format";
import { METRIC_HELP, metricLabel, type MetricKey } from "@/lib/dashboard/metrics";
import { excludedNote } from "@/lib/dashboard/pie";
import { HoldingsPie } from "./holdings-pie";
import { MetricCell, MetricColumnsPicker, PortfolioMetricCell, type MetricViewData, type PortfolioCellView } from "./metric-columns";

/**
 * Holdings table on /dashboard (T04 #12): add, edit (shares, average cost) and delete.
 * Talks to /api/dashboard/holdings; the server validates everything (US/EU/CA listings only,
 * shares > 0, average cost >= 0, one row per ticker). T05 (#13) adds each ticker's last stored close
 * and its session date, or "price pending" until the background job has fetched it. T06 (#14) adds the
 * base-currency setting and each position (shares × last close) plus the total in that base currency,
 * at the FX rate for the close's session date (the rate's date is shown when it's an earlier one).
 * T07 (#15) completes the table: name, market value, cost (D8: same rate as the price), total return
 * (amount in base, % in the listing currency), % of portfolio, the total row, the "Prices as of … close ·
 * FX …" line and the out-of-date note. Everything comes from the server's stored data.
 */

export type HoldingView = {
  id: number;
  symbol: string;
  shares: string;
  avgCost: string;
};

export type PriceView = {
  close: string | null;
  currency: string | null;
  sessionDate: string | null;
  pending: boolean;
  name?: string | null;
};

export type BaseCurrency = "CAD" | "USD" | "EUR";
const BASES: BaseCurrency[] = ["CAD", "USD", "EUR"];

type RateUsed = { quote: string; cadPerUnit: string; rateDate: string; source: string };
type ValuedRow = {
  symbol: string;
  value: number | null;
  cost: number | null;
  returnAmount: number | null;
  returnPct: number | null;
  weight: number | null;
  rates: RateUsed[];
  sessionDate: string | null;
  fallback: boolean;
  status: string;
};
export type ValuationView = {
  base: BaseCurrency;
  rows: ValuedRow[];
  total: number;
  totalCost: number;
  totalReturn: number;
  totalReturnPct: number | null;
  excluded: string[];
  pricesAsOf: string | null;
  fxAsOf: string | null;
} | null;
export type FreshnessView = { lastGoodRun: string | null; stale: boolean } | null;

const money = (n: number) => new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const signedMoney = (n: number) =>
  new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(n);
const signedPct = (n: number) =>
  `${new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(n)}%`;
const weightPct = (n: number) => `${n.toFixed(1)}%`;

type Props = {
  holdings: HoldingView[];
  prices: Record<string, PriceView | undefined>;
  baseCurrency: BaseCurrency;
  valuation: ValuationView;
  freshness?: FreshnessView;
  /** T08: the user's metric columns (in order) and each symbol's coverage / stored metric values. */
  metricColumns?: string[];
  metrics?: Record<string, MetricViewData>;
  /** T14: portfolio row per metric (weighted mean + coverage, spec §9). */
  portfolio?: Record<string, PortfolioCellView>;
  storage: "ok" | "not_configured" | "signed_out";
  /** Re-run the page loader after a change. */
  onChanged: () => Promise<void> | void;
};

async function send(url: string, method: string, body?: unknown, alsoOk: number[] = []): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok || alsoOk.includes(res.status)) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.status === 401) return "Your session has ended. Sign in again.";
    return data?.error ?? `Something went wrong (${res.status}). Try again.`;
  } catch {
    return "Network error. Try again.";
  }
}

function LastClose({ price }: { price: PriceView | undefined }) {
  if (!price || price.pending || price.close === null)
    return (
      <span className="text-muted" data-testid="holding-close" data-pending="true">
        price pending
      </span>
    );
  return (
    <span data-testid="holding-close" data-session-date={price.sessionDate ?? ""}>
      {trimDecimal(price.close)} {price.currency}
      <span className="ml-2 text-xs text-muted">{price.sessionDate} close</span>
    </span>
  );
}

function PositionValue({ row, base }: { row: ValuedRow | undefined; base: BaseCurrency }) {
  if (!row || row.value === null)
    return (
      <span className="text-muted" data-testid="holding-value" data-status={row?.status ?? "price_pending"}>
        {row?.status === "fx_pending" ? "FX pending" : "—"}
      </span>
    );
  return (
    <span data-testid="holding-value" data-status="ok" data-fx-fallback={row.fallback ? "true" : "false"}>
      {money(row.value)} {base}
      {row.rates.map((r) => (
        <span key={r.quote} className="block text-xs text-muted" data-testid="holding-fx">
          FX {r.quote} {r.cadPerUnit} · {r.rateDate}
          {r.rateDate < (row.sessionDate ?? "") ? " (previous rate)" : ""}
        </span>
      ))}
    </span>
  );
}

/** Placeholder for a T07 cell (cost, return, % of portfolio) while the price or FX is pending. */
function Pending({ testId }: { testId: string }) {
  return (
    <span className="text-muted" data-testid={testId}>
      —
    </span>
  );
}

function Row({
  holding,
  price,
  valued,
  base,
  metricColumns,
  metricView,
  onChanged,
}: {
  metricColumns: string[];
  metricView: MetricViewData | undefined;
  holding: HoldingView;
  price: PriceView | undefined;
  valued: ValuedRow | undefined;
  base: BaseCurrency;
  onChanged: Props["onChanged"];
}) {
  const ok = valued && valued.value !== null;
  const [editing, setEditing] = useState(false);
  const [shares, setShares] = useState(trimDecimal(holding.shares));
  const [avgCost, setAvgCost] = useState(trimDecimal(holding.avgCost));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    const err = await send(`/api/dashboard/holdings/${holding.id}`, "PUT", { shares, avgCost });
    setBusy(false);
    if (err) return setError(err);
    setEditing(false);
    await onChanged();
  }

  // One DELETE per row, ever: a second click before React re-renders the disabled button is ignored, and
  // a 404 (the row is already gone, e.g. deleted in another tab) counts as done. #38: after a successful
  // DELETE the row stays on screen until the page loader's refetch returns (seconds on Vercel), so the
  // guard is only released on an error; on success the row is marked deleted and loses its buttons.
  const deleting = useRef(false);
  const [deleted, setDeleted] = useState(false);
  async function remove() {
    if (deleting.current) return;
    if (!window.confirm(`Delete ${holding.symbol} from your holdings?`)) return;
    deleting.current = true;
    setBusy(true);
    setError(null);
    const err = await send(`/api/dashboard/holdings/${holding.id}`, "DELETE", undefined, [404]);
    if (err) {
      deleting.current = false;
      setBusy(false);
      return setError(err);
    }
    setDeleted(true);
    await onChanged();
  }

  return (
    <tr className={`border-t border-line align-top${deleted ? " opacity-50" : ""}`} data-testid="holding-row" data-symbol={holding.symbol} aria-busy={deleted || undefined}>
      <td className="py-3 pr-4 font-medium">{holding.symbol}</td>
      <td className="py-3 pr-4 text-muted" data-testid="holding-name">
        {price?.name ?? "—"}
      </td>
      {editing ? (
        <>
          <td className="py-2 pr-4">
            <input
              aria-label={`Shares of ${holding.symbol}`}
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              inputMode="decimal"
              className="field w-28 text-base tabular-nums"
            />
          </td>
          <td className="py-2 pr-4">
            <input
              aria-label={`Average cost of ${holding.symbol}`}
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              inputMode="decimal"
              className="field w-28 text-base tabular-nums"
            />
          </td>
        </>
      ) : (
        <>
          <td className="py-3 pr-4 tabular-nums">{trimDecimal(holding.shares)}</td>
          <td className="py-3 pr-4 tabular-nums whitespace-nowrap" data-testid="holding-avg-cost">
            {trimDecimal(holding.avgCost)}
            {price?.currency ? ` ${price.currency}` : ""}
          </td>
        </>
      )}
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
        <LastClose price={price} />
      </td>
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
        <PositionValue row={valued} base={base} />
      </td>
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
        {ok && valued.cost !== null ? (
          <span data-testid="holding-cost">
            {money(valued.cost)} {base}
          </span>
        ) : (
          <Pending testId="holding-cost" />
        )}
      </td>
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
        {ok && valued.returnAmount !== null ? (
          <span data-testid="holding-return">
            {signedMoney(valued.returnAmount)} {base}
            <span className="block text-xs text-muted" data-testid="holding-return-pct">
              {valued.returnPct === null ? "n/m" : signedPct(valued.returnPct)}
            </span>
          </span>
        ) : (
          <Pending testId="holding-return" />
        )}
      </td>
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
        {ok && valued.weight !== null ? <span data-testid="holding-weight">{weightPct(valued.weight)}</span> : <Pending testId="holding-weight" />}
      </td>
      {metricColumns.map((key) => (
        <td key={key} className="py-3 pr-4 tabular-nums whitespace-nowrap">
          <MetricCell metricKey={key} view={metricView} />
        </td>
      ))}
      <td className="py-3 text-right text-sm whitespace-nowrap">
        {editing ? (
          <>
            <button type="button" disabled={busy} onClick={save} className="mr-3 underline-offset-4 hover:underline disabled:opacity-50">
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setShares(trimDecimal(holding.shares));
                setAvgCost(trimDecimal(holding.avgCost));
                setError(null);
              }}
              className="underline-offset-4 hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : deleted ? (
          <span className="text-xs text-muted" data-testid="holding-deleted">
            Deleted
          </span>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className="mr-3 underline-offset-4 hover:underline disabled:opacity-50">
              Edit
            </button>
            <button type="button" disabled={busy} onClick={remove} className="underline-offset-4 hover:underline disabled:opacity-50">
              Delete
            </button>
          </>
        )}
        {error ? (
          <p className="mt-1 max-w-xs text-left text-xs whitespace-normal text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

/** Base currency setting (T06): saved with PUT /api/dashboard/settings, then the page reloads its data. */
export function BaseCurrencySetting({ value, onChanged }: { value: BaseCurrency; onChanged: Props["onChanged"] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="mt-6 flex flex-wrap items-center gap-3 text-sm" data-testid="base-currency">
      <span className="kicker text-muted">Base currency</span>
      <select
        value={value}
        disabled={busy}
        data-testid="base-currency-select"
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          const err = await send("/api/dashboard/settings", "PUT", { baseCurrency: e.target.value });
          setBusy(false);
          if (err) return setError(err);
          await onChanged();
        }}
        className="field h-10 text-base"
      >
        {BASES.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-xs text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/** "Prices as of … close · FX …" and, past 4 days without a successful daily run, the out-of-date note (DASH-25). */
export function AsOf({ valuation, freshness, base }: { valuation: ValuationView; freshness: FreshnessView; base: BaseCurrency }) {
  if (!valuation) return null;
  return (
    <div className="mt-6 text-sm">
      <p data-testid="as-of" data-prices={valuation.pricesAsOf ?? ""} data-fx={valuation.fxAsOf ?? ""}>
        {valuation.pricesAsOf ? `Prices as of ${valuation.pricesAsOf} close` : "Prices pending"}
        {" · "}
        {valuation.fxAsOf ? `FX ${valuation.fxAsOf}` : `FX not needed (all in ${base})`}
      </p>
      {freshness?.stale ? (
        <p className="mt-1 text-sm" role="status" data-testid="stale-note" data-last-good-run={freshness.lastGoodRun ?? ""}>
          Prices are out of date.{" "}
          {freshness.lastGoodRun
            ? `Last completed daily refresh: ${freshness.lastGoodRun} (UTC).`
            : "No daily refresh has completed yet."}
        </p>
      ) : null}
    </div>
  );
}

export function HoldingsSection({
  holdings,
  prices,
  baseCurrency,
  valuation,
  freshness = null,
  metricColumns = [],
  metrics = {},
  portfolio = {},
  storage,
  onChanged,
}: Props) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const err = await send("/api/dashboard/holdings", "POST", { symbol, shares, avgCost });
    setBusy(false);
    if (err) return setError(err);
    setSymbol("");
    setShares("");
    setAvgCost("");
    await onChanged();
  }

  if (storage === "not_configured")
    return (
      <section className="mt-10" data-testid="holdings">
        <h2 className="text-xl">Holdings</h2>
        <p className="mt-3 text-sm text-muted">Storage is not configured on this deployment.</p>
      </section>
    );

  return (
    <section className="mt-10" data-testid="holdings">
      <h2 className="text-xl">Holdings</h2>
      <p className="mt-2 max-w-xl text-xs text-muted">
        US, EU and CA listings only. Average cost is per share, in the listing&apos;s own currency. Last close is
        the prior completed session&apos;s close, updated once a day. Values are in your base currency at the Bank
        of Canada daily average rate for that close&apos;s session date (USD and EUR bases cross through CAD; DKK, HUF
        and CZK: CAD per unit = the Bank of Canada euro rate (CAD per EUR) ÷ the ECB reference rate (units per
        EUR), same date). When there is no rate that day, the
        previous one is used and its date is shown. These are daily averages, not 16:00 closes. Cost uses the
        same rate as the price, so currency moves since you bought aren&apos;t included. Total return % is in the
        listing&apos;s currency. Holdings without a price or rate yet are left out of the totals and the % of portfolio.
      </p>
      <BaseCurrencySetting value={baseCurrency} onChanged={onChanged} />
      <MetricColumnsPicker columns={metricColumns} onChanged={onChanged} />
      <form className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={add} data-testid="holding-form">
        <label className="flex flex-col gap-2">
          <span className="kicker text-muted">Ticker</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="e.g. KO, RY.TO, ASML.AS"
            className="field text-base"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="kicker text-muted">Shares</span>
          <input value={shares} onChange={(e) => setShares(e.target.value)} inputMode="decimal" className="field text-base tabular-nums" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="kicker text-muted">Average cost</span>
          <input value={avgCost} onChange={(e) => setAvgCost(e.target.value)} inputMode="decimal" className="field text-base tabular-nums" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 items-center justify-center bg-ink px-6 text-sm text-card disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert" data-testid="holding-error">
          {error}
        </p>
      ) : null}
      {holdings.length ? <AsOf valuation={valuation} freshness={freshness} base={baseCurrency} /> : null}
      {holdings.length === 0 ? (
        <p className="mt-8 text-sm text-muted" data-testid="holdings-empty">
          No holdings yet.
        </p>
      ) : (
        <>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-left">
                <th className="kicker pb-2 pr-4 font-normal text-muted">Ticker</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Name</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Shares</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Average cost</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Last close</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Market value ({baseCurrency})</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Cost ({baseCurrency})</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Total return</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">% of portfolio</th>
                {metricColumns.map((key) => (
                  <th key={key} className="kicker pb-2 pr-4 font-normal text-muted" data-testid="metric-th" data-key={key} title={METRIC_HELP[key as MetricKey]}>
                    {metricLabel(key)}
                  </th>
                ))}
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <Row
                  key={`${h.id}:${h.shares}:${h.avgCost}`}
                  holding={h}
                  price={prices[h.symbol]}
                  valued={valuation?.rows.find((r) => r.symbol === h.symbol)}
                  base={baseCurrency}
                  metricColumns={metricColumns}
                  metricView={metrics[h.symbol]}
                  onChanged={onChanged}
                />
              ))}
            </tbody>
            {valuation ? (
              <tfoot>
                <tr className="border-t-2 border-ink">
                  <td className="py-3 pr-4 font-medium" colSpan={5}>
                    Total
                    {(() => {
                      const pend = valuation.rows.filter((r) => r.value === null);
                      const note = excludedNote(pend.filter((r) => r.status !== "fx_pending").length, pend.filter((r) => r.status === "fx_pending").length);
                      return note ? (
                        <span className="block text-xs font-normal text-muted" data-testid="holdings-total-excluded-count">
                          {note}
                        </span>
                      ) : null;
                    })()}
                  </td>
                  <td className="py-3 pr-4 font-medium tabular-nums whitespace-nowrap" data-testid="holdings-total" data-base={baseCurrency}>
                    {money(valuation.total)} {baseCurrency}
                  </td>
                  <td className="py-3 pr-4 font-medium tabular-nums whitespace-nowrap" data-testid="holdings-total-cost">
                    {money(valuation.totalCost)} {baseCurrency}
                  </td>
                  <td className="py-3 pr-4 font-medium tabular-nums whitespace-nowrap" data-testid="holdings-total-return">
                    {signedMoney(valuation.totalReturn)} {baseCurrency}
                    <span className="block text-xs font-normal text-muted" data-testid="holdings-total-return-pct">
                      {valuation.totalReturnPct === null ? "n/m" : signedPct(valuation.totalReturnPct)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-medium tabular-nums whitespace-nowrap" data-testid="holdings-total-weight">
                    {valuation.excluded.length === valuation.rows.length
                      ? "—"
                      : weightPct(valuation.rows.reduce((sum, r) => sum + (r.weight ?? 0), 0))}
                  </td>
                  {metricColumns.map((key) => (
                    <td key={key} className="py-3 pr-4 font-medium tabular-nums whitespace-nowrap">
                      <PortfolioMetricCell metricKey={key} cell={portfolio[key]} />
                    </td>
                  ))}
                  <td />
                </tr>
                {valuation.excluded.length ? (
                  <tr>
                    <td colSpan={10 + metricColumns.length} className="pb-3 text-xs text-muted" data-testid="holdings-excluded">
                      Not included in the totals (price or FX pending): {valuation.excluded.join(", ")}
                    </td>
                  </tr>
                ) : null}
              </tfoot>
            ) : null}
          </table>
        </div>
        {valuation ? <HoldingsPie rows={valuation.rows} base={baseCurrency} /> : null}
        </>
      )}
    </section>
  );
}

type RunView = { runDate: string; status: string; finishedAt: string | null } | null;

/**
 * "Run daily refresh (preview only)" (T05 #13, spec §11). Rendered only when the server says this is a
 * Vercel preview with the flag on; the route behind it 404s everywhere else, production included.
 * It runs the same daily job server-side; no secret ever reaches the browser.
 */
export function PreviewRefresh({ lastRun, onChanged }: { lastRun: RunView; onChanged: Props["onChanged"] }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/dashboard/refresh", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { status?: string; inserted?: number; symbols?: number; errors?: number; error?: string }
        | null;
      if (!res.ok) setNote(data?.error ?? `Refresh failed (${res.status}).`);
      else if (data?.status === "locked") setNote("A refresh is already running. Try again in a minute.");
      else
        setNote(
          `Refresh ${data?.status}: ${data?.symbols ?? 0} ticker(s), ${data?.inserted ?? 0} new close(s)` +
            (data?.errors ? `, ${data.errors} error(s)` : "") +
            ".",
        );
    } catch {
      setNote("Network error. Try again.");
    }
    setBusy(false);
    await onChanged();
  }

  return (
    <section className="mt-10 border border-dashed border-line p-4" data-testid="preview-refresh">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="inline-flex h-10 items-center justify-center border border-ink px-4 text-sm disabled:opacity-50"
      >
        {busy ? "Running…" : "Run daily refresh (preview only)"}
      </button>
      <p className="mt-2 text-xs text-muted" data-testid="preview-refresh-last">
        {lastRun ? `Last run: ${lastRun.runDate} (UTC) · ${lastRun.status}` : "No run yet."}
      </p>
      {note ? (
        <p className="mt-1 text-xs" role="status" data-testid="preview-refresh-note">
          {note}
        </p>
      ) : null}
    </section>
  );
}
