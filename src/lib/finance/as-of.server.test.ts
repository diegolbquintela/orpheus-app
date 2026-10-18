import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  handlePersonalFinanceChartRequest,
  handlePersonalFinanceReportExportRequest,
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceReportsRequest,
  handlePersonalFinanceRequest,
  handlePersonalFinanceSeriesRequest,
} from "./account.server.ts";
import { AS_OF_SUFFIX, NET_ASSETS_AS_OF_NOTE, NET_ASSETS_CAVEAT } from "./export.ts";
import { asOfBad, fieldErrors, INVALID_VALUE, MONTH_AFTER_CURRENT, MONTH_BEFORE_FIRST } from "./field-errors.ts";
import { AS_OF_ERROR, AS_OF_LABEL, AS_OF_PLACEHOLDER, asOfMonth, asOverview, OVERVIEW_KEY, summarize, type Overview } from "./overview.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";
import { exportNetAssetsCheck, seriesNetChecks, storedAsOf, storedStart } from "../../../qa/tools/pf-asof-checks.mjs";
import { crc32, headerLines } from "./export.ts";
import { RANGE_TOO_LONG, type Report } from "./report.ts";

// #171 (spec section 42, PFAO-01..PFAO-16): an explicit 'as of' month for Starting net assets. PGlite (migrations
// 0010-0012, unchanged; no migration, no schema change: the month lives in the existing overview JSON value), the real
// handlers and fixed clocks. Runs under TZ=UTC and TZ=America/Los_Angeles (npm test does both in CI via the gates).
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db });
const OCT = new Date("2026-10-16T16:00:00Z");
const J = { "content-type": "application/json" };
const rq = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: J, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const NET = { kind: "metric", id: "net-assets" };
const SUR = { kind: "metric", id: "surplus" };
// Typed Overview totals: 2025-03 surplus 500, 2026-09 surplus 2,000; Starting net assets 10,000.
const OV = (asOf?: string): Record<string, unknown> => ({
  start: "10000",
  growth: "",
  future: false,
  years: 1,
  months: { "2025-03": { expenses: "1000", income: "1500" }, "2026-09": { expenses: "1000", income: "3000" } },
  ...(asOf === undefined ? {} : { asOf }),
});
const recordOf = (asOf?: string) => ({ [OVERVIEW_KEY]: JSON.stringify(OV(asOf)) });
const putRecord = (data: object, at = OCT) => handlePersonalFinanceRequest(rq("PUT", "/api/personal-finance", { data }), as("alice"), () => at);
const save = async (asOf?: string) => assert.equal((await putRecord(recordOf(asOf))).status, 200);
const stored = async () => (await pg.query<{ data: Record<string, string> }>("SELECT data FROM personal_finance WHERE user_id = 'alice'")).rows[0]?.data ?? null;
const series = async (range: object, at = OCT, who = "alice") =>
  (await handlePersonalFinanceSeriesRequest(rq("POST", "/api/personal-finance/series", { series: [SUR, NET], range }), as(who), () => at)).json();
const chartQ = async (range: object, at = OCT) =>
  (await handlePersonalFinanceChartRequest(rq("POST", "/api/personal-finance/chart", { series: [SUR, NET], range, chart: "line" }), as("alice"), () => at)).json();
