import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMonths, contributionDates } from "./calendar.ts";
import { rawBars, rawDividends } from "./raw.ts";
import { irr, runDesk, scaleWeights } from "./simulate.ts";
import { listingError } from "./venues.ts";

const at = (iso: string) => Date.parse(iso);
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("dates", () => {
  it("clamps month-end", () => {
    assert.equal(addMonths("2024-01-31"), "2024-02-29");
    assert.equal(addMonths("2024-02-29"), "2024-03-29");
  });

  it("counts inclusive contribution dates", () => {
    assert.deepEqual(contributionDates("2024-01-15", "2024-04-15", "monthly"), [
      "2024-01-15",
      "2024-02-15",
      "2024-03-15",
      "2024-04-15",
    ]);
  });
});

describe("venues", () => {
  it("allows US, EU, and CA and names the rest", () => {
    assert.equal(listingError("AAPL", "NMS", "NasdaqGS"), null);
    assert.equal(listingError("RY.TO", "TOR", "Toronto"), null);
    assert.equal(listingError("SAP.DE", "GER", "XETRA"), null);
    assert.match(listingError("TCS.BO", "BSE", "BSE") ?? "", /lists on BSE/);
    assert.match(listingError("VOD.L", "LSE", "LSE") ?? "", /lists on LSE/);
    assert.match(listingError("0700.HK", "HKG", "HKSE") ?? "", /lists on HKSE/);
  });
});

describe("raw prices", () => {
  const split = [{ t: at("2020-08-31T13:30:00Z"), ratio: 4 }];

  it("restores pre-split closes and leaves the split-day print alone", () => {
    const bars = rawBars(
      [
        { t: at("2020-08-28T13:30:00Z"), px: 124.8075 },
        { t: at("2020-08-31T13:30:00Z"), px: 129.04 },
      ],
      split,
    );
    assert.ok(Math.abs(bars[0].px - 499.23) < 0.01);
    assert.equal(bars[1].px, 129.04);
  });

  it("restores a dividend that Yahoo scaled by a later split", () => {
    const [before, after] = rawDividends(
      [
        { t: at("2020-08-07T13:30:00Z"), amt: 0.205 },
        { t: at("2020-11-06T13:30:00Z"), amt: 0.205 },
      ],
      split,
    );
    assert.ok(Math.abs(before.amt - 0.82) < 1e-9);
    assert.equal(after.amt, 0.205);
  });
});

describe("irr", () => {
  it("solves a one-year 10 percent cashflow", () => {
    const rate = irr([
      { years: 0, amt: -100 },
      { years: 1, amt: 110 },
    ]);
    assert.ok(rate != null && Math.abs(rate - 0.1) < 1e-6);
  });
});

describe("runDesk", () => {
  const flat = (px: number, dates: string[]) => dates.map((date) => ({ t: day(date), px }));

  it("deploys lump sum and one contribution at a constant price", () => {
    const dates = ["2024-01-02", "2024-01-03", "2024-01-04"];
    const run = runDesk({
      names: [{ ticker: "A", bars: flat(10, dates), dividends: [], splits: [] }],
      weights: [1],
      capital: 100,
      contribution: 10,
      frequency: "monthly",
      start: "2024-01-02",
      end: "2024-01-04",
    });
    assert.equal(run.shares.lump[0], 10);
    assert.equal(run.shares.dca[0], 1);
    assert.equal(run.lump.invested, 100);
    assert.equal(run.dca.invested, 10);
    assert.equal(run.lump.endNlv, 100);
    assert.equal(run.lump.totalReturn, 0);
    assert.equal(run.missedContributions, 0);
  });

  it("applies split then dividend before the cash plan", () => {
    const run = runDesk({
      names: [
        {
          ticker: "A",
          bars: [
            { t: day("2024-01-02"), px: 100 },
            { t: day("2024-01-03"), px: 50 },
          ],
          dividends: [{ t: day("2024-01-03"), amt: 1 }],
          splits: [{ t: day("2024-01-03"), ratio: 2 }],
        },
      ],
      weights: [1],
      capital: 1000,
      contribution: 100,
      frequency: "monthly",
      start: "2024-01-02",
      end: "2024-01-03",
    });
    assert.ok(Math.abs(run.shares.lump[0] - 20.4) < 1e-9);
    assert.ok(Math.abs(run.shares.dca[0] - 2.04) < 1e-9);
    assert.ok(Math.abs(run.lump.endNlv - 1020) < 1e-6);
  });

  it("measures peak to trough against capital already deployed", () => {
    const run = runDesk({
      names: [
        {
          ticker: "A",
          bars: [
            { t: day("2024-01-02"), px: 10 },
            { t: day("2024-01-03"), px: 20 },
            { t: day("2024-01-04"), px: 10 },
          ],
          dividends: [],
          splits: [],
        },
      ],
      weights: [1],
      capital: 100,
      contribution: 10,
      frequency: "monthly",
      start: "2024-01-02",
      end: "2024-01-04",
    });
    assert.equal(run.lump.maxDrop, -0.5);
    assert.equal(run.lump.maxDropDate, "2024-01-04");
    assert.equal(run.lump.nlvAtDrop, 100);
    assert.equal(run.lump.returnToDrop, 0);
    assert.equal(run.dca.maxDrop, -0.5);
  });

  it("scales weights that do not sum to 100", () => {
    const scaled = scaleWeights([50, 25]);
    assert.equal(scaled.scaled, true);
    assert.ok(Math.abs(scaled.weights[0] - 2 / 3) < 1e-12);
    assert.throws(() => scaleWeights([0, 0]), /above zero/);
  });

  it("notes a contribution date with no later session", () => {
    const run = runDesk({
      names: [
        {
          ticker: "A",
          bars: flat(10, ["2024-01-02", "2024-01-03"]),
          dividends: [],
          splits: [],
        },
      ],
      weights: [1],
      capital: 100,
      contribution: 10,
      frequency: "monthly",
      start: "2024-01-02",
      end: "2024-02-02",
    });
    assert.equal(run.dca.invested, 10);
    assert.equal(run.missedContributions, 1);
  });
});
