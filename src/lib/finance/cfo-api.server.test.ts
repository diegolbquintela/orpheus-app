import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { handlePersonalFinanceRequest } from "./account.server.ts";
import { CFO_ENDPOINTS, cfoAuthorized, handleCfoPfRequest } from "./cfo-api.server.ts";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { OVERVIEW_KEY } from "./overview.ts";
import { PLANS_KEY } from "./plans-key.ts";
import { SCENARIO_KEY } from "./scenario-key.ts";
import { HORIZONS, project, savedInputs } from "./scenario.ts";
import { NET_BEFORE_ANCHOR, NET_FUTURE, resetCfoUnsetLog, selectedOverview } from "./cfo-api.server.ts";
import { savedOverviewFigures } from "./months.ts";
import { readOverview, summarize } from "./overview.ts";
import { RecordStore } from "./record.ts";

// #245 (spec section 67, PFCFO-01..PFCFO-08): GET /api/cfo/pf/* on PGlite (migrations 0010-0012, unchanged) with a
// test-only key (random per run, never a real one) and a fixed clock. alice owns (ORPHEUS_OWNER_EMAIL); bob has his
// own row that must never appear. Runs under TZ=UTC and TZ=America/Los_Angeles (household month is Toronto's).
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
const call = (path: string, { method = "GET", auth = `Bearer ${KEY}`, e = env as Record<string, string | undefined> } = {}) =>
  handleCfoPfRequest(
    new Request(`http://localhost${path}`, { method, headers: auth === "" ? {} : { authorization: auth } }),
    { env: e, getDb: async () => db, now: () => NOW },
  );
const L = (id: string, amount: string): Line => ({ id, name: id, amount, per: "month", equity: "", account: "Chequing", currency: "", rate: "", category: "Home" });
const P = (id: string, wages: string, foreign = false, currency = "", rate = "") => ({ id, name: id, wages, bonus: "", tax: "0", share: "100", countWages: true, countBonus: false, foreign, currency, rate });
const ALICE = {
  [STORAGE_KEY]: JSON.stringify({ fixed: [L("rent", "1000")], variable: [], accounts: ["Chequing"], categories: ["Home"] }),
  [MONTHS_KEY]: JSON.stringify({
    "2026-09": { fixed: [L("rent", "1000")], variable: [], people: [P("ana", "120000"), P("ben", "12000", true, "USD", "0.5")] },
    "2026-08": { fixed: [L("rent", "1000")], variable: [], people: [P("ana", "120000"), P("ben", "12000", true, "USD", "")] },
    "2026-12": { fixed: [L("rent", "1100")], variable: [], people: [] },
  }),
  [OVERVIEW_KEY]: JSON.stringify({ start: "10000", growth: "", future: false, years: 1, months: {} }),
  [PLANS_KEY]: JSON.stringify({ "2026-09": { lines: { fixed: [L("rent", "900")], variable: [], people: [] }, capturedAt: "2026-08-20T12:00:00Z" } }),
  [SCENARIO_KEY]: JSON.stringify({ income: {}, expenses: {}, rate: null, growth: null, start: null, saved: [{ id: "s1", name: "Base", savedAt: "2026-10-01T00:00:00Z", basis: "2026-09", inputs: { start: 1, income: 2, expenses: 1, growth: 0, rate: null }, values: {}, lines: "{}" }] }),
};
const BOB_SECRET = "bob-only-marker-9431";
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db });
const put = (id: string, data: unknown) =>
  handlePersonalFinanceRequest(new Request("http://localhost/api/personal-finance", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) }), as(id));

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  await pg.exec(/CREATE TABLE IF NOT EXISTS fx_rates \([\s\S]*?\n\);/.exec(readFileSync(new URL("../../../migrations/0002_dashboard.sql", import.meta.url), "utf8"))![0]);
  for (const id of ["alice", "bob"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  assert.equal((await put("alice", ALICE)).status, 200);
  // A past plan is kept from the stored value only (#231 mergePlansText), so it is seeded directly.
  await pg.query("UPDATE personal_finance SET data = data || jsonb_build_object($1::text, $2::text) WHERE user_id = 'alice'", [PLANS_KEY, ALICE[PLANS_KEY]]);
  await pg.query("INSERT INTO personal_finance (user_id, data) VALUES ('bob', $1::jsonb)", [JSON.stringify({ [STORAGE_KEY]: JSON.stringify({ fixed: [L(BOB_SECRET, "5")], variable: [], accounts: [], categories: [] }) })]);
  // #245 PFCFO-13: stored BoC rows for USD in September only (1.40 CAD per USD); August has none.
  for (const d of ["2026-09-01", "2026-09-02"]) await pg.query("INSERT INTO fx_rates (quote, rate_date, cad_per_unit, source) VALUES ('USD', $1, '1.40', 'BOC')", [d]);
  writes.length = 0;
});

