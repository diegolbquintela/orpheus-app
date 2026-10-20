import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { backfillPfFx } from "./fx-backfill.server.ts";
import { redact, runBackfillCli, VERIFY_SQL, verifyPfFx, type CliDeps, type QueryFn } from "./fx-backfill-cli.server.ts";

// #170 follow-up (2026-10-20): the backfill CLI with an injected query function (the script wires
// @neondatabase/serverless over HTTPS). PGlite + the recorded Valet fixture; no network, no real database.
const pg = new PGlite();
const FIXTURE = readFileSync(new URL("./fixtures/boc-valet-2020-01.json", import.meta.url), "utf8");
const TODAY = "2020-02-07";
const URL_VALUE = "postgres://user:not-a-real-secret@example.invalid/db";
type Call = { text: string; params?: unknown[] };
const recorder = (calls: Call[], real = true): QueryFn => async <T,>(text: string, params?: unknown[]) => {
  calls.push({ text, params });
  return real ? ((await pg.query<T>(text, params)).rows as T[]) : ([] as T[]);
};
const deps = (calls: Call[], over: Partial<CliDeps> = {}) => {
  const out: string[] = [];
  const err: string[] = [];
  let connects = 0;
  const d: CliDeps = {
    env: { DATABASE_URL_UNPOOLED: URL_VALUE },
    today: TODAY,
    get: async () => FIXTURE,
    resolve: (env) => (env.DATABASE_URL_UNPOOLED ? { name: "DATABASE_URL_UNPOOLED", url: env.DATABASE_URL_UNPOOLED } : null),
    connect: () => (connects++, recorder(calls)),
    log: (s) => out.push(s),
    error: (s) => err.push(s),
    ...over,
  };
  return { d, out, err, connects: () => connects };
};

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  await pg.exec(readFileSync(new URL("../../../migrations/0002_dashboard.sql", import.meta.url), "utf8"));
});
beforeEach(async () => {
  await pg.exec("DELETE FROM fx_rates");
});

