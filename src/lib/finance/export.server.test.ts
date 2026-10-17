import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  handlePersonalFinanceReportExportRequest,
  handlePersonalFinanceChartRequest,
  handlePersonalFinanceReportRequest,
  handlePersonalFinanceReportsRequest,
  handlePersonalFinanceRequest,
} from "./account.server.ts";
import { crc32 } from "./export.ts";
import { formatMoney } from "./money.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { OVERVIEW_KEY } from "./overview.ts";

// #157 (spec section 39, PFX-01..PFX-16): GET /api/personal-finance/reports/:id/export?format=pdf|png on PGlite (migrations 0010-0012,
// unchanged) with a fake session lookup and a fixed clock. alice owns; bob is a CFO with Read; dave has no Personal
// Finance grant. Runs under TZ=UTC and TZ=America/Los_Angeles (npm test both ways): the household month is Toronto's.
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "alice@example.com" };
const as = (id: string | null, e: Record<string, string> = env) => ({
  env: e,
  getUser: async () => (id ? { id, email: `${id}@example.com` } : null),
  getDb: async () => db,
});
const NOW = new Date("2026-10-16T16:00:00Z");
const req = (method: string, body?: unknown, path = "/api/personal-finance/series") =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const ch = (who: string | null, body?: unknown, method = "POST", now = NOW, e = env) =>
  handlePersonalFinanceChartRequest(req(method, body, "/api/personal-finance/chart"), as(who, e), () => now);
const rep = (who: string, method: string, body?: unknown) =>
  handlePersonalFinanceReportRequest(req(method, body, "/api/personal-finance/report"), as(who));
const L = (id: string, amount: string, category = "", account = ""): Line => ({ id, name: id, amount, per: "month", equity: "", account, currency: "", rate: "", category });
const record = {
  [STORAGE_KEY]: JSON.stringify({
    fixed: [L("rent", "1000", "Home", "Chequing")],
    variable: [],
    accounts: ["Chequing"],
    categories: ["Home"],
    deletedCategories: [{ name: "Travel", from: "2026-06" }],
    deletedAccounts: [{ name: "Amex", from: "2026-06" }],
  }),
  [MONTHS_KEY]: JSON.stringify({
    "2020-01": { fixed: [L("rent", "900", "Home", "Chequing")], variable: [L("t", "100", "Travel", "Amex")], people: [] },
    "2026-03": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [L("t", "200", "Travel", "Amex")], people: [] },
    "2026-09": { fixed: [L("rent", "1000", "Home", "Chequing")], variable: [], people: [] },
  }),
  // #154 Q-AA4 change: typed Update totals (income) in months without lines, for the net-assets checks.
  [OVERVIEW_KEY]: JSON.stringify({ start: "10000", growth: "", future: false, years: 1, months: { "2025-01": { expenses: "500", income: "800" }, "2025-03": { expenses: "500", income: "700" } } }),
};

before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob", "dave"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('bob', 'personal_finance', true, false, 'alice'), ('dave', 'dashboard', true, true, 'alice')`);
  const r = await handlePersonalFinanceRequest(req("PUT", { data: record }, "/api/personal-finance"), as("alice"));
  assert.equal(r.status, 200);
});

const list = (who: string | null, method = "GET", body?: unknown, e = env) =>
  handlePersonalFinanceReportsRequest(req(method, body, "/api/personal-finance/reports"), as(who, e));
const rowOf = async (id: string) => (await pg.query<{ data: Record<string, string> }>("SELECT data FROM personal_finance WHERE user_id = $1", [id])).rows[0]?.data ?? null;
const actions = async () => (await pg.query<{ action: string }>("SELECT action FROM audit_event ORDER BY id")).rows.map((r) => r.action);
const M = (id: string) => ({ kind: "metric", id });
const R = (chart = "line", id = "all") => ({ series: [{ kind: "group", id }], range: { preset: "12m" }, chart });

const ex = (who: string | null, id: string, format?: string, method = "GET", now = NOW, e = env) =>
  handlePersonalFinanceReportExportRequest(
    req(method, undefined, `/api/personal-finance/reports/${id}/export${format ? `?format=${format}` : ""}`),
    id,
    as(who, e),
    () => now,
  );
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());
const chartOf = async (who: string, id: string) => (await ch(who, { saved: true, id })).json();
const NET = { series: [{ kind: "category", id: "Travel" }, M("expenses"), M("net-assets")], range: { from: "2024-11", to: "2025-10" }, chart: "line" };

