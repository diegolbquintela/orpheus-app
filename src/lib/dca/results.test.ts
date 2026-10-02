import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compactMoney,
  HEADLINE_KEY,
  METRIC_ROWS,
  PLAN_ORDER,
  planHeading,
  planMetrics,
  resultSummary,
} from "./results.ts";
import type { DeskRun, PlanStats } from "./types.ts";

describe("compactMoney", () => {
  it("shortens axis ticks to two significant digits", () => {
    assert.equal(compactMoney(0, "USD"), "$0");
    assert.equal(compactMoney(950, "USD"), "$950");
    assert.equal(compactMoney(1000, "USD"), "$1k");
    assert.equal(compactMoney(3500, "USD"), "$3.5k");
    assert.equal(compactMoney(13000, "USD"), "$13k");
    assert.equal(compactMoney(13499, "USD"), "$13k");
    assert.equal(compactMoney(550_000, "USD"), "$550k");
    assert.equal(compactMoney(2_200_000, "USD"), "$2.2M");
    assert.equal(compactMoney(999_999, "USD"), "$1M");
    assert.equal(compactMoney(1_500_000_000, "USD"), "$1.5B");
    assert.equal(compactMoney(-25_000, "USD"), "−$25k");
    assert.equal(compactMoney(4200, "EUR"), "€4.2k");
    assert.equal(compactMoney(4200, "CAD"), "CA$4.2k");
    assert.equal(compactMoney(Number.NaN, "USD"), "—");
  });

  it("supports three significant digits for the summary", () => {
    assert.equal(compactMoney(314_000, "USD", 3), "$314k");
    assert.equal(compactMoney(2_025_898, "USD", 3), "$2.03M");
    assert.equal(compactMoney(12_970, "USD", 3), "$13k");
    assert.equal(compactMoney(1000, "USD", 3), "$1k");
  });
});

describe("results layout", () => {
  const stats = (invested: number, endNlv: number): PlanStats => ({
    invested,
    endNlv,
    totalReturn: endNlv / invested - 1,
    cagr: null,
    mwr: null,
    maxDrop: -0.5,
    maxDropDate: "2022-12-28",
    nlvAtDrop: invested / 2,
    returnToDrop: -0.5,
  });
  const run = { lump: stats(1000, 12_970), dca: stats(314_000, 2_025_898) } as unknown as DeskRun;
  const ctx = { currency: "USD", capital: 1000, contribution: 1000, frequency: "weekly" as const };

  it("keeps lump sum then DCA columns and leads with invested, NLV, then XIRR", () => {
    assert.deepEqual(PLAN_ORDER, ["lump", "dca"]);
    assert.deepEqual(
      METRIC_ROWS.slice(0, 3).map((row) => row.key),
      ["invested", "nlv", "mwr"],
    );
    assert.equal(HEADLINE_KEY, "mwr");
    assert.match(
      METRIC_ROWS.find((row) => row.key === "cagr")?.label ?? "",
      /as if all invested day one/,
    );
  });

  it("builds headers and the DCA-first summary from the inputs", () => {
    assert.equal(planHeading("lump", ctx), "Lump sum ($1,000 once)");
    assert.equal(planHeading("dca", ctx), "DCA ($1,000 weekly)");
    assert.equal(
      resultSummary(run, "USD"),
      "DCA: $314k in, $2.03M now · Lump sum: $1k in, $13k now",
    );
    assert.equal(planMetrics(run, "dca", "USD")[0].value, "$314,000");
    assert.equal(planMetrics(run, "lump", "USD")[1].value, "$12,970");
  });
});