describe("#170 backfill CLI (HTTPS driver injected)", () => {
  it("--confirm sends exactly the SQL and parameters backfillPfFx sends (same rows, same ON CONFLICT DO NOTHING)", async () => {
    const direct: Call[] = [];
    await backfillPfFx({ query: recorder(direct, false) }, async () => FIXTURE, { today: TODAY });
    const viaCli: Call[] = [];
    const { d } = deps(viaCli, { connect: () => recorder(viaCli, false) });
    assert.equal(await runBackfillCli(["--confirm"], d), 0);
    assert.deepEqual(viaCli, direct);
    assert.equal(viaCli.length, 1);
    assert.match(viaCli[0].text, /^INSERT INTO fx_rates \(quote, rate_date, cad_per_unit, source\)/);
    assert.match(viaCli[0].text, /ON CONFLICT \(quote, rate_date\) DO NOTHING RETURNING quote$/);
    assert.equal((viaCli[0].params as string[][])[0].length, 27 * 9);
  });
  it("--confirm inserts 243 rows on PGlite, a second run inserts 0, and the URL is never printed", async () => {
    const calls: Call[] = [];
    const a = deps(calls);
    assert.equal(await runBackfillCli(["--confirm"], a.d), 0);
    assert.match(a.out.at(-1)!, /fetched 243, inserted 243\.$/);
    const b = deps(calls);
    assert.equal(await runBackfillCli(["--confirm"], b.d), 0);
    assert.match(b.out.at(-1)!, /fetched 243, inserted 0\.$/);
    for (const s of [...a.out, ...a.err, ...b.out, ...b.err]) assert.ok(!s.includes("not-a-real-secret"), s);
    assert.ok(a.out.some((s) => s.includes("DATABASE_URL_UNPOOLED")));
  });
  it("--verify runs only SELECTs (the runbook query) and prints the per-currency table", async () => {
    await backfillPfFx({ query: recorder([]) }, async () => FIXTURE, { today: TODAY, quotes: ["USD", "GBP"] });
    const calls: Call[] = [];
    const { d, out } = deps(calls);
    assert.equal(await runBackfillCli(["--verify"], d), 0);
    assert.ok(calls.length > 0);
    for (const c of calls) {
      assert.match(c.text, /^\s*SELECT\b/i);
      assert.doesNotMatch(c.text, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i);
    }
    assert.deepEqual(calls, [{ text: VERIFY_SQL, params: [["USD", "EUR", "GBP", "BRL", "MXN", "CHF", "JPY", "AUD", "CNY"]] }]);
    const table = out.at(-1)!;
    assert.match(table, /^quote \| oldest {5}\| newest {5}\| count$/m);
    assert.match(table, /^GBP {3}\| 2020-01-02 \| 2020-02-07 \| 27$/m);
    assert.match(table, /^USD {3}\| 2020-01-02 \| 2020-02-07 \| 27$/m);
    assert.match(table, /^EUR {3}\| — {10}\| — {10}\| 0$/m);
    assert.equal(table.split("\n").length, 2 + 9);
  });
  it("verifyPfFx: no rows → every quote with count 0", async () => {
    const rows = await verifyPfFx(recorder([]));
    assert.equal(rows.length, 9);
    assert.ok(rows.every((r) => r.n === 0 && r.oldest === null));
  });
  it("without --confirm (or --verify) it refuses with exit 2 and never connects; --dry-run never connects", async () => {
    for (const argv of [[], ["--yes"], ["--write"]]) {
      const calls: Call[] = [];
      const r = deps(calls);
      assert.equal(await runBackfillCli(argv, r.d), 2, argv.join(" "));
      assert.equal(r.connects(), 0);
      assert.match(r.err[0], /refusing to write without --confirm/);
    }
    const calls: Call[] = [];
    const r = deps(calls);
    assert.equal(await runBackfillCli(["--dry-run"], r.d), 0);
    assert.equal(r.connects(), 0);
    assert.equal(calls.length, 0);
    assert.match(r.out[0], /dry run: 243 BoC rows .* nothing written\.$/);
    assert.deepEqual((await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM fx_rates")).rows[0], { n: 0 });
  });
  it("--confirm or --verify with no database URL: exit 2, never connects", async () => {
    for (const argv of [["--confirm"], ["--verify"]]) {
      const r = deps([], { env: {} });
      assert.equal(await runBackfillCli(argv, r.d), 2);
      assert.equal(r.connects(), 0);
      assert.match(r.err[0], /no database URL set/);
    }
  });
});

// #170 QA J1 (2026-10-20): a driver error must never print the connection string.
describe("#170 QA J1: database errors are redacted, exit 1", () => {
  const SECRET = "not-a-real-secret";
  const noLeak = (out: string[], err: string[]) => {
    for (const s of [...out, ...err]) {
      assert.ok(!s.includes(SECRET), s);
      assert.ok(!s.includes(URL_VALUE), s);
    }
  };
  it("(a) the client factory throws with the URL in its message → exit 1, redacted, no leak", async () => {
    for (const argv of [["--confirm"], ["--verify"]]) {
      const r = deps([], { connect: () => { throw new Error(`Database connection string provided to \`neon()\` is not a valid URL (connection string: ${URL_VALUE})`); } });
      assert.equal(await runBackfillCli(argv, r.d), 1);
      noLeak(r.out, r.err);
      assert.match(r.err.at(-1)!, /^\[pf-fx-backfill\] database error via DATABASE_URL_UNPOOLED: .*\[redacted\]/);
    }
  });
  it("(b) a query throws with the URL in its message → exit 1, redacted, no leak", async () => {
    for (const argv of [["--confirm"], ["--verify"]]) {
      const r = deps([], { connect: () => async () => { throw new Error(`fetch failed for ${URL_VALUE}; retry ${URL_VALUE.replace("postgres://", "postgresql://")}`); } });
      assert.equal(await runBackfillCli(argv, r.d), 1);
      noLeak(r.out, r.err);
      assert.match(r.err.at(-1)!, /database error via DATABASE_URL_UNPOOLED: fetch failed for \[redacted\]; retry \[redacted\]$/);
    }
  });
  it("(c) a malformed URL → redacted pre-check error, exit 1, the factory is never called", async () => {
    const bad = `postgres//user:${SECRET}@host`;
    const r = deps([], { env: { DATABASE_URL_UNPOOLED: bad } });
    assert.equal(await runBackfillCli(["--confirm"], r.d), 1);
    assert.equal(r.connects(), 0);
    for (const s of [...r.out, ...r.err]) assert.ok(!s.includes(SECRET) && !s.includes(bad), s);
    assert.equal(r.err.at(-1), "[pf-fx-backfill] database error via DATABASE_URL_UNPOOLED: DATABASE_URL_UNPOOLED is not a valid URL.");
  });
  it("redact: the value, a 'connection string:' tail and any postgres(ql):// substring", () => {
    assert.equal(redact(`x ${URL_VALUE} y`, URL_VALUE), "x [redacted] y");
    assert.equal(redact("bad (connection string: abc:def@h)", "zzz"), "bad (connection string: [redacted]");
    assert.equal(redact("see postgresql://a:b@c/d now", ""), "see [redacted] now");
  });
});
