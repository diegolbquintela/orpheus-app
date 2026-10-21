/**
 * #176 (spec 50, Q-AO2): a minimal TrueType reader and rasterizer for the PF exports, with no dependencies.
 * - Reads: `head`, `hhea`, `maxp`, `cmap` (formats 4 and 12), `hmtx`, `loca` and `glyf` (simple and composite glyphs).
 * - Rasterizes: quadratic outlines flattened to polygons, filled with the nonzero rule, 4 sub-scanlines per pixel with
 *   exact horizontal coverage, giving 8-bit alpha.
 * It is only meant for the committed Noto Sans subsets (`fonts/`), not for arbitrary fonts.
 */

export type Point = { x: number; y: number; on: boolean };
export type GlyphBitmap = { left: number; top: number; w: number; h: number; alpha: Uint8Array };

export class TrueTypeFont {
  readonly bytes: Buffer;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly numGlyphs: number;
  readonly bbox: [number, number, number, number];
  readonly cmap = new Map<number, number>();
  private readonly tables = new Map<string, { offset: number; length: number }>();
  private readonly numberOfHMetrics: number;
  private readonly longLoca: boolean;
  private readonly outlines = new Map<number, Point[][]>();
  private readonly bitmaps = new Map<string, GlyphBitmap>();

  constructor(bytes: Buffer) {
    this.bytes = bytes;
    const n = bytes.readUInt16BE(4);
    for (let i = 0; i < n; i++) {
      const at = 12 + i * 16;
      this.tables.set(bytes.toString("latin1", at, at + 4), { offset: bytes.readUInt32BE(at + 8), length: bytes.readUInt32BE(at + 12) });
    }
    const head = this.table("head");
    this.unitsPerEm = bytes.readUInt16BE(head + 18);
    this.bbox = [bytes.readInt16BE(head + 36), bytes.readInt16BE(head + 38), bytes.readInt16BE(head + 40), bytes.readInt16BE(head + 42)];
    this.longLoca = bytes.readInt16BE(head + 50) === 1;
    const hhea = this.table("hhea");
    this.ascent = bytes.readInt16BE(hhea + 4);
    this.descent = bytes.readInt16BE(hhea + 6);
    this.numberOfHMetrics = bytes.readUInt16BE(hhea + 34);
    this.numGlyphs = bytes.readUInt16BE(this.table("maxp") + 4);
    const os2 = this.tables.get("OS/2");
    this.capHeight = os2 && bytes.readUInt16BE(os2.offset) >= 2 ? bytes.readInt16BE(os2.offset + 88) : Math.round(this.ascent * 0.7);
    this.readCmap();
  }

  private table(tag: string): number {
    const t = this.tables.get(tag);
    if (!t) throw new Error(`ttf: no ${tag} table`);
    return t.offset;
  }

  private readCmap() {
    const b = this.bytes;
    const base = this.table("cmap");
    const n = b.readUInt16BE(base + 2);
    let best = -1;
    let bestFormat = 0;
    for (let i = 0; i < n; i++) {
      const pid = b.readUInt16BE(base + 4 + i * 8);
      const eid = b.readUInt16BE(base + 6 + i * 8);
      const off = base + b.readUInt32BE(base + 8 + i * 8);
      const format = b.readUInt16BE(off);
      const unicode = pid === 0 || (pid === 3 && (eid === 1 || eid === 10));
      if (unicode && (format === 12 || (format === 4 && bestFormat !== 12))) {
        best = off;
        bestFormat = format;
      }
    }
    if (best < 0) throw new Error("ttf: no Unicode cmap");
    if (bestFormat === 12) {
      const groups = b.readUInt32BE(best + 12);
      for (let i = 0; i < groups; i++) {
        const at = best + 16 + i * 12;
        const start = b.readUInt32BE(at);
        const end = b.readUInt32BE(at + 4);
        const gid = b.readUInt32BE(at + 8);
        for (let c = start; c <= end; c++) this.cmap.set(c, gid + c - start);
      }
      return;
    }
    const segX2 = b.readUInt16BE(best + 6);
    const ends = best + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = b.readUInt16BE(ends + s * 2);
      const start = b.readUInt16BE(starts + s * 2);
      const delta = b.readInt16BE(deltas + s * 2);
      const range = b.readUInt16BE(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid: number;
        if (range === 0) gid = (c + delta) & 0xffff;
        else {
          const g = b.readUInt16BE(ranges + s * 2 + range + 2 * (c - start));
          gid = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (gid) this.cmap.set(c, gid);
      }
    }
  }

