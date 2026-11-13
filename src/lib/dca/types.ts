export type ChartBar = { t: number; px: number };
export type ChartDiv = { t: number; amt: number };
export type ChartSplit = { t: number; ratio: number };

export type ChartPayload = {
  ticker: string;
  exchange: string;
  currency: string;
  bars: ChartBar[];
  dividends: ChartDiv[];
  splits: ChartSplit[];
};

export type Frequency = "weekly" | "monthly";

export type NameInput = {
  ticker: string;
  bars: ChartBar[];
  dividends: ChartDiv[];
  splits: ChartSplit[];
};

export type PlanStats = {
  invested: number;
  endNlv: number;
  totalReturn: number | null;
  cagr: number | null;
  mwr: number | null;
  maxDrop: number;
  maxDropDate: string;
  nlvAtDrop: number;
  returnToDrop: number | null;
};

export type DeskRun = {
  sessions: number;
  years: number;
  lastPrices: (number | null)[];
  shares: { lump: number[]; dca: number[] };
  lump: PlanStats;
  dca: PlanStats;
  chart: { date: string; lump: number; dca: number }[];
  /**
   * DCA book only, one array per session in `chart` order. Each inner array is that session's
   * per-name value in basket order. The values sum to `chart[i].dca` (same terms as `mark`).
   */
  assetChart: number[][];
  missedContributions: number;
};
