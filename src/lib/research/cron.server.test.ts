import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleYearlyReturnsCron } from "./cron.server.ts";

const SECRET = "cron-test-secret";
const auth = { authorization: `Bearer ${SECRET}` };

function chart(pairs: Array<[string, number]>) {
  return {
    chart: {
      result: [
        {
          timestamp: pairs.map(([day]) => Date.parse(`${day}T12:00:00Z`) / 1000),
          indicators: { adjclose: [{ adjclose: pairs.map(([, value]) => value) }] },
        },
      ],
    },
  };
}

describe("yearly-returns cron (#333)", () => {
  it("405 for a method other than GET, before auth", async () => {
    let pulls = 0;
    const res = await handleYearlyReturnsCron(new Request("http://local/api/cron/yearly-returns", { method: "POST" }), {
      env: { CRON_SECRET: SECRET },
      pull: async () => {
        pulls += 1;
        return {};
      },
    });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET");
    assert.deepEqual(await res.json(), { error: "Method not allowed." });
    assert.equal(pulls, 0);
  });

  it("401 when the bearer does not match CRON_SECRET", async () => {
    let pulls = 0;
    const res = await handleYearlyReturnsCron(
      new Request("http://local/api/cron/yearly-returns", { headers: { authorization: "Bearer wrong" } }),
      {
        env: { CRON_SECRET: SECRET },
        pull: async () => {
          pulls += 1;
          return {};
        },
      },
    );
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Unauthorized." });
    assert.equal(pulls, 0);
  });

  it("401 when CRON_SECRET is unset", async () => {
    const res = await handleYearlyReturnsCron(new Request("http://local/api/cron/yearly-returns", { headers: auth }), {
      env: {},
    });
    assert.equal(res.status, 401);
  });

  it("503 when there is no database, and does not call the feed", async () => {
    let pulls = 0;
    const res = await handleYearlyReturnsCron(new Request("http://local/api/cron/yearly-returns", { headers: auth }), {
      env: { CRON_SECRET: SECRET },
      getDb: async () => null,
      pull: async () => {
        pulls += 1;
        return {};
      },
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "Storage not configured." });
    assert.equal(pulls, 0);
  });

  it("upserts the current year and finalizes the previous year; the body is counts only", async () => {
    const writes: unknown[][] = [];
    const res = await handleYearlyReturnsCron(new Request("http://local/api/cron/yearly-returns", { headers: auth }), {
      env: { CRON_SECRET: SECRET },
      now: () => new Date("2026-11-13T16:00:00Z"),
      getDb: async () => ({
        query: async (_sql: string, params?: unknown[]) => {
          writes.push(params ?? []);
          return [];
        },
      }),
      pull: async () =>
        chart([
          ["2024-12-31", 100],
          ["2025-12-31", 110],
          ["2026-11-13", 121],
        ]),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["errors", "finalized", "upserted"]);
    assert.equal(body.upserted, 5);
    assert.equal(body.finalized, 5);
    assert.equal(body.errors, 0);
    assert.equal(JSON.stringify(body).includes("SPY"), false);
    const spy = writes.filter((params) => params[0] === "SPY");
    const prior = spy.find((params) => params[1] === 2025);
    const current = spy.find((params) => params[1] === 2026);
    assert.equal(prior?.[3], false);
    assert.equal(current?.[3], true);
    assert.equal(current?.[2], 10);
  });
});
