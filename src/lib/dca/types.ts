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
  missedContributions: number;
};
