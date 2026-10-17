// #157: minimal readers for the PF export files (used by qa/tools/pf-export-api.mjs and the PGlite tests). They check
// structure and pull out the embedded `/chart` data; they are not general PDF / PNG parsers.
import { inflateSync } from "node:zlib";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG: magic, chunk CRCs, IHDR, IDAT inflates to height × (1 + 3 × width) bytes, tEXt entries. Throws on a problem. */
/** @param {Buffer} buf @param {(b: Buffer) => number} [crc32] */
export function readPng(buf, crc32) {
  if (!PNG_MAGIC.every((b, i) => buf[i] === b)) throw new Error("PNG magic");
  let at = 8;
  /** @type {Record<string, string>} */
  const text = {};
  const idat = [];
  let width = 0;
  let height = 0;
  let end = false;
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    const crc = buf.readUInt32BE(at + 8 + len);
    if (crc32 && crc32(buf.subarray(at + 4, at + 8 + len)) !== crc) throw new Error(`CRC ${type}`);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 2) throw new Error("IHDR not 8-bit RGB");
    } else if (type === "tEXt") {
      const z = data.indexOf(0);
      text[data.toString("latin1", 0, z)] = data.toString("latin1", z + 1);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") end = true;
    at += 12 + len;
  }
  if (!end) throw new Error("no IEND");
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== height * (1 + 3 * width)) throw new Error("IDAT size");
  return { width, height, text, data: text["orpheus-data"] ? JSON.parse(text["orpheus-data"]) : null };
}

/** PDF: header, %%EOF, startxref → `xref`, every xref offset → `n 0 obj`; Info `/OrpheusData`; page text. Throws on a problem. */
/** @param {Buffer} buf */
export function readPdf(buf) {
  const s = buf.toString("latin1");
  if (!s.startsWith("%PDF-1.")) throw new Error("PDF header");
  if (!/%%EOF\s*$/.test(s)) throw new Error("no %%EOF");
  const sx = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)?.[1]);
  if (s.slice(sx, sx + 4) !== "xref") throw new Error("startxref");
  const m = /^xref\n0 (\d+)\n/.exec(s.slice(sx));
  if (!m) throw new Error("xref header");
  const n = Number(m[1]);
  const rows = s.slice(sx + m[0].length).split("\n").slice(0, n);
  rows.slice(1).forEach((/** @type {string} */ r, /** @type {number} */ i) => {
    const off = Number(r.slice(0, 10));
    if (!s.startsWith(`${i + 1} 0 obj`, off)) throw new Error(`xref object ${i + 1}`);
  });
  const hex = /\/OrpheusData <([0-9a-f]*)>/.exec(s)?.[1];
  const strings = [...s.matchAll(/\((?:[^()\\]|\\.)*\) Tj/g)].map((x) => x[0].slice(1, -4).replace(/\\([\\()])/g, "$1"));
  const pages = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)?.[1] ?? 0);
  return { objects: n - 1, pages, text: strings, data: hex ? JSON.parse(Buffer.from(hex, "hex").toString("latin1")) : null };
}
