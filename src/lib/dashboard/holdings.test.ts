// Offline tests for T04 (#12): holdings CRUD API, validation, duplicates, DASH-08 refusal messages
// and cross-user isolation (DASH-06). PGLite (Postgres in WASM) and the real listing check running through
// the Yahoo `DailyCloseProvider` (T07) with recorded chart-metadata payloads: no network.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import { listingError } from "../dca/venues.ts";
import { trimDecimal } from "./format.ts";
import {
  handleHoldingRequest,
  handleHoldingsRequest,
  MAX_HOLDINGS,
  normaliseSymbol,
  parseEditCost,
  parseOptionalCost,
  parseQuantity,
  type HoldingsDeps,
} from "./holdings.server.ts";
import { ProviderError, type DailyCloseProvider } from "./close-provider.ts";
import { listingLookupFrom, type ListingLookup } from "./listing.server.ts";
import { createYahooCloseProvider } from "./yahoo-closes.server.ts";
import type { Queryable } from "./store.server.ts";

const ORIGIN = "http://localhost:3000";
let pg: PGlite;
let db: Queryable;

// Recorded shapes of Yahoo chart metadata (exchange codes as the feed reports them).
const META: Record<string, { exchangeName: string; fullExchangeName: string; currency: string }> = {
  KO: { exchangeName: "NYQ", fullExchangeName: "NYSE", currency: "USD" },
  "RY.TO": { exchangeName: "TOR", fullExchangeName: "Toronto", currency: "CAD" },
  "ASML.AS": { exchangeName: "AMS", fullExchangeName: "Amsterdam", currency: "EUR" },
  "VOD.L": { exchangeName: "LSE", fullExchangeName: "LSE", currency: "GBp" },
  "TCS.BO": { exchangeName: "BSE", fullExchangeName: "BSE", currency: "INR" },
  "0700.HK": { exchangeName: "HKG", fullExchangeName: "HKSE", currency: "HKD" },
};
const payloadFor = (symbol: string) =>
  META[symbol]
    ? { chart: { result: [{ meta: META[symbol] }], error: null } }
    : { chart: { result: null, error: { description: "No data found, symbol may be delisted" } } };
const lookups: string[] = [];
const queries: string[] = [];
const backfills: string[] = [];
let feedDown = false;
/** A fresh Yahoo provider per check, as in production; its chart request is answered from META. */
const yahooWithRecordedMeta = () =>
  createYahooCloseProvider({
    fetchChart: async (symbol, query) => {
      lookups.push(symbol);
      queries.push(query);
      if (feedDown) throw new Error("fetch failed");
      return payloadFor(symbol) as never;
    },
  });
const fakeLookup: ListingLookup = (symbol) => listingLookupFrom(yahooWithRecordedMeta())(symbol);

