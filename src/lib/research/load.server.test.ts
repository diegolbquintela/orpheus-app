import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadYearlyReturns, seedRows, type YearlyReturnsDb } from "./load.server.ts";
import { RESEARCH_TICKERS } from "./returns.ts";

const seed = seedRows();
const fail = (code: string): YearlyReturnsDb => ({
  query: async () => {
    throw Object.assign(new Error(code), { code });
  },
});

function years(ticker: string) {
  return seed.filter((row) => row.ticker === ticker).map((row) => row.year);
}

describe("seed fallback (#333)", () => {
  it("the committed seed is the full grid: SPY 1994+, QQQ 1999+, VT 2008+, UPRO 2009+, TQQQ 2010+, current year YTD", () => {
    assert.deepEqual(
      RESEARCH_TICKERS.map((ticker) => years(ticker)[0]),
      [1994, 1999, 2008, 2009, 2010],
    );
    for (const ticker of RESEARCH_TICKERS) {
      const rows = seed.filter((row) => row.ticker === ticker);
      assert.ok(rows.length > 1, ticker);
      assert.equal(rows[0]?.partial, ticker !== "SPY", ticker);
      assert.equal(rows.filter((row) => row.is_ytd).length, 1, ticker);
      assert.equal(rows[rows.length - 1]?.year, 2026, ticker);
      assert.equal(rows[rows.length - 1]?.is_ytd, true, ticker);
    }
    assert.equal(seed.length, 115);
  });

  it("null database renders the full seed", async () => {
    assert.deepEqual(await loadYearlyReturns(async () => null), seed);
  });

  it("relation missing (42P01) renders the full seed", async () => {
    assert.deepEqual(await loadYearlyReturns(async () => fail("42P01")), seed);
  });

  it("a connect error renders the full seed", async () => {
    assert.deepEqual(await loadYearlyReturns(async () => fail("ECONNREFUSED")), seed);
    await assert.doesNotReject(async () => {
      const rows = await loadYearlyReturns(async () => {
        throw Object.assign(new Error("dns"), { code: "ENOTFOUND" });
      });
      assert.deepEqual(rows, seed);
    });
  });

  it("an empty table renders the full seed", async () => {
    const db: YearlyReturnsDb = { query: async () => [] };
    assert.deepEqual(await loadYearlyReturns(async () => db), seed);
  });

  it("a stored row overrides only its own ticker and year", async () => {
    const db: YearlyReturnsDb = {
      query: async <T,>() =>
        [{ ticker: "QQQ", year: 1999, return_pct: "1.5", is_ytd: false, partial: true, source: "yahoo-adjclose" }] as T[],
    };
    const out = await loadYearlyReturns(async () => db);
    assert.equal(out.length, seed.length);
    for (const row of seed) {
      const got = out.find((item) => item.ticker === row.ticker && item.year === row.year);
      assert.ok(got, `${row.ticker} ${row.year}`);
      if (row.ticker === "QQQ" && row.year === 1999) assert.equal(got.return_pct, 1.5);
      else assert.deepEqual(got, row);
    }
  });
});
