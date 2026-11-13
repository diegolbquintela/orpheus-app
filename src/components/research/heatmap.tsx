import { useState } from "react";
import {
  cellBackground,
  cellSign,
  formatReturnPct,
  RESEARCH_TICKERS,
  yearSummary,
  type YearReturn,
} from "@/lib/research/returns";

/** Yearly-returns grid (#333). One ticker at a time. The rows are the seed, with any stored year overlaid. */
export function Heatmap({ rows }: { rows: readonly YearReturn[] }) {
  const tickers = RESEARCH_TICKERS.filter((ticker) => rows.some((row) => row.ticker === ticker));
  const [ticker, setTicker] = useState<string>(tickers[0] ?? "SPY");
  const mine = rows.filter((row) => row.ticker === ticker).slice().sort((a, b) => a.year - b.year);
  const { up, down } = yearSummary(mine);
  return (
    <main className="rs" data-testid="rs-page">
      <p className="ow-label">01</p>
      <h1 className="rs-title">Yearly returns.</h1>
      <div className="rs-tickers" role="group" aria-label="Ticker">
        {tickers.map((item) => (
          <button
            key={item}
            type="button"
            className="rs-ticker"
            aria-pressed={item === ticker}
            onClick={() => setTicker(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <p className="rs-summary" data-testid="rs-summary">
        {up} up, {down} down
      </p>
      <div className="rs-grid" role="grid" aria-label={`${ticker} yearly total returns`} data-testid="rs-grid">
        {mine.map((row) => {
          const sign = cellSign(row.return_pct);
          const marks = [row.partial ? "partial year" : "", row.is_ytd ? "year to date" : ""].filter(Boolean).join(", ");
          const label = `${row.year}: ${formatReturnPct(row.return_pct)}${marks ? `, ${marks}` : ""}`;
          return (
            <div
              key={row.year}
              role="gridcell"
              className="rs-cell"
              data-testid="rs-cell"
              data-year={row.year}
              data-ticker={row.ticker}
              data-sign={sign}
              style={{ backgroundColor: cellBackground(row.return_pct) }}
              aria-label={label}
            >
              <span className="rs-year">{row.year}</span>
              <span className="rs-pct">{formatReturnPct(row.return_pct)}</span>
              {row.partial ? <span className="rs-mark">Partial</span> : null}
              {row.is_ytd ? <span className="rs-mark">YTD</span> : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}