describe("#245 PFCFO-01 any method but GET / HEAD is 405 (before the key)", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    it(method, async () => {
      for (const auth of ["", `Bearer ${KEY}`]) {
        const r = await call("/api/cfo/pf/months", { method, auth });
        assert.equal(r.status, 405);
        assert.equal(r.headers.get("allow"), "GET, HEAD");
      }
    });
  it("flag off: 404 for every method", async () => {
    assert.equal((await call("/api/cfo/pf", { e: { ...env, DASHBOARD_ENABLED: "false" } })).status, 404);
  });
});

describe("#245 PFCFO-02 missing, wrong or revoked (unset / rotated) key is 401", () => {
  const cases: [string, string, Record<string, string | undefined>][] = [
    ["missing", "", env],
    ["wrong", "Bearer nope", env],
    ["no Bearer prefix", KEY, env],
    ["key plus suffix", `Bearer ${KEY}x`, env],
    ["unset (revoked)", `Bearer ${KEY}`, { ...env, CFO_PF_API_KEY: undefined }],
    ["empty", "Bearer ", { ...env, CFO_PF_API_KEY: "" }],
    ["rotated", `Bearer ${KEY}`, { ...env, CFO_PF_API_KEY: `${KEY}-new` }],
  ];
  for (const [name, auth, e] of cases)
    it(name, async () => {
      const r = await call("/api/cfo/pf/overview", { auth, e });
      assert.equal(r.status, 401);
      assert.deepEqual(await r.json(), { error: "Unauthorized." });
      assert.equal(r.headers.get("cache-control"), "no-store");
    });
  it("PFCFO-03 cfoAuthorized: constant-time helper, empty key never matches", () => {
    assert.equal(cfoAuthorized(`Bearer ${KEY}`, KEY), true);
    assert.equal(cfoAuthorized("Bearer ", ""), false);
    assert.equal(cfoAuthorized(null, undefined), false);
    assert.match(readFileSync(new URL("./cfo-api.server.ts", import.meta.url), "utf8"), /timingSafeEqual\(sha\(/);
  });
});

describe("#245 PFCFO-04 owner scope", () => {
  it("userId in the query is 400", async () => {
    const r = await call("/api/cfo/pf/months?userId=bob");
    assert.equal(r.status, 400);
  });
  it("every endpoint returns alice's data, never bob's", async () => {
    for (const p of ["/api/cfo/pf", "/api/cfo/pf/months", "/api/cfo/pf/lines", "/api/cfo/pf/overview", "/api/cfo/pf/scenario", "/api/cfo/pf/scenarios", "/api/cfo/pf/plans", "/api/cfo/pf/future", "/api/cfo/pf/settings", "/api/cfo/pf/fx", "/api/cfo/pf/reports"]) {
      const r = await call(p);
      assert.equal(r.status, 200, p);
      assert.ok(!(await r.text()).includes(BOB_SECRET), p);
    }
  });
  it("no owner account: 404 No household.", async () => {
    const r = await call("/api/cfo/pf/months", { e: { ...env, ORPHEUS_OWNER_EMAIL: "nobody@example.com" } });
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: "No household." });
  });
});

