// #176 (spec 50.4, QA Y3): golden PNG crops for QA's visual sign-off. The test (export-unicode.server.test.ts) cuts
// the same boxes from today's PNGs and compares the SHA-256 of their raw RGB bytes with qa/evidence/176/goldens.json.
// To refresh after a reviewed rendering change (QA signs off on the new crops):
//   node --experimental-strip-types src/lib/finance/export-golden/crops.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { chartData } from "../chart.ts";
import { buildPng, crc32, PNG_LAYOUT, pngText, type ExportMeta } from "../export.ts";
import { GOLDEN_CASES, GOLDEN_NOW, GOLDEN_RECORD } from "./capture.ts";
import { U5, U6, U7, U8, U_NAME, U_NOW, U_RECORD, U_REPORT } from "./fixture-u.ts";

type Box = { x: number; y: number; w: number; h: number };
export type Crop = { name: string; pfu: string; text: string; box: Box; rgb: Buffer };

/** Raw RGB rows of an 8-bit RGB, filter-0 PNG (what buildPng writes). */
export function rawRgb(png: Buffer): { width: number; height: number; at: (x: number, y: number) => Buffer } {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  let at = 8;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const row = 1 + 3 * width;
  return { width, height, at: (x, y) => raw.subarray(y * row + 1 + x * 3, y * row + 4 + x * 3) };
}

const cut = (png: Buffer, box: Box): Buffer => {
  const { at } = rawRgb(png);
  const out = Buffer.alloc(box.w * box.h * 3);
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) at(box.x + x, box.y + y).copy(out, (y * box.w + x) * 3);
  return out;
};

const render = (q: any, record: any, now: Date, name: string) => {
  const d = chartData(q, record, now, "saved");
  const meta: ExportMeta = { name, generatedAt: now.toISOString(), range: q.range };
  return { png: buildPng(d, meta), text: pngText(d, meta) };
};

export function goldenCrops(): Crop[] {
  const { M, LH, W, ADV } = PNG_LAYOUT;
  const line = (i: number): Box => ({ x: M, y: M + i * LH, w: W - 2 * M, h: LH });
  const u = render(U_REPORT, U_RECORD, U_NOW, U_NAME);
  const leg = (i: number): Box => ({ x: M + 4 * ADV, y: u.text.legendY + i * LH, w: W - 2 * M - 4 * ADV, h: LH });
  const net = render(GOLDEN_CASES.net, GOLDEN_RECORD, GOLDEN_NOW, "Default");
  const cav = net.text.head.findIndex((l) => l.startsWith("Caveat: "));
  const fbRecord = JSON.parse(JSON.stringify(U_RECORD));
  const fbName = `${U5} ${U6} ${U7}`;
  const fb = render(U_REPORT, fbRecord, U_NOW, fbName);
  const cy = render(U_REPORT, U_RECORD, U_NOW, U8);
  return [
    { name: "u-name", pfu: "PFU-04 / PFU-05", text: u.text.head[0], box: line(0), rgb: cut(u.png, line(0)) },
    { name: "u-legend-category", pfu: "PFU-04 / PFU-05", text: u.text.leg[0], box: leg(0), rgb: cut(u.png, leg(0)) },
    { name: "u-legend-account", pfu: "PFU-06 / PFU-07", text: u.text.leg[1], box: leg(1), rgb: cut(u.png, leg(1)) },
    { name: "golden-caveat", pfu: "PFU-11", text: net.text.head[cav], box: line(cav), rgb: cut(net.png, line(cav)) },
    { name: "u-fallback", pfu: "PFU-08 / PFCY-04", text: fb.text.head[0], box: line(0), rgb: cut(fb.png, line(0)) },
    { name: "u-cyrillic", pfu: "PFCY-03 / PFCY-08", text: cy.text.head[0], box: line(0), rgb: cut(cy.png, line(0)) },
  ];
}

export const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

function encodePng(w: number, h: number, rgb: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL("../../../../qa/evidence/176/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const index = goldenCrops().map((c) => {
    writeFileSync(new URL(`${c.name}.png`, dir), encodePng(c.box.w, c.box.h, c.rgb));
    return { name: c.name, file: `${c.name}.png`, pfu: c.pfu, text: c.text, box: c.box, rawRgbSha256: sha256(c.rgb) };
  });
  writeFileSync(new URL("goldens.json", dir), `${JSON.stringify(index, null, 2)}\n`);
  console.log(index.map((c) => `${c.name} ${c.rawRgbSha256}`).join("\n"));
}