before(async () => {
  pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  await pg.waitReady;
  await pg.exec("CREATE TABLE _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const { name } of pendingMigrations(readdirSync("migrations"), [])) {
    await pg.exec(readFileSync(`migrations/${name}`, "utf8"));
    await pg.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
  }
  db = { query: async (text, params) => (await pg.query(text, params)).rows as never[] };
  // holdings.user_id references "user"(id) since 0004.
  for (const u of Object.values(USERS))
    await pg.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $1, $2, false)`, [u.id, u.email]);
});
after(async () => {
  await pg.close();
});

// Sessions are faked by a header here; src/lib/auth/auth.test.ts covers real Better Auth sessions.
const USERS: Record<string, { id: string; email: string }> = {
  alice: { id: "user-alice", email: "alice@example.com" },
  bob: { id: "user-bob", email: "bob@example.com" },
};
const deps = (env: Record<string, string | undefined> = { DASHBOARD_ENABLED: "true" }): HoldingsDeps => ({
  env,
  getUser: async (headers) => USERS[headers.get("x-test-session") ?? ""] ?? null,
  getDb: async () => db,
  lookupListing: fakeLookup,
  scheduleBackfill: (_db, symbol) => backfills.push(symbol),
});
const req = (path: string, opts: { method?: string; as?: string; body?: unknown } = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.as ? { "x-test-session": opts.as } : {}),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
const list = (as = "alice") => handleHoldingsRequest(req("/api/dashboard/holdings", { as }), deps());
const add = (body: unknown, as = "alice") =>
  handleHoldingsRequest(req("/api/dashboard/holdings", { method: "POST", as, body }), deps());
const item = (id: number | string, opts: { method?: string; as?: string; body?: unknown } = {}) =>
  handleHoldingRequest(req(`/api/dashboard/holdings/${id}`, { as: "alice", ...opts }), String(id), deps());
const symbols = async (as = "alice") =>
  ((await (await list(as)).json()) as { holdings: { symbol: string }[] }).holdings.map((h) => h.symbol);

describe("validation helpers", () => {
  it("normalises tickers like the calculator", () => {
    assert.equal(normaliseSymbol("  ry.to "), "RY.TO");
    assert.deepEqual(normaliseSymbol(""), { field: "symbol", error: "Ticker is required." });
    assert.deepEqual(normaliseSymbol("KO; DROP"), { field: "symbol", error: "Ticker looks wrong." });
    assert.deepEqual(normaliseSymbol(42), { field: "symbol", error: "Ticker is required." });
  });

  it("shares > 0, average cost >= 0, at most 6 decimals", () => {
    assert.equal(parseQuantity("10.5", "shares"), "10.5");
    assert.equal(parseQuantity(3, "shares"), "3");
    assert.equal(parseQuantity("0", "avgCost"), "0");
    assert.deepEqual(parseQuantity("0", "shares"), { field: "shares", error: "Shares must be greater than 0." });
    assert.deepEqual(parseQuantity("-1", "shares"), { field: "shares", error: "Shares must be greater than 0." });
    assert.deepEqual(parseQuantity("-0.01", "avgCost"), { field: "avgCost", error: "Average cost must be 0 or more." });
    assert.deepEqual(parseQuantity("1.1234567", "shares"), {
      field: "shares",
      error: "Shares must be a number with at most 6 decimals.",
    });
    assert.deepEqual(parseQuantity("1e3", "avgCost"), {
      field: "avgCost",
      error: "Average cost must be a number with at most 6 decimals.",
    });
    assert.deepEqual(parseQuantity("", "avgCost"), { field: "avgCost", error: "Average cost is required." });
    assert.equal(trimDecimal("10.500000"), "10.5");
    assert.equal(trimDecimal("3.000000"), "3");
  });

  it("#56: average cost is optional; missing, null or blank is no cost (null), never 0", () => {
    assert.equal(parseOptionalCost(undefined), null);
    assert.equal(parseOptionalCost(null), null);
    assert.equal(parseOptionalCost(""), null);
    assert.equal(parseOptionalCost("   "), null);
    assert.equal(parseOptionalCost("0"), "0");
    assert.equal(parseOptionalCost(0), "0");
    assert.equal(parseOptionalCost(" 52.25 "), "52.25");
    assert.deepEqual(parseOptionalCost("-1"), { field: "avgCost", error: "Average cost must be 0 or more." });
    assert.deepEqual(parseOptionalCost("1.1234567"), {
      field: "avgCost",
      error: "Average cost must be a number with at most 6 decimals.",
    });
    assert.deepEqual(parseOptionalCost("abc"), {
      field: "avgCost",
      error: "Average cost must be a number with at most 6 decimals.",
    });
  });
});

describe("DASH-08: listing check uses the calculator's exact messages", () => {
  it("allows US, CA and EU listings and refuses others with listingError()'s text", async () => {
    assert.deepEqual(await fakeLookup("KO"), { ok: true, exchange: "NYSE", currency: "USD", name: null });
    assert.equal((await fakeLookup("RY.TO")).ok, true);
    assert.equal((await fakeLookup("ASML.AS")).ok, true);
    const lse = await fakeLookup("VOD.L");
    assert.deepEqual(lse, { ok: false, status: 400, error: "VOD.L lists on LSE. US, EU, and CA listings only." });
    assert.equal(lse.ok ? null : lse.error, listingError("VOD.L", "LSE", "LSE"));
    assert.deepEqual(await fakeLookup("TCS.BO"), {
      ok: false,
      status: 400,
      error: "TCS.BO lists on BSE. BSE and other non US/EU/CA venues are not supported.",
    });
    assert.deepEqual(await fakeLookup("NOPE"), {
      ok: false,
      status: 404,
      error: "NOPE: No data found, symbol may be delisted",
    });
  });

  it("the check goes through DailyCloseProvider.getListing: one metadata request, fails closed (T07)", async () => {
    lookups.length = 0;
    queries.length = 0;
    const p = yahooWithRecordedMeta();
    assert.equal(await p.getListing!("KO"), null, "without { fetch: true } only a cached response is used");
    assert.equal(lookups.length, 0);
    assert.equal((await p.getListing!("KO", { fetch: true }))?.currency, "USD");
    assert.equal((await p.getListing!("KO", { fetch: true }))?.region, "US");
    assert.deepEqual(queries, ["interval=1d&range=5d"], "one request, then the cached response");
    await assert.rejects(p.getListing!("VOD.L", { fetch: true }), (e: unknown) => e instanceof ProviderError && e.kind === "refused");
    feedDown = true;
    try {
      assert.deepEqual(await fakeLookup("KO"), {
        ok: false,
        status: 503,
        error: "Couldn't check KO's listing right now. Try again in a minute.",
      });
    } finally {
      feedDown = false;
    }
    const noListing: DailyCloseProvider = {
      id: "x",
      supports: () => true,
      budget: { perMinute: 1, perDay: 1 },
      getCloses: async () => [],
      getCorporateActions: async () => [],
    };
    assert.equal((await listingLookupFrom(noListing)("KO")).ok, false, "a provider that can't tell fails closed");
    const src = readFileSync("src/lib/dashboard/listing.server.ts", "utf8") + readFileSync("src/lib/dashboard/holdings.server.ts", "utf8");
    assert.doesNotMatch(src, /import \{[^}]*\bpull\b[^}]*\} from "\.\.\/dca\/yahoo\.server/, "no direct feed call outside the provider");
  });

  it("POST refuses a non US/EU/CA ticker with that message and stores nothing", async () => {
    for (const [symbol, message] of [
      ["vod.l", "VOD.L lists on LSE. US, EU, and CA listings only."],
      ["TCS.BO", "TCS.BO lists on BSE. BSE and other non US/EU/CA venues are not supported."],
      ["0700.HK", "0700.HK lists on HKSE. US, EU, and CA listings only."],
    ]) {
      const res = await add({ symbol, shares: "1", avgCost: "1" });
      assert.equal(res.status, 400, symbol);
      assert.deepEqual(await res.json(), { error: message, field: "symbol" });
    }
    assert.deepEqual(await symbols(), []);
  });
});

describe("DASH-07: add, edit, delete", () => {
  let koId = 0;

  it("adds holdings (201) and lists them per user, sorted by ticker", async () => {
    const res = await add({ symbol: " ko ", shares: "10.5", avgCost: "52.25" });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { holding: { id: number; symbol: string; shares: string; avgCost: string }; listing: unknown };
    assert.equal(body.holding.symbol, "KO");
    assert.equal(trimDecimal(body.holding.shares), "10.5");
    assert.equal(trimDecimal(body.holding.avgCost), "52.25");
    assert.deepEqual(body.listing, { exchange: "NYSE", currency: "USD" });
    // T05: the save only records the symbol as pending and hands the fetch to a background job.
    assert.equal((body as unknown as { price: string }).price, "pending");
    assert.ok(backfills.includes("KO"));
    assert.deepEqual((await pg.query("SELECT symbol, last_session_date FROM price_coverage WHERE symbol = 'KO'")).rows, [
      { symbol: "KO", last_session_date: null },
    ]);
    koId = body.holding.id;
    assert.equal((await add({ symbol: "RY.TO", shares: 3, avgCost: 0 })).status, 201, "average cost 0 is allowed");
    assert.deepEqual(await symbols(), ["KO", "RY.TO"]);
    assert.deepEqual(await symbols("bob"), []);
  });

  it("refuses a duplicate ticker for the same user (409, clear message, no feed call)", async () => {
    const before = lookups.length;
    const res = await add({ symbol: "Ko", shares: "1", avgCost: "1" });
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: "KO is already in your holdings.", field: "symbol" });
    assert.equal(lookups.length, before);
    // Another user may hold the same ticker.
    assert.equal((await add({ symbol: "KO", shares: "2", avgCost: "40" }, "bob")).status, 201);
  });

  it("validates input (400 with the field) before calling the feed", async () => {
    const before = lookups.length;
    const cases: Array<[unknown, string, string]> = [
      [{ symbol: "ASML.AS", shares: "0", avgCost: "1" }, "shares", "Shares must be greater than 0."],
      [{ symbol: "ASML.AS", shares: "1", avgCost: "-5" }, "avgCost", "Average cost must be 0 or more."],
      [{ symbol: "", shares: "1", avgCost: "1" }, "symbol", "Ticker is required."],
      [{ symbol: "$$$", shares: "1", avgCost: "1" }, "symbol", "Ticker looks wrong."],
    ];
    for (const [body, field, error] of cases) {
      const res = await add(body);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error, field });
    }
    assert.equal((await add("not json")).status, 400);
    assert.equal((await add([1, 2])).status, 400);
    assert.equal(lookups.length, before);
    assert.equal((await add({ symbol: "NOPE", shares: "1", avgCost: "1" })).status, 404);
  });

  it("edits shares and average cost; the ticker can't be changed", async () => {
    const res = await item(koId, { method: "PUT", body: { shares: "12", avgCost: "50.1" } });
    assert.equal(res.status, 200);
    const { holding } = (await res.json()) as { holding: { shares: string; avgCost: string } };
    assert.deepEqual([trimDecimal(holding.shares), trimDecimal(holding.avgCost)], ["12", "50.1"]);
    const got = (await (await item(koId)).json()) as { holding: { shares: string } };
    assert.equal(trimDecimal(got.holding.shares), "12", "persists");
    const bad = await item(koId, { method: "PUT", body: { shares: "0", avgCost: "1" } });
    assert.equal(bad.status, 400);
    const rename = await item(koId, { method: "PUT", body: { symbol: "PEP", shares: "1", avgCost: "1" } });
    assert.equal(rename.status, 400);
    assert.equal(((await rename.json()) as { field: string }).field, "symbol");
  });

  it("#56: a blank cost saves as no cost (201, avgCost null); Edit fills it and clears it again", async () => {
    // Missing, null and "" all save as no cost (one at a time: ASML.AS is added, checked and deleted).
    let asmlId = 0;
    for (const body of [{ symbol: "ASML.AS", shares: "2" }, { symbol: "ASML.AS", shares: "2", avgCost: null }, { symbol: "ASML.AS", shares: "2", avgCost: "" }]) {
      const res = await add(body);
      assert.equal(res.status, 201, JSON.stringify(body));
      const { holding } = (await res.json()) as { holding: { id: number; avgCost: string | null } };
      assert.equal(holding.avgCost, null);
      const stored = await pg.query<{ avg_cost: string | null }>("SELECT avg_cost FROM holdings WHERE id = $1", [holding.id]);
      assert.equal(stored.rows[0].avg_cost, null, "stored as NULL, not 0");
      asmlId = holding.id;
      if (body !== undefined && "avgCost" in body && body.avgCost === "") break;
      assert.equal((await item(holding.id, { method: "DELETE" })).status, 200);
    }
    const fill = await item(asmlId, { method: "PUT", body: { shares: "2", avgCost: "600" } });
    assert.equal(trimDecimal(((await fill.json()) as { holding: { avgCost: string } }).holding.avgCost), "600");
    const clear = await item(asmlId, { method: "PUT", body: { shares: "2", avgCost: null } });
    assert.equal(clear.status, 200);
    assert.equal(((await clear.json()) as { holding: { avgCost: string | null } }).holding.avgCost, null);
    const neg = await item(asmlId, { method: "PUT", body: { shares: "2", avgCost: "-1" } });
    assert.deepEqual(await neg.json(), { error: "Average cost must be 0 or more.", field: "avgCost" });
    assert.equal((await item(asmlId, { method: "DELETE" })).status, 200);
  });

  it("#57 (EL): PUT with avgCost omitted keeps the stored cost; explicit null clears it; a number sets it", async () => {
    const res = await add({ symbol: "ASML.AS", shares: "2", avgCost: "600" });
    const id = ((await res.json()) as { holding: { id: number } }).holding.id;
    const cost = async () => (await pg.query<{ avg_cost: string | null }>("SELECT avg_cost::text AS avg_cost FROM holdings WHERE id = $1", [id])).rows[0].avg_cost;
    const put = async (body: Record<string, unknown>) => {
      const r = await item(id, { method: "PUT", body });
      return { status: r.status, body: (await r.json()) as { holding?: { shares: string; avgCost: string | null }; error?: string; field?: string } };
    };
    // Omitted: shares change, cost unchanged.
    const kept = await put({ shares: "3" });
    assert.equal(kept.status, 200);
    assert.equal(trimDecimal(kept.body.holding!.shares), "3");
    assert.equal(trimDecimal(kept.body.holding!.avgCost!), "600");
    assert.equal(await cost(), "600.000000");
    // A number sets it.
    const set = await put({ shares: "3", avgCost: "612.5" });
    assert.equal(trimDecimal(set.body.holding!.avgCost!), "612.5");
    // Explicit null clears it; omitted then keeps the blank.
    const cleared = await put({ shares: "3", avgCost: null });
    assert.equal(cleared.body.holding!.avgCost, null);
    assert.equal(await cost(), null);
    assert.equal((await put({ shares: "4" })).body.holding!.avgCost, null);
    // A blank string is no longer a clear on PUT (only null is); the cost is left as it was.
    await put({ shares: "4", avgCost: 5 });
    const blank = await put({ shares: "4", avgCost: "" });
    assert.equal(blank.status, 400);
    assert.deepEqual(blank.body, { error: "Average cost must be a number, or null to clear it.", field: "avgCost" });
    assert.equal(await cost(), "5.000000");
    assert.equal((await put({ shares: "4", avgCost: "-1" })).status, 400);
    assert.equal((await item(id, { method: "DELETE" })).status, 200);
    assert.equal(parseEditCost(null), null);
    assert.equal(parseEditCost("0"), "0");
    assert.deepEqual(parseEditCost("  "), { field: "avgCost", error: "Average cost must be a number, or null to clear it." });
  });

  it("deletes a holding; deleting again is 404", async () => {
    const ry = ((await (await list()).json()) as { holdings: { id: number; symbol: string }[] }).holdings.find(
      (h) => h.symbol === "RY.TO",
    )!;
    const res = await item(ry.id, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { deleted: true });
    assert.equal((await item(ry.id, { method: "DELETE" })).status, 404);
    assert.deepEqual(await symbols(), ["KO"]);
    assert.equal((await item("abc")).status, 404);
  });

  it(`caps a user at ${MAX_HOLDINGS} holdings`, async () => {
    await pg.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('user-cap', 'cap', 'cap@example.com', false)`);
    for (let i = 0; i < MAX_HOLDINGS; i += 1)
      await pg.query("INSERT INTO holdings (user_id, symbol, shares, avg_cost) VALUES ('user-cap', $1, 1, 1)", [`C${i}`]);
    USERS.cap = { id: "user-cap", email: "cap@example.com" };
    const res = await add({ symbol: "KO", shares: "1", avgCost: "1" }, "cap");
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: `You can track up to ${MAX_HOLDINGS} holdings.` });
    await pg.query("DELETE FROM holdings WHERE user_id = 'user-cap'");
  });
});

