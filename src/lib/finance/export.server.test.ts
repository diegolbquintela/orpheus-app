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
import { inflateSync } from "node:zlib";
import { crc32, BG, FG, GLYPHS, LINES_NOTE, NET_ASSETS_CAVEAT, PNG_LAYOUT, exportFilename, pngText } from "./export.ts";
import { decodeReportId, exportDetail, maskCode } from "../access/audit.server.ts";
import { formatMoney } from "./money.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";
import { STORAGE_KEY, type Line } from "./expenses.ts";
import { MONTHS_KEY } from "./months.ts";
import { OVERVIEW_KEY } from "./overview.ts";

// #157 (spec section 39, PFX-01..PFX-03, PFX-05..PFX-19; PFX-04 is reserved, unused: spec 39.10): GET /api/personal-finance/reports/:id/export?format=pdf|png on PGlite (migrations 0010-0012,
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

  it("PFX-16: rows are unchanged by exports; the only audit rows are pf.report_export", async () => {
    const before = [await rowOf("alice"), await rowOf("bob")];
    const n = (await actions()).length;
    await ex("alice", "default", "pdf");
    await ex("alice", named, "png");
    assert.equal((await ex("bob", "default", "pdf")).status, 404, "bob has no default report: no row");
    assert.deepEqual([await rowOf("alice"), await rowOf("bob")], before);
    assert.deepEqual((await actions()).slice(n), ["pf.report_export", "pf.report_export"]);
  });

  const audits = async (after: number) =>
    (await pg.query<{ id: number; actor: string; role: string; action: string; target: string | null; outcome: string; detail: string | null }>(
      "SELECT id, actor, role, action, target, outcome, detail FROM audit_event WHERE id > $1 ORDER BY id", [after])).rows;
  const top = async () => Number((await pg.query<{ m: number | null }>("SELECT max(id) AS m FROM audit_event")).rows[0]?.m ?? 0);

  it("PFX-17: one pf.report_export row per successful pdf / png GET, with the id, format and actor (as pf.report_save)", async () => {
    const t = await top();
    await ex("alice", "default", "pdf");
    await ex("alice", named, "png");
    const bobs = (await (await list("bob", "GET")).json()).reports.find((r: { id: string }) => r.id !== "default").id;
    await ex("bob", bobs, "pdf");
    const rows = await audits(t);
    assert.deepEqual(rows.map(({ id: _id, ...r }) => r), [
      { actor: "owner", role: "owner", action: "pf.report_export", target: null, outcome: "ok", detail: "format:pdf id:default" },
      { actor: "owner", role: "owner", action: "pf.report_export", target: null, outcome: "ok", detail: exportDetail("png", named) },
      { actor: maskCode("p", "bob"), role: "cfo", action: "pf.report_export", target: null, outcome: "ok", detail: exportDetail("pdf", bobs) },
    ]);
    assert.equal(decodeReportId(rows[1].detail!.split(" id:")[1]), named);
    assert.match(rows[1].detail!, /^[a-z_:+ A-Z]{1,40}$/, "fits the 0012 detail CHECK");
    // same actor fields as pf.report_save: save a report as bob and compare actor / role
    const t2 = await top();
    await list("bob", "POST", { name: "Bob two", report: R() });
    const save = (await audits(t2)).find((r) => r.action === "pf.report_save")!;
    assert.deepEqual([save.actor, save.role], [rows[2].actor, rows[2].role]);
  });

  it("PFX-17: no audit row for 404 / 403 / 401 / 400 / 405 / HEAD", async () => {
    const t = await top();
    await ex("alice", "r-00000000", "pdf");
    await ex("dave", "default", "pdf");
    await ex(null, "default", "pdf");
    await ex("alice", "default", "svg");
    await ex("alice", "default", "pdf", "POST");
    assert.equal((await ex("alice", "default", "png", "HEAD")).status, 200);
    assert.deepEqual((await audits(t)).filter((r) => r.action === "pf.report_export"), []);
  });

  it("PFX-19 (CFO, 2026-10-17): audit insert fails → 503 JSON, no-store, no file bytes, failure logged; HEAD still 200, no row", async () => {
    const t = await top();
    const failing = { query: async (text: string, params?: unknown[]) => {
      if (/INSERT INTO audit_event/.test(text)) throw new Error("audit down");
      return (await pg.query(text, params)).rows;
    } };
    const broken = { ...as("alice"), getDb: async () => failing };
    const logged: string[] = [];
    const err = console.error;
    console.error = (...m: unknown[]) => void logged.push(m.map(String).join(" "));
    try {
      for (const f of ["pdf", "png"]) {
        const r = await handlePersonalFinanceReportExportRequest(req("GET", undefined, `/api/personal-finance/reports/default/export?format=${f}`), "default", broken as never, () => NOW);
        assert.equal(r.status, 503, f);
        assert.match(r.headers.get("content-type") ?? "", /^application\/json/);
        assert.equal(r.headers.get("cache-control"), "no-store");
        assert.equal(r.headers.get("content-disposition"), null);
        const raw = await bytes(r);
        assert.deepEqual(JSON.parse(raw.toString("utf8")), { error: "Export unavailable. Try again." });
        assert.ok(!raw.subarray(0, 8).toString("latin1").startsWith("%PDF") && raw[0] !== 0x89, "no file bytes");
        assert.ok(raw.length < 64, "only the short JSON");
      }
      assert.deepEqual(logged, ["[audit] could not record pf.report_export", "[audit] could not record pf.report_export"]);
      assert.ok(!logged.join().includes("alice") && !logged.join().includes("default"), "no person or report in the log");
      const h = await handlePersonalFinanceReportExportRequest(req("HEAD", undefined, "/api/personal-finance/reports/default/export?format=pdf"), "default", broken as never, () => NOW);
      assert.equal(h.status, 200, "HEAD writes nothing, so it answers even with audit down");
      assert.equal(h.headers.get("content-type"), "application/pdf");
      assert.equal((await h.arrayBuffer()).byteLength, 0);
      assert.equal(logged.length, 2, "HEAD tried no insert");
    } finally {
      console.error = err;
    }
    assert.deepEqual(await audits(t), [], "no row from the failed GETs or HEAD");
    const ok = await ex("alice", "default", "pdf");
    assert.equal(ok.status, 200, "audit back → exports again");
    assert.deepEqual((await audits(t)).map((r) => r.action), ["pf.report_export"]);
  });

  it("#161 Q-AK13 (CFO, 2026-10-20): a read-only (Read grant) export keeps the #157 rule: audited, and fails closed when the audit row can't be written", async () => {
    // Saved reports are the viewer's own (spec 38); bob (Read grant) saves his own default over the owner's figures.
    assert.equal((await rep("bob", "PUT", { report: NET })).status, 200, "a Read grant keeps its own report");
    const t = await top();
    const okR = await ex("bob", "default", "pdf");
    assert.equal(okR.status, 200, "Read grant may export");
    const rows = await audits(t);
    assert.deepEqual(rows.map((r) => r.action), ["pf.report_export"], "audited");
    const t2 = await top();
    const failing = { query: async (text: string, params?: unknown[]) => {
      if (/INSERT INTO audit_event/.test(text)) throw new Error("audit down");
      return (await pg.query(text, params)).rows;
    } };
    const broken = { ...as("bob"), getDb: async () => failing };
    const err = console.error;
    console.error = () => {};
    try {
      for (const f of ["pdf", "png"]) {
        const r = await handlePersonalFinanceReportExportRequest(req("GET", undefined, `/api/personal-finance/reports/default/export?format=${f}`), "default", broken as never, () => NOW);
        assert.equal(r.status, 503, f);
        assert.equal(r.headers.get("content-disposition"), null, "no file");
        assert.deepEqual(await r.json(), { error: "Export unavailable. Try again." });
      }
    } finally {
      console.error = err;
    }
    assert.deepEqual(await audits(t2), [], "no row from the failed read-only GETs");
  });

  it("Q-AD14 (CFO, 2026-10-17): the encoded report id round-trips losslessly and always fits the audit detail CHECK", () => {
    const CHECK = /^[a-z_:+ A-Z]{1,40}$/;
    const enc = (id: string) => exportDetail("png", id).slice("format:png id:".length);
    const ok = (id: string) => {
      const e = enc(id);
      assert.equal(decodeReportId(e), id, id);
      assert.match(`format:png id:${e}`, CHECK, id);
      assert.match(`format:pdf id:${e}`, CHECK, id);
    };
    // per character: the alphabet of ids ("default", "r-", hex) maps injectively, each image decodes back, and no
    // image is itself another input character left unchanged (so the per-character map is a bijection onto its image).
    const alphabet = [..."0123456789abcdef-r", ..."default"].filter((c, i, a) => a.indexOf(c) === i);
    const images = alphabet.map((c) => enc(c));
    assert.equal(new Set(images).size, alphabet.length, "injective");
    images.forEach((im, i) => {
      assert.equal(im.length, 1);
      assert.equal(decodeReportId(im), alphabet[i]);
    });
    const hex = "0123456789abcdef";
    ok("default");
    for (let pos = 0; pos < 8; pos++) for (const c of hex) ok(`r-${"0".repeat(pos)}${c}${"0".repeat(7 - pos)}`);
    for (let pos = 0; pos < 8; pos++) for (const c of hex) ok(`r-${"f".repeat(pos)}${c}${"f".repeat(7 - pos)}`);
    for (const id of ["r-00000000", "r-99999999", "r-12345678", "r-aaaaaaaa", "r-ffffffff", "r-abcdefab", "r-0f0f0f0f", "r-f0f0f0f0", "r-09af09af"]) ok(id);
    let x = 0x157;
    const rnd = () => {
      x = (x + 0x6d2b79f5) | 0;
      let t = Math.imul(x ^ (x >>> 15), 1 | x);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const seen = new Map<string, string>();
    for (let i = 0; i < 10_000; i++) {
      const id = `r-${Array.from({ length: 8 }, () => hex[Math.floor(rnd() * 16)]).join("")}`;
      ok(id);
      const e = enc(id);
      assert.ok(!seen.has(e) || seen.get(e) === id, "no two ids share a code");
      seen.set(e, id);
    }
  });

  const pixels = (b: Buffer) => {
    const p = readPng(b, crc32);
    let at = 8;
    const idat: Buffer[] = [];
    while (at < b.length) {
      const len = b.readUInt32BE(at);
      if (b.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(b.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const rowLen = 1 + 3 * p.width;
    return { p, rgb: (x: number, y: number) => [...raw.subarray(y * rowLen + 1 + x * 3, y * rowLen + 4 + x * 3)] };
  };
  // Every pixel of the glyph cells for `text` at header line `line` is exactly FG where the 5x7 font has a dot and BG elsewhere.
  const drawnAt = (b: Buffer, text: string, x0: number, y0: number) => {
    const { S, ADV } = PNG_LAYOUT;
    const { rgb } = pixels(b);
    return [...text].every((ch, n) => {
      const g = GLYPHS[ch];
      if (!g) return false;
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 6; c++) {
          const on = c < 5 && (parseInt(g.slice(r * 2, r * 2 + 2), 16) & (1 << (4 - c))) !== 0;
          for (let dy = 0; dy < S; dy++)
            for (let dx = 0; dx < S; dx++)
              if (rgb(x0 + n * ADV + c * S + dx, y0 + r * S + dy).join() !== (on ? FG : BG).join()) return false;
        }
      return true;
    });
  };
  const drawn = (b: Buffer, text: string, line: number) => drawnAt(b, text, PNG_LAYOUT.M, PNG_LAYOUT.M + line * PNG_LAYOUT.LH);

  it("PFX-18: bar / stacked-bar reports: the PNG draws 'Rendered as lines' (pixels and tEXt) and the PDF prints it; line reports don't", async () => {
    assert.equal(LINES_NOTE, "Rendered as lines");
    for (const chart of ["bar", "stacked-bar"]) {
      assert.equal((await rep("alice", "PUT", { report: R(chart) })).status, 200);
      const png = await bytes(await ex("alice", "default", "png"));
      assert.ok(drawn(png, LINES_NOTE, 2), `${chart}: note pixels at header line 3`);
      assert.equal(readPng(png, crc32).text["orpheus-note"], LINES_NOTE);
      const t = readPdf(await bytes(await ex("alice", "default", "pdf"))).text;
      assert.equal(t[2], LINES_NOTE, chart);
    }
    assert.equal((await rep("alice", "PUT", { report: R("line") })).status, 200);
    const png = await bytes(await ex("alice", "default", "png"));
    assert.ok(!drawn(png, LINES_NOTE, 2));
    assert.ok(drawn(png, "As of", 2), "the control: line 3 is the as-of line");
    assert.equal(readPng(png, crc32).text["orpheus-note"], undefined);
    assert.ok(!readPdf(await bytes(await ex("alice", "default", "pdf"))).text.includes(LINES_NOTE));
  });

  it("F3 (QA 2026-10-17): the font covers printable ASCII with distinct glyphs; non-ASCII has none (prints ?)", () => {
    for (let c = 32; c < 127; c++) assert.match(GLYPHS[String.fromCharCode(c)] ?? "", /^[0-9a-f]{14}$/, `glyph for ${String.fromCharCode(c)}`);
    const bitmaps = Object.values(GLYPHS);
    assert.equal(new Set(bitmaps).size, bitmaps.length, "no two characters share a bitmap (case and punctuation are distinguishable)");
    assert.equal(GLYPHS["\u00e9"], undefined);
  });

  it("F3 (QA 2026-10-17): the PNG draws every header and legend line verbatim, incl. the 36.11 caveat, glyph by glyph", async () => {
    assert.equal((await rep("alice", "PUT", { report: { ...NET, chart: "bar" } })).status, 200);
    const b = await bytes(await ex("alice", "default", "png"));
    const d = readPng(b, crc32).data;
    const { head, leg, legendY } = pngText(d, { name: "Default", generatedAt: NOW.toISOString() });
    const { M, ADV, LH } = PNG_LAYOUT;
    const caveat = head.slice(head.findIndex((l) => l.startsWith("Caveat: ")));
    const joined = caveat.slice(0, caveat.findIndex((l) => l.startsWith("Mixed axes")) >>> 0 || caveat.length).join(" ");
    assert.ok(joined.startsWith(`Caveat: ${NET_ASSETS_CAVEAT}`), joined);
    assert.ok(head.join("").includes(";") && head.join("").includes("'"), "the caveat's ; and ' are in the text");
    assert.ok(!head.join("").includes("?") && !leg.join("").includes("?"), "no ? anywhere");
    assert.ok(head.includes(LINES_NOTE), "the lines note");
    head.forEach((l, i) => assert.ok(drawn(b, l, i), `header line ${i + 1}: ${l}`));
    assert.ok(drawnAt(b, "Series", M, legendY - LH));
    leg.forEach((l, i) => assert.ok(drawnAt(b, l, M + 4 * ADV, legendY + i * LH), `legend line ${i + 1}: ${l}`));
    assert.ok(leg.some((l) => l.includes("Travel (deleted)")), "labels keep their case");
    assert.ok(!drawn(b, head[0].toUpperCase(), 0), "not uppercased any more");
  });

  it("F3 / Q-AD5: non-ASCII still prints as ? in the PNG", async () => {
    const b = await bytes(await ex("alice", named, "png"));
    assert.ok(drawn(b, "Orpheus - Personal Finance report: Spend ?t?", 0));
  });

  it("Q-AD7: the filename date is the generation day in Toronto", () => {
    assert.equal(exportFilename("Default", "2026-11-01T02:00:00.000Z", "pdf"), "orpheus-report-default-2026-10-31.pdf");
    assert.equal(exportFilename("Default", "2026-10-16T16:00:00.000Z", "png"), "orpheus-report-default-2026-10-16.png");
  });
});
