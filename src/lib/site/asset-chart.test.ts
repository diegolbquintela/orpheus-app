// #337 (ST4-28). The golden is the portfolio result from runDesk on c12198f, before assetChart existed.
// Replaying it must deep-equal chart, lump, dca, sessions and missedContributions. The new slices sum to dca.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadChart } from "../dca/yahoo.server.ts";
import { replayFetch, withFetch, type Snapshot } from "../dca/fixtures-support.ts";
import { runDesk, scaleWeights } from "../dca/simulate.ts";
import type { DeskRun } from "../dca/types.ts";

type Golden = {
  id: string;
  tickers: string[];
  weights: number[];
  start: string;
  end: string;
  capital: number;
  contribution: number;
  frequency: "weekly" | "monthly";
  sessions: number;
  missedContributions: number;
  lump: DeskRun["lump"];
  dca: DeskRun["dca"];
  chart: DeskRun["chart"];
};

const golden = JSON.parse(readFileSync("src/lib/site/asset-chart.golden.json", "utf8")) as Golden[];

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const bars = (rows: [string, number][]) => rows.map(([date, px]) => ({ t: day(date), px }));

function snap(ticker: string, start: string, end: string): Snapshot {
  return JSON.parse(readFileSync(`qa/snapshots/${ticker}_${start}_${end}.json`, "utf8")) as Snapshot;
}

async function replay(spec: Golden): Promise<DeskRun> {
  const snaps = spec.tickers.map((ticker) => snap(ticker, spec.start, spec.end));
  return withFetch(replayFetch(snaps), async () => {
    const names = [];
    for (const ticker of spec.tickers) names.push(await loadChart({ ticker, start: spec.start, end: spec.end }));
    const scaled = scaleWeights(spec.weights);
    return runDesk({
      names,
      weights: scaled.weights,
      capital: spec.capital,
      contribution: spec.contribution,
      frequency: spec.frequency,
      start: spec.start,
      end: spec.end,
    });
  });
}

function sumsTo(parts: number[], dca: number, where: string) {
  const sum = parts.reduce((total, value) => total + value, 0);
  const tol = 1e-9 * Math.max(1, Math.abs(dca));
  assert.ok(Math.abs(sum - dca) <= tol, `${where}: ${sum} vs ${dca}`);
  assert.equal(sum, dca, where);
}

describe("asset slices (#337, ST4-28)", () => {
  for (const spec of golden) {
    it(`${spec.id} portfolio fields deep-equal the pre-change golden`, async () => {
      const run = await replay(spec);
      assert.equal(run.sessions, spec.sessions);
      assert.equal(run.missedContributions, spec.missedContributions);
      assert.deepEqual(run.lump, spec.lump);
      assert.deepEqual(run.dca, spec.dca);
      assert.deepEqual(run.chart, spec.chart);
      assert.equal(run.assetChart.length, run.chart.length);
      run.chart.forEach((point, index) => {
        assert.equal(run.assetChart[index].length, spec.tickers.length, `${spec.id} ${point.date}`);
        sumsTo(run.assetChart[index], point.dca, `${spec.id} ${point.date}`);
      });
      if (spec.tickers.length === 1) {
        run.chart.forEach((point, index) => assert.equal(run.assetChart[index][0], point.dca));
      }
    });
  }

  it("a session before every name is priced is zeros, and a missing session carries the last price", () => {
    const run = runDesk({
      names: [
        {
          ticker: "A",
          bars: bars([
            ["2024-01-02", 10],
            ["2024-01-03", 20],
            ["2024-01-05", 8],
          ]),
          dividends: [],
          splits: [],
        },
        {
          ticker: "B",
          bars: bars([
            ["2024-01-03", 5],
            ["2024-01-04", 6],
          ]),
          dividends: [],
          splits: [],
        },
      ],
      weights: [0.5, 0.5],
      capital: 100,
      contribution: 10,
      frequency: "monthly",
      start: "2024-01-02",
      end: "2024-01-05",
    });
    assert.equal(run.chart[0].date, "2024-01-02");
    assert.equal(run.chart[0].dca, 0);
    assert.deepEqual(run.assetChart[0], [0, 0]);
    const carried = run.chart.findIndex((point) => point.date === "2024-01-05");
    assert.ok(carried > 0);
    assert.ok(run.assetChart[carried][1] > 0, "B's price carries forward onto A's later session");
    run.chart.forEach((point, index) => sumsTo(run.assetChart[index], point.dca, point.date));
  });

  it("a one-name slice equals the portfolio on every session", () => {
    const run = runDesk({
      names: [{ ticker: "A", bars: bars([["2024-01-02", 10], ["2024-01-03", 12]]), dividends: [], splits: [] }],
      weights: [1],
      capital: 100,
      contribution: 10,
      frequency: "monthly",
      start: "2024-01-02",
      end: "2024-01-03",
    });
    run.chart.forEach((point, index) => {
      assert.equal(run.assetChart[index].length, 1);
      assert.equal(run.assetChart[index][0], point.dca);
    });
  });
});
