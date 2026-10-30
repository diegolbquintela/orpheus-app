// #267 (renaissance-spec section 8, AC RM-13): the one-time seed parser on the committed sanitized sample (and, when
// present on this machine, the CoS tracker itself; read-only). Never touches a database.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildView } from "./view.ts";
import { parseCheckin, type Entry } from "./model.ts";
import { itemsIn, parseTracker } from "./seed.ts";

const sample = readFileSync(new URL("../../../test-fixtures/renaissance/cos-tracker.sample.md", import.meta.url), "utf8");
const toEntries = (md: string): Entry[] => parseTracker(md).flatMap((c) => c.entries.map((e) => ({ ...e, date: c.date, picks: c.picks })));

describe("RM-13 seed parser", () => {
  it("maps phrases to items", () => {
    assert.deepEqual(itemsIn("Zyn ≤15 & coffee ≤6").map((x) => x.item), ["zyn", "coffee"]);
    assert.deepEqual(itemsIn("Industry block").map((x) => x.pillar), ["industry"]);
    assert.deepEqual(itemsIn("HIT Spiritual (Orthodox Bible)").map((x) => x.item), ["spiritual"]);
    assert.deepEqual(itemsIn("≥8k steps").map((x) => x.item), ["steps"]);
    assert.deepEqual(itemsIn("nothing here"), []);
  });
  it("reads the sample: baseline, results, cap log and picks; every body validates", () => {
    const days = parseTracker(sample);
    assert.deepEqual(days.map((d) => d.date), ["2026-10-28", "2026-10-29", "2026-10-30"]);
    for (const d of days) assert.ok(parseCheckin(d).ok, d.date);
    const by = (date: string, item: string) => days.find((d) => d.date === date)!.entries.find((e) => e.item === item);
    assert.deepEqual(by("2026-10-28", "zyn"), { pillar: "health", item: "zyn", target: 16, actual: 16, hit: true, note: "Baseline" });
    assert.equal(by("2026-10-28", "coffee")!.actual, 7);
    assert.equal(by("2026-10-29", "steps")!.hit, true);
    assert.equal(by("2026-10-29", "steps")!.target, 8000);
    assert.equal(by("2026-10-29", "spiritual")!.hit, true);
    for (const item of ["zyn", "coffee", "lift", "industry"]) assert.equal(by("2026-10-29", item)!.hit, false, item);
    assert.equal(by("2026-10-29", "zyn")!.target, 15);
    assert.equal(by("2026-10-29", "coffee")!.target, 6);
    assert.equal(by("2026-10-30", "zyn")!.hit, null);
    assert.equal(by("2026-10-30", "zyn")!.target, 15);
    assert.equal(days[2].picks.length, 5);
    assert.equal(days[0].picks.length, 0);
  });
  it("seeded data gives the tracker's own answers: Oct 30 caps held at ≤15 / ≤6, Oct 29 spiritual kept", () => {
    const v = buildView(toEntries(sample), "2026-10-30");
    assert.deepEqual(v.caps, { zyn: 15, coffee: 6 });
    assert.equal(v.dayN, 2);
    assert.equal(v.growth.find((g) => g.pillar === "spiritual")!.best, 1);
  });
  it("is stable on a re-run (same input, same bodies)", () => {
    assert.deepEqual(parseTracker(sample), parseTracker(sample));
  });
  const real = "/workspace/renaissance-man/cos-tracker.md";
  it("parses the real CoS tracker when present (read-only)", { skip: !existsSync(real) }, () => {
    const days = parseTracker(readFileSync(real, "utf8"));
    assert.ok(days.length >= 3);
    for (const d of days) assert.ok(parseCheckin(d).ok, d.date);
  });
});
