import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  cellBackground,
  cellSign,
  dateInNewYork,
  marketPriceYearReturn,
  mergeReturns,
  pointsFromYahooChart,
  yearlyReturnsFromCloses,
  type YearReturn,
} from "./returns.ts";

const row = (ticker: string, year: number, return_pct: number, extra: Partial<YearReturn> = {}): YearReturn => ({
  ticker,
  year,
  return_pct,
  is_ytd: false,
  partial: false,
  source: "yahoo-adjclose",
  ...extra,
});

describe("yearly returns from adjusted closes (#333)", () => {
  it("full years use the prior year-end, and the as-of year is YTD", () => {
    const points = [
      { date: "2023-12-29", adj: 100 },
      { date: "2024-12-31", adj: 110 },
      { date: "2025-06-30", adj: 121 },
    ];
    assert.deepEqual(yearlyReturnsFromCloses(points, { ticker: "SPY", firstYear: 2024, asOf: "2025-06-30" }), [
      row("SPY", 2024, 10),
      row("SPY", 2025, 10, { is_ytd: true }),
    ]);
  });

  it("a year with no prior close is partial (inception)", () => {
    const points = [
      { date: "1999-03-10", adj: 50 },
      { date: "1999-12-31", adj: 80 },
    ];
    const [first] = yearlyReturnsFromCloses(points, { ticker: "QQQ", firstYear: 1999, asOf: "1999-12-31" });
    assert.equal(first?.partial, true);
    assert.equal(first?.is_ytd, true);
    assert.equal(first?.return_pct, 60);
  });

  it("reads adjclose from a recorded chart payload", () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [Date.parse("2024-12-31T12:00:00Z") / 1000, Date.parse("2025-11-13T12:00:00Z") / 1000],
            indicators: { adjclose: [{ adjclose: [200, 220] }] },
          },
        ],
      },
    };
    const points = pointsFromYahooChart(payload);
    assert.deepEqual(points.map((p) => p.date), ["2024-12-31", "2025-11-13"]);
    assert.equal(dateInNewYork(new Date("2025-11-13T12:00:00Z")), "2025-11-13");
    const rows = yearlyReturnsFromCloses(points, { ticker: "VT", firstYear: 2025, asOf: "2025-11-13" });
    assert.equal(rows[0]?.return_pct, 10);
    assert.equal(rows[0]?.is_ytd, true);
    assert.equal(rows[0]?.partial, false);
  });

  it("a database row overrides only its own ticker and year", () => {
    const seed = [row("SPY", 1994, 1), row("SPY", 1995, 2), row("QQQ", 1999, 3, { partial: true })];
    const out = mergeReturns(seed, [row("SPY", 1995, 9)]);
    assert.equal(out.length, 3);
    assert.equal(out.find((r) => r.ticker === "SPY" && r.year === 1995)?.return_pct, 9);
    assert.equal(out.find((r) => r.ticker === "SPY" && r.year === 1994)?.return_pct, 1);
    assert.equal(out.find((r) => r.ticker === "QQQ" && r.year === 1999)?.return_pct, 3);
  });

  it("positive cells use green and negative cells use alert", () => {
    assert.equal(cellSign(1), "up");
    assert.equal(cellSign(-1), "down");
    assert.match(cellBackground(12), /92 192 138/);
    assert.doesNotMatch(cellBackground(12), /255 143 135/);
    assert.match(cellBackground(-12), /255 143 135/);
    assert.doesNotMatch(cellBackground(-12), /92 192 138/);
    assert.equal(cellBackground(0), "transparent");
  });

  it("a recorded Yahoo replay stays within 0.05pp of the known market-price years (#335)", () => {
    // SPY 1994 SEC NAV total investment return is +1.15% (SPDR Trust financial
    // highlights, year ended 31 Dec 1994). That NAV figure is about 0.75pp from
    // this market-price replay. A roughly 1pp band versus issuer NAV covers the
    // 1994–2001 spot-check and is documented here, not asserted.
    const fixture = JSON.parse(readFileSync("test-fixtures/research/yearly-return-replay.json", "utf8")) as {
      cases: Array<{ ticker: string; year: number; bars: { date: string; close: number }[]; dividends: { date: string; amount: number }[] }>;
    };
    const known: Record<string, number> = {
      "SPY|1994": 0.4,
      "QQQ|2000": -36.1149,
      "VT|2009": 32.66,
      "UPRO|2010": 36.33,
      "TQQQ|2011": -8.05,
    };
    assert.equal(fixture.cases.length, 5);
    for (const item of fixture.cases) {
      const replay = marketPriceYearReturn(item.bars, item.dividends, item.year);
      const target = known[`${item.ticker}|${item.year}`];
      assert.equal(typeof target, "number", item.ticker);
      assert.ok(Math.abs(replay - target!) <= 0.05, `${item.ticker} ${item.year}: replay ${replay} vs ${target}`);
    }
  });

  it("the migration is an idempotent new table", () => {
    const sql = readFileSync("migrations/0015_yearly_returns.sql", "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS yearly_returns/);
    assert.match(sql, /PRIMARY KEY \(ticker, year\)/);
    assert.match(sql, /partial\s+BOOLEAN/);
    assert.match(sql, /is_ytd\s+BOOLEAN/);
    assert.doesNotMatch(sql, /ALTER TABLE/);
  });
});