describe("gate: 404 flag off, 405, 401", () => {
  it("answers in that order, as JSON", async () => {
    for (const env of [{}, { DASHBOARD_ENABLED: "TRUE" }]) {
      assert.equal((await handleHoldingsRequest(req("/api/dashboard/holdings", { as: "alice" }), deps(env))).status, 404);
      assert.equal(
        (await handleHoldingRequest(req("/api/dashboard/holdings/1", { method: "DELETE", as: "alice" }), "1", deps(env))).status,
        404,
      );
    }
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const r = await handleHoldingsRequest(req("/api/dashboard/holdings", { method, as: "alice" }), deps());
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.get("allow"), "GET, HEAD, POST");
    }
    for (const method of ["POST", "PATCH"]) {
      const r = await handleHoldingRequest(req("/api/dashboard/holdings/1", { method, as: "alice" }), "1", deps());
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.get("allow"), "GET, HEAD, PUT, DELETE");
    }
    for (const [method, body] of [["GET", undefined], ["POST", { symbol: "KO", shares: 1, avgCost: 1 }]] as const) {
      const r = await handleHoldingsRequest(req("/api/dashboard/holdings", { method, body }), deps());
      assert.equal(r.status, 401);
      assert.deepEqual(await r.json(), { error: "Unauthorized." });
    }
    for (const method of ["GET", "PUT", "DELETE"]) {
      const r = await handleHoldingRequest(req("/api/dashboard/holdings/1", { method, body: method === "PUT" ? {} : undefined }), "1", deps());
      assert.equal(r.status, 401, method);
    }
  });

  it("503 when storage isn't configured", async () => {
    const noDb = { ...deps(), getDb: async () => null };
    assert.equal((await handleHoldingsRequest(req("/api/dashboard/holdings", { as: "alice" }), noDb)).status, 503);
  });
});

