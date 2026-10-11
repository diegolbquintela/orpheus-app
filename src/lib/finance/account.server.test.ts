import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest } from "./account.server.ts";
import { STORAGE_KEY } from "./expenses.ts";

// #102 (spec 16.5, PF-33 / PF-36): /api/personal-finance on PGLite with a fake session lookup.
const pg = new PGlite();
const db = {
  query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows,
};
const env = { DASHBOARD_ENABLED: "true" };
const as = (id: string | null) => ({
  env,
  getUser: async () => (id ? { id, email: `${id}@example.com` } : null),
  getDb: async () => db,
});
const req = (method: string, body?: unknown, query = "") =>
  new Request(`http://localhost/api/personal-finance${query}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY)');
  await pg.exec(
    readFileSync(new URL("../../../migrations/0010_personal_finance.sql", import.meta.url), "utf8"),
  );
  await pg.exec("INSERT INTO \"user\" (id) VALUES ('alice'), ('bob')");
});

describe("/api/personal-finance (#102)", () => {
  it("flag off 404; bad method 405; signed out 401", async () => {
    const off = await handlePersonalFinanceRequest(req("GET"), { ...as("alice"), env: {} });
    assert.equal(off.status, 404);
    assert.equal((await handlePersonalFinanceRequest(req("POST", {}), as("alice"))).status, 405);
    for (const m of ["GET", "PUT", "DELETE"])
      assert.equal(
        (
          await handlePersonalFinanceRequest(
            req(m, m === "PUT" ? { data: {} } : undefined),
            as(null),
          )
        ).status,
        401,
        m,
      );
  });
  it("GET null, PUT saves, GET returns it (another device = the same account); per account", async () => {
    let r = await handlePersonalFinanceRequest(req("GET"), as("alice"));
    assert.deepEqual(await r.json(), { data: null });
    assert.equal(r.headers.get("cache-control"), "no-store");
    const data = { [STORAGE_KEY]: '{"fixed":[],"variable":[],"accounts":[]}' };
    r = await handlePersonalFinanceRequest(req("PUT", { data }), as("alice"));
    assert.equal(r.status, 200);
    r = await handlePersonalFinanceRequest(req("GET"), as("alice"));
    assert.deepEqual(await r.json(), { data });
    r = await handlePersonalFinanceRequest(req("GET"), as("bob"));
    assert.deepEqual(await r.json(), { data: null });
  });
  it("403 naming someone else; 400 / 413 bad bodies", async () => {
    assert.equal(
      (await handlePersonalFinanceRequest(req("GET", undefined, "?userId=bob"), as("alice")))
        .status,
      403,
    );
    assert.equal(
      (await handlePersonalFinanceRequest(req("PUT", { data: {}, userId: "bob" }), as("alice")))
        .status,
      403,
    );
    assert.equal(
      (await handlePersonalFinanceRequest(req("PUT", { data: { evil: "x" } }), as("alice"))).status,
      400,
    );
    assert.equal(
      (
        await handlePersonalFinanceRequest(
          req("PUT", { data: { [STORAGE_KEY]: "x".repeat(300000) } }),
          as("alice"),
        )
      ).status,
      413,
    );
  });
  it("DELETE removes only the caller's record", async () => {
    await handlePersonalFinanceRequest(req("PUT", { data: {} }), as("bob"));
    await handlePersonalFinanceRequest(req("DELETE"), as("alice"));
    assert.deepEqual(await (await handlePersonalFinanceRequest(req("GET"), as("alice"))).json(), {
      data: null,
    });
    assert.deepEqual(await (await handlePersonalFinanceRequest(req("GET"), as("bob"))).json(), {
      data: {},
    });
  });
});
