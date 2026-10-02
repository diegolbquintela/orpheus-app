import { useState, type FormEvent } from "react";
import { trimDecimal } from "@/lib/dashboard/format";

/**
 * Holdings table on /dashboard (T04 #12): add, edit (shares, average cost) and delete.
 * Talks to /api/dashboard/holdings; the server validates everything (US/EU/CA listings only,
 * shares > 0, average cost >= 0, one row per ticker). No prices or values yet.
 */

export type HoldingView = {
  id: number;
  symbol: string;
  shares: string;
  avgCost: string;
};

type Props = {
  holdings: HoldingView[];
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

function Row({ holding, onChanged }: { holding: HoldingView; onChanged: Props["onChanged"] }) {
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

export function HoldingsSection({ holdings, storage, onChanged }: Props) {
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
        US, EU and CA listings only. Average cost is per share, in the listing&apos;s own currency.
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
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <Row key={`${h.id}:${h.shares}:${h.avgCost}`} holding={h} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
