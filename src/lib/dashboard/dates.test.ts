import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCalendarDate } from "./dates.ts";
import { parseBocValet, parseEcbXml } from "./fx.server.ts";

describe("isCalendarDate (dashboard date inputs)", () => {
  it("rejects impossible calendar dates (QA F1)", () => {
    for (const d of [
      "2026-02-31",
      "2026-02-29",
      "2026-02-30",
      "2026-04-31",
      "0000-01-01",
      "2026-06-31",
      "2026-09-31",
      "2026-11-31",
      "2100-02-29",
    ])
      assert.equal(isCalendarDate(d), false, d);
  });

  it("rejects anything that is not strict YYYY-MM-DD", () => {
    for (const d of [
      "2026-00-10",
      "2026-13-01",
      "2026-01-00",
      "2026-01-32",
      "2026-1-01",
      "26-01-01",
      "2026-01-01T00:00:00Z",
      " 2026-01-01",
      "2026-01-01 ",
      "+02026-01-01",
      "",
      null,
      undefined,
      20260101,
    ])
      assert.equal(isCalendarDate(d), false, String(d));
  });

  it("accepts real dates, including leap days and year 1", () => {
    for (const d of [
      "2024-02-29",
      "2000-02-29",
      "2026-02-28",
      "2026-04-30",
      "2026-12-31",
      "2026-10-02",
      "0001-01-01",
      "0099-12-31",
      "9999-12-31",
    ])
      assert.equal(isCalendarDate(d), true, d);
  });

  it("provider parsers drop rows with impossible dates", () => {
    const boc = parseBocValet(
      {
        observations: [
          { d: "2026-02-31", FXUSDCAD: { v: "1.4" } },
          { d: "2026-02-27", FXUSDCAD: { v: "1.4" } },
        ],
      },
      ["USD"],
    );
    assert.deepEqual(
      boc.map((d) => d.date),
      ["2026-02-27"],
    );
    const ecb = parseEcbXml(
      '<gesmes eurofxref><Cube time="2026-02-30"><Cube currency="DKK" rate="7.46"/></Cube><Cube time="2026-02-27"><Cube currency="DKK" rate="7.46"/></Cube></gesmes>',
      ["DKK"],
    );
    assert.deepEqual(
      ecb.map((d) => d.date),
      ["2026-02-27"],
    );
  });
});
