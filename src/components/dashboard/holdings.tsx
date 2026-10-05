import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { costForRequest, formatPortfolioPct, trimDecimal } from "@/lib/dashboard/format";
import { excludedNote } from "@/lib/dashboard/pie";
import { HoldingsPie } from "./holdings-pie";
import { type MetricViewData, type PortfolioCellView } from "./metric-columns";
import { MetricsSheet } from "./metrics-sheet";

/**
 * Holdings on /dashboard (T04 #12 → #55): add, edit (shares, average cost) and delete. Talks to
 * /api/dashboard/holdings; the server validates everything (US/EU/CA listings only, shares > 0, average
 * cost >= 0, one row per ticker). Since #55 (epic #53, spec §0.2) the holdings list is the page: each row
 * shows name, shares, value in base currency and share of the book, and a tap opens the detail panel with
 * the rest of the T05–T07 fields (average cost, last close and session date, cost at the D8 rate, return,
 * FX line) plus Edit and Delete. Under the list: one total (value only), the T15 pie and, until #57 turns
 * them into chips, today's metric columns with the T14 portfolio row. Everything comes from the server's
 * stored data.
 */

export type HoldingView = {
  id: number;
  symbol: string;
  shares: string;
  /** null = no cost entered (#56): average cost, cost and return render blank. */
  avgCost: string | null;
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
  totalCost: number | null;
  totalReturn: number | null;
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
const weightPct = formatPortfolioPct;

/**
 * Row layout: two lines on a phone (name · value / shares · share), four columns from 640 px. The number
 * columns are narrow (#57) so the name keeps room when the metrics sheet sits beside the list at 1024 px.
 */
const ROW_COLS = "gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_5rem_9rem_6rem] sm:items-baseline";
const ROW_GRID = `grid grid-cols-[minmax(0,1fr)_auto] ${ROW_COLS}`;

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

function PositionValue({ row, base, testId = "holding-value", withFx = false }: { row: ValuedRow | undefined; base: BaseCurrency; testId?: string; withFx?: boolean }) {
  if (!row || row.value === null)
    return (
      <span className="text-muted" data-testid={testId} data-status={row?.status ?? "price_pending"}>
        {row?.status === "fx_pending" ? "FX pending" : "—"}
      </span>
    );
  return (
    <span data-testid={testId} data-status="ok" data-fx-fallback={row.fallback ? "true" : "false"}>
      {money(row.value)} {base}
      {withFx
        ? row.rates.map((r) => (
            <span key={r.quote} className="block text-xs text-muted" data-testid="holding-fx">
              FX {r.quote} {r.cadPerUnit} · {r.rateDate}
              {r.rateDate < (row.sessionDate ?? "") ? " (previous rate)" : ""}
            </span>
          ))
        : null}
    </span>
  );
}

/**
 * #56: a holding with no average cost shows its average cost, cost and return as empty (not `0`, `n/m` or
 * `—`; spec §0.2 "Add"), until a cost is entered.
 */
function Blank({ testId }: { testId: string }) {
  return <span data-testid={testId} data-blank="true" />;
}

/** Placeholder for a T07 field (cost, return, share of the book) while the price or FX is pending. */
function Pending({ testId }: { testId: string }) {
  return (
    <span className="text-muted" data-testid={testId}>
      —
    </span>
  );
}

/** One label / value pair in a holding's detail panel. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 sm:block sm:border-b-0 sm:py-0">
      <dt className="kicker text-muted">{label}</dt>
      <dd className="text-right tabular-nums sm:mt-1 sm:text-left">{children}</dd>
    </div>
  );
}

/**
 * One holding (#55, spec §0.2): the row shows name (the ticker until a name is stored), shares, value in
 * base currency and share of the book; tapping it opens the detail panel with the rest of the T07 fields
 * plus Edit and Delete. The panel is always rendered (hidden when closed), so server-rendered pages and the
 * built-server checks still see every field.
 */
function Row({
  holding,
  price,
  valued,
  base,
  onChanged,
}: {
  holding: HoldingView;
  price: PriceView | undefined;
  valued: ValuedRow | undefined;
  base: BaseCurrency;
  onChanged: Props["onChanged"];
}) {
  const ok = valued && valued.value !== null;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shares, setShares] = useState(trimDecimal(holding.shares));
  const savedCost = holding.avgCost === null ? "" : trimDecimal(holding.avgCost);
  const noCost = holding.avgCost === null;
  const [avgCost, setAvgCost] = useState(savedCost);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detailId = `holding-detail-${holding.id}`;
  const name = price?.name || holding.symbol;

  // QA N6: one PUT per Save, like the #44 delete guard: a second click before React re-renders the disabled
  // button is ignored. Released on an error (so the user can retry) and once the page's refetch is back.
  const saving = useRef(false);
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    const err = await send(`/api/dashboard/holdings/${holding.id}`, "PUT", { shares, avgCost: costForRequest(avgCost) });
    setBusy(false);
    if (err) {
      saving.current = false;
      return setError(err);
    }
    setEditing(false);
    try {
      await onChanged();
    } finally {
      saving.current = false;
    }
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
    <li className={`border-t border-line${deleted ? " opacity-50" : ""}`} data-testid="holding-row" data-symbol={holding.symbol} aria-busy={deleted || undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailId}
        className={`${ROW_GRID} w-full py-3 text-left text-sm tabular-nums`}
        data-testid="holding-row-toggle"
      >
        <span className="min-w-0 truncate font-medium sm:order-1" data-testid="holding-name">
          {name}
        </span>
        {/* QA N1: the header row is aria-hidden, so each number carries its own (visually hidden) label. */}
        <span className="text-right whitespace-nowrap sm:order-3">
          <span className="sr-only" data-testid="holding-value-label"> value </span>
          <PositionValue row={valued} base={base} />
          <span className="sr-only"> </span>
        </span>
        <span className="text-xs text-muted sm:order-2 sm:text-sm sm:text-ink" data-testid="holding-shares">
          {trimDecimal(holding.shares)}
          <span className="sm:sr-only"> shares</span>
        </span>
        <span className="text-right text-xs text-muted sm:order-4 sm:text-sm sm:text-ink">
          <span className="sr-only" data-testid="holding-weight-label"> share of book </span>
          {ok && valued.weight !== null ? <span data-testid="holding-weight">{weightPct(valued.weight)}</span> : <Pending testId="holding-weight" />}
        </span>
      </button>
      <div id={detailId} hidden={!open} className="pb-4 text-sm" data-testid="holding-detail">
        <dl className="grid gap-x-6 sm:grid-cols-3 sm:gap-y-4 lg:grid-cols-5">
          <Field label="Ticker">{holding.symbol}</Field>
          <Field label="Name">
            <span data-testid="holding-detail-name">{price?.name ?? "—"}</span>
          </Field>
          <Field label="Shares">
            {editing ? (
              <input
                aria-label={`Shares of ${holding.symbol}`}
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                inputMode="decimal"
                className="field w-28 text-base tabular-nums"
              />
            ) : (
              trimDecimal(holding.shares)
            )}
          </Field>
          <Field label="Average cost">
            {editing ? (
              <input
                aria-label={`Average cost of ${holding.symbol}`}
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                inputMode="decimal"
                className="field w-28 text-base tabular-nums"
              />
            ) : (
              noCost ? (
                <Blank testId="holding-avg-cost" />
              ) : (
                <span data-testid="holding-avg-cost">
                  {savedCost}
                  {price?.currency ? ` ${price.currency}` : ""}
                </span>
              )
            )}
          </Field>
          <Field label="Last close">
            <LastClose price={price} />
          </Field>
          <Field label={`Value (${base})`}>
            <PositionValue row={valued} base={base} testId="holding-detail-value" withFx />
          </Field>
          <Field label={`Cost (${base})`}>
            {noCost ? (
              <Blank testId="holding-cost" />
            ) : ok && valued.cost !== null ? (
              <span data-testid="holding-cost">
                {money(valued.cost)} {base}
              </span>
            ) : (
              <Pending testId="holding-cost" />
            )}
          </Field>
          <Field label="Return">
            {noCost ? (
              <Blank testId="holding-return" />
            ) : ok && valued.returnAmount !== null ? (
              <span data-testid="holding-return">
                {signedMoney(valued.returnAmount)} {base}
                <span className="block text-xs text-muted" data-testid="holding-return-pct">
                  {valued.returnPct === null ? "n/m" : signedPct(valued.returnPct)}
                </span>
              </span>
            ) : (
              <Pending testId="holding-return" />
            )}
          </Field>
          <Field label="Share of the book">
            {ok && valued.weight !== null ? <span data-testid="holding-detail-weight">{weightPct(valued.weight)}</span> : <Pending testId="holding-detail-weight" />}
          </Field>
        </dl>
        <div className="mt-4 text-sm">
          {editing ? (
            <>
              <button type="button" disabled={busy} onClick={save} className="mr-4 underline-offset-4 hover:underline disabled:opacity-50">
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setShares(trimDecimal(holding.shares));
                  setAvgCost(savedCost);
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
              <button type="button" disabled={busy} onClick={() => setEditing(true)} className="mr-4 underline-offset-4 hover:underline disabled:opacity-50">
                Edit
              </button>
              <button type="button" disabled={busy} onClick={remove} className="underline-offset-4 hover:underline disabled:opacity-50">
                Delete
              </button>
            </>
          )}
          {error ? (
            <p className="mt-1 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
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
  const [sheet, setSheet] = useState<"holdings" | "metrics">("holdings");

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const err = await send("/api/dashboard/holdings", "POST", { symbol, shares, avgCost: costForRequest(avgCost) });
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

  const pend = valuation ? valuation.rows.filter((r) => r.value === null) : [];
  const note = excludedNote(pend.filter((r) => r.status !== "fx_pending").length, pend.filter((r) => r.status === "fx_pending").length);

  const hasRows = holdings.length > 0;
  const names = Object.fromEntries(holdings.map((h) => [h.symbol, prices[h.symbol]?.name || h.symbol]));

  return (
    <section className="mt-10" data-testid="holdings">
      {/* #57 (spec §0.5 item 8): below 1024 px the metrics are a second sheet behind this switch; from 1024 px
          the sheet sits on the right of the list and the switch is hidden. */}
      {hasRows ? (
        <div className="flex border-b border-line lg:hidden" role="group" aria-label="Sheet" data-testid="sheet-switch">
          {(["holdings", "metrics"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSheet(key)}
              aria-pressed={sheet === key}
              className={`-mb-px flex-1 border-b-2 py-3 text-base ${sheet === key ? "border-ink text-ink" : "border-transparent text-muted"}`}
              data-testid={`sheet-switch-${key}`}
            >
              {key === "holdings" ? "Holdings" : "Metrics"}
            </button>
          ))}
        </div>
      ) : null}
      <div className={hasRows ? "lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12" : undefined}>
        <div className={sheet === "metrics" && hasRows ? "hidden lg:block" : undefined} data-testid="holdings-sheet">
          <h2 className={`text-xl${hasRows ? " hidden lg:block" : ""}`}>Holdings</h2>
          <BaseCurrencySetting value={baseCurrency} onChanged={onChanged} />
          {/* #56: one tight row at every width (no stacked fields on a phone), wider from 1024 px. */}
          <form
            className="mt-6 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:gap-4"
            onSubmit={add}
            data-testid="holding-form"
          >
            <label className="flex min-w-0 flex-col gap-1 lg:gap-2">
              <span className="kicker text-muted">Ticker</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                spellCheck={false}
                autoCapitalize="characters"
                className="field text-base"
                data-testid="holding-form-symbol"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 lg:gap-2">
              <span className="kicker text-muted">Shares</span>
              <input
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                inputMode="decimal"
                className="field text-base tabular-nums"
                data-testid="holding-form-shares"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 lg:gap-2">
              {/* QA N3 (#58): the accessible name comes from this label, so it always contains the visible text:
                  "Avg cost (optional)" below 1024 px, "Average cost (optional)" from 1024 px. */}
              <span className="kicker text-muted" data-testid="holding-form-cost-label">
                <span className="lg:hidden" data-testid="holding-form-cost-label-short">
                  Avg cost<span className="sr-only"> (optional)</span>
                </span>
                <span className="hidden lg:inline">Average cost (optional)</span>
              </span>
              <input
                value={avgCost}
                onChange={(e) => setAvgCost(e.target.value)}
                inputMode="decimal"
                placeholder="optional"
                className="field text-base tabular-nums placeholder:text-muted"
                data-testid="holding-form-cost"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center justify-center bg-ink px-4 text-sm text-card disabled:opacity-50 lg:h-12 lg:px-6"
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
              Add a holding
            </p>
          ) : (
            <>
              <div className={`${ROW_COLS} mt-8 hidden pb-2 sm:grid`} aria-hidden="true">
                <span className="kicker text-muted sm:order-1">Name</span>
                <span className="kicker text-muted sm:order-2">Shares</span>
                <span className="kicker text-right text-muted sm:order-3">Value ({baseCurrency})</span>
                <span className="kicker text-right text-muted sm:order-4">Share of the book</span>
              </div>
              <ul className="mt-6 border-b border-line sm:mt-0" data-testid="holdings-list">
                {holdings.map((h) => (
                  <Row
                    key={`${h.id}:${h.shares}:${h.avgCost}`}
                    holding={h}
                    price={prices[h.symbol]}
                    valued={valuation?.rows.find((r) => r.symbol === h.symbol)}
                    base={baseCurrency}
                    onChanged={onChanged}
                  />
                ))}
              </ul>
              {valuation ? (
                <p className={`${ROW_GRID} py-3 text-sm font-medium tabular-nums`} data-testid="holdings-total-line">
                  <span className="sm:col-start-1">
                    Total
                    {note ? (
                      <span className="block text-xs font-normal text-muted" data-testid="holdings-total-excluded-count">
                        {note}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right whitespace-nowrap sm:col-start-3" data-testid="holdings-total" data-base={baseCurrency}>
                    {valuation.excluded.length === valuation.rows.length ? "—" : `${money(valuation.total)} ${baseCurrency}`}
                  </span>
                </p>
              ) : null}
              {valuation ? <HoldingsPie rows={valuation.rows} base={baseCurrency} /> : null}
            </>
          )}
        </div>
        {hasRows ? (
          <div className={sheet === "holdings" ? "mt-6 hidden lg:mt-0 lg:block" : "mt-6 lg:mt-0"} data-testid="metrics">
            <h2 className="hidden text-xl lg:block">Metrics</h2>
            <div className="lg:mt-6">
              <MetricsSheet
                holdings={holdings}
                names={names}
                rows={valuation?.rows ?? []}
                chips={metricColumns}
                metrics={metrics}
                portfolio={portfolio}
                onChanged={onChanged}
              />
            </div>
          </div>
        ) : null}
      </div>
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
