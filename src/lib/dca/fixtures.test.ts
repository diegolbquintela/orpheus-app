/**
 * Replays qa/fixtures.json offline: committed Yahoo snapshots go through the
 * app's loadChart() and runDesk(), and every output must match the recorded
 * expectation. Global fetch only answers snapshot URLs, so no network is used.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ADVICE_PATTERN,
  AC_RULES,
  CASES,
  COPY_FILES,
  scanCopy,
} from "../../../scripts/build-fixtures.ts";
import {
  type CaseSpec,
  type Snapshot,
  evaluateCase,
  replayFetch,
  withFetch,
} from "./fixtures-support.ts";

type Fixture = {
  id: string;
  acs: { ac: string; rule: string }[];
  kind: "run" | "refused" | "content";
  inputs: CaseSpec["inputs"] & { files?: string[]; pattern?: string };
  data?: { snapshots: string[] };
  expected: unknown;
};

const fixtures = JSON.parse(readFileSync("qa/fixtures.json", "utf8")) as Fixture[];

function close(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === "number" && typeof actual === "number") {
    const tol = 1e-9 * Math.max(1, Math.abs(expected));
    assert.ok(Math.abs(actual - expected) <= tol, `${path}: ${actual} != ${expected}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: not an array`);
    assert.equal(actual.length, expected.length, `${path}: length`);
    expected.forEach((item, index) => close(actual[index], item, `${path}[${index}]`));
    return;
  }
  if (expected && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object", `${path}: not an object`);
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    assert.deepEqual(Object.keys(a).sort(), Object.keys(e).sort(), `${path}: keys`);
    for (const key of Object.keys(e)) close(a[key], e[key], `${path}.${key}`);
    return;
  }
  assert.equal(actual, expected, path);
}

describe("qa/fixtures.json (AC pack DCA-01..06)", () => {
  it("is non-empty and covers all six ACs", () => {
    assert.ok(fixtures.length > 0);
    const covered = new Set(fixtures.flatMap((fixture) => fixture.acs.map((entry) => entry.ac)));
    assert.deepEqual([...covered].sort(), Object.keys(AC_RULES).sort());
  });

  it("matches the case list in scripts/build-fixtures.ts", () => {
    const ids = fixtures
      .filter((fixture) => fixture.kind !== "content")
      .map((fixture) => fixture.id);
    assert.deepEqual(
      ids,
      CASES.map((spec) => spec.id),
    );
  });

  for (const fixture of fixtures.filter((item) => item.kind !== "content")) {
    it(`${fixture.id} replays from snapshots to the recorded output`, async () => {
      const spec = CASES.find((item) => item.id === fixture.id) as CaseSpec;
      assert.deepEqual(fixture.inputs, spec.inputs);
      const snaps = (fixture.data?.snapshots ?? []).map(
        (path) => JSON.parse(readFileSync(path, "utf8")) as Snapshot,
      );
      const actual = await withFetch(replayFetch(snaps), () => evaluateCase(spec));
      close(actual, fixture.expected, fixture.id);
    });
  }

  it("rule checks hold on the recorded outputs", () => {
    for (const fixture of fixtures.filter((item) => item.kind === "run")) {
      const e = fixture.expected as any;
      const { capital, contribution, weights } = fixture.inputs;
      const total = weights.reduce((sum, value) => sum + value, 0);
      // DCA-03: all capital on day one.
      assert.equal(e.run.lump.invested, capital);
      assert.ok(Math.abs(e.lumpDeploy.nlvOnDeployDate - capital) < 1e-6);
      // DCA-04: allocation at deploy equals the scaled weights.
      e.lumpDeploy.allocationAtDeploy.forEach((share: number, index: number) =>
        assert.ok(Math.abs(share - weights[index] / total) < 1e-9),
      );
      // DCA-02: contributions only; each placed date adds exactly one contribution.
      assert.equal(e.run.dca.invested, e.contributions.placed * contribution);
      assert.equal(e.run.chartFirst.dca > 0 && e.run.chartFirst.dca <= contribution + 1e-9, true);
      // DCA-01: dividends in window, and reinvestment grows the share count.
      const paid = e.events.some((event: any) => event.dividendsInWindow.length > 0);
      assert.ok(paid);
      assert.ok(e.run.lump.endNlv > e.withoutDividendReinvestment.lumpEndNlv);
    }
  });

  it("DCA-06: no buy/sell/hold output in user-facing copy or refusals", () => {
    const content = fixtures.find((fixture) => fixture.kind === "content") as Fixture;
    assert.deepEqual(content.inputs.files, COPY_FILES);
    assert.equal(content.inputs.pattern, ADVICE_PATTERN);
    const scan = scanCopy(COPY_FILES);
    assert.deepEqual(scan, content.expected);
    assert.deepEqual(scan.adviceMatches, []);
    const refusals = fixtures
      .filter((fixture) => fixture.kind === "refused")
      .flatMap(
        (fixture) => (fixture.expected as { outcomes: { error: string | null }[] }).outcomes,
      );
    for (const outcome of refusals)
      assert.doesNotMatch(outcome.error ?? "", new RegExp(ADVICE_PATTERN, "i"));
  });
});
