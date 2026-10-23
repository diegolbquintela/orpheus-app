import { deflateSync } from "node:zlib";
import type { ChartData } from "./chart.ts";
import type { ReportRange } from "./report.ts";
import { formatMoney } from "./money.ts";
import { TrueTypeFont } from "./ttf.ts";
import { NOTO_SANS_BOLD_B64, NOTO_SANS_REGULAR_B64 } from "./fonts/noto-sans-subset.ts";

/**
 * #176 (spec 50): both formats print with the embedded Noto Sans subsets (OFL 1.1, `fonts/`): Latin-1, Latin
 * Extended-A, `– — … − € ₩`. The PDF embeds them as Type0 / CIDFontType2 fonts; the PNG rasterizes them (`ttf.ts`).
 */
export const FONT_REGULAR = new TrueTypeFont(Buffer.from(NOTO_SANS_REGULAR_B64, "base64"));
export const FONT_BOLD = new TrueTypeFont(Buffer.from(NOTO_SANS_BOLD_B64, "base64"));

/**
 * #157 (spec section 39, PFX-01..PFX-18; design `attachments/pf-export-design.md`): PDF and PNG exports of a saved
 * report. Zero dependencies (Q-AD6): a minimal hand-written PDF 1.4 (uncompressed text) and a PNG drawn into an RGB
 * buffer, compressed with `node:zlib`. Since #176 both print with the embedded Noto Sans subsets (see below). The numbers are the `/chart` data passed in
 * (`chartData`, never re-derived); both files also carry that exact data as JSON (PDF Info `/OrpheusData`, PNG
 * `tEXt` `orpheus-data`) so a reader can check it.
 */
export const EXPORT_FORMATS = ["pdf", "png"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
/** Spec 36.11, verbatim. Printed whenever the report has a net-assets series (Q-AD8). */
export const NET_ASSETS_CAVEAT =
  "Starting net assets is defined at the Overview window start but anchored here at the first data month, so the absolute level can be off by the surplus between those dates. The month-to-month shape is right; the level isn't trustworthy until an explicit as-of month is stored (follow-up ticket).";
export const FX_LINE = "FX basis: current (every month is valued at today's rates, not historical rates)";
/** #170 Q-AH6 (Diego) / Q-AH8: printed instead of FX_LINE when `fx_basis` is "historical" (spec 43.7). */
export const FX_LINE_HISTORICAL = "FX basis: historical (each month at its Bank of Canada monthly average rate)";
/** #170 (CFO, spec 43.8 / 43.10): the mixed line names the earliest 5 fallback months (sorted), then " and N more". */
export const FX_MIXED_SHOWN = 5;
export const fxMixedLine = (months: readonly string[]): string => {
  const sorted = [...months].sort();
  const more = sorted.length - FX_MIXED_SHOWN;
  return `FX basis: mixed (Bank of Canada monthly averages; typed rate used for ${sorted.slice(0, FX_MIXED_SHOWN).join(", ")}${more > 0 ? ` and ${more} more` : ""})`;
};
export const fxLine = (d: Pick<ChartData, "fx_basis" | "fx_fallback_months">): string =>
  d.fx_basis === "historical" ? FX_LINE_HISTORICAL : d.fx_basis === "mixed" ? fxMixedLine(d.fx_fallback_months ?? []) : FX_LINE;
export const MIXED_LINE = "Mixed axes: net assets (a level) share this chart with flows (amounts per month).";

/** #179: `range` = the report's range as saved (a saved `all` prints as `All data (...)`, Q-AF1 / Q-AF2). */
export type ExportMeta = { name: string; generatedAt: string; range?: ReportRange; netAssetsAsOf?: string };
/** #171 Q-AG7 (spec 42): with an explicit as-of month the caveat no longer applies; these replace it. */
export const AS_OF_SUFFIX = "(as-of month)";
export const NET_ASSETS_AS_OF_NOTE =
  "Starting net assets is the value at the start of its as-of month; each month adds its own surplus.";
export const ALL_DATA = "All data";
export const NO_DATA_YET = "no data yet";
/** The export's range text: `from to to`, or for a saved `all`, `All data (from to to)` / `All data (no data yet, month)`. */
export const rangeLabel = (d: Pick<ChartData, "range" | "current" | "net_assets_from">, range?: ReportRange): string =>
  range && "preset" in range && range.preset === "all"
    ? d.net_assets_from === null
      ? `${ALL_DATA} (${NO_DATA_YET}, ${d.current})`
      : `${ALL_DATA} (${d.range.from} to ${d.range.to})`
    : `${d.range.from} to ${d.range.to}`;

/** ASCII only (Q-AD9): other characters print as `?` in both formats. */
export const ascii = (s: string): string => s.replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7e]/g, "?");