describe("#245 PFCFO-05 shapes", () => {
  const data = async (p: string) => {
    const r = await call(p);
    assert.equal(r.status, 200, p);
    const j = (await r.json()) as { data: Record<string, unknown>; currentMonth: string };
    assert.equal(j.currentMonth, "2026-10");
    return j.data as Record<string, any>;
  };
  it("index lists every endpoint", async () => assert.deepEqual((await data("/api/cfo/pf")).endpoints, [...CFO_ENDPOINTS]));
  it("months + range + one month", async () => {
    assert.deepEqual(Object.keys((await data("/api/cfo/pf/months")).months), ["2026-08", "2026-09", "2026-12"]);
    assert.deepEqual(Object.keys((await data("/api/cfo/pf/months?from=2026-10")).months), ["2026-12"]);
    const one = await data("/api/cfo/pf/months/2026-09");
    assert.equal(one.stored, true);
    assert.equal((await data("/api/cfo/pf/months/2026-10")).lines, null);
    assert.equal((await call("/api/cfo/pf/months/2026-13")).status, 400);
  });
  it("overview has summary and net assets now", async () => {
    const o = await data("/api/cfo/pf/overview");
    assert.equal(o.summary.current, "2026-10");
    assert.equal(typeof o.netAssetsNow, "number");
  });
  it("series via ?q= reuses the POST validation", async () => {
    const q = encodeURIComponent(JSON.stringify({ series: [{ kind: "metric", id: "net-assets" }], range: { preset: "12m" } }));
    const r = await call(`/api/cfo/pf/series?q=${q}`);
    assert.equal(r.status, 200, await r.clone().text());
    assert.ok(Array.isArray((await r.json()).data.series));
    assert.equal((await call("/api/cfo/pf/series")).status, 400);
    assert.equal((await call("/api/cfo/pf/series?q=%7B")).status, 400);
  });
  it("scenarios + one saved scenario", async () => {
    assert.equal((await data("/api/cfo/pf/scenarios")).scenarios.length, 1);
    assert.equal((await data("/api/cfo/pf/scenarios/s1")).scenario.name, "Base");
    assert.equal((await call("/api/cfo/pf/scenarios/nope")).status, 404);
  });
  it("plans with planned vs actual", async () => {
    const p = (await data("/api/cfo/pf/plans")).plans["2026-09"];
    assert.ok(p.plan && p.comparison);
  });
  it("future months: current+1 .. +12", async () => {
    const f = await data("/api/cfo/pf/future");
    assert.equal(f.lastOpenMonth, "2027-10");
    assert.equal(f.months.length, 12);
    assert.equal(f.months[1].month, "2026-12");
    assert.equal(f.months[1].stored, true);
  });
  it("settings and fx", async () => {
    assert.ok("currency" in (await data("/api/cfo/pf/settings")));
    assert.equal((await data("/api/cfo/pf/fx?through=2026-09")).through, "2026-09");
    assert.equal((await call("/api/cfo/pf/fx?through=bad")).status, 400);
  });
  it("unknown path 404", async () => assert.equal((await call("/api/cfo/pf/nope")).status, 404));
});

