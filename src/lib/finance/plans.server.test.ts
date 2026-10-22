import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest, handlePersonalFinanceViewRequest } from "./account.server.ts";
import { STORAGE_KEY } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { PLANS_KEY } from "./plans.ts";

// #231 (personal-finance-spec §65.3, AC PFPV-13..18): the record save merges plans by month on PGLite.
// alice is the owner; carol a CFO with Read and write; bob a CFO with Read.
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db });
const req = (method: string, body?: unknown, path = "/api/personal-finance") =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
// Server clock: 15 October 2026 (household month 2026-10).
const OCT = () => new Date("2026-10-15T16:00:00Z");
const NOV = () => new Date("2026-11-15T16:00:00Z");
const put = (who: string, data: Record<string, string>, clock = OCT) => handlePersonalFinanceRequest(req("PUT", { data }), as(who), clock);
const stored = async (): Promise<Record<string, string> | null> => {
  const rows = await db.query<{ data: Record<string, string> }>("SELECT data FROM personal_finance WHERE user_id = 'alice'");
  return rows[0]?.data ?? null;
};
const plansNow = async () => {
  const t = (await stored())?.[PLANS_KEY];
  return t === undefined ? undefined : (JSON.parse(t) as Record<string, { lines: { fixed: { amount: string }[] } }>);
};
const amt = (p: Awaited<ReturnType<typeof plansNow>>, k: string) => p?.[k]?.lines.fixed[0]?.amount;
const plan = (rent: string) => ({ lines: { fixed: [{ id: "r", name: "Rent", amount: rent, per: "month" }], variable: [], people: [] }, capturedAt: "2026-10-01T00:00:00.000Z" });
const base = { [STORAGE_KEY]: '{"fixed":[],"variable":[],"accounts":[]}', [MONTHS_KEY]: "{}" };

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "carol"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'), ('carol', 'personal_finance', true, true, 'alice')`);
});

describe("#231 PFPV record save keeps plans (server merge)", () => {
  it("PFPV-13: an older tab's PUT without plans.v1 keeps them (owner and write grant)", async () => {
    assert.equal((await put("alice", { ...base, [PLANS_KEY]: JSON.stringify({ "2026-11": plan("1,000"), "2026-12": plan("1,100") }) })).status, 200);
    assert.equal((await put("alice", base)).status, 200);
    assert.equal(amt(await plansNow(), "2026-11"), "1,000");
    assert.equal(amt(await plansNow(), "2026-12"), "1,100");
    assert.equal((await put("carol", base)).status, 200);
    assert.equal(amt(await plansNow(), "2026-12"), "1,100");
    // the reply is the record as stored
    const r = await put("alice", base);
    assert.ok(((await r.json()) as { data: Record<string, string> }).data[PLANS_KEY]);
  });
  it("PFPV-14: a stale plans.v1 does not overwrite or remove newer months; a future month in the body wins", async () => {
    await put("alice", { ...base, [PLANS_KEY]: JSON.stringify({ "2026-11": plan("1,200") }) });
    const p = await plansNow();
    assert.equal(amt(p, "2026-11"), "1,200");
    assert.equal(amt(p, "2026-12"), "1,100");
  });
  it("PFPV-15: a write for the current or a past month never changes the stored plan (owner and write grant)", async () => {
    // November is now current (server clock): its plan is frozen at 1,200.
    await put("alice", { ...base, [PLANS_KEY]: JSON.stringify({ "2026-11": plan("9,999"), "2026-10": plan("9,999") }) }, NOV);
    await put("carol", { ...base, [PLANS_KEY]: JSON.stringify({ "2026-11": plan("8,888") }) }, NOV);
    const p = await plansNow();
    assert.equal(amt(p, "2026-11"), "1,200");
    assert.equal(p?.["2026-10"], undefined);
    assert.equal(amt(p, "2026-12"), "1,100");
  });
  it("PFPV-16: the view route keeps plans; Read gets 403 and nothing changes", async () => {
    await handlePersonalFinanceViewRequest(req("PUT", { view: '{"closed":[]}' }, "/api/personal-finance/view"), as("alice"));
    assert.equal(amt(await plansNow(), "2026-12"), "1,100");
    assert.equal((await put("bob", { ...base, [PLANS_KEY]: "{}" })).status, 403);
    assert.equal(amt(await plansNow(), "2026-12"), "1,100");
  });
  it("PFPV-17: GET returns the plans with the record", async () => {
    const r = await handlePersonalFinanceRequest(req("GET"), as("alice"), OCT);
    const d = ((await r.json()) as { data: Record<string, string> }).data;
    assert.equal(JSON.parse(d[PLANS_KEY])["2026-11"].lines.fixed[0].amount, "1,200");
  });
  it("PFPV-18: the owner's DELETE still wipes everything, plans included", async () => {
    assert.equal((await handlePersonalFinanceRequest(req("DELETE"), as("alice"), OCT)).status, 200);
    assert.equal(await stored(), null);
    await put("alice", base);
    assert.equal(await plansNow(), undefined);
  });
});