/**
 * #176 (spec 50.5): the text both formats print. NFC first; tab / CR / LF become a space; the soft hyphen (U+00AD) is
 * dropped; then each **code point** the embedded font has is kept and every other one (C0 / C1 controls, Cyrillic,
 * CJK, emoji, ...) prints as exactly one `?`.
 */
export function printable(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC").replace(/[\t\r\n]/g, " ").replace(/\u00ad/g, "")) {
    const cp = ch.codePointAt(0) ?? 0;
    out += cp >= 0x20 && FONT_REGULAR.glyphId(cp) !== 0 ? ch : "?";
  }
  return out;
}

/** #176 Q-AO8 (CFO change): filenames stay ASCII: NFD, drop combining marks (\p{M}), then any other non-ASCII → `-`. */
export const asciiName = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^ -~]/gu, "-");

/** #157 PFX-18 (CFO, 2026-10-17): bar and stacked-bar reports are drawn as lines in the stub; both formats say so. */
export const LINES_NOTE = "Rendered as lines";
export const drawnAsLines = (d: Pick<ChartData, "chart">): boolean => d.chart !== "line";

const hasNetAssets = (d: ChartData): boolean => d.series.some((s) => s.kind === "metric" && s.id === "net-assets");

/** The text lines both formats print above the numbers (Q-AD5). */
export function headerLines(d: ChartData, meta: ExportMeta): string[] {
  const out = [
    `Orpheus - Personal Finance report: ${meta.name}`,
    `Chart: ${d.chart} - Range: ${rangeLabel(d, meta.range)} - Currency: ${d.currency}`,
    `As of: ${d.current} (${d.partial ? "current month included, partial" : "current month not in range"}) - Generated: ${meta.generatedAt}`,
    fxLine(d),
  ];
  if (drawnAsLines(d)) out.splice(2, 0, LINES_NOTE);
  if (hasNetAssets(d))
    out.push(
      ...(meta.netAssetsAsOf
        ? [`Net assets from: ${d.net_assets_from ?? meta.netAssetsAsOf} ${AS_OF_SUFFIX}`, `Note: ${NET_ASSETS_AS_OF_NOTE}`]
        : [`Net assets from: ${d.net_assets_from ?? "no data"}`, `Caveat: ${NET_ASSETS_CAVEAT}`]),
    );
  if (d.mixed_axes) out.push(MIXED_LINE);
  return out.map(printable);
}

const cell = (v: number | null): string => (v === null ? "-" : formatMoney(v));
const legend = (d: ChartData): string[] =>
  d.series.map((s, i) => printable(`${i + 1}. ${s.label} (${s.kind}, ${s.axis}${s.stack ? ", stacked" : ""}${s.missing ? ", missing" : ""})`));

const wrap = (text: string, max: number): string[] => {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (line && (line + " " + w).length > max) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
};

/** Data JSON with non-ASCII escaped (Latin-1 safe in both containers). */
export const dataJson = (d: ChartData): string =>
  JSON.stringify(d).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

// ---------- PDF ----------