describe("#245 PFCFO-09..13 (2026-10-23 additions): projections, net assets, income by person / currency", () => {
  const data = async (p: string) => ((await (await call(p)).json()) as { data: any }).data;
  const rec = async () => (await pg.query<{ data: Record<string, string> }>("SELECT data FROM personal_finance WHERE user_id = 'alice'")).rows[0].data;
  it("PFCFO-09 /scenario: one projection per horizon, exactly the page's project(savedInputs)", async () => {
    const d = await data("/api/cfo/pf/scenario");
    const inp = savedInputs(await rec(), NOW);
    assert.deepEqual(d.projection.map((x: { horizon: number }) => x.horizon), [...HORIZONS]);
    for (const [i, h] of HORIZONS.entries()) {
      const p = project(inp, h);
      assert.deepEqual(d.projection[i].points, p.points);
      assert.deepEqual(d.projection[i].totals, p.totals);
      assert.equal(d.projection[i].surplus, p.totals.surplus);
      assert.equal(d.projection[i].growth, p.totals.growthEarned);
      assert.equal(d.projection[i].netAssets, p.totals.netEnd);
    }
  });
  it("PFCFO-10 /scenarios/:id: the compare's project({ ...inputs, current }) per horizon", async () => {
    const d = await data("/api/cfo/pf/scenarios/s1");
    const inp = { ...d.scenario.inputs, current: "2026-10" };
    for (const [i, h] of HORIZONS.entries()) assert.deepEqual(d.projection[i].totals, project(inp, h).totals);
    assert.equal(d.projection[0].points[0].key, "2026-10");
  });
  it("PFCFO-11 netAssets per month = /series net-assets (#228); before the anchor and future: null + note", async () => {
    const q = encodeURIComponent(JSON.stringify({ series: [{ kind: "metric", id: "net-assets" }], range: { from: "2026-07", to: "2026-10" } }));
    const ser = await data(`/api/cfo/pf/series?q=${q}`);
    const at = (k: string) => ser.series[0].values[ser.months.indexOf(k)];
    const all = (await data("/api/cfo/pf/months")).months;
    assert.equal(typeof all["2026-09"].netAssets, "number");
    assert.equal(all["2026-09"].netAssets, at("2026-09"));
    assert.equal(all["2026-08"].netAssets, at("2026-08"));
    assert.equal((await data("/api/cfo/pf/months/2026-09")).netAssets, at("2026-09"));
    const before = await data("/api/cfo/pf/months/2026-07");
    assert.equal(before.netAssets, at("2026-07"));
    if (before.netAssets === null) assert.equal(before.netAssetsNote, NET_BEFORE_ANCHOR);
    const early = await data("/api/cfo/pf/months/2021-01");
    assert.equal(early.netAssets, null);
    assert.equal(early.netAssetsNote, NET_BEFORE_ANCHOR);
    assert.equal(all["2026-12"].netAssets, null);
    assert.equal(all["2026-12"].netAssetsNote, NET_FUTURE);
  });
  it("PFCFO-12 income by person and by currency (monthly counted net, own currency)", async () => {
    const inc = (await data("/api/cfo/pf/months/2026-09")).income;
    assert.equal(inc.household, "CAD");
    const [ana, ben] = inc.byPerson;
    assert.deepEqual([ana.name, ana.currency, ana.monthly, ana.fx, ana.monthlyHousehold], ["ana", "CAD", 10000, "household", 10000]);
    assert.deepEqual([ben.name, ben.currency, ben.monthly], ["ben", "USD", 1000]);
    assert.equal(inc.byCurrency.CAD.monthly, 10000);
    assert.equal(inc.byCurrency.USD.monthly, 1000);
  });
  it("PFCFO-13 household totals use the month's stored BoC FX; missing FX is marked, never guessed", async () => {
    const sep = (await data("/api/cfo/pf/months/2026-09")).income;
    const ben = sep.byPerson[1];
    assert.equal(ben.fx, "historical");
    assert.equal(ben.monthlyHousehold, 1400); // 1000 USD × 1.40 (stored), not the typed 0.5
    assert.equal(sep.totalHousehold, 11400);
    assert.equal(sep.fxMissing, false);
    const aug = (await data("/api/cfo/pf/months/2026-08")).income;
    assert.deepEqual([aug.byPerson[1].fx, aug.byPerson[1].monthlyHousehold, aug.byPerson[1].rate], ["missing", null, null]);
    assert.equal(aug.totalHousehold, null);
    assert.equal(aug.fxMissing, true);
    assert.equal(aug.byCurrency.USD.monthlyHousehold, null);
    assert.equal(aug.byCurrency.USD.fxMissing, true);
    assert.equal(aug.byCurrency.CAD.monthlyHousehold, 10000);
  });
});