const REPORT: Report = { series: [{ kind: "metric", id: "net-assets" }], range: { preset: "all" }, chart: "line" };
const exportText = async (id: string, f: "pdf" | "png" = "pdf", who = "alice") => {
  const r = await handlePersonalFinanceReportExportRequest(rq("GET", `/api/personal-finance/reports/${id}/export?format=${f}`), id, as(who), () => OCT);
  assert.equal(r.status, 200);
  const b = Buffer.from(await r.arrayBuffer());
  const x = f === "pdf" ? readPdf(b) : readPng(b, crc32);
  return { text: f === "pdf" ? (x.text as string[]).join("\n").replace(/\n/g, " ") : JSON.stringify(x.text), data: x.data };
};
const months = (from: string, to: string) => {
  const out = [from];
  while (out.at(-1)! < to) {
    const [y, m] = out.at(-1)!.split("-").map(Number);
    out.push(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`);
  }
  return out;
};
/** The old (#154 Q-AA10) rule, written out: anchored at 2025-03 (first data month), +500 there, +2,000 at 2026-09. */
const oldNet = (ms: string[]) => ms.map((k) => (k < "2025-03" ? null : k < "2026-09" ? 10500 : 12500));

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec("INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES ('bob', 'personal_finance', true, false, 'alice')");
});

describe("#171 PFAO-01..03 no as-of month: today's behaviour exactly (regression)", () => {
  it("a record without asOf: /series, /chart anchor at the first data month (net_assets_from 2025-03), values as before", async () => {
    await save();
    assert.ok(!("asOf" in JSON.parse((await stored())![OVERVIEW_KEY])), "nothing added to an old record");
    for (const range of [{ preset: "all" }, { preset: "24m" }, { from: "2024-01", to: "2026-10" }, { from: "2026-08", to: "2026-10" }]) {
      const s = await series(range);
      assert.equal(s.net_assets_from, "2025-03", JSON.stringify(range));
      assert.deepEqual(s.series[1].values, oldNet(s.months), JSON.stringify(range));
      const c = await chartQ(range);
      assert.equal(c.net_assets_from, "2025-03");
      assert.deepEqual(c.series[1].values, s.series[1].values);
    }
  });
  it("the legacy default report (PUT /report, chart {saved:true}, export default) is unchanged: anchor 2025-03, the 36.11 caveat", async () => {
    assert.equal((await handlePersonalFinanceReportRequest(rq("PUT", "/api/personal-finance/report", { report: REPORT }), as("bob"), () => OCT)).status, 200);
    const c = await (await handlePersonalFinanceChartRequest(rq("POST", "/api/personal-finance/chart", { saved: true }), as("bob"), () => OCT)).json();
    assert.equal(c.net_assets_from, "2025-03");
    assert.deepEqual(c.series[0].values, oldNet(c.months));
    for (const f of ["pdf", "png"] as const) {
      const x = await exportText("default", f, "bob");
      assert.deepEqual(x.data, c, f);
      if (f === "png") continue; // the PNG draws the same headerLines as pixels (checked below); only the PDF has text
      assert.ok(x.text.includes("Net assets from: 2025-03") && !x.text.includes(AS_OF_SUFFIX), f);
      assert.ok(x.text.includes(NET_ASSETS_CAVEAT.slice(0, 60)) && !x.text.includes(NET_ASSETS_AS_OF_NOTE.slice(0, 40)), f);
    }
  });
  it("Overview without asOf: the start sits at the window start (Nov 25 … Oct 26, +2,000 a month → 34,000)", () => {
    const s = summarize(asOverview(OV()), OCT, { expenses: null, income: null }, {});
    assert.deepEqual(s.points.map((p) => p.net), [12000, 14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000, 32000, 34000]);
    // An empty as-of month is the same as none, and so is an unusable one (the page shows its error).
    for (const asOf of ["", "2019-12", "2026-13", "abc"])
      assert.deepEqual(summarize(asOverview(OV(asOf)), OCT, { expenses: null, income: null }, {}).points, s.points, asOf);
  });
});

describe("#171 PFAO-04..08 the anchor is the as-of month", () => {
  it("as-of BEFORE the first data month (2025-01): net_assets_from 2025-01, 10,000 carried flat to 2025-03 (Q-AG1)", async () => {
    await save("2025-01");
    const s = await series({ from: "2024-11", to: "2026-10" });
    assert.equal(s.net_assets_from, "2025-01");
    assert.deepEqual(s.series[1].values, s.months.map((k: string) => (k < "2025-01" ? null : k < "2025-03" ? 10000 : k < "2026-09" ? 10500 : 12500)));
    // 'all' still starts at the first data month (Q-AG10): the anchor is before the range, the level carries in.
    const all = await series({ preset: "all" });
    assert.deepEqual([all.range.from, all.net_assets_from, all.series[1].values[0]], ["2025-03", "2025-01", 10500]);
  });
  it("as-of AFTER the first data month: #171 Q-AG1 (CFO change) worked BACKWARDS to the first data month, never before it", async () => {
    // PFAO-19 (2026-10-17): the month before the as-of month = the start (the as-of month's own surplus is not taken
    // off); each earlier month = the next one minus the next one's surplus; nothing before the first data month.
    await save("2026-06");
    const s = await series({ from: "2025-01", to: "2026-10" });
    assert.equal(s.net_assets_from, "2026-06");
    assert.deepEqual(s.series[1].values, s.months.map((k: string) => (k < "2025-03" ? null : k < "2026-09" ? 10000 : 12000)));
    await save("2026-10");
    const t = await series({ from: "2025-01", to: "2026-10" });
    assert.equal(t.net_assets_from, "2026-10");
    // 2026-09 (the month before) = 10,000; 2026-08 and earlier = 10,000 − 2,000 (2026-09's surplus); 2026-10 = 10,000 + 0.
    assert.deepEqual(t.series[1].values, t.months.map((k: string) => (k < "2025-03" ? null : k < "2026-09" ? 8000 : 10000)));
    // Forward and backward agree: every month = the one before + its own surplus.
    const na = t.series[1].values as (number | null)[];
    const sur = t.series[0].values as (number | null)[];
    for (let i = t.months.indexOf("2025-03") + 1; i < na.length; i++) assert.equal(na[i], na[i - 1]! + (sur[i] ?? 0), t.months[i]);
    assert.deepEqual(t.series[0].values, s.series[0].values, "surplus untouched");
  });
  it("as-of outside the chart range (Q-AG2): before it → the level carries in; after it → #171 Q-AG1 backwards (was all null)", async () => {
    await save("2026-06");
    const early = await series({ from: "2025-01", to: "2025-06" });
    assert.deepEqual([early.net_assets_from, early.series[1].values], ["2026-06", [null, null, 10000, 10000, 10000, 10000]]);
    await save("2025-01");
    const late = await series({ from: "2026-08", to: "2026-10" });
    assert.deepEqual([late.net_assets_from, late.series[1].values], ["2025-01", [10500, 12500, 12500]]);
    const c = await chartQ({ from: "2026-08", to: "2026-10" });
    assert.deepEqual([c.net_assets_from, c.series[1].values], ["2025-01", [10500, 12500, 12500]]);
  });
  it("PFAO-19 the as-of month's own surplus is not taken off going back (2026-09: 08 = start, 09 = start + 2,000)", async () => {
    await save("2026-09");
    const s = await series({ from: "2025-01", to: "2026-10" });
    assert.deepEqual(s.series[1].values, s.months.map((k: string) => (k < "2025-03" ? null : k < "2026-09" ? 10000 : 12000)));
  });
  it("Q-AG12 kept: an as-of month after the current month (skewed clock) still blanks the months before it", async () => {
    await save("2026-10");
    const s = await series({ from: "2026-07", to: "2026-09" }, new Date("2026-09-15T16:00:00Z"));
    assert.deepEqual([s.current, s.net_assets_from, s.series[1].values], ["2026-09", "2026-10", [null, null, null]]);
  });
  it("QA finding 3: an API save with asOf \"\" stores (and replies) the overview without asOf; other texts byte-identical", async () => {
    const r = await putRecord(recordOf(""));
    assert.equal(r.status, 200);
    const want = JSON.stringify(OV());
    assert.equal((await stored())![OVERVIEW_KEY], want);
    assert.equal((await r.json()).data[OVERVIEW_KEY], want);
    for (const asOf of [undefined, "2025-01"]) {
      const text = recordOf(asOf)[OVERVIEW_KEY];
      assert.equal((await putRecord({ [OVERVIEW_KEY]: text })).status, 200);
      assert.equal((await stored())![OVERVIEW_KEY], text, String(asOf));
    }
    const odd = '{ "start": "1",  "asOf": "2025-01" }';
    assert.equal((await putRecord({ [OVERVIEW_KEY]: odd })).status, 200);
    assert.equal((await stored())![OVERVIEW_KEY], odd, "formatting kept when asOf isn't empty");
  });
  it("PFAO-08 clearing it (Q-AG5) reverts to the old anchoring exactly", async () => {
    await save("2026-06");
    await save();
    const s = await series({ preset: "all" });
    assert.deepEqual([s.net_assets_from, s.series[1].values], ["2025-03", oldNet(s.months)]);
  });
  it("PFAO-09 / 10 Overview: as-of before the window adds each month's own surplus up to it; inside → backwards (Q-AG1)", () => {
    const pts = (asOf: string) => summarize(asOverview(OV(asOf)), OCT, { expenses: null, income: null }, {}).points.map((p) => p.net);
    // 2025-01: 10,000 + 500 (2025-03) by the window start, then as before → 34,500 now.
    assert.deepEqual(pts("2025-01"), [12500, 14500, 16500, 18500, 20500, 22500, 24500, 26500, 28500, 30500, 32500, 34500]);
    // 2026-06: Jun 26 10,000 + 2,000 … Oct 26 20,000; #171 Q-AG1: May 26 = 10,000 (the start), each earlier point
    // 2,000 less (the next point's surplus, the same average-filled surplus the forward roll uses).
    assert.deepEqual(pts("2026-06"), [-2000, 0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000]);
    // Q-AG12 kept: an as-of month after the current month (skewed clock only) still blanks everything.
    assert.deepEqual(pts("2026-12"), Array(12).fill(null));
    // The window's first month as the as-of month = exactly the old Overview.
    assert.deepEqual(pts("2025-11"), summarize(asOverview(OV()), OCT, { expenses: null, income: null }, {}).points.map((p) => p.net));
    // Future projects from the anchored level.
    const f = summarize({ ...(asOverview(OV("2025-01")) as Overview), future: true }, OCT, { expenses: null, income: null }, {});
    assert.equal(f.points.at(-1)!.net, 34500 + 12 * 2000);
  });
});

describe("#171 PFAO-11..13 bounds: the #179 validator (2020-01 … current Toronto month), 400 Invalid value. overview.asOf", () => {
  it("refuses before 2020-01, after the current month, malformed; accepts the bounds and empty; nothing stored on refusal", async () => {
    await save("2025-01");
    // #171 Q-AG9 (CFO, 2026-10-17): the two bounds say why; malformed / outside 2000..2100 stays Invalid value.
    const want: Record<string, string> = { "2019-12": MONTH_BEFORE_FIRST, "2000-01": MONTH_BEFORE_FIRST, "2026-11": MONTH_AFTER_CURRENT, "2100-01": MONTH_AFTER_CURRENT };
    for (const bad of ["2019-12", "2000-01", "2026-11", "2100-01", "1999-12", "2101-01", "2026-13", "2026-1", "26-10", "abc", " 2025-01x"]) {
      const r = await putRecord(recordOf(bad));
      assert.deepEqual([r.status, await r.json()], [400, { error: want[bad] ?? INVALID_VALUE, field: "overview.asOf" }], bad);
    }
    assert.equal(JSON.parse((await stored())![OVERVIEW_KEY]).asOf, "2025-01", "unchanged");
    for (const ok of ["2020-01", "2026-10", ""]) assert.equal((await putRecord(recordOf(ok))).status, 200, ok);
  });
  it("Toronto month edge: 2026-11-01 03:30Z refuses 2026-11 (still October); 04:30Z accepts it", async () => {
    const r = await putRecord(recordOf("2026-11"), new Date("2026-11-01T03:30:00Z"));
    assert.deepEqual([r.status, await r.json()], [400, { error: MONTH_AFTER_CURRENT, field: "overview.asOf" }]);
    assert.equal((await putRecord(recordOf("2026-11"), new Date("2026-11-01T04:30:00Z"))).status, 200);
    // and /series anchors there at that clock
    const s = await series({ preset: "3m" }, new Date("2026-11-01T04:30:00Z"));
    assert.deepEqual([s.current, s.net_assets_from, s.series[1].values], ["2026-11", "2026-11", [10000, 10000, 10000]]);
    await save("2025-01");
  });
  it("the page's check (fieldErrors / asOfBad) agrees: same bounds, the field marked overview.asOf", () => {
    const base = { expenses: { fixed: [], variable: [] }, income: { people: [] }, rates: { withdrawal: "", roic: "" }, household: "CAD" } as unknown as Parameters<typeof fieldErrors>[0];
    for (const [asOf, bad] of [["", false], ["2020-01", false], ["2026-10", false], ["2019-12", true], ["2026-11", true], ["2026-1", true]] as const) {
      assert.equal(asOfBad(asOf, "2026-10"), bad, asOf);
      assert.equal(fieldErrors({ ...base, overview: { start: "", growth: "", asOf } }, undefined, "2026-10").includes("overview.asOf"), bad, asOf);
    }
    assert.equal(asOfMonth({ asOf: "2019-12" }), null);
    assert.equal(asOfMonth({ asOf: "2025-01" }), "2025-01");
  });
});

describe("#171 PFAO-14 / 15 export and QA lists", () => {
  it("with an as-of month the export prints 'Net assets from: <month> (as-of month)' and the note, not the caveat (pdf and png)", async () => {
    await save("2025-01");
    const id = (await (await handlePersonalFinanceReportsRequest(rq("POST", "/api/personal-finance/reports", { name: "Net", report: REPORT }), as("alice"), () => OCT)).json()).id;
    for (const f of ["pdf", "png"] as const) {
      const x = await exportText(id, f);
      assert.equal(x.data.net_assets_from, "2025-01");
      if (f === "png") continue;
      assert.ok(x.text.includes(`Net assets from: 2025-01 ${AS_OF_SUFFIX}`), f);
      assert.ok(x.text.includes(NET_ASSETS_AS_OF_NOTE.slice(0, 60)) && !x.text.includes(NET_ASSETS_CAVEAT.slice(0, 60)), f);
    }
    // Both formats print headerLines (the PNG as pixels): with / without the as-of month.
    const d = (await exportText(id, "png")).data;
    const withAsOf = headerLines(d, { name: "Net", generatedAt: "x", netAssetsAsOf: "2025-01" });
    assert.deepEqual(withAsOf.slice(-2), [`Net assets from: 2025-01 ${AS_OF_SUFFIX}`, `Note: ${NET_ASSETS_AS_OF_NOTE}`]);
    assert.deepEqual(headerLines(d, { name: "Net", generatedAt: "x" }).slice(-2), ["Net assets from: 2025-01", `Caveat: ${NET_ASSETS_CAVEAT}`]);
  });
  it("PFAO-15 the QA list (pf-helpers) carries the new visible text verbatim", () => {
    const h = readFileSync(new URL("../../../qa/tools/pf-helpers.mjs", import.meta.url), "utf8");
    const c = (n: string) => new RegExp(`export const ${n} = "([^"]*)";`).exec(h)?.[1];
    assert.deepEqual(
      [c("AS_OF_LABEL"), c("AS_OF_PLACEHOLDER"), c("AS_OF_ERROR"), c("EXPORT_AS_OF_SUFFIX"), c("NET_ASSETS_AS_OF_NOTE")],
      [AS_OF_LABEL, AS_OF_PLACEHOLDER, AS_OF_ERROR, AS_OF_SUFFIX, NET_ASSETS_AS_OF_NOTE],
    );
    // #171 CFO round: the record bound messages and the 24-month cap message.
    assert.deepEqual([c("MONTH_BEFORE_FIRST"), c("MONTH_AFTER_CURRENT"), c("RANGE_TOO_LONG")], [MONTH_BEFORE_FIRST, MONTH_AFTER_CURRENT, RANGE_TOO_LONG]);
  });
});

