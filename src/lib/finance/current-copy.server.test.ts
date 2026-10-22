import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  handlePersonalFinanceChartRequest,
  handlePersonalFinanceReportExportRequest,
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceRequest,
  handlePersonalFinanceSeriesRequest,
} from "./account.server.ts";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { lineFigures, MONTHS_KEY, typedOverCopy } from "./months.ts";
import { OVERVIEW_KEY, readOverview, typedFigure } from "./overview.ts";
import { RecordStore } from "./record.ts";
import { REPORT_KEY } from "./report.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";

// #199 (spec section 56, PFCC-01..PFCC-12): /series, /chart and the saved-report export count the current month's
// unsaved copy exactly as the read-only Overview does (#166): the copy of the latest month with lines while the
// current month has no stored lines, minus names deleted on or before it, typed Update totals per field over it.
// PGlite (migrations 0010-0012, unchanged), fake session, fixed clock (household month 2026-10). alice owns; rita has
// a Personal Finance Read grant; dave has no Personal Finance grant. Runs under TZ=UTC and TZ=America/Los_Angeles.
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string | null) => ({ env, getUser: async () => (id ? { id, email: `${id}@example.com` } : null), getDb: async () => db });
const NOW = new Date("2026-10-16T16:00:00Z");
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const L = (id: string, amount: string, category = "", account = ""): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
const G = (id: string) => ({ kind: "group", id });
const M = (id: string) => ({ kind: "metric", id });
const SERIES = [M("expenses"), M("income"), M("surplus"), M("net-assets"), { kind: "category", id: "Home" }, { kind: "category", id: "Travel" }, { kind: "account", id: "Chequing" }, { kind: "line", id: "rent" }, G("all"), G("fixed"), G("variable")];
const QUERY = { series: SERIES, range: { from: "2026-08", to: "2026-10" }, chart: "line" };
const IDX = Object.fromEntries(SERIES.map((s, i) => [s.id + (s.kind === "category" || s.kind === "account" ? `:${s.kind}` : ""), i]));

const recordOf = (typed: Record<string, { expenses: string; income: string }> = {}, current?: object) => ({
  [STORAGE_KEY]: JSON.stringify({
    fixed: [L("rent", "1000", "Home", "Chequing")],
    variable: [L("t", "200", "", "Amex")],
    accounts: ["Chequing", "Amex"],
    categories: ["Home"],
    deletedCategories: [{ name: "Travel", from: "2026-10" }],
  }),
  [MONTHS_KEY]: JSON.stringify({
    "2026-08": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [L("t", "100", "Travel", "Amex")], people: [] },
    "2026-09": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [L("t", "200", "Travel", "Amex")], people: [] },
    ...(current ? { "2026-10": current } : {}),
  }),
  [OVERVIEW_KEY]: JSON.stringify({ start: "10000", growth: "", future: false, years: 1, months: typed }),
});
/** What the read-only Overview shows (expenses-page.tsx, #166): lineFigures with the current month, typed over the copy. */
const overviewOf = (record: Record<string, string>) => {
  const s = new RecordStore(record);
  const t = readOverview(s).months["2026-10"];
  return typedOverCopy(lineFigures(s, "2026-10"), s, "2026-10", { expenses: typedFigure(t?.expenses), income: typedFigure(t?.income) });
};
const save = async (record: Record<string, string>) => {
  assert.equal((await handlePersonalFinanceRequest(req("PUT", "/api/personal-finance", { data: record }), as("alice"))).status, 200);
  assert.equal((await handlePersonalFinanceReportRequest(req("PUT", "/api/personal-finance/report", { report: QUERY }), as("alice"))).status, 200);
};
type Out = { months: string[]; series: { values: (number | null)[] }[] };
const series = async (who: string) => handlePersonalFinanceSeriesRequest(req("POST", "/api/personal-finance/series", { series: SERIES, range: QUERY.range }), as(who), () => NOW);
const chart = async (who: string, body: unknown = QUERY) => handlePersonalFinanceChartRequest(req("POST", "/api/personal-finance/chart", body), as(who), () => NOW);
const exp = async (who: string, format: string) =>
  handlePersonalFinanceReportExportRequest(req("GET", `/api/personal-finance/reports/default/export?format=${format}`), "default", as(who), () => NOW);