  /** The glyph id for a code point; 0 (.notdef) when the font lacks it. */
  glyphId(cp: number): number {
    return this.cmap.get(cp) ?? 0;
  }

  /** Advance width in font units. */
  advance(gid: number): number {
    const at = this.table("hmtx") + 4 * Math.min(gid, this.numberOfHMetrics - 1);
    return this.bytes.readUInt16BE(at);
  }

  private glyphRange(gid: number): [number, number] {
    const loca = this.table("loca");
    const b = this.bytes;
    const [a, z] = this.longLoca ? [b.readUInt32BE(loca + gid * 4), b.readUInt32BE(loca + gid * 4 + 4)] : [b.readUInt16BE(loca + gid * 2) * 2, b.readUInt16BE(loca + gid * 2 + 2) * 2];
    return [this.table("glyf") + a, z - a];
  }

  /** Contours in font units (y up), composites resolved. */
  outline(gid: number, depth = 0): Point[][] {
    const cached = this.outlines.get(gid);
    if (cached) return cached;
    const b = this.bytes;
    const [at, len] = this.glyphRange(gid);
    let out: Point[][] = [];
    if (len > 0) {
      const nc = b.readInt16BE(at);
      if (nc >= 0) out = this.simple(at, nc);
      else if (depth < 8) out = this.composite(at, depth);
    }
    this.outlines.set(gid, out);
    return out;
  }