describe("DASH-06: one user can't read or change another's holdings", () => {
  it("bob's session with alice's holding id: GET/PUT/DELETE are 404 and change nothing", async () => {
    const aliceKo = ((await (await list()).json()) as { holdings: { id: number; shares: string }[] }).holdings[0];
    for (const [method, body] of [["GET", undefined], ["PUT", { shares: "999", avgCost: "1" }], ["DELETE", undefined]] as const) {
      const r = await item(aliceKo.id, { method, as: "bob", body });
      assert.equal(r.status, 404, method);
      assert.deepEqual(await r.json(), { error: "Holding not found." });
    }
    const after = ((await (await list()).json()) as { holdings: { id: number; shares: string }[] }).holdings[0];
    assert.deepEqual(after, aliceKo);
  });

  it("naming alice's user id is 403; bob's list stays his own", async () => {
    assert.equal(
      (await handleHoldingsRequest(req("/api/dashboard/holdings?userId=user-alice", { as: "bob" }), deps())).status,
      403,
    );
    const post = await add({ userId: "user-alice", symbol: "ASML.AS", shares: "1", avgCost: "1" }, "bob");
    assert.equal(post.status, 403);
    assert.deepEqual(await symbols("alice"), ["KO"]);
    assert.deepEqual(await symbols("bob"), ["KO"]);
    const bobKo = ((await (await list("bob")).json()) as { holdings: { id: number }[] }).holdings[0];
    const bobGet = await handleHoldingRequest(
      req(`/api/dashboard/holdings/${bobKo.id}?userId=user-alice`, { as: "bob" }),
      String(bobKo.id),
      deps(),
    );
    assert.equal(bobGet.status, 403);
  });
});