const exportData = async (who: string, format: string): Promise<Out> => {
  const r = await exp(who, format);
  assert.equal(r.status, 200, format);
  const b = Buffer.from(await r.arrayBuffer());
  return (format === "pdf" ? readPdf(b) : readPng(b)).data as Out;
};
/** The value of series `key` in `month` on all four surfaces (series, chart, saved chart, PDF and PNG data): all equal. */
const everywhere = async (key: string, month = "2026-10") => {
  const outs: Out[] = [await (await series("alice")).json(), await (await chart("alice")).json(), await (await chart("alice", { saved: true })).json(), await exportData("alice", "pdf"), await exportData("alice", "png")];
  const vals = outs.map((o) => o.series[IDX[key]].values[o.months.indexOf(month)]);
  for (const v of vals) assert.deepEqual(v, vals[0], `${key} ${month}: ${JSON.stringify(vals)}`);
  return vals[0];
};

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "rita", "dave"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('rita', 'personal_finance', true, false, 'alice'), ('dave', 'dashboard', true, true, 'alice')`);
});

describe("#199 current month's unsaved copy on /series, /chart and the export (spec 56)", () => {
  it("PFCC-01: no stored current month: expenses = the copy of 2026-09 (1,200) on every surface, as Overview", async () => {
    const rec = recordOf();
    await save(rec);
    assert.equal(await everywhere("expenses"), 1200);
    assert.equal(await everywhere("expenses"), overviewOf(rec)["2026-10"].expenses);
  });
  it("PFCC-02: the copy's lines feed group / line / account / category series (all 1,200, fixed 1,000, variable 200, rent, Home, Chequing 1,000)", async () => {
    assert.equal(await everywhere("all"), 1200);
    assert.equal(await everywhere("fixed"), 1000);
    assert.equal(await everywhere("variable"), 200);
    assert.equal(await everywhere("rent"), 1000);
    assert.equal(await everywhere("Home:category"), 1000);
    assert.equal(await everywhere("Chequing:account"), 1000);
  });
  it("PFCC-03: a name deleted on or before the current month is not in the copy (Travel: 0 in 2026-10, as a stored month without a Travel line), its past is kept (200 in 2026-09)", async () => {
    assert.equal(await everywhere("Travel:category"), 0);
    assert.equal(await everywhere("Travel:category", "2026-09"), 200);
    assert.equal(await everywhere("all"), 1200); // the line stays, without the deleted category
  });
  it("PFCC-04: past months are unchanged (2026-08 expenses 1,100, 2026-09 1,200)", async () => {
    assert.equal(await everywhere("expenses", "2026-08"), 1100);
    assert.equal(await everywhere("expenses", "2026-09"), 1200);
  });
  it("PFCC-05: typed income only: income 5,000 typed, expenses still the copy (per field), surplus 3,800, as Overview", async () => {
    const rec = recordOf({ "2026-10": { expenses: "", income: "5000" } });
    await save(rec);
    assert.equal(await everywhere("expenses"), 1200);
    assert.equal(await everywhere("income"), 5000);
    assert.equal(await everywhere("surplus"), 3800);
    assert.deepEqual({ expenses: 1200, income: 5000 }, overviewOf(rec)["2026-10"]);
  });
  it("PFCC-06: net assets move by the current month's surplus (3,800) from 2026-09 to 2026-10", async () => {
    const n9 = (await everywhere("net-assets", "2026-09")) as number;
    const n10 = (await everywhere("net-assets", "2026-10")) as number;
    assert.equal(n10 - n9, 3800);
  });
  it("PFCC-07: typed expenses replace the copy's expenses (900), as Overview; group series still read the copy's lines", async () => {
    const rec = recordOf({ "2026-10": { expenses: "900", income: "" } });
    await save(rec);
    assert.equal(await everywhere("expenses"), 900);
    assert.equal(overviewOf(rec)["2026-10"].expenses, 900);
    assert.equal(await everywhere("all"), 1200);
  });
  it("PFCC-08: stored current-month lines win over typed totals and the copy (expenses 800, rent 800), as before", async () => {
    const rec = recordOf({ "2026-10": { expenses: "900", income: "" } }, { fixed: [L("rent", "800", "Home", "Chequing")], variable: [], people: [] });
    await save(rec);
    assert.equal(await everywhere("expenses"), 800);
    assert.equal(await everywhere("rent"), 800);
    assert.equal(await everywhere("variable"), 0);
    assert.equal(overviewOf(rec)["2026-10"].expenses, 800);
  });
  it("PFCC-09: every month in range equals Overview's expenses / income figure (copy record and typed record)", async () => {
    for (const rec of [recordOf(), recordOf({ "2026-10": { expenses: "", income: "5000" } })]) {
      await save(rec);
      const o = overviewOf(rec);
      for (const k of ["2026-08", "2026-09", "2026-10"]) {
        assert.equal(await everywhere("expenses", k), o[k]?.expenses ?? null, k);
        assert.equal(await everywhere("income", k), o[k]?.income ?? null, k);
      }
    }
  });
  it("PFCC-10: Read grant (rita, Read only): /series, /chart and both exports 200 on her own record (seeded directly: Read can't save a report), with the current-month copy", async () => {
    // Read cannot PUT (#162 R2 / #197), so her record (with a saved default report) is seeded directly, as in export.server.test.ts.
    await pg.query("INSERT INTO personal_finance (user_id, data) VALUES ($1, $2)", ["rita", { ...recordOf(), [REPORT_KEY]: JSON.stringify(QUERY) }]);
    assert.equal((await series("rita")).status, 200);
    const outs: Out[] = [await (await series("rita")).json(), await (await chart("rita")).json(), await exportData("rita", "pdf"), await exportData("rita", "png")];
    for (const o of outs) assert.equal(o.series[IDX.expenses].values[o.months.indexOf("2026-10")], 1200);
  });
  it("PFCC-11: no Personal Finance grant (dave): /series, /chart and the export are 403; signed out 401", async () => {
    assert.equal((await series("dave")).status, 403);
    assert.equal((await chart("dave")).status, 403);
    assert.equal((await exp("dave", "pdf")).status, 403);
    assert.equal((await exp("dave", "png")).status, 403);
    assert.equal((await chart(null as unknown as string)).status, 401);
  });
});