// #171: the changed signed-in QA expectations (pf-series-api PFS-18 / PFS-20, pf-export-api PFX-06/07) replayed against
// the real handlers for every anchor case (no as-of, as-of before / inside / after the range), and their lines pinned
// as text so the tools and this replay can't drift. The QA tools' signed-in checks can't run here (no creds).
describe("#171 QA tools: the updated signed-in expectations hold on the real handlers", () => {
  const tool = (f: string) => readFileSync(new URL(`../../../qa/tools/${f}`, import.meta.url), "utf8");
  // #171 QA early findings 1 / 2 (2026-10-17): the tools' shared logic (qa/tools/pf-asof-checks.mjs), imported as is.
  const pfs = async (j: { months: string[]; net_assets_from: string | null; series: { values: (number | null)[] }[] }) => {
    const c = seriesNetChecks(j, j.series[1].values, j.series[0].values, storedStart(await stored()));
    return { pfs20: c.pfs20, pfs18: c.pfs18 };
  };
  for (const asOf of [undefined, "2025-01", "2026-06", "2026-09", "2026-10"]) {
    it(`PFS-18 / PFS-20 pass with as-of ${asOf ?? "none"} on all / 24m / a range before and after the anchor`, async () => {
      await save(asOf);
      for (const range of [{ preset: "all" }, { preset: "24m" }, { from: "2025-01", to: "2025-06" }, { from: "2026-08", to: "2026-10" }])
        assert.deepEqual(await pfs(await series(range)), { pfs20: true, pfs18: true }, `${asOf} ${JSON.stringify(range)}`);
    });
  }
  it("PFX-06/07 follows the STORED asOf (QA finding 1): none → caveat, no note; set → the note naming it; wrong pairings fail", async () => {
    const id = (await (await handlePersonalFinanceReportsRequest(rq("POST", "/api/personal-finance/reports", { name: "PFX", report: REPORT }), as("alice"), () => OCT)).json()).id;
    const c = { caveat: NET_ASSETS_CAVEAT, suffix: AS_OF_SUFFIX, note: NET_ASSETS_AS_OF_NOTE };
    const texts: Record<string, string> = {};
    for (const asOf of [undefined, "2025-01"]) {
      await save(asOf);
      const got = storedAsOf(await stored());
      assert.equal(got, asOf ?? null);
      texts[String(asOf)] = (await exportText(id)).text;
      assert.equal(exportNetAssetsCheck(texts[String(asOf)], got, c).ok, true, String(asOf));
    }
    // The mutation QA asked for: a no-asOf account whose export prints the note (or an as-of account printing the
    // caveat) must fail the tool's check.
    assert.equal(exportNetAssetsCheck(texts["2025-01"], null, c).ok, false, "note printed without an as-of month");
    assert.equal(exportNetAssetsCheck(texts["undefined"], "2025-01", c).ok, false, "caveat printed with an as-of month");
    assert.equal(exportNetAssetsCheck(texts["2025-01"], "2025-02", c).ok, false, "the note must name the stored month");
  });
  it("the tools carry exactly these lines, the new visible text from pf-helpers, and still call the prod guard", () => {
    const s = tool("pf-series-api.mjs");
    assert.ok(s.includes("const nc = seriesNetChecks(j, na, sur, storedStart(record));") && s.includes("nc.pfs20, { from, ...nc });") && s.includes("nc.pfs18, { from });"));
    const e = tool("pf-export-api.mjs");
    assert.ok(e.includes("const asOf = storedAsOf((await (await request.fetch(`${base}/api/personal-finance`)).json())?.data ?? null);"));
    assert.ok(e.includes('const na = exportNetAssetsCheck(text.replace(/\\n/g, " "), asOf, { caveat: NET_ASSETS_CAVEAT, suffix: EXPORT_AS_OF_SUFFIX, note: NET_ASSETS_AS_OF_NOTE });') && e.includes("(!net || na.ok)"));
    const p = tool("personal-finance.mjs");
    assert.ok(p.includes(`"As of month", // #171`) && p.includes('import { AS_OF_ERROR, AS_OF_LABEL, AS_OF_PLACEHOLDER } from "./pf-helpers.mjs";'));
    assert.ok(tool("site-style-regression.mjs").includes(`"Starting net assets", "As of month", "Growth rate (%)"`));
    for (const t of ["pf-series-api.mjs", "pf-export-api.mjs", "personal-finance.mjs", "site-style-regression.mjs"]) assert.match(tool(t), /await refuseIfProd\(/, t);
  });
});

describe("#171 drift: contract section 11.1 equals the code", () => {
  it("every row of 11.1 equals its server / client constant", async () => {
    const { AS_OF_FIRST, AS_OF_RECORD_FIELD } = await import("./charts-api.ts");
    const doc = readFileSync(new URL("../../../attachments/pf-charts-api-contract.md", import.meta.url), "utf8");
    const sec = doc.slice(doc.indexOf("### 11.1"), doc.indexOf("### 11.2"));
    const rows = Object.fromEntries([...sec.matchAll(/^\| ([a-z-]+) \| (.+?) \|$/gm)].map((m) => [m[1], m[2]]));
    assert.deepEqual(rows, {
      "record-field": AS_OF_RECORD_FIELD,
      "first-month": AS_OF_FIRST,
      "record-error": INVALID_VALUE,
      "export-suffix": AS_OF_SUFFIX,
      "export-note": NET_ASSETS_AS_OF_NOTE,
    });
    // and the record API really answers with that field and message
    // (a malformed month: Invalid value. still; #171 Q-AG9 gave the bounds their own messages, table 11.2)
    const r = await putRecord(recordOf("2026-13"));
    assert.deepEqual(await r.json(), { error: rows["record-error"], field: rows["record-field"] });
  });
  it("#171 Q-AG9: every row of 11.2 equals the code and the record API sends it", async () => {
    const { RECORD_MESSAGES, errorCode } = await import("./charts-api.ts");
    const doc = readFileSync(new URL("../../../attachments/pf-charts-api-contract.md", import.meta.url), "utf8");
    const sec = doc.slice(doc.indexOf("### 11.2"), doc.indexOf("## 12."));
    const rows = [...sec.matchAll(/^\| `([^`]+)` \| (\d+) \| `([^`]+)` \| `([^`]+)` \| ([a-z_]+) \|$/gm)].map((m) => ({ msg: m[1], status: Number(m[2]), field: m[3], example: m[4], code: m[5] }));
    assert.deepEqual(rows.map((r) => r.msg).sort(), [MONTH_AFTER_CURRENT, MONTH_BEFORE_FIRST].sort());
    assert.deepEqual(Object.values(RECORD_MESSAGES).sort(), rows.map((r) => r.msg).sort(), "the typed client's copy");
    for (const row of rows) {
      const res = await putRecord(recordOf(row.example));
      assert.deepEqual([res.status, await res.json()], [row.status, { error: row.msg, field: row.field }], row.msg);
      assert.equal(errorCode(row.status, row.msg), row.code);
    }
  });
});

// #171 CFO round (2026-10-17): the new / changed signed-in QA expectations replayed through the real handlers, at the
// fixed clock and the real clock: pf-reports-api PFRC-06 and pf-report-api PFR-08 cap (the 24-month cap message), and
// the record API's as-of bound messages. The tools' case lines are pinned as text.
describe("#171 CFO round: QA tool replay (cap message, record bound messages)", () => {
  const tool = (f: string) => readFileSync(new URL(`../../../qa/tools/${f}`, import.meta.url), "utf8");
  const REP = { series: [{ kind: "group", id: "all" }], range: { preset: "12m" }, chart: "line" };
  for (const [label, at] of [["fixed clock", OCT], ["real clock", new Date()]] as const) {
    it(`${label}: PFRC-06 / PFR-08 cap: 2020-01..2022-01 → 400 '${RANGE_TOO_LONG}' (report.range / range); /series and /chart: 200 (no cap)`, async () => {
      const a = await handlePersonalFinanceReportsRequest(rq("POST", "/api/personal-finance/reports", { name: "ok", report: { ...REP, range: { from: "2020-01", to: "2022-01" } } }), as("bob"), () => at);
      assert.deepEqual([a.status, await a.json()], [400, { error: RANGE_TOO_LONG, field: "report.range" }]);
      const b = await handlePersonalFinanceReportRequest(rq("PUT", "/api/personal-finance/report", { report: { ...REP, range: { from: "2020-01", to: "2022-01" } } }), as("bob"), () => at);
      assert.deepEqual([b.status, await b.json()], [400, { error: RANGE_TOO_LONG, field: "range" }]);
      assert.equal((await handlePersonalFinanceSeriesRequest(rq("POST", "/api/personal-finance/series", { series: REP.series, range: { from: "2020-01", to: "2022-01" } }), as("bob"), () => at)).status, 200);
      assert.equal((await handlePersonalFinanceChartRequest(rq("POST", "/api/personal-finance/chart", { ...REP, range: { from: "2020-01", to: "2022-01" } }), as("bob"), () => at)).status, 200);
    });
  }
  it("the tools carry exactly these cases and still call the prod guard", () => {
    const r = tool("pf-reports-api.mjs");
    assert.ok(r.includes(`[{ name: "ok", report: { ...REP, range: { from: "2020-01", to: "2022-01" } } }, "report.range", RANGE_TOO_LONG]`));
    const p = tool("pf-report-api.mjs");
    assert.ok(p.includes(`["PFR-08 cap", { report: { ...REPORT, range: { from: "2020-01", to: "2022-01" } } }, 400, "range", RANGE_TOO_LONG],`));
    for (const t of [r, p]) assert.match(t, /await refuseIfProd\(/);
  });
});