/** Glyph ids for printed text (`printable` first, so a missing code point is the `?` glyph). */
const glyphs = (font: TrueTypeFont, s: string): number[] => [...printable(s)].map((ch) => font.glyphId(ch.codePointAt(0) ?? 0));
/** #176 PFU-03: widths from the embedded font's `hmtx` (units per em 1000 in both subsets). */
export const pdfTextWidth = (s: string, size: number, font: TrueTypeFont = FONT_REGULAR): number =>
  glyphs(font, s).reduce((a, g) => a + font.advance(g), 0) * (size / font.unitsPerEm);
/** PDF text string for metadata: UTF-16BE with a BOM (#176 Q-AO9). */
const pdfUtf16 = (s: string): string => `<FEFF${[...Buffer.from(s, "utf16le").swap16()].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}>`;
export const PDF_FONT_NAMES = ["ORPHAA+NotoSans-Regular", "ORPHAB+NotoSans-Bold"] as const;

/**
 * A ToUnicode CMap (glyph id → its first code point). #204 (spec 50.13, Q-CY2): only the glyph ids the document draws
 * (`used`), so the Cyrillic glyphs added to the subsets do not grow every PDF's CMap past the PFX-14 budget.
 */
function toUnicode(font: TrueTypeFont, used: ReadonlySet<number>): string {
  const byGid = new Map<number, number>();
  for (const [cp, g] of [...font.cmap.entries()].sort((a, z) => a[0] - z[0])) if (used.has(g) && !byGid.has(g)) byGid.set(g, cp);
  const hex = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, "0");
  const utf16 = (cp: number) => [...Buffer.from(String.fromCodePoint(cp), "utf16le").swap16()].map((b) => hex(b, 2)).join("");
  const pairs = [...byGid.entries()].sort((a, z) => a[0] - z[0]);
  const blocks: string[] = [];
  for (let i = 0; i < pairs.length; i += 100) {
    const part = pairs.slice(i, i + 100);
    blocks.push(`${part.length} beginbfchar\n${part.map(([g, cp]) => `<${hex(g, 4)}> <${utf16(cp)}>`).join("\n")}\nendbfchar`);
  }
  return [
    "/CIDInit /ProcSet findresource begin", "12 dict begin", "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def", "/CMapName /Adobe-Identity-UCS def", "/CMapType 2 def",
    "1 begincodespacerange", "<0000> <FFFF>", "endcodespacerange", ...blocks, "endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end",
  ].join("\n");
}