  private simple(at: number, nc: number): Point[][] {
    const b = this.bytes;
    const endPts: number[] = [];
    for (let i = 0; i < nc; i++) endPts.push(b.readUInt16BE(at + 10 + i * 2));
    const nPts = nc ? endPts[nc - 1] + 1 : 0;
    let p = at + 10 + nc * 2;
    p += 2 + b.readUInt16BE(p);
    const flags: number[] = [];
    while (flags.length < nPts) {
      const f = b[p++];
      flags.push(f);
      if (f & 8) for (let r = b[p++]; r > 0; r--) flags.push(f);
    }
    const coords = (short: number, same: number) => {
      const v: number[] = [];
      let c = 0;
      for (const f of flags) {
        if (f & short) {
          const d = b[p++];
          c += f & same ? d : -d;
        } else if (!(f & same)) {
          c += b.readInt16BE(p);
          p += 2;
        }
        v.push(c);
      }
      return v;
    };
    const xs = coords(2, 0x10);
    const ys = coords(4, 0x20);
    const contours: Point[][] = [];
    let start = 0;
    for (const end of endPts) {
      const c: Point[] = [];
      for (let i = start; i <= end; i++) c.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) !== 0 });
      contours.push(c);
      start = end + 1;
    }
    return contours;
  }

  private composite(at: number, depth: number): Point[][] {
    const b = this.bytes;
    let p = at + 10;
    const out: Point[][] = [];
    for (;;) {
      const flags = b.readUInt16BE(p);
      const glyph = b.readUInt16BE(p + 2);
      p += 4;
      let dx: number;
      let dy: number;
      if (flags & 1) {
        dx = b.readInt16BE(p);
        dy = b.readInt16BE(p + 2);
        p += 4;
      } else {
        dx = b.readInt8(p);
        dy = b.readInt8(p + 1);
        p += 2;
      }
      if (!(flags & 2)) dx = dy = 0; // point matching: not used by the committed subsets
      let [xx, xy, yx, yy] = [1, 0, 0, 1];
      const f2 = (o: number) => b.readInt16BE(o) / 16384;
      if (flags & 8) {
        xx = yy = f2(p);
        p += 2;
      } else if (flags & 0x40) {
        xx = f2(p);
        yy = f2(p + 2);
        p += 4;
      } else if (flags & 0x80) {
        [xx, xy, yx, yy] = [f2(p), f2(p + 2), f2(p + 4), f2(p + 6)];
        p += 8;
      }
      for (const c of this.outline(glyph, depth + 1)) out.push(c.map((q) => ({ x: xx * q.x + yx * q.y + dx, y: xy * q.x + yy * q.y + dy, on: q.on })));
      if (!(flags & 0x20)) break;
    }
    return out;
  }

  /** Coverage bitmap of a glyph at `px` pixels per em; `left` / `top` are offsets from the pen at the baseline. */
  raster(gid: number, px: number): GlyphBitmap {
    const key = `${gid}@${px}`;
    const hit = this.bitmaps.get(key);
    if (hit) return hit;
    const s = px / this.unitsPerEm;
    const polys = this.outline(gid).map((c) => flatten(c).map(([x, y]) => [x * s, -y * s] as [number, number]));
    const pts = polys.flat();
    if (!pts.length) {
      const empty = { left: 0, top: 0, w: 0, h: 0, alpha: new Uint8Array(0) };
      this.bitmaps.set(key, empty);
      return empty;
    }
    const left = Math.floor(Math.min(...pts.map((q) => q[0])));
    const top = Math.floor(Math.min(...pts.map((q) => q[1])));
    const w = Math.ceil(Math.max(...pts.map((q) => q[0]))) - left + 1;
    const h = Math.ceil(Math.max(...pts.map((q) => q[1]))) - top + 1;
    const cov = new Float32Array(w * h);
    const SS = 4;
    const edges: [number, number, number, number, number][] = [];
    for (const poly of polys)
      for (let i = 0; i < poly.length; i++) {
        const [x0, y0] = poly[i];
        const [x1, y1] = poly[(i + 1) % poly.length];
        if (y0 !== y1) edges.push([x0 - left, y0 - top, x1 - left, y1 - top, y1 > y0 ? 1 : -1]);
      }
    for (let row = 0; row < h * SS; row++) {
      const sy = (row + 0.5) / SS;
      const xs: [number, number][] = [];
      for (const [x0, y0, x1, y1, dir] of edges) {
        if ((sy >= y0 && sy < y1) || (sy >= y1 && sy < y0)) xs.push([x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0), dir]);
      }
      xs.sort((a, z) => a[0] - z[0]);
      let wind = 0;
      const y = Math.floor(sy);
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i][1];
        if (wind === 0) continue;
        const a = xs[i][0];
        const z = xs[i + 1][0];
        for (let x = Math.floor(a); x < Math.ceil(z) && x < w; x++) {
          if (x < 0) continue;
          const o = Math.min(z, x + 1) - Math.max(a, x);
          if (o > 0) cov[y * w + x] += o / SS;
        }
      }
    }
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < cov.length; i++) alpha[i] = Math.round(Math.min(1, cov[i]) * 255);
    const bm = { left, top, w, h, alpha };
    this.bitmaps.set(key, bm);
    return bm;
  }
}

/** A closed quadratic TrueType contour as a polygon (each curve split into 8 segments). */
export function flatten(c: Point[]): [number, number][] {
  if (!c.length) return [];
  const n = c.length;
  // Start on an on-curve point (or the midpoint of two off-curve points).
  let s = c.findIndex((q) => q.on);
  const pts: Point[] = [];
  if (s < 0) {
    pts.push({ x: (c[0].x + c[n - 1].x) / 2, y: (c[0].y + c[n - 1].y) / 2, on: true });
    s = 0;
    for (let i = 0; i < n; i++) pts.push(c[i]);
  } else for (let i = 0; i < n; i++) pts.push(c[(s + i) % n]);
  const out: [number, number][] = [[pts[0].x, pts[0].y]];
  let prev = pts[0];
  for (let i = 1; i <= pts.length; i++) {
    const q = pts[i % pts.length];
    if (q.on) {
      out.push([q.x, q.y]);
      prev = q;
      continue;
    }
    const nx = pts[(i + 1) % pts.length];
    const end = nx.on ? nx : { x: (q.x + nx.x) / 2, y: (q.y + nx.y) / 2, on: true };
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      out.push([u * u * prev.x + 2 * u * t * q.x + t * t * end.x, u * u * prev.y + 2 * u * t * q.y + t * t * end.y]);
    }
    prev = end;
    if (nx.on) i++;
  }
  return out;
}
