import { deflateSync } from "node:zlib";
import type { ChartData } from "./chart.ts";
import { formatMoney } from "./money.ts";

/**
 * #157 (spec section 39, PFX-01..PFX-18; design `attachments/pf-export-design.md`): PDF and PNG exports of a saved
 * report. Zero dependencies (Q-AD6): a minimal hand-written PDF 1.4 (Helvetica, uncompressed text) and a PNG drawn
 * into an RGB buffer with a built-in 5x7 font, compressed with `node:zlib`. The numbers are the `/chart` data passed in
 * (`chartData`, never re-derived); both files also carry that exact data as JSON (PDF Info `/OrpheusData`, PNG
 * `tEXt` `orpheus-data`) so a reader can check it.
 */
export const EXPORT_FORMATS = ["pdf", "png"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
/** Spec 36.11, verbatim. Printed whenever the report has a net-assets series (Q-AD8). */
export const NET_ASSETS_CAVEAT =
  "Starting net assets is defined at the Overview window start but anchored here at the first data month, so the absolute level can be off by the surplus between those dates. The month-to-month shape is right; the level isn't trustworthy until an explicit as-of month is stored (follow-up ticket).";
export const FX_LINE = "FX basis: current (every month is valued at today's rates, not historical rates)";
export const MIXED_LINE = "Mixed axes: net assets (a level) share this chart with flows (amounts per month).";

export type ExportMeta = { name: string; generatedAt: string };

/** ASCII only (Q-AD9): other characters print as `?` in both formats. */
export const ascii = (s: string): string => s.replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7e]/g, "?");

/** #157 PFX-18 (CFO, 2026-10-17): bar and stacked-bar reports are drawn as lines in the stub; both formats say so. */
export const LINES_NOTE = "Rendered as lines";
export const drawnAsLines = (d: Pick<ChartData, "chart">): boolean => d.chart !== "line";

const hasNetAssets = (d: ChartData): boolean => d.series.some((s) => s.kind === "metric" && s.id === "net-assets");

/** The text lines both formats print above the numbers (Q-AD5). */
export function headerLines(d: ChartData, meta: ExportMeta): string[] {
  const out = [
    `Orpheus - Personal Finance report: ${meta.name}`,
    `Chart: ${d.chart} - Range: ${d.range.from} to ${d.range.to} - Currency: ${d.currency}`,
    `As of: ${d.current} (${d.partial ? "current month included, partial" : "current month not in range"}) - Generated: ${meta.generatedAt}`,
    FX_LINE,
  ];
  if (drawnAsLines(d)) out.splice(2, 0, LINES_NOTE);
  if (hasNetAssets(d)) out.push(`Net assets from: ${d.net_assets_from ?? "no data"}`, `Caveat: ${NET_ASSETS_CAVEAT}`);
  if (d.mixed_axes) out.push(MIXED_LINE);
  return out.map(ascii);
}

const cell = (v: number | null): string => (v === null ? "-" : formatMoney(v));
const legend = (d: ChartData): string[] =>
  d.series.map((s, i) => ascii(`${i + 1}. ${s.label} (${s.kind}, ${s.axis}${s.stack ? ", stacked" : ""}${s.missing ? ", missing" : ""})`));

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

const W_HELV: Record<string, number> = { " ": 278, ",": 278, ".": 278, "-": 333, "(": 333, ")": 333, ":": 278 };
const textWidth = (s: string, size: number): number => [...s].reduce((a, c) => a + (W_HELV[c] ?? (/[0-9]/.test(c) ? 556 : 560)), 0) * (size / 1000);
const pdfText = (s: string): string => `(${ascii(s).replace(/[\\()]/g, (c) => `\\${c}`)})`;

