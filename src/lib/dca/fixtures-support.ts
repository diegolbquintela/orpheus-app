/**
 * Shared by scripts/build-fixtures.ts (writes qa/fixtures.json) and
 * src/lib/dca/fixtures.test.ts (replays it offline). Both go through the app's
 * own loadChart() in yahoo.server.ts; only global fetch is swapped for a
 * recorder (live) or a replayer (committed snapshot).
 */
import { runDesk, scaleWeights } from "./simulate.ts";
import type { ChartPayload, DeskRun, Frequency, PlanStats } from "./types.ts";
import { ChartError, loadChart } from "./yahoo.server.ts";

export type RecordedRequest = { url: string; status: number; body: unknown };

export type Snapshot = {
  ticker: string;
  start: string;
  end: string;
  source: string;
  fetchedAt: string;
  requests: RecordedRequest[];
};

export type CaseInputs = {
  tickers: string[];
  /** Percent weights as typed in the form; the engine scales them to sum 1. */
  weights: number[];
  start: string;
  end: string;
  capital: number;
  contribution: number;
  frequency: Frequency;
};

export type CaseSpec = {
  id: string;
  title: string;
  acs: string[];
  kind: "run" | "refused";
  inputs: CaseInputs;
};

export function snapshotPath(ticker: string, start: string, end: string): string {
  return `qa/snapshots/${ticker.replace(/[^A-Z0-9.-]/gi, "_")}_${start}_${end}.json`;
}

/** A fetch that only answers URLs present in the snapshots. No network. */
export function replayFetch(snapshots: Snapshot[]): typeof fetch {
  const byUrl = new Map<string, RecordedRequest>();
  for (const snap of snapshots) for (const req of snap.requests) byUrl.set(req.url, req);
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const hit = byUrl.get(url);
    if (!hit) throw new Error(`No snapshot for ${url} (tests never touch the network).`);
    return new Response(JSON.stringify(hit.body), {
      status: hit.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/** Runs `work` with global fetch swapped out, restoring it afterwards. */
export async function withFetch<T>(impl: typeof fetch, work: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await work();
  } finally {
    globalThis.fetch = original;
  }
}

function stats(plan: PlanStats) {
  return { ...plan };
}

function summarizeRun(run: DeskRun) {
  return {
    sessions: run.sessions,
    years: run.years,
    lastPrices: run.lastPrices,
    shares: run.shares,
    lump: stats(run.lump),
    dca: stats(run.dca),
    missedContributions: run.missedContributions,
    chartPoints: run.chart.length,
    chartFirst: run.chart[0],
    chartLast: run.chart[run.chart.length - 1],
  };
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function inWindow<T extends { t: number }>(rows: T[], start: string, end: string): T[] {
  return rows.filter((row) => day(row.t) >= start && day(row.t) <= end);
}

/** Same steps as the Desk form: load each name, one currency, scale weights, run. */
export async function evaluateCase(spec: CaseSpec) {
  const { tickers, weights, start, end, capital, contribution, frequency } = spec.inputs;

  if (spec.kind === "refused") {
    const outcomes = [];
    for (const ticker of tickers) {
      try {
        await loadChart({ ticker, start, end });
        outcomes.push({ ticker, refused: false, status: 200, error: null as string | null });
      } catch (caught) {
        if (!(caught instanceof ChartError)) throw caught;
        outcomes.push({
          ticker,
          refused: caught.status === 400,
          status: caught.status,
          error: caught.message,
        });
      }
    }
    return { outcomes };
  }

  const names: ChartPayload[] = [];
  for (const ticker of tickers) names.push(await loadChart({ ticker, start, end }));
  const currency = names[0].currency;
  if (names.some((name) => name.currency !== currency))
    throw new Error(`${spec.id}: mixed currencies`);
  const scaled = scaleWeights(weights);
  const base = { weights: scaled.weights, capital, contribution, frequency, start, end };

  const run = runDesk({ names, ...base });

  // DCA-01 counterfactual: same run with the dividend stream removed.
  const noDiv = runDesk({ names: names.map((name) => ({ ...name, dividends: [] })), ...base });

  // DCA-03/04 probe: first two sessions with no events, so lump shares stay as deployed.
  const deployDate = run.chart.find((point) => point.lump > 0)?.date ?? null;
  const secondSession = run.chart[1]?.date ?? end;
  const probe = runDesk({
    names: names.map((name) => ({ ...name, dividends: [], splits: [] })),
    ...base,
    end: secondSession,
  });
  const deployPx = names.map((name) => {
    const bar = [...name.bars]
      .reverse()
      .find((row) => deployDate != null && day(row.t) <= deployDate);
    return bar ? bar.px : null;
  });
  const allocationAtDeploy = probe.shares.lump.map((shares, index) =>
    deployPx[index] ? (shares * (deployPx[index] as number)) / capital : null,
  );

  return {
    currency,
    exchanges: names.map((name) => name.exchange),
    weightsApplied: scaled.weights,
    weightsScaled: scaled.scaled,
    events: names.map((name) => ({
      ticker: name.ticker,
      dividendsInWindow: inWindow(name.dividends, start, end).map((row) => ({
        date: day(row.t),
        amt: row.amt,
      })),
      splitsInWindow: inWindow(name.splits, start, end).map((row) => ({
        date: day(row.t),
        ratio: row.ratio,
      })),
    })),
    lumpDeploy: {
      date: deployDate,
      prices: deployPx,
      nlvOnDeployDate: run.chart.find((point) => point.date === deployDate)?.lump ?? null,
      allocationAtDeploy,
    },
    contributions: {
      placed: Math.round(run.dca.invested / contribution),
      invested: run.dca.invested,
      missed: run.missedContributions,
    },
    run: summarizeRun(run),
    withoutDividendReinvestment: {
      lumpEndNlv: noDiv.lump.endNlv,
      dcaEndNlv: noDiv.dca.endNlv,
      lumpShares: noDiv.shares.lump,
      dcaShares: noDiv.shares.dca,
    },
  };
}
