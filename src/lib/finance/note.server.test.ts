// #277 (personal-finance-spec §82, AC PFNT-03/06/08): the note through the real PUT / GET (PGlite, migrations unchanged)
// and the read-only CFO API (#245). Amended 2026-11-01 (Q-NT2, PFNT-10): the CFO feed carries NO note; its output is
// byte-identical to the same data without notes (pre-#277).
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest } from "./account.server.ts";
import { CFO_ENDPOINTS, CFO_SCHEMA, cfoWithoutNotes, handleCfoPfRequest } from "./cfo-api.server.ts";
import { NOTE_MAX, STORAGE_KEY } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { PLANS_KEY } from "./plans-key.ts";
import { loaded } from "./testing/pf-loaded-base.ts";

const pfRequest = loaded(handlePersonalFinanceRequest);
const KEY = `test-${Math.random().toString(36).slice(2)}${Date.now()}`;
const pg = new PGlite();
const writes: string[] = [];
const db = {
  query: async <T>(text: string, params?: unknown[]) => {
    if (!/^\s*SELECT/i.test(text)) writes.push(text);
    return (await pg.query<T>(text, params)).rows;
  },
};
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com", CFO_PF_API_KEY: KEY };
const NOW = new Date("2026-10-16T16:00:00Z");
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db, now: () => NOW });
const put = (data: unknown) =>
  pfRequest(new Request("http://localhost/api/personal-finance", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) }), as("alice"));
const get = async () => (await (await pfRequest(new Request("http://localhost/api/personal-finance"), as("alice"))).json()) as { data: Record<string, string> };
const cfo = (path: string, method = "GET") =>
  handleCfoPfRequest(new Request(`http://localhost${path}`, { method, headers: { authorization: `Bearer ${KEY}` } }), { env, getDb: async () => db, now: () => NOW });
const L = (id: string, amount: string, note?: unknown) => ({
  id, name: id, amount, per: "month", equity: "", account: "", currency: "", rate: "", category: "", ...(note === undefined ? {} : { note }),
});
const record = (note: unknown, monthNote: unknown = note) => ({
  [STORAGE_KEY]: JSON.stringify({ fixed: [L("rent", "1000", note)], variable: [L("food", "200")], accounts: [], categories: [] }),
  [MONTHS_KEY]: JSON.stringify({ "2026-09": { fixed: [L("rent", "1000", monthNote)], variable: [L("food", "200")], people: [] } }),
});
const withPlan = (note: unknown) => ({
  ...record(note),
  [PLANS_KEY]: JSON.stringify({ "2026-12": { lines: { fixed: [L("rent", "1000", note)], variable: [L("food", "200")], people: [] }, capturedAt: "2026-10-01T00:00:00.000Z" } }),
});

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  await pg.exec(/CREATE TABLE IF NOT EXISTS fx_rates \([\s\S]*?\n\);/.exec(readFileSync(new URL("../../../migrations/0002_dashboard.sql", import.meta.url), "utf8"))![0]);
  await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', ["alice", "alice@example.com"]);
});

describe("#277 PFNT the note through PUT / GET and the CFO API", () => {
  it("PFNT-06: a saved note comes back on reload, byte for byte inside the stored text", async () => {
    const r = await put(record("Lease ends June", "Sept note"));
    assert.equal(r.status, 200);
    const back = await get();
    assert.equal(JSON.parse(back.data[STORAGE_KEY]).fixed[0].note, "Lease ends June");
    assert.equal(JSON.parse(back.data[MONTHS_KEY])["2026-09"].fixed[0].note, "Sept note");
  });
  it("PFNT-03: a non-string or over-long note is 400 Invalid value with the field, nothing stored", async () => {
    for (const [bad, field] of [
      [5, "expenses.fixed.0.note"],
      ["y".repeat(NOTE_MAX + 1), "expenses.fixed.0.note"],
    ] as const) {
      const r = await put(record(bad, "ok"));
      assert.equal(r.status, 400);
      const body = (await r.json()) as { field?: string; error?: string };
      assert.equal(body.field, field);
      assert.equal(body.error, "Invalid value.");
    }
    const m = await put(record("ok", { no: 1 }));
    assert.equal(m.status, 400);
    assert.equal(((await m.json()) as { field?: string }).field, "months.2026-09.fixed.0.note");
    assert.equal(JSON.parse((await get()).data[STORAGE_KEY]).fixed[0].note, "Lease ends June");
    // exactly 500 (after trim) is accepted
    assert.equal((await put(record(` ${"z".repeat(NOTE_MAX)} `, "ok"))).status, 200);
    assert.equal((await put(record("Lease ends June", "Sept note"))).status, 200);
  });
  it("PFNT-10 (Q-NT2): no CFO API output has a note key; every endpoint is byte-identical to the same data without notes", async () => {
    writes.length = 0;
    assert.equal(CFO_SCHEMA, "cfo-pf.v1");
    const paths = CFO_ENDPOINTS.map((e) => e.replace(":month", "2026-09").replace(":id", "none"));
    const texts = async () => Promise.all(paths.map(async (p) => [p, (await cfo(p)).status, await (await cfo(p)).text()] as const));
    assert.equal((await put(withPlan("Lease ends June"))).status, 200);
    // the note stays in the app record, months and plans
    const back = await get();
    assert.equal(JSON.parse(back.data[STORAGE_KEY]).fixed[0].note, "Lease ends June");
    assert.equal(JSON.parse(back.data[MONTHS_KEY])["2026-09"].fixed[0].note, "Lease ends June");
    assert.equal(JSON.parse(back.data[PLANS_KEY])["2026-12"].lines.fixed[0].note, "Lease ends June");
    writes.length = 0;
    const withNotes = await texts();
    const writesDuringCfo = [...writes];
    assert.ok(withNotes.filter(([, st]) => st === 200).length >= 10, "most endpoints answer 200");
    for (const [p, , t] of withNotes) {
      assert.ok(!t.includes('"note"'), `${p} has a note key`);
      assert.ok(!t.includes("Lease ends June"), `${p} leaks the note text`);
    }
    const month = JSON.parse(withNotes.find(([p]) => p === "/api/cfo/pf/months/2026-09")![2]) as { data: { lines: { fixed: Record<string, unknown>[] } } };
    assert.equal(month.data.lines.fixed[0]!.amount, "1000");
    assert.ok(!("note" in month.data.lines.fixed[0]!));
    assert.equal((await put(withPlan(undefined))).status, 200);
    writes.length = 0;
    assert.deepEqual(await texts(), withNotes);
    assert.equal((await cfo("/api/cfo/pf/lines", "PUT")).status, 405);
    assert.deepEqual([...writesDuringCfo, ...writes], []);
  });
  it("PFNT-10: cfoWithoutNotes drops every note key and keeps everything else", () => {
    assert.deepEqual(cfoWithoutNotes({ a: [{ note: "x", amount: "1" }], b: { note: "" }, c: 2 }), { a: [{ amount: "1" }], b: {}, c: 2 });
    assert.deepEqual(cfoWithoutNotes({ notes: 1, n: null }), { notes: 1, n: null });
    assert.equal(cfoWithoutNotes(undefined), undefined);
  });
});
