import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceReportRequest, handlePersonalFinanceRequest } from "./account.server.ts";
import { STORAGE_KEY, asExpenses, relinkName, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";

// #168 CFO Q-AM7 (2026-10-20; spec 48.6, PFDU-10): re-adding a deleted name (any case) clears its `(deleted)` label
// and does NOT rewrite earlier months. Driven through the real record and report handlers on PGlite, under TZ=UTC and
// TZ=America/Los_Angeles (npm test both ways). alice owns.
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = { env, getUser: async () => ({ id: "alice", email: "alice@example.com" }), getDb: async () => db };
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const L = (id: string, amount: string, category = "", account = ""): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
const shared = {
  fixed: [L("rent", "1000", "Home", "Chequing")],
  variable: [],
  accounts: ["Chequing"],
  categories: ["Home"],
  deletedCategories: [{ name: "Travel", from: "2026-06" }],
  deletedAccounts: [{ name: "Amex", from: "2026-06" }],
};
const months = JSON.stringify({
  "2026-03": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [L("t", "200", "Travel", "Amex")], people: [] },
  "2026-09": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [], people: [] },
});
const REPORT = { series: [{ kind: "category", id: "Travel" }, { kind: "account", id: "Amex" }], range: { preset: "12m" }, chart: "line" };
const getRecord = async () => ((await (await handlePersonalFinanceRequest(req("GET", "/api/personal-finance"), as)).json()) as { data: Record<string, string> }).data;
const getReport = async () => (await (await handlePersonalFinanceReportRequest(req("GET", "/api/personal-finance/report"), as)).json()) as { labels: string[]; deleted: number[]; missing: number[] };

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', ["alice", "alice@example.com"]);
  const r = await handlePersonalFinanceRequest(req("PUT", "/api/personal-finance", { data: { [STORAGE_KEY]: JSON.stringify(shared), [MONTHS_KEY]: months } }), as);
  assert.equal(r.status, 200);
  assert.equal((await handlePersonalFinanceReportRequest(req("PUT", "/api/personal-finance/report", { report: REPORT }), as)).status, 200);
});

describe("#168 Q-AM7 / PFDU-10: re-adding a deleted name", () => {
  it("before: Travel and Amex are labelled (deleted)", async () => {
    const j = await getReport();
    assert.deepEqual(j.labels, ["Travel (deleted)", "Amex (deleted)"]);
    assert.deepEqual(j.deleted, [0, 1]);
  });
  it("re-adding `travel` and `AMEX` (other case) clears both labels; earlier months are byte-identical", async () => {
    const before = await getRecord();
    let e = asExpenses(JSON.parse(before[STORAGE_KEY]));
    e = relinkName({ ...e, categories: [...e.categories, "travel"] }, "category", "travel").expenses;
    e = relinkName({ ...e, accounts: [...e.accounts, "AMEX"] }, "account", "AMEX").expenses;
    const put = await handlePersonalFinanceRequest(req("PUT", "/api/personal-finance", { data: { ...before, [STORAGE_KEY]: JSON.stringify(e) } }), as);
    assert.equal(put.status, 200);
    const after = await getRecord();
    const ex = JSON.parse(after[STORAGE_KEY]);
    assert.deepEqual(ex.categories, ["Home", "Travel"], "the live name takes the deleted spelling");
    assert.deepEqual(ex.accounts, ["Chequing", "Amex"]);
    assert.deepEqual(ex.deletedCategories ?? [], []);
    assert.deepEqual(ex.deletedAccounts ?? [], []);
    assert.equal(after[MONTHS_KEY], before[MONTHS_KEY], "earlier months are not rewritten");
    assert.equal(JSON.parse(after[MONTHS_KEY])["2026-03"].variable[0].category, "Travel");
    const j = await getReport();
    assert.deepEqual(j.labels, ["Travel", "Amex"], "no (deleted) label");
    assert.deepEqual(j.deleted, []);
    assert.deepEqual(j.missing, []);
  });
});