describe("#231 PV1 the API checks the plans a save would write (spec 65.7)", () => {
  // full line shape (the page's readers drop a line missing fields, as for months)
  const ln = (amount: string, currency = "", rate = "") => ({ id: "r", name: "Rent", amount, per: "month", equity: "", account: "", currency, rate, category: "" });
  const fp = (rent: string) => ({ lines: { fixed: [ln(rent)], variable: [], people: [] }, capturedAt: "2026-10-01T00:00:00.000Z" });
  const usd = (rate: string) => ({ lines: { fixed: [ln("100", "USD", rate)], variable: [], people: [] }, capturedAt: "2026-10-01T00:00:00.000Z" });
  it("PFPV-27: an invalid future plan (bad amount, blank FX rate) is refused 400 under plans.<month>.*; nothing is stored", async () => {
    await put("alice", { ...base, [PLANS_KEY]: JSON.stringify({ "2026-12": fp("1,100") }) });
    const r = await put("alice", { ...base, [PLANS_KEY]: JSON.stringify({ "2026-12": fp("abc") }) });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "Invalid value.", field: "plans.2026-12.fixed.0.amount" });
    const r2 = await put("carol", { ...base, [PLANS_KEY]: JSON.stringify({ "2027-01": usd("") }) });
    assert.equal(r2.status, 400);
    assert.equal(((await r2.json()) as { field: string }).field, "plans.2027-01.fixed.0.rate");
    assert.equal(amt(await plansNow(), "2026-12"), "1,100");
    assert.equal((await plansNow())?.["2027-01"], undefined);
    // the same blank rate in months.v1 is still accepted (Q-S4), and a filled rate in a plan is fine
    assert.equal((await put("alice", { ...base, [MONTHS_KEY]: JSON.stringify({ "2027-01": usd("").lines }) })).status, 200);
    assert.equal((await put("alice", { ...base, [PLANS_KEY]: JSON.stringify({ "2027-01": usd("1.35") }) })).status, 200);
  });
  it("PFPV-28: current/past plans in the body and unchanged stored legacy plans never block a save", async () => {
    // an invalid plan for the current or a past month is ignored by the merge, so it is not checked
    assert.equal((await put("alice", { ...base, [PLANS_KEY]: JSON.stringify({ "2026-10": fp("abc"), "2026-09": fp("x") }) })).status, 200);
    // a legacy invalid future plan already stored (written before this check)
    const legacy = JSON.stringify({ ...JSON.parse((await stored())![PLANS_KEY]), "2027-02": fp("bad") });
    await db.query("UPDATE personal_finance SET data = jsonb_set(data, $1, to_jsonb($2::text)) WHERE user_id = 'alice'", [`{${PLANS_KEY}}`, legacy]);
    assert.equal((await put("alice", { ...base, [PLANS_KEY]: legacy })).status, 200);
    assert.equal((await put("alice", base)).status, 200);
    assert.equal(amt(await plansNow(), "2027-02"), "bad");
    // changing it to another invalid value is refused
    const changed = JSON.stringify({ ...JSON.parse(legacy), "2027-02": fp("worse") });
    assert.equal((await put("alice", { ...base, [PLANS_KEY]: changed })).status, 400);
  });
});