/** A landscape A4 PDF: header, legend, then one row per month with one column per series (Q-AD5). */
export function buildPdf(d: ChartData, meta: ExportMeta): Buffer {
  const PW = 842;
  const PH = 595;
  const M = 36;
  const pages: string[][] = [[]];
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
    put(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfText(text)} Tj ET`);
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
    put(`BT /${f} 7 Tf ${M} ${y.toFixed(2)} Td ${pdfText(cells[0])} Tj ET`);
    cells.slice(1).forEach((c, i) => {
      const right = M + monthW + colW * (i + 1) - 4;
      put(`BT /${f} 7 Tf ${(right - textWidth(c, 7)).toFixed(2)} ${y.toFixed(2)} Td ${pdfText(c)} Tj ET`);
    });
  };
  row(["Month", ...d.series.map((_, i) => `${i + 1}`)], true);
  d.rows.forEach((r) => row([`${r.month}${r.partial ? " *" : ""}`, ...r.values.map(cell)], false));
  if (d.partial) line("* current month, partial", 7);

  const objs: string[] = [];
  const add = (body: string) => objs.push(body);
  add("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  add(""); // 2 Pages, set below
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"); // 4
  const hex = Buffer.from(dataJson(d), "latin1").toString("hex");
  add(`<< /Title ${pdfText(`Orpheus report: ${meta.name}`)} /Producer (Orpheus #157) /CreationDate (D:${meta.generatedAt.replace(/[-:T]/g, "").slice(0, 14)}Z) /OrpheusData <${hex}> >>`); // 5
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

export const GLYPHS: Record<string, string> = {
  "A": "0e11111f111111",
  "B": "1e11111e11111e",
  "C": "0e11101010110e",
  "D": "1e11111111111e",
  "E": "1f10101e10101f",
  "F": "1f10101e101010",
  "G": "0e11101711110f",
  "H": "1111111f111111",
  "I": "0e04040404040e",
  "J": "0702020202120c",
  "K": "11121418141211",
  "L": "1010101010101f",
  "M": "111b1515111111",
  "N": "11111915131111",
  "O": "0e11111111110e",
  "P": "1e11111e101010",
  "Q": "0e11111115120d",
  "R": "1e11111e141211",
  "S": "0f10100e01011e",
  "T": "1f040404040404",
  "U": "1111111111110e",
  "V": "11111111110a04",
  "W": "1111111515150a",
  "X": "11110a040a1111",
  "Y": "11110a04040404",
  "Z": "1f01020408101f",
  "0": "0e11131519110e",
  "1": "040c040404040e",
  "2": "0e11010204081f",
  "3": "1f02040201110e",
  "4": "02060a121f0202",
  "5": "1f101e0101110e",
  "6": "0608101e11110e",
  "7": "1f010204080808",
  "8": "0e11110e11110e",
  "9": "0e11110f01020c",
  " ": "00000000000000",
  ".": "00000000000c0c",
  ",": "000000000c0408",
  ":": "000c0c000c0c00",
  "-": "0000001f000000",
  "(": "02040808080402",
  ")": "08040202020408",
  "/": "00010204081000",
  "%": "18190204081303",
  "'": "0c040800000000",
  "_": "0000000000001f",
  "+": "0004041f040400",
  "=": "00001f001f0000",
  "?": "0e110102040004",
  "&": "0c12140815120d",
  "#": "0a0a1f0a1f0a0a",
  // QA 2026-10-17 F3: lowercase and the rest of printable ASCII, so the PNG prints text verbatim.
  "a": "00000e010f110f",
  "b": "1010161911111e",
  "c": "00000e1010110e",
  "d": "01010d1311110f",
  "e": "00000e111f100e",
  "f": "0609081c080808",
  "g": "000f11110f010e",
  "h": "10101619111111",
  "i": "04000c0404040e",
  "j": "0200060202120c",
  "k": "10101214181412",
  "l": "0c04040404040e",
  "m": "00001a15151111",
  "n": "00001619111111",
  "o": "00000e1111110e",
  "p": "00001e111e1010",
  "q": "00000d130f0101",
  "r": "00001619101010",
  "s": "00000e100e011e",
  "t": "08081c08080906",
  "u": "0000111111130d",
  "v": "00001111110a04",
  "w": "0000111115150a",
  "x": "0000110a040a11",
  "y": "000011110f010e",
  "z": "00001f0204081f",
  "!": "04040404040004",
  "\"": "0a0a0a00000000",
  "$": "040f140e051e04",
  "*": "0004150e150400",
  ";": "000c0c000c0408",
  "<": "02040810080402",
  ">": "08040201020408",
  "@": "0e11010d15150e",
  "[": "0e08080808080e",
  "\\": "00100804020100",
  "]": "0e02020202020e",
  "^": "040a1100000000",
  "`": "08040200000000",
  "{": "02040408040402",
  "|": "04040404040404",
  "}": "08040402040408",
  "~": "00000815020000",
};

type RGB = [number, number, number];
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
  const head = headerLines(d, meta).flatMap((l) => wrap(l, maxChars));
  const leg = legend(d).flatMap((l) => wrap(l, maxChars - 4));
  const PLOT = 360;
  const legendY = M + head.length * LH + 16 + PLOT + 2 * LH;
  return { head, leg, PLOT, legendY };
}

export function buildPng(d: ChartData, meta: ExportMeta): Buffer {
  const { S, ADV, LH, W, M } = PNG_LAYOUT; // font scale 2: 10 x 14 px glyphs, 12 px advance
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
  const text = (s: string, x: number, y: number, c: RGB = FG) => {
    [...ascii(s)].forEach((ch, n) => {
      const g = GLYPHS[ch] ?? GLYPHS["?"];
      for (let r = 0; r < 7; r++) {
        const bits = parseInt(g.slice(r * 2, r * 2 + 2), 16);
        for (let b = 0; b < 5; b++)
          if (bits & (1 << (4 - b))) for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) set(x + n * ADV + b * S + dx, y + r * S + dy, c);
      }
    });
  };
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
  if (n > 1) text(d.months[n - 1], right - d.months[n - 1].length * ADV, bottom + 6);
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
  const slug = ascii(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "report";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(generatedAt));
  return `orpheus-report-${slug}-${day}.${format}`;
}
