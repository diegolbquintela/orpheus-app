import { useState, type FormEvent } from "react";
import { trimDecimal } from "@/lib/dashboard/format";

/**
 * Holdings table on /dashboard (T04 #12): add, edit (shares, average cost) and delete.
 * Talks to /api/dashboard/holdings; the server validates everything (US/EU/CA listings only,
 * shares > 0, average cost >= 0, one row per ticker). T05 (#13) adds each ticker's last stored close
 * and its session date, or "price pending" until the background job has fetched it. No values yet.
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
};

type Props = {
  holdings: HoldingView[];
  prices: Record<string, PriceView | undefined>;
  storage: "ok" | "not_configured" | "signed_out";
  /** Re-run the page loader after a change. */
  onChanged: () => Promise<void> | void;
};

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
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

function Row({
  holding,
  price,
  onChanged,
}: {
  holding: HoldingView;
  price: PriceView | undefined;
  onChanged: Props["onChanged"];
}) {
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

  async function remove() {
    if (!window.confirm(`Delete ${holding.symbol} from your holdings?`)) return;
    setBusy(true);
    setError(null);
    const err = await send(`/api/dashboard/holdings/${holding.id}`, "DELETE");
    setBusy(false);
    if (err) return setError(err);
    await onChanged();
  }

  return (
    <tr className="border-t border-line align-top" data-testid="holding-row" data-symbol={holding.symbol}>
      <td className="py-3 pr-4 font-medium">{holding.symbol}</td>
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
          <td className="py-3 pr-4 tabular-nums">{trimDecimal(holding.avgCost)}</td>
        </>
      )}
      <td className="py-3 pr-4 tabular-nums whitespace-nowrap">
        <LastClose price={price} />
      </td>
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

export function HoldingsSection({ holdings, prices, storage, onChanged }: Props) {
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
        the prior completed session&apos;s close, updated once a day.
      </p>
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
      {holdings.length === 0 ? (
        <p className="mt-8 text-sm text-muted" data-testid="holdings-empty">
          No holdings yet.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead>
              <tr className="text-left">
                <th className="kicker pb-2 pr-4 font-normal text-muted">Ticker</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Shares</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Average cost</th>
                <th className="kicker pb-2 pr-4 font-normal text-muted">Last close</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <Row key={`${h.id}:${h.shares}:${h.avgCost}`} holding={h} price={prices[h.symbol]} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
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