describe("#157 /api/personal-finance/reports/:id/export", () => {
  let named = "";
  it("setup: alice saves a default report (net assets) and a named one (flows only)", async () => {
    assert.equal((await rep("alice", "PUT", { report: NET })).status, 200);
    const r = await list("alice", "POST", { name: "Spend été", report: { series: [{ kind: "category", id: "Home" }, { kind: "group", id: "all" }], range: { preset: "12m" }, chart: "stacked-bar" } });
    assert.equal(r.status, 201);
    named = (await r.json()).id;
  });

  it("PFX-01: flag off 404; signed out 401; POST 405; no Personal Finance grant 403", async () => {
    assert.equal((await ex("alice", "default", "pdf", "GET", NOW, {} as typeof env)).status, 404);
    assert.equal((await ex(null, "default", "pdf")).status, 401);
    assert.equal((await ex("alice", "default", "pdf", "POST")).status, 405);
    assert.equal((await ex("dave", "default", "pdf")).status, 403);
  });

  it("PFX-02: PDF: 200, application/pdf, attachment filename, no-store, nosniff; a valid PDF (header, xref, %%EOF)", async () => {
    const r = await ex("alice", "default", "pdf");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    assert.equal(r.headers.get("content-disposition"), 'attachment; filename="orpheus-report-default-2026-10-16.pdf"');
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    const b = await bytes(r);
    assert.equal(b.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.equal(Number(r.headers.get("content-length")), b.length);
    const p = readPdf(b);
    assert.ok(p.pages >= 1);
  });

  it("PFX-03: PNG: 200, image/png; a valid PNG (magic, CRCs, 8-bit RGB, IDAT inflates to the right size)", async () => {
    const r = await ex("alice", named, "png");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("content-disposition"), 'attachment; filename="orpheus-report-spend-t-2026-10-16.png"');
    const b = await bytes(r);
    assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const p = readPng(b, crc32);
    assert.equal(p.width, 1200);
    assert.ok(p.height > 400);
  });

  it("PFX-05: both files embed exactly what /chart { saved: true, id } returns (default and named)", async () => {
    for (const id of ["default", named]) {
      const chart = await chartOf("alice", id);
      assert.deepEqual(readPdf(await bytes(await ex("alice", id, "pdf"))).data, chart, `${id} pdf`);
      assert.deepEqual(readPng(await bytes(await ex("alice", id, "png")), crc32).data, chart, `${id} png`);
    }
  });

  it("PFX-06 / PFX-08: the PDF prints as-of, generation time, FX basis, and every row's values as /chart's, formatted", async () => {
    const chart = await chartOf("alice", "default");
    const p = readPdf(await bytes(await ex("alice", "default", "pdf")));
    const t = p.text;
    assert.ok(t.includes("As of: 2026-10 (current month not in range) - Generated: 2026-10-16T16:00:00.000Z"), t.slice(0, 6).join("|"));
    assert.ok(t.includes("FX basis: current (every month is valued at today's rates, not historical rates)"));
    for (const row of chart.rows) {
      const at = t.indexOf(row.month);
      assert.ok(at > 0, row.month);
      assert.deepEqual(t.slice(at + 1, at + 1 + row.values.length), row.values.map((v: number | null) => (v === null ? "-" : formatMoney(v))), row.month);
    }
    assert.ok(t.includes(formatMoney(10500)), "net assets 2025-03");
  });

  it("PFX-07: with net assets: Net assets from and the 36.11 caveat, verbatim; without: neither", async () => {
    const t = readPdf(await bytes(await ex("alice", "default", "pdf"))).text;
    assert.ok(t.includes("Net assets from: 2020-01"));
    const joined = t.join(" ");
    assert.ok(joined.includes("Caveat: Starting net assets is defined at the Overview window start but anchored here at the first data month, so the absolute level can be off by the surplus between those dates. The month-to-month shape is right; the level isn't trustworthy until an explicit as-of month is stored (follow-up ticket)."));
    assert.ok(joined.includes("Mixed axes: net assets (a level) share this chart with flows (amounts per month)."));
    const n = readPdf(await bytes(await ex("alice", named, "pdf"))).text.join(" ");
    assert.ok(!n.includes("Caveat:") && !n.includes("Net assets from") && !n.includes("Mixed axes"));
    assert.ok(n.includes("As of: 2026-10 (current month included, partial)"));
  });

  it("PFX-09: unknown id, malformed id or another person's report → 404 Report not found.", async () => {
    const bobs = await (await list("bob", "POST", { name: "Bob's", report: R() })).json();
    for (const [who, id] of [["alice", "r-00000000"], ["alice", "nope"], ["alice", bobs.id], ["bob", "default"]]) {
      const r = await ex(who, id, "pdf");
      assert.equal(r.status, 404, `${who} ${id}`);
      assert.deepEqual(await r.json(), { error: "Report not found." });
    }
    assert.equal((await ex("bob", bobs.id, "png")).status, 200, "a Read CFO exports their own");
  });

  it("PFX-10: missing or unknown format → 400 { error: 'Invalid value.', field: 'format' }", async () => {
    for (const f of [undefined, "svg", "PDF", ""]) {
      const r = await ex("alice", "default", f);
      assert.equal(r.status, 400, String(f));
      assert.deepEqual(await r.json(), { error: "Invalid value.", field: "format" });
    }
  });

  it("PFX-11: names and labels are ASCII in the files (other characters print as ?)", async () => {
    const t = readPdf(await bytes(await ex("alice", named, "pdf"))).text;
    assert.equal(t[0], "Orpheus - Personal Finance report: Spend ?t?");
  });

  it("PFX-12: #165 deleted names keep their (deleted) label in the legend", async () => {
    const t = readPdf(await bytes(await ex("alice", "default", "pdf"))).text;
    assert.ok(t.includes("1. Travel (deleted) (category, flow)"), t.filter((x) => x.startsWith("1.")).join("|"));
  });

  it("PFX-13: the household month is Toronto's whatever the process timezone (Nov 1 02:00 UTC is still October)", async () => {
    const t = readPdf(await bytes(await ex("alice", named, "pdf", "GET", new Date("2026-11-01T02:00:00Z")))).text;
    assert.ok(t.some((x) => x.startsWith("As of: 2026-10 ")));
  });

  it("PFX-14 (Q-AD10): 12 series x 24 months stays small and quick (PDF < 100 KB, PNG < 600 KB, each < 2 s)", async () => {
    const series = [
      ...["Home", "Travel"].map((id) => ({ kind: "category", id })),
      ...["fixed", "variable", "all"].map((id) => ({ kind: "group", id })),
      ...["income", "expenses", "surplus", "net-assets"].map((id) => M(id)),
      { kind: "line", id: "rent" }, { kind: "line", id: "t" }, { kind: "account", id: "Chequing" },
    ];
    assert.equal((await rep("alice", "PUT", { report: { series, range: { from: "2024-11", to: "2026-10" }, chart: "line" } })).status, 200);
    for (const [f, max] of [["pdf", 100_000], ["png", 600_000]] as const) {
      const t0 = Date.now();
      const b = await bytes(await ex("alice", "default", f));
      const ms = Date.now() - t0;
      assert.ok(b.length < max, `${f} ${b.length} bytes`);
      assert.ok(ms < 2000, `${f} ${ms} ms`);
      const d = (f === "pdf" ? readPdf(b) : readPng(b, crc32)).data;
      assert.deepEqual(d, await chartOf("alice", "default"));
    }
  });

  it("PFX-15: HEAD answers the headers without a body", async () => {
    const r = await ex("alice", "default", "pdf", "HEAD");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    assert.equal((await r.arrayBuffer()).byteLength, 0);
  });

  it("PFX-16 (Q-AD11): read-only: the rows and the audit log are unchanged by exports", async () => {
    const before = [await rowOf("alice"), await rowOf("bob"), await actions()];
    await ex("alice", "default", "pdf");
    await ex("alice", named, "png");
    await ex("bob", "default", "pdf");
    assert.deepEqual([await rowOf("alice"), await rowOf("bob"), await actions()], before);
  });
});
