/** Presentation for the DCA asset lines (#337). The values themselves come from `DeskRun.assetChart`. */

const ASSET_COLOURS = [
  "var(--color-asset-1)",
  "var(--color-asset-2)",
  "var(--color-asset-3)",
  "var(--color-asset-4)",
  "var(--color-dim)",
  "var(--color-rule)",
] as const;

const ASSET_DASHES = [undefined, "4 3", "1 3"] as const;

/** Portfolio stays green. Asset colours cycle, then the same colours with a dash. */
export function assetStroke(index: number): { stroke: string; dash?: string } {
  const stroke = ASSET_COLOURS[index % ASSET_COLOURS.length];
  const dash = ASSET_DASHES[Math.floor(index / ASSET_COLOURS.length) % ASSET_DASHES.length];
  return dash ? { stroke, dash } : { stroke };
}

export const ASSET_NOTE = "Asset lines add up to the portfolio.";

export type TipRow = { name: string; value: number | null; stroke: string };

/** Portfolio first, then basket order. A one-name basket is the portfolio row only. */
export function tipRows(tickers: readonly string[], dca: number, slices: readonly (number | null)[] | undefined): TipRow[] {
  const rows: TipRow[] = [{ name: "Portfolio", value: dca, stroke: "var(--color-green)" }];
  if (tickers.length > 1) {
    tickers.forEach((name, index) => {
      const value = slices?.[index];
      rows.push({ name, value: typeof value === "number" ? value : null, stroke: assetStroke(index).stroke });
    });
  }
  return rows;
}