describe("#245 PFCFO-06 zero writes, key never logged", () => {
  it("only SELECTs ran during all CFO calls", () => assert.deepEqual(writes, []));
  it("no log line carries the key or the header", async () => {
    resetCfoUnsetLog();
    const lines: string[] = [];
    const orig = [console.log, console.error, console.warn];
    console.log = console.error = console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    try {
      await call("/api/cfo/pf/months", { auth: "Bearer wrong-secret-xyz" });
      await call("/api/cfo/pf/months", { e: { ...env, CFO_PF_API_KEY: undefined } });
      await call("/api/cfo/pf/months");
    } finally {
      [console.log, console.error, console.warn] = orig;
    }
    assert.ok(lines.length >= 1);
    for (const l of lines) assert.ok(!l.includes(KEY) && !l.includes("wrong-secret-xyz"), l);
  });
});

describe("#245 BA1 an unset key logs at most once per instance", () => {
  it("two (and three) requests with CFO_PF_API_KEY unset give exactly one log line", async () => {
    resetCfoUnsetLog();
    const lines: string[] = [];
    const orig = [console.log, console.error, console.warn];
    console.log = console.error = console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
    try {
      for (let i = 0; i < 3; i++) assert.equal((await call("/api/cfo/pf", { e: { ...env, CFO_PF_API_KEY: undefined } })).status, 401);
    } finally {
      [console.log, console.error, console.warn] = orig;
    }
    assert.equal(lines.filter((l) => l.includes("CFO_PF_API_KEY is not set")).length, 1);
    assert.equal(lines.length, 1);
  });
});

describe("#245 PFCFO-07 docs drift guard", () => {
  it("spec 67, AGENTS.md and README list every endpoint and the standing rule", () => {
    for (const f of ["../../../attachments/personal-finance-spec.md", "../../../AGENTS.md", "../../../README.md"]) {
      const t = readFileSync(new URL(f, import.meta.url), "utf8");
      for (const p of CFO_ENDPOINTS) assert.ok(t.includes(`\`${p}`), `${f} ${p}`);
      assert.ok(t.includes("CFO_PF_API_KEY"), f);
    }
    for (const f of ["../../../attachments/personal-finance-spec.md", "../../../AGENTS.md", "../../../.github/pull_request_template.md"])
      assert.ok(readFileSync(new URL(f, import.meta.url), "utf8").includes("Every new PF feature ships with its endpoint documented and CFO notified"), f);
  });
});

