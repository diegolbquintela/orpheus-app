import type { ChartBar, ChartDiv, ChartSplit } from "./types.ts";

function laterFactor(stamp: number, splits: ChartSplit[]): number {
  let factor = 1;
  for (const split of splits) {
    if (split.t > stamp && split.ratio > 0) factor *= split.ratio;
  }
  return factor;
}

/**
 * Yahoo's chart `close` is split-adjusted back to the latest share count.
 * Raw close is that price times every split that happened after the bar.
 * The split day's own close is already the post-split print, so it is left alone.
 */
export function rawBars(bars: ChartBar[], splits: ChartSplit[]): ChartBar[] {
  return bars.map((bar) => ({ t: bar.t, px: bar.px * laterFactor(bar.t, splits) }));
}

/** Historical dividend amounts from Yahoo are scaled by later splits. Undo that. */
export function rawDividends(dividends: ChartDiv[], splits: ChartSplit[]): ChartDiv[] {
  return dividends.map((dividend) => ({
    t: dividend.t,
    amt: dividend.amt * laterFactor(dividend.t, splits),
  }));
}
