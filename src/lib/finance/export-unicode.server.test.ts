import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, statSync } from "node:fs";
import {
  handlePersonalFinanceReportExportRequest,
  handlePersonalFinanceReportsRequest,
  handlePersonalFinanceRequest,
} from "./account.server.ts";
import { chartData } from "./chart.ts";
import {
  BG,
  FONT_BOLD,
  FONT_REGULAR,
  FG,
  PDF_FONT_NAMES,
  PNG_LAYOUT,
  PNG_TEXT,
  ascii,
  asciiName,
  crc32,
  exportFilename,
  over,
  paintText,
  pdfTextWidth,
  pngText,
  printable,
} from "./export.ts";
import { NOTO_SANS_BOLD_B64, NOTO_SANS_REGULAR_B64 } from "./fonts/noto-sans-subset.ts";
import { goldenCases } from "./export-golden/capture.ts";
import { goldenCrops, rawRgb, sha256 } from "./export-golden/crops.ts";
import { U1, U2, U3, U4, U5, U6, U7, U_ACCOUNT, U_FALLBACK_NAME, U_FALLBACK_REPORT, U_NAME, U_NOW, U_RECORD, U_REPORT } from "./export-golden/fixture-u.ts";
import { readPdf, readPng } from "../../../qa/tools/export-parse.mjs";

// #176 (spec 50, PFU-01..PFU-23): Unicode text in the PF exports, on PGlite (migrations 0010-0012) with a fake session
// and the fixture U clock (2026-10-21T12:00Z, Toronto month 2026-10; the report covers the closed months 2026-07..09).
// olga owns the household; cfo has a Read grant (qa-cfo-read); nog has no Personal Finance grant.
// Runs under TZ=UTC and TZ=America/Los_Angeles (npm test both ways).
const pg = new PGlite();
const db = { query: async <T>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows };
const env = { DASHBOARD_ENABLED: "true", ORPHEUS_OWNER_EMAIL: "olga@example.com" };
const as = (id: string) => ({ env, getUser: async () => ({ id, email: `${id}@example.com` }), getDb: async () => db });
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ex = (who: string, id: string, format: "pdf" | "png") =>
  handlePersonalFinanceReportExportRequest(req("GET", `/api/personal-finance/reports/${id}/export?format=${format}`), id, as(who), () => U_NOW);
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());
const fontDir = new URL("./fonts/", import.meta.url);
const cps = (s: string) => [...s].map((c) => c.codePointAt(0) ?? 0);
/** Every code point spec 50.1 covers. */
const COVERED = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => 0x20 + i),
  ...Array.from({ length: 0x17f - 0xa0 + 1 }, (_, i) => 0xa0 + i),
  0x2013, 0x2014, 0x2026, 0x20ac, 0x2212, 0x20a9,
];