// #247 follow-up (spec §72, Q-OS4): /api/cfo/pf/overview?month=. PFOS-10 + PFOM-01..PFOM-08.
describe("#247 PFOM /api/cfo/pf/overview?month= (spec 72)", () => {
  const ov = async (q = "") => {
    const r = await call(`/api/cfo/pf/overview${q}`);
    return { status: r.status, body: await r.json() };
  };
  const stored = async () => (await pg.query<{ data: unknown }>("SELECT data FROM personal_finance WHERE user_id = 'alice'")).rows[0].data;
  // PFOS-10: per call, not just "all calls so far": each call runs only SELECTs.
  const noWrite = async <T>(f: () => Promise<T>): Promise<T> => {
    const n = writes.length;
    const out = await f();
    assert.deepEqual(writes.slice(n), [], "a CFO call wrote");
    return out;
  };
  it("PFOM-01 no month (or month=) → body unchanged, no `selected`", async () => {
    const a = await noWrite(() => ov());
    const b = await noWrite(() => ov("?month="));
    assert.equal(a.status, 200);
    assert.equal("selected" in a.body.data, false);
    assert.deepEqual(b.body.data, a.body.data);
  });
  it("PFOM-02 current month → summary.thisMonth, This month, not copied", async () => {
    const { body } = await noWrite(() => ov("?month=2026-10"));
    const t = body.data.summary.thisMonth;
    assert.deepEqual(body.data.selected, { month: "2026-10", label: "This month", figures: { expenses: t.expenses, income: t.income, surplus: t.income - t.expenses }, copied: false, copiedFrom: null });
  });
  it("PFOM-03 saved future and past months → their own figures and names", async () => {
    const dec = (await noWrite(() => ov("?month=2026-12"))).body.data.selected;
    assert.deepEqual(dec, { month: "2026-12", label: "December 2026", figures: { expenses: 1100, income: null, surplus: null }, copied: false, copiedFrom: null });
    const sep = (await noWrite(() => ov("?month=2026-09"))).body.data.selected;
    assert.equal(sep.label, "September 2026");
    assert.equal(sep.figures.expenses, 1000);
    assert.equal(sep.copied, false);
  });
  it("PFOM-04 / PFOS-10 empty future month → the page's copy from the latest earlier month with lines; record unchanged", async () => {
    const before = await stored();
    const nov = (await noWrite(() => ov("?month=2026-11"))).body.data.selected;
    const sep = (await noWrite(() => ov("?month=2026-09"))).body.data.selected;
    assert.deepEqual(nov, { ...sep, month: "2026-11", label: "November 2026", copied: true, copiedFrom: "2026-09" });
    const jan = (await noWrite(() => ov("?month=2027-01"))).body.data.selected;
    assert.deepEqual(jan, { month: "2027-01", label: "January 2027", figures: { expenses: 1100, income: null, surplus: null }, copied: true, copiedFrom: "2026-12" });
    assert.deepEqual(await stored(), before);
  });
  it("PFOM-05 bad or out-of-range month → 400; lastOpenMonth itself → 200", async () => {
    for (const m of ["2026-13", "abc", "2019-12", "2027-11", "2026-1"]) {
      const r = await noWrite(() => ov(`?month=${m}`));
      assert.equal(r.status, 400, m);
      assert.equal(r.body.error, "month must be yyyy-mm, from 2020-01 to 2027-10.");
    }
    assert.equal((await ov("?month=2027-10")).status, 200);
    assert.equal((await ov("?month=2020-01")).status, 200);
  });
  it("PFOM-06 summary / overview / netAssetsNow / basis identical with and without month", async () => {
    const a = (await ov()).body.data;
    for (const m of ["2026-10", "2026-11", "2026-12", "2026-08"]) {
      const { selected, ...rest } = (await ov(`?month=${m}`)).body.data;
      assert.ok(selected);
      assert.deepEqual(rest, a, m);
    }
  });
  it("PFOM-07 other methods 405, no key 401 (order unchanged)", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) assert.equal((await call("/api/cfo/pf/overview?month=2026-11", { method })).status, 405);
    assert.equal((await call("/api/cfo/pf/overview?month=2026-11", { auth: "" })).status, 401);
    assert.equal((await call("/api/cfo/pf/overview?month=bad", { auth: "" })).status, 401);
  });
  it("PFOM-08 empty past month → null figures; empty future month with no earlier lines → null, not copied", async () => {
    const jul = (await noWrite(() => ov("?month=2026-07"))).body.data.selected;
    assert.deepEqual(jul, { month: "2026-07", label: "July 2026", figures: { expenses: null, income: null, surplus: null }, copied: false, copiedFrom: null });
    const s = new RecordStore({ [MONTHS_KEY]: JSON.stringify({ "2026-12": { fixed: [L("rent", "1100")], variable: [], people: [] } }) });
    const overview = readOverview(s);
    const lines = savedOverviewFigures(s, "2026-10");
    const summary = summarize(overview, NOW, { expenses: null, income: null }, lines);
    assert.deepEqual(selectedOverview(s, overview, summary, lines, "2026-11"), { month: "2026-11", label: "November 2026", figures: { expenses: null, income: null, surplus: null }, copied: false, copiedFrom: null });
  });
  it("PFOS-10 every CFO endpoint, with and without month, ran only SELECTs (whole file)", () => assert.deepEqual(writes, []));
});