/** A landscape A4 PDF: header, legend, then one row per month with one column per series (Q-AD5). */
export function buildPdf(d: ChartData, meta: ExportMeta): Buffer {
  const PW = 842;
  const PH = 595;
  const M = 36;
  const pages: string[][] = [[]];
  // #204: the glyph ids drawn with each font, for its ToUnicode CMap.
  const used = new Map<TrueTypeFont, Set<number>>([[FONT_REGULAR, new Set()], [FONT_BOLD, new Set()]]);
  const pdfText = (s: string, font: TrueTypeFont): string => {
    const ids = glyphs(font, s);
    for (const g of ids) used.get(font)?.add(g);
    return `<${ids.map((g) => g.toString(16).padStart(4, "0")).join("")}>`;
  };
  let y = PH - M;
  const put = (s: string) => pages[pages.length - 1].push(s);
  const room = (h: number) => {
    if (y - h < M) {
      pages.push([]);
      y = PH - M;
    }
  };
  const line = (text: string, size = 8, bold = false, x = M) => {
    room(size + 3);
    y -= size + 3;
    put(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfText(text, bold ? FONT_BOLD : FONT_REGULAR)} Tj ET`);
  };
  const [title, ...rest] = headerLines(d, meta);
  line(title, 12, true);
  for (const l of rest) for (const w of wrap(l, 180)) line(w, 8);
  y -= 4;
  line("Series", 8, true);
  for (const l of legend(d)) line(l, 7);
  y -= 4;
  const cols = d.series.length;
  const monthW = 60;
  const colW = Math.min(90, (PW - 2 * M - monthW) / cols);
  const row = (cells: string[], bold: boolean) => {
    room(10);
    y -= 10;
    const f = bold ? "F2" : "F1";
    const font = bold ? FONT_BOLD : FONT_REGULAR;
    put(`BT /${f} 7 Tf ${M} ${y.toFixed(2)} Td ${pdfText(cells[0], font)} Tj ET`);
    cells.slice(1).forEach((c, i) => {
      const right = M + monthW + colW * (i + 1) - 4;
      put(`BT /${f} 7 Tf ${(right - pdfTextWidth(c, 7, font)).toFixed(2)} ${y.toFixed(2)} Td ${pdfText(c, font)} Tj ET`);
    });
  };
  row(["Month", ...d.series.map((_, i) => `${i + 1}`)], true);
  d.rows.forEach((r) => row([`${r.month}${r.partial ? " *" : ""}`, ...r.values.map(cell)], false));
  if (d.partial) line("* current month, partial", 7);

  const objs: string[] = [];
  const add = (body: string) => objs.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  add(""); // 2 Pages, set below
  add(""); // 3 F1 (Type0, set below)
  add(""); // 4 F2 (Type0, set below)
  const hex = Buffer.from(dataJson(d), "latin1").toString("hex");
  add(`<< /Title ${pdfUtf16(`Orpheus report: ${printable(meta.name)}`)} /Producer (Orpheus #157) /CreationDate (D:${meta.generatedAt.replace(/[-:T]/g, "").slice(0, 14)}Z) /OrpheusData <${hex}> >>`); // 5
  // #176 PFU-02: each font is Type0 (Identity-H) → CIDFontType2 → FontDescriptor → FontFile2 (the subset, Flate), with ToUnicode.
  [FONT_REGULAR, FONT_BOLD].forEach((font, k) => {
    const name = PDF_FONT_NAMES[k];
    const file = deflateSync(font.bytes, { level: 9 });
    add(`<< /Length ${file.length} /Length1 ${font.bytes.length} /Filter /FlateDecode >>\nstream\n${file.toString("latin1")}\nendstream`);
    const fileId = objs.length;
    const [x0, y0, x1, y1] = font.bbox;
    add(`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${x0} ${y0} ${x1} ${y1}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.capHeight} /StemV ${k ? 140 : 80} /FontFile2 ${fileId} 0 R >>`);
    const descId = objs.length;
    const widths = Array.from({ length: font.numGlyphs }, (_, g) => Math.round((font.advance(g) * 1000) / font.unitsPerEm));
    add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /DW 1000 /W [0 [${widths.join(" ")}]] /CIDToGIDMap /Identity >>`);
    const cidId = objs.length;
    const cmap = toUnicode(font, used.get(font) ?? new Set());
    add(`<< /Length ${Buffer.byteLength(cmap, "latin1")} >>\nstream\n${cmap}\nendstream`);
    const tuId = objs.length;
    objs[2 + k] = `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${tuId} 0 R >>`;
  });
  const kids: number[] = [];
  for (const p of pages) {
    const stream = p.join("\n");
    add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const contentId = objs.length;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(objs.length);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// ---------- PNG ----------

type RGB = [number, number, number];

/**
 * #176 (spec 50, Q-AO6): PNG text is Noto Sans Regular at PX pixels per em (cap height 10 px, as the #157 5x7 x 2 font),
 * baseline BASE px below the line origin, anti-aliased FG over the pixels below. Descenders reach about 4 px under
 * the baseline (still inside LH); accented capitals stay at or below the line origin.
 */
export const PNG_TEXT = { PX: 14, BASE: 13 } as const;
export const pngTextWidth = (s: string, font: TrueTypeFont = FONT_REGULAR): number =>
  [...printable(s)].reduce((a, ch) => a + font.advance(font.glyphId(ch.codePointAt(0) ?? 0)), 0) * (PNG_TEXT.PX / font.unitsPerEm);
/** Paints `s` with its line origin at (x, y): `blend(x, y, c, alpha 0..255)` for each covered pixel (exported for the tests). */
export function paintText(blend: (x: number, y: number, c: RGB, a: number) => void, s: string, x: number, y: number, c: RGB = FG, font: TrueTypeFont = FONT_REGULAR) {
  const { PX, BASE } = PNG_TEXT;
  let pen = x;
  for (const ch of printable(s)) {
    const g = font.glyphId(ch.codePointAt(0) ?? 0);
    const bm = font.raster(g, PX);
    const ox = Math.round(pen) + bm.left;
    const oy = y + BASE + bm.top;
    for (let r = 0; r < bm.h; r++) for (let q = 0; q < bm.w; q++) if (bm.alpha[r * bm.w + q]) blend(ox + q, oy + r, c, bm.alpha[r * bm.w + q]);
    pen += font.advance(g) * (PX / font.unitsPerEm);
  }
}
/** `under` with `c` on top at alpha a/255 (rounded per channel). */
export const over = (under: readonly number[], c: RGB, a: number): RGB => c.map((v, k) => Math.round(under[k] + ((v - under[k]) * a) / 255)) as RGB;
/** #176: wrap by the #157 character budget (so ASCII layout is unchanged, PFU-10), and also break before a line would overflow `maxPx`. */
const wrapPx = (text: string, maxChars: number, maxPx: number): string[] => {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (line && (next.length > maxChars || pngTextWidth(next) > maxPx)) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
};

export const BG: RGB = [0x12, 0x14, 0x18];
export const FG: RGB = [0xe6, 0xe6, 0xe6];
const DIM: RGB = [0x5a, 0x60, 0x6b];
/** No gold / yellow (house style). */
export const PALETTE: RGB[] = [
  [0x5e, 0xb1, 0xff], [0xff, 0x6b, 0x6b], [0x4c, 0xd9, 0x64], [0xc0, 0x84, 0xfc], [0x2d, 0xd4, 0xbf], [0xf4, 0x72, 0xb6],
  [0x94, 0xa3, 0xb8], [0x38, 0xbd, 0xf8], [0xfb, 0x71, 0x85], [0x34, 0xd3, 0x99], [0xe8, 0x79, 0xf9], [0x81, 0x8c, 0xf8],
];

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** A dark PNG: the header text, a line plot (flows on the left scale, levels on the right when mixed) and a legend. */
/** PNG text layout (exported for the PFX-18 pixel test): header line i starts at (M, M + i * LH), glyphs 5x7 x S. */
export const PNG_LAYOUT = { S: 2, ADV: 12, LH: 18, W: 1200, M: 24 } as const;

/**
 * The PNG's text, wrapped to the width (exported for the glyph tests): header line i is drawn at (M, M + i * LH);
 * "Series" at (M, legendY - LH); legend line i at (M + 4 * ADV, legendY + i * LH).
 */
export function pngText(d: ChartData, meta: ExportMeta) {
  const { ADV, LH, W, M } = PNG_LAYOUT;
  const maxChars = Math.floor((W - 2 * M) / ADV);
  const head = headerLines(d, meta).flatMap((l) => wrapPx(l, maxChars, W - 2 * M));
  const leg = legend(d).flatMap((l) => wrapPx(l, maxChars - 4, W - 2 * M - 4 * ADV));
  const PLOT = 360;
  const legendY = M + head.length * LH + 16 + PLOT + 2 * LH;
  return { head, leg, PLOT, legendY };
}

export function buildPng(d: ChartData, meta: ExportMeta): Buffer {
  const { S, ADV, LH, W, M } = PNG_LAYOUT; // S and ADV: the #157 layout units (axis gutters, legend indent)
  const { head, leg, PLOT } = pngText(d, meta);
  const H = M + head.length * LH + 16 + PLOT + 3 * LH + leg.length * LH + M;
  const px = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) BG.forEach((v, k) => (px[i * 3 + k] = v));
  const set = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.round(y) * W + Math.round(x)) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const blend = (x: number, y: number, c: RGB, a: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    const v = over([px[i], px[i + 1], px[i + 2]], c, a);
    px[i] = v[0];
    px[i + 1] = v[1];
    px[i + 2] = v[2];
  };
  const text = (s: string, x: number, y: number, c: RGB = FG) => paintText(blend, s, x, y, c);
  const lineTo = (x0: number, y0: number, x1: number, y1: number, c: RGB) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      set(x, y, c);
      set(x, y + 1, c);
    }
  };
  let y = M;
  for (const l of head) {
    text(l, M, y);
    y += LH;
  }
  y += 16;
  const left = M + 14 * ADV;
  const right = W - M - (d.mixed_axes ? 14 * ADV : ADV);
  const top = y;
  const bottom = y + PLOT - LH;
  const scale = (axis: "flow" | "level") => {
    const vals = d.series.filter((s) => (d.mixed_axes ? s.axis === axis : true)).flatMap((s) => s.values.filter((v): v is number => v !== null));
    const lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (hi === lo) hi = lo + 1;
    return { lo, hi, y: (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top) };
  };
  const flow = scale("flow");
  const level = d.mixed_axes ? scale("level") : flow;
  lineTo(left, top, left, bottom, DIM);
  lineTo(left, bottom, right, bottom, DIM);
  lineTo(left, flow.y(0), right, flow.y(0), DIM);
  text(formatMoney(flow.hi), M, top);
  text(formatMoney(flow.lo), M, bottom - 7 * S);
  if (d.mixed_axes) {
    text(formatMoney(level.hi), right + ADV, top);
    text(formatMoney(level.lo), right + ADV, bottom - 7 * S);
  }
  const n = d.months.length;
  const xAt = (i: number) => (n === 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));
  text(d.months[0], left, bottom + 6);
  if (n > 1) text(d.months[n - 1], Math.round(right - pngTextWidth(d.months[n - 1])), bottom + 6);
  d.series.forEach((s, si) => {
    const c = PALETTE[si % PALETTE.length];
    const sc = s.axis === "level" ? level : flow;
    let prev: [number, number] | null = null;
    s.values.forEach((v, i) => {
      if (v === null) {
        prev = null;
        return;
      }
      const p: [number, number] = [xAt(i), sc.y(v)];
      if (prev) lineTo(prev[0], prev[1], p[0], p[1], c);
      else for (let k = -2; k <= 2; k++) lineTo(p[0] - 2, p[1] + k, p[0] + 2, p[1] + k, c);
      prev = p;
    });
  });
  y = top + PLOT + LH;
  text("Series", M, y);
  y += LH;
  leg.forEach((l) => {
    const si = Number(/^(\d+)\./.exec(l)?.[1] ?? 0) - 1;
    if (si >= 0 && l.startsWith(`${si + 1}.`)) for (let k = 0; k < 7 * S; k++) lineTo(M, y + k, M + 2 * ADV, y + k, PALETTE[si % PALETTE.length]);
    text(l, M + 4 * ADV, y);
    y += LH;
  });
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let r = 0; r < H; r++) px.copy(raw, r * (W * 3 + 1) + 1, r * W * 3, (r + 1) * W * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from(`orpheus-data\0${dataJson(d)}`, "latin1")),
    ...(drawnAsLines(d) ? [chunk("tEXt", Buffer.from(`orpheus-note\0${LINES_NOTE}`, "latin1"))] : []),
    chunk("tEXt", Buffer.from(`Software\0Orpheus #157 (generated ${meta.generatedAt})`, "latin1")),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** `orpheus-report-<slug>-<YYYY-MM-DD>.<ext>` (Q-AD7; the generation day in Toronto, the household's zone). */
export function exportFilename(name: string, generatedAt: string, format: ExportFormat): string {
  const slug = asciiName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "report";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(generatedAt));
  return `orpheus-report-${slug}-${day}.${format}`;
}