let uid = "";
let fbid = "";
before(async () => {
  await pg.exec('CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT \'\', email TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of ["0010_personal_finance.sql", "0011_access.sql", "0012_audit.sql"])
    await pg.exec(readFileSync(new URL(`../../../migrations/${f}`, import.meta.url), "utf8"));
  for (const id of ["olga", "cfo", "nog"]) await pg.query('INSERT INTO "user" (id, email) VALUES ($1, $2)', [id, `${id}@example.com`]);
  await pg.exec(`INSERT INTO access_grant (user_id, surface, can_read, can_write, granted_by) VALUES
    ('cfo', 'personal_finance', true, false, 'olga'), ('nog', 'dashboard', true, true, 'olga')`);
  assert.equal((await handlePersonalFinanceRequest(req("PUT", "/api/personal-finance", { data: U_RECORD }), as("olga"))).status, 200);
  const post = async (name: string, report: unknown) => {
    const r = await handlePersonalFinanceReportsRequest(req("POST", "/api/personal-finance/reports", { name, report }), as("olga"));
    assert.equal(r.status, 201, name);
    return (await r.json()).id as string;
  };
  uid = await post(U_NAME, U_REPORT);
  fbid = await post(U_FALLBACK_NAME, U_FALLBACK_REPORT);
});

const pdfOf = async (id: string) => {
  const b = await bytes(await ex("olga", id, "pdf"));
  return { b, s: b.toString("latin1"), p: readPdf(b) };
};
const pngOf = async (id: string) => bytes(await ex("olga", id, "png"));
/** PNG pixels equal the rasterizer's own painting of `text` at (x0, y0) (Q-AO10). */
const drawnAt = (png: Buffer, text: string, x0: number, y0: number) => {
  const { at } = rawRgb(png);
  const ref = new Map<string, number[]>();
  paintText((x, y, c, a) => ref.set(`${x},${y}`, over(ref.get(`${x},${y}`) ?? BG, c, a)), text, x0, y0);
  return ref.size > 0 && [...ref].every(([k, v]) => [...at(...(k.split(",").map(Number) as [number, number]))].join() === v.join());
};
const cell = (ch: string, font = FONT_REGULAR) => {
  const bm = font.raster(font.glyphId(ch.codePointAt(0) ?? 0), PNG_TEXT.PX);
  return `${bm.left},${bm.top},${bm.w},${bm.h}:${Buffer.from(bm.alpha).toString("hex")}`;
};

describe("#176 PF export: Unicode text (spec 50)", () => {
  it("PFU-01: PDF text is verbatim: the name U1, the legend U2 and the account (U3 + U4), CAD, no ?", async () => {
    const { p } = await pdfOf(uid);
    assert.equal(p.text[0], `Orpheus - Personal Finance report: ${U1}`);
    assert.ok(p.text.includes(`1. ${U2} (category, flow)`), p.text.join("|"));
    assert.ok(p.text.includes(`2. Konto ${U3} ${U4} (account, flow)`), p.text.join("|"));
    assert.equal(p.text[1], "Chart: line - Range: 2026-07 to 2026-09 - Currency: CAD");
    assert.equal(p.text[2], "As of: 2026-10 (current month not in range) - Generated: 2026-10-21T12:00:00.000Z");
    assert.ok(!p.text.join("").includes("?"));
    const rows = p.text.slice(p.text.indexOf("Month"));
    assert.deepEqual(rows, ["Month", "1", "2", "2026-07", "1,234.56", "789.00", "2026-08", "1,234.56", "789.00", "2026-09", "1,234.56", "789.00"]);
  });

  it("PFU-02: PDF fonts are embedded Type0 / Identity-H with ToUnicode and FontFile2; no Helvetica; U1-U3 all have glyphs", async () => {
    const { s } = await pdfOf(uid);
    assert.equal((s.match(/\/Subtype \/Type0 /g) ?? []).length, 2);
    assert.equal((s.match(/\/Encoding \/Identity-H/g) ?? []).length, 2);
    assert.equal((s.match(/\/Subtype \/CIDFontType2 /g) ?? []).length, 2);
    assert.equal((s.match(/\/FontFile2 \d+ 0 R/g) ?? []).length, 2);
    assert.equal((s.match(/\/ToUnicode \d+ 0 R/g) ?? []).length, 2);
    for (const n of PDF_FONT_NAMES) assert.ok(s.includes(`/BaseFont /${n} `), n);
    assert.ok(!s.includes("Helvetica") && !s.includes("WinAnsiEncoding"));
    for (const font of [FONT_REGULAR, FONT_BOLD]) for (const cp of cps(U1 + U2 + U3 + U4)) assert.notEqual(font.glyphId(cp), 0, `U+${cp.toString(16)}`);
  });

  it("PFU-03: PDF widths: /W equals hmtx; right-aligned cells end on the column edge (constants in spec 50.9)", async () => {
    const { s } = await pdfOf(uid);
    const ws = [...s.matchAll(/\/W \[0 \[([\d ]+)\]\]/g)].map((m) => m[1].split(" ").map(Number));
    assert.equal(ws.length, 2);
    [FONT_REGULAR, FONT_BOLD].forEach((font, k) => assert.deepEqual(ws[k], Array.from({ length: font.numGlyphs }, (_, g) => font.advance(g))));
    assert.equal(FONT_REGULAR.unitsPerEm, 1000);
    assert.equal(pdfTextWidth("1,234.56", 7).toFixed(3), "27.776");
    assert.equal(pdfTextWidth("789.00", 7).toFixed(3), "21.896");
    assert.equal(pdfTextWidth("2", 7, FONT_BOLD).toFixed(3), "4.004");
    assert.equal(pdfTextWidth("Month", 7, FONT_BOLD).toFixed(3), "23.114");
    // Columns: M 36, month 60, colW min(90, (842 - 72 - 60) / 2) = 90 → right edges 182 and 272.
    const hex = (t: string) => [...t].map((c) => FONT_REGULAR.glyphId(c.codePointAt(0) ?? 0).toString(16).padStart(4, "0")).join("");
    for (const [t, right] of [["1,234.56", 182], ["789.00", 272]] as const) {
      const m = new RegExp(`/F1 7 Tf ([\\d.]+) [\\d.]+ Td <${hex(t)}> Tj`).exec(s);
      assert.ok(m, t);
      assert.ok(Math.abs(Number(m[1]) + pdfTextWidth(t, 7) - right) <= 0.5, `${t} ends at ${Number(m[1]) + pdfTextWidth(t, 7)}`);
    }
  });

  it("PFU-04: PNG: header line 1 and both legend lines are painted verbatim, not their ascii() form", async () => {
    const png = await pngOf(uid);
    const { M, LH, ADV } = PNG_LAYOUT;
    const d = readPng(png, crc32).data;
    const { head, leg, legendY } = pngText(d, { name: U_NAME, generatedAt: U_NOW.toISOString() });
    assert.equal(head[0], `Orpheus - Personal Finance report: ${U1}`);
    assert.deepEqual(leg, [`1. ${U2} (category, flow)`, `2. ${U_ACCOUNT} (account, flow)`]);
    assert.ok(drawnAt(png, head[0], M, M));
    assert.ok(!drawnAt(png, ascii(head[0]), M, M), "not the ? form");
    leg.forEach((l, i) => {
      assert.ok(drawnAt(png, l, M + 4 * ADV, legendY + i * LH), l);
      assert.ok(!drawnAt(png, ascii(l), M + 4 * ADV, legendY + i * LH), `not ascii: ${l}`);
    });
  });

  it("PFU-05: PNG accents: é≠e, Ł≠L, Ő≠O, ß≠B, and no accented letter of U1 / U2 is the ? cell", () => {
    for (const [a, b] of [["é", "e"], ["Ł", "L"], ["Ő", "O"], ["ß", "B"]]) assert.notEqual(cell(a), cell(b), `${a} vs ${b}`);
    const q = cell("?");
    for (const ch of "ÉéèüÑúØßŁóźŠČŒĞİşŐ") assert.notEqual(cell(ch), q, ch);
  });

  it("PFU-06: currency signs € £ ¥ ₩ are distinct glyphs, none is ?; R$ is R then $", () => {
    const cells = ["€", "£", "¥", "₩"].map((c) => cell(c));
    assert.equal(new Set(cells).size, 4);
    assert.ok(!cells.includes(cell("?")));
    assert.equal(printable("R$"), "R$");
  });

  // Baseline: the pixel row at line origin + PNG_TEXT.BASE (13) is the first row under the baseline; round letters may
  // overshoot into it (antialiasing), so "below the baseline" means rows origin + 14 and lower (bm.top + r >= 1).
  it("PFU-07: descenders: p g q y j light pixels 1+ rows below the baseline (to 3+); a e o x don't (baseline = line origin + 13 px)", () => {
    const below = (ch: string) => {
      const bm = FONT_REGULAR.raster(FONT_REGULAR.glyphId(ch.codePointAt(0) ?? 0), PNG_TEXT.PX);
      let n = 0;
      for (let r = 0; r < bm.h; r++) for (let x = 0; x < bm.w; x++) if (bm.top + r >= 1 && bm.alpha[r * bm.w + x] >= 32) n++;
      return { n, deepest: bm.top + bm.h };
    };
    for (const ch of U4) {
      const b = below(ch);
      assert.ok(b.n > 0 && b.deepest >= 3, `${ch}: ${JSON.stringify(b)}`);
      assert.ok(PNG_TEXT.BASE + b.deepest <= PNG_LAYOUT.LH, `${ch} stays inside the line`);
    }
    for (const ch of "aeox") assert.equal(below(ch).n, 0, ch);
  });

  it("PFU-08: out-of-scope text: one ? per code point (U5 10, U6 2, U7 1); 200 with the audit row; the data keeps the originals", async () => {
    assert.equal(printable(U5), "?".repeat(10));
    assert.equal(printable(U6), "??");
    assert.equal(printable(U7), "?");
    const r = await ex("olga", fbid, "pdf");
    assert.equal(r.status, 200);
    const p = readPdf(await bytes(r));
    assert.equal(p.text[0], "Orpheus - Personal Finance report: ?? ?");
    assert.ok(p.text.includes("1. ?????????? (category, flow)"), p.text.join("|"));
    assert.equal(p.data.series[0].id, U5);
    const png = await bytes(await ex("olga", fbid, "png"));
    assert.ok(drawnAt(png, "Orpheus - Personal Finance report: ?? ?", PNG_LAYOUT.M, PNG_LAYOUT.M));
    assert.equal(readPng(png, crc32).data.series[0].label, U5);
    const rows = (await pg.query<{ detail: string }>("SELECT detail FROM audit_event WHERE action = 'pf.report_export' ORDER BY id DESC LIMIT 2")).rows;
    assert.equal(rows.length, 2);
  });

  it("PFU-09 / PFU-10: ASCII exports are unchanged against the 3f59104 goldens (PDF text, pages, MediaBox, PNG size, data JSON)", () => {
    const golden = JSON.parse(readFileSync(new URL("./export-golden/3f59104.json", import.meta.url), "utf8"));
    const now = goldenCases();
    // #199 (spec 56, PFCC-12, 2026-10-22): the golden record's current month (2026-10) has no stored lines, so its
    // unsaved copy of 2026-09 (rent 1,000) now counts as on Overview (#166). That is the one intended change to the
    // "bar" case: its 2026-10 cell is 1,000.00, not "-", and so its data JSON hash moves. Everything else is unchanged.
    const bar = golden.bar as { pdfText: string[]; dataJsonSha256: string };
    const cell = bar.pdfText.indexOf("2026-10 *") + 1;
    assert.equal(bar.pdfText[cell], "-");
    golden.bar = { ...bar, pdfText: bar.pdfText.map((t, i) => (i === cell ? "1,000.00" : t)), dataJsonSha256: "18e5fd7495aded8b2dbc5d350e9f2c786585733e57127ff07c9b0aeed8dd028a" };
    for (const k of ["net", "bar"]) assert.deepEqual(now[k], golden[k], k);
  });

  it("PFU-04 / 05 / 06 / 07 / 08 / 11 (QA Y3): today's PNG crops match the committed goldens (raw RGB SHA-256)", () => {
    const index = JSON.parse(readFileSync(new URL("../../../qa/evidence/176/goldens.json", import.meta.url), "utf8"));
    const crops = goldenCrops();
    assert.deepEqual(crops.map((c) => c.name), index.map((c: { name: string }) => c.name));
    crops.forEach((c, i) => {
      assert.equal(sha256(c.rgb), index[i].rawRgbSha256, c.name);
      assert.equal(c.text, index[i].text, c.name);
      const file = readPng(readFileSync(new URL(`../../../qa/evidence/176/${c.name}.png`, import.meta.url)), crc32);
      assert.deepEqual([file.width, file.height], [c.box.w, c.box.h]);
    });
  });

  it("PFU-14: font files: SHA-256 as FONTS.md, the base64 module is the same bytes, cmap covers spec 50.1 in both weights, OFL.txt, ≤ 32,768 bytes", () => {
    const md = readFileSync(new URL("FONTS.md", fontDir), "utf8");
    for (const [file, b64] of [["NotoSans-Regular-subset.ttf", NOTO_SANS_REGULAR_B64], ["NotoSans-Bold-subset.ttf", NOTO_SANS_BOLD_B64]]) {
      const bytes = readFileSync(new URL(file, fontDir));
      const want = new RegExp(`sha256 ${file} ([0-9a-f]{64})`).exec(md)?.[1];
      assert.equal(createHash("sha256").update(bytes).digest("hex"), want, file);
      assert.ok(Buffer.from(b64, "base64").equals(bytes), `${file} = base64 module`);
      assert.ok(bytes.length <= 32_768, `${file} ${bytes.length}`);
    }
    for (const font of [FONT_REGULAR, FONT_BOLD]) for (const cp of COVERED) assert.notEqual(font.glyphId(cp), 0, `U+${cp.toString(16)}`);
    assert.ok(FONT_REGULAR.glyphId(0x20a9) !== 0, "U+20A9 ₩ (QA Y6)");
    assert.ok(statSync(new URL("OFL.txt", fontDir)).size > 4000);
    assert.match(readFileSync(new URL("OFL.txt", fontDir), "utf8"), /SIL Open Font License, Version 1\.1/);
  });

  it("PFU-16: PDF /Title is UTF-16BE and decodes to 'Orpheus report: ' + U1", async () => {
    const { s } = await pdfOf(uid);
    const hex = /\/Title <FEFF([0-9A-F]+)>/.exec(s)?.[1];
    assert.ok(hex);
    assert.equal(Buffer.from(hex, "hex").swap16().toString("utf16le"), `Orpheus report: ${U1}`);
  });

  it("PFU-17 (Y7): NFC: a decomposed name (e + U+0301) prints as the composed é", () => {
    assert.equal(printable("Cafe\u0301"), "Café");
    assert.equal(printable("C\u0327a"), "Ça");
  });

  it("PFU-18 (Y7): NBSP (U+00A0) is kept as its own glyph; the soft hyphen (U+00AD) is dropped", () => {
    assert.equal(printable("a\u00a0b"), "a\u00a0b");
    assert.notEqual(FONT_REGULAR.glyphId(0xa0), 0);
    assert.equal(printable("Spar\u00adkonto"), "Sparkonto");
  });

  it("PFU-19 (Y7): controls: tab / CR / LF become a space; other C0 / C1 controls (U+0007, U+007F, U+0085) print ?", () => {
    assert.equal(printable("a\tb\r\nc"), "a b  c");
    assert.equal(printable("a\u0007b\u007fc\u0085d"), "a?b?c?d");
  });

  it("PFU-20 (Y7): a long name wraps inside the PNG width and loses nothing", () => {
    const name = Array(8).fill("WWWWWWWWWW").join(" ");
    const d = chartData(U_REPORT, U_RECORD as never, U_NOW, "saved");
    const { head } = pngText(d, { name, generatedAt: U_NOW.toISOString() });
    const { W, M } = PNG_LAYOUT;
    let joined = "";
    for (const l of head.slice(0, 2)) joined += (joined ? " " : "") + l;
    assert.ok(head.length >= 5, "the title wrapped (U has 4 header lines)");
    assert.ok(joined.includes(name), joined);
    const width = (s: string) => {
      let max = 0;
      paintText((x) => (max = Math.max(max, x)), s, M, 0);
      return max;
    };
    for (const l of head) assert.ok(width(l) < W - M, `${l.slice(0, 20)}… fits`);
  });

  it("PFU-21 (Y7): Bold covers exactly what Regular covers (header and table headings use Bold)", () => {
    assert.deepEqual([...FONT_BOLD.cmap.keys()].sort((a, z) => a - z), [...FONT_REGULAR.cmap.keys()].sort((a, z) => a - z));
    assert.notEqual(cell("é", FONT_BOLD), cell("é"));
  });

  it("PFU-22 (Q-AO8, CFO change): filenames: NFD, marks dropped, other non-ASCII → -", async () => {
    assert.equal(asciiName("Épargne"), "Epargne");
    assert.equal(asciiName("Ça"), "Ca");
    assert.equal(asciiName("Łódź"), "-odz");
    assert.equal(exportFilename("Épargne", U_NOW.toISOString(), "pdf"), "orpheus-report-epargne-2026-10-21.pdf");
    const r = await ex("olga", uid, "pdf");
    assert.equal(r.headers.get("content-disposition"), 'attachment; filename="orpheus-report-epargne-cafe-creme-zurich-nandu-resund-s-2026-10-21.pdf"');
  });

  it("PFU-23 (Y8): access is unchanged: the owner 200; qa-cfo-read (Read grant, no saved reports) 404 on default and on the owner's id; no grant 403", async () => {
    assert.equal((await ex("olga", uid, "png")).status, 200);
    for (const id of ["default", uid]) {
      const r = await ex("cfo", id, "pdf");
      assert.equal(r.status, 404, id);
      assert.deepEqual(await r.json(), { error: "Report not found." });
    }
    const nog = await ex("nog", uid, "pdf");
    assert.equal(nog.status, 403);
    assert.equal(FG.length, 3);
  });
});
